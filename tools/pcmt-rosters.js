// Writes rosters.js (team rosters with each player's KDA and toxic rating, every season) for the Pick'ems team windows.
//
//   curl -sS https://pcmt.gg/stats -o /tmp/stats.html
//   node tools/pcmt-rosters.js /tmp/stats.html rosters.js
//
// Reads every season on the page (not just the current ones), so a new season and its new teams show up on
// their own once PCMT.gg lists them. A .tsv in the trumps/data/pcmt-stats.tsv format works as input too.
// Writes the file only when something changed. Exits with an error, leaving the file alone, if the page looks wrong.
const fs = require('fs');

const NUMS = 22; // toxic .. kmax, as in tools/pcmt-stats.js
const [inPath, outPath] = process.argv.slice(2);
if (!inPath || !outPath) {
  console.error('usage: node tools/pcmt-rosters.js <stats.html | pcmt-stats.tsv> <rosters.js>');
  process.exit(2);
}

const decode = s => s.replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const text = s => decode(s.replace(/<[^>]*>/g, '')).trim();

// rows: [name, team, season, toxic, maps, kda]
const rows = [];
const src = fs.readFileSync(inPath, 'utf8');
if (/\.tsv$/.test(inPath)) {
  for (const l of src.split('\n')) {
    const c = l.split('\t');
    if (c.length >= 7 && c[1] && !/\(sub\)/i.test(c[1])) rows.push([c[0], c[1], c[2], c[3], c[6], c[12]]);
  }
} else {
  for (const tr of src.match(/<tr class="group[\s\S]*?<\/tr>/g) || []) {
    const tds = tr.match(/<td[\s\S]*?<\/td>/g) || [];
    if (tds.length !== 4 + NUMS) continue;
    const name = text(tds[1]), team = text(tds[2]), season = text(tds[3]);
    if (!name || !team || /\(sub\)/i.test(team) || !/^S\d+ \w+$/.test(season)) continue;   // subs (no team) aren't on a roster
    rows.push([name, team, season, text(tds[4]), text(tds[7]), text(tds[13])]);
  }
}
if (rows.length < 50) { console.error(`only ${rows.length} players found; not updating`); process.exit(1); }

const seasons = {};
for (const [name, team, season, toxic, maps, kda] of rows) {
  const t = ((seasons[season] = seasons[season] || {})[team] = seasons[season][team] || []);
  t.push({ name, kda: Number(kda) || 0, toxic: Number(toxic) || 0, maps: Number(maps) || 0 });
}
const sorted = {};
for (const s of Object.keys(seasons).sort()) {
  sorted[s] = {};
  for (const team of Object.keys(seasons[s]).sort()) {
    sorted[s][team] = seasons[s][team].sort((a, b) => b.kda - a.kda || a.name.localeCompare(b.name));
  }
}

const out = '// Team rosters with KDA and toxic rating from pcmt.gg/stats, every season (Pick\'ems team windows).\n' +
  '// Written by tools/pcmt-rosters.js in the hourly PCMT.gg sync. Do not edit by hand.\n' +
  'var PCMT_ROSTERS = ' + JSON.stringify(sorted) + ';\n';
let old = '';
try { old = fs.readFileSync(outPath, 'utf8'); } catch (e) {}
if (old === out) { console.log('no change'); process.exit(0); }
fs.writeFileSync(outPath, out);
console.log('rosters updated: ' + Object.keys(sorted).map(s => `${s} ${Object.keys(sorted[s]).length} teams`).join(', '));
