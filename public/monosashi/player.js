// 視聴者のスマホ画面(縦、片手)。スライダーは画面の下半分に置く。
(function (root) {
  const { h, Clock, ruler, slider, colorOf, syncWord } = root.UI;
  const C = root.MONO_CFG;

  function PlayerView(app, store, link, opt) {
    const st = store.st;
    const top = h('div', { class: 'pv-top' });
    const main = h('div', { class: 'pv-main' });
    const conn = h('div', { class: 'pv-conn hidden' }, 'つなぎ直しています…');
    app.append(h('div', { class: 'player-view' }, top, main, conn));
    const send = m => link.send(m);
    let savedName = '';
    try { savedName = localStorage.getItem('mono_name') || ''; } catch (e) {}
    let soundOn = true;
    try { soundOn = localStorage.getItem('mono_p_sound') !== '0'; } catch (e) {}
    root.Snd.setOn(soundOn);
    const play = (n, o) => root.Snd.play(n, o);
    const buzz = p => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };

    function joinNow(name) {
      savedName = name;
      try { localStorage.setItem('mono_name', name); } catch (e) {}
      send({ t: 'join', name });
    }

    let key = '', cur = null;
    const status = () => (st.me && st.me.status) || 'none';
    const canGuess = () => st.me && st.me.status === 'active' && (st.me.firstRound || 1) <= st.round;
    function sceneKey() {
      return [st.phase, st.round, st.matchId, status(), st.phase === 'guessing' ? canGuess() : '', st.paused].join(':');
    }
    function build() {
      main.innerHTML = '';
      cur = (SC[pickScene()] || SC.wait)() || {};
      if (cur.el) main.append(cur.el);
    }
    function pickScene() {
      if (st.phase === 'connecting') return 'connecting';
      if (st.phase === 'closed') return 'closed';
      const s = status();
      if (s === 'none') return 'join';
      if (s === 'pending') return 'pending';
      if (st.phase === 'lobby') return 'lobby';
      if (st.paused) return 'paused';
      if (st.phase === 'prepare') return 'prepare';
      if (st.phase === 'guessing') return canGuess() ? 'guess' : 'watchGuess';
      if (st.phase === 'reveal') return 'reveal';
      if (st.phase === 'result') return 'result';
      return 'wait';
    }

    const msgCard = (title, sub, extra) => h('div', { class: 'pv-card center' }, h('div', { class: 'pv-big' }, title), sub ? h('div', { class: 'pv-sub' }, sub) : null, extra || null);
    const specNote = () => {
      const s = status();
      if (s === 'kicked') return h('div', { class: 'pv-spec' }, '今回は観戦のみです');
      if (s === 'spectator') return h('div', { class: 'pv-spec' }, '満員のため観戦で参加しています');
      return null;
    };

    const SC = {
      connecting: () => ({ el: msgCard('つないでいます…') }),
      closed: () => ({ el: msgCard('今日はおしまい', '遊んでくれてありがとうございました') }),
      wait: () => ({ el: msgCard('少し待ってね') }),
      paused: () => ({ el: msgCard('一時停止中', '配信者の操作を待っています', specNote()) }),
      join() {
        const input = h('input', { class: 'pv-input', maxlength: C.NAME_MAX, placeholder: '表示名(12文字まで)', value: savedName, enterkeyhint: 'done' });
        const err = h('div', { class: 'pv-err' });
        const go = () => {
          const v = input.value.trim();
          if (!v) { err.textContent = '名前を入れてください'; input.focus(); return; }
          err.textContent = '';
          btn.disabled = true;
          joinNow(v);
          setTimeout(() => btn.disabled = false, 1500);
        };
        const btn = h('button', { class: 'btn primary big', onclick: go }, '参加する');
        input.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
        const el = h('div', { class: 'pv-card' },
          h('div', { class: 'pv-logo' }, '配信者の', h('b', null, '物差し')),
          h('p', { class: 'pv-lead' }, '配信者がお題を物差しのどこに置いたかを当てるゲームです。近いほど高得点。'),
          h('label', { class: 'pv-label' }, '表示名(配信に出ます)'),
          input, err, btn,
          h('p', { class: 'pv-fine' }, `参加コード ${st.code}`));
        return { el, update() {
          if (st.joinError === 'name_ng') err.textContent = 'その名前は使えません。別の名前にしてください';
          else if (st.joinError === 'closed') err.textContent = 'いまは部屋が閉じています';
        } };
      },
      pending: () => ({ el: msgCard('配信者の承認を待っています', `表示名:${st.me.name}`) }),
      lobby() {
        const list = h('div', { class: 'pv-chips' });
        const el = h('div', { class: 'pv-card' },
          h('div', { class: 'pv-big' }, '配信者が始めるのを待っています'),
          specNote(),
          h('div', { class: 'pv-sub' }, `あなた:${st.me.name}`),
          h('div', { class: 'pv-label' }, '参加者'), list,
          h('ol', { class: 'pv-rules' },
            h('li', null, '配信者がお題を物差しのどこに置くかを決める'),
            h('li', null, 'あなたはその数字をスライダーで予想して「決定」'),
            h('li', null, '差3以内で「ぴったり!」10点、10以内6点、20以内3点')));
        return { el, update() {
          list.innerHTML = '';
          for (const p of st.players) list.append(h('span', { class: 'chip' + (st.me && p.pid === st.me.pid ? ' me' : ''), style: { '--c': colorOf(p.pid) } }, p.name));
        } };
      },
      prepare() {
        const late = st.me && st.me.status === 'active' && (st.me.firstRound || 1) > st.round;
        return { el: h('div', { class: 'pv-card center' },
          h('div', { class: 'pv-round' }, `ラウンド ${st.round} / ${st.totalRounds}`),
          h('div', { class: 'pv-big' }, '配信者が考え中…'),
          h('div', { class: 'pv-sub' }, late ? '次のラウンドから予想できます' : 'まもなくお題が出ます'),
          specNote(), scoreLine()) };
      },
      guess() {
        const m = st.open;
        let decided = st.acked, sentAt = 0;
        const sl = slider(v => { play('tick', { vol: 0.35, rate: 0.8 + v / 250 }); buzz(4); refresh(); }, st.acked !== null ? st.acked : 50);
        const btn = h('button', { class: 'btn primary big pv-decide', onclick: () => {
          const now = Date.now();
          if (now - sentAt < 500) return;
          sentAt = now;
          send({ t: 'guess', round: st.round, value: sl.get() });
          btn.classList.add('sending');
        } });
        const state = h('div', { class: 'pv-state' });
        const timer = h('div', { class: 'pv-timer' }, h('div', { class: 'pv-tbar' }), h('span'));
        const mini = ruler(m.scale, { labels: false });
        mini.classList.add('pv-ruler');
        const pin = h('div', { class: 'my-pin', style: { '--c': colorOf(st.me.pid) } });
        mini.querySelector('.marks').append(pin);
        function refresh() {
          const v = sl.get();
          pin.style.left = v + '%';
          const same = decided !== null && decided === v;
          btn.textContent = decided === null ? `${v} で決定` : same ? '決定済み' : `${v} に決め直す`;
          btn.classList.toggle('done', same);
          state.textContent = decided === null ? 'まだ決定していません' : `決定済み:${decided}(締切まで変えられます)`;
          state.classList.toggle('ok', decided !== null);
        }
        refresh();
        play('start', { vol: 0.6 });
        buzz(30);
        const el = h('div', { class: 'pv-guess' },
          h('div', { class: 'pv-gtop' },
            h('div', { class: 'pv-round' }, `ラウンド ${st.round} / ${st.totalRounds}`),
            h('div', { class: 'pv-topic' }, m.item),
            mini, timer),
          h('div', { class: 'pv-gbottom' }, state, sl.el, btn));
        return {
          el,
          onMsg(msg) {
            if (msg.t === 'guess_ack') { decided = msg.value; btn.classList.remove('sending'); play('submit'); buzz([10, 40, 10]); refresh(); }
          },
          frame() {
            const l = Clock.left(st.deadline);
            timer.querySelector('.pv-tbar').style.width = Math.min(100, l / C.guessSeconds * 100) + '%';
            timer.querySelector('span').textContent = `残り ${Math.ceil(l)}秒`;
            timer.classList.toggle('hurry', l <= 5);
            state.classList.toggle('warn', decided === null && l <= 5);
          },
        };
      },
      watchGuess() {
        const m = st.open;
        const late = st.me && st.me.status === 'active';
        return { el: h('div', { class: 'pv-card center' },
          h('div', { class: 'pv-round' }, `ラウンド ${st.round} / ${st.totalRounds}`),
          h('div', { class: 'pv-topic' }, m ? m.item : ''),
          m ? h('div', { class: 'pv-sub' }, `${m.scale.left} 〜 ${m.scale.right}`) : null,
          h('div', { class: 'pv-big small' }, late ? '次のラウンドから予想できます' : 'みんなが予想中…'),
          specNote()) };
      },
      reveal() {
        const m = st.reveal, op = st.open;
        if (!m) return SC.wait();
        const r = ruler(op ? op.scale : { left: '', right: '' }, { labels: false });
        r.classList.add('pv-ruler', 'pv-reveal');
        const marks = r.querySelector('.marks');
        const myPid = st.me && st.me.pid;
        for (const g of m.guesses) marks.append(h('div', { class: 'pdot' + (g.playerId === myPid ? ' me' : ''), style: { left: g.value + '%', '--c': colorOf(g.playerId) } }));
        const needle = h('div', { class: 'pneedle', style: { left: m.answer + '%' } }, h('b', null, m.answer));
        marks.append(needle);
        const mine = m.guesses.find(g => g.playerId === myPid);
        const counted = st.me && st.me.status === 'active' && (st.me.firstRound || 1) <= st.round;
        const row = m.ranking.find(x => x.pid === myPid);
        const res = h('div', { class: 'pv-res' },
          mine ? h('div', { class: 'pv-diff' + (mine.diff <= m.exactDiff ? ' exact' : '') },
            mine.diff <= m.exactDiff ? h('div', { class: 'pv-exact' }, 'ぴったり!') : null,
            h('div', null, `あなたの予想 ${mine.value} ・ 差 ${mine.diff}`),
            h('div', { class: 'pv-pts' }, `+${mine.points}点`))
            : h('div', { class: 'pv-diff' }, counted ? '予想しなかったので0点' : '今回は観戦'),
          row ? h('div', { class: 'pv-rank' }, row.ref ? `平均 ${row.avg.toFixed(1)}点(順位は${C.minRoundsForRanking}ラウンド目から)` : `現在 ${row.rank}位 ・ 平均 ${row.avg.toFixed(1)}点`) : null,
          h('div', { class: 'pv-sync' }, m.sync === null ? '' : `みんなのシンクロ率 ${m.sync}%(${m.syncWord})`));
        const el = h('div', { class: 'pv-card' },
          h('div', { class: 'pv-round' }, `ラウンド ${st.round} ・ 答え合わせ`),
          h('div', { class: 'pv-topic small' }, op ? op.item : ''),
          r, res);
        // 配信と同じ時刻に答えを出す
        const at = m.phaseStart + 5600;
        let shown = false;
        return { el, frame() {
          if (shown || Clock.now() < at) return;
          shown = true;
          const late = Clock.now() - at > 800;
          el.classList.add('shown');
          if (!late && mine) {
            if (mine.diff <= m.exactDiff) { play('exact'); buzz([30, 60, 30, 60, 120]); } else play('pop');
          }
        } };
      },
      result() {
        const m = st.result;
        if (!m) return SC.wait();
        const myPid = st.me && st.me.pid;
        const row = m.ranking.find(x => x.pid === myPid);
        const top3 = m.ranking.filter(x => !x.ref).slice(0, 3);
        return { el: h('div', { class: 'pv-card' },
          h('div', { class: 'pv-round' }, '試合結果'),
          row ? h('div', { class: 'pv-myrank' + (row.rank === 1 ? ' first' : '') },
            row.rank === 1 ? h('div', { class: 'pv-crown' }, '本日の一番の理解者!') : null,
            h('div', { class: 'pv-big' }, row.ref ? '順位の対象外(参考)' : `${row.rank}位`),
            h('div', { class: 'pv-sub' }, `平均 ${row.avg.toFixed(1)}点 ・ ぴったり ${row.exact}回 ・ ${row.roundsPlayed}ラウンド`)) : h('div', { class: 'pv-sub' }, '今回は観戦でした'),
          h('div', { class: 'pv-label' }, '上位'),
          h('div', { class: 'pv-top3' }, top3.map(x => h('div', { class: 'pv-trow' + (x.pid === myPid ? ' me' : '') }, h('b', null, x.rank + '位'), h('span', null, x.name), h('span', null, x.avg.toFixed(1) + '点')))),
          h('div', { class: 'pv-sync' }, m.syncToday === null ? '' : `今日のシンクロ率 ${m.syncToday}%(${m.syncWord})`),
          h('div', { class: 'pv-sub' }, '配信者が「もう1回」を押すと、次の試合が始まります')) };
      },
    };
    function scoreLine() {
      if (!st.me || !st.me.roundsPlayed) return null;
      return h('div', { class: 'pv-score' }, `いまの平均 ${(+st.me.avg || 0).toFixed(1)}点`);
    }

    // 見出し:名前と音のオンオフ
    const sndBtn = h('button', { class: 'pv-snd', 'aria-label': '音', onclick: () => {
      soundOn = !soundOn; root.Snd.setOn(soundOn);
      try { localStorage.setItem('mono_p_sound', soundOn ? '1' : '0'); } catch (e) {}
      sndBtn.textContent = soundOn ? '🔊' : '🔇';
    } }, soundOn ? '🔊' : '🔇');
    const who = h('span', { class: 'pv-who' });
    top.append(h('span', { class: 'pv-tlogo' }, '物差し'), who, sndBtn);

    function render(msg) {
      const k = sceneKey();
      if (k !== key) { key = k; build(); }
      if (cur && cur.update) cur.update();
      if (cur && cur.onMsg && msg) cur.onMsg(msg);
      who.textContent = st.me && st.me.name ? st.me.name : '';
      conn.classList.toggle('hidden', st.conn !== 'retry');
      // 閉じた部屋が開き直されたら、同じ名前で入り直す
      if (msg && msg.t === 'opened' && savedName) joinNow(savedName);
      if (msg && msg.t === 'kicked') buzz(80);
    }
    store.on(render);
    render();
    (function loop() { requestAnimationFrame(loop); if (cur && cur.frame) cur.frame(); })();
    return { joinNow };
  }

  root.PlayerView = PlayerView;
})(window);
