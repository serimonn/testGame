// 音。http なら WebAudio で先頭の無音を飛ばして鳴らす。file:// では Audio 要素で鳴らす。
(function (root) {
  const SE = ['fart_s', 'fart_m', 'fart_l', 'fart_crit', 'fart_over', 'rumble', 'hit', 'parry', 'imo', 'taiko', 'bump', 'horagai', 'taikoskin', 'ui', 'cheer'];
  const VOICE = ['hakke', 'nokotta', 'torinaoshi'];
  const A = {
    ctx: null, buf: {}, html: {}, loops: {}, hidden: false, vol: { bgm: 0.5, se: 0.9, voice: 0.9 }, bgm: null, crowd: null, ready: false,
    load() {
      for (const n of SE) this.html[n] = new Audio('assets/audio/' + n + '.mp3');
      for (const n of VOICE) this.html['v_' + n] = new Audio('assets/audio/v_' + n + '.wav');
      this.bgm = new Audio('assets/audio/bgm.mp3'); this.bgm.loop = true;
      this.crowd = new Audio('assets/audio/crowd.mp3'); this.crowd.loop = true;
    },
    // 最初の操作のあとで呼ぶ
    unlock() {
      // iOS は中断後も resume が要るので、操作のたびに呼ぶ
      if (this.ctx && this.ctx.state !== 'running' && !this.hidden) this.ctx.resume().catch(() => {});
      if (this.ready) return;
      this.ready = true;
      const AC = root.AudioContext || root.webkitAudioContext;
      if (AC && location.protocol !== 'file:') {
        this.ctx = new AC();
        for (const name of Object.keys(this.html)) {
          fetch(this.html[name].src).then(r => r.arrayBuffer()).then(b => this.ctx.decodeAudioData(b)).then(d => { this.buf[name] = { d, start: firstSound(d) }; }).catch(() => {});
        }
        // ループも WebAudio で鳴らす(iOS は Audio 要素の音量を変えられない)
        for (const [name, el] of [['bgm', this.bgm], ['crowd', this.crowd]]) {
          fetch(el.src).then(r => r.arrayBuffer()).then(b => this.ctx.decodeAudioData(b)).then(d => { this.buf[name] = { d, start: 0 }; this.syncLoops(); }).catch(() => {});
        }
      }
      this.syncLoops();
    },
    syncLoops(on) {
      if (on !== undefined) this.loopsOn = on;
      if (!this.ready) return;
      for (const [name, el, k] of [['bgm', this.bgm, 0.45], ['crowd', this.crowd, 0.5]]) {
        const vol = this.vol.bgm * k, b = this.buf[name];
        if (this.ctx && b) {
          el.pause();
          this.setLoop(name, b, this.loopsOn ? vol : 0);
        } else {
          el.volume = vol;
          if (this.loopsOn && !this.hidden) el.play().catch(() => {}); else el.pause();
        }
      }
    },
    setLoop(name, b, vol) {
      let l = this.loops[name];
      if (vol <= 0) { if (l) { l.src.stop(); delete this.loops[name]; } return; }
      if (!l) {
        const src = this.ctx.createBufferSource(), g = this.ctx.createGain();
        src.buffer = b.d; src.loop = true;
        src.connect(g).connect(this.ctx.destination);
        src.start();
        l = this.loops[name] = { src, g };
      }
      l.g.gain.value = vol;
    },
    // 画面を離れたら音も止める
    setHidden(h) {
      this.hidden = h;
      if (this.ctx) { if (h) this.ctx.suspend().catch(() => {}); else this.ctx.resume().catch(() => {}); }
      this.syncLoops();
    },
    play(name, o) {
      if (!this.ready) return;
      o = o || {};
      const vol = (name.startsWith('v_') ? this.vol.voice : this.vol.se) * (o.vol === undefined ? 1 : o.vol);
      if (vol <= 0) return;
      const b = this.buf[name];
      if (this.ctx && b) {
        const src = this.ctx.createBufferSource(), g = this.ctx.createGain(), t = this.ctx.currentTime;
        src.buffer = b.d; src.playbackRate.value = o.rate || 1;
        g.gain.value = vol;
        src.connect(g).connect(this.ctx.destination);
        const dur = o.dur || b.d.duration;
        if (o.dur) { g.gain.setValueAtTime(vol, t + dur * 0.7); g.gain.linearRampToValueAtTime(0, t + dur); }
        src.start(t, b.start, dur * (o.rate || 1));
        return;
      }
      const h = this.html[name];
      if (!h) return;
      const c = h.cloneNode(); c.volume = Math.min(1, vol); c.playbackRate = o.rate || 1;
      c.play().catch(() => {});
      if (o.dur) setTimeout(() => c.pause(), o.dur * 1000);
    },
  };
  function firstSound(d) {
    const ch = d.getChannelData(0);
    let peak = 0;
    for (let i = 0; i < ch.length; i += 16) peak = Math.max(peak, Math.abs(ch[i]));
    const th = peak * 0.08;
    for (let i = 0; i < ch.length; i += 16) if (Math.abs(ch[i]) >= th) return Math.max(0, i / d.sampleRate - 0.003);
    return 0;
  }
  A.load();
  root.Snd = A;
})(window);
