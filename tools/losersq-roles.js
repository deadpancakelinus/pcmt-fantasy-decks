// LosersQ role stats: every map of NA S3 on PCMT.gg (agent per player per map) -> each player's numbers on each role.
//   node tools/losersq-roles.js            writes losersq-roles.js
//   node tools/losersq-roles.js --dry      prints the table only
// Players are matched to the S3 NA cards in trumps-cards.js by name (PCMT.gg names, any case). A role a player never
// played in S3 isn't in their entry, and LosersQ won't let them be set to it.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const { getJson } = require('./pcmt-api.js');

const EVENT = 's3-na';
const ROLE_OF = {};
const ROLES = {
  duelist: ['Jett', 'Reyna', 'Raze', 'Phoenix', 'Yoru', 'Neon', 'Iso', 'Waylay'],
  initiator: ['Sova', 'Breach', 'Skye', 'KAY/O', 'Fade', 'Gekko', 'Tejo'],
  controller: ['Brimstone', 'Viper', 'Omen', 'Astra', 'Harbor', 'Clove', 'Miks'],
  sentinel: ['Killjoy', 'Cypher', 'Sage', 'Chamber', 'Deadlock', 'Vyse', 'Veto']
};
Object.keys(ROLES).forEach(r => ROLES[r].forEach(a => { ROLE_OF[a.toLowerCase()] = r; }));

const root = path.join(__dirname, '..');
const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'trumps-cards.js'), 'utf8') + ';this.C = PCMT_TRUMPS_CARDS;', ctx);
const cards = ctx.C.na, byName = {};
cards.forEach(c => { [c.name, c.deck, c.id.replace(/^na-/, '')].forEach(n => { if (n) byName[String(n).toLowerCase()] = c.id; }); });

const matches = getJson('/api/matches/' + EVENT + '.json');
const tot = {}, unknownAgents = {}, unmatched = {};
let maps = 0;
matches.forEach(m => (m.mapDetails || []).forEach(md => {
  const rounds = (md.score1 || 0) + (md.score2 || 0);
  if (!rounds || !md.stats) return;
  maps++;
  md.stats.forEach(t => t.players.forEach(p => {
    const id = byName[String(p.Player).toLowerCase()];
    if (!id) { unmatched[p.Player] = 1; return; }
    const role = ROLE_OF[String(p.Agent || '').toLowerCase()];
    if (!role) { unknownAgents[p.Agent] = 1; return; }
    const x = ((tot[id] = tot[id] || {})[role] = tot[id][role] || { maps: 0, rounds: 0, k: 0, d: 0, a: 0, rt: 0, acs: 0, kast: 0, agents: {} });
    x.maps++; x.rounds += rounds; x.k += p.K; x.d += p.D; x.a += p.A;
    x.rt += p['R1.0'] * rounds; x.acs += p.ACS * rounds; x.kast += p.KAST * rounds;
    x.agents[p.Agent] = (x.agents[p.Agent] || 0) + 1;
  }));
}));
if (Object.keys(unknownAgents).length) throw new Error('Agents with no role: ' + Object.keys(unknownAgents).join(', ') + ' (add them to ROLES)');
if (maps < 100) throw new Error('Only ' + maps + ' maps with stats; PCMT.gg looks wrong, not writing.');

// Out: { <card id>: { <role>: { maps, toxic, acs, kast, dpr, agents: [most played first] } } }
const out = {};
Object.keys(tot).sort().forEach(id => {
  out[id] = {};
  Object.keys(tot[id]).sort((a, b) => tot[id][b].maps - tot[id][a].maps).forEach(role => {
    const x = tot[id][role];
    out[id][role] = { maps: x.maps, toxic: +(x.rt / x.rounds).toFixed(3), acs: Math.round(x.acs / x.rounds), kast: Math.round(100 * x.kast / x.rounds),
      dpr: +(x.d / x.rounds).toFixed(2), agents: Object.keys(x.agents).sort((a, b) => x.agents[b] - x.agents[a]) };
  });
});

cards.forEach(c => {
  const r = out[c.id];
  console.log(c.name.padEnd(14), (c.role || '-').padEnd(10), r ? Object.keys(r).map(k => k + ' ' + r[k].maps + ' (' + r[k].toxic.toFixed(2) + ')').join(', ') : 'NO MAPS');
});
if (Object.keys(unmatched).length) console.log('Not on a card:', Object.keys(unmatched).join(', '));
console.log(maps + ' maps, ' + Object.keys(out).length + ' players');

if (process.argv.includes('--dry')) process.exit(0);
const txt = '// LosersQ: each NA S3 player\'s stats on every role they played, from every NA S3 map on PCMT.gg. Built by tools/losersq-roles.js. Do not edit by hand.\n' +
  'var PCMT_LQ_ROLES = ' + JSON.stringify(out) + ';\n';
fs.writeFileSync(path.join(root, 'losersq-roles.js'), txt);
console.log('wrote losersq-roles.js');
