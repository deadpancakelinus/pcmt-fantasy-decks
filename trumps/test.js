// Top Trumps checks: rules engine simulation + page walk-through on desktop and phone (Supabase mocked).
//   python3 -m http.server 8767 --directory .      (repo root, in the background)
//   NODE_PATH=$(npm root -g) node trumps/test.js http://localhost:8767 <shotsDir>
const { chromium } = require('playwright');
const fs = require('fs');
const BASE = process.argv[2] || 'http://localhost:8767';
const SHOTS = process.argv[3] || 'shots';
let bad = 0;
const check = (ok, msg) => { if (!ok) { bad++; console.log('FAIL ' + msg); } };

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const b = await chromium.launch();

  // 1) Engine: play many bot-vs-bot games per region.
  {
    const pg = await b.newPage();
    await pg.goto(`${BASE}/mvp-vs.html`);
    const r = await pg.evaluate(() => {
      const T = window.PCMT_TRUMPS, out = {};
      for (const region of ['na', 'emea']) {
        const total = T.cards[region].length, all = new Set(T.cards[region].map(c => c.id));
        let games = 0, byCards = 0, byLimit = 0, draws = 0, errors = [];
        for (let seed = 1; seed <= 2000; seed++) {
          let s = T.newGame(region, seed);
          if (s.hands[0].length !== s.hands[1].length) errors.push('uneven deal');
          let guard = 0;
          while (!s.over && guard++ < 1000) {
            const stat = seed % 3 ? T.botPick(s, s.turn) : T.STATS[seed % 5].k;
            s = T.play(s, stat);
            const ids = s.hands[0].concat(s.hands[1], s.pot);
            if (ids.length !== total || new Set(ids).size !== total || ids.some(i => !all.has(i))) { errors.push('card count broke at seed ' + seed); break; }
          }
          if (!s.over) errors.push('never ended, seed ' + seed);
          else { games++; if (s.over.winner < 0) draws++; else if (s.over.reason === 'cards') byCards++; else byLimit++; }
          if (errors.length) break;
        }
        // Same seed must give the same game (both online players run the engine).
        const a = JSON.stringify(T.play(T.newGame(region, 42), 'acs')), c = JSON.stringify(T.play(T.newGame(region, 42), 'acs'));
        // DPR: the lower number must win; every other stat: the higher number.
        const cs = T.cards[region], sorted = cs.slice().sort((x, y) => x.dpr - y.dpr), lo = sorted[0], hi = sorted[sorted.length - 1];
        const base = { region, seed: 1, hands: [[hi.id, lo.id], [lo.id, hi.id]], pot: [], turn: 0, round: 1, last: null, over: null };
        const dprOk = T.play(base, 'dpr').last.winner === 1 && T.play(base, 'acs').last.winner === (hi.acs > lo.acs ? 0 : hi.acs < lo.acs ? 1 : -1);
        out[region] = { total, games, byCards, byLimit, draws, errors: errors.slice(0, 3), deterministic: a === c, dprOk };
      }
      return out;
    });
    for (const [region, x] of Object.entries(r)) {
      console.log(`engine ${region}: ${x.total} cards, ${x.games} games, ${x.byCards} won by taking every card, ${x.byLimit} by round limit, ${x.draws} draws`);
      check(x.games === 2000 && !x.errors.length, `engine ${region}: ${x.errors.join('; ')}`);
      check(x.deterministic, `engine ${region} not deterministic`);
      check(x.dprOk, `engine ${region}: lower DPR should win`);
    }
    await pg.close();
  }

  // 2) Page: lobby, region toggle, a bot game, on desktop and phone.
  for (const w of [1440, 390]) {
    const pg = await b.newPage({ viewport: { width: w, height: 900 }, reducedMotion: w < 500 ? 'reduce' : 'no-preference' });
    const errs = [];
    pg.on('pageerror', e => errs.push(e.message));
    pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await pg.route('https://wwrsavqipkxvdsxcemos.supabase.co/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
    await pg.goto(`${BASE}/mvp-vs.html`);
    await pg.waitForTimeout(400);
    await pg.screenshot({ path: `${SHOTS}/lobby-${w}.png`, fullPage: true });
    await pg.click('[data-region="emea"]');
    check((await pg.textContent('[data-act="bot"]')).includes('EMEA'), 'region toggle did not switch the deal button');
    await pg.click('[data-act="bot"]');
    check(await pg.isDisabled('[data-region="na"]'), 'region toggle should lock during a game');
    const names = new Set();
    for (let i = 0; i < 6; i++) {
      // Wait for either our pick, the reveal, or the end.
      await pg.waitForSelector('.tt-flip:not(.is-down) button.tt-stat, [data-act="next"]:not([disabled]), .tt-big', { timeout: 8000 });
      if (await pg.$('.tt-big')) break;
      if (await pg.$('.tt-flip:not(.is-down) button.tt-stat')) {
        names.add(await pg.textContent('.tt-card .tt-name'));
        if (i === 0) await pg.screenshot({ path: `${SHOTS}/pick-${w}.png`, fullPage: true });
        await pg.click('button.tt-stat >> nth=' + (i % 5));
      }
      await pg.waitForSelector('[data-act="next"]:not([disabled])', { timeout: 8000 });
      if (i === 0) await pg.screenshot({ path: `${SHOTS}/reveal-${w}.png`, fullPage: true });
      const region = await pg.evaluate(() => [...document.querySelectorAll('.tt-teamname')].map(e => e.textContent).join(' | '));
      check(/EMEA/.test(region) && !/S3 NA/.test(region), 'EMEA game showed a non-EMEA card: ' + region);
      const wm = await pg.$$eval('.tt-wm img', els => els.map(e => e.getAttribute('src')));
      check(wm.length === 2 && wm.every(x => x.includes('3c7e7374')), 'EMEA cards should carry the EMEA watermark: ' + wm);
      await pg.click('[data-act="next"]');
    }
    const counts = await pg.evaluate(() => [...document.querySelectorAll('[data-count]')].map(e => +e.dataset.count).concat(document.querySelectorAll('.tt-slot .tt-flip').length));
    check(counts.length === 4 && counts.reduce((a, b) => a + b, 0) === 51, 'decks + pot + table should total 51 EMEA cards, got ' + counts);
    const over = await pg.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    check(over <= 0, `${w}px sideways overflow ${over}px`);
    const real = errs.filter(e => !/fonts\.g|Failed to load resource/.test(e));
    check(!real.length, `${w}px page errors: ${real.join(' | ')}`);
    console.log(`page ${w}px: played ${names.size}+ rounds, counts ${counts}, overflow ${over}px, errors ${real.length}`);
    await pg.close();
  }

  // 3) Online: create a room, the guest joins (seen by polling), host picks a stat and the move is sent.
  {
    const pg = await b.newPage({ viewport: { width: 1440, height: 900 } });
    const errs = []; pg.on('pageerror', e => errs.push(e.message));
    const uid = '11111111-1111-1111-1111-111111111111';
    const tok = 'x.' + Buffer.from(JSON.stringify({ sub: uid })).toString('base64').replace(/=+$/, '') + '.y';
    await pg.addInitScript(t => localStorage.setItem('pcmt-auth', JSON.stringify({ access_token: t, refresh_token: 'r', expires_at: Date.now() + 3600e3 })), tok);
    let room = null, moves = [];
    await pg.route('https://wwrsavqipkxvdsxcemos.supabase.co/**', async r => {
      const u = r.request().url(), body = r.request().postDataJSON ? r.request().postDataJSON() : null;
      const json = x => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(x) });
      if (u.includes('/rpc/trumps_is_tester')) return json(true);
      if (u.includes('/rpc/trumps_create')) { room = { code: 'K7Q2M', region: body.p_region, host: uid, guest: null, host_name: 'Linus', guest_name: null, state: body.p_state, version: 1 }; return json('K7Q2M'); }
      if (u.includes('/rpc/trumps_move')) { if (body.p_version !== room.version) return r.fulfill({ status: 400, contentType: 'application/json', body: '{"message":"The game moved on. Refreshing."}' }); moves.push(body); room.state = body.p_state; room.version++; return json(room.version); }
      if (u.includes('/trumps_rooms')) return json(room ? [room] : []);
      return json([]);
    });
    await pg.goto(`${BASE}/mvp-vs.html`);
    await pg.waitForSelector('[data-act="create"]');
    await pg.screenshot({ path: `${SHOTS}/online-lobby.png`, fullPage: true });
    await pg.click('[data-act="create"]');
    await pg.waitForSelector('.tt-code');
    check((await pg.textContent('.tt-code')) === 'K7Q2M', 'room code not shown');
    await pg.screenshot({ path: `${SHOTS}/online-waiting.png` });
    // Guest joins; make it the host's turn so we can pick.
    room.guest = '22222222-2222-2222-2222-222222222222'; room.guest_name = 'Ethan'; room.version++; room.state.turn = 0;
    await pg.waitForSelector('button.tt-stat', { timeout: 5000 });
    check((await pg.textContent('.tt-tabletop')).includes('Ethan'), 'guest name not shown');
    await pg.click('button.tt-stat >> nth=1');
    await pg.waitForSelector('[data-act="next"]', { timeout: 5000 });
    check(moves.length === 1 && moves[0].p_state.last.stat === 'kast', 'move was not sent');
    await pg.screenshot({ path: `${SHOTS}/online-reveal.png` });
    check(!errs.length, 'online page errors: ' + errs.join(' | '));
    console.log(`online: room ${room.code}, ${moves.length} move sent, version ${room.version}`);
    await pg.close();
  }

  await b.close();
  console.log(bad ? `${bad} problem(s)` : 'All checks passed');
  process.exit(bad ? 1 : 0);
})();
