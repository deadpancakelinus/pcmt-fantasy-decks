// Prints one finished PCMT.gg match as a PCMT_RESULTS entry for data.js (JSON), read from PCMT.gg's API.
//   node tools/pcmt-result.js <event> <match id>        e.g. s2-emea xtc-vs-hot-s2-group-alpha-2026-08-19
//   node tools/pcmt-result.js <match page url>          e.g. https://pcmt.gg/events/s2-emea/xtc-vs-hot-...
// Exits with an error if the series isn't finished or a team has no stats yet.
// Normally tools/pcmt-sync.js does this for every new match by itself.
const fs = require('fs'), path = require('path');
const A = require('./pcmt-api.js');

let [event, id] = process.argv.slice(2);
const m = event && event.match(/\/events\/([^/]+)\/([^/?#]+)/);
if (m) [event, id] = [m[1], m[2]];
if (!event || !id) { console.error('usage: node tools/pcmt-result.js <event> <match id>  |  <match page url>'); process.exit(2); }

const players = A.loadPlayers(fs.readFileSync(path.join(__dirname, '..', 'players.js'), 'utf8'));
let out;
try { out = A.toResult(A.getJson('/api/matches/' + event + '/' + id + '.json'), event, players); }
catch (e) { console.error(e.message); process.exit(1); }
const strangers = Object.keys(out.stats).filter(k => k[0] === '~');
if (strangers.length) console.error('Not in the store (kept with ~): ' + strangers.join(', '));
console.log(JSON.stringify(out));
