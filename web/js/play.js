'use strict';
// ---------- Interactive match: delivery physics, batting, bowling, fielding, running ----------
const G = 9.8;
const POP_Y = 8.84, STUMP_Y = 10.06, HIT_Y = 9.0, NS_POP = -8.84, RUN_LEN = 17.68;
const DIFF = {
  easy:   { ts: .42, win: 1.35, aiErr: 1.25, hint: true },
  normal: { ts: .52, win: 1.0,  aiErr: 1.0,  hint: false },
  hard:   { ts: .64, win: .8,   aiErr: .8,   hint: false },
};

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16); let r = (n >> 16) + amt, g = ((n >> 8) & 255) + amt, b = (n & 255) + amt;
  r = U.clamp(r, 0, 255); g = U.clamp(g, 0, 255); b = U.clamp(b, 0, 255);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}
function kitOf(teamId) { const t = teamById(teamId); return { shirt: t.c1, trouser: shade(t.c1, -45), helmet: t.c2 === '#e8f1f2' || t.c2 === '#c0c0c0' ? '#1d2d5c' : t.c2, stripe: t.c2, head: t.c1 }; }

// Field placements (x,y in metres; +x = off side for a right-hander, +y = behind the striker)
const FIELDS = {
  attack:   [[2.8, 13.6], [4.6, 13.0], [17, 8], [15, -5], [6, -21], [-6, -21], [-16, -3], [-17, 10], [-26, 44]],
  balanced: [[17, 8], [16, -6], [40, -32], [6, -21], [-22, -57], [-16, -5], [-55, 14], [-30, 52], [32, 50]],
  death:    [[18, 6], [46, -20], [36, -46], [8, -60], [-14, -60], [-45, -36], [-58, 6], [-30, 52], [40, 44]],
  spin:     [[2.2, 11.6], [-3, 4.5], [15, 7], [14, -6], [6, -20], [-6, -20], [-16, -4], [-50, -30], [-34, 48]],
};

