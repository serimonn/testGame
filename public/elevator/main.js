// 画面の流れ、入力、保存。勤務の中身は sim.js が決める。
(function () {
  const C = CFG;
  const $ = q => document.querySelector(q);
  const $ui = $('#ui'), $cv = $('#game');
  const $open = $('#btnOpen'), $close = $('#btnClose'), $pause = $('#pauseBtn'), $pad = $('#pad');

  // ---------- 保存 ----------
  const SAVE_KEY = 'elevator-zombie-v1';
  const save = Object.assign({
    bestFloor: 1, cleared: false, bestStars: 0, bestCarried: 0, seen: {},
    trainee: false, swap: false, vib: true, shake: 1, vol: { bgm: 0.6, se: 0.9, voice: 0.9 },
  }, load());
  function load() { try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch (e) { return {}; } }
  function saveGame() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} }
  window.SAVE = save; window.saveGame = saveGame;
  Object.assign(Snd.vol, save.vol);

  Render.init($cv);
  addEventListener('resize', () => Render.resize());

  // 客の絵を小さな画像にする(説明と図鑑で使う)
  const pics = {};
  function pic(kind) {
    if (pics[kind]) return pics[kind];
    const c = document.createElement('canvas'); c.width = 160; c.height = 200;
    const x = c.getContext('2d');
    Render.drawPerson(x, kind, 80, 190, 1.05, { face: KINDS[kind].zombie ? 'zombie' : 'calm', t: 0, id: 0, facing: 1 });
    return (pics[kind] = c.toDataURL());
  }

  // ---------- 状態 ----------
  let sim = null, paused = false, scene = 'title', pending = { open: false, close: false, skip: false };

  function show(html, cls) {
    $ui.innerHTML = html ? `<div class="screen ${cls || ''}">${html}</div>` : '';
    $ui.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', e => { Snd.unlock(); Snd.play('btn', { vol: 0.6 }); go(b.dataset.go, b.dataset); e.stopPropagation(); }));
  }
  function setPad(on) { $pad.classList.toggle('hidden', !on); $pause.classList.toggle('hidden', !on); $pad.classList.toggle('swap', !!save.swap); }

  function go(where, data) {
    switch (where) {
      case 'title': return title();
      case 'start': return startRun(+(data.floor || 1));
      case 'zukan': return zukan();
      case 'settings': return settings(data.back || 'title');
      case 'resume': paused = false; show(''); return;
      case 'pause': return pauseMenu();
      case 'begin': paused = false; show(''); return;
      case 'trainee': save.trainee = true; saveGame(); if (sim) sim.trainee = true; show(''); return;
    }
  }

  function title() {
    scene = 'title'; sim = null; setPad(false); Snd.syncLoops(false);
    const cont = save.bestFloor > 1 && !save.cleared ? `<button class="btn" data-go="start" data-floor="${save.bestFloor}">${save.bestFloor}階から<small>前に着いた階から始める</small></button>` : '';
    show(`
      <div class="top"><div class="logo"><span class="s">エレベーター係の</span><span class="b">地獄</span></div>
      <p class="tag">人間は乗せろ。ゾンビは入れるな。</p></div>
      <div class="menu">
        <button class="btn big" data-go="start" data-floor="1">勤務開始<small>1階から社長室(10階)をめざす</small></button>
        ${cont}
        <button class="btn" data-go="zukan">見分け図鑑<small>人間とゾンビの見分け方</small></button>
        <button class="btn" data-go="settings">設定<small>音量、振動、ボタンの左右、研修中</small></button>
      </div>
      ${save.cleared ? `<p class="dim">最高記録:★${save.bestStars} / ${save.bestCarried}人</p>` : ''}
      <p class="credit">音声:VOICEVOX:No.7、VOICEVOX:玄野武宏</p>`, 'title');
  }

  function zukan() {
    scene = 'menu'; setPad(false);
    const rows = Object.keys(KINDS).map(k => {
      const it = KINDS[k], seen = save.seen[k];
      return `<div class="kd ${it.zombie ? 'z' : 'h'} ${seen ? '' : 'no'}">
        <img src="${pic(k)}" alt="" style="${seen ? '' : 'filter:brightness(0)'}">
        <div><b>${seen ? it.name : '???'}</b><span class="tagz">${it.zombie ? 'ゾンビ → 閉' : '人間 → 開'}</span><small>${seen ? it.tell : 'まだ会っていない'}</small></div></div>`;
    }).join('');
    show(`<h2>見分け図鑑</h2><div class="kds">${rows}</div><button class="btn back" data-go="title">もどる</button>`);
  }

  function settings(back) {
    if (back !== 'pause') scene = 'menu';
    const sl = (k, label) => `<label class="set">${label}<input type="range" min="0" max="1" step="0.1" value="${save.vol[k]}" data-vol="${k}"></label>`;
    const ck = (k, label, sub) => `<label class="set"><span>${label}<small>${sub}</small></span><input type="checkbox" data-ck="${k}" ${save[k] ? 'checked' : ''}></label>`;
    show(`<h2>設定</h2>
      <div class="sets">
        ${sl('bgm', '音楽と環境音')}${sl('se', '効果音')}${sl('voice', '声')}
        <label class="set">画面の揺れ<input type="range" min="0" max="1.5" step="0.25" value="${save.shake}" data-shake></label>
        ${ck('vib', '振動', 'まちがえたときなどにスマホを震わせる')}
        ${ck('swap', 'ボタンの左右を入れ替える', '左に閉、右に開')}
        ${ck('trainee', '研修中', '客の足がゆっくりになり、扉の前で長く待ってくれる')}
      </div>
      <button class="btn back" data-go="${back}">もどる</button>`);
    $ui.querySelectorAll('[data-vol]').forEach(el => el.addEventListener('input', () => { save.vol[el.dataset.vol] = +el.value; Snd.vol[el.dataset.vol] = +el.value; Snd.syncLoops(); saveGame(); }));
    const shk = $ui.querySelector('[data-shake]');
    shk.addEventListener('input', () => { save.shake = +shk.value; saveGame(); });
    $ui.querySelectorAll('[data-ck]').forEach(el => el.addEventListener('change', () => {
      save[el.dataset.ck] = el.checked; saveGame();
      if (el.dataset.ck === 'trainee' && sim) sim.trainee = el.checked;
      if (el.dataset.ck === 'swap') $pad.classList.toggle('swap', el.checked);
      if (el.dataset.ck === 'vib' && el.checked) vibrate(30);
    }));
  }

  function pauseMenu() {
    if (scene !== 'play' || !sim || sim.phase === 'clear') return;
    paused = true;
    show(`<h2>一時停止</h2><div class="menu">
      <button class="btn big" data-go="resume">続ける</button>
      <button class="btn" data-go="start" data-floor="1">1階からやり直す</button>
      <button class="btn" data-go="settings" data-back="pause">設定</button>
      <button class="btn" data-go="title">タイトルへ</button></div>`, 'dimbg');
  }

  function startRun(floor) {
    scene = 'play';
    sim = Sim.createRun(floor, (Date.now() ^ (Math.random() * 1e9)) | 0, { trainee: save.trainee });
    Render.reset();
    setPad(true);
    Snd.unlock(); Snd.syncLoops(true);
    handleEvents();
    // ルールは1つだけ。絵で見せて、タップで始める
    paused = true;
    show(`<button class="card rule1" data-go="begin">
      <div class="pair"><div class="side h"><img src="${pic('salary')}" alt=""><b>人間</b><span class="key ko">開</span><small>で乗せる</small></div>
      <div class="side z"><img src="${pic('zombie')}" alt=""><b>ゾンビ</b><span class="key kc">閉</span><small>で締め出す</small></div></div>
      <p class="sub">まちがいが3回でゲームオーバー。10階の社長室まで運べばクリア</p>
      <p class="tapgo">タップで勤務開始</p></button>`, 'dimbg');
  }

  function result() {
    scene = 'result'; setPad(false);
    const r = sim.result;
    save.cleared = true;
    save.bestStars = Math.max(save.bestStars, r.stars);
    save.bestCarried = Math.max(save.bestCarried, r.carried);
    saveGame();
    Snd.play('result');
    const title = r.miss === 0 ? 'ゾンビ絶対通さない係' : r.miss <= 2 ? '頼れる係員' : r.shut >= 10 ? '門番見習い' : '新人係';
    show(`<div class="report">
      <h2>社長室に到着!</h2>
      <div class="stars">${'★'.repeat(r.stars)}${'☆'.repeat(3 - r.stars)}</div>
      <table>
        <tr><th>乗せた人間</th><td>${r.carried}人</td></tr>
        <tr><th>締め出したゾンビ</th><td>${r.shut}体</td></tr>
        <tr><th>まちがい</th><td class="${r.miss ? 'bad' : ''}">${r.miss}回</td></tr>
        <tr><th>最高連続</th><td>${r.bestCombo}回</td></tr>
      </table>
      <p class="title2">称号:<b>${title}</b></p>
      <p class="dim2">${r.stars < 3 ? 'まちがい0回で★3' : '完璧な勤務でした'}</p>
      </div>
      <div class="menu">
        <button class="btn big" data-go="start" data-floor="1">もう一度</button>
        <button class="btn" data-go="title">タイトルへ</button>
      </div>`, 'dimbg');
  }

  // ---------- イベント ----------
  function vibrate(ms) { if (save.vib && navigator.vibrate) try { navigator.vibrate(ms); } catch (e) {} }
  function handleEvents() {
    for (const e of sim.events) {
      Render.onEvent(e, sim);
      switch (e.t) {
        case 'arrive':
          if (!e.retry) Snd.play('ding');
          if (sim.floor > save.bestFloor && sim.floor < TOP_FLOOR) { save.bestFloor = sim.floor; saveGame(); }
          break;
        case 'door': Snd.play(e.open ? 'door_open' : 'door_close', { vol: 0.8 }); break;
        case 'decide': Snd.play('btn', { vol: 0.6 }); break;
        case 'ok': if (e.why === 'carry') Snd.play('coin', { vol: 0.6 }); else Snd.play('kami', { vol: 0.8 }); break;
        case 'bonk': Snd.play('bonk'); if (e.zombie) Snd.play('groan', { vol: 0.7, rate: 1.3 }); vibrate(30); break;
        case 'ng': Snd.play('coin_bad'); vibrate([80, 40, 80]); if (e.why === 'shutHuman' || e.why === 'timeout') Snd.play('v_angry', { vol: 0.8 }); break;
        case 'rampage': Snd.play('scream'); Snd.play('groan'); break;
        case 'force': Snd.play('pinch'); break;
        case 'spawn': if (KINDS[e.kind].zombie && Math.random() < 0.5) Snd.play('groan', { vol: 0.35, rate: 0.9 + Math.random() * 0.3 }); break;
        case 'combo': Snd.play('slip'); break;
        case 'depart': Snd.play('v_up', { vol: 0.5 }); break;
        case 'over': Snd.play('fired'); vibrate([100, 50, 200]); break;
        case 'clear': Snd.play('v_clear'); setTimeout(result, 900); break;
      }
    }
  }

  // ---------- 入力 ----------
  function press(b, el) {
    Snd.unlock();
    if (scene !== 'play' || paused || !sim) return;
    if (sim.phase === 'over') { pending.skip = true; return; }
    pending[b] = true;
    el.classList.add('on'); setTimeout(() => el.classList.remove('on'), 110);
  }
  for (const [el, b] of [[$open, 'open'], [$close, 'close']]) {
    el.addEventListener('pointerdown', e => { e.preventDefault(); press(b, el); });
    el.addEventListener('contextmenu', e => e.preventDefault());
  }
  $cv.addEventListener('pointerdown', () => { Snd.unlock(); if (scene === 'play' && sim && sim.phase === 'over') pending.skip = true; });
  $pause.addEventListener('click', () => { Snd.play('btn', { vol: 0.5 }); pauseMenu(); });
  addEventListener('keydown', e => {
    if (e.repeat) return;
    const k = e.key.toLowerCase();
    if (k === 'escape' || k === 'p') { if (paused && scene === 'play') go('resume'); else pauseMenu(); return; }
    if (scene === 'play' && paused && $ui.querySelector('.rule1') && (k === ' ' || k === 'enter')) { go('begin'); return; }
    const sw = save.swap;
    if (k === 'z' || k === 'arrowleft') press(sw ? 'close' : 'open', sw ? $close : $open);
    else if (k === 'x' || k === 'arrowright') press(sw ? 'open' : 'close', sw ? $open : $close);
    else if (k === ' ' || k === 'enter') { if (sim && sim.phase === 'over') pending.skip = true; }
  });
  document.addEventListener('visibilitychange', () => {
    Snd.setHidden(document.hidden);
    if (document.hidden) pauseMenu();
  });

  // ---------- ループ:処理は固定刻み、描画は毎フレーム ----------
  let last = performance.now(), acc = 0;
  const STEP = 1000 / 60;
  function frame(now) {
    acc += Math.min(100, now - last); last = now;
    while (acc >= STEP) {
      acc -= STEP;
      if (scene === 'play' && sim && !paused && !window.Game.hold) {
        const wasOver = sim.phase === 'over';
        Sim.step(sim, pending);
        pending = { open: false, close: false, skip: false };
        handleEvents();
        // ゲームオーバーが続いたら研修中をすすめる
        if (sim.phase === 'over' && !wasOver && sim.overs >= C.TRAINEE_SUGGEST_OVERS && !save.trainee) {
          show(`<button class="btn sugg" data-go="trainee">研修中にする<small>客がゆっくりになり、長く待ってくれる。設定で戻せる</small></button>`, 'float');
        }
        if (sim.phase !== 'over' && $ui.querySelector('.float')) show('');
      }
    }
    Render.draw(scene === 'play' || scene === 'result' ? sim : null);
    if (scene === 'play' && sim && !paused && sim.phase === 'floor') {
      const g = FLOORS[sim.floor - 1] && FLOORS[sim.floor - 1].guide;
      // 階の一言は、その階の最初の数秒だけ
      if (g && sim.floorF < 300) drawGuide(g, sim.floorF);
    }
    requestAnimationFrame(frame);
  }
  function drawGuide(text, f) {
    const ctx = Render.ctx;
    ctx.save();
    ctx.globalAlpha = f > 270 ? (300 - f) / 30 : 1;
    ctx.font = '900 21px sans-serif';
    const w = Math.min(520, ctx.measureText(text).width + 30);
    ctx.fillStyle = 'rgba(255,246,200,.96)'; ctx.strokeStyle = '#1d1a22'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(270 - w / 2, 100, w, 44, 10); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#1d1a22'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 270, 123, 500);
    ctx.restore();
  }

  // hold は確認用:true の間は勤務を進めない
  window.Game = { get sim() { return sim; }, go, startRun, result, hold: false };
  title();
  requestAnimationFrame(frame);
})();
