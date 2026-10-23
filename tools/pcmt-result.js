// Turns a finished PCMT.gg match page into one PCMT_RESULTS entry for data.js (printed as JSON).
//   curl -sS <match page url> -o page.html
//   node tools/pcmt-result.js page.html players.js [match page url]
// Exits with an error if the series isn't finished or a team has no stats yet.
const fs = require('fs'), vm = require('vm');
const [htmlFile, playersFile, url] = process.argv.slice(2);
if (!htmlFile || !playersFile) { console.error('usage: node tools/pcmt-result.js page.html players.js [url]'); process.exit(2); }

const html = fs.readFileSync(htmlFile, 'utf8');
const ctx = { window: {} };
vm.runInNewContext(fs.readFileSync(playersFile, 'utf8').replace(/var (PCMT_SITE_\w+)/g, 'window.$1'), ctx);
const PLAYERS = ctx.window.PCMT_SITE_PLAYERS;

// The page's data sits in Astro island props: [type, value] pairs (0 = plain, 1 = array).
const unesc = s => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
function dec(v) {
  if (Array.isArray(v) && v.length === 2 && typeof v[0] === 'number') {
    if (v[0] === 0) return v[1] && typeof v[1] === 'object' ? dec(v[1]) : v[1];
    if (v[0] === 1) return v[1].map(dec);
    return v[1];
  }
  if (Array.isArray(v)) return v.map(dec);
  if (v && typeof v === 'object') { const o = {}; for (const k in v) o[k] = dec(v[k]); return o; }
  return v;
}
let data = null;
for (const m of html.matchAll(/props="([^"]*)"/g)) {
  try { const d = dec(JSON.parse(unesc(m[1]))); if (d && d.match && d.match.combinedStats) { data = d; break; } } catch (e) {}
}
if (!data) { console.error('No match data found on this page.'); process.exit(1); }
const M = data.match, region = String((data.event && data.event.region) || '').toUpperCase();
if (!M.completed) { console.error('Series is not finished yet.'); process.exit(1); }
if (!M.combinedStats || M.combinedStats.length < 2 || M.combinedStats.some(t => !t.players || t.players.length < 5)) { console.error('Stats are missing for a team.'); process.exit(1); }

// PCMT.gg name -> player id: same team, name or id, case-insensitive. Anyone else: "~" + name.
const key = (name, team) => {
  const n = String(name).toLowerCase();
  const p = PLAYERS.find(q => q.team === team && (q.name.toLowerCase() === n || q.id === n));
  return p ? p.id : '~' + n;
};
const r1 = x => Math.round(x * 10) / 10;
const stats = {};
M.combinedStats.forEach(t => t.players.forEach(p => {
  stats[key(p.Player, t.team)] = [p.K, p.D, p.A, p.FK, Math.round(p.ACS), Math.round(p.KAST * 100), r1(p.ADR), p['R1.0']];
}));
const maps = (M.mapDetails || []).map(md => {
  const k = {};
  (md.stats || []).forEach(t => (t.players || []).forEach(p => { k[key(p.Player, t.team)] = p.K; }));
  return { map: md.name, a: md.score1, b: md.score2, k };
});
const out = { region, start: M.date, a: M.team1, b: M.team2, winner: M.score1 > M.score2 ? M.team1 : M.team2, url: url || '', stats, maps };
const strangers = Object.keys(stats).filter(k => k[0] === '~');
if (strangers.length) console.error('Not in the store (kept with ~): ' + strangers.join(', '));
console.log(JSON.stringify(out));
