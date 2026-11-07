import { DurableObject } from "cloudflare:workers";
import "../public/nanten/config.js";
import "../public/nanten/topics.js";
import "../public/nanten/engine.js";

/*
  おうさまナンテン?の部屋:配信者(チャンネル)ごとに 1 Durable Object。名前は参加コード。
  旧名「配信者の物差し」のときに作ったクラス名 MonosashiRoom のまま使う(名前を変えると部屋と記録が消えるため)。
  試合の進行は engine.js が決める。ここは接続の管理、保存、Alarm だけを受け持つ。
  経路(Worker から渡される)
    /nanten/ws/h/<コード>?key=<鍵>&view=control   配信者の操作画面
    /nanten/ws/h/<コード>?view=broadcast          配信用画面(鍵なし。答えは reveal まで届かない)
    /nanten/ws/p/<コード>?d=<端末ID>               視聴者
  状態はひとつのオブジェクトとして storage の "s" に保存し、休止から起きたら読み戻す。
*/
const { MonoEngine } = globalThis;

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export class MonosashiRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    this.conns = new WeakMap(); // ws → 接続オブジェクト(毎秒の回数制限など、休止で消えてよい物を持つ)
    this.engine = null;
    this.ctx.blockConcurrencyWhile(async () => {
      const s = await this.ctx.storage.get("s");
      if (s) this.engine = new MonoEngine.Engine(s, this.io());
    });
  }

  io() {
    return {
      send: (to, msg) => this.send(to, msg),
      now: () => Date.now(),
      setAlarm: (t) => { if (t) this.ctx.storage.setAlarm(t); else this.ctx.storage.deleteAlarm(); },
      save: () => { this.ctx.storage.put("s", this.engine.s); },
      later: (fn, ms) => setTimeout(fn, ms),
      online: (pid) => this.sockets().some((ws) => ws.deserializeAttachment()?.pid === pid),
      controlOnline: () => this.sockets().some((ws) => ws.deserializeAttachment()?.role === "control"),
      random: Math.random,
    };
  }

  ensure(code) {
    if (!this.engine) this.engine = new MonoEngine.Engine(MonoEngine.newState(code), this.io());
    return this.engine;
  }

  sockets() {
    return this.ctx.getWebSockets().filter((ws) => !ws.deserializeAttachment()?.gone);
  }

  connOf(ws) {
    let c = this.conns.get(ws);
    if (!c) { c = { ws, ...ws.deserializeAttachment() }; this.conns.set(ws, c); }
    return c;
  }

  // 接続オブジェクトの変更(pid など)を添付データに書き戻す
  persist(c) {
    const { ws, rl, ...att } = c;
    try { ws.serializeAttachment(att); } catch {}
  }

  send(to, msg) {
    const data = JSON.stringify(msg);
    if (typeof to === "object") { try { to.ws.send(data); } catch {} return; }
    for (const ws of this.sockets()) {
      const a = ws.deserializeAttachment();
      const ok = to === "all" || (to === "control" && a.role === "control") || (to === "broadcast" && a.role === "broadcast")
        || (to === "viewers" && a.role !== "control") || (to.startsWith("p:") && a.pid === to.slice(2));
      if (ok) { try { ws.send(data); } catch {} }
    }
  }

  async fetch(request) {
    const url = new URL(request.url);
    const m = url.pathname.match(/\/ws\/(h|p)\/([A-Z0-9]{5})$/);
    if (!m) return new Response("not found", { status: 404 });
    const code = m[2];
    const { 0: client, 1: server } = new WebSocketPair();
    const deny = (reason) => {
      server.accept();
      server.send(JSON.stringify({ t: "denied", reason }));
      server.close(4003, reason);
      return new Response(null, { status: 101, webSocket: client });
    };

    const engine = this.ensure(code);
    let att;
    if (m[1] === "h") {
      const view = url.searchParams.get("view") === "broadcast" ? "broadcast" : "control";
      if (view === "control") {
        const key = url.searchParams.get("key") || "";
        if (key.length < 16) return deny("bad_key");
        const hash = await sha256(key);
        if (!engine.s.hostKeyHash) { engine.s.hostKeyHash = hash; this.ctx.storage.put("s", engine.s); }
        else if (engine.s.hostKeyHash !== hash) return deny("bad_key");
      } else if (!engine.s.hostKeyHash) return deny("no_channel");
      att = { role: view };
    } else {
      if (!engine.s.hostKeyHash) return deny("no_channel");
      const ip = request.headers.get("CF-Connecting-IP") || "";
      att = { role: "player", deviceId: (url.searchParams.get("d") || "").slice(0, 64), ipHash: ip ? (await sha256(ip + code)).slice(0, 16) : null };
    }

    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(att);
    const c = this.connOf(server);
    engine.onConnect(c);
    this.persist(c);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, message) {
    if (typeof message !== "string" || message.length > 2000) return;
    let m;
    try { m = JSON.parse(message); } catch { return; }
    const c = this.connOf(ws);
    if (c.gone || !this.engine) return;
    this.engine.onMessage(c, m);
    this.persist(c);
  }

  async webSocketClose(ws) {
    const c = this.connOf(ws);
    if (!c.gone) {
      c.gone = true;
      this.persist(c);
      if (this.engine) this.engine.onDisconnect(c);
    }
    try { ws.close(1000, "bye"); } catch {}
  }

  async webSocketError(ws) {
    await this.webSocketClose(ws);
  }

  async alarm() {
    if (this.engine) this.engine.onAlarm();
  }
}
