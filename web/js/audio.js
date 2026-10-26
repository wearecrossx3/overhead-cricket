'use strict';
// Tiny synthesized sound kit (no external audio files needed)
const Sfx = {
  ctx: null,
  ensure() {
    if (!this.ctx) { try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },
  on() { return Save.data && Save.data.settings.sound; },
  noise(dur, filterFreq, gain, type = 'bandpass', q = 1) {
    const c = this.ensure(); if (!c || !this.on()) return;
    const len = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = filterFreq; f.Q.value = q;
    const g = c.createGain(); g.gain.value = gain;
    src.connect(f).connect(g).connect(c.destination); src.start();
  },
  tone(freq, dur, gain = .15, type = 'sine', slide = 0) {
    const c = this.ensure(); if (!c || !this.on()) return;
    const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.value = freq;
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), c.currentTime + dur);
    g.gain.setValueAtTime(gain, c.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime + dur);
  },
  bat(power = 1) { this.noise(.08, 1800, .9 * power, 'bandpass', 2); this.tone(220, .09, .25 * power, 'triangle', -120); },
  edge() { this.noise(.05, 3200, .5, 'highpass'); },
  stumps() { this.noise(.25, 900, .8, 'bandpass', 4); this.tone(520, .2, .12, 'square', -300); },
  bounce() { this.noise(.04, 500, .25, 'lowpass'); },
  catch() { this.noise(.06, 700, .5, 'lowpass'); },
  crowd(intensity = 1) {
    const c = this.ensure(); if (!c || !this.on()) return;
    const dur = 1.6 + intensity, len = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) { const t = i / len; d[i] = (Math.random() * 2 - 1) * Math.sin(Math.PI * t) ** .6; }
    const src = c.createBufferSource(); src.buffer = buf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = .5;
    const g = c.createGain(); g.gain.value = .35 * intensity;
    src.connect(f).connect(g).connect(c.destination); src.start();
  },
  click() { this.tone(880, .05, .08, 'square'); },
  coin() { this.tone(1320, .08, .1, 'square'); setTimeout(() => this.tone(1760, .12, .1, 'square'), 70); },
  gavel() { this.noise(.12, 400, .9, 'lowpass'); this.tone(140, .15, .3, 'triangle'); },
  whistle() { this.tone(1900, .35, .08, 'sine', 200); },
};
