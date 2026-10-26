'use strict';
// ---------- IPL-style player auction (coins) ----------
const AUCTION = { PURSE: 1000, MIN_SQUAD: 15, MAX_SQUAD: 20, MAX_OVERSEAS: 6, TOPUP_MAX: 300 };

const Auction = {
  increment(bid) { return bid < 100 ? 5 : bid < 200 ? 10 : bid < 500 ? 20 : 25; },

  create(userTeam, topUp = 0) {
    const pool = makePlayerPool(210);
    const squads = {}, purses = {};
    TEAMS.forEach(t => { squads[t.id] = []; purses[t.id] = AUCTION.PURSE + (t.id === userTeam ? topUp : 0); });
    // auction sets, like the real thing: marquee first, then by role
    const byOvr = pool.slice().sort((a, b) => b.ovr - a.ovr);
    const marquee = byOvr.slice(0, 10);
    const rest = pool.filter(p => !marquee.includes(p));
    const set = (name, fn) => ({ name, ids: U.shuffle(rest.filter(fn)).map(p => p.id) });
    const sets = [
      { name: 'Marquee Players', ids: U.shuffle(marquee).map(p => p.id) },
      set('Batters', p => p.role === 'BAT'),
      set('All-Rounders', p => p.role === 'AR'),
      set('Wicket-Keepers', p => p.role === 'WK'),
      set('Fast Bowlers', p => p.role === 'BOWL' && p.bowlType === 'pace'),
      set('Spinners', p => p.role === 'BOWL' && p.bowlType === 'spin'),
    ];
    const players = {}; pool.forEach(p => players[p.id] = p);
    const order = []; sets.forEach((s, si) => s.ids.forEach(id => order.push({ id, set: si })));
    return { userTeam, players, squads, purses, sets: sets.map(s => s.name), order, idx: -1, lot: null, sold: [], unsold: [], round: 1, done: false, log: [] };
  },

  // per-team AI personality (seeded per auction) for variety
  personality(A, teamId) {
    A.pers = A.pers || {};
    if (!A.pers[teamId]) A.pers[teamId] = { greed: U.rand(.85, 1.25), favRole: U.pick(['BAT', 'BOWL', 'AR', 'WK']), spin: U.chance(.5) };
    return A.pers[teamId];
  },
  needs(A, teamId) {
    const sq = A.squads[teamId].map(id => A.players[id]);
    const c = r => sq.filter(p => p.role === r).length;
    return { BAT: 5 - c('BAT'), BOWL: 6 - c('BOWL'), AR: 3 - c('AR'), WK: 2 - c('WK'), total: sq.length, overseas: sq.filter(p => p.overseas).length };
  },
  canBuy(A, teamId, p, price) {
    const n = this.needs(A, teamId);
    if (n.total >= AUCTION.MAX_SQUAD) return false;
    if (p.overseas && n.overseas >= AUCTION.MAX_OVERSEAS) return false;
    const slotsAfter = Math.max(0, AUCTION.MIN_SQUAD - (n.total + 1));
    return A.purses[teamId] - price >= slotsAfter * 20;
  },
  // how much an AI franchise is willing to pay
  valuation(A, teamId, p) {
    const per = this.personality(A, teamId), n = this.needs(A, teamId);
    let v = Math.pow(Math.max(0, p.ovr - 52), 1.9) * .6 + p.basePrice * .6;
    const need = n[p.role];
    v *= need > 1 ? 1.35 : need === 1 ? 1.1 : need === 0 ? .75 : .45;
    if (per.favRole === p.role) v *= 1.15;
    if (p.overseas && n.overseas >= AUCTION.MAX_OVERSEAS - 1) v *= .7;
    v *= per.greed * (A.lot && A.lot.jitter[teamId] || 1);
    // spend more freely early, protect purse for remaining slots
    const slotsLeft = Math.max(1, AUCTION.MIN_SQUAD - n.total);
    const avgLeft = A.purses[teamId] / slotsLeft;
    v = Math.min(v, avgLeft * (p.ovr >= 86 ? 5 : p.ovr >= 80 ? 3.4 : 2.2));
    return Math.max(p.basePrice, Math.round(v));
  },

  nextLot(A) {
    A.idx++;
    if (A.idx >= A.order.length) {
      // accelerated round for unsold players, at base price
      if (A.round === 1 && A.unsold.length) {
        A.round = 2; A.order = A.unsold.map(id => ({ id, set: -1 })); A.unsold = []; A.idx = 0;
      } else { this.finish(A); return null; }
    }
    const { id, set } = A.order[A.idx];
    const p = A.players[id];
    const jitter = {}; TEAMS.forEach(t => jitter[t.id] = U.rand(.8, 1.2));
    A.lot = { id, set, bid: null, bidder: null, history: [], passed: {}, jitter, timer: 0 };
    return p;
  },
  minNextBid(A) { const l = A.lot, p = A.players[l.id]; return l.bid == null ? p.basePrice : l.bid + this.increment(l.bid); },
  placeBid(A, teamId) {
    const l = A.lot, p = A.players[l.id], amt = this.minNextBid(A);
    if (!this.canBuy(A, teamId, p, amt) || l.bidder === teamId) return false;
    l.bid = amt; l.bidder = teamId; l.history.push({ team: teamId, amt }); l.timer = 0;
    return true;
  },
  // pick an AI team that wants to raise
  aiBidder(A) {
    const l = A.lot, p = A.players[l.id], amt = this.minNextBid(A);
    const keen = TEAMS.filter(t => t.id !== A.userTeam && t.id !== l.bidder && !l.passed[t.id])
      .filter(t => this.canBuy(A, t.id, p, amt) && this.valuation(A, t.id, p) >= amt);
    if (!keen.length) return null;
    // teams with bigger valuation more likely to jump in
    keen.sort((a, b) => this.valuation(A, b.id, p) - this.valuation(A, a.id, p) + U.rand(-30, 30));
    return keen[Math.random() < .7 ? 0 : U.randi(0, keen.length - 1)].id;
  },
  // user's own auto-bid (used when they hand over to the "auction manager")
  userAutoWants(A) {
    const l = A.lot, p = A.players[l.id], amt = this.minNextBid(A);
    return l.bidder !== A.userTeam && this.canBuy(A, A.userTeam, p, amt) && this.valuation(A, A.userTeam, p) >= amt;
  },
  hammer(A) {
    const l = A.lot, p = A.players[l.id];
    if (l.bidder) {
      A.squads[l.bidder].push(p.id); A.purses[l.bidder] -= l.bid;
      A.sold.push({ id: p.id, team: l.bidder, price: l.bid });
      A.log.unshift(`${p.name} → ${l.bidder} for ${l.bid}`);
      return { sold: true, team: l.bidder, price: l.bid };
    }
    A.unsold.push(p.id); A.log.unshift(`${p.name} — unsold`);
    return { sold: false };
  },
  // instantly resolve the current lot without the user (AI only + optional user auto)
  quickResolve(A, userAuto) {
    let guard = 0;
    while (guard++ < 200) {
      let bidder = this.aiBidder(A);
      if (userAuto && this.userAutoWants(A) && (Math.random() < .5 || !bidder)) bidder = A.userTeam;
      if (!bidder) break;
      this.placeBid(A, bidder);
    }
    return this.hammer(A);
  },
  simulateRest(A, userAuto = true) {
    let guard = 0;
    while (!A.done && guard++ < 500) { const p = this.nextLot(A); if (!p) break; this.quickResolve(A, userAuto); }
  },
  finish(A) {
    // make sure everyone has a playable squad: fill from leftovers at base price (or free if broke)
    const left = Object.values(A.players).filter(p => !A.sold.find(s => s.id === p.id));
    TEAMS.forEach(t => {
      let n = this.needs(A, t.id);
      while (n.total < AUCTION.MIN_SQUAD && left.length) {
        const roleNeed = ['WK', 'BOWL', 'AR', 'BAT'].find(r => n[r] > 0) || 'BAT';
        let i = left.findIndex(p => p.role === roleNeed && (!p.overseas || n.overseas < AUCTION.MAX_OVERSEAS));
        if (i < 0) i = left.findIndex(p => !p.overseas || n.overseas < AUCTION.MAX_OVERSEAS);
        if (i < 0) break;
        const p = left.splice(i, 1)[0]; const price = Math.min(p.basePrice, A.purses[t.id]);
        A.squads[t.id].push(p.id); A.purses[t.id] -= price; A.sold.push({ id: p.id, team: t.id, price });
        n = this.needs(A, t.id);
      }
    });
    A.done = true; A.lot = null;
  },
  squad(A, teamId) { return A.squads[teamId].map(id => A.players[id]); },
};
