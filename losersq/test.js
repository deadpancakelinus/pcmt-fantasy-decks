// LosersQ engine checks: node losersq/test.js
// Format (round robin, bracket, placements), same seed = same season, and how the real S3 rosters do over many seasons.
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path'), assert = require('assert');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'trumps-cards.js'), 'utf8') + ';this.CARDS = PCMT_TRUMPS_CARDS;', ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'losersq-roles.js'), 'utf8') + ';this.ROLES = PCMT_LQ_ROLES;', ctx);
const LQ = require('../losersq.js');
const pool = LQ.makePool(ctx.CARDS.na, ctx.ROLES);
const N = +(process.argv[2] || 2000);

// Round robin: 7 weeks, every pair once.
const rr = LQ.roundRobin(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']), seen = {};
assert.strictEqual(rr.length, 7);
rr.forEach(w => { const t = new Set(); w.forEach(([x, y]) => { t.add(x); t.add(y); const k = [x, y].sort().join(); assert(!seen[k], 'pair twice ' + k); seen[k] = 1; }); assert.strictEqual(t.size, 8); });
assert.strictEqual(Object.keys(seen).length, 28);

// Your team = a real roster in its own spot, no coach: the control case.
function real(code) { return { mine: { name: code, players: pool.filter(p => p.team === code).sort((a, b) => b.maps - a.maps).slice(0, 5).map(p => p.id), coach: '' }, replace: code }; }

// Same seed, same season; every team gets one place; 1st..8th hand out once each.
const a = LQ.simSeason(pool, real('DFM'), 12345, true), b = LQ.simSeason(pool, real('DFM'), 12345, true);
assert.deepStrictEqual(JSON.stringify(a.place), JSON.stringify(b.place));
assert.strictEqual(Object.keys(a.place).length, 16);
const counts = {}; Object.values(a.place).forEach(p => counts[p] = (counts[p] || 0) + 1);
assert.strictEqual(counts['1st'], 1); assert.strictEqual(counts['2nd'], 1); assert.strictEqual(counts['3rd'], 1); assert.strictEqual(counts['4th'], 1);
assert.strictEqual(counts['5th-6th'], 2); assert.strictEqual(counts['7th-8th'], 2);
assert.strictEqual(a.weeks.length, 15);
a.weeks.forEach(w => w.series.forEach(s => { const need = Math.ceil(s.bo / 2); assert(Math.max(...s.score) === need); s.maps.forEach(m => { assert(Math.max(m.a, m.b) >= 13 && Math.abs(m.a - m.b) >= 2); }); }));
// Box scores add up: team kills = the other team's deaths.
a.weeks[0].series[0].maps.forEach(m => { const k = m.sa.reduce((s, x) => s + x.k, 0), d = m.sb.reduce((s, x) => s + x.d, 0); assert.strictEqual(k, d); });
// Drafted players leave their real team (stand-ins or subs take their spot).
const draft = { mine: { name: 'x', players: pool.filter(p => p.team === 'SPG').map(p => p.id).slice(0, 3).concat(pool.filter(p => p.team === 'T1').map(p => p.id).slice(0, 2)), coach: 'bestie' }, replace: 'DFM' };
const L = LQ.makeLeague(pool, draft);
assert.strictEqual(L.teams.SPG.players.length, 5); assert.strictEqual(L.teams.SPG.lost, 3);
assert(!L.teams.SPG.players.some(p => draft.mine.players.includes(p.id)));
// Box scores look like Valorant: average kills per map and the best ACS in a believable range.
{ let k = 0, n = 0, best = 0; const s = LQ.simSeason(pool, real('DFM'), 99, true);
  Object.values(s.stats).forEach(x => { k += x.k; n += x.maps; if (x.maps >= 10) best = Math.max(best, x.acsSum / x.rounds); });
  console.log('kills per player-map', (k / n).toFixed(1), 'best ACS', best.toFixed(0));
  assert(k / n > 13 && k / n < 20); assert(best > 250 && best < 360); }
// Roles: every player has their listed role, only roles with S3 maps are allowed, and a role change uses that role's numbers.
pool.forEach(p => { assert(!p.mainRole || LQ.canPlay(p, p.mainRole), p.name + ' listed role'); Object.keys(p.roles).forEach(r => assert(p.roles[r].maps > 0 || r === p.mainRole)); });
const byName = n => pool.find(p => p.name === n);
assert(!LQ.canPlay(byName('avi'), 'controller'), 'avi never played controller');
assert(LQ.onRole(byName('avi'), 'controller').role === 'duelist', 'unplayed role is refused');
const linus = byName('linus'), lc = LQ.onRole(linus, 'controller');
assert.strictEqual(lc.role, 'controller'); assert.strictEqual(lc.roleMaps, ctx.ROLES['na-linus'].controller.maps); assert.strictEqual(lc.acs, ctx.ROLES['na-linus'].controller.acs);
// A team that sets an unplayed role keeps the player's listed role.
const bad = { mine: { name: 'x', players: ['na-avi', 'na-claps', 'na-thighs', 'na-nolan', 'na-dunkn'], roles: { 'na-avi': 'controller', 'na-claps': 'duelist' }, coach: '' }, replace: 'DFM' };
const BL = LQ.makeLeague(pool, bad);
assert.strictEqual(BL.teams.YOU.players[0].role, 'duelist'); assert.strictEqual(BL.teams.YOU.players[1].role, 'duelist');
assert.strictEqual(BL.teams.YOU.str.roles.controller, 1, 'claps moved off controller leaves only dunkn');
// Small samples lean to the overall rating: ethan's 1 map of duelist (1.81) can't put him far above his own level.
const eth = byName('ethan'); assert(eth.roles.duelist.r - eth.all < 0.12, 'one map shouldn\'t make a star');
console.log('roles ok');
console.log('format ok');

// Real rosters over N seasons: title and playoff odds per team.
const title = {}, po = {}, r = LQ.rng(7);
for (let i = 0; i < N; i++) {
  const s = LQ.simSeason(pool, real('DFM'), (r() * 4294967296) >>> 0, false);
  for (const [c, p] of Object.entries(s.place)) { const k = c === 'YOU' ? 'DFM' : c; if (p === '1st') title[k] = (title[k] || 0) + 1; if (!/Group/.test(p)) po[k] = (po[k] || 0) + 1; }
}
const lg = LQ.makeLeague(pool, real('DFM'));
Object.keys(LQ.TEAMS).map(c => [c, lg.teams[c === 'DFM' ? 'YOU' : c].str.total]).sort((x, y) => y[1] - x[1])
  .forEach(([c, t]) => console.log(c.padEnd(5), (t * 100).toFixed(1), 'title', ((title[c] || 0) / N * 100).toFixed(1).padStart(5) + '%', 'playoffs', ((po[c] || 0) / N * 100).toFixed(0).padStart(3) + '%'));
// Sanity: the best roster wins most often, nobody is a lock.
const best = Object.keys(title).sort((x, y) => title[y] - title[x])[0];
assert(title[best] / N < 0.5, 'too predictable');
assert(title[best] / N > 0.12, 'too random');

// Coaches: each should help a mid team a little, none should be a must-pick.
const mid = real('TL'), base = LQ.project(pool, mid, 600, 3);
console.log('TL no coach   playoffs', (base.playoffs / 6).toFixed(0) + '%', 'title', (base.title / 6).toFixed(1) + '%');
LQ.COACHES.forEach(c => { const o = JSON.parse(JSON.stringify(mid)); o.mine.coach = c.id; const p = LQ.project(pool, o, 600, 3); console.log(('TL ' + c.id).padEnd(14), 'playoffs', (p.playoffs / 6).toFixed(0) + '%', 'title', (p.title / 6).toFixed(1) + '%'); });
// A mixed team of five randoms: the Bestie should matter here.
const mixed = { mine: { name: 'mix', players: ['SPG', 'T1', 'C9', 'TL', 'NAVI'].map(c => pool.filter(p => p.team === c).sort((a, b) => b.maps - a.maps)[2].id), coach: '' }, replace: 'DFM' };
const m0 = LQ.project(pool, mixed, 600, 5), mixB = JSON.parse(JSON.stringify(mixed)); mixB.mine.coach = 'bestie';
const m1 = LQ.project(pool, mixB, 600, 5);
console.log('mixed no coach playoffs', (m0.playoffs / 6).toFixed(0) + '%', '| bestie', (m1.playoffs / 6).toFixed(0) + '%');
assert(m1.playoffs > m0.playoffs, 'bestie should help a mixed team');
console.log('ok');
