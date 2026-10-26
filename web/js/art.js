'use strict';
// ---------- Phase 5 art: chibi characters, 3D stadium, boards, floodlights, particles, timing ring ----------
const BRANDS = [
  { t: 'FRONTPAGE STUDIOS', bg: '#f5c518', fg: '#0f1d33' },
  { t: 'OVERHEAD', bg: '#0f1d33', fg: '#ffffff' },
  { t: 'ANTARAGA DESIGNS', bg: '#e8443a', fg: '#ffffff' },
  { t: 'SIX HIT ZONE', bg: '#2f66a3', fg: '#ffffff' },
  { t: 'RAJKOT', bg: '#7fc25a', fg: '#0f1d33' },
];

Object.assign(R, {
  shake: 0, night: false, cheer: 0,

  // deterministic crowd so it doesn't flicker
  initStadium() {
    if (this.crowd) return;
    const segs = 96, crowd = [];
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const cols = ['#f5c518', '#ffffff', '#e84a3a', '#f7a8c4', '#1b1b1b', '#7fd1ae', '#ffd8a8', '#3b82f6', '#ff8a3d', '#b5121b'];
    for (let s = 0; s < segs; s++) for (let t = 0; t < 5; t++) for (let i = 0; i < 4; i++) {
      if (rnd() < .18) continue;
      crowd.push({ s: s + rnd(), t: t + .25 + rnd() * .5, c: cols[Math.floor(rnd() * cols.length)], ph: rnd() * 6.28 });
    }
    this.crowd = crowd; this.segs = segs;
  },
  standPt(a, tier, R1 = BOUNDARY_R + 6) { // tier 0..5 → radius & height
    const r = R1 + tier * 4.2, h = tier * 3.1;
    return this.proj(Math.cos(a) * r, Math.sin(a) * r, h);
  },
  isFar(a) { const p = this.proj(Math.cos(a) * BOUNDARY_R, Math.sin(a) * BOUNDARY_R), c = this.proj(0, 0); return p.y < c.y + 40; },
  drawStadium() {
    if (!this.isIso()) return;
    this.initStadium();
    const g = this.ctx, n = this.segs, k = this.cam.z;
    // concourse wall + stand tiers (far side only — the near side is a cut-away like a dollhouse)
    for (let s = 0; s < n; s++) {
      const a0 = s / n * Math.PI * 2, a1 = (s + 1) / n * Math.PI * 2;
      if (!this.isFar((a0 + a1) / 2)) continue;
      for (let t = 0; t < 5; t++) {
        const p1 = this.standPt(a0, t), p2 = this.standPt(a1, t), p3 = this.standPt(a1, t + 1), p4 = this.standPt(a0, t + 1);
        g.fillStyle = this.night ? (t % 2 ? '#14284a' : '#18305a') : (t % 2 ? '#2a5a92' : '#2f66a3');
        g.beginPath(); g.moveTo(p1.x, p1.y); g.lineTo(p2.x, p2.y); g.lineTo(p3.x, p3.y); g.lineTo(p4.x, p4.y); g.closePath(); g.fill();
      }
      // roof edge
      const r1 = this.standPt(a0, 5), r2 = this.standPt(a1, 5), r3 = this.standPt(a1, 5.6), r4 = this.standPt(a0, 5.6);
      g.fillStyle = this.night ? '#0b1730' : '#1d3f6b'; g.beginPath(); g.moveTo(r1.x, r1.y); g.lineTo(r2.x, r2.y); g.lineTo(r3.x, r3.y); g.lineTo(r4.x, r4.y); g.closePath(); g.fill();
    }
    // crowd
    const sz = Math.max(1.2, k * .55), jump = this.cheer > 0;
    for (const c of this.crowd) {
      const a = c.s / n * Math.PI * 2; if (!this.isFar(a)) continue;
      const p = this.standPt(a, c.t);
      const hop = jump ? Math.max(0, Math.sin(this.time * 14 + c.ph)) * sz * 1.4 : Math.sin(this.time * 2 + c.ph) * sz * .12;
      g.fillStyle = c.c; g.fillRect(p.x - sz / 2, p.y - sz - hop, sz, sz * 1.15);
      if (jump && (c.ph * 10 | 0) % 4 === 0) { g.fillRect(p.x - sz * .9, p.y - sz * 1.9 - hop, sz * .35, sz * .9); } // waving arm
    }
    // floodlight towers (night & day)
    [-.75, -.25, .25, .75].forEach(f => {
      const a = Math.PI * 1.5 + f * Math.PI * .9; if (!this.isFar(a)) return;
      const r = BOUNDARY_R + 30, b0 = this.proj(Math.cos(a) * r, Math.sin(a) * r, 0), top = this.proj(Math.cos(a) * r, Math.sin(a) * r, 42);
      g.strokeStyle = '#2b3b55'; g.lineWidth = Math.max(2, k * .5); g.beginPath(); g.moveTo(b0.x, b0.y); g.lineTo(top.x, top.y); g.stroke();
      const w = k * 4, h = k * 2.4;
      g.fillStyle = '#2b3b55'; g.fillRect(top.x - w / 2, top.y - h, w, h);
      g.fillStyle = this.night ? '#fffbe0' : '#e9eef5';
      for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) g.fillRect(top.x - w / 2 + w * (.08 + i * .23), top.y - h + h * (.12 + j * .45), w * .17, h * .32);
      if (this.night) { const gr = g.createRadialGradient(top.x, top.y - h / 2, 0, top.x, top.y - h / 2, k * 18); gr.addColorStop(0, 'rgba(255,250,220,.55)'); gr.addColorStop(1, 'rgba(255,250,220,0)'); g.fillStyle = gr; g.fillRect(top.x - k * 18, top.y - k * 18, k * 36, k * 36); }
    });
  },
  // LED advertising boards just outside the rope; near = draw boards on the camera side (after players)
  drawBoards(near) {
    if (!this.isIso()) return;
    const g = this.ctx, n = 60, r = BOUNDARY_R + 2, k = this.cam.z;
    for (let s = 0; s < n; s++) {
      const a0 = s / n * Math.PI * 2, a1 = (s + .92) / n * Math.PI * 2, am = (a0 + a1) / 2;
      if (this.isFar(am) === near) continue;
      const b = BRANDS[Math.floor(s / 3) % BRANDS.length];
      const p1 = this.proj(Math.cos(a0) * r, Math.sin(a0) * r, 0), p2 = this.proj(Math.cos(a1) * r, Math.sin(a1) * r, 0);
      const p3 = this.proj(Math.cos(a1) * r, Math.sin(a1) * r, 1), p4 = this.proj(Math.cos(a0) * r, Math.sin(a0) * r, 1);
      const flash = this.cheer > 0 && (Math.floor(this.time * 8) + s) % 2;
      g.fillStyle = flash ? '#ffffff' : b.bg; g.beginPath(); g.moveTo(p1.x, p1.y); g.lineTo(p2.x, p2.y); g.lineTo(p3.x, p3.y); g.lineTo(p4.x, p4.y); g.closePath(); g.fill();
      const len = Math.hypot(p2.x - p1.x, p2.y - p1.y), hgt = Math.abs(p4.y - p1.y);
      if (s % 3 === 1 && len > 40 && hgt > 7) {
        g.save(); g.translate((p1.x + p3.x) / 2, (p1.y + p3.y) / 2); g.rotate(Math.atan2(p2.y - p1.y, p2.x - p1.x));
        g.fillStyle = flash ? '#0f1d33' : b.fg; g.font = `900 ${Math.min(hgt * .7, 22)}px Roboto, system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(b.t, 0, 0); g.restore();
      }
    }
  },
  nightOverlay() { if (!this.night) return; const g = this.ctx; g.save(); g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); g.globalCompositeOperation = 'multiply'; g.fillStyle = 'rgba(70,90,150,.55)'; g.fillRect(0, 0, this.W, this.H); g.restore(); },

  // ---------- Chibi illustrated characters ----------
  skinShade(c, a) { return shade(c, a); },
  limb2(ax, ay, bx, by, cx, cy, w1, w2, col) { this.limb(ax, ay, bx, by, w1, col); this.limb(bx, by, cx, cy, w2, col); },
  isoPerson(p) {
    const g = this.ctx, k = (this.figScale ? this.figScale(p.x, p.y) : this.cam.z * this.ISO.zh) * 1.12;
    if (k < 2.2) return this.isoDot(p, k);
    const P = this.proj(p.x, p.y, 0);
    const fw = this.screenDir(Math.sin(p.face || 0), -Math.cos(p.face || 0), [p.x, p.y]);
    const side = fw.x >= 0 ? 1 : -1, toCam = fw.y > -.2;
    const t = p.t || 0, kit = p.kit, skin = p.skin || '#c48a5c', pose = p.pose || 'stand';
    const bob = (pose === 'stand' || pose === 'bat' || pose === 'crouch' || pose === 'keep') ? Math.sin(t * 3 + (p.x || 0)) * .012 * k : 0;
    const crouch = pose === 'keep' ? .66 : pose === 'crouch' ? .84 : pose === 'bat' ? .9 : 1;
    const stride = pose === 'run' ? Math.sin(t * 15) : pose === 'bowl' ? Math.sin(t * 10) * .7 : 0;
    g.save(); g.translate(P.x, P.y + bob);
    if (pose === 'dive') { g.translate(0, -.25 * k); g.rotate(side * 1.3); }
    const hipY = -.88 * k * crouch, shY = hipY - .52 * k, headY = shY - .25 * k;
    const lean = ((pose === 'run' ? .14 : pose === 'keep' ? .1 : pose === 'crouch' || pose === 'bat' ? .07 : 0) * side) * k;
    // ---- legs ----
    const legCol = p.pads ? '#f7f5ef' : kit.trouser, shoe = '#f4f4f0';
    const feet = [
      { x: -.11 * k + fw.x * stride * .3 * k, y: fw.y * stride * .1 * k, s: -1 },
      { x: .11 * k - fw.x * stride * .3 * k, y: -fw.y * stride * .1 * k, s: 1 },
    ];
    if (pose === 'bat' || pose === 'keep') { feet[0].x = -.17 * k; feet[1].x = .17 * k; }
    feet.forEach(f => {
      const hx = f.s * .1 * k + lean * .3, kneeOut = (pose === 'keep' ? .2 : pose === 'bat' || pose === 'crouch' ? .06 : 0) * f.s * k;
      const kx = (hx + f.x) / 2 + kneeOut + (pose === 'run' ? side * .06 * k : 0), ky = (hipY + f.y) / 2;
      this.limb2(hx, hipY, kx, ky, f.x, f.y - .06 * k, .2 * k, .16 * k, legCol);
      if (p.pads) { // pad ribs + knee roll
        g.strokeStyle = 'rgba(0,0,0,.13)'; g.lineWidth = Math.max(1, .012 * k);
        for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(kx + i * .04 * k, ky); g.lineTo(f.x + i * .04 * k, f.y - .08 * k); g.stroke(); }
        g.fillStyle = '#e9e6dc'; g.beginPath(); g.ellipse(kx, ky - .02 * k, .1 * k, .055 * k, 0, 0, Math.PI * 2); g.fill();
      } else { g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(f.x - .02 * k, ky, .04 * k, f.y - ky - .08 * k); }
      // shoe
      g.fillStyle = '#26303e'; g.beginPath(); g.ellipse(f.x + side * .05 * k, f.y - .015 * k, .13 * k, .06 * k, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = shoe; g.beginPath(); g.ellipse(f.x + side * .045 * k, f.y - .04 * k, .12 * k, .05 * k, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = kit.stripe || kit.shirt; g.fillRect(f.x - .02 * k, f.y - .065 * k, .06 * k, .02 * k);
    });
    // ---- arm targets per pose (hands) ----
    const shL = { x: -.25 * k + lean, y: shY + .05 * k }, shR = { x: .25 * k + lean, y: shY + .05 * k };
    let hL = { x: shL.x - .06 * k, y: shY + .44 * k }, hR = { x: shR.x + .06 * k, y: shY + .44 * k };
    if (pose === 'run') { hL = { x: shL.x + fw.x * stride * .28 * k, y: shY + .36 * k }; hR = { x: shR.x - fw.x * stride * .28 * k, y: shY + .36 * k }; }
    if (pose === 'crouch') { hL = { x: shL.x + side * .16 * k, y: hipY + .02 * k }; hR = { x: shR.x + side * .16 * k, y: hipY + .02 * k }; }
    if (pose === 'keep') { hL = { x: side * .26 * k - .07 * k, y: hipY + .14 * k }; hR = { x: side * .26 * k + .07 * k, y: hipY + .14 * k }; }
    if (pose === 'celebrate') { const w = Math.sin(t * 12) * .08 * k; hL = { x: shL.x - .18 * k, y: shY - .48 * k + w }; hR = { x: shR.x + .18 * k, y: shY - .48 * k - w }; }
    if (pose === 'bowl') { const a = t * 11; hR = { x: shR.x + Math.cos(a) * side * .55 * k, y: shY - Math.sin(a) * .55 * k }; hL = { x: shL.x + side * .32 * k, y: shY - .3 * k }; }
    if (pose === 'throw') { hR = { x: shR.x - side * .38 * k, y: shY - .38 * k }; hL = { x: shL.x + side * .36 * k, y: shY + .05 * k }; }
    if (pose === 'dive') { hL = { x: shL.x + side * .12 * k, y: shY - .5 * k }; hR = { x: shR.x + side * .12 * k, y: shY - .5 * k }; }
    // umpire signals
    if (p.signal === 'six') { hL = { x: shL.x - .05 * k, y: shY - .55 * k }; hR = { x: shR.x + .05 * k, y: shY - .55 * k }; }
    if (p.signal === 'out') { hR = { x: shR.x + .04 * k, y: shY - .6 * k }; }
    if (p.signal === 'four') { const w = Math.sin(t * 9) * .25 * k; hR = { x: shR.x + w, y: shY + .12 * k }; }
    if (p.signal === 'wide') { hL = { x: shL.x - .5 * k, y: shY }; hR = { x: shR.x + .5 * k, y: shY }; }
    if (p.signal === 'nb') { hR = { x: shR.x + .52 * k, y: shY }; }
    if (p.signal === 'bye') { hR = { x: shR.x + .1 * k, y: shY - .55 * k }; }
    // ---- bat ----
    let batEnd = null, batBase = null;
    if (p.holdsBat) {
      const hx = side * .14 * k + lean, hy = hipY - .02 * k;
      hL = { x: hx - .035 * k, y: hy }; hR = { x: hx + .035 * k, y: hy - .07 * k };
      const sp = U.clamp((2.2 - (p.bat ?? 2.2)) / 3.4, 0, 1);
      const a0 = Math.PI / 2 + side * .45, aMid = Math.atan2(fw.y * .6, fw.x), a2 = -Math.PI / 2 - side * .8;
      const ang = sp < .5 ? U.lerp(a0, aMid, sp * 2) : U.lerp(aMid, a2, (sp - .5) * 2);
      batBase = { x: hx, y: hy };
      if (pose === 'run' || pose === 'stand') batEnd = { x: hx + side * .32 * k, y: hy + .5 * k };
      else batEnd = { x: hx + Math.cos(ang) * .86 * k, y: hy + Math.sin(ang) * .86 * k };
      if (sp > 0) { const lift = Math.sin(sp * Math.PI) * .22 * k; hL.y -= lift; hR.y -= lift; batBase.y -= lift; }
      if (pose === 'bat' && p.backlift) { const bl = p.backlift * .35 * k; hL.y -= bl; hR.y -= bl; batBase.y -= bl; batEnd = { x: hx - side * .3 * k * p.backlift + side * .2 * k, y: hy - bl + .5 * k - p.backlift * .9 * k }; }
    }
    const armW = .12 * k;
    const backArm = () => { this.limb(shL.x, shL.y, U.lerp(shL.x, hL.x, .45), U.lerp(shL.y, hL.y, .45), armW * 1.3, shade(kit.shirt, -18)); this.limb(U.lerp(shL.x, hL.x, .45), U.lerp(shL.y, hL.y, .45), hL.x, hL.y, armW, shade(skin, -12)); };
    const frontArm = () => { this.limb(U.lerp(shR.x, hR.x, .45), U.lerp(shR.y, hR.y, .45), hR.x, hR.y, armW, skin); this.limb(shR.x, shR.y, U.lerp(shR.x, hR.x, .45), U.lerp(shR.y, hR.y, .45), armW * 1.32, kit.shirt); };
    backArm();
    // ---- torso (rounded jersey) ----
    const tw = .28 * k;
    g.fillStyle = kit.trouser; g.beginPath(); g.ellipse(lean * .5, hipY + .02 * k, tw * .78, .1 * k, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = kit.shirt; g.beginPath();
    g.moveTo(-tw + lean, shY + .06 * k);
    g.quadraticCurveTo(-tw + lean, shY - .05 * k, -tw * .55 + lean, shY - .05 * k);
    g.lineTo(tw * .55 + lean, shY - .05 * k);
    g.quadraticCurveTo(tw + lean, shY - .05 * k, tw + lean, shY + .06 * k);
    g.lineTo(tw * .82 + lean * .4, hipY); g.quadraticCurveTo(lean * .4, hipY + .08 * k, -tw * .82 + lean * .4, hipY); g.closePath(); g.fill();
    // shade right side, highlight left shoulder
    g.save(); g.clip();
    g.fillStyle = 'rgba(0,0,0,.17)'; g.fillRect(lean + tw * .25, shY - .1 * k, tw, hipY - shY + .2 * k);
    g.fillStyle = 'rgba(255,255,255,.16)'; g.beginPath(); g.ellipse(-tw * .5 + lean, shY + .08 * k, tw * .35, .1 * k, -.4, 0, Math.PI * 2); g.fill();
    if (kit.stripe) { g.fillStyle = kit.stripe; g.fillRect(-tw * 1.1 + lean, shY + .2 * k, tw * 2.2, .055 * k); }
    g.restore();
    if (toCam) { // collar V
      g.fillStyle = kit.stripe || '#fff'; g.beginPath(); g.moveTo(lean - .09 * k, shY - .04 * k); g.lineTo(lean, shY + .1 * k); g.lineTo(lean + .09 * k, shY - .04 * k); g.lineTo(lean + .05 * k, shY - .04 * k); g.lineTo(lean, shY + .04 * k); g.lineTo(lean - .05 * k, shY - .04 * k); g.closePath(); g.fill();
    } else if (p.num != null && k > 9) { // shirt number on the back
      g.fillStyle = kit.stripe || '#fff'; g.font = `900 ${.22 * k}px Roboto, system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(String(p.num), lean, (shY + hipY) / 2 + .02 * k);
    }
    // ---- bat (between body and front arm) ----
    if (batEnd) {
      const gx = U.lerp(batBase.x, batEnd.x, .26), gy = U.lerp(batBase.y, batEnd.y, .26);
      this.limb(batBase.x, batBase.y, gx, gy, .055 * k, '#20242c');
      this.limb(gx, gy, batEnd.x, batEnd.y, .135 * k, p.batColor || '#ecd29c');
      this.limb(gx, gy, batEnd.x, batEnd.y, .045 * k, 'rgba(0,0,0,.13)');
      if (p.fire) { g.globalCompositeOperation = 'lighter'; this.limb(gx, gy, batEnd.x, batEnd.y, .26 * k, 'rgba(255,120,30,.35)'); g.globalCompositeOperation = 'source-over'; }
    }
    frontArm();
    // hands / gloves
    const glove = p.gloves ? (p.role === 'keeper' ? '#f2f2ee' : '#fafaf6') : skin;
    [hL, hR].forEach(h => { g.fillStyle = glove; g.beginPath(); g.arc(h.x, h.y, (p.gloves ? .075 : .055) * k, 0, Math.PI * 2); g.fill(); });
    // ---- head ----
    const hx0 = lean * 1.25 + side * .02 * k, hr = .155 * k;
    g.fillStyle = shade(skin, -15); g.fillRect(hx0 - .05 * k, headY + .1 * k, .1 * k, .12 * k);
    g.fillStyle = skin; g.beginPath(); g.arc(hx0, headY, hr, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(0,0,0,.08)'; g.beginPath(); g.arc(hx0 + .05 * k, headY + .03 * k, hr * .85, -.6, 1.6); g.fill();
    if (toCam && !p.helmet) { // face: eyes, cheek
      const ex = hx0 + side * .07 * k;
      g.fillStyle = '#1b1410'; g.beginPath(); g.arc(ex - .05 * k, headY + .015 * k, .022 * k, 0, Math.PI * 2); g.arc(ex + .05 * k, headY + .015 * k, .022 * k, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(232,90,90,.25)'; g.beginPath(); g.arc(ex + .09 * k, headY + .07 * k, .03 * k, 0, Math.PI * 2); g.fill();
    } else if (!p.helmet) { g.fillStyle = shade(skin, -20); g.beginPath(); g.arc(hx0 + side * .17 * k, headY + .02 * k, .04 * k, 0, Math.PI * 2); g.fill(); }
    if (p.helmet) {
      const hc = kit.helmet || '#1d2d5c';
      g.fillStyle = hc; g.beginPath(); g.arc(hx0, headY - .01 * k, hr * 1.12, Math.PI * .98, Math.PI * 2.02); g.lineTo(hx0 + side * hr * 1.35, headY + .02 * k); g.lineTo(hx0 - side * hr, headY + .04 * k); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,255,255,.28)'; g.beginPath(); g.ellipse(hx0 - side * .07 * k, headY - .12 * k, .07 * k, .035 * k, -.4 * side, 0, Math.PI * 2); g.fill();
      g.fillStyle = kit.stripe === hc ? '#ffffff' : (kit.stripe || '#fff'); g.fillRect(hx0 - .025 * k, headY - hr * 1.1, .05 * k, hr * .8);
      // grille
      g.strokeStyle = '#b8c0ca'; g.lineWidth = Math.max(1, .022 * k);
      const gx0 = hx0 + side * .04 * k, gx1 = hx0 + side * .24 * k;
      for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(gx0, headY + .04 * k + i * .045 * k); g.lineTo(gx1, headY + .04 * k + i * .045 * k); g.stroke(); }
      g.beginPath(); g.moveTo(hx0 + side * .16 * k, headY + .02 * k); g.lineTo(hx0 + side * .16 * k, headY + .16 * k); g.stroke();
    } else if (p.hat) { // umpire wide-brim hat
      g.fillStyle = '#efe6cf'; g.beginPath(); g.ellipse(hx0, headY - .08 * k, .32 * k, .07 * k, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(hx0, headY - .1 * k, .16 * k, Math.PI, 0); g.fill();
      g.fillStyle = '#1b1b1b'; g.fillRect(hx0 - .16 * k, headY - .12 * k, .32 * k, .03 * k);
    } else if (p.cap) {
      g.fillStyle = kit.head || kit.shirt; g.beginPath(); g.arc(hx0, headY - .03 * k, hr * 1.04, Math.PI * 1.02, Math.PI * 1.98); g.closePath(); g.fill();
      g.beginPath(); g.ellipse(hx0 + side * .2 * k, headY - .04 * k, .14 * k, .04 * k, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,.25)'; g.beginPath(); g.arc(hx0 - side * .05 * k, headY - .12 * k, .04 * k, 0, Math.PI * 2); g.fill();
    } else {
      g.fillStyle = p.hair || '#1b1410'; g.beginPath(); g.arc(hx0, headY - .03 * k, hr * 1.04, Math.PI * 1.05, Math.PI * 1.95); g.closePath(); g.fill();
      g.beginPath(); g.arc(hx0 - side * .09 * k, headY - .02 * k, hr * .62, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  },
  isoDot(p, k) { const g = this.ctx, P = this.proj(p.x, p.y, 0); g.fillStyle = p.kit.shirt; g.beginPath(); g.arc(P.x, P.y - 2, 2.2, 0, Math.PI * 2); g.fill(); },

  // ---------- Timing ring around the batter's hitting zone ----------
  timingRing(x, y, z, prog, perfect, good) {
    const g = this.ctx, P = this.proj(x, y, z), k = this.cam.z;
    const r = (.35 + Math.max(0, prog) * 2.2) * k;
    g.save();
    g.lineWidth = Math.max(3, k * .12);
    g.strokeStyle = perfect ? 'rgba(159,232,112,.95)' : good ? 'rgba(245,197,24,.9)' : 'rgba(255,255,255,.65)';
    g.beginPath(); g.ellipse(P.x, P.y, r, r * .62, 0, 0, Math.PI * 2); g.stroke();
    g.lineWidth = Math.max(1.5, k * .05); g.strokeStyle = 'rgba(255,255,255,.4)';
    g.beginPath(); g.ellipse(P.x, P.y, .35 * k, .35 * k * .62, 0, 0, Math.PI * 2); g.stroke();
    g.restore();
  },
  pitchSpot(x, y, a) { const g = this.ctx, P = this.proj(x, y, 0), k = this.cam.z; g.save(); g.globalAlpha = a; g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.ellipse(P.x, P.y, .3 * k, .3 * k * (this.isIso() ? .56 : 1), 0, 0, Math.PI * 2); g.fill(); g.restore(); },
});

// ---------- Screen-space particles (confetti, sparks, bails) ----------
const FX = {
  list: [],
  burst(x, y, n, opts = {}) {
    const cols = opts.colors || ['#f5c518', '#ffffff', '#e8443a', '#7fd1ae', '#3b82f6', '#f7a8c4'];
    for (let i = 0; i < n; i++) {
      const a = (opts.dir ?? -Math.PI / 2) + U.rand(-1, 1) * (opts.spread ?? Math.PI);
      const v = U.rand(opts.vmin ?? 150, opts.vmax ?? 520);
      this.list.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: opts.g ?? 600, life: U.rand(.8, 1.6) * (opts.life ?? 1), max: 1, c: U.pick(cols), w: U.rand(4, 9) * (opts.size ?? 1), h: U.rand(3, 6) * (opts.size ?? 1), r: U.rand(0, 6), vr: U.rand(-10, 10), spark: !!opts.spark });
    }
  },
  update(dt) { this.list = this.list.filter(p => { p.life -= dt; p.vy += p.g * dt; p.vx *= (1 - dt * .8); p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt; return p.life > 0; }); },
  draw() {
    const g = R.ctx; if (!this.list.length) return; g.save(); g.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);
    for (const p of this.list) {
      g.globalAlpha = Math.min(1, p.life * 2);
      if (p.spark) { g.fillStyle = p.c; g.beginPath(); g.arc(p.x, p.y, p.w * .5, 0, Math.PI * 2); g.fill(); continue; }
      g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.r * 2))); g.restore();
    }
    g.restore();
  },
};
