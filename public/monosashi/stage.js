// 配信用画面(1920×1080)。操作画面と練習モードでは縮小して同じものを映す。
// 演出はサーバーの時刻(phaseStart)からの経過秒で決めるので、途中から開いても同じ場面になる。
(function (root) {
  const { h, Clock, ruler, colorOf, syncWord } = root.UI;
  const C = root.MONO_CFG;
  const W = 1920, H = 1080, RULER_W = 1640;

  // 答え合わせの時刻(秒)
  const TL = { title: 0, dotsFrom: 0.6, dotsTo: 4.4, roll: 4.6, needle: 5.6, exact: 6.4, syncFrom: 7.4, syncTo: 8.6, rank: 9.0 };

  function Stage(host, opt) {
    const o = Object.assign({ sound: true, store: null }, opt);
    const S = o.store, st = S.st;
    const el = h('div', { class: 'stage' });
    const fit = h('div', { class: 'stage-fit' }, el);
    host.append(fit);
    const head = h('div', { class: 'st-head' });
    const body = h('div', { class: 'st-body' });
    const flash = h('div', { class: 'st-flash' });
    const pause = h('div', { class: 'st-pause hidden' }, h('div', null, h('b', null, '一時停止中'), h('span', null, '配信者の操作を待っています')));
    const conn = h('div', { class: 'st-conn hidden' }, 'サーバーにつなぎ直しています…');
    el.append(h('div', { class: 'st-bg' }), head, body, flash, pause, conn);

    // 画面の大きさに合わせて拡大縮小
    const resize = () => {
      const r = fit.getBoundingClientRect();
      const k = Math.min(r.width / W, r.height / H) || 0.1;
      el.style.transform = `translate(${(r.width - W * k) / 2}px, ${(r.height - H * k) / 2}px) scale(${k})`;
    };
    new ResizeObserver(resize).observe(fit);
    addEventListener('resize', resize);

    const play = (name, op) => { if (o.sound) root.Snd.play(name, op); };

    // ---- 見出し(タイトル、ラウンド、参加コード)
    const logo = h('div', { class: 'logo' }, h('span', { class: 'logo-mark' }), h('span', null, '配信者の', h('b', null, '物差し')));
    const roundChip = h('div', { class: 'round-chip hidden' });
    const qrSmall = h('canvas', { class: 'qr-small' });
    const codeBox = h('div', { class: 'code-box' }, h('div', { class: 'cb-text' }, h('small', null, '参加コード'), h('b', { class: 'cb-code' }), h('span', { class: 'cb-count' })), qrSmall);
    head.append(logo, roundChip, codeBox);
    let qrFor = '';
    function updateHead() {
      roundChip.classList.toggle('hidden', !(st.round > 0 && ['guessing', 'reveal'].includes(st.phase)));
      roundChip.textContent = `ラウンド ${st.round} / ${st.totalRounds}`;
      codeBox.classList.toggle('hidden', !st.code || st.phase === 'lobby' || st.phase === 'closed' || st.phase === 'connecting');
      codeBox.querySelector('.cb-code').textContent = st.code;
      codeBox.querySelector('.cb-count').textContent = `参加 ${st.playerCount}人`;
      if (st.code && qrFor !== st.code) { qrFor = st.code; root.QR.draw(qrSmall, root.UI.joinUrl(st.code), 150, { quiet: 2 }); }
    }

    // ---- 場面
    let key = '', scene = null;
    function sceneKey() {
      return [st.phase, st.round, st.matchId].join(':');
    }
    function build(fromSnapshot) {
      body.innerHTML = '';
      tl = null;
      const f = SCENES[st.phase] || SCENES.connecting;
      scene = f(fromSnapshot) || {};
      body.append(scene.el || h('div'));
    }

    const SCENES = {
      connecting() { return { el: h('div', { class: 'sc-center' }, h('div', { class: 'big-msg' }, 'つないでいます…')) }; },
      closed() {
        return { el: h('div', { class: 'sc-center' }, h('div', { class: 'big-msg' }, '今日はおしまい'), h('div', { class: 'sub-msg' }, '遊んでくれてありがとうございました')) };
      },
      lobby() {
        const qr = h('canvas', { class: 'qr-big' });
        if (st.code) root.QR.draw(qr, root.UI.joinUrl(st.code), 380, { quiet: 2 });
        const dots = h('div', { class: 'lb-dots' });
        const count = h('div', { class: 'lb-count' });
        const el = h('div', { class: 'sc-lobby' },
          h('div', { class: 'lb-left' },
            h('div', { class: 'lb-catch' }, '配信者の', h('br'), '「', h('em', null, 'どれくらい?'), '」を当てよう'),
            h('ol', { class: 'lb-rules' },
              h('li', null, h('span', null, 'お題が出たら、配信者が「どれくらいか」を 0〜100 の数字で決める')),
              h('li', null, h('span', null, 'みんなはスマホで、配信者が何点にしたかを予想する')),
              h('li', null, h('span', null, '配信者の数字に近いほど高得点。', h('span', { class: 'lb-rounds' }), '問の成績で「本日の一番の理解者」が決まる'))),
            h('div', { class: 'lb-example' },
              h('div', null, '例:お題「コンビニのおでん」 0 = 冷たい 〜 100 = 熱い'),
              h('div', null, '配信者が 70、あなたが 68 なら「ぴったり!」で10点')),
            h('div', { class: 'lb-players' }, count, dots)),
          h('div', { class: 'lb-join card' },
            h('div', { class: 'lb-join-title' }, 'スマホで参加'),
            qr,
            h('div', { class: 'lb-code-label' }, '参加コード'),
            h('div', { class: 'lb-code' }, st.code || '-----')));
        // 名前は出さず、参加した人数だけ点で見せる(名前が出るのは試合の結果だけ)
        return {
          el,
          update() {
            el.querySelector('.lb-rounds').textContent = st.totalRounds;
            const n = st.playerCount;
            count.innerHTML = '';
            count.append(h('span', null, '参加者 ', h('b', null, n), '人', st.spectators ? h('small', null, `(観戦 ${st.spectators})`) : null));
            const shown = Math.min(n, 100);
            while (dots.children.length < shown) {
              const i = dots.children.length;
              dots.append(h('i', { class: dots.dataset.ready ? 'pop' : '', style: { background: colorOf('p' + (i + 1)) } }));
            }
            while (dots.children.length > shown) dots.lastChild.remove();
            dots.dataset.ready = '1';
            dots.classList.toggle('empty', !n);
          },
        };
      },
      guessing() {
        const m = st.open;
        if (!m) return SCENES.connecting();
        const r = ruler(m.scale);
        const bar = h('div', { class: 'tm-fill' });
        const sec = h('div', { class: 'tm-sec' });
        const cnt = h('div', { class: 'gs-count' });
        let lastSec = -1;
        play('start'); setTimeout(() => play('v_start'), 250);
        return {
          el: h('div', { class: 'sc-guess' },
            h('div', { class: 'topic-label' }, 'お題'),
            h('div', { class: 'topic pop-in' }, m.item),
            h('div', { class: 'topic-ask' }, '配信者は何点にした?'),
            r,
            h('div', { class: 'gs-foot' },
              h('div', { class: 'timer' }, h('div', { class: 'tm-bar' }, bar), sec),
              cnt)),
          update() {
            const c = st.count;
            cnt.innerHTML = '';
            cnt.append(h('span', null, '予想済み '), h('b', null, c ? c.submitted : 0), h('span', null, ` / ${c ? c.total : st.playerCount}人`));
          },
          frame() {
            const left = Clock.left(st.deadline), total = C.guessSeconds;
            bar.style.width = Math.max(0, Math.min(100, left / total * 100)) + '%';
            const s = Math.ceil(left);
            sec.textContent = s;
            el.classList.toggle('hurry', s <= 5);
            if (s !== lastSec) { if (s <= 3 && s > 0 && lastSec !== -1) play('clock'); lastSec = s; }
          },
        };
      },
      reveal(fromSnapshot) { return revealScene(fromSnapshot); },
      result(fromSnapshot) { return resultScene(fromSnapshot); },
    };

    // ---- 答え合わせ
    function revealScene() {
      const m = st.reveal, op = st.open;
      if (!m) return SCENES.connecting();
      const r = ruler(op ? op.scale : { left: '', right: '' });
      r.classList.add('ruler-reveal');
      const marks = r.querySelector('.marks');
      // 予想の点を近い値ごとに上へ積む(みんなの予想の山が見える)。名前は出さない
      const items = m.guesses.slice().sort((a, b) => a.value - b.value);
      const n0 = items.length;
      const D = n0 <= 15 ? 44 : n0 <= 40 ? 32 : 24, dPct = D / RULER_W * 100;
      const lastAt = [];
      const lv = items.map(g => {
        let k = 0;
        while (lastAt[k] !== undefined && g.value - lastAt[k] < dPct) k++;
        lastAt[k] = g.value;
        return k;
      });
      const sp = Math.min(D * 0.92, 300 / Math.max(1, Math.max(0, ...lv)));
      r.style.setProperty('--d', D + 'px');
      r.style.setProperty('--sp', sp + 'px');
      const dots = items.map((g, i) => {
        const exact = g.diff <= m.exactDiff;
        const dot = h('div', { class: 'gdot', style: { left: g.value + '%', '--c': colorOf(g.playerId), '--lv': lv[i] } }, h('div', { class: 'g-ball' }));
        marks.append(dot);
        return { dot, g, exact };
      });
      const needle = h('div', { class: 'needle', style: { left: m.answer + '%' } }, h('div', { class: 'nd-line' }), h('div', { class: 'nd-head' }));
      marks.append(needle);
      const ans = h('div', { class: 'answer-num', style: { left: m.answer + '%' } }, h('small', null, '答え'), h('b', null, m.answer));
      marks.append(ans);
      const syncNum = h('b', null, '0');
      const syncBox = h('div', { class: 'sync-box' }, h('div', { class: 'sb-label' }, 'みんなのシンクロ率'), h('div', { class: 'sb-num' }, syncNum, h('span', null, '%')), h('div', { class: 'sb-word' }, m.sync === null ? '予想がありませんでした' : m.syncWord));
      const tiers = C.scoreTiers.map(t => t[1]).concat([0]);
      const per = tiers.map(p => m.guesses.filter(g => g.points === p).length);
      const most = Math.max(1, ...per);
      const rankBox = h('div', { class: 'rank-box' }, h('div', { class: 'rb-label' }, '今回の得点'),
        ...tiers.map((p, i) => h('div', { class: 'rb-row' },
          h('span', { class: 'rb-rank' }, i === 0 ? 'ぴったり' : p + '点'),
          h('span', { class: 'rb-bar' }, h('i', { style: { width: (per[i] / most * 100) + '%' }, class: i === 0 ? 'top' : '' })),
          h('span', { class: 'rb-avg' }, per[i] + '人'))));
      const title = h('div', { class: 'rv-title' }, '答え合わせ!');
      const exacts = dots.filter(d => d.exact).length;
      const banner = h('div', { class: 'rv-banner' }, h('b', null, 'ぴったり!'), h('span', null, `${exacts}人`));
      const el = h('div', { class: 'sc-reveal' },
        h('div', { class: 'rv-topic' }, h('small', null, 'お題'), op ? op.item : ''),
        title, banner, r,
        h('div', { class: 'rv-bottom' }, syncBox, rankBox),
        h('div', { class: 'next-hint' }));
      if (!m.guesses.length) marks.append(h('div', { class: 'no-guess' }, '今回は予想がありませんでした'));

      const n = dots.length, gap = n ? Math.min(0.4, (TL.dotsTo - TL.dotsFrom) / n) : 0;
      const ev = [];
      ev.push({ t: TL.title, fn: late => { title.classList.add('show'); if (!late) { play('reveal'); play('v_reveal'); } } });
      // 点は左から順に落とす(左から右へ視線が流れ、最後に答えが落ちる)
      // 大人数でも音は20回まで
      const every = Math.max(1, Math.ceil(n / 20));
      dots.forEach((d, i) => ev.push({ t: TL.dotsFrom + i * gap, fn: late => {
        d.dot.classList.add('in');
        if (late) d.dot.classList.add('still');
        else if (i % every === 0) play('pop', { rate: 0.9 + Math.min(1, i / n) * 0.8 });
      } }));
      ev.push({ t: TL.roll, fn: late => { title.classList.remove('show'); if (!late) { r.classList.add('tremble'); play('roll'); } } });
      ev.push({ t: TL.needle, fn: late => {
        r.classList.remove('tremble');
        needle.classList.add('in'); ans.classList.add('in');
        if (late) { needle.classList.add('still'); ans.classList.add('still'); return; }
        play('impact');
        hitStop(150);
        shake(18, 420);
        doFlash();
      } });
      ev.push({ t: TL.exact, fn: late => {
        let any = false;
        for (const d of dots) {
          d.dot.classList.add('scored');
          if (d.exact) { d.dot.classList.add('exact'); any = true; if (!late && exacts <= 12) burst(d.dot.firstChild); }
        }
        if (any && !late) {
          play('exact'); setTimeout(() => play('v_exact'), 120);
          banner.classList.add('show');
          setTimeout(() => banner.classList.remove('show'), 1700);
        }
      } });
      ev.push({ t: TL.syncFrom - 0.3, fn: late => { syncBox.classList.add('in'); if (!late && m.sync !== null) play('v_sync'); } });
      ev.push({ t: TL.syncTo, fn: late => { syncNum.textContent = m.sync === null ? '—' : m.sync; syncBox.classList.add('done'); if (!late && m.sync !== null) play('sync'); } });
      ev.push({ t: TL.rank, fn: () => { rankBox.classList.add('in'); root.Snd.duck(true); } });
      tl = { start: m.phaseStart, ev, frame(t) {
        if (t >= TL.syncFrom - 0.3 && t < TL.syncTo && m.sync !== null) {
          const k = Math.min(1, (t - TL.syncFrom) / (TL.syncTo - TL.syncFrom));
          syncNum.textContent = Math.max(0, Math.round(m.sync * (1 - Math.pow(1 - Math.max(0, k), 3))));
        }
      } };
      return {
        el,
        frame() {
          const hint = el.querySelector('.next-hint');
          const left = Math.ceil(Clock.left(st.deadline));
          hint.textContent = (Clock.now() - m.phaseStart) / 1000 > TL.rank ? (m.last ? `結果発表まで ${left}` : `次のラウンドまで ${left}`) : '';
        },
      };
    }

    // ---- 試合の結果
    function resultScene(fromSnapshot) {
      const m = st.result;
      if (!m) return SCENES.connecting();
      const ranked = m.ranking.filter(x => !x.ref), refs = m.ranking.filter(x => x.ref);
      const firsts = ranked.filter(x => x.rank === 1);
      const others = ranked.filter(x => x.rank !== 1).slice(0, 4);
      // 名前は省略せず、カードの幅に収まる大きさまで文字を小さくする(全角1、半角0.6文字として数える)
      const NAME_W = 860;
      const widthOf = t => [...t].reduce((a, ch) => a + (ch.charCodeAt(0) < 0x2000 ? 0.6 : 1), 0);
      const showFirsts = firsts.slice(0, 3), maxFs = showFirsts.length >= 3 ? 90 : showFirsts.length === 2 ? 120 : 150;
      const nameEl = x => h('div', { class: 'rs-fname', style: { fontSize: Math.max(48, Math.min(maxFs, Math.floor(NAME_W / Math.max(1, widthOf(x.name))))) + 'px' } }, x.name);
      const first = h('div', { class: 'rs-first' }, firsts.length ? showFirsts.map(nameEl) : h('div', { class: 'rs-fname none' }, '該当者なし'),
        firsts.length > 3 ? h('div', { class: 'rs-fmore' }, `ほか ${firsts.length - 3}人が同点`) : null);
      const firstSub = h('div', { class: 'rs-fsub' }, firsts.length ? `平均 ${firsts[0].avg.toFixed(1)}点 ・ ぴったり ${firsts[0].exact}回` : `${m.minRounds}ラウンド以上予想した人がいませんでした`);
      const syncNum = h('b', null, '0');
      const el = h('div', { class: 'sc-result' },
        h('div', { class: 'rs-left card' },
          h('div', { class: 'rs-head' }, '本日の一番の理解者'),
          first, firstSub,
          h('div', { class: 'rs-others' }, others.map(x => h('div', { class: 'rs-row' }, h('span', { class: 'rs-rank' }, x.rank + '位'), h('span', { class: 'rs-name' }, x.name), h('span', { class: 'rs-avg' }, x.avg.toFixed(1) + '点')))),
          h('div', { class: 'rs-refs' }, `参加 ${m.ranking.length}人` + (refs.length ? `(うち${m.minRounds}ラウンド未満の参考 ${refs.length}人)` : ''))),
        h('div', { class: 'rs-right card' },
          h('div', { class: 'rs-sync-label' }, '今日のシンクロ率'),
          h('div', { class: 'rs-sync' }, syncNum, h('span', null, m.syncToday === null ? '' : '%')),
          h('div', { class: 'rs-word' }, m.syncWord || ''),
          historyChart(m.syncHistory)));
      const T0 = 0.3, TF = 2.9, TS = 4.0, TSE = 5.2;
      const ev = [
        { t: 0, fn: late => { if (!late) { play('result'); root.Snd.duck(false); } } },
        { t: T0, fn: late => { if (!late) play('v_best'); } },
        { t: TF, fn: late => { first.classList.add('in'); firstSub.classList.add('in'); if (!late && firsts.length) { play('impact'); shake(12, 300); confetti(); } } },
        { t: TS, fn: () => el.querySelector('.rs-right').classList.add('in') },
        { t: TSE, fn: late => { syncNum.textContent = m.syncToday === null ? '—' : m.syncToday; if (!late && m.syncToday !== null) play('sync'); } },
      ];
      const start = fromSnapshot ? Clock.now() - 60000 : Clock.now();
      tl = { start, ev, frame(t) {
        if (t >= TS && t < TSE && m.syncToday !== null) syncNum.textContent = Math.round(m.syncToday * Math.min(1, (t - TS) / (TSE - TS)));
      } };
      return { el };
    }

    function historyChart(vals) {
      const w = 560, hgt = 200, pad = 30;
      if (!vals || !vals.length) return h('div');
      const xs = i => vals.length === 1 ? w / 2 : pad + i * (w - pad * 2) / (vals.length - 1);
      const ys = v => hgt - pad - (v / 100) * (hgt - pad * 2);
      const pts = vals.map((v, i) => `${xs(i)},${ys(v)}`).join(' ');
      let svg = `<svg viewBox="0 0 ${w} ${hgt + 30}" class="hist">`;
      for (const g of [50, 75, 100]) svg += `<line x1="${pad}" x2="${w - pad}" y1="${ys(g)}" y2="${ys(g)}" class="grid"/><text x="0" y="${ys(g) + 8}" class="ax">${g}</text>`;
      svg += `<polyline points="${pts}" class="line"/>`;
      vals.forEach((v, i) => {
        const lastOne = i === vals.length - 1;
        svg += `<circle cx="${xs(i)}" cy="${ys(v)}" r="${lastOne ? 11 : 7}" class="${lastOne ? 'pt now' : 'pt'}"/><text x="${xs(i)}" y="${ys(v) - 18}" class="vl">${v}</text>`;
      });
      svg += `<text x="${w / 2}" y="${hgt + 26}" class="cap">直近${vals.length}回の推移(右端が今日)</text></svg>`;
      return h('div', { class: 'rs-hist', html: svg });
    }

    // ---- 手応えの演出
    let frozenUntil = 0;
    function hitStop(ms) {
      frozenUntil = performance.now() + ms;
      el.classList.add('freeze');
      setTimeout(() => el.classList.remove('freeze'), ms);
    }
    function shake(px, ms) {
      const t0 = performance.now();
      const step = () => {
        const k = (performance.now() - t0) / ms;
        if (k >= 1) { body.style.transform = ''; return; }
        const a = px * Math.pow(1 - k, 2);
        body.style.transform = `translate(${(Math.random() * 2 - 1) * a}px, ${(Math.random() * 2 - 1) * a * 0.6}px)`;
        requestAnimationFrame(step);
      };
      step();
    }
    function doFlash() {
      flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go');
    }
    function burst(dot) {
      const b = h('div', { class: 'burst' }, h('div', { class: 'bs-ring' }));
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * Math.PI * 2 + Math.random() * 0.3, d = 90 + Math.random() * 70;
        b.append(h('i', { class: 'bs-star', style: { '--x': Math.cos(a) * d + 'px', '--y': Math.sin(a) * d + 'px', '--r': (Math.random() * 360) + 'deg', '--d': (Math.random() * 0.15) + 's' } }));
      }
      dot.append(b);
    }
    function confetti() {
      const box = h('div', { class: 'confetti' });
      const cols = ['#ff5b4f', '#ffc23c', '#3fb6a8', '#7d6cf0', '#56a3ff', '#ffffff', '#2b2340'];
      for (let i = 0; i < 90; i++) {
        box.append(h('i', { style: { left: Math.random() * 100 + '%', background: cols[i % cols.length], '--dx': (Math.random() * 300 - 150) + 'px', '--rot': (Math.random() * 1080 - 540) + 'deg', animationDelay: (Math.random() * 0.6) + 's', animationDuration: (2.4 + Math.random() * 1.6) + 's', width: (10 + Math.random() * 12) + 'px', height: (16 + Math.random() * 14) + 'px' } }));
      }
      el.append(box);
      setTimeout(() => box.remove(), 5000);
    }

    // ---- 毎フレーム
    let tl = null;
    function loop() {
      requestAnimationFrame(loop);
      if (performance.now() < frozenUntil) return;
      if (tl) {
        const t = (Clock.now() - tl.start) / 1000;
        for (const e of tl.ev) if (!e.done && t >= e.t) { e.done = true; e.fn(t - e.t > 0.8); }
        if (tl.frame) tl.frame(t);
      }
      if (scene && scene.frame) scene.frame();
    }
    requestAnimationFrame(loop);

    function render(msg) {
      const k = sceneKey();
      if (k !== key) {
        key = k;
        build(msg && msg.t === 'snapshot');
        root.Snd.duck(false);
      }
      updateHead();
      if (scene && scene.update) scene.update();
      pause.classList.toggle('hidden', !st.paused);
      conn.classList.toggle('hidden', st.conn !== 'retry');
      // BGM:ロビーと試合中に流す。閉じたら止める
      if (o.sound) root.Snd.bgm(st.phase !== 'closed' && st.phase !== 'connecting');
    }
    S.on(render);
    render();
    return { el, render };
  }

  root.Stage = Stage;
})(window);
