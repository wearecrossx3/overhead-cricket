'use strict';
// ---------- Phase 6: commentary, bat shop, challenges, daily rewards, achievements ----------

const Commentary = {
  pools: {
    six: ['That is HUGE! Into the stands!', 'Goes all the way — massive six!', 'Sweet as you like. Six!', 'Out of the ground! What a strike!', 'Picked the length early and launched it!'],
    four: ['Cracking shot, races away for four!', 'Through the gap — four runs!', 'No chance for the fielder. Boundary!', 'Timed to perfection. Four!', 'Pierces the field beautifully!'],
    dot: ['Good ball. Dot.', 'Defended solidly.', 'Beaten! Nothing doing there.', 'Tight line, no run.', 'Right on the money.'],
    single: ['Pushed into the gap for one.', 'Quick single, well run.', 'Rotates the strike.'],
    two: ['Hard running, they come back for two.', 'Into the deep — two more.'],
    three: ['Superb running, three taken!'],
    bowled: ['Bowled him! Timber!', 'Through the gate — stumps everywhere!', 'Cleaned up!'],
    caught: ['Taken! Safe hands in the field.', 'Straight down the throat — caught!', 'Up in the air... and held!'],
    lbw: ['Plumb! Finger goes up — LBW.', 'Trapped in front!'],
    runout: ['Direct hit! He is short of his ground!', 'Run out! Terrible mix-up!'],
    stumped: ['Lightning work behind the stumps — stumped!'],
    hitwicket: ['Oh dear — he has trodden on his own stumps! Hit wicket!'],
    wide: ['Strays down the leg side — wide.', 'Too wide, the umpire stretches his arms.'],
    nb: ['No ball! And that means a FREE HIT.', 'Overstepped! Free hit coming up.'],
    fire: ['He is ON FIRE! Three perfect strikes in a row!'],
  },
  line(o, play, res) {
    const P = this.pools;
    if (o.wicket) return U.pick(P[o.wicket.type] || P.caught);
    if (o.extra === 'nb') return U.pick(P.nb);
    if (o.extra === 'wd') return U.pick(P.wide);
    if (o.boundary === 6) return U.pick(P.six);
    if (o.boundary === 4) return U.pick(P.four);
    if (o.runs === 1) return U.pick(P.single);
    if (o.runs === 2) return U.pick(P.two);
    if (o.runs === 3) return U.pick(P.three);
    return Math.random() < .5 ? U.pick(P.dot) : null;
  },
};

// ---------- Bat shop (coins) ----------
const SHOP = {
  bats: [
    { id: 'classic', name: 'Classic Willow', price: 0, power: 1, timing: 1, color: '#ecd29c', desc: 'Trusty English willow.' },
    { id: 'power', name: 'Power Blade', price: 400, power: 1.08, timing: 1, color: '#e7c27d', desc: '+8% shot power.' },
    { id: 'touch', name: 'Touch Master', price: 500, power: 1, timing: 1.14, color: '#f3e3bd', desc: '+14% bigger timing window.' },
    { id: 'thunder', name: 'Thunder Bat', price: 900, power: 1.14, timing: 1.04, color: '#3a3f4b', desc: '+14% power, +4% timing.' },
    { id: 'gold', name: 'Golden Willow', price: 1500, power: 1.12, timing: 1.12, color: '#f5c518', desc: '+12% power & timing. Pure flex.' },
  ],
  state() { if (!Save.data.shop) Save.data.shop = { owned: ['classic'], bat: 'classic' }; return Save.data.shop; },
  bat() { const s = this.state(); return this.bats.find(b => b.id === s.bat) || this.bats[0]; },
  buy(id) {
    const b = this.bats.find(x => x.id === id), s = this.state();
    if (!b || s.owned.includes(id) || Save.data.coins < b.price) return false;
    Save.addCoins(-b.price); s.owned.push(id); s.bat = id; Save.save(); return true;
  },
  equip(id) { const s = this.state(); if (s.owned.includes(id)) { s.bat = id; Save.save(); } },
};

