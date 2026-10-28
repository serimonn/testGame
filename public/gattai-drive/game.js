'use strict';
/* =========================================================
   合体ドライブ  — 1台の車を2台のスマホで運転する
   ・ホスト（slot 0）が物理計算をして状態を配信
   ・ゲスト（slot 1）は入力を送って、届いた状態を描画
   ========================================================= */

const $ = (s) => document.querySelector(s);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ---------- マップ ----------
// 道路は2タイル幅（2車線・左側通行）、ブロックは4タイル四方
const T = 96;          // タイル1枚のピクセル
const RW = 2;          // 道路の幅（タイル数）
const P = 6;           // 道路 + ブロック の周期（タイル数）
const B = 6;           // 1辺あたりのブロック数
const N = B * P + RW;  // マップは N×N タイル
const LANE = T / 2;    // 中央線から車線の中心までの距離
const STAGE_TIME = 90; // 1ステージの秒数
const roadCenter = (k) => k * P * T + T;   // k本目の道路の中央線
const START = { x: roadCenter(3), y: roadCenter(3) };

function hash(a, b) {
  let h = (a * 374761393 + b * 668265263) ^ 0x5bd1e995;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}
// 0=道路 1=公園(草) 2=建物/壁
function tileAt(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= N || ty >= N) return 2;
  if (tx % P < RW || ty % P < RW) return 0;
  return hash(Math.floor(tx / P), Math.floor(ty / P)) % 5 === 0 ? 1 : 2;
}
const tileOfPx = (x, y) => tileAt(Math.floor(x / T), Math.floor(y / T));

// 道路の中央線上のランダムな点
function randomRoadPoint(minDistFrom, minDist) {
  for (let i = 0; i < 200; i++) {
    const horizontal = Math.random() < 0.5;
    const line = roadCenter(Math.floor(rand(0, B + 1)));
    const along = rand(T, N * T - T);
    const p = horizontal ? { x: along, y: line } : { x: line, y: along };
    if (!minDistFrom || Math.hypot(p.x - minDistFrom.x, p.y - minDistFrom.y) > minDist) return p;
  }
  return { ...START };
}
function nearestRoad(x, y) {
  const kx = clamp(Math.round((x - T) / (P * T)), 0, B), ky = clamp(Math.round((y - T) / (P * T)), 0, B);
  const cx = clamp(x, T, N * T - T), cy = clamp(y, T, N * T - T);
  const a = { x: roadCenter(kx), y: cy }, b = { x: cx, y: roadCenter(ky) };
  return Math.hypot(a.x - x, a.y - y) < Math.hypot(b.x - x, b.y - y) ? a : b;
}
// 進行方向(dx,dy)に対する左車線のずれ（画面はy下向き）
const leftOf = (dx, dy) => ({ x: dy * LANE, y: -dx * LANE });

/* =========================================================
   シミュレーション（ホストだけが動かす）
   ========================================================= */
function newSim() {
  const S = {
    phase: 'count', count: 3.4, t: 0,
    car: { x: START.x, y: START.y, a: -Math.PI / 2, vx: 0, vy: 0, air: 0, spin: 0 },
    cats: [],
    roles: Math.random() < 0.5 ? ['steer', 'pedal'] : ['pedal', 'steer'],
    dest: null, score: 0, deliv: 0, heat: 100, cond: 100,
    nextShuffle: rand(16, 22), warn: false,
    stats: { flips: 0, brakes: 0, crash: 0, cat: 0, cone: 0, oil: 0 },
    crashCd: 0, lastSteerSign: 0, prevPedal: 0,
    events: [],
  };
  S.dest = randomRoadPoint(START, 900);
  for (let i = 0; i < 7; i++) {
    const p = randomRoadPoint(START, 350);
    S.cats.push({
      x: p.x + rand(-40, 40), y: p.y + rand(-40, 40), a: Math.floor(rand(0, 4)) * Math.PI / 2,
      mode: 'sit', timer: rand(0.5, 3), fly: 0, vx: 0, vy: 0, color: i % CAT_COLORS.length,
    });
  }
  placeObstacles(S);
  return S;
}

/* ---------- 障害物 ----------
   コーン：工事区間で片側の車線をふさぐ。はね飛ばせるがピザが揺れる
   他の車：交差点ごとに気まぐれに曲がる。ぶつかると激突
   オイル：踏むとツルッと滑ってハンドルが効きすぎる               */
const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const NPC_COLORS = ['#6d8bc7', '#2ec27e', '#c96bb0', '#f2cc8f', '#7fb7be', '#ffffff'];
const nodePos = (i, j) => ({ x: roadCenter(i), y: roadCenter(j) });

function placeObstacles(S) {
  S.cones = []; S.signs = []; S.oils = []; S.npcs = [];

  // 工事区間：隣り合う交差点の間の片側車線にコーンを並べる
  const used = new Set();
  for (let z = 0; z < 9; z++) {
    let i, j, d, key, tries = 0;
    do {
      i = Math.floor(rand(0, B + 1)); j = Math.floor(rand(0, B + 1));
      d = pick(DIRS4);
      key = [Math.min(i, i + d[0]), Math.min(j, j + d[1]), d[0] !== 0].join();
      tries++;
    } while ((i + d[0] < 0 || j + d[1] < 0 || i + d[0] > B || j + d[1] > B || used.has(key) ||
             Math.hypot(nodePos(i, j).x - START.x, nodePos(i, j).y - START.y) < 300) && tries < 50);
    used.add(key);
    const a = nodePos(i, j), off = leftOf(d[0], d[1]);
    const segLen = P * T;
    const s0 = rand(0.3, 0.5) * segLen, len = rand(170, 260);
    S.signs.push({ x: a.x + d[0] * (s0 - 50) + off.x, y: a.y + d[1] * (s0 - 50) + off.y });
    for (let s = s0; s <= s0 + len; s += 42) {
      const x = a.x + d[0] * s + off.x, y = a.y + d[1] * s + off.y;
      S.cones.push({ x, y, ox: x, oy: y, fly: 0, vx: 0, vy: 0, back: 0 });
    }
    // 中央寄りにもう1列置いて、すり抜けを狭くする
    for (let s = s0 + 21; s <= s0 + len; s += 84) {
      const x = a.x + d[0] * s + off.x * 0.25, y = a.y + d[1] * s + off.y * 0.25;
      S.cones.push({ x, y, ox: x, oy: y, fly: 0, vx: 0, vy: 0, back: 0 });
    }
  }

  // オイル
  for (let k = 0; k < 8; k++) {
    const p = randomRoadPoint(START, 400);
    S.oils.push({ x: p.x + rand(-30, 30), y: p.y + rand(-30, 30), r: rand(38, 54), seed: Math.floor(rand(0, 1000)) });
  }

  // 他の車
  for (let k = 0; k < 11; k++) {
    let i, j;
    do { i = Math.floor(rand(0, B + 1)); j = Math.floor(rand(0, B + 1)); } while (i === 3 && j === 3);
    const d = pickDir(i, j, null);
    const o = leftOf(d[0], d[1]), p = nodePos(i, j);
    S.npcs.push({
      x: p.x + o.x, y: p.y + o.y, a: Math.atan2(d[1], d[0]),
      ti: i + d[0], tj: j + d[1], d, sp: rand(130, 210), wait: 0, honkCd: 0,
      color: Math.floor(rand(0, NPC_COLORS.length)),
    });
  }
}

function pickDir(i, j, prev) {
  const ok = DIRS4.filter(([dx, dy]) => {
    const ni = i + dx, nj = j + dy;
    if (ni < 0 || nj < 0 || ni > B || nj > B) return false;
    return !prev || !(dx === -prev[0] && dy === -prev[1]);
  });
  return ok.length ? pick(ok) : [-prev[0], -prev[1]];
}

function stepObstacles(S, dt) {
  const car = S.car;
  const sp = Math.hypot(car.vx, car.vy);
  const grounded = car.air <= 0;

  // --- コーン ---
  for (const c of S.cones) {
    if (c.back > 0) {
      c.back -= dt;
      if (c.back <= 0) { c.x = c.ox; c.y = c.oy; }
      continue;
    }
    if (c.fly > 0) {
      c.fly -= dt; c.x += c.vx * dt; c.y += c.vy * dt; c.vx *= 0.97; c.vy *= 0.97;
      if (c.fly <= 0) { c.back = 9; c.x = -9999; c.y = -9999; }
      continue;
    }
    if (!grounded) continue;
    const d = Math.hypot(c.x - car.x, c.y - car.y);
    if (d < 30) {
      if (sp > 60) {
        c.fly = 0.9; c.vx = car.vx * 1.2 + rand(-120, 120); c.vy = car.vy * 1.2 + rand(-120, 120);
        car.vx *= 0.88; car.vy *= 0.88;
        S.cond -= 4; S.stats.cone++;
        emit(S, { k: 'cone', x: c.x, y: c.y });
      } else {
        const ux = (car.x - c.x) / (d || 1), uy = (car.y - c.y) / (d || 1);
        car.x += ux * (30 - d); car.y += uy * (30 - d);
      }
    }
  }

  // --- オイル ---
  car.oil = Math.max(0, (car.oil || 0) - dt);
  if (grounded) {
    for (const o of S.oils) {
      if (Math.hypot(o.x - car.x, o.y - car.y) < o.r) {
        if (car.oil <= 0 && sp > 80) { S.stats.oil++; emit(S, { k: 'oil', x: car.x, y: car.y }); }
        car.oil = 0.9;
      }
    }
  }

  // --- 他の車 ---
  for (const n of S.npcs) {
    n.honkCd = Math.max(0, n.honkCd - dt);
    const fx = Math.cos(n.a), fy = Math.sin(n.a);
    // 目の前に主人公の車がいたら止まる（追突はしない。正面衝突はする）
    const ox = car.x - n.x, oy = car.y - n.y;
    const ahead = ox * fx + oy * fy, side = Math.abs(-ox * fy + oy * fx);
    const blocked = ahead > 0 && ahead < 80 && side < 34;
    if (n.wait > 0) n.wait -= dt;
    else if (!blocked) {
      const tp = nodePos(n.ti, n.tj), o = leftOf(n.d[0], n.d[1]);
      const tx = tp.x + o.x, ty = tp.y + o.y;
      const dx = tx - n.x, dy = ty - n.y, dist = Math.hypot(dx, dy);
      if (dist < 14) {
        const nd = pickDir(n.ti, n.tj, n.d);
        n.d = nd; n.ti += nd[0]; n.tj += nd[1];
      } else {
        const step = Math.min(dist, n.sp * dt);
        n.x += dx / dist * step; n.y += dy / dist * step;
        const want = Math.atan2(dy, dx);
        n.a += Math.atan2(Math.sin(want - n.a), Math.cos(want - n.a)) * Math.min(1, dt * 7);
      }
    }
    if (blocked && n.honkCd <= 0 && Math.random() < 0.5) { n.honkCd = 4; emit(S, { k: 'honk', x: n.x, y: n.y }); }
    else if (blocked) n.honkCd = Math.max(n.honkCd, 1);

    if (!grounded) continue;
    const d = Math.hypot(ox, oy);
    if (d < 46) {
      const ux = ox / (d || 1), uy = oy / (d || 1);
      car.x += ux * (46 - d); car.y += uy * (46 - d);
      const vn = car.vx * ux + car.vy * uy;
      if (vn < 0) { car.vx -= 1.6 * vn * ux; car.vy -= 1.6 * vn * uy; }
      if (sp > 110 && S.crashCd <= 0) {
        S.crashCd = 0.5; S.stats.crash++; S.cond -= 14;
        n.wait = 1.5; n.honkCd = 3;
        emit(S, { k: 'carhit', x: (car.x + n.x) / 2, y: (car.y + n.y) / 2 });
      }
    }
  }
}

