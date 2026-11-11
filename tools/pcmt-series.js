// Writes series-stats.js: every finished series of the Pick'ems events (pickems.js), with each team's players and their
// K/D/A and ACS in that series, for the Pick'ems team windows. Read from PCMT.gg's API (/api/matches/<event>.json).
//
//   node tools/pcmt-series.js series-stats.js
//   node tools/pcmt-series.js series-stats.js --from <dir>    (read <dir>/<event>.json instead of PCMT.gg, for tests)
//
// Runs in the hourly PCMT.gg sync. Writes the file only when something changed; exits with an error, leaving it alone,
// if PCMT.gg can't be read.
const fs = require('fs'), path = require('path'), vm = require('vm');
const A = require('./pcmt-api.js');

const args = process.argv.slice(2), outPath = args[0], fromAt = args.indexOf('--from'), from = fromAt > 0 ? args[fromAt + 1] : '';
if (!outPath) { console.error('usage: node tools/pcmt-series.js <series-stats.js> [--from <dir>]'); process.exit(2); }

const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'pickems.js'), 'utf8').replace(/^var (PCMT_\w+)/mg, 'window.$1'), ctx);
const events = [...new Set((ctx.window.PCMT_PICKEMS || []).map(b => b.event).filter(Boolean))].sort();
if (!events.length) { console.error('no Pick\'ems events in pickems.js'); process.exit(1); }

const out = {};
for (const ev of events) {
  let list;
  try { list = from ? JSON.parse(fs.readFileSync(path.join(from, ev + '.json'), 'utf8')) : A.getJson('/api/matches/' + ev + '.json'); }
  catch (e) { console.error(ev + ': ' + e.message); process.exit(1); }
  if (!Array.isArray(list)) { console.error(ev + ': not a list of matches'); process.exit(1); }
  for (const M of list) {
    if (!M.completed || !Array.isArray(M.combinedStats) || M.combinedStats.length < 2) continue;
    const teams = {};
    for (const t of M.combinedStats) {
      if (!t.team || !Array.isArray(t.players) || !t.players.length) continue;
      teams[t.team] = t.players.map(p => ({ name: String(p.Player), k: +p.K || 0, d: +p.D || 0, a: +p.A || 0, acs: Math.round(+p.ACS || 0) }));
    }
    if (Object.keys(teams).length < 2) continue;
    out[A.pageUrl(ev, M.id)] = { a: M.team1, b: M.team2, score: [M.score1, M.score2], teams };
  }
}
const keys = Object.keys(out).sort(), sorted = {};
keys.forEach(k => { sorted[k] = out[k]; });
const txt = '// Finished Pick\'ems series with each team\'s K/D/A and ACS per player, from PCMT.gg (Pick\'ems team windows).\n' +
  '// Written by tools/pcmt-series.js in the hourly PCMT.gg sync. Do not edit by hand.\n' +
  'var PCMT_SERIES_STATS = ' + JSON.stringify(sorted) + ';\n';
let old = '';
try { old = fs.readFileSync(outPath, 'utf8'); } catch (e) {}
if (old === txt) { console.log('no change'); process.exit(0); }
fs.writeFileSync(outPath, txt);
console.log('series stats updated: ' + keys.length + ' series from ' + events.join(', '));
