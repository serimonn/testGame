// 通信。オンラインは WebSocket、練習モードは同じ形のローカル接続(practice.js)を使う。
(function (root) {
  const C = root.MONO_CFG;

  function deviceId() {
    let v = null;
    try { v = localStorage.getItem('mono_device'); } catch (e) {}
    if (!v) {
      v = (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
      try { localStorage.setItem('mono_device', v); } catch (e) {}
    }
    return v;
  }

  // opts: { role: 'h' | 'p', code, query: {...} }。handlers: { onMessage, onStatus('open'|'retry'|'fail'|'denied') }
  function connect(opts, handlers) {
    const dir = location.pathname.replace(/[^/]*$/, '');
    const q = new URLSearchParams(opts.query || {}).toString();
    const url = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}${dir}ws/${opts.role}/${opts.code}${q ? '?' + q : ''}`;
    let ws = null, pingT = 0, retries = 0, everOpen = false, closed = false, queue = [];
    const open = () => {
      try { ws = new WebSocket(url); } catch (e) { return retry(); }
      ws.onopen = () => {
        retries = 0; everOpen = true;
        handlers.onStatus('open');
        for (const m of queue.splice(0)) ws.send(m);
        clearInterval(pingT);
        pingT = setInterval(() => { try { ws.send('ping'); } catch (e) {} }, C.PING_MS);
      };
      ws.onmessage = e => {
        if (e.data === 'pong') return;
        let m;
        try { m = JSON.parse(e.data); } catch (err) { return; }
        if (m.t === 'denied') { closed = true; handlers.onStatus('denied', m.reason); return; }
        handlers.onMessage(m);
      };
      ws.onclose = () => { clearInterval(pingT); if (!closed) retry(); };
    };
    const retry = () => {
      retries++;
      if (!everOpen && retries > 4) { handlers.onStatus('fail'); closed = true; return; }
      handlers.onStatus('retry');
      setTimeout(() => { if (!closed) open(); }, Math.min(8000, C.RETRY_MS * retries));
    };
    // 画面が隠れて戻ったら、すぐつなぎ直す(スマホの省電力で切れることがある)
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && !closed && ws && ws.readyState > 1) { retries = 0; open(); }
    });
    open();
    return {
      send(m) {
        const s = JSON.stringify(m);
        if (ws && ws.readyState === 1) ws.send(s); else queue.push(s);
      },
      close() { closed = true; clearInterval(pingT); try { ws.close(1000); } catch (e) {} },
    };
  }

  root.Net = { connect, deviceId };
})(window);
