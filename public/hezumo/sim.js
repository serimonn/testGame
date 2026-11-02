// 勝負の処理。描画に依存しない。入力(押しているか)だけで進む。オンライン化でもこのまま使う。
(function (root) {
  const C = () => root.CFG;
  const TAU = Math.PI * 2;

  function rand(s) { // mulberry32
    s.seed = (s.seed + 0x6D2B79F5) | 0;
    let t = s.seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function angDiff(a, b) {
    let d = (a - b) % TAU;
    if (d > Math.PI) d -= TAU;
    if (d < -Math.PI) d += TAU;
    return d;
  }

  function makeFighter(key, idx, opts) {
    const c = C(), ch = root.CHARS[key];
    const side = idx === 0 ? -1 : 1;
    return {
      idx, key, ch,
      mass: ch.mass * ((opts && opts.massMul) || 1),
      r: ch.r,
      x: side * c.START_DIST, y: 0, vx: 0, vy: 0,
      a: 0, spin: (idx === 0 ? 1 : -1) * c.SPIN * ch.spinMul,
      charging: false, c: 0, rumbled: false,
      recover: 0, firedAgo: 999, overAgo: 999, imo: false, combo: 0, comboF: -999,
      down: false, out: false,
      lastHit: null, lastBump: null, lastFireF: -999,
    };
  }

  function createBout(keyA, keyB, seed, opts) {
    const c = C();
    const s = {
      seed: seed | 0, frame: 0, phase: 'ready', phaseF: 0, stop: 0,
      R: c.RING_R, f: [makeFighter(keyA, 0, opts && opts[0]), makeFighter(keyB, 1, opts && opts[1])],
      waves: [], imo: null, events: [], result: null, gust: null, parryF: (opts && opts.parryF) || c.PARRY_F,
    };
    // 左右対称の開始角度。最初は互いに顔を向け、ずらし幅だけ乱数にする。
    const off = (rand(s) - 0.5) * 1.2;
    s.f[0].a = off;
    s.f[1].a = Math.PI - off;
    return s;
  }

  function firePower(f, over) {
    const c = C();
    const min = f.ch.powerMin || c.POWER_MIN;
    let p = (min + (1 - min) * f.c) * f.ch.power;
    if (f.ch.comboGain) p *= 1 + f.ch.comboGain * f.combo;
    const crit = !over && f.c >= c.CRIT_C;
    if (crit) p *= c.CRIT_MULT;
    if (over) p *= c.OVER_MULT;
    if (f.imo) p *= f.ch.imoPower || c.IMO_POWER;
    return { p, crit };
  }

  // 反動の速さ。recoilFixed の力士は溜めに関係なく同じだけ進む
  function recoilSpeed(f, p, over) {
    const c = C();
    return c.RECOIL * (f.ch.recoilFixed || p) * (over ? c.OVER_RECOIL_MULT : 1) / f.mass;
  }

  function fire(s, f, over) {
    const c = C();
    const { p, crit } = firePower(f, over);
    const ux = Math.cos(f.a), uy = Math.sin(f.a);
    const rec = recoilSpeed(f, p, over);
    f.vx += ux * rec; f.vy += uy * rec;
    const range = (c.RANGE_MIN + (c.RANGE_MAX - c.RANGE_MIN) * Math.min(1, f.c)) * (f.ch.rangeMul || 1);
    const ox = f.x - ux * f.r, oy = f.y - uy * f.r;
    s.waves.push({ owner: f.idx, x: ox, y: oy, dx: -ux, dy: -uy, d: 0, range, p, crit, over, imo: f.imo, done: false });
    s.events.push({ t: 'fire', i: f.idx, x: ox, y: oy, a: f.a + Math.PI, c: f.c, p, crit, over, silent: !!f.ch.silent });
    f.lastFireF = s.frame;
    f.firedAgo = 0;
    if (over) f.overAgo = 0;
    f.recover = Math.round((over ? c.OVER_RECOVER_F : c.RECOVER_F) * f.ch.recoverMul);
    f.charging = false; f.c = 0; f.rumbled = false; f.imo = false;
  }

  function updateInput(s, f, down) {
    const c = C();
    f.down = down;
    if (f.recover > 0) { f.recover--; return; }
    if (!f.charging) {
      if (down) { f.charging = true; f.c = 0; s.events.push({ t: 'charge', i: f.idx, silent: !!f.ch.silent }); }
      return;
    }
    if (!down) { fire(s, f, false); return; }
    f.c += (1 / (c.CHARGE_F * f.ch.chargeMul)) * (f.imo ? c.IMO_CHARGE : 1);
    if (!f.rumbled && f.c >= c.DANGER_C) {
      f.rumbled = true;
      s.events.push({ t: 'rumble', i: f.idx, silent: !!f.ch.silent });
    }
    if (f.c >= 1) { f.c = 1; fire(s, f, true); }
  }

  function applyWave(s, w) {
    const c = C();
    const owner = s.f[w.owner], tgt = s.f[1 - w.owner];
    const tx = tgt.x - w.x, ty = tgt.y - w.y;
    const dist = Math.hypot(tx, ty) || 1;
    if (w.d < dist - tgt.r) return;
    w.done = true;
    if (dist - tgt.r > w.range) return;
    const ang = Math.abs(angDiff(Math.atan2(ty, tx), Math.atan2(w.dy, w.dx)));
    const tol = c.CONE_HALF + Math.asin(Math.min(1, tgt.r / dist));
    if (ang > tol) return;
    const fall = 1 - c.FALLOFF * Math.min(1, dist / w.range);

    if (tgt.firedAgo <= s.parryF + (tgt.ch.parryBonus || 0)) { // 屁返し
      const bx = owner.x - tgt.x, by = owner.y - tgt.y, bl = Math.hypot(bx, by) || 1;
      const v = Math.min(c.HIT_V_MAX, c.BLAST * Math.max(w.p, 0.6) * c.PARRY_MULT * fall) / owner.mass;
      owner.vx += bx / bl * v; owner.vy += by / bl * v;
      owner.lastHit = { by: tgt.idx, kind: 'hekaeshi', f: s.frame };
      s.stop = Math.max(s.stop, c.STOP_PARRY);
      s.events.push({ t: 'parry', i: tgt.idx, x: tgt.x, y: tgt.y, tx: owner.x, ty: owner.y });
      return;
    }
    const whiff = tgt.firedAgo < 40 ? c.WHIFF_MULT : 1;
    const brace = tgt.charging && tgt.ch.braceMul ? tgt.ch.braceMul : 1;
    const v = Math.min(c.HIT_V_MAX, c.BLAST * w.p * fall * whiff) * brace / tgt.mass;
    if (owner.ch.comboGain) { owner.combo = Math.min(owner.ch.comboMax, owner.combo + 1); owner.comboF = s.frame; }
    tgt.vx += tx / dist * v; tgt.vy += ty / dist * v;
    tgt.lastHit = { by: owner.idx, kind: w.crit ? 'kaishin' : w.imo ? 'imo' : 'hohi', f: s.frame };
    const stop = Math.round(c.STOP_HIT_MIN + (c.STOP_HIT_MAX - c.STOP_HIT_MIN) * Math.min(1, w.p / 1.5));
    s.stop = Math.max(s.stop, stop);
    s.events.push({ t: 'hit', i: tgt.idx, by: owner.idx, x: tgt.x, y: tgt.y, a: Math.atan2(ty, tx), p: w.p, crit: w.crit, combo: owner.combo });
  }

  function physics(s) {
    const c = C();
    const [a, b] = s.f;
    for (const f of s.f) {
      f.vx *= c.FRICTION; f.vy *= c.FRICTION;
      f.x += f.vx / 60; f.y += f.vy / 60;
      f.a += f.spin * (f.charging ? c.CHARGE_SPIN : 1);
      if (f.firedAgo < 999) f.firedAgo++;
      if (f.overAgo < 999) f.overAgo++;
      if (f.combo && s.frame - f.comboF > c.COMBO_WINDOW_F) f.combo = 0;
    }
    if (s.phase === 'end') return;
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1, min = a.r + b.r;
    if (d < min) {
      const nx = dx / d, ny = dy / d, ov = min - d, ms = a.mass + b.mass;
      a.x -= nx * ov * b.mass / ms; a.y -= ny * ov * b.mass / ms;
      b.x += nx * ov * a.mass / ms; b.y += ny * ov * a.mass / ms;
      const rel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
      if (rel > 0) {
        const j = (1 + c.RESTITUTION) * rel / (1 / a.mass + 1 / b.mass);
        a.vx -= j / a.mass * nx; a.vy -= j / a.mass * ny;
        b.vx += j / b.mass * nx; b.vy += j / b.mass * ny;
        if (rel > 40) {
          // 速く当たってきた側の手柄にする
          const av = Math.hypot(a.vx, a.vy), bv = Math.hypot(b.vx, b.vy);
          b.lastBump = { by: 0, f: s.frame }; a.lastBump = { by: 1, f: s.frame };
          s.events.push({ t: 'bump', x: a.x + nx * a.r, y: a.y + ny * a.r, rel, av, bv });
        }
      }
    }
  }

  function updateImo(s) {
    const c = C();
    if (!s.imo && s.phaseF > 0 && s.phaseF % c.IMO_EVERY_F === 0) {
      const ang = rand(s) * TAU;
      const r = s.R * c.IMO_R_RATE;
      s.imo = { x: Math.cos(ang) * r, y: Math.sin(ang) * r };
      s.events.push({ t: 'imoSpawn', x: s.imo.x, y: s.imo.y });
    }
    if (!s.imo) return;
    if (Math.hypot(s.imo.x, s.imo.y) > s.R - 8) { s.imo = null; return; }
    for (const f of s.f) {
      if (Math.hypot(f.x - s.imo.x, f.y - s.imo.y) < f.r + 14 + (f.ch.imoReach || 0)) {
        f.imo = true;
        s.events.push({ t: 'imo', i: f.idx, x: s.imo.x, y: s.imo.y });
        s.imo = null;
        return;
      }
    }
  }

  function updateWind(s) {
    const boss = s.f.find(f => f.ch.wind);
    if (!boss) return;
    const w = boss.ch.wind;
    if (!s.gust && s.phaseF > 0 && s.phaseF % w.every === 0) {
      const ang = rand(s) * TAU;
      s.gust = { dx: Math.cos(ang), dy: Math.sin(ang), left: w.len };
      s.events.push({ t: 'gust', dx: s.gust.dx, dy: s.gust.dy });
    }
    if (s.gust) {
      // 同じ力士どうしなら両方が流される
      const both = s.f[1 - boss.idx].ch.wind;
      for (const f of s.f) if (both || f !== boss) { f.vx += s.gust.dx * w.accel; f.vy += s.gust.dy * w.accel; }
      if (--s.gust.left <= 0) s.gust = null;
    }
  }

  // 負けた側 f がなぜ落ちたかを決まり手にする。
  function kimarite(s, f) {
    const recent = (e, n) => e && s.frame - e.f <= n;
    if (recent(f.lastHit, 150)) return f.lastHit.kind;
    if (f.overAgo < 120) return 'hara';
    if (recent(f.lastBump, 60)) return 'butsu';
    if (s.frame - f.lastFireF < 120) return 'hando';
    return s.R < C().RING_R ? 'dohyo' : 'hando';
  }

  function checkOut(s) {
    const c = C();
    const outs = s.f.filter(f => Math.hypot(f.x, f.y) > s.R);
    if (!outs.length) return;
    for (const f of outs) f.out = true;
    s.phase = 'end'; s.phaseF = 0;
    s.stop = c.STOP_KO;
    if (outs.length === 2) s.result = { winner: -1, kimarite: null };
    else s.result = { winner: 1 - outs[0].idx, kimarite: kimarite(s, outs[0]) };
    s.events.push({ t: 'ko', winner: s.result.winner, kimarite: s.result.kimarite, x: outs[0].x, y: outs[0].y });
  }

  // inputs: [bool, bool] 押しているか
  function step(s, inputs) {
    const c = C();
    s.events.length = 0;
    s.frame++;
    if (s.stop > 0) { s.stop--; return s; }
    s.phaseF++;
    if (s.phase === 'ready') {
      for (let i = 0; i < 2; i++) s.f[i].down = inputs[i];
      if (s.phaseF >= c.READY_F) { s.phase = 'fight'; s.phaseF = 0; s.events.push({ t: 'go' }); }
      for (const f of s.f) f.a += f.spin;
      return s;
    }
    if (s.phase === 'fight') {
      for (let i = 0; i < 2; i++) updateInput(s, s.f[i], inputs[i]);
      for (const w of s.waves) { w.d += c.WAVE_SPEED; applyWave(s, w); if (w.d > w.range + 40) w.done = true; }
      s.waves = s.waves.filter(w => !w.done);
      if (s.frame > c.SHRINK_START_F) {
        const t = Math.min(1, (s.phaseF - c.SHRINK_START_F) / (c.SHRINK_END_F - c.SHRINK_START_F));
        if (t > 0) s.R = c.RING_R + (c.RING_MIN_R - c.RING_R) * t;
      }
      updateImo(s);
      updateWind(s);
    }
    physics(s);
    if (s.phase === 'fight') checkOut(s);
    return s;
  }

  // 反動でどれだけ進むか(AI と 表示の予測用)
  function recoilDist(f) {
    const c = C();
    const { p } = firePower(f, false);
    return recoilSpeed(f, p, false) / 60 / (1 - c.FRICTION);
  }

  root.Sim = { createBout, step, firePower, recoilDist, angDiff, kimarite };
})(typeof window !== 'undefined' ? window : globalThis);
