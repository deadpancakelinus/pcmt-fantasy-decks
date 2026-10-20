// Checks that Supabase's VP payouts (setup/vp-setup.sql) match the site's own card numbers (tools/league.js).
// Needs a local Postgres you can reach with psql; it builds a throwaway database.
//   node tools/vp-test.js <psql command, e.g. "psql -h /tmp/pg -p 5499 -U postgres"> <built players.js>
const fs = require('fs'), vm = require('vm'), { execFileSync } = require('child_process');
const PSQL = process.argv[2].split(' '), PLAYERS_JS = fs.readFileSync(process.argv[3], 'utf8');
const sql = (q, db = 'vptest') => execFileSync(PSQL[0], PSQL.slice(1).concat(['-d', db, '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1']), { input: q, encoding: 'utf8', maxBuffer: 1 << 28 });
let bad = 0;
const check = (ok, msg) => { console.log((ok ? 'ok   ' : 'FAIL ') + msg); if (!ok) bad++; };

// ---- the site's rules, straight from league.js ----
const LEAGUE = fs.readFileSync(__dirname + '/league.js', 'utf8');
const core = LEAGUE.slice(LEAGUE.indexOf('  function weekStart(t)'), LEAGUE.indexOf('  // ---------- Supabase over plain fetch'));
function siteRules(matches, results) {
  const ctx = { window: {} };
  vm.runInNewContext(PLAYERS_JS.replace(/var (PCMT_SITE_\w+)/g, 'window.$1'), ctx);
  ctx.window.PCMT_MATCHES = matches; ctx.window.PCMT_RESULTS = results;
  vm.runInNewContext('var DAY = 86400000, BUDGET = 100, TEAM_LIMIT = 2, TRANSFERS = 2, LOCK_LEAD_H = 12, ROLES = ["duelist","controller","initiator","sentinel"],' +
    ' SCORING = { kill: 2, assist: 1, death: -1, firstKill: 1, seriesWin: 2, topAcs: 3, topKast: 1 };\n' + core +
    '\nthis.api = { buildWeeks: buildWeeks, scoreManager: scoreManager, weekCardVP: weekCardVP, validDeck: validDeck };', ctx);
  return ctx.api;
}
const P = (() => { const c = { window: {} }; vm.runInNewContext(PLAYERS_JS.replace(/var (PCMT_SITE_\w+)/g, 'window.$1'), c); return c.window.PCMT_SITE_PLAYERS; })();