function emit(S, ev) { S.events.push(ev); }

function stepSim(S, dt, steer, pedal) {
  if (S.phase === 'count') {
    S.count -= dt;
    if (S.count <= 0) { S.phase = 'play'; emit(S, { k: 'go' }); }
    return;
  }
  if (S.phase !== 'play') return;

  S.t += dt;
  if (S.t >= STAGE_TIME) { S.phase = 'result'; emit(S, { k: 'end' }); return; }

  const car = S.car;
  S.crashCd = Math.max(0, S.crashCd - dt);

  // --- 担当シャッフル ---
  if (!S.warn && S.t >= S.nextShuffle - 2) { S.warn = true; emit(S, { k: 'warn' }); }
  if (S.t >= S.nextShuffle) {
    S.roles = [S.roles[1], S.roles[0]];
    S.warn = false;
    S.nextShuffle = S.t + rand(16, 24);
    emit(S, { k: 'swap' });
  }

  // --- 入力の記録（喧嘩度） ---
  if (Math.abs(steer) > 0.5) {
    const sg = Math.sign(steer);
    if (S.lastSteerSign && sg !== S.lastSteerSign && S.t - (S.lastSteerT || 0) < 0.4) S.stats.flips++;
    S.lastSteerSign = sg;
    S.lastSteerT = S.t;
  }

  // --- 車の物理 ---
  const fx = Math.cos(car.a), fy = Math.sin(car.a);
  let vf = car.vx * fx + car.vy * fy;      // 前向き速度
  let vl = -car.vx * fy + car.vy * fx;     // 横すべり速度

  if (car.air > 0) {
    // 空中（ジャンプ中）
    car.air -= dt;
    car.a += car.spin * dt;
    car.vx *= 0.995; car.vy *= 0.995;
    car.x = clamp(car.x + car.vx * dt, 10, N * T - 10);
    car.y = clamp(car.y + car.vy * dt, 10, N * T - 10);
    if (car.air <= 0) {
      car.air = 0;
      if (tileOfPx(car.x, car.y) === 2) { const r = nearestRoad(car.x, car.y); car.x = r.x; car.y = r.y; }
      car.vx *= 0.3; car.vy *= 0.3;
      S.cond -= 10;
      emit(S, { k: 'thud', x: car.x, y: car.y });
    }
  } else {
    const onGrass = tileOfPx(car.x, car.y) === 1;
    if (pedal > 0.05) {
      vf += pedal * 560 * dt;
    } else if (pedal < -0.05) {
      if (vf > 20) {
        vf = Math.max(0, vf + pedal * 950 * dt);
        if (pedal < -0.5 && S.prevPedal >= -0.5 && Math.hypot(car.vx, car.vy) > 300) {
          S.stats.brakes++; S.cond -= 8;
          emit(S, { k: 'brake', x: car.x, y: car.y });
        }
      } else {
        vf = Math.max(-200, vf + pedal * 320 * dt);
      }
    }
    const oily = (car.oil || 0) > 0;
    const spinning = (car.spinT || 0) > 0;  // 猫に驚いてスピン中
    vf *= 1 - (onGrass ? 2.4 : oily || spinning ? 0.1 : 0.55) * dt;
    vf = clamp(vf, -200, onGrass ? 260 : 640);
    vl *= Math.max(0, 1 - (oily ? 0.4 : spinning ? 1.2 : 7) * dt);

    const turnScale = clamp(vf / 150, -1, 1); // 低速での回転半径 ≒ 55px
    if (spinning) {
      car.a += car.spinDir * 10 * (car.spinT / 0.9) * dt;
      car.spinT -= dt;
    } else {
      car.a += steer * (oily ? 4.2 : 2.7) * turnScale * dt + (oily ? Math.sin(S.t * 9) * 0.9 * dt : 0);
    }

    const nfx = Math.cos(car.a), nfy = Math.sin(car.a);
    car.vx = nfx * vf - nfy * vl;
    car.vy = nfy * vf + nfx * vl;
    car.x += car.vx * dt;
    car.y += car.vy * dt;

    const hit = collideBuildings(car);
    if (hit > 160 && S.crashCd <= 0) {
      S.crashCd = 0.35;
      S.stats.crash++;
      S.cond -= Math.min(30, hit / 16);
      emit(S, { k: 'crash', x: car.x, y: car.y });
    }
  }
  S.prevPedal = pedal;

  stepObstacles(S, dt);

  // --- 猫 ---
  // 座ってくつろぐ → ふらっと歩く → ときどき道を全力で横切る
  for (const c of S.cats) {
    if (c.fly > 0) {
      // 車をよけて大ジャンプ中
      c.fly -= dt; c.x += c.vx * dt; c.y += c.vy * dt;
      if (c.fly <= 0) {
        if (tileOfPx(c.x, c.y) !== 0) { const r = nearestRoad(c.x, c.y); c.x = r.x + rand(-40, 40); c.y = r.y + rand(-40, 40); }
        c.mode = 'sit'; c.timer = rand(1.5, 3);
      }
      continue;
    }
    c.timer -= dt;
    if (c.timer <= 0) {
      const r = Math.random();
      c.mode = r < 0.45 ? 'sit' : r < 0.85 ? 'walk' : 'dash';
      c.a = Math.floor(rand(0, 4)) * Math.PI / 2;
      c.timer = c.mode === 'sit' ? rand(2, 5) : c.mode === 'walk' ? rand(1.5, 3.5) : rand(0.8, 1.4);
    }
    if (c.mode !== 'sit') {
      const v = c.mode === 'dash' ? 170 : 34;
      const nx = c.x + Math.cos(c.a) * v * dt, ny = c.y + Math.sin(c.a) * v * dt;
      if (tileOfPx(nx, ny) === 0) { c.x = nx; c.y = ny; } else { c.a += Math.PI; }
    }

    if (car.air <= 0) {
      const d = Math.hypot(c.x - car.x, c.y - car.y);
      if (d < 34) {
        const sp = Math.hypot(car.vx, car.vy);
        // 猫は必ず飛びのく（無事）。車は驚いてスピン
        const ux = (c.x - car.x) / (d || 1), uy = (c.y - car.y) / (d || 1);
        c.fly = 0.6; c.vx = ux * 260 + rand(-60, 60); c.vy = uy * 260 + rand(-60, 60);
        c.a = Math.atan2(c.vy, c.vx);
        if (sp > 140) {
          car.spinT = 0.9; car.spinDir = Math.random() < 0.5 ? -1 : 1;
          S.cond -= 12; S.stats.cat++;
          emit(S, { k: 'meow', x: c.x, y: c.y });
        } else {
          emit(S, { k: 'nya', x: c.x, y: c.y });
        }
      }
    }
  }

  // --- ピザ ---
  S.heat = Math.max(0, S.heat - dt * 2.6);
  if (S.cond <= 0) {
    S.score = Math.max(0, S.score - 30);
    S.cond = 100; S.heat = 100;
    emit(S, { k: 'ruined', x: car.x, y: car.y });
  }

  // --- 配達判定（ちゃんと止まらないとダメ） ---
  const dd = Math.hypot(S.dest.x - car.x, S.dest.y - car.y);
  if (dd < 70 && Math.hypot(car.vx, car.vy) < 60 && car.air <= 0) {
    const pts = Math.round(40 + 60 * (S.cond / 100) * (S.heat / 100));
    S.score += pts; S.deliv++;
    emit(S, { k: 'deliver', x: S.dest.x, y: S.dest.y, pts });
    S.heat = 100; S.cond = 100;
    S.dest = randomRoadPoint(car, 900);
  }
}

function collideBuildings(car) {
  const r = 20;
  let hit = 0;
  const tx0 = Math.floor((car.x - r) / T), tx1 = Math.floor((car.x + r) / T);
  const ty0 = Math.floor((car.y - r) / T), ty1 = Math.floor((car.y + r) / T);
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      if (tileAt(tx, ty) !== 2) continue;
      const cx = clamp(car.x, tx * T, tx * T + T), cy = clamp(car.y, ty * T, ty * T + T);
      let dx = car.x - cx, dy = car.y - cy, d = Math.hypot(dx, dy);
      if (d >= r) continue;
      if (d < 0.001) { dx = -car.vx; dy = -car.vy; d = Math.hypot(dx, dy) || 1; }
      const nx = dx / d, ny = dy / d;
      const push = d < 0.001 ? r : r - d;
      car.x += nx * push; car.y += ny * push;
      const vn = car.vx * nx + car.vy * ny;
      if (vn < 0) { car.vx -= 1.5 * vn * nx; car.vy -= 1.5 * vn * ny; hit = Math.max(hit, -vn); }
    }
  }
  return hit;
}

// 点数のランク（CPU同士で測った分布から：ミスなしCPUの上位がS）
const RANKS = [
  { r: 'S', min: 700, name: '伝説の配達コンビ' },
  { r: 'A', min: 500, name: '敏腕ドライバー' },
  { r: 'B', min: 300, name: '一人前の配達員' },
  { r: 'C', min: 150, name: '見習い配達員' },
  { r: 'D', min: -Infinity, name: 'クビ寸前' },
];
const rankOf = (score) => RANKS.find((x) => score >= x.min);

function kenkaOf(st) {
  return Math.min(100, Math.round(st.flips * 0.8 + st.brakes * 3 + st.crash * 3 + (st.cat || 0) * 5 + (st.cone || 0) * 0.7 + (st.oil || 0) * 2));
}
function kenkaTitle(k) {
  if (k < 20) return '以心伝心の熟年夫婦';
  if (k < 40) return 'たまに口きかない';
  if (k < 60) return '倦怠期まっさかり';
  if (k < 80) return '離婚調停中';
  return '前世からの因縁';
}

/* =========================================================
   CPU相方（ひとりで遊ぶモード）
   ・道路の最短経路を知っているが、ポンコツ
   ・ときどき「うっかり」やらかす
   ========================================================= */
const DIRS = DIRS4;
// 道路網を粗いマス目で考える：偶数番目=道路、奇数番目=ブロック
const CN = 2 * B + 1;
const coarseOf = (px) => {
  const tx = clamp(Math.floor(px / T), 0, N - 1), k = Math.floor(tx / P);
  return tx % P < RW ? 2 * k : 2 * k + 1;
};
const coarseCenter = (c) => c % 2 === 0 ? roadCenter(c / 2) : ((c - 1) / 2) * P * T + RW * T + (P - RW) * T / 2;
const coarseRoad = (cx, cy) => cx % 2 === 0 || cy % 2 === 0;
let distField = null, distKey = '';

