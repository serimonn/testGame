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
    rank: 0, kim: {}, skin: 'normal', tipDone: false, picked: 'imo', losses: 0,
    settings: { bgm: 0.5, se: 0.9, voice: 0.9, shake: 0.6, lowFlash: false, onomatopoeia: true, easy: false, keyA: 'KeyQ', keyB: 'KeyP' },
  };
  let save = load();
  function load() {
    let o = {};
    try { o = JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) {}
    return { ...DEFAULTS, ...o, settings: { ...DEFAULTS.settings, ...(o.settings || {}) }, kim: o.kim || {} };
  }
  function store() { try { localStorage.setItem(STORE, JSON.stringify(save)); } catch (e) {} }

  // 入力 ------------------------------------------------------------
  const pressedKeys = new Set(), pointers = new Map();
  function held(i) {
    const s = save.settings;
    if (match && match.mode === 'solo') {
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
    if (document.hidden) { pressedKeys.clear(); pointers.clear(); if (screen === 'bout') pause(); }
  });
  addEventListener('blur', () => { pressedKeys.clear(); pointers.clear(); if (screen === 'bout') pause(); });
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
    if (first) first.focus();
    $ui.querySelectorAll('button').forEach(b => b.addEventListener('click', () => Snd.play('ui', { vol: 0.6, dur: 0.2 })));
  }
  const on = (sel, fn) => { const el = $ui.querySelector(sel); if (el) el.addEventListener('click', fn); };
  const keyName = code => code.replace(/^Key/, '').replace(/^Digit/, '').replace('Space', 'スペース').replace('ShiftLeft', '左Shift').replace('ShiftRight', '右Shift').replace('Enter', 'Enter');

  function title() {
    match = null; sim = null; Snd.syncLoops(false);
    const r = BANZUKE[Math.min(save.rank, BANZUKE.length - 1)];
    show('title', `<div class="screen title">
      <h1>屁相撲</h1>
      <p class="tag" style="color:#fff">尻を向けた者だけが、相手を飛ばせる。</p>
      <div class="menu">
        <button class="btn" id="m1" autofocus>ひとりで出世<small>コンピューターと戦って番付を上げる(いまは${r.rank})</small></button>
        ${isTouch ? '' : '<button class="btn" id="m2">となりの人と<small>同じ画面でふたりで戦う</small></button>'}
        <button class="btn" id="m3">決まり手図鑑<small>これまでに出した技と屁の音を見る</small></button>
        <button class="btn" id="m4">設定<small>${isTouch ? '音量や揺れを変える' : '音量、揺れ、ボタンを変える'}</small></button>
      </div></div>`);
    on('#m1', selectSolo); on('#m2', select2); on('#m3', zukan); on('#m4', () => settings(title));
  }
  const card = (k, cls) => `<button class="card ${cls || ''}" data-k="${k}"><img src="assets/img/${k}.jpg" alt=""><div class="nm">${CHARS[k].name}</div><div class="cp">${CHARS[k].copy}</div></button>`;

  function selectSolo() {
    show('selectSolo', `<div class="screen"><h2>力士をえらぶ</h2>
      <div class="row">${PLAYABLE.map(k => card(k)).join('')}</div>
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

  function banzuke() {
    const idx = Math.min(save.rank, BANZUKE.length - 1), b = BANZUKE[idx], ch = CHARS[b.char];
    const list = BANZUKE.map((x, i) => `<div class="bz ${i === idx ? 'now' : i < idx ? 'done' : ''}"><span>${x.rank}</span><span>${i <= idx ? x.oyakata : '???'}</span></div>`).join('');
    show('banzuke', `<div class="screen"><h2>${b.rank}の取組</h2>
      <div class="vs"><img src="assets/img/${save.picked}.jpg" alt=""><span class="big">対</span><img src="assets/img/${b.char}.jpg" alt=""></div>
      <p class="tag">${b.oyakata}・${ch.name}:${ch.copy}</p>
      <button class="btn" id="go" autofocus style="width:min(420px,100%)">土俵へ</button>
      <div class="banzuke">${list}</div></div>`, title);
    on('#go', () => startSolo(idx));
  }
  function startSolo(idx, chanko) {
    const b = BANZUKE[idx];
    startMatch({ mode: 'solo', keys: [save.picked, b.char], need: c.WINS_SOLO, rankIdx: idx, ai: b.ai, chanko, rankText: b.rank + ' 対 ' + b.oyakata });
  }

  // 取組 ------------------------------------------------------------
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
      if (e.t === 'fire') fartSound(e);
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
    const hints = match.mode === 'solo'
      ? [isTouch ? '画面のどこでも長押し' : `${keyName(s.keyA)} か スペース か 画面を長押し`, null]
      : [`${keyName(s.keyA)} か 左半分を長押し`, `${keyName(s.keyB)} か 右半分を長押し`];
    const tip = !save.tipDone && !firstHit ? '長押しで溜める。離すと出る。お尻を相手に向けて!' : null;
    return {
      labels: match.mode === 'solo' ? ['あなた', 'CPU'] : ['ひとりめ', 'ふたりめ'],
      score: match.score, winsNeed: match.need, rankText: match.rankText, hints, tip, koF: sim.phase === 'end' ? koF : undefined,
    };
  }
  function stepBout() {
    const inputs = [held(0), brain ? AI.think(sim, 1, brain) : held(1)];
    Sim.step(sim, inputs);
    onEvents();
    Render.tick(sim);
    if (sim.phase === 'end' && sim.stop === 0) {
      koF++;
      if (koF === 14 && !spoke) {
        spoke = true;
        Snd.play(sim.result.winner < 0 ? 'v_torinaoshi' : 'v_' + sim.result.kimarite, { vol: 0.9 });
      }
      const any = held(0) || (match.mode === '2p' && held(1));
      const skip = koF >= c.KO_SKIP_AFTER_F && any && !prevHeld;
      prevHeld = any;
      if (koF >= c.KO_SHOW_F || skip) nextBout();
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
        const before = save.rank;
        if (match.rankIdx === save.rank && !final) save.rank++;
        if (final) save.finished = true;
        store();
        if (final) return ending();
        return resultSolo(true, before);
      }
      save.losses++;
      store();
      return resultSolo(false);
    }
    return result2p(win0 ? 0 : 1);
  }
  function resultSolo(win, before) {
    const b = BANZUKE[match.rankIdx];
    const m = match;
    const unlocked = win ? SKINS.filter(x => x.unlock === save.rank && before < save.rank) : [];
    const offer = !win && save.losses >= c.CHANKO_AFTER_LOSSES;
    show('result', `<div class="screen" style="justify-content:center"><p class="big">${win ? '勝ち名乗り' : '黒星'}</p>
      <p class="tag">${win ? `番付が ${BANZUKE[save.rank].rank} に上がった。` : `${b.oyakata}に敗れた。番付は下がらない。`}</p>
      ${unlocked.map(u => `<p class="tag" style="color:var(--gold)">屁の音「${u.name}」が使えるようになった(設定で変えられる)</p>`).join('')}
      ${offer ? '<p class="tag dim">親方「ちゃんこを食って、体を大きくしてこい」</p>' : ''}
      <div class="menu">
        <button class="btn" id="next" autofocus>${win ? '次の取組へ' : 'もう一番'}</button>
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
      <p class="tag dim">番付を上げきった。これからは好きな親方と何度でも戦える図鑑埋めの旅へ。</p>
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

  function zukan() {
    const rows = Object.keys(KIMARITE).map(k => {
      const n = save.kim[k] || 0;
      return `<tr><td>${n ? KIMARITE[k].name : '???'}</td><td class="dim">${KIMARITE[k].hint}</td><td>${n ? n + '回' : ''}</td></tr>`;
    }).join('');
    const got = Object.keys(KIMARITE).filter(k => save.kim[k]).length;
    const skins = SKINS.map(x => `<tr><td>${save.rank >= x.unlock ? x.name : '???'}</td><td class="dim">${x.unlock ? BANZUKE[x.unlock].rank + 'まで上がると使える' : '最初から使える'}</td><td></td></tr>`).join('');
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
    const skinOpts = SKINS.filter(x => save.rank >= x.unlock).map(x => `<option value="${x.id}" ${save.skin === x.id ? 'selected' : ''}>${x.name}</option>`).join('');
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
      paused = true;
      show('pause', `<div class="screen" style="justify-content:center"><h2>一時停止</h2><div class="menu">
        <button class="btn" id="res" autofocus>つづける</button>
        <button class="btn" id="st">設定</button>
        <button class="btn" id="quit">やめてタイトルへ</button></div></div>`, resume);
      on('#res', resume); on('#st', () => settings(showPause)); on('#quit', () => { paused = false; title(); });
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
      if (screen === 'bout' && !paused && sim) stepBout();
    }
    if (sim && match && (screen === 'bout' || screen === 'pause')) Render.draw(sim, view());
    else Render.draw(null);
    requestAnimationFrame(frame);
  }

  Render.init(canvas, save.settings);
  Render.reset();
  applySettings();
  title();
  requestAnimationFrame(frame);

  // 確認用
  window.__hz = { get sim() { return sim; }, get screen() { return screen; }, get save() { return save; }, get match() { return match; } };
})();
