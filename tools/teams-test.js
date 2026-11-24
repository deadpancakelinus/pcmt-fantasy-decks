// Checks tools/pcmt-teams.js against a pretend PCMT.gg (pages shaped like the real ones, Nov 22 2026).
//
//   node tools/teams-test.js
//
// Needs python3 with Pillow (for the test logos and the colour picker) and curl.
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFileSync, spawn } = require('child_process');

let bad = 0;
const check = (ok, what) => { console.log((ok ? 'ok   ' : 'FAIL ') + what); if (!ok) bad++; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pcmt-teams-'));
const site = path.join(tmp, 'site'), root = path.join(tmp, 'repo');
fs.mkdirSync(site); fs.mkdirSync(root);

// Teams as on PCMT.gg: [name, code, slug, logo colour]
const S4 = [['Bartho Lomew Gaming', 'BLG', 'bartho-lomew-gaming', [51, 207, 243]], ['Doofenshmirtz Evil Inc.', 'DEI', 'doofenshmirtz-evil-inc.', [138, 156, 58]],
  ['Freaks Need Caesparz', 'FNC', 'freaks-need-caesparz', [253, 88, 0]], ['TANKERS', 'TANK', 'tankers', [255, 153, 0]]];
const S3E = [['Stay Seally', 'SEAL', 'stay-seally', [20, 60, 200]], ['Name in Progress', 'NIP', 'name-in-progress', [194, 71, 143]]];
const esc = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const enc = v => Array.isArray(v) ? [1, v.map(enc)] : v && typeof v === 'object' ? [0, Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc(x)]))] : [0, v];
function teamPage(ev, region, season, t, folder) {
  const props = { event: enc({ id: ev, season, region }), team: enc({ name: t[0], abbr: t[1], logo: '/icons/' + folder + '/' + t[0] + '.png', players: ['a', 'b'] }) };
  return '<html><astro-island component-url="/_astro/TeamPage.X1.js" component-export="default" props="' + esc(JSON.stringify(props)) + '" ssr></astro-island></html>';
}
function writeEvent(ev, region, season, teams, folder) {
  fs.mkdirSync(path.join(site, 'events', ev, 'teams'), { recursive: true });
  fs.writeFileSync(path.join(site, 'events', ev, 'index.html'), teams.map(t => '<a href="/events/' + ev + '/teams/' + t[2] + '" class="x">' + esc(t[0]) + '</a>').join('\n'));
  fs.mkdirSync(path.join(site, 'icons', folder), { recursive: true });
  for (const t of teams) {
    fs.writeFileSync(path.join(site, 'events', ev, 'teams', t[2]), teamPage(ev, region, season, t, folder));
    // a logo: a coloured disc on a transparent background with a black outline
    execFileSync('python3', ['-I', '-c', `from PIL import Image, ImageDraw
im = Image.new('RGBA', (200, 200), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
d.ellipse((10, 10, 190, 190), fill=(${t[3].join(',')}, 255), outline=(0, 0, 0, 255), width=12); im.save(r'''${path.join(site, 'icons', folder, t[0] + '.png')}''')`]);
  }
}
let events = [{ id: 's3-na', season: 3, region: 'na', showmatch: false }, { id: 's4-na', season: 4, region: 'na', showmatch: false },
  { id: 'showmatch-s4-na', season: 4, region: 'na', showmatch: true }];
