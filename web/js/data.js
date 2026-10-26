'use strict';
// ---------- Fictional franchises (no real league names/logos) ----------
const TEAMS = [
  { id: 'RJR', name: 'Rajkot Rhinos',      short: 'RJR', c1: '#1f4fa8', c2: '#f5c518' },
  { id: 'MMS', name: 'Mumbai Monsoons',    short: 'MMS', c1: '#0e7c86', c2: '#e8f1f2' },
  { id: 'DLD', name: 'Delhi Daredrills',   short: 'DLD', c1: '#c8312f', c2: '#1d2d5c' },
  { id: 'CHC', name: 'Chennai Cyclones',   short: 'CHC', c1: '#f2b705', c2: '#2a3d8f' },
  { id: 'KLC', name: 'Kolkata Comets',     short: 'KLC', c1: '#5b2c83', c2: '#e3b448' },
  { id: 'BLB', name: 'Bengaluru Blazers',  short: 'BLB', c1: '#b5121b', c2: '#111111' },
  { id: 'HYH', name: 'Hyderabad Hawks',    short: 'HYH', c1: '#f26b1d', c2: '#1b1b1b' },
  { id: 'PJP', name: 'Punjab Panthers',    short: 'PJP', c1: '#d7263d', c2: '#c0c0c0' },
  { id: 'JPJ', name: 'Jaipur Jaguars',     short: 'JPJ', c1: '#e84a8a', c2: '#1a2a6c' },
  { id: 'AMA', name: 'Ahmedabad Arrows',   short: 'AMA', c1: '#13294b', c2: '#7fd1ae' },
];
const teamById = (id) => TEAMS.find(t => t.id === id);

const IND_FIRST = ['Aarav','Vihaan','Kabir','Arjun','Reyansh','Ishaan','Dhruv','Parth','Yash','Rudra','Kunal','Harsh','Nikhil','Rohan','Siddh','Tanay','Varun','Manav','Jay','Om','Dev','Krish','Pranav','Ritvik','Sahil','Aniket','Mihir','Tejas','Neel','Viraj','Hardik','Chirag','Bhavin','Darshan','Jignesh','Keval','Raghav','Shaurya','Ayaan','Lakshya'];
const IND_LAST = ['Jadeja','Patel','Mehta','Desai','Joshi','Rana','Thakur','Chauhan','Solanki','Parmar','Iyer','Nair','Menon','Reddy','Rao','Kulkarni','Pawar','Shinde','Gill','Sandhu','Bhatt','Trivedi','Pandya','Vyas','Dave','Shah','Kohli-Rana','Saxena','Mishra','Dubey','Yadav','Bisht','Negi','Rawat','Sethi','Malhotra','Kapoor','Bhatia','Ghosh','Sen'];
const OS_FIRST = ['Liam','Noah','Jack','Ollie','Mason','Tom','Ryan','Callum','Dewald','Kagiso','Shai','Andre','Kyle','Rashid','Fazal','Kusal','Dasun','Finn','Blake','Marco','Logan','Hamish','Rory','Ethan','Jordan'];
const OS_LAST = ['Archer-Cole','Brennan','Whitfield','Rowe','Ashby','Kearney','Van Wyk','Mokoena','Pillay','Holder-King','Joseph-Lee','Baptiste','Zadran','Nabi-Khan','Perera-Silva','Fernando','McAllister','Doherty','Hartley','Crane','Fleming-Ross','Quinlan','Barlow','Stanton','Nkosi'];
const OS_COUNTRIES = ['AUS','ENG','SA','NZ','WI','AFG','SL'];

