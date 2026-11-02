// CPU。人間の反応遅れを持ち、ときどき溜めすぎる。入力は人と同じ「押す/離す」だけ。
(function (root) {
  function makeBrain(params, rng) {
    return {
      p: params, rng: rng || Math.random,
      hist: [], targetC: 0, slip: false, idleLeft: Math.round(params.idle * 0.7),
      seenWave: new Set(), tap: 0, wantDown: false, rescueRoll: 0,
    };
  }

  function pickTarget(b) {
    b.targetC = b.p.minC + (b.p.maxC - b.p.minC) * b.rng();
    b.slip = b.rng() < b.p.slip;
    b.aimOff = (b.rng() - 0.5) * 2 * b.p.aimErr;
    b.rescueRoll = b.rng();
    b.careRoll = b.rng();
  }

  function think(s, i, b) {
    const c = root.CFG, me = s.f[i], op = s.f[1 - i];
    b.hist.push({ x: op.x, y: op.y });
    if (b.hist.length > 60) b.hist.shift();
    if (s.phase !== 'fight') return false;
    // 屁返しの小さな一発:押した次のコマで離す
    if (b.tap > 0) { b.tap--; return false; }
    if (me.recover > 0) return false;

    // 屁返し:飛んでくる波に一度だけ判定する
    for (const w of me.ch.noParry ? [] : s.waves) {
      if (w.owner === i) continue;
      const dist = Math.hypot(me.x - w.x, me.y - w.y) - me.r;
      const eta = (dist - w.d) / c.WAVE_SPEED;
      if (eta <= c.PARRY_F + (me.ch.parryBonus || 0) - 1 && eta > 0 && !b.seenWave.has(w)) {
        b.seenWave.add(w);
        // 人と同じく、小さな屁にはいちいち反応しない。強い屁ほど屁返しを狙う
        if (b.rng() < b.p.parry * Math.min(1, Math.max(0.3, w.p / 0.8))) {
          if (me.charging) return false; // 離して撃つ
          b.tap = 1;
          return true;
        }
      }
    }

    const seen = b.hist[Math.max(0, b.hist.length - 1 - b.p.react)];
    const butt = me.a + Math.PI;
    const dFromCenter = Math.hypot(me.x, me.y);
    const edge = dFromCenter > s.R * 0.62;
    // 土俵際なら外へ尻を向けて中へ戻る。それ以外は相手へ尻を向ける。
    const rescue = edge && b.rescueRoll < b.p.rescue;
    const goal = rescue ? Math.atan2(me.y, me.x) : Math.atan2(seen.y - me.y, seen.x - me.x) + (b.aimOff || 0);
    const diff = root.Sim.angDiff(butt, goal);

    if (me.charging) {
      const tol = 0.14;
      const aligned = Math.abs(diff) < tol;
      const minC = rescue ? Math.min(b.targetC, 0.5) : b.targetC;
      const limit = b.slip ? 2 : 0.97;
      if (me.c >= limit) return false;
      if (aligned && me.c >= minC) {
        // 反動で自分が落ちるなら見送る
        const fx = me.x + Math.cos(me.a) * root.Sim.recoilDist(me);
        const fy = me.y + Math.sin(me.a) * root.Sim.recoilDist(me);
        if (Math.hypot(fx, fy) > s.R * 0.95 && b.careRoll < b.p.care && me.c < 0.9) return true;
        return false;
      }
      // 通り過ぎて、次に合うまで持たないなら捨てる
      const passed = (diff * Math.sign(me.spin)) > tol;
      if (passed && me.c < 0.5 && b.careRoll > b.p.care) return false;
      return true;
    }

    if (b.idleLeft > 0) { b.idleLeft--; return false; }
    pickTargetIfNeeded(b);
    // 今から溜めて、狙う溜めのときに合う位置なら構える
    const spin = Math.abs(me.spin) * c.CHARGE_SPIN;
    const gap = ((-diff * Math.sign(me.spin)) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    const framesToAlign = gap / spin;
    const need = (rescue ? Math.min(b.targetC, 0.5) : b.targetC) * c.CHARGE_F * me.ch.chargeMul;
    if (framesToAlign <= need + 4) {
      b.idleLeft = b.p.idle + Math.round(b.rng() * b.p.idle);
      b.picked = false;
      return true;
    }
    return false;
  }

  function pickTargetIfNeeded(b) {
    if (!b.picked) { pickTarget(b); b.picked = true; }
  }

  root.AI = { makeBrain, think };
})(typeof window !== 'undefined' ? window : globalThis);
