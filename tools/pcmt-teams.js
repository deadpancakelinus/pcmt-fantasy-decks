// Team card backs for every new PCMT season, straight from PCMT.gg (run by the PCMT.gg sync).
//
//   node tools/pcmt-teams.js            (writes season-teams.js and assets/teams/<event>/<team>.<ext>)
//
// For every event on PCMT.gg's /api/matches.json from NA Season 4 and EMEA Season 3 on (earlier seasons have
// hand-made decks), it reads the event page's team links, then each team page (its name, code and logo), downloads the
// logo into assets/teams/ and picks the team's colour from it (tools/logo-color.py; needs Pillow). The Customization and
// Main boards turn each team into a card back: code S<season>-<team> for NA (like S4-FNC), S<season>E-<team> for EMEA.
// A new season or a new team shows up on its own once PCMT.gg lists it. Logos are downloaded again only when PCMT.gg's
// logo path changes. A colour, once picked, stays (COLORS below, or edit season-teams.js's entry and it's kept).
// Writes season-teams.js only when something changed; on a bad read it keeps what was there for that event.
// PCMT_BASE and PCMT_TEAMS_ROOT (environment) point it at another server and folder, for tools/teams-test.js.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { execFileSync } = require('child_process');
const crypto = require('crypto');

const BASE = process.env.PCMT_BASE || 'https://pcmt.gg';
const ROOT = process.env.PCMT_TEAMS_ROOT || path.join(__dirname, '..');
const OUT = path.join(ROOT, 'season-teams.js');
const DIR = 'assets/teams';
const AUTO_FROM = { na: 4, emea: 3 };   // first season of each region made here
// Colours chosen by hand (they win over the one picked from the logo). NA Season 4: the colours its decks had before.
const COLORS = {
  'S4-FNC': '#fd5800', 'S4-WBG': '#e01b1b', 'S4-GENG': '#c9a43a', 'S4-LOUD': '#2fe02f', 'S4-EDM': '#ff6eb4', 'S4-CR': '#8f0000',
  'S4-EDG': '#e8e8e8', 'S4-DEI': '#8a9c3a', 'S4-PRX': '#f39ab8', 'S4-NBR': '#f51e0f', 'S4-DRX': '#4a5cff', 'S4-SRG': '#ffd966',
  'S4-BLG': '#33cff3', 'S4-TANK': '#45dfe8', 'S4-XLG': '#006394', 'S4-NRG': '#f63d0a'
};

const curl = args => execFileSync('curl', ['-sS', '--fail', '--max-time', '30', '--retry', '4', '--retry-delay', '5', '--retry-all-errors'].concat(args),
  { encoding: 'utf8', maxBuffer: 1 << 28 });