function makePlayer(opts = {}) {
  const overseas = opts.overseas ?? U.chance(0.28);
  const role = opts.role || U.pick(['BAT','BAT','BAT','BOWL','BOWL','BOWL','AR','AR','WK']);
  const name = overseas ? `${U.pick(OS_FIRST)} ${U.pick(OS_LAST)}` : `${U.pick(IND_FIRST)} ${U.pick(IND_LAST)}`;
  const tier = opts.tier ?? (Math.random() ** 1.6); // 0..1, skewed low
  const hi = Math.round(58 + tier * 38 + U.rand(-4, 4));
  const lo = Math.round(18 + U.rand(0, 22));
  let bat, bowl;
  if (role === 'BAT' || role === 'WK') { bat = hi; bowl = lo; }
  else if (role === 'BOWL') { bowl = hi; bat = Math.round(lo + U.rand(0, 12)); }
  else { bat = Math.round(hi - U.rand(4, 12)); bowl = Math.round(hi - U.rand(2, 10)); }
  bat = U.clamp(bat, 15, 97); bowl = U.clamp(bowl, 10, 97);
  const bowlType = (role === 'BOWL' || role === 'AR') ? (U.chance(0.55) ? 'pace' : 'spin') : (U.chance(.5) ? 'spin' : 'pace');
  const ovr = Math.round(role === 'BOWL' ? bowl * .8 + bat * .2 : role === 'AR' ? (bat + bowl) / 2 + 4 : bat * .85 + bowl * .15);
  // IPL-style base price slabs (in coins)
  const base = ovr >= 86 ? 200 : ovr >= 80 ? 150 : ovr >= 74 ? 100 : ovr >= 66 ? 50 : 20;
  return {
    id: U.uid(), name, role, bowlType, bat, bowl,
    field: U.randi(55, 95), overseas,
    country: overseas ? U.pick(OS_COUNTRIES) : 'IND',
    ovr, basePrice: base, skin: U.pick(['#8d5a3b','#a86b45','#c48a5c','#6b4329','#e0b08a','#f1c7a1']),
    hair: U.pick(['#1b1410','#2c1d14','#3b2a1a','#111','#5a3a1e','#c9a15a']),
  };
}

function makePlayerPool(n = 150) {
  const pool = [];
  // guarantee marquee players and role balance
  for (let i = 0; i < 12; i++) pool.push(makePlayer({ tier: U.rand(.85, 1), role: U.pick(['BAT','BOWL','AR','WK']) }));
  const roles = ['BAT','BOWL','AR','WK'];
  const quota = { BAT: .32, BOWL: .34, AR: .22, WK: .12 };
  roles.forEach(r => { const c = Math.round((n - 12) * quota[r]); for (let i = 0; i < c; i++) pool.push(makePlayer({ role: r })); });
  return pool;
}

// Pick a balanced XI from a squad: 1 WK, 4-5 batters, 2 AR, 4-5 bowlers, max 4 overseas
function pickBestXI(squad) {
  const s = squad.slice().sort((a, b) => b.ovr - a.ovr);
  const xi = []; let os = 0;
  const take = (pred, n) => { for (const p of s) { if (xi.length >= 11 || n <= 0) break; if (xi.includes(p) || !pred(p)) continue; if (p.overseas && os >= 4) continue; xi.push(p); if (p.overseas) os++; n--; } };
  take(p => p.role === 'WK', 1);
  take(p => p.role === 'BOWL', 4);
  take(p => p.role === 'AR', 2);
  take(p => p.role === 'BAT', 4);
  take(() => true, 11);
  return orderBattingXI(xi);
}

function orderBattingXI(xi) {
  const score = p => p.bat + (p.role === 'BAT' ? 6 : p.role === 'WK' ? 4 : p.role === 'AR' ? 2 : -10);
  return xi.slice().sort((a, b) => score(b) - score(a));
}

// Default squads for quick match (generated deterministically per team on first run & cached)
function defaultSquads() {
  if (Save.data.defaultSquads) return Save.data.defaultSquads;
  const sq = {};
  TEAMS.forEach(t => {
    const players = [];
    players.push(makePlayer({ role: 'WK', tier: U.rand(.3, .8) }));
    for (let i = 0; i < 5; i++) players.push(makePlayer({ role: 'BAT', tier: U.rand(.2, .9) }));
    for (let i = 0; i < 3; i++) players.push(makePlayer({ role: 'AR', tier: U.rand(.2, .9) }));
    for (let i = 0; i < 6; i++) players.push(makePlayer({ role: 'BOWL', tier: U.rand(.2, .9) }));
    let os = 0; players.forEach(p => { if (p.overseas) { if (os >= 5) { p.overseas = false; p.country = 'IND'; } else os++; } });
    sq[t.id] = players;
  });
  Save.data.defaultSquads = sq; Save.save();
  return sq;
}

// Bowlers in an XI ranked by bowling skill
function bowlingOptions(xi) {
  return xi.filter(p => p.role !== 'WK').slice().sort((a, b) => b.bowl - a.bowl).slice(0, 6);
}
