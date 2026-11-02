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

// ---------- subs (from Nov 1 2026) ----------
// When a player listed on a team doesn't play and someone not listed on that team plays instead (a "~" entry in the
// result), the sub's numbers are scored as the missing player's: their stats and per-map kills move to the missing
// player's id, and res.subs = { <missing player id>: <sub's PCMT.gg name> } records it.
// Who was missing: listed players who didn't play this series but did play the team's previous series (so a team's usual
// bench player isn't picked). If that leaves more than one, the sub's role (agent they played most) has to match exactly
// one of them. Anything still unclear is left alone and reported; tools/subs.json settles it by hand:
//   { "<match url or PCMT.gg match id>": { "<sub's PCMT.gg name>": "<missing player id>" } }   (null = nobody gets the points)
const SUBS_FROM = Date.parse('2026-11-01T00:00:00Z');
const AGENT_ROLE = {};
Object.entries({
  duelist: ['Jett', 'Reyna', 'Raze', 'Phoenix', 'Yoru', 'Neon', 'Iso', 'Waylay'],
  initiator: ['Sova', 'Breach', 'Skye', 'KAY/O', 'Fade', 'Gekko', 'Tejo'],
  controller: ['Brimstone', 'Viper', 'Omen', 'Astra', 'Harbor', 'Clove', 'Miks'],
  sentinel: ['Killjoy', 'Cypher', 'Sage', 'Chamber', 'Deadlock', 'Vyse', 'Veto']
}).forEach(([r, list]) => list.forEach(a => { AGENT_ROLE[a.toLowerCase()] = r; }));

// The lineup (PCMT.gg names, lower case) a team played in its last finished match before M, from that event's matches.
function prevLineup(eventMatches, M, team) {
  const t = Date.parse(M.date);
  const before = (eventMatches || []).filter(x => x.completed && x.id !== M.id && Date.parse(x.date) < t && (x.team1 === team || x.team2 === team))
    .sort((x, y) => Date.parse(y.date) - Date.parse(x.date));
  for (const x of before) {
    const side = (x.combinedStats || []).find(s => s.team === team);
    if (side && side.players && side.players.length) return side.players.map(p => String(p.Player).toLowerCase());
  }
  return null;
}

// Moves subs' numbers onto the players they replaced. Returns notes for the sync log. Safe to run again on the same result.
function applySubs(res, M, players, eventMatches, overrides) {
  const notes = [];
  if (!res || !M || Date.parse(res.start) < SUBS_FROM) return notes;
  const over = (overrides && (overrides[res.url] || overrides[M.id])) || {};
  res.subs = res.subs || {};
  (M.combinedStats || []).forEach(side => {
    const team = side.team, listed = players.filter(p => p.team === team);
    const played = new Set(side.players.map(p => String(p.Player).toLowerCase()));
    const isListed = n => listed.some(p => p.name.toLowerCase() === n || p.id === n);
    const subs = side.players.map(p => String(p.Player).toLowerCase()).filter(n => !isListed(n) && res.stats['~' + n]);
    if (!subs.length) return;
    let missing = listed.filter(p => !played.has(p.name.toLowerCase()) && !played.has(p.id) && !res.subs[p.id]);
    const prev = prevLineup(eventMatches, M, team);
    if (prev) { const regulars = missing.filter(p => prev.includes(p.name.toLowerCase()) || prev.includes(p.id)); if (regulars.length) missing = regulars; }
    const roleOf = n => {
      const c = {};
      (M.mapDetails || []).forEach(md => (md.stats || []).forEach(t => t.team === team && t.players.forEach(p => {
        if (String(p.Player).toLowerCase() === n) { const r = AGENT_ROLE[String(p.Agent || '').toLowerCase()]; if (r) c[r] = (c[r] || 0) + 1; }
      })));
      return Object.keys(c).sort((a, b) => c[b] - c[a])[0] || '';
    };
    const pairs = [], left = [];
    subs.forEach(n => {
      const o = Object.keys(over).find(k => k.toLowerCase() === n);
      if (o !== undefined) {
        if (over[o] === null) return;
        const p = listed.find(q => q.id === over[o]);
        if (!p) { notes.push('tools/subs.json: ' + over[o] + ' is not on ' + team); return; }
        pairs.push([n, p]); missing = missing.filter(q => q.id !== p.id); return;
      }
      left.push(n);
    });
    if (left.length === 1 && missing.length === 1) pairs.push([left.pop(), missing.pop()]);
    else left.slice().forEach(n => {
      const same = missing.filter(p => p.role === roleOf(n));
      if (same.length === 1) { pairs.push([n, same[0]]); missing = missing.filter(p => p !== same[0]); left.splice(left.indexOf(n), 1); }
    });
    if (left.length === 1 && missing.length === 1) pairs.push([left.pop(), missing.pop()]);
    pairs.forEach(([n, p]) => {
      const name = side.players.find(q => String(q.Player).toLowerCase() === n).Player;
      res.stats[p.id] = res.stats['~' + n]; delete res.stats['~' + n];
      (res.maps || []).forEach(m => { if (m.k && ('~' + n) in m.k) { m.k[p.id] = m.k['~' + n]; delete m.k['~' + n]; } });
      res.subs[p.id] = name;
      notes.push('Sub: ' + name + ' played for ' + p.name + ' (' + team + '), ' + p.name + ' gets the points');
    });
    left.forEach(n => notes.push('Sub: ' + n + ' played for ' + team + ' but who they replaced isn\'t clear (missing: ' +
      (missing.map(p => p.id).join(', ') || 'nobody') + '); set it in tools/subs.json'));
  });
  if (!Object.keys(res.subs).length) delete res.subs;
  return notes;
}

module.exports = { BASE, getJson, loadPlayers, regionOf, pageUrl, toResult, applySubs, SUBS_FROM };
