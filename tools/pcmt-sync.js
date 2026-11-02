// Syncs the site with PCMT.gg's JSON API (see tools/pcmt-api.js). Run from the repo root:
//   node tools/pcmt-sync.js           update data.js and pickems.js, print what changed
//   node tools/pcmt-sync.js --dry     only print what would change
//   node tools/pcmt-sync.js --message msg.txt   also write a short commit message for what changed
// What it does:
//   * PCMT_MATCHES: adds every NA/EMEA match (not showmatches) dated from 14 days ago onward (never before the Oct 19 2026
//     gameweek) that isn't listed yet,
//     and drops entries more than 14 days old (their results stay).
//   * PCMT_RESULTS: adds every finished match from the last 14 days that isn't in yet, with full stats.
//   * Pick'ems (pickems.js): for each playoff match of a bracket's event, finds the series with those two teams and
//     fills in start, url, best-of and, once finished, the score (in the series' own a/b order).
//   * rankings.js: power rankings for each Pick'ems bracket's event (tools/pcmt-power.js) from every finished game of the event, for the Pick'ems page.
// The arrays stay strict JSON (the server reads them). Exit code 0 even when nothing changed.
const fs = require('fs'), path = require('path'), vm = require('vm');
const A = require('./pcmt-api.js');

const ROOT = path.join(__dirname, '..');
const DRY = process.argv.includes('--dry');
const MSG = process.argv.includes('--message') ? process.argv[process.argv.indexOf('--message') + 1] : null;
const WINDOW = 14 * 24 * 3600 * 1000;
const now = Date.now();
const SCORED_FROM = Date.parse('2026-10-19T09:00:00Z');   // first scored gameweek: nothing older is ever added
const since = Math.max(now - WINDOW, SCORED_FROM);

function readArr(text, name) {
  const head = 'var ' + name + ' = ', s = text.indexOf(head) + head.length;
  if (s < head.length) throw new Error(name + ' not found');
  const e = text.indexOf('];', s) + 1;
  return { arr: JSON.parse(text.slice(s, e)), s, e };
}
function writeArr(text, name, arr) {
  const r = readArr(text, name);
  return text.slice(0, r.s) + JSON.stringify(arr, null, 2) + text.slice(r.e);
}
const same = (x, y) => x.start === y.start && ((x.a === y.a && x.b === y.b) || (x.a === y.b && x.b === y.a));

const dataPath = path.join(ROOT, 'data.js'), pkPath = path.join(ROOT, 'pickems.js');
let dataJs = fs.readFileSync(dataPath, 'utf8'), pkJs = fs.readFileSync(pkPath, 'utf8');
const players = A.loadPlayers(fs.readFileSync(path.join(ROOT, 'players.js'), 'utf8'));
const matches = readArr(dataJs, 'PCMT_MATCHES').arr, results = readArr(dataJs, 'PCMT_RESULTS').arr;
const brackets = readArr(pkJs, 'PCMT_PICKEMS').arr;
const log = [];

const events = A.getJson('/api/matches.json').filter(ev => !ev.showmatch && /^(na|emea)$/i.test(ev.region));
const byEvent = {};
events.forEach(ev => { byEvent[ev.id] = A.getJson(ev.url || '/api/matches/' + ev.id + '.json'); });

// ---- schedule and results ----
events.forEach(ev => byEvent[ev.id].forEach(M => {
  const t = Date.parse(M.date); if (isNaN(t) || t < since) return;
  const entry = { region: A.regionOf(ev.id), start: M.date, a: M.team1, b: M.team2, bo: M.bestOf || 3, hours: M.bestOf || 3, url: A.pageUrl(ev.id, M.id) };
  const listed = matches.find(m => m.url === entry.url || same(m, entry));
  if (!listed) { matches.push(entry); log.push('Add match: ' + entry.a + ' vs ' + entry.b + ' (' + entry.start + ')'); }
  else if (listed.start !== entry.start || listed.bo !== entry.bo) {   // PCMT.gg moved the time or changed the best-of
    log.push('Update match: ' + entry.a + ' vs ' + entry.b + ' ' + listed.start + ' -> ' + entry.start);
    listed.start = entry.start; listed.bo = entry.bo; listed.hours = entry.hours; listed.url = entry.url;
  }
  if (!M.completed || results.some(r => r.url === entry.url || same(r, entry))) return;
  let res;
  try { res = A.toResult(M, ev.id, players); } catch (e) { log.push('Skip result ' + entry.a + ' vs ' + entry.b + ': ' + e.message); return; }
  const m = matches.find(x => x.url === entry.url || same(x, entry));   // keep the schedule's a/b order
  if (m && m.a === res.b && m.b === res.a) {
    res.a = m.a; res.b = m.b; res.maps.forEach(mp => { const x = mp.a; mp.a = mp.b; mp.b = x; });
  }
  if (m) res.start = m.start;
  results.push(res);
  const strangers = Object.keys(res.stats).filter(k => k[0] === '~');
  log.push('Add result: ' + res.a + ' vs ' + res.b + ', ' + res.winner + ' won' + (strangers.length ? ' (not in the store: ' + strangers.join(', ') + ')' : ''));
}));
for (let i = matches.length - 1; i >= 0; i--) {
  if (Date.parse(matches[i].start) < now - WINDOW) { log.push('Drop old match: ' + matches[i].a + ' vs ' + matches[i].b); matches.splice(i, 1); }
}
matches.sort((x, y) => Date.parse(x.start) - Date.parse(y.start));

