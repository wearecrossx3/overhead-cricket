'use strict';
// ---------- Utilities ----------
const U = {
  clamp: (v, a, b) => Math.max(a, Math.min(b, v)),
  lerp: (a, b, t) => a + (b - a) * t,
  rand: (a = 0, b = 1) => a + Math.random() * (b - a),
  randi: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
  pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
  chance: (p) => Math.random() < p,
  dist: (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by),
  easeOut: (t) => 1 - Math.pow(1 - t, 3),
  easeInOut: (t) => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  shuffle(arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; },
  angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; },
  oversStr(balls) { return Math.floor(balls / 6) + '.' + (balls % 6); },
  fmtCoins(n) { return Math.round(n).toLocaleString('en-IN'); },
  el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html !== undefined) e.innerHTML = html; return e; },
  uid: () => Math.random().toString(36).slice(2, 9),
};

// ---------- Persistent save ----------
const Save = {
  KEY: 'overhead_cricket_v1',
  data: null,
  defaults() {
    return {
      coins: 500,
      settings: { sound: true, vibrate: true, difficulty: 'normal', autoRun: true, view: 'stick' },
      stats: { matches: 0, wins: 0, runs: 0, sixes: 0, fours: 0, wickets: 0, highScore: 0 },
      career: null, // league/auction save
      tutorialSeen: false,
    };
  },
  load() {
    try { const raw = localStorage.getItem(this.KEY); this.data = raw ? Object.assign(this.defaults(), JSON.parse(raw)) : this.defaults(); }
    catch (e) { this.data = this.defaults(); }
    return this.data;
  },
  save() { try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch (e) { /* storage unavailable */ } },
  addCoins(n) { this.data.coins = Math.max(0, Math.round(this.data.coins + n)); this.save(); },
};

function vibrate(ms) { try { if (Save.data && Save.data.settings.vibrate && navigator.vibrate) navigator.vibrate(ms); } catch (e) {} }
