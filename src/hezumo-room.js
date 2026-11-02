import { DurableObject } from "cloudflare:workers";
import "../public/hezumo/config.js";
import "../public/hezumo/sim.js";

/*
  屁相撲の部屋：1部屋 = 1 Durable Object。勝負は sim.js をここで動かして決める。
  入力は "1"（押した）と "0"（離した）だけ。状態を毎秒20回、両者へ送る。
  取組中だけタイマーが動く。待っている間は眠るので実行時間を使わない。
*/
const { CFG: c, Sim, PLAYABLE, SECRET } = globalThis;
const NET = c.NET, STEP = 1000 / 60;
const r1 = (v) => Math.round(v * 10) / 10;
const r3 = (v) => Math.round(v * 1000) / 1000;

export class HezumoRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    this.game = null;
    this.timer = null;
  }

  players() {
    return this.ctx.getWebSockets().filter((ws) => !ws.deserializeAttachment()?.replaced);
  }

  async fetch(request) {
    const url = new URL(request.url);
    const cid = (url.searchParams.get("cid") || "").slice(0, 40);
    const { 0: client, 1: server } = new WebSocketPair();

    let sockets = this.players();
    let slot, key = null, ready = false;
    if (cid) {
      const old = sockets.find((ws) => ws.deserializeAttachment()?.cid === cid);
      if (old) {
        const att = old.deserializeAttachment();
        ({ slot, key, ready } = att);
        old.serializeAttachment({ ...att, replaced: true });
        try { old.close(4001, "replaced"); } catch {}
        sockets = sockets.filter((ws) => ws !== old);
      }
    }
    if (slot === undefined) {
      const used = sockets.map((ws) => ws.deserializeAttachment()?.slot);
      slot = this.game ? this.game.away.findIndex((t) => t > 0) : [0, 1].find((i) => !used.includes(i));
      if (slot === -1 || slot === undefined) {
        server.accept();
        server.send(JSON.stringify({ t: "full" }));
        server.close(4000, "full");
        return new Response(null, { status: 101, webSocket: client });
      }
    }

    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ slot, cid, key, ready });
    const g = this.game;
    server.send(JSON.stringify({ t: "welcome", slot, playing: !!g }));
    if (g) {
      g.away[slot] = 0; g.inp[slot] = false; g.q[slot] = [];
      server.send(JSON.stringify({ t: "start", keys: g.keys, need: c.WINS_2P }));
      server.send(this.boutMsg());
    }
    this.broadcastLobby();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    const att = ws.deserializeAttachment();
    if (!att || att.replaced) return;
    if (message === "1" || message === "0") {
      if (this.game) { this.game.q[att.slot].push(message === "1"); this.game.lastInput = Date.now(); }
      return;
    }
    let m;
    try { m = JSON.parse(message); } catch { return; }
    if (m.t === "pick" && (PLAYABLE.includes(m.k) || m.k === SECRET)) {
      ws.serializeAttachment({ ...att, key: m.k });
      this.broadcastLobby();
    } else if (m.t === "ready" && !this.game) {
      ws.serializeAttachment({ ...att, ready: !!m.v });
      this.broadcastLobby();
      this.maybeStart();
    } else if (m.t === "quit" && this.game) {
      this.finish(1 - att.slot, "forfeit");
    }
  }

  async webSocketClose(ws) {
    const att = ws.deserializeAttachment();
    if (att && !att.replaced) {
      if (this.game) {
        this.game.away[att.slot] = Date.now() + NET.GRACE_MS;
        this.game.inp[att.slot] = false;
      }
      ws.serializeAttachment({ ...att, replaced: true });
      this.broadcastLobby();
    }
    try { ws.close(1000, "bye"); } catch {}
  }

  async webSocketError(ws) {
    await this.webSocketClose(ws);
  }

  broadcast(data) {
    for (const ws of this.players()) {
      try { ws.send(data); } catch {}
    }
  }

  broadcastLobby() {
    const l = { t: "lobby", on: [false, false], ready: [false, false], keys: [null, null] };
    for (const ws of this.players()) {
      const a = ws.deserializeAttachment();
      l.on[a.slot] = true; l.ready[a.slot] = !!a.ready; l.keys[a.slot] = a.key;
    }
    this.broadcast(JSON.stringify(l));
  }

  maybeStart() {
    const atts = this.players().map((ws) => ws.deserializeAttachment());
    if (atts.length !== 2 || !atts.every((a) => a.ready && a.key)) return;
    const keys = [];
    for (const a of atts) keys[a.slot] = a.key;
    const now = Date.now();
    this.game = { keys, score: [0, 0], kims: [], n: 0, seed: 0, sim: null, inp: [false, false], q: [[], []], away: [0, 0], koF: 0, last: now, lastInput: now, waiting: 0 };
    this.broadcast(JSON.stringify({ t: "start", keys, need: c.WINS_2P }));
    this.newBout();
    this.timer = setInterval(() => this.tick(), NET.TICK_MS);
  }

  boutMsg() {
    const g = this.game;
    return JSON.stringify({ t: "bout", n: g.n, seed: g.seed, score: g.score, kims: g.kims });
  }

  newBout() {
    const g = this.game;
    g.n++; g.koF = 0;
    g.seed = crypto.getRandomValues(new Int32Array(1))[0];
    g.sim = Sim.createBout(g.keys[0], g.keys[1], g.seed, { parryF: c.PARRY_F_ONLINE });
    this.broadcast(this.boutMsg());
  }

  finish(winner, reason) {
    const g = this.game;
    if (!g) return;
    clearInterval(this.timer);
    this.timer = null; this.game = null;
    for (const ws of this.players()) {
      ws.serializeAttachment({ ...ws.deserializeAttachment(), ready: false });
    }
    this.broadcast(JSON.stringify({ t: "end", winner, reason, score: g.score, kims: g.kims }));
    this.broadcastLobby();
  }

  tick() {
    const g = this.game;
    if (!g) return;
    const now = Date.now();

    // 切れた人がいる間は止めて待つ。戻らなければ不戦勝。
    if (g.away[0] || g.away[1]) {
      const who = g.away[0] && (!g.away[1] || g.away[0] < g.away[1]) ? 0 : 1;
      if (now > g.away[who]) return this.finish(g.away[1 - who] ? -1 : 1 - who, g.away[1 - who] ? "afk" : "forfeit");
      const sec = Math.ceil((g.away[who] - now) / 1000);
      if (sec !== g.waiting) { g.waiting = sec; this.broadcast(JSON.stringify({ t: "wait", sec })); }
      g.last = now; g.lastInput = now;
      return;
    }
    if (g.waiting) { g.waiting = 0; this.broadcast(JSON.stringify({ t: "wait", sec: 0 })); }
    if (now - g.lastInput > NET.AFK_MS) return this.finish(-1, "afk");

    const steps = Math.min(10, Math.floor((now - g.last) / STEP));
    if (steps <= 0) return;
    g.last += steps * STEP;
    if (now - g.last > 500) g.last = now;

    const events = [];
    let s = g.sim;
    for (let n = 0; n < steps; n++) {
      // 短い押しが消えないよう、変化は1Fに1つずつ入れる
      for (let i = 0; i < 2; i++) if (g.q[i].length) g.inp[i] = g.q[i].shift();
      Sim.step(s, g.inp);
      for (const e of s.events) {
        events.push({ ...e, fr: s.frame });
        if (e.t === "ko" && e.winner >= 0) { g.score[e.winner]++; g.kims.push(e.kimarite); }
      }
      if (s.phase === "end" && s.stop === 0 && ++g.koF >= c.KO_SHOW_F) {
        this.send(s, events);
        if (g.score[0] >= c.WINS_2P || g.score[1] >= c.WINS_2P) return this.finish(g.score[0] >= c.WINS_2P ? 0 : 1, "win");
        this.newBout();
        return;
      }
    }
    this.send(s, events);
  }

  send(s, events) {
    this.broadcast(JSON.stringify({
      t: "s", n: this.game.n, fr: s.frame, ph: s.phase, pf: s.phaseF, st: s.stop, R: r1(s.R),
      f: s.f.map((f) => [r1(f.x), r1(f.y), r3(f.a), r3(f.c), (f.charging ? 1 : 0) | (f.imo ? 2 : 0) | (f.out ? 4 : 0), f.recover]),
      w: s.waves.map((w) => [w.owner, r1(w.x), r1(w.y), r3(w.dx), r3(w.dy), r1(w.d), w.crit ? 1 : 0]),
      i: s.imo ? [r1(s.imo.x), r1(s.imo.y)] : null,
      g: s.gust ? [r3(s.gust.dx), r3(s.gust.dy)] : null,
      r: s.result,
      e: events,
    }));
  }
}
