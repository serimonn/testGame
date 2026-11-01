// 描画と演出。勝負の結果には影響しない。
(function (root) {
  let W = 960, H = 540, CX = 480, CY = 298, portrait = false;
  const P_COLOR = ['#d6402f', '#2e6fd8'];
  const P_DARK = ['#7c1c10', '#143a7c'];
  const MINCHO = '"Yu Mincho","Hiragino Mincho ProN","Noto Serif JP",serif';
  const GOTHIC = '"Yu Gothic","Hiragino Sans","Noto Sans JP",sans-serif';
  const img = {};
  for (const n of ['bg', 'imo', 'omori', 'suka', 'ren', 'taiki']) {
    const i = new Image();
    i.src = 'assets/img/' + n + '.jpg';
    img[n] = i;
  }
  const ok = i => i && i.complete && i.naturalWidth > 0;

  const R = {
    ctx: null, parts: [], texts: [], shake: 0, flash: 0, fv: [], settings: null, banner: null,
    init(canvas, settings) {
      this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.settings = settings;
      this.resize();
      addEventListener('resize', () => this.resize());
    },
    resize() {
      const r = this.canvas.getBoundingClientRect();
      // 縦持ちは幅540基準で、余った高さをそのまま使う
      portrait = r.height > r.width;
      if (portrait) { W = 540; H = Math.round(Math.max(760, Math.min(1170, 540 * r.height / r.width))); CX = 270; CY = Math.round(H * 0.5); }
      else { W = 960; H = 540; CX = 480; CY = 298; }
      const s = Math.min(2, Math.max(1, (r.width / W) * (devicePixelRatio || 1)));
      this.canvas.width = W * s; this.canvas.height = H * s; this.scale = s;
    },
    reset() { this.parts = []; this.texts = []; this.shake = 0; this.flash = 0; this.banner = null; this.fv = [{ sq: 0, hit: 0, face: 0, fly: 0 }, { sq: 0, hit: 0, face: 0, fly: 0 }]; },

    // sim のイベントを演出にする
    onEvent(e, s) {
      const st = this.settings;
      if (e.t === 'fire') {
        const n = e.silent ? 5 : 5 + Math.round(e.p * 14);
        for (let i = 0; i < n; i++) {
          const a = e.a + (Math.random() - 0.5) * 1.0, sp = (60 + Math.random() * 300) * Math.min(1.4, e.p + 0.3);
          this.parts.push({ k: 'puff', x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 7 + Math.random() * 16 * (e.p + 0.3), life: 26 + Math.random() * 26, age: 0, off: Math.random() * 6, silent: e.silent });
        }
        if (e.p > 0.55 && !e.silent) this.parts.push({ k: 'ring', x: e.x, y: e.y, r: 12, grow: 7 + e.p * 6, life: 16, age: 0, col: '#fff3b0' });
        this.fv[e.i].sq = 1;
        if (e.over) { this.addShake(14); }
        else if (e.crit) { this.addShake(10); this.doFlash(0.5); }
        else this.addShake(e.p * 4);
        if (st.onomatopoeia) {
          const txt = e.silent ? '…スッ' : e.over ? 'ブバババババ!!' : e.crit ? 'ブボォォン!!' : e.c > 0.65 ? 'ブオォッ!' : e.c > 0.3 ? 'ブッ!' : 'プッ';
          const size = e.silent ? 20 : e.over ? 54 : e.crit ? 64 : e.c > 0.65 ? 44 : e.c > 0.3 ? 32 : 22;
          this.pop(txt, e.x + Math.cos(e.a) * 40, e.y + Math.sin(e.a) * 40, size, e.crit ? '#ffe14d' : '#fff', e.a);
        }
      } else if (e.t === 'hit') {
        const v = this.fv[e.i]; v.hit = 14; v.face = 40; v.hitA = e.a;
        this.burst(e.x, e.y, e.a, e.crit ? 16 : 8);
        this.addShake(e.p * 10);
        if (e.crit) { this.pop('会心!', e.x, e.y - 50, 48, '#ffe14d'); this.doFlash(0.6); }
      } else if (e.t === 'parry') {
        this.burst(e.x, e.y, 0, 20);
        this.parts.push({ k: 'ring', x: e.x, y: e.y, r: 20, grow: 16, life: 18, age: 0, col: '#9ff' });
        this.pop('屁返し!!', e.x, e.y - 56, 56, '#8ff');
        this.addShake(10); this.doFlash(0.6);
      } else if (e.t === 'bump') {
        this.burst(e.x, e.y, 0, 5);
        this.fv[0].sq = 0.5; this.fv[1].sq = 0.5;
        this.addShake(Math.min(5, e.rel / 40));
      } else if (e.t === 'imo') {
        this.pop('芋!', e.x, e.y - 20, 34, '#d58cff');
      } else if (e.t === 'gust') {
        this.pop('風!', e.dx * 150, e.dy * 150, 54, '#bfefff');
      } else if (e.t === 'go') {
        this.pop('のこった!', 0, -120, 72, '#fff', undefined, MINCHO);
      } else if (e.t === 'ko') {
        for (const f of s.f) if (f.out) { this.fv[f.idx].face = 999; this.fv[f.idx].fly = 0.001; }
        this.addShake(18); this.doFlash(0.9);
      }
    },
    addShake(n) { this.shake = Math.max(this.shake, n); },
    doFlash(a) { if (!this.settings.lowFlash) this.flash = Math.max(this.flash, a); },
    pop(txt, x, y, size, col, ang, font) { this.texts.push({ txt, x, y, size, col, age: 0, life: 42, font: font || GOTHIC, dx: ang === undefined ? 0 : Math.cos(ang) * 0.8, dy: ang === undefined ? -0.5 : Math.sin(ang) * 0.8 - 0.3 }); },
    burst(x, y, a, n) {
      for (let i = 0; i < n; i++) {
        const t = Math.random() * 6.28, sp = 120 + Math.random() * 320;
        this.parts.push({ k: 'star', x, y, vx: Math.cos(t) * sp, vy: Math.sin(t) * sp, r: 4 + Math.random() * 6, life: 16 + Math.random() * 12, age: 0, col: i % 3 ? '#fff' : '#1c1410' });
      }
    },
    tick(s) {
      this.shake *= 0.86; if (this.shake < 0.2) this.shake = 0;
      this.flash *= 0.8;
      for (const p of this.parts) {
        p.age++;
        if (p.vx !== undefined) { p.x += p.vx / 60; p.y += p.vy / 60; p.vx *= 0.92; p.vy *= 0.92; }
        if (p.grow) p.r += p.grow;
      }
      this.parts = this.parts.filter(p => p.age < p.life);
      for (const t of this.texts) { t.age++; t.x += t.dx; t.y += t.dy; }
      this.texts = this.texts.filter(t => t.age < t.life);
      for (const v of this.fv) {
        v.sq *= 0.82; if (v.hit > 0) v.hit--; if (v.face > 0 && v.face < 999) v.face--;
        if (v.fly) v.fly = Math.min(1, v.fly + 0.02);
      }
      // 暴発が近い力士から漏れるガス
      if (s) for (const f of s.f) {
        if (f.charging && !f.ch.silent && f.c > root.CFG.DANGER_C && Math.random() < 0.4) {
          const a = f.a + Math.PI + (Math.random() - 0.5) * 0.8;
          this.parts.push({ k: 'puff', x: f.x - Math.cos(f.a) * f.r, y: f.y - Math.sin(f.a) * f.r, vx: Math.cos(a) * 60, vy: Math.sin(a) * 60, r: 4 + Math.random() * 5, life: 18, age: 0, off: 0 });
        }
      }
    },

    draw(s, m) {
      const ctx = this.ctx, k = this.scale;
      ctx.setTransform(k, 0, 0, k, 0, 0);
      this.drawBg(ctx);
      if (!s) return;
      const amp = this.shake * this.settings.shake;
      ctx.save();
      ctx.translate(CX + (Math.random() - 0.5) * amp * 2, CY + (Math.random() - 0.5) * amp * 2);
      this.drawRing(ctx, s);
      if (s.imo) this.drawImo(ctx, s.imo, s.frame);
      for (const f of s.f) this.drawAim(ctx, f, s);
      const order = s.f.slice().sort((a, b) => (this.fv[a.idx].fly || 0) - (this.fv[b.idx].fly || 0));
      for (const f of order) this.drawFighter(ctx, f, this.fv[f.idx], s, m);
      for (const p of this.parts) this.drawPart(ctx, p);
      for (const w of s.waves) this.drawWave(ctx, w);
      if (s.gust) {
        ctx.strokeStyle = '#d8f6ffaa'; ctx.lineWidth = 3;
        for (let i = 0; i < 10; i++) {
          const t = (s.frame * 7 + i * 83) % 500 - 250, o = (i * 61) % 400 - 200;
          const x = s.gust.dx * t - s.gust.dy * o, y = s.gust.dy * t + s.gust.dx * o;
          ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + s.gust.dx * 50, y + s.gust.dy * 50); ctx.stroke();
        }
      }
      for (const t of this.texts) this.drawText(ctx, t);
      ctx.restore();
      if (this.flash > 0.02) { ctx.fillStyle = `rgba(255,255,240,${this.flash * 0.5})`; ctx.fillRect(0, 0, W, H); }
      this.drawHud(ctx, s, m);
      if (m.koF !== undefined && s.phase === 'end' && s.stop === 0) this.drawKo(ctx, s, m);
    },
    drawBg(ctx) {
      if (ok(img.bg)) {
        const b = img.bg, k = Math.max((W + 40) / b.naturalWidth, (H + 40) / b.naturalHeight);
        ctx.drawImage(b, (W - b.naturalWidth * k) / 2, (H - b.naturalHeight * k) / 2, b.naturalWidth * k, b.naturalHeight * k);
      }
      else { ctx.fillStyle = '#2b1d14'; ctx.fillRect(0, 0, W, H); }
      ctx.fillStyle = '#0006'; ctx.fillRect(0, 0, W, H);
    },
    drawRing(ctx, s) {
      const c = root.CFG;
      // 土台
      ctx.fillStyle = '#3d2a1a'; ctx.beginPath(); ctx.arc(0, 0, c.RING_R + 22, 0, 6.3); ctx.fill();
      // 崩れた部分
      ctx.fillStyle = '#20150d'; ctx.beginPath(); ctx.arc(0, 0, c.RING_R + 8, 0, 6.3); ctx.fill();
      // 土
      const g = ctx.createRadialGradient(-60, -70, 20, 0, 0, s.R);
      g.addColorStop(0, '#d9b67c'); g.addColorStop(1, '#a9844f');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, s.R, 0, 6.3); ctx.fill();
      // 俵
      ctx.setLineDash([26, 4]); ctx.lineWidth = 11; ctx.strokeStyle = '#efe4b4'; ctx.beginPath(); ctx.arc(0, 0, s.R, 0, 6.3); ctx.stroke();
      ctx.setLineDash([]); ctx.lineWidth = 2; ctx.strokeStyle = '#5b4524'; ctx.beginPath(); ctx.arc(0, 0, s.R + 6, 0, 6.3); ctx.stroke();
      ctx.beginPath(); ctx.arc(0, 0, s.R - 6, 0, 6.3); ctx.stroke();
      // 仕切り線
      if (s.R > 80) {
        ctx.strokeStyle = '#fffbe8'; ctx.lineWidth = 6;
        for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sx * 40, -26); ctx.lineTo(sx * 40, 26); ctx.stroke(); }
      }
    },
    drawImo(ctx, im, fr) {
      ctx.save(); ctx.translate(im.x, im.y); ctx.rotate(Math.sin(fr * 0.1) * 0.25);
      const sc = 1 + Math.sin(fr * 0.15) * 0.08; ctx.scale(sc, sc);
      ctx.fillStyle = '#fff5'; ctx.beginPath(); ctx.arc(0, 0, 22, 0, 6.3); ctx.fill();
      ctx.fillStyle = '#7d2f8e'; ctx.strokeStyle = '#2a0d33'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(0, 0, 17, 10, 0.3, 0, 6.3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ffd66b'; ctx.beginPath(); ctx.ellipse(10, 3, 6, 6, 0.3, 0, 6.3); ctx.fill();
      ctx.restore();
    },
    drawAim(ctx, f, s) {
      const c = root.CFG;
      if (!f.charging || f.ch.silent || s.phase !== 'fight') return;
      const crit = f.c >= c.CRIT_C, danger = f.c >= c.DANGER_C;
      const range = c.RANGE_MIN + (c.RANGE_MAX - c.RANGE_MIN) * f.c;
      const b = f.a + Math.PI, ox = f.x - Math.cos(f.a) * f.r, oy = f.y - Math.sin(f.a) * f.r;
      ctx.fillStyle = crit ? 'rgba(255,255,255,.42)' : danger ? 'rgba(235,70,40,.32)' : 'rgba(226,214,90,.3)';
      ctx.strokeStyle = crit ? '#fff' : danger ? '#e84a2c' : '#e2d65a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(ox, oy); ctx.arc(ox, oy, range, b - c.CONE_HALF, b + c.CONE_HALF); ctx.closePath(); ctx.fill(); ctx.stroke();
      // 反動で飛ぶ先
      const d = root.Sim.recoilDist(f), tx = f.x + Math.cos(f.a) * d, ty = f.y + Math.sin(f.a) * d;
      const fall = Math.hypot(tx, ty) > s.R;
      ctx.setLineDash([6, 6]); ctx.lineWidth = 3; ctx.strokeStyle = fall ? '#ff3b20' : '#ffffffcc';
      ctx.beginPath(); ctx.moveTo(f.x, f.y); ctx.lineTo(tx, ty); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = fall ? '#ff3b20' : '#fff'; ctx.font = `900 ${fall ? 26 : 15}px ${GOTHIC}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(fall ? '✕' : '●', tx, ty);
    },
    drawFighter(ctx, f, v, s, m) {
      const c = root.CFG;
      let sx = 0, sy = 0;
      if (s.stop > 0 && v.hit > 0) {
        const n = s.stop / 14;
        sx = (Math.random() - 0.5) * 16 * n; sy = (Math.random() - 0.5) * 16 * n;
      }
      if (f.charging && f.c > c.DANGER_C && !f.ch.silent) { const q = (f.c - c.DANGER_C) * 12; sx += (Math.random() - 0.5) * q; sy += (Math.random() - 0.5) * q; }
      const flyS = 1 + (v.fly || 0) * 1.6;
      const scale = f.r / 32;
      ctx.save(); ctx.translate(f.x + sx, f.y + sy);
      if (!v.fly) { ctx.fillStyle = '#0005'; ctx.beginPath(); ctx.ellipse(0, 7, f.r + 12, f.r + 8, 0, 0, 6.3); ctx.fill(); }
      const label = m.labels[f.idx], tagY = -(f.r + 32);
      ctx.save();
      ctx.scale(flyS * scale, flyS * scale);
      ctx.rotate(f.a + (v.fly || 0) * s.phaseF * 0.3);
      ctx.scale(1 - v.sq * 0.25 + (f.charging ? f.c * 0.05 : 0), 1 + v.sq * 0.35);
      this.drawBody(ctx, f, v);
      ctx.restore();
      if (!v.fly) {
        ctx.font = `900 15px ${GOTHIC}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 4; ctx.strokeStyle = '#000'; ctx.fillStyle = f.idx === 0 ? '#ff9b8b' : '#9ec2ff';
        const mark = f.idx === 0 ? '▲' : '◆';
        ctx.strokeText(mark + label, 0, tagY); ctx.fillText(mark + label, 0, tagY);
        if (f.imo) { ctx.fillStyle = '#d58cff'; ctx.strokeText('芋', 0, tagY - 16); ctx.fillText('芋', 0, tagY - 16); }
      }
      ctx.restore();
    },
    drawBody(ctx, f, v) {
      const skin = f.ch.color, ink = '#2a1a10', col = P_COLOR[f.idx], dark = P_DARK[f.idx];
      const bu = 1 + (f.charging && !f.ch.silent ? f.c * 0.55 : 0);
      ctx.lineWidth = 3; ctx.strokeStyle = ink;
      // 腕
      ctx.fillStyle = skin;
      for (const y of [-27, 27]) { ctx.beginPath(); ctx.ellipse(10, y, 15, 8, y > 0 ? -0.5 : 0.5, 0, 6.3); ctx.fill(); ctx.stroke(); }
      // 胴
      ctx.fillStyle = skin;
      ctx.beginPath(); ctx.ellipse(6, 0, 23, 28, 0, 0, 6.3); ctx.fill(); ctx.stroke();
      // 尻(主役なので胴より大きく、割れ目とツヤを描く)
      const rb = 25 * bu, bx = -22 - (bu - 1) * 14, by = 15 + (bu - 1) * 8;
      for (const y of [-by, by]) {
        ctx.fillStyle = skin; ctx.lineWidth = 3; ctx.strokeStyle = ink;
        ctx.beginPath(); ctx.arc(bx, y, rb, 0, 6.3); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ffffff55'; ctx.beginPath(); ctx.ellipse(bx - rb * 0.3, y - rb * 0.3 * Math.sign(y) * -1, rb * 0.35, rb * 0.22, 0.6, 0, 6.3); ctx.fill();
      }
      ctx.lineWidth = 3; ctx.strokeStyle = ink;
      ctx.beginPath(); ctx.moveTo(bx + rb * 0.5, 0); ctx.lineTo(bx - rb * 0.95, 0); ctx.stroke();
      // まわし
      ctx.fillStyle = col; ctx.strokeStyle = dark; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(-1, -29); ctx.quadraticCurveTo(7, 0, -1, 29); ctx.lineTo(-10, 27); ctx.quadraticCurveTo(-3, 0, -10, -27); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.lineWidth = 5; ctx.strokeStyle = col; ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(bx - rb * 0.95, 0); ctx.stroke();
      // 頭
      ctx.lineWidth = 3; ctx.strokeStyle = ink;
      ctx.fillStyle = f.key === 'taiki' ? '#3f8fd9' : skin;
      ctx.beginPath(); ctx.arc(22, 0, 15, 0, 6.3); ctx.fill(); ctx.stroke();
      if (f.key === 'taiki') { ctx.fillStyle = '#58b558'; ctx.beginPath(); ctx.ellipse(17, -4, 6, 5, 0.4, 0, 6.3); ctx.fill(); ctx.beginPath(); ctx.ellipse(26, 6, 4, 3, 0, 0, 6.3); ctx.fill(); }
      else {
        ctx.fillStyle = '#17110c'; ctx.beginPath(); ctx.arc(20, 0, 13.5, 1.75, 4.53); ctx.fill();
        ctx.beginPath(); ctx.ellipse(13, 0, 8, 3.4, 0, 0, 6.3); ctx.fill();
      }
      // 顔
      ctx.strokeStyle = ink; ctx.lineWidth = 2.4;
      if (v.face > 0) {
        for (const y of [-5.5, 5.5]) { // ✕目
          ctx.beginPath(); ctx.moveTo(24, y - 3); ctx.lineTo(30, y + 3); ctx.moveTo(30, y - 3); ctx.lineTo(24, y + 3); ctx.stroke();
        }
        ctx.fillStyle = '#7d1712'; ctx.beginPath(); ctx.ellipse(33, 0, 3.4, 6.5, 0, 0, 6.3); ctx.fill(); ctx.stroke();
      } else {
        ctx.fillStyle = ink;
        for (const y of [-5.5, 5.5]) {
          ctx.beginPath(); ctx.arc(28, y, 1.9, 0, 6.3); ctx.fill();
          ctx.beginPath(); ctx.moveTo(24, y * 1.5); ctx.lineTo(25.5, y * 0.55); ctx.stroke();
        }
        ctx.beginPath(); ctx.moveTo(33, -3.5); ctx.lineTo(33, 3.5); ctx.stroke();
      }
    },
    drawPart(ctx, p) {
      const t = p.age / p.life;
      if (p.k === 'puff') {
        const col = p.silent ? 'rgba(200,210,190,' : 'rgba(170,175,70,';
        const r = p.r * (0.6 + t * 1.1);
        ctx.fillStyle = col + (0.9 * (1 - t)) + ')';
        ctx.strokeStyle = `rgba(70,62,20,${0.8 * (1 - t)})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.3); ctx.fill(); ctx.stroke();
      } else if (p.k === 'ring') {
        ctx.strokeStyle = p.col; ctx.globalAlpha = 1 - t; ctx.lineWidth = 7 * (1 - t) + 1;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.3); ctx.stroke(); ctx.globalAlpha = 1;
      } else if (p.k === 'star') {
        ctx.fillStyle = p.col; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.age * 0.3);
        const r = p.r * (1 - t);
        ctx.fillRect(-r, -r / 3, r * 2, r * 0.66); ctx.fillRect(-r / 3, -r, r * 0.66, r * 2); ctx.restore();
      }
    },
    drawWave(ctx, w) {
      const a = Math.atan2(w.dy, w.dx), hc = root.CFG.CONE_HALF;
      ctx.strokeStyle = w.crit ? '#ffffff' : '#e7e38a'; ctx.lineWidth = w.crit ? 7 : 4;
      ctx.beginPath(); ctx.arc(w.x, w.y, Math.max(1, w.d), a - hc, a + hc); ctx.stroke();
    },
    drawText(ctx, t) {
      const pop = Math.min(1, t.age / 5), sc = 0.4 + pop * (t.age < 8 ? 0.8 : 0.6);
      ctx.save(); ctx.translate(t.x, t.y); ctx.scale(sc, sc);
      ctx.globalAlpha = t.age > t.life - 10 ? (t.life - t.age) / 10 : 1;
      ctx.font = `900 ${t.size}px ${t.font}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = Math.max(5, t.size / 7); ctx.strokeStyle = '#1c1410'; ctx.lineJoin = 'round';
      ctx.strokeText(t.txt, 0, 0); ctx.fillStyle = t.col; ctx.fillText(t.txt, 0, 0);
      ctx.restore();
    },
    drawHud(ctx, s, m) {
      const c = root.CFG;
      ctx.textBaseline = 'middle';
      if (m.rankText) {
        ctx.font = `900 19px ${MINCHO}`; ctx.textAlign = 'center';
        ctx.lineWidth = 4; ctx.strokeStyle = '#000'; ctx.fillStyle = '#ffe9b0';
        const ry = portrait ? 116 : 58;
        ctx.strokeText(m.rankText, W / 2, ry); ctx.fillText(m.rankText, W / 2, ry);
      }
      for (const f of s.f) {
        const left = f.idx === 0, x = left ? 16 : W - 16;
        const pic = img[f.key], pw = 58;
        const px = left ? x : x - pw;
        ctx.fillStyle = '#fff'; ctx.fillRect(px - 2, 12, pw + 4, pw + 4);
        if (ok(pic)) ctx.drawImage(pic, px, 14, pw, pw);
        ctx.strokeStyle = P_COLOR[f.idx]; ctx.lineWidth = 4; ctx.strokeRect(px - 2, 12, pw + 4, pw + 4);
        const tx = left ? x + pw + 10 : x - pw - 10;
        ctx.textAlign = left ? 'left' : 'right';
        ctx.font = `900 24px ${MINCHO}`; ctx.lineWidth = 4; ctx.strokeStyle = '#000'; ctx.fillStyle = '#fff';
        const nm = (left ? '▲' : '◆') + f.ch.name;
        ctx.strokeText(nm, tx, 28); ctx.fillText(nm, tx, 28);
        // 白星
        for (let i = 0; i < m.winsNeed; i++) {
          const ox = tx + (left ? 1 : -1) * (11 + i * 26);
          ctx.beginPath(); ctx.arc(ox, 56, 10, 0, 6.3);
          ctx.fillStyle = i < m.score[f.idx] ? '#fff' : '#0008'; ctx.fill();
          ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
        }
        // 溜めゲージ
        // 縦持ちは自分のゲージを親指の上に大きく出す
        let gw = 210, gh = 18, gx = left ? 16 : W - 16 - gw, gy = H - 34;
        if (portrait) {
          if (left) { gw = W - 32; gh = 28; gx = 16; gy = H - 64; }
          else { gw = 150; gh = 10; gx = W - 16 - gw; gy = 84; }
        }
        ctx.fillStyle = '#000b'; ctx.fillRect(gx - 3, gy - 3, gw + 6, gh + 6);
        ctx.fillStyle = '#6a3b1a66'; ctx.fillRect(gx + gw * c.DANGER_C, gy, gw * (c.CRIT_C - c.DANGER_C), gh);
        ctx.fillStyle = '#fff5'; ctx.fillRect(gx + gw * c.CRIT_C, gy, gw * (1 - c.CRIT_C), gh);
        ctx.fillStyle = f.c >= c.CRIT_C ? '#fff' : f.c >= c.DANGER_C ? '#ef5a2c' : '#d9cd4a';
        const fw = left ? gw * f.c : gw * f.c;
        ctx.fillRect(gx, gy, fw, gh);
        ctx.fillStyle = '#fff'; ctx.fillRect(gx + gw * c.CRIT_C - 1, gy - 3, 2, gh + 6);
        ctx.font = `700 ${portrait ? 18 : 14}px ${GOTHIC}`; ctx.textAlign = left ? 'left' : 'right'; ctx.lineWidth = 3; ctx.strokeStyle = '#000'; ctx.fillStyle = '#fff';
        const hint = portrait && !left ? null : m.hints[f.idx];
        if (hint) { ctx.strokeText(hint, left ? gx : gx + gw, gy - 13); ctx.fillText(hint, left ? gx : gx + gw, gy - 13); }
      }
      if (s.phase === 'ready') this.centerText(ctx, 'はっけよい…', CY - 148, 56, '#fff');
      if (m.tip) {
        if (portrait) {
          const i = m.tip.indexOf('。', m.tip.indexOf('。') + 1) + 1;
          this.centerText(ctx, m.tip.slice(0, i), H - 150, 22, '#fff3b0', GOTHIC);
          this.centerText(ctx, m.tip.slice(i), H - 120, 22, '#fff3b0', GOTHIC);
        } else this.centerText(ctx, m.tip, H - 62, 20, '#fff3b0', GOTHIC);
      }
      if (s.R < c.RING_R && s.R > c.RING_MIN_R && s.frame % 60 < 40) this.centerText(ctx, '土俵が縮む!', CY - 214, 22, '#ff8d7c', GOTHIC);
    },
    centerText(ctx, t, y, size, col, font) {
      ctx.font = `900 ${size}px ${font || MINCHO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = Math.max(4, size / 8); ctx.lineJoin = 'round'; ctx.strokeStyle = '#000';
      ctx.strokeText(t, W / 2, y); ctx.fillStyle = col; ctx.fillText(t, W / 2, y);
    },
    drawKo(ctx, s, m) {
      const t = Math.min(1, m.koF / 10), r = s.result;
      const y = CY - 98, h = 150, off = (1 - t) * (1 - t) * W;
      ctx.fillStyle = '#100a07e8'; ctx.fillRect(-off, y, W, h);
      ctx.fillStyle = '#c8321f'; ctx.fillRect(-off, y, W, 5); ctx.fillRect(-off, y + h - 5, W, 5);
      if (r.winner < 0) {
        ctx.fillStyle = '#fff'; ctx.font = `900 64px ${MINCHO}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('取り直し', W / 2 - off, y + h / 2);
        return;
      }
      const f = s.f[r.winner], pic = img[f.key];
      const ps = portrait ? 104 : h - 16, tx = portrait ? 132 : 200;
      if (ok(pic)) ctx.drawImage(pic, (portrait ? 16 : 40) - off, y + (h - ps) / 2, ps, ps);
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#d7c6a6'; ctx.font = `700 ${portrait ? 18 : 22}px ${MINCHO}`;
      ctx.fillText((r.winner === 0 ? '▲' : '◆') + f.ch.name + ' の勝ち。決まり手は', tx - off, y + 42);
      const name = root.KIMARITE[r.kimarite].name;
      ctx.fillStyle = '#fff'; ctx.font = `900 ${Math.min(66, Math.floor((W - tx - 14) / name.length))}px ${MINCHO}`;
      ctx.fillText(name, tx - off, y + 98);
    },
  };
  root.Render = R;
})(window);
