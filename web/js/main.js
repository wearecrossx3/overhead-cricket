'use strict';
// ---------- Game controller: loop, input, match flow ----------
const Game = {
  paused: false, demoOn: false, last: 0, ptr: null, dragging: false, onDone: null,

  init() {
    Save.load();
    const v = Save.data.settings.view; if (!['bat', 'tv', 'drone'].includes(v)) { Save.data.settings.view = 'bat'; Save.save(); }
    R.init(document.getElementById('game'));
    // 2D perspective renderer (Stick-Cricket style) — no WebGL, so no black screens
    R.proj = (x, y, z) => PR.proj(x, y, z);
    R.vecToWorld = (dx, dy) => PR.vecToWorld(dx, dy);
    R.unproject = (sx, sy) => PR.unproject(sx, sy);
    R.screenDir = (wx, wy, at) => PR.screenDir(wx, wy, at);
    R.figScale = (x, y) => PR.scaleAt(x, y);
    window.addEventListener('error', (e) => this.reportError(e.message || String(e)));
    this.bindInput();
    requestAnimationFrame((t) => this.loop(t));
    UI.home();
    const sp = document.getElementById('splash'); if (sp) setTimeout(() => { sp.classList.add('out'); setTimeout(() => sp.remove(), 600); }, 1100);
    document.addEventListener('visibilitychange', () => { if (document.hidden && Play.active && !this.demoOn && !this.paused && Play.phase !== 'idle') UI.pauseMenu(); });
  },
  reportError(msg) {
    console.error(msg);
    const now = performance.now(); if (now - (this.lastErr || 0) < 4000) return; this.lastErr = now;
    if (!this.demoOn) UI.toast('Recovered from a glitch: ' + String(msg).slice(0, 60), 2500);
  },
  loop(t) {
    requestAnimationFrame((tt) => this.loop(tt)); // schedule first: an error can never freeze the game
    const dt = Math.min(.05, (t - (this.last || t)) / 1000); this.last = t;
    try {
      if (Play.active && !this.paused) { Play.update(dt); this.watchdog(dt); }
      if (Play.m) Play.draw();
      else PR.draw(null, dt);
    } catch (e) { this.reportError(e && e.message); this.rescue(); }
  },
  // if a ball ever gets stuck, move the match on
  watchdog(dt) {
    const key = Play.phase + ':' + (Play.m ? Play.m.events.length : 0);
    if (key !== this.wdKey) { this.wdKey = key; this.wdT = 0; return; }
    if (['setup', 'choosebowler', 'idle'].includes(Play.phase)) return;
    this.wdT += dt;
    if (this.wdT > (Play.phase === 'inplay' ? 16 : 10)) { this.wdT = 0; this.rescue(); }
  },
  rescue() {
    try {
      if (!Play.active || this.demoOn && !Play.m) return;
      if (Play.phase === 'inplay') Play.ballDead() || Play.endBall({ runs: Play.inplay ? Play.inplay.runs : 0 }, .4);
      else if (Play.phase === 'flight' || Play.phase === 'runup') Play.endBall({}, .4);
      else if (Play.phase === 'dead') Play.finishBall();
      else if (Play.phase === 'between') Play.startBall();
    } catch (e) { console.error('rescue failed', e); }
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
  playMatch(m, onDone, prestarted) {
    this.stopDemo(); UI.clear(); Play.auto = false; this.paused = false; Sfx.ambience(true);
    Play.streak = 0; Play.fire = false; FX.list = [];
    this.onDone = onDone; this.matchStart = { coins: Save.data.coins };
    if (m.cfg.night == null) m.cfg.night = Math.random() < .4;
    if (!prestarted) Rules.startInnings(m, m.cfg.batFirst || 'A');
    const userSide = m.sides.A.isUser ? 'A' : 'B';
    Play.begin(m, userSide, {
      onBall: (r) => {
        const inn = Rules.inn(m); if (inn.balls >= 3 && inn.bat === userSide) { Save.data.tutorialSeen = true; }
        if (Play.fire) Ach.unlock('fire');
      },
      onInnings: () => m.cfg.mode === 'challenge' ? this.finishChallenge(m) : this.afterInnings(m),
      needBowler: (list, cb) => UI.chooseBowler(list, cb),
    });
  },
  // ---------- Challenge scenarios ----------
  playChallenge(i) {
    const ch = CHALLENGES[i], sq = defaultSquads();
    const mine = (Save.data.career && Save.data.career.userTeam) || (UI.qs && UI.qs.mine) || 'RJR';
    const opp = ch.opp === mine ? 'AMA' : ch.opp;
    const m = Rules.newMatch({ overs: Math.max(1, Math.ceil(ch.balls / 6)), mode: 'challenge', chIndex: i, night: i % 3 === 2,
      teamA: { teamId: mine, xi: pickBestXI(sq[mine]), isUser: true }, teamB: { teamId: opp, xi: pickBestXI(sq[opp]), isUser: false } });
    const batSide = ch.kind === 'chase' ? 'A' : 'B';
    const opts = { target: ch.need, overs: ch.balls / 6, maxWkts: ch.wkts };
    if (ch.kind === 'defend' && ch.spinOnly) opts.bowlers = m.sides.A.xi.filter(p => p.bowlType === 'spin' && p.role !== 'WK').slice(0, 4);
    Rules.startInnings(m, batSide, opts);
    this.playMatch(m, null, true);
  },
  finishChallenge(m) {
    Play.phase = 'idle'; UI.clearHud(); Sfx.ambience(false);
    const i = m.cfg.chIndex, ch = CHALLENGES[i], inn = m.innings[0];
    const stars = Challenges.evaluate(ch, inn), all = Challenges.stars(), prev = all[i] || 0;
    let coins = 0; if (stars > prev) { coins = (stars - prev) * 40; all[i] = stars; Save.addCoins(coins); }
    Save.data.stats.matches++; if (stars) Save.data.stats.wins++; Save.save();
    Ach.checkMatch(m, 'A', stars > 0);
    setTimeout(() => UI.challengeResult(m, i, stars, coins), 600);
  },
  // ---------- Practice nets: endless batting, timing feedback ----------
  nets() {
    const sq = defaultSquads(), mine = (Save.data.career && Save.data.career.userTeam) || 'RJR', opp = U.pick(TEAMS.filter(t => t.id !== mine)).id;
    const m = Rules.newMatch({ overs: 50, mode: 'nets', superOver: false, night: false,
      teamA: { teamId: mine, xi: pickBestXI(sq[mine]), isUser: true }, teamB: { teamId: opp, xi: pickBestXI(sq[opp]), isUser: false } });
    const xi = m.sides.A.xi; const many = []; for (let i = 0; i < 18; i++) many.push(...xi);
    Rules.startInnings(m, 'A', { batters: many, maxWkts: many.length - 1, overs: 50 });
    this.playMatch(m, null, true);
    UI.toast('Practice nets — no pressure. Learn the timing!', 2200);
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
    Play.phase = 'idle'; UI.clearHud(); Sfx.ambience(false);
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
    Ach.checkMatch(m, userSide, won);
    if (m.cfg.mode === 'league' && Save.data.career && Save.data.career.league && Save.data.career.league.champion === Save.data.career.userTeam) Ach.unlock('champion');
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
    Sfx.ambience(false);
    const m = Play.m; Play.stop(); Play.m = null; UI.clearHud(); FX.list = []; R.night = false; Play.slow = null;
    if (m && m.cfg.mode === 'league') UI.leagueHub(); else if (m && m.cfg.mode === 'challenge') UI.challenges(); else UI.home();
  },

  // ---------- Input ----------
  toWorld(sx, sy) { return R.unproject(sx, sy); },
  bindInput() {
    const cv = document.getElementById('game');
    cv.addEventListener('pointerdown', (e) => {
      Sfx.ensure();
      this.ptr = { x: e.clientX, y: e.clientY, t: performance.now() };
      if (Play.phase === 'setup' && UI.bowlTarget && Play.userBowling()) { this.dragging = true; this.dragTo(e); return; }
      if (Play.phase === 'dead') { Play.skipReq = true; return; }
      if (!this.paused) Play.userPress();
    });
    cv.addEventListener('pointermove', (e) => {
      if (this.dragging) return this.dragTo(e);
      if (this.ptr) Play.userGesture(e.clientX - this.ptr.x, e.clientY - this.ptr.y, false);
    });
    const up = (e) => {
      if (this.dragging) { this.dragging = false; this.ptr = null; return; }
      if (!this.ptr) return;
      Play.userGesture(e.clientX - this.ptr.x, e.clientY - this.ptr.y, true);
      this.ptr = null;
    };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', () => { this.ptr = null; this.dragging = false; });
    // keyboard (desktop testing): space = drive, up = loft, down = defend
    window.addEventListener('keydown', (e) => {
      if (Play.phase !== 'flight' || !Play.userBatting()) return;
      if (!Play.userPress()) return;
      Play.userGesture(0, e.key === 'ArrowUp' ? -60 : e.key === 'ArrowDown' ? 60 : 0, true);
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