// ---- Pick'ems ----
brackets.forEach(B => {
  const ev = B.event || (B.region === 'NA' ? null : 's2-emea');   // the bracket's event on PCMT.gg
  const list = (byEvent[ev] || []).filter(M => /playoffs/.test(M.id));
  let changed = true;
  while (changed) {
    changed = false;
    const won = {}, lost = {};
    const team = ref => (/^W\d+$/.test(ref) ? won[ref.slice(1)] : /^L\d+$/.test(ref) ? lost[ref.slice(1)] : B.seeds[ref]);
    B.series.slice().sort((x, y) => x.n - y.n).forEach(s => {
      const a = team(s.a), b = team(s.b);
      if (a && b && s.score) { const aw = s.score[0] > s.score[1]; won[s.n] = aw ? a : b; lost[s.n] = aw ? b : a; }
    });
    // Two teams can meet twice (upper final and grand final): a series keeps the game its url already points to,
    // otherwise it takes the earliest game between its two teams that no other series has.
    const claimed = new Set(B.series.map(s => s.url).filter(Boolean));
    const byDate = list.slice().sort((x, y) => Date.parse(x.date) - Date.parse(y.date));
    B.series.slice().sort((x, y) => x.n - y.n).forEach(s => {
      const a = team(s.a), b = team(s.b); if (!a || !b) return;
      const pair = x => (x.team1 === a && x.team2 === b) || (x.team1 === b && x.team2 === a);
      const M = byDate.find(x => pair(x) && A.pageUrl(ev, x.id) === s.url) || byDate.find(x => pair(x) && !claimed.has(A.pageUrl(ev, x.id)));
      if (!M) return;
      claimed.add(A.pageUrl(ev, M.id));
      const url = A.pageUrl(ev, M.id), bo = M.bestOf || s.bo;
      if (s.start !== M.date || s.url !== url || s.bo !== bo) {
        log.push("Pick'ems series " + s.n + ': ' + a + ' vs ' + b + ' at ' + M.date); s.start = M.date; s.url = url; s.bo = bo;
      }
      if (M.completed && !s.score) {
        s.score = M.team1 === a ? [M.score1, M.score2] : [M.score2, M.score1];
        log.push("Pick'ems series " + s.n + ' result: ' + a + ' ' + s.score[0] + '-' + s.score[1] + ' ' + b); changed = true;
      }
    });
  }
});

// ---- power rankings (rankings.js) ----
const rkPath = path.join(ROOT, 'rankings.js');
const power = {};
[...new Set(brackets.map(B => B.event).filter(Boolean))].forEach(ev => { if (byEvent[ev]) power[ev] = require('./pcmt-power.js').powerRankings(ev, byEvent[ev]); });
const rkJs = '// Power rankings for the Pick\'ems page, worked out from PCMT.gg results by tools/pcmt-sync.js. Don\'t edit by hand.\n' +
  'var PCMT_POWER = ' + JSON.stringify(power, null, 2) + ';\n';
const rkOld = fs.existsSync(rkPath) ? fs.readFileSync(rkPath, 'utf8') : '';
if (Object.keys(power).length && rkJs !== rkOld) log.push('Power rankings updated');

// ---- write ----
if (!log.length) { console.log('Nothing new on PCMT.gg.'); process.exit(0); }
log.forEach(l => console.log(l));
if (DRY) { console.log('(dry run: nothing written)'); process.exit(0); }
dataJs = writeArr(writeArr(dataJs, 'PCMT_MATCHES', matches), 'PCMT_RESULTS', results);
pkJs = writeArr(pkJs, 'PCMT_PICKEMS', brackets);
for (const [txt, names] of [[dataJs, ['PCMT_MATCHES', 'PCMT_RESULTS']], [pkJs, ['PCMT_PICKEMS']]]) {
  names.forEach(n => readArr(txt, n));   // strict JSON check
  vm.runInNewContext(txt);
}
fs.writeFileSync(dataPath, dataJs); fs.writeFileSync(pkPath, pkJs);
if (Object.keys(power).length) { vm.runInNewContext(rkJs); fs.writeFileSync(rkPath, rkJs); }
console.log('Wrote data.js, pickems.js and rankings.js.');
if (MSG) {   // e.g. "Add result: T1 vs SPG; Add match: NOOT vs SEAL; Pick'ems: series 8 result"
  const parts = [];
  log.forEach(l => {
    let m;
    if ((m = l.match(/^Add result: (\w+ vs \w+)/))) parts.push('Add result: ' + m[1]);
    else if ((m = l.match(/^Add match: (\w+ vs \w+)/))) parts.push('Add match: ' + m[1]);
    else if ((m = l.match(/^Update match: (\w+ vs \w+)/))) parts.push('Move match: ' + m[1]);
    else if (l === 'Power rankings updated') parts.push('Power rankings');
    else if ((m = l.match(/^Pick'ems series \d+ result: (\S+) \S+ (\S+)$/))) parts.push("Pick'ems: " + m[1] + ' vs ' + m[2] + ' result');
  });
  const uniq = [...new Set(parts)];
  fs.writeFileSync(MSG, (uniq.length ? uniq.slice(0, 4).join('; ') + (uniq.length > 4 ? '; more' : '') : 'Schedule update') + '\n');
}
