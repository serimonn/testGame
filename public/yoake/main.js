// 画面の流れ、入力、カメラ、保存。夜の中身は sim.js が決める。
(function () {
  const C = CFG, T = C.T;
  const $ = q => document.querySelector(q);
  const $cv = $('#game'), $ui = $('#ui'), $guide = $('#guide'), $top = $('#top'), $bar = $('#bar');
  const $tools = $('#tools'), $acts = $('#acts');

  // ---------- 保存 ----------
  const SAVE_KEY = 'yoake-ichi-v3';
  function load() { try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); return s && s.v === 3 ? s : null; } catch (e) { return null; } }
  function saveGame() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(town)); } catch (e) {} }

  Render.init($cv);

  // ---------- 状態 ----------
  let town = null, night = null, scene = 'title', tool = 'road', speed = 1, paused = false;
  let dusk = 0, duskTo = 0, hover = null, t = 0, guideT = 0, told = {}, sum = null;
  const cam = { x: 0, y: 0, z: 2 };
  const TOOLS = [
    { k: 'look', name: '見る', ic: '✋' },
    { k: 'road', name: '道' },
    { k: 'lantern', name: '提灯', spr: SPR.lantern },
    { k: 'koyatai', name: '小屋台', spr: SPR.koyatai, sep: true },
    { k: 'yatai', name: '屋台', spr: SPR.yatai },
    { k: 'oodana', name: '大店', spr: SPR.oodana },
    { k: 'nagaya', name: '長屋', spr: SPR.nagaya, sep: true },
    { k: 'chaya', name: '茶屋', spr: SPR.chayaB },
    { k: 'shibai', name: '芝居小屋', spr: SPR.shibai },
    { k: 'taiko', name: '太鼓櫓', spr: SPR.taiko },
    { k: 'yashiro', name: 'お社', spr: SPR.yashiro },
    { k: 'bansho', name: '番所', spr: SPR.bansho },
    { k: 'joya', name: '常夜灯', spr: SPR.joya },
    { k: 'land', name: '土地', ic: '⛰', sep: true },
    { k: 'demolish', name: '取り壊し', ic: '⛏' },
  ];
  const icon = { road: Render.roadIcon() };
  for (const tl of TOOLS) if (tl.spr) icon[tl.k] = SPR.url(tl.spr, 2);
  const HELP = {
    look: '見る:地図を動かすだけ。置き間違いを防ぐ',
    road: '道:人が歩き、火を運ぶ。ドラッグでまとめて敷ける', lantern: '提灯:道の近くに置ける。隣は明るく、2マス先は薄暗い',
    koyatai: '小屋台:単価¥10。働き手1人', yatai: '屋台:単価¥30。働き手2人', oodana: '大店:単価¥100。働き手4人',
    land: '土地:藪の区画を買って開く。門から遠いほど高い', demolish: '取り壊し:半分の銭が戻る。ドラッグでまとめて',
  };
  const WHY = { land: '藪の中', money: '銭が足りない', used: 'ふさがっている', fire: '火の通った道から遠い', out: '' };
  const priceOf = k => k === 'land' ? 0 : C.PRICE[k] || 0;

  function show(html, cls) {
    $ui.innerHTML = html ? `<div class="${cls || 'screen'}">${html}</div>` : '';
    $ui.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation(); Snd.unlock(); Snd.play('btn'); go(b.dataset.go, b.dataset);
    }));
  }
  function guide(msg, sec) { $guide.textContent = msg; $guide.classList.toggle('hidden', !msg); guideT = sec ? sec * 60 : 0; }
  function tell(key, msg, sec) { if (told[key]) return; told[key] = true; guide(msg, sec || 5); }

  function go(where) {
    switch (where) {
      case 'title': return title();
      case 'new': town = Sim.newTown(); told = {}; prep(); return homeCam();
      case 'cont': town = load(); told = { sale: 1, yokai: 1, dim: 1 }; if (!town) return title(); prep(); return homeCam();
      case 'help': return help();
      case 'start': return startNight();
      case 'oil': if (!night.buyOil()) Snd.play('nope'); drain(); updateBar(); return;
      case 'speed': speed = speed === 1 ? 2 : 1; updateBar(); return;
      case 'pause': paused = true; return pauseMenu();
      case 'resume': paused = false; show(''); return;
      case 'prep': return prep();
      case 'home': return homeCam();
    }
  }

  // ---------- カメラ ----------
  function viewSize() { const r = $cv.getBoundingClientRect(), d = devicePixelRatio || 1; return { w: r.width * d, h: r.height * d, d }; }
  function zoomLimits() {
    const v = viewSize();
    return { min: Math.min(v.w / Render.WW, v.h / Render.WH), max: v.h / (C.VIEW_ROWS_MIN * T) };
  }
  function clampCam() {
    const v = viewSize(), L = zoomLimits();
    cam.z = Math.max(L.min, Math.min(L.max, cam.z));
    const vw = v.w / cam.z, vh = v.h / cam.z, m = T * 2;
    cam.x = vw >= Render.WW ? (Render.WW - vw) / 2 : Math.max(-m, Math.min(Render.WW - vw + m, cam.x));
    cam.y = vh >= Render.WH ? (Render.WH - vh) / 2 : Math.max(-m, Math.min(Render.WH - vh + m, cam.y));
  }
  function homeCam() {
    const v = viewSize();
    cam.z = v.h / (C.VIEW_ROWS * T);
    cam.x = -T; cam.y = (C.GATE.r + 0.5) * T - v.h / cam.z / 2;
    clampCam();
  }
  function zoomAt(sx, sy, k) {
    const wx = cam.x + sx / cam.z, wy = cam.y + sy / cam.z;
    cam.z *= k; clampCam();
    cam.x = wx - sx / cam.z; cam.y = wy - sy / cam.z; clampCam();
  }
  addEventListener('resize', () => clampCam());

  // ---------- タイトル ----------
  function title() {
    scene = 'title'; town = Sim.newTown(); night = new Sim.Night(town); duskTo = 0.6; homeCam();
    $top.classList.add('hidden'); $bar.classList.add('hidden'); guide('');
    const sv = load();
    show(`
      <h1 class="logo">よあけ市</h1>
      <p class="tag">宵は人の市、夜更けは妖怪の市。</p>
      <div class="menu">
        ${sv ? `<button class="btn" data-go="cont">つづきから<small>第${sv.night}夜から</small></button>` : ''}
        <button class="btn" data-go="new">${sv ? 'はじめから' : 'はじめる'}<small>${sv ? '前の街は消えます' : '門から最初の道を敷く'}</small></button>
        <button class="btn sub" data-go="help">あそびかた</button>
      </div>`);
  }
  function help() {
    show(`<h2>あそびかた</h2><div class="help">
      <p><b>準備:</b>門から道を敷き、道の近くに提灯、道に面して店を置く。道は人が歩く所で、提灯に火を運ぶ。</p>
      <p><b>働き手:</b>店は働き手がいないと開かない。働き手は門から2人通ってくるほか、長屋に3人ずつ住み、道でつながった近い店に就く。働き手の数だけ同時に客をさばける。</p>
      <p><b>客:</b>人は門から入り、名所(茶屋、芝居小屋)や道の奥を目指して歩き、途中の店で一晩に${C.WALLET}回まで買う。</p>
      <p><b>店の札:</b>提灯の札は明るい店で、人だけが買う。目玉の札(鬼火つき)は薄暗い店で、人も妖怪も買う。×は暗くて閉店。人の形に斜線は人手なし。</p>
      <p><b>夜:</b>人に売ると賑わいが溜まり、満タンで妖怪が勝手に来る。妖怪は薄暗い店でだけ、単価の${C.YOKAI_PAY}倍で買い、何をするかは気まぐれ。</p>
      <p><b>夜の操作:</b>提灯をタップで火を細くする・戻す(細くすると隣が薄暗くなる)。喰っている妖怪、居座る妖怪はタップで追い払う。喰われた提灯はタップで点け直す(¥${C.RELIGHT_COST})。</p>
      <p><b>地図:</b>ドラッグで動かす。ピンチかホイールで拡大縮小。</p>
      <p>キー:Enter 夜市を開く、O 油、F 早送り、Space 一時停止、矢印 地図を動かす</p>
    </div><button class="btn" data-go="title">もどる</button>`);
  }

  // ---------- 準備(夕暮れと朝) ----------
  function prep() {
    scene = 'prep'; paused = false; speed = 1; show('');
    night = new Sim.Night(town); duskTo = 0.5;
    $top.classList.remove('hidden'); $bar.classList.remove('hidden');
    saveGame(); buildBar(); updateBar(); prepGuide();
  }
  function refresh() { night = new Sim.Night(town); updateBar(); prepGuide(); }
  function prepGuide() {
    if (scene !== 'prep') return;
    if (town.history.length) { if (!guideT) guide(''); return; }
    const roads = town.roads.reduce((a, b) => a + b, 0);
    const has = k => town.objs.some(o => o.type === k);
    if (roads < 4) guide('① 門から道を敷こう(ドラッグでまとめて敷ける)');
    else if (!has('lantern')) guide('② 道の近く(黄色い点)に提灯を置こう');
    else if (!town.objs.some(o => Sim.isStall(o.type))) guide('③ 道に面して小屋台を置こう。門の働き手2人が店番をする');
    else guide('準備ができたら「夜市を開く」');
  }
  function startNight() {
    if (scene !== 'prep') return;
    if (!town.objs.some(o => Sim.isStall(o.type))) { guide('店がないと夜市を開けない', 3); Snd.play('nope'); return; }
    scene = 'night'; hover = null; night = new Sim.Night(town); night.start(); duskTo = 1; drain();
    guide(town.history.length ? '' : '夜市が開いた。人に売ると賑わいが溜まる', 5);
    buildBar(); updateBar();
  }

  // ---------- 夜明け ----------
  function dawn() {
    scene = 'dawn'; duskTo = 0; guide('');
    sum = Sim.dawn(town, night);
    Snd.play('dawn'); buildBar(); updateBar(); saveGame();
    setTimeout(dawnPanel, 700);
  }
  function dawnPanel() {
    if (scene !== 'dawn') return;
    const s = sum, W = C.WHIMS;
    const whims = Object.keys(s.whims).filter(k => W[k].label).map(k => `${W[k].label}×${s.whims[k]}`).join('、');
    const goal = s.night === C.GOAL_NIGHT ? `<div class="stat"><span>${C.GOAL_NIGHT}夜の稼ぎ <b>¥${town.total}</b></span><span>開いた土地 <b>${town.land.filter(x => x).length}</b>区画</span><span>店 <b>${town.objs.filter(o => Sim.isStall(o.type)).length}</b>軒</span></div>` : '';
    show(`
      <h3>第${s.night}夜が明けた${s.night === C.GOAL_NIGHT ? ' ― 30夜の市' : ''}</h3>
      <div class="stat">
        <span>客 ${s.visitors}人</span>
        <span>人に ${s.hn}回 <b data-count="${s.human}">¥0</b></span>
        <span>妖怪 ${s.yokaiCame}匹・${s.yn}回 <b data-count="${s.yokai}">¥0</b></span>
        ${s.leafLost ? `<span>葉っぱに戻った <b style="color:#9be07a">-¥${s.leafLost}</b></span>` : ''}
        <span>喰われた提灯 <b>${s.eaten}</b></span><span>追い払い <b>${s.shoo}</b></span>
      </div>
      ${whims ? `<div class="stat" style="font-size:12px">妖怪の気まぐれ:${whims}</div>` : ''}
      ${goal}
      <div class="row"><button class="btn" data-go="prep">朝の普請へ<small>稼ぎで街を広げる</small></button></div>`, 'dock');
    $ui.querySelectorAll('[data-count]').forEach(el => {
      const to = +el.dataset.count, t0 = performance.now();
      const f = () => { const k = Math.min(1, (performance.now() - t0) / 600); el.textContent = '¥' + Math.round(to * k); if (k < 1) requestAnimationFrame(f); };
      f();
    });
  }
  function pauseMenu() {
    show(`<h2>一時停止</h2><div class="menu">
      <button class="btn" data-go="resume">つづける</button>
      <button class="btn sub" data-go="title">タイトルへ<small>この夜の分は保存されない</small></button></div>`);
  }

  // ---------- 下の帯 ----------
  function buildBar() {
    if (scene === 'prep') {
      $tools.innerHTML = TOOLS.map(tl => {
        const p = priceOf(tl.k);
        const ic = tl.spr || tl.k === 'road' ? `<img src="${icon[tl.k]}" alt="">` : `<span class="ic">${tl.ic}</span>`;
        return `<button class="tool${tl.sep ? ' sep' : ''}" data-tool="${tl.k}" title="${HELP[tl.k] || (BUILDS[tl.k] ? BUILDS[tl.k].name + ':' + BUILDS[tl.k].desc : '')}">${ic}${tl.name}${p ? `<span class="p">¥${p}</span>` : ''}</button>`;
      }).join('');
      $tools.querySelectorAll('[data-tool]').forEach(b => b.addEventListener('click', () => { Snd.unlock(); Snd.play('btn'); setTool(b.dataset.tool); }));
    } else $tools.innerHTML = scene === 'night' ? '<div class="help nighthelp" style="font-size:12px;align-self:center;margin:0 6px">提灯タップ:火を細く・戻す/妖怪タップ:追い払う/ドラッグ:地図を動かす</div>' : '';
    let acts = '<button class="act" data-a="home" title="門へ戻る">門<small>⌂</small></button>';
    if (scene === 'prep') acts += `<button class="act go" data-a="start">夜市を開く<small style="color:#fff">第${town.night}夜</small></button>`;
    else if (scene === 'night') acts += `<button class="act" data-a="oil">油を買う<small>¥${C.OIL_BUY_COST}で+${C.OIL_BUY}</small></button><button class="act" data-a="speed">早送り<small>F</small></button><button class="act" data-a="pause">Ⅱ<small>Space</small></button>`;
    $acts.innerHTML = acts;
    $acts.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => { Snd.unlock(); Snd.play('btn'); go(b.dataset.a); }));
  }
  function setTool(k) {
    tool = k; updateBar();
    const h = HELP[k] || (BUILDS[k] ? `${BUILDS[k].name}:${BUILDS[k].desc}` : '');
    if (town.history.length) guide(h, 4); else prepGuide();
  }
  function updateBar() {
    if (!night || !town) return;
    $('#hNight').textContent = `第${scene === 'dawn' ? town.night - 1 : town.night}夜`;
    $('#hMoney').textContent = '¥' + town.money;
    const st = $('#hStaff');
    st.textContent = `働き手 ${night.idle}/${night.workers}`;
    st.classList.toggle('short', night.needStaff > night.workers);
    st.title = `働き手:空いている人 ${night.idle} / 全員 ${night.workers}。店が求める人数 ${night.needStaff}`;
    const oil = $('#hOil'); oil.style.setProperty('--v', (night.oil / night.oilMax * 100) + '%'); oil.classList.toggle('low', scene === 'night' && night.oil < night.oilMax * 0.2);
    $('#hGauge').style.setProperty('--v', (night.gauge / night.gaugeMax() * 100) + '%');
    $('#hTime').style.setProperty('--v', Math.min(100, night.f / C.NIGHT_F * 100) + '%');
    $tools.querySelectorAll('[data-tool]').forEach(b => {
      const k = b.dataset.tool;
      b.classList.toggle('on', k === tool); b.classList.toggle('empty', priceOf(k) > town.money);
    });
    const sp = $acts.querySelector('[data-a="speed"]'); if (sp) sp.classList.toggle('on', speed === 2);
  }

  // ---------- 入力 ----------
  // 画面の点 → 地図の座標
  function toWorld(e) {
    const r = $cv.getBoundingClientRect(), d = devicePixelRatio || 1;
    const sx = (e.clientX - r.left) * d, sy = (e.clientY - r.top) * d;
    return { sx, sy, x: cam.x + sx / cam.z, y: cam.y + sy / cam.z };
  }
  function hoverAt(p) {
    if (scene !== 'prep' || tool === 'look') return null;
    const c = Math.floor(p.x / T), r = Math.floor(p.y / T);
    if (tool === 'land') return { c, r, tool };
    if (tool === 'demolish') { const ok = !!(town.objs.find(o => o.c === c && o.r === r) || (Sim.inMap(c, r) && town.roads[Sim.idx(c, r)] && !(c === C.GATE.c && r === C.GATE.r))); return { c, r, tool, ok }; }
    const why = Sim.canBuild(town, tool, c, r, night);
    const h = { c, r, tool, ok: !why, why: WHY[why] };
    if (!why && Sim.isStall(tool)) h.mark = Sim.previewMark(night, c, r);
    return h;
  }
  function applyAt(c, r, quiet) {
    if (tool === 'look') return;
    if (tool === 'land') { if (Sim.buyLand(town, c, r)) { Snd.play('land'); refresh(); } else Snd.play('nope'); return; }
    if (tool === 'demolish') {
      if (Sim.demolish(town, c, r)) { Snd.play('pickup'); Render.burst({ t: 'pickup', x: c * T + 8, y: r * T + 8 }); refresh(); }
      return;
    }
    if (Sim.build(town, tool, c, r, night)) {
      Snd.play(tool === 'road' ? 'road' : Sim.isBuild(tool) ? 'build' : 'place');
      if (tool !== 'road') Render.burst({ t: 'place', x: c * T + 8, y: r * T + 8 });
      refresh();
    } else if (!quiet) Snd.play('nope');
  }
  // ポインターを追う。1本:塗る(道、取り壊し)か、動かす・タップ。2本:つまんで拡大縮小と移動
  const pts = new Map();
  let gest = null;
  const paintTool = () => scene === 'prep' && (tool === 'road' || tool === 'demolish');
  $cv.addEventListener('pointerdown', e => {
    Snd.unlock();
    $cv.setPointerCapture(e.pointerId);
    const p = toWorld(e);
    pts.set(e.pointerId, p);
    if (pts.size === 2) {
      const [a, b] = [...pts.values()];
      gest = { kind: 'pinch', d: Math.hypot(a.sx - b.sx, a.sy - b.sy), mx: (a.sx + b.sx) / 2, my: (a.sy + b.sy) / 2 };
      return;
    }
    if (pts.size > 2) return;
    const c = Math.floor(p.x / T), r = Math.floor(p.y / T);
    const panBtn = e.pointerType === 'mouse' && e.button !== 0;
    if (!panBtn && paintTool()) { gest = { kind: 'paint', c, r }; applyAt(c, r); hover = hoverAt(p); return; }
    gest = { kind: 'tap', sx: p.sx, sy: p.sy, moved: false, pan: panBtn };
  });
  $cv.addEventListener('pointermove', e => {
    const p = toWorld(e);
    const old = pts.get(e.pointerId);
    if (old) pts.set(e.pointerId, p);
    if (gest && gest.kind === 'pinch' && pts.size >= 2) {
      const [a, b] = [...pts.values()];
      const d = Math.hypot(a.sx - b.sx, a.sy - b.sy), mx = (a.sx + b.sx) / 2, my = (a.sy + b.sy) / 2;
      cam.x -= (mx - gest.mx) / cam.z; cam.y -= (my - gest.my) / cam.z;
      if (gest.d > 10) zoomAt(mx, my, d / gest.d);
      clampCam();
      gest.d = d; gest.mx = mx; gest.my = my;
      return;
    }
    if (gest && gest.kind === 'paint' && old) {
      const c = Math.floor(p.x / T), r = Math.floor(p.y / T);
      // 速く動かしても間のマスを飛ばさない
      while (c !== gest.c || r !== gest.r) {
        if (Math.abs(c - gest.c) >= Math.abs(r - gest.r)) gest.c += Math.sign(c - gest.c); else gest.r += Math.sign(r - gest.r);
        applyAt(gest.c, gest.r, true);
      }
    }
    if (gest && gest.kind === 'tap' && old) {
      const dx = p.sx - old.sx, dy = p.sy - old.sy;
      if (!gest.moved && Math.hypot(p.sx - gest.sx, p.sy - gest.sy) > 10 * (devicePixelRatio || 1)) gest.moved = true;
      if (gest.moved) { cam.x -= dx / cam.z; cam.y -= dy / cam.z; clampCam(); }
    }
    if (e.pointerType === 'mouse') hover = hoverAt(p);
  });
  const end = e => {
    const p = pts.get(e.pointerId);
    pts.delete(e.pointerId);
    if (!gest) return;
    if (gest.kind === 'pinch') { if (!pts.size) gest = null; return; }
    if (gest.kind === 'tap' && !gest.moved && !gest.pan && p && e.type === 'pointerup') {
      const c = Math.floor(p.x / T), r = Math.floor(p.y / T);
      if (scene === 'prep') { applyAt(c, r); hover = e.pointerType === 'mouse' ? hoverAt(p) : null; }
      else if (scene === 'night' && !paused && night.poke(p.x, p.y)) { drain(); updateBar(); }
    }
    gest = null;
  };
  $cv.addEventListener('pointerup', end);
  $cv.addEventListener('pointercancel', end);
  $cv.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') hover = null; });
  $cv.addEventListener('contextmenu', e => e.preventDefault());
  $cv.addEventListener('wheel', e => { e.preventDefault(); const p = toWorld(e); zoomAt(p.sx, p.sy, e.deltaY < 0 ? 1.15 : 1 / 1.15); }, { passive: false });
  const keys = new Set();
  addEventListener('keydown', e => {
    keys.add(e.key);
    if (e.key === 'Enter' && scene === 'prep') { Snd.unlock(); startNight(); }
    if (e.key === 'Escape' && scene === 'prep') setTool('look');
    if (scene === 'night') {
      if (e.key === ' ') { e.preventDefault(); paused ? go('resume') : go('pause'); }
      if (e.key === 'f' || e.key === 'F') go('speed');
      if (e.key === 'o' || e.key === 'O') go('oil');
    }
  });
  addEventListener('keyup', e => keys.delete(e.key));
  function keyPan() {
    const s = 6 / cam.z * (devicePixelRatio || 1);
    if (keys.has('ArrowLeft') || keys.has('a')) cam.x -= s * 2;
    if (keys.has('ArrowRight') || keys.has('d')) cam.x += s * 2;
    if (keys.has('ArrowUp') || keys.has('w')) cam.y -= s * 2;
    if (keys.has('ArrowDown') || keys.has('s')) cam.y += s * 2;
    if (keys.size) clampCam();
  }

  // 起きたことを絵と音と案内へ
  function drain() {
    for (const ev of night.events) {
      Render.burst(ev);
      Snd.play(ev.t);
      if (ev.t === 'coin') tell('sale', '人に売ると上の「賑わい」が溜まる。満タンで妖怪が来る', 5);
      if (ev.t === 'yokai') {
        const dim = night.objs.some(o => o.kind === 'stall' && o.cap > 0 && night.lvl(o.c, o.r) === 1);
        if (!dim) tell('dim', '妖怪は薄暗い店(目玉の札)でしか買わない。提灯をタップで火を細くすると、隣が薄暗くなる', 7);
        else tell('yokai', '妖怪が来た。何をするかは気まぐれ', 4);
      }
      if (ev.t === 'eatstart') {
        tell('eat', '妖怪が提灯を喰っている!タップで追い払える', 6);
        if (speed === 2) { speed = 1; updateBar(); }
      }
      if (ev.t === 'eaten') tell('eaten', '喰われた提灯はタップで点け直せる(¥' + C.RELIGHT_COST + ')', 6);
      if (ev.t === 'whim' && ev.k === 'leaf') tell('leaf', '葉っぱの銭は、朝になると消えてしまう', 5);
      if (ev.t === 'whim' && ev.k === 'sit') tell('sit', '居座る妖怪がいる店は閉まる。タップで追い払える', 5);
      if (ev.t === 'dry') tell('dry', '油が切れて提灯が細くなった。「油を買う」か、火を細くして節約', 6);
      if (ev.t === 'noyokai') tell('noyokai', '妖怪の来られる暗がりがない。土地を開くか、暗い所を残そう', 6);
    }
    night.events.length = 0;
  }

  // ---------- 回す ----------
  let last = performance.now(), acc = 0, perf = { n: 0, ms: 0 };
  function frame(now) {
    acc += Math.min(0.1, (now - last) / 1000); last = now;
    const t0 = performance.now();
    while (acc >= 1 / 60) {
      acc -= 1 / 60; t++;
      if (scene === 'night' && !paused) {
        for (let i = 0; i < speed; i++) night.step();
        drain();
        if (night.done) { dawn(); break; }
      }
      dusk += (duskTo - dusk) * 0.03;
      if (guideT > 0 && --guideT === 0) { guide(''); prepGuide(); }
      keyPan();
    }
    if (scene === 'night' && t % 10 === 0) updateBar();
    Snd.tick(scene === 'night' && !paused, speed);
    Render.draw({ night, town, dusk, hover: paused ? null : hover, t, prep: scene === 'prep', tool, cam });
    perf.n++; perf.ms += performance.now() - t0;
    requestAnimationFrame(frame);
  }
  title();
  requestAnimationFrame(frame);
  window.DBG = { get night() { return night; }, get town() { return town; }, get scene() { return scene; }, go, setTool, cam, perf, homeCam };
})();