// 配達先からの道路距離マップ（BFS）。配達先が変わったときだけ作り直す
function buildField(dest) {
  const dx0 = coarseOf(dest.x), dy0 = coarseOf(dest.y);
  const key = dx0 + ',' + dy0;
  if (key === distKey) return distField;
  const f = new Int16Array(CN * CN).fill(-1);
  const q = [dx0, dy0];
  f[dy0 * CN + dx0] = 0;
  for (let i = 0; i < q.length; i += 2) {
    const x = q[i], y = q[i + 1], d = f[y * CN + x];
    for (const [ax, ay] of DIRS) {
      const nx = x + ax, ny = y + ay;
      if (nx < 0 || ny < 0 || nx >= CN || ny >= CN) continue;
      if (!coarseRoad(nx, ny) || f[ny * CN + nx] >= 0) continue;
      f[ny * CN + nx] = d + 1;
      q.push(nx, ny);
    }
  }
  distField = f; distKey = key;
  return f;
}

// 次に向かうべき地点（左車線の中央）と、次の曲がり角までの距離
function waypoint(S) {
  const f = buildField(S.dest), c = S.car;
  let cx = coarseOf(c.x), cy = coarseOf(c.y);
  if (!coarseRoad(cx, cy) || f[cy * CN + cx] < 0) return { ...nearestRoad(c.x, c.y), turn: 0, dir: null };
  const steps = [];
  for (let s = 0; s < 6; s++) {
    let best = null, bd = f[cy * CN + cx];
    if (bd === 0) break;
    for (const [ax, ay] of DIRS) {
      const nx = cx + ax, ny = cy + ay;
      if (nx < 0 || ny < 0 || nx >= CN || ny >= CN) continue;
      const d = f[ny * CN + nx];
      if (d >= 0 && d < bd) { bd = d; best = [nx, ny, ax, ay]; }
    }
    if (!best) break;
    steps.push(best);
    cx = best[0]; cy = best[1];
  }
  if (!steps.length) return { x: S.dest.x, y: S.dest.y, turn: 9999, dir: null };
  let k = -1;
  for (let i = 1; i < steps.length; i++) {
    if (steps[i][2] !== steps[0][2] || steps[i][3] !== steps[0][3]) { k = i - 1; break; }
  }
  const at = (st) => {
    const o = leftOf(st[2], st[3]);
    return { x: coarseCenter(st[0]) + o.x, y: coarseCenter(st[1]) + o.y };
  };
  const turn = k < 0 ? 9999 : Math.hypot(at(steps[k]).x - c.x, at(steps[k]).y - c.y);
  // 次の一歩で曲がるなら交差点、まっすぐなら2歩先を目指す
  const st = k === 0 ? steps[0] : steps[Math.min(1, steps.length - 1)];
  // 配達先のマスに入ったら配達先そのもの
  if (f[st[1] * CN + st[0]] === 0 && k !== 0) return { x: S.dest.x, y: S.dest.y, turn, dir: [st[2], st[3]] };
  return { ...at(st), turn, dir: [st[2], st[3]] };
}

// 車から配達先までの道順（道路の中央線をたどる点の列）。表示用
function routeTo(x, y, dest) {
  const f = buildField(dest);
  let cx = coarseOf(x), cy = coarseOf(y);
  const pts = [[x, y]];
  if (!coarseRoad(cx, cy) || f[cy * CN + cx] < 0) {
    const r = nearestRoad(x, y); pts.push([r.x, r.y]); cx = coarseOf(r.x); cy = coarseOf(r.y);
    if (f[cy * CN + cx] < 0) return pts;
  }
  for (let s = 0; s < 40 && f[cy * CN + cx] > 0; s++) {
    let best = null, bd = f[cy * CN + cx];
    for (const [ax, ay] of DIRS4) {
      const nx = cx + ax, ny = cy + ay;
      if (nx < 0 || ny < 0 || nx >= CN || ny >= CN) continue;
      const d = f[ny * CN + nx];
      if (d >= 0 && d < bd) { bd = d; best = [nx, ny]; }
    }
    if (!best) break;
    [cx, cy] = best;
    // 曲がる点（交差点）だけ残す
    const p = [coarseCenter(cx), coarseCenter(cy)];
    if (cx % 2 === 0 && cy % 2 === 0) pts.push(p);
  }
  // 最後の交差点から配達先へは、道に沿って直角に曲がる
  const [lx, ly] = pts[pts.length - 1];
  if (Math.abs(dest.x - lx) > 4 && Math.abs(dest.y - ly) > 4) {
    pts.push(Math.abs(dest.x - lx) > Math.abs(dest.y - ly) ? [dest.x, ly] : [lx, dest.y]);
  }
  pts.push([dest.x, dest.y]);
  return pts;
}

// 進行方向の前方にある障害物（返り値：一番近い距離と種類）
function obstacleAhead(S, x, y, fx, fy, range, width) {
  let best = { d: 9999, kind: '' };
  const check = (o, kind, r) => {
    const ox = o.x - x, oy = o.y - y;
    const ahead = ox * fx + oy * fy, side = Math.abs(-ox * fy + oy * fx);
    if (ahead > 0 && ahead < range && side < width + r && ahead < best.d) best = { d: ahead, kind };
  };
  for (const w of S.cats) if (w.fly <= 0) check(w, 'cat', 14);
  for (const n of S.npcs) check(n, 'car', 24);
  for (const c of S.cones) if (c.fly <= 0 && c.back <= 0) check(c, 'cone', 10);
  return best;
}

function makeCpu() {
  return { nextOops: rand(9, 14), oops: 0, oopsVal: 0, stuck: 0, reverse: 0, dodge: 0 };
}

// CPUが担当する入力値を返す（role: 'steer' | 'pedal'）
function cpuControl(S, cpu, role, dt) {
  if (S.phase !== 'play') return 0;
  const c = S.car;
  const sp = Math.hypot(c.vx, c.vy);
  const fx = Math.cos(c.a), fy = Math.sin(c.a);
  const vf = c.vx * fx + c.vy * fy;

  // うっかり
  cpu.nextOops -= dt;
  if (cpu.nextOops <= 0 && cpu.oops <= 0) {
    cpu.oops = rand(0.8, 1.4);
    cpu.oopsVal = role === 'steer' ? (Math.random() < 0.5 ? -1 : 1) : (Math.random() < 0.5 ? -1 : 1);
    cpu.nextOops = rand(10, 16);
  }
  if (cpu.oops > 0) { cpu.oops -= dt; return cpu.oopsVal; }

  const wp = waypoint(S);
  const aim = (p) => { const d = Math.atan2(p.y - c.y, p.x - c.x) - c.a; return Math.atan2(Math.sin(d), Math.cos(d)); };
  let diff = aim(wp);

  if (role === 'steer') {
    // 前に障害物があれば反対車線へよける
    if (wp.dir && sp > 30) {
      const range = Math.max(190, sp * 0.6);
      const ob = obstacleAhead(S, c.x, c.y, wp.dir[0], wp.dir[1], range, 26);
      if (ob.d < range) cpu.dodge = 0.9;
    }
    if (cpu.dodge > 0 && wp.dir) {
      cpu.dodge -= dt;
      const o = leftOf(wp.dir[0], wp.dir[1]);
      diff = aim({ x: wp.x - o.x * 2 + wp.dir[0] * 60, y: wp.y - o.y * 2 + wp.dir[1] * 60 });
    }
    const dir = vf < -10 ? -1 : 1;
    const want = clamp(diff * 2.0, -1, 1) * dir;
    cpu.sOut = (cpu.sOut || 0) + (want - (cpu.sOut || 0)) * Math.min(1, dt * 8); // 人間っぽくなめらかに
    return cpu.sOut;
  }

  // --- ペダル ---
  if (c.air > 0) return 0;
  if (cpu.reverse > 0) { cpu.reverse -= dt; return -1; }

  const dd = Math.hypot(S.dest.x - c.x, S.dest.y - c.y);
  let target = 520;
  if (dd < 66) return sp > 15 ? -1 : 0;                              // 配達先で止まる
  target = Math.min(target, Math.max(40, (dd - 50) * 1.5));
  target = Math.min(target, 170 + wp.turn * 1.1);                   // 次の角に向けて先に減速
  if (wp.turn < 260) {                                              // 曲がっている最中
    if (Math.abs(diff) > 0.6) target = Math.min(target, 190);
    if (Math.abs(diff) > 1.6) target = Math.min(target, 110);
  }
  // 前方の壁
  let wall = 9999;
  for (let r = 30; r <= Math.max(90, sp * 0.7); r += 20) {
    if (tileOfPx(c.x + fx * r, c.y + fy * r) === 2) { wall = r; target = Math.min(target, Math.max(0, r - 35) * 1.6); break; }
  }
  // 壁に鼻先を向けたまま曲がれない → バックで切り返す
  if (wall < 60 && Math.abs(diff) > 0.7 && sp < 80) { cpu.reverse = 0.6; return -1; }
  // 曲がるには少し前に進む必要がある
  if (Math.abs(diff) > 0.7 && wall > 60) target = Math.max(target, 70);
  // 前方の猫・車・コーン
  const ob = obstacleAhead(S, c.x, c.y, fx, fy, 190, 22);
  if (ob.kind === 'cone') target = Math.min(target, 130);
  else if (ob.kind) target = Math.min(target, Math.max(0, ob.d - 55) * 1.5);

  // 詰まったらバック
  if (sp < 25 && dd > 90) {
    cpu.stuck += dt;
    if (cpu.stuck > 1.2) { cpu.stuck = 0; cpu.reverse = 0.8; }
  } else cpu.stuck = 0;

  if (sp < target - 25) return 1;
  if (sp > target + 150) return -1;
  if (sp > target + 30) return -0.45;
  return 0.15;
}

// 送信用に状態を縮める
function pack(S) {
  const c = S.car;
  return {
    t: 's', p: S.phase, n: Math.ceil(S.count), tm: Math.max(0, Math.ceil(STAGE_TIME - S.t)),
    car: [Math.round(c.x), Math.round(c.y), +c.a.toFixed(2), +c.air.toFixed(2), Math.round(Math.hypot(c.vx, c.vy)), (c.oil || 0) > 0 ? 1 : 0, Math.round(c.vx), Math.round(c.vy)],
    cats: S.cats.map((w) => [Math.round(w.x), Math.round(w.y), Math.cos(w.a) < -0.1 ? -1 : 1,
      w.fly > 0 ? 2 : w.mode === 'sit' ? 1 : 0, w.color, +Math.max(0, w.fly).toFixed(2)]),
    npcs: S.npcs.map((n) => [Math.round(n.x), Math.round(n.y), +n.a.toFixed(2), n.color]),
    cones: S.cones.map((k) => [Math.round(k.x), Math.round(k.y), k.fly > 0 ? 1 : 0]),
    oils: S.oils.map((o) => [Math.round(o.x), Math.round(o.y), Math.round(o.r), o.seed]),
    signs: S.signs.map((g) => [Math.round(g.x), Math.round(g.y)]),
    r: S.roles, d: [Math.round(S.dest.x), Math.round(S.dest.y)],
    sc: S.score, dv: S.deliv, h: Math.round(S.heat), cd: Math.round(Math.max(0, S.cond)),
    w: S.warn,
    st: S.phase === 'result' ? S.stats : null,
  };
}

/* =========================================================
   ネットワーク / 画面遷移
   ========================================================= */
const net = { ws: null, slot: -1, peer: false, code: '' };
let mode = 'none';  // 'host' | 'guest' | 'solo'
let sim = null;
let view = null;    // 描画に使う最新の状態
let shown = null;   // 補間後の表示用（車・猫など）
let remote = { s: 0, p: 0 };
let outbox = [];

