// 描画。キャンバスは画面の実寸で持ち、地図(1マス16px)をカメラの倍率で描く。
// 軽量化:地面と闇は絵として取っておき、画面に映る範囲のマスだけを描く。
(function (root) {
  const C = CFG, T = C.T, WW = C.COLS * T, WH = C.ROWS * T;
  let cv, x, ground, bush, roadTile, darkCv, darkX, darkImg, darkVer = -1, darkNight = null;
  const fx = [];
  const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
  const DARK = [0.86, 0.5, 0.1];     // 暗い、薄暗い、明るいの暗さ
  const FONT_JP = '"Hiragino Sans","Yu Gothic","Noto Sans JP",sans-serif';

  function seeded(s) { return () => { s = (s * 16807) % 2147483647; return s / 2147483647; }; }
  function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

  function init(el) {
    cv = el; x = cv.getContext('2d');
    ground = canvas(WW, WH);
    const g = ground.getContext('2d'), R = seeded(7);
    g.fillStyle = '#3a6236'; g.fillRect(0, 0, WW, WH);
    for (let i = 0; i < WW * WH / 64; i++) {
      const px = Math.floor(R() * WW), py = Math.floor(R() * WH), k = R();
      g.fillStyle = k < 0.45 ? '#2f5530' : k < 0.85 ? '#4c7a40' : '#6a9a4a';
      g.fillRect(px, py, 1, k > 0.6 ? 2 : 1);
    }
    for (let i = 0; i < WW * WH / 2200; i++) { g.fillStyle = R() < 0.5 ? '#e8d0e8' : '#f4ecd8'; g.fillRect(Math.floor(R() * WW), Math.floor(R() * WH), 1, 1); }
    bush = canvas(WW, WH);
    const b = bush.getContext('2d'), R3 = seeded(19);
    b.fillStyle = '#1e3320'; b.fillRect(0, 0, WW, WH);
    for (let i = 0; i < WW * WH / 100; i++) {
      const px = Math.floor(R3() * WW), py = Math.floor(R3() * WH), s = 2 + Math.floor(R3() * 4);
      b.fillStyle = R3() < 0.5 ? '#2a4a2a' : '#162818'; b.fillRect(px, py, s, s - 1);
      b.fillStyle = '#3d6338'; b.fillRect(px, py, 1, 1);
    }
    roadTile = canvas(T, T);
    const rt = roadTile.getContext('2d');
    rt.fillStyle = '#6e6458'; rt.fillRect(0, 0, T, T);
    for (const [a, bb, w, h] of [[0, 0, 7, 5], [8, 0, 8, 5], [0, 6, 4, 4], [5, 6, 7, 4], [13, 6, 3, 4], [0, 11, 9, 5], [10, 11, 6, 5]]) {
      rt.fillStyle = '#a2988a'; rt.fillRect(a, bb, w - 1, h - 1);
      rt.fillStyle = '#bdb3a4'; rt.fillRect(a, bb, w - 1, 1);
    }
    darkCv = canvas(Sim.Night.CW, Sim.Night.CH); darkX = darkCv.getContext('2d');
    darkImg = darkX.createImageData(darkCv.width, darkCv.height);
    resize();
  }
  function resize() {
    const r = cv.getBoundingClientRect(), d = devicePixelRatio || 1;
    const w = Math.max(1, Math.round(r.width * d)), h = Math.max(1, Math.round(r.height * d));
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    return { w, h };
  }
  function roadIcon() { return roadTile.toDataURL(); }

  function spr(s, px, py, flip, alpha) {
    if (alpha !== undefined && alpha < 1) x.globalAlpha = Math.max(0, alpha);
    if (flip) { x.save(); x.translate(Math.round(px) + s.w, Math.round(py)); x.scale(-1, 1); x.drawImage(s.img, 0, 0); x.restore(); }
    else x.drawImage(s.img, Math.round(px), Math.round(py));
    x.globalAlpha = 1;
  }
  function glow(s, px, py, flip, alpha) {
    if (!s.glow) return;
    x.globalAlpha = alpha === undefined ? 1 : Math.max(0, alpha);
    if (flip) { x.save(); x.translate(Math.round(px) + s.w, Math.round(py)); x.scale(-1, 1); x.drawImage(s.glow, 0, 0); x.restore(); }
    else x.drawImage(s.glow, Math.round(px), Math.round(py));
    x.globalAlpha = 1;
  }

  // ---------- 粒 ----------
  function burst(ev) {
    const P = (o) => fx.push(Object.assign({ t: 0, vx: 0, vy: 0, g: 0 }, o));
    switch (ev.t) {
      case 'coin':
        P({ k: 'text', x: ev.x, y: ev.y, s: '+' + ev.v, col: '#ffe14d', life: 50, vy: -0.4 });
        P({ k: 'coin', x: ev.x - 2, y: ev.y + 4, vy: -1.6, g: 0.12, life: 22 });
        break;
      case 'bigcoin': case 'leafcoin': {
        const leaf = ev.t === 'leafcoin';
        P({ k: 'text', x: ev.x, y: ev.y - 4, s: '+' + ev.v, col: leaf ? '#9be07a' : '#ffe14d', life: 80, vy: -0.35, big: true });
        const n = ev.big ? 16 : 9;
        for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = 1 + Math.random() * 1.5; P({ k: leaf ? 'leaf' : 'coin', x: ev.x - 2, y: ev.y + 4, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1.5, g: 0.1, life: 30 + i * 2 }); }
        for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; P({ k: 'spark', x: ev.x, y: ev.y + 6, vx: Math.cos(a) * 2.2, vy: Math.sin(a) * 2.2, life: 14, col: '#fff' }); }
        break;
      }
      case 'whim':
        P({ k: 'label', x: ev.x, y: ev.y, s: ev.s, col: ev.k === 'big' || ev.k === 'gift' ? '#ffe14d' : ev.k === 'leaf' ? '#9be07a' : '#ff9a7a', life: 110, vy: -0.15 });
        break;
      case 'eatstart':
        P({ k: 'text', x: ev.x, y: ev.y - 14, s: '!', col: '#ff6a3d', life: 40, vy: -0.2, big: true });
        break;
      case 'eaten':
        for (let i = 0; i < 10; i++) P({ k: 'smoke', x: ev.x + (Math.random() - 0.5) * 8, y: ev.y, vx: (Math.random() - 0.5) * 0.6, vy: -0.4 - Math.random() * 0.6, life: 40 + Math.random() * 30, sz: 2 + Math.floor(Math.random() * 3) });
        break;
      case 'shoo':
        for (let i = 0; i < 6; i++) { const a = Math.random() * Math.PI * 2; P({ k: 'spark', x: ev.x, y: ev.y, vx: Math.cos(a) * 1.8, vy: Math.sin(a) * 1.8, life: 12, col: '#6fd6c8' }); }
        P({ k: 'text', x: ev.x, y: ev.y - 6, s: '!?', col: '#6fd6c8', life: 30, vy: -0.6 });
        break;
      case 'scared':
        P({ k: 'text', x: ev.x, y: ev.y - 6, s: '!!', col: '#6fd6c8', life: 30, vy: -0.6 });
        break;
      case 'relight': case 'lampon':
        if (ev.v) P({ k: 'text', x: ev.x, y: ev.y - 10, s: '-' + ev.v, col: '#ff9a7a', life: 40, vy: -0.4 });
        for (let i = 0; i < 6; i++) P({ k: 'spark', x: ev.x, y: ev.y, vx: (Math.random() - 0.5) * 1.5, vy: -Math.random() * 2, life: 16, col: '#ffb02e' });
        break;
      case 'lampoff':
        for (let i = 0; i < 4; i++) P({ k: 'smoke', x: ev.x, y: ev.y, vx: (Math.random() - 0.5) * 0.4, vy: -0.5, life: 30, sz: 2 });
        break;
      case 'place': case 'pickup':
        for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; P({ k: 'dust', x: ev.x + Math.cos(a) * 5, y: ev.y + 5, vx: Math.cos(a) * 0.5, vy: -0.2, life: 14 }); }
        break;
      case 'cart':
        P({ k: 'text', x: ev.x, y: ev.y - 6, s: '+' + C.CART_LOAD, col: '#9be07a', life: 40, vy: -0.4 });
        break;
      case 'nope':
        P({ k: 'text', x: ev.x, y: ev.y - 10, s: '¥?', col: '#ff6a3d', life: 30, vy: -0.3 });
        break;
    }
  }
  function stepFx() {
    for (const p of fx) { p.t++; p.x += p.vx; p.y += p.vy; p.vy += p.g; if (p.k === 'smoke') p.vx *= 0.97; }
    for (let i = fx.length - 1; i >= 0; i--) if (fx[i].t >= fx[i].life) fx.splice(i, 1);
    if (fx.length > 600) fx.splice(0, fx.length - 600);
  }
  function drawFx() {
    for (const p of fx) {
      const k = 1 - p.t / p.life;
      if (p.k === 'coin') spr(SPR.coin, p.x, p.y);
      else if (p.k === 'leaf') spr(SPR.leaf, p.x, p.y);
      else if (p.k === 'spark') { x.fillStyle = p.col; x.fillRect(Math.round(p.x), Math.round(p.y), 1, 1); x.fillStyle = '#1a1420'; x.fillRect(Math.round(p.x), Math.round(p.y) + 1, 1, 1); }
      else if (p.k === 'smoke') { x.globalAlpha = k * 0.9; x.fillStyle = p.t < 6 ? '#ffb02e' : p.t < 12 ? '#555' : '#3a3540'; x.fillRect(Math.round(p.x), Math.round(p.y), p.sz, p.sz); x.globalAlpha = 1; }
      else if (p.k === 'dust') { x.fillStyle = '#c9b48a'; x.fillRect(Math.round(p.x), Math.round(p.y), 2, 1); }
      else if (p.k === 'text') { x.globalAlpha = Math.min(1, k * 2); pixText(p.s, p.x, p.y, p.col, p.big ? 2 : 1); x.globalAlpha = 1; }
    }
  }
  const FONT = {
    '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111', '4': '101101111001001',
    '5': '111100111001111', '6': '111100111101111', '7': '111001010010010', '8': '111101111101111', '9': '111101111001111',
    '+': '000010111010000', '-': '000000111000000', '!': '010010010000010', '?': '111001011000010', '¥': '101010111010010',
  };
  function pixText(s, cx, cy, col, sc) {
    const w = s.length * 4 * sc - sc;
    let px = Math.round(cx - w / 2); const py = Math.round(cy);
    for (const ch of s) {
      const f = FONT[ch];
      if (f) for (let i = 0; i < 15; i++) if (f[i] === '1') {
        const gx = px + (i % 3) * sc, gy = py + Math.floor(i / 3) * sc;
        x.fillStyle = '#1a1420'; x.fillRect(gx + sc, gy + sc, sc, sc);
        x.fillStyle = col; x.fillRect(gx, gy, sc, sc);
      }
      px += 4 * sc;
    }
  }

  // 闇の絵を作り直す(灯りが変わったときだけ)
  function buildDark(n) {
    const W = darkCv.width, H = darkCv.height, d = darkImg.data, cell = n.cell, land = n.town.land;
    const cpl = C.LAND_W * 4, rpl = C.LAND_H * 4, LX = Sim.LX;
    for (let y = 0; y < H; y++) for (let xx = 0; xx < W; xx++) {
      const j = y * W + xx, o = j * 4;
      let a, r = 10, g = 8, b = 30;
      if (!land[Math.floor(y / rpl) * LX + Math.floor(xx / cpl)]) a = 0.9;
      else {
        const L = cell[j], q = L + (BAYER[y % 4][xx % 4] / 16 - 0.5) * 0.08;
        a = DARK[Sim.Night.levelOf(q)];
        if (L > 0.55) { r = 70; g = 36; b = 10; a = Math.max(a, 0.08); }   // 明るい所はほんのり橙
      }
      d[o] = r; d[o + 1] = g; d[o + 2] = b; d[o + 3] = Math.round(a * 255);
    }
    darkX.putImageData(darkImg, 0, 0);
  }

  // ---------- 本体 ----------
  // v: { night, town, dusk, hover, t, prep, tool, cam:{x,y,z} }
  function draw(v) {
    const n = v.night, town = v.town, cam = v.cam, labels = [];
    const { w: SW, h: SH } = resize();
    stepFx();
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.imageSmoothingEnabled = false;
    x.fillStyle = '#07060f'; x.fillRect(0, 0, SW, SH);
    const shake = n.shake > 0 ? Math.round((Math.random() - 0.5) * 2 * Math.ceil(n.shake / 4)) : 0;
    x.setTransform(cam.z, 0, 0, cam.z, Math.round(-cam.x * cam.z) + shake, Math.round(-cam.y * cam.z));
    x.imageSmoothingEnabled = false;
    // 画面に映るマスの範囲
    const vc0 = Math.max(0, Math.floor(cam.x / T) - 1), vr0 = Math.max(0, Math.floor(cam.y / T) - 1);
    const vc1 = Math.min(C.COLS - 1, Math.ceil((cam.x + SW / cam.z) / T) + 1), vr1 = Math.min(C.ROWS - 1, Math.ceil((cam.y + SH / cam.z) / T) + 2);
    const sx = vc0 * T, sy = vr0 * T, sw = (vc1 - vc0 + 1) * T, sh = (vr1 - vr0 + 1) * T;
    x.drawImage(ground, sx, sy, sw, sh, sx, sy, sw, sh);
    for (let k = 0; k < Sim.LX * Sim.LY; k++) {
      if (town.land[k]) continue;
      const lx = (k % Sim.LX) * C.LAND_W * T, ly = ((k / Sim.LX) | 0) * C.LAND_H * T, lw = C.LAND_W * T, lh = C.LAND_H * T;
      if (lx > sx + sw || ly > sy + sh || lx + lw < sx || ly + lh < sy) continue;
      x.drawImage(bush, lx, ly, lw, lh, lx, ly, lw, lh);
      if (v.prep && v.tool === 'land' && Sim.landBuyable(town, k)) {
        x.strokeStyle = (v.t >> 4) % 2 ? '#ffe14d' : '#ffb02e'; x.lineWidth = 1;
        x.strokeRect(lx + 1.5, ly + 1.5, lw - 3, lh - 3);
        labels.push({ s: `買える ¥${Sim.landCost(k)}`, x: lx + lw / 2, y: ly + lh / 2, col: '#ffe14d', size: 9 });
      }
    }
    for (let r = vr0; r <= vr1; r++) for (let c = vc0; c <= vc1; c++) {
      const i = Sim.idx(c, r);
      if (town.roads[i] && !(c === C.GATE.c && r === C.GATE.r)) x.drawImage(roadTile, c * T, r * T);
    }
    if (v.prep && (v.tool === 'lantern' || v.tool === 'joya')) {
      x.fillStyle = '#ffe14d';
      for (let r = vr0; r <= vr1; r++) for (let c = vc0; c <= vc1; c++) {
        const i = Sim.idx(c, r);
        if (n.nearFire[i] && !town.roads[i] && Sim.landOpen(town, c, r)) x.fillRect(c * T + 7, r * T + 7, 2, 2);
      }
    }
    if (v.prep) {
      x.fillStyle = '#ffffff0e';
      for (let c = vc0; c <= vc1 + 1; c++) x.fillRect(c * T, sy, 1 / cam.z, sh);
      for (let r = vr0; r <= vr1 + 1; r++) x.fillRect(sx, r * T, sw, 1 / cam.z);
    }
    if (v.prep && BUILDS[v.tool] && n.area[v.tool]) {
      x.fillStyle = '#ffe14d22';
      for (let r = vr0; r <= vr1; r++) for (let c = vc0; c <= vc1; c++) if (n.area[v.tool][Sim.idx(c, r)]) x.fillRect(c * T, r * T, T, T);
    }

    const inView = (c, r) => c >= vc0 - 1 && c <= vc1 + 1 && r >= vr0 - 1 && r <= vr1 + 2;
    const list = [];
    for (const o of n.objs) if (inView(o.c, o.r)) list.push({ y: o.r * T + T, o });
    if (inView(C.GATE.c, C.GATE.r)) list.push({ y: C.GATE.r * T + T - 0.5, gate: true });
    for (const a of n.humans) if (inView(a.c, a.r)) list.push({ y: a.y, a });
    for (const a of n.yokai) if (inView(Math.floor(a.x / T), Math.floor(a.y / T))) list.push({ y: a.y, a });
    for (const a of n.carts) if (inView(a.c, a.r)) list.push({ y: a.y, cart: a });
    list.sort((p, q) => p.y - q.y);
    const glows = [], after = [];
    for (const it of list) {
      if (it.gate) { const s = SPR.gate2; spr(s, C.GATE.c * T, C.GATE.r * T + T - s.h); glows.push({ s, x: C.GATE.c * T, y: C.GATE.r * T + T - s.h, a: 0.8 + 0.2 * Math.sin(v.t / 7) }); continue; }
      if (it.cart) { const s = SPR.cart, a = it.cart, bob = a.walking && (a.t >> 3) % 2 ? -1 : 0; spr(s, a.x - s.w / 2, a.y - s.h + bob, a.face < 0); continue; }
      if (it.o) drawObj(n, it.o, v.t, glows, after);
      else drawAgent(n, it.a, v.t, glows);
    }
    for (const a of n.yokai) if (a.state === 'eat' && a.prey) drawTongue(a, a.prey, v.t);

    // 闇
    if (v.dusk > 0.01) {
      if (darkVer !== n.lightVer || darkNight !== n) { buildDark(n); darkVer = n.lightVer; darkNight = n; }
      x.globalAlpha = v.dusk;
      x.drawImage(darkCv, sx / 4, sy / 4, sw / 4, sh / 4, sx, sy, sw, sh);
      x.globalAlpha = 1;
    }
    for (let r = vr0; r <= vr1; r++) for (let c = vc0; c <= vc1; c++) {
      const i = Sim.idx(c, r);
      if (!town.roads[i] || (c === C.GATE.c && r === C.GATE.r) || (c + r) % 2) continue;
      spr(n.fire[i] ? SPR.andon : SPR.andonOff, c * T + 1, r * T + 1);
    }
    for (const g of glows) glow(g.s, g.x, g.y, g.flip, g.a);
    for (const f of after) f();
    drawFx();

    const h = v.hover;
    if (h && Sim.inMap(h.c, h.r) && h.tool !== 'land') {
      x.strokeStyle = h.ok ? '#ffe14d' : '#ff6a3d'; x.lineWidth = 2 / cam.z;
      x.strokeRect(h.c * T + 0.5, h.r * T + 0.5, T - 1, T - 1);
      if (h.ok && h.tool === 'lantern') ring(h.c * T + 8, h.r * T + 8, C.R_LANTERN * T * (1 - C.LIGHT_DIM), v.t);
      if (h.ok && h.tool === 'joya') ring(h.c * T + 8, h.r * T + 8, C.R_JOYA * T, v.t);
      if (h.ok && BUILDS[h.tool] && h.tool !== 'joya') ring(h.c * T + 8, h.r * T + 8, (C.BUILD_R + 0.5) * T, v.t);
      if (h.ok && h.mark !== undefined) { x.globalAlpha = 0.85; spr([SPR.markClosed, SPR.markYokai, SPR.markHuman][h.mark], h.c * T + 4, h.r * T - 9); x.globalAlpha = 1; }
      if (!h.ok && h.why) labels.push({ s: h.why, x: h.c * T + 8, y: h.r * T - 6, col: '#ff9a7a', size: 7 });
    }

    // 日本語の文字は画面の実寸で描く
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.textAlign = 'center'; x.textBaseline = 'middle';
    const fs = Math.max(11 * (devicePixelRatio || 1), cam.z * 7);
    const tx = (wx, wy, str, col, a, size) => {
      const px = (wx - cam.x) * cam.z, py = (wy - cam.y) * cam.z;
      if (px < -200 || py < -40 || px > SW + 200 || py > SH + 40) return;
      x.globalAlpha = a; x.font = `900 ${Math.round(size ? fs * size / 7 : fs)}px ${FONT_JP}`;
      x.lineWidth = Math.max(2, fs / 4); x.strokeStyle = '#1a1420'; x.strokeText(str, px, py);
      x.fillStyle = col; x.fillText(str, px, py);
    };
    for (const p of fx) if (p.k === 'label') tx(p.x, p.y, p.s, p.col, Math.min(1, (1 - p.t / p.life) * 3));
    for (const l of labels) tx(l.x, l.y, l.s, l.col, 1, l.size);
    x.globalAlpha = 1;
  }
  function ring(cx, cy, R, t) {
    x.fillStyle = '#ffe14d';
    const n = Math.round(R * 1.2);
    for (let i = 0; i < n; i++) {
      if ((i + Math.floor(t / 6)) % 2) continue;
      const a = i / n * Math.PI * 2;
      x.fillRect(Math.round(cx + Math.cos(a) * R), Math.round(cy + Math.sin(a) * R), 1, 1);
    }
  }

  const BSPR = { nagaya: 'nagaya', chaya: 'chayaB', shibai: 'shibai', taiko: 'taiko', yashiro: 'yashiro', bansho: 'bansho', joya: 'joya', ido: 'ido', kura: 'kura', aburaya: 'aburaya' };
  function drawObj(n, o, t, glows, after) {
    const bx = o.c * T, by = o.r * T + T;
    if (o.kind === 'build') {
      const s = SPR[BSPR[o.type]]; spr(s, bx, by - s.h);
      const need = Sim.staffOf(o);
      const lit = (o.type !== 'joya' || n.nearFire[Sim.idx(o.c, o.r)]) && !o.dry && o.cap >= need;
      if (lit) glows.push({ s, x: bx, y: by - s.h, a: 0.85 + 0.15 * Math.sin(t / 13 + o.c) });
      // 水のない長屋、人手の足りない建物は札で知らせる
      if (o.dry) after.push(() => spr(SPR.markDry, bx + 4, by - s.h - 8));
      else if (need) after.push(() => {
        if (o.cap < need) spr(SPR.markNoStaff, bx + 4, by - s.h - 8);
        for (let i = 0; i < need; i++) { x.fillStyle = i < o.cap ? '#ffe14d' : '#3a3540'; x.fillRect(bx + 8 - need + i * 2, by - 2, 1, 1); }
      });
      return;
    }
    if (o.kind === 'lantern') {
      const ox = o.eatBy ? (t % 4 < 2 ? -1 : 1) : 0;
      const fire = n.nearFire[Sim.idx(o.c, o.r)];
      const s = o.eaten ? SPR.lanternOut : (o.off || !fire) ? SPR.lanternOff : SPR.lantern;
      spr(s, bx + ox, by - s.h);
      if (o.off && !o.eaten && fire) after.push(() => { x.fillStyle = (t >> 3) % 2 ? '#ffb02e' : '#ffe14d'; x.fillRect(bx + 7, by - 11, 2, 2); });
      if (o.eatBy) {
        const k = 1 - o.eatT / C.YOKAI_EAT_F;
        x.fillStyle = '#1a1420'; x.fillRect(bx + 3, by - 18, 10, 2);
        x.fillStyle = k > 0.4 ? '#ffb02e' : '#ff6a3d'; x.fillRect(bx + 3, by - 18, Math.ceil(10 * k), 2);
      }
      return;
    }
    // 店。札は店の中(のれんの下)に描き、上の建物と重ならないようにする
    const s = SPR[o.type], bump = o.bump > 0 ? -1 : 0, m = n.lvl(o.c, o.r), top = by - s.h + bump;
    const at = SPR.markAt[o.type] || 5;
    spr(s, bx, top);
    const staffed = o.cap > 0, need = STALLS[o.type].staff;
    after.push(() => {
      const jump = o.markT > 0 ? -Math.round(Math.sin(o.markT / 14 * Math.PI) * 2) : 0;
      const mk = !staffed ? SPR.markNoStaff : n.soldOut(o) ? SPR.markEmpty : [SPR.markClosed, SPR.markYokai, SPR.markHuman][m];
      spr(mk, bx + 4, top + at + jump);
      // 働き手の数(足りない分は暗い点)
      for (let i = 0; i < need; i++) { x.fillStyle = i < o.cap ? '#ffe14d' : '#3a3540'; x.fillRect(bx + 8 - need + i * 2, by - 3, 1, 1); }
      if (m === 1 && staffed) {
        const f = SPR.onibi[Math.floor(t / 10 + o.c) % 2];
        spr(f, bx + 12 + Math.round(Math.sin(t / 20 + o.r) * 1.5), top + at - 2 + Math.round(Math.sin(t / 13 + o.c) * 2), false, 0.9);
      }
      // 大店の品物の残り
      if (o.type === 'oodana' && n.rank >= 2) { const k = Math.min(1, o.stock / (C.OODANA_STOCK * 2)); x.fillStyle = '#1a1420'; x.fillRect(bx + 1, top + 1, 2, 10); x.fillStyle = k > 0.25 ? '#9be07a' : '#ff6a3d'; x.fillRect(bx + 1, top + 1 + Math.round(10 * (1 - k)), 2, Math.round(10 * k)); }
      if (o.sitF > 0) { x.fillStyle = '#1a1420'; x.fillRect(bx + 2, top - 2, 12, 2); x.fillStyle = '#b48ae0'; x.fillRect(bx + 2, top - 2, Math.ceil(12 * o.sitF / C.SIT_F), 2); }
    });
  }

  function drawAgent(n, a, t, glows) {
    if (a.kind === 'human') {
      const s = a.kid ? SPR.kids[a.look] : SPR.people[a.look];
      const bob = a.walking && Math.floor(a.t / 8) % 2 ? -1 : 0;
      const px = a.x - s.w / 2, py = a.y - s.h + bob;
      x.fillStyle = '#00000040'; x.fillRect(Math.round(a.x - 3), Math.round(a.y - 1), 6, 2);
      spr(s, px, py, a.face < 0);
      if (a.serving) { x.fillStyle = '#ffe14d'; x.fillRect(Math.round(a.x - 1), Math.round(py - 3), 2, 2); }
      return;
    }
    const s = SPR.yokai[a.look];
    let bob = Math.round(Math.sin(a.t / 10) * 1.5), sx = 0;
    if (a.state === 'flee') bob = -Math.abs(Math.round(Math.sin(a.hop / 3) * 5));
    if (a.state === 'eat') sx = a.t % 6 < 3 ? 1 : 0;
    if (a.state === 'sit') bob = Math.round(Math.sin(a.t / 30));
    const px = a.x - s.w / 2 + sx, py = a.y - s.h + bob - 2;
    x.fillStyle = '#00000050'; x.fillRect(Math.round(a.x - 4), Math.round(a.y - 1), 8, 2);
    spr(s, px, py, a.face < 0, a.alpha);
    glows.push({ s, x: px, y: py, flip: a.face < 0, a: a.alpha * (0.75 + 0.25 * Math.sin(a.t / 7)) });
  }
  function drawTongue(a, o, t) {
    const x0 = a.x + a.face * 3, y0 = a.y - 9, x1 = o.c * T + 8, y1 = o.r * T + 4;
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0));
    for (let i = 0; i <= n; i++) {
      const k = i / n, w = Math.sin(k * Math.PI * 3 + t / 3) * 1.5 * Math.sin(k * Math.PI);
      const px = Math.round(x0 + (x1 - x0) * k), py = Math.round(y0 + (y1 - y0) * k + w);
      x.fillStyle = '#1a1420'; x.fillRect(px, py + 1, 1, 1);
      x.fillStyle = i % 3 ? '#f08cb4' : '#c85a8c'; x.fillRect(px, py, 1, 1);
    }
  }

  root.Render = { init, draw, burst, roadIcon, resize, WW, WH };
})(window);
