'use strict';
// ================= 2D PERSPECTIVE RENDERER (Stick-Cricket style, no WebGL) =================
// A pinhole camera projects the game world (x lateral, y along pitch, z up) onto a plain 2D canvas.
const PR = {
  C: [0, 21, 4.3], T: [0, -1.5, .5], tC: null, tT: null, fov: 46, near: .6,
  r: null, u: null, f: null, focal: 800,

  vsub: (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]],
  vdot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  vcross: (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]],
  vnorm(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; },

  basis() {
    this.f = this.vnorm(this.vsub(this.T, this.C));
    this.r = this.vnorm(this.vcross(this.f, [0, 0, 1]));
    this.u = this.vcross(this.r, this.f);
    this.focal = (R.H / 2) / Math.tan(this.fov * Math.PI / 360);
  },
  cam3(x, y, z) { const d = [x - this.C[0], y - this.C[1], z - this.C[2]]; return [this.vdot(d, this.r), this.vdot(d, this.u), this.vdot(d, this.f)]; },
  scr(c) { return { x: R.W / 2 + this.focal * c[0] / c[2], y: R.H / 2 - this.focal * c[1] / c[2], s: this.focal / c[2], zc: c[2] }; },
  proj(x, y, z = 0) { const c = this.cam3(x, y, z); if (c[2] < this.near) c[2] = this.near; return this.scr(c); },
  visible(x, y, z = 0) { return this.cam3(x, y, z)[2] > this.near; },
  scaleAt(x, y, z = 0) { return this.focal / Math.max(this.near, this.cam3(x, y, z)[2]); },
  // polygon in world → clipped against the near plane → screen points
  poly(pts) {
    const cs = pts.map(p => this.cam3(p[0], p[1], p[2] || 0)), out = [], n = this.near;
    for (let i = 0; i < cs.length; i++) {
      const a = cs[i], b = cs[(i + 1) % cs.length], ain = a[2] > n, bin = b[2] > n;
      if (ain) out.push(a);
      if (ain !== bin) { const t = (n - a[2]) / (b[2] - a[2]); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, n]); }
    }
    return out.map(c => this.scr(c));
  },
  path(g, pts) { if (pts.length < 2) return false; g.beginPath(); g.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y); g.closePath(); return true; },
  fillPoly(g, wpts, col) { const p = this.poly(wpts); if (p.length > 2) { this.path(g, p); g.fillStyle = col; g.fill(); } },
  line(g, a, b, col, w) {
    let A = this.cam3(...a), B = this.cam3(...b), n = this.near;
    if (A[2] < n && B[2] < n) return;
    if (A[2] < n) { const t = (n - A[2]) / (B[2] - A[2]); A = [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, n]; }
    if (B[2] < n) { const t = (n - B[2]) / (A[2] - B[2]); B = [B[0] + (A[0] - B[0]) * t, B[1] + (A[1] - B[1]) * t, n]; }
    const p = this.scr(A), q = this.scr(B);
    g.strokeStyle = col; g.lineWidth = w; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(q.x, q.y); g.stroke();
  },
  screenDir(wx, wy, at) { const o = at || [this.T[0], this.T[1]]; const a = this.proj(o[0], o[1]), b = this.proj(o[0] + wx, o[1] + wy); const x = b.x - a.x, y = b.y - a.y, n = Math.hypot(x, y) || 1; return { x: x / n, y: y / n }; },
  unproject(sx, sy) {
    const dx = (sx - R.W / 2) / this.focal, dy = -(sy - R.H / 2) / this.focal;
    const d = [this.f[0] + dx * this.r[0] + dy * this.u[0], this.f[1] + dx * this.r[1] + dy * this.u[1], this.f[2] + dx * this.r[2] + dy * this.u[2]];
    const t = -this.C[2] / d[2]; return { x: this.C[0] + d[0] * t, y: this.C[1] + d[1] * t };
  },
  vecToWorld(dx, dy) { const a = this.proj(0, 0), b = this.proj(1, 0); return { x: dx * (Math.sign(b.x - a.x) || 1), y: dy }; },

  // ---------------- camera: 3 angles ----------------
  mode() { const v = (Save.data && Save.data.settings.view) || 'bat'; return ({ stick: 'bat', iso: 'tv', top: 'drone' })[v] || v; },
  updCamera(P, dt) {
    const b = P && P.ball, playing = P && (P.phase === 'inplay' || (P.phase === 'dead' && P.inplay));
    const bowlingView = P && P.userBowling && P.userBowling() && !P.auto;
    const view = (Game.demoOn || bowlingView) ? 'tv' : this.mode();
    let C, T, fov = 46;
    if (playing && b) {
      const dist = Math.hypot(b.x, b.y - (view === 'tv' ? -10 : 10));
      if (view === 'drone') { C = [b.x * .5, b.y * .5 + 26, 30 + dist * .25]; T = [b.x * .75, b.y * .75, 0]; fov = 50; }
      else if (view === 'tv') { C = [b.x * .15, -26 - dist * .05, 7 + dist * .22]; T = [b.x, b.y, Math.max(.3, b.z * .6)]; }
      else { C = [b.x * .2, 24 + dist * .05, 8 + dist * .2]; T = [b.x, b.y, Math.max(.3, b.z * .6)]; fov = 48; }
    } else if (view === 'drone') { C = [0, 26, 30]; T = [0, 1, 0]; fov = 50; }
    else if (view === 'tv') { C = [1.3, -25.5, 7.2]; T = [0, 5.5, .2]; fov = 40; }
    else { C = [.3, 24, 8.2]; T = [0, -.5, 0]; fov = 42; } // high behind the batsman, like Stick Cricket
    const k = 1 - Math.exp(-dt * (playing ? 3.2 : 4.5)), kl = playing ? 1 - Math.exp(-dt * 6) : k;
    if (!this.inited) { this.C = C.slice(); this.T = T.slice(); this.inited = true; }
    for (let i = 0; i < 3; i++) { this.C[i] += (C[i] - this.C[i]) * k; this.T[i] += (T[i] - this.T[i]) * kl; }
    this.fov += (fov - this.fov) * k;
    if (R.shake > .3) { this.C[0] += U.rand(-1, 1) * R.shake * .01; this.C[2] += U.rand(-1, 1) * R.shake * .01; }
    this.basis();
  },

  // ---------------- scene ----------------
  draw(P, dt) {
    const g = R.ctx; g.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);
    R.time = P ? P.t : (R.time || 0) + dt;
    this.updCamera(P, dt);
    const night = !!R.night;
    // sky
    const sky = g.createLinearGradient(0, 0, 0, R.H * .6);
    if (night) { sky.addColorStop(0, '#060d22'); sky.addColorStop(1, '#1b2c55'); } else { sky.addColorStop(0, '#5b9be0'); sky.addColorStop(1, '#cfe6fb'); }
    g.fillStyle = sky; g.fillRect(0, 0, R.W, R.H);
    this.drawStands(g, night);
    this.drawField(g, night);
    if (!P || !P.m) return;
    // markers on the ground
    const d = P.del;
    if (P.phase === 'setup' && P.userBowling() && UI.bowlTarget) this.marker(g, UI.bowlTarget.x, UI.bowlTarget.y, '#f5c518', .45, true);
    if (d && P.phase === 'flight' && d.bounceAt && P.userBatting() && !P.auto) { g.globalAlpha = U.clamp(1 - Math.abs(d.t - d.bounceAt.t) * 3, 0, .85); this.marker(g, d.bounceAt.x, d.bounceAt.y, '#ffffff', .22); g.globalAlpha = 1; }
    // depth-sorted actors
    const people = [...P.fielders, P.keeper, P.bowlerEnt, P.bat1, P.bat2, ...(P.umps || [])];
    const items = [];
    people.forEach(p => { const c = this.cam3(p.x, p.y, 0); if (c[2] > this.near + .3) items.push({ z: c[2], f: () => this.person(g, p) }); });
    [['s', STUMP_Y], ['ns', -STUMP_Y]].forEach(([k, y]) => { const c = this.cam3(0, y, 0); if (c[2] > this.near) items.push({ z: c[2] + .05, f: () => this.stumps(g, y, P.stumpsBroken[k]) }); });
    if (P.ball) { const b = P.ball, c = this.cam3(b.x, b.y, 0); if (c[2] > this.near) items.push({ z: c[2] - .02, f: () => this.ball(g, b, P.fire && P.userBatting()) }); }
    items.sort((a, b) => b.z - a.z).forEach(i => i.f());
    if (night) { g.save(); g.globalCompositeOperation = 'multiply'; g.fillStyle = 'rgba(150,165,215,.35)'; g.fillRect(0, 0, R.W, R.H); g.restore(); }
  },
  drawStands(g, night) {
    const R0 = BOUNDARY_R + 6, n = 72, tiers = 7;
    if (!this.crowd) { // deterministic crowd
      let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
      const cols = ['#f5c518', '#ffffff', '#e84a3a', '#f7a8c4', '#2a2a2a', '#7fd1ae', '#ffd8a8', '#3b82f6', '#ff8a3d', '#b5121b'];
      this.crowd = []; for (let s = 0; s < n * 6; s++) for (let t = 0; t < tiers; t++) if (rnd() > .1) this.crowd.push({ a: (s + rnd()) / (n * 6) * Math.PI * 2, t: t + .55, c: cols[(rnd() * cols.length) | 0], ph: rnd() * 6.28 });
    }
    const pt = (a, t) => { const r = R0 + t * 4, h = t * 2.3; return [Math.cos(a) * r, Math.sin(a) * r, h]; };
    const segs = [];
    for (let s = 0; s < n; s++) {
      const a0 = s / n * Math.PI * 2, a1 = (s + 1) / n * Math.PI * 2, mid = pt((a0 + a1) / 2, 2);
      const c = this.cam3(mid[0], mid[1], mid[2]); if (c[2] < 2) continue;
      segs.push({ a0, a1, z: c[2] });
    }
    segs.sort((a, b) => b.z - a.z);
    for (const s of segs) {
      for (let t = 0; t < tiers; t++) this.fillPoly(g, [pt(s.a0, t), pt(s.a1, t), pt(s.a1, t + 1), pt(s.a0, t + 1)], night ? (t % 2 ? '#142a50' : '#17325e') : (t % 2 ? '#2a5c94' : '#3169a8'));
      this.fillPoly(g, [pt(s.a0, tiers), pt(s.a1, tiers), pt(s.a1, tiers + .6), pt(s.a0, tiers + .6)], night ? '#0a1530' : '#1d3f6b');
    }
    const cheer = (R.cheer || 0) > 0;
    for (const c of this.crowd) {
      const w = pt(c.a, c.t), cc = this.cam3(w[0], w[1], w[2]); if (cc[2] < 3) continue;
      const p = this.scr(cc), sz = Math.max(1.2, p.s * .62), hop = cheer ? Math.max(0, Math.sin(R.time * 13 + c.ph)) * sz * 1.2 : 0;
      g.fillStyle = c.c; g.fillRect(p.x - sz / 2, p.y - sz * 1.3 - hop, sz, sz * 1.3);
    }
    // floodlight towers
    [.25, .75, 1.25, 1.75].forEach(f => {
      const a = f * Math.PI, r = R0 + 34, base = [Math.cos(a) * r, Math.sin(a) * r, 0], top = [base[0], base[1], 50];
      if (this.cam3(...base)[2] < 5) return;
      this.line(g, base, top, '#3a4a66', Math.max(2, this.scaleAt(...top) * 1.2));
      const p = this.proj(...top), w = Math.max(6, p.s * 9), h = w * .55;
      g.fillStyle = '#3a4a66'; g.fillRect(p.x - w / 2, p.y - h, w, h);
      g.fillStyle = night ? '#fffbe0' : '#e6edf5'; for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) g.fillRect(p.x - w / 2 + w * (.07 + i * .235), p.y - h + h * (.12 + j * .45), w * .18, h * .33);
      if (night) { const gr = g.createRadialGradient(p.x, p.y - h / 2, 0, p.x, p.y - h / 2, w * 2.2); gr.addColorStop(0, 'rgba(255,250,220,.6)'); gr.addColorStop(1, 'rgba(255,250,220,0)'); g.fillStyle = gr; g.fillRect(p.x - w * 2.2, p.y - h / 2 - w * 2.2, w * 4.4, w * 4.4); }
    });
  },
  drawField(g, night) {
    const B = BOUNDARY_R, outer = [], inner = [];
    for (let i = 0; i < 96; i++) { const a = i / 96 * Math.PI * 2; outer.push([Math.cos(a) * (B + 6), Math.sin(a) * (B + 6), 0]); inner.push([Math.cos(a) * (B + .5), Math.sin(a) * (B + .5), 0]); }
    this.fillPoly(g, outer, night ? '#2f5d2a' : '#4b8638');
    // mown stripes clipped to the boundary
    const ip = this.poly(inner);
    if (ip.length > 2) {
      g.save(); this.path(g, ip); g.clip();
      g.fillStyle = night ? '#3f7a34' : '#5c9c41'; g.fillRect(0, 0, R.W, R.H);
      for (let x = -B - 6, i = 0; x < B + 6; x += 5.5, i++) if (i % 2) this.fillPoly(g, [[x, -B - 6, 0], [x + 5.5, -B - 6, 0], [x + 5.5, B + 6, 0], [x, B + 6, 0]], night ? '#4a8a3d' : '#6aab4b');
      // 30-yard circle (dashed)
      g.setLineDash([6, 6]);
      const ring = []; for (let i = 0; i <= 64; i++) { const a = i / 64 * Math.PI * 2; ring.push([Math.cos(a) * 27.4, Math.sin(a) * 27.4 + (Math.sin(a) > 0 ? 10.06 : -10.06), 0]); }
      for (let i = 0; i < 64; i++) this.line(g, ring[i], ring[i + 1], 'rgba(255,255,255,.7)', Math.max(1, this.scaleAt(...ring[i]) * .14));
      g.setLineDash([]);
      g.restore();
    }
    // rope + LED boards
    const rope = []; for (let i = 0; i <= 96; i++) { const a = i / 96 * Math.PI * 2; rope.push([Math.cos(a) * B, Math.sin(a) * B, .05]); }
    for (let i = 0; i < 96; i++) this.line(g, rope[i], rope[i + 1], (Play.m && Play.m.teamColor) || '#f5c518', Math.max(1.5, this.scaleAt(...rope[i]) * .25));
    this.drawBoards(g);
    // pitch & creases
    this.fillPoly(g, [[-1.7, -12, 0], [1.7, -12, 0], [1.7, 12, 0], [-1.7, 12, 0]], night ? '#a98a5d' : '#d8b47a');
    this.fillPoly(g, [[-1.2, -8, 0], [1.2, -8, 0], [1.2, 8, 0], [-1.2, 8, 0]], night ? 'rgba(255,255,255,.04)' : 'rgba(255,255,255,.08)');
    const cw = (y) => Math.max(1, this.scaleAt(0, y) * .07), cr = '#fbf8ef';
    [1, -1].forEach(s => {
      const pop = 8.84 * s, bowl = 10.06 * s;
      this.line(g, [-1.83, pop, 0], [1.83, pop, 0], cr, cw(pop));
      this.line(g, [-1.32, bowl, 0], [1.32, bowl, 0], cr, cw(bowl));
      this.line(g, [-1.32, pop, 0], [-1.32, bowl + s * 1.2, 0], cr, cw(bowl));
      this.line(g, [1.32, pop, 0], [1.32, bowl + s * 1.2, 0], cr, cw(bowl));
      this.line(g, [-.89, pop, 0], [-.89, pop - s * .5, 0], cr, cw(pop));
      this.line(g, [.89, pop, 0], [.89, pop - s * .5, 0], cr, cw(pop));
    });
  },
  drawBoards(g) {
    const n = 64, r = BOUNDARY_R + 2.2;
    const brands = [['FRONTPAGE STUDIOS', '#f5c518', '#0f1d33'], ['OVERHEAD CRICKET', '#0f1d33', '#ffffff'], ['ANTARAGA DESIGNS', '#e8443a', '#ffffff'], ['SIX ZONE', '#2f66a3', '#ffffff']];
    const segs = [];
    for (let s = 0; s < n; s++) { const a0 = s / n * Math.PI * 2, a1 = (s + .96) / n * Math.PI * 2; const c = this.cam3(Math.cos((a0 + a1) / 2) * r, Math.sin((a0 + a1) / 2) * r, .5); if (c[2] > 1) segs.push({ s, a0, a1, z: c[2] }); }
    segs.sort((a, b) => b.z - a.z);
    const flash = (R.cheer || 0) > 0;
    for (const sg of segs) {
      const b = brands[Math.floor(sg.s / 4) % brands.length];
      const p = this.poly([[Math.cos(sg.a0) * r, Math.sin(sg.a0) * r, 0], [Math.cos(sg.a1) * r, Math.sin(sg.a1) * r, 0], [Math.cos(sg.a1) * r, Math.sin(sg.a1) * r, 1], [Math.cos(sg.a0) * r, Math.sin(sg.a0) * r, 1]]);
      if (p.length < 4) continue;
      const on = flash && (Math.floor(R.time * 8) + sg.s) % 2;
      this.path(g, p); g.fillStyle = on ? '#ffffff' : b[1]; g.fill();
      const len = Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y), hgt = Math.abs(p[3].y - p[0].y);
      if (sg.s % 4 === 1 && len > 50 && hgt > 7) {
        g.save(); g.translate((p[0].x + p[2].x) / 2, (p[0].y + p[2].y) / 2); let ang = Math.atan2(p[1].y - p[0].y, p[1].x - p[0].x); if (p[1].x < p[0].x) ang += Math.PI; g.rotate(ang);
        g.fillStyle = on ? '#0f1d33' : b[2]; g.font = `900 ${Math.min(hgt * .7, 24)}px Roboto, system-ui, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(b[0], 0, 1); g.restore();
      }
    }
  },
  marker(g, x, y, col, r, cross) {
    const pts = []; for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r, .01]); }
    const p = this.poly(pts); if (p.length < 3) return;
    this.path(g, p); g.strokeStyle = col; g.lineWidth = Math.max(2, this.scaleAt(x, y) * .07); g.stroke();
    if (cross) { this.line(g, [x - r, y, 0], [x + r, y, 0], col, Math.max(2, this.scaleAt(x, y) * .05)); this.line(g, [x, y - r, 0], [x, y + r, 0], col, Math.max(2, this.scaleAt(x, y) * .05)); }
  },
  stumps(g, y, broken) {
    const s = this.scaleAt(0, y);
    for (let i = -1; i <= 1; i++) {
      const tilt = broken ? i * .35 + .15 : 0;
      this.line(g, [i * .11, y, 0], [i * .11 + Math.sin(tilt) * .7, y - (broken ? .25 : 0), Math.cos(tilt) * .71], '#efe2c2', Math.max(2, s * .045));
    }
    if (!broken) this.line(g, [-.13, y, .72], [.13, y, .72], '#d6232a', Math.max(1.5, s * .03));
  },
  ball(g, b, fire) {
    // soft shadow on the grass
    const sh = this.proj(b.x, b.y, 0), s = sh.s;
    g.fillStyle = `rgba(10,30,15,${U.clamp(.42 - b.z * .04, .1, .42)})`; g.beginPath(); g.ellipse(sh.x, sh.y, Math.max(2, s * .13), Math.max(1, s * .05), 0, 0, Math.PI * 2); g.fill();
    // trail
    const tr = b.trail || [];
    for (let i = 1; i < tr.length; i++) {
      const a = this.proj(tr[i - 1].x, tr[i - 1].y, tr[i - 1].z), c = this.proj(tr[i].x, tr[i].y, tr[i].z), f = i / tr.length;
      g.strokeStyle = fire ? `rgba(255,${120 + i * 6},40,${f * .8})` : `rgba(255,255,255,${f * .55})`; g.lineWidth = Math.max(1, c.s * (fire ? .16 : .09) * f); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(c.x, c.y); g.stroke();
    }
    const p = this.proj(b.x, b.y, b.z), r = Math.max(4, p.s * .13);
    g.fillStyle = 'rgba(255,255,255,.22)'; g.beginPath(); g.arc(p.x, p.y, r * 2, 0, Math.PI * 2); g.fill();
    g.fillStyle = fire ? '#ffb070' : '#fbfbf6'; g.beginPath(); g.arc(p.x, p.y, r, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 1; g.stroke();
    g.fillStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.arc(p.x - r * .35, p.y - r * .35, r * .3, 0, Math.PI * 2); g.fill();
  },
  person(g, p) {
    // simple soft contact shadow (no long smears)
    const P = this.proj(p.x, p.y, 0), s = P.s;
    g.fillStyle = 'rgba(12,35,16,.28)'; g.beginPath(); g.ellipse(P.x + s * .12, P.y, s * .42, s * .13, 0, 0, Math.PI * 2); g.fill();
    R.isoPerson(p);
  },
};