const url = p => BASE + encodeURI(p).replace(/#/g, '%23');
const getText = p => curl([url(p)]);
const unhtml = s => String(s).replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

// Astro island props: { key: [0, value] }, arrays as [1, [...]].
function astro(v) {
  if (Array.isArray(v) && v.length === 2 && typeof v[0] === 'number') {
    if (v[0] === 1) return (v[1] || []).map(astro);
    if (v[0] === 0 && v[1] && typeof v[1] === 'object' && !Array.isArray(v[1])) {
      const o = {}; for (const k of Object.keys(v[1])) o[k] = astro(v[1][k]); return o;
    }
    return v[1];
  }
  return v;
}
function islandProps(html, comp) {
  const m = html.match(new RegExp('component-url="/_astro/' + comp + '[^"]*"[^>]*props="([^"]*)"'));
  if (!m) return null;
  const raw = JSON.parse(unhtml(m[1])), o = {};
  for (const k of Object.keys(raw)) o[k] = astro(raw[k]);
  return o;
}

function loadOld() {
  try {
    const ctx = { window: {} };
    vm.runInNewContext(fs.readFileSync(OUT, 'utf8').replace(/var PCMT_SEASON_TEAMS/, 'window.PCMT_SEASON_TEAMS'), ctx);
    return ctx.window.PCMT_SEASON_TEAMS || [];
  } catch (e) { return []; }
}

function pickColor(file) {
  try { return execFileSync('python3', ['-I', path.join(__dirname, 'logo-color.py'), file], { encoding: 'utf8' }).trim(); }
  catch (e) { console.warn('  no colour from ' + file + ' (' + String(e.message).split('\n')[0] + ')'); return null; }
}
const isImage = b => b.length > 64 && (b.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ||
  (b[0] === 0xff && b[1] === 0xd8) || b.slice(0, 4).toString() === 'RIFF' || b.slice(0, 6).toString() === 'GIF89a' || /^\s*<(\?xml|svg)/.test(b.slice(0, 200).toString()));

function readEvent(ev, oldEv) {
  const region = ev.region === 'emea' ? 'EMEA' : 'NA';
  const html = getText('/events/' + ev.id);
  const slugs = [], seen = {}, re = new RegExp('href="/events/' + ev.id.replace(/[-]/g, '\\-') + '/teams/([^"/?#]+)"', 'g');
  let m;
  while ((m = re.exec(html))) { const s = unhtml(m[1]); if (!seen[s]) { seen[s] = true; slugs.push(s); } }
  if (!slugs.length) { console.log(ev.id + ': no teams listed yet'); return oldEv || null; }
  const oldBy = {}; ((oldEv && oldEv.teams) || []).forEach(t => { oldBy[t.code] = t; });
  const teams = [];
  for (const slug of slugs) {
    let t;
    try { t = (islandProps(getText('/events/' + ev.id + '/teams/' + slug), 'TeamPage') || {}).team || {}; }
    catch (e) { console.warn('  ' + slug + ': ' + String(e.message).split('\n')[0]); continue; }
    const abbr = String(t.abbr || '').replace(/\s+/g, '');
    if (!abbr || !t.name) { console.warn('  ' + slug + ': no team code or name on its page'); continue; }
    const code = 'S' + ev.season + (region === 'EMEA' ? 'E' : '') + '-' + abbr, old = oldBy[code];
    let logo = '', src = t.logo || '';
    if (src) {
      const ext = (/\.(png|jpe?g|webp|gif|svg)$/i.exec(src) || [, 'png'])[1].toLowerCase();
      // the logo path's fingerprint is in the file name, so a new logo never shows a cached old one
      const rel = DIR + '/' + ev.id + '/' + abbr.toLowerCase().replace(/[^a-z0-9_-]/g, '_') + '-' + crypto.createHash('sha1').update(src).digest('hex').slice(0, 8) + '.' + ext;
      const file = path.join(ROOT, rel);
      if (old && old.src === src && old.logo === rel && fs.existsSync(file)) logo = rel;
      else {
        try {
          const tmp = file + '.part';
          fs.mkdirSync(path.dirname(file), { recursive: true });
          curl(['-o', tmp, url(src)]);
          if (!isImage(fs.readFileSync(tmp))) throw new Error('not an image');
          fs.renameSync(tmp, file); logo = rel;
          if (old && old.logo && old.logo !== rel) try { fs.unlinkSync(path.join(ROOT, old.logo)); } catch (e) {}   // the replaced logo
          console.log('  ' + code + ': logo ' + rel);
        } catch (e) {
          console.warn('  ' + code + ': logo download failed (' + String(e.message).split('\n')[0] + ')');
          try { fs.unlinkSync(file + '.part'); } catch (e2) {}
          if (old && old.logo && fs.existsSync(path.join(ROOT, old.logo))) { logo = old.logo; src = old.src; }
        }
      }
    }
    const color = COLORS[code] || (old && old.color && old.src === src && old.color) || (logo && !/\.svg$/.test(logo) && pickColor(path.join(ROOT, logo))) || (old && old.color) || '#a5dcdd';
    teams.push({ code, label: abbr, name: String(t.name), color, logo, src });
  }
  if (teams.length < Math.ceil(slugs.length / 2)) { console.warn(ev.id + ': only ' + teams.length + ' of ' + slugs.length + ' teams read; keeping the old list'); return oldEv || null; }
  teams.sort((a, b) => a.code.localeCompare(b.code, 'en', { sensitivity: 'base', numeric: true }));
  console.log(ev.id + ': ' + teams.length + ' teams');
  return { event: ev.id, region, season: ev.season, title: (region === 'EMEA' ? 'EMEA' : 'NA') + ' Season ' + ev.season, teams };
}

const events = JSON.parse(getText('/api/matches.json'))
  .filter(e => !e.showmatch && AUTO_FROM[e.region] != null && +e.season >= AUTO_FROM[e.region])
  .sort((a, b) => (b.season - a.season) || String(a.region).localeCompare(String(b.region)));
const old = loadOld(), oldBy = {};
old.forEach(s => { oldBy[s.event] = s; });
const seasons = [];
let failed = 0;
for (const ev of events) {
  try { const s = readEvent(ev, oldBy[ev.id]); if (s) seasons.push(s); }
  catch (e) { failed++; console.warn(ev.id + ': ' + String(e.message).split('\n')[0]); if (oldBy[ev.id]) seasons.push(oldBy[ev.id]); }
}
old.forEach(s => { if (!seasons.some(x => x.event === s.event)) seasons.push(s); });   // an event PCMT.gg stopped listing keeps its decks

const out = '// Team card backs for each PCMT season from NA S4 and EMEA S3 on, read from PCMT.gg by tools/pcmt-teams.js in the\n' +
  '// PCMT.gg sync (logos in assets/teams/). Do not edit by hand, except a team\'s colour (it is kept).\n' +
  'var PCMT_SEASON_TEAMS = ' + JSON.stringify(seasons, null, 1).replace(/\n\s*/g, ' ').replace(/\{ "event"/g, '\n{ "event"').replace(/\{ "code"/g, '\n  { "code"') + ';\n';
let before = '';
try { before = fs.readFileSync(OUT, 'utf8'); } catch (e) {}
if (before !== out) { fs.writeFileSync(OUT, out); console.log('season-teams.js updated'); } else console.log('season-teams.js: no change');
if (failed && !seasons.length) process.exit(1);
