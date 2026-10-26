'use strict';
// ---------- Top-down flat-illustration renderer ----------
// World units are metres. Origin = pitch centre. +y = towards striker (bottom of screen).
const FIG = 1.7;               // stylised figure scale (posters exaggerate people)
const SHADOW = { x: 0.62, y: -0.42 }; // light from bottom-left, shadows fall up-right (like the references)
const BOUNDARY_R = 64;

const R = {
  cv: null, ctx: null, W: 0, H: 0, dpr: 1,
  cam: { x: 0, y: 1, z: 28, tx: 0, ty: 1, tz: 28 },
  grain: null, stands: null, time: 0,
  palette: {
    grassA: '#6aaa4c', grassB: '#5a9840', grassOut: '#4c8a39', rope: '#f4f1e8',
    pitch: '#d8b47a', pitchDark: '#c9a061', pitchWorn: '#b98f55', crease: '#fbf8ef',
    stand: '#2d5f9a', standB: '#244f84', sky: '#3f78bd',
  },
  init(canvas) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.makeGrain(); this.resize();
    window.addEventListener('resize', () => this.resize());
  },
  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.W = window.innerWidth; this.H = window.innerHeight;
    this.cv.width = this.W * this.dpr; this.cv.height = this.H * this.dpr;
    this.cv.style.width = this.W + 'px'; this.cv.style.height = this.H + 'px';
    this.pitchZoom = this.isIso() ? Math.min(this.H / 21, this.W / 14.5) : Math.min(this.H / 27, this.W / 11);
  },
  // ---- View / projection: 'iso' (rotated + tilted ground, upright figures) or 'top' ----
  isIso() { return !Save.data || (Save.data.settings.view || 'iso') === 'iso'; },
  ISO: { ang: .46, sq: .56, zh: .9 },
  lin() { // linear part world->screen (before zoom)
    if (!this.isIso()) return { a: 1, b: 0, c: 0, d: 1 };
    const { ang, sq } = this.ISO, co = Math.cos(ang), si = Math.sin(ang);
    return { a: co, b: si * sq, c: -si, d: co * sq };
  },
  proj(x, y, z = 0) {
    const L = this.lin(), dx = x - this.cam.x, dy = y - this.cam.y, k = this.cam.z;
    const X = this.W / 2 + k * (L.a * dx + L.c * dy), Y = this.H / 2 + k * (L.b * dx + L.d * dy);
    return { x: X, y: Y - z * k * (this.isIso() ? this.ISO.zh : .12) };
  },
  vecToWorld(dx, dy) { const L = this.lin(), det = L.a * L.d - L.b * L.c; return { x: (L.d * dx - L.c * dy) / det, y: (-L.b * dx + L.a * dy) / det }; },
  unproject(sx, sy) { const v = this.vecToWorld((sx - this.W / 2) / this.cam.z, (sy - this.H / 2) / this.cam.z); return { x: this.cam.x + v.x, y: this.cam.y + v.y }; },
  screenDir(wx, wy) { const L = this.lin(); const x = L.a * wx + L.c * wy, y = L.b * wx + L.d * wy, n = Math.hypot(x, y) || 1; return { x: x / n, y: y / n }; },
  makeGrain() {
    const c = document.createElement('canvas'); c.width = c.height = 160;
    const g = c.getContext('2d'), img = g.createImageData(160, 160);
    for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 22; }
    g.putImageData(img, 0, 0); this.grain = c;
    // Stands: rings of seats with crowd specks, pre-rendered once
    const S = 6, size = (BOUNDARY_R + 30) * 2 * S; const sc = document.createElement('canvas'); sc.width = sc.height = size;
    const sg = sc.getContext('2d'); const cx = size / 2;
    sg.fillStyle = '#1d3f6b'; sg.beginPath(); sg.arc(cx, cx, cx, 0, Math.PI * 2); sg.fill();
    for (let ring = 0; ring < 9; ring++) {
      const r = (BOUNDARY_R + 7 + ring * 2.4) * S;
      sg.strokeStyle = ring % 2 ? '#2a5a92' : '#2f66a3'; sg.lineWidth = 2.1 * S; sg.beginPath(); sg.arc(cx, cx, r, 0, Math.PI * 2); sg.stroke();
      const n = Math.floor(r * 2 * Math.PI / 5);
      for (let k = 0; k < n; k++) {
        if (Math.random() < .35) continue;
        const a = k / n * Math.PI * 2 + Math.random() * .01;
        sg.fillStyle = U.pick(['#f5c518', '#ffffff', '#e84a3a', '#f7a8c4', '#1b1b1b', '#7fd1ae', '#ffd8a8', '#3b82f6']);
        sg.beginPath(); sg.arc(cx + Math.cos(a) * r, cx + Math.sin(a) * r, 1.6 + Math.random(), 0, Math.PI * 2); sg.fill();
      }
    }
    // stand gaps / sight screens
    sg.fillStyle = '#eef1f4';
    [[-Math.PI / 2], [Math.PI / 2]].forEach(([a]) => { sg.save(); sg.translate(cx, cx); sg.rotate(a); sg.fillRect((BOUNDARY_R + 4) * S, -9 * S, 4 * S, 18 * S); sg.restore(); });
    this.stands = sc; this.standScale = S;
  },
  // world -> screen
  sx(x) { return this.W / 2 + (x - this.cam.x) * this.cam.z; },
  sy(y) { return this.H / 2 + (y - this.cam.y) * this.cam.z; },
  setCam(x, y, z, snap) { const c = this.cam; c.tx = x; c.ty = y; c.tz = z; if (snap) { c.x = x; c.y = y; c.z = z; } },
  updateCam(dt) { const c = this.cam, k = 1 - Math.pow(0.0025, dt); c.x += (c.tx - c.x) * k; c.y += (c.ty - c.y) * k; c.z += (c.tz - c.z) * k; },

  begin() {
    const g = this.ctx; g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    g.fillStyle = '#1d3f6b'; g.fillRect(0, 0, this.W, this.H);
    // world transform
    const L = this.lin();
    g.save(); g.translate(this.W / 2, this.H / 2); g.scale(this.cam.z, this.cam.z); g.transform(L.a, L.b, L.c, L.d, 0, 0); g.translate(-this.cam.x, -this.cam.y);
    this.inWorld = true;
  },
  popWorld() { if (this.inWorld) { this.ctx.restore(); this.inWorld = false; } },
  end() { const g = this.ctx; this.popWorld(); g.save(); g.globalCompositeOperation = 'overlay'; g.fillStyle = g.createPattern(this.grain, 'repeat'); g.fillRect(0, 0, this.W, this.H); g.restore(); },

  drawGround(match) {
    const g = this.ctx, p = this.palette;
    const s = this.standScale; g.drawImage(this.stands, -this.stands.width / 2 / s, -this.stands.height / 2 / s, this.stands.width / s, this.stands.height / s);
    // outfield with mowing stripes
    g.save(); g.beginPath(); g.arc(0, 0, BOUNDARY_R + 3, 0, Math.PI * 2); g.clip();
    g.fillStyle = p.grassOut; g.fillRect(-BOUNDARY_R - 4, -BOUNDARY_R - 4, (BOUNDARY_R + 4) * 2, (BOUNDARY_R + 4) * 2);
    const stripe = 5.5;
    for (let x = -BOUNDARY_R - 4, i = 0; x < BOUNDARY_R + 4; x += stripe, i++) { g.fillStyle = i % 2 ? p.grassA : p.grassB; g.fillRect(x, -BOUNDARY_R - 4, stripe, (BOUNDARY_R + 4) * 2); }
    // soft radial vignette for depth
    const rg = g.createRadialGradient(0, 0, 10, 0, 0, BOUNDARY_R + 3); rg.addColorStop(0, 'rgba(255,255,220,0.06)'); rg.addColorStop(1, 'rgba(0,30,0,0.18)');
    g.fillStyle = rg; g.fillRect(-BOUNDARY_R - 4, -BOUNDARY_R - 4, (BOUNDARY_R + 4) * 2, (BOUNDARY_R + 4) * 2);
    g.restore();
    // boundary rope / cushion
    g.lineWidth = .55; g.strokeStyle = (match && match.teamColor) || '#f5c518'; g.beginPath(); g.arc(0, 0, BOUNDARY_R + .4, 0, Math.PI * 2); g.stroke();
    g.lineWidth = .18; g.strokeStyle = p.rope; g.beginPath(); g.arc(0, 0, BOUNDARY_R, 0, Math.PI * 2); g.stroke();
    // 30-yard circle (two semicircles joined, like real grounds)
    g.setLineDash([.9, .9]); g.lineWidth = .15; g.strokeStyle = 'rgba(255,255,255,.75)';
    g.beginPath(); g.arc(0, -10.06, 27.4, Math.PI, 0); g.lineTo(27.4, 10.06); g.arc(0, 10.06, 27.4, 0, Math.PI); g.closePath(); g.stroke(); g.setLineDash([]);
    this.drawPitch();
  },
  drawPitch() {
    const g = this.ctx, p = this.palette;
    // square (lighter mown block around pitch)
    g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(-9, -14, 18, 28);
    // pitch shadow-edge for subtle raised 3D feel
    g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(-1.52 + .25, -11.5 - .18, 3.05, 23);
    g.fillStyle = p.pitch; g.fillRect(-1.52, -11.5, 3.05, 23);
    // worn areas
    g.fillStyle = p.pitchWorn; g.globalAlpha = .35;
    g.beginPath(); g.ellipse(0, 6.5, .9, 2.4, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(0, -6.5, .9, 2.4, 0, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
    g.fillStyle = p.pitchDark; g.globalAlpha = .5; g.fillRect(-1.52, -11.5, .22, 23); g.fillRect(1.31, -11.5, .22, 23); g.globalAlpha = 1;
    // creases
    g.strokeStyle = p.crease; g.lineWidth = .07;
    [1, -1].forEach(s => {
      const pop = 8.84 * s, bowl = 10.06 * s;
      g.beginPath(); g.moveTo(-1.83, pop); g.lineTo(1.83, pop); g.stroke(); // popping crease
      g.beginPath(); g.moveTo(-1.32, bowl); g.lineTo(1.32, bowl); g.stroke(); // bowling crease
      g.beginPath(); g.moveTo(-1.32, pop); g.lineTo(-1.32, bowl + s * 1.2); g.stroke(); // return creases
      g.beginPath(); g.moveTo(1.32, pop); g.lineTo(1.32, bowl + s * 1.2); g.stroke();
      // wide guidelines
      g.beginPath(); g.moveTo(-.89, pop); g.lineTo(-.89, pop - s * .5); g.stroke();
      g.beginPath(); g.moveTo(.89, pop); g.lineTo(.89, pop - s * .5); g.stroke();
    });
  },
  drawStumps(y, broken) {
    const g = this.ctx;
    g.fillStyle = 'rgba(0,0,0,.25)';
    for (let i = -1; i <= 1; i++) { g.beginPath(); g.moveTo(i * .11, y); g.lineTo(i * .11 + SHADOW.x * .72, y + SHADOW.y * .72); g.lineWidth = .05; g.strokeStyle = 'rgba(0,0,0,.22)'; g.stroke(); }
    for (let i = -1; i <= 1; i++) {
      const ox = broken ? (i * .35 + Math.sin(i + 2) * .2) : 0, oy = broken ? (i === 0 ? .4 : .2) : 0;
      g.fillStyle = '#f2e6c9'; g.beginPath(); g.arc(i * .11 + ox, y + oy, .055, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#d6232a'; g.beginPath(); g.arc(i * .11 + ox, y + oy, .025, 0, Math.PI * 2); g.fill();
    }
    if (!broken) { g.strokeStyle = '#f2e6c9'; g.lineWidth = .04; g.beginPath(); g.moveTo(-.12, y); g.lineTo(.12, y); g.stroke(); }
    else { g.strokeStyle = '#f2e6c9'; g.lineWidth = .04; g.beginPath(); g.moveTo(-.6, y + .9); g.lineTo(-.4, y + 1.05); g.stroke(); g.beginPath(); g.moveTo(.5, y - .4); g.lineTo(.7, y - .2); g.stroke(); }
  },

  // ---- People ----
  // p: {x,y,face(angle rad, 0=up), kit:{shirt,trouser,head,helmet}, skin, hair, pose:'stand'|'run'|'bat'|'bowl'|'keep'|'crouch'|'dive'|'throw'|'celebrate', t: anim time, bat: angle}
  drawShadowOf(p) {
    const g = this.ctx, h = 1.8 * FIG * .62;
    g.save(); g.translate(p.x, p.y);
    g.fillStyle = 'rgba(16,40,22,0.28)';
    // body capsule stretched along shadow dir
    const ex = SHADOW.x * h, ey = SHADOW.y * h;
    g.lineCap = 'round'; g.strokeStyle = 'rgba(16,40,22,0.28)'; g.lineWidth = .42 * FIG;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(ex * .8, ey * .8); g.stroke();
    g.beginPath(); g.arc(ex, ey, .2 * FIG, 0, Math.PI * 2); g.fill();
    // arms shadow
    g.lineWidth = .12 * FIG; const swing = p.pose === 'bat' || p.pose === 'bowl' || p.pose === 'throw' ? Math.sin(p.t * 8) * .5 : 0;
    g.beginPath(); g.moveTo(ex * .55, ey * .55); g.lineTo(ex * .55 - .55 * FIG + swing, ey * .55 + .25 * FIG); g.stroke();
    g.beginPath(); g.moveTo(ex * .55, ey * .55); g.lineTo(ex * .55 + .55 * FIG, ey * .55 + .1 * FIG - swing); g.stroke();
    if (p.pose === 'bat' || p.holdsBat) { g.lineWidth = .1 * FIG; g.beginPath(); g.moveTo(ex * .5, ey * .5); g.lineTo(ex * .5 + Math.cos(p.bat || 0) * .9 * FIG, ey * .5 + Math.sin(p.bat || 0) * .9 * FIG); g.stroke(); }
    g.restore();
  },
  drawPerson(p) {
    const g = this.ctx, F = FIG, k = p.kit;
    g.save(); g.translate(p.x, p.y); g.rotate(p.face || 0);
    const t = p.t || 0;
    const stride = (p.pose === 'run') ? Math.sin(t * 14) * .28 * F : (p.pose === 'bowl' ? Math.sin(t * 10) * .22 * F : 0);
    const crouch = (p.pose === 'keep' || p.pose === 'crouch') ? .85 : 1;
    // legs (visible beneath torso, slightly forward/back)
    g.lineCap = 'round';
    const legCol = p.pads ? '#f7f5ef' : k.trouser;
    g.strokeStyle = legCol; g.lineWidth = .16 * F;
    g.beginPath(); g.moveTo(-.11 * F, .05 * F); g.lineTo(-.13 * F, (.05 + .25) * F * crouch - stride); g.stroke();
    g.beginPath(); g.moveTo(.11 * F, .05 * F); g.lineTo(.13 * F, (.05 + .25) * F * crouch + stride); g.stroke();
    // shoes
    g.fillStyle = '#1e2430';
    g.beginPath(); g.arc(-.13 * F, (.32 * crouch) * F - stride, .065 * F, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(.13 * F, (.32 * crouch) * F + stride, .065 * F, 0, Math.PI * 2); g.fill();
    // arms
    const skin = p.skin || '#c48a5c';
    const armL = [-.27 * F, 0], armR = [.27 * F, 0];
    let handL = [-.36 * F, -.28 * F], handR = [.36 * F, -.28 * F];
    if (p.pose === 'run') { handL = [-.33 * F, -.15 * F - stride * .8]; handR = [.33 * F, -.15 * F + stride * .8]; }
    if (p.pose === 'keep') { handL = [-.14 * F, -.42 * F]; handR = [.14 * F, -.42 * F]; }
    if (p.pose === 'crouch') { handL = [-.24 * F, -.36 * F]; handR = [.24 * F, -.36 * F]; }
    if (p.pose === 'celebrate') { const w = Math.sin(t * 12) * .1 * F; handL = [-.5 * F, -.5 * F + w]; handR = [.5 * F, -.5 * F - w]; }
    if (p.pose === 'bowl') { const a = t * 11; handR = [Math.cos(a) * .5 * F + .1 * F, Math.sin(a) * .5 * F]; handL = [-.4 * F, -.3 * F]; }
    if (p.pose === 'throw') { handR = [.55 * F, -.35 * F]; handL = [-.35 * F, -.1 * F]; }
    if (p.pose === 'dive') { handL = [-.2 * F, -.6 * F]; handR = [.2 * F, -.6 * F]; }
    let batAng = null;
    if (p.pose === 'bat' || p.holdsBat) {
      batAng = p.bat ?? 0.6; // angle of bat in local space
      const hx = Math.cos(batAng) * .32 * F, hy = Math.sin(batAng) * .32 * F;
      handL = [hx * .7 - .05 * F, hy * .7]; handR = [hx * .7 + .05 * F, hy * .7];
    }
    g.strokeStyle = k.shirt; g.lineWidth = .14 * F; // sleeves
    g.beginPath(); g.moveTo(armL[0], armL[1]); g.lineTo(U.lerp(armL[0], handL[0], .4), U.lerp(armL[1], handL[1], .4)); g.stroke();
    g.beginPath(); g.moveTo(armR[0], armR[1]); g.lineTo(U.lerp(armR[0], handR[0], .4), U.lerp(armR[1], handR[1], .4)); g.stroke();
    g.strokeStyle = skin; g.lineWidth = .1 * F;
    g.beginPath(); g.moveTo(U.lerp(armL[0], handL[0], .4), U.lerp(armL[1], handL[1], .4)); g.lineTo(handL[0], handL[1]); g.stroke();
    g.beginPath(); g.moveTo(U.lerp(armR[0], handR[0], .4), U.lerp(armR[1], handR[1], .4)); g.lineTo(handR[0], handR[1]); g.stroke();
    if (p.gloves) { g.fillStyle = '#f7f5ef'; g.beginPath(); g.arc(handL[0], handL[1], .075 * F, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(handR[0], handR[1], .075 * F, 0, Math.PI * 2); g.fill(); }
    // bat
    if (batAng !== null) {
      g.save(); g.translate(handL[0] * .5 + handR[0] * .5, handL[1] * .5 + handR[1] * .5); g.rotate(batAng - Math.PI / 2);
      g.fillStyle = '#2b2b2b'; g.fillRect(-.025 * F, -.02 * F, .05 * F, .2 * F); // handle grip
      g.fillStyle = '#e9cf98'; g.beginPath(); g.roundRect(-.055 * F, .17 * F, .11 * F, .6 * F, .03 * F); g.fill();
      g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(.01 * F, .2 * F, .045 * F, .55 * F);
      g.restore();
    }
    // torso (shoulders ellipse) with illustrated light/shade
    g.fillStyle = k.shirt; g.beginPath(); g.ellipse(0, 0, .3 * F, .17 * F, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(0,0,0,.14)'; g.beginPath(); g.ellipse(.04 * F, .04 * F, .26 * F, .12 * F, 0, 0, Math.PI); g.fill();
    g.fillStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.ellipse(-.06 * F, -.05 * F, .17 * F, .07 * F, 0, Math.PI, Math.PI * 2); g.fill();
    if (k.stripe) { g.fillStyle = k.stripe; g.fillRect(-.3 * F, -.025 * F, .6 * F, .05 * F); }
    // head
    if (p.helmet) {
      g.fillStyle = k.helmet || '#1d2d5c'; g.beginPath(); g.arc(0, -.02 * F, .135 * F, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,.25)'; g.beginPath(); g.arc(-.04 * F, -.06 * F, .05 * F, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#9aa3ad'; g.lineWidth = .025 * F; g.beginPath(); g.arc(0, -.02 * F, .15 * F, -2.4, -.7); g.stroke(); // grille
    } else if (p.cap) {
      g.fillStyle = k.head || k.shirt; g.beginPath(); g.arc(0, -.01 * F, .12 * F, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.ellipse(0, -.14 * F, .09 * F, .06 * F, 0, 0, Math.PI * 2); g.fill(); // peak
    } else {
      g.fillStyle = p.hair || '#1b1410'; g.beginPath(); g.arc(0, -.01 * F, .12 * F, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.arc(-.035 * F, -.05 * F, .045 * F, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  },
  drawUmpire(x, y) {
    this.drawShadowOf({ x, y, pose: 'stand', t: 0 });
    this.drawPerson({ x, y, face: 0, pose: 'stand', kit: { shirt: '#f2f2ee', trouser: '#2b2b2b', head: '#f2f2ee' }, cap: true, skin: '#a86b45' });
  },
  drawBall(b) {
    const g = this.ctx;
    // shadow
    const shx = b.x + SHADOW.x * b.z * .9, shy = b.y + SHADOW.y * b.z * .9;
    g.fillStyle = 'rgba(10,30,15,.35)'; g.beginPath(); g.ellipse(shx, shy, .13 + b.z * .01, .1 + b.z * .008, 0, 0, Math.PI * 2); g.fill();
    // ball (lifted slightly towards camera by height)
    const r = .11 * (1 + b.z * .07) * 1.25;
    const by = b.y - b.z * .12;
    g.fillStyle = b.white ? '#f8f8f4' : '#c41e24'; g.beginPath(); g.arc(b.x, by, r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = b.white ? '#d9d9d2' : '#f2d7a0'; g.lineWidth = .02; g.beginPath(); g.arc(b.x, by, r * .7, -.6, 1.2); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.arc(b.x - r * .35, by - r * .35, r * .3, 0, Math.PI * 2); g.fill();
  },
  drawTrail(trail) {
    const g = this.ctx; if (trail.length < 2) return;
    for (let i = 1; i < trail.length; i++) {
      const a = trail[i - 1], b = trail[i];
      g.strokeStyle = `rgba(255,255,255,${(i / trail.length) * .35})`; g.lineWidth = .09 * (i / trail.length);
      g.beginPath(); g.moveTo(a.x, a.y - a.z * .12); g.lineTo(b.x, b.y - b.z * .12); g.stroke();
    }
  },
  drawMarker(x, y, color, r = .35, pulse = 0) {
    const g = this.ctx; g.strokeStyle = color; g.lineWidth = .07;
    g.beginPath(); g.arc(x, y, r + Math.sin(this.time * 6) * pulse, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(x - r * .5, y); g.lineTo(x + r * .5, y); g.moveTo(x, y - r * .5); g.lineTo(x, y + r * .5); g.stroke();
  },
  drawZone(y1, y2, color) { const g = this.ctx; g.fillStyle = color; g.fillRect(-1.5, Math.min(y1, y2), 3.0, Math.abs(y2 - y1)); },

  // ================= ISOMETRIC (screen-space) drawing =================
  isoStumps(y, broken) {
    const g = this.ctx, k = this.cam.z;
    for (let i = -1; i <= 1; i++) {
      let bx = i * .11, tilt = 0;
      if (broken) { bx += i * .25; tilt = i * .5 + .2; }
      const a = this.proj(bx, y, 0), top = this.proj(bx + Math.sin(tilt) * .7, y - (broken ? .3 : 0), Math.cos(tilt) * .71);
      g.strokeStyle = '#efe2c2'; g.lineWidth = Math.max(2, .05 * k); g.lineCap = 'round';
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(top.x, top.y); g.stroke();
      g.strokeStyle = 'rgba(0,0,0,.15)'; g.lineWidth = Math.max(1, .02 * k); g.beginPath(); g.moveTo(a.x + .015 * k, a.y); g.lineTo(top.x + .015 * k, top.y); g.stroke();
    }
    if (!broken) { const l = this.proj(-.13, y, .72), r = this.proj(.13, y, .72); g.strokeStyle = '#d6232a'; g.lineWidth = Math.max(2, .035 * k); g.beginPath(); g.moveTo(l.x, l.y); g.lineTo(r.x, r.y); g.stroke(); }
  },
  isoBall(b) {
    const g = this.ctx, k = this.cam.z, P = this.proj(b.x, b.y, b.z), r = Math.max(3, .11 * 1.3 * k);
    g.fillStyle = b.white ? '#f8f8f4' : '#c41e24'; g.beginPath(); g.arc(P.x, P.y, r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 1; g.stroke();
    g.fillStyle = 'rgba(255,255,255,.8)'; g.beginPath(); g.arc(P.x - r * .35, P.y - r * .35, r * .32, 0, Math.PI * 2); g.fill();
  },
  isoTrail(trail) {
    const g = this.ctx; if (trail.length < 2) return;
    for (let i = 1; i < trail.length; i++) {
      const a = this.proj(trail[i - 1].x, trail[i - 1].y, trail[i - 1].z), b = this.proj(trail[i].x, trail[i].y, trail[i].z);
      g.strokeStyle = `rgba(255,255,255,${(i / trail.length) * .45})`; g.lineWidth = .1 * this.cam.z * (i / trail.length);
      g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    }
  },
  ballShadow(b) { const g = this.ctx; const shx = b.x + SHADOW.x * b.z * .9, shy = b.y + SHADOW.y * b.z * .9; g.fillStyle = 'rgba(10,30,15,.35)'; g.beginPath(); g.ellipse(shx, shy, .14, .11, 0, 0, Math.PI * 2); g.fill(); },
  limb(x1, y1, x2, y2, w, col) { const g = this.ctx; g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke(); },
  // Upright illustrated figure. p.face = world facing angle (0 = towards bowler end, -y)
  isoPerson(p) {
    const g = this.ctx, F = 1.6, k = this.cam.z * this.ISO.zh * F; // px per metre of body height
    const P = this.proj(p.x, p.y, 0);
    const fw = this.screenDir(Math.sin(p.face || 0), -Math.cos(p.face || 0)); // facing on screen
    const side = fw.x >= 0 ? 1 : -1; // which way the figure points
    const t = p.t || 0, kit = p.kit, skin = p.skin || '#c48a5c';
    const pose = p.pose;
    const crouch = pose === 'keep' ? .62 : pose === 'crouch' ? .82 : 1;
    const stride = pose === 'run' ? Math.sin(t * 14) : pose === 'bowl' ? Math.sin(t * 10) * .7 : 0;
    g.save(); g.translate(P.x, P.y);
    if (pose === 'dive') g.rotate(side * 1.25);
    const hipY = -.92 * k * crouch, shY = -1.42 * k * (crouch < 1 ? crouch + .08 : 1), headY = shY - .2 * k;
    const lean = (pose === 'run' ? .12 : pose === 'keep' || pose === 'crouch' ? .16 : 0) * k * side;
    // legs
    const legCol = p.pads ? '#f7f5ef' : kit.trouser, legW = .17 * k;
    const f1 = { x: -.1 * k + fw.x * stride * .28 * k, y: fw.y * stride * .12 * k }, f2 = { x: .1 * k - fw.x * stride * .28 * k, y: -fw.y * stride * .12 * k };
    const knee = pose === 'keep' ? .35 * k : 0;
    [[f2, -1], [f1, 1]].forEach(([f, sgn]) => {
      const hx = sgn * .09 * k;
      if (knee) { this.limb(hx, hipY, f.x + sgn * knee, (hipY + f.y) / 2, legW, legCol); this.limb(f.x + sgn * knee, (hipY + f.y) / 2, f.x, f.y, legW, legCol); }
      else this.limb(hx, hipY, f.x, f.y - .04 * k, legW, legCol);
      if (p.pads) { g.strokeStyle = 'rgba(0,0,0,.12)'; g.lineWidth = 1; g.beginPath(); g.moveTo(f.x - .04 * k, hipY * .55); g.lineTo(f.x - .04 * k, f.y - .1 * k); g.stroke(); }
      g.fillStyle = '#1e2430'; g.beginPath(); g.ellipse(f.x + side * .04 * k, f.y - .02 * k, .1 * k, .05 * k, 0, 0, Math.PI * 2); g.fill();
    });
    // pose -> hands (relative to shoulders)
    const shL = { x: -.24 * k + lean, y: shY + .04 * k }, shR = { x: .24 * k + lean, y: shY + .04 * k };
    let hL = { x: shL.x - .04 * k, y: shY + .5 * k }, hR = { x: shR.x + .04 * k, y: shY + .5 * k };
    if (pose === 'run') { hL = { x: shL.x + fw.x * stride * .25 * k, y: shY + .42 * k }; hR = { x: shR.x - fw.x * stride * .25 * k, y: shY + .42 * k }; }
    if (pose === 'crouch') { hL = { x: shL.x + side * .18 * k, y: shY + .45 * k }; hR = { x: shR.x + side * .18 * k, y: shY + .45 * k }; }
    if (pose === 'keep') { hL = { x: side * .22 * k - .06 * k, y: hipY + .12 * k }; hR = { x: side * .22 * k + .06 * k, y: hipY + .12 * k }; }
    if (pose === 'celebrate') { const w = Math.sin(t * 12) * .08 * k; hL = { x: shL.x - .15 * k, y: shY - .5 * k + w }; hR = { x: shR.x + .15 * k, y: shY - .5 * k - w }; }
    if (pose === 'bowl') { const a = t * 11; hR = { x: shR.x + Math.cos(a) * fw.x * .6 * k, y: shY - Math.sin(a) * .6 * k }; hL = { x: shL.x + side * .3 * k, y: shY - .25 * k }; }
    if (pose === 'throw') { hR = { x: shR.x - side * .35 * k, y: shY - .4 * k }; hL = { x: shL.x + side * .35 * k, y: shY + .05 * k }; }
    if (pose === 'dive') { hL = { x: shL.x + side * .1 * k, y: shY - .5 * k }; hR = { x: shR.x + side * .1 * k, y: shY - .5 * k }; }
    let batEnd = null;
    if (p.holdsBat) {
      const hx = side * .16 * k + lean, hy = hipY - .08 * k;
      hL = { x: hx - .03 * k, y: hy }; hR = { x: hx + .03 * k, y: hy - .06 * k };
      // swing progress 0 (stance) .. 1 (follow-through)
      const sp = U.clamp((2.2 - (p.bat ?? 2.2)) / 3.4, 0, 1);
      const a0 = Math.PI / 2 + side * .35, aMid = Math.atan2(fw.y, fw.x) , a2 = -Math.PI / 2 - side * .7;
      const ang = sp < .5 ? U.lerp(a0, aMid, sp * 2) : U.lerp(aMid, a2, (sp - .5) * 2);
      if (pose === 'run' || pose === 'stand') { batEnd = { x: hx + side * .3 * k, y: hy + .55 * k }; }
      else batEnd = { x: hx + Math.cos(ang) * .82 * k, y: hy + Math.sin(ang) * .82 * k };
      if (sp > 0) { hL.y -= Math.sin(sp * Math.PI) * .2 * k; hR.y -= Math.sin(sp * Math.PI) * .2 * k; }
    }
    const armW = .11 * k;
    // back arm
    this.limb(shL.x, shL.y, hL.x, hL.y, armW, skin);
    // torso
    const tw = .27 * k;
    g.fillStyle = kit.shirt; g.beginPath();
    g.moveTo(-tw + lean, shY); g.quadraticCurveTo(lean, shY - .07 * k, tw + lean, shY);
    g.lineTo(tw * .78, hipY + .04 * k); g.quadraticCurveTo(0, hipY + .1 * k, -tw * .78, hipY + .04 * k); g.closePath(); g.fill();
    g.fillStyle = 'rgba(0,0,0,.16)'; g.beginPath(); g.moveTo(lean + tw * .1, shY); g.lineTo(tw + lean, shY); g.lineTo(tw * .78, hipY + .04 * k); g.lineTo(tw * .05, hipY + .08 * k); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,.14)'; g.beginPath(); g.ellipse(-tw * .45 + lean, shY + .12 * k, tw * .3, .1 * k, -.3, 0, Math.PI * 2); g.fill();
    if (kit.stripe) { g.fillStyle = kit.stripe; g.fillRect(-tw * .92 + lean * .6, shY + .17 * k, tw * 1.84, .06 * k); }
    // sleeves
    this.limb(shL.x, shL.y, U.lerp(shL.x, hL.x, .35), U.lerp(shL.y, hL.y, .35), armW * 1.35, kit.shirt);
    // bat (behind front arm)
    if (batEnd) {
      const hx = (hL.x + hR.x) / 2, hy = (hL.y + hR.y) / 2;
      const gx = U.lerp(hx, batEnd.x, .22), gy = U.lerp(hy, batEnd.y, .22);
      this.limb(hx, hy, gx, gy, .05 * k, '#2b2b2b');
      this.limb(gx, gy, batEnd.x, batEnd.y, .12 * k, '#e9cf98');
      this.limb(gx, gy, batEnd.x, batEnd.y, .04 * k, 'rgba(0,0,0,.12)');
    }
    // front arm
    this.limb(shR.x, shR.y, hR.x, hR.y, armW, skin);
    this.limb(shR.x, shR.y, U.lerp(shR.x, hR.x, .35), U.lerp(shR.y, hR.y, .35), armW * 1.35, kit.shirt);
    if (p.gloves) { g.fillStyle = '#f7f5ef'; [hL, hR].forEach(h => { g.beginPath(); g.arc(h.x, h.y, .07 * k, 0, Math.PI * 2); g.fill(); }); }
    else { g.fillStyle = skin; [hL, hR].forEach(h => { g.beginPath(); g.arc(h.x, h.y, .05 * k, 0, Math.PI * 2); g.fill(); }); }
    // neck + head
    const hx0 = lean * 1.2 + side * .02 * k;
    g.fillStyle = skin; g.fillRect(hx0 - .045 * k, headY + .05 * k, .09 * k, .12 * k);
    g.beginPath(); g.arc(hx0, headY, .125 * k, 0, Math.PI * 2); g.fill();
    if (p.helmet) {
      g.fillStyle = kit.helmet || '#1d2d5c'; g.beginPath(); g.arc(hx0, headY - .01 * k, .14 * k, Math.PI * .95, Math.PI * 2.05); g.closePath(); g.fill();
      g.fillRect(hx0 + side * .02 * k - .14 * k * (side > 0 ? 0 : 1), headY - .03 * k, .14 * k, .04 * k);
      g.strokeStyle = '#a8b0ba'; g.lineWidth = Math.max(1, .018 * k);
      for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(hx0 + side * .06 * k, headY + (i * .035) * k); g.lineTo(hx0 + side * .15 * k, headY + (i * .035) * k); g.stroke(); }
      g.fillStyle = 'rgba(255,255,255,.3)'; g.beginPath(); g.arc(hx0 - side * .05 * k, headY - .08 * k, .04 * k, 0, Math.PI * 2); g.fill();
    } else if (p.cap) {
      g.fillStyle = kit.head || kit.shirt; g.beginPath(); g.arc(hx0, headY - .02 * k, .13 * k, Math.PI, Math.PI * 2); g.closePath(); g.fill();
      g.beginPath(); g.ellipse(hx0 + side * .13 * k, headY - .02 * k, .1 * k, .03 * k, 0, 0, Math.PI * 2); g.fill();
    } else {
      g.fillStyle = p.hair || '#1b1410'; g.beginPath(); g.arc(hx0, headY - .02 * k, .13 * k, Math.PI * 1.02, Math.PI * 1.98); g.closePath(); g.fill();
      g.beginPath(); g.arc(hx0 - side * .05 * k, headY - .03 * k, .09 * k, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  },
};
