// Refreshes trumps/data/pcmt-stats.tsv from a saved copy of https://pcmt.gg/stats.
//
//   curl -sS https://pcmt.gg/stats -o /tmp/stats.html
//   node tools/pcmt-stats.js /tmp/stats.html trumps/data/pcmt-stats.tsv
//
// Only the current seasons (S3 NA, S2 EMEA) are replaced; past-season rows stay as they are.
// Writes the file only when something changed and prints a one-line summary (or "no change").
// Exits with an error, leaving the file alone, if the page looks wrong.
const fs = require('fs');

const CURRENT = ['S3 NA', 'S2 EMEA'];
const NUMS = 22; // toxic .. kmax, as in COLS in trumps/build_cards.py

const [pagePath, tsvPath] = process.argv.slice(2);
if (!pagePath || !tsvPath) {
  console.error('usage: node tools/pcmt-stats.js <stats.html> <pcmt-stats.tsv>');
  process.exit(2);
}

const decode = s => s.replace(/&amp;/g, '&').replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const text = s => decode(s.replace(/<[^>]*>/g, '')).trim();

const html = fs.readFileSync(pagePath, 'utf8');
const fresh = [];
for (const tr of html.match(/<tr class="group[\s\S]*?<\/tr>/g) || []) {
  const tds = tr.match(/<td[\s\S]*?<\/td>/g) || [];
  if (tds.length !== 4 + NUMS) continue;
  const season = text(tds[3]);
  if (!CURRENT.includes(season)) continue;
  const href = (tds[1].match(/href="([^"]+)"/) || [])[1] || '';
  const logo = decode((tds[1].match(/<img src="([^"]+)"/) || [])[1] || '');
  const row = [text(tds[1]), text(tds[2]), season, ...tds.slice(4).map(text), href, logo];
  if (!row[0] || !row[1] || !href) { console.error('row missing name, team or link: ' + row.join(' | ')); process.exit(1); }
  fresh.push(row.join('\t'));
}

const old = fs.readFileSync(tsvPath, 'utf8').split('\n').filter(l => l.trim());
const oldCurrent = old.filter(l => CURRENT.includes(l.split('\t')[2]));
const past = old.filter(l => !CURRENT.includes(l.split('\t')[2]));

// Sanity: the page must still carry roughly the same players, or something is off (layout change, empty page).
for (const s of CURRENT) {
  const before = oldCurrent.filter(l => l.split('\t')[2] === s).length;
  const now = fresh.filter(l => l.split('\t')[2] === s).length;
  if (now < before * 0.9) { console.error(`${s}: only ${now} rows on the page (file has ${before}); not updating`); process.exit(1); }
}

const key = l => { const c = l.split('\t'); return c[2] + ' ' + c[25]; };
const oldMap = new Map(oldCurrent.map(l => [key(l), l]));
const freshKeys = new Set(fresh.map(key));
const added = fresh.filter(l => !oldMap.has(key(l))).map(l => `${l.split('\t')[0]} (${l.split('\t')[2]})`);
const gone = oldCurrent.filter(l => !freshKeys.has(key(l))).map(l => `${l.split('\t')[0]} (${l.split('\t')[2]})`);
const changed = fresh.filter(l => oldMap.has(key(l)) && oldMap.get(key(l)) !== l).length;

if (!added.length && !gone.length && !changed) { console.log('no change'); process.exit(0); }
fs.writeFileSync(tsvPath, [...fresh, ...past].join('\n') + '\n');
console.log(`stats updated: ${changed} players changed` +
  (added.length ? `; new: ${added.join(', ')}` : '') + (gone.length ? `; no longer listed: ${gone.join(', ')}` : ''));