function showScreen(id) {
  for (const el of document.querySelectorAll('.screen')) el.classList.toggle('active', el.id === id);
  if (id === 'game') { resize(); requestWakeLock(); }
}

/* ---------- 接続が途切れても続けられるように ----------
   ・端末ごとのID（cid）で再接続すると、サーバーは同じ席（ホスト/ゲスト）に戻す
   ・自分が切れたら自動で再接続を繰り返す（約25秒）
   ・相方が切れたらゲームを一時停止して、戻ってくるのを待つ（約30秒）
   ・20秒ごとに "ping" を送って、待機中やリザルト画面でも接続が切られないようにする */
const CID = (() => {
  let id = '';
  try { id = sessionStorage.getItem('gattai_cid') || ''; } catch {}
  if (!id) {
    id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
    try { sessionStorage.setItem('gattai_cid', id); } catch {}
  }
  return id;
})();
const RETRY_DELAYS = [300, 800, 1500, 2500, 4000, 6000, 9000];
const PEER_WAIT_SEC = 30;
let reconnecting = false, retryIdx = 0, retryTimer = 0;
let paused = false, peerWaitTimer = 0, peerWaitUntil = 0;

function connect(code, resume = false) {
  if (resume) { if (net.ws) { const w = net.ws; net.ws = null; try { w.close(); } catch {} } }
  else { disconnect(); snaps.length = 0; lagHist.length = 0; clockOff = null; }
  net.code = code;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  // ページと同じフォルダ配下の ws/ に接続（/gattai-drive/ なら /gattai-drive/ws/1234）
  const base = location.pathname.replace(/[^/]*$/, '');
  const ws = new WebSocket(`${proto}://${location.host}${base}ws/${code}?cid=${encodeURIComponent(CID)}`);
  net.ws = ws;
  ws.onmessage = (e) => {
    if (e.data === 'pong') return;
    onNet(JSON.parse(e.data));
  };
  ws.onclose = () => {
    if (net.ws !== ws) return;
    net.ws = null;
    if (mode === 'host' || mode === 'guest') scheduleReconnect();
    else if (mode === 'none') $('#lobbyMsg').textContent = '接続できませんでした';
  };
  ws.onerror = () => {};
}
function disconnect() {
  stopReconnect();
  clearTimeout(peerWaitTimer); paused = false;
  if (net.ws) { const w = net.ws; net.ws = null; try { w.close(); } catch {} }
  net.slot = -1; net.peer = false;
}
function scheduleReconnect() {
  if (!reconnecting) { reconnecting = true; retryIdx = 0; }
  showConn('通信が途切れました', '再接続しています…');
  if (retryIdx >= RETRY_DELAYS.length) {
    reconnecting = false;
    hideConn();
    notice('接続が切れました。電波のよい場所で、もう一度部屋に入ってください');
    return;
  }
  clearTimeout(retryTimer);
  retryTimer = setTimeout(() => connect(net.code, true), RETRY_DELAYS[retryIdx++]);
}
function stopReconnect() { reconnecting = false; clearTimeout(retryTimer); }

// 画面に戻ってきたら、切れていればすぐつなぎ直す
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  if ((mode === 'host' || mode === 'guest') && (!net.ws || net.ws.readyState > 1)) {
    clearTimeout(retryTimer); reconnecting = true; retryIdx = 0;
    connect(net.code, true);
  }
  requestWakeLock();
});
setInterval(() => { if (net.ws && net.ws.readyState === 1) net.ws.send('ping'); }, 20000);