const writeList = () => { fs.mkdirSync(path.join(site, 'api'), { recursive: true }); fs.writeFileSync(path.join(site, 'api', 'matches.json'), JSON.stringify(events)); };
writeList();
writeEvent('s4-na', 'na', 4, S4, 's4_teams/na');
let hits = 0;
const server = http.createServer((req, res) => {
  hits++;
  let p = decodeURIComponent(req.url.split('?')[0]);
  let f = path.join(site, p);
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!f.startsWith(site) || !fs.existsSync(f)) { res.writeHead(404); return res.end('no'); }
  res.writeHead(200); res.end(fs.readFileSync(f));
});
server.listen(0, () => {
  const env = Object.assign({}, process.env, { PCMT_BASE: 'http://127.0.0.1:' + server.address().port, PCMT_TEAMS_ROOT: root });
  // async: the pretend PCMT.gg runs in this process, so it has to keep answering while the script runs
  const run = () => new Promise(done => {
    const c = spawn('node', [path.join(__dirname, 'pcmt-teams.js')], { env }), r = { stdout: '', stderr: '' };
    c.stdout.on('data', d => { r.stdout += d; }); c.stderr.on('data', d => { r.stderr += d; });
    c.on('close', code => { r.status = code; done(r); });
  });
  const load = () => { const w = {}; new Function('window', fs.readFileSync(path.join(root, 'season-teams.js'), 'utf8').replace('var PCMT_SEASON_TEAMS', 'window.PCMT_SEASON_TEAMS'))(w); return w.PCMT_SEASON_TEAMS; };
  (async () => {
    let r = await run();
    check(r.status === 0, 'first run works' + (r.status ? ': ' + r.stderr : ''));
    let S = load();
    check(S.length === 1 && S[0].event === 's4-na' && S[0].title === 'NA Season 4', 'only NA S4 on (S3 has hand-made decks, showmatches skipped)');
    const by = {}; S[0].teams.forEach(t => { by[t.code] = t; });
    check(Object.keys(by).join() === 'S4-BLG,S4-DEI,S4-FNC,S4-TANK', 'every team, codes S4-<team> (DEI\'s slug ends in a dot)');
    check(by['S4-DEI'].name === 'Doofenshmirtz Evil Inc.' && by['S4-DEI'].label === 'DEI', 'names and labels from the team pages');
    check(S[0].teams.every(t => t.logo && fs.existsSync(path.join(root, t.logo)) && /^assets\/teams\/s4-na\/[a-z]+-[0-9a-f]{8}\.png$/.test(t.logo)), 'logos downloaded into assets/teams/s4-na/');
    check(by['S4-FNC'].color === '#fd5800' && by['S4-TANK'].color === '#d80000', 'NA S4 keeps its hand-picked colours');
    const sizeBefore = fs.readFileSync(path.join(root, 'season-teams.js'), 'utf8');
    hits = 0; r = await run();
    check(r.status === 0 && /no change/.test(r.stdout) && fs.readFileSync(path.join(root, 'season-teams.js'), 'utf8') === sizeBefore, 'second run: no change, logos not downloaded again');
    check(hits === 2 + S4.length, 'second run reads only the pages (' + hits + ' requests)');
    // A new EMEA season appears on PCMT.gg
    events.push({ id: 's3-emea', season: 3, region: 'emea', showmatch: false }); writeList();
    writeEvent('s3-emea', 'emea', 3, S3E, 's3_teams/emea');
    r = await run(); S = load();
    const emea = S.find(s => s.event === 's3-emea');
    check(!!emea && emea.region === 'EMEA' && emea.title === 'EMEA Season 3', 'a new season shows up on its own');
    check(emea && emea.teams.map(t => t.code).join() === 'S3E-NIP,S3E-SEAL', 'EMEA codes are S<season>E-<team>');
    const seal = emea && emea.teams.find(t => t.code === 'S3E-SEAL');
    check(seal && /^#[0-9a-f]{6}$/.test(seal.color) && parseInt(seal.color.slice(5, 7), 16) > 150 && parseInt(seal.color.slice(1, 3), 16) < 90, 'a new team\'s colour comes from its logo (blue disc, black outline ignored: ' + (seal && seal.color) + ')');
    // A team's logo changes on PCMT.gg
    fs.renameSync(path.join(site, 'icons', 's4_teams', 'na', 'TANKERS.png'), path.join(site, 'icons', 's4_teams', 'na', 'TANKERS v2.png'));
    const tp = path.join(site, 'events', 's4-na', 'teams', 'tankers');
    fs.writeFileSync(tp, fs.readFileSync(tp, 'utf8').replace('TANKERS.png', 'TANKERS v2.png'));
    hits = 0; r = await run(); S = load();
    const tank = S.find(s => s.event === 's4-na').teams.find(t => t.code === 'S4-TANK');
    check(tank && tank.src === '/icons/s4_teams/na/TANKERS v2.png' && fs.existsSync(path.join(root, tank.logo)) && fs.readdirSync(path.join(root, 'assets/teams/s4-na')).filter(f => /^tank-/.test(f)).length === 1 && hits === 3 + S4.length + S3E.length + 1, 'a changed logo is downloaded again, and only that one (path with a space; ' + hits + ' requests)');
    // PCMT.gg down: keeps everything
    const keep = fs.readFileSync(path.join(root, 'season-teams.js'), 'utf8');
    env.PCMT_BASE = 'http://127.0.0.1:1';
    r = await run();
    check(r.status !== 0 && fs.readFileSync(path.join(root, 'season-teams.js'), 'utf8') === keep, 'PCMT.gg down: fails and leaves season-teams.js alone');
    server.close();
    fs.rmSync(tmp, { recursive: true, force: true });
    console.log(bad ? bad + ' problem(s)' : 'All team checks passed');
    process.exit(bad ? 1 : 0);
  })();
});
