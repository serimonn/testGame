// 音。プロトタイプなので WebAudio で合成した仮の音を鳴らす。
(function (root) {
  const A = {
    ctx: null, master: null, vol: 0.7, bgmOn: false, nextBeat: 0, beat: 0, crickets: 0,
    unlock() {
      if (!this.ctx) {
        const AC = root.AudioContext || root.webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC(); this.master = this.ctx.createGain(); this.master.gain.value = this.vol; this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    },
    tone(f, dur, o) {
      if (!this.ctx) return;
      o = o || {};
      const t = this.ctx.currentTime + (o.at || 0), g = this.ctx.createGain(), osc = this.ctx.createOscillator();
      osc.type = o.type || 'square'; osc.frequency.setValueAtTime(f, t);
      if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
      const v = (o.vol || 0.2);
      // 出だしを強く、すぐ減らす
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(v, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      osc.connect(g); g.connect(this.master); osc.start(t); osc.stop(t + dur + 0.02);
    },
    noise(dur, o) {
      if (!this.ctx) return;
      o = o || {};
      const t = this.ctx.currentTime + (o.at || 0), len = Math.ceil(this.ctx.sampleRate * dur);
      const b = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = b.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const s = this.ctx.createBufferSource(); s.buffer = b;
      const f = this.ctx.createBiquadFilter(); f.type = o.filter || 'lowpass'; f.frequency.value = o.freq || 1200;
      const g = this.ctx.createGain(); g.gain.setValueAtTime(o.vol || 0.15, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
      s.connect(f); f.connect(g); g.connect(this.master); s.start(t);
    },
    play(name) {
      if (!this.ctx) return;
      switch (name) {
        case 'coin': this.tone(1568, 0.06, { vol: 0.08 }); this.tone(2093, 0.12, { vol: 0.08, at: 0.05 }); break;
        case 'bigcoin':
          [1319, 1760, 2637].forEach((f, i) => this.tone(f, 0.5, { type: 'sine', vol: 0.18, at: i * 0.06 }));
          this.tone(659, 0.6, { type: 'triangle', vol: 0.15 }); break;
        case 'eatstart': this.tone(180, 0.35, { type: 'sawtooth', to: 120, vol: 0.08 }); break;
        case 'eaten': this.noise(0.5, { freq: 500, vol: 0.3 }); this.tone(110, 0.5, { type: 'sawtooth', to: 50, vol: 0.18 }); break;
        case 'shoo': this.tone(500, 0.15, { type: 'square', to: 1600, vol: 0.1 }); this.noise(0.08, { filter: 'highpass', freq: 3000, vol: 0.08 }); break;
        case 'scared': this.tone(700, 0.12, { type: 'triangle', to: 1400, vol: 0.08 }); break;
        case 'relight': this.noise(0.25, { filter: 'bandpass', freq: 1800, vol: 0.18 }); this.tone(880, 0.2, { type: 'sine', vol: 0.06, at: 0.05 }); break;
        case 'place': this.tone(220, 0.08, { type: 'triangle', vol: 0.2 }); this.noise(0.05, { freq: 800, vol: 0.1 }); break;
        case 'pickup': this.tone(330, 0.07, { type: 'triangle', vol: 0.15, to: 440 }); break;
        case 'nope': this.tone(160, 0.15, { type: 'square', vol: 0.08 }); break;
        case 'oil': this.tone(392, 0.1, { type: 'sine', vol: 0.12 }); this.tone(523, 0.15, { type: 'sine', vol: 0.12, at: 0.08 }); break;
        case 'dry': this.tone(300, 0.6, { type: 'triangle', to: 150, vol: 0.12 }); break;
        case 'yokai': this.tone(880, 0.6, { type: 'sine', to: 600, vol: 0.04 }); break;
        case 'btn': this.tone(660, 0.05, { type: 'triangle', vol: 0.1 }); break;
        case 'start': [392, 523, 659, 784].forEach((f, i) => this.tone(f, 0.3, { type: 'triangle', vol: 0.12, at: i * 0.09 })); this.noise(0.3, { freq: 200, vol: 0.3 }); break;
        case 'dawn': [523, 587, 659, 784, 880, 1047].forEach((f, i) => this.tone(f, 0.6, { type: 'sine', vol: 0.1, at: i * 0.12 })); break;
        case 'leafcoin': this.play('bigcoin'); break;
        case 'whim': this.tone(988, 0.15, { type: 'triangle', vol: 0.06 }); this.tone(1319, 0.2, { type: 'triangle', vol: 0.06, at: 0.08 }); break;
        case 'mark': this.tone(1760, 0.04, { type: 'square', vol: 0.03 }); break;
        case 'lampoff': this.noise(0.12, { freq: 700, vol: 0.12 }); break;
        case 'lampon': this.noise(0.18, { filter: 'bandpass', freq: 1800, vol: 0.12 }); break;
        case 'land': this.noise(0.4, { freq: 400, vol: 0.3 }); [392, 523, 659].forEach((f, i) => this.tone(f, 0.3, { type: 'triangle', vol: 0.12, at: 0.1 + i * 0.08 })); break;
        case 'road': this.tone(300 + Math.random() * 60, 0.05, { type: 'triangle', vol: 0.12 }); break;
        case 'build': this.noise(0.15, { freq: 300, vol: 0.3 }); this.tone(196, 0.3, { type: 'triangle', vol: 0.2, at: 0.05 }); break;
      }
    },
    // 祭り囃子(仮)と虫の声。毎フレーム呼ぶ。night:夜の最中か
    tick(night, speed) {
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      if (night) {
        if (this.nextBeat < now) this.nextBeat = now + 0.05;
        const SCALE = [587, 659, 784, 880, 988, 1175];
        const MEL = [0, 2, 3, 2, 4, 3, 2, 0, 1, 2, 3, -1, 2, 1, 0, -1];
        while (this.nextBeat < now + 0.2) {
          const t = this.nextBeat - now, b = this.beat++;
          if (b % 4 === 0) this.tone(90, 0.25, { type: 'sine', to: 50, vol: 0.22, at: t });
          if (b % 8 === 6) this.tone(110, 0.15, { type: 'sine', to: 60, vol: 0.12, at: t });
          if (b % 2 === 1) this.noise(0.03, { filter: 'highpass', freq: 5000, vol: 0.03, at: t });
          const m = MEL[(b >> 1) % MEL.length];
          if (b % 2 === 0 && m >= 0) this.tone(SCALE[m], 0.28, { type: 'sine', vol: 0.035, at: t });
          this.nextBeat += 0.24 / (speed || 1);
        }
      }
      if (Math.random() < 0.012) {
        const f = 4200 + Math.random() * 800;
        for (let i = 0; i < 3; i++) this.tone(f, 0.04, { type: 'sine', vol: 0.012, at: i * 0.07 });
      }
    },
  };
  root.Snd = A;
})(window);
