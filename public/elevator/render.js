// 描画。sim の状態を読むだけで、勝負には触らない。
(function (root) {
  const C = () => root.CFG;
  const W = 540, H = 960;
  // 画面の配置(見た目だけ)
  const L = {
    hudH: 92,
    frameX: 104, frameY: 168, frameW: 332, frameH: 440,
    doorX: 120, doorY: 184, doorW: 300, doorH: 424,
    floorY: 608, hallY: 742, panelY: 778,
  };
  const CX = L.doorX + L.doorW / 2;
  const INK = '#1d1a22';
  const FONT = '"Hiragino Sans","Yu Gothic","Noto Sans JP",sans-serif';

  const R = {
    ctx: null, cv: null, fx: [], pops: [], shake: 0, flash: 0, red: 0, tags: {}, t: 0, overWhy: null,
    init(cv) { this.cv = cv; this.ctx = cv.getContext('2d'); this.resize(); },
    resize() {
      const dpr = Math.min(2, root.devicePixelRatio || 1);
      const r = this.cv.getBoundingClientRect();
      this.cv.width = Math.round(r.width * dpr); this.cv.height = Math.round(r.height * dpr);
      this.scale = this.cv.width / W;
    },
    reset() { this.fx = []; this.pops = []; this.shake = 0; this.flash = 0; this.red = 0; this.tags = {}; this.overWhy = null; },

    // sim のイベントから見た目の演出を作る
    onEvent(e, s) {
      const sh = C().SHAKE * (root.SAVE ? root.SAVE.shake : 1);
      const p = e.id ? findPass(s, e.id) : null;
      const px = p ? passX(p) : CX;
      switch (e.t) {
        case 'bonk':
          this.shake = Math.max(this.shake, 10 * sh);
          this.pop('ゴンッ', CX, L.doorY + 230, '#fff', 46);
          this.stars(CX, L.doorY + 200);
          break;
        case 'ok':
          if (e.why === 'shut') this.pop('撃退!', CX, L.doorY + 120, '#7ff0b0', 50);
          else this.pop('ご乗車ありがとうございます', CX, L.doorY + 90, '#7ff0b0', 26, 50);
          break;
        case 'ng':
          this.shake = Math.max(this.shake, 18 * sh); this.red = 1;
          this.pop(e.why === 'shutHuman' ? '人間だった!' : e.why === 'timeout' ? '待ちくたびれて帰った' : e.why === 'forced' ? '押し入られた!' : 'ゾンビだった!', CX, L.doorY + 60, '#ff5a4a', e.why === 'timeout' ? 34 : 50, 70);
          if (e.why === 'shutHuman' || e.why === 'timeout') this.overWhy = e.why; else this.overWhy = 'zombie';
          break;
        case 'rampage':
          this.flash = 0.6;
          this.pop('ギャーッ!!', CX, L.doorY + 160, '#ff5a4a', 64, 70);
          break;
        case 'thrown': this.pop('ポイッ', CX, L.hallY - 160, '#fff', 40); break;
        case 'decide':
          if (p) this.fx.push({ k: 'mark', id: e.id, dec: e.dec, f: 0, life: 9999 });
          break;
        case 'nobody': this.pop('まだ誰もいない', CX, L.hallY - 120, '#fff', 26, 40); break;
        case 'combo': this.pop(e.n + '連続! ' + e.word, CX, 360, '#ffe14d', 34, 90); this.flash = 0.25; break;
        case 'over': this.shake = 26 * sh; this.flash = 0.8; break;
        case 'arrive': if (!e.retry) this.pop('チーン ' + e.floor + '階', CX, 160, '#fff6c0', 30, 50); this.fx = this.fx.filter(f => f.k !== 'mark'); break;
        case 'force': this.pop('バキッ', CX, L.doorY + 200, '#ff5a4a', 50); this.shake = 14 * sh; break;
        case 'spawn': {
          const sv = root.SAVE;
          if (sv && !sv.seen[e.kind]) {
            sv.seen[e.kind] = 1; root.saveGame && root.saveGame();
            const k = root.KINDS[e.kind];
            this.tags[e.id] = { text: 'NEW ' + k.name + ':' + k.tell, f: 300 };
          }
          break;
        }
      }
    },
    pop(text, x, y, color, size, life, vy) { this.pops.push({ text, x, y, color, size: size || 32, f: 0, life: life || 55, vy: vy === undefined ? -0.6 : vy }); },
    stars(x, y) { for (let i = 0; i < 5; i++) this.fx.push({ k: 'star', x, y, a: i * 1.256, f: 0, life: 40 }); },

    draw(s) {
      const ctx = this.ctx;
      this.t++;
      ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
      ctx.clearRect(0, 0, W, H);
      if (!s) { ctx.fillStyle = '#1e1b24'; ctx.fillRect(0, 0, W, H); return; }
      let ox = 0, oy = 0;
      if (this.shake > 0.3) { ox = (Math.random() - 0.5) * this.shake; oy = (Math.random() - 0.5) * this.shake * 0.5; this.shake *= 0.86; }
      ctx.save();
      ctx.translate(ox, oy);
      drawWall(ctx, s);
      drawInterior(ctx, s, this.t);
      drawDoors(ctx, s);
      drawIndicator(ctx, s, this.t);
      drawHall(ctx, s, this.t, this.tags, this.fx);
      this.drawFx(ctx, s);
      ctx.restore();
      if (s.phase === 'travel') drawTravel(ctx, this.t);
      drawHud(ctx, s, this.t);
      drawPanel(ctx);
      if (this.red > 0.02) { ctx.fillStyle = `rgba(220,30,20,${this.red * 0.28})`; ctx.fillRect(0, 0, W, H); this.red *= 0.9; }
      this.drawPops(ctx);
      if (s.phase === 'over') drawOver(ctx, s, this.t, this.overWhy);
      if (this.flash > 0.02) { ctx.fillStyle = `rgba(255,250,235,${this.flash * 0.5})`; ctx.fillRect(0, 0, W, H); this.flash *= 0.8; }
      for (const id in this.tags) if (--this.tags[id].f <= 0) delete this.tags[id];
    },
    drawFx(ctx, s) {
      for (const f of this.fx) {
        f.f++;
        if (f.k === 'star') {
          const a = f.a + f.f * 0.15, r = 44;
          star(ctx, f.x + Math.cos(a) * r, f.y + Math.sin(a) * r * 0.4, 9, '#ffe14d');
        }
      }
      // 決めた印は、その客が扉に着くまで残す
      this.fx = this.fx.filter(f => f.k === 'mark' ? !!findPass(s, f.id) && (findPass(s, f.id).state === 'walk' || findPass(s, f.id).state === 'wait') : f.f < f.life);
    },
    drawPops(ctx) {
      for (const p of this.pops) {
        p.f++; p.y += p.vy;
        const k = p.f < 6 ? 0.6 + p.f / 6 * 0.6 : p.f < 10 ? 1.2 - (p.f - 6) / 4 * 0.2 : 1;
        const a = p.f > p.life - 12 ? (p.life - p.f) / 12 : 1;
        ctx.save();
        ctx.globalAlpha = Math.max(0, a);
        ctx.translate(Math.round(p.x), Math.round(p.y)); ctx.scale(k, k);
        ctx.font = `900 ${p.size}px ${FONT}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(5, p.size / 6); ctx.strokeStyle = INK;
        const w = ctx.measureText(p.text).width * k;
        let dx = 0;
        if (p.x - w / 2 < 8) dx = (8 - (p.x - w / 2)) / k; else if (p.x + w / 2 > W - 8) dx = (W - 8 - (p.x + w / 2)) / k;
        ctx.strokeText(p.text, dx, 0); ctx.fillStyle = p.color; ctx.fillText(p.text, dx, 0);
        ctx.restore();
      }
      this.pops = this.pops.filter(p => p.f < p.life);
    },
  };

  function findPass(s, id) {
    for (const p of s.hall) if (p.id === id) return p;
    return null;
  }
  // 扉の前では左右に分かれて待つ。2人が重ならないように
  function passX(p) { return CX + p.side * (p.state === 'walk' || p.state === 'wait' ? Math.max(p.d, 48) : p.d); }

  // ---------- 背景 ----------
  const FLOOR_TINT = ['#d9c7a8', '#cfd6c4', '#c9d2dc', '#dccbc9', '#cdd9d6', '#d8d0bd', '#c6cad8', '#dcd2bf', '#d0c4d6', '#e2d6b4'];
  const FLOOR_NAME = ['ロビー', '総務部', '営業部', '経理部', '開発部', '人事部', '会議室', '食堂', '役員室', '社長室'];
  function drawWall(ctx, s) {
    ctx.fillStyle = FLOOR_TINT[(s.floor - 1) % 10]; ctx.fillRect(0, L.hudH, W, L.floorY - L.hudH);
    const g = ctx.createLinearGradient(0, L.hudH, 0, L.floorY);
    g.addColorStop(0, 'rgba(255,255,240,.35)'); g.addColorStop(1, 'rgba(60,40,30,.18)');
    ctx.fillStyle = g; ctx.fillRect(0, L.hudH, W, L.floorY - L.hudH);
    ctx.strokeStyle = 'rgba(70,50,40,.12)'; ctx.lineWidth = 2;
    for (let x = 30; x < W; x += 90) { ctx.beginPath(); ctx.moveTo(x, L.hudH); ctx.lineTo(x, L.floorY); ctx.stroke(); }
    ctx.fillStyle = '#5b4a40'; ctx.fillRect(0, L.floorY - 14, W, 14);
    // 階の案内板
    ctx.fillStyle = '#2d2a33'; ctx.fillRect(18, 220, 70, 92);
    ctx.fillStyle = '#f2ead8'; ctx.font = `900 40px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(Math.min(10, s.floor) + 'F', 53, 252);
    ctx.font = `700 14px ${FONT}`; ctx.fillStyle = '#c9bfa8';
    ctx.fillText(FLOOR_NAME[Math.min(10, s.floor) - 1] || '', 53, 290);
    plant(ctx, 40, L.floorY - 14);
    plant(ctx, W - 40, L.floorY - 14);
    // 床
    ctx.fillStyle = '#8b7d72'; ctx.fillRect(0, L.floorY, W, H - L.floorY);
    ctx.strokeStyle = 'rgba(30,20,20,.18)'; ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) { const y = L.floorY + 6 + i * i * 6 + i * 14; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    for (let i = -6; i <= 6; i++) { ctx.beginPath(); ctx.moveTo(CX + i * 60, L.floorY); ctx.lineTo(CX + i * 150, L.panelY); ctx.stroke(); }
    const lg = ctx.createRadialGradient(CX, L.floorY + 10, 10, CX, L.floorY + 10, 220);
    lg.addColorStop(0, `rgba(255,250,220,${0.15 + s.door.g * 0.35})`); lg.addColorStop(1, 'rgba(255,250,220,0)');
    ctx.fillStyle = lg; ctx.fillRect(0, L.floorY, W, 200);
  }
  function plant(ctx, x, y) {
    ctx.fillStyle = '#6a3f2a'; ctx.fillRect(x - 18, y - 40, 36, 40);
    ctx.fillStyle = INK; ctx.fillRect(x - 20, y - 44, 40, 6);
    ctx.fillStyle = '#3f7a4a';
    for (let i = 0; i < 7; i++) {
      const a = -Math.PI / 2 + (i - 3) * 0.38;
      ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * 30, y - 50 + Math.sin(a) * 34, 9, 24, a + Math.PI / 2, 0, 6.28); ctx.fill();
    }
  }

  function drawInterior(ctx, s, t) {
    if (s.door.g <= 0.001) return;
    ctx.save();
    ctx.beginPath(); ctx.rect(L.doorX, L.doorY, L.doorW, L.doorH); ctx.clip();
    const quake = s.rampage > 0 ? (Math.random() - 0.5) * 8 : 0;
    ctx.translate(quake, 0);
    ctx.fillStyle = s.rampage > 0 && (t >> 2) & 1 ? '#f2c9b8' : '#efe6cf'; ctx.fillRect(L.doorX - 10, L.doorY, L.doorW + 20, L.doorH);
    ctx.fillStyle = '#d9cdb2'; ctx.fillRect(L.doorX + 30, L.doorY + 18, L.doorW - 60, L.doorH - 70);
    ctx.fillStyle = '#b5a68a'; ctx.fillRect(L.doorX - 10, L.doorY + L.doorH - 52, L.doorW + 20, 52);
    ctx.fillStyle = 'rgba(255,255,240,.6)'; ctx.fillRect(L.doorX + 40, L.doorY + 6, L.doorW - 80, 8);
    // 乗っている人間。ゾンビが暴れている間は跳ね回って逃げる
    const n = s.riders.length;
    s.riders.forEach((p, i) => {
      const span = Math.min(230, 50 + n * 30);
      let x = CX + (n === 1 ? 0 : (i / (n - 1) - 0.5) * span), y = L.doorY + L.doorH - 22 - (i % 2) * 8;
      if (s.rampage > 0) { x += Math.sin(t * 0.5 + i * 2) * 30; y -= Math.abs(Math.sin(t * 0.4 + i)) * 40; }
      drawPerson(ctx, p.kind, x, y, 0.7, { face: s.rampage > 0 ? 'scared' : 'calm', t, id: p.id, facing: i % 2 ? -1 : 1 });
    });
    if (s.rampage > 0 && s.thrown) drawPerson(ctx, s.thrown.kind, CX + Math.sin(t * 0.3) * 40, L.doorY + L.doorH - 20, 0.8, { face: 'zombie', t, id: s.thrown.id, facing: (t >> 4) & 1 ? 1 : -1, run: true, unmask: true });
    ctx.restore();
  }

  function drawDoors(ctx, s) {
    const g = s.door.g, half = L.doorW / 2;
    ctx.fillStyle = '#6f7480';
    ctx.fillRect(L.frameX, L.frameY, L.frameW, L.doorY - L.frameY);
    ctx.fillRect(L.frameX, L.doorY, L.doorX - L.frameX, L.doorH);
    ctx.fillRect(L.doorX + L.doorW, L.doorY, L.frameX + L.frameW - L.doorX - L.doorW, L.doorH);
    ctx.fillStyle = '#9aa0ab'; ctx.fillRect(L.frameX + 4, L.frameY + 4, L.frameW - 8, 8);
    ctx.fillStyle = INK; ctx.fillRect(L.frameX, L.frameY, L.frameW, 3); ctx.fillRect(L.frameX, L.frameY, 3, L.frameH); ctx.fillRect(L.frameX + L.frameW - 3, L.frameY, 3, L.frameH);
    const open = half * g;
    const jit = R.shake > 3 ? (Math.random() - 0.5) * 4 : 0;
    panel(ctx, L.doorX - open + jit, L.doorY, half, L.doorH, -1);
    panel(ctx, CX + open - jit, L.doorY, half, L.doorH, 1);
    ctx.fillStyle = INK; ctx.fillRect(L.doorX - 4, L.doorY + L.doorH, L.doorW + 8, 6);
  }
  function panel(ctx, x, y, w, h, side) {
    const x0 = Math.max(x, L.doorX), x1 = Math.min(x + w, L.doorX + L.doorW);
    if (x1 <= x0) return;
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, y, x1 - x0, h); ctx.clip();
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    g.addColorStop(0, '#b9bec7'); g.addColorStop(0.45, '#e3e6ea'); g.addColorStop(0.55, '#c9cdd4'); g.addColorStop(1, '#a6abb5');
    ctx.fillStyle = g; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = 'rgba(80,85,95,.12)'; ctx.lineWidth = 1;
    for (let i = 6; i < w; i += 7) { ctx.beginPath(); ctx.moveTo(x + i, y); ctx.lineTo(x + i, y + h); ctx.stroke(); }
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fillRect(x + (side < 0 ? w - 20 : 10), y + 10, 6, h - 20);
    ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
    ctx.restore();
  }

  function drawIndicator(ctx, s, t) {
    const x = CX - 110, y = 112, w = 220, h = 46;
    ctx.fillStyle = '#26232b'; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#8c909a'; ctx.lineWidth = 3; ctx.strokeRect(x, y, w, h);
    ctx.font = `900 15px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let i = 1; i <= 10; i++) {
      const on = i === s.floor || (s.phase === 'travel' && i === s.floor + 1 && (t >> 3) % 2);
      ctx.fillStyle = on ? '#ffb02e' : '#4a4550';
      ctx.fillText(String(i), x + 12 + (i - 1) * 21, y + h / 2 + 1);
    }
  }

  function drawHall(ctx, s, t, tags) {
    const tg = root.Sim.target(s);
    const list = s.hall.slice().sort((a, b) => b.d - a.d);
    for (const p of list) {
      const k = root.KINDS[p.kind];
      let x = passX(p), y = L.hallY, sc = 1, sx = 1, sy = 1, alpha = 1;
      if (p.state === 'enter') x = CX + p.side * 48 * (1 - Math.min(1, p.sf / 8));
      let face = k.zombie ? 'zombie' : 'calm';
      const run = p.state === 'walk' || p.state === 'leave' || p.state === 'thrown';
      if (p.state === 'enter') {
        const e = Math.min(1, p.sf / C().ENTER_F);
        y = L.hallY - (L.hallY - (L.doorY + L.doorH - 20)) * e; sc = 1 - 0.28 * e;
        if (!k.zombie) face = 'happy';
      } else if (p.state === 'bonk') {
        y = L.hallY - 8; face = k.zombie ? 'zpain' : 'pain';
        sx = p.sf < 8 ? 1.25 : 1; sy = p.sf < 8 ? 0.8 : 1;
        x = CX + p.side * (6 + Math.min(1, p.sf / 6) * 10);
      } else if (p.state === 'leave') face = k.zombie ? 'zpain' : 'sad';
      else if (p.state === 'thrown') { face = 'zpain'; y = L.hallY - Math.max(0, 140 - p.d) * 0.8; }
      else if (p.state === 'wait' && !k.zombie && p.waitF > 20) face = 'angry';
      if (p.state === 'leave' || p.state === 'thrown') alpha = Math.max(0, 1 - (p.d - 240) / 120);
      sc *= 0.92 + 0.08 * (1 - Math.min(1, p.d / 330));
      ctx.save(); ctx.globalAlpha = alpha;
      const facing = p.state === 'leave' || p.state === 'thrown' ? p.side : -p.side;
      drawPerson(ctx, p.kind, x, y, sc, { face, t, id: p.id, run, facing, sx, sy, unmask: p.state === 'bonk' || p.state === 'thrown' });
      ctx.restore();
      const top = y - personH(p.kind) * sc;
      if (p.state === 'bonk' && k.zombie) {
        for (let i = 0; i < 3; i++) { const a = t * 0.15 + i * 2.09; star(ctx, x + Math.cos(a) * 30, top - 6 + Math.sin(a) * 8, 8, '#ffe14d'); }
      }
      // 決めた印。○は乗せる、✕は締め出す
      if ((p.dec === 'open' || p.dec === 'close') && (p.state === 'walk' || p.state === 'wait')) decMark(ctx, p.dec, x, top - 24);
      // 次に決める相手には矢印。扉の前で待つ間は残り時間の輪
      if (p === tg) {
        const by = top - 30 + Math.sin(t * 0.25) * 5;
        ctx.fillStyle = '#ffe14d'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x - 16, by - 18); ctx.lineTo(x + 16, by - 18); ctx.lineTo(x, by); ctx.closePath(); ctx.fill(); ctx.stroke();
        if (p.state === 'wait') {
          const r = Math.max(0, 1 - p.waitF / root.Sim.waitLimit(s));
          ctx.lineWidth = 7; ctx.strokeStyle = INK;
          ctx.beginPath(); ctx.arc(x, by - 46, 18, 0, 6.28); ctx.stroke();
          ctx.lineWidth = 5; ctx.strokeStyle = r < 0.35 ? '#ff5a4a' : '#ffe14d';
          ctx.beginPath(); ctx.arc(x, by - 46, 18, -Math.PI / 2, -Math.PI / 2 + r * 6.28); ctx.stroke();
        }
      }
      if (tags[p.id] && (p.state === 'walk' || p.state === 'wait')) drawTag(ctx, tags[p.id].text, x, top - (p === tg ? 104 : 56));
    }
  }
  function decMark(ctx, dec, x, y) {
    ctx.lineCap = 'round';
    if (dec === 'open') {
      ctx.strokeStyle = INK; ctx.lineWidth = 12; ctx.beginPath(); ctx.arc(x, y, 16, 0, 6.28); ctx.stroke();
      ctx.strokeStyle = '#3fc06a'; ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(x, y, 16, 0, 6.28); ctx.stroke();
    } else {
      for (const [lw, col] of [[12, INK], [7, '#e8402e']]) {
        ctx.strokeStyle = col; ctx.lineWidth = lw;
        ctx.beginPath(); ctx.moveTo(x - 14, y - 14); ctx.lineTo(x + 14, y + 14); ctx.moveTo(x + 14, y - 14); ctx.lineTo(x - 14, y + 14); ctx.stroke();
      }
    }
  }
  function drawTag(ctx, text, x, y) {
    ctx.font = `800 17px ${FONT}`;
    const w = ctx.measureText(text).width + 20;
    const bx = Math.max(8, Math.min(W - 8 - w, x - w / 2));
    ctx.fillStyle = '#fffbe8'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.roundRect(bx, y - 16, w, 32, 8); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#c8321f'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(text, bx + 10, y);
  }

  function drawHud(ctx, s, t) {
    ctx.fillStyle = '#1e1b24'; ctx.fillRect(0, 0, W, L.hudH);
    ctx.fillStyle = '#c8321f'; ctx.fillRect(0, L.hudH - 5, W, 5);
    // ライフ
    for (let i = 0; i < C().LIVES; i++) heart(ctx, 96 + i * 40, 46, 15, i < s.lives);
    // 進み具合
    const cx = 300;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `900 22px ${FONT}`; ctx.fillStyle = '#f2ead8';
    ctx.fillText(Math.min(10, s.floor) + '階 → 10階', cx, 28);
    for (let i = 1; i <= 10; i++) {
      ctx.fillStyle = i < s.floor ? '#5fd06a' : i === s.floor ? '#ffe14d' : '#3a3640';
      ctx.fillRect(cx - 81 + (i - 1) * 18, 54, 13, 13);
    }
    ctx.textAlign = 'right';
    ctx.font = `700 13px ${FONT}`; ctx.fillStyle = '#a49c90';
    ctx.fillText('乗せた人', W - 14, 22);
    ctx.font = `900 30px ${FONT}`; ctx.fillStyle = '#ffe14d';
    ctx.fillText(s.carried + '人', W - 14, 56);
  }
  function heart(ctx, x, y, r, on) {
    ctx.save(); ctx.translate(x, y);
    ctx.beginPath();
    ctx.moveTo(0, r * 0.9);
    ctx.bezierCurveTo(-r * 1.6, -r * 0.1, -r * 0.8, -r * 1.3, 0, -r * 0.45);
    ctx.bezierCurveTo(r * 0.8, -r * 1.3, r * 1.6, -r * 0.1, 0, r * 0.9);
    ctx.fillStyle = on ? '#ff4b5a' : '#3a3640'; ctx.fill();
    ctx.strokeStyle = on ? INK : '#5a5460'; ctx.lineWidth = 3; ctx.stroke();
    ctx.restore();
  }
  function drawPanel(ctx) {
    const g = ctx.createLinearGradient(0, L.panelY, 0, H);
    g.addColorStop(0, '#9da3ad'); g.addColorStop(1, '#6d727c');
    ctx.fillStyle = g; ctx.fillRect(0, L.panelY, W, H - L.panelY);
    ctx.fillStyle = INK; ctx.fillRect(0, L.panelY, W, 4);
  }
  function drawTravel(ctx, t) {
    ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 3;
    for (let i = 0; i < 10; i++) {
      const x = (i * 97 + t * 3) % W, y0 = ((t * 18 + i * 131) % (L.panelY - 100)) + 100;
      ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y0 + 40); ctx.stroke();
    }
    bigText(ctx, '上へまいります', CX, L.floorY + 80, 32, '#fff');
  }
  function drawOver(ctx, s, t, why) {
    const k = Math.min(1, s.phaseF / 15);
    ctx.fillStyle = `rgba(30,0,10,${0.85 * k})`; ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2, 600); ctx.scale(2.4, 2.4);
    drawPerson(ctx, why === 'zombie' ? 'zombie' : 'salary', 0, 0, 1, { face: why === 'zombie' ? 'zombie' : 'angry', t, id: 2, facing: 1, run: why === 'zombie' });
    ctx.restore();
    bigText(ctx, 'ゲームオーバー', W / 2, 220, 64, '#ff5a4a');
    bigText(ctx, why === 'zombie' ? 'エレベーターがゾンビだらけ' : why === 'timeout' ? 'お客さんが怒って帰った' : '人間を締め出しすぎた', W / 2, 300, 30, '#fff');
    if (s.phaseF > C().OVER_SKIP_F) bigText(ctx, 'タップでこの階からやり直し', W / 2, 700, 26, '#ffe14d');
  }
  function bigText(ctx, text, x, y, size, color) {
    ctx.font = `900 ${size}px ${FONT}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(6, size / 6); ctx.strokeStyle = INK; ctx.strokeText(text, x, y);
    ctx.fillStyle = color; ctx.fillText(text, x, y);
  }
  function star(ctx, x, y, r, col) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.closePath(); ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.stroke();
  }

  // ---------- 客の絵 ----------
  // 足元 (x, y) を基準に右向きで描く。紛らわしい組は、手がかり(コーヒー、かばん、緑の耳と手)を大きく描く
  function personH(kind) { return { obachan: 120, pack: 140, maskz: 140 }[kind] || 150; }

  function drawPerson(ctx, kind, x, y, sc, o) {
    o = o || {};
    const t = o.t || 0, run = !!o.run;
    const k = root.KINDS[kind] || {};
    // ゾンビはぎくしゃく歩く
    const ph = run ? (t * (k.zombie ? 0.18 : 0.3) + (o.id || 0)) : 0;
    const bob = run ? Math.abs(Math.sin(ph)) * (k.zombie ? 3 : 6) : Math.sin(t * 0.05 + (o.id || 0)) * 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(sc * (o.sx || 1) * (o.facing || 1), sc * (o.sy || 1));
    if (k.zombie && run) ctx.rotate(Math.sin(ph) * 0.06);
    ctx.fillStyle = 'rgba(0,0,0,.22)';
    ctx.beginPath(); ctx.ellipse(0, 2, 40, 9, 0, 0, 6.28); ctx.fill();
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    (DRAW[kind] || DRAW.salary)(ctx, { ...o, ph, bob, run, zombie: k.zombie });
    ctx.restore();
  }

  function legs(ctx, ph, run, col, len, gap, shoe, stiff) {
    const sw = run ? Math.sin(ph) * (stiff ? 0.35 : 0.7) : 0;
    for (const s of [-1, 1]) {
      ctx.save(); ctx.translate(s * gap, -len); ctx.rotate(sw * s);
      ctx.fillStyle = col; ctx.strokeStyle = INK; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.roundRect(-8, 0, 16, len, 6); ctx.fill(); ctx.stroke();
      ctx.fillStyle = shoe || INK; ctx.beginPath(); ctx.ellipse(6, len - 2, 13, 7, 0, 0, 6.28); ctx.fill();
      ctx.restore();
    }
  }
  function head(ctx, x, y, r, skin) {
    ctx.fillStyle = skin; ctx.strokeStyle = INK; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.28); ctx.fill(); ctx.stroke();
  }
  function arm(ctx, sx, sy, ang, len, col, hand) {
    ctx.save(); ctx.translate(sx, sy); ctx.rotate(ang);
    ctx.fillStyle = col; ctx.strokeStyle = INK; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.roundRect(-7, 0, 14, len, 6); ctx.fill(); ctx.stroke();
    if (hand) { ctx.fillStyle = hand; ctx.beginPath(); ctx.arc(0, len + 3, 8, 0, 6.28); ctx.fill(); ctx.stroke(); }
    ctx.restore();
  }
  // 顔は右向き
  function face(ctx, x, y, r, f) {
    ctx.fillStyle = INK; ctx.strokeStyle = INK; ctx.lineWidth = 3;
    const ex = x + r * 0.42, ey = y - r * 0.1;
    switch (f) {
      case 'zombie': case 'zpain':
        // 白目で片目が大きい。ぎざぎざの口
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(ex, ey, f === 'zpain' ? 4 : 7, 0, 6.28); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(ex - 12, ey - 2, 4, 0, 6.28); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#5a1a1a';
        ctx.beginPath(); ctx.moveTo(x + r * 0.2, y + r * 0.4); ctx.lineTo(x + r * 0.85, y + r * 0.3); ctx.lineTo(x + r * 0.7, y + r * 0.7); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.fillRect(x + r * 0.35, y + r * 0.38, 4, 5); ctx.fillRect(x + r * 0.55, y + r * 0.35, 4, 5);
        break;
      case 'pain':
        ctx.beginPath(); ctx.moveTo(ex - 7, ey - 6); ctx.lineTo(ex + 3, ey); ctx.lineTo(ex - 7, ey + 6); ctx.stroke();
        ctx.beginPath(); ctx.ellipse(x + r * 0.5, y + r * 0.45, 7, 10, 0, 0, 6.28); ctx.fill();
        break;
      case 'angry':
        ctx.beginPath(); ctx.moveTo(ex - 10, ey - 12); ctx.lineTo(ex + 6, ey - 4); ctx.stroke();
        ctx.beginPath(); ctx.arc(ex, ey + 2, 4, 0, 6.28); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x + r * 0.25, y + r * 0.5); ctx.lineTo(x + r * 0.75, y + r * 0.42); ctx.stroke();
        break;
      case 'happy':
        ctx.beginPath(); ctx.arc(ex, ey + 2, 5, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
        ctx.beginPath(); ctx.arc(x + r * 0.5, y + r * 0.3, 8, 0.2, Math.PI - 0.2); ctx.stroke();
        break;
      case 'sad':
        ctx.beginPath(); ctx.arc(ex, ey, 3.5, 0, 6.28); ctx.fill();
        ctx.beginPath(); ctx.arc(x + r * 0.5, y + r * 0.62, 7, Math.PI + 0.3, -0.3); ctx.stroke();
        ctx.fillStyle = '#7fc8ff'; ctx.beginPath(); ctx.ellipse(ex - 2, ey + 9, 3, 5, 0, 0, 6.28); ctx.fill();
        break;
      case 'scared':
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex, ey, 7, 0, 6.28); ctx.fill(); ctx.stroke();
        ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(ex + 1, ey, 2.5, 0, 6.28); ctx.fill();
        ctx.beginPath(); ctx.ellipse(x + r * 0.5, y + r * 0.5, 6, 9, 0, 0, 6.28); ctx.fill();
        break;
      case 'tired':
        // 半目とくま
        ctx.beginPath(); ctx.moveTo(ex - 7, ey); ctx.lineTo(ex + 6, ey); ctx.stroke();
        ctx.strokeStyle = '#6a5a7a'; ctx.beginPath(); ctx.arc(ex, ey + 4, 6, 0.2, Math.PI - 0.2); ctx.stroke();
        ctx.strokeStyle = INK; ctx.beginPath(); ctx.moveTo(x + r * 0.35, y + r * 0.5); ctx.lineTo(x + r * 0.65, y + r * 0.52); ctx.stroke();
        break;
      default:
        ctx.beginPath(); ctx.arc(ex, ey, 4, 0, 6.28); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x + r * 0.35, y + r * 0.5); ctx.lineTo(x + r * 0.68, y + r * 0.46); ctx.stroke();
    }
  }

  const SKIN = '#f3c9a2', ZSKIN = '#8fbf5e', PALE = '#cfd6b8';
  const DRAW = {
    salary(ctx, o) {
      legs(ctx, o.ph, o.run, '#2b3550', 46, 9);
      ctx.translate(0, -o.bob);
      const sw = o.run ? Math.sin(o.ph) * 0.9 : 0.1;
      arm(ctx, -6, -98, sw + 0.2, 42, '#33406a', SKIN);
      ctx.save(); ctx.translate(-6, -98); ctx.rotate(sw + 0.2); ctx.fillStyle = '#5a3a22'; ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.fillRect(-14, 44, 28, 20); ctx.strokeRect(-14, 44, 28, 20); ctx.restore();
      suit(ctx, '#33406a', '#c8321f');
      arm(ctx, 4, -98, -sw + 0.2, 42, '#3b4a78', SKIN);
      head(ctx, 2, -124, 26, SKIN);
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(2, -130, 27, Math.PI * 1.05, Math.PI * 1.95); ctx.lineTo(18, -138); ctx.fill();
      face(ctx, 2, -124, 26, o.face === 'zombie' ? 'calm' : o.face);
    },
    // スーツゾンビ:体はサラリーマンと同じ。緑の手を前に突き出す
    suitz(ctx, o) {
      legs(ctx, o.ph, o.run, '#2b3550', 46, 9, INK, true);
      ctx.translate(0, -o.bob);
      arm(ctx, -2, -96, -1.45, 46, '#33406a', ZSKIN);
      suit(ctx, '#33406a', '#c8321f', true);
      arm(ctx, 6, -92, -1.6, 46, '#3b4a78', ZSKIN);
      head(ctx, 2, -124, 26, ZSKIN);
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(2, -130, 27, Math.PI * 1.05, Math.PI * 1.95); ctx.lineTo(18, -138); ctx.fill();
      face(ctx, 2, -124, 26, o.face === 'zpain' ? 'zpain' : 'zombie');
    },
    // 徹夜明け:顔色が悪く前かがみ。手にコーヒー
    tetsuya(ctx, o) {
      legs(ctx, o.ph, o.run, '#3a3f4a', 44, 9, INK, true);
      ctx.translate(0, -o.bob);
      ctx.rotate(0.12);
      arm(ctx, -4, -96, 0.15, 42, '#e8e8ee', PALE);
      ctx.fillStyle = '#e8e8ee'; ctx.strokeStyle = INK; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.roundRect(-20, -102, 40, 60, 10); ctx.fill(); ctx.stroke();
      // ゆるんだネクタイ
      ctx.fillStyle = '#4a6ab0'; ctx.save(); ctx.translate(12, -96); ctx.rotate(0.4); ctx.fillRect(-3, 0, 6, 24); ctx.restore();
      arm(ctx, 6, -94, -1.2, 34, '#e8e8ee', PALE);
      // コーヒー(手がかり)
      ctx.save(); ctx.translate(40, -112);
      ctx.fillStyle = '#fff'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-10, -14); ctx.lineTo(10, -14); ctx.lineTo(7, 12); ctx.lineTo(-7, 12); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#8a5a3a'; ctx.fillRect(-8, -4, 16, 8);
      ctx.strokeStyle = '#aaa'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-3, -20); ctx.quadraticCurveTo(2, -26, -2, -32); ctx.moveTo(4, -20); ctx.quadraticCurveTo(9, -26, 5, -32); ctx.stroke();
      ctx.restore();
      head(ctx, 2, -122, 26, PALE);
      ctx.fillStyle = '#333'; // ぼさぼさ頭
      for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(-22 + i * 8, -138); ctx.lineTo(-18 + i * 8, -156 + (i % 2) * 6); ctx.lineTo(-12 + i * 8, -138); ctx.fill(); }
      ctx.beginPath(); ctx.arc(2, -128, 27, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
      face(ctx, 2, -122, 26, o.face === 'calm' ? 'tired' : o.face);
    },
    zombie(ctx, o) {
      legs(ctx, o.ph, o.run, '#6a5a4a', 44, 9, '#3a2a1a', true);
      ctx.translate(0, -o.bob);
      arm(ctx, -2, -96, -1.4, 46, '#8a8a7a', ZSKIN);
      // ぼろぼろの服
      ctx.fillStyle = '#9a9a8a'; ctx.strokeStyle = INK; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(-20, -102); ctx.lineTo(20, -102); ctx.lineTo(22, -46); ctx.lineTo(12, -52); ctx.lineTo(4, -44); ctx.lineTo(-6, -52); ctx.lineTo(-16, -44); ctx.lineTo(-22, -50); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#7a3a2a'; ctx.fillRect(-8, -80, 10, 6); ctx.fillRect(6, -66, 8, 5);
      arm(ctx, 6, -92, -1.6, 46, '#8a8a7a', ZSKIN);
      head(ctx, 2, -124, 26, ZSKIN);
      ctx.fillStyle = '#3a4a2a';
      ctx.beginPath(); ctx.moveTo(-24, -128); ctx.lineTo(-14, -152); ctx.lineTo(-6, -140); ctx.lineTo(4, -154); ctx.lineTo(10, -140); ctx.lineTo(20, -150); ctx.lineTo(26, -128); ctx.fill();
      face(ctx, 2, -124, 26, o.face === 'zpain' ? 'zpain' : 'zombie');
    },
    obachan(ctx, o) {
      legs(ctx, o.ph, o.run, '#8a7a90', 26, 8, '#4a3a2a');
      ctx.translate(0, -o.bob * 0.5);
      ctx.strokeStyle = '#6a3f2a'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(30, -60); ctx.lineTo(36 + (o.run ? Math.sin(o.ph) * 6 : 0), 0); ctx.stroke();
      ctx.save(); ctx.rotate(0.25);
      ctx.fillStyle = '#8c4fa8'; ctx.strokeStyle = INK; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.roundRect(-20, -82, 40, 56, 14); ctx.fill(); ctx.stroke();
      arm(ctx, 8, -76, -0.9, 34, '#9c5fb8', '#f0c9a6');
      head(ctx, 14, -92, 22, '#f0c9a6');
      ctx.fillStyle = '#d8d4d8'; ctx.strokeStyle = INK; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(14, -98, 23, Math.PI * 0.95, Math.PI * 2.05); ctx.fill();
      ctx.beginPath(); ctx.arc(-6, -110, 10, 0, 6.28); ctx.fill(); ctx.stroke();
      face(ctx, 14, -92, 22, o.face === 'calm' ? 'happy' : o.face);
      ctx.restore();
    },
    // 顔パック:顔は真っ白だが人間。カーラーと手さげかばん
    pack(ctx, o) {
      legs(ctx, o.ph, o.run, '#e89ab0', 34, 8, '#a0405a');
      ctx.translate(0, -o.bob * 0.7);
      const sw = o.run ? Math.sin(o.ph) * 0.7 : 0.1;
      ctx.fillStyle = '#f08aa8'; ctx.strokeStyle = INK; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(-18, -94); ctx.lineTo(18, -94); ctx.lineTo(26, -34); ctx.lineTo(-26, -34); ctx.closePath(); ctx.fill(); ctx.stroke();
      arm(ctx, 4, -90, -sw * 0.5 + 0.3, 36, '#f08aa8', SKIN);
      // 手さげかばん(手がかり)
      ctx.save(); ctx.translate(4, -90); ctx.rotate(-sw * 0.5 + 0.3);
      ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 44, 9, Math.PI, 0); ctx.stroke();
      ctx.fillStyle = '#e0b040'; ctx.beginPath(); ctx.roundRect(-14, 44, 28, 22, 4); ctx.fill(); ctx.stroke();
      ctx.restore();
      head(ctx, 2, -114, 24, '#ffffff');
      // パックの目と口の穴
      ctx.fillStyle = SKIN; ctx.beginPath(); ctx.ellipse(14, -118, 6, 5, 0, 0, 6.28); ctx.fill(); ctx.beginPath(); ctx.ellipse(14, -102, 6, 3, 0, 0, 6.28); ctx.fill();
      ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(15, -118, 2.5, 0, 6.28); ctx.fill();
      // カーラー
      for (const [cx, cy] of [[-14, -136], [-2, -140], [10, -138], [-20, -122]]) { ctx.fillStyle = '#7fc8ff'; ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.beginPath(); ctx.roundRect(cx - 6, cy - 5, 12, 10, 3); ctx.fill(); ctx.stroke(); }
    },
    // マスクゾンビ:人の顔のお面。耳と首と手が緑
    maskz(ctx, o) {
      legs(ctx, o.ph, o.run, '#6a6a7a', 34, 8, INK, true);
      ctx.translate(0, -o.bob);
      ctx.fillStyle = '#c07a3a'; ctx.strokeStyle = INK; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.roundRect(-20, -98, 40, 64, 12); ctx.fill(); ctx.stroke();
      arm(ctx, 2, -92, 0.05, 38, '#c07a3a', ZSKIN);
      // 緑の首と耳(手がかり)
      ctx.fillStyle = ZSKIN; ctx.fillRect(-8, -104, 16, 10); ctx.strokeRect(-8, -104, 16, 10);
      head(ctx, 2, -122, 24, ZSKIN);
      ctx.beginPath(); ctx.ellipse(-16, -120, 7, 11, 0, 0, 6.28); ctx.fillStyle = ZSKIN; ctx.fill(); ctx.stroke();
      if (!o.unmask) {
        // 人の顔のお面。にこにこ
        ctx.fillStyle = SKIN; ctx.strokeStyle = INK; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.ellipse(10, -122, 18, 21, 0, 0, 6.28); ctx.fill(); ctx.stroke();
        ctx.fillStyle = INK; ctx.beginPath(); ctx.arc(16, -128, 3, 0, 6.28); ctx.fill();
        ctx.beginPath(); ctx.arc(16, -114, 7, 0.2, Math.PI - 0.2); ctx.stroke();
        ctx.fillStyle = '#f0a0a0'; ctx.beginPath(); ctx.arc(8, -118, 4, 0, 6.28); ctx.fill();
        ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-6, -126); ctx.lineTo(-16, -128); ctx.stroke();
      } else face(ctx, 2, -122, 24, 'zpain');
      ctx.fillStyle = '#5a4a3a'; ctx.beginPath(); ctx.arc(2, -132, 24, Math.PI * 1.1, Math.PI * 1.9); ctx.fill();
    },
  };
  function suit(ctx, col, tie, zombie) {
    ctx.fillStyle = col; ctx.strokeStyle = INK; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.roundRect(-20, -104, 40, 62, 10); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(6, -104); ctx.lineTo(18, -104); ctx.lineTo(12, -86); ctx.fill();
    ctx.fillStyle = tie; ctx.fillRect(10, -100, 5, 22);
    if (zombie) { ctx.fillStyle = '#7a3a2a'; ctx.fillRect(-12, -70, 9, 6); }
  }

  R.drawPerson = drawPerson;
  R.L = L;
  root.Render = R;
})(window);
