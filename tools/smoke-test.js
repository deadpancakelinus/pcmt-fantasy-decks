// Smoke test for a built site folder. Opens every page on desktop and phone with Supabase mocked out,
// and reports page errors and any sideways overflow. Saves screenshots to <out>/shots.
//
//   python3 -m http.server 8766 --directory <built folder>      (in the background)
//   NODE_PATH=$(npm root -g) node tools/smoke-test.js [baseUrl] [shotsDir]
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.argv[2] || 'http://localhost:8766';
const SHOTS = process.argv[3] || 'shots';
const PAGES = ['home', 'index', 'customization', 'leaderboard', 'guide', 'login', 'mvp-vs', 'store', 'library', 'pickems', 'admin', 'backend'];
(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const b = await chromium.launch();
  let bad = 0;
  for (const w of [1440, 390]) for (const p of PAGES) {
    const pg = await b.newPage({ viewport: { width: w, height: 900 }, timezoneId: 'America/New_York' });
    const errs = [];
    pg.on('pageerror', e => errs.push(e.message));
    pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await pg.route('https://wwrsavqipkxvdsxcemos.supabase.co/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await pg.goto(`${BASE}/${p}.html`);
    await pg.waitForTimeout(1500);
    const over = await pg.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    const real = errs.filter(e => !/fonts\.g|Failed to load resource/.test(e));
    if (over > 0 || real.length) bad++;
    console.log(`${w}px ${p}: "${await pg.title()}" overflow=${over}px errors=${real.length}${real.length ? ' ' + real.slice(0, 3).join(' | ') : ''}`);
    await pg.screenshot({ path: `${SHOTS}/${p}-${w}.png`, fullPage: false });
    await pg.close();
  }
  await b.close();
  console.log(bad ? `${bad} page view(s) need a look` : 'all pages OK');
})();