// ---------- Challenge scenarios (stars) ----------
// kind: chase (you bat, need X off N balls with W wickets) | defend (you bowl, opponent needs X off N)
const CHALLENGES = [
  { t: 'Last-ball hero', kind: 'chase', need: 4, balls: 1, wkts: 1, opp: 'MMS', s2t: 'Finish with a six', s2: i => i.sixes >= 1 },
  { t: 'Six to win', kind: 'chase', need: 6, balls: 2, wkts: 1, opp: 'DLD', s2t: 'Win with a ball to spare', s2: i => i.left >= 1 },
  { t: 'Over to win it', kind: 'chase', need: 12, balls: 6, wkts: 2, opp: 'CHC', s2t: '2+ balls to spare', s2: i => i.left >= 2 },
  { t: 'Hold your nerve', kind: 'defend', need: 8, balls: 6, wkts: 3, opp: 'KLC', s2t: 'Concede 4 or fewer', s2: i => i.runs <= 4 },
  { t: 'Powerplay blast', kind: 'chase', need: 20, balls: 12, wkts: 3, opp: 'BLB', s2t: '3+ balls to spare', s2: i => i.left >= 3 },
  { t: 'Death-over specialist', kind: 'defend', need: 12, balls: 6, wkts: 4, opp: 'HYH', s2t: 'Concede 6 or fewer', s2: i => i.runs <= 6 },
  { t: 'Tail-end rescue', kind: 'chase', need: 15, balls: 12, wkts: 1, opp: 'PJP', s2t: '2+ balls to spare', s2: i => i.left >= 2 },
  { t: 'Super over sim', kind: 'chase', need: 14, balls: 6, wkts: 2, opp: 'JPJ', s2t: 'Hit 2 sixes', s2: i => i.sixes >= 2 },
  { t: 'Strangle them', kind: 'defend', need: 18, balls: 12, wkts: 4, opp: 'AMA', s2t: 'Take 2 wickets', s2: i => i.wkts >= 2 },
  { t: '30 off 12', kind: 'chase', need: 30, balls: 12, wkts: 3, opp: 'MMS', s2t: '2+ balls to spare', s2: i => i.left >= 2 },
  { t: 'Spin web', kind: 'defend', need: 15, balls: 12, wkts: 3, opp: 'CHC', s2t: 'Concede 10 or fewer', s2: i => i.runs <= 10 },
  { t: 'The impossible', kind: 'chase', need: 36, balls: 12, wkts: 4, opp: 'BLB', s2t: 'Hit 4 sixes', s2: i => i.sixes >= 4 },
];
const Challenges = {
  stars() { if (!Save.data.chStars) Save.data.chStars = {}; return Save.data.chStars; },
  unlocked(i) { return i === 0 || (this.stars()[i - 1] || 0) > 0; },
  totalStars() { return Object.values(this.stars()).reduce((s, v) => s + v, 0); },
  s3t(ch) { return ch.kind === 'chase' ? 'Lose no wickets' : 'Bowl them out, or concede under half'; },
  evaluate(ch, inn) {
    const info = { sixes: inn.batting.reduce((s, b) => s + b.f6, 0), left: Math.round(inn.oversLimit * 6) - inn.balls, wkts: inn.wkts, runs: inn.runs };
    const won = ch.kind === 'chase' ? inn.runs >= inn.target : inn.runs < inn.target - 1; // defending: a tie is not a win
    if (!won) return 0;
    let st = 1;
    if (ch.s2(info)) st++;
    if (ch.kind === 'chase' ? info.wkts === 0 : (info.wkts >= inn.maxWkts || info.runs < (inn.target - 1) / 2)) st++;
    return st;
  },
};

// ---------- Daily reward ----------
const Daily = {
  today() { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; },
  available() { const s = Save.data.daily; return !s || s.last !== this.today(); },
  claim() {
    const s = Save.data.daily || { last: null, streak: 0 };
    const y = new Date(); y.setDate(y.getDate() - 1);
    const yest = `${y.getFullYear()}-${y.getMonth() + 1}-${y.getDate()}`;
    s.streak = s.last === yest ? Math.min(7, s.streak + 1) : 1; s.last = this.today();
    const amt = 40 + s.streak * 20; Save.data.daily = s; Save.addCoins(amt);
    return { amt, streak: s.streak };
  },
};

// ---------- Achievements ----------
const ACHIEVEMENTS = [
  { id: 'first_win', t: 'First Victory', d: 'Win your first match', c: 50 },
  { id: 'six3', t: 'Six Machine', d: 'Hit 3 sixes in one match', c: 80 },
  { id: 'fifty', t: 'Half-Century', d: 'Score 50 with one batter', c: 120 },
  { id: 'fire', t: 'On Fire', d: 'Hit 3 perfect shots in a row', c: 60 },
  { id: 'win5', t: 'Winning Habit', d: 'Win 5 matches', c: 150 },
  { id: 'sixes25', t: 'Maximum Man', d: 'Hit 25 sixes in total', c: 200 },
  { id: 'wkt3', t: 'Three-for', d: 'Take 3 wickets in a match', c: 100 },
  { id: 'superover', t: 'Super Over Hero', d: 'Win a Super Over', c: 150 },
  { id: 'hard', t: 'Pro Level', d: 'Win on Hard difficulty', c: 200 },
  { id: 'champion', t: 'Champions!', d: 'Win the franchise league', c: 500 },
  { id: 'stars12', t: 'Star Collector', d: 'Earn 12 challenge stars', c: 200 },
  { id: 'gold', t: 'Golden Touch', d: 'Buy the Golden Willow', c: 100 },
];
const Ach = {
  got() { if (!Save.data.ach) Save.data.ach = {}; return Save.data.ach; },
  unlock(id) {
    const a = ACHIEVEMENTS.find(x => x.id === id), g = this.got(); if (!a || g[id]) return;
    g[id] = Date.now(); Save.addCoins(a.c); Save.save();
    UI.toast(`🏆 ${a.t} · +${a.c} coins`, 2600); Sfx.coin();
  },
  checkMatch(m, userSide, won) {
    const st = Save.data.stats;
    if (won) this.unlock('first_win');
    if (st.wins >= 5) this.unlock('win5');
    if (st.sixes >= 25) this.unlock('sixes25');
    if (won && Save.data.settings.difficulty === 'hard') this.unlock('hard');
    let six = 0, wk = 0, top = 0;
    m.innings.forEach(inn => {
      if (inn.bat === userSide) inn.batting.forEach(b => { six += b.f6; top = Math.max(top, b.r); });
      else wk += Object.values(inn.bowlers).reduce((s, b) => s + b.wkts, 0);
    });
    if (six >= 3) this.unlock('six3');
    if (top >= 50) this.unlock('fifty');
    if (wk >= 3) this.unlock('wkt3');
    if (won && m.innings.some(i => i.superOver)) this.unlock('superover');
    if (Challenges.totalStars() >= 12) this.unlock('stars12');
  },
};
