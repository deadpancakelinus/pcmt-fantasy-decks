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
//   * Pick'ems games (a pickems.js bracket with "mode": "games"): every game PCMT.gg schedules for the event is added
//     as its own pick, and gets its score once it's played.
//   * Event labels (Supabase pcmt_event_labels, set on the backend's Schedule tab): an event labelled Groups gets a
//     game-by-game Pick'ems (above); one labelled Playoffs gets a bracket built from its format (pickem-formats.js) and
//     seeds, which the playoff matching below then fills from PCMT.gg. A hand-made bracket (no "format") is left as is.
//   * champions.js: each event's grand final winner for 15 days (or until the region's next event starts), for Home.
//   * rankings.js: power rankings for each Pick'ems bracket's event (tools/pcmt-power.js) from every finished game of the event, for the Pick'ems page.
// The arrays stay strict JSON (the server reads them). Exit code 0 even when nothing changed.
const fs = require('fs'), path = require('path'), vm = require('vm');
const A = require('./pcmt-api.js');

const ROOT = path.join(__dirname, '..');
const DRY = process.argv.includes('--dry');
const MSG = process.argv.includes('--message') ? process.argv[process.argv.indexOf('--message') + 1] : null;
const WINDOW = 14 * 24 * 3600 * 1000;
const now = process.env.PCMT_NOW ? Date.parse(process.env.PCMT_NOW) : Date.now();   // PCMT_NOW: tests only
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
  const listed = matches.find(m => m.url === entry.url || same(m, entry)) ||   // or a game staff added by hand (no url) before PCMT.gg posted it
    matches.find(m => !m.url && ((m.a === entry.a && m.b === entry.b) || (m.a === entry.b && m.b === entry.a)) && Math.abs(Date.parse(m.start) - t) < 3 * 864e5);
  if (!listed) { matches.push(entry); log.push('Add match: ' + entry.a + ' vs ' + entry.b + ' (' + entry.start + ')'); }
  else if (listed.start !== entry.start || listed.bo !== entry.bo || !listed.url) {   // PCMT.gg moved the time or changed the best-of
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

// ---- Supabase tables the backend writes (read with the site's publishable key, like the site does) ----
function sbRead(query) {
  const lg = fs.readFileSync(path.join(ROOT, 'tools', 'league.js'), 'utf8');
  const url = (lg.match(/var SB_URL = '([^']+)'/) || [])[1], key = (lg.match(/var SB_KEY = '([^']+)'/) || [])[1];
  if (!url || !key) throw new Error('no Supabase address in tools/league.js');
  if (process.env.PCMT_SB_FAKE) return JSON.parse(fs.readFileSync(process.env.PCMT_SB_FAKE, 'utf8'))[query.split('?')[0]] || [];   // tests
  const { execFileSync } = require('child_process');
  return JSON.parse(execFileSync('curl', ['-sS', '--fail', '--max-time', '30', '-H', 'apikey: ' + key, '-H', 'Authorization: Bearer ' + key,
    url + '/rest/v1/' + query], { encoding: 'utf8' }));
}

// ---- Event labels: Groups or Playoffs (backend, Schedule tab → PCMT.gg events) ----
let labels = [];
try { labels = sbRead('pcmt_event_labels?select=event,name,region,season,label,format,seeds,bracket&order=event'); }
catch (e) { console.warn('Event labels skipped: ' + String(e.message || e).split('\n')[0]); labels = []; }   // not a change, so not in the log
if (!Array.isArray(labels)) labels = [];
const labelOf = ev => labels.find(l => l.event === ev) || null;
(function applyLabels() {
  const FORMATS = require('../pickem-formats.js');
  labels.forEach(l => {
    if (!l.label || !/^[a-z0-9-]{2,40}$/.test(l.bracket || '')) return;
    const region = l.region === 'EMEA' ? 'EMEA' : 'NA';
    let B = brackets.find(x => x.id === l.bracket);
    if (l.label === 'groups') {
      if (B && B.mode !== 'games') { console.warn("Pick'ems " + l.bracket + ': is a bracket, not game-by-game (label skipped)'); return; }
      if (!B) {
        B = { id: l.bracket, name: l.name || l.event, region, mode: 'games', event: l.event, season: +l.season || null, seeds: {}, teams: {}, series: [] };
        brackets.push(B); log.push("Pick'ems event: " + l.bracket + ' (groups, game by game)');
      }
      return;
    }
    // playoffs
    if (B && B.mode === 'games') { console.warn("Pick'ems " + l.bracket + ': is game-by-game, not a bracket (label skipped)'); return; }
    if (B && !B.format) return;   // a hand-made bracket (EMEA S2): left as it is
    const f = FORMATS[l.format], seeds = l.seeds || {};
    if (!f || !f.series) { console.warn("Pick'ems " + l.bracket + ': unknown format ' + l.format); return; }
    const want = {};
    for (let i = 1; i <= f.teams; i++) want['S' + i] = seeds['S' + i];
    if (Object.values(want).some(v => !v)) { if (!B) console.warn("Pick'ems " + l.bracket + ': waiting for every seed'); return; }
    if (B && B.format === l.format && JSON.stringify(B.seeds) === JSON.stringify(want)) return;
    const built = FORMATS.build(l.format, want, B);
    if (!B) {
      B = { id: l.bracket, name: (l.name || l.event) + ' Playoffs', region, event: l.event, season: +l.season || null, format: l.format, seeds: built.seeds, series: built.series };
      brackets.push(B); log.push("Pick'ems event: " + l.bracket + ' (playoffs, ' + f.short + ')');
    } else {
      Object.assign(B, { format: l.format, seeds: built.seeds, series: built.series });
      log.push("Pick'ems " + l.bracket + ': bracket rebuilt (' + f.short + ', new seeds)');
    }
  });
})();

// ---- Pick'ems: game-by-game (mode "games", NA Season 4 on) ----
// Every game PCMT.gg schedules for the event becomes a Pick'ems game: n stays the same for good (picks point at it),
// a/b are team codes (seeds maps each code to itself), round is PCMT.gg's stage. A game PCMT.gg moves keeps its n
// (matched by url, else by the same two teams); a game it drops before it's played is taken out.
brackets.filter(B => B.mode === 'games').forEach(B => {
  const evId = byEvent[B.event] ? B.event
    : (events.find(e => String(e.region).toLowerCase() === String(B.region).toLowerCase() && +e.season === +B.season) || {}).id;
  if (!evId) return;   // not on PCMT.gg yet
  if (B.event !== evId) { log.push("Pick'ems " + B.id + ': event ' + evId); B.event = evId; }
  const list = byEvent[evId].filter(M => M.team1 && M.team2 && M.date).sort((x, y) => Date.parse(x.date) - Date.parse(y.date) || String(x.id).localeCompare(String(y.id)));
  B.seeds = B.seeds || {}; B.teams = B.teams || {};
  const claimed = new Set(), keep = new Set();
  const pair = (s, M) => (s.a === M.team1 && s.b === M.team2) || (s.a === M.team2 && s.b === M.team1);
  // Once staff label the event Playoffs, its game-by-game Pick'ems only keeps the games it already has up to date.
  const frozen = (labelOf(evId) || {}).label === 'playoffs';
  list.forEach(M => {
    const url = A.pageUrl(evId, M.id);
    let s = B.series.find(x => x.url === url) ||
      B.series.find(x => !claimed.has(x.n) && !x.score && pair(x, M) && !list.some(o => A.pageUrl(evId, o.id) === x.url));
    [[M.team1, M.team1Name], [M.team2, M.team2Name]].forEach(([c, nm]) => {
      if (B.seeds[c] !== c) B.seeds[c] = c;
      if (nm && B.teams[c] !== nm) B.teams[c] = nm;
    });
    if (!s && frozen) return;
    if (!s) {
      s = { n: B.series.reduce((m, x) => Math.max(m, x.n), 0) + 1, round: M.stage || 'Game', a: M.team1, b: M.team2,
            bo: M.bestOf || 3, start: M.date, score: null, url };
      B.series.push(s);
      log.push("Pick'ems game: " + s.a + ' vs ' + s.b + ' (' + s.start + ')');
    } else if (s.start !== M.date || s.url !== url || s.bo !== (M.bestOf || s.bo) || s.round !== (M.stage || s.round)) {
      log.push("Pick'ems game " + s.n + ': ' + s.a + ' vs ' + s.b + ' at ' + M.date);
      s.start = M.date; s.url = url; s.bo = M.bestOf || s.bo; s.round = M.stage || s.round;
    }
    claimed.add(s.n); keep.add(s.n);
    if (M.completed && !s.score && M.score1 !== M.score2) {
      s.score = M.team1 === s.a ? [M.score1, M.score2] : [M.score2, M.score1];
      log.push("Pick'ems game " + s.n + ' result: ' + s.a + ' ' + s.score[0] + '-' + s.score[1] + ' ' + s.b);
    }
  });
  for (let i = B.series.length - 1; i >= 0; i--) {
    const s = B.series[i];
    if (!frozen && !keep.has(s.n) && !s.score && s.url) {   // games staff added by hand (no url yet) stay until PCMT.gg lists them
    log.push("Pick'ems game " + s.n + ' dropped: ' + s.a + ' vs ' + s.b); B.series.splice(i, 1); }
  }
  B.series.sort((x, y) => x.n - y.n);
});

// ---- Games added on the backend's Schedule tab (Supabase schedule_games) ----
// Each one is written into the schedule (and, with pickem on, the region's game-by-game Pick'ems) as a hand-added game
// marked extra: <id>, until PCMT.gg posts it and takes it over above. Edits move it while it has no PCMT.gg link and no
// result; removing it drops it unless it already has a result. Needs nothing on the machine: the table reads with the
// site's publishable key.
(function backendGames() {
  let rows;
  try { rows = sbRead('schedule_games?select=id,region,start,a,b,bo,round,pickem,removed&order=id'); } catch (e) { log.push('Backend games skipped: ' + String(e.message || e).split('\n')[0]); return; }
  if (!Array.isArray(rows)) return;
  const iso = t => new Date(t).toISOString().replace('.000', '');
  const near = (x, g) => ((x.a === g.a && x.b === g.b) || (x.a === g.b && x.b === g.a)) && Math.abs(Date.parse(x.start) - Date.parse(g.start)) < 3 * 864e5;
  rows.forEach(g => {
    const start = iso(Date.parse(g.start));
    // schedule
    const at = matches.findIndex(m => m.extra === g.id);
    const played = results.some(r => near(r, g));
    if (g.removed) {
      if (at >= 0 && !matches[at].url && !played) { log.push('Backend game removed: ' + g.a + ' vs ' + g.b); matches.splice(at, 1); }
    } else if (at >= 0) {
      const m = matches[at];
      if (!m.url && !played && (m.start !== start || m.a !== g.a || m.b !== g.b || m.bo !== g.bo || m.region !== g.region)) {
        log.push('Backend game moved: ' + g.a + ' vs ' + g.b + ' ' + start); Object.assign(m, { region: g.region, start, a: g.a, b: g.b, bo: g.bo });
      }
    } else if (!matches.some(m => near(m, g)) && !played && Date.parse(start) >= since) {
      matches.push({ region: g.region, start, a: g.a, b: g.b, bo: g.bo, hours: g.bo === 5 ? 4 : 3, extra: g.id });
      log.push('Backend game: ' + g.a + ' vs ' + g.b + ' (' + start + ')');
    }
    // Pick'ems: the region's newest game-by-game event
    const B = brackets.filter(x => x.mode === 'games' && String(x.region).toUpperCase() === g.region).sort((x, y) => (+y.season || 0) - (+x.season || 0))[0];
    if (!B) return;
    const si = B.series.findIndex(x => x.extra === g.id), s = B.series[si];
    if (g.removed || !g.pickem) {
      if (s && !s.url && !s.score) { log.push("Pick'ems backend game removed: " + s.a + ' vs ' + s.b); B.series.splice(si, 1); }
    } else if (s) {
      if (!s.url && !s.score && (s.start !== start || s.a !== g.a || s.b !== g.b || s.bo !== g.bo || s.round !== (g.round || s.round))) {
        Object.assign(s, { start, a: g.a, b: g.b, bo: g.bo, round: g.round || s.round }); log.push("Pick'ems backend game moved: " + g.a + ' vs ' + g.b);
      }
    } else if (!B.series.some(x => near(x, g))) {
      B.seeds = B.seeds || {}; B.teams = B.teams || {};
      [g.a, g.b].forEach(c => { B.seeds[c] = c; if (!B.teams[c]) B.teams[c] = c; });
      B.series.push({ n: B.series.reduce((m, x) => Math.max(m, x.n), 0) + 1, round: g.round || 'Game', a: g.a, b: g.b, bo: g.bo, start, score: null, extra: g.id });
      log.push("Pick'ems backend game: " + g.a + ' vs ' + g.b);
    }
    B.series.sort((x, y) => x.n - y.n);
  });
  matches.sort((x, y) => Date.parse(x.start) - Date.parse(y.start));
})();

// ---- Pick'ems: playoff brackets ----
brackets.filter(B => B.mode !== 'games').forEach(B => {
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

// ---- champions (champions.js): the grand final winner of each event, shown on Home ----
// The grand final is the last series of the event's Pick'ems bracket once it has a score, or, once PCMT.gg marks the
// event completed, its last playoff game. It stays on Home for 15 days, or until the region's next event starts.
const chPath = path.join(ROOT, 'champions.js'), CH_DAYS = 15 * 864e5;
const champions = [];
events.forEach(ev => {
  const list = byEvent[ev.id] || [];
  const po = list.filter(M => /playoffs/i.test(String(M.id)) || /playoff|final/i.test(String(M.stage || '')));
  let gf = null;
  const B = brackets.find(b => b.event === ev.id && b.mode !== 'games');
  if (B && B.series.length) {
    const last = B.series.reduce((m, x) => (!m || x.n > m.n ? x : m), null);
    if (last.score && last.url) gf = po.find(M => A.pageUrl(ev.id, M.id) === last.url) || null;
  }
  if (!gf && String(ev.status).toLowerCase() === 'completed')
    gf = po.filter(M => M.completed).sort((x, y) => Date.parse(y.date) - Date.parse(x.date))[0] || null;
  if (!gf || !gf.completed || gf.score1 === gf.score2) return;
  const at = Date.parse(gf.date);
  if (isNaN(at) || now >= at + CH_DAYS) return;
  const region = A.regionOf(ev.id);
  const next = events.filter(o => o.id !== ev.id && A.regionOf(o.id) === region)
    .map(o => Math.min.apply(null, (byEvent[o.id] || []).map(M => Date.parse(M.date)).filter(t => !isNaN(t))))
    .filter(t => isFinite(t) && t > at).sort((x, y) => x - y)[0];
  const until = Math.min(at + CH_DAYS, next || Infinity);
  if (now >= until) return;
  const w1 = gf.score1 > gf.score2, team = w1 ? gf.team1 : gf.team2;
  const side = (gf.combinedStats || []).find(t => t.team === team);
  champions.push({
    event: ev.id, region, season: +ev.season || null, title: ev.name || ev.id, team, teamName: (w1 ? gf.team1Name : gf.team2Name) || team,
    at: gf.date, until: new Date(until).toISOString().replace('.000', ''), url: A.pageUrl(ev.id, gf.id),
    maps: (gf.maps || []).map(m => ({ map: m.name, w: w1 ? m.score1 : m.score2, l: w1 ? m.score2 : m.score1 })),
    stats: (side ? side.players : []).map(p => ({ player: p.Player, kda: p.K + '/' + p.D + '/' + p.A, acs: String(Math.round(+p.ACS || 0)), rating: (+p['R1.0'] || 0).toFixed(2) }))
      .sort((x, y) => +y.rating - +x.rating)
  });
});
champions.sort((x, y) => Date.parse(y.at) - Date.parse(x.at));
const chJs = '// Champions on Home: each event\'s grand final winner, worked out from PCMT.gg by tools/pcmt-sync.js. Don\'t edit by hand.\n' +
  'var PCMT_CHAMPIONS = ' + JSON.stringify(champions, null, 2) + ';\n';
const chOld = fs.existsSync(chPath) ? fs.readFileSync(chPath, 'utf8') : '';
if (chJs !== chOld) log.push(champions.length ? 'Champions: ' + champions.map(c => c.teamName + ' (' + c.title + ')').join(', ') : 'Champions: none on Home');

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
if (chJs !== chOld) { vm.runInNewContext(chJs); fs.writeFileSync(chPath, chJs); }
console.log('Wrote data.js, pickems.js, rankings.js and champions.js.');
if (MSG) {   // e.g. "Add result: T1 vs SPG; Add match: NOOT vs SEAL; Pick'ems: series 8 result"
  const parts = [];
  log.forEach(l => {
    let m;
    if ((m = l.match(/^Add result: (\w+ vs \w+)/))) parts.push('Add result: ' + m[1]);
    else if ((m = l.match(/^Add match: (\w+ vs \w+)/))) parts.push('Add match: ' + m[1]);
    else if ((m = l.match(/^Update match: (\w+ vs \w+)/))) parts.push('Move match: ' + m[1]);
    else if (l === 'Power rankings updated') parts.push('Power rankings');
    else if (/^Champions: /.test(l)) parts.push(l);
    else if ((m = l.match(/^Pick'ems (?:series|game) \d+ result: (\S+) \S+ (\S+)$/))) parts.push("Pick'ems: " + m[1] + ' vs ' + m[2] + ' result');
    else if ((m = l.match(/^Pick'ems game: (\S+ vs \S+)/))) parts.push("Pick'ems: add " + m[1]);
    else if ((m = l.match(/^Pick'ems event: (\S+)/))) parts.push("Pick'ems: " + m[1]);
    else if ((m = l.match(/^Pick'ems (\S+): bracket rebuilt/))) parts.push("Pick'ems: " + m[1] + ' bracket');
  });
  const uniq = [...new Set(parts)];
  fs.writeFileSync(MSG, (uniq.length ? uniq.slice(0, 4).join('; ') + (uniq.length > 4 ? '; more' : '') : 'Schedule update') + '\n');
}
