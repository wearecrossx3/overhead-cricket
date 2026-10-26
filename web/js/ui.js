'use strict';
// ---------- Screens & HUD ----------
const $ui = () => document.getElementById('ui');
const $hud = () => document.getElementById('hud');
const badge = (id, size) => { const t = teamById(id); return `<div class="badge" style="background:${t.c1};--b2:${t.c2};${size ? `width:${size}px;height:${size}px` : ''}"><span>${t.short}</span></div>`; };
const coinsHTML = (n) => `<span class="coins"><i class="coin-i"></i>${U.fmtCoins(n)}</span>`;
const roleName = { BAT: 'BAT', BOWL: 'BOWL', AR: 'ALL-RND', WK: 'KEEPER' };

const VIEW_NAMES = { stick: 'Stick Cricket', iso: 'Isometric 3D', top: 'Top view' };
const VIEW_ORDER = ['stick', 'iso', 'top'];
const UI = {
  bowlTarget: null, ctx: null,

  clear() { $ui().innerHTML = ''; },
  clearHud() { $hud().innerHTML = ''; },
  show(html, cls = 'screen solid') { this.clear(); const s = U.el('div', cls, html); $ui().appendChild(s); return s; },
  toast(msg, ms = 1400) { const t = document.getElementById('toast'); t.innerHTML = `<div class="toast">${msg}</div>`; clearTimeout(this._tt); this._tt = setTimeout(() => t.innerHTML = '', ms); },
  bind(root, map) { Object.entries(map).forEach(([sel, fn]) => root.querySelectorAll(sel).forEach(el => el.addEventListener('click', (e) => { Sfx.click(); fn(e, el); }))); },

  // ================= HOME =================
  home() {
    Game.demo();
    this.clearHud();
    const s = Save.data, st = s.stats;
    const career = s.career;
    const scr = this.show(`
      <div class="row" style="justify-content:space-between">${coinsHTML(s.coins)}<button class="btn small alt" data-a="settings">⚙</button></div>
      <div style="margin-top:22px"><h1 class="title">Overhead<br>Cricket<small>BY FRONTPAGE STUDIOS</small></h1></div>
      <div class="spacer"></div>
      <div class="menu-btns">
        <button class="btn" data-a="quick">Quick Match</button>
        <button class="btn alt" data-a="career">${career ? 'Continue Franchise League' : 'Franchise League + Auction'}</button>
        <div class="row" style="margin-bottom:12px"><button class="btn alt" style="flex:1" data-a="ch">Challenges <span class="pill">${Challenges.totalStars()}★</span></button><button class="btn alt" style="flex:1" data-a="nets">Nets</button></div>
        <div class="row"><button class="btn alt small" style="flex:1" data-a="shop">Bat Shop</button><button class="btn alt small" style="flex:1" data-a="ach">Trophies</button><button class="btn alt small" style="flex:1" data-a="howto">How to</button></div>
      </div>
      <div class="muted" style="color:#cfd8e8;text-align:center;margin-top:6px">${st.matches} matches · ${st.wins} wins · ${st.sixes} sixes · <span data-a="stats" style="text-decoration:underline">stats</span></div>
    `, 'screen dim');
    this.bind(scr, {
      '[data-a=quick]': () => this.quickSetup(),
      '[data-a=career]': () => career ? this.leagueHub() : this.careerSetup(),
      '[data-a=settings]': () => this.settings(),
      '[data-a=howto]': () => this.howTo(),
      '[data-a=stats]': () => this.stats(),
      '[data-a=ch]': () => this.challenges(),
      '[data-a=nets]': () => { Game.stopDemo(); Game.nets(); },
      '[data-a=shop]': () => this.shop(),
      '[data-a=ach]': () => this.trophies(),
    });
    if (Daily.available()) setTimeout(() => this.dailySheet(), 500);
  },
  dailySheet() {
    if (!document.querySelector('.screen.dim') || document.querySelector('.sheet')) return;
    const streak = Save.data.daily ? Save.data.daily.streak : 0;
    const sh = U.el('div', 'sheet');
    sh.innerHTML = `<div class="card" style="text-align:center"><div class="pill">DAILY REWARD</div><h2 class="h2" style="margin-top:12px">Welcome back!</h2>
      <div class="row" style="justify-content:center;gap:6px;margin:10px 0">${[1, 2, 3, 4, 5, 6, 7].map(d => `<div class="ball-chip ${d <= streak ? 'b6' : ''}" style="min-width:34px;height:34px">${d}</div>`).join('')}</div>
      <p class="muted">Come back every day — the streak bonus grows up to day 7.</p><button class="btn" data-a="claim">Claim coins</button></div>`;
    $ui().appendChild(sh);
    this.bind(sh, { '[data-a=claim]': () => { const r = Daily.claim(); Sfx.coin(); sh.remove(); this.toast(`+${r.amt} coins · day ${r.streak} streak`, 2000); this.home(); } });
  },
  comment(text) {
    let el = document.getElementById('comm');
    if (!el) { el = U.el('div', 'comm'); el.id = 'comm'; document.getElementById('app').appendChild(el); }
    el.textContent = '🎙 ' + text; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    clearTimeout(this._ct); this._ct = setTimeout(() => el.classList.remove('show'), 2600);
  },

  // ================= CHALLENGES =================
  challenges() {
    Game.stopDemo(); this.clearHud();
    const all = Challenges.stars();
    const scr = this.show(`<div class="row"><button class="btn small alt" data-a="back">←</button><h2 class="h2" style="margin:0">Challenges</h2><span class="spacer"></span><span class="pill">${Challenges.totalStars()} / ${CHALLENGES.length * 3} ★</span></div>
      <p class="muted">Finish each scenario to unlock the next. 40 coins per new star.</p>
      ${CHALLENGES.map((c, i) => { const st = all[i] || 0, open = Challenges.unlocked(i);
        return `<button class="list-item ${open ? '' : 'dis'}" data-i="${i}"><div class="ovr" style="background:${c.kind === 'chase' ? 'var(--blue)' : 'var(--red)'};color:#fff">${i + 1}</div>
        <div><b>${c.t}</b><div class="meta">${c.kind === 'chase' ? `Score ${c.need} off ${c.balls} ball${c.balls > 1 ? 's' : ''}` : `Defend ${c.need - 1} in ${c.balls} balls`} · ${c.wkts} wkt${c.wkts > 1 ? 's' : ''} · vs ${c.opp}</div>
        <div class="meta">★★ ${c.s2t} · ★★★ ${Challenges.s3t(c)}</div></div>
        <div class="r" style="font-size:18px;color:#e0a800;letter-spacing:-2px">${open ? '★'.repeat(st) + '<span style="color:#d6cfbd">' + '★'.repeat(3 - st) + '</span>' : '🔒'}</div></button>`; }).join('')}`);
    this.bind(scr, {
      '[data-a=back]': () => this.home(),
      '[data-i]': (e, el) => { const i = +el.dataset.i; if (!Challenges.unlocked(i)) return this.toast('Earn a star on the previous challenge first'); Game.playChallenge(i); },
    });
  },
  challengeResult(m, i, stars, coins) {
    const ch = CHALLENGES[i], inn = m.innings[0];
    Play.stop();
    if (stars) Sfx.crowd(1.3);
    const scr = this.show(`<div class="result-hero"><div class="pill">${stars ? 'CHALLENGE COMPLETE' : 'CHALLENGE FAILED'}</div>
      <div class="big" style="margin-top:12px">${ch.t}</div>
      <div style="font-size:54px;color:var(--yellow);letter-spacing:4px;margin-top:10px">${'★'.repeat(stars)}<span style="opacity:.25">${'★'.repeat(3 - stars)}</span></div>
      <div style="font-weight:800;color:#cfd8e8">${inn.runs}/${inn.wkts} in ${inn.balls} ball${inn.balls === 1 ? '' : 's'} · target ${inn.target}</div></div>
      <div class="spacer"></div>
      <div class="card">${coins ? `<div class="reward"><span>New stars</span><span>+${coins} coins</span></div>` : ''}
        <button class="btn" data-a="retry">Try again</button><div style="height:10px"></div>
        ${stars && i + 1 < CHALLENGES.length ? '<button class="btn alt" data-a="next">Next challenge</button><div style="height:10px"></div>' : ''}
        <button class="btn alt" data-a="list">All challenges</button></div>`, 'screen dim');
    this.bind(scr, { '[data-a=retry]': () => Game.playChallenge(i), '[data-a=next]': () => Game.playChallenge(i + 1), '[data-a=list]': () => this.challenges() });
  },

  // ================= SHOP =================
  shop() {
    Game.stopDemo();
    const st = SHOP.state();
    const scr = this.show(`<div class="row" style="justify-content:space-between"><button class="btn small alt" data-a="back">←</button>${coinsHTML(Save.data.coins)}</div>
      <h2 class="h2" style="margin-top:10px">Bat Shop</h2><p class="muted">Better bats hit harder and give you a bigger timing window.</p>
      ${SHOP.bats.map(b => { const own = st.owned.includes(b.id), on = st.bat === b.id;
        return `<button class="list-item ${on ? 'sel' : ''}" data-b="${b.id}"><div style="width:14px;height:56px;border-radius:5px;background:${b.color};box-shadow:inset -4px 0 0 rgba(0,0,0,.15)"></div>
        <div><b>${b.name}</b><div class="meta">${b.desc}</div></div><div class="r">${on ? '<span class="pill">EQUIPPED</span>' : own ? '<b>Equip</b>' : coinsHTML(b.price)}</div></button>`; }).join('')}`);
    this.bind(scr, {
      '[data-a=back]': () => this.home(),
      '[data-b]': (e, el) => {
        const id = el.dataset.b, b = SHOP.bats.find(x => x.id === id);
        if (st.owned.includes(id)) { SHOP.equip(id); return this.shop(); }
        if (Save.data.coins < b.price) return this.toast('Not enough coins yet — win matches & challenges!');
        if (SHOP.buy(id)) { Sfx.coin(); this.toast(`${b.name} bought!`); if (id === 'gold') Ach.unlock('gold'); this.shop(); }
      },
    });
  },
  trophies() {
    Game.stopDemo();
    const got = Ach.got();
    const scr = this.show(`<div class="row"><button class="btn small alt" data-a="back">←</button><h2 class="h2" style="margin:0">Trophies</h2><span class="spacer"></span><span class="pill">${Object.keys(got).length}/${ACHIEVEMENTS.length}</span></div>
      <div style="height:12px"></div>
      ${ACHIEVEMENTS.map(a => `<div class="list-item ${got[a.id] ? '' : 'dis'}"><div class="ovr" style="background:${got[a.id] ? 'var(--yellow)' : '#cfc8b6'};color:var(--ink)">🏆</div><div><b>${a.t}</b><div class="meta">${a.d}</div></div><div class="r meta">+${a.c}</div></div>`).join('')}`);
    this.bind(scr, { '[data-a=back]': () => this.home() });
  },

  // ================= QUICK MATCH SETUP =================
  quickSetup() {
    Game.stopDemo();
    const st = this.qs || (this.qs = { mine: 'RJR', opp: 'MMS', overs: 2 });
    const scr = this.show(`
      <div class="row"><button class="btn small alt" data-a="back">←</button><h2 class="h2" style="margin:0">Quick Match</h2></div>
      <div class="h3">Your team</div><div class="team-grid" id="mine"></div>
      <div class="h3">Opponent</div><div class="team-grid" id="opp"></div>
      <div class="h3">Overs</div><div class="row wrap" id="overs"></div>
      <div class="h3">Difficulty</div><div class="row wrap" id="diff"></div>
      <div style="height:16px"></div>
      <button class="btn" data-a="go">Toss →</button>
    `);
    const render = () => {
      const tp = (sel, key, other) => { const el = scr.querySelector(sel); el.innerHTML = TEAMS.map(t => `<button class="team-pick ${st[key] === t.id ? 'on' : ''} ${st[other] === t.id ? 'dis' : ''}" data-t="${t.id}">${badge(t.id, 34)}<span>${t.name}</span></button>`).join(''); el.querySelectorAll('button').forEach(b => b.onclick = () => { if (st[other] === b.dataset.t) return; Sfx.click(); st[key] = b.dataset.t; render(); }); };
      tp('#mine', 'mine', 'opp'); tp('#opp', 'opp', 'mine');
      const ov = scr.querySelector('#overs'); ov.innerHTML = [1, 2, 5, 10, 20].map(o => `<button class="chip ${st.overs === o ? 'on' : ''}" data-o="${o}">${o} over${o > 1 ? 's' : ''}</button>`).join('');
      ov.querySelectorAll('button').forEach(b => b.onclick = () => { Sfx.click(); st.overs = +b.dataset.o; render(); });
      const df = scr.querySelector('#diff'); df.innerHTML = ['easy', 'normal', 'hard'].map(d => `<button class="chip ${Save.data.settings.difficulty === d ? 'on' : ''}" data-d="${d}">${d}</button>`).join('');
      df.querySelectorAll('button').forEach(b => b.onclick = () => { Sfx.click(); Save.data.settings.difficulty = b.dataset.d; Save.save(); render(); });
    };
    render();
    this.bind(scr, {
      '[data-a=back]': () => this.home(),
      '[data-a=go]': () => {
        const sq = defaultSquads();
        const m = Rules.newMatch({ overs: st.overs, mode: 'quick', teamA: { teamId: st.mine, xi: pickBestXI(sq[st.mine]), isUser: true }, teamB: { teamId: st.opp, xi: pickBestXI(sq[st.opp]), isUser: false } });
        this.toss(m, () => Game.playMatch(m, (res) => this.result(m, res)));
      },
    });
  },

  // ================= TOSS =================
  toss(m, onDone) {
    Game.stopDemo();
    const scr = this.show(`
      <h2 class="h2" style="color:var(--cream);text-align:center;margin-top:30px">The Toss</h2>
      <div class="row" style="justify-content:center;gap:16px">${badge(m.sides.A.teamId, 56)}<span class="vs" style="color:#cfd8e8">VS</span>${badge(m.sides.B.teamId, 56)}</div>
      <div class="coin3d" id="coin">?</div>
      <div id="tz" class="col"><div class="muted" style="text-align:center;color:#cfd8e8">Call it</div>
      <div class="row"><button class="btn" data-c="H">Heads</button><button class="btn alt" data-c="T">Tails</button></div></div>
    `, 'screen dim');
    scr.style.background = 'rgba(15,29,51,.82)';
    this.bind(scr, {
      '[data-c]': (e, el) => {
        const call = el.dataset.c, res = U.chance(.5) ? 'H' : 'T';
        const coin = scr.querySelector('#coin'); coin.classList.add('flip'); scr.querySelector('#tz').innerHTML = '';
        setTimeout(() => {
          coin.textContent = res === 'H' ? 'HEADS' : 'TAILS'; Sfx.coin();
          const won = call === res; const tz = scr.querySelector('#tz');
          if (won) {
            tz.innerHTML = `<div class="h2" style="color:var(--yellow);text-align:center">You won the toss!</div><div class="row"><button class="btn" data-d="bat">Bat first</button><button class="btn alt" data-d="bowl">Bowl first</button></div>`;
            tz.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { Sfx.click(); m.cfg.batFirst = b.dataset.d === 'bat' ? 'A' : 'B'; onDone(); });
          } else {
            const aiBat = U.chance(.4); m.cfg.batFirst = aiBat ? 'B' : 'A';
            tz.innerHTML = `<div class="h2" style="color:var(--cream);text-align:center">${teamById(m.sides.B.teamId).short} won & chose to ${aiBat ? 'bat' : 'bowl'}</div><button class="btn" data-d="go">Let's play</button>`;
            tz.querySelector('[data-d]').onclick = () => { Sfx.click(); onDone(); };
          }
        }, 1450);
      },
    });
  },

  // ================= HUD =================
  hud() {
    const m = Play.m; if (!m || !Play.active || Play.auto && Game.demoOn) { if (Game.demoOn) this.clearHud(); return; }
    const inn = Rules.inn(m); if (!inn) return;
    const bt = teamById(m.sides[inn.bat].teamId);
    const st = Rules.striker(inn), ns = Rules.nonStriker(inn), bw = inn.bowlerId ? Rules.bowler(inn) : null;
    const left = Rules.ballsLeft(inn);
    const req = inn.target != null
      ? `<span>Need <b>${Math.max(0, inn.target - inn.runs)}</b> off <b>${left}</b></span><span>RRR ${Rules.rrr(inn).toFixed(2)}</span>`
      : `<span>CRR <b>${Rules.crr(inn).toFixed(2)}</b></span><span>${m.cfg.mode === 'nets' ? 'PRACTICE NETS · perfects ' + (Save.data.stats.perfects || 0) : inn.superOver ? 'SUPER OVER' : (m.innings.length === 1 ? '1st innings' : '')}</span>`;
    const chip = (s) => { const c = s.includes('W') ? 'bw' : s === '6' || s.endsWith('6') && !s.includes('wd') ? 'b6' : s === '4' ? 'b4' : /wd|nb|b|lb/.test(s) ? 'bx' : ''; return `<div class="ball-chip ${c}">${s}</div>`; };
    const showRun = Play.userBatting() && !Play.auto;
    $hud().innerHTML = `
      <div class="scorebug">
        <div class="sb-top"><div class="sb-team" style="background:${bt.c1}">${bt.short}</div>
          <div class="sb-score">${inn.runs}/${inn.wkts}<small>${U.oversStr(inn.balls)}${inn.superOver ? '' : Number.isInteger(inn.oversLimit) ? '/' + inn.oversLimit : ' of ' + Math.round(inn.oversLimit * 6) + 'b'}</small></div>
          <div class="sb-req">${req}</div></div>
        <div class="sb-bot"><span class="on">${short(st.p.name)}* ${st.r}(${st.b})</span><span>${short(ns.p.name)} ${ns.r}(${ns.b})</span><span>${bw ? `${short(bw.p.name)} ${bw.wkts}-${bw.runs}` : ''}</span></div>
        ${inn.freeHit ? '<div class="freehit">FREE HIT</div>' : ''}
      </div>
      <button class="pause" data-a="pause">❚❚</button>
      ${Play.del && Play.phase !== 'setup' ? `<div class="speed">${Play.del.kph} km/h</div>` : ''}
      <div class="over-strip">${inn.thisOver.map(chip).join('')}</div>
      <button class="run-btn ${showRun ? 'show' : ''}" data-a="run">RUN</button>
      ${this.batHint()}
    `;
    this.bind($hud(), { '[data-a=pause]': () => this.pauseMenu(), '[data-a=run]': () => Play.requestRun() });
  },
  batHint() {
    if (!Play.userBatting() || Play.auto) return '';
    const inn = Rules.inn(Play.m);
    if (inn.balls > 2 && Save.data.tutorialSeen) return '';
    return `<div class="hint">TAP when the ring turns <b style="color:#9fe870">GREEN</b><br>Swipe ↑ = big lofted hit · Swipe ↓ = defend<br>Early = leg side · Late = off side</div>`;
  },

  // ================= BOWLING CONTROLS =================
  bowlControls(bowler) {
    const types = bowler.bowlType === 'pace'
      ? [['good', 'Good length'], ['full', 'Full'], ['yorker', 'Yorker'], ['short', 'Short'], ['bouncer', 'Bouncer'], ['slower', 'Slower']]
      : [['offbreak', 'Off-spin'], ['legbreak', 'Leg-spin'], ['flighted', 'Flighted'], ['arm', 'Arm ball']];
    let cur = types[0][0];
    const set = (t) => { cur = t; const d = Play.defaultTarget(t); this.bowlTarget = { x: d.tx, y: d.ty }; };
    set(cur);
    const panel = U.el('div', 'bowl-panel');
    panel.innerHTML = `
      <div class="meter-label"><span>${short(bowler.name).toUpperCase()} · ${bowler.bowlType.toUpperCase()} · ${bowler.bowl}</span><span>DRAG MARKER ON PITCH</span></div>
      <div class="types">${types.map(([k, n]) => `<button class="chip ${k === cur ? 'on' : ''}" data-t="${k}">${n}</button>`).join('')}</div>
      <button class="btn" data-a="bowl">Bowl</button>`;
    $hud().appendChild(panel);
    panel.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { Sfx.click(); set(b.dataset.t); panel.querySelectorAll('[data-t]').forEach(x => x.classList.toggle('on', x === b)); });
    panel.querySelector('[data-a=bowl]').onclick = () => { Sfx.click(); this.bowlMeter(panel, cur); };
    this.bowlPanel = panel;
  },
  bowlMeter(panel, type) {
    panel.innerHTML = `<div class="meter-label"><span>WILD</span><span>ACCURATE</span><span>EXTRA PACE · NO-BALL RISK</span></div><div class="meter"><div class="needle"></div></div><div class="meter-label" style="justify-content:center"><span>TAP ANYWHERE TO RELEASE</span></div>`;
    const needle = panel.querySelector('.needle'); let v = 0, dir = 1, done = false, t0 = performance.now();
    const tick = () => {
      if (done) return;
      const dt = 1 / 60; v += dir * dt * 1.25; if (v > 1) { v = 1; dir = -1; } if (v < 0) { v = 0; dir = 1; }
      needle.style.left = (v * 100) + '%';
      if (performance.now() - t0 > 4000) return release();
      requestAnimationFrame(tick);
    };
    const release = () => {
      if (done) return; done = true; window.removeEventListener('pointerdown', release, true);
      panel.remove(); this.bowlPanel = null;
      Play.userBowl(type, this.bowlTarget.x, this.bowlTarget.y, v); this.bowlTarget = null;
    };
    setTimeout(() => window.addEventListener('pointerdown', release, true), 120);
    tick();
  },
  chooseBowler(list, cb) {
    const inn = Rules.inn(Play.m);
    const sh = U.el('div', 'sheet');
    sh.innerHTML = `<div class="card"><h2 class="h2">Choose bowler</h2>${list.map(p => {
      const s = inn.bowlers[p.id]; const ov = s ? U.oversStr(s.balls) : '0.0';
      return `<button class="list-item" data-id="${p.id}"><div class="ovr">${p.bowl}</div><div><b>${p.name}</b><div class="meta">${p.bowlType.toUpperCase()} · ${ov} ov${s ? ` · ${s.wkts}-${s.runs}` : ''}</div></div><div class="r meta">max ${Play.m.maxBowlerOvers} ov</div></button>`;
    }).join('')}</div>`;
    $hud().appendChild(sh);
    sh.querySelectorAll('[data-id]').forEach(b => b.onclick = () => { Sfx.click(); sh.remove(); cb(list.find(p => p.id === b.dataset.id)); });
  },
  overSummary(inn, next) {
    const last = inn.overLog[inn.overLog.length - 1];
    if (last) this.toast(`End of over · ${last.runs} run${last.runs === 1 ? '' : 's'} · ${inn.runs}/${inn.wkts}`, 1300);
    setTimeout(next, 900);
  },

  // ================= PAUSE =================
  pauseMenu() {
    Game.paused = true;
    const sh = U.el('div', 'sheet');
    sh.innerHTML = `<div class="card"><h2 class="h2">Paused</h2>
      <button class="btn" data-a="res">Resume</button><div style="height:10px"></div>
      <button class="btn alt" data-a="sc">Scorecard</button><div style="height:10px"></div>
      <div class="h3" style="margin-top:0">Camera angle</div><div class="row wrap" style="margin-bottom:12px">${VIEW_ORDER.map(k => `<button class="chip ${R.view() === k ? 'on' : ''}" data-v="${k}">${VIEW_NAMES[k]}</button>`).join('')}</div>
      <button class="btn alt" data-a="sim">Simulate rest of innings</button><div style="height:10px"></div>
      <button class="btn red" data-a="quit">Quit match</button></div>`;
    $hud().appendChild(sh);
    this.bind(sh, {
      '[data-a=res]': () => { sh.remove(); Game.paused = false; },
      '[data-a=sc]': () => { sh.remove(); this.scorecard(Play.m, () => { Game.paused = false; }); },
      '[data-a=sim]': () => { sh.remove(); Game.paused = false; Game.simInnings(); },
      '[data-v]': (e, el) => { Save.data.settings.view = el.dataset.v; Save.save(); R.resize(); R.setCam(R.cam.tx, R.cam.ty, R.pitchZoom, true); sh.remove(); Game.paused = false; UI.toast(VIEW_NAMES[el.dataset.v] + ' view', 1000); },
      '[data-a=quit]': () => { sh.remove(); Game.paused = false; Game.quitMatch(); },
    });
  },

  // ================= SCORECARD =================
  scorecardHTML(m) {
    return m.innings.map((inn, i) => {
      const t = teamById(m.sides[inn.bat].teamId);
      const ex = inn.extras, exT = ex.wd + ex.nb + ex.b + ex.lb;
      const bat = inn.batting.filter(b => !b.dnb).map(b => `<tr><td>${b.p.name}<span class="how">${b.out || 'not out'}</span></td><td>${b.r}</td><td>${b.b}</td><td>${b.f4}</td><td>${b.f6}</td><td>${b.b ? (b.r / b.b * 100).toFixed(0) : '-'}</td></tr>`).join('');
      const dnb = inn.batting.filter(b => b.dnb).map(b => short(b.p.name)).join(', ');
      const bowl = Object.values(inn.bowlers).map(s => `<tr><td>${s.p.name}</td><td>${U.oversStr(s.balls)}</td><td>${s.maidens}</td><td>${s.runs}</td><td>${s.wkts}</td><td>${s.balls ? (s.runs / s.balls * 6).toFixed(1) : '-'}</td></tr>`).join('');
      return `<div class="inn-head" style="background:${t.c1}"><span>${t.short}${inn.superOver ? ' · SUPER OVER' : ''}</span><span>${inn.runs}/${inn.wkts} (${U.oversStr(inn.balls)})</span></div>
        <table class="sc"><tr><th>Batter</th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th></tr>${bat}</table>
        <div class="muted">Extras ${exT} (wd ${ex.wd}, nb ${ex.nb}, b ${ex.b}, lb ${ex.lb})${dnb ? ` · Did not bat: ${dnb}` : ''}</div>
        ${inn.fow.length ? `<div class="muted">FoW: ${inn.fow.map(f => `${f.runs}-${f.wkt} (${short(f.name)}, ${f.over})`).join(', ')}</div>` : ''}
        <table class="sc" style="margin-top:8px"><tr><th>Bowler</th><th>O</th><th>M</th><th>R</th><th>W</th><th>Econ</th></tr>${bowl}</table>`;
    }).join('');
  },
  scorecard(m, onClose) {
    const sh = U.el('div', 'sheet');
    sh.innerHTML = `<div class="card"><div class="row" style="justify-content:space-between"><h2 class="h2">Scorecard</h2><button class="btn small dark" data-a="x">Close</button></div>${this.scorecardHTML(m)}</div>`;
    (Play.active ? $hud() : $ui()).appendChild(sh);
    this.bind(sh, { '[data-a=x]': () => { sh.remove(); onClose && onClose(); } });
  },

  // ================= BREAKS =================
  inningsBreak(m, next) {
    const prev = m.innings[m.innings.length - 2], inn = Rules.inn(m);
    const t = teamById(m.sides[prev.bat].teamId), c = teamById(m.sides[inn.bat].teamId);
    const so = inn.superOver;
    const scr = this.show(`
      <div class="spacer"></div>
      <div class="card">
        <div class="pill">${so ? 'SUPER OVER' : 'INNINGS BREAK'}</div>
        <h2 class="h2" style="margin-top:10px">${t.name}: ${prev.runs}/${prev.wkts} <span class="muted">(${U.oversStr(prev.balls)})</span></h2>
        <p style="font-weight:800;font-size:16px">${c.name} need <b style="font-family:var(--f)">${inn.target}</b> to win off ${inn.oversLimit * 6} balls${so ? ' (2 wickets)' : ''}.</p>
        ${this.topPerformers(prev)}
        <button class="btn" data-a="go">${m.sides[inn.bat].isUser ? 'Start the chase' : 'Defend it'}</button>
        <div style="height:10px"></div><button class="btn alt" data-a="sc">Full scorecard</button>
      </div>`, 'screen dim');
    this.bind(scr, { '[data-a=go]': () => { this.clear(); next(); }, '[data-a=sc]': () => this.scorecard(m) });
  },
  superOverIntro(m, next) {
    const inn = Rules.inn(m); const t = teamById(m.sides[inn.bat].teamId);
    Sfx.crowd(1.2);
    const scr = this.show(`<div class="spacer"></div><div class="card" style="text-align:center">
      <div class="pill">IT'S A TIE!</div><h1 class="title" style="color:var(--ink);font-size:40px;margin:14px 0">Super<br>Over</h1>
      <p style="font-weight:800">${t.name} bat first · 1 over · 2 wickets.<br>Repeated super overs until there's a winner.</p>
      <button class="btn" data-a="go">Bring it on</button></div><div class="spacer"></div>`, 'screen dim');
    this.bind(scr, { '[data-a=go]': () => { this.clear(); next(); } });
  },
  topPerformers(inn) {
    const bats = inn.batting.filter(b => !b.dnb).sort((a, b) => b.r - a.r).slice(0, 2);
    const bowls = Object.values(inn.bowlers).sort((a, b) => b.wkts - a.wkts || a.runs - b.runs).slice(0, 2);
    return `<div class="row" style="align-items:flex-start;margin:6px 0 14px"><div style="flex:1">${bats.map(b => `<div class="muted"><b style="color:var(--ink)">${short(b.p.name)}</b> ${b.r} (${b.b})</div>`).join('')}</div>
      <div style="flex:1">${bowls.map(b => `<div class="muted"><b style="color:var(--ink)">${short(b.p.name)}</b> ${b.wkts}-${b.runs}</div>`).join('')}</div></div>`;
  },
  playerOfMatch(m) {
    const score = {};
    m.innings.forEach(inn => {
      inn.batting.forEach(b => { if (!b.dnb) score[b.p.id] = (score[b.p.id] || { p: b.p, s: 0 }); if (!b.dnb) score[b.p.id].s += b.r + b.f6 * 2 + (b.b && b.r / b.b > 1.5 ? 8 : 0); });
      Object.values(inn.bowlers).forEach(w => { score[w.p.id] = score[w.p.id] || { p: w.p, s: 0 }; score[w.p.id].s += w.wkts * 22 - Math.max(0, w.runs - w.balls * 1.3) * .5; });
    });
    return Object.values(score).sort((a, b) => b.s - a.s)[0];
  },

  // ================= RESULT =================
  result(m, rewards) {
    const userSide = m.sides.A.isUser ? 'A' : 'B';
    const won = m.result.winner === userSide;
    const pom = this.playerOfMatch(m);
    const scr = this.show(`
      <div class="result-hero"><div class="pill">${won ? 'VICTORY' : m.result.winner ? 'DEFEAT' : 'TIED'}</div>
      <div class="big" style="margin-top:12px">${m.result.text}</div>
      ${pom ? `<div style="margin-top:10px;font-weight:800;color:#cfd8e8">Player of the match: <span style="color:var(--yellow)">${pom.p.name}</span></div>` : ''}</div>
      <div class="spacer"></div>
      <div class="card">
        <div class="h3" style="margin-top:0">Coins earned</div>
        ${rewards.lines.map(([k, v]) => `<div class="reward"><span>${k}</span><span>+${v}</span></div>`).join('')}
        <div class="reward" style="border:0;font-family:var(--f)"><span>TOTAL</span><span>${coinsHTML(rewards.total)}</span></div>
        <div style="height:10px"></div>
        <button class="btn" data-a="next">${m.cfg.mode === 'league' ? 'Back to league' : 'Home'}</button>
        <div style="height:10px"></div><button class="btn alt" data-a="sc">Scorecard</button>
        ${m.cfg.mode === 'quick' ? '<div style="height:10px"></div><button class="btn alt" data-a="again">Rematch</button>' : ''}
      </div>`, 'screen dim');
    if (won) Sfx.crowd(1.4);
    this.bind(scr, {
      '[data-a=next]': () => { Play.stop(); m.cfg.mode === 'league' ? this.leagueHub() : this.home(); },
      '[data-a=sc]': () => this.scorecard(m),
      '[data-a=again]': () => { Play.stop(); this.quickSetup(); },
    });
  },

  // ================= SETTINGS / STATS / HOW TO =================
  settings() {
    const s = Save.data.settings;
    const scr = this.show(`<div class="row"><button class="btn small alt" data-a="back">←</button><h2 class="h2" style="margin:0">Settings</h2></div>
      <div style="height:14px"></div>
      <div class="toggle" data-k="sound">Sound <div class="sw ${s.sound ? 'on' : ''}"></div></div>
      <div class="toggle" data-k="vibrate">Vibration <div class="sw ${s.vibrate ? 'on' : ''}"></div></div>
      <div class="toggle" data-k="autoRun">Auto running (RUN button still adds risky runs) <div class="sw ${s.autoRun ? 'on' : ''}"></div></div>
      <div class="h3">Camera angle</div><div class="row wrap">${VIEW_ORDER.map(k => `<button class="chip ${R.view() === k ? 'on' : ''}" data-v="${k}">${VIEW_NAMES[k]}</button>`).join('')}</div>
      <div class="h3">Difficulty</div><div class="row">${['easy', 'normal', 'hard'].map(d => `<button class="chip ${s.difficulty === d ? 'on' : ''}" data-d="${d}">${d}</button>`).join('')}</div>
      <div class="spacer"></div>
      <button class="btn red" data-a="reset">Reset all progress</button>`);
    this.bind(scr, {
      '[data-a=back]': () => this.home(),
      '[data-k]': (e, el) => { s[el.dataset.k] = !s[el.dataset.k]; Save.save(); this.settings(); },
      '[data-d]': (e, el) => { s.difficulty = el.dataset.d; Save.save(); this.settings(); },
      '[data-v]': (e, el) => { s.view = el.dataset.v; Save.save(); R.resize(); this.settings(); },
      '[data-a=reset]': () => { if (confirm('Delete coins, stats and your franchise league?')) { localStorage.removeItem(Save.KEY); Save.load(); this.home(); } },
    });
  },
  stats() {
    const st = Save.data.stats;
    const scr = this.show(`<div class="row"><button class="btn small alt" data-a="back">←</button><h2 class="h2" style="margin:0">My Stats</h2></div>
      <div class="card" style="margin-top:14px">${[['Matches', st.matches], ['Wins', st.wins], ['Win %', st.matches ? Math.round(st.wins / st.matches * 100) + '%' : '-'], ['Runs scored', st.runs], ['Fours', st.fours], ['Sixes', st.sixes], ['Wickets taken', st.wickets], ['Best team score', st.highScore], ['Coins', Save.data.coins]].map(([k, v]) => `<div class="reward"><span>${k}</span><span>${v}</span></div>`).join('')}</div>`);
    this.bind(scr, { '[data-a=back]': () => this.home() });
  },
  howTo() {
    const scr = this.show(`<div class="row"><button class="btn small alt" data-a="back">←</button><h2 class="h2" style="margin:0">How to play</h2></div>
      <div class="card howto" style="margin-top:14px">
        <p><b>BATTING</b> — Just like Stick Cricket: TAP the screen when the ring around the batter turns <b>GREEN</b>. Your timing aims the shot — early sends it to the leg side, late to the off side, perfect goes straight. Swipe ↑ while tapping for a big lofted hit (needs great timing or you'll be caught), swipe ↓ to defend. Three PERFECT shots in a row puts you ON FIRE.</p>
        <p><b>CAMERA</b> — Three angles: Stick Cricket, Isometric 3D and Top view. Change it any time from the pause menu or Settings.</p>
        <p><b>RUNNING</b> — Runs are auto-called safely. Tap <b>RUN</b> to push for an extra (risky!) run. Turn auto-running off in Settings to call every run yourself.</p>
        <p><b>BOWLING</b> — Pick a delivery, drag the yellow marker to set line & length, press Bowl and stop the meter in the green. Red zone on the right = extra pace but likely <b>no-ball</b>.</p>
        <p><b>RULES</b> — Wides (outside the guideline, down leg, or a bouncer over head height), no-balls (overstepping, waist-high full tosses, a 2nd bouncer in the over) followed by a <b>FREE HIT</b> (only run-out possible). Byes & leg-byes, LBW (not if pitched outside leg), stumpings when you charge a spinner, hit wicket, caught (new batter on strike). Ties go to a <b>Super Over</b> — repeated until there's a winner.</p>
        <p><b>FRANCHISE LEAGUE</b> — Pick a franchise, use your purse (and top it up with coins) in an IPL-style auction with base prices, bid increments, overseas limits and an accelerated round. Then play the round-robin league, points table with NRR, and Qualifier 1, Eliminator, Qualifier 2 and the Final.</p>
      </div>`);
    this.bind(scr, { '[data-a=back]': () => this.home() });
  },

  // ================= CAREER: SETUP =================
  careerSetup() {
    Game.stopDemo();
    const st = { team: 'RJR', overs: 5, topup: 0 };
    const scr = this.show(`<div class="row"><button class="btn small alt" data-a="back">←</button><h2 class="h2" style="margin:0">New Franchise League</h2></div>
      <div class="h3">Pick your franchise</div><div class="team-grid" id="tm"></div>
      <div class="h3">Overs per match</div><div class="row wrap" id="ov"></div>
      <div class="h3">Auction purse</div>
      <div class="card" style="padding:12px"><div class="reward"><span>League purse</span><span>${AUCTION.PURSE}</span></div>
        <div class="reward"><span>Top-up from your coins</span><span id="tv">+0</span></div>
        <input type="range" id="tp" min="0" max="${Math.min(AUCTION.TOPUP_MAX, Save.data.coins)}" step="10" value="0" style="width:100%">
        <div class="muted">Wallet: ${U.fmtCoins(Save.data.coins)} coins. Win matches to earn more.</div></div>
      <div style="height:16px"></div><button class="btn" data-a="go">Enter the Auction →</button>`);
    const render = () => {
      const tm = scr.querySelector('#tm'); tm.innerHTML = TEAMS.map(t => `<button class="team-pick ${st.team === t.id ? 'on' : ''}" data-t="${t.id}">${badge(t.id, 34)}<span>${t.name}</span></button>`).join('');
      tm.querySelectorAll('button').forEach(b => b.onclick = () => { Sfx.click(); st.team = b.dataset.t; render(); });
      const ov = scr.querySelector('#ov'); ov.innerHTML = [2, 5, 10, 20].map(o => `<button class="chip ${st.overs === o ? 'on' : ''}" data-o="${o}">${o} overs</button>`).join('');
      ov.querySelectorAll('button').forEach(b => b.onclick = () => { Sfx.click(); st.overs = +b.dataset.o; render(); });
    };
    render();
    const tp = scr.querySelector('#tp'); tp.oninput = () => { st.topup = +tp.value; scr.querySelector('#tv').textContent = '+' + st.topup; };
    this.bind(scr, {
      '[data-a=back]': () => this.home(),
      '[data-a=go]': () => {
        Save.addCoins(-st.topup);
        Save.data.career = { userTeam: st.team, overs: st.overs, season: 1, auction: Auction.create(st.team, st.topup), xi: null, league: null };
        Save.save(); this.auctionRoom();
      },
    });
  },

  // ================= AUCTION ROOM =================
  auctionRoom() {
    Game.stopDemo(); this.clearHud();
    const C = Save.data.career, A = C.auction, me = C.userTeam;
    if (A.done) return this.squadScreen(true);
    const scr = this.show(`
      <div class="row" style="justify-content:space-between"><h2 class="h2" style="margin:0;color:var(--cream)">Auction</h2><span class="pill" id="setname"></span></div>
      <div class="purses" id="purses" style="margin-top:10px"></div>
      <div class="lot" id="lot"></div>
      <div class="row"><button class="btn" id="bidbtn" style="flex:2">Bid</button><button class="btn alt" id="passbtn" style="flex:1">Pass</button></div>
      <div class="row" style="margin-top:10px"><button class="btn small alt" id="autobtn" style="flex:1">Auto-bid: off</button><button class="btn small alt" id="simset" style="flex:1">Skip set</button><button class="btn small alt" id="finish" style="flex:1">Finish auction</button></div>
      <div class="h3" style="color:#9fb0cc">My squad <span id="mysq"></span></div>
      <div class="log" id="log"></div>`, 'screen auction');
    let auto = false, stopped = false, phase = 'bidding', gapT = 0, aiT = U.rand(.6, 1.1), lastTs = performance.now(), result = null;
    const renderPurses = () => {
      const l = A.lot;
      scr.querySelector('#purses').innerHTML = TEAMS.map(t => `<div class="purse ${t.id === me ? 'me' : ''} ${l && l.bidder === t.id ? 'lead' : ''}">${badge(t.id)}<div>${A.purses[t.id]}<div style="font-size:9px;opacity:.7">${A.squads[t.id].length}/${AUCTION.MAX_SQUAD}</div></div></div>`).join('');
      const n = Auction.needs(A, me);
      scr.querySelector('#mysq').textContent = `· ${n.total}/${AUCTION.MAX_SQUAD} · overseas ${n.overseas}/${AUCTION.MAX_OVERSEAS} · purse ${A.purses[me]}`;
      scr.querySelector('#log').innerHTML = A.log.slice(0, 6).map(x => `<div>${x}</div>`).join('');
    };
    const renderLot = () => {
      const l = A.lot; if (!l) return;
      const p = A.players[l.id];
      scr.querySelector('#setname').textContent = l.set === -1 ? 'ACCELERATED' : A.sets[l.set];
      const going = l.bidder ? (l.timer > 2.2 ? 'Going twice…' : l.timer > 1.2 ? 'Going once…' : '') : (l.timer > 1.6 ? 'No bids…' : '');
      scr.querySelector('#lot').innerHTML = `
        <div class="set">${roleName[p.role]}${p.bowlType && p.role !== 'BAT' && p.role !== 'WK' ? ' · ' + p.bowlType : ''} · ${p.country}${p.overseas ? ' · OVERSEAS' : ''}</div>
        <div class="nm">${p.name}</div>
        <div class="row"><div class="ovr">${p.ovr}</div><div class="muted">Base price <b style="color:var(--ink)">${p.basePrice}</b></div></div>
        <div class="bars"><span>BAT</span><div class="bar"><i style="width:${p.bat}%"></i></div><span>${p.bat}</span>
        <span>BOWL</span><div class="bar"><i style="width:${p.bowl}%;background:var(--red)"></i></div><span>${p.bowl}</span>
        <span>FIELD</span><div class="bar"><i style="width:${p.field}%;background:var(--green)"></i></div><span>${p.field}</span></div>
        <div style="height:12px"></div>
        <div class="bid-now"><div><div class="muted" style="color:#9fb0cc">${l.bidder ? 'Current bid' : 'Opening at'}</div><div class="amt"><i class="coin-i"></i>${l.bid ?? p.basePrice}</div></div>
          ${l.bidder ? `<div class="row">${badge(l.bidder)}<b style="font-family:var(--f);font-size:12px">${teamById(l.bidder).short}</b></div>` : '<div class="muted" style="color:#9fb0cc">no bids</div>'}</div>
        <div class="going">${going}</div>
        ${result ? `<div class="sold-stamp ${result.sold ? '' : 'unsold'}">${result.sold ? 'SOLD ' + result.price : 'UNSOLD'}</div>` : ''}`;
      const nb = Auction.minNextBid(A);
      const can = phase === 'bidding' && l.bidder !== me && !l.passed[me] && Auction.canBuy(A, me, p, nb);
      const bb = scr.querySelector('#bidbtn'); bb.disabled = !can; bb.textContent = l.bidder === me ? 'Leading' : `Bid ${nb}`;
      scr.querySelector('#passbtn').disabled = phase !== 'bidding' || l.passed[me] || l.bidder === me;
    };
    const next = () => { result = null; const p = Auction.nextLot(A); Save.save(); if (!p) { stopped = true; Save.save(); return this.squadScreen(true); } phase = 'bidding'; aiT = U.rand(.8, 1.3); renderPurses(); renderLot(); };
    const loop = () => {
      if (stopped || !document.body.contains(scr)) return;
      const now = performance.now(), dt = Math.min(.1, (now - lastTs) / 1000); lastTs = now;
      const l = A.lot;
      if (phase === 'bidding' && l) {
        l.timer += dt; aiT -= dt;
        if (auto && Auction.userAutoWants(A) && aiT < .3) { Auction.placeBid(A, me); aiT = U.rand(.5, 1); renderPurses(); renderLot(); }
        else if (aiT <= 0) {
          const bidder = Auction.aiBidder(A);
          if (bidder && (l.timer < 3.2)) { Auction.placeBid(A, bidder); Sfx.click(); renderPurses(); }
          aiT = U.rand(.45, 1.1);
        }
        const limit = l.bidder ? 3.2 : 2.4;
        if (l.timer > limit) { result = Auction.hammer(A); Sfx.gavel(); if (result.sold && result.team === me) { Sfx.coin(); vibrate(40); } phase = 'sold'; gapT = 1.3; renderPurses(); }
        renderLot();
      } else if (phase === 'sold') { gapT -= dt; if (gapT <= 0) next(); }
      requestAnimationFrame(loop);
    };
    scr.querySelector('#bidbtn').onclick = () => { if (Auction.placeBid(A, me)) { Sfx.coin(); vibrate(15); aiT = U.rand(.6, 1.2); renderPurses(); renderLot(); } };
    scr.querySelector('#passbtn').onclick = () => { Sfx.click(); A.lot.passed[me] = true; aiT = Math.min(aiT, .3); renderLot(); };
    scr.querySelector('#autobtn').onclick = (e) => { auto = !auto; e.target.textContent = 'Auto-bid: ' + (auto ? 'on' : 'off'); Sfx.click(); };
    scr.querySelector('#simset').onclick = () => {
      Sfx.click(); const cur = A.lot ? A.lot.set : null;
      if (phase === 'bidding') A.lot.passed[me] = true;
      if (phase === 'bidding') { result = Auction.quickResolve(A, auto); }
      while (true) { const p = Auction.nextLot(A); if (!p) { stopped = true; Save.save(); return this.squadScreen(true); } if (A.lot.set !== cur) break; Auction.quickResolve(A, auto); }
      result = null; phase = 'bidding'; renderPurses(); renderLot(); Save.save();
    };
    scr.querySelector('#finish').onclick = () => {
      if (!confirm('Let the auction manager finish the rest (auto-bids for you)?')) return;
      if (phase === 'bidding') Auction.quickResolve(A, true);
      Auction.simulateRest(A, true); stopped = true; Save.save(); this.squadScreen(true);
    };
    if (!A.lot) next(); else { renderPurses(); renderLot(); }
    requestAnimationFrame(loop);
  },

  // ================= SQUAD / PLAYING XI =================
  squadScreen(afterAuction) {
    Game.stopDemo();
    const C = Save.data.career, A = C.auction, me = C.userTeam;
    const squad = Auction.squad(A, me).sort((a, b) => b.ovr - a.ovr);
    let xi = C.xi ? C.xi.filter(id => squad.find(p => p.id === id)) : pickBestXI(squad).map(p => p.id);
    const spent = A.sold.filter(s => s.team === me).reduce((s, x) => s + x.price, 0);
    const scr = this.show(`<div class="row"><button class="btn small alt" data-a="back">←</button><h2 class="h2" style="margin:0">${afterAuction ? 'Your Squad' : 'Playing XI'}</h2></div>
      <div class="row" style="margin:10px 0">${badge(me, 44)}<div><b style="font-family:var(--f)">${teamById(me).name}</b><div class="muted">${squad.length} players · spent ${spent} · purse left ${A.purses[me]}</div></div></div>
      <div class="muted" id="xinfo"></div>
      <div class="row" style="margin:8px 0"><button class="btn small alt" data-a="auto">Auto-pick XI</button></div>
      <div id="list"></div>
      <div style="height:10px"></div><button class="btn" data-a="save">Save XI & continue</button>`);
    const render = () => {
      const sel = xi.map(id => squad.find(p => p.id === id));
      const os = sel.filter(p => p.overseas).length, wk = sel.filter(p => p.role === 'WK').length, bowlers = sel.filter(p => p.role === 'BOWL' || p.role === 'AR').length;
      scr.querySelector('#xinfo').innerHTML = `Selected <b>${xi.length}/11</b> · overseas ${os}/4 · keepers ${wk} · bowling options ${bowlers}${os > 4 ? ' · <b style="color:var(--red)">max 4 overseas</b>' : ''}${wk < 1 ? ' · <b style="color:var(--red)">need a keeper</b>' : ''}`;
      scr.querySelector('#list').innerHTML = squad.map(p => {
        const on = xi.includes(p.id), pos = xi.indexOf(p.id);
        return `<button class="list-item ${on ? 'sel' : ''}" data-id="${p.id}"><div class="ovr">${p.ovr}</div><div><b>${p.name}</b><span class="role">${roleName[p.role]}</span>${p.overseas ? '<span class="os">OS</span>' : ''}<div class="meta">BAT ${p.bat} · BOWL ${p.bowl}${p.role !== 'BAT' && p.role !== 'WK' ? ' ' + p.bowlType : ''} · paid ${(A.sold.find(s => s.id === p.id) || {}).price ?? '-'}</div></div><div class="r"><b>${on ? '#' + (pos + 1) : ''}</b></div></button>`;
      }).join('');
      scr.querySelectorAll('[data-id]').forEach(b => b.onclick = () => {
        Sfx.click(); const id = b.dataset.id;
        if (xi.includes(id)) xi = xi.filter(x => x !== id); else if (xi.length < 11) xi.push(id); else this.toast('XI is full — remove someone first');
        render();
      });
    };
    render();
    this.bind(scr, {
      '[data-a=back]': () => afterAuction ? this.home() : this.leagueHub(),
      '[data-a=auto]': () => { xi = pickBestXI(squad).map(p => p.id); render(); },
      '[data-a=save]': () => {
        const sel = xi.map(id => squad.find(p => p.id === id));
        if (xi.length !== 11) return this.toast('Pick exactly 11 players');
        if (sel.filter(p => p.overseas).length > 4) return this.toast('Max 4 overseas players in the XI');
        if (!sel.some(p => p.role === 'WK')) return this.toast('Pick a wicket-keeper');
        C.xi = orderBattingXI(sel).map(p => p.id);
        if (!C.league) League.create(C);
        Save.save(); this.leagueHub();
      },
    });
  },

  // ================= LEAGUE HUB =================
  leagueHub() {
    Game.stopDemo(); this.clearHud(); Play.stop();
    const C = Save.data.career; if (!C) return this.home();
    if (!C.auction.done) return this.auctionRoom();
    if (!C.league || !C.xi) return this.squadScreen(true);
    const L = C.league, me = C.userTeam;
    League.simPlayoffsUntilUser(C); Save.save();
    const fx = League.userFixture(C);
    const po = League.currentPlayoff(C);
    let nextCard = '';
    if (L.champion) {
      const won = L.champion === me;
      nextCard = `<div class="card" style="text-align:center"><div class="pill">SEASON ${C.season} COMPLETE</div><h2 class="h2" style="margin-top:10px">${teamById(L.champion).name} are champions!</h2>${won ? '<p style="font-weight:800">🏆 You won the title! +500 coins</p>' : ''}<button class="btn" data-a="newseason">Start next season (new auction)</button></div>`;
      if (won && !L.titlePaid) { L.titlePaid = true; Save.addCoins(500); }
    } else if (fx) {
      const opp = fx[0] === me ? fx[1] : fx[0];
      nextCard = `<div class="card"><div class="pill">MATCH ${L.round + 1} OF ${L.rounds.length}</div><div class="fx" style="margin:14px 0">${badge(me, 56)}<span class="vs">VS</span>${badge(opp, 56)}</div><div style="text-align:center;font-weight:800">${teamById(me).name} vs ${teamById(opp).name} · ${C.overs} overs</div><div style="height:12px"></div><button class="btn" data-a="play">Play match</button><div style="height:8px"></div><button class="btn alt small" style="width:100%" data-a="simm">Simulate this match</button></div>`;
    } else if (po) {
      const opp = po.a === me ? po.b : po.a;
      nextCard = `<div class="card"><div class="pill">${po.name.toUpperCase()}</div><div class="fx" style="margin:14px 0">${badge(me, 56)}<span class="vs">VS</span>${badge(opp, 56)}</div><button class="btn" data-a="playpo">Play ${po.name}</button><div style="height:8px"></div><button class="btn alt small" style="width:100%" data-a="simpo">Simulate</button></div>`;
    }
    const table = League.standings(L).map((r, i) => `<tr style="${r.id === me ? 'background:#fff3c4' : ''}"><td>${i + 1}. ${teamById(r.id).short}</td><td>${r.p}</td><td>${r.w}</td><td>${r.l}</td><td>${r.nr}</td><td>${r.nrr >= 0 ? '+' : ''}${r.nrr.toFixed(2)}</td><td><b>${r.pts}</b></td></tr>`).join('');
    const playoffs = L.playoffs ? `<div class="h3">Playoffs</div><div class="card" style="padding:10px">${L.playoffs.games.map(g => `<div class="reward"><span>${g.name}</span><span>${g.a ? teamById(g.a).short : 'TBD'} v ${g.b ? teamById(g.b).short : 'TBD'}${g.winner ? ' → <b>' + teamById(g.winner).short + '</b>' : ''}</span></div>`).join('')}</div>` : '';
    const results = L.results.filter(r => r.a === me || r.b === me).slice(-5).reverse().map(r => `<div class="reward"><span>${teamById(r.a).short} ${r.sA} · ${teamById(r.b).short} ${r.sB}</span><span style="color:${r.winner === me ? 'var(--green)' : 'var(--red)'}">${r.winner === me ? 'W' : r.winner ? 'L' : 'T'}</span></div>`).join('');
    const scr = this.show(`<div class="row" style="justify-content:space-between"><button class="btn small alt" data-a="back">←</button>${coinsHTML(Save.data.coins)}</div>
      <h2 class="h2" style="margin-top:10px">Franchise League · S${C.season}</h2>
      ${nextCard}
      <div class="row" style="margin-top:12px"><button class="btn small alt" style="flex:1" data-a="xi">Playing XI</button><button class="btn small alt" style="flex:1" data-a="abandon">Quit league</button></div>
      ${playoffs}
      <div class="h3">Points table</div><div class="card" style="padding:8px"><table class="sc pts-table"><tr><th>Team</th><th>P</th><th>W</th><th>L</th><th>T</th><th>NRR</th><th>Pts</th></tr>${table}</table></div>
      ${results ? `<div class="h3">Your recent results</div><div class="card" style="padding:10px">${results}</div>` : ''}`);
    const startLeagueMatch = (opp, isPlayoff) => {
      const m = League.quickMatch(C, me, opp, { mode: 'league', playoff: isPlayoff });
      m.cfg.teamA = m.sides.A; m.cfg.teamB = m.sides.B;
      this.toss(m, () => Game.playMatch(m, (rew) => {
        if (isPlayoff) League.recordPlayoff(C, m); else { League.record(L, m); League.completeRound(C); }
        Save.save(); this.result(m, rew);
      }));
    };
    this.bind(scr, {
      '[data-a=back]': () => this.home(),
      '[data-a=play]': () => startLeagueMatch(fx[0] === me ? fx[1] : fx[0], false),
      '[data-a=simm]': () => { const m = League.quickMatch(C, fx[0], fx[1]); Sim.playMatch(m); League.record(L, m); League.completeRound(C); Save.save(); this.toast(m.result.text, 2200); this.leagueHub(); },
      '[data-a=playpo]': () => startLeagueMatch(po.a === me ? po.b : po.a, true),
      '[data-a=simpo]': () => { const m = League.quickMatch(C, po.a, po.b); Sim.playMatch(m); League.recordPlayoff(C, m); Save.save(); this.toast(m.result.text, 2200); this.leagueHub(); },
      '[data-a=xi]': () => this.squadScreen(false),
      '[data-a=abandon]': () => { if (confirm('Quit this franchise league? Progress will be lost.')) { Save.data.career = null; Save.save(); this.home(); } },
      '[data-a=newseason]': () => { const s = C.season + 1; Save.data.career = { userTeam: me, overs: C.overs, season: s, auction: Auction.create(me, 0), xi: null, league: null }; Save.save(); this.auctionRoom(); },
    });
  },
};