// ---- random scenarios ----
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const ROLES = ['duelist', 'controller', 'initiator', 'sentinel'];
const role = p => { const r = p.role.split('/')[0]; return r === 'yoru' ? 'duelist' : r; };
function scenario(seed) {
  const R = rng(seed), pick = a => a[Math.floor(R() * a.length)];
  const teams = [...new Set(P.map(p => p.team))];
  const base = Date.parse('2026-10-19T09:00:00Z'), H = 3600000, D = 24 * H;
  const matches = [], results = [];
  for (let w = 0; w < 4; w++) for (let s = 0; s < 1 + Math.floor(R() * 3); s++) {
    const t = new Date(base + w * 7 * D + (3 + R() * 3.5) * D).toISOString().replace('.000', '');
    const a = pick(teams); let b = pick(teams); while (b === a) b = pick(teams);
    matches.push({ region: 'NA', start: t, a, b, bo: 3, hours: 3, url: 'x' });
    if (w < 3 || R() < 0.5) {
      const stats = {};
      P.filter(p => p.team === a || p.team === b).forEach(p => {
        stats[p.id] = [Math.floor(R() * 40), Math.floor(R() * 45), Math.floor(R() * 20), Math.floor(R() * 8), Math.floor(150 + R() * 200), Math.floor(55 + R() * 35)];
      });
      if (R() < 0.4) { const ids = Object.keys(stats); stats[ids[1]][4] = stats[ids[0]][4] = 400; } // tie for top ACS
      stats['~stranger'] = [5, 20, 1, 0, R() < 0.2 ? 999 : 120, 50];                              // not in the store
      results.push({ region: 'NA', start: t, a, b, winner: R() < 0.5 ? a : b, url: 'x', stats });
    }
  }
  function randomDeck() {
    for (let tries = 0; tries < 400; tries++) {
      const slots = {}, used = new Set(), byTeam = {}; let cost = 0;
      const want = []; ROLES.forEach(r => { want.push(r + '-1', r + '-2'); }); want.push('wild-1', 'wild-2', 'wild-3');
      let ok = true;
      for (const k of want) {
        const r = k.startsWith('wild') ? null : k.split('-')[0];
        const pool = P.filter(p => !used.has(p.id) && (!r || role(p) === r) && (byTeam[p.team] || 0) < 2 && !(p.id.startsWith('night') && [...used].some(u => u.startsWith('night'))));
        if (!pool.length) { ok = false; break; }
        const p = pick(pool); slots[k] = p.id; used.add(p.id); byTeam[p.team] = (byTeam[p.team] || 0) + 1; cost += p.price;
      }
      if (ok && cost <= 100) return slots;
    }
    throw new Error('no deck');
  }
  function swap(slots, n) {
    const s = Object.assign({}, slots), keys = Object.keys(s);
    for (let i = 0; i < n; i++) {
      const k = pick(keys), r = k.startsWith('wild') ? null : k.split('-')[0];
      const inDeck = new Set(Object.values(s));
      const pool = P.filter(p => !inDeck.has(p.id) && (!r || role(p) === r));
      s[k] = pick(pool).id;
    }
    return s;
  }
  function breakDeck(slots) {
    const s = Object.assign({}, slots), how = Math.floor(R() * 5);
    if (how === 0) delete s['wild-3'];                                                            // 10 cards
    if (how === 1) { const d = P.find(p => role(p) !== 'duelist'); s['duelist-1'] = d.id; }        // wrong role
    if (how === 2) { const exp = P.slice().sort((x, y) => y.price - x.price); ['wild-1', 'wild-2', 'wild-3'].forEach((k, i) => { s[k] = exp[i].id; }); } // over budget, maybe dupes
    if (how === 3) { s['wild-1'] = 'night'; s['wild-2'] = 'night-emea'; }                          // twin rule
    if (how === 4) s['wild-1'] = 'nobody';                                                           // unknown player
    return s;
  }
  const users = [], decks = [];
  for (let u = 0; u < 14; u++) {
    const id = '00000000-0000-0000-0000-' + String(u + 1).padStart(12, '0');
    users.push(id);
    let cur = randomDeck(), t = base - 2 * D + R() * 3 * D;
    const n = u === 0 ? 0 : 1 + Math.floor(R() * 9); // user 0 never saves a deck
    for (let i = 0; i < n; i++) {
      const roll = R();
      let slots = roll < 0.15 ? breakDeck(cur) : roll < 0.45 ? swap(cur, 1 + Math.floor(R() * 2)) : roll < 0.6 ? swap(cur, 3 + Math.floor(R() * 4)) : roll < 0.7 ? randomDeck() : cur;
      if (roll >= 0.15) cur = slots;
      decks.push({ user_id: id, name: 'Deck ' + u + '.' + i, slots, igl: Object.values(slots)[0], created_at: new Date(t).toISOString() });
      t += R() * 7 * D;
    }
  }
  return { matches, results, users, decks };
}

