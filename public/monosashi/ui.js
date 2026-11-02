// 画面の共通部品:DOMの補助、受信した状態の保持(Store)、物差し、時計。
(function (root) {
  const C = root.MONO_CFG;

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') {
        for (const [sk, sv] of Object.entries(v)) { if (sk.startsWith('--')) el.style.setProperty(sk, sv); else el.style[sk] = sv; }
      }
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'html') el.innerHTML = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid.nodeType ? kid : String(kid));
    return el;
  }
  const $ = (sel, el) => (el || document).querySelector(sel);

  // サーバー時刻とのずれ
  const Clock = {
    offset: 0,
    sync(serverNow) { if (serverNow) this.offset = serverNow - Date.now(); },
    now() { return Date.now() + this.offset; },
    left(deadline) { return deadline ? Math.max(0, (deadline - this.now()) / 1000) : 0; },
  };

  // 受信したメッセージから画面の状態を組み立てる
  function createStore() {
    const st = {
      code: '', phase: 'connecting', round: 0, totalRounds: C.totalRounds, deadline: null, phaseStart: 0,
      paused: false, matchId: 0, players: [], spectators: 0, me: null, open: null, reveal: null, result: null,
      prepare: null, lobby: null, count: null, acked: null, joinError: null, kicked: false, conn: 'connecting',
    };
    const subs = [];
    const S = {
      st,
      on(fn) { subs.push(fn); },
      emit(msg) { for (const f of subs) f(msg); },
      apply(m) {
        if (m.now) Clock.sync(m.now);
        switch (m.t) {
          case 'snapshot':
            Object.assign(st, {
              code: m.code, phase: m.phase, round: m.round, totalRounds: m.totalRounds, deadline: m.deadline, phaseStart: m.phaseStart,
              paused: m.paused, matchId: m.matchId, open: m.open, reveal: m.reveal, result: m.result, count: null,
              acked: m.me ? m.me.guess : null,
            });
            if (m.players) { st.players = m.players.list; st.spectators = m.players.spectators; }
            if (m.me !== undefined && m.me !== null) st.me = m.me;
            if (m.lobby) st.lobby = m.lobby;
            st.prepare = m.prepare || null;
            if (m.phase === 'prepare' && !m.prepare) st.deadline = null;
            break;
          case 'next_match':
            Object.assign(st, { matchId: m.matchId, totalRounds: m.totalRounds, reveal: null, result: null, open: null, round: 0 });
            if (st.me) Object.assign(st.me, { totalPoints: 0, roundsPlayed: 0, avg: 0 });
            break;
          case 'round_prepare':
            Object.assign(st, { phase: 'prepare', round: m.round, totalRounds: m.totalRounds, prepare: m, deadline: m.deadline, phaseStart: Clock.now(), open: null, reveal: null, paused: false });
            break;
          case 'round_waiting':
            Object.assign(st, { phase: 'prepare', round: m.round, totalRounds: m.totalRounds, deadline: null, phaseStart: Clock.now(), open: null, reveal: null, paused: false });
            break;
          case 'round_open':
            Object.assign(st, { phase: 'guessing', round: m.round, open: m, deadline: m.deadline, phaseStart: Clock.now(), count: null, acked: null, prepare: null });
            break;
          case 'guess_count': st.count = m; break;
          case 'guess_ack': st.acked = m.value; break;
          case 'round_reveal':
            Object.assign(st, { phase: 'reveal', round: m.round, reveal: m, deadline: m.deadline, phaseStart: m.phaseStart });
            if (st.me) {
              const row = m.ranking.find(r => r.pid === st.me.pid);
              if (row) Object.assign(st.me, { totalPoints: row.totalPoints, roundsPlayed: row.roundsPlayed, avg: row.avg });
            }
            break;
          case 'match_result': Object.assign(st, { phase: 'result', result: m, deadline: null }); break;
          case 'players': st.players = m.list; st.spectators = m.spectators; break;
          case 'lobby': st.lobby = m; break;
          case 'join_result':
            if (m.status === 'rejected') st.joinError = m.reason;
            else {
              st.joinError = null;
              st.me = Object.assign(st.me || {}, { pid: m.playerId, status: m.status, name: m.name, reason: m.reason });
            }
            break;
          case 'me': if (m.me) st.me = m.me; break;
          case 'kicked': st.kicked = true; if (st.me) st.me.status = 'kicked'; break;
          case 'paused': st.paused = m.paused; break;
          case 'closed': Object.assign(st, { phase: 'closed', me: null, open: null, reveal: null, result: null, prepare: null }); break;
          case 'opened': Object.assign(st, { phase: 'lobby', round: 0, open: null, reveal: null, result: null }); break;
        }
        S.emit(m);
      },
    };
    return S;
  }

  // 物差し。両端の言葉、目盛り、点を置く層を持つ
  function ruler(scale, opt) {
    const o = Object.assign({ labels: true }, opt);
    const ticks = h('div', { class: 'ticks' });
    for (let i = 0; i <= 100; i += 5) {
      ticks.append(h('i', { class: i % 50 === 0 ? 'big' : i % 10 === 0 ? 'mid' : '', style: { left: i + '%' } }));
      if (o.labels && i % 10 === 0) ticks.append(h('b', { style: { left: i + '%' } }, i));
    }
    const el = h('div', { class: 'ruler' },
      h('div', { class: 'ends' }, h('span', { class: 'endL' }, scale ? scale.left : ''), h('span', { class: 'endR' }, scale ? scale.right : '')),
      h('div', { class: 'bar' }, ticks, h('div', { class: 'marks' })));
    return el;
  }

  // 名前の札が重ならないよう段を割り当てる。items: [{value}] → 段番号の配列
  function stackRows(items, widthPct) {
    const order = items.map((it, i) => [it.value, i]).sort((a, b) => a[0] - b[0]);
    const rowsEnd = [], out = [];
    for (const [v, i] of order) {
      let r = 0;
      while (rowsEnd[r] !== undefined && v - rowsEnd[r] < widthPct) r++;
      rowsEnd[r] = v;
      out[i] = r;
    }
    return out;
  }

  const DOT_COLORS = ['#ff7a59', '#3fb6a8', '#ffc23c', '#7d6cf0', '#ef5d9b', '#56a3ff', '#8cc63f', '#ff9f1c', '#2ec4b6', '#c77dff'];
  function colorOf(pid) {
    const n = parseInt(String(pid).replace(/\D/g, ''), 10) || 0;
    return DOT_COLORS[n % DOT_COLORS.length];
  }

  function syncWord(v) {
    if (v === null || v === undefined) return '';
    for (const [min, w] of C.syncWords) if (v >= min) return w;
    return '';
  }

  // 0〜100のスライダー。指(マウス)のどこを押しても、その位置に値が飛ぶ
  function slider(onChange, initial) {
    let value = initial === undefined ? 50 : initial, dragging = false;
    const num = h('div', { class: 'sl-num' }, value);
    const knob = h('div', { class: 'sl-knob' });
    const fill = h('div', { class: 'sl-fill' });
    const track = h('div', { class: 'sl-track' }, h('div', { class: 'sl-rail' }, fill, knob));
    const minus = h('button', { class: 'sl-step', 'aria-label': '1つ下げる' }, '−');
    const plus = h('button', { class: 'sl-step', 'aria-label': '1つ上げる' }, '+');
    const el = h('div', { class: 'slider' }, num, h('div', { class: 'sl-row' }, minus, track, plus));
    const set = (v, fromUser) => {
      v = Math.max(0, Math.min(100, Math.round(v)));
      const changed = v !== value;
      value = v;
      num.textContent = v;
      knob.style.left = v + '%';
      fill.style.width = v + '%';
      if (fromUser && changed) onChange(v);
    };
    const fromX = x => {
      const r = track.querySelector('.sl-rail').getBoundingClientRect();
      set((x - r.left) / r.width * 100, true);
    };
    track.addEventListener('pointerdown', e => { dragging = true; track.setPointerCapture(e.pointerId); el.classList.add('drag'); fromX(e.clientX); e.preventDefault(); });
    track.addEventListener('pointermove', e => { if (dragging) fromX(e.clientX); });
    const end = () => { dragging = false; el.classList.remove('drag'); };
    track.addEventListener('pointerup', end);
    track.addEventListener('pointercancel', end);
    minus.addEventListener('click', () => set(value - 1, true));
    plus.addEventListener('click', () => set(value + 1, true));
    el.tabIndex = 0;
    el.addEventListener('keydown', e => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') { set(value - (e.shiftKey ? 10 : 1), true); e.preventDefault(); }
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') { set(value + (e.shiftKey ? 10 : 1), true); e.preventDefault(); }
    });
    set(value, false);
    return { el, get: () => value, set: v => set(v, false) };
  }

  function toast(text, opt) {
    const o = Object.assign({ ms: 2200, action: null, actionLabel: '' }, opt);
    const box = $('#toasts') || document.body.appendChild(h('div', { id: 'toasts' }));
    const t = h('div', { class: 'toast' }, h('span', null, text));
    if (o.action) t.append(h('button', { onclick: () => { o.action(); t.remove(); } }, o.actionLabel));
    box.append(t);
    setTimeout(() => t.remove(), o.ms);
    return t;
  }

  function joinUrl(code) {
    const dir = location.pathname.replace(/[^/]*$/, '');
    return `${location.origin}${dir}?c=${code}`;
  }
  function broadcastUrl(code) {
    const dir = location.pathname.replace(/[^/]*$/, '');
    return `${location.origin}${dir}?view=broadcast&c=${code}`;
  }

  root.UI = { h, $, Clock, createStore, ruler, stackRows, colorOf, syncWord, slider, toast, joinUrl, broadcastUrl };
})(window);
