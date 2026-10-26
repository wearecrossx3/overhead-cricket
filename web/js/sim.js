'use strict';
// ---------- Statistical ball-by-ball simulator (AI vs AI, quick sim) ----------
const Sim = {
  ballOutcome(m, inn) {
    const st = Rules.striker(inn).p, bw = Rules.bowler(inn).p;
    const edge = (st.bat - bw.bowl) / 100; // -0.8 .. 0.8
    // situational aggression
    const left = Rules.ballsLeft(inn), rrr = Rules.rrr(inn);
    let agg = 0.45 + (inn.balls / (inn.oversLimit * 6)) * .35;
    if (rrr != null) agg += U.clamp((rrr - 8) * .05, -.25, .35);
    agg -= (inn.wkts >= inn.maxWkts - 2 ? .15 : 0);
    agg = U.clamp(agg, .15, .95);
    // extras
    const r = Math.random();
    const extraRate = .045 - bw.bowl / 4000;
    if (r < extraRate * .6) return { runs: U.chance(.1) ? 4 : 0, extra: 'wd', boundary: 0, wicket: null };
    if (r < extraRate) { const runs = U.pick([0, 0, 1, 1, 2, 4, 6]); return { runs, extra: 'nb', boundary: runs >= 4 ? runs : 0, wicket: null }; }
    // wicket
    const pW = U.clamp(0.045 + agg * .045 - edge * .05, .012, .14);
    if (!inn.freeHit && Math.random() < pW) {
      const type = U.pick(['caught', 'caught', 'caught', 'bowled', 'bowled', 'lbw', 'runout', 'stumped', 'caught', 'hitwicket'].filter(t => t !== 'stumped' || bw.bowlType === 'spin').filter(t => t !== 'hitwicket' || Math.random() < .15));
      const fielders = m.sides[inn.bowl].xi;
      const keeper = fielders.find(p => p.role === 'WK') || fielders[0];
      const fielder = type === 'stumped' ? keeper.name : type === 'caught' ? (Math.random() < .12 ? bw.name : U.pick(fielders).name) : type === 'runout' ? U.pick(fielders).name : '';
      const outI = type === 'runout' && Math.random() < .35 ? inn.nonStrikerI : inn.strikerI;
      return { runs: type === 'runout' ? U.pick([0, 1, 1]) : 0, extra: null, boundary: 0, wicket: { type, outI, fielder } };
    }
    // runs distribution
    const w = [
      [0, .42 - agg * .2 - edge * .08], [1, .33], [2, .07 + edge * .02], [3, .01],
      [4, .1 + agg * .07 + edge * .06], [6, .03 + agg * .09 + edge * .05],
    ];
    const tot = w.reduce((s, x) => s + Math.max(.005, x[1]), 0); let k = Math.random() * tot, runs = 0;
    for (const [v, p] of w) { k -= Math.max(.005, p); if (k <= 0) { runs = v; break; } }
    if (runs === 1 && Math.random() < .05) return { runs: 1, extra: U.pick(['b', 'lb']), boundary: 0, wicket: null };
    return { runs, extra: null, boundary: runs === 4 || runs === 6 ? runs : 0, wicket: null };
  },
  // Simulate until the current innings ends (or forever=true for whole match)
  playInnings(m) {
    let inn = Rules.inn(m), guard = 0;
    while (!Rules.inningsOver(inn) && guard++ < 1000) {
      if (!inn.bowlerId) Rules.autoBowler(m, inn);
      Rules.recordBall(m, this.ballOutcome(m, inn));
    }
  },
  playMatch(m) {
    if (m.cur < 0) Rules.startInnings(m, m.cfg.batFirst || 'A');
    let guard = 0;
    while (!m.result && guard++ < 20) {
      this.playInnings(m);
      const inn = Rules.inn(m);
      inn.superOver ? Rules.advanceSuperOver(m) : Rules.advance(m);
    }
    return m;
  },
};
