// オンライン対戦の通信と表示用の状態。勝負はサーバーの sim.js が決める。
// 自分がいつも左(idx 0)に見えるよう、slot 1 の人には全体を180度回して映す。
(function (root) {
  const c = root.CFG, NET = c.NET, STEP = 1000 / 60;
  const CID_KEY = 'hezumo_cid';
  function cid() {
    let v = null;
    try { v = localStorage.getItem(CID_KEY); } catch (e) {}
    if (!v) {
      v = Math.random().toString(36).slice(2) + Date.now().toString(36);
      try { localStorage.setItem(CID_KEY, v); } catch (e) {}
    }
    return v;
  }

  const Net = {
    code: null, connected: false, slot: 0, rtt: 0, sim: null, held: false, hooks: null,
    ws: null, retries: 0, pingT: 0, pingAt: 0, everOpen: false, suspended: false,
    buf: [], evq: [], bout: 0, disp: 0, lastArr: 0, pressF: 0, predF: -999,

    join(code, hooks) {
      this.leave();
      this.code = code; this.hooks = hooks; this.retries = 0; this.everOpen = false;
      this.open();
    },
    leave() {
      this.code = null; this.sim = null; this.held = false; this.suspended = false;
      this.closeSocket();
    },
    suspend() { this.suspended = true; this.closeSocket(); },
    resume() { if (this.suspended) { this.suspended = false; this.retries = 0; this.open(); } },
    closeSocket() {
      clearInterval(this.pingT);
      this.connected = false;
      if (this.ws) { this.ws.onclose = null; try { this.ws.close(1000); } catch (e) {} this.ws = null; }
    },
    open() {
      const dir = location.pathname.replace(/[^/]*$/, '');
      const url = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}${dir}ws/${this.code}?cid=${cid()}`;
      let ws;
      try { ws = new WebSocket(url); } catch (e) { return this.retry(); }
      this.ws = ws;
      ws.onopen = () => {
        this.connected = true; this.retries = 0; this.everOpen = true;
        clearInterval(this.pingT);
        this.pingT = setInterval(() => { this.pingAt = performance.now(); this.sendRaw('ping'); }, NET.PING_MS);
        this.hooks.onBack();
      };
      ws.onmessage = e => this.onMessage(e.data);
      ws.onclose = () => {
        this.connected = false; clearInterval(this.pingT);
        if (this.code && !this.suspended) { this.hooks.onDrop(); this.retry(); }
      };
    },
    retry() {
      if (++this.retries > NET.RETRY_MAX || (!this.everOpen && this.retries > 3)) {
        const h = this.hooks; this.leave(); if (h) h.onFail();
        return;
      }
      setTimeout(() => { if (this.code && !this.suspended && !this.connected) this.open(); }, NET.RETRY_MS);
    },
    sendRaw(m) { if (this.ws && this.ws.readyState === 1) this.ws.send(m); },
    send(o) { this.sendRaw(JSON.stringify(o)); },

    // 表示の座標へ直す
    flipEvent(e) {
      if (!this.slot) return e;
      const o = { ...e };
      for (const k of ['i', 'by']) if (o[k] !== undefined) o[k] = 1 - o[k];
      if (o.winner >= 0) o.winner = 1 - o.winner;
      for (const k of ['x', 'y', 'tx', 'ty', 'dx', 'dy']) if (o[k] !== undefined) o[k] = -o[k];
      if (o.a !== undefined) o.a += Math.PI;
      return o;
    },
    mine(arr) { return this.slot ? [arr[1], arr[0]] : arr; },

    onMessage(data) {
      if (data === 'pong') { this.rtt = Math.round(performance.now() - this.pingAt); return; }
      const m = JSON.parse(data), h = this.hooks;
      if (!h) return;
      switch (m.t) {
        case 's': this.push(m); break;
        case 'welcome': this.slot = m.slot; h.onWelcome(m.playing); break;
        case 'lobby': h.onLobby({ on: this.mine(m.on), ready: this.mine(m.ready), keys: this.mine(m.keys) }); break;
        case 'start': this.keys = this.mine(m.keys); h.onStart({ keys: this.keys, need: m.need }); break;
        case 'bout':
          this.beginBout(m);
          h.onBout({ score: this.mine(m.score), kims: m.kims });
          break;
        case 'wait': h.onWait(m.sec); break;
        case 'end': this.sim = null; h.onEnd({ winner: m.winner < 0 ? -1 : this.slot ? 1 - m.winner : m.winner, score: this.mine(m.score), kims: m.kims, reason: m.reason }); break;
        case 'full': { const f = h.onFull; this.leave(); f(); break; }
      }
    },
    beginBout(m) {
      this.bout = m.n; this.buf = []; this.evq = []; this.disp = -1; this.predF = -999;
      const s = root.Sim.createBout(this.keys[0], this.keys[1], m.seed);
      // 回転の向きはサーバーの席で決まる
      s.f.forEach((f, i) => { const seat = this.slot ? 1 - i : i; f.spin = (seat === 0 ? 1 : -1) * c.SPIN * f.ch.spinMul; });
      this.sim = s;
    },
    push(m) {
      if (m.n !== this.bout) return;
      this.buf.push(m);
      for (const e of m.e) this.evq.push(this.flipEvent(e));
      this.lastArr = performance.now();
    },

    // 押す、離すをサーバーへ。離した瞬間の音はここで先に鳴らす
    input(down) {
      let fired = null;
      if (down !== this.held) {
        this.held = down;
        this.sendRaw(down ? '1' : '0');
        const s = this.sim, f = s && s.f[0];
        if (down) this.pressF = 0;
        else if (f && f.charging && s.phase === 'fight') {
          const fp = root.Sim.firePower(f, false);
          fired = { c: f.c, p: fp.p, crit: fp.crit, over: false, silent: !!f.ch.silent };
          this.predF = this.disp;
        }
      }
      if (down) this.pressF++;
      return fired;
    },

    // 60Fごとに、少し前の時刻の状態を補間して映す
    advance() {
      const s = this.sim;
      if (!s) return;
      s.events = [];
      const buf = this.buf;
      if (!buf.length) return;
      const last = buf[buf.length - 1];
      const est = last.fr + (performance.now() - this.lastArr) / STEP;
      const target = est - NET.INTERP_F;
      if (this.disp < 0 || Math.abs(target - this.disp) > 15) this.disp = target;
      else this.disp += 1 + Math.max(-0.5, Math.min(0.5, (target - this.disp) * 0.1));
      while (buf.length > 2 && buf[1].fr < this.disp) buf.shift();
      const a = buf[0], b = buf.length > 1 && buf[1].fr >= this.disp ? buf[1] : buf[buf.length - 1];
      const t = b.fr > a.fr ? Math.max(0, Math.min(1, (this.disp - a.fr) / (b.fr - a.fr))) : 1;

      while (this.evq.length && this.evq[0].fr <= this.disp) {
        const e = this.evq.shift();
        // 先に鳴らした屁は二度鳴らさない
        if (e.t === 'fire' && e.i === 0 && !e.over && this.disp - this.predF < 40) { e.pred = true; this.predF = -999; }
        s.events.push(e);
      }

      const flip = this.slot ? -1 : 1;
      s.frame = Math.round(this.disp);
      s.phase = b.ph; s.phaseF = b.pf; s.stop = b.st;
      s.R = a.R + (b.R - a.R) * t;
      s.result = b.r ? { winner: b.r.winner < 0 ? -1 : this.slot ? 1 - b.r.winner : b.r.winner, kimarite: b.r.kimarite } : null;
      s.imo = b.i ? { x: b.i[0] * flip, y: b.i[1] * flip } : null;
      s.gust = b.g ? { dx: b.g[0] * flip, dy: b.g[1] * flip } : null;
      for (let i = 0; i < 2; i++) {
        const seat = this.slot ? 1 - i : i, A = a.f[seat], B = b.f[seat], f = s.f[i];
        f.x = (A[0] + (B[0] - A[0]) * t) * flip;
        f.y = (A[1] + (B[1] - A[1]) * t) * flip;
        f.a = A[2] + root.Sim.angDiff(B[2], A[2]) * t + (this.slot ? Math.PI : 0);
        f.c = A[3] + (B[3] - A[3]) * t;
        f.charging = !!(B[4] & 1); f.imo = !!(B[4] & 2); f.out = !!(B[4] & 4);
        f.recover = B[5];
      }
      s.waves = b.w.map(w => ({
        owner: this.slot ? 1 - w[0] : w[0], x: w[1] * flip, y: w[2] * flip, dx: w[3] * flip, dy: w[4] * flip,
        d: Math.max(0, w[5] - c.WAVE_SPEED * Math.max(0, b.fr - this.disp)), crit: !!w[6],
      }));
      this.predictMine(s);
    },

    // 押してから届くまでの遅れを、自分の見た目だけ先読みで埋める
    predictMine(s) {
      const f = s.f[0];
      const lead = s.stop > 0 || s.phase === 'end' ? 0 : NET.INTERP_F + this.rtt / STEP;
      const rate = 1 / (c.CHARGE_F * f.ch.chargeMul) * (f.imo ? c.IMO_CHARGE : 1);
      if (!this.held) { if (s.phase === 'fight') { f.charging = false; f.c = 0; } }
      else if (f.charging) f.c = Math.min(1, f.c + rate * lead);
      else if (s.phase === 'fight' && f.recover === 0) { f.charging = true; f.c = Math.min(1, rate * this.pressF); }
      f.a += f.spin * (f.charging ? c.CHARGE_SPIN : 1) * lead;
    },
  };
  root.Net = Net;
})(window);