// ゲーム中は画面を自動で消さない（対応ブラウザのみ）
let wakeLock = null;
async function requestWakeLock() {
  if (mode === 'none' || !$('#game').classList.contains('active')) return;
  try { if (navigator.wakeLock && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch {}
}
function releaseWakeLock() { try { wakeLock && wakeLock.release(); } catch {} wakeLock = null; }

function showConn(title, text) {
  $('#connTitle').textContent = title; $('#connText').textContent = text;
  $('#conn').classList.add('show');
}
function hideConn() { $('#conn').classList.remove('show'); }

// 相方が切れた：ゲームを止めて待つ
function waitForPeer() {
  paused = true;
  peerWaitUntil = performance.now() + PEER_WAIT_SEC * 1000;
  const tick = () => {
    if (net.peer || !paused) return;
    const left = Math.ceil((peerWaitUntil - performance.now()) / 1000);
    if (left <= 0) { giveUpPeer(); return; }
    showConn('相方の通信が途切れました', `戻ってくるのを待っています…（あと${left}秒）`);
    peerWaitTimer = setTimeout(tick, 250);
  };
  clearTimeout(peerWaitTimer); tick();
}
function peerBack() {
  clearTimeout(peerWaitTimer);
  paused = false; hideConn();
  sendAcc = 1; sentResult = false; // ホストは最新の状態をすぐ送り直す
}
function giveUpPeer() {
  clearTimeout(peerWaitTimer);
  paused = false; hideConn();
  sim = null; view = null;
  hideOverlays();
  showScreen('waiting');
  $('#waitText').innerHTML = '相方がいなくなりました…<br>もう一度招待してください';
}
function send(obj) { if (net.ws && net.ws.readyState === 1) net.ws.send(JSON.stringify(obj)); }

function onNet(m) {
  switch (m.t) {
    case 'full':
      if (reconnecting) { stopReconnect(); hideConn(); notice('接続が切れました。もう一度部屋に入ってください'); break; }
      $('#lobbyMsg').textContent = 'その部屋は満員です';
      mode = 'none'; disconnect(); showScreen('lobby');
      break;
    case 'welcome': {
      const resumed = reconnecting && (sim || view);
      stopReconnect(); hideConn();
      net.slot = m.slot;
      net.peer = !!m.peer;
      mode = m.slot === 0 ? 'host' : 'guest';
      history.replaceState(null, '', `?room=${net.code}`);
      $('#roomCode').textContent = net.code;
      if (resumed) {
        // 再接続できた：続きから
        if (m.peer) peerBack(); else waitForPeer();
      } else if (m.peer) {
        if (mode === 'host') startHostGame(); else { showScreen('game'); }
      } else {
        showScreen('waiting');
      }
      break;
    }
    case 'peer_join':
      net.peer = true;
      if (paused) peerBack();
      else if (mode === 'host' && !sim) startHostGame();
      else if (mode === 'host') { sendAcc = 1; sentResult = false; }
      break;
    case 'peer_leave':
      net.peer = false;
      // ゲーム中なら一時停止して戻りを待つ。待機画面ならそのまま
      if ((sim || view) && $('#game').classList.contains('active')) waitForPeer();
      else giveUpPeer();
      break;
    case 'in':
      remote = { s: +m.s || 0, p: +m.p || 0 };
      break;
    case 'again':
      if (mode === 'host') startHostGame();
      break;
    case 's':
      if (mode === 'guest') {
        if (!$('#game').classList.contains('active')) showScreen('game');
        receiveState(m);
      }
      break;
  }
}

function startHostGame() {
  sim = newSim();
  remote = { s: 0, p: 0 };
  hideOverlays();
  showScreen('game');
}
// soloType: 'cpu' = CPUと合体（slot 0が自分、slot 1がCPU） / 'both' = 全部ひとりで操作
let soloType = 'cpu';
function newSoloSim() {
  const S = newSim();
  if (soloType === 'cpu') S.cpu = makeCpu();
  return S;
}
function startSolo(type) {
  mode = 'solo';
  soloType = type;
  disconnect();
  sim = newSoloSim();
  hideOverlays();
  showScreen('game');
}

/* ---------- ゲスト側のなめらか表示（スナップショット補間） ----------
   ホストから届いた状態を時刻つきでためておき、「少し前の時刻」を表示する。
   その時刻をはさむ2つの状態のあいだを補間するので、届く間隔がばらついても一定の速さで動く。
   どれだけ前を表示するかは、届く間隔のばらつきに合わせて自動で調整する */
const snaps = [];
let clockOff = null;            // 受信時刻 − 送信時刻 の最小値（ネットの最短遅延＋時計のずれ）
let playDelay = 160;            // 何ミリ秒前を表示するか（自動調整）
const lagHist = [];

function receiveState(m) {
  const first = !view;
  const now = performance.now();
  view = m;
  view._t = now;
  if (m.ev) for (const ev of m.ev) handleEvent(ev);
  if (m.ht !== undefined) {
    const last = snaps[snaps.length - 1];
    if (last && m.ht < last.ht - 1000) { snaps.length = 0; clockOff = null; lagHist.length = 0; } // ホストが読み込み直した
    const lag = now - m.ht;
    lagHist.push({ at: now, lag });
    while (lagHist.length && lagHist[0].at < now - 4000) lagHist.shift();
    let minLag = Infinity, maxLag = -Infinity;
    for (const h of lagHist) { minLag = Math.min(minLag, h.lag); maxLag = Math.max(maxLag, h.lag); }
    clockOff = minLag;
    // 送信間隔（100ms）＋ばらつき ぶんだけ遅らせれば、ほぼ常に「次の状態」が手元にある
    const want = clamp(100 + (maxLag - minLag) + 20, 110, 320);
    playDelay += (want - playDelay) * (want > playDelay ? 0.3 : 0.03);
    snaps.push({ ht: m.ht, car: m.car, cats: m.cats, npcs: m.npcs, cones: m.cones });
    while (snaps.length > 2 && snaps[1].ht < m.ht - 1500) snaps.shift();
  }
  if (first || !shown) shown = cloneView(m);
}

function makeCode() { return String(Math.floor(1000 + Math.random() * 9000)); }

$('#btnCreate').onclick = () => { $('#lobbyMsg').textContent = ''; connect(makeCode()); };
$('#btnJoin').onclick = () => {
  const code = $('#codeInput').value.replace(/\D/g, '');
  if (code.length !== 4) { $('#lobbyMsg').textContent = '4桁のコードを入れてください'; return; }
  $('#lobbyMsg').textContent = '';
  connect(code);
};
$('#btnCpu').onclick = () => startSolo('cpu');
$('#btnSolo').onclick = () => startSolo('both');
$('#btnLeave').onclick = backToLobby;
$('#btnLobby').onclick = backToLobby;
$('#btnAgain').onclick = () => {
  hideOverlays();
  if (mode === 'solo') sim = newSoloSim();
  else if (mode === 'host') sim = newSim();
  else send({ t: 'again' });
};
$('#btnShare').onclick = async () => {
  const url = `${location.origin}${location.pathname}?room=${net.code}`;
  const text = `合体ドライブやろう！部屋コード ${net.code}`;
  try {
    if (navigator.share) await navigator.share({ title: '合体ドライブ', text, url });
    else { await navigator.clipboard.writeText(url); $('#btnShare').textContent = 'リンクをコピーしました'; }
  } catch {}
};
$('#btnNotice').onclick = backToLobby;
$('#btnConnQuit').onclick = backToLobby;

function backToLobby() {
  mode = 'none'; disconnect(); sim = null; view = null; shown = null;
  hideOverlays(); hideConn(); releaseWakeLock();
  history.replaceState(null, '', location.pathname);
  $('#waitText').innerHTML = '相方を待っています…<br>コードかリンクを送ってください';
  $('#btnShare').textContent = '招待リンクを送る';
  showScreen('lobby');
}
function notice(text) {
  $('#noticeText').textContent = text;
  $('#notice').classList.add('show');
}
function hideOverlays() {
  $('#result').classList.remove('show');
  $('#notice').classList.remove('show');
  resultShown = false;
}

/* =========================================================
   入力（タッチ＋キーボード）
   ========================================================= */
const input = { steer: 0, pedal: 0, keySteer: 0, keyPedal: 0, touchSteer: 0, gas: false, brake: false };
const wheelEl = $('#wheel');

(function setupSteer() {
  const pad = $('#steerPad');
  let pid = null, sx = 0;
  pad.addEventListener('pointerdown', (e) => {
    pid = e.pointerId; sx = e.clientX; pad.setPointerCapture(pid); e.preventDefault();
  });
  pad.addEventListener('pointermove', (e) => {
    if (e.pointerId !== pid) return;
    input.touchSteer = clamp((e.clientX - sx) / (pad.clientWidth * 0.28), -1, 1);
  });
  const end = (e) => { if (e.pointerId === pid) { pid = null; input.touchSteer = 0; } };
  pad.addEventListener('pointerup', end);
  pad.addEventListener('pointercancel', end);
})();

function bindPedal(el, key) {
  const ids = new Set();
  const update = () => { input[key] = ids.size > 0; el.classList.toggle('down', input[key]); };
  el.addEventListener('pointerdown', (e) => { ids.add(e.pointerId); el.setPointerCapture(e.pointerId); e.preventDefault(); update(); });
  const end = (e) => { ids.delete(e.pointerId); update(); };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}
bindPedal($('#gas'), 'gas');
bindPedal($('#brake'), 'brake');

const keys = new Set();
addEventListener('keydown', (e) => { keys.add(e.key.toLowerCase()); });
addEventListener('keyup', (e) => { keys.delete(e.key.toLowerCase()); });
document.addEventListener('gesturestart', (e) => e.preventDefault());

function readInput() {
  const kl = keys.has('arrowleft') || keys.has('a'), kr = keys.has('arrowright') || keys.has('d');
  const ku = keys.has('arrowup') || keys.has('w'), kd = keys.has('arrowdown') || keys.has('s');
  input.steer = clamp(input.touchSteer + (kr ? 1 : 0) - (kl ? 1 : 0), -1, 1);
  input.pedal = clamp((input.gas || ku ? 1 : 0) - (input.brake || kd ? 1 : 0), -1, 1);
}
function resetLocalInput() {
  input.touchSteer = 0; input.gas = false; input.brake = false;
  $('#gas').classList.remove('down'); $('#brake').classList.remove('down');
}

/* =========================================================
   描画
   ========================================================= */
const cv = $('#cv');
const ctx = cv.getContext('2d');
let DPR = 1, CW = 0, CH = 0;
function resize() {
  const r = cv.getBoundingClientRect();
  DPR = Math.min(2, devicePixelRatio || 1);
  CW = r.width; CH = r.height;
  cv.width = Math.round(CW * DPR); cv.height = Math.round(CH * DPR);
}
addEventListener('resize', resize);

const fx = { floats: [], shake: 0, skids: [] };
function floatText(x, y, text, color) { fx.floats.push({ x, y, text, color, t: 0 }); }
function buzz(ms) { try { navigator.vibrate && navigator.vibrate(ms); } catch {} }

function handleEvent(ev) {
  switch (ev.k) {
    case 'meow': floatText(ev.x, ev.y, 'ニャーーッ！！', '#fff6e0'); fx.shake = 12; buzz([60, 40, 120]); break;
    case 'nya': floatText(ev.x, ev.y, 'ニャ', '#fff6e0'); break;
    case 'crash': floatText(ev.x, ev.y, 'ガシャン！', '#ff4b3e'); fx.shake = 10; buzz(80); break;
    case 'carhit': floatText(ev.x, ev.y, 'ドガシャーン！', '#ff4b3e'); fx.shake = 16; buzz([80, 30, 80]); break;
    case 'cone': floatText(ev.x, ev.y, 'カーン！', '#ff7a1a'); fx.shake = 4; buzz(25); break;
    case 'oil': floatText(ev.x, ev.y, 'ツルッ！', '#9fd3ff'); buzz([20, 20, 20, 20]); break;
    case 'honk': floatText(ev.x, ev.y, 'プップー！', '#fff6e0'); break;
    case 'brake': floatText(ev.x, ev.y, 'ピザが滑った！', '#ffd23f'); buzz(40); break;
    case 'thud': floatText(ev.x, ev.y, 'ドスン', '#fff6e0'); fx.shake = 8; buzz(60); break;
    case 'ruined': floatText(ev.x, ev.y, 'ピザ全損 -30', '#ff4b3e'); fx.shake = 6; break;
    case 'deliver': floatText(ev.x, ev.y, `配達完了 +${ev.pts}`, '#2ec27e'); buzz([30, 30, 30]);
      flash('次の配達先へ！', '光る点線をたどれ'); setTimeout(hideFlash, 900); break;
    case 'go': flash('GO!', ''); setTimeout(hideFlash, 600); break;
    case 'swap': break; // 役割の変化は描画側で検出して演出
  }
}

let flashTimer = 0;
function flash(big, small) {
  const el = $('#flash');
  el.innerHTML = `${big}${small ? `<small>${small}</small>` : ''}`;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  clearTimeout(flashTimer);
}
function hideFlash() { $('#flash').classList.remove('show'); }

const ROLE_NAME = { steer: 'ハンドル担当', pedal: 'アクセル・ブレーキ担当', both: '全部（練習）' };
let lastRole = null;
let resultShown = false;

function myRole(v) {
  if (mode === 'solo') return soloType === 'both' ? 'both' : (v ? v.r[0] : null);
  if (!v || net.slot < 0) return null;
  return v.r[net.slot];
}

let lastPhase = null;
function updateUI(v) {
  if (v.p === 'count' && lastPhase !== 'count') lastRole = null; // 新しいゲームの開始時は担当を改めて表示
  lastPhase = v.p;
  $('#hTime').textContent = v.tm;
  $('#hDeliv').textContent = v.dv;
  $('#hScore').textContent = v.sc;
  $('#hHeat').style.width = v.h + '%';
  $('#hCond').style.width = v.cd + '%';

  $('#warn').classList.toggle('show', !!v.w);

  const cnt = $('#count');
  if (v.p === 'count') { cnt.textContent = v.n > 0 ? v.n : ''; cnt.classList.add('show'); }
  else cnt.classList.remove('show');

  const role = myRole(v);
  if (role !== lastRole) {
    const wasPlaying = lastRole !== null && v.p === 'play';
    lastRole = role;
    resetLocalInput();
    $('#roleName').textContent = ROLE_NAME[role] || '-';
    const cpuMode = mode === 'solo' && soloType === 'cpu';
    $('#partnerTag').textContent = cpuMode ? `／ CPU：${role === 'steer' ? 'ペダル' : 'ハンドル'}` : '';
    $('#steerPad').classList.toggle('on', role === 'steer' || role === 'both');
    $('#pedalPad').classList.toggle('on', role === 'pedal' || role === 'both');
    $('#controls').classList.toggle('both', role === 'both');
    if (wasPlaying) {
      flash('担当交代！', `あなたは ${ROLE_NAME[role]}`);
      buzz([100, 50, 100]);
      setTimeout(hideFlash, 1100);
    } else if (v.p === 'count' && role !== 'both') {
      flash(ROLE_NAME[role], role === 'steer' ? '曲がることしかできない' : '進むか止まるかしかできない');
      setTimeout(hideFlash, 1800);
    }
  }

  if (v.p === 'result' && !resultShown) {
    resultShown = true;
    const k = kenkaOf(v.st);
    $('#rDeliv').textContent = v.dv;
    $('#rScore').textContent = v.sc;
    const rk = rankOf(v.sc);
    const stamp = $('#rRank');
    stamp.textContent = rk.r; stamp.dataset.rank = rk.r;
    $('#rRankName').textContent = rk.name;
    stamp.classList.remove('pop'); void stamp.offsetWidth; stamp.classList.add('pop');
    $('#rTitle').textContent = kenkaTitle(k);
    $('#rStats').innerHTML =
      `<li>急ハンドル ${v.st.flips}回</li><li>急ブレーキ ${v.st.brakes}回</li>` +
      `<li>激突 ${v.st.crash}回</li><li>猫 ${v.st.cat || 0}匹</li>` +
      `<li>コーン ${v.st.cone || 0}本</li><li>オイル ${v.st.oil || 0}回</li>`;
    $('#btnTweet').href = tweetUrl(v, k);
    $('#rKenkaBar').style.width = '0';
    $('#result').classList.add('show');
    requestAnimationFrame(() => requestAnimationFrame(() => { $('#rKenkaBar').style.width = k + '%'; }));
  }
  if (v.p !== 'result' && resultShown) { resultShown = false; $('#result').classList.remove('show'); }
}

// Xの投稿画面を開くリンク（ログインや投稿の確定はX側で行う）
function tweetUrl(v, k) {
  const st = v.st;
  const who = mode === 'solo' ? (soloType === 'cpu' ? 'ポンコツCPUと' : 'ひとりで') : 'ふたりで';
  const lines = [
    `${who}1台の車を運転して、ピザを${v.dv}枚配達🍕 スコア${v.sc}（${rankOf(v.sc).r}ランク：${rankOf(v.sc).name}）`,
    `喧嘩度${k}%「${kenkaTitle(k)}」`,
  ];
  const extra = [];
  if (st.cat) extra.push(`猫に${st.cat}回ビビり`);
  if (st.cone) extra.push(`コーンを${st.cone}本なぎ倒し`);
  if (st.crash) extra.push(`${st.crash}回激突`);
  if (st.oil) extra.push(`オイルで${st.oil}回滑った`);
  if (extra.length) lines.push(extra.slice(0, 3).join('、'));
  const params = new URLSearchParams({ text: lines.join('\n'), hashtags: '合体ドライブ' });
  // Cloudflare版はゲームのURLを添える（部屋コードは付けない）。Claude内の版はURLなし
  if (!window.GATTAI_OFFLINE && /^https?:$/.test(location.protocol)) params.set('url', location.origin + location.pathname);
  return 'https://x.com/intent/post?' + params.toString();
}

const lerp = (a, b, t) => a + (b - a) * t;
function lerpAngle(a, b, t) { const d = Math.atan2(Math.sin(b - a), Math.cos(b - a)); return a + d * t; }

function cloneView(v) {
  return { car: v.car.slice(), cats: v.cats.map((x) => x.slice()), npcs: v.npcs.map((x) => x.slice()), cones: v.cones.map((x) => x.slice()) };
}
function lerpItem(a, b, t, angleIdx) {
  if (!a || Math.hypot(b[0] - a[0], b[1] - a[1]) > 200) return b.slice(); // ワープはそのまま
  const o = b.slice();
  o[0] = lerp(a[0], b[0], t); o[1] = lerp(a[1], b[1], t);
  if (angleIdx) o[angleIdx] = lerpAngle(a[angleIdx], b[angleIdx], t);
  return o;
}
function lerpList(A, Bl, t, angleIdx) {
  if (!A || A.length !== Bl.length) return Bl.map((x) => x.slice());
  return Bl.map((b, i) => lerpItem(A[i], b, t, angleIdx));
}
function smoothView(v, dt) {
  if (mode !== 'guest' || snaps.length === 0 || clockOff === null) {
    shown = { car: v.car, cats: v.cats, npcs: v.npcs, cones: v.cones }; return;
  }
  const target = performance.now() - clockOff - playDelay; // 表示するホスト側の時刻
  let a = null, b = null;
  for (let i = snaps.length - 1; i >= 0; i--) {
    if (snaps[i].ht <= target) { a = snaps[i]; b = snaps[i + 1] || null; break; }
  }
  if (!a) { const s0 = snaps[0]; shown = cloneView(s0); return; }   // まだ十分たまっていない
  if (!b) {
    // 次の状態がまだ来ていない：最新の状態から速度で少しだけ先読み（最大0.15秒）
    const ext = Math.min(0.15, (target - a.ht) / 1000);
    const car = a.car.slice();
    car[0] += (car[6] || 0) * ext; car[1] += (car[7] || 0) * ext;
    shown = { car, cats: a.cats, npcs: a.npcs, cones: a.cones };
    return;
  }
  const t = clamp((target - a.ht) / Math.max(1, b.ht - a.ht), 0, 1);
  shown = {
    car: lerpItem(a.car, b.car, t, 2),
    cats: lerpList(a.cats, b.cats, t, 0),
    npcs: lerpList(a.npcs, b.npcs, t, 2),
    cones: lerpList(a.cones, b.cones, t, 0),
  };
}

const BLD_COLORS = ['#e07a5f', '#81b29a', '#f2cc8f', '#6d8bc7', '#c96bb0', '#d9a066', '#7fb7be'];
let animT = 0;

/* ---------- 立体感（2.5D） ----------
   真上から見下ろすカメラが高さ CAM_H にあるとして、高さ h の点を
   消失点 VP から外側へ CAM_H / (CAM_H - h) 倍ずらして描く。
   消失点は車より少し下に置き、手前（南）の壁が見える斜め見下ろしにする */
const CAM_H = 1000;
const VP_OFFSET = 220;
let VPX = 0, VPY = 0;
function proj(x, y, h) {
  const k = CAM_H / (CAM_H - h);
  return [VPX + (x - VPX) * k, VPY + (y - VPY) * k];
}

const shadeCache = new Map();
function shade(hex, f) {
  const key = hex + f;
  let c = shadeCache.get(key);
  if (!c) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.round(((n >> 16) & 255) * f), g = Math.round(((n >> 8) & 255) * f), b = Math.round((n & 255) * f);
    c = `rgb(${Math.min(255, r)},${Math.min(255, g)},${Math.min(255, b)})`;
    shadeCache.set(key, c);
  }
  return c;
}

function poly(pts) {
  ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

// 地面の多角形（反時計回りでも時計回りでも可）を h0〜h1 の高さに押し出して描く
// opts.windows: 壁に窓を描く / opts.lw: 輪郭の太さ
function drawPrism(g, h0, h1, color, opts = {}) {
  const n = g.length;
  let cx = 0, cy = 0;
  for (const [x, y] of g) { cx += x; cy += y; }
  cx /= n; cy /= n;
  const lo = g.map(([x, y]) => proj(x, y, h0));
  const hi = g.map(([x, y]) => proj(x, y, h1));
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#17151a'; ctx.lineWidth = opts.lw || 2.5;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const ex = g[j][0] - g[i][0], ey = g[j][1] - g[i][1];
    const mx = (g[i][0] + g[j][0]) / 2, my = (g[i][1] + g[j][1]) / 2;
    let nx = ey, ny = -ex;
    if (nx * (mx - cx) + ny * (my - cy) < 0) { nx = -nx; ny = -ny; }       // 外向きの法線
    if (nx * (VPX - mx) + ny * (VPY - my) <= 0) continue;                    // カメラから見えない面
    // 光は左上から：左・上向きの面は明るく、右・下向きの面は暗く
    const len = Math.hypot(nx, ny) || 1;
    const lit = 0.62 + 0.22 * ((-nx - ny) / len / Math.SQRT2);
    ctx.fillStyle = shade(color, lit);
    poly([lo[i], lo[j], hi[j], hi[i]]); ctx.fill(); ctx.stroke();
    if (opts.windows) drawWindows(lo[i], lo[j], hi[j], hi[i], h1 - h0, opts.seed + i);
  }
  ctx.fillStyle = opts.top || color;
  poly(hi); ctx.fill(); ctx.stroke();
  return hi;
}

function drawWindows(a, b, c, d, h, seed) {
  // a-b が地面、d-c が屋上の辺
  const depth = Math.hypot(d[0] - a[0], d[1] - a[1]);
  if (depth < 10) return;
  const floors = Math.max(1, Math.floor(h / 26)), cols = 3;
  const at = (u, v) => {
    const gx = a[0] + (b[0] - a[0]) * u, gy = a[1] + (b[1] - a[1]) * u;
    const tx = d[0] + (c[0] - d[0]) * u, ty = d[1] + (c[1] - d[1]) * u;
    return [gx + (tx - gx) * v, gy + (ty - gy) * v];
  };
  for (let f = 0; f < floors; f++) {
    for (let k = 0; k < cols; k++) {
      const lit = hash(seed * 7 + f, k) % 5 === 0;
      ctx.fillStyle = lit ? '#ffe9a8' : 'rgba(23,21,26,.38)';
      const u0 = (k + 0.22) / cols, u1 = (k + 0.78) / cols;
      const v0 = (f + 0.28) / floors, v1 = (f + 0.78) / floors;
      poly([at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1)]); ctx.fill();
    }
  }
}

