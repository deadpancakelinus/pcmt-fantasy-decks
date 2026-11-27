// MVP VS decks: one deck per PCMT season (NA and EMEA), built from PCMT.gg.
//
//   curl -sS https://pcmt.gg/stats -o /tmp/stats.html
//   node tools/mvp-vs-cards.js /tmp/stats.html            writes trumps-cards.js
//
// Run by the hourly PCMT.gg sync, so a new season gets its own deck on its own and the current seasons' cards follow
// the season as it's played.
//   Seasons:  every season on pcmt.gg/stats (Show Subs on), e.g. "S4 NA" -> deck nas4. The newest NA and EMEA ones are
//             the current decks.
//   Cards:    one per player per season, numbers from pcmt.gg/stats: ACS, KAST, HS%, Deaths (per map, lower wins) and
//             the toxic rating. A player on two teams in a season gets one card (their numbers over both, the team
//             they played most for).
//   Roles:    every role the player played that season, from the agents on every map of the season's matches
//             (pcmt.gg/api/matches/<event>.json), most played first. With no maps to go on: trumps/data/agent-roles.json,
//             then the site's player list.
//   Teams:    name, colour and logo from season-teams.js (seasons from NA S4 on), trumps/data/old-teams.json (S1 NA,
//             S2 NA, S1 EMEA), then players.js teams; else the name PCMT.gg uses and its logo.
//   Trophy:   on the cards of the team that won the season (the last series of a finished event), and, on current-season
//             cards, on past PCMT champions (players.js PCMT_SITE_CHAMPS).
// Writes the file only when something changed. Exits with an error, leaving it alone, if PCMT.gg looks wrong.
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const A = require('./pcmt-api.js');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'trumps-cards.js');
const statsPath = process.argv[2];
if (!statsPath) { console.error('usage: node tools/mvp-vs-cards.js <stats.html>'); process.exit(2); }
function fail(msg) { console.error('mvp-vs-cards: ' + msg + '; not updating'); process.exit(1); }

const AGENTS = {
  duelist: ['Jett', 'Reyna', 'Raze', 'Phoenix', 'Yoru', 'Neon', 'Iso', 'Waylay'],
  initiator: ['Sova', 'Breach', 'Skye', 'KAY/O', 'Fade', 'Gekko', 'Tejo'],
  controller: ['Brimstone', 'Viper', 'Omen', 'Astra', 'Harbor', 'Clove', 'Miks'],
  sentinel: ['Killjoy', 'Cypher', 'Sage', 'Chamber', 'Deadlock', 'Vyse', 'Veto']
};
const ROLE_OF = {};
Object.keys(AGENTS).forEach(r => AGENTS[r].forEach(a => { ROLE_OF[a.toLowerCase()] = r; }));
// Names shown on a card when they should differ from PCMT.gg's (by PCMT.gg player link).
const SHOW_NAMES = { lazy: 'lazynottired', teklo: 'teklologik' };
const REGION_LOGO = { na: 'assets/c265e976f8968e60e4a2bdd32542b499.png', emea: 'assets/3c7e7374dceead68d5c58818d0bcfe8a.png' };

const low = s => String(s || '').trim().toLowerCase();
const norm = s => low(s).replace(/[^a-z0-9]/g, '');
const unhtml = s => String(s).replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const text = s => unhtml(String(s).replace(/<[^>]*>/g, '')).trim();
const r2 = x => Math.round(x * 100) / 100;

