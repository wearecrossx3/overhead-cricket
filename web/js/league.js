'use strict';
// ---------- Franchise league: round robin + IPL-style playoffs ----------
const League = {
  // circle-method round robin: 10 teams -> 9 rounds x 5 fixtures
  schedule(ids) {
    const t = ids.slice(); const rounds = [];
    for (let r = 0; r < t.length - 1; r++) {
      const fx = [];
      for (let i = 0; i < t.length / 2; i++) { const a = t[i], b = t[t.length - 1 - i]; fx.push(r % 2 ? [b, a] : [a, b]); }
      rounds.push(fx); t.splice(1, 0, t.pop());
    }
    return rounds;
  },
  create(career) {
    const table = {}; TEAMS.forEach(t => table[t.id] = { p: 0, w: 0, l: 0, nr: 0, pts: 0, rf: 0, of: 0, ra: 0, ob: 0 });
    career.league = { rounds: this.schedule(TEAMS.map(t => t.id)), round: 0, table, results: [], playoffs: null, champion: null };
  },
  nrr(row) { return (row.of ? row.rf / row.of : 0) - (row.ob ? row.ra / row.ob : 0); },
  standings(L) {
    return Object.entries(L.table).map(([id, r]) => ({ id, ...r, nrr: this.nrr(r) }))
      .sort((a, b) => b.pts - a.pts || b.nrr - a.nrr);
  },
  // record a finished match (from Rules) into the table
  record(L, m, isPlayoff) {
    const A = m.sides.A.teamId, B = m.sides.B.teamId;
    const main = m.innings.filter(i => !i.superOver);
    if (!isPlayoff) {
      main.forEach(inn => {
        const batId = m.sides[inn.bat].teamId, bowlId = m.sides[inn.bowl].teamId;
        const ov = (inn.wkts >= inn.maxWkts ? inn.oversLimit * 6 : inn.balls) / 6;
        L.table[batId].rf += inn.runs; L.table[batId].of += ov;
        L.table[bowlId].ra += inn.runs; L.table[bowlId].ob += ov;
      });
      [A, B].forEach(id => L.table[id].p++);
      if (m.result.winner) {
        const w = m.sides[m.result.winner].teamId, l = w === A ? B : A;
        L.table[w].w++; L.table[w].pts += 2; L.table[l].l++;
      } else { L.table[A].nr++; L.table[B].nr++; L.table[A].pts++; L.table[B].pts++; }
    }
    L.results.push({ a: A, b: B, text: m.result.text, winner: m.result.winner ? m.sides[m.result.winner].teamId : null, sA: this.scoreLine(m, 'A'), sB: this.scoreLine(m, 'B'), playoff: isPlayoff || null });
  },
  scoreLine(m, side) { const inn = m.innings.find(i => i.bat === side && !i.superOver); return inn ? `${inn.runs}/${inn.wkts} (${U.oversStr(inn.balls)})` : '-'; },

  userFixture(career) {
    const L = career.league; if (L.round >= L.rounds.length) return null;
    return L.rounds[L.round].find(f => f.includes(career.userTeam));
  },
  // simulate all other fixtures of the current round, then advance
  completeRound(career) {
    const L = career.league; const fx = L.rounds[L.round];
    fx.forEach(([a, b]) => { if (a === career.userTeam || b === career.userTeam) return; const m = this.quickMatch(career, a, b); Sim.playMatch(m); this.record(L, m); });
    L.round++;
    if (L.round >= L.rounds.length) this.startPlayoffs(career);
  },
  quickMatch(career, a, b, extra = {}) {
    const xiA = career.xi && a === career.userTeam ? career.xi.map(id => career.auction.players[id]) : pickBestXI(Auction.squad(career.auction, a));
    const xiB = career.xi && b === career.userTeam ? career.xi.map(id => career.auction.players[id]) : pickBestXI(Auction.squad(career.auction, b));
    const m = Rules.newMatch({ overs: career.overs, teamA: { teamId: a, xi: xiA, isUser: a === career.userTeam }, teamB: { teamId: b, xi: xiB, isUser: b === career.userTeam }, batFirst: U.chance(.5) ? 'A' : 'B', ...extra });
    m.sides.A.teamId = a; m.sides.B.teamId = b;
    return m;
  },
  startPlayoffs(career) {
    const st = this.standings(career.league);
    career.league.playoffs = {
      top4: st.slice(0, 4).map(r => r.id),
      games: [
        { key: 'Q1', name: 'Qualifier 1', a: st[0].id, b: st[1].id, winner: null },
        { key: 'EL', name: 'Eliminator', a: st[2].id, b: st[3].id, winner: null },
        { key: 'Q2', name: 'Qualifier 2', a: null, b: null, winner: null },
        { key: 'F', name: 'Final', a: null, b: null, winner: null },
      ], idx: 0,
    };
  },
  currentPlayoff(career) { const P = career.league.playoffs; return P && P.idx < 4 ? P.games[P.idx] : null; },
  recordPlayoff(career, m) {
    const P = career.league.playoffs, g = P.games[P.idx];
    // knockout: a tie after super overs is broken by league position
    let w = m.result.winner ? m.sides[m.result.winner].teamId : (P.top4.indexOf(g.a) < P.top4.indexOf(g.b) ? g.a : g.b);
    g.winner = w; g.loser = w === g.a ? g.b : g.a; g.text = m.result.text;
    this.record(career.league, m, g.key);
    if (g.key === 'Q1') { P.games[3].a = w; P.games[2].a = g.loser; }
    if (g.key === 'EL') { P.games[2].b = w; }
    if (g.key === 'Q2') { P.games[3].b = w; }
    if (g.key === 'F') career.league.champion = w;
    P.idx++;
  },
  // sim playoff games not involving the user until the user's next game or the end
  simPlayoffsUntilUser(career) {
    let g;
    while ((g = this.currentPlayoff(career)) && g.a && g.b && g.a !== career.userTeam && g.b !== career.userTeam) {
      const m = this.quickMatch(career, g.a, g.b); Sim.playMatch(m); this.recordPlayoff(career, m);
    }
  },
};
