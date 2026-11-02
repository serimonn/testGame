// 練習モード:サーバーの代わりにブラウザの中でエンジンを動かし、CPUの視聴者を参加させる。
(function (root) {
  const { Engine, newState } = root.MonoEngine;
  const C = root.MONO_CFG;

  function gauss() {
    let u = 0, v = 0;
    while (!u) u = Math.random();
    while (!v) v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function Practice(store) {
    const conns = [], timers = new Set();
    let alarmT = 0, stopped = false;
    const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); if (!stopped) fn(); }, ms); timers.add(t); return t; };
    const deliver = (c, msg) => { const copy = JSON.parse(JSON.stringify(msg)); later(() => c.recv(copy), 0); };
    const io = {
      send(to, msg) {
        for (const c of conns) {
          const ok = to === c || to === 'all' || (to === 'control' && c.role === 'control') || (to === 'viewers' && c.role !== 'control') || (typeof to === 'string' && c.pid && to === 'p:' + c.pid);
          if (ok) deliver(c, msg);
        }
      },
      now: () => Date.now(),
      setAlarm(t) { clearTimeout(alarmT); if (t) alarmT = later(() => engine.onAlarm(), Math.max(0, t - Date.now())); },
      save() {},
      later,
      online: pid => conns.some(c => c.pid === pid),
      controlOnline: () => true,
      random: Math.random,
    };
    const state = newState('練習');
    const engine = new Engine(state, io);

    const host = { role: 'control', recv: m => store.apply(m) };
    conns.push(host);
    later(() => engine.onConnect(host), 0);

    // CPU の視聴者:配信者の答えを、理解度(標準偏差)だけずらして予想する。途中で決め直すこともある
    const bots = C.PRACTICE_BOTS.map(([name, sd], i) => {
      const b = { role: 'player', deviceId: 'bot-' + i, ipHash: 'bot' + i, name, sd, recv: m => onBot(b, m) };
      return b;
    });
    function guessFor(b, round) {
      const r = state.rounds[round];
      const v = Math.round(r.answer + gauss() * b.sd);
      return Math.max(0, Math.min(100, v));
    }
    function onBot(b, m) {
      if (m.t !== 'round_open') return;
      const round = m.round;
      if (Math.random() < 0.08) return; // たまに予想し忘れる
      later(() => { b.rl = []; engine.onMessage(b, { t: 'guess', round, value: guessFor(b, round) }); }, 1500 + Math.random() * 9000);
      if (Math.random() < 0.4) later(() => { b.rl = []; engine.onMessage(b, { t: 'guess', round, value: guessFor({ sd: b.sd * 0.6 }, round) }); }, 11000 + Math.random() * 7000);
    }
    function botJoin(b) {
      conns.push(b);
      engine.onConnect(b);
      engine.onMessage(b, { t: 'join', name: b.name });
    }
    // ロビーで5人が順に入る。最後の1人は2ラウンド目から途中参加
    bots.slice(0, -1).forEach((b, i) => later(() => botJoin(b), 1200 + i * 1100));
    const lateBot = bots[bots.length - 1];
    let lateJoined = false;
    store.on(m => {
      if (!lateJoined && m.t === 'round_prepare' && m.round === 2) { lateJoined = true; later(() => botJoin(lateBot), 2500); }
    });

    return {
      send(m) { later(() => engine.onMessage(host, JSON.parse(JSON.stringify(m))), 0); },
      stop() { stopped = true; for (const t of timers) clearTimeout(t); },
    };
  }

  root.Practice = Practice;
})(window);
