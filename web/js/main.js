'use strict';
// ---------- Game controller: loop, input, match flow ----------
const Game = {
  paused: false, demoOn: false, last: 0, ptr: null, dragging: false, onDone: null,

  init() {
    Save.load();
    R.init(document.getElementById('game'));
    this.bindInput();
    requestAnimationFrame((t) => this.loop(t));
    UI.home();
    document.addEventListener('visibilitychange', () => { if (document.hidden && Play.active && !this.demoOn && !this.paused && Play.phase !== 'idle') UI.pauseMenu(); });
  },
  loop(t) {
    const dt = Math.min(.05, (t - (this.last || t)) / 1000); this.last = t;
    if (Play.active && !this.paused) Play.update(dt);
    if (Play.m) Play.draw(); else { R.begin(); R.drawGround(null); R.end(); }
    requestAnimationFrame((tt) => this.loop(tt));
  },

  // ---------- Attract-mode demo match behind the menus ----------
  demo() {
    if (this.demoOn) return;
    const ids = U.shuffle(TEAMS.map(t => t.id));
    const sq = defaultSquads();
    const m = Rules.newMatch({ overs: 2, mode: 'demo', teamA: { teamId: ids[0], xi: pickBestXI(sq[ids[0]]), isUser: false }, teamB: { teamId: ids[1], xi: pickBestXI(sq[ids[1]]), isUser: false }, superOver: false });
    Rules.startInnings(m, 'A');
    this.demoOn = true; Play.auto = true;
    Play.begin(m, 'A', {
      onBall: () => {},
      onInnings: () => { const r = Rules.advance(m); if (r === 'next') { Play.setupScene(); Play.startBall(); } else { this.demoOn = false; Play.stop(); setTimeout(() => { if (!Play.active && document.querySelector('.screen.dim')) this.demo(); }, 300); } },
      needBowler: () => {},
    });
  },
  stopDemo() { if (this.demoOn) { this.demoOn = false; Play.stop(); Play.auto = false; } },

  // ---------- Real matches ----------
  playMatch(m, onDone) {
    this.stopDemo(); UI.clear(); Play.auto = false; this.paused = false;
    this.onDone = onDone; this.matchStart = { coins: Save.data.coins };
    Rules.startInnings(m, m.cfg.batFirst || 'A');
    const userSide = m.sides.A.isUser ? 'A' : 'B';
    Play.begin(m, userSide, {
      onBall: () => { const inn = Rules.inn(m); if (inn.balls >= 3 && inn.bat === userSide) { Save.data.tutorialSeen = true; } },
      onInnings: () => this.afterInnings(m),
      needBowler: (list, cb) => UI.chooseBowler(list, cb),
    });
  },
  afterInnings(m) {
    Play.phase = 'idle'; UI.clearHud();
    const inn = Rules.inn(m);
    const r = inn.superOver ? Rules.advanceSuperOver(m) : Rules.advance(m);
    const resume = () => { Play.setupScene(); Play.startBall(); };
    if (r === 'done') return setTimeout(() => this.finishMatch(m), 600);
    if (r === 'superover') return setTimeout(() => UI.superOverIntro(m, resume), 500);
    setTimeout(() => UI.inningsBreak(m, resume), 500);
  },
  finishMatch(m) {
    Play.phase = 'idle'; UI.clearHud();
    const userSide = m.sides.A.isUser ? 'A' : 'B';
    const won = m.result.winner === userSide;
    const mult = { easy: .7, normal: 1, hard: 1.4 }[Save.data.settings.difficulty] || 1;
    const lines = [['Match played', 20]];
    if (won) lines.push([m.cfg.mode === 'league' ? 'League win' : 'Victory', m.cfg.mode === 'league' ? 80 : 60]);
    if (won && m.innings.some(i => i.superOver)) lines.push(['Super Over win', 40]);
    let sixes = 0, fours = 0, wkts = 0, best = 0;
    m.innings.forEach(inn => {
      if (inn.bat === userSide) { inn.batting.forEach(b => { sixes += b.f6; fours += b.f4; }); if (!inn.superOver) best = Math.max(best, inn.runs); }
      else wkts += Object.values(inn.bowlers).reduce((s, b) => s + b.wkts, 0);
    });
    if (sixes) lines.push([`Sixes × ${sixes}`, sixes * 5]);
    if (fours) lines.push([`Fours × ${fours}`, fours * 2]);
    if (wkts) lines.push([`Wickets × ${wkts}`, wkts * 4]);
    lines.forEach(l => l[1] = Math.round(l[1] * mult));
    const total = lines.reduce((s, l) => s + l[1], 0);
    Save.addCoins(total);
    const st = Save.data.stats; st.matches++; if (won) st.wins++; st.highScore = Math.max(st.highScore, best);
    Save.save();
    const cb = this.onDone; this.onDone = null;
    cb && cb({ lines, total });
  },
  simInnings() {
    const m = Play.m; if (!m || this.demoOn) return;
    Play.phase = 'idle'; UI.clearHud();
    Sim.playInnings(m);
    this.afterInnings(m);
  },
  quitMatch() {
    const m = Play.m; Play.stop(); Play.m = null; UI.clearHud();
    if (m && m.cfg.mode === 'league') UI.leagueHub(); else UI.home();
  },

  // ---------- Input ----------
  toWorld(sx, sy) { return R.unproject(sx, sy); },
  bindInput() {
    const cv = document.getElementById('game');
    cv.addEventListener('pointerdown', (e) => {
      Sfx.ensure();
      this.ptr = { x: e.clientX, y: e.clientY, t: performance.now() };
      if (Play.phase === 'setup' && UI.bowlTarget && Play.userBowling()) { this.dragging = true; this.dragTo(e); }
    });
    cv.addEventListener('pointermove', (e) => { if (this.dragging) this.dragTo(e); });
    const up = (e) => {
      if (this.dragging) { this.dragging = false; this.ptr = null; return; }
      if (!this.ptr) return;
      const dx = e.clientX - this.ptr.x, dy = e.clientY - this.ptr.y, len = Math.hypot(dx, dy);
      this.ptr = null;
      if (Play.phase !== 'flight' || !Play.userBatting() || this.paused) return;
      if (len < 22) Play.userShot(-Math.PI / 2, .2, true);
      else { const w = R.vecToWorld(dx, dy); Play.userShot(Math.atan2(w.y, w.x), U.clamp(len / (Math.min(R.W, R.H) * .5), .15, 1), false); }
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', () => { this.ptr = null; this.dragging = false; });
    // keyboard (desktop testing): arrows aim, space = defend, shift = loft
    window.addEventListener('keydown', (e) => {
      if (Play.phase !== 'flight' || !Play.userBatting()) return;
      const map = { ArrowUp: -Math.PI / 2, ArrowLeft: -2.5, ArrowRight: -.6, ArrowDown: Math.PI / 2 };
      if (e.code === 'Space') Play.userShot(-Math.PI / 2, .2, true);
      else if (map[e.key] !== undefined) Play.userShot(map[e.key], e.shiftKey ? .95 : .5, false);
    });
  },
  dragTo(e) {
    const w = this.toWorld(e.clientX, e.clientY);
    UI.bowlTarget = { x: U.clamp(w.x, -1.3, 1.4), y: U.clamp(w.y, -3, 9.6) };
  },
};

// Android hardware back button (called from the native shell)
window.onAndroidBack = () => {
  const sheet = document.querySelector('.sheet');
  if (sheet) { sheet.remove(); Game.paused = false; return 'stay'; }
  if (Play.active && !Game.demoOn && Play.m && Play.phase !== 'idle') { UI.pauseMenu(); return 'stay'; }
  if (document.querySelector('.screen.dim .title')) return 'exit';
  if (Save.data.career && document.querySelector('.screen.auction')) { UI.home(); return 'stay'; }
  UI.home(); return 'stay';
};

window.addEventListener('load', () => Game.init());
