// Deck Breakdown checks: NODE_PATH=$(npm root -g) node tools/breakdown-test.js http://localhost:8766
// Every player's breakdown in every series adds up to the points decks score (league.js seriesPoints), 4Ks/5Ks included;
// the page lists the store, and the game and map windows open and close.
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:8766';
let bad = 0; const check = (ok, msg) => { if (!ok) { bad++; console.log('FAIL ' + msg); } };
(async () => {
  const b = await chromium.launch(), pg = await b.newPage({ viewport: { width: 1280, height: 900 } });
  const errs = []; pg.on('pageerror', e => errs.push(e.message));
  await pg.addInitScript(() => localStorage.setItem('pcmt-patch-seen', 'x'));
  await pg.route('https://wwrsavqipkxvdsxcemos.supabase.co/**', async r => {
    const u = r.request().url(), j = x => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(x) });
    if (u.includes('multikills')) {   // a made-up 4K and ace for the first player of the newest series
      const first = await pg.evaluate(() => { const r = PCMT_RESULTS.slice().sort((a, b) => a.start < b.start ? 1 : -1)[0]; return { key: r.start + '|' + r.a + '|' + r.b, id: Object.keys(r.stats).find(k => k[0] !== '~') }; }).catch(() => null);
      return j(first ? [{ series: first.key, player: first.id, k4: 1, k5: 1 }] : []);
    }
    return j([]);
  });
  await pg.goto(BASE + '/deck-breakdown.html');
  await pg.waitForSelector('.bd-row', { timeout: 10000 });
  const sums = await pg.evaluate(() => {
    const L = window.PCMT_LEAGUE; let n = 0; const off = [];
    (window.PCMT_RESULTS || []).forEach(r => { const sp = L.seriesPoints(r); Object.keys(sp).forEach(id => {
      const x = L.seriesBreakdown(r, id); n++;
      if (!x || Math.abs(x.pts - sp[id]) > 1e-9) off.push(r.a + ' v ' + r.b + ' ' + id);
    }); });
    return { n, off };
  });
  check(sums.n > 0 && !sums.off.length, 'breakdowns should add up to the deck scoring: ' + sums.off.slice(0, 5).join(', '));
  console.log('breakdowns checked: ' + sums.n);
  check(await pg.$$eval('.bd-row', e => e.length) > 20, 'the store\'s players should be listed');
  await pg.click('.bd-row .bd-chip-game >> nth=0');
  check(await pg.isVisible('#bd-win') && /vs/.test(await pg.textContent('#bd-win-title')), 'a game should open its table');
  check(await pg.$$eval('.bd-table tbody tr', e => e.length) === 21, 'the table should have every scoring event');
  await pg.keyboard.press('Escape');
  check(await pg.isHidden('#bd-win'), 'Escape should close the window');
  await pg.click('.bd-row .bd-chip-map >> nth=0');
  check(/Points on this map/.test(await pg.textContent('#bd-win')), 'a map should open its table');
  await pg.click('#bd-win [data-close]');
  await pg.click('[data-region="EMEA"]');
  check(/EMEA/.test(await pg.textContent('#bd-note')), 'the EMEA toggle should switch the list');
  check(!errs.length, 'page errors: ' + errs.join('; '));
  await b.close();
  console.log(bad ? bad + ' problem(s)' : 'All checks passed');
  process.exit(bad ? 1 : 0);
})();
