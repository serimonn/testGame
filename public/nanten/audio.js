// 音。効果音と声は Web Audio、BGM は <audio> でループ。ファイルが読めない音は短い電子音で代える。
(function (root) {
  const C = root.MONO_CFG;
  const FILES = {
    tick: 'tick.mp3', submit: 'submit.mp3', pop: 'pop.mp3', roll: 'roll.mp3', impact: 'impact.mp3', exact: 'exact.mp3',
    sync: 'sync.mp3', start: 'start.mp3', reveal: 'reveal.mp3', clock: 'clock.mp3', result: 'result.mp3', join: 'join.mp3',
    v_start: 'v_start.wav', v_reveal: 'v_reveal.wav', v_exact: 'v_exact.wav', v_sync: 'v_sync.wav', v_best: 'v_best.wav',
  };
  // 代わりの電子音 [周波数, 長さ秒, 波形]
  const BEEP = {
    tick: [1400, 0.02, 'square'], submit: [880, 0.12, 'triangle'], pop: [660, 0.08, 'sine'], roll: [180, 0.9, 'sawtooth'],
    impact: [90, 0.35, 'square'], exact: [1320, 0.4, 'triangle'], sync: [990, 0.3, 'triangle'], start: [740, 0.25, 'triangle'],
    reveal: [520, 0.3, 'triangle'], clock: [1200, 0.05, 'square'], result: [660, 0.6, 'triangle'], join: [990, 0.08, 'sine'],
  };
  const Snd = {
    on: true, ctx: null, buf: {}, bgmEl: null, bgmVol: C.VOL.bgm, bgmOn: true, unlocked: false,
    init(base) {
      this.base = base || 'assets/audio/';
      try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ctx = null; }
      if (this.ctx) {
        this.master = this.ctx.createGain();
        this.master.connect(this.ctx.destination);
        for (const [k, f] of Object.entries(FILES)) {
          fetch(this.base + f).then(r => r.ok ? r.arrayBuffer() : Promise.reject())
            .then(a => this.ctx.decodeAudioData(a)).then(b => { this.buf[k] = b; }).catch(() => {});
        }
      }
      const unlock = () => {
        if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
        this.unlocked = true;
        if (this.bgmWanted) this.bgm(true);
      };
      addEventListener('pointerdown', unlock, { capture: true });
      addEventListener('keydown', unlock, { capture: true });
      if (this.ctx && this.ctx.state === 'running') this.unlocked = true;
      return this;
    },
    needsUnlock() { return !!this.ctx && this.ctx.state !== 'running'; },
    play(name, opt) {
      if (!this.on || !this.ctx) return;
      const o = Object.assign({ vol: 1, rate: 1 }, opt);
      const g = this.ctx.createGain();
      g.gain.value = o.vol * (name.startsWith('v_') ? C.VOL.voice : C.VOL.sfx);
      g.connect(this.master);
      const b = this.buf[name];
      if (b) {
        const s = this.ctx.createBufferSource();
        s.buffer = b; s.playbackRate.value = o.rate;
        s.connect(g); s.start();
        return s;
      }
      const beep = BEEP[name];
      if (!beep) return;
      const osc = this.ctx.createOscillator(), t = this.ctx.currentTime;
      osc.type = beep[2]; osc.frequency.value = beep[0] * o.rate;
      g.gain.setValueAtTime(g.gain.value * 0.3, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + beep[1]);
      osc.connect(g); osc.start(t); osc.stop(t + beep[1] + 0.02);
      return osc;
    },
    bgm(play) {
      this.bgmWanted = play;
      if (!this.bgmOn || !this.on) play = false;
      if (!this.bgmEl) {
        this.bgmEl = new Audio(this.base + 'bgm.mp3');
        this.bgmEl.loop = true;
        this.bgmEl.volume = this.bgmVol;
      }
      if (play) this.bgmEl.play().catch(() => {});
      else this.bgmEl.pause();
    },
    // 話す時間は BGM を下げる
    duck(on) {
      const target = on ? C.VOL.bgmTalk : this.bgmVol;
      if (this.bgmEl) this.bgmEl.volume = Math.max(0, Math.min(1, target));
    },
    setOn(v) {
      this.on = v;
      if (!v && this.bgmEl) this.bgmEl.pause();
      if (v && this.bgmWanted) this.bgm(true);
    },
  };
  root.Snd = Snd;
})(window);