const Play = {
  m: null, active: false, userSide: 'A', auto: false,
  phase: 'idle', t: 0, phaseT: 0, ts: 1,
  ball: null, del: null, shot: null, inplay: null,
  fielders: [], bat1: null, bat2: null, bowlerEnt: null, keeper: null,
  banner: null, onBall: null, onInnings: null,
  stumpsBroken: { s: false, ns: false },
  popups: [],

  diff() { return DIFF[Save.data.settings.difficulty] || DIFF.normal; },
  userBatting() { const inn = Rules.inn(this.m); return inn && inn.bat === this.userSide; },
  userBowling() { const inn = Rules.inn(this.m); return inn && inn.bowl === this.userSide; },

  begin(m, userSide, callbacks) {
    this.m = m; this.userSide = userSide; this.active = true;
    this.onBall = callbacks.onBall; this.onInnings = callbacks.onInnings; this.needBowler = callbacks.needBowler;
    this.setupScene(); this.startBall();
  },
  stop() { this.active = false; this.phase = 'idle'; },

  // ---------- Scene setup ----------
  setupScene() {
    const inn = Rules.inn(this.m), batTeam = this.m.sides[inn.bat].teamId, bowlTeam = this.m.sides[inn.bowl].teamId;
    this.batKit = kitOf(batTeam); this.fieldKit = kitOf(bowlTeam);
    this.m.teamColor = teamById(bowlTeam).c2;
    const fxi = this.m.sides[inn.bowl].xi;
    const keeperP = fxi.find(p => p.role === 'WK') || fxi[fxi.length - 1];
    this.keeperP = keeperP;
    this.bat1 = { x: -.3, y: 9.3, face: Math.PI / 2, pose: 'bat', t: 0, kit: this.batKit, helmet: true, pads: true, gloves: true, holdsBat: true, bat: 2.2 };
    this.bat2 = { x: .9, y: -9.4, face: Math.PI, pose: 'stand', t: 0, kit: this.batKit, helmet: true, pads: true, gloves: true, holdsBat: true, bat: 1.2 };
    this.keeper = { x: .3, y: 13, hx: .3, hy: 13, face: Math.PI, pose: 'keep', t: 0, kit: this.fieldKit, gloves: true, pads: true, helmet: false, cap: true, role: 'keeper', p: keeperP, speed: 6.5 };
    this.bowlerEnt = { x: .5, y: -24, face: Math.PI, pose: 'stand', t: 0, kit: this.fieldKit, role: 'bowler', speed: 7 };
    const umpKit = { shirt: '#f4f2ea', trouser: '#2b2b2b', head: '#f2f2ee', stripe: '#d9d4c4' };
    this.umps = [{ x: 0, y: -12.4, face: 0, pose: 'stand', t: 0, kit: umpKit, hat: true, skin: '#a86b45', role: 'ump' }, { x: -26, y: 9.2, face: Math.PI / 2, pose: 'stand', t: 0, kit: umpKit, hat: true, skin: '#8d5a3b', role: 'ump' }];
    R.night = !!this.m.cfg.night;
    this.placeField();
    this.refreshPlayers();
  },
  refreshPlayers() {
    const inn = Rules.inn(this.m);
    const st = Rules.striker(inn).p, ns = Rules.nonStriker(inn).p;
    const num = (p) => (parseInt(p.id, 36) % 98) + 1;
    const bc = Save.data.shop && this.userBatting() ? SHOP.bat().color : null;
    Object.assign(this.bat1, { skin: st.skin, hair: st.hair, pid: st.id, num: num(st), batColor: bc });
    Object.assign(this.bat2, { skin: ns.skin, hair: ns.hair, pid: ns.id, num: num(ns), batColor: bc });
    const bw = inn.bowlerId ? Rules.bowler(inn).p : null;
    if (bw) Object.assign(this.bowlerEnt, { skin: bw.skin, hair: bw.hair, p: bw });
    this.keeper.skin = this.keeperP.skin;
  },
  placeField() {
    const inn = Rules.inn(this.m);
    const bw = inn.bowlerId ? Rules.bowler(inn).p : null;
    const progress = inn.balls / (inn.oversLimit * 6);
    let set = progress < .3 && inn.oversLimit > 2 ? 'attack' : progress > .8 ? 'death' : 'balanced';
    if (bw && bw.bowlType === 'spin' && set !== 'death') set = 'spin';
    if (inn.superOver) set = 'death';
    const fxi = this.m.sides[inn.bowl].xi.filter(p => p.id !== this.keeperP.id && (!bw || p.id !== bw.id));
    this.fielders = FIELDS[set].map((pos, i) => {
      const p = fxi[i % fxi.length];
      return { x: pos[0], y: pos[1], hx: pos[0], hy: pos[1], face: Math.atan2(9 - pos[1], 0 - pos[0]) + Math.PI / 2, pose: 'crouch', t: Math.random() * 3, kit: this.fieldKit, cap: true, p, speed: 5.0 + p.field / 40, role: 'field', skin: p.skin, hair: p.hair, num: (parseInt(p.id, 36) % 98) + 1 };
    });
    // keeper stands up to spinners, back to pace
    const spin = bw && bw.bowlType === 'spin';
    this.keeper.hy = spin ? 11.2 : 14.5; this.keeper.y = this.keeper.hy; this.keeper.x = this.keeper.hx = .35;
    this.allFielders = [...this.fielders, this.keeper, this.bowlerEnt];
  },
  resetPositions() {
    this.bat1.x = -.3; this.bat1.y = 9.3; this.bat1.face = Math.PI / 2; this.bat1.pose = 'bat'; this.bat1.bat = 2.2; this.bat1.backlift = 0; this.bat1.fire = !!this.fire;
    this.bat2.x = .9; this.bat2.y = -9.4; this.bat2.face = Math.PI; this.bat2.pose = 'stand';
    this.fielders.forEach(f => { f.x = f.hx; f.y = f.hy; f.pose = 'crouch'; f.face = Math.atan2(9 - f.hy, -f.hx) + Math.PI / 2; });
    this.keeper.x = this.keeper.hx; this.keeper.y = this.keeper.hy; this.keeper.pose = 'keep'; this.keeper.face = Math.PI;
    const spin = this.bowlerEnt.p && this.bowlerEnt.p.bowlType === 'spin';
    this.bowlerEnt.x = .5; this.bowlerEnt.y = spin ? -16 : -26; this.bowlerEnt.face = Math.PI; this.bowlerEnt.pose = 'stand';
    this.stumpsBroken = { s: false, ns: false };
    this.ball = null; this.shot = null; this.inplay = null; this.del = null;
  },

  // ---------- Ball lifecycle ----------
  startBall() {
    if (!this.active) return;
    const inn = Rules.inn(this.m);
    if (!inn.bowlerId) {
      if (this.userBowling() && !this.auto) { this.phase = 'choosebowler'; this.needBowler(Rules.eligibleBowlers(this.m, inn), (p) => { Rules.setBowler(inn, p); this.afterBowlerChosen(); }); return; }
      Rules.autoBowler(this.m, inn);
      this.afterBowlerChosen(); return;
    }
    this.prepBall();
  },
  afterBowlerChosen() { this.refreshPlayers(); this.placeField(); this.prepBall(); },
  prepBall() {
    this.refreshPlayers(); this.resetPositions();
    this.phase = 'setup'; this.phaseT = 0;
    R.setCam(R.isIso() ? .3 : 0, R.isIso() ? .6 : 1.5, R.pitchZoom);
    UI.hud();
    if (this.userBowling() && !this.auto) { UI.bowlControls(Rules.bowler(Rules.inn(this.m)).p); }
    else { this.planAIDelivery(); }
  },

  // AI bowler chooses a delivery
  planAIDelivery() {
    const inn = Rules.inn(this.m), bw = Rules.bowler(inn).p;
    let type, tx, ty;
    const death = inn.balls / (inn.oversLimit * 6) > .75 || inn.superOver;
    if (bw.bowlType === 'pace') {
      type = U.pick(death ? ['yorker', 'yorker', 'slower', 'good', 'bouncer', 'full'] : ['good', 'good', 'good', 'full', 'short', 'bouncer', 'yorker', 'slower']);
      if (inn.bouncers >= Rules.BOUNCERS_PER_OVER && (type === 'bouncer' || type === 'short')) type = U.pick(['good', 'yorker', 'full']);
    } else type = U.pick(['offbreak', 'legbreak', 'flighted', 'arm', 'offbreak', 'legbreak']);
    ({ tx, ty } = this.defaultTarget(type));
    const acc = (100 - bw.bowl) / 100; // 0..0.9
    tx += U.rand(-1, 1) * (.15 + acc * .55); ty += U.rand(-1, 1) * (.25 + acc * 1.1);
    const overstep = U.chance(.006 + acc * .014);
    this.phase = 'runup'; this.phaseT = 0;
    this.del = this.buildDelivery(bw, type, tx, ty, { overstep, paceBoost: 0 });
  },
  defaultTarget(type) {
    switch (type) {
      case 'yorker': return { tx: .12, ty: 8.25 };
      case 'full': return { tx: .2, ty: 6.3 };
      case 'good': return { tx: .2, ty: 3.6 };
      case 'short': return { tx: .1, ty: 1.2 };
      case 'bouncer': return { tx: -.05, ty: -.6 };
      case 'slower': return { tx: .15, ty: 4.6 };
      case 'offbreak': return { tx: .45, ty: 4.6 };
      case 'legbreak': return { tx: -.15, ty: 4.4 };
      case 'flighted': return { tx: .3, ty: 5.6 };
      case 'arm': return { tx: .1, ty: 4.2 };
      default: return { tx: .2, ty: 3.8 };
    }
  },
  // Build the full trajectory of a delivery (sampled path)
  buildDelivery(bw, type, tx, ty, opts) {
    const pace = bw.bowlType === 'pace';
    let speed = pace ? (35 + bw.bowl / 100 * 6.5) : (21 + bw.bowl / 100 * 3.5);
    if (type === 'slower') speed *= .78;
    if (type === 'flighted') speed *= .9;
    if (type === 'arm' || type === 'quicker') speed *= 1.1;
    if (type === 'bouncer' || type === 'short') speed *= 1.02;
    speed *= 1 + (opts.paceBoost || 0) + U.rand(-.02, .02);
    const rel = { x: .32, y: -9.2, z: pace ? 2.25 : 2.05 };
    const dx = tx - rel.x, dy = ty - rel.y, d = Math.hypot(dx, dy);
    const t1 = d / speed;
    let vz = (.5 * G * t1 * t1 - rel.z) / t1;
    if (type === 'flighted') vz += .4;
    let turn = 0, swing = 0;
    if (type === 'offbreak') turn = -(1.6 + bw.bowl / 60);
    if (type === 'legbreak') turn = (1.6 + bw.bowl / 60);
    if (type === 'flighted') turn = U.chance(.5) ? -1.4 : 1.2;
    if (pace) swing = U.rand(-1, 1) * (.5 + bw.bowl / 120);
    const seam = pace ? U.rand(-.6, .6) : 0;
    // integrate
    const path = []; let s = { x: rel.x, y: rel.y, z: rel.z, vx: dx / t1, vy: dy / t1, vz }, t = 0, bounced = false, bounceAt = null;
    const step = 1 / 240; let atPop = null, atHit = null, atStump = null;
    while (s.y < 17 && t < 3) {
      if (!bounced) s.vx += swing * step;
      s.vz -= G * step; s.x += s.vx * step; s.y += s.vy * step; s.z += s.vz * step;
      if (s.z <= 0 && !bounced) {
        bounced = true; bounceAt = { x: s.x, y: s.y, t };
        s.z = 0; const e = pace ? (type === 'bouncer' || type === 'short' ? .62 : .5) : .44;
        s.vz = -s.vz * e; s.vx = s.vx * (pace ? .9 : .82) + turn + seam; s.vy *= pace ? .88 : .8;
      } else if (s.z <= 0 && bounced) { s.z = 0; s.vz = -s.vz * .35; }
      t += step;
      path.push({ t, x: s.x, y: s.y, z: s.z, b: bounced });
      if (!atPop && s.y >= POP_Y) atPop = { t, x: s.x, z: s.z, b: bounced };
      if (!atHit && s.y >= HIT_Y) atHit = { t, x: s.x, z: s.z, b: bounced, vx: s.vx, vy: s.vy };
      if (!atStump && s.y >= STUMP_Y) atStump = { t, x: s.x, z: s.z };
    }
    const inn = Rules.inn(this.m);
    const bouncer = bounced && atPop && atPop.z > 1.25;
    let call = null;
    if (opts.overstep) call = 'nb';
    else if (!bounceAt || bounceAt.y > POP_Y) { if (atPop && atPop.z > Rules.WAIST) call = 'nb'; } // beamer
    if (!call && bouncer && atPop.z > Rules.HEAD_HEIGHT) call = 'wd';
    else if (!call && bouncer && inn.bouncers >= Rules.BOUNCERS_PER_OVER) call = 'nb';
    const wideX = atPop ? (atPop.x > Rules.WIDE_X || atPop.x < -.78) : false;
    return { type, bw, speed, kph: Math.round(speed * 3.6), path, bounceAt, atPop, atHit, atStump, call, wideX, bouncer, t: 0, tArrive: atHit ? atHit.t : 1, target: { x: tx, y: ty } };
  },

  // ---------- User bowling input ----------
  userBowl(type, tx, ty, meter) {
    const bw = Rules.bowler(Rules.inn(this.m)).p;
    // meter 0..1 : sweet spot .42-.62 accurate; >.9 extra pace but overstep risk
    const err = Math.max(0, Math.abs(meter - .52) - .1) * 2.4 * (1.25 - bw.bowl / 160);
    const ex = U.rand(-1, 1) * (.06 + err * .6), ey = U.rand(-1, 1) * (.15 + err * 1.6);
    const overstep = meter > .9 ? U.chance(.55) : U.chance(.008);
    const paceBoost = meter > .86 ? .05 : 0;
    this.del = this.buildDelivery(bw, type, tx + ex, ty + ey, { overstep, paceBoost });
    this.del.quality = U.clamp(1 - err * 1.4, 0, 1);
    this.phase = 'runup'; this.phaseT = 0;
  },

  // ---------- User batting input: Stick-Cricket style ----------
  // press = swing (timing decides direction). Swipe up while pressing = lofted, swipe down = defend.
  userPress() {
    if (this.phase !== 'flight' || this.shot || !this.userBatting() || this.auto) return false;
    const d = this.del; const lag = .025 * this.diff().ts; // touch latency compensation
    this.registerShot(-Math.PI / 2, .6, false);
    this.shot.tShot = d.t - lag; this.shot.tap = true; this.shot.pending = true; this.shot.pressT = performance.now();
    return true;
  },
  userGesture(dxScreen, dyScreen, final) {
    const sh = this.shot; if (!sh || !sh.pending) return;
    if (dyScreen < -32) { sh.loft = true; sh.block = false; sh.power = .93; }
    else if (dyScreen > 32) { sh.block = true; sh.loft = false; sh.power = .2; }
    if (Math.abs(dxScreen) > 30) { const w = R.vecToWorld(dxScreen, 0); sh.nudge = U.clamp(w.x / Math.max(1, Math.abs(w.x)) * .5, -.5, .5); }
    if (final || performance.now() - sh.pressT > 150) sh.pending = false;
  },
  // ---------- (legacy swipe API kept for keyboard/tests) ----------
  // angle: world direction of swipe; power 0..1 ; block when tap
  userShot(angle, power, isTap) {
    if (this.phase !== 'flight' || this.shot) return;
    if (!this.userBatting() && !this.auto) return;
    this.registerShot(angle, power, isTap);
  },
  registerShot(angle, power, isTap) {
    const d = this.del; if (!d) return;
    this.shot = { tShot: d.t, angle, power: U.clamp(power, 0, 1), block: !!isTap, loft: !isTap && power > .62, swingT: 0 };
    // charging down to spinners on big lofted swipes
    if (this.shot.loft && d.bw.bowlType === 'spin' && power > .85) this.shot.charge = true;
  },
  planAIShot() {
    const d = this.del, inn = Rules.inn(this.m), st = Rules.striker(inn).p, bw = d.bw;
    const hit = d.atHit; if (!hit) return;
    const len = d.bounceAt ? d.bounceAt.y : 9.5;
    // situation-based aggression
    const rrr = Rules.rrr(inn);
    let agg = .42 + (inn.balls / (inn.oversLimit * 6)) * .4 + (rrr != null ? U.clamp((rrr - 7.5) * .06, -.2, .45) : 0) - (inn.wkts >= inn.maxWkts - 2 ? .2 : 0);
    if (inn.freeHit) agg += .5;
    agg = U.clamp(agg, .1, 1);
    // leave wide-ish deliveries sometimes
    if (hit.x > .75 && !d.wideX && Math.random() < .35 - agg * .2) { this.aiPlan = null; return; }
    if (d.wideX && Math.random() < .7) { this.aiPlan = null; return; }
    let angle, power = U.rand(.2, .45) + agg * .4;
    if (len < 1.8) angle = hit.x > .35 ? U.rand(-.25, .2) : U.rand(-2.9, -2.3); // cut or pull
    else if (len > 7.8) { angle = U.rand(-1.9, -1.2); power *= .6; } // dig out yorker
    else if (len > 5) angle = hit.x > .3 ? U.rand(-1.3, -.6) : U.rand(-2.3, -1.5); // drives
    else angle = hit.x > .35 ? U.rand(-1.0, -.3) : U.rand(-2.6, -1.4);
    const block = Math.random() < .26 - agg * .22 && !inn.freeHit;
    // timing error
    const diff = this.diff();
    let sigma = (.05 + (bw.bowl - st.bat) / 1200) * diff.aiErr;
    if (d.quality != null) sigma *= .75 + d.quality * .55;
    if (d.type === 'yorker' && len > 7.6) sigma *= 1.35;
    if (d.type === 'slower') sigma *= 1.25;
    if (d.type === 'arm') sigma *= 1.15;
    sigma = U.clamp(sigma, .025, .12);
    const gauss = Math.sqrt(-2 * Math.log(Math.random() + 1e-9)) * Math.cos(2 * Math.PI * Math.random());
    const e = gauss * sigma * 1.5;
    this.aiPlan = { at: d.tArrive + e, angle, power: block ? .2 : U.clamp(power, .2, 1), block };
  },

  slowmo(dur, f) { this.slow = { t: dur, f }; },
  // ---------- Update ----------
  update(dt) {
    if (!this.active) return;
    this._dt = dt;
    FX.update(dt); R.shake *= Math.pow(.02, dt); if (R.cheer > 0) R.cheer -= dt;
    if (this.sigT > 0 && (this.sigT -= dt) <= 0) this.umps[0].signal = null;
    if (this.slow) { this.slow.t -= dt; dt *= this.slow.f; if (this.slow.t <= 0) this.slow = null; }
    this.t += dt;
    [this.bat1, this.bat2, this.keeper, this.bowlerEnt, ...this.fielders].forEach(p => p.t += dt);
    this.popups = this.popups.filter(p => (p.life -= dt) > 0);
    switch (this.phase) {
      case 'setup': this.phaseT += dt; break;
      case 'runup': this.updRunup(dt); break;
      case 'flight': this.updFlight(dt * this.diff().ts); break;
      case 'inplay': this.updInplay(dt * .9); break;
      case 'dead': this.phaseT += dt; if (this.phaseT > this.deadWait || (this.skipReq && this.phaseT > .45)) { this.skipReq = false; this.finishBall(); } break;
    }
    this.updCamera(dt);
  },
  updRunup(dt) {
    const b = this.bowlerEnt, d = this.del;
    const spin = d.bw.bowlType === 'spin';
    const sp = spin ? 6 : 9.5;
    this.phaseT += dt;
    if (this.phaseT < .35) { b.pose = 'stand'; return; }
    b.pose = 'run'; b.y += sp * dt; b.x = U.lerp(b.x, .55, dt * 3);
    if (b.y >= -10.6) {
      b.y = -10.6; b.pose = 'bowl'; b.t = 0;
      this.phase = 'flight'; d.t = 0; this.ball = { x: .32, y: -9.2, z: 2.2, trail: [], white: true };
      if (d.call === 'nb' && this.del.path) this.popup('NO BALL', '#ffd23f', 1.4);
      if (!this.userBatting() || this.auto) this.planAIShot();
      Sfx.whistle && null;
    }
  },
  pathAt(t) {
    const p = this.del.path; if (!p.length) return null;
    if (t <= p[0].t) return p[0];
    const i = Math.min(p.length - 1, Math.floor(t * 240));
    return p[Math.max(0, i)];
  },
  updFlight(dt) {
    const d = this.del, b = this.ball, bw = this.bowlerEnt;
    d.t += dt; if (bw.y < -6) { bw.y += 3 * dt; bw.pose = d.t < .4 ? 'bowl' : 'run'; }
    // AI batter swing
    if (this.aiPlan && !this.shot && d.t >= this.aiPlan.at - .02) { this.registerShot(this.aiPlan.angle, this.aiPlan.power, this.aiPlan.block); this.aiPlan = null; }
    const s = this.pathAt(d.t); if (!s) return;
    const wasBounced = b.b; Object.assign(b, { x: s.x, y: s.y, z: s.z, b: s.b });
    if (s.b && !wasBounced) Sfx.bounce();
    b.trail.push({ x: b.x, y: b.y, z: b.z }); if (b.trail.length > 14) b.trail.shift();
    // backlift as the ball approaches (anticipation)
    if (!this.shot) this.bat1.backlift = U.clamp(1 - (d.tArrive - d.t) / .5, 0, 1) * .8;
    else this.bat1.backlift = 0;
    // bat swing animation
    if (this.shot) { this.shot.swingT += dt; this.bat1.bat = 2.2 - Math.min(1, this.shot.swingT / .16) * 3.4; if (this.shot.charge) this.bat1.y = U.lerp(this.bat1.y, 7.6, dt * 6); }
    // contact window
    if (d.t >= d.tArrive && !this.resolved) {
      const lateWindow = .17 * this.diff().win;
      if (this.shot && this.shot.pending && performance.now() - this.shot.pressT > 150) this.shot.pending = false;
      if (this.shot && !this.shot.pending) { this.resolveShot(); return; }
      if (this.shot) return;
      if (d.t > d.tArrive + lateWindow * .5 && !this.userBatting()) { this.resolved = 'miss'; }
      else if (d.t > d.tArrive + lateWindow) { this.resolved = 'miss'; }
      if (this.resolved === 'miss') this.checkMissAtBatter();
    }
    if (this.resolved === 'miss') this.updMissed();
  },
  checkMissAtBatter() {
    const d = this.del;
    // pad impact? (right-hander's pads around x -0.45..0.12)
    const h = d.atHit;
    if (h && h.z < .62 && h.x > -.5 && h.x < .14 && !this.shot) {
      this.padHit = true; Sfx.edge();
    }
  },
  updMissed() {
    const d = this.del, b = this.ball;
    // pad hit: ball deflects, LBW decision
    if (this.padHit && !this.padDone) {
      this.padDone = true;
      const st = d.atStump, pitchedLeg = d.bounceAt && d.bounceAt.x < -.16;
      const hitting = st && Math.abs(st.x) < .15 && st.z < .74;
      const umpireRight = Math.random() < .9;
      let out = hitting && !pitchedLeg;
      if (!umpireRight) out = !out && Math.random() < .25;
      this.popup('HOWZAT?', '#fff', 1);
      if (out) return this.endBall({ wicket: 'lbw' }, 1.4, 'LBW!');
      // not out: maybe leg byes
      this.startInplayFromDeflection(U.rand(1.8, 3.6), U.rand(-.4, .4) + (Math.random() < .5 ? .9 : 2.2), 'lb');
      this.popup('NOT OUT', '#9fe870', 1);
      return;
    }
    // bowled?
    if (!this.bowledChecked && b.y >= STUMP_Y) {
      this.bowledChecked = true;
      const st = d.atStump;
      if (st && Math.abs(st.x) < .17 && st.z < .72) { this.stumpsBroken.s = true; Sfx.stumps(); vibrate(60); return this.endBall({ wicket: 'bowled' }, 1.5, 'BOWLED!'); }
    }
    // keeper takes it
    if (b.y >= this.keeper.y - .3) {
      const k = this.keeper;
      k.x = U.lerp(k.x, b.x, .6);
      const reach = Math.abs(b.x - k.x) < 1.6 && b.z < 2.6;
      if (!reach || Math.random() < .02) { // byes!
        this.startInplayFromDeflection(this.ballVelFromPath(), null, 'b'); return;
      }
      Sfx.catch();
      // stumping if the batter charged
      if (this.shot && this.shot.charge && Math.random() < .75) { this.stumpsBroken.s = true; Sfx.stumps(); return this.endBall({ wicket: 'stumped' }, 1.5, 'STUMPED!'); }
      // wide/no-ball calls when untouched
      return this.endBall({}, .9);
    }
  },
  ballVelFromPath() { const p = this.del.path, n = p.length; const a = p[Math.max(0, n - 3)], c = p[n - 1]; return Math.hypot(c.x - a.x, c.y - a.y) / (c.t - a.t || 1) * .5; },
  startInplayFromDeflection(speed, angle, extraType) {
    const b = this.ball;
    const ang = angle != null ? angle : Math.PI / 2 + U.rand(-.5, .5);
    this.startInplay({ vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, vz: .6, extraType, deflect: true });
  },

  // ---------- Shot resolution ----------
  resolveShot() {
    const d = this.del, sh = this.shot, inn = Rules.inn(this.m), st = Rules.striker(inn).p;
    this.resolved = 'hit';
    const e = sh.tShot - d.tArrive; // + late, - early (sim seconds)
    const userBat = this.userBatting() && !this.auto;
    const bat_ = Save.data.shop ? SHOP.bat() : null;
    const win = this.diff().win * (userBat ? .92 * (bat_ ? bat_.timing : 1) * (this.fire ? 1.15 : 1) : 1) * (.8 + st.bat / 250);
    const q = Math.abs(e) / win;
    const h = d.atHit || { x: 0, z: .5 };
    // too far from the ball to reach
    const reachable = h.x < 1.25 && h.x > -1.1 && h.z < 2.0;
    const len = d.bounceAt ? d.bounceAt.y : 9.5;
    const isLateQuality = e > 0;
    let quality, outcome;
    if (!reachable || q > .19) outcome = 'miss';
    else if (q > .11) outcome = isLateQuality ? (h.x > .05 && Math.random() < .55 ? 'edge' : 'miss') : (Math.random() < .5 ? 'leading' : 'miss');
    else { outcome = 'hit'; quality = 1 - q / .11; }
    // yorkers are hard to get under
    if (outcome === 'hit' && len > 7.7 && !sh.block) quality *= .55;
    if (outcome === 'hit' && d.bouncer && sh.loft && quality < .35 && Math.random() < .5) outcome = 'topedge';
    // lofting against a good-length ball is risky; mistimed lofts balloon up
    if (outcome === 'hit' && sh.loft && len > 2 && len < 6.2 && d.bw.bowlType === 'pace') quality *= .88;
    if (outcome === 'hit' && sh.loft && quality < .5 && Math.random() < .45) outcome = 'topedge';
    // hit wicket: playing back to a short ball with poor timing
    if ((outcome !== 'hit' || quality < .3) && len < 2 && !sh.block && Math.random() < .035) {
      this.stumpsBroken.s = true; Sfx.stumps(); return this.endBall({ wicket: 'hitwicket' }, 1.6, 'HIT WICKET!');
    }
    if (window.__dbg) window.__dbg.push({ k: 'shot', bt: d.bw.bowlType, ty: d.type, hx: +h.x.toFixed(2), hz: +h.z.toFixed(2), outcome, q: +(quality || 0).toFixed(2), e: +e.toFixed(3), loft: sh.loft, block: sh.block, len: +len.toFixed(1) });
    if (outcome === 'miss') { this.resolved = 'miss'; this.checkMissAtBatter(); this.popup(e < 0 ? 'TOO EARLY' : 'TOO LATE', '#fff', .8, 'small'); if (userBat) { this.streak = 0; this.fire = false; } return; }
    let ang, v, vz;
    const bat = st.bat / 100;
    if (outcome === 'edge') {
      ang = Math.PI / 2 - U.rand(.15, .75); v = U.rand(14, 24); vz = U.rand(.4, 2.2);
      Sfx.edge(); this.popup('EDGE', '#ffd23f', .8, 'small');
    } else if (outcome === 'leading') {
      ang = U.rand(-2.2, -1.2); v = U.rand(6, 13); vz = U.rand(3, 7); Sfx.edge();
    } else if (outcome === 'topedge') {
      ang = U.rand(-2.6, -.6) + Math.PI * (Math.random() < .5 ? 0 : .9); v = U.rand(6, 12); vz = U.rand(12, 17); Sfx.edge();
    } else {
      ang = sh.tap ? (-Math.PI / 2 + (sh.nudge || 0) + e * 9.5 + U.rand(-.1, .1) * (1 - quality)) : (sh.angle + e * 5.5 + U.rand(-.12, .12) * (1 - quality));
      if (sh.block) { v = 3 + quality * 5 + sh.power * 4; vz = .4; }
      else {
        v = (sh.loft ? (14 + sh.power * 19) * (.3 + .7 * quality) : (18 + sh.power * 24) * (.5 + .5 * quality)) * (.85 + bat * .3) * (userBat ? (bat_ ? bat_.power : 1) * (this.fire ? 1.06 : 1) : 1);
        vz = sh.loft ? (5 + sh.power * 8) * (.45 + .55 * quality) : U.rand(.3, 1.6);
        if (sh.loft && quality > .82 && sh.power > .8) { v *= 1.12; vz *= 1.05; }
      }
      Sfx.bat(.4 + quality * .6); if (quality > .85 && !sh.block) vibrate(25);
      if (userBat && !sh.block) {
        const bp = R.proj(this.bat1.x, this.bat1.y, 1);
        if (quality > .85) {
          this.streak = (this.streak || 0) + 1; this.popup('PERFECT!', '#9fe870', .8, 'mid'); Save.data.stats.perfects = (Save.data.stats.perfects || 0) + 1;
          FX.burst(bp.x, bp.y, 18, { spark: true, colors: ['#fff', '#f5c518', '#9fe870'], vmin: 80, vmax: 260, g: 0, life: .5, size: .8 });
          if (this.streak === 3) { this.fire = true; this.popup('ON FIRE!', '#ff8a3d', 1.4, 'big'); Sfx.crowd(1); }
        } else { this.streak = 0; this.popup(quality > .45 ? 'GOOD' : (e < 0 ? 'EARLY' : 'LATE'), quality > .45 ? '#f5c518' : '#fff', .6, 'small'); }
        if (quality > .6 && sh.loft) this.slowmo(.55, .32);
        R.shake = Math.max(R.shake, quality * 5);
      }
    }
    this.startInplay({ vx: Math.cos(ang) * v, vy: Math.sin(ang) * v, vz, hit: true });
  },

  // ---------- Ball in play: physics + fielding + running ----------
  startInplay(o) {
    const b = this.ball;
    b.vx = o.vx; b.vy = o.vy; b.vz = o.vz; b.z = Math.max(b.z, .5); b.bounced = false; b.trail = [];
    this.phase = 'inplay'; this.phaseT = 0;
    this.inplay = {
      hit: !!o.hit, extraType: o.extraType || null, held: null, thrown: null, chaser: null, backup: null,
      runs: 0, runners: null, boundary: 0, decided: false, wantRun: false, settledT: 0, caught: false, dropped: false, noise: U.rand(-.45, .45),
    };
    // two runners: striker and non-striker
    this.inplay.runners = [
      { ent: this.bat1, from: 1, prog: 0, running: false, safe: true, done: false },
      { ent: this.bat2, from: -1, prog: 0, running: false, safe: true, done: false },
    ];
    this.bat1.pose = 'stand';
    this.assignChasers();
  },
  predictBall(steps = 70, dt = .1) {
    const b = this.ball; const pts = []; let s = { x: b.x, y: b.y, z: b.z, vx: b.vx, vy: b.vy, vz: b.vz, bounced: b.bounced };
    for (let i = 1; i <= steps; i++) { this.stepBall(s, dt); pts.push({ t: i * dt, x: s.x, y: s.y, z: s.z, b: s.bounced }); }
    return pts;
  },
  stepBall(s, dt) {
    const sub = 4, h = dt / sub;
    for (let k = 0; k < sub; k++) {
      if (s.z > 0 || s.vz > 0) {
        s.vz -= G * h; s.x += s.vx * h; s.y += s.vy * h; s.z += s.vz * h;
        const drag = 1 - .06 * h; s.vx *= drag; s.vy *= drag;
        if (s.z <= 0) {
          s.z = 0; s.bounced = true;
          if (s.vz < -2) { s.vz = -s.vz * .32; s.vx *= .7; s.vy *= .7; } else s.vz = 0;
        }
      } else {
        const sp = Math.hypot(s.vx, s.vy); if (sp < .25) { s.vx = s.vy = 0; continue; }
        const nsp = Math.max(0, sp - 6 * h); s.vx *= nsp / sp; s.vy *= nsp / sp; s.x += s.vx * h; s.y += s.vy * h;
      }
    }
  },
  assignChasers() {
    const pred = this.predictBall();
    let best = null, second = null;
    for (const f of this.allFielders) {
      if (f.role === 'bowler' && this.ball.y < -6) continue;
      const react = f.role === 'keeper' ? .2 : .45;
      let hit = null;
      for (const p of pred) {
        if (Math.hypot(p.x, p.y) > BOUNDARY_R + .5) break;
        const need = U.dist(f.x, f.y, p.x, p.y) / f.speed + react;
        const reachH = p.z < 2.6;
        if (need <= p.t && reachH) { hit = { t: p.t, x: p.x, y: p.y, z: p.z, air: !p.b }; break; }
      }
      if (!hit) { const last = pred[pred.length - 1]; const r = Math.hypot(last.x, last.y); const lx = r > BOUNDARY_R - 1 ? last.x * (BOUNDARY_R - 1) / r : last.x, ly = r > BOUNDARY_R - 1 ? last.y * (BOUNDARY_R - 1) / r : last.y; hit = { t: Math.max(last.t, U.dist(f.x, f.y, lx, ly) / f.speed + .45), x: lx, y: ly, z: 0, air: false, late: true }; }
      if (!best || hit.t < best.hit.t) { second = best; best = { f, hit }; } else if (!second || hit.t < second.hit.t) second = { f, hit };
    }
    this.inplay.chaser = best; this.inplay.backup = second;
    this.inplay.pred = pred;
  },
  updInplay(dt) {
    const ip = this.inplay, b = this.ball;
    this.phaseT += dt;
    // --- ball physics (unless held) ---
    if (!ip.held && !ip.thrown) {
      const wasB = b.bounced; this.stepBall(b, dt); if (b.bounced && !wasB) Sfx.bounce();
      b.trail.push({ x: b.x, y: b.y, z: b.z }); if (b.trail.length > 18) b.trail.shift();
      const r = Math.hypot(b.x, b.y);
      if (r >= BOUNDARY_R && !ip.boundary) {
        if (ip.extraType && !ip.hit) { ip.boundary = 4; return this.endBall({ runs: 4, boundary: 4, extraRuns: ip.extraType }, 1.4, ip.extraType === 'lb' ? '4 LEG BYES' : '4 BYES'); }
        ip.boundary = b.bounced ? 4 : 6;
        Sfx.crowd(ip.boundary === 6 ? 1.3 : .8); vibrate(ip.boundary === 6 ? 80 : 40);
        return this.endBall({ runs: ip.boundary, boundary: ip.boundary }, 1.8, ip.boundary === 6 ? 'SIX!' : 'FOUR!');
      }
    }
    // --- thrown ball ---
    if (ip.thrown) {
      const th = ip.thrown; th.t += dt;
      const k = Math.min(1, th.t / th.dur);
      b.x = U.lerp(th.sx, th.tx, k); b.y = U.lerp(th.sy, th.ty, k); b.z = 1.2 + Math.sin(k * Math.PI) * th.arc;
      b.trail.push({ x: b.x, y: b.y, z: b.z }); if (b.trail.length > 18) b.trail.shift();
      if (k >= 1) this.throwArrived();
    }
    // --- fielders ---
    this.updFielders(dt);
    // --- runners ---
    this.updRunners(dt);
    // safety timeout
    if (this.phaseT > 14) this.endBall({ runs: ip.runs }, .6);
  },
  updFielders(dt) {
    const ip = this.inplay, b = this.ball;
    const ch = ip.chaser && ip.chaser.f, bk = ip.backup && ip.backup.f;
    for (const f of this.allFielders) {
      if (f === this.bowlerEnt && ip.thrown && ip.thrown.to === 'ns') { this.moveTo(f, .4, -10.4, dt); continue; }
      if (f === this.keeper && f !== ch && !ip.held?.isKeeper) { if (ip.held || ip.thrown || this.phaseT > .6) this.moveTo(f, .35, 10.6, dt); continue; }
      if (f === ch && !ip.held) {
        // run to intercept: re-target the ball smoothly
        const tgt = this.chaseTarget(f);
        this.moveTo(f, tgt.x, tgt.y, dt, true);
        this.tryGather(f);
      } else if (f === bk && !ip.held) {
        const p = ip.pred[Math.min(ip.pred.length - 1, 25)]; this.moveTo(f, U.lerp(f.hx, p.x, .7), U.lerp(f.hy, p.y, .7), dt * .7);
      } else if (f === this.bowlerEnt) {
        if (this.phaseT > .5) this.moveTo(f, .4, -10.4, dt);
      } else if (f !== ip.held?.f) {
        f.pose = 'crouch'; f.face = Math.atan2(b.y - f.y, b.x - f.x) + Math.PI / 2;
      }
    }
    if (ip.held && !ip.thrown) {
      ip.held.t += dt; const f = ip.held.f; f.pose = 'throw';
      b.x = f.x + .3; b.y = f.y; b.z = 1.2;
      if (ip.held.t > (ip.held.isKeeper ? .15 : .32)) this.decideThrow();
    }
  },
  chaseTarget(f) {
    const ip = this.inplay, b = this.ball;
    // re-predict a few steps ahead each frame to steer
    const pred = this.predictBall(40, .1);
    for (const p of pred) {
      if (Math.hypot(p.x, p.y) > BOUNDARY_R) break;
      if (U.dist(f.x, f.y, p.x, p.y) / f.speed <= p.t && p.z < 2.6) { ip.tPick = p.t; ip.pickPt = p; return p; }
    }
    ip.tPick = 4; ip.pickPt = null;
    return pred.length ? pred[Math.min(pred.length - 1, 12)] : b;
  },
  moveTo(f, x, y, dt, sprint) {
    const d = U.dist(f.x, f.y, x, y);
    if (d < .15) { f.pose = f.role === 'keeper' ? 'keep' : 'stand'; return true; }
    const sp = f.speed * (sprint ? 1 : .85) * dt, k = Math.min(1, sp / d);
    f.face = Math.atan2(y - f.y, x - f.x) + Math.PI / 2;
    f.x += (x - f.x) * k; f.y += (y - f.y) * k; f.pose = 'run';
    return false;
  },
  tryGather(f) {
    const ip = this.inplay, b = this.ball;
    const d = U.dist(f.x, f.y, b.x, b.y);
    const isK = f.role === 'keeper';
    if (!b.bounced && b.z < (isK ? 2.2 : 2.7) && b.z > (isK ? .2 : .35) && d < 1.7 && !ip.dropped && ip.hit) {
      // catch attempt: settled under it, stretching, or full-length dive
      const dive = d > 1.1, stretch = d > .6;
      const pace = Math.hypot(b.vx, b.vy, b.vz);
      let p = (dive ? .3 : stretch ? .58 : .8) + (f.p.field - 70) / 200 - Math.max(0, pace - 18) / 70 + (isK ? .06 : 0);
      if (this.userBowling() && !this.auto) p += .04; // friendly hands for the user's side
      if (this.userBatting() && !this.auto) p -= .02;
      if (Math.random() < U.clamp(p, .2, .97)) {
        f.pose = dive ? 'dive' : 'celebrate';
        Sfx.catch(); vibrate(60);
        return this.endBall({ wicket: 'caught', fielder: f.p.name }, 1.6, 'CAUGHT!');
      }
      ip.dropped = true; f.pose = 'dive'; b.vx *= .3; b.vy *= .3; b.vz = .8; this.popup('DROPPED!', '#ffd23f', 1.1);
      return;
    }
    if (b.z < .9 && d < .85) {
      ip.held = { f, t: 0, isKeeper: f.role === 'keeper' }; b.vx = b.vy = b.vz = 0; Sfx.catch();
    }
  },
  decideThrow() {
    const ip = this.inplay, b = this.ball, f = ip.held.f;
    // which end is most in danger?
    const ends = { s: { x: 0, y: STUMP_Y }, ns: { x: 0, y: -STUMP_Y } };
    let to = 's', bestMargin = 99;
    for (const r of ip.runners) {
      if (!r.running) continue;
      const toEnd = r.from === 1 ? 'ns' : 's';
      const remain = (1 - r.prog) * RUN_LEN / this.runSpeed(r);
      const e = ends[toEnd]; const thr = U.dist(b.x, b.y, e.x, e.y) / this.throwSpeed(f);
      const margin = remain - thr;
      if (margin < bestMargin) { bestMargin = margin; to = toEnd; }
    }
    if (bestMargin === 99) to = (Math.abs(b.y - STUMP_Y) < Math.abs(b.y + STUMP_Y) || b.y > 0) ? 's' : 'ns';
    const e = ends[to];
    const dist = U.dist(b.x, b.y, e.x, e.y);
    if (f.role === 'keeper' && dist < 2 && !this.anyRunning()) { ip.held = null; return this.ballDead(); }
    if (f === this.bowlerEnt && to === 'ns' && dist < 2.5) { ip.thrown = { sx: b.x, sy: b.y, tx: e.x, ty: e.y - .3, t: 0, dur: .12, arc: .1, to, f }; ip.held = null; return; }
    ip.thrown = { sx: b.x, sy: b.y, tx: e.x + U.rand(-.4, .4), ty: e.y + (to === 's' ? .4 : -.4), t: 0, dur: Math.max(.15, dist / this.throwSpeed(f)), arc: Math.min(4, dist / 12), to, f };
    ip.held = null; f.pose = 'throw';
  },
  throwSpeed(f) { return 24 + f.p.field / 10; },
  throwArrived() {
    const ip = this.inplay, th = ip.thrown; ip.thrown = null;
    const endY = th.to === 's' ? STUMP_Y : -STUMP_Y;
    // run out check: any runner heading to this end and not yet home
    for (const r of ip.runners) {
      if (!r.running) continue;
      const toEnd = r.from === 1 ? 'ns' : 's';
      const gather = .12 + (U.dist(th.sx, th.sy, th.tx, th.ty) > 25 ? .22 : 0) + U.rand(0, .12);
      if (toEnd === th.to && r.prog + this.runSpeed(r) * gather / RUN_LEN < 1) {
        const fumble = Math.random() < .1;
        if (!fumble) {
          if (th.to === 's') this.stumpsBroken.s = true; else this.stumpsBroken.ns = true;
          Sfx.stumps(); vibrate(70);
          const outEnt = r.ent; if (window.__dbg) window.__dbg.push({ k: 'ro', ph: +this.phaseT.toFixed(2), prog: +r.prog.toFixed(2), runs: ip.runs, thrower: th.f.role, dist: +U.dist(th.sx, th.sy, th.tx, th.ty).toFixed(1) });
          return this.endBall({ wicket: 'runout', runoutEnt: outEnt, fielder: th.f.p ? th.f.p.name : '' }, 1.7, 'RUN OUT!');
        }
        this.popup('Fumbled!', '#ffd23f', .9, 'small');
      }
    }
    // ball now with keeper / bowler at the stumps
    const recv = th.to === 's' ? this.keeper : this.bowlerEnt;
    this.ball.x = recv.x; this.ball.y = recv.y; this.ball.z = 1;
    ip.held = { f: recv, t: -.2, isKeeper: true };
    if (!this.anyRunning()) this.ballDead();
  },
  anyRunning() { return this.inplay.runners.some(r => r.running); },

  // ---------- Running between wickets ----------
  runSpeed(r) { const inn = Rules.inn(this.m); const p = r.ent === this.bat1 ? Rules.striker(inn).p : Rules.nonStriker(inn).p; return 6.0 + (p.field || 70) / 60; },
  wantAnotherRun() {
    const ip = this.inplay, b = this.ball;
    if (ip.boundary) return false;
    const userCtrl = this.userBatting() && !this.auto && !Save.data.settings.autoRun;
    if (userCtrl) { const w = ip.wantRun; ip.wantRun = false; return w; }
    if (this.userBatting() && !this.auto && ip.wantRun) { ip.wantRun = false; return true; }
    // AI judgement: time until the ball could reach the danger end vs time to complete a run
    const tRun = RUN_LEN / 7.2 + .1;
    let tBall;
    if (ip.held) tBall = (ip.held.isKeeper ? .2 : .4) + Math.min(U.dist(b.x, b.y, 0, STUMP_Y), U.dist(b.x, b.y, 0, -STUMP_Y)) / 30;
    else if (ip.thrown) tBall = (ip.thrown.dur - ip.thrown.t);
    else {
      const ch = ip.chaser; const hp = ip.pickPt || (ch ? ch.hit : { t: 2, x: b.x, y: b.y });
      const tPick = ip.tPick != null ? ip.tPick : Math.max(0, hp.t - this.phaseT);
      const near = Math.min(U.dist(hp.x, hp.y, 0, STUMP_Y), U.dist(hp.x, hp.y, 0, -STUMP_Y));
      tBall = tPick + .5 + near / 30;
      if (!b.bounced && b.z > 1.5 && ip.hit) tBall += .3;
    }
    const inn = Rules.inn(this.m);
    const need = inn.target != null ? inn.target - inn.runs : 99;
    const ballsLeft = Rules.ballsLeft(inn);
    let margin = .2;
    if (need <= ip.runs + 1 && need < 99) margin = -.3;      // winning run: risk it
    if (ballsLeft <= 1 && need < 99) margin = -.5;
    if (this.userBowling() && !this.auto) margin -= .12;     // AI is a bit braver vs user (gives run-out chances)
    if (this.userBatting() && !this.auto) margin -= .15;     // keep the scoreboard ticking for the player
    const go = tBall + ip.noise * .6 > tRun + margin;
    if (go && window.__dbg) window.__dbg.push({ k: 'run', tBall: +tBall.toFixed(2), held: !!ip.held, thrown: !!ip.thrown, chT: ip.chaser ? +ip.chaser.hit.t.toFixed(2) : null, late: ip.chaser && ip.chaser.hit.late, ph: +this.phaseT.toFixed(2), runs: ip.runs });
    return go;
  },
  updRunners(dt) {
    const ip = this.inplay; if (!ip || ip.boundary) return;
    const rs = ip.runners;
    const allSafe = rs.every(r => !r.running);
    if (allSafe) {
      ip.settledT += dt;
      if (ip.settledT > (ip.runs === 0 ? .35 : .15) && !ip.caught) {
        const consider = ip.hit || ip.extraType;
        if (consider && ip.runs < 6 && (!ip.decidedNo || ip.wantRun) && this.wantAnotherRun()) {
          rs.forEach(r => { r.running = true; r.prog = 0; });
          ip.settledT = 0;
        }
      }
      // ball back in hands with no run → dead
      if (ip.held && ip.held.isKeeper && ip.settledT > .5) return this.ballDead();
      if (ip.held && !ip.held.isKeeper && ip.settledT > 1.6 && !this.anyRunning()) { /* fielder will throw */ }
      if (!ip.held && !ip.thrown && Math.hypot(this.ball.vx, this.ball.vy) < .3 && this.phaseT > 6) return this.ballDead();
      return;
    }
    ip.settledT = 0;
    // "No! Go back!" — abort the run early if the ball is coming in too fast
    if (!ip.sentBack && rs[0].running && rs[0].prog < .45) {
      const danger = this.ballArrivalEstimate();
      const remain = (1 - rs[0].prog) * RUN_LEN / 7.2;
      if (danger < remain + .1) { ip.sentBack = true; rs.forEach(r => { r.from = -r.from; r.prog = 1 - r.prog; }); this.popup('NO! GO BACK!', '#fff', .8, 'small'); }
    }
    for (const r of rs) {
      if (!r.running) continue;
      r.prog += this.runSpeed(r) * dt / RUN_LEN;
      const sy = r.from === 1 ? 9.3 : -9.4, ey = -sy;
      const x = r.ent === this.bat1 ? -.6 : .6;
      r.ent.x = x; r.ent.y = U.lerp(sy, ey, U.clamp(r.prog, 0, 1)); r.ent.face = r.from === 1 ? 0 : Math.PI; r.ent.pose = 'run';
      if (r.prog >= 1) { r.prog = 1; r.running = false; r.from = -r.from; r.ent.pose = 'stand'; }
    }
    if (rs.every(r => !r.running)) { if (ip.sentBack) { ip.sentBack = false; ip.decidedNo = true; Sfx.click(); return; } ip.runs++; Sfx.click(); this.popup(String(ip.runs), '#fff', .6, 'small'); }
  },
  ballArrivalEstimate() {
    const ip = this.inplay, b = this.ball;
    const near = (x, y) => Math.min(U.dist(x, y, 0, STUMP_Y), U.dist(x, y, 0, -STUMP_Y));
    if (ip.thrown) return ip.thrown.dur - ip.thrown.t;
    if (ip.held) return Math.max(0, .32 - ip.held.t) + near(b.x, b.y) / 30;
    const pp = ip.pickPt || b;
    return (ip.tPick ?? 2) + .35 + near(pp.x, pp.y) / 30;
  },
  requestRun() { if (this.phase === 'inplay' && this.inplay) { this.inplay.wantRun = true; vibrate(15); } },

  ballDead() {
    const ip = this.inplay; if (!ip || this.phase !== 'inplay') return;
    this.endBall({ runs: ip.runs, extraRuns: ip.extraType }, .7);
  },

  // ---------- End of delivery → record ----------
  endBall(res, wait, bannerText) {
    if (this.phase === 'dead') return;
    const d = this.del, inn = Rules.inn(this.m);
    this.phase = 'dead'; this.phaseT = 0; this.deadWait = wait || 1;
    const ip = this.inplay;
    const runs = res.runs || 0;
    const touched = this.resolved === 'hit';
    // extras decided by the delivery
    let extra = null;
    if (d.call === 'nb') extra = 'nb';
    else if (d.call === 'wd') extra = 'wd';
    else if (d.wideX && !touched && !res.wicket?.startsWith?.('caught')) extra = 'wd';
    if (!extra && res.extraRuns) extra = res.extraRuns; // byes / leg byes
    if (extra === 'wd' && res.extraRuns) { /* byes off a wide are counted as wides */ }
    let wicket = null;
    if (res.wicket) {
      let type = res.wicket, outI = inn.strikerI;
      if (type === 'runout') {
        // which batter? the entity that was run out maps to striker/non-striker at the start of the ball
        outI = res.runoutEnt === this.bat1 ? inn.strikerI : inn.nonStrikerI;
      }
      const invalidOnExtra = (extra === 'wd' && (type === 'lbw' || type === 'bowled' || type === 'caught')) || (extra === 'nb' && type !== 'runout');
      const freeHit = inn.freeHit && type !== 'runout';
      if (invalidOnExtra || freeHit) {
        bannerText = freeHit ? 'FREE HIT — NOT OUT' : (extra === 'nb' ? 'NO BALL — NOT OUT' : bannerText);
        this.stumpsBroken = { s: false, ns: false };
      } else {
        const fielder = type === 'stumped' ? this.keeperP.name : (res.fielder || '');
        wicket = { type, outI, fielder };
        Sfx.crowd(.9);
      }
    }
    // runs completed in a run-out still count
    const outcome = { runs: wicket && wicket.type !== 'runout' ? 0 : runs, extra, boundary: res.boundary || 0, wicket, bouncer: d.bouncer && !(extra === 'wd') };
    if (extra === 'wd' && outcome.boundary) { outcome.boundary = 0; } // 4 wides
    if (bannerText) this.popup(bannerText, wicket ? '#ff5a4e' : (res.boundary === 6 ? '#ffd23f' : '#fff'), wait, 'big');
    else if (extra === 'wd') this.popup('WIDE', '#fff', .9);
    // umpire signal + celebrations
    const sig = wicket ? 'out' : outcome.boundary === 6 ? 'six' : outcome.boundary === 4 ? 'four' : extra === 'wd' ? 'wide' : extra === 'nb' ? 'nb' : (extra === 'b' || extra === 'lb') ? 'bye' : null;
    if (sig) { this.umps[0].signal = sig; this.sigT = 1.8; }
    if (outcome.boundary === 6 && !extra) { R.cheer = 3; R.shake = 9; for (let i = 0; i < 4; i++) setTimeout(() => FX.burst(U.rand(.1, .9) * R.W, R.H * .12, 40, { dir: Math.PI / 2, spread: 1.2, vmin: 100, vmax: 420 }), i * 180); this.slowmo(.4, .5); }
    else if (outcome.boundary === 4) { R.cheer = 1.8; FX.burst(R.W / 2, R.H * .3, 26, { vmin: 120, vmax: 360 }); }
    if (wicket) {
      R.shake = 10; R.cheer = 2;
      const end = (wicket.type === 'runout' && this.stumpsBroken.ns) ? -STUMP_Y : STUMP_Y, sp = R.proj(0, end, .7);
      FX.burst(sp.x, sp.y, 22, { colors: ['#efe2c2', '#d6232a', '#ffffff'], vmin: 120, vmax: 380, size: 1.2 });
      if (this.userBatting() && !this.auto) { this.streak = 0; this.fire = false; }
    }
    this.lastComment = Commentary.line(outcome, this, res);
    if (this.lastComment) UI.comment(this.lastComment);
    // keep celebrating for a moment
    if (wicket) this.allFielders.forEach(f => { if (U.dist(f.x, f.y, 0, 0) < 30) f.pose = 'celebrate'; });
    this.pending = outcome;
  },
  finishBall() {
    const outcome = this.pending; this.pending = null;
    this.resolved = null; this.padHit = false; this.padDone = false; this.bowledChecked = false; this.aiPlan = null;
    const r = Rules.recordBall(this.m, outcome);
    // stats & coins
    if (this.userBatting() || (this.auto && this.m.sides[Rules.inn(this.m).bat].isUser)) {
      if (outcome.boundary === 6) Save.data.stats.sixes++;
      if (outcome.boundary === 4) Save.data.stats.fours++;
      if (!outcome.extra) Save.data.stats.runs += outcome.runs;
    } else if (outcome.wicket && outcome.wicket.type !== 'runout') Save.data.stats.wickets++;
    this.phase = 'between';
    UI.hud();
    if (this.onBall) this.onBall(r);
    if (r.inningsOver) { this.onInnings(); return; }
    if (r.overDone) { UI.overSummary(Rules.inn(this.m), () => this.startBall()); return; }
    this.startBall();
  },

  popup(text, color, life = 1, size = 'mid') { this.popups.push({ text, color, life, max: life, size }); },

  // ---------- Camera ----------
  updCamera(dt) {
    const b = this.ball, v = R.view();
    if (this.phase === 'inplay' && b) {
      const cy = (b.y + 4) / 2, cx = b.x / 2;
      const span = Math.max(16, Math.abs(b.y - 4) + 10, Math.abs(b.x) * 2 * (R.H / R.W) + 10);
      R.setCam(cx, cy, Math.min(R.pitchZoom * 1.1, (R.isIso() ? 1.25 : 1) * R.H / span));
    } else if (this.phase === 'dead' && this.inplay && b) {
      // hold framing
    } else if ((this.phase === 'flight' || this.phase === 'runup') && v !== 'top') {
      // tighter "broadcast" framing that leans towards the striker
      const z = R.pitchZoom * (v === 'stick' ? .92 : 1.22);
      R.setCam(v === 'iso' ? .2 : 0, v === 'stick' ? 3.2 : 2.4, z);
    } else R.setCam(v === 'iso' ? .3 : 0, v === 'iso' ? .6 : v === 'stick' ? 1.5 : 1.5, R.pitchZoom * (v === 'stick' ? .92 : 1));
    R.updateCam(dt);
  },

  // ---------- Draw ----------
  draw() {
    if (S3.ok) return this.draw3D();
    R.time = this.t;
    R.begin();
    R.drawGround(this.m);
    // bowling target marker (user bowling)
    if (this.phase === 'setup' && this.userBowling() && UI.bowlTarget) R.drawMarker(UI.bowlTarget.x, UI.bowlTarget.y, '#ffd23f', .4, .06);
    if (this.del && this.diff().hint && this.userBatting() && this.del.bounceAt && this.phase === 'flight' && this.del.t < this.del.bounceAt.t + .1) R.drawMarker(this.del.bounceAt.x, this.del.bounceAt.y, 'rgba(255,255,255,.7)', .3);
    const people = [...this.fielders, this.keeper, this.bowlerEnt, this.bat1, this.bat2];
    const umps = this.umps || [];
    if (!R.isIso()) {
      R.drawStumps(STUMP_Y, this.stumpsBroken.s); R.drawStumps(-STUMP_Y, this.stumpsBroken.ns);
      people.forEach(p => R.drawShadowOf(p));
      R.drawUmpire(0, -12.4); R.drawUmpire(-26, 9.2);
      people.sort((a, b) => a.y - b.y).forEach(p => R.drawPerson(p));
      if (this.ball) { R.drawTrail(this.ball.trail); R.drawBall(this.ball); }
      R.popWorld(); R.nightOverlay();
    } else {
      [...people, ...umps].forEach(p => R.drawShadowOf(p));
      if (this.ball) R.ballShadow(this.ball);
      R.popWorld();
      R.nightOverlay();
      R.drawStadium(); R.drawBoards(false);
      // where the ball will pitch (briefly) — reading the length is half of batting
      const d = this.del;
      if (d && this.phase === 'flight' && d.bounceAt && this.userBatting() && !this.auto) R.pitchSpot(d.bounceAt.x, d.bounceAt.y, U.clamp(1 - Math.abs(d.t - d.bounceAt.t) * 3, 0, .9));
      // depth-sort everything by projected ground position
      const items = [...people, ...umps].map(p => ({ d: R.proj(p.x, p.y).y, f: () => R.isoPerson(p) }));
      items.push({ d: R.proj(0, STUMP_Y).y, f: () => R.isoStumps(STUMP_Y, this.stumpsBroken.s) });
      items.push({ d: R.proj(0, -STUMP_Y).y, f: () => R.isoStumps(-STUMP_Y, this.stumpsBroken.ns) });
      if (this.ball) { const b = this.ball; items.push({ d: R.proj(b.x, b.y).y + .01, f: () => { R.isoTrail(b.trail, this.fire && this.userBatting()); R.isoBall(b); } }); }
      items.sort((a, b) => a.d - b.d).forEach(i => i.f());
      R.drawBoards(true);
    }
    // timing ring (user batting)
    const d = this.del;
    if (d && d.atHit && this.phase === 'flight' && this.userBatting() && !this.auto && !this.shot) {
      const left = d.tArrive - d.t, win = .11 * this.diff().win * .92 * .9;
      R.timingRing(d.atHit.x, HIT_Y, Math.min(1, d.atHit.z), U.clamp(left / Math.max(.3, d.tArrive * .8), 0, 1), Math.abs(left) < win * .45, Math.abs(left) < win);
    }
    R.end();
    FX.draw();
    this.drawPopups();
  },
  draw3D() {
    S3.frame(this, Math.min(.05, this._dt || 1 / 60));
    const g = R.ctx; g.setTransform(R.dpr, 0, 0, R.dpr, 0, 0); g.clearRect(0, 0, R.W, R.H);
    // timing ring around the contact point (user batting)
    const d = this.del;
    if (d && d.atHit && this.phase === 'flight' && this.userBatting() && !this.auto && !this.shot) {
      const left = d.tArrive - d.t, win = .11 * this.diff().win * .92 * .9;
      const P = S3.project(d.atHit.x, HIT_Y, Math.max(.3, Math.min(1.2, d.atHit.z)));
      const prog = U.clamp(left / Math.max(.3, d.tArrive * .8), 0, 1);
      const perfect = Math.abs(left) < win * .45, good = Math.abs(left) < win;
      const r = 16 + prog * 120;
      g.lineWidth = 5; g.strokeStyle = perfect ? 'rgba(159,232,112,.95)' : good ? 'rgba(245,197,24,.95)' : 'rgba(255,255,255,.75)';
      g.beginPath(); g.arc(P.x, P.y, r, 0, Math.PI * 2); g.stroke();
      g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.arc(P.x, P.y, 16, 0, Math.PI * 2); g.stroke();
    }
    FX.draw();
    this.drawPopups();
  },
  drawPopups() {
    const g = R.ctx; g.save(); g.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);
    let y = R.H * .3;
    for (const p of this.popups) {
      const k = p.life / p.max, s = p.size === 'big' ? 46 : p.size === 'small' ? 20 : 30;
      const sc = p.size === 'big' ? 1 + (1 - Math.min(1, (p.max - p.life) * 5)) * .5 : 1;
      g.globalAlpha = Math.min(1, k * 3);
      g.font = `900 ${s * sc}px Roboto, "Segoe UI", system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 6; g.strokeStyle = 'rgba(10,25,50,.55)'; g.strokeText(p.text, R.W / 2, y); g.fillStyle = p.color; g.fillText(p.text, R.W / 2, y);
      y += s * 1.2;
    }
    g.restore();
  },
};
