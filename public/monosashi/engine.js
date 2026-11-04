// 試合の進行。Durable Object(server/room.js)と練習モード(practice.js)が同じものを使う。
// 状態 s はただのオブジェクトで、保存と復元は外側が行う。外とのやりとりは io を通す。
//   io.send(target, msg)  target: 'control' | 'broadcast' | 'viewers'(配信用画面+視聴者) | 'all' | 'p:<playerId>' | 接続オブジェクト
//   io.now() / io.setAlarm(epochMs|null) / io.save() / io.later(fn, ms) / io.online(pid) / io.controlOnline() / io.random()
(function (root) {
  const C = root.MONO_CFG, T = root.MONO_TOPICS;

  function newState(code) {
    return {
      code, hostKeyHash: null,
      phase: 'lobby',            // lobby | prepare | guessing | reveal | result | closed
      matchId: 0, round: 0, totalRounds: C.totalRounds,
      phaseStart: 0, phaseDeadline: null, paused: false, idlePrepare: 0,
      topics: [], rounds: {}, players: {}, nextPid: 1,
      lastOpen: null, lastReveal: null, lastResult: null,
      recentTopics: [], syncHistory: [], regulars: {}, kickedDevices: {},
    };
  }

  // 得点、シンクロ率、順位(テストしやすいよう純粋な関数にする)
  function points(d) {
    for (const [lim, p] of C.scoreTiers) if (d <= lim) return p;
    return 0;
  }
  function median(vals) {
    if (!vals.length) return null;
    const v = vals.slice().sort((a, b) => a - b), h = v.length >> 1;
    return v.length % 2 ? v[h] : (v[h - 1] + v[h]) / 2;
  }
  function syncOf(vals, answer) {
    const m = median(vals);
    return m === null ? null : Math.round(100 - Math.abs(m - answer));
  }
  function syncWord(v) {
    if (v === null || v === undefined) return '';
    for (const [min, w] of C.syncWords) if (v >= min) return w;
    return '';
  }
  // list: [{pid,name,totalPoints,roundsPlayed,exact}]。minRounds 未満は ref(参考)で末尾
  function rank(list, minRounds) {
    const rows = list.map(p => ({
      pid: p.pid, name: p.name, avg: p.roundsPlayed ? p.totalPoints / p.roundsPlayed : 0,
      totalPoints: p.totalPoints, roundsPlayed: p.roundsPlayed, exact: p.exact, ref: p.roundsPlayed < minRounds,
    }));
    rows.sort((a, b) => (a.ref - b.ref) || (b.avg - a.avg) || (b.exact - a.exact) || (b.roundsPlayed - a.roundsPlayed));
    let prev = null;
    rows.forEach((r, i) => {
      if (r.ref) { r.rank = null; return; }
      r.rank = prev && Math.abs(prev.avg - r.avg) < 1e-9 && prev.exact === r.exact ? prev.rank : i + 1;
      prev = r;
    });
    for (const r of rows) r.avg = Math.round(r.avg * 10) / 10;
    return rows;
  }
  // 表示名の検査。NGなら null
  function normName(s) {
    return String(s || '').normalize('NFKC').toLowerCase()
      .replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60))
      .replace(/[\s　・ー_\-.,!?!?〜~*#@'"`]/g, '');
  }
  function cleanName(raw) {
    const name = String(raw || '').normalize('NFKC').replace(/[\u0000-\u001f\u007f<>]/g, '').trim().slice(0, C.NAME_MAX);
    if (!name) return null;
    const n = normName(name);
    if (C.NG_WORDS.some(w => n.includes(normName(w)) || name.toLowerCase().includes(w))) return null;
    return name;
  }
  // お題の抽選:同じ物差しは1試合に SCALE_MAX_PER_MATCH 回まで。直近のお題は避ける
  function pickTopics(n, recent, rand) {
    const all = T.topics.slice();
    for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
    const fresh = all.filter(t => !recent.includes(t.id)), old = all.filter(t => recent.includes(t.id));
    const out = [], used = {};
    for (const t of fresh.concat(old)) {
      if (out.length >= n) break;
      if ((used[t.scaleId] || 0) >= C.SCALE_MAX_PER_MATCH) continue;
      used[t.scaleId] = (used[t.scaleId] || 0) + 1;
      out.push(t.id);
    }
    return out;
  }
  function topicInfo(id) {
    const t = T.topics.find(x => x.id === id);
    const sc = T.scales.find(x => x.id === t.scaleId);
    return { item: t.item, scale: { left: sc.left, right: sc.right } };
  }

  class Engine {
    constructor(state, io) {
      this.s = state;
      this.io = io;
      this.countTimer = null;
      this.lastCountAt = 0;
      this.lastCountSent = '';
    }

    // ---- 送信の補助
    send(to, msg) { this.io.send(to, msg); }
    toAll(msg) { this.send('all', msg); }
    save() { this.io.save(); }
    now() { return this.io.now(); }

    playerList(filter) { return Object.values(this.s.players).filter(filter || (() => true)); }
    actives() { return this.playerList(p => p.status === 'active'); }
    // 名前は配信者の操作画面と試合の結果にだけ出す。全員へは人数だけ送る
    playersMsg() {
      return { t: 'players', count: this.actives().length, spectators: this.playerList(p => p.status === 'spectator').length, max: C.maxPlayers };
    }
    lobbyMsg() {
      const row = p => ({ pid: p.pid, name: p.name, status: p.status, online: !!this.io.online(p.pid), kickedAt: p.kickedAt, roundsPlayed: p.roundsPlayed, totalPoints: p.totalPoints });
      return { t: 'lobby', max: C.maxPlayers, players: this.playerList(p => p.status !== 'kicked').map(row) };
    }
    // 人数の知らせは最大 COUNT_INTERVAL_MS に1回(大人数が一度に入っても全員への送信が増えすぎないように)
    notifyPlayers() {
      this.send('control', this.lobbyMsg());
      const wait = (this.lastPlayersAt || 0) + C.COUNT_INTERVAL_MS - this.now();
      if (wait > 0) {
        if (!this.playersTimer) this.playersTimer = this.io.later(() => { this.playersTimer = null; this.lastPlayersAt = this.now(); this.toAll(this.playersMsg()); }, wait);
        return;
      }
      this.lastPlayersAt = this.now();
      this.toAll(this.playersMsg());
    }
    meOf(pid) {
      const p = pid && this.s.players[pid];
      if (!p) return null;
      const r = this.s.rounds[this.s.round];
      return {
        pid: p.pid, name: p.name, status: p.status, firstRound: p.firstRound, totalPoints: p.totalPoints, roundsPlayed: p.roundsPlayed,
        avg: p.roundsPlayed ? Math.round(p.totalPoints / p.roundsPlayed * 10) / 10 : 0,
        guess: r && r.guesses[pid] !== undefined ? r.guesses[pid] : null,
        canGuess: this.canGuess(p),
      };
    }
    canGuess(p) {
      const s = this.s;
      return p.status === 'active' && s.phase === 'guessing' && p.firstRound <= s.round;
    }
    snapshot(conn) {
      const s = this.s;
      const msg = {
        t: 'snapshot', now: this.now(), code: s.code, phase: s.phase, round: s.round, totalRounds: s.totalRounds,
        deadline: s.phaseDeadline, phaseStart: s.phaseStart, paused: s.paused, matchId: s.matchId,
        players: this.playersMsg(),
        me: conn.role === 'player' ? this.meOf(conn.pid) : null,
        open: s.phase === 'guessing' || s.phase === 'reveal' ? s.lastOpen : null,
        reveal: s.phase === 'reveal' ? s.lastReveal : null,
        result: s.phase === 'result' ? s.lastResult : null,
        revealAnimSeconds: C.revealAnimSeconds,
      };
      if (conn.role === 'control') {
        msg.lobby = this.lobbyMsg();
        if (s.phase === 'prepare') msg.prepare = this.prepareMsg();
      }
      return msg;
    }
    prepareMsg() {
      const s = this.s, r = s.rounds[s.round];
      return { t: 'round_prepare', round: s.round, totalRounds: s.totalRounds, ...topicInfo(s.topics[s.round - 1]), deadline: s.phaseDeadline, now: this.now(), answer: r ? r.answer : null };
    }

    // ---- 接続
    onConnect(conn) {
      const s = this.s;
      if (conn.role === 'player' && conn.deviceId) {
        const p = this.playerList(x => x.deviceId === conn.deviceId)[0];
        if (p) conn.pid = p.pid;
      }
      this.send(conn, this.snapshot(conn));
      if (conn.role === 'control' && s.paused) this.resume();
      if (conn.role === 'player' && conn.pid) this.notifyPlayers();
      if (conn.role === 'control') this.send('control', this.lobbyMsg());
    }
    onDisconnect(conn) {
      if (conn.role === 'player' && conn.pid) this.notifyPlayers();
    }

    onMessage(conn, m) {
      if (!m || typeof m.t !== 'string') return;
      const h = conn.role === 'control' ? HOST[m.t] : conn.role === 'player' ? PLAYER[m.t] : null;
      if (h) h.call(this, conn, m);
    }

    rateOk(conn) {
      const now = this.now();
      conn.rl = (conn.rl || []).filter(t => now - t < 1000);
      if (conn.rl.length >= C.GUESS_PER_SEC) return false;
      conn.rl.push(now);
      return true;
    }

    // ---- フェーズの遷移
    setPhase(phase, seconds) {
      const s = this.s, now = this.now();
      s.phase = phase;
      s.phaseStart = now;
      s.phaseDeadline = seconds ? now + seconds * 1000 : null;
      this.io.setAlarm(s.phaseDeadline);
    }

    startMatch() {
      const s = this.s;
      s.matchId++;
      s.round = 0;
      s.rounds = {};
      s.idlePrepare = 0;
      s.paused = false;
      s.lastOpen = s.lastReveal = s.lastResult = null;
      s.topics = pickTopics(s.totalRounds, s.recentTopics, this.io.random);
      s.recentTopics = s.recentTopics.concat(s.topics).slice(-C.RECENT_TOPICS);
      for (const p of this.playerList()) {
        p.totalPoints = 0; p.roundsPlayed = 0; p.exact = 0; p.firstRound = 1;
      }
      this.toAll({ t: 'next_match', matchId: s.matchId, totalRounds: s.totalRounds });
      this.startPrepare(1);
    }

    startPrepare(round) {
      const s = this.s;
      s.round = round;
      s.rounds[round] = { answer: null, answerFinal: false, guesses: {}, activeAtOpen: [], sync: null };
      s.lastOpen = s.lastReveal = null;
      this.setPhase('prepare', C.prepareSeconds);
      this.send('control', this.prepareMsg());
      this.send('viewers', { t: 'round_waiting', round, totalRounds: s.totalRounds });
      this.save();
    }

    openGuessing() {
      const s = this.s, r = s.rounds[s.round];
      if (r.answer === null) r.answer = C.DEFAULT_ANSWER;
      r.answerFinal = true;
      r.activeAtOpen = this.actives().filter(p => p.firstRound <= s.round && this.io.online(p.pid)).map(p => p.pid);
      this.setPhase('guessing', C.guessSeconds);
      s.lastOpen = { t: 'round_open', round: s.round, totalRounds: s.totalRounds, ...topicInfo(s.topics[s.round - 1]), deadline: s.phaseDeadline, now: this.now() };
      this.toAll(s.lastOpen);
      this.lastCountSent = '';
      this.sendCount(true);
      this.save();
    }

    countMsg() {
      const s = this.s, r = s.rounds[s.round];
      const total = new Set(r.activeAtOpen.concat(Object.keys(r.guesses))).size;
      return { t: 'guess_count', round: s.round, submitted: Object.keys(r.guesses).length, total };
    }
    // 予想済み人数は最大1Hzで全員へ
    sendCount(force) {
      if (this.s.phase !== 'guessing') return;
      const now = this.now();
      const wait = this.lastCountAt + C.COUNT_INTERVAL_MS - now;
      if (!force && wait > 0) {
        if (!this.countTimer) this.countTimer = this.io.later(() => { this.countTimer = null; this.sendCount(false); }, wait);
        return;
      }
      const m = this.countMsg(), key = m.submitted + '/' + m.total;
      if (key === this.lastCountSent) return;
      this.lastCountSent = key;
      this.lastCountAt = now;
      this.toAll(m);
    }

    reveal() {
      const s = this.s, r = s.rounds[s.round];
      const counted = new Set(r.activeAtOpen.concat(Object.keys(r.guesses)));
      const guesses = [];
      for (const pid of counted) {
        const p = s.players[pid];
        if (!p || p.status === 'kicked') continue;
        const has = r.guesses[pid] !== undefined;
        const value = has ? r.guesses[pid] : null;
        const diff = has ? Math.abs(value - r.answer) : null;
        const pts = has ? points(diff) : 0;
        p.totalPoints += pts;
        p.roundsPlayed++;
        if (has && diff <= C.EXACT_DIFF) p.exact++;
        if (has) guesses.push({ playerId: pid, value, diff, points: pts });
      }
      r.sync = syncOf(guesses.map(g => g.value), r.answer);
      const minNow = Math.min(C.minRoundsForRanking, Math.ceil(s.round * 0.6));
      this.setPhase('reveal', C.revealAnimSeconds + C.talkSeconds);
      s.lastReveal = {
        t: 'round_reveal', round: s.round, totalRounds: s.totalRounds, answer: r.answer, guesses, sync: r.sync, syncWord: syncWord(r.sync),
        ranking: rank(this.rankable(), minNow).map(({ name, ...r }) => r), deadline: s.phaseDeadline, now: this.now(), phaseStart: s.phaseStart,
        exactDiff: C.EXACT_DIFF, last: s.round >= s.totalRounds,
      };
      this.toAll(s.lastReveal);
      this.send('control', this.lobbyMsg());
      this.save();
    }
    rankable() {
      return this.playerList(p => p.status === 'active' || (p.status === 'spectator' && p.roundsPlayed > 0));
    }

    finish() {
      const s = this.s;
      const syncs = Object.values(s.rounds).map(r => r.sync).filter(v => v !== null && v !== undefined);
      const syncToday = syncs.length ? Math.round(syncs.reduce((a, b) => a + b, 0) / syncs.length) : null;
      if (syncToday !== null) {
        s.syncHistory.push({ matchId: s.matchId, endedAt: this.now(), sync: syncToday });
        s.syncHistory = s.syncHistory.slice(-C.SYNC_HISTORY_MAX);
      }
      const ranking = rank(this.rankable(), C.minRoundsForRanking);
      for (const row of ranking) {
        const p = s.players[row.pid];
        const reg = s.regulars[p.deviceId] || (s.regulars[p.deviceId] = { lastName: p.name, totalPoints: 0, matches: 0 });
        reg.lastName = p.name; reg.totalPoints += p.totalPoints; reg.matches++;
      }
      const regs = Object.entries(s.regulars);
      if (regs.length > 500) s.regulars = Object.fromEntries(regs.slice(-500));
      this.setPhase('result', 0);
      s.lastResult = {
        t: 'match_result', matchId: s.matchId, ranking, syncToday, syncWord: syncWord(syncToday),
        syncHistory: s.syncHistory.slice(-C.SYNC_HISTORY_SHOW).map(h => h.sync), now: this.now(),
      };
      this.toAll(s.lastResult);
      this.save();
    }

    pause() {
      const s = this.s;
      s.paused = true;
      s.phaseDeadline = null;
      this.io.setAlarm(null);
      this.toAll({ t: 'paused', paused: true });
      this.save();
    }
    resume() {
      const s = this.s;
      if (!s.paused) return;
      s.paused = false;
      s.idlePrepare = 0;
      this.toAll({ t: 'paused', paused: false });
      this.startPrepare(s.round);
    }

    onAlarm() {
      const s = this.s;
      if (s.paused || !s.phaseDeadline || this.now() < s.phaseDeadline - 50) {
        if (s.phaseDeadline && !s.paused) this.io.setAlarm(s.phaseDeadline);
        return;
      }
      if (s.phase === 'prepare') {
        const r = s.rounds[s.round];
        if (r.answer === null) {
          s.idlePrepare++;
          if (s.idlePrepare >= C.IDLE_PAUSE_ROUNDS) return this.pause();
        } else s.idlePrepare = 0;
        this.openGuessing();
      } else if (s.phase === 'guessing') this.reveal();
      else if (s.phase === 'reveal') this.next();
    }

    next() {
      const s = this.s;
      if (s.round >= s.totalRounds) this.finish();
      else this.startPrepare(s.round + 1);
    }

    // 参加。ip の数と除外を確かめる
    join(conn, m) {
      const s = this.s, now = this.now();
      const name = cleanName(m.name);
      if (!name) return this.send(conn, { t: 'join_result', status: 'rejected', reason: 'name_ng' });
      const deviceId = String(conn.deviceId || m.deviceId || '').slice(0, 64);
      if (!deviceId) return;
      conn.deviceId = deviceId;
      if (s.phase === 'closed') return this.send(conn, { t: 'join_result', status: 'rejected', reason: 'closed' });
      const kickedUntil = s.kickedDevices[deviceId];
      let p = this.playerList(x => x.deviceId === deviceId)[0];
      if (p) {
        // 同じ端末:試合の外なら名前を直せる
        if (s.phase === 'lobby' || s.phase === 'result') p.name = name;
      } else {
        const fromIp = conn.ipHash ? this.playerList(x => x.ipHash === conn.ipHash && x.status !== 'kicked').length : 0;
        let status;
        if (kickedUntil && kickedUntil > now) status = 'kicked';
        else if (fromIp >= C.MAX_PER_IP) status = 'spectator';
        else status = this.actives().length >= C.maxPlayers ? 'spectator' : 'active';
        const pid = 'p' + s.nextPid++;
        p = s.players[pid] = {
          pid, deviceId, ipHash: conn.ipHash || null, name, status, prevStatus: null, kickedAt: status === 'kicked' ? now : null,
          firstRound: this.nextRound(), totalPoints: 0, roundsPlayed: 0, exact: 0,
        };
      }
      conn.pid = p.pid;
      const reason = p.status === 'kicked' ? 'kicked' : p.status === 'spectator' ? 'full' : undefined;
      this.send(conn, { t: 'join_result', status: p.status, playerId: p.pid, reason, name: p.name });
      this.send(conn, this.snapshot(conn));
      this.notifyPlayers();
      this.save();
    }
    // 今から参加した人が最初に数えるラウンド
    nextRound() {
      const s = this.s;
      if (s.phase === 'lobby' || s.phase === 'result' || s.phase === 'closed') return 1;
      return s.phase === 'prepare' ? s.round : s.round + 1;
    }
    sendMe(p) {
      this.send('p:' + p.pid, { t: 'me', me: this.meOf(p.pid) });
    }
  }

  const PLAYER = {
    join(conn, m) { this.join(conn, m); },
    guess(conn, m) {
      const s = this.s, p = conn.pid && s.players[conn.pid];
      if (!p || !this.rateOk(conn)) return;
      if (!this.canGuess(p) || m.round !== s.round) return;
      const v = Math.round(Number(m.value));
      if (!Number.isFinite(v) || v < 0 || v > 100) return;
      const r = s.rounds[s.round];
      r.guesses[p.pid] = v;
      this.send('p:' + p.pid, { t: 'guess_ack', round: s.round, value: v });
      this.sendCount(false);
      this.save();
    },
  };

  const HOST = {
    host_kick(conn, m) {
      const s = this.s, p = s.players[m.playerId];
      if (!p || p.status === 'kicked') return;
      p.prevStatus = p.status;
      p.status = 'kicked';
      p.kickedAt = this.now();
      s.kickedDevices[p.deviceId] = this.now() + C.KICK_HOURS * 3600 * 1000;
      for (const [d, t] of Object.entries(s.kickedDevices)) if (t < this.now()) delete s.kickedDevices[d];
      this.send('p:' + p.pid, { t: 'kicked' });
      this.sendMe(p);
      this.notifyPlayers();
      this.save();
    },
    host_undo_kick(conn, m) {
      const s = this.s, p = s.players[m.playerId];
      if (!p || p.status !== 'kicked' || !p.prevStatus || this.now() - p.kickedAt > C.undoKickSeconds * 1000) return;
      p.status = p.prevStatus;
      p.prevStatus = null;
      delete s.kickedDevices[p.deviceId];
      this.send('p:' + p.pid, { t: 'join_result', status: p.status, playerId: p.pid, name: p.name });
      this.sendMe(p);
      this.notifyPlayers();
      this.save();
    },
    host_start() {
      if (this.s.phase !== 'lobby') return;
      this.startMatch();
    },
    host_answer(conn, m) {
      const s = this.s;
      if (s.phase !== 'prepare' || m.round !== s.round || s.paused) return;
      const v = Math.round(Number(m.value));
      if (!Number.isFinite(v) || v < 0 || v > 100) return;
      if (!m.final && !this.rateOk(conn)) return;
      s.rounds[s.round].answer = v;
      if (m.final) { s.idlePrepare = 0; this.openGuessing(); }
      else this.save();
    },
    host_next(conn, m) {
      const s = this.s;
      if (s.phase !== 'reveal' || m.round !== s.round) return;
      if (this.now() < s.phaseStart + C.revealAnimSeconds * 1000) return;
      this.next();
    },
    host_resume() { this.resume(); },
    host_rematch() {
      if (this.s.phase !== 'result') return;
      this.startMatch();
    },
    // 部屋を閉じる:参加者の一覧を空にする(除外の記録は残す)
    host_close() {
      const s = this.s;
      s.phase = 'closed';
      s.paused = false;
      s.phaseDeadline = null;
      this.io.setAlarm(null);
      s.players = {};
      s.round = 0;
      s.lastOpen = s.lastReveal = s.lastResult = null;
      this.toAll({ t: 'closed' });
      this.notifyPlayers();
      this.save();
    },
    host_open() {
      const s = this.s;
      if (s.phase !== 'closed' && s.phase !== 'result') return;
      s.phase = 'lobby';
      s.round = 0;
      s.lastOpen = s.lastReveal = s.lastResult = null;
      this.toAll({ t: 'opened' });
      this.notifyPlayers();
      this.save();
    },
  };

  root.MonoEngine = { Engine, newState, points, median, syncOf, syncWord, rank, cleanName, pickTopics, topicInfo };
})(typeof globalThis !== 'undefined' ? globalThis : window);