function load(file, names) {
  const ctx = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, file), 'utf8').replace(/^var (\w+)/gm, 'window.$1'), ctx);
  return names.map(n => ctx.window[n]);
}
const [SITE_PLAYERS, SITE_TEAMS, SITE_CHAMPS] = load('players.js', ['PCMT_SITE_PLAYERS', 'PCMT_SITE_TEAMS', 'PCMT_SITE_CHAMPS']);
const [SEASON_TEAMS] = load('season-teams.js', ['PCMT_SEASON_TEAMS']);
const OLD_TEAMS = JSON.parse(fs.readFileSync(path.join(ROOT, 'trumps', 'data', 'old-teams.json'), 'utf8')).seasons;
const AGENT_ROLES = JSON.parse(fs.readFileSync(path.join(ROOT, 'trumps', 'data', 'agent-roles.json'), 'utf8'));
const OLD_KEY = { 'S3 NA': 'na', 'S2 EMEA': 'emea', 'S1 NA': 'nas1', 'S2 NA': 'nas2', 'S1 EMEA': 'emeas1' };   // agent-roles.json keys

// ---------- pcmt.gg/stats: one row per player, team and season ----------
// Cells: #, player (link, maybe a logo), team, season (link to the event), then toxic, angus, acs, maps, rounds, k, d,
// a, kd, kda, kpr, dpr, apr, kast, adr, fk, fd, fkpr, fdpr, pm, hs, kmax.
const rows = [];
for (const tr of fs.readFileSync(statsPath, 'utf8').match(/<tr class="group[\s\S]*?<\/tr>/g) || []) {
  const td = tr.match(/<td[\s\S]*?<\/td>/g) || [];
  if (td.length !== 26) continue;
  const n = td.slice(4).map(x => parseFloat(text(x).replace('%', '')));
  const href = (td[1].match(/href="([^"]+)"/) || [])[1] || '';
  const event = ((td[3].match(/href="\/events\/([^"]+)"/) || [])[1] || '');
  const season = text(td[3]), m = /^S(\d+)\s+(NA|EMEA)$/i.exec(season);
  if (!m || !href) continue;
  const logo = unhtml((td[2].match(/<img src="([^"]+)"/) || td[1].match(/<img src="([^"]+)"/) || [])[1] || '');
  rows.push({ name: text(td[1]), slug: norm(href.split('/').pop()), team: text(td[2]), season, n: +m[1], region: m[2].toLowerCase(), event,
    logo: logo ? (/^https?:/.test(logo) ? logo : A.BASE + logo) : '',
    toxic: n[0], acs: n[2], maps: n[3], rounds: n[4], d: n[6], kast: n[13], hs: n[20] });
}
if (rows.length < 100) fail('pcmt.gg/stats has only ' + rows.length + ' player rows');

// ---------- seasons ----------
const seasons = {};
rows.forEach(r => {
  const id = r.region + 's' + r.n;
  const s = seasons[id] = seasons[id] || { id, region: r.region, n: r.n, label: r.region.toUpperCase() + ' S' + r.n, season: r.season, event: r.event || ('s' + r.n + '-' + r.region), rows: [] };
  s.rows.push(r);
});
const ids = Object.keys(seasons);
const current = {};
ids.forEach(id => { const s = seasons[id]; if (!current[s.region] || s.n > seasons[current[s.region]].n) current[s.region] = id; });
if (!current.na) fail('no NA season on pcmt.gg/stats');

let events = [];
try { events = A.getJson('/api/matches.json'); } catch (e) { fail('pcmt.gg/api/matches.json: ' + e.message.split('\n')[0]); }

function teamInfo(s, code, fallbackName, fallbackLogo) {
  const ev = (SEASON_TEAMS.filter(e => e.event === s.event)[0] || { teams: [] }).teams.filter(t => t.label === code)[0];
  if (ev) return { name: ev.name, color: ev.color, logo: ev.logo };
  const old = (OLD_TEAMS[s.season] || {})[code];
  if (old) return { name: old.name, color: old.color, logo: old.logo ? 'assets/' + old.logo : '', champion: old.champion };
  const site = SITE_TEAMS.filter(t => t.code === code && low(t.region) === s.region);
  const pick = site.filter(t => !!t.retired === (s.id !== current[s.region]))[0] || site[0];
  if (pick) return { name: pick.name, color: pick.color, logo: pick.logo || fallbackLogo || '' };
  return { name: fallbackName || code, color: '#93a9aa', logo: fallbackLogo || '' };
}

const out = {}, meta = [];
ids.sort((a, b) => (seasons[a].region === seasons[b].region ? seasons[b].n - seasons[a].n : (seasons[a].region === 'na' ? -1 : 1))).forEach(id => {
  const s = seasons[id], isCurrent = current[s.region] === id;
  const ev = events.filter(e => e.id === s.event)[0];
  let matches = [];
  try { matches = A.getJson((ev && ev.url) || '/api/matches/' + s.event + '.json'); } catch (e) { console.warn('mvp-vs-cards: no matches for ' + s.event + ' (' + e.message.split('\n')[0] + '); roles from the fallbacks'); }
  const teamNames = {};
  matches.forEach(m => { teamNames[m.team1] = m.team1Name; teamNames[m.team2] = m.team2Name; });

  // Champion: the winner of the last series of a finished event.
  let champion = null;
  if (ev && ev.status === 'completed') {
    const last = matches.filter(m => m.completed).sort((a, b) => Date.parse(b.date) - Date.parse(a.date))[0];
    if (last) champion = last.score1 > last.score2 ? last.team1 : last.team2;
  }

  // Roles from every map: maps per role, per player (name and team).
  const played = {};
  matches.forEach(m => (m.mapDetails || []).forEach(md => (md.stats || []).forEach(t => (t.players || []).forEach(p => {
    const role = ROLE_OF[low(p.Agent)];
    if (!role) return;
    [t.team + '|' + norm(p.Player), '*|' + norm(p.Player)].forEach(k => {
      const x = played[k] = played[k] || {};
      x[role] = (x[role] || 0) + 1;
    });
  }))));

  // One card per player: rows merged when a player had two teams in the season.
  const bySlug = {};
  s.rows.forEach(r => { (bySlug[r.slug] = bySlug[r.slug] || []).push(r); });
  const cards = Object.keys(bySlug).map(slug => {
    const list = bySlug[slug].sort((a, b) => b.maps - a.maps), main = list[0];
    const maps = list.reduce((t, r) => t + r.maps, 0) || 0, w = f => maps ? list.reduce((t, r) => t + r[f] * r.maps, 0) / maps : main[f];
    const rounds = list.reduce((t, r) => t + r.rounds, 0), deaths = list.reduce((t, r) => t + r.d, 0);
    const sub = main.team === '(sub)', team = sub ? '' : main.team;
    const info = sub ? null : teamInfo(s, team, teamNames[team], main.logo);
    // Roles: maps on each, most played first.
    let counts = played[team + '|' + slug] || played[team + '|' + norm(main.name)] || played['*|' + norm(main.name)] || played['*|' + slug];
    if (!counts && team) {   // a shortened or longer form of the name on the same team ("Pieta" for pietamoon), if only one fits
      const k = norm(main.name), fits = Object.keys(played).filter(x => x.indexOf(team + '|') === 0 && x.length > team.length + 2 &&
        (x.slice(team.length + 1).indexOf(k) === 0 || k.indexOf(x.slice(team.length + 1)) === 0));
      if (fits.length === 1) counts = played[fits[0]];
    }
    counts = counts || {};
    let roles = Object.keys(counts).sort((a, b) => counts[b] - counts[a]).map(r => ({ role: r, maps: counts[r] }));
    // The site's player (for The Deck id, a listed role and the champion trophy).
    const inSeason = p => (!team || p.team === team) && (s.region === 'na' ? (/-s\d+$/.test(p.id) ? new RegExp('-s' + s.n + '$').test(p.id) : s.n === 3) : true);
    let deck = SITE_PLAYERS.filter(p => (norm(p.name) === norm(main.name) || norm(p.name) === norm(SHOW_NAMES[slug])) && inSeason(p))[0];
    if (!deck && team) {   // same idea for the site's player list
      const k = norm(main.name), fits = SITE_PLAYERS.filter(p => inSeason(p) && (norm(p.name).indexOf(k) === 0 || k.indexOf(norm(p.name)) === 0));
      if (fits.length === 1) deck = fits[0];
    }
    if (!roles.length) {
      const ag = AGENT_ROLES[(OLD_KEY[s.season] || id) + ':' + slug];
      const r = ag ? roleFromAgents(ag) : (deck && deck.role ? low(deck.role).split('/')[0] : '');
      if (r) roles = [{ role: r === 'yoru' ? 'duelist' : r, maps: 0 }];
    }
    const champ = !!(team && (champion ? champion === team : info && info.champion)) || !!(isCurrent && deck && SITE_CHAMPS[deck.id]);
    return {
      id: id + '-' + slug, deck: deck ? deck.id : '', name: SHOW_NAMES[slug] || main.name, team,
      teamName: sub ? 'Sub' : info.name, color: sub ? '#93a9aa' : info.color, logo: sub ? '' : (info.logo || ''),
      role: roles.length ? roles[0].role : '', roles, champ, sub, maps,
      toxic: r2(w('toxic')), acs: Math.round(w('acs')), kast: Math.round(w('kast')), hs: Math.round(w('hs')),
      deaths: maps ? Math.round(deaths / maps * 10) / 10 : 0, dpr: rounds ? r2(deaths / rounds) : 0
    };
  }).filter(c => c.maps > 0).sort((a, b) => b.toxic - a.toxic || a.name.localeCompare(b.name));
  if (cards.length < 10) fail(s.label + ' has only ' + cards.length + ' cards');
  out[id] = cards;
  meta.push({ id, region: s.region, n: s.n, label: s.label, season: s.season, name: (ev && ev.name) || (s.region === 'na' ? 'NA' : 'EMEA') + ' Season ' + s.n,
    event: s.event, current: isCurrent, logo: REGION_LOGO[s.region], champion: champion || '' });
});

function roleFromAgents(maps) {   // role with the most maps; a tie goes to the role of the single most-played agent
  const totals = {};
  Object.keys(maps).forEach(a => { const r = ROLE_OF[low(a)]; if (r) totals[r] = (totals[r] || 0) + maps[a]; });
  const best = Math.max.apply(null, Object.values(totals).concat([0]));
  const tied = Object.keys(totals).filter(r => totals[r] === best);
  if (tied.length <= 1) return tied[0] || '';
  const top = Object.keys(maps).filter(a => tied.indexOf(ROLE_OF[low(a)]) >= 0).sort((a, b) => maps[b] - maps[a])[0];
  return ROLE_OF[low(top)];
}

// Current seasons first (NA, EMEA), then past seasons newest first.
meta.sort((a, b) => (b.current - a.current) || (a.region === b.region ? b.n - a.n : (a.region === 'na' ? -1 : 1)));
const ordered = {};
meta.forEach(m => { ordered[m.id] = out[m.id]; });
const body = '// MVP VS decks, one per PCMT season, built from PCMT.gg by tools/mvp-vs-cards.js in the PCMT.gg sync. Do not edit by hand.\n' +
  'var PCMT_TRUMPS_SEASONS = ' + JSON.stringify(meta) + ';\n' +
  'var PCMT_TRUMPS_CARDS = ' + JSON.stringify(ordered) + ';\n' +
  // Older pages read the NA S3 and EMEA S2 decks as .na and .emea (hidden, so they aren't decks of their own).
  "(function (C) { [['na', 'nas3'], ['emea', 'emeas2']].forEach(function (x) { if (C[x[1]] && !C[x[0]]) Object.defineProperty(C, x[0], { value: C[x[1]], enumerable: false }); }); })(PCMT_TRUMPS_CARDS);\n";
let old = '';
try { old = fs.readFileSync(OUT, 'utf8'); } catch (e) {}
if (old === body) { console.log('no change'); process.exit(0); }
fs.writeFileSync(OUT, body);
console.log('trumps-cards.js: ' + meta.map(m => m.label + (m.current ? ' (current)' : '') + ' ' + ordered[m.id].length +
  ' cards' + (m.champion ? ', champion ' + m.champion : '')).join('; '));
