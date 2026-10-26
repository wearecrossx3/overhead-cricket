'use strict';
// ---------- Laws of the game: scoring, extras, dismissals, overs, innings, super over ----------
const DISMISS_TEXT = {
  bowled: (b, f) => `b ${b}`,
  caught: (b, f) => (f === b ? `c & b ${b}` : `c ${f} b ${b}`),
  lbw: (b) => `lbw b ${b}`,
  runout: (b, f) => `run out (${f})`,
  stumped: (b, f) => `st ${f} b ${b}`,
  hitwicket: (b) => `hit wicket b ${b}`,
};
const short = (name) => { const parts = name.split(' '); return parts.length > 1 ? parts[parts.length - 1] : name; };

const Rules = {
  newMatch(cfg) {
    const m = {
      cfg, overs: cfg.overs, sides: { A: cfg.teamA, B: cfg.teamB },
      innings: [], cur: -1, result: null, superOverCount: 0, inSuperOver: false, events: [],
      maxBowlerOvers: Math.max(1, Math.ceil(cfg.overs / 5)),
    };
    return m;
  },
  startInnings(m, batSide, opts = {}) {
    const bowlSide = batSide === 'A' ? 'B' : 'A';
    const xi = opts.batters || m.sides[batSide].xi;
    const inn = {
      bat: batSide, bowl: bowlSide, runs: 0, wkts: 0, balls: 0,
      extras: { wd: 0, nb: 0, b: 0, lb: 0 },
      batting: xi.map(p => ({ p, r: 0, b: 0, f4: 0, f6: 0, out: null, dnb: true })),
      strikerI: 0, nonStrikerI: 1, nextI: 2,
      bowlers: {}, bowlerId: null, lastBowlerId: null,
      thisOver: [], overLog: [], freeHit: false, bouncers: 0,
      maxWkts: opts.maxWkts ?? Math.min(10, xi.length - 1), oversLimit: opts.overs ?? m.overs,
      target: opts.target ?? null, fow: [], partnership: { r: 0, b: 0 }, superOver: !!opts.superOver,
      fixedBowlers: opts.bowlers || null,
    };
    inn.batting[0].dnb = false; inn.batting[1].dnb = false;
    m.innings.push(inn); m.cur = m.innings.length - 1;
    return inn;
  },
  inn(m) { return m.innings[m.cur]; },
  striker(inn) { return inn.batting[inn.strikerI]; },
  nonStriker(inn) { return inn.batting[inn.nonStrikerI]; },
  bowler(inn) { return inn.bowlers[inn.bowlerId]; },

  // Who can bowl the next over (not the previous over's bowler, under quota)
  eligibleBowlers(m, inn) {
    const xi = inn.fixedBowlers || m.sides[inn.bowl].xi;
    const quota = inn.superOver ? 1 : m.maxBowlerOvers;
    const list = bowlingOptions(xi);
    return list.filter(p => p.id !== inn.lastBowlerId && (!inn.bowlers[p.id] || Math.floor(inn.bowlers[p.id].balls / 6) < quota));
  },
  setBowler(inn, p) {
    if (!inn.bowlers[p.id]) inn.bowlers[p.id] = { p, balls: 0, runs: 0, wkts: 0, wd: 0, nb: 0, dots: 0, maidens: 0, overRuns: 0 };
    inn.bowlerId = p.id; inn.bowlers[p.id].overRuns = 0;
  },
  autoBowler(m, inn) {
    let el = this.eligibleBowlers(m, inn);
    if (!el.length) { // fallback: anyone except last bowler
      el = (m.sides[inn.bowl].xi).filter(p => p.id !== inn.lastBowlerId);
    }
    // rotate: prefer best bowler with most quota remaining, small randomness
    el.sort((a, b) => (b.bowl + Math.random() * 10 - (inn.bowlers[b.id]?.balls || 0) * .6) - (a.bowl + Math.random() * 10 - (inn.bowlers[a.id]?.balls || 0) * .6));
    // death overs: save best for last
    this.setBowler(inn, el[0]);
    return el[0];
  },

  /* Record one delivery.
     o = { runs, extra:null|'wd'|'nb'|'b'|'lb', boundary:0|4|6, wicket:null|{type, outI, fielder}, bouncer:bool } */
  recordBall(m, o) {
    const inn = this.inn(m), bw = this.bowler(inn), st = this.striker(inn);
    const ev = { over: U.oversStr(inn.balls), striker: st.p.name, bowler: bw.p.name, ...o, freeHitBall: inn.freeHit };
    const legal = o.extra !== 'wd' && o.extra !== 'nb';
    let teamRuns = 0, sym = '';
    if (o.extra === 'wd') {
      teamRuns = 1 + o.runs; inn.extras.wd += teamRuns; bw.runs += teamRuns; bw.wd++; sym = o.runs ? `${teamRuns}wd` : 'wd';
    } else if (o.extra === 'nb') {
      teamRuns = 1 + o.runs; inn.extras.nb += 1; st.r += o.runs; st.b += 1; bw.runs += teamRuns; bw.nb++;
      if (o.boundary === 4) st.f4++; if (o.boundary === 6) st.f6++;
      sym = o.runs ? `nb+${o.runs}` : 'nb';
    } else if (o.extra === 'b' || o.extra === 'lb') {
      teamRuns = o.runs; inn.extras[o.extra] += o.runs; st.b += 1; sym = `${o.runs}${o.extra}`;
    } else {
      teamRuns = o.runs; st.r += o.runs; st.b += 1; bw.runs += o.runs;
      if (o.boundary === 4) st.f4++; if (o.boundary === 6) st.f6++;
      sym = o.runs === 0 ? '•' : String(o.runs);
    }
    inn.runs += teamRuns; bw.overRuns += (o.extra === 'b' || o.extra === 'lb') ? 0 : teamRuns;
    inn.partnership.r += teamRuns; if (legal) inn.partnership.b++;
    if (legal) { inn.balls++; bw.balls++; if (teamRuns === 0 && !o.wicket) bw.dots++; }
    if (o.bouncer) inn.bouncers++;

    // strike rotation for runs physically run (not boundaries)
    const ran = o.boundary ? 0 : (o.extra === 'wd' ? o.runs : o.runs);
    if (ran % 2 === 1) this.swapStrike(inn);

    // wicket
    if (o.wicket) {
      const w = o.wicket;
      const freeHitProtected = inn.freeHit && w.type !== 'runout';
      if (!freeHitProtected) {
        const b = inn.batting[w.outI];
        b.out = DISMISS_TEXT[w.type](short(bw.p.name), w.fielder ? short(w.fielder) : '');
        b.howOut = w.type;
        if (w.type !== 'runout') bw.wkts++;
        inn.wkts++; inn.fow.push({ runs: inn.runs, wkt: inn.wkts, over: U.oversStr(inn.balls), name: b.p.name });
        inn.partnership = { r: 0, b: 0 };
        sym = (sym === '•' ? '' : sym + '+') + 'W';
        ev.outName = b.p.name; ev.outText = b.out;
        if (inn.wkts < inn.maxWkts && inn.nextI < inn.batting.length) {
          const newI = inn.nextI++; inn.batting[newI].dnb = false;
          if (w.type === 'caught') { // new batter always takes strike (current playing conditions)
            const survivor = inn.strikerI === w.outI ? inn.nonStrikerI : inn.strikerI;
            inn.strikerI = newI; inn.nonStrikerI = survivor;
          } else if (inn.strikerI === w.outI) inn.strikerI = newI; else inn.nonStrikerI = newI;
        }
      }
    }
    // free hit bookkeeping: a no-ball gives a free hit; a wide during a free hit keeps it
    if (o.extra === 'nb') inn.freeHit = true; else if (legal) inn.freeHit = false;
    inn.thisOver.push(sym); ev.sym = sym; ev.teamRuns = teamRuns;
    m.events.push(ev);

    // over complete?
    let overDone = false;
    if (legal && inn.balls % 6 === 0) {
      overDone = true;
      if (bw.overRuns === 0) bw.maidens++;
      inn.overLog.push({ bowler: bw.p.name, balls: inn.thisOver.slice(), runs: bw.overRuns });
      inn.thisOver = []; inn.bouncers = 0; inn.lastBowlerId = inn.bowlerId; inn.bowlerId = null;
      this.swapStrike(inn);
    }
    const inningsOver = this.inningsOver(inn);
    if (inningsOver && !overDone && inn.thisOver.length) { inn.overLog.push({ bowler: bw.p.name, balls: inn.thisOver.slice(), runs: bw.overRuns }); }
    return { overDone, inningsOver, ev };
  },
  swapStrike(inn) { const t = inn.strikerI; inn.strikerI = inn.nonStrikerI; inn.nonStrikerI = t; },
  inningsOver(inn) {
    return inn.wkts >= inn.maxWkts || inn.balls >= inn.oversLimit * 6 || (inn.target != null && inn.runs >= inn.target);
  },

  // After an innings ends, advance the match. Returns 'next'|'superover'|'done'
  advance(m) {
    const inn = this.inn(m);
    const n = m.innings.length;
    if (!inn.superOver && n === 1) {
      this.startInnings(m, inn.bowl, { target: inn.runs + 1 });
      return 'next';
    }
    // compare last pair of innings
    const a = m.innings[n - 2], b = m.innings[n - 1];
    if (b.runs > a.runs) return this.finish(m, b.bat, b, a, true);
    if (b.runs < a.runs) return this.finish(m, a.bat, a, b, false);
    // tie
    if (m.cfg.superOver === false) { m.result = { winner: null, text: 'Match tied' }; return 'done'; }
    if (m.superOverCount >= 3) { // after repeated ties: boundary count decides
      const bc = (side) => m.innings.filter(i => i.bat === side).reduce((s, i) => s + i.batting.reduce((t, x) => t + x.f4 + x.f6, 0), 0);
      const A = bc('A'), B = bc('B');
      const w = A === B ? null : (A > B ? 'A' : 'B');
      m.result = { winner: w, text: w ? `${this.teamName(m, w)} win on boundary count` : 'Match tied' };
      return 'done';
    }
    m.superOverCount++; m.inSuperOver = true;
    // team batting second in the previous pair bats first in the super over
    const first = b.bat;
    this.startSuperOverInnings(m, first, null);
    return 'superover';
  },
  startSuperOverInnings(m, batSide, target) {
    const xi = m.sides[batSide].xi;
    const bowlSide = batSide === 'A' ? 'B' : 'A';
    const batters = xi.slice().sort((x, y) => y.bat - x.bat).slice(0, 3);
    // previous super-over bowler of this side can't bowl the next one
    const prevSO = m.innings.filter(i => i.superOver && i.bowl === bowlSide).pop();
    const prevId = prevSO ? Object.keys(prevSO.bowlers)[0] : null;
    const bowlers = bowlingOptions(m.sides[bowlSide].xi).filter(p => p.id !== prevId).slice(0, 3);
    return this.startInnings(m, batSide, { batters, maxWkts: 2, overs: 1, superOver: true, target, bowlers });
  },
  advanceSuperOver(m) {
    const inn = this.inn(m);
    const soCount = m.innings.filter(i => i.superOver).length;
    if (soCount % 2 === 1) { this.startSuperOverInnings(m, inn.bowl, inn.runs + 1); return 'next'; }
    return this.advance(m);
  },
  finish(m, winSide, wInn, lInn, chased) {
    let text;
    if (wInn.superOver) text = `${this.teamName(m, winSide)} win the Super Over`;
    else if (chased) { const w = wInn.maxWkts - wInn.wkts; text = `${this.teamName(m, winSide)} won by ${w} wicket${w === 1 ? '' : 's'}` + (wInn.oversLimit * 6 - wInn.balls > 0 ? ` (${wInn.oversLimit * 6 - wInn.balls} balls left)` : ''); }
    else { const r = wInn.runs - lInn.runs; text = `${this.teamName(m, winSide)} won by ${r} run${r === 1 ? '' : 's'}`; }
    m.result = { winner: winSide, text };
    return 'done';
  },
  teamName(m, side) { return teamById(m.sides[side].teamId).name; },

  crr(inn) { return inn.balls ? (inn.runs / inn.balls * 6) : 0; },
  rrr(inn) { if (inn.target == null) return null; const left = inn.oversLimit * 6 - inn.balls; return left > 0 ? Math.max(0, (inn.target - inn.runs) / left * 6) : 0; },
  ballsLeft(inn) { return inn.oversLimit * 6 - inn.balls; },
  // Net run rate contribution
  nrrPart(inn) { const overs = (inn.wkts >= inn.maxWkts ? inn.oversLimit * 6 : inn.balls) / 6; return { runs: inn.runs, overs }; },

  // ---- Delivery legality helpers (used by the physics layer) ----
  WIDE_X: 0.89 + 0.18,      // beyond the guideline (+ ball radius allowance)
  HEAD_HEIGHT: 1.75,        // bouncer above head = wide (limited-overs regulation)
  WAIST: 1.0,               // full toss above waist = no-ball
  BOUNCERS_PER_OVER: 1,
};