// タイルごとの建物（高さ・色は位置で固定）
function buildingOf(tx, ty) {
  const h0 = hash(tx, ty);
  const tall = h0 % 13 === 0;
  return {
    x0: tx * T + 9, y0: ty * T + 9, x1: tx * T + T - 9, y1: ty * T + T - 9,
    h: tall ? 230 : 46 + (h0 % 6) * 22,
    color: BLD_COLORS[h0 % BLD_COLORS.length], seed: h0 % 9973, roof: h0 % 4,
  };
}

function drawBuilding(b) {
  const g = [[b.x0, b.y0], [b.x1, b.y0], [b.x1, b.y1], [b.x0, b.y1]];
  const top = drawPrism(g, 0, b.h, b.color, { windows: true, seed: b.seed, top: shade(b.color, 1.08) });
  // 屋上の縁とディテール
  const ins = 7;
  const r = [[b.x0 + ins, b.y0 + ins], [b.x1 - ins, b.y0 + ins], [b.x1 - ins, b.y1 - ins], [b.x0 + ins, b.y1 - ins]].map(([x, y]) => proj(x, y, b.h));
  ctx.fillStyle = shade(b.color, 0.92); poly(r); ctx.fill();
  const mx = (b.x0 + b.x1) / 2, my = (b.y0 + b.y1) / 2;
  if (b.roof === 0) {        // 室外機
    drawPrism([[mx - 16, my - 10], [mx + 2, my - 10], [mx + 2, my + 6], [mx - 16, my + 6]], b.h, b.h + 10, '#c9c6cf', { lw: 1.6 });
  } else if (b.roof === 1) { // 給水タンク
    const c = proj(mx + 6, my - 4, b.h + 14);
    const base = proj(mx + 6, my - 4, b.h);
    ctx.fillStyle = '#7fb7be'; ctx.strokeStyle = '#17151a'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.ellipse(base[0], base[1], 12, 12, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(c[0], c[1], 12, 12, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  } else if (b.roof === 2 && b.h > 100) { // 看板
    drawPrism([[b.x0 + 12, my - 3], [b.x1 - 12, my - 3], [b.x1 - 12, my + 3], [b.x0 + 12, my + 3]], b.h, b.h + 18, '#ffd23f', { lw: 1.6 });
  }
}

function drawTree(x, y, seed) {
  const base = proj(x, y, 0), top = proj(x, y, 22);
  ctx.strokeStyle = '#5a3b22'; ctx.lineWidth = 6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(base[0], base[1]); ctx.lineTo(top[0], top[1]); ctx.stroke();
  const layers = [[22, 30, '#2f7a3c'], [34, 23, '#3f9a4d'], [44, 14, '#6cc06a']];
  ctx.strokeStyle = '#17151a'; ctx.lineWidth = 2.2;
  for (const [h, r, col] of layers) {
    const [px, py] = proj(x + (seed % 3) - 1, y - 2, h);
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }
}

function render(v, dt) {
  animT += dt;
  const car = shown.car;
  const zoom = Math.min(CW, CH * 1.1) / 600;
  let sx = 0, sy = 0;
  if (fx.shake > 0) { sx = rand(-fx.shake, fx.shake); sy = rand(-fx.shake, fx.shake); fx.shake *= 0.86; if (fx.shake < 0.3) fx.shake = 0; }

  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = '#17151a';
  ctx.fillRect(0, 0, CW, CH);

  // カメラ：車を少し下寄りに置いて進行方向を見やすく
  const camX = car[0] - (CW / 2) / zoom + sx / zoom;
  const camY = car[1] - (CH * 0.55) / zoom + sy / zoom;
  ctx.setTransform(DPR * zoom, 0, 0, DPR * zoom, -camX * DPR * zoom, -camY * DPR * zoom);
  VPX = car[0]; VPY = car[1] + VP_OFFSET;

  // 背の高い建物は画面外からはみ出してくるので広めに見る
  const tx0 = Math.floor(camX / T) - 3, ty0 = Math.floor(camY / T) - 3;
  const tx1 = Math.floor((camX + CW / zoom) / T) + 3, ty1 = Math.floor((camY + CH / zoom) / T) + 3;

  // --- 地面 ---
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      const t = tileAt(tx, ty), x = tx * T, y = ty * T;
      const outside = tx < 0 || ty < 0 || tx >= N || ty >= N;
      if (t === 0) {
        ctx.fillStyle = '#3a3a41'; ctx.fillRect(x, y, T + 1, T + 1);
        const hRoad = ty % P < RW, vRoad = tx % P < RW;
        ctx.fillStyle = '#ffd23f';
        if (hRoad && !vRoad && ty % P === 0) { ctx.fillRect(x + 8, y + T - 3, 34, 6); ctx.fillRect(x + 56, y + T - 3, 34, 6); }
        if (vRoad && !hRoad && tx % P === 0) { ctx.fillRect(x + T - 3, y + 8, 6, 34); ctx.fillRect(x + T - 3, y + 56, 6, 34); }
        if (hRoad && vRoad) {
          ctx.fillStyle = 'rgba(255,246,224,.55)';
          if (tileAt(tx - 1, ty) !== 0) for (let i = 8; i < T; i += 22) ctx.fillRect(x + 4, y + i, 18, 11);
          if (tileAt(tx + 1, ty) !== 0) for (let i = 8; i < T; i += 22) ctx.fillRect(x + T - 22, y + i, 18, 11);
          if (tileAt(tx, ty - 1) !== 0) for (let i = 8; i < T; i += 22) ctx.fillRect(x + i, y + 4, 11, 18);
          if (tileAt(tx, ty + 1) !== 0) for (let i = 8; i < T; i += 22) ctx.fillRect(x + i, y + T - 22, 11, 18);
        }
      } else if (t === 1) {
        ctx.fillStyle = (tx + ty) % 2 ? '#4c9a52' : '#53a45a'; ctx.fillRect(x, y, T + 1, T + 1);
      } else {
        ctx.fillStyle = outside ? '#17151a' : '#77737e'; // 歩道
        ctx.fillRect(x, y, T + 1, T + 1);
        if (!outside) {
          ctx.fillStyle = '#6a6671';
          ctx.fillRect(x + T / 2 - 1, y, 2, T); ctx.fillRect(x, y + T / 2 - 1, T, 2); // 敷石の目地
        }
      }
      // 縁石：道路と歩道・公園の境目
      if (t !== 0 && !outside) {
        ctx.fillStyle = '#c9c6cf';
        if (tileAt(tx - 1, ty) === 0) ctx.fillRect(x, y, 5, T);
        if (tileAt(tx + 1, ty) === 0) ctx.fillRect(x + T - 5, y, 5, T);
        if (tileAt(tx, ty - 1) === 0) ctx.fillRect(x, y, T, 5);
        if (tileAt(tx, ty + 1) === 0) ctx.fillRect(x, y + T - 5, T, 5);
      }
    }
  }

  // --- 建物と木を集める（影と描く順番のため） ---
  const tall = [];
  for (let ty = ty0; ty <= ty1; ty++) {
    for (let tx = tx0; tx <= tx1; tx++) {
      if (tx < 0 || ty < 0 || tx >= N || ty >= N) continue;
      const t = tileAt(tx, ty);
      if (t === 2) { const b = buildingOf(tx, ty); b.kind = 'b'; b.cx = (b.x0 + b.x1) / 2; b.cy = (b.y0 + b.y1) / 2; tall.push(b); }
      else if (t === 1 && hash(tx, ty) % 2 === 0) {
        const hh = hash(ty, tx);
        tall.push({ kind: 't', cx: tx * T + 30 + hh % 36, cy: ty * T + 30 + (hh >> 3) % 36, h: 44, seed: hh });
      }
    }
  }

  // 影（右下へ落ちる）。まとめて1回で塗って重なりが濃くならないように
  ctx.fillStyle = 'rgba(10,8,14,.32)';
  ctx.beginPath();
  for (const o of tall) {
    if (o.kind === 'b') {
      const dx = o.h * 0.42, dy = o.h * 0.3;
      ctx.moveTo(o.x0, o.y0); ctx.lineTo(o.x1, o.y0); ctx.lineTo(o.x1 + dx, o.y0 + dy);
      ctx.lineTo(o.x1 + dx, o.y1 + dy); ctx.lineTo(o.x0 + dx, o.y1 + dy); ctx.lineTo(o.x0, o.y1); ctx.closePath();
    } else {
      ctx.moveTo(o.cx + 18 + 30, o.cy + 13);
      ctx.ellipse(o.cx + 18, o.cy + 13, 30, 22, 0, 0, Math.PI * 2);
    }
  }
  ctx.fill();

  // --- 地面に貼りつくもの ---
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const [ox, oy, r, seed] of v.oils) {
    ctx.save(); ctx.translate(ox, oy); ctx.rotate(seed);
    ctx.fillStyle = '#121016';
    ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(r * 0.55, r * 0.35, r * 0.45, r * 0.3, 0.6, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(159,211,255,.35)'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(-r * 0.2, -r * 0.15, r * 0.5, r * 0.25, 0.3, Math.PI * 1.1, Math.PI * 1.7); ctx.stroke();
    ctx.strokeStyle = 'rgba(201,107,176,.35)';
    ctx.beginPath(); ctx.ellipse(-r * 0.1, -r * 0.05, r * 0.65, r * 0.38, 0.3, Math.PI * 1.15, Math.PI * 1.6); ctx.stroke();
    ctx.restore();
  }
  for (const k of fx.skids) {
    k.t += dt;
    ctx.save(); ctx.translate(k.x, k.y); ctx.rotate(k.a);
    ctx.globalAlpha = Math.max(0, 0.5 - k.t / 3);
    ctx.fillStyle = '#121016'; ctx.fillRect(-20, -15, 8, 6); ctx.fillRect(-20, 9, 8, 6);
    ctx.restore();
  }
  ctx.globalAlpha = 1;
  fx.skids = fx.skids.filter((k) => k.t < 1.5);
  if (car[5]) fx.skids.push({ x: car[0], y: car[1], a: car[2], t: 0 });

  // 配達先までの道順（光る点線。配達先へ向かって流れる）
  const [dx, dy] = v.d;
  const route = routeTo(car[0], car[1], { x: dx, y: dy });
  let routeLen = 0;
  for (let i = 1; i < route.length; i++) routeLen += Math.hypot(route[i][0] - route[i - 1][0], route[i][1] - route[i - 1][1]);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(route[0][0], route[0][1]);
  for (let i = 1; i < route.length; i++) ctx.lineTo(route[i][0], route[i][1]);
  ctx.strokeStyle = 'rgba(46,194,126,.28)'; ctx.lineWidth = 26; ctx.setLineDash([]); ctx.stroke();
  ctx.strokeStyle = '#7ff0b4'; ctx.lineWidth = 9; ctx.setLineDash([2, 30]); ctx.lineDashOffset = -animT * 90; ctx.stroke();
  ctx.setLineDash([]); ctx.lineDashOffset = 0;

  // 配達先の輪（地面）
  const pulse = 1 + Math.sin(animT * 6) * 0.12;
  ctx.fillStyle = 'rgba(46,194,126,.25)';
  ctx.beginPath(); ctx.arc(dx, dy, 60 * pulse, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#2ec27e'; ctx.lineWidth = 8; ctx.stroke();

  // --- 道路の上を動くもの ---
  ctx.font = '46px serif';
  for (const [gx, gy] of v.signs) ctx.fillText('🚧', gx, gy);
  for (const c of shown.cones) if (c[0] > -1000) drawCone(c[0], c[1], c[2]);
  for (const n of shown.npcs) drawCar([n[0], n[1], n[2], 0], NPC_COLORS[n[3]], '#fff6e0', false);
  for (const c of shown.cats) drawCat(c);
  drawCar(car, '#ff4b3e', '#9fd3ff', true);

  // --- 建物と木（カメラから遠い順に） ---
  for (const o of tall) o.d = (o.cx - VPX) ** 2 + (o.cy - VPY) ** 2;
  tall.sort((a, b) => b.d - a.d);
  for (const o of tall) {
    if (o.kind === 'b') drawBuilding(o); else drawTree(o.cx, o.cy, o.seed);
  }

  // --- 目印と文字（いちばん上） ---
  ctx.font = '44px serif'; ctx.fillText('🍕', START.x, START.y - 4);
  // 光の柱（建物より高く伸ばして、ビルの向こうでも見えるように）
  const base = proj(dx, dy, 0), topP = proj(dx, dy, 300);
  const beam = ctx.createLinearGradient(base[0], base[1], topP[0], topP[1]);
  beam.addColorStop(0, 'rgba(127,240,180,.55)'); beam.addColorStop(1, 'rgba(127,240,180,0)');
  const bw = 34 + Math.sin(animT * 5) * 4;
  const ang = Math.atan2(topP[1] - base[1], topP[0] - base[0]) + Math.PI / 2;
  const ox = Math.cos(ang), oy = Math.sin(ang);
  ctx.fillStyle = beam;
  ctx.beginPath();
  ctx.moveTo(base[0] + ox * bw, base[1] + oy * bw); ctx.lineTo(topP[0] + ox * bw * 0.6, topP[1] + oy * bw * 0.6);
  ctx.lineTo(topP[0] - ox * bw * 0.6, topP[1] - oy * bw * 0.6); ctx.lineTo(base[0] - ox * bw, base[1] - oy * bw);
  ctx.closePath(); ctx.fill();

  const hp = proj(dx, dy, 40);
  const bob = Math.sin(animT * 4) * 4;
  ctx.font = '50px serif'; ctx.fillText('🏠', hp[0], hp[1] - 6 + bob);
  const near = Math.hypot(dx - car[0], dy - car[1]);
  const label = near < 180 && car[4] >= 60 ? '止まって！' : '目的地！';
  drawTag(hp[0], hp[1] - 66 + bob, label, near < 180 && car[4] >= 60 ? '#ff4b3e' : '#2ec27e', 20, camX + 8, camX + CW / zoom - 8);

  ctx.font = '30px "Dela Gothic One", sans-serif';
  for (const f of fx.floats) {
    f.t += dt;
    const a = 1 - f.t / 1.4;
    ctx.globalAlpha = Math.max(0, a);
    ctx.lineWidth = 7; ctx.strokeStyle = '#17151a'; ctx.fillStyle = f.color;
    ctx.strokeText(f.text, f.x, f.y - 50 - f.t * 60);
    ctx.fillText(f.text, f.x, f.y - 50 - f.t * 60);
  }
  ctx.globalAlpha = 1;
  fx.floats = fx.floats.filter((f) => f.t < 1.4);

  // 画面の四隅を少し暗くして奥行きを出す
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const vg = ctx.createRadialGradient(CW / 2, CH * 0.55, Math.min(CW, CH) * 0.45, CW / 2, CH * 0.55, Math.max(CW, CH) * 0.85);
  vg.addColorStop(0, 'rgba(23,21,26,0)');
  vg.addColorStop(1, 'rgba(23,21,26,.45)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, CW, CH);

  // 画面外の配達先を指す矢印
  const sxp = (dx - camX) * zoom, syp = (dy - camY) * zoom;
  if (sxp < 0 || syp < 0 || sxp > CW || syp > CH) {
    const cx = CW / 2, cy = CH * 0.55;
    const ang = Math.atan2(syp - cy, sxp - cx);
    const m = 34;
    const kx = (Math.cos(ang) > 0 ? CW - m - cx : m - cx) / Math.cos(ang);
    const ky = (Math.sin(ang) > 0 ? CH - m - cy : m - cy) / Math.sin(ang);
    const kk = Math.min(Math.abs(kx), Math.abs(ky));
    const ax = cx + Math.cos(ang) * kk, ay = cy + Math.sin(ang) * kk;
    const pulseA = 1 + Math.sin(animT * 7) * 0.08;
    ctx.save(); ctx.translate(ax, ay); ctx.rotate(ang); ctx.scale(pulseA, pulseA);
    ctx.fillStyle = '#2ec27e'; ctx.strokeStyle = '#17151a'; ctx.lineWidth = 4; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(26, 0); ctx.lineTo(-16, -22); ctx.lineTo(-8, 0); ctx.lineTo(-16, 22); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
    // 矢印の内側に「目的地！ ○m」（文字は回さない）
    const tx = ax - Math.cos(ang) * 62, ty = clamp(ay - Math.sin(ang) * 46, 28, CH - 28);
    drawTag(tx, ty, `目的地！ ${Math.max(1, Math.round(routeLen / 10))}m`, '#2ec27e', 15, 8, CW - 8);
  }
}

// 吹き出し風のラベル（画面に対して水平）
function drawTag(x, y, text, color, size = 20, minX = -Infinity, maxX = Infinity) {
  ctx.save();
  ctx.font = `${size}px "Dela Gothic One", "Hiragino Sans", sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const w = ctx.measureText(text).width + size * 1.1, h = size * 1.7;
  x = clamp(x, minX + w / 2, maxX - w / 2); // 画面からはみ出さないように
  ctx.fillStyle = '#17151a'; roundRect(x - w / 2 + 3, y - h / 2 + 4, w, h, h / 2); ctx.fill();
  ctx.fillStyle = color; ctx.strokeStyle = '#17151a'; ctx.lineWidth = 3;
  roundRect(x - w / 2, y - h / 2, w, h, h / 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff6e0'; ctx.fillText(text, x, y + 1);
  ctx.restore();
}

const CAT_COLORS = [
  { body: '#f39a3d', mark: '#c4621c' }, // 茶トラ
  { body: '#2a2730', mark: '#2a2730' }, // 黒猫
  { body: '#fff6e0', mark: '#fff6e0' }, // 白猫
  { body: '#fff6e0', mark: '#e0822f' }, // 三毛
  { body: '#9a9aa6', mark: '#6c6c78' }, // サバトラ
];
function drawCat(c) {
  const [x, y, face, state, color, fly] = c;
  const col = CAT_COLORS[color] || CAT_COLORS[0];
  const lift = state === 2 ? Math.sin((1 - fly / 0.6) * Math.PI) : 0;
  const walk = state === 0 ? Math.sin(animT * 14 + x) * 3 : 0;
  ctx.save();
  ctx.translate(x, y);
  // 影
  ctx.fillStyle = 'rgba(0,0,0,.35)';
  ctx.beginPath(); ctx.ellipse(3, 14, 18 - lift * 6, 6, 0, 0, Math.PI * 2); ctx.fill();
  ctx.translate(0, -lift * 40);
  ctx.scale(face * 1.25, 1.25);
  ctx.lineWidth = 2.6; ctx.strokeStyle = '#17151a'; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  const outline = col.body === '#2a2730' ? '#fff6e0' : '#17151a'; // 黒猫は白フチで目立たせる
  ctx.strokeStyle = outline;
  if (state === 1) {
    // おすわり
    ctx.fillStyle = col.body;
    ctx.beginPath(); ctx.moveTo(-8, 9); ctx.quadraticCurveTo(-20, 10, -16, 0); ctx.stroke(); // しっぽ
    ctx.beginPath(); ctx.ellipse(-2, 2, 10, 9, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(4, -8, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ears(4, -8, col);
    ctx.fillStyle = outline; ctx.fillRect(6, -10, 2, 3);
  } else {
    // 歩く・走る・ジャンプ
    ctx.fillStyle = col.body;
    ctx.beginPath(); ctx.moveTo(-13, -1); ctx.quadraticCurveTo(-22, -6 - (state === 2 ? 6 : 0), -19, -15); ctx.lineWidth = 5; ctx.stroke();
    ctx.lineWidth = 3; ctx.strokeStyle = col.body; ctx.stroke(); ctx.strokeStyle = outline; ctx.lineWidth = 2.6; // しっぽ
    for (const [lx, ph] of [[-9, 0], [-4, Math.PI], [5, Math.PI], [9, 0]]) {
      const o = state === 2 ? 3 : Math.sin(animT * 14 + x + ph) * 3;
      ctx.beginPath(); ctx.moveTo(lx, 4); ctx.lineTo(lx + o, 11); ctx.lineWidth = 4.5; ctx.stroke();
    }
    ctx.lineWidth = 2.6;
    ctx.beginPath(); ctx.ellipse(-1, 1 + walk * 0.2, 14, 7.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (col.mark !== col.body) {
      ctx.fillStyle = col.mark;
      ctx.beginPath(); ctx.ellipse(-5, -2, 5, 3, 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(3, -1, 3.5, 2.5, -0.3, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = col.body;
    }
    ctx.beginPath(); ctx.arc(13, -5, 7.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ears(13, -5, col);
    ctx.fillStyle = outline; ctx.fillRect(15, -7, 2, 3);
  }
  ctx.restore();

  function ears(hx, hy, col) {
    ctx.fillStyle = col.body;
    for (const ex of [-4, 3]) {
      ctx.beginPath(); ctx.moveTo(hx + ex - 2.5, hy - 5); ctx.lineTo(hx + ex + 0.5, hy - 12); ctx.lineTo(hx + ex + 3.5, hy - 5);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }
}

function drawCone(x, y, flying) {
  if (flying) {
    ctx.save(); ctx.translate(x, y - 20); ctx.rotate(animT * 16);
    ctx.fillStyle = '#ff7a1a'; ctx.strokeStyle = '#17151a'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(12, 14); ctx.lineTo(-12, 14); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    return;
  }
  ctx.fillStyle = 'rgba(10,8,14,.32)';
  ctx.beginPath(); ctx.ellipse(x + 8, y + 6, 16, 11, 0, 0, Math.PI * 2); ctx.fill();
  drawPrism([[x - 14, y - 14], [x + 14, y - 14], [x + 14, y + 14], [x - 14, y + 14]], 0, 4, '#ff7a1a', { lw: 2 }); // 台座
  // 円すい：地面の円から上の点へ
  const b = proj(x, y, 4), m = proj(x, y, 14), t = proj(x, y, 28);
  ctx.fillStyle = '#ff7a1a'; ctx.strokeStyle = '#17151a'; ctx.lineWidth = 2.4;
  const ang = Math.atan2(t[1] - b[1], t[0] - b[0]) + Math.PI / 2;
  const ox = Math.cos(ang) * 10, oy = Math.sin(ang) * 10;
  ctx.beginPath(); ctx.moveTo(b[0] + ox, b[1] + oy); ctx.lineTo(t[0], t[1]); ctx.lineTo(b[0] - ox, b[1] - oy);
  ctx.arc(b[0], b[1], 10, ang + Math.PI, ang, true); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#fff6e0';
  ctx.beginPath(); ctx.arc(m[0], m[1], 6.5, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ff7a1a'; ctx.beginPath(); ctx.arc(t[0], t[1], 3.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
}

// 回転した長方形の4隅（ローカル座標 x:前後 y:左右）
function rectAt(x, y, a, x0, y0, x1, y1) {
  const c = Math.cos(a), s = Math.sin(a);
  return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([u, w]) => [x + u * c - w * s, y + u * s + w * c]);
}

function drawCar(c, body, glass, pizza) {
  const [x, y, a, air] = c;
  const lift = air > 0 ? Math.sin(Math.min(1, air / 1.3) * Math.PI) * 60 : 0;
  // 影
  ctx.save(); ctx.translate(x + 10 + lift * 0.4, y + 9 + lift * 0.3); ctx.rotate(a);
  ctx.fillStyle = 'rgba(10,8,14,.38)'; roundRect(-26, -15, 52, 30, 9); ctx.fill();
  ctx.restore();
  // タイヤ
  for (const [u, w] of [[-15, -15], [15, -15], [-15, 15], [15, 15]]) {
    drawPrism(rectAt(x, y, a, u - 6, w - 3, u + 6, w + 3), lift, lift + 9, '#17151a', { lw: 1 });
  }
  // 車体 → キャビン → 屋根
  drawPrism(rectAt(x, y, a, -25, -14, 25, 14), lift + 4, lift + 15, body, { lw: 2.4 });
  const roofH = lift + 27;
  drawPrism(rectAt(x, y, a, -14, -11, 10, 11), lift + 15, roofH, glass, { lw: 2.2, top: body });
  // ライト
  const l1 = proj(...rectAt(x, y, a, 22, -11, 25, -6)[0], lift + 12), l2 = proj(...rectAt(x, y, a, 22, 6, 25, 11)[0], lift + 12);
  ctx.fillStyle = '#fff6e0';
  ctx.beginPath(); ctx.arc(l1[0], l1[1], 3, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(l2[0], l2[1], 3, 0, Math.PI * 2); ctx.fill();
  if (pizza) drawPrism(rectAt(x, y, a, -11, -8, 5, 8), roofH, roofH + 7, '#ffd23f', { lw: 2 }); // 屋根のピザ箱
}
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

/* =========================================================
   メインループ
   ========================================================= */
let last = performance.now(), acc = 0, sendAcc = 0, sentResult = false;
let lastSent = '', lastSentS = 0, lastSentP = 0, lastSendT = 0;

function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  readInput();
  wheelEl.style.transform = `rotate(${input.steer * 120}deg)`;

  if ((mode === 'host' || mode === 'solo') && sim && !paused && !reconnecting) {
    acc += dt;
    let steps = 0;
    while (acc >= 1 / 60 && steps < 6) {
      let steer, pedal;
      if (mode === 'solo' && sim.cpu) {
        const mine = sim.roles[0];
        const cpuVal = cpuControl(sim, sim.cpu, sim.roles[1], 1 / 60);
        steer = mine === 'steer' ? input.steer : cpuVal;
        pedal = mine === 'pedal' ? input.pedal : cpuVal;
      } else if (mode === 'solo') { steer = input.steer; pedal = input.pedal; }
      else {
        const mine = sim.roles[net.slot];
        steer = mine === 'steer' ? input.steer : remote.s;
        pedal = mine === 'pedal' ? input.pedal : remote.p;
      }
      stepSim(sim, 1 / 60, steer, pedal);
      acc -= 1 / 60; steps++;
    }
    if (acc > 0.1) acc = 0;

    const evs = sim.events; sim.events = [];
    for (const ev of evs) handleEvent(ev);
    if (mode === 'host') outbox.push(...evs);
    view = pack(sim);

    if (mode === 'host') {
      // 送る間隔：走行中は毎秒10回、カウントダウン中は毎秒4回、リザルトは1回だけ
      // （演出イベントは次の送信にまとめて乗せる）
      sendAcc += dt;
      const interval = sim.phase === 'play' ? 0.1 : 0.25;
      const resultDone = sim.phase === 'result' && sentResult;
      if (!resultDone && (sendAcc >= interval || (sim.phase === 'result' && !sentResult))) {
        sendAcc = 0;
        view.ev = outbox; outbox = [];
        view.ht = Math.round(performance.now());
        send(view);
        sentResult = sim.phase === 'result';
      }
    }
  }

  if (mode === 'guest' && view) {
    // 自分の担当の入力だけ送る（変化したときだけ）
    // ハンドルは0.05刻みにして、送るのは最大で毎秒20回まで。
    // ペダルの踏み替えとハンドルを離した瞬間は待たずにすぐ送る
    const role = myRole(view);
    const s = role === 'steer' ? Math.round(input.steer * 20) / 20 : 0;
    const msg = { t: 'in', s, p: role === 'pedal' ? input.pedal : 0 };
    const key = msg.s + '|' + msg.p;
    if (key !== lastSent) {
      const urgent = msg.p !== lastSentP || (s === 0 && lastSentS !== 0);
      if (urgent || now - lastSendT >= 50) {
        lastSent = key; lastSentS = msg.s; lastSentP = msg.p; lastSendT = now;
        send(msg);
      }
    }
  }

  if (view && $('#game').classList.contains('active')) {
    smoothView(view, dt);
    updateUI(view);
    render(view, dt);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// サーバーの無い場所（Claudeのページなど）ではオンライン対戦を隠して、ひとり用だけにする
const OFFLINE = !!window.GATTAI_OFFLINE;
if (OFFLINE) {
  $('#btnCreate').hidden = true;
  $('.join').hidden = true;
  $('.kicker').textContent = 'ポンコツCPUと、1台の車を。';
  $('#btnCpu').classList.add('big', 'yellow');
  $('#btnCpu').textContent = 'CPUと合体して出発';
  $('#offlineNote').hidden = false;
}

// 招待リンク (?room=1234) で開いたら自動参加
(() => {
  if (OFFLINE) return;
  const code = new URLSearchParams(location.search).get('room');
  if (code && /^\d{4}$/.test(code)) { $('#codeInput').value = code; connect(code); }
})();
