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

  // 1) Engine: play many bot-vs-bot games per region and past season.
  {
    const pg = await b.newPage();
    await pg.route('https://wwrsavqipkxvdsxcemos.supabase.co/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: r.request().url().includes('site_pages') ? '[{"id":"mvp-vs","launched":true}]' : '[]' }));
    await pg.goto(`${BASE}/mvp-vs.html`);
    const r = await pg.evaluate(() => {
      const T = window.PCMT_TRUMPS, out = {};
      for (const region of (window.PCMT_TRUMPS_SEASONS || []).map(x => x.id)) {   // every season's deck
        const total = T.cards[region].length, all = new Set(T.cards[region].map(c => c.id));
        let games = 0, byCards = 0, byLimit = 0, draws = 0, errors = [];
        for (let seed = 1; seed <= 2000; seed++) {
          let s = T.newGame(region, seed);
          if (Math.abs(s.hands[0].length - s.hands[1].length) > 1 || s.hands[0].length + s.hands[1].length !== total) errors.push('bad deal');
          if (total % 2 && s.hands[1 - s.turn].length !== s.hands[s.turn].length + 1) errors.push('extra card should go to whoever picks second');
          let guard = 0;
          while (!s.over && guard++ < 1000) {
            const stat = seed % 3 ? T.botPick(s, s.turn) : T.STATS[seed % 5].k;
            s = T.play(s, stat);
            const ids = s.hands[0].concat(s.hands[1]);
            if (ids.length !== total || new Set(ids).size !== total || ids.some(i => !all.has(i))) { errors.push('card count broke at seed ' + seed); break; }
          }
          if (!s.over) errors.push('never ended, seed ' + seed);
          else { games++; if (s.over.winner < 0) draws++; else if (s.over.reason === 'cards') byCards++; else byLimit++; }
          if (errors.length) break;
        }
        // Against the bot the player (seat 0) always picks first; with an odd deck the bot gets the extra card.
        let firstOk = true;
        for (let seed = 1; seed <= 200; seed++) { const g = T.newGame(region, seed, 0); if (g.turn !== 0 || g.hands[1].length - g.hands[0].length !== total % 2) firstOk = false; }
        out[region + 'First'] = firstOk;
        // Same seed must give the same game (both online players run the engine).
        const a = JSON.stringify(T.play(T.newGame(region, 42), 'acs')), c = JSON.stringify(T.play(T.newGame(region, 42), 'acs'));
        // Deaths: the lower number must win; every other stat: the higher number.
        const cs = T.cards[region], sorted = cs.slice().sort((x, y) => x.deaths - y.deaths), lo = sorted[0], hi = sorted[sorted.length - 1];
        const base = { region, seed: 1, hands: [[hi.id, lo.id], [lo.id, hi.id]], turn: 0, round: 1, last: null, over: null };
        // Tie: both cards go back to their own decks and the same player picks again.
        const tie = T.play({ region, seed: 1, hands: [[hi.id, lo.id], [hi.id, lo.id]], turn: 1, round: 1, last: null, over: null }, 'acs');
        const tieOk = tie.last.winner === -1 && tie.turn === 1 && tie.hands[0].join() === [lo.id, hi.id].join() && tie.hands[1].join() === [lo.id, hi.id].join();
        const dprOk = tieOk && (hi.deaths === lo.deaths || T.play(base, 'deaths').last.winner === 1) && T.play(base, 'acs').last.winner === (hi.acs > lo.acs ? 0 : hi.acs < lo.acs ? 1 : -1);
        out[region] = { total, games, byCards, byLimit, draws, errors: errors.slice(0, 3), deterministic: a === c, dprOk };
      }
      return out;
    });
    // 3 and 4 players: even deal, cards never lost, the game always ends, ties go back, players drop out.
    const multi = await pg.evaluate(() => {
      const T = window.PCMT_TRUMPS, out = {};
      for (const n of [3, 4]) {
        const deck = window.PCMT_TRUMPS_SEASONS[0].id, total = T.cards[deck].length, errors = [];
        let ended = 0, outs = 0, wins = 0;
        for (let seed = 1; seed <= 600; seed++) {
          let s = T.newGame(deck, seed, undefined, 200, n);
          const sizes = s.hands.map(h => h.length);
          if (s.hands.length !== n || Math.max(...sizes) - Math.min(...sizes) > 1 || sizes.reduce((a, b) => a + b, 0) !== total) { errors.push('bad deal ' + sizes); break; }
          if (sizes[s.turn] !== Math.min(...sizes)) { errors.push('first picker got an extra card'); break; }
          let guard = 0;
          while (!s.over && guard++ < 400) {
            if (!s.hands[s.turn].length) { errors.push('picker has no cards'); break; }
            s = T.play(s, T.botPick(s, s.turn));
            const ids = [].concat(...s.hands);
            if (ids.length !== total || new Set(ids).size !== total) { errors.push('cards broke, seed ' + seed); break; }
            if (s.hands.some(h => !h.length) && !s.over) outs++;
          }
          if (!s.over) errors.push('never ended');
          else { ended++; if (s.over.winner >= 0) { wins++; const c = s.hands.map(h => h.length); if (c.filter(x => x >= c[s.over.winner]).length !== 1) errors.push('winner without the most cards'); } }
          if (errors.length) break;
        }
        // a tie for the best card among 3: every card goes back to its own deck, same picker
        const cs = T.cards[deck], hi = cs.slice().sort((a, b) => b.acs - a.acs)[0], lo = cs.slice().sort((a, b) => a.acs - b.acs)[0];
        const t = T.play({ region: deck, seed: 1, limit: 60, hands: [[hi.id, 'x'], [hi.id, 'y'], [lo.id, 'z']].slice(0, 3), turn: 2, round: 1, last: null, over: null }, 'acs');
        const tieOk = t.last.winner === -1 && t.turn === 2 && t.hands.every((h, i) => h[h.length - 1] === [hi.id, hi.id, lo.id][i]);
        const one = T.play({ region: deck, seed: 1, limit: 60, hands: [[hi.id], [lo.id], []], turn: 1, round: 1, last: null, over: null }, 'acs');
        const outOk = one.over && one.over.winner === 0 && one.hands[0].length === 2 && one.last.cards[2] === null;
        out[n] = { ended, wins, outs, errors: errors.slice(0, 2), tieOk, outOk };
      }
      return out;
    });
    for (const n of [3, 4]) {
      const x = multi[n];
      check(x.ended === 600 && !x.errors.length, `engine ${n} players: ${x.errors.join('; ')}`);
      check(x.tieOk && x.outOk, `engine ${n} players: ties go back to their own decks and a player with no cards sits out (${x.tieOk}, ${x.outOk})`);
      console.log(`engine ${n} players: ${x.ended} games ended, ${x.wins} with a winner`);
    }
    // Several seasons dealt together, and the round count set before the deal.
    const mix = await pg.evaluate(() => {
      const T = window.PCMT_TRUMPS, ids = window.PCMT_TRUMPS_SEASONS.map(x => x.id).slice(0, 3), deck = ids.join('+');
      const want = ids.reduce((t, id) => t + T.cards[id].length, 0);
      let s = T.newGame(deck, 9, 0, 7), guard = 0;
      const dealt = s.hands[0].length + s.hands[1].length, seasons = new Set(s.hands[0].concat(s.hands[1]).map(i => i.split('-')[0]));
      while (!s.over && guard++ < 100) s = T.play(s, T.botPick(s, s.turn));
      return { want, dealt, seasons: seasons.size, ids: ids.length, endRound: s.round, reason: s.over && s.over.reason,
        defaultLimit: T.newGame(ids[0], 1).limit, badLimit: T.newGame(ids[0], 1, 0, 'x').limit, bigLimit: T.newGame(ids[0], 1, 0, 1e6).limit };
    });
    check(mix.dealt === mix.want && mix.seasons === mix.ids, 'a mixed deck should deal every card of every picked season: ' + JSON.stringify(mix));
    check(mix.reason === 'cards' || (mix.reason === 'limit' && mix.endRound === 8), 'a 7-round game should end after round 7: ' + JSON.stringify(mix));
    check(mix.defaultLimit === 60 && mix.badLimit === 60 && mix.bigLimit === 60, 'rounds default to 60: ' + JSON.stringify(mix));
    console.log('mixed deck: ' + mix.dealt + ' cards from ' + mix.seasons + ' seasons, 7-round game ended ' + mix.reason);
    for (const [region, x] of Object.entries(r).filter(([k]) => !k.endsWith('First'))) {
      console.log(`engine ${region}: ${x.total} cards, ${x.games} games, ${x.byCards} won by taking every card, ${x.byLimit} by round limit, ${x.draws} draws`);
      check(x.games === 2000 && !x.errors.length, `engine ${region}: ${x.errors.join('; ')}`);
      check(x.deterministic, `engine ${region} not deterministic`);
      check(x.dprOk, `engine ${region}: lower Deaths should win, and ties go back to their own decks`);
      check(r[region + 'First'], `engine ${region}: player should always pick first against the bot`);
    }
    await pg.close();
  }

  // 2) Page: lobby, region toggle, a bot game, on desktop and phone.
  for (const w of [1440, 390]) {
    const pg = await b.newPage({ viewport: { width: w, height: 900 }, reducedMotion: w < 500 ? 'reduce' : 'no-preference' });
    const errs = [];
    pg.on('pageerror', e => errs.push(e.message));
    pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    // MVP VS may still be staff-only (site_pages): open it as launched.
    await pg.route('https://wwrsavqipkxvdsxcemos.supabase.co/**', r => r.fulfill({ status: 200, contentType: 'application/json', body: r.request().url().includes('site_pages') ? '[{"id":"mvp-vs","launched":true}]' : '[]' }));
    await pg.goto(`${BASE}/mvp-vs.html`);
    await pg.waitForSelector('#tt-app', { timeout: 5000 });
    await pg.waitForTimeout(400);
    await pg.evaluate(() => {
      window.__ttSeen = [];
      new MutationObserver(() => {
        const t = document.querySelector('.tt-tabletop'), r = document.querySelector('.tt-round'), p = document.querySelector('.tt-status .tt-result');
        if (!t || !r || !p) return;
        const phase = document.querySelector('[data-act="next"]') ? 'reveal' : document.querySelector('.tt-over') ? 'over' : 'pick';
        window.__ttSeen.push({ phase, top: t.getBoundingClientRect().top + scrollY, round: r.offsetHeight, panel: p.offsetHeight });
      }).observe(document.getElementById('tt-app'), { childList: true });
    });
    await pg.screenshot({ path: `${SHOTS}/lobby-${w}.png`, fullPage: true });
    const EM = await pg.evaluate(() => window.PCMT_TRUMPS_SEASONS.filter(x => x.region === 'emea' && x.current)[0].id);
    const NA = await pg.evaluate(() => window.PCMT_TRUMPS_SEASONS.filter(x => x.region === 'na' && x.current)[0].id);
    await pg.click(`[data-region="${EM}"]`);   // seasons toggle: add EMEA, then take NA off
    await pg.click(`[data-region="${NA}"]`);
    check(await pg.getAttribute(`[data-region="${NA}"]`, 'aria-pressed') === 'false', 'NA should be off after tapping it again');
    check((await pg.textContent('#tt-bot-line')).includes('EMEA') && (await pg.textContent('[data-act="bot"]')).trim() === 'Deal', 'the season toggle should switch the deal line, and the button should say Deal');
    await pg.click('[data-act="bot"]');
    await pg.waitForSelector('.tt-status .tt-result', { timeout: 5000 });
    check(/Your pick/.test(await pg.textContent('.tt-status .tt-result')) && /Round 1\b/.test(await pg.textContent('.tt-round')), `${w}px: round 1 against the bot should be the player's pick`);
    check(await pg.isDisabled(`[data-region="${NA}"]`), 'region toggle should lock during a game');
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
      check(/EMEA/.test(region) && !/ NA/.test(region), 'EMEA game showed a non-EMEA card: ' + region);
      const rl = await pg.$$eval('.tt-region-logo', els => els.map(e => e.getAttribute('src')));
      check(rl.length === 2 && rl.every(x => x.includes('3c7e7374')), 'EMEA cards should carry the EMEA logo top left: ' + rl);
      const roles = await pg.$$eval('.tt-roles', els => els.map(e => e.querySelectorAll('img').length));
      check(roles.length === 2 && roles.every(n => n >= 1), 'every card should show its roles: ' + roles);
      await pg.click('[data-act="next"]');
    }
    const counts = await pg.evaluate(() => [...document.querySelectorAll('[data-count]')].map(e => +e.dataset.count).concat(document.querySelectorAll('.tt-slot .tt-flip').length));
    const emeaN = await pg.evaluate(id => window.PCMT_TRUMPS.cards[id].length, EM);   // from trumps-cards.js (the stats sync can add players)
    check(counts.length === 3 && counts.reduce((a, b) => a + b, 0) === emeaN, 'decks + table should total ' + emeaN + ' EMEA cards, got ' + counts);
    check(!(await pg.$('.tt-pot, #tt-pot')), 'there should be no pot on the table');
    const over = await pg.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    check(over <= 0, `${w}px sideways overflow ${over}px`);
    const real = errs.filter(e => !/fonts\.g|Failed to load resource/.test(e));
    check(!real.length, `${w}px page errors: ${real.join(' | ')}`);
    // Every screen the game drew: where the table sat, and the round/result panel heights.
    const seen = await pg.evaluate(() => window.__ttSeen || []);
    const phases = new Set(seen.map(x => x.phase)), topsY = seen.map(x => x.top);
    check(phases.has('pick') && phases.has('reveal'), `${w}px saw phases ${[...phases]}`);
    check(Math.max(...topsY) - Math.min(...topsY) < 1, `${w}px table moved between screens: ${Math.min(...topsY)}..${Math.max(...topsY)}`);
    check(seen.every(x => x.round === x.panel), `${w}px round and message panels differ in height: ` + JSON.stringify(seen.find(x => x.round !== x.panel)));
    console.log(`page ${w}px: ${seen.length} screens checked (${[...phases].join('/')}), table moved ${(Math.max(...topsY) - Math.min(...topsY)).toFixed(1)}px, played ${names.size}+ rounds, counts ${counts}, overflow ${over}px, errors ${real.length}`);
    await pg.close();
  }

  // 3) Online: create a room, the guest joins (seen by polling), host picks a stat and the move is sent.
  {
    const pg = await b.newPage({ viewport: { width: 1440, height: 900 } });
    const errs = []; pg.on('pageerror', e => errs.push(e.message));
    const uid = '11111111-1111-1111-1111-111111111111';
    const tok = 'x.' + Buffer.from(JSON.stringify({ sub: uid })).toString('base64').replace(/=+$/, '') + '.y';
    await pg.addInitScript(t => localStorage.setItem('pcmt-auth', JSON.stringify({ access_token: t, refresh_token: 'r', expires_at: Date.now() + 3600e3 })), tok);
    let room = null, moves = [], starts = [], left = 0;
    await pg.route('https://wwrsavqipkxvdsxcemos.supabase.co/**', async r => {
      const u = r.request().url(), body = r.request().postDataJSON ? r.request().postDataJSON() : null;
      const json = x => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(x) });
      if (u.includes('site_pages')) return json([{ id: 'mvp-vs', launched: true }]);
      if (u.includes('/rpc/trumps_is_tester')) return json(true);
      if (u.includes('/rpc/trumps_create')) { room = { code: 'K7Q2M', region: body.p_region, host: uid, guest: null, host_name: 'Linus', guest_name: null, players: [uid], names: ['Linus'], started: false, state: body.p_state, version: 1 }; return json('K7Q2M'); }
      if (u.includes('/rpc/trumps_start')) { if (body.p_version !== room.version || body.p_state.hands.length !== room.players.length) return r.fulfill({ status: 400, contentType: 'application/json', body: '{"message":"Someone joined or left just now. Try again."}' }); starts.push(body); room.state = body.p_state; room.started = true; room.version++; return json(room.version); }
      if (u.includes('/rpc/trumps_leave')) { left++; return json(null); }
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
    check(await pg.isDisabled('[data-act="start"]'), 'Start should wait for a second player');
    // Three friends join (seen by polling): 4 seats, Start turns on.
    const ids = ['22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', '44444444-4444-4444-4444-444444444444'];
    room.players = [uid, ...ids]; room.names = ['Linus', 'Ethan', 'Mia', 'Zed']; room.guest = ids[0]; room.guest_name = 'Ethan'; room.version++;
    await pg.waitForFunction(() => document.querySelectorAll('.tt-seats li.in').length === 4, null, { timeout: 5000 });
    check(!(await pg.isDisabled('[data-act="start"]')) && /4 players/.test(await pg.textContent('[data-act="start"]')), 'Start should turn on with 4 players');
    await pg.screenshot({ path: `${SHOTS}/online-seats.png` });
    await pg.click('[data-act="start"]');
    await pg.waitForSelector('.tt-tabletop.tt-n4', { timeout: 5000 });
    check(starts.length === 1 && starts[0].p_state.hands.length === 4, 'the host should deal 4 hands');
    // Make it the host's turn so we can pick.
    room.state = JSON.parse(JSON.stringify(room.state)); room.state.turn = 0; room.version++;
    await pg.waitForSelector('button.tt-stat', { timeout: 5000 });
    const table = await pg.textContent('.tt-tabletop');
    check(['Ethan', 'Mia', 'Zed'].every(n => table.includes(n)), 'every player should be at the table');
    check(await pg.$$eval('.tt-opp', e => e.length) === 3, 'three other players across the top');
    await pg.screenshot({ path: `${SHOTS}/online-4p-pick.png` });
    await pg.click('button.tt-stat >> nth=1');
    await pg.waitForSelector('[data-act="next"]', { timeout: 5000 });
    check(moves.length === 1 && moves[0].p_state.last.stat === 'kast' && moves[0].p_state.last.cards.length === 4, 'move was not sent');
    await pg.waitForTimeout(700);
    check(await pg.$$eval('.tt-slot-them .tt-flip:not(.is-down)', e => e.length) === 3, 'all three other cards should turn face up');
    await pg.screenshot({ path: `${SHOTS}/online-reveal.png` });
    // the collect: every played card lands somewhere and the counts still add up
    await pg.click('[data-act="next"]');
    await pg.waitForSelector('.tt-status .tt-result.neutral', { timeout: 6000 });
    const total = await pg.evaluate(() => [...document.querySelectorAll('[data-count]')].reduce((t, e) => t + +e.dataset.count, 0) + document.querySelectorAll('.tt-slot .tt-flip').length);
    check(total === room.state.hands.reduce((t, h) => t + h.length, 0), '4-player counts should add up after the collect: ' + total);
    await pg.click('[data-act="leave"]');
    check(left === 1, 'leaving should tell the server');
    check(!errs.length, 'online page errors: ' + errs.join(' | '));
    console.log(`online: room ${room.code}, ${moves.length} move sent, version ${room.version}`);
    await pg.close();
  }

  await b.close();
  console.log(bad ? `${bad} problem(s)` : 'All checks passed');
  process.exit(bad ? 1 : 0);
})();
