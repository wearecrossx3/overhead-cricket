'use strict';
// ================= 3D ENGINE (three.js r149) =================
// World coords from the game: x = lateral (+ off side for a right-hander), y = along pitch (+ towards striker), z = height.
// three.js coords: X = x, Y = z (up), Z = y.
const V3 = (x, y, z = 0) => new THREE.Vector3(x, z, y);

const S3 = {
  ok: false, rigs: new Map(), t: 0,
  camPos: null, camLook: null,

  init() {
    try {
      if (!window.THREE) return false;
      const cv = document.getElementById('gl');
      const r = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' });
      r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
      cv.addEventListener('webglcontextlost', (e) => e.preventDefault(), false);
      r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer = r;
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(50, 1, .1, 600);
      this.camPos = new THREE.Vector3(0, 4, -22); this.camLook = new THREE.Vector3(0, 1, 6);
      this.toon = this.makeGradient();
      this.matCache = {};
      this.buildLights(); this.buildGround(); this.buildStadium(); this.buildProps();
      this.resize(); window.addEventListener('resize', () => this.resize());
      this.ok = true;
      return true;
    } catch (e) { console.error('3D init failed', e); this.ok = false; return false; }
  },
  resize() {
    if (!this.renderer) return;
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false); this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.W = w; this.H = h;
  },
  makeGradient() {
    const d = new Uint8Array([95, 95, 95, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
    const t = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat); t.minFilter = t.magFilter = THREE.NearestFilter; t.needsUpdate = true; return t;
  },
  mat(color, opts = {}) {
    const key = color + JSON.stringify(opts);
    if (!this.matCache[key]) this.matCache[key] = new THREE.MeshToonMaterial({ color, gradientMap: this.toon, ...opts });
    return this.matCache[key];
  },
  canvasTex(w, h, draw, repeat) {
    const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.anisotropy = 4;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    return t;
  },

  // ---------- lights & sky ----------
  buildLights() {
    this.hemi = new THREE.HemisphereLight(0xdfeaff, 0x3f6a32, .62); this.scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xfff1dc, .92);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera; sc.left = -34; sc.right = 34; sc.top = 34; sc.bottom = -34; sc.near = 1; sc.far = 160;
    sun.shadow.bias = -.0006; sun.shadow.normalBias = .03; sun.shadow.radius = 3;
    this.sun = sun; this.scene.add(sun); this.scene.add(sun.target);
    this.scene.fog = new THREE.Fog(0x9ed0ff, 140, 420);
    // sky dome with vertical gradient
    const skyTex = (night) => this.canvasTex(4, 256, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      if (night) { gr.addColorStop(0, '#040a1c'); gr.addColorStop(.6, '#0d1e44'); gr.addColorStop(1, '#22345f'); }
      else { gr.addColorStop(0, '#3e86d6'); gr.addColorStop(.55, '#8cc4f2'); gr.addColorStop(1, '#f5e6c8'); }
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
    });
    this.skyDay = skyTex(false); this.skyNight = skyTex(true);
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(400, 24, 12), new THREE.MeshBasicMaterial({ map: this.skyDay, side: THREE.BackSide, fog: false }));
    this.scene.add(this.sky);
  },
  setNight(n) {
    if (this.night === n) return; this.night = n;
    this.sky.material.map = n ? this.skyNight : this.skyDay; this.sky.material.needsUpdate = true;
    this.hemi.color.set(n ? 0x8fa3d6 : 0xe4f1ff); this.hemi.groundColor.set(n ? 0x1f3a22 : 0x4f7a3a); this.hemi.intensity = n ? .55 : .62;
    this.sun.color.set(n ? 0xf4f8ff : 0xfff1dc); this.sun.intensity = n ? .95 : .92;
    this.scene.fog.color.set(n ? 0x0d1e44 : 0x9ed0ff);
    this.lampHeads.forEach(m => { m.material = this.mat(n ? '#fffbe6' : '#dfe6ee', { emissive: n ? 0xfff6cc : 0x000000, emissiveIntensity: n ? 1 : 0 }); });
    this.glows.forEach(s => s.visible = n);
  },

  // ---------- ground, pitch, rope ----------
  buildGround() {
    const RAD = 96, B = BOUNDARY_R;
    const tex = this.canvasTex(2048, 2048, (g, w) => {
      const s = w / (RAD * 2), c = w / 2;
      g.fillStyle = '#4b8638'; g.fillRect(0, 0, w, w);
      // mowing stripes inside boundary
      g.save(); g.beginPath(); g.arc(c, c, (B + 1.5) * s, 0, Math.PI * 2); g.clip();
      for (let x = 0, i = 0; x < w; x += 5.5 * s, i++) { g.fillStyle = i % 2 ? '#6aab4b' : '#5c9c41'; g.fillRect(x, 0, 5.5 * s + 1, w); }
      // square (lighter block around the pitch)
      g.fillStyle = 'rgba(255,255,230,.07)'; g.fillRect(c - 10 * s, c - 15 * s, 20 * s, 30 * s);
      g.restore();
      // speckle for texture
      for (let i = 0; i < 26000; i++) { g.fillStyle = Math.random() < .5 ? 'rgba(0,40,0,.08)' : 'rgba(255,255,220,.06)'; g.fillRect(Math.random() * w, Math.random() * w, 2, 2); }
      // 30-yard circle
      g.setLineDash([.9 * s, .9 * s]); g.lineWidth = .16 * s; g.strokeStyle = 'rgba(255,255,255,.8)';
      g.beginPath(); g.arc(c, c - 10.06 * s, 27.4 * s, Math.PI, 0); g.lineTo(c + 27.4 * s, c + 10.06 * s); g.arc(c, c + 10.06 * s, 27.4 * s, 0, Math.PI); g.closePath(); g.stroke();
    });
    const ground = new THREE.Mesh(new THREE.CircleGeometry(RAD, 96), new THREE.MeshLambertMaterial({ map: tex }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; this.scene.add(ground);
    // pitch
    const ptex = this.canvasTex(256, 2048, (g, w, h) => {
      const s = h / 24; // px per metre (pitch plane 3.05 x 24, top row = bowler end, y = -12)
      g.fillStyle = '#d6b27a'; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 9000; i++) { g.fillStyle = Math.random() < .5 ? 'rgba(120,80,30,.12)' : 'rgba(255,240,200,.12)'; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
      g.fillStyle = 'rgba(150,105,55,.13)';
      [-6.5, 6.5].forEach(y => { g.beginPath(); g.ellipse(w / 2, (y + 12) * s, w * .3, 2.4 * s, 0, 0, Math.PI * 2); g.fill(); });
      g.fillStyle = 'rgba(90,150,60,.35)'; g.fillRect(0, 0, w * .07, h); g.fillRect(w * .93, 0, w * .07, h);
      const X = (x) => w / 2 + x / 3.05 * w, Y = (y) => (y + 12) * s;
      g.strokeStyle = '#fbf8ef'; g.lineWidth = .07 * s;
      [1, -1].forEach(sg => {
        const pop = 8.84 * sg, bowl = 10.06 * sg;
        g.beginPath(); g.moveTo(0, Y(pop)); g.lineTo(w, Y(pop)); g.stroke();
        g.beginPath(); g.moveTo(X(-1.32), Y(bowl)); g.lineTo(X(1.32), Y(bowl)); g.stroke();
        g.beginPath(); g.moveTo(X(-1.32), Y(pop)); g.lineTo(X(-1.32), Y(bowl + sg * 1.2)); g.stroke();
        g.beginPath(); g.moveTo(X(1.32), Y(pop)); g.lineTo(X(1.32), Y(bowl + sg * 1.2)); g.stroke();
        g.beginPath(); g.moveTo(X(-.89), Y(pop)); g.lineTo(X(-.89), Y(pop - sg * .5)); g.stroke();
        g.beginPath(); g.moveTo(X(.89), Y(pop)); g.lineTo(X(.89), Y(pop - sg * .5)); g.stroke();
      });
    });
    const pitch = new THREE.Mesh(new THREE.PlaneGeometry(3.05, 24), new THREE.MeshLambertMaterial({ map: ptex }));
    pitch.rotation.x = -Math.PI / 2; pitch.position.y = .012; pitch.receiveShadow = true; this.scene.add(pitch);
    // rope / cushion
    const rope = new THREE.Mesh(new THREE.TorusGeometry(B, .12, 6, 160), this.mat('#f5c518'));
    rope.rotation.x = Math.PI / 2; rope.position.y = .1; this.scene.add(rope); this.rope = rope;
  },

  // ---------- stadium: tiered stands with crowd, LED boards, sight screens, floodlights ----------
  buildStadium() {
    const pts = []; let r = 70, h = 0;
    pts.push(new THREE.Vector2(r, 0));
    for (let i = 0; i < 9; i++) { h += 2.4; pts.push(new THREE.Vector2(r, h)); r += 3.2; pts.push(new THREE.Vector2(r, h)); }
    pts.push(new THREE.Vector2(r, h + 4)); pts.push(new THREE.Vector2(r + 3, h + 4));
    const stands = new THREE.Mesh(new THREE.LatheGeometry(pts, 96), this.mat('#27598f', { side: THREE.DoubleSide }));
    stands.receiveShadow = true; this.scene.add(stands);
    // roof canopy
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(r + 2, r - 8, 1.2, 96, 1, true), this.mat('#1d3f6b', { side: THREE.DoubleSide }));
    roof.position.y = h + 9; this.scene.add(roof);
    // crowd (instanced)
    const cols = ['#f5c518', '#ffffff', '#e84a3a', '#f7a8c4', '#2a2a2a', '#7fd1ae', '#ffd8a8', '#3b82f6', '#ff8a3d', '#b5121b'].map(c => new THREE.Color(c));
    const geo = new THREE.BoxGeometry(.62, .95, .5);
    const PER = 560, N = 9 * PER;
    const crowd = new THREE.InstancedMesh(geo, new THREE.MeshLambertMaterial({}), N);
    const m4 = new THREE.Matrix4(); this.crowdData = [];
    let k = 0;
    for (let t = 0; t < 9; t++) {
      const rr = 70 + t * 3.2 + 1.6, hh = (t + 1) * 2.4 + .42;
      for (let i = 0; i < PER; i++, k++) {
        const a = (i + Math.random() * .5) / PER * Math.PI * 2;
        // gaps behind the sight screens
        const nearEnd = Math.abs(Math.sin(a)) > .985;
        const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
        m4.makeRotationY(-a); m4.setPosition(x, nearEnd ? -50 : hh, z);
        crowd.setMatrixAt(k, m4); crowd.setColorAt(k, cols[(Math.random() * cols.length) | 0]);
        this.crowdData.push({ x, z, h: nearEnd ? -50 : hh, a, ph: Math.random() * 6.28 });
      }
    }
    crowd.instanceMatrix.needsUpdate = true; this.crowd = crowd; this.scene.add(crowd);
    // LED boards (cylinder strip with a brand texture)
    const btex = this.canvasTex(2048, 64, (g, w, hh) => {
      const brands = [['FRONTPAGE STUDIOS', '#f5c518', '#0f1d33'], ['OVERHEAD CRICKET', '#0f1d33', '#ffffff'], ['ANTARAGA DESIGNS', '#e8443a', '#ffffff'], ['SIX ZONE', '#2f66a3', '#ffffff']];
      const seg = w / brands.length;
      brands.forEach(([t, bg, fg], i) => { g.fillStyle = bg; g.fillRect(i * seg, 0, seg, hh); g.fillStyle = fg; g.font = '900 40px Roboto, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(t, i * seg + seg / 2, hh / 2 + 2); });
    }, [-7, 1]);
    const boards = new THREE.Mesh(new THREE.CylinderGeometry(BOUNDARY_R + 2.2, BOUNDARY_R + 2.2, 1, 128, 1, true), new THREE.MeshBasicMaterial({ map: btex, side: THREE.BackSide }));
    boards.position.y = .5; this.scene.add(boards); this.boards = boards;
    // sight screens
    [-1, 1].forEach(sg => {
      const s = new THREE.Mesh(new THREE.BoxGeometry(16, 7, .6), this.mat('#eef1f4'));
      s.position.set(0, 3.5, sg * (BOUNDARY_R + 4.5)); s.castShadow = true; this.scene.add(s);
    });
    // floodlight towers
    this.lampHeads = []; this.glows = [];
    const glowTex = this.canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,250,220,1)'); gr.addColorStop(1, 'rgba(255,250,220,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
    [.25, .75, 1.25, 1.75].forEach(f => {
      const a = f * Math.PI, R0 = 104;
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(.6, 1.1, 52, 8), this.mat('#3a4a66'));
      pole.position.set(Math.cos(a) * R0, 26, Math.sin(a) * R0); this.scene.add(pole);
      const head = new THREE.Mesh(new THREE.BoxGeometry(9, 5, 1.2), this.mat('#dfe6ee'));
      head.position.set(Math.cos(a) * R0, 53, Math.sin(a) * R0); head.lookAt(0, 0, 0); this.scene.add(head); this.lampHeads.push(head);
      const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
      glow.scale.set(40, 40, 1); glow.position.copy(head.position); glow.visible = false; this.scene.add(glow); this.glows.push(glow);
    });
  },
  cheer(on, dt) {
    if (!this.crowd) return;
    const amp = on ? 1 : 0; if (!on && !this.wasCheering) return;
    this.wasCheering = on;
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < this.crowdData.length; i += 1) {
      const c = this.crowdData[i]; if (c.h < 0) continue;
      const hop = amp * Math.max(0, Math.sin(this.t * 13 + c.ph)) * .7;
      m4.makeRotationY(-c.a); m4.setPosition(c.x, c.h + hop, c.z); this.crowd.setMatrixAt(i, m4);
    }
    this.crowd.instanceMatrix.needsUpdate = true;
  },

  // ---------- stumps, ball, markers ----------
  buildProps() {
    this.stumps = {};
    [['s', STUMP_Y], ['ns', -STUMP_Y]].forEach(([key, y]) => {
      const grp = new THREE.Group(); grp.position.copy(V3(0, y, 0));
      const parts = [];
      for (let i = -1; i <= 1; i++) { const s = new THREE.Mesh(new THREE.CylinderGeometry(.022, .022, .72, 8), this.mat('#f0e2bf')); s.position.set(i * .11, .36, 0); s.castShadow = true; grp.add(s); parts.push({ m: s, home: s.position.clone(), v: new THREE.Vector3(), w: 0 }); }
      for (let i = 0; i < 2; i++) { const b = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, .11, 6), this.mat('#d6232a')); b.rotation.z = Math.PI / 2; b.position.set(-.055 + i * .11, .73, 0); grp.add(b); parts.push({ m: b, home: b.position.clone(), v: new THREE.Vector3(), w: 0, bail: true }); }
      this.scene.add(grp); this.stumps[key] = { grp, parts, broken: false };
    });
    // ball (enlarged for readability) + blob shadow + trail
    this.ballMesh = new THREE.Mesh(new THREE.SphereGeometry(.075, 16, 12), new THREE.MeshLambertMaterial({ color: 0xfafaf6, emissive: 0x222222 }));
    this.ballMesh.castShadow = true; this.scene.add(this.ballMesh);
    this.ballBlob = new THREE.Mesh(new THREE.CircleGeometry(.12, 16), new THREE.MeshBasicMaterial({ color: 0x0b2412, transparent: true, opacity: .45, depthWrite: false }));
    this.ballBlob.rotation.x = -Math.PI / 2; this.scene.add(this.ballBlob);
    const TL = 22; this.trailPos = new Float32Array(TL * 3); this.trailCol = new Float32Array(TL * 3);
    const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(this.trailPos, 3)); tg.setAttribute('color', new THREE.BufferAttribute(this.trailCol, 3));
    this.trail = new THREE.Line(tg, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: .85 })); this.trail.frustumCulled = false; this.scene.add(this.trail);
    // pitch spot + bowling target markers
    const ring = (c, r1, r2) => { const m = new THREE.Mesh(new THREE.RingGeometry(r1, r2, 32), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: .9, depthWrite: false })); m.rotation.x = -Math.PI / 2; m.visible = false; this.scene.add(m); return m; };
    this.spot = ring(0xffffff, .14, .24); this.target = ring(0xf5c518, .38, .55);
    const cross = new THREE.Mesh(new THREE.PlaneGeometry(.5, .06), new THREE.MeshBasicMaterial({ color: 0xf5c518 })); cross.rotation.x = -Math.PI / 2; this.target.add(cross);
    const cross2 = cross.clone(); cross2.rotation.z = Math.PI / 2; cross2.rotation.x = 0; cross.add(cross2);
  },

  // ================= CHARACTERS =================
  makeRig(o) {
    const M = (c) => this.mat(c);
    const cap = (r, l, c) => { const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, l, 4, 10), M(c)); m.castShadow = true; return m; };
    const box = (w, h, d, c) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M(c)); m.castShadow = true; return m; };
    const sph = (r, c, sx = 1, sy = 1, sz = 1) => { const m = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), M(c)); m.scale.set(sx, sy, sz); m.castShadow = true; return m; };
    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    const hips = new THREE.Group(); hips.position.y = .93; body.add(hips);
    const pel = sph(.18, o.trouser, 1.05, .8, .85); hips.add(pel);
    const spine = new THREE.Group(); spine.position.y = .04; hips.add(spine);
    const torso = cap(.2, .26, o.shirt); torso.position.y = .29; torso.scale.set(1.08, 1, .78); spine.add(torso);
    if (o.stripe) { const st = new THREE.Mesh(new THREE.CylinderGeometry(.212, .212, .055, 14), M(o.stripe)); st.position.y = .38; st.scale.set(1.08, 1, .8); spine.add(st); }
    // collar
    const col = new THREE.Mesh(new THREE.TorusGeometry(.085, .02, 6, 12), M(o.stripe || o.shirt)); col.rotation.x = Math.PI / 2; col.position.y = .56; spine.add(col);
    const neck = new THREE.Group(); neck.position.y = .57; spine.add(neck);
    const head = new THREE.Group(); head.position.y = .14; neck.add(head);
    head.add(sph(.135, o.skin, 1, 1.07, 1));
    const nose = sph(.03, shade(o.skin, -15)); nose.position.set(0, -.01, -.13); head.add(nose);
    if (o.helmet) {
      const shell = new THREE.Mesh(new THREE.SphereGeometry(.158, 16, 10, 0, Math.PI * 2, 0, Math.PI * .56), M(o.helmet)); shell.position.y = .01; shell.castShadow = true; head.add(shell);
      const peak = box(.24, .025, .1, o.helmet); peak.position.set(0, .03, -.15); head.add(peak);
      for (let i = 0; i < 3; i++) { const bar = box(.2, .012, .012, '#b9c1cb'); bar.position.set(0, -.03 - i * .045, -.165); head.add(bar); }
      const vb = box(.012, .14, .012, '#b9c1cb'); vb.position.set(0, -.07, -.168); head.add(vb);
      const crest = box(.04, .02, .2, o.stripe || '#fff'); crest.position.set(0, .16, -.01); head.add(crest);
    } else if (o.hat) {
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(.27, .27, .015, 18), M('#efe6cf')); brim.position.y = .09; brim.castShadow = true; head.add(brim);
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(.12, .14, .12, 14), M('#efe6cf')); crown.position.y = .15; head.add(crown);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(.141, .141, .025, 14), M('#1b1b1b')); band.position.y = .11; head.add(band);
    } else if (o.cap) {
      const dome = new THREE.Mesh(new THREE.SphereGeometry(.142, 14, 8, 0, Math.PI * 2, 0, Math.PI * .5), M(o.capColor || o.shirt)); dome.position.y = .02; head.add(dome);
      const brim = box(.18, .016, .14, o.capColor || o.shirt); brim.position.set(0, .03, -.15); head.add(brim);
    } else {
      const hair = new THREE.Mesh(new THREE.SphereGeometry(.142, 14, 8, 0, Math.PI * 2, 0, Math.PI * .5), M(o.hair || '#1b1410')); hair.position.y = .015; head.add(hair);
    }
    // arms
    const arm = (side) => {
      const sh = new THREE.Group(); sh.position.set(side * .25, .45, 0); spine.add(sh);
      const sleeve = cap(.072, .1, o.shirt); sleeve.position.y = -.07; sh.add(sleeve);
      const up = cap(.058, .17, o.skin); up.position.y = -.15; sh.add(up);
      const el = new THREE.Group(); el.position.y = -.28; sh.add(el);
      const fa = cap(.052, .17, o.skin); fa.position.y = -.12; el.add(fa);
      const hand = o.gloves ? box(.1, .11, .1, o.gloveColor || '#f6f6f2') : sph(.055, o.skin); hand.position.y = -.27; el.add(hand);
      return { sh, el };
    };
    const L = arm(-1), Rr = arm(1);
    // legs
    const leg = (side) => {
      const hp = new THREE.Group(); hp.position.set(side * .1, -.03, 0); hips.add(hp);
      const th = cap(.088, .26, o.trouser); th.position.y = -.2; hp.add(th);
      const kn = new THREE.Group(); kn.position.y = -.42; hp.add(kn);
      if (o.pads) {
        const pad = box(.16, .46, .12, '#f7f5ef'); pad.position.set(0, -.18, -.04); kn.add(pad);
        const roll = box(.17, .1, .13, '#e9e6dc'); roll.position.set(0, .06, -.05); kn.add(roll);
        for (let i = -1; i <= 1; i++) { const rib = box(.012, .4, .02, '#d8d3c4'); rib.position.set(i * .045, -.18, -.105); kn.add(rib); }
      } else { const sh = cap(.07, .26, o.trouser); sh.position.y = -.2; kn.add(sh); }
      const shoe = box(.12, .08, .26, '#f4f4f0'); shoe.position.set(0, -.44, -.05); kn.add(shoe);
      const sole = box(.125, .025, .27, '#26303e'); sole.position.set(0, -.485, -.05); kn.add(sole);
      return { hp, kn };
    };
    const LL = leg(-1), RL = leg(1);
    // bat on a pivot in front of the chest (hands stay on the handle)
    let batPivot = null;
    if (o.bat) {
      batPivot = new THREE.Group(); batPivot.position.set(0, .06, -.34); spine.add(batPivot);
      const bat = new THREE.Group(); batPivot.add(bat);
      const handle = new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, .27, 8), M('#20242c')); handle.position.y = -.12; bat.add(handle);
      const blade = box(.108, .56, .045, o.batColor || '#ecd29c'); blade.position.y = -.52; bat.add(blade);
      const back = box(.06, .5, .03, shade(o.batColor || '#ecd29c', -25)); back.position.set(0, -.52, .03); bat.add(back);
      const flame = new THREE.Mesh(new THREE.BoxGeometry(.2, .66, .12), new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: .35, blending: THREE.AdditiveBlending, depthWrite: false }));
      flame.position.y = -.52; flame.visible = false; bat.add(flame);
      batPivot.userData.flame = flame;
    }
    root.scale.setScalar(1.12);
    root.traverse(m => { if (m.isMesh) m.castShadow = true; });
    this.scene.add(root);
    const rig = { root, body, hips, spine, neck, head, L, R: Rr, LL, RL, batPivot, cur: {}, o };
    return rig;
  },
  // signature for an entity's look → rebuild rig only when it changes
  sig(e) { return [e.kit.shirt, e.kit.trouser, e.kit.helmet, e.skin, e.hair, !!e.pads, !!e.gloves, !!e.helmet, !!e.cap, !!e.hat, !!e.holdsBat, e.batColor || ''].join('|'); },
  rigFor(e, key) {
    let r = this.rigs.get(key); const s = this.sig(e);
    if (r && r.s === s) return r.rig;
    if (r) { this.scene.remove(r.rig.root); }
    const rig = this.makeRig({ shirt: e.kit.shirt, trouser: e.kit.trouser, stripe: e.kit.stripe, helmet: e.helmet ? (e.kit.helmet || '#1d2d5c') : null, skin: e.skin || '#c48a5c', hair: e.hair, pads: e.pads, gloves: e.gloves, cap: e.cap, hat: e.hat, capColor: e.kit.head, bat: e.holdsBat, batColor: e.batColor, gloveColor: e.role === 'keeper' ? '#f2f2ee' : '#fafaf6' });
    this.rigs.set(key, { rig, s }); return rig;
  },
  // ---------- procedural poses ----------
  J(rig, name, x, y, z) { const c = rig.cur[name] || (rig.cur[name] = { x: 0, y: 0, z: 0 }); c.tx = x; c.ty = y; c.tz = z; },
  pose(rig, e, dt) {
    const t = e.t || 0, P = e.pose || 'stand';
    const J = (n, x = 0, y = 0, z = 0) => this.J(rig, n, x, y, z);
    // defaults
    let lower = 0, bodyRotZ = 0, bodyRotX = 0;
    J('hips'); J('spine'); J('head'); J('shL', 0, 0, -.12); J('shR', 0, 0, .12); J('elL', -.15); J('elR', -.15);
    J('hpL'); J('hpR'); J('knL'); J('knR'); J('bat');
    if (P === 'run') {
      const ph = t * 13, s = Math.sin(ph);
      J('hpL', s * .9); J('hpR', -s * .9); J('knL', -Math.max(0, -Math.sin(ph + .6)) * 1.4 - .2); J('knR', -Math.max(0, Math.sin(ph + .6)) * 1.4 - .2);
      J('shL', -s * .8, 0, -.15); J('shR', s * .8, 0, .15); J('elL', -1.3); J('elR', -1.3); J('spine', -.18);
      lower = -Math.abs(Math.cos(ph)) * .05;
    } else if (P === 'crouch') {
      J('hpL', .55, 0, -.1); J('hpR', .55, 0, .1); J('knL', -.9); J('knR', -.9); J('spine', -.45); J('shL', .7, 0, -.1); J('shR', .7, 0, .1); J('elL', -.4); J('elR', -.4); lower = -.14;
    } else if (P === 'keep') {
      J('hpL', 1.25, 0, -.35); J('hpR', 1.25, 0, .35); J('knL', -2.1); J('knR', -2.1); J('spine', -.55); J('shL', 1.1, 0, .15); J('shR', 1.1, 0, -.15); J('elL', -.3); J('elR', -.3); lower = -.42;
    } else if (P === 'bowl') {
      const a = Math.min(1, t / .42);
      J('shR', -a * Math.PI * 2 * .95 + .2, 0, .1); J('shL', 2.6 - a * 3.2, 0, -.2); J('elR', -.05); J('elL', -.3);
      J('hpL', .7 - a * .4); J('knL', -.2); J('hpR', -.6 + a * .8); J('knR', -.9 + a * .5); J('spine', .3 - a * .9);
    } else if (P === 'throw') {
      J('shR', -2.4, 0, .4); J('elR', -1.2); J('shL', 1.2, 0, -.3); J('spine', .2, .5); J('hpL', .5); J('knR', -.4);
    } else if (P === 'dive') {
      J('shL', -2.9, 0, -.2); J('shR', -2.9, 0, .2); J('elL', 0); J('elR', 0); J('hpL', -.2); J('hpR', .2); bodyRotZ = (e.diveSide || 1) * 1.3; lower = -.55;
    } else if (P === 'celebrate') {
      const w = Math.sin(t * 12) * .25;
      J('shL', -.3, 0, -2.6 + w); J('shR', -.3, 0, 2.6 - w); J('elL', -.3); J('elR', -.3); lower = Math.max(0, Math.sin(t * 9)) * .18;
    }
    // umpire signals
    const sg = e.signal;
    if (sg === 'six') { J('shL', 0, 0, -2.95); J('shR', 0, 0, 2.95); J('elL', 0); J('elR', 0); }
    if (sg === 'out') { J('shR', -3.0, 0, .1); J('elR', 0); }
    if (sg === 'four') { const w = Math.sin(t * 8); J('shR', -1.4, 0, .3 + w * .9); J('elR', -.1); }
    if (sg === 'wide') { J('shL', 0, 0, -1.55); J('shR', 0, 0, 1.55); J('elL', 0); J('elR', 0); }
    if (sg === 'nb') { J('shR', 0, 0, 1.55); J('elR', 0); }
    if (sg === 'bye') { J('shR', -3.0, 0, .2); J('elR', -.2); }
    // batter
    if (P === 'bat' && rig.batPivot) {
      const sh = Play.shot && e === Play.bat1 ? Play.shot : null;
      const sp = U.clamp((2.2 - (e.bat ?? 2.2)) / 3.4, 0, 1); // swing progress
      const bl = e.backlift || 0;
      J('hpL', .3, 0, -.2); J('hpR', .25, 0, .2); J('knL', -.45); J('knR', -.5); J('spine', -.3); J('head', -.1, 1.25);
      lower = -.07;
      // bat path: stance (pointing down, behind) → backlift (up behind shoulder) → swing through → follow-through
      let bx, bz;
      if (sp <= 0) { bx = -.25 + bl * -2.0; bz = bl * .3; }
      else {
        const loft = sh && sh.loft, block = sh && sh.block;
        if (block) { bx = U.lerp(-.6, .3, sp); bz = 0; }
        else { bx = sp < .55 ? U.lerp(-2.1, .2, sp / .55) : U.lerp(.2, loft ? 2.6 : 2.2, (sp - .55) / .45); bz = sp * (loft ? .9 : .5); }
        // shot direction: twist the upper body towards where the ball is going
        const dir = sh ? (sh.tap ? (-Math.PI / 2 + (sh.nudge || 0)) : sh.angle) : -Math.PI / 2;
        J('spine', -.3 + sp * .2, U.clamp((dir + Math.PI / 2) * .5, -.6, .6) - sp * .5);
        J('hpL', .3 + sp * .5, 0, -.2);
      }
      J('bat', bz, 0, -bx); // swing happens along the pitch line (local X), small tilt towards the off side
      // arms reach the handle (computed below after smoothing)
    }
    // smoothing + apply
    const k = 1 - Math.exp(-dt * (P === 'bat' ? 30 : 16));
    const map = { hips: rig.hips, spine: rig.spine, head: rig.head, shL: rig.L.sh, shR: rig.R.sh, elL: rig.L.el, elR: rig.R.el, hpL: rig.LL.hp, hpR: rig.RL.hp, knL: rig.LL.kn, knR: rig.RL.kn, bat: rig.batPivot };
    for (const n in map) {
      const o = map[n]; if (!o) continue; const c = rig.cur[n]; if (!c) continue;
      c.x += (c.tx - c.x) * k; c.y += (c.ty - c.y) * k; c.z += (c.tz - c.z) * k;
      o.rotation.set(c.x, c.y, c.z);
    }
    // batter: arms point at the bat handle
    if (P === 'bat' && rig.batPivot) {
      const hand = rig.batPivot.position.clone();
      [rig.L, rig.R].forEach(a => {
        const d = hand.clone().sub(a.sh.position).normalize();
        a.sh.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), d); a.el.rotation.set(-.12, 0, 0);
      });
    }
    rig.body.position.y += ((lower) - rig.body.position.y) * k;
    rig.body.rotation.z += (bodyRotZ - rig.body.rotation.z) * k;
    rig.body.rotation.x += (bodyRotX - rig.body.rotation.x) * k;
    if (rig.batPivot) rig.batPivot.userData.flame.visible = !!e.fire;
  },

  // ================= per-frame sync & render =================
  frame(P, dt) {
    this.t += dt;
    this.setNight(!!R.night);
    const ents = [];
    if (P.m && P.bat1) {
      ents.push(['b1', P.bat1], ['b2', P.bat2], ['kp', P.keeper], ['bw', P.bowlerEnt]);
      P.fielders.forEach((f, i) => ents.push(['f' + i, f]));
      (P.umps || []).forEach((u, i) => ents.push(['u' + i, u]));
    }
    const live = new Set();
    for (const [key, e] of ents) {
      const rig = this.rigFor(e, key); live.add(key);
      rig.root.visible = true;
      rig.root.position.set(e.x, 0, e.y);
      rig.root.rotation.y = -(e.face || 0);
      if (e.pose === 'dive') e.diveSide = e.diveSide || (Math.random() < .5 ? 1 : -1); else e.diveSide = 0;
      this.pose(rig, e, dt);
    }
    for (const [key, r] of this.rigs) if (!live.has(key)) r.rig.root.visible = false;
    // stumps
    ['s', 'ns'].forEach(k => {
      const st = this.stumps[k], br = P.stumpsBroken ? P.stumpsBroken[k] : false;
      if (br && !st.broken) { st.broken = true; st.parts.forEach((p, i) => { p.v.set(U.rand(-1.5, 1.5), U.rand(1.5, 4), (k === 's' ? -1 : 1) * U.rand(1, 3)); p.w = U.rand(-8, 8); }); }
      if (!br && st.broken) { st.broken = false; st.parts.forEach(p => { p.m.position.copy(p.home); p.m.rotation.set(p.bail ? 0 : 0, 0, p.bail ? Math.PI / 2 : 0); }); }
      if (st.broken) st.parts.forEach(p => {
        if (!p.bail && p.m.rotation.x > 1.3) return;
        p.v.y -= 9.8 * dt; p.m.position.addScaledVector(p.v, dt * (p.bail ? 1 : .35));
        if (p.m.position.y < (p.bail ? .02 : .36)) { p.m.position.y = p.bail ? .02 : .36; p.v.multiplyScalar(.4); }
        if (!p.bail) { p.m.rotation.x = Math.min(1.35, p.m.rotation.x + Math.abs(p.w) * dt * .4); } else p.m.rotation.y += p.w * dt;
      });
    });
    // ball
    const b = P.ball;
    this.ballMesh.visible = this.ballBlob.visible = this.trail.visible = !!b;
    if (b) {
      this.ballMesh.position.set(b.x, Math.max(.075, b.z), b.y);
      const fire = P.fire && P.userBatting && P.userBatting();
      this.ballMesh.material.emissive.set(fire ? 0xff5a00 : 0x222222);
      this.ballBlob.position.set(b.x, .02, b.y); const s = 1 + b.z * .25; this.ballBlob.scale.set(s, s, s); this.ballBlob.material.opacity = U.clamp(.5 - b.z * .04, .12, .5);
      const tr = b.trail || [], n = this.trailPos.length / 3;
      for (let i = 0; i < n; i++) {
        const p = tr[Math.max(0, tr.length - n + i)] || b, f = i / n;
        this.trailPos[i * 3] = p.x; this.trailPos[i * 3 + 1] = Math.max(.07, p.z); this.trailPos[i * 3 + 2] = p.y;
        this.trailCol[i * 3] = 1 * f; this.trailCol[i * 3 + 1] = (fire ? .45 : 1) * f; this.trailCol[i * 3 + 2] = (fire ? .1 : 1) * f;
      }
      this.trail.geometry.attributes.position.needsUpdate = true; this.trail.geometry.attributes.color.needsUpdate = true;
    }
    // markers
    const d = P.del;
    const showSpot = d && P.phase === 'flight' && d.bounceAt && P.userBatting && P.userBatting() && !P.auto;
    this.spot.visible = !!showSpot;
    if (showSpot) { this.spot.position.set(d.bounceAt.x, .03, d.bounceAt.y); this.spot.material.opacity = U.clamp(1 - Math.abs(d.t - d.bounceAt.t) * 3, 0, .9); }
    const showT = P.phase === 'setup' && P.userBowling && P.userBowling() && UI.bowlTarget;
    this.target.visible = !!showT;
    if (showT) { this.target.position.set(UI.bowlTarget.x, .035, UI.bowlTarget.y); const s = 1 + Math.sin(this.t * 6) * .08; this.target.scale.set(s, s, s); }
    this.rope.material = this.mat((P.m && P.m.teamColor) || '#f5c518');
    this.cheer((R.cheer || 0) > 0, dt);
    this.updCamera(P, dt);
    this.renderer.render(this.scene, this.camera);
  },
  idle(dt) { this.t += dt; this.updCamera(null, dt); this.renderer.render(this.scene, this.camera); },

  // ---------- camera: 3 angles ----------
  camMode() { const v = (Save.data && Save.data.settings.view) || 'bat'; return ({ stick: 'bat', iso: 'tv', top: 'drone' })[v] || v; },
  updCamera(P, dt) {
    const mode = this.camMode();
    let pos, look, fov = 50;
    const b = P && P.ball, playing = P && (P.phase === 'inplay' || (P.phase === 'dead' && P.inplay));
    const bowlingView = P && P.userBowling && P.userBowling() && !P.auto;
    const view = (Game.demoOn || bowlingView) ? 'tv' : mode;
    if (P && playing && b) {
      const bp = new THREE.Vector3(b.x, Math.max(.3, b.z * .6), b.y);
      const dist = Math.hypot(b.x, b.y - (view === 'tv' ? -10 : 10));
      if (view === 'drone') { pos = new THREE.Vector3(b.x * .55, 34 + dist * .25, b.y * .55 + 20); look = new THREE.Vector3(b.x * .75, 0, b.y * .75); }
      else if (view === 'tv') { pos = new THREE.Vector3(b.x * .2, 7 + dist * .22, -24 - dist * .05); look = bp; }
      else { pos = new THREE.Vector3(b.x * .25, 5 + dist * .2, 17 + dist * .06); look = bp; fov = 52; }
    } else if (view === 'drone') { pos = new THREE.Vector3(0, 30, 21); look = new THREE.Vector3(0, 0, 1); }
    else if (view === 'tv') { pos = new THREE.Vector3(1.3, 7.2, -25.5); look = new THREE.Vector3(0, .2, 5.5); fov = 40; }
    else { pos = new THREE.Vector3(.35, 4.3, 20.5); look = new THREE.Vector3(0, .5, -1.5); fov = 44; } // behind the batsman, above the keeper (Stick Cricket)
    const k = 1 - Math.exp(-dt * (playing ? 3.2 : 4.5));
    if (!this.camInit) { this.camPos.copy(pos); this.camLook.copy(look); this.camInit = true; }
    this.camPos.lerp(pos, k); this.camLook.lerp(look, playing ? 1 - Math.exp(-dt * 6) : k);
    this.camera.position.copy(this.camPos);
    if (R.shake > .3) this.camera.position.add(new THREE.Vector3(U.rand(-1, 1), U.rand(-1, 1), 0).multiplyScalar(R.shake * .012));
    this.camera.lookAt(this.camLook);
    if (Math.abs(this.camera.fov - fov) > .1) { this.camera.fov += (fov - this.camera.fov) * k; this.camera.updateProjectionMatrix(); }
    // keep the shadow map focused where the action is
    const f = this.camLook;
    this.sun.position.set(f.x - 28, 60, f.z + 22); this.sun.target.position.set(f.x, 0, f.z); this.sun.target.updateMatrixWorld();
  },
  // world (game coords) → screen px
  project(x, y, z = 0) {
    const v = new THREE.Vector3(x, z, y).project(this.camera);
    return { x: (v.x + 1) / 2 * this.W, y: (1 - v.y) / 2 * this.H, behind: v.z > 1 };
  },
  // screen px → ground point (game coords)
  unproject(sx, sy) {
    const v = new THREE.Vector3(sx / this.W * 2 - 1, -(sy / this.H) * 2 + 1, .5).unproject(this.camera).sub(this.camera.position).normalize();
    const t = -this.camera.position.y / v.y; const p = this.camera.position.clone().addScaledVector(v, t);
    return { x: p.x, y: p.z };
  },
  // screen swipe → world direction (only the lateral sign matters for nudges)
  vecToWorld(dx, dy) { const a = this.project(0, 0, 0), b = this.project(1, 0, 0); const sgn = Math.sign(b.x - a.x) || 1; return { x: dx * sgn, y: dy }; },
};
