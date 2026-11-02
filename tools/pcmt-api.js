// Shared helpers for reading PCMT.gg's JSON API (https://pcmt.gg/api/...):
//   /api/matches.json                  every event: { id, name, region: 'na' | 'emea', showmatch, status, url }
//   /api/matches/<event>.json          every match of that event (finished ones include their stats)
//   /api/matches/<event>/<match>.json  one match
// A match: { id, team1, team2, score1, score2, completed, bestOf, date, stage, maps, combinedStats, mapDetails, ... }.
const { execFileSync } = require('child_process');
const vm = require('vm');

const BASE = 'https://pcmt.gg';

// Downloads JSON with curl (it goes through the machine's proxy settings; Node's own fetch doesn't).
function getJson(path) {
  const url = /^https?:/.test(path) ? path : BASE + path;
  const txt = execFileSync('curl', ['-sS', '--fail', '--max-time', '30', url], { encoding: 'utf8', maxBuffer: 1 << 28 });
  return JSON.parse(txt);
}

function loadPlayers(playersJsText) {
  const ctx = { window: {} };
  vm.runInNewContext(playersJsText.replace(/var (PCMT_SITE_\w+)/g, 'window.$1'), ctx);
  return ctx.window.PCMT_SITE_PLAYERS;
}

const regionOf = event => (/-emea$/.test(event) ? 'EMEA' : /-na$/.test(event) ? 'NA' : '');
const pageUrl = (event, id) => BASE + '/events/' + event + '/' + id;

// One finished match -> one PCMT_RESULTS entry (same format the site and the server score).
// stats: { <player id>: [K, D, A, FK, ACS, KAST %, ADR, rating] }, maps: [{ map, a, b, k: { <player id>: kills } }].
// PCMT.gg names map to player ids on the same team (name or id, any case); anyone else is kept as "~" + name.
function toResult(M, event, players) {
  if (!M.completed) throw new Error('Series is not finished yet.');
  if (!M.combinedStats || M.combinedStats.length < 2 || M.combinedStats.some(t => !t.players || t.players.length < 5)) throw new Error('Stats are missing for a team.');
  const key = (name, team) => {
    const n = String(name).toLowerCase();
    const p = players.find(q => q.team === team && (q.name.toLowerCase() === n || q.id === n));
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
  return { region: regionOf(event), start: M.date, a: M.team1, b: M.team2, winner: M.score1 > M.score2 ? M.team1 : M.team2,
           url: pageUrl(event, M.id), stats, maps };
}

module.exports = { BASE, getJson, loadPlayers, regionOf, pageUrl, toResult };
