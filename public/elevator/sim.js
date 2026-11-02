// 勤務の処理。DOM を使わず、入力(開、閉を押した瞬間)と乱数の種だけで進む。
// 配信版では配信者のブラウザの Web Worker でこのまま動かす。
// ルールは1つ:人間は開で乗せる、ゾンビは閉で締め出す。
(function (root) {
  const C = () => root.CFG;

  function rand(s) { // mulberry32
    s.seed = (s.seed + 0x6D2B79F5) | 0;
    let t = s.seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function pick(s, pool) {
    let sum = 0;
    for (const k in pool) sum += pool[k];
    let r = rand(s) * sum;
    for (const k in pool) { r -= pool[k]; if (r < 0) return k; }
    return Object.keys(pool)[0];
  }

  function createRun(floor, seed, opts) {
    const s = {
      seed: seed | 0, frame: 0, floor: floor || 1,
      phase: 'floor', phaseF: 0, stop: 0,
      lives: C().LIVES, carried: 0, shut: 0, miss: 0, combo: 0, bestCombo: 0,
      door: { g: 0, mode: 'closed', holdF: 0 },
      hall: [], riders: [], queue: [], floorF: 0, idleF: 0, nextId: 1, rampage: 0, thrown: null,
      trainee: !!(opts && opts.trainee), overs: 0,
      events: [], snap: null, result: null,
    };
    startFloor(s);
    return s;
  }

  function fl(s) { return root.FLOORS[Math.min(root.FLOORS.length, s.floor) - 1]; }

  function startFloor(s) {
    const f = fl(s);
    s.phase = 'floor'; s.phaseF = 0; s.floorF = 0; s.idleF = 0;
    s.hall = [];
    s.queue = [];
    // 出る客を決める。最初の客は新しい種類を落ち着いて見せる
    const first = f.first || [];
    const kinds = first.slice();
    while (kinds.length < f.n) kinds.push(pick(s, f.kinds));
    let at = 20;
    for (let i = 0; i < kinds.length; i++) {
      const side = rand(s) < 0.5 ? -1 : 1;
      s.queue.push({ kind: kinds[i], at, side });
      // 2人同時:反対側からほぼ同時に来る
      if (i + 1 < kinds.length && i >= first.length && rand(s) < f.pair) {
        i++;
        s.queue.push({ kind: kinds[i], at: at + 10 + Math.floor(rand(s) * 20), side: -side });
      }
      at += f.gap + Math.floor(rand(s) * f.gap * 0.3);
    }
    s.events.push({ t: 'arrive', floor: s.floor });
    // やり直し用。events と snap は複製しない
    const { snap, events, ...rest } = s;
    s.snap = JSON.stringify(rest);
  }

  // ゲームオーバーから、この階の最初に戻す。ライフは満タン
  function retryFloor(s) {
    const keep = { trainee: s.trainee, overs: s.overs, snap: s.snap };
    const o = JSON.parse(s.snap);
    for (const k of Object.keys(s)) if (!(k in o) && k !== 'events') delete s[k];
    Object.assign(s, o, keep);
    s.lives = C().LIVES;
    s.events.push({ t: 'arrive', floor: s.floor, retry: true });
  }

  function makePass(s, kind, side) {
    return { id: s.nextId++, kind, side, d: C().HALL_D, state: 'walk', sf: 0, dec: null, waitF: 0, bob: rand(s) * 6.28 };
  }

  // 判断の相手:まだ決めていない客のうち、扉に一番近い者
  function target(s) {
    let best = null;
    for (const p of s.hall) {
      if (p.dec || (p.state !== 'walk' && p.state !== 'wait')) continue;
      if (!best || p.d < best.d) best = p;
    }
    return best;
  }

  function decide(s, dec) {
    if (s.phase !== 'floor') return;
    const p = target(s);
    if (!p) { s.events.push({ t: 'nobody', b: dec }); return; }
    p.dec = dec;
    s.events.push({ t: 'decide', id: p.id, dec, kind: p.kind });
  }

  function needOpen(s) {
    return s.hall.some(p => (p.dec === 'open' && (p.state === 'walk' || p.state === 'wait')) || p.state === 'enter');
  }

  function speedOf(s, p) {
    return fl(s).sp * root.KINDS[p.kind].sp * (s.trainee ? C().TRAINEE_SPEED : 1);
  }

  function ok(s, p, why) {
    s.combo++; s.bestCombo = Math.max(s.bestCombo, s.combo);
    s.stop = Math.max(s.stop, C().STOP_OK);
    s.events.push({ t: 'ok', id: p.id, kind: p.kind, why, combo: s.combo });
    const w = C().COMBO_WORDS[s.combo];
    if (w) s.events.push({ t: 'combo', n: s.combo, word: w });
  }
  function ng(s, p, why) {
    s.combo = 0; s.miss++; s.lives--;
    s.stop = Math.max(s.stop, C().STOP_MISS);
    s.events.push({ t: 'ng', id: p.id, kind: p.kind, why, lives: s.lives });
    if (s.lives <= 0) {
      s.phase = 'over'; s.phaseF = 0; s.overs++;
      s.stop = C().STOP_OVER;
      s.events.push({ t: 'over' });
    }
  }

  // 扉の正面に着いた、または待っている
  function atDoor(s, p) {
    const k = root.KINDS[p.kind], c = C();
    if (p.dec === 'open') {
      if (s.door.g >= 0.8) { p.state = 'enter'; p.sf = 0; } else p.state = 'wait';
      return;
    }
    if (p.dec === 'close') {
      p.state = 'bonk'; p.sf = 0;
      s.events.push({ t: 'bonk', id: p.id, kind: p.kind, zombie: k.zombie });
      if (k.zombie) { s.shut++; ok(s, p, 'shut'); } else ng(s, p, 'shutHuman');
      return;
    }
    // まだ決めていない:待ちきれないと人間は帰り、ゾンビは押し入る
    p.state = 'wait';
    p.waitF++;
    if (p.waitF >= waitLimit(s)) {
      if (k.zombie) {
        p.dec = 'force'; p.state = 'enter'; p.sf = 0;
        s.events.push({ t: 'force', id: p.id });
      } else {
        p.state = 'leave'; p.sf = 0;
        s.events.push({ t: 'giveup', id: p.id, kind: p.kind });
        ng(s, p, 'timeout');
      }
    }
  }
  function waitLimit(s) { return fl(s).wait * (s.trainee ? C().TRAINEE_WAIT : 1); }

  function entered(s, p) {
    const k = root.KINDS[p.kind];
    s.hall.splice(s.hall.indexOf(p), 1);
    if (k.zombie) {
      s.rampage = C().RAMPAGE_F;
      s.events.push({ t: 'rampage', id: p.id, kind: p.kind });
      // 大騒ぎのあと、ゾンビは放り出される
      p.state = 'thrown'; p.sf = 0; p.d = 0; p.side = s.frame % 2 ? 1 : -1;
      s.thrown = p;
      ng(s, p, p.dec === 'force' ? 'forced' : 'letZombie');
    } else {
      s.carried++;
      s.riders.push({ id: p.id, kind: p.kind });
      if (s.riders.length > 7) s.riders.shift();
      ok(s, p, 'carry');
    }
  }

  function stepDoor(s) {
    const c = C(), d = s.door;
    const want = needOpen(s) || s.rampage > 0;
    if (want) {
      if (d.mode !== 'open' && d.mode !== 'opening') { d.mode = 'opening'; s.events.push({ t: 'door', open: true }); }
      d.holdF = 0;
    }
    if (d.mode === 'opening') {
      d.g = Math.min(1, d.g + 1 / c.DOOR_OPEN_F);
      if (d.g >= 1) d.mode = 'open';
    } else if (d.mode === 'open' && !want) {
      if (++d.holdF >= c.DOOR_HOLD_F) { d.mode = 'closing'; s.events.push({ t: 'door', open: false }); }
    } else if (d.mode === 'closing') {
      d.g = Math.max(0, d.g - 1 / c.DOOR_CLOSE_F);
      if (d.g <= 0) d.mode = 'closed';
    }
  }

  function stepPass(s, p) {
    const c = C();
    p.sf++; p.bob += 0.2;
    switch (p.state) {
      case 'walk':
        p.d = Math.max(0, p.d - speedOf(s, p));
        if (p.d <= 0) atDoor(s, p);
        return;
      case 'wait':
        atDoor(s, p);
        return;
      case 'enter':
        if (p.sf >= c.ENTER_F) entered(s, p);
        return;
      case 'bonk':
        if (p.sf > 30) { p.state = 'leave'; p.sf = 0; }
        return;
      case 'leave': case 'thrown':
        p.d += p.state === 'thrown' ? 7 : c.LEAVE_SPEED;
        return;
    }
  }

  function step(s, input) {
    const c = C();
    s.events.length = 0;
    if (s.phase === 'clear') return;
    if (input) {
      if (input.open) decide(s, 'open');
      if (input.close) decide(s, 'close');
      if (input.skip && s.phase === 'over' && s.phaseF >= c.OVER_SKIP_F && s.stop <= 0) { retryFloor(s); return; }
    }
    if (s.stop > 0) { s.stop--; return; }
    s.frame++; s.phaseF++;

    if (s.phase === 'floor') {
      s.floorF++;
      while (s.queue.length && s.queue[0].at <= s.floorF) {
        const q = s.queue.shift();
        const p = makePass(s, q.kind, q.side);
        s.hall.push(p);
        s.events.push({ t: 'spawn', id: p.id, kind: p.kind });
      }
      if (s.rampage > 0 && --s.rampage === 0 && s.thrown) {
        s.hall.push(s.thrown); s.events.push({ t: 'thrown', id: s.thrown.id }); s.thrown = null;
      }
      for (const p of s.hall.slice()) {
        stepPass(s, p);
        if (s.phase !== 'floor') return;
      }
      stepDoor(s);
      s.hall = s.hall.filter(p => p.d < c.HALL_D + 80);
      // 全員さばいたら次の階へ
      const busy = s.queue.length || s.rampage > 0 || s.hall.some(p => p.state === 'walk' || p.state === 'wait' || p.state === 'enter');
      if (busy) s.idleF = 0;
      else if (++s.idleF >= c.FLOOR_END_F && s.door.mode === 'closed') {
        s.phase = 'travel'; s.phaseF = 0;
        s.events.push({ t: 'depart' });
      }
    } else if (s.phase === 'travel') {
      for (const p of s.hall) p.d += c.LEAVE_SPEED;
      if (s.phaseF >= c.TRAVEL_F) {
        s.floor++;
        // 何人かは途中の階で降りる(見た目だけ)
        s.riders.splice(0, Math.min(s.riders.length, 2));
        if (s.floor >= root.TOP_FLOOR) {
          s.phase = 'clear';
          const stars = s.miss === 0 ? 3 : s.miss <= 2 ? 2 : 1;
          s.result = { carried: s.carried, shut: s.shut, miss: s.miss, bestCombo: s.bestCombo, stars };
          s.events.push({ t: 'arrive', floor: s.floor, top: true });
          s.events.push({ t: 'clear' });
          return;
        }
        startFloor(s);
      }
    }
  }

  root.Sim = { createRun, step, target, waitLimit, rand };
})(typeof window !== 'undefined' ? window : globalThis);
