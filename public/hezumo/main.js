// 画面の流れ、入力、保存。
(function () {
  const c = CFG;
  const $ui = document.getElementById('ui');
  const canvas = document.getElementById('game');
  const pauseBtn = document.getElementById('pauseBtn');
  const STORE = 'hezumo_v1';
  // スマホとタブレットは1人用だけ。タッチ付きPCはPC扱いにする。
  const isTouch = /[?&]touch/.test(location.search) || matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && /Android|iPhone|iPad|Mobile/.test(navigator.userAgent));

  const DEFAULTS = {
    ranks: {}, cleared: {}, kim: {}, seenTips: {}, skin: 'normal', tipDone: false, picked: 'imo', losses: 0,
    settings: { bgm: 0.5, se: 0.9, voice: 0.9, shake: 0.6, lowFlash: false, onomatopoeia: true, easy: false, keyA: 'KeyQ', keyB: 'KeyP' },
  };
  let save = load();
  function load() {
    let o = {};
    try { o = JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) {}
    return { ...DEFAULTS, ...o, settings: { ...DEFAULTS.settings, ...(o.settings || {}) }, kim: o.kim || {}, seenTips: o.seenTips || {}, ranks: o.ranks || (o.rank ? { [o.picked || 'imo']: o.rank } : {}), cleared: o.cleared || (o.finished ? { [o.picked || 'imo']: true } : {}) };
  }
  // 番付は力士ごと。屁音の解放だけは全力士で一番上の番付で決める。
  const rankOf = k => Math.min(save.ranks[k] || 0, BANZUKE.length - 1);
  const bestRank = () => Math.max(0, ...PLAYABLE.map(rankOf));
  function store() { try { localStorage.setItem(STORE, JSON.stringify(save)); } catch (e) {} }

  // 入力 ------------------------------------------------------------
  const pressedKeys = new Set(), pointers = new Map();
  function held(i) {
    const s = save.settings;
    if (match && match.mode !== '2p') {
      return pressedKeys.has(s.keyA) || pressedKeys.has('Space') || pointers.size > 0;
    }
    if (pressedKeys.has(i === 0 ? s.keyA : s.keyB)) return true;
    for (const side of pointers.values()) if (side === i) return true;
    return false;
  }
  let rebinding = null;
  addEventListener('keydown', e => {
    Snd.unlock();
    if (rebinding) { e.preventDefault(); rebinding(e.code); return; }
    if (e.repeat) return;
    if (screen === 'bout') {
      if (e.code === 'Escape') { pause(); return; }
      pressedKeys.add(e.code);
      if (e.code === 'Space') e.preventDefault();
      return;
    }
    if (screen === 'select2') {
      if (e.code === save.settings.keyA) { cyclePick(0); return; }
      if (e.code === save.settings.keyB) { cyclePick(1); return; }
    }
    if (e.code === 'Escape' && backAction) { backAction(); return; }
    if (['ArrowDown', 'ArrowRight', 'ArrowUp', 'ArrowLeft'].includes(e.code)) {
      const list = [...$ui.querySelectorAll('button, select, input')];
      if (!list.length) return;
      const idx = list.indexOf(document.activeElement);
      const dir = e.code === 'ArrowDown' || e.code === 'ArrowRight' ? 1 : -1;
      if (document.activeElement && document.activeElement.type === 'range' && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) return;
      list[(idx + dir + list.length) % list.length].focus();
      e.preventDefault();
    }
  });
  addEventListener('keyup', e => pressedKeys.delete(e.code));
  document.addEventListener('visibilitychange', () => {
    Snd.setHidden(document.hidden);
    if (document.hidden) { pressedKeys.clear(); pointers.clear(); if (online()) return Net.suspend(); if (screen === 'bout') pause(); }
    else if (Net.code) Net.resume();
  });
  addEventListener('blur', () => { pressedKeys.clear(); pointers.clear(); if (screen === 'bout' && !online()) pause(); });
  canvas.addEventListener('pointerdown', e => {
    Snd.unlock();
    const r = canvas.getBoundingClientRect();
    pointers.set(e.pointerId, e.clientX - r.left < r.width / 2 ? 0 : 1);
    try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
    e.preventDefault();
  });
  const up = e => pointers.delete(e.pointerId);
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('contextmenu', e => e.preventDefault());
  document.addEventListener('pointerdown', () => Snd.unlock(), { capture: true });
  pauseBtn.addEventListener('click', () => pause());

  // 画面 ------------------------------------------------------------
  let screen = 'title', backAction = null;
  function show(name, html, back) {
    screen = name; backAction = back || null;
    $ui.innerHTML = html;
    pauseBtn.classList.toggle('hidden', name !== 'bout');
    const first = $ui.querySelector('[autofocus]') || $ui.querySelector('button');
    if (first) first.focus({ preventScroll: true });
    $ui.querySelectorAll('button').forEach(b => b.addEventListener('click', () => Snd.play('ui', { vol: 0.6, dur: 0.2 })));
  }
  const on = (sel, fn) => { const el = $ui.querySelector(sel); if (el) el.addEventListener('click', fn); };
  const keyName = code => code.replace(/^Key/, '').replace(/^Digit/, '').replace('Space', 'スペース').replace('ShiftLeft', '左Shift').replace('ShiftRight', '右Shift').replace('Enter', 'Enter');

  function title() {
    Net.leave();
    match = null; sim = null; Snd.syncLoops(false);
    show('title', `<div class="screen title">
      <h1>屁相撲</h1>
      <p class="tag" style="color:#fff">尻を向けた者だけが、相手を飛ばせる。</p>
      <div class="menu">
        <button class="btn" id="m1" autofocus>ひとりで出世<small>コンピューターと戦って、力士ごとに番付を上げる</small></button>
        <button class="btn" id="m6">友だちと対戦<small>招待リンクを送って、離れた相手と戦う</small></button>
        ${isTouch ? '' : '<button class="btn" id="m2">となりの人と<small>同じ画面でふたりで戦う</small></button>'}
        <button class="btn" id="m5">遊び方<small>勝ち方、会心、屁返しを知る</small></button>
        <button class="btn" id="m3">決まり手図鑑<small>これまでに出した技と屁の音を見る</small></button>
        <button class="btn" id="m4">設定<small>${isTouch ? '音量や揺れを変える' : '音量、揺れ、ボタンを変える'}</small></button>
      </div></div>`);
    on('#m1', selectSolo); on('#m6', onlineMenu); on('#m2', select2); on('#m3', zukan); on('#m5', () => howto(title)); on('#m4', () => settings(title));
  }
  const card = (k, cls, extra) => `<button class="card ${cls || ''}" data-k="${k}"><img src="assets/img/${k}.jpg" alt=""><div class="nm">${CHARS[k].name}</div><div class="cp">${CHARS[k].copy}</div>${extra || ''}</button>`;
  const rankLabel = k => `<div class="rk ${save.cleared[k] ? 'cl' : ''}">${save.cleared[k] ? '制覇' : 'いま:' + BANZUKE[rankOf(k)].rank}</div>`;

  function selectSolo() {
    show('selectSolo', `<div class="screen"><h2>力士をえらぶ</h2>
      <div class="row">${PLAYABLE.map(k => card(k, '', rankLabel(k))).join('')}</div>
      <button class="btn" id="back" style="width:auto">もどる</button></div>`, title);
    const cards = [...$ui.querySelectorAll('.card')];
    (cards.find(b => b.dataset.k === save.picked) || cards[0]).focus();
    cards.forEach(b => b.addEventListener('click', () => { save.picked = b.dataset.k; store(); banzuke(); }));
    on('#back', title);
  }
  let picks = [0, 1];
  function select2() {
    const s = save.settings;
    show('select2', `<div class="screen"><h2>ふたりの力士</h2>
      <div class="who p1">▲ひとりめ ${keyName(s.keyA)}キーか、札を押して変える。取組では左半分を押す</div>
      <div class="row small" id="r0">${PLAYABLE.map(k => card(k)).join('')}</div>
      <div class="who p2">◆ふたりめ ${keyName(s.keyB)}キーか、札を押して変える。取組では右半分を押す</div>
      <div class="row small" id="r1">${PLAYABLE.map(k => card(k)).join('')}</div>
      <div class="row"><button class="btn" id="go" autofocus style="width:auto">取組をはじめる</button><button class="btn" id="back" style="width:auto">もどる</button></div></div>`, title);
    [0, 1].forEach(p => $ui.querySelectorAll(`#r${p} .card`).forEach((b, i) => b.addEventListener('click', () => { picks[p] = i; markPicks(); })));
    on('#go', () => { startMatch({ mode: '2p', keys: [PLAYABLE[picks[0]], PLAYABLE[picks[1]]], need: c.WINS_2P }); });
    on('#back', title);
    markPicks();
  }
  function cyclePick(p) { picks[p] = (picks[p] + 1) % PLAYABLE.length; markPicks(); Snd.play('ui', { vol: 0.6, dur: 0.2 }); }
  function markPicks() {
    [0, 1].forEach(p => $ui.querySelectorAll(`#r${p} .card`).forEach((b, i) => b.classList.toggle(p ? 'sel2' : 'sel', i === picks[p])));
  }

  // idx を省くと、その力士がいま挑戦中の番付。上がった所までは選び直せる。
  function banzuke(idx) {
    const now = rankOf(save.picked);
    if (idx === undefined) idx = now;
    const b = BANZUKE[idx], ch = CHARS[b.char];
    const list = BANZUKE.map((x, i) => {
      const cls = `bz ${i === idx ? 'now' : ''} ${i < now ? 'done' : ''}`;
      const row = `<span>${x.rank}</span><span>${i <= now ? x.oyakata + (i < now || save.cleared[save.picked] ? ' ○' : '') : '???'}</span>`;
      return i <= now ? `<button class="${cls}" data-i="${i}">${row}</button>` : `<div class="${cls}">${row}</div>`;
    }).join('');
    show('banzuke', `<div class="screen"><h2>${CHARS[save.picked].name}:${b.rank}の取組</h2>
      <div class="vs"><img src="assets/img/${save.picked}.jpg" alt=""><span class="big">対</span><img src="assets/img/${b.char}.jpg" alt=""></div>
      <p class="tag">${b.oyakata}・${ch.name}:${ch.copy}</p>
      <button class="btn" id="go" autofocus style="width:min(420px,100%)">土俵へ</button>
      <p class="tag dim">番付表から、勝った相手を選び直せる</p>
      <div class="banzuke">${list}</div>
      <button class="btn" id="back" style="width:auto">力士をえらびなおす</button></div>`, selectSolo);
    on('#go', () => startSolo(idx));
    on('#back', selectSolo);
    $ui.querySelectorAll('button.bz').forEach(e => e.addEventListener('click', () => banzuke(+e.dataset.i)));
  }
  function startSolo(idx, chanko) {
    const b = BANZUKE[idx];
    startMatch({ mode: 'solo', keys: [save.picked, b.char], need: c.WINS_SOLO, rankIdx: idx, ai: b.ai, chanko, rankText: b.rank + ' 対 ' + b.oyakata });
  }

  // 取組 ------------------------------------------------------------
  const online = () => !!match && match.mode === 'online';
  let match = null, sim = null, brain = null, koF = 0, prevHeld = false, firstHit = false, spoke = false, simSeed = (Date.now() & 0xffff) + 1;
  function startMatch(m) {
    match = { ...m, score: [0, 0], kims: [] };
    Snd.syncLoops(true);
    startBout();
  }
  function aiParams() {
    const p = { ...match.ai };
    if (save.settings.easy) { p.react += 15; p.aimErr *= 1.4; p.parry *= 0.5; p.idle += 30; }
    return p;
  }
  function startBout() {
    const opts = match.chanko ? [{ massMul: c.CHANKO_MASS }, null] : null;
    sim = Sim.createBout(match.keys[0], match.keys[1], simSeed++, opts);
    brain = match.mode === 'solo' ? AI.makeBrain(aiParams()) : null;
    Render.reset();
    koF = 0; spoke = false; prevHeld = true;
    show('bout', '');
    Snd.play('v_hakke', { vol: 0.8 });
    Snd.play('taiko', { vol: 0.5, dur: 0.6 });
  }
  const COACH = {
    rumble: '腹が鳴ったら暴発が近い。白いところで離すと会心!',
    crit: '会心! ゲージの白いところで離すと、いちばん強い。',
    over: '暴発! 満タンまで溜めると勝手に出て、大きく飛ぶ。',
    hit: '食らった! 屁が届く直前に撃つと跳ね返せる(屁返し)。',
    parry: '屁返し! 届く直前に撃つと相手が飛ぶ。',
    imo: '芋! 拾うと次の一発が強くなる。',
    shrink: '時間がたつと土俵が縮む。早めに決めよう。',
    fall: '赤い✕は、撃つと自分が落ちる印。向きを待とう。',
  };
  let coach = null, coachF = 0;
  function coachTip(id) {
    if (save.seenTips[id] || (coach && coachF > 0)) return;
    save.seenTips[id] = true; store();
    coach = COACH[id]; coachF = c.COACH_TIP_F;
  }
  function coachCheck() {
    const human = i => match.mode === '2p' || i === 0;
    for (const e of sim.events) {
      if (e.t === 'rumble' && human(e.i)) coachTip('rumble');
      else if (e.t === 'fire' && human(e.i) && e.crit) coachTip('crit');
      else if (e.t === 'fire' && human(e.i) && e.over) coachTip('over');
      else if (e.t === 'hit' && human(e.i)) coachTip('hit');
      else if (e.t === 'parry') coachTip('parry');
      else if (e.t === 'imoSpawn') coachTip('imo');
    }
    if (sim.R < c.RING_R) coachTip('shrink');
    for (const f of sim.f) {
      if (f.charging && human(f.idx) && !f.ch.silent) {
        const d = Sim.recoilDist(f);
        if (Math.hypot(f.x + Math.cos(f.a) * d, f.y + Math.sin(f.a) * d) > sim.R) coachTip('fall');
      }
    }
    if (coachF > 0) coachF--;
  }
  function fartSound(e) {
    const skin = save.skin, rate = 0.92 + Math.random() * 0.16;
    if (e.silent) { Snd.play('fart_s', { vol: 0.08, dur: 0.2 }); return; }
    if (skin === 'horagai') { Snd.play('horagai', { vol: 0.6 + e.p * 0.4, rate: 0.9 + (1 - e.c) * 0.4, dur: 0.3 + e.c * 0.9 }); return; }
    if (skin === 'taiko') { Snd.play('taikoskin', { vol: 0.6 + e.p * 0.4, rate: 1.2 - e.c * 0.4, dur: 0.25 + e.c * 0.7 }); return; }
    if (e.over) Snd.play('fart_over', { vol: 1, rate, dur: 1.2 });
    else if (e.crit) Snd.play('fart_crit', { vol: 1, rate, dur: 1.1 });
    else if (e.c > 0.65) Snd.play('fart_l', { vol: 0.9, rate, dur: 0.8 });
    else if (e.c > 0.3) Snd.play('fart_m', { vol: 0.8, rate, dur: 0.45 });
    else Snd.play('fart_s', { vol: 0.8, rate, dur: 0.28 });
  }
  function onEvents() {
    for (const e of sim.events) {
      Render.onEvent(e, sim);
      if (e.t === 'fire') { if (!e.pred) fartSound(e); }
      else if (e.t === 'hit') { Snd.play('hit', { vol: 0.5 + Math.min(0.5, e.p * 0.4), dur: 0.35 }); firstHit = true; }
      else if (e.t === 'parry') Snd.play('parry', { vol: 1, dur: 0.7 });
      else if (e.t === 'rumble') { if (!e.silent) Snd.play('rumble', { vol: 0.7, dur: 0.8 }); }
      else if (e.t === 'imo') Snd.play('imo', { vol: 0.7, dur: 0.4 });
      else if (e.t === 'bump') Snd.play('bump', { vol: 0.5, dur: 0.3 });
      else if (e.t === 'go') Snd.play('v_nokotta', { vol: 0.8 });
      else if (e.t === 'ko') {
        Snd.play('taiko', { vol: 1, dur: 1 });
        Snd.play('cheer', { vol: 0.5, dur: 1.5 });
        const r = sim.result;
        if (r.winner >= 0) {
          match.score[r.winner]++;
          match.kims.push(r.kimarite);
          if (match.mode === '2p' || r.winner === 0) { save.kim[r.kimarite] = (save.kim[r.kimarite] || 0) + 1; }
          save.tipDone = true;
          store();
        }
      }
    }
  }
  function view() {
    const s = save.settings;
    const hints = match.mode !== '2p'
      ? [isTouch ? '画面のどこでも長押し' : `${keyName(s.keyA)} か スペース か 画面を長押し`, null]
      : [`${keyName(s.keyA)} か 左半分を長押し`, `${keyName(s.keyB)} か 右半分を長押し`];
    const tip = coachF > 0 ? coach : !save.tipDone && !firstHit ? '長押しで溜める。離すと出る。お尻を相手に向けて!' : null;
    return {
      labels: match.mode === 'solo' ? ['あなた', 'CPU'] : online() ? ['あなた', '相手'] : ['ひとりめ', 'ふたりめ'],
      score: match.score, winsNeed: match.need, rankText: online() ? `通信 ${Net.rtt}ms` : match.rankText, hints, tip: online() && netWait ? netWait : tip, koF: sim.phase === 'end' ? koF : undefined,
    };
  }
  function stepBout() {
    const inputs = [held(0), brain ? AI.think(sim, 1, brain) : held(1)];
    Sim.step(sim, inputs);
    onEvents();
    coachCheck();
    Render.tick(sim);
    if (sim.phase === 'end' && sim.stop === 0) {
      koF++;
      if (koF === 14 && !spoke) {
        spoke = true;
        // 決まり手は画面の文字だけ。読み上げると次の「はっけよい」に被る
        if (sim.result.winner < 0) Snd.play('v_torinaoshi', { vol: 0.9 });
      }
      const any = held(0) || (match.mode === '2p' && held(1));
      const skip = koF >= c.KO_SKIP_AFTER_F && any && !prevHeld;
      prevHeld = any;
      if (koF >= c.KO_SHOW_F || skip) nextBout();
    }
  }
  // オンライン:勝負はサーバーが進める。ここでは届いた状態を映すだけ。
  function stepOnline() {
    const fired = Net.input(held(0));
    if (fired) { fartSound(fired); Render.fv[0].sq = 1; }
    Net.advance();
    sim = Net.sim;
    if (!sim) return;
    onEvents();
    coachCheck();
    Render.tick(sim);
    if (sim.phase === 'end' && sim.stop === 0) {
      koF++;
      if (koF === 14 && !spoke) {
        spoke = true;
        // 決まり手は画面の文字だけ。読み上げると次の「はっけよい」に被る
        if (sim.result.winner < 0) Snd.play('v_torinaoshi', { vol: 0.9 });
      }
    }
  }
  function nextBout() {
    if (match.score[0] >= match.need || match.score[1] >= match.need) endMatch();
    else startBout();
  }
  function endMatch() {
    pressedKeys.clear(); pointers.clear();
    const win0 = match.score[0] >= match.need;
    if (match.mode === 'solo') {
      if (win0) {
        save.losses = 0;
        const final = match.rankIdx === BANZUKE.length - 1;
        const k = match.keys[0], before = bestRank();
        const promoted = match.rankIdx === rankOf(k) && !final;
        if (promoted) save.ranks[k] = rankOf(k) + 1;
        if (final) save.cleared[k] = true;
        store();
        if (final) return ending();
        return resultSolo(true, before, promoted);
      }
      save.losses++;
      store();
      return resultSolo(false);
    }
    return result2p(win0 ? 0 : 1);
  }
  function resultSolo(win, before, promoted) {
    const b = BANZUKE[match.rankIdx];
    const m = match;
    const unlocked = win ? SKINS.filter(x => x.unlock > before && x.unlock <= bestRank()) : [];
    const offer = !win && save.losses >= c.CHANKO_AFTER_LOSSES;
    show('result', `<div class="screen" style="justify-content:center"><p class="big">${win ? '勝ち名乗り' : '黒星'}</p>
      <p class="tag">${win ? (promoted ? `${CHARS[m.keys[0]].name}の番付が ${BANZUKE[rankOf(m.keys[0])].rank} に上がった。` : `${b.oyakata}に勝った。番付はそのまま。`) : `${b.oyakata}に敗れた。番付は下がらない。`}</p>
      ${unlocked.map(u => `<p class="tag" style="color:var(--gold)">屁の音「${u.name}」が使えるようになった(設定で変えられる)</p>`).join('')}
      ${offer ? '<p class="tag dim">親方「ちゃんこを食って、体を大きくしてこい」</p>' : ''}
      <div class="menu">
        <button class="btn" id="next" autofocus>${win ? '番付表へ' : 'もう一番'}</button>
        ${offer ? '<button class="btn" id="chanko">ちゃんこを食べる<small>次の取組だけ、体が重くなって飛ばされにくい</small></button>' : ''}
        <button class="btn" id="cardBtn">取組カードを保存</button>
        <button class="btn" id="back">タイトルへ</button>
      </div></div>`, title);
    on('#next', () => win ? banzuke() : startSolo(m.rankIdx));
    on('#chanko', () => { save.losses = 0; store(); startSolo(m.rankIdx, true); });
    on('#cardBtn', () => saveCard(m, win ? 0 : 1));
    on('#back', title);
  }
  function result2p(w) {
    const m = match;
    show('result', `<div class="screen" style="justify-content:center"><p class="big">${w === 0 ? '▲' : '◆'}${CHARS[m.keys[w]].name} 優勝</p>
      <p class="tag">${m.score[0]} 対 ${m.score[1]}</p>
      <div class="menu">
        <button class="btn" id="again" autofocus>もう一番</button>
        <button class="btn" id="sel">力士を変える</button>
        <button class="btn" id="cardBtn">取組カードを保存</button>
        <button class="btn" id="back">タイトルへ</button>
      </div></div>`, title);
    on('#again', () => startMatch({ mode: '2p', keys: m.keys, need: m.need }));
    on('#sel', select2);
    on('#cardBtn', () => saveCard(m, w));
    on('#back', title);
  }
  function ending() {
    show('result', `<div class="screen" style="justify-content:center;text-align:center"><p class="big">天下無双</p>
      <p class="tag">あなたは世界の大気を土俵の外へ押し出した。<br>翌朝、空気はほんの少し、くさかった。</p>
      <p class="tag dim">${CHARS[save.picked].name}は番付を上げきった。番付表から好きな相手と戦えるし、別の力士で出世し直せる。</p>
      <div class="menu"><button class="btn" id="back" autofocus>タイトルへ</button></div></div>`, title);
    on('#back', title);
  }
  function saveCard(m, w) {
    const cv = document.createElement('canvas'); cv.width = 800; cv.height = 450;
    const x = cv.getContext('2d'), key = m.keys[w];
    x.fillStyle = '#f4e9d2'; x.fillRect(0, 0, 800, 450);
    x.fillStyle = '#c8321f'; x.fillRect(0, 0, 800, 14); x.fillRect(0, 436, 800, 14);
    const pic = new Image();
    const finish = () => {
      try { x.drawImage(pic, 30, 60, 330, 330); } catch (e) {}
      x.fillStyle = '#1c1410'; x.textBaseline = 'top';
      x.font = '900 34px "Yu Mincho",serif'; x.fillText('屁相撲 取組カード', 390, 50);
      x.font = '900 44px "Yu Mincho",serif'; x.fillText(CHARS[key].name + ' の勝ち', 390, 110);
      x.font = '700 26px "Yu Gothic",sans-serif'; x.fillText(`${m.score[0]} 対 ${m.score[1]}`, 390, 170);
      x.font = '700 22px "Yu Mincho",serif';
      m.kims.slice(-5).forEach((k, i) => x.fillText(`${i + 1}番 ${KIMARITE[k].name}`, 390, 214 + i * 32));
      const a = document.createElement('a');
      try { a.href = cv.toDataURL('image/png'); } catch (e) { return; }
      a.download = 'hezumo.png'; a.click();
    };
    pic.onload = finish; pic.onerror = finish; pic.src = `assets/img/${key}.jpg`;
  }

  // オンライン ------------------------------------------------------
  let lobbyState = null, netWait = null;
  const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const newCode = () => Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  const inviteUrl = () => location.origin + location.pathname + '?room=' + Net.code;
  function onlineMenu() {
    show('online', `<div class="screen" style="justify-content:center"><h2>友だちと対戦</h2>
      <div class="menu">
        <button class="btn" id="make" autofocus>部屋をつくる<small>招待リンクを相手に送る</small></button>
        <div class="joinrow"><input id="code" maxlength="4" autocomplete="off" autocapitalize="characters" placeholder="4文字のコード" aria-label="部屋のコード"><button class="btn" id="join" style="width:auto">入る</button></div>
        <p class="tag dim" id="err"></p>
        <button class="btn" id="back">もどる</button>
      </div></div>`, title);
    on('#make', () => enterRoom(newCode()));
    on('#join', () => {
      const v = $ui.querySelector('#code').value.trim().toUpperCase();
      if (/^[A-Z0-9]{4}$/.test(v)) enterRoom(v);
      else $ui.querySelector('#err').textContent = 'コードは4文字です';
    });
    on('#back', title);
  }
  function enterRoom(code) {
    lobbyState = null;
    Net.join(code, {
      // 離れている間に取組が終わっていたら、部屋へもどす
      onWelcome: playing => { Net.send({ t: 'pick', k: save.picked }); if (!playing && online()) lobby(); },
      onLobby: l => { lobbyState = l; updateLobby(); },
      onStart: m => { match = { mode: 'online', keys: m.keys, need: m.need, score: [0, 0], kims: [] }; Snd.syncLoops(true); },
      onBout: m => {
        match.score = m.score; match.kims = m.kims;
        sim = Net.sim; netWait = null;
        Render.reset();
        koF = 0; spoke = false;
        show('bout', '');
        Snd.play('v_hakke', { vol: 0.8 });
        Snd.play('taiko', { vol: 0.5, dur: 0.6 });
      },
      onWait: sec => { netWait = sec ? `相手の接続を待っている…あと${sec}秒` : null; },
      onDrop: () => { netWait = '接続が切れた。つなぎ直している…'; updateLobby(); },
      onBack: () => { netWait = null; updateLobby(); },
      onEnd: m => { match.score = m.score; match.kims = m.kims; resultOnline(m); },
      onFull: () => { onlineMenu(); $ui.querySelector('#err').textContent = 'その部屋はもう2人いる'; },
      onFail: () => { match = null; sim = null; Snd.syncLoops(false); onlineMenu(); $ui.querySelector('#err').textContent = 'サーバーにつながらなかった。電波を確かめて、もう一度ためしてください'; },
    });
    lobby();
  }
  function lobby(ready) {
    match = null; sim = null; Snd.syncLoops(false);
    show('lobby', `<div class="screen"><h2>部屋 <span class="roomcode">${Net.code}</span></h2>
      <p class="tag" id="lbs">つないでいる…</p>
      <div class="row"><button class="btn" id="share" style="width:auto">招待リンクを送る</button></div>
      <p class="tag dim" id="url"></p>
      <div class="row small">${PLAYABLE.map(k => card(k, k === save.picked ? 'sel' : '')).join('')}</div>
      <button class="btn" id="rdy" autofocus style="width:min(420px,100%)">準備OK</button>
      <button class="btn" id="back" style="width:auto">部屋を出る</button></div>`, title);
    $ui.querySelectorAll('.card').forEach(b => b.addEventListener('click', () => {
      save.picked = b.dataset.k; store();
      $ui.querySelectorAll('.card').forEach(x => x.classList.toggle('sel', x === b));
      Net.send({ t: 'pick', k: save.picked });
    }));
    on('#share', async () => {
      const url = inviteUrl();
      try {
        if (isTouch && navigator.share) await navigator.share({ title: '屁相撲', text: '屁相撲で勝負だ', url });
        else { await navigator.clipboard.writeText(url); $ui.querySelector('#url').textContent = 'コピーした:' + url; }
      } catch (e) { const u = $ui.querySelector('#url'); if (u) u.textContent = url; }
    });
    on('#rdy', () => Net.send({ t: 'ready', v: !(lobbyState && lobbyState.ready[0]) }));
    on('#back', title);
    if (ready) Net.send({ t: 'ready', v: true });
    updateLobby();
  }
  function updateLobby() {
    if (screen !== 'lobby') return;
    const lbs = $ui.querySelector('#lbs'), rdy = $ui.querySelector('#rdy'), l = lobbyState;
    if (!Net.connected) { lbs.textContent = 'つないでいる…'; return; }
    if (!l) return;
    const rival = CHARS[l.keys[1]] ? CHARS[l.keys[1]].name : '力士';
    lbs.textContent = !l.on[1] ? '相手を待っている。招待リンクかコードを送ろう' : l.ready[1] ? `相手(${rival})は準備OK` : `相手(${rival})がえらんでいる`;
    rdy.textContent = l.ready[0] ? '相手を待っている(押すと取り消す)' : '準備OK';
  }
  function resultOnline(m) {
    pressedKeys.clear(); pointers.clear(); netWait = null;
    const mt = match, win = m.winner === 0, afk = m.reason === 'afk';
    show('result', `<div class="screen" style="justify-content:center"><p class="big">${afk ? '水入り' : win ? '勝ち名乗り' : '黒星'}</p>
      <p class="tag">${afk ? 'しばらく動きがないので打ち切った' : m.reason === 'forfeit' ? (win ? '相手がいなくなったので不戦勝' : '不戦敗') : `${mt.score[0]} 対 ${mt.score[1]}`}</p>
      <div class="menu">
        <button class="btn" id="again" autofocus>もう一番</button>
        <button class="btn" id="sel">力士を変える</button>
        ${afk ? '' : '<button class="btn" id="cardBtn">取組カードを保存</button>'}
        <button class="btn" id="back">部屋を出る</button>
      </div></div>`, title);
    on('#again', () => lobby(true));
    on('#sel', () => lobby());
    on('#cardBtn', () => saveCard(mt, win ? 0 : 1));
    on('#back', title);
  }

  function howto(back) {
    const key = isTouch ? '画面を長押し' : '長押し';
    show('howto', `<div class="screen howto"><h2>遊び方</h2>
      <section><h3>相手を土俵の外へ出せば1本</h3>
        <p>${key}で溜めて、離すと屁が出る。力士は勝手に回るので、<b>お尻が相手を向いた瞬間</b>に離す。</p>
        <p>撃つと自分は<b>顔の向きへ飛ぶ</b>。歩けないので、動くのも屁だけ。</p></section>
      <section><h3>溜めの目もり</h3>
        <div class="gauge"><span class="g1">溜める</span><span class="g2">腹が鳴る</span><span class="g3">会心</span></div>
        <p>満タンまで溜めると<b>暴発</b>。勝手に出て、大きく飛び、しばらく動けない。</p></section>
      <section><h3>技</h3>
        <p><b>会心</b>:白いところで離す。いちばん強い一発。土俵際の相手なら押し出せる。</p>
        <p><b>屁返し</b>:相手の屁が届く直前に自分も撃つ。尻の向きは関係なく、相手が飛ぶ。早すぎると強く食らう。相手が遠いほど狙いやすい。</p></section>
      <section><h3>土俵の見方</h3>
        <p><b>扇形</b>:屁の届く範囲。<b>点線の先</b>:反動で飛ぶ先。<b class="ng">赤い✕</b>:撃つと自分が落ちる。</p>
        <p><b>芋</b>:拾うと次の一発が強い。20秒をすぎると土俵が縮む。</p></section>
      <section><h3>友だちと対戦</h3>
        <p>部屋をつくって招待リンクを送り、ふたりとも「準備OK」を押すと始まる。先に3本とったほうの勝ち。別の画面へ移ると接続が切れ、15秒もどらないと不戦敗になる。</p></section>
      <section><h3>勝つコツ</h3>
        <p>大きく溜めるのは、前に土俵が残っているときだけ。追い込まれたら、お尻を外へ向けて小さく撃つと中へ戻れる。</p></section>
      <button class="btn" id="back" autofocus style="width:auto">もどる</button></div>`, back);
    on('#back', back);
  }

  function zukan() {
    const rows = Object.keys(KIMARITE).map(k => {
      const n = save.kim[k] || 0;
      return `<tr><td>${n ? KIMARITE[k].name : '???'}</td><td class="dim">${KIMARITE[k].hint}</td><td>${n ? n + '回' : ''}</td></tr>`;
    }).join('');
    const got = Object.keys(KIMARITE).filter(k => save.kim[k]).length;
    const skins = SKINS.map(x => `<tr><td>${bestRank() >= x.unlock ? x.name : '???'}</td><td class="dim">${x.unlock ? 'どれかの力士が' + BANZUKE[x.unlock].rank + 'まで上がると使える' : '最初から使える'}</td><td></td></tr>`).join('');
    show('zukan', `<div class="screen"><h2>決まり手図鑑 ${got} / ${Object.keys(KIMARITE).length}</h2>
      <table class="zk">${rows}</table><h2>屁の音</h2><table class="zk">${skins}</table>
      <button class="btn" id="back" autofocus style="width:auto">もどる</button>
      <p class="credit">声 VOICEVOX:青山龍星 / 効果音 Stable Audio Open / 曲 ACE-Step</p></div>`, title);
    on('#back', title);
  }

  function settings(back) {
    const s = save.settings;
    const slider = (id, label) => `<label for="${id}">${label}</label><input id="${id}" type="range" min="0" max="1" step="0.05" value="${s[id]}">`;
    const check = (id, label) => `<label for="${id}">${label}</label><input id="${id}" type="checkbox" ${s[id] ? 'checked' : ''}>`;
    const skinOpts = SKINS.filter(x => bestRank() >= x.unlock).map(x => `<option value="${x.id}" ${save.skin === x.id ? 'selected' : ''}>${x.name}</option>`).join('');
    show('settings', `<div class="screen"><h2>設定</h2><div class="set">
      ${slider('bgm', '曲と歓声の大きさ')}${slider('se', '屁と効果音の大きさ')}${slider('voice', '行司の声の大きさ')}${slider('shake', '画面の揺れ(弱いと酔いにくい)')}
      ${check('lowFlash', '画面の光を抑える')}${check('onomatopoeia', '「ブッ!」の文字を出す(音なしで遊ぶとき便利)')}${check('easy', 'やさしい取組(コンピューターが遅くなる)')}
      <label for="skin">屁の音</label><select id="skin">${skinOpts}</select>
      ${isTouch ? '' : `<span>ひとりめのボタン</span><button class="keybtn" id="keyA">${keyName(s.keyA)}</button>
      <span>ふたりめのボタン</span><button class="keybtn" id="keyB">${keyName(s.keyB)}</button>`}
      </div><button class="btn" id="back" autofocus style="width:auto">もどる</button></div>`, back);
    for (const id of ['bgm', 'se', 'voice', 'shake']) {
      $ui.querySelector('#' + id).addEventListener('input', e => {
        s[id] = +e.target.value; applySettings(); store();
        if (id === 'se') Snd.play('fart_m', { vol: 0.8, dur: 0.3 });
        if (id === 'voice') Snd.play('v_nokotta');
        if (id === 'shake') Render.addShake(12);
      });
    }
    for (const id of ['lowFlash', 'onomatopoeia', 'easy']) $ui.querySelector('#' + id).addEventListener('change', e => { s[id] = e.target.checked; store(); });
    $ui.querySelector('#skin').addEventListener('change', e => { save.skin = e.target.value; store(); fartSound({ c: 0.7, p: 0.8 }); });
    for (const id of ['keyA', 'keyB']) {
      on('#' + id, ev => {
        const btn = ev.currentTarget; btn.textContent = 'キーを押す…(Escでやめる)';
        rebinding = code => {
          rebinding = null;
          if (code !== 'Escape') { s[id] = code; store(); }
          btn.textContent = keyName(s[id]);
        };
      });
    }
    on('#back', back);
  }
  function applySettings() {
    const s = save.settings;
    Snd.vol.bgm = s.bgm; Snd.vol.se = s.se; Snd.vol.voice = s.voice;
    Render.settings = s;
    Snd.syncLoops();
  }

  let paused = false;
  function pause() {
    if (screen !== 'bout') return;
    paused = true; screen = 'pause'; pauseBtn.classList.add('hidden');
    pressedKeys.clear(); pointers.clear();
    const showPause = () => {
      paused = !online();
      if (online()) {
        show('pause', `<div class="screen" style="justify-content:center"><h2>取組は続いている</h2><div class="menu">
          <button class="btn" id="res" autofocus>もどる</button>
          <button class="btn" id="quit">やめる(不戦敗)</button></div></div>`, resume);
        on('#res', resume);
        on('#quit', () => Net.send({ t: 'quit' }));
        return;
      }
      show('pause', `<div class="screen" style="justify-content:center"><h2>一時停止</h2><div class="menu">
        <button class="btn" id="res" autofocus>つづける</button>
        <button class="btn" id="how">遊び方</button>
        <button class="btn" id="st">設定</button>
        <button class="btn" id="quit">やめてタイトルへ</button></div></div>`, resume);
      on('#res', resume); on('#how', () => howto(showPause)); on('#st', () => settings(showPause)); on('#quit', () => { paused = false; title(); });
    };
    const resume = () => { paused = false; show('bout', ''); };
    showPause();
  }

  // ループ。処理は60F固定、描画は毎フレーム。-----------------------------
  let last = performance.now(), acc = 0;
  const STEP = 1000 / 60;
  function frame(now) {
    acc += Math.min(100, now - last); last = now;
    while (acc >= STEP) {
      acc -= STEP;
      if (online() && (screen === 'bout' || screen === 'pause')) stepOnline();
      else if (screen === 'bout' && !paused && sim) stepBout();
    }
    if (sim && match && (screen === 'bout' || screen === 'pause')) Render.draw(sim, view());
    else Render.draw(null);
    requestAnimationFrame(frame);
  }

  Render.init(canvas, save.settings);
  Render.reset();
  applySettings();
  title();
  const invited = new URLSearchParams(location.search).get('room');
  if (invited && /^[A-Za-z0-9]{4}$/.test(invited)) enterRoom(invited.toUpperCase());
  requestAnimationFrame(frame);

  // 確認用
  window.__hz = { get sim() { return sim; }, get screen() { return screen; }, get save() { return save; }, get match() { return match; }, net: Net };
})();
