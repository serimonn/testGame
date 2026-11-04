// 配信者の操作画面。左に配信用画面と同じ表示、右に操作パネル。練習モードもこれを使う。
(function (root) {
  const { h, $, Clock, slider, toast, colorOf } = root.UI;
  const C = root.MONO_CFG;

  // link: { send(msg) }。opt: { practice, onQuit }
  function HostView(app, store, link, opt) {
    const o = Object.assign({ practice: false }, opt);
    const st = store.st;
    const stageHost = h('div', { class: 'hv-stage' });
    const panel = h('div', { class: 'hv-panel' });
    const warn = h('div', { class: 'hv-warn' }, o.practice ? '練習モード:参加者はCPUです' : 'この画面は配信に映さないでください(配信には「配信用画面」を使います)');
    app.append(h('div', { class: 'host-view' + (o.practice ? ' practice' : '') }, warn, h('div', { class: 'hv-main' }, stageHost, panel)));

    let soundOn = o.practice;
    try { const v = localStorage.getItem('mono_host_sound'); if (v !== null && !o.practice) soundOn = v === '1'; } catch (e) {}
    root.Snd.setOn(soundOn);
    root.Stage(stageHost, { store, sound: true });

    const send = m => link.send(m);

    // ---- パネルの部品
    const phaseBox = h('div', { class: 'pn-phase' });
    const listBox = h('div', { class: 'pn-list' });
    const soundBtn = h('button', { class: 'btn ghost small', onclick: () => {
      soundOn = !soundOn; root.Snd.setOn(soundOn);
      try { localStorage.setItem('mono_host_sound', soundOn ? '1' : '0'); } catch (e) {}
      soundBtn.textContent = soundOn ? '🔊 この画面の音:オン' : '🔇 この画面の音:オフ';
    } }, soundOn ? '🔊 この画面の音:オン' : '🔇 この画面の音:オフ');
    const foot = h('div', { class: 'pn-foot' }, soundBtn,
      o.practice ? h('button', { class: 'btn ghost small', onclick: () => o.onQuit && o.onQuit() }, '練習をやめる') : null);
    panel.append(phaseBox, listBox, foot);

    // ---- フェーズごとのパネル
    let key = '', cur = null;
    function build() {
      phaseBox.innerHTML = '';
      const f = PANELS[st.paused ? 'paused' : st.phase] || PANELS.connecting;
      cur = f() || {};
      if (cur.el) phaseBox.append(cur.el);
    }
    const PANELS = {
      connecting: () => ({ el: h('div', { class: 'pn-card' }, h('p', null, 'サーバーにつないでいます…')) }),
      paused: () => ({ el: h('div', { class: 'pn-card' },
        h('h3', null, '一時停止中'),
        h('p', null, '3ラウンド続けて答えに触れなかったので、次のラウンドの前で止めました。'),
        h('button', { class: 'btn primary big', onclick: () => send({ t: 'host_resume' }) }, '再開する')) }),
      lobby() {
        const start = h('button', { class: 'btn primary big', onclick: () => send({ t: 'host_start' }) }, '試合を始める');
        const note = h('p', { class: 'pn-note' });
        const el = h('div', { class: 'pn-card' },
          h('h3', null, '参加を待っています'),
          h('p', null, '配信画面のQRコードか参加コードから、視聴者がスマホで入ります。'),
          start, note,
          o.practice ? null : setupGuide());
        return { el, update() {
          const n = st.playerCount;
          note.textContent = n ? `${n}人で始めます。途中からも参加できます。` : 'まだ誰もいません。0人でも始められます(シンクロ率は出ません)。';
        } };
      },
      // お題は視聴者と同時に出る。配信者は同じ締切までに答えを置く
      guessing() {
        const m = st.open;
        if (!m) return PANELS.connecting();
        const round = m.round, ha = st.hostAnswer && st.hostAnswer.round === round ? st.hostAnswer : null;
        let lastSent = 0, pend = null, decided = !!(ha && ha.final);
        const sendLive = v => {
          const now = Date.now(), wait = 520 - (now - lastSent);
          clearTimeout(pend);
          if (wait <= 0) { lastSent = now; send({ t: 'host_answer', round, value: v, final: false }); }
          else pend = setTimeout(() => sendLive(sl.get()), wait);
        };
        const sl = slider(v => { if (decided) return; root.Snd.play('tick', { vol: 0.5, rate: 0.8 + v / 250 }); sendLive(v); }, ha && ha.answer !== null ? ha.answer : C.DEFAULT_ANSWER);
        sl.el.classList.add('host-slider');
        const timer = h('div', { class: 'pn-timer' });
        const cnt = h('b');
        const btn = h('button', { class: 'btn primary big', onclick: () => decide() }, 'この位置で決定');
        const lock = () => { decided = true; sl.el.classList.add('locked'); btn.disabled = true; btn.textContent = `${sl.get()} で決定(もう変えられません)`; };
        const decide = () => {
          if (decided) return;
          clearTimeout(pend);
          send({ t: 'host_answer', round, value: sl.get(), final: true });
          lock();
          root.Snd.play('submit');
        };
        if (decided) lock();
        const el = h('div', { class: 'pn-card prepare' },
          h('div', { class: 'pn-small' }, `ラウンド ${round} / ${m.totalRounds} ・ 答えはあなただけに見えています`),
          h('div', { class: 'pn-topic' }, m.item),
          h('div', { class: 'pn-scale' }, h('span', null, '← ' + m.scale.left), h('span', null, m.scale.right + ' →')),
          sl.el, btn, timer,
          h('p', null, '予想済み ', cnt),
          h('p', { class: 'pn-note' }, '迷っている理由は話してOK。数字は口に出さないでください。時間切れのときは、いまのスライダーの位置で決まります(触っていなければ50)。'));
        setTimeout(() => sl.el.focus(), 50);
        el.addEventListener('keydown', e => { if (e.key === 'Enter') decide(); });
        return {
          el,
          update() { const c = st.count; cnt.textContent = c ? `${c.submitted} / ${c.total}人` : '0人'; },
          frame() {
            const l = Clock.left(st.deadline);
            timer.textContent = `残り ${Math.ceil(l)}秒`;
            timer.classList.toggle('hurry', l <= 5);
          },
        };
      },
      reveal() {
        const m = st.reveal;
        const btn = h('button', { class: 'btn primary big', onclick: () => send({ t: 'host_next', round: st.round }) });
        const el = h('div', { class: 'pn-card' },
          h('div', { class: 'pn-small' }, `ラウンド ${st.round} ・ 答え合わせ`),
          h('p', null, '答え ', h('b', { class: 'pn-ans' }, m ? m.answer : '')),
          h('p', { class: 'pn-note' }, '話し終えたら次へ。押さなくても時間で進みます。'),
          btn);
        return { el, frame() {
          const since = (Clock.now() - st.phaseStart) / 1000, wait = C.revealAnimSeconds - since;
          btn.disabled = wait > 0;
          const label = m && m.last ? '結果発表へ' : '次のラウンドへ';
          btn.textContent = wait > 0 ? `演出中… ${Math.ceil(wait)}` : `${label}(あと${Math.ceil(Clock.left(st.deadline))}秒)`;
        } };
      },
      result() {
        return { el: h('div', { class: 'pn-card' },
          h('h3', null, '試合終了'),
          h('button', { class: 'btn primary big', onclick: () => send({ t: 'host_rematch' }) }, 'もう1回(同じ参加者で)'),
          h('button', { class: 'btn ghost', onclick: () => { if (confirm('部屋を閉じます。参加者の一覧も空になります。')) send({ t: 'host_close' }); } }, '終了して部屋を閉じる')) };
      },
      closed() {
        return { el: h('div', { class: 'pn-card' },
          h('h3', null, '部屋を閉じました'),
          h('p', null, '視聴者には「おしまい」と出ています。'),
          h('button', { class: 'btn primary big', onclick: () => send({ t: 'host_open' }) }, 'もう一度部屋を開く')) };
      },
    };

    function setupGuide() {
      const bUrl = root.UI.broadcastUrl(st.code);
      const copy = (text, btn) => {
        const done = () => { btn.textContent = 'コピーしました'; setTimeout(() => btn.textContent = 'コピー', 1500); };
        if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, () => prompt('コピーしてください', text));
        else prompt('コピーしてください', text);
      };
      const b1 = h('button', { class: 'btn small', onclick: () => copy(bUrl, b1) }, 'コピー');
      let opened = true;
      try { opened = !localStorage.getItem('mono_guide_seen'); localStorage.setItem('mono_guide_seen', '1'); } catch (e) {}
      return h('details', { class: 'guide', open: opened },
        h('summary', null, '配信ソフトの設定(はじめての人へ)'),
        h('ol', null,
          h('li', null, '配信ソフト(OBSなど)に「ブラウザ」ソースを足し、下の「配信用画面」のURLを入れる。幅1920、高さ1080'),
          h('li', null, 'この操作画面は配信に映さない(ここには答えが出ます)'),
          h('li', null, 'ゲームの音は配信用画面から出ます。配信ソフトの音量ミキサーで調整してください')),
        h('div', { class: 'url-row' }, h('code', null, bUrl), b1),
        h('a', { href: bUrl, target: '_blank', class: 'pn-link' }, '配信用画面を別のタブで開いて確かめる'));
    }

    // ---- 参加者の一覧(新しく入った人が上)。名前は試合の結果で配信に出るので、不適切な名前はここで除外する
    const search = h('input', { class: 'pn-search', type: 'search', placeholder: '名前で探す', oninput: () => renderRows() });
    const listHead = h('div', { class: 'pn-sub' });
    const rows = h('div', { class: 'pn-rows' });
    listBox.append(listHead, h('div', { class: 'pn-hint' }, '名前は試合の結果だけ配信に出ます。困った名前は「除外」で外せます(その配信中は戻れません)。'), search, rows);
    function renderList() {
      const lb = st.lobby;
      if (!lb) return;
      const act = lb.players.filter(p => p.status === 'active'), spec = lb.players.filter(p => p.status === 'spectator');
      listHead.textContent = `参加者 ${act.length} / ${lb.max}` + (spec.length ? `・観戦 ${spec.length}` : '');
      search.classList.toggle('hidden', lb.players.length < 8);
      renderRows();
    }
    function renderRows() {
      const lb = st.lobby;
      if (!lb) return;
      const q = search.value.trim().toLowerCase();
      const list = lb.players.filter(p => !q || p.name.toLowerCase().includes(q))
        .sort((a, b) => parseInt(b.pid.slice(1), 10) - parseInt(a.pid.slice(1), 10));
      rows.innerHTML = '';
      for (const p of list) rows.append(h('div', { class: 'pl-row' + (p.online ? '' : ' off') },
        h('i', { class: 'pl-dot', style: { background: colorOf(p.pid) } }),
        h('span', { class: 'pl-name' }, p.name, p.status === 'spectator' ? h('small', null, ' 観戦') : null, p.online ? null : h('small', null, ' 切断中')),
        h('span', { class: 'pl-pts' }, p.roundsPlayed ? (p.totalPoints / p.roundsPlayed).toFixed(1) + '点' : ''),
        h('button', { class: 'btn small ghost', onclick: () => kick(p) }, '除外')));
      if (!lb.players.length) rows.append(h('div', { class: 'pl-empty' }, 'まだ参加者はいません'));
      else if (!list.length) rows.append(h('div', { class: 'pl-empty' }, '見つかりません'));
    }
    function kick(p) {
      send({ t: 'host_kick', playerId: p.pid });
      toast(`${p.name} を除外しました`, { ms: C.undoKickSeconds * 1000, actionLabel: '元に戻す', action: () => send({ t: 'host_undo_kick', playerId: p.pid }) });
    }

    function render(msg) {
      const k = [st.phase, st.round, st.matchId, st.paused, !!st.open, !!st.reveal].join(':');
      if (k !== key) { key = k; build(); }
      if (cur && cur.update) cur.update();
      if (!msg || ['lobby', 'snapshot', 'players'].includes(msg.t)) renderList();
    }
    store.on(render);
    render();
    (function loop() { requestAnimationFrame(loop); if (cur && cur.frame) cur.frame(); })();
  }

  root.HostView = HostView;
})(window);
