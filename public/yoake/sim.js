// 夜市の中身。DOM を使わない。town は夜をまたいで残る街、Night は一晩(準備中も含む)。
(function (root) {
  const C = CFG;
  const N = C.COLS * C.ROWS;
  const LX = Math.ceil(C.COLS / C.LAND_W), LY = Math.ceil(C.ROWS / C.LAND_H);
  const CW = C.COLS * 4, CH = C.ROWS * 4;   // 闇を塗る細かいます(4px)
  const idx = (c, r) => r * C.COLS + c;
  const inMap = (c, r) => c >= 0 && r >= 0 && c < C.COLS && r < C.ROWS;
  const DIR4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = a => a[Math.floor(Math.random() * a.length)];
  const isStall = t => !!STALLS[t];
  const isBuild = t => !!BUILDS[t];
  const isGate = (c, r) => c === C.GATE.c && r === C.GATE.r;

  function newTown() {
    const land = new Array(LX * LY).fill(0);
    for (const [x, y] of C.LAND_OPEN) land[y * LX + x] = 1;
    const roads = new Array(N).fill(0);
    roads[idx(C.GATE.c, C.GATE.r)] = 1;
    return { v: 3, night: 1, money: C.START_MONEY, land, roads, objs: [], history: [], total: 0 };
  }
  function landOf(c, r) { return Math.floor(r / C.LAND_H) * LX + Math.floor(c / C.LAND_W); }
  function landOpen(town, c, r) { return inMap(c, r) && !!town.land[landOf(c, r)]; }
  function landBuyable(town, k) {
    if (town.land[k]) return false;
    const x = k % LX, y = (k / LX) | 0;
    return DIR4.some(([dx, dy]) => { const nx = x + dx, ny = y + dy; return nx >= 0 && ny >= 0 && nx < LX && ny < LY && town.land[ny * LX + nx]; });
  }
  // 区画の値段。最初に開いていた区画から遠いほど高い
  function landCost(k) {
    const x = k % LX, y = (k / LX) | 0;
    let d = 99;
    for (const [ox, oy] of C.LAND_OPEN) d = Math.min(d, Math.max(Math.abs(x - ox), Math.abs(y - oy)));
    return C.LAND_COST + C.LAND_COST_STEP * Math.max(0, d - 1);
  }
  function objAt(town, c, r) { return town.objs.find(o => o.c === c && o.r === r); }
  // 街の格。一晩に来た客の最高記録で決まる
  function rankOf(town) { let k = 0; C.RANKS.forEach((r, i) => { if ((town.best || 0) >= r.need) k = i; }); return k; }
  function unlocked(town) { const k = rankOf(town), s = new Set(); for (let i = 0; i <= k; i++) for (const t of C.RANKS[i].unlock) s.add(t); return s; }
  const staffOf = o => (STALLS[o.type] || BUILDS[o.type] || {}).staff || 0;

  // 強さ 0〜1。提灯はまっすぐ弱まり、重なるほど明るい。常夜灯は範囲の中が全部明るい
  function lightFrom(src, x, y) {
    let dark = 1;
    for (const s of src) {
      const dx = x - s.c, dy = y - s.r, d2 = dx * dx + dy * dy;
      if (d2 >= s.R * s.R) continue;
      if (s.hard) return 1;
      dark *= Math.sqrt(d2) / s.R;
    }
    return 1 - dark;
  }
  function levelOf(L) { return L >= C.LIGHT_BRIGHT ? 2 : L >= C.LIGHT_DIM ? 1 : 0; }

  // ---------- 一晩 ----------
  function Night(town) {
    this.town = town;
    this.rank = rankOf(town);
    this.hyakki = this.rank >= 3 && town.night % C.HYAKKI_EVERY === 0;   // 百鬼夜行の夜
    this.f = 0; this.started = false; this.over = false; this.done = false;
    this.objs = town.objs.map(o => ({
      ref: o, type: o.type, c: o.c, r: o.r, kind: o.type === 'lantern' ? 'lantern' : isStall(o.type) ? 'stall' : 'build',
      eaten: false, off: false, eatT: 0, eatBy: null, sitF: 0, sitBy: null, bump: 0, mark: -1, markT: 0, cap: 0, inUse: 0, accessTiles: [], stock: o.type === 'oodana' ? C.OODANA_STOCK : 0, cartT: 30, cartOut: false, dry: false,
    }));
    this.occ = new Array(N).fill(null);
    for (const o of this.objs) this.occ[idx(o.c, o.r)] = o;
    this.humans = []; this.yokai = []; this.carts = []; this.events = [];
    this.earn = { human: 0, yokai: 0, hn: 0, yn: 0, eaten: 0, shoo: 0, leaf: 0, whims: {}, visitors: 0, yokaiCame: 0 };
    this.gauge = 0; this.stop = 0; this.shake = 0;
    this.oilMax = Math.max(1, this.objs.filter(o => o.kind === 'lantern').length * C.OIL_PER_LANTERN);
    this.oil = this.oilMax;
    this.light = new Float32Array(N); this.level = new Uint8Array(N); this.cell = new Float32Array(CW * CH);
    this.lightVer = 0; this.dirty = true;
    this.fire = new Uint8Array(N); this.nearFire = new Uint8Array(N); this.area = {};
    this.fields = new Map();
    this.recalcFire(); this.recalcArea(); this.recalcAccess(); this.assignStaff(); this.recalc();
  }
  const P = Night.prototype;
  Night.lightFrom = lightFrom; Night.levelOf = levelOf; Night.CW = CW; Night.CH = CH;

  P.gaugeMax = function () { const g = Math.min(C.GAUGE_MAX, Math.round(C.GAUGE_BASE + C.GAUGE_PER_NIGHT * (this.town.night - 1))); return this.hyakki ? Math.max(2, Math.round(g * C.HYAKKI_GAUGE)) : g; };
  P.yokaiCap = function () { const k = Math.min(C.YOKAI_CAP_MAX, Math.floor(C.YOKAI_CAP_BASE + C.YOKAI_CAP_PER_NIGHT * (this.town.night - 1))); return this.hyakki ? k * C.HYAKKI_CAP : k; };
  P.objAt = function (c, r) { return inMap(c, r) ? this.occ[idx(c, r)] : null; };
  P.isRoad = function (c, r) { return inMap(c, r) && !!this.town.roads[idx(c, r)]; };
  P.lvl = function (c, r) { return inMap(c, r) ? this.level[idx(c, r)] : 0; };
  P.inArea = function (t, c, r) { return inMap(c, r) && !!this.area[t][idx(c, r)]; };

  // 門から道でつながったマスに火が通る
  P.recalcFire = function () {
    this.fire.fill(0); this.nearFire.fill(0);
    const q = [idx(C.GATE.c, C.GATE.r)]; this.fire[q[0]] = 1;
    for (let h = 0; h < q.length; h++) {
      const i = q[h], c = i % C.COLS, r = (i / C.COLS) | 0;
      for (const [dx, dy] of DIR4) {
        const nc = c + dx, nr = r + dy;
        if (!this.isRoad(nc, nr) || !landOpen(this.town, nc, nr)) continue;
        const j = idx(nc, nr); if (this.fire[j]) continue;
        this.fire[j] = 1; q.push(j);
      }
    }
    const R = C.FIRE_REACH;
    for (let i = 0; i < N; i++) if (this.fire[i]) {
      const c = i % C.COLS, r = (i / C.COLS) | 0;
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) if (inMap(c + dx, r + dy)) this.nearFire[idx(c + dx, r + dy)] = 1;
    }
  };
  P.recalcArea = function () {
    this.area = {};
    for (const t of Object.keys(BUILDS)) this.area[t] = new Uint8Array(N);
    const R = C.BUILD_R;
    for (const o of this.objs) {
      if (o.kind !== 'build') continue;
      for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
        if (dx * dx + dy * dy > R * R + 0.5 || !inMap(o.c + dx, o.r + dy)) continue;
        this.area[o.type][idx(o.c + dx, o.r + dy)] = 1;
      }
    }
  };
  // 店に人が寄れる道のマス。道に面していれば front、奥1マスなら back
  P.stallAccess = function (o) {
    const front = [], back = [];
    for (const [dx, dy] of DIR4) if (this.isRoad(o.c + dx, o.r + dy) && this.fire[idx(o.c + dx, o.r + dy)]) front.push(idx(o.c + dx, o.r + dy));
    if (front.length) return { front: true, tiles: front };
    for (const [dx, dy] of DIR4) {
      const mc = o.c + dx, mr = o.r + dy;
      if (!inMap(mc, mr) || this.isRoad(mc, mr)) continue;
      for (const [ex, ey] of DIR4) { const c = mc + ex, r = mr + ey; if ((c !== o.c || r !== o.r) && this.isRoad(c, r) && this.fire[idx(c, r)]) back.push(idx(c, r)); }
    }
    return { front: false, tiles: back };
  };
  P.recalcAccess = function () {
    this.access = new Map();
    for (const o of this.objs) {
      if (o.kind === 'build' && staffOf(o)) o.accessTiles = DIR4.map(([dx, dy]) => [o.c + dx, o.r + dy]).filter(([c, r]) => this.isRoad(c, r) && this.fire[idx(c, r)]).map(([c, r]) => idx(c, r));
    }
    for (const o of this.objs) {
      if (o.kind !== 'stall') continue;
      const a = this.stallAccess(o);
      o.accessTiles = a.tiles;
      for (const i of a.tiles) { if (!this.access.has(i)) this.access.set(i, []); this.access.get(i).push({ o, back: !a.front }); }
    }
  };
  // 道の上の距離。goals から火の通った道だけをたどる
  P.roadDist = function (goals, limit) {
    const dist = new Int16Array(N).fill(-1), q = [];
    for (const g of goals) if (this.fire[g] && dist[g] < 0) { dist[g] = 0; q.push(g); }
    for (let h = 0; h < q.length; h++) {
      const i = q[h]; if (limit && dist[i] >= limit) continue;
      const c = i % C.COLS, r = (i / C.COLS) | 0;
      for (const [dx, dy] of DIR4) {
        const nc = c + dx, nr = r + dy; if (!inMap(nc, nr)) continue;
        const j = idx(nc, nr); if (!this.fire[j] || dist[j] >= 0) continue;
        dist[j] = dist[i] + 1; q.push(j);
      }
    }
    return dist;
  };
  // 働き手を近い店から順に就ける
  P.assignStaff = function () {
    const homes = [{ tile: idx(C.GATE.c, C.GATE.r), n: C.GATE_WORKERS }];
    for (const o of this.objs) {
      if (o.type !== 'nagaya') continue;
      o.dry = this.rank >= 2 && !this.inArea('ido', o.c, o.r);
      if (o.dry) continue;
      const side = DIR4.map(([dx, dy]) => [o.c + dx, o.r + dy]).find(([c, r]) => this.isRoad(c, r) && this.fire[idx(c, r)]);
      o.home = !!side;
      if (side) homes.push({ tile: idx(side[0], side[1]), n: C.NAGAYA_WORKERS });
    }
    const pairs = [];
    const stalls = this.objs.filter(o => staffOf(o) > 0);
    homes.forEach((h, hi) => {
      const d = this.roadDist([h.tile], C.WORK_REACH);
      for (const s of stalls) {
        let best = -1;
        for (const t of s.accessTiles) if (d[t] >= 0 && (best < 0 || d[t] < best)) best = d[t];
        if (best >= 0) pairs.push({ hi, s, d: best });
      }
    });
    pairs.sort((a, b) => a.d - b.d);
    const left = homes.map(h => h.n);
    for (const s of stalls) s.cap = 0;
    for (const p of pairs) {
      const need = staffOf(p.s) - p.s.cap;
      if (need <= 0 || left[p.hi] <= 0) continue;
      const k = Math.min(need, left[p.hi]); p.s.cap += k; left[p.hi] -= k;
    }
    this.workers = homes.reduce((a, h) => a + h.n, 0);
    this.idle = left.reduce((a, b) => a + b, 0);
    this.needStaff = stalls.reduce((a, s) => a + staffOf(s), 0);
  };

  P.burning = function (o) { return o.kind === 'lantern' && !o.eaten && !o.off && this.nearFire[idx(o.c, o.r)]; };
  P.sources = function () {
    const out = [{ c: C.GATE.c, r: C.GATE.r, R: 1.8 }];
    for (const o of this.objs) {
      if (this.burning(o)) {
        let R = this.oil > 0 ? C.R_LANTERN : C.R_LANTERN_DRY;
        if (o.eatBy) R *= 1 - 0.6 * o.eatT / C.YOKAI_EAT_F;
        out.push({ c: o.c, r: o.r, R });
      } else if (o.kind === 'lantern' && o.off && !o.eaten && this.nearFire[idx(o.c, o.r)]) {
        // 火を細くした提灯。隣のマスが薄暗くなる。油を使わず、喰われない
        out.push({ c: o.c, r: o.r, R: C.R_LANTERN_DRY });
      } else if (o.type === 'joya' && this.nearFire[idx(o.c, o.r)]) out.push({ c: o.c, r: o.r, R: C.R_JOYA, hard: true });
    }
    return out;
  };
  // 灯りを計算し直す。変わったときだけ、光源ごとに届く範囲だけを足し込む(軽量化)
  P.recalc = function () {
    if (!this.dirty) return;
    this.dirty = false;
    const src = this.sources();
    const dk = new Float32Array(N).fill(1), dc = new Float32Array(CW * CH).fill(1);
    const hardT = new Uint8Array(N), hardC = new Uint8Array(CW * CH);
    for (const s of src) {
      const R = s.R, R2 = R * R;
      const c0 = Math.max(0, Math.floor(s.c - R)), c1 = Math.min(C.COLS - 1, Math.ceil(s.c + R));
      const r0 = Math.max(0, Math.floor(s.r - R)), r1 = Math.min(C.ROWS - 1, Math.ceil(s.r + R));
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        const dx = c - s.c, dy = r - s.r, d2 = dx * dx + dy * dy; if (d2 >= R2) continue;
        const i = idx(c, r); if (s.hard) hardT[i] = 1; else dk[i] *= Math.sqrt(d2) / R;
      }
      // 4px のます。ますの中心はマス単位で (x + 0.5) / 4 - 0.5
      const x0 = Math.max(0, Math.floor((s.c - R + 0.5) * 4)), x1 = Math.min(CW - 1, Math.ceil((s.c + R + 0.5) * 4));
      const y0 = Math.max(0, Math.floor((s.r - R + 0.5) * 4)), y1 = Math.min(CH - 1, Math.ceil((s.r + R + 0.5) * 4));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const dx = (x + 0.5) / 4 - 0.5 - s.c, dy = (y + 0.5) / 4 - 0.5 - s.r, d2 = dx * dx + dy * dy; if (d2 >= R2) continue;
        const j = y * CW + x; if (s.hard) hardC[j] = 1; else dc[j] *= Math.sqrt(d2) / R;
      }
    }
    for (let i = 0; i < N; i++) {
      const L = !this.town.land[landOf(i % C.COLS, (i / C.COLS) | 0)] ? 0 : hardT[i] ? 1 : 1 - dk[i];
      this.light[i] = L; this.level[i] = levelOf(L);
    }
    for (let j = 0; j < CW * CH; j++) this.cell[j] = hardC[j] ? 1 : 1 - dc[j];
    this.lightVer++;
    // 店の札(0 閉店、1 人と妖怪、2 人だけ)。変わったら知らせる
    for (const o of this.objs) {
      if (o.kind !== 'stall') continue;
      const m = this.level[idx(o.c, o.r)];
      if (o.mark !== m) { if (o.mark >= 0 && this.started) { o.markT = 14; this.events.push({ t: 'mark', m, x: o.c * C.T + 8, y: o.r * C.T - 6 }); } o.mark = m; }
    }
  };
  // 今夜来る客の見込み。働き手のそろった名所だけが客を呼ぶ
  P.visitorParts = function () {
    const p = { base: C.HUMAN_BASE, nights: Math.round(C.HUMAN_PER_NIGHT * (this.town.night - 1)), sights: {}, idle: {} };
    for (const o of this.objs) {
      if (o.kind !== 'build' || !BUILDS[o.type].visitors) continue;
      const ok = o.cap >= staffOf(o) && o.accessTiles.length;
      const m = ok ? p.sights : p.idle; m[o.type] = (m[o.type] || 0) + 1;
    }
    return p;
  };
  P.expectedVisitors = function () {
    const p = this.visitorParts();
    let v = p.base + p.nights;
    for (const t of Object.keys(p.sights)) v += BUILDS[t].visitors * p.sights[t];
    return v;
  };
  P.open = function (o) { return o.kind === 'stall' && o.cap > 0 && this.lvl(o.c, o.r) > 0 && o.sitF <= 0 && !this.soldOut(o); };
  // 宿場からは、大店は蔵から運ばれた品物がないと売れない
  P.soldOut = function (o) { return o.type === 'oodana' && this.rank >= 2 && o.stock <= 0; };
  P.useStock = function (o) { if (o.type === 'oodana' && this.rank >= 2) o.stock = Math.max(0, o.stock - 1); };

  // ---------- 夜の始まり ----------
  P.start = function () {
    const n = this.town.night;
    this.sights = [];
    for (const o of this.objs) {
      if (o.kind !== 'build' || !BUILDS[o.type].visitors || o.cap < staffOf(o)) continue;
      const goals = DIR4.map(([dx, dy]) => [o.c + dx, o.r + dy]).filter(([c, r]) => this.isRoad(c, r) && this.fire[idx(c, r)]).map(([c, r]) => idx(c, r));
      if (goals.length) this.sights.push({ o, w: BUILDS[o.type].visitors, goals });
    }
    const h = Math.round(C.HUMAN_BASE + C.HUMAN_PER_NIGHT * (n - 1) + this.sights.reduce((a, s) => a + s.w, 0));
    this.spawns = [];
    // 最初の3人は夜の始めに来る。客を待たせない
    for (let i = 0; i < h; i++) this.spawns.push({ f: i < 3 ? 40 + i * 150 : Math.floor(rnd(0.03, 0.65) * C.NIGHT_F) });
    this.spawns.sort((a, b) => a.f - b.f);
    this.roadTiles = []; for (let i = 0; i < N; i++) if (this.fire[i]) this.roadTiles.push(i);
    this.started = true; this.dirty = true;
    this.events.push({ t: this.hyakki ? 'hyakki' : 'start' });
  };
  // 目当てのマスへの距離の地図。夜のうちは道が変わらないので、行き先ごとに一度だけ作る(軽量化)
  P.field = function (key, goals) {
    let f = this.fields.get(key);
    if (!f) { f = this.roadDist(goals); this.fields.set(key, f); }
    return f;
  };

  // ---------- 1F 進める ----------
  P.step = function () {
    if (!this.started || this.done) return;
    if (this.stop > 0) { this.stop--; return; }
    if (this.shake > 0) this.shake--;
    this.f++;
    for (const o of this.objs) {
      if (o.bump > 0) o.bump--; if (o.markT > 0) o.markT--;
      if (o.sitF > 0 && --o.sitF === 0 && o.sitBy) { this.leave(o.sitBy); o.sitBy = null; }
      if (o.eatBy) this.dirty = true;
    }
    if (this.f < C.NIGHT_F) {
      let burning = 0; for (const o of this.objs) if (this.burning(o)) burning += this.inArea('aburaya', o.c, o.r) ? C.ABURAYA_OIL : 1;
      const before = this.oil;
      this.oil = Math.max(0, this.oil - burning * C.OIL_PER_SEC / 60);
      if (before > 0 && this.oil === 0) { this.events.push({ t: 'dry' }); this.dirty = true; }
    }
    this.recalc();
    while (this.spawns.length && this.spawns[0].f <= this.f) { this.spawns.shift(); this.spawnHuman(); }
    for (const a of this.humans) this.stepHuman(a);
    for (const a of this.yokai) this.stepYokai(a);
    if (this.rank >= 2) this.stepKura();
    if (this.carts.some(a => a.gone)) this.carts = this.carts.filter(a => !a.gone);
    if (this.humans.some(a => a.gone)) this.humans = this.humans.filter(a => !a.gone);
    if (this.yokai.some(a => a.gone)) this.yokai = this.yokai.filter(a => !a.gone);
    if (this.f === C.NIGHT_F) {
      this.over = true; this.spawns = [];
      for (const a of this.humans) this.goHome(a);
      for (const a of this.yokai) this.leave(a);
      this.events.push({ t: 'dawn' });
    }
    if (this.over && (this.f > C.NIGHT_F + 600 || (!this.humans.length && !this.yokai.length))) this.done = true;
  };

  function place(a, c, r) { a.c = c; a.r = r; a.x = c * C.T + C.T / 2; a.y = r * C.T + C.T - 2; }
  function stepTo(a, c, r, sp) {
    const tx = c * C.T + C.T / 2, ty = r * C.T + C.T - 2, dx = tx - a.x, dy = ty - a.y, d = Math.hypot(dx, dy);
    if (dx) a.face = dx > 0 ? 1 : -1;
    a.walking = true;
    if (d <= sp) { a.x = tx; a.y = ty; a.c = c; a.r = r; return true; }
    a.x += dx / d * sp; a.y += dy / d * sp;
    return false;
  }

  // ---------- 人 ----------
  P.spawnHuman = function () {
    const gate = idx(C.GATE.c, C.GATE.r);
    // 目当て:名所(重み=呼ぶ人数)か、道の奥
    const total = this.sights.reduce((a, s) => a + s.w, 0) + C.ROAM_W;
    let x = Math.random() * total, dest = null;
    for (const s of this.sights) { x -= s.w; if (x <= 0) { dest = { key: 's' + s.o.c + ',' + s.o.r, goals: s.goals }; break; } }
    if (!dest) {
      // 道の奥:門から遠い道のマスほど選ばれやすい
      const g = this.field('gate', [gate]);
      let best = gate, bd = -1;
      for (let k = 0; k < 4; k++) { const i = pick(this.roadTiles); const d = g[i] + Math.random() * 4; if (d > bd) { bd = d; best = i; } }
      dest = { key: 't' + best, goals: [best] };
    }
    const kid = Math.random() < 0.25;
    const a = {
      kind: 'human', kid, look: Math.floor(Math.random() * (kid ? SPR.kids.length : SPR.people.length)),
      state: 'go', dest, wallet: C.WALLET, seen: new Set(), t: Math.random() * 100, face: 1, next: null,
      speed: C.HUMAN_SPEED * rnd(0.85, 1.15) * (kid ? 1.15 : 1),
    };
    place(a, C.GATE.c, C.GATE.r);
    this.humans.push(a); this.earn.visitors++;
    this.checkStalls(a);
  };
  P.goHome = function (a) {
    if (a.state === 'home') return;
    a.state = 'home'; a.seen = new Set(); a.next = null;
    a.dest = { key: 'gate', goals: [idx(C.GATE.c, C.GATE.r)] };
  };
  // 今いる道のマスから寄れる店を見て、寄るか決める。財布が尽きたら見ない
  P.checkStalls = function (a) {
    if (a.wallet <= 0) return;
    const list = this.access.get(idx(a.c, a.r));
    if (!list) return;
    for (const { o, back } of list) {
      if (a.seen.has(o)) continue;
      a.seen.add(o);
      if (!this.open(o) || o.inUse >= o.cap) continue;   // 混んでいたら素通り
      const m = this.lvl(o.c, o.r);
      let p = m === 2 ? C.BUY_BRIGHT : C.BUY_DIM;
      if (back) p *= C.BUY_BACK;
      if (this.inArea('chaya', o.c, o.r)) p *= C.CHAYA_BUY;
      if (this.inArea('yashiro', o.c, o.r)) p *= C.YASHIRO_HUMAN;
      if (Math.random() < p) { a.target = o; a.serving = C.SERVE_F; a.face = o.c >= a.c ? 1 : -1; o.inUse++; a.wallet--; return; }
    }
  };
  P.stepHuman = function (a) {
    a.t++; a.walking = false;
    if (a.serving) {
      if (--a.serving <= 0) {
        const o = a.target; o.inUse = Math.max(0, o.inUse - 1);
        if (this.lvl(o.c, o.r)) this.payHuman(o);
        this.checkStalls(a);
      }
      return;
    }
    if (!a.next) {
      const f = this.field(a.dest.key, a.dest.goals), d = f[idx(a.c, a.r)];
      if (d <= 0) {
        if (a.state === 'home') { a.gone = true; return; }
        return this.goHome(a);
      }
      const opts = DIR4.map(([dx, dy]) => [a.c + dx, a.r + dy]).filter(([c, r]) => inMap(c, r) && f[idx(c, r)] === d - 1);
      if (!opts.length) { a.gone = true; return; }
      const [nc, nr] = pick(opts); a.next = { c: nc, r: nr };
    }
    if (stepTo(a, a.next.c, a.next.r, a.speed)) { a.next = null; this.checkStalls(a); }
  };
  P.payHuman = function (o) {
    const v = STALLS[o.type].price;
    this.useStock(o);
    this.town.money += v; this.earn.human += v; this.earn.hn++; o.bump = 8;
    this.events.push({ t: 'coin', v, x: o.c * C.T + 8, y: o.r * C.T - 2 });
    if (this.over) return;
    this.gauge += this.inArea('taiko', o.c, o.r) ? C.TAIKO_GAUGE : 1;
    if (this.gauge >= this.gaugeMax()) {
      this.gauge = 0;
      if (this.earn.yokaiCame < this.yokaiCap()) this.spawnYokai();
    }
  };

  // ---------- 蔵と荷車 ----------
  // 蔵は働き手がそろっていれば、品物の少ない大店へ荷車を出す。荷車は道を通って運び、蔵へ戻る
  P.stepKura = function () {
    for (const k of this.objs) {
      if (k.type !== 'kura' || k.cap < staffOf(k) || k.cartOut || !k.accessTiles.length || this.over) continue;
      if (--k.cartT > 0) continue;
      const home = k.accessTiles[0], d = this.field('k' + home, [home]);
      let best = null, bs = 1e9;
      for (const o of this.objs) {
        if (o.type !== 'oodana' || o.cap <= 0) continue;
        let dist = -1; for (const t of o.accessTiles) if (d[t] >= 0 && (dist < 0 || d[t] < dist)) dist = d[t];
        if (dist < 0) continue;
        const score = o.stock * 100 + dist;
        if (score < bs) { bs = score; best = o; }
      }
      if (!best || best.stock >= C.OODANA_STOCK * 3) { k.cartT = 60; continue; }
      const a = { kind: 'cart', from: k, to: best, state: 'go', next: null, face: 1, t: 0, dest: { key: 'o' + best.c + ',' + best.r, goals: best.accessTiles }, home: { key: 'k' + home, goals: [home] } };
      place(a, home % C.COLS, (home / C.COLS) | 0);
      k.cartOut = true; this.carts.push(a);
    }
    for (const a of this.carts) {
      a.t++; a.walking = false;
      if (!a.next) {
        const goal = a.state === 'go' ? a.dest : a.home;
        const f = this.field(goal.key, goal.goals), d = f[idx(a.c, a.r)];
        if (d <= 0) {
          if (a.state === 'go' && d === 0) { a.to.stock += C.CART_LOAD; a.state = 'back'; this.events.push({ t: 'cart', x: a.to.c * C.T + 8, y: a.to.r * C.T - 2 }); continue; }
          a.gone = true; a.from.cartOut = false; a.from.cartT = C.CART_EVERY; continue;
        }
        const opts = DIR4.map(([dx, dy]) => [a.c + dx, a.r + dy]).filter(([c, r]) => inMap(c, r) && f[idx(c, r)] === d - 1);
        if (!opts.length) { a.gone = true; a.from.cartOut = false; a.from.cartT = C.CART_EVERY; continue; }
        const [nc, nr] = pick(opts); a.next = { c: nc, r: nr };
      }
      if (stepTo(a, a.next.c, a.next.r, C.CART_SPEED)) a.next = null;
    }
  };

  // ---------- 妖怪 ----------
  // 妖怪が入れるマス。道は横切れるが、沿っては歩かない(気ままに歩くときは道を避ける)
  P.walkY = function (c, r) {
    if (!inMap(c, r)) return false;
    const i = idx(c, r);
    if (!this.town.land[landOf(c, r)] || this.occ[i] || isGate(c, r)) return false;
    return this.level[i] < 2 && !this.area.bansho[i];
  };
  P.spawnYokai = function () {
    const border = [], any = [];
    for (let r = 0; r < C.ROWS; r++) for (let c = 0; c < C.COLS; c++) {
      if (!this.walkY(c, r) || this.level[idx(c, r)] > 0 || this.isRoad(c, r) || Math.abs(c - C.GATE.c) + Math.abs(r - C.GATE.r) < 4) continue;
      if (DIR4.some(([dx, dy]) => !landOpen(this.town, c + dx, r + dy))) border.push({ c, r }); else any.push({ c, r });
    }
    const p = border.length ? pick(border) : any.length ? pick(any) : null;
    if (!p) { this.events.push({ t: 'noyokai' }); return; }
    const a = { kind: 'yokai', look: pick(SPR.yokaiKinds), state: 'appear', t: 0, face: 1, alpha: 0, life: C.YOKAI_LIFE, speed: C.YOKAI_SPEED * rnd(0.9, 1.1), last: null, next: null };
    place(a, p.c, p.r);
    this.yokai.push(a); this.earn.yokaiCame++;
    this.events.push({ t: 'yokai', x: a.x, y: a.y });
  };
  P.yokaiSpots = function () {
    const spots = new Map();
    for (const o of this.objs) {
      if (!this.open(o) || this.lvl(o.c, o.r) !== 1 || o.inUse >= o.cap) continue;
      for (const [dx, dy] of DIR4) if (this.walkY(o.c + dx, o.r + dy) && !this.isRoad(o.c + dx, o.r + dy)) spots.set(idx(o.c + dx, o.r + dy), o);
    }
    return spots;
  };
  P.chooseNext = function (a) {
    const here = idx(a.c, a.r);
    const spots = this.yokaiSpots();
    if (spots.has(here)) return { buy: spots.get(here) };
    // 気ままに歩くが、ときどき薄暗い店へ寄っていく
    if (spots.size && Math.random() < C.YOKAI_SEEK) {
      const prev = new Int16Array(N).fill(-1), dist = new Int16Array(N).fill(-1), q = [here]; dist[here] = 0;
      let goal = -1;
      for (let h = 0; h < q.length; h++) {
        const i = q[h];
        if (spots.has(i)) { goal = i; break; }
        if (dist[i] >= C.YOKAI_SEEK_R) continue;
        const c = i % C.COLS, r = (i / C.COLS) | 0;
        for (const [dx, dy] of DIR4) { const nc = c + dx, nr = r + dy, j = idx(nc, nr); if (inMap(nc, nr) && dist[j] < 0 && this.walkY(nc, nr)) { dist[j] = dist[i] + 1; prev[j] = i; q.push(j); } }
      }
      if (goal >= 0) { let i = goal; while (prev[i] !== here && prev[i] >= 0) i = prev[i]; return { c: i % C.COLS, r: (i / C.COLS) | 0 }; }
    }
    let opts = DIR4.map(([dx, dy]) => ({ c: a.c + dx, r: a.r + dy })).filter(p => this.walkY(p.c, p.r));
    const off = opts.filter(p => !this.isRoad(p.c, p.r));
    if (off.length && !this.isRoad(a.c, a.r)) opts = off;
    const fwd = opts.filter(p => !a.last || p.c !== a.last.c || p.r !== a.last.r);
    const list = fwd.length ? fwd : opts;
    return list.length ? pick(list) : null;
  };
  P.release = function (a) { if (a.slot) { a.slot.inUse = Math.max(0, a.slot.inUse - 1); a.slot = null; } };
  P.leave = function (a) { if (a.state === 'gone') return; this.release(a); if (a.state === 'eat' && a.prey) { a.prey.eatBy = null; a.prey.eatT = 0; a.prey = null; this.dirty = true; } a.state = 'fade'; };
  P.flee = function (a, shooed) {
    this.release(a);
    if (a.state === 'eat' && a.prey) { a.prey.eatBy = null; a.prey.eatT = 0; a.prey = null; this.dirty = true; }
    if (a.sitAt) { a.sitAt.sitF = 0; a.sitAt.sitBy = null; a.sitAt = null; }
    a.state = 'flee'; a.hop = 0;
    const W = C.COLS * C.T, H = C.ROWS * C.T;
    const cands = [[-20, a.y], [W + 20, a.y], [a.x, -20], [a.x, H + 20]];
    const d = cands.map(([x, y]) => Math.hypot(x - a.x, y - a.y));
    const k = d.indexOf(Math.min(...d)); a.fx = cands[k][0]; a.fy = cands[k][1];
    if (shooed) { this.earn.shoo++; this.events.push({ t: 'shoo', x: a.x, y: a.y - 8 }); }
  };
  P.stepYokai = function (a) {
    a.t++; a.walking = false;
    if (a.state === 'flee') {
      a.hop++;
      const dx = a.fx - a.x, dy = a.fy - a.y, d = Math.hypot(dx, dy), sp = a.speed * 5;
      if (dx) a.face = dx > 0 ? 1 : -1;
      a.alpha = Math.max(0, a.alpha - 0.015);
      if (d < sp || a.alpha <= 0) { a.gone = true; return; }
      a.x += dx / d * sp; a.y += dy / d * sp;
      return;
    }
    if (a.state === 'fade') { a.alpha -= 0.025; if (a.alpha <= 0) a.gone = true; return; }
    if (a.state === 'appear') { a.alpha = Math.min(1, a.alpha + 0.025); if (a.alpha >= 1) a.state = 'walk'; return; }
    if (this.lvl(a.c, a.r) === 2 || this.area.bansho[idx(a.c, a.r)]) { this.events.push({ t: 'scared', x: a.x, y: a.y - 8 }); return this.flee(a, false); }
    if (a.state === 'sit') return;
    if (a.state === 'eat') return this.stepEat(a);
    if (a.state === 'buy') { if (--a.serving <= 0) this.whim(a, a.target); return; }
    if (--a.life <= 0 || this.over) return this.leave(a);
    if (!a.next) {
      const n = this.chooseNext(a);
      if (!n) { a.wait = (a.wait || 0) + 1; if (a.wait > 120) this.leave(a); return; }
      if (n.buy) { a.state = 'buy'; a.target = n.buy; a.serving = C.SERVE_F; a.face = n.buy.c >= a.c ? 1 : -1; n.buy.inUse++; a.slot = n.buy; return; }
      a.next = n;
    }
    if (!this.walkY(a.next.c, a.next.r)) { a.next = null; return; }
    const from = { c: a.c, r: a.r };
    if (stepTo(a, a.next.c, a.next.r, a.speed)) { a.last = from; a.next = null; }
  };
  P.stepEat = function (a) {
    const o = a.prey;
    if (!o || !this.burning(o)) return this.leave(a);
    o.eatT++;
    if (o.eatT >= C.YOKAI_EAT_F) {
      o.eaten = true; o.eatBy = null; o.eatT = 0; a.prey = null; this.dirty = true;
      this.earn.eaten++; this.stop = C.STOP_EAT; this.shake = C.SHAKE_EAT;
      this.events.push({ t: 'eaten', x: o.c * C.T + 8, y: o.r * C.T + 4 });
      this.leave(a);
    }
  };
  function pickWhim() {
    const W = C.WHIMS, keys = Object.keys(W);
    let x = Math.random() * keys.reduce((s, k) => s + W[k].w, 0);
    for (const k of keys) { x -= W[k].w; if (x <= 0) return k; }
    return 'normal';
  }
  P.whim = function (a, o) {
    this.release(a);
    if (this.lvl(o.c, o.r) !== 1 || o.cap <= 0) { a.state = 'walk'; return; }
    // ゲームで最初の妖怪は必ず大盤振る舞い(妖怪の値打ちを先に見せる)
    let k = !this.town.history.length && !this.earn.yn ? 'big' : pickWhim();
    let prey = null;
    if (k === 'eat') {
      let bd = 1e9;
      for (const l of this.objs) {
        if (!this.burning(l) || l.eatBy || this.area.bansho[idx(l.c, l.r)]) continue;
        const d = Math.hypot(l.c - a.c, l.r - a.r);
        if (d <= C.YOKAI_EAT_RANGE && d < bd) { bd = d; prey = l; }
      }
      if (!prey) k = 'normal';
    }
    this.earn.whims[k] = (this.earn.whims[k] || 0) + 1;
    const W = C.WHIMS[k];
    const mult = this.inArea('yashiro', o.c, o.r) ? C.YASHIRO_PAY : 1;
    const v = Math.round(STALLS[o.type].price * C.YOKAI_PAY * W.mult * mult);
    const x = o.c * C.T + 8, y = o.r * C.T - 2;
    if (v > 0) {
      this.useStock(o);
      this.town.money += v; this.earn.yokai += v; this.earn.yn++; o.bump = 8;
      if (k === 'leaf') this.earn.leaf += v;
      this.stop = C.STOP_YOKAI_BUY;
      this.events.push({ t: k === 'leaf' ? 'leafcoin' : 'bigcoin', v, x, y, big: k === 'big' || k === 'gift' });
    }
    if (W.label) this.events.push({ t: 'whim', k, s: W.label, x: a.x, y: a.y - 20 });
    if (k === 'eat') {
      a.state = 'eat'; a.prey = prey; prey.eatBy = a; prey.eatT = 0; a.face = prey.c >= a.c ? 1 : -1;
      this.events.push({ t: 'eatstart', x: prey.c * C.T + 8, y: prey.r * C.T });
    } else if (k === 'sit') {
      a.state = 'sit'; a.sitAt = o; o.sitF = C.SIT_F; o.sitBy = a;
    } else if (k === 'vanish') {
      a.state = 'fade'; a.alpha = Math.min(a.alpha, 0.6);
    } else this.leave(a);
  };

  // ---------- 夜の操作 ----------
  // 妖怪を追い払う、提灯を点け直す、火を細くする・戻す。何かしたら true
  P.poke = function (px, py) {
    if (!this.started || this.over) return false;
    let best = null, bd = 14;
    for (const a of this.yokai) {
      if (a.state === 'flee' || a.state === 'fade' || a.alpha < 0.3) continue;
      const d = Math.hypot(a.x - px, a.y - 7 - py) - (a.state === 'eat' || a.state === 'sit' ? 6 : 0);
      if (d < bd) { bd = d; best = a; }
    }
    const c = Math.floor(px / C.T), r = Math.floor(py / C.T);
    const o = [this.objAt(c, r), this.objAt(c, r + 1)].find(o => o && o.kind === 'lantern');
    if (o && o.eatBy) best = o.eatBy;
    if (best && (best.state === 'eat' || best.state === 'sit' || !o)) { this.flee(best, true); return true; }
    if (!o) return false;
    if (o.eaten) {
      if (this.town.money < C.RELIGHT_COST) { this.events.push({ t: 'nope', x: o.c * C.T + 8, y: o.r * C.T }); return true; }
      this.town.money -= C.RELIGHT_COST; o.eaten = false;
      this.events.push({ t: 'relight', x: o.c * C.T + 8, y: o.r * C.T + 2, v: C.RELIGHT_COST });
    } else {
      o.off = !o.off;
      this.events.push({ t: o.off ? 'lampoff' : 'lampon', x: o.c * C.T + 8, y: o.r * C.T + 2 });
    }
    this.dirty = true; this.recalc();
    return true;
  };
  P.buyOil = function () {
    if (this.town.money < C.OIL_BUY_COST) return false;
    this.town.money -= C.OIL_BUY_COST;
    if (this.oil <= 0) this.dirty = true;
    this.oil += C.OIL_BUY; this.oilMax = Math.max(this.oilMax, this.oil);
    this.events.push({ t: 'oil' });
    return true;
  };

  // ---------- 準備(夕暮れと朝)の操作。town を直に書き換える ----------
  function canBuild(town, tool, c, r, n) {
    if (!inMap(c, r)) return 'out';
    if (!landOpen(town, c, r)) return 'land';
    if (town.money < C.PRICE[tool]) return 'money';
    if (isGate(c, r) || town.roads[idx(c, r)] || objAt(town, c, r)) return 'used';
    if ((tool === 'lantern' || tool === 'joya') && !n.nearFire[idx(c, r)]) return 'fire';
    return '';
  }
  function build(town, tool, c, r, n) {
    if (canBuild(town, tool, c, r, n)) return false;
    town.money -= C.PRICE[tool];
    if (tool === 'road') town.roads[idx(c, r)] = 1;
    else town.objs.push({ type: tool, c, r });
    return true;
  }
  function demolish(town, c, r) {
    if (!inMap(c, r) || isGate(c, r)) return false;
    const o = objAt(town, c, r);
    if (o) { town.objs = town.objs.filter(x => x !== o); town.money += Math.floor(C.PRICE[o.type] * C.REFUND); return o.type; }
    if (town.roads[idx(c, r)]) { town.roads[idx(c, r)] = 0; town.money += Math.floor(C.PRICE.road * C.REFUND); return 'road'; }
    return false;
  }
  function buyLand(town, c, r) {
    if (!inMap(c, r)) return false;
    const k = landOf(c, r);
    if (!landBuyable(town, k) || town.money < landCost(k)) return false;
    town.money -= landCost(k); town.land[k] = 1;
    return true;
  }
  // 置いたら札がどうなるか(店を置く前の見本)。新しい店は光を出さないので、今の灯りで決まる
  function previewMark(n, c, r) { return levelOf(lightFrom(n.sources(), c, r)); }

  // ---------- 夜明け ----------
  function dawn(town, night) {
    const leaf = Math.min(town.money, night.earn.leaf);
    town.money -= leaf;
    const sum = Object.assign({ night: town.night, leafLost: leaf }, night.earn);
    town.total += night.earn.human + night.earn.yokai - leaf;
    const before = rankOf(town);
    town.best = Math.max(town.best || 0, night.earn.visitors);
    const after = rankOf(town);
    if (after > before) sum.rankUp = after;
    town.history.push(sum);
    town.night++;
    return sum;
  }

  root.Sim = { newTown, Night, dawn, canBuild, build, demolish, buyLand, landBuyable, landCost, landOf, landOpen, previewMark, idx, inMap, LX, LY, isStall, isBuild, rankOf, unlocked, staffOf };
})(window);
