// 音。http なら WebAudio で先頭の無音を飛ばして鳴らす。file:// では Audio 要素で鳴らす。
// ファイルがなければ黙って鳴らさない。
(function (root) {
  const SE = ['ding', 'door_open', 'door_close', 'pinch', 'bonk', 'coin', 'coin_bad', 'kami', 'slip', 'btn', 'fired', 'result', 'groan', 'scream'];
  const VOICE = ['up', 'angry', 'clear'];
  const LOOPS = [['bgm', 0.42], ['amb', 0.5]];
  const A = {
    ctx: null, buf: {}, html: {}, loops: {}, els: {}, hidden: false, ready: false, loopsOn: false, rate: 1,
    vol: { bgm: 0.6, se: 0.9, voice: 0.9 },
    load() {
      for (const n of SE) this.html[n] = new Audio('assets/audio/' + n + '.mp3');
      for (const n of VOICE) this.html['v_' + n] = new Audio('assets/audio/v_' + n + '.wav');
      for (const [n] of LOOPS) { const a = new Audio('assets/audio/' + n + '.mp3'); a.loop = true; this.els[n] = a; }
    },
    // 最初の操作のあとで呼ぶ
    unlock() {
      if (this.ctx && this.ctx.state !== 'running' && !this.hidden) this.ctx.resume().catch(() => {});
      if (this.ready) return;
      this.ready = true;
      const AC = root.AudioContext || root.webkitAudioContext;
      if (AC && location.protocol !== 'file:') {
        this.ctx = new AC();
        for (const name of Object.keys(this.html)) {
          fetch(this.html[name].src).then(r => r.ok ? r.arrayBuffer() : Promise.reject()).then(b => this.ctx.decodeAudioData(b)).then(d => { this.buf[name] = { d, start: firstSound(d) }; }).catch(() => {});
        }
        for (const [name] of LOOPS) {
          fetch(this.els[name].src).then(r => r.ok ? r.arrayBuffer() : Promise.reject()).then(b => this.ctx.decodeAudioData(b)).then(d => { this.buf['loop_' + name] = { d, start: 0 }; this.syncLoops(); }).catch(() => {});
        }
      }
      this.syncLoops();
    },
    syncLoops(on) {
      if (on !== undefined) this.loopsOn = on;
      if (!this.ready) return;
      for (const [name, k] of LOOPS) {
        const vol = this.vol.bgm * k * (name === 'amb' ? 1 : 1), b = this.buf['loop_' + name], el = this.els[name];
        if (this.ctx && b) {
          el.pause();
          this.setLoop(name, b, this.loopsOn ? vol : 0);
        } else {
          el.volume = Math.min(1, vol);
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
        // 頭と尻の無音を飛ばしてつなぐ
        const [a, z] = soundRange(b.d);
        src.loopStart = a; src.loopEnd = z;
        src.connect(g).connect(this.ctx.destination);
        src.start(0, a);
        l = this.loops[name] = { src, g };
      }
      l.g.gain.value = vol;
      if (name === 'bgm') l.src.playbackRate.value = this.rate;
    },
    // 落ちている間は館内音楽をゆっくりにする
    setRate(r) {
      if (this.rate === r) return;
      this.rate = r;
      const l = this.loops.bgm;
      if (l) l.src.playbackRate.setTargetAtTime(r, this.ctx.currentTime, 0.08);
      else if (this.els.bgm) this.els.bgm.playbackRate = r;
    },
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
      if (this.ctx) return; // 読み込み中、またはファイルがない
      const h = this.html[name];
      if (!h) return;
      const c = h.cloneNode(); c.volume = Math.min(1, vol); c.playbackRate = o.rate || 1;
      c.play().catch(() => {});
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
  function soundRange(d) {
    const ch = d.getChannelData(0);
    let peak = 0;
    for (let i = 0; i < ch.length; i += 16) peak = Math.max(peak, Math.abs(ch[i]));
    const th = peak * 0.02;
    let a = 0, z = ch.length - 1;
    while (a < z && Math.abs(ch[a]) < th) a += 16;
    while (z > a && Math.abs(ch[z]) < th) z -= 16;
    return [a / d.sampleRate, z / d.sampleRate];
  }
  A.load();
  root.Snd = A;
})(window);