function expected(sc, now) {
  const api = siteRules(sc.matches, sc.results), weeks = api.buildWeeks(now), out = {};
  sc.users.forEach(u => {
    const subs = sc.decks.filter(d => d.user_id === u).map(d => ({ slots: d.slots, igl: d.igl, name: d.name, t: Date.parse(d.created_at) }));
    api.scoreManager(subs, weeks).forEach(x => { if (x.week.done) out[u + '|' + x.week.key] = api.weekCardVP(x.week, x.deck).total; });
  });
  return out;
}
const dataJs = sc => 'var PCMT_MATCHES = ' + JSON.stringify(sc.matches, null, 2) + ';\n\nvar PCMT_RESULTS = ' + JSON.stringify(sc.results, null, 2) + ';\n';
const lit = s => "'" + String(s).replace(/'/g, "''") + "'";
function ledger() {
  const out = {};
  sql("select user_id || '|' || week || '|' || sum(amount) from public.vp_ledger where kind = 'week' group by user_id, week;").trim().split('\n').filter(Boolean)
    .forEach(l => { const [u, w, a] = l.split('|'); out[u + '|' + w] = +a; });
  return out;
}
function same(a, b) { const keys = new Set(Object.keys(a).concat(Object.keys(b))); const diff = []; keys.forEach(k => { if ((a[k] || 0) !== (b[k] || 0)) diff.push(k + ' site=' + (a[k] || 0) + ' server=' + (b[k] || 0)); }); return diff; }

// ---- database ----
sql('drop database if exists vptest;', 'postgres'); sql('create database vptest;', 'postgres');
sql(`create schema auth; create table auth.users (id uuid primary key, raw_user_meta_data jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;`);
sql(fs.readFileSync(__dirname + '/../setup/supabase-setup.sql', 'utf8'));
const vpSql = fs.readFileSync(__dirname + '/../setup/vp-setup.sql', 'utf8');
sql(vpSql.slice(0, vpSql.indexOf('-- [supabase-only]')));
sql(vpSql.slice(0, vpSql.indexOf('-- [supabase-only]'))); // setup is safe to run twice
sql('alter table public.deck_history disable trigger user;');

let totalWeeks = 0, totalVp = 0;
for (let seed = 1; seed <= 12; seed++) {
  const sc = scenario(seed);
  sql('truncate public.vp_ledger, public.deck_history; delete from auth.users;');
  sql('insert into auth.users (id) values ' + sc.users.map(u => '(' + lit(u) + ')').join(',') + ';');
  if (sc.decks.length) sql('insert into public.deck_history (user_id, name, slots, igl, created_at) values ' +
    sc.decks.map(d => `(${lit(d.user_id)}, ${lit(d.name)}, ${lit(JSON.stringify(d.slots))}::jsonb, ${lit(d.igl)}, ${lit(d.created_at)})`).join(',\n') + ';');
  const call = (s, now, pay = true) => JSON.parse(sql(`select public.vp_ingest(${lit(dataJs(s))}, ${lit(PLAYERS_JS)}, ${lit(new Date(now).toISOString())}, ${pay});`));

  // 1) Mid-season: only finished gameweeks are paid.
  const mid = Date.parse('2026-11-03T10:00:00Z');
  call(sc, mid);
  let d = same(expected(sc, mid), ledger());
  check(!d.length, `seed ${seed}: mid-season payouts match the site (${Object.keys(expected(sc, mid)).length} manager-weeks) ${d.slice(0, 3).join('; ')}`);
  // 2) Running again pays nothing new.
  const again = call(sc, mid);
  check(+again.payouts === 0, `seed ${seed}: second run pays nothing new`);
  // 3) End of season: everything paid, still matching.
  const end = Date.parse('2026-12-01T10:00:00Z');
  call(sc, end);
  const exp = expected(sc, end); d = same(exp, ledger());
  check(!d.length, `seed ${seed}: end-of-season payouts match the site ${d.slice(0, 3).join('; ')}`);
  totalWeeks += Object.keys(exp).length; totalVp += Object.values(exp).reduce((a, b) => a + b, 0);
  // 4) A late result tops up; a removed result never takes VP back.
  const before = ledger();
  const late = JSON.parse(JSON.stringify(sc)); const r0 = late.results[0];
  late.results.push(Object.assign({}, r0, { start: new Date(Date.parse(r0.start) + 3600000).toISOString(), stats: JSON.parse(JSON.stringify(r0.stats)) }));
  call(late, end);
  const exp2 = expected(late, end), after = ledger();
  d = same(Object.fromEntries(Object.keys(Object.assign({}, exp2, before)).map(k => [k, Math.max(exp2[k] || 0, before[k] || 0)])), after);
  check(!d.length, `seed ${seed}: a late result tops payouts up to the new card numbers ${d.slice(0, 3).join('; ')}`);
  const shrunk = JSON.parse(JSON.stringify(sc)); shrunk.results = shrunk.results.slice(1);
  call(shrunk, end);
  const exp3 = expected(shrunk, end);
  d = same(Object.fromEntries(Object.keys(Object.assign({}, exp3, after)).map(k => [k, Math.max(exp3[k] || 0, after[k] || 0)])), ledger());
  check(!d.length, `seed ${seed}: removing a result never takes VP back (it only pays more if a card went up) ${d.slice(0, 3).join('; ')}`);
  const neg = sql('select count(*) from public.vp_ledger where amount <= 0;').trim();
  check(neg === '0', `seed ${seed}: no zero or negative payout lines`);
}
console.log(`checked ${totalWeeks} manager-gameweeks, ${totalVp} VP in total`);

// 5) Players can read only their own VP; nobody can write it.
const u1 = '00000000-0000-0000-0000-000000000002', u2 = '00000000-0000-0000-0000-000000000003';
const own = sql(`grant usage on schema public to authenticated; grant select on public.vp_ledger to authenticated;
set role authenticated; set test.uid = ${lit(u1)}; select count(distinct user_id) || ':' || coalesce(min(user_id::text), '') from public.vp_ledger;`).trim();
check(own === '0:' || own === '1:' + u1, 'a player sees only their own VP lines (' + own + ')');
let blocked = false;
try { sql(`set role authenticated; set test.uid = ${lit(u1)}; insert into public.vp_ledger (user_id, kind, amount) values (${lit(u1)}, 'week', 999);`); } catch (e) { blocked = true; }
check(blocked, 'a player cannot add VP to the ledger');
blocked = false;
try { sql(`set role authenticated; set test.uid = ${lit(u1)}; select public.vp_ingest('', '');`); } catch (e) { blocked = true; }
check(blocked, 'a player cannot run the payout');
// 6) Reading the real site files.
const realData = fs.readFileSync(__dirname + '/../data.js', 'utf8');
const res = JSON.parse(sql(`select public.vp_ingest(${lit(realData)}, ${lit(PLAYERS_JS)}, now(), false);`));
check(Array.isArray(res.weeks), 'reads the real data.js and players.js');
sql('drop database vptest;', 'postgres');
console.log(bad ? bad + ' problem(s)' : 'All VP checks passed');
process.exit(bad ? 1 : 0);
