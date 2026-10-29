/* PCMT Fantasy Decks league layer: Discord sign-in (through Supabase), saved decks, scoring and the leaderboard.
 * Needs data.js (matches + results) and players.js (player list) loaded first.
 * Every page waits on window.PCMT_LEAGUE_READY before it draws (dc-lite.js), then reads the globals set here.
 */
(function () {
  'use strict';
  var SB_URL = 'https://wwrsavqipkxvdsxcemos.supabase.co';
  var SB_KEY = 'sb_publishable_e8v-uyAo4fnvwJCHUVA5FQ_LXR6yYM7';

  // ---------- pages waiting for launch (Oct 24 2026) ----------
  // MVP VS, Store and Library stay hidden until staff press Launch on backend.html (Pages tab), which marks them
  // launched in the site_pages table. Until then links to them are hidden for everyone (staff open them from the
  // backend), and anyone but staff and site admins who opens one is sent to Home. (mvp-vs.html has its own copy.)
  var LAUNCH_PAGES = { 'mvp-vs': ['mvp-vs'], store: ['store', 'transactions', 'collection'], library: ['library'] };
  function launchId(path) {
    var f = String(path || '').split('/').pop().replace(/\.html$/, '');
    for (var id in LAUNCH_PAGES) if (LAUNCH_PAGES[id].indexOf(f) >= 0) return id;
    return null;
  }
  (function () {
    var rules = [], d = document.documentElement;
    Object.keys(LAUNCH_PAGES).forEach(function (id) {
      LAUNCH_PAGES[id].forEach(function (f) { rules.push('html.pcmt-hide-' + id + ' a[href^="' + f + '.html"]:not([data-pcmt-keep])'); });
      d.classList.add('pcmt-hide-' + id);
    });
    var css = document.createElement('style');
    css.textContent = rules.join(',') + '{display:none!important}html.pcmt-gate body{visibility:hidden}';
    (document.head || d).appendChild(css);
    if (launchId(location.pathname)) d.classList.add('pcmt-gate');
  })();
  var pagesReq = null;   // the launch list, read once per page
  function launchList() {
    if (!pagesReq) pagesReq = fetch(SB_URL + '/rest/v1/site_pages?select=id,launched', { headers: { apikey: SB_KEY } })
      .then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
    return pagesReq;
  }
  function launchDecide() {
    return launchList().then(function (rows) {
      var d = document.documentElement, live = {};
      (rows || []).forEach(function (r) { if (r.launched) live[r.id] = true; });   // can't read it: everything stays hidden
      window.PCMT_LAUNCHED = live;
      Object.keys(LAUNCH_PAGES).forEach(function (id) { if (live[id]) d.classList.remove('pcmt-hide-' + id); });
      var here = launchId(location.pathname);
      if (!here || live[here] || window.PCMT_IS_ADMIN || window.PCMT_IS_STAFF) d.classList.remove('pcmt-gate');
      else location.replace('home.html');
    });
  }
  // Deck names: words that aren't allowed. Returns { bad, text } where text has each blocked word replaced by *.
  // Look-alike characters count (0=o, 1=i, 3=e, 4=a, 5=s, $=s, @=a ...), and spacing or dots between letters doesn't hide a word.
  // "ass", "pee" and short NSFW words (cum, sex, anal, dick, cock, rape ...) only count as whole words (or a few common compounds),
  // so class, pass, speed, assassin, document, sussex, canal, peacock, grape are fine. Oct 24 2026: penis and other NSFW words added.
  var PCMT_NAME_LEET = { '0': 'o', '1': 'i', '!': 'i', '|': 'i', '3': 'e', '4': 'a', '@': 'a', '5': 's', '$': 's', '7': 't', '8': 'b' };
  var PCMT_NAME_ANYWHERE = /f+u+c+k+|s+h+i+t+(?!ake)|p+o{2,}p+|p+i+s{2,}|f+a+g{2,}(?:o+t+)?|i+s+r+a+e+l+|p+e+n+i+s+|p+u+s{2,}y+|v+a+g+i+n+a+|d+i+l+d+o+|p+o+r+n+|b+l+o+w+j+o+b+|h+a+n+d+j+o+b+|j+i+z{2,}|c+u+n+t+(?!horpe)|w+h+o+r+e+|s+l+u+t+|n+i+g{2,}(?:e+r+|a+)|b+o{2,}b+|t+i+t{2,}(?:y+|i+e+s+)|t+i+t+s+|h+e+n+t+a+i+|m+a+s+t+u+r+b+a+t+|o+r+g+a+s+m+|b+i+t+c+h+|r+e+t+a+r+d+|n+s+f+w+|x{3,}|m+i+l+f+|n+i+p{2,}l+e+|t+e+s+t+i+c+l+e+|c+o+c+k+s+u+c+k+|c+u+m+s+h+o+t+|b+a+l{2,}s+a+c+k+|s+c+r+o+t+u+m+|c+l+i+t+o+r+i+s+/g;
  var PCMT_NAME_WORDS = [/^a+s{2,}(?:e?s|holes?|hats?|wipes?|clowns?|face)?$/, /^(?:dumb|bad|jack|smart|fat|kick|lame|big|half|hard|wise|dick|stupid)a+s{2,}(?:e?s)?$/, /^p+e{2,}(?:s|d|ing|pee)?$/,
  /^(?:c+o+c+k+s?|d+i+c+k+(?:s|h+e+a+d+s?)?|c+u+m+(?:s|m+i+n+g+)?|s+e+x+(?:y+|u+a+l+)?|a+n+a+l+|a+n+u+s+|h+o+r+n+y+|s+e+m+e+n+|r+a+p+e+(?:s|d)?|r+a+p+i+s+t+s?|n+u+d+e+s?|n+a+k+e+d+|b+o+n+e+r+s?|e+r+e+c+t+i+o+n+s?|t+h+o+t+s?|f+a+p+|h+o+e+s?|c+l+i+t+s?)$/];
  function pcmtCensorName(name) {
    name = String(name == null ? '' : name);
    var letters = '', at = [], spaced = '', hit = {};
    for (var i = 0; i < name.length; i++) {
      var c = name.charAt(i).toLowerCase();
      c = PCMT_NAME_LEET[c] || c;
      var isL = c >= 'a' && c <= 'z';
      if (isL) { letters += c; at.push(i); }
      spaced += isL ? c : ' ';
    }
    var m, k;
    PCMT_NAME_ANYWHERE.lastIndex = 0;
    while ((m = PCMT_NAME_ANYWHERE.exec(letters))) { for (k = 0; k < m[0].length; k++) hit[at[m.index + k]] = true; }
    var word = /[a-z]+/g;
    while ((m = word.exec(spaced))) {
      var w = m[0];
      if (PCMT_NAME_WORDS.some(function (re) { return re.test(w); })) for (k = 0; k < w.length; k++) hit[m.index + k] = true;
    }
    if (/^(?:a+s{2,}|p+e{2,})$/.test(letters)) at.forEach(function (i) { hit[i] = true; });   // "a s s", "p.e.e"
    var bad = Object.keys(hit).length > 0, text = '';
    for (i = 0; i < name.length; i++) text += hit[i] ? '*' : name.charAt(i);
    return { bad: bad, text: text };
  }
  window.PCMT_CENSOR_NAME = pcmtCensorName;
  var TOKEN_KEY = 'pcmt-auth';
  // Transfers are unlimited while the deck is unlocked (Oct 24 2026): change any players until the gameweek locks.
  var BUDGET = 100, TEAM_LIMIT = 2, TRANSFERS = Infinity, LOCK_LEAD_H = 6;
  var ROLES = ['duelist', 'controller', 'initiator', 'sentinel'];
  // Scoring (same as the Guide and setup/vp-setup.sql vp_series_points). toxic = places 1-3 by PCMT.gg's Toxic rating (RT).
  var SCORING = { kill: 1, per5MapKills: 1, assist: 0.5, firstBlood: 0.5, toxic: [3, 2, 1], topKast: 1, topAcs: 2, seriesScore: { '2-0': 2, '3-0': 3, '3-1': 1 }, mapWin: 1,
                  fourK: 1, fiveK: 3, flawless: 7, shutout: -5, zeroKillMap: -5, winBy4: 1, winBy10: 2, per50Adr: 1 };
  // 4Ks and 5Ks (entered on the backend) count from this gameweek on.
  var MULTI_FROM = Date.parse('2026-10-19T09:00:00Z');
  var DAY = 86400000;

  // ---------- defaults so pages always have something to read ----------
  window.PCMT_AUTH = { signedIn: false, name: '', initial: '?', label: 'Log in with Discord', href: 'login.html', avatar: '' };
  window.PCMT_LEAGUE_VALS = { total: '0', rank: '—', rankLabel: 'Rank —' };

  // ---------- small helpers ----------
  function weekStart(t) {
    var local = new Date(t - 4 * 3600000);
    var dow = (local.getUTCDay() + 6) % 7;
    var b = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - dow, 9);
    if (b > t) b -= 7 * DAY;
    return b;
  }
  function weekKey(b) { return new Date(b).toISOString().slice(0, 10); }
  function role(p) { var r = String(p.role || '').split('/')[0]; return r === 'yoru' ? 'duelist' : r; }
  var PLAYERS = window.PCMT_SITE_PLAYERS || [];
  var BY_ID = {};
  PLAYERS.forEach(function (p) { BY_ID[p.id] = p; });
  // Prices: players.js has the starting price; price changes made on the PCMT Team backend (player_price_changes)
  // are loaded below. A deck's budget is checked with the prices from when it was saved (same as the VP payout).
  var BASE_PRICE = {}, PRICE_LOG = [];   // PRICE_LOG: [{ player, price (null = back to players.js), t }], oldest first
  PLAYERS.forEach(function (p) { BASE_PRICE[p.id] = p.price; });
  function priceAt(id, t) {
    var v = BASE_PRICE[id];
    for (var i = 0; i < PRICE_LOG.length && PRICE_LOG[i].t <= t; i++) if (PRICE_LOG[i].player === id) v = PRICE_LOG[i].price == null ? BASE_PRICE[id] : PRICE_LOG[i].price;
    return v;
  }
  var TWIN = window.PCMT_SITE_TWIN || {};
  var CHAMPS = window.PCMT_SITE_CHAMPS || {};
  var LOWEST = {};
  (function () {
    var min = {};
    PLAYERS.forEach(function (p) { if (min[p.team] == null || p.price < min[p.team]) min[p.team] = p.price; });
    PLAYERS.forEach(function (p) { if (p.price === min[p.team]) LOWEST[p.id] = true; });
  })();

  // One series: { <player id>: points }. r.stats[id] = [K, D, A, FK, ACS, KAST, ADR, RT] (series totals),
  // r.maps = [{ map, a: rounds won by team a, b: rounds won by team b, k: { <player id>: kills on that map } }],
  // r.multi[id] = [4Ks, 5Ks].
  function seriesPoints(r) {
    var out = {}, S = SCORING, st = r.stats || {}, ids = Object.keys(st), maps = r.maps || [];
    var num = function (x) { return +x || 0; }, has = function (x) { return x != null && x !== ''; };
    var mk = (Date.parse(r.start) >= MULTI_FROM && r.multi) || {};
    var top = function (i) { return Math.max.apply(null, ids.map(function (k) { return num(st[k][i]); })); };
    var topAcs = top(4), topKast = top(5);
    var rts = ids.filter(function (k) { return has(st[k][7]); }).map(function (k) { return +st[k][7]; });
    var won = { a: 0, b: 0 };
    maps.forEach(function (m) { if (num(m.a) > num(m.b)) won.a++; else if (num(m.b) > num(m.a)) won.b++; });
    var ws = r.winner === r.a ? 'a' : r.winner === r.b ? 'b' : null;   // series score bonus for the winners: 2-0, 3-0, 3-1
    var seriesBonus = ws ? S.seriesScore[won[ws] + '-' + won[ws === 'a' ? 'b' : 'a']] || 0 : 0;
    ids.forEach(function (k) {
      var x = st[k], p = BY_ID[k];
      if (!p) return; // not in the store
      var side = p.team === r.a ? 'a' : p.team === r.b ? 'b' : null;
      var pts = num(x[0]) * S.kill + num(x[2]) * S.assist + num(x[3]) * S.firstBlood;   // deaths don't score
      pts += Math.floor(num(x[6]) / 50) * S.per50Adr;
      if (has(x[7])) pts += S.toxic[rts.filter(function (v) { return v > +x[7]; }).length] || 0;   // ties share the place
      if (num(x[4]) === topAcs) pts += S.topAcs;   // ties: every tied player gets it
      if (num(x[5]) === topKast) pts += S.topKast;
      maps.forEach(function (m) {
        var mkills = m.k ? m.k[k] : null;
        if (has(mkills)) { pts += Math.floor(num(mkills) / 5) * S.per5MapKills; if (num(mkills) === 0) pts += S.zeroKillMap; }
        if (!side) return;
        var mine = num(m[side]), theirs = num(m[side === 'a' ? 'b' : 'a']), diff = mine - theirs;
        if (diff > 0) {
          pts += S.mapWin;
          if (theirs === 0) pts += S.flawless; else if (diff >= 10) pts += S.winBy10; else if (diff >= 4) pts += S.winBy4;
        } else if (diff < 0 && mine === 0) pts += S.shutout;
      });
      if (side && p.team === r.winner) pts += seriesBonus;
      var c = mk[k];
      if (c) pts += num(c[0]) * S.fourK + num(c[1]) * S.fiveK;
      out[k] = pts;
    });
    return out;
  }

  // A deck counts only if it follows every rule.
  function deckIds(slots) { return Object.keys(slots || {}).map(function (k) { return slots[k]; }); }
  function validDeck(slots, t) {
    if (t == null) t = Date.now();
    if (!slots || typeof slots !== 'object') return false;
    var keys = Object.keys(slots), ids = deckIds(slots);
    if (ids.length !== ROLES.length * 2 + 3) return false;
    var seen = {}, cost = 0, teams = {};
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i], id = slots[k], p = BY_ID[id];
      if (!p || seen[id] || (TWIN[id] && seen[TWIN[id]])) return false;
      seen[id] = true;
      var m = /^(duelist|controller|initiator|sentinel)-(1|2)$/.exec(k);
      if (m) { if (role(p) !== m[1]) return false; }
      else if (!/^wild-(1|2|3)$/.test(k)) return false;
      cost += priceAt(id, t);
      teams[p.team] = (teams[p.team] || 0) + 1;
      if (teams[p.team] > TEAM_LIMIT) return false;
    }
    return cost <= BUDGET + 1e-9;
  }
  function transfersBetween(prevSlots, slots) {
    if (!prevSlots) return 0;
    var prev = {};
    deckIds(prevSlots).forEach(function (id) { prev[id] = true; });
    return deckIds(slots).filter(function (id) { return !prev[id]; }).length;
  }

  // ---------- gameweeks from the schedule and results ----------
  function buildWeeks(now) {
    var starts = [];
    (window.PCMT_MATCHES || []).concat(window.PCMT_RESULTS || []).forEach(function (m) { var t = Date.parse(m.start); if (!isNaN(t)) starts.push(t); });
    var weeks = {};
    starts.forEach(function (t) {
      var b = weekStart(t), w = weeks[b] || (weeks[b] = { b: b, e: b + 7 * DAY, key: weekKey(b), first: t, results: [] });
      if (t < w.first) w.first = t;
    });
    (window.PCMT_RESULTS || []).forEach(function (r) { var t = Date.parse(r.start); if (!isNaN(t)) weeks[weekStart(t)].results.push(r); });
    return Object.keys(weeks).map(function (k) { var w = weeks[k]; w.lockAt = w.first - LOCK_LEAD_H * 3600000; w.done = now >= w.e; w.locked = now >= w.lockAt; return w; })
      .sort(function (a, b) { return a.b - b.b; });
  }

  // For each manager: the points each gameweek scored (Oct 29 2026: decks lock per game).
  // Every series is scored with the manager's last valid deck saved before that series' lock (6 h before it starts);
  // with none, the deck they had before counts again. A week with no results yet still notes the deck in effect at
  // its first lock. Entry: { week, deck (the last deck used), pts (IGL x1.5), byTeam, cards: { <player id>: points } }.
  function scoreManager(subs, weeks) {
    subs = subs.slice().sort(function (a, b) { return a.t - b.t; });
    function latest(before) {
      for (var i = subs.length - 1; i >= 0; i--) if (subs[i].t < before && validDeck(subs[i].slots, subs[i].t)) return subs[i];
      return null;
    }
    var prev = null, out = [];
    weeks.forEach(function (w) {
      if (!w.locked) return;
      var used = null, pts = 0, byTeam = {}, cards = {}, champWin = false, missedWin = false;
      var rs = w.results.slice().sort(function (a, b) { return Date.parse(a.start) - Date.parse(b.start); });
      if (!rs.length) { used = latest(w.lockAt) || prev; if (!used) return; prev = used; }
      rs.forEach(function (r) {
        var use = latest(Date.parse(r.start) - LOCK_LEAD_H * 3600000) || prev;
        if (!use) return;
        prev = used = use;
        var sp = seriesPoints(r);
        deckIds(use.slots).forEach(function (id) {
          var p = BY_ID[id], base = sp[id] || 0;
          pts += base * (id === use.igl ? 1.5 : 1);
          byTeam[p.team] = (byTeam[p.team] || 0) + base;
          cards[id] = (cards[id] || 0) + base;
          if (p.team === r.winner && CHAMPS[id]) champWin = true;
          if (p.team === r.winner && LOWEST[id]) missedWin = true;
        });
      });
      if (!used) return;
      out.push({ week: w, deck: used, pts: Math.round(pts * 10) / 10, byTeam: byTeam, cards: cards, champWin: champWin, missedWin: missedWin });
    });
    return out;
  }

  // VP for one gameweek (an entry from scoreManager): each player's points from the series they were in your deck for,
  // no IGL bonus, a card below zero counts as 0. Supabase pays the same amount when the gameweek ends (setup/vp-setup.sql).
  function weekCardVP(entry) {
    var cards = {}, total = 0;
    Object.keys(entry.cards || {}).forEach(function (id) { var v = Math.max(0, entry.cards[id]); cards[id] = v; total += v; });
    return { total: Math.round(total), cards: cards };   // paid in whole Credits
  }

  // ---------- Supabase over plain fetch ----------
  var session = null;
  function readSession() { try { return JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null'); } catch (e) { return null; } }
  function writeSession(s) { session = s; try { if (s) localStorage.setItem(TOKEN_KEY, JSON.stringify(s)); else localStorage.removeItem(TOKEN_KEY); } catch (e) {} }
  function headers(extra) {
    var h = { apikey: SB_KEY, 'Content-Type': 'application/json' };
    if (session && session.access_token) h.Authorization = 'Bearer ' + session.access_token;
    return Object.assign(h, extra || {});
  }
  // Lists: the API returns at most 1,000 rows per request, so read them in pages until a page comes back empty.
  // Each list needs a stable order (an order= in the path) so pages don't overlap.
  function apiAll(path) {
    var base = path.replace(/([?&])limit=\d+(&|$)/, '$1').replace(/[?&]$/, ''), sep = base.indexOf('?') >= 0 ? '&' : '?', out = [];
    function next(off, n) {
      return api(base + sep + 'limit=1000&offset=' + off).then(function (rows) {
        rows = Array.isArray(rows) ? rows : [];
        out = out.concat(rows);
        return rows.length && n < 200 ? next(off + rows.length, n + 1) : out;
      });
    }
    return next(0, 0);
  }
  function api(path, opts) {
    opts = opts || {};
    return fetch(SB_URL + path, { method: opts.method || 'GET', headers: headers(opts.headers), body: opts.body ? JSON.stringify(opts.body) : undefined, keepalive: !!opts.keepalive })
      .then(function (res) {
        return res.text().then(function (txt) {
          var data = null; try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = txt; }
          if (!res.ok) { var err = new Error((data && (data.message || data.msg || data.error_description)) || ('Request failed (' + res.status + ')')); err.status = res.status; throw err; }
          return data;
        });
      });
  }
  // Discord display name first, then the username; skip names with no letters or numbers (like "...").
  function pickName(md) {
    var c = [md.custom_claims && md.custom_claims.global_name, md.full_name, md.name, md.user_name, md.preferred_username];
    for (var i = 0; i < c.length; i++) {
      var n = String(c[i] || '').replace(/#0$/, '').trim();
      if (/[\p{L}\p{N}]/u.test(n)) return n.slice(0, 40);
    }
    return 'Manager';
  }
  function takeRedirectTokens() {
    var h = location.hash || '';
    if (h.indexOf('access_token=') < 0) {
      if (/error_description=/.test(h)) { var q0 = new URLSearchParams(h.slice(1)); window.PCMT_LOGIN_ERROR = q0.get('error_description'); history.replaceState(null, '', location.pathname + location.search); }
      return;
    }
    var q = new URLSearchParams(h.slice(1));
    writeSession({ access_token: q.get('access_token'), refresh_token: q.get('refresh_token'), expires_at: Date.now() + (+q.get('expires_in') || 3600) * 1000 });
    history.replaceState(null, '', location.pathname + location.search);
  }
  function refreshIfNeeded() {
    if (!session) return Promise.resolve();
    if (session.expires_at - Date.now() > 120000) return Promise.resolve();
    return fetch(SB_URL + '/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: { apikey: SB_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: session.refresh_token }) })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (d && d.access_token) writeSession({ access_token: d.access_token, refresh_token: d.refresh_token, expires_at: Date.now() + (d.expires_in || 3600) * 1000 }); else writeSession(null); })
      .catch(function () {});
  }

  // ---------- toast ----------
  function toast(msg) {
    var el = document.getElementById('pcmt-toast');
    if (!el) {
      el = document.createElement('div'); el.id = 'pcmt-toast'; el.setAttribute('role', 'status');
      el.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483600;max-width:min(560px,calc(100% - 32px));padding:14px 18px;border-radius:10px;background:#172124;border:1px solid #a5dcdd;color:#eaf4f4;font:500 14px/1.45 "Space Grotesk",system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.6);transition:opacity .3s;';
      document.body.appendChild(el);
    }
    el.textContent = msg; el.style.opacity = '1';
    clearTimeout(toast.t); toast.t = setTimeout(function () { el.style.opacity = '0'; }, 5000);
  }

  // ---------- the league API used by the pages ----------
  var me = null, mySubs = [], myScored = [], lastSubmitted = null, submitting = false, pendingDeck = null, pendingTimer = null, sendAgain = false;
  var L = window.PCMT_LEAGUE = {
    get signedIn() { return !!me; },
    get myId() { return me ? me.id : null; },
    api: function (path, opts) { return refreshIfNeeded().then(function () { return api(path, opts); }); },
    apiAll: function (path) { return refreshIfNeeded().then(function () { return apiAll(path); }); },
    // Puts an owned Rare (or rarer) card in your MVP VS deck, or takes it out (Library page).
    setInDeck: function (cardId, on) {
      if (!me) return Promise.reject(new Error('Log in with Discord first.'));
      return refreshIfNeeded().then(function () { return api('/rest/v1/rpc/set_card_in_deck', { method: 'POST', body: { p_card: cardId, p_on: !!on } }); }).then(function (r) {
        window.PCMT_MY_IN_DECK = window.PCMT_MY_IN_DECK || {};
        if (r) window.PCMT_MY_IN_DECK[cardId] = true; else delete window.PCMT_MY_IN_DECK[cardId];
        return r;
      });
    },
    // Saves a Pick'ems pick (winner = team code, null clears it). The server checks the lock, the teams and the score.
    savePick: function (event, series, winner, win, lose) {
      if (!me) return Promise.reject(new Error('Log in with Discord to make picks.'));
      return refreshIfNeeded().then(function () {
        return api('/rest/v1/rpc/save_pick', { method: 'POST', body: { p_event: event, p_series: series, p_winner: winner, p_win: win == null ? null : win, p_lose: lose == null ? null : lose } });
      }).then(function () {
        var mine = window.PCMT_MY_PICKS[event] = window.PCMT_MY_PICKS[event] || {};
        if (winner) mine[series] = { winner: winner, win: win, lose: lose }; else delete mine[series];
      });
    },
    // Saves your whole Pick'ems bracket at once: picks = { <series n>: <team code> }. Replaces your earlier picks.
    saveBracket: function (event, picks) {
      if (!me) return Promise.reject(new Error('Log in with Discord to save your picks.'));
      return refreshIfNeeded().then(function () {
        return api('/rest/v1/rpc/save_bracket', { method: 'POST', body: { p_event: event, p_picks: picks } });
      }).then(function () {
        var mine = window.PCMT_MY_PICKS[event] = {};
        Object.keys(picks).forEach(function (n) { mine[n] = { winner: picks[n] }; });
      });
    },
    // Buys a card pack on the server (it checks the price and your VP, then draws the cards).
    // Resolves to { pack, price, balance, cards: [{ id, player, variant, rarity, region, count, new }] }.
    buyPack: function (packId) {
      if (!me) return Promise.reject(new Error('Log in with Discord to buy packs.'));
      return refreshIfNeeded().then(function () { return api('/rest/v1/rpc/buy_pack', { method: 'POST', body: { p_pack: packId } }); }).then(function (r) {
        (r.cards || []).forEach(function (c) { window.PCMT_MY_CARDS[c.id] = c.count; });
        if (window.PCMT_VP) window.PCMT_VP.balance = String(r.balance);
        return r;
      }, function (e) {
        if (e && e.message) e.message = e.message.replace(/\bVP\b/g, 'Credits');   // older server wording
        throw e;
      });
    },
    signIn: function (page) {
      var back = location.origin + location.pathname.replace(/[^/]*$/, '') + (typeof page === 'string' ? page : 'index.html');
      location.href = SB_URL + '/auth/v1/authorize?provider=discord&redirect_to=' + encodeURIComponent(back);
    },
    // Deletes your account and everything saved with it (server: delete_my_account), then logs you out on this device.
    deleteAccount: function () {
      if (!me) return Promise.reject(new Error('Log in with Discord first.'));
      return refreshIfNeeded().then(function () { return api('/rest/v1/rpc/delete_my_account', { method: 'POST', body: {} }); }).then(function () {
        try { Object.keys(localStorage).forEach(function (k) { if (/^pcmt/.test(k)) localStorage.removeItem(k); }); } catch (e) {}
        writeSession(null); me = null;
      });
    },
    signOut: function () {
      var done = function () { writeSession(null); location.href = 'index.html'; };
      if (!session) return done();
      fetch(SB_URL + '/auth/v1/logout', { method: 'POST', headers: headers() }).then(done, done);
    },
    // Deck from the current week's rules point of view: what you had when the last gameweek locked.
    lastLockedDeck: function () {
      var scored = myScored.filter(function (x) { return x.week.locked; });
      return scored.length ? scored[scored.length - 1].deck : null;
    },
    transfersUsed: function (slots) { var base = L.lastLockedDeck(); return base ? transfersBetween(base.slots, slots) : 0; },
    canLockIn: function (s) {
      if (!me) { toast('Log in with Discord to enter your deck in the league. Your deck is kept on this device until then.'); return true; }
      return true;
    },
    statusNote: function (slots, text, locked) {
      if (!me || locked) return text;
      var base = L.lastLockedDeck();
      if (!base) return text;
      return text;   // transfers are unlimited, so there's no count to show
    },
    // Called whenever The Deck saves; sends a locked-in deck to the league.
    // Waits until edits (like typing the deck name) settle, then always sends the latest version.
    onDeck: function (s) {
      if (!me || !s.saved) return;
      var d = { slots: s.slots || {}, igl: s.igl || null, name: s.squadName || '' };
      if (pcmtCensorName(d.name).bad) d.name = '';   // never send a name that isn't allowed (the server refuses it too)
      if (JSON.stringify(d) === lastSubmitted && !submitting) { pendingDeck = null; clearTimeout(pendingTimer); return; }
      pendingDeck = d;
      clearTimeout(pendingTimer);
      pendingTimer = setTimeout(function () { sendDeck(false); }, 700);
    },
    // Sends a comment or complaint from the Home page (up to 50 words; logged out is fine). Staff read them on backend.html.
    complain: function (text) {
      return refreshIfNeeded().then(function () { return api('/rest/v1/rpc/submit_complaint', { method: 'POST', body: { p_body: text } }); });
    },
    redeem: function (code) {
      if (!me) return Promise.reject(new Error('Log in with Discord to redeem codes.'));
      return api('/rest/v1/rpc/redeem_code', { method: 'POST', body: { p_code: code } }).then(function (u) {
        (u || []).forEach(function (k) { if (window.PCMT_SERVER_UNLOCKS.indexOf(k) < 0) window.PCMT_SERVER_UNLOCKS.push(k); });
        return u || [];
      });
    },
    toast: toast
  };
  window.PCMT_SERVER_UNLOCKS = [];
  function sendDeck(leaving) {
    clearTimeout(pendingTimer);
    var d = pendingDeck;
    if (!d || !me) return;
    if (submitting) { sendAgain = true; return; }
    var json = JSON.stringify(d);
    pendingDeck = null;
    if (json === lastSubmitted || !validDeck(d.slots)) return;
    var prev = lastSubmitted ? JSON.parse(lastSubmitted) : null;
    var nameOnly = prev && JSON.stringify(prev.slots) === JSON.stringify(d.slots) && prev.igl === d.igl;
    submitting = true;
    api('/rest/v1/deck_history', { method: 'POST', keepalive: !!leaving, headers: { Prefer: 'return=minimal' }, body: { user_id: me.id, slots: d.slots, igl: d.igl, name: d.name } })
      .then(function () { lastSubmitted = json; if (!leaving) toast(nameOnly ? 'Deck name saved.' : 'Deck entered in the league.'); })
      .catch(function (e) { if (!pendingDeck) pendingDeck = d; toast('Couldn\'t save your deck: ' + e.message); })
      .then(function () { submitting = false; if (sendAgain) { sendAgain = false; sendDeck(false); } });
  }
  window.addEventListener('pagehide', function () { sendDeck(true); });
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') sendDeck(true); });

  // ---------- VP for the Collection page ----------
  function fmtWhen(t) {
    try { return new Date(t).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }); }
    catch (e) { return new Date(t).toUTCString(); }
  }
  function fmtDay(key) { return new Date(key + 'T12:00:00Z').toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }); }
  function buildVP(lines, weeks, scored, curB) {
    var ready = Array.isArray(lines), balance = 0, earned = 0, byWeek = {}, paidByWeek = {}, spent = [];
    (lines || []).forEach(function (l) {
      balance += l.amount;
      if (l.amount > 0) earned += l.amount;
      if (l.kind === 'week' && l.week) {
        paidByWeek[l.week] = (paidByWeek[l.week] || 0) + l.amount;
        var h = byWeek[l.week] || (byWeek[l.week] = { week: l.week, vp: 0, deck: '' });
        h.vp += l.amount;
        if (!h.deck && l.detail && l.detail.deck) h.deck = l.detail.deck;
      }
      if (l.kind === 'pickem') {
        var pd = l.detail || {}, day = new Date(l.created_at).toISOString().slice(0, 10);
        byWeek['p' + day + (pd.event || '') + (pd.series || '')] = { week: day, vp: l.amount, deck: (pd.label || 'Series') + (pd.exact ? ' (exact score)' : ''), label: 'Pick\u2019ems \u00b7 ' + fmtDay(day) };
      }
      if (l.amount < 0) spent.push({ date: new Date(l.created_at).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' }), pack: (l.detail && (l.detail.pack || l.detail.name)) || 'Card pack', vp: String(-l.amount) });
    });
    var history = Object.keys(byWeek).sort(function (a, b) { var x = byWeek[a].week, y = byWeek[b].week; return x < y ? 1 : x > y ? -1 : 0; }).map(function (k) {
      var h = byWeek[k];
      return { label: h.label || 'Week of ' + fmtDay(k), deck: h.deck || '—', vp: String(h.vp) };
    });
    var cw = weeks.filter(function (w) { return w.b === curB; })[0], week = { vp: '0', state: 'nomatch', note: 'No matches are scheduled this gameweek yet.' };
    if (cw && !cw.locked) week = { vp: '0', state: 'open', note: 'Your deck locks ' + fmtWhen(cw.lockAt) + '. Credits start counting from then.' };
    else if (cw) {
      var mine = scored.filter(function (x) { return x.week.b === cw.b; })[0];
      week = mine
        ? { vp: String(weekCardVP(mine).total), state: 'live', note: 'So far from the deck you locked in. Paid ' + fmtWhen(cw.e) + ', when your cards reset.' }
        : { vp: '0', state: 'nodeck', note: 'No deck counted this gameweek. Lock one in on The Deck before the next gameweek locks.' };
    }
    var lastDone = weeks.filter(function (w) { return w.done; }).pop();
    var lastPay = lastDone ? (paidByWeek[lastDone.key] || 0) : 0;
    var arriving = 0;
    if (ready) scored.forEach(function (x) { if (x.week.done) arriving += Math.max(0, weekCardVP(x).total - (paidByWeek[x.week.key] || 0)); });
    return { signedIn: true, ready: ready, balance: String(balance), lastPay: String(lastPay), earned: String(earned), history: history, spent: spent, week: week, arriving: arriving };
  }
  window.PCMT_PACKS = []; window.PCMT_MY_CARDS = {}; window.PCMT_CARD_CATALOG = [];
  window.PCMT_IS_STAFF = false; window.PCMT_MY_PICKS = {}; window.PCMT_PICKEM_EVENTS = {}; window.PCMT_PICKEM_STANDINGS = {};
  window.PCMT_VP = { signedIn: false, ready: true, balance: '0', lastPay: '0', earned: '0', history: [], spent: [], week: { vp: '0', state: 'out', note: '' }, arriving: 0 };

  // Series key used by the multikills table: start|a|b, exactly as in data.js.
  function seriesKey(m) { return m.start + '|' + m.a + '|' + m.b; }
  function attachMulti(rows) {
    var by = {};
    (rows || []).forEach(function (x) {
      var v = [x.k4 || 0, x.k5 || 0];
      if (v.some(Boolean)) (by[x.series] = by[x.series] || {})[x.player] = v;
    });
    (window.PCMT_RESULTS || []).forEach(function (r) { r.multi = by[seriesKey(r)] || {}; });
  }
  window.PCMT_SERIES_KEY = seriesKey;

  // ---------- load everything, then let the page draw ----------
  function load() {
    launchList();
    takeRedirectTokens();
    session = readSession();
    var now = Date.now();
    return refreshIfNeeded().then(function () {
      var who = session ? api('/auth/v1/user').catch(function () { writeSession(null); return null; }) : Promise.resolve(null);
      return who;
    }).then(function (user) {
      if (user && user.id) {
        var md = user.user_metadata || {};
        var name = pickName(md);
        me = { id: user.id, name: name, avatar: md.avatar_url || '' };
        window.PCMT_AUTH = { signedIn: true, name: name, initial: name.charAt(0).toUpperCase(), label: name, href: 'login.html', avatar: me.avatar };
        api('/rest/v1/profiles', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: { id: me.id, name: name, avatar_url: me.avatar, updated_at: new Date().toISOString() } }).catch(function () {});
      }
      // Every saved deck, names, 4Ks/5Ks and Credits are only needed where decks are scored (The Deck, the Leaderboard,
      // Customization's unlocks, the Store's paychecks). Other pages skip them so they load fast and use less data.
      var tree = (document.getElementById('dc-tree') || {}).textContent || '';
      var needDecks = /"data-pcmt-root":"(Main|Leaderboard|Customization|Store)"/.test(tree);
      var decks = !needDecks ? Promise.resolve([]) : apiAll('/rest/v1/deck_history?select=user_id,name,slots,igl,created_at&order=created_at.asc,id.asc').catch(function () { return []; });
      var profiles = !needDecks ? Promise.resolve([]) : apiAll('/rest/v1/profiles?select=id,name&order=id').catch(function () { return []; });
      var unlocks = me ? api('/rest/v1/user_unlocks?select=unlock').catch(function () { return []; }) : Promise.resolve([]);
      // null = the VP table isn't set up yet (setup/vp-setup.sql not run)
      // 4Ks and 5Ks per series (public; empty until setup/vp-setup.sql has been run)
      var multi = !needDecks ? Promise.resolve([]) : apiAll('/rest/v1/multikills?select=series,player,k4,k5&order=series,player').catch(function () { return []; });
      var prices = apiAll('/rest/v1/player_price_changes?select=player,price,changed_at&order=changed_at.asc,id.asc').catch(function () { return []; });
      var vp = me && needDecks ? apiAll('/rest/v1/vp_ledger?select=kind,week,amount,detail,created_at&order=created_at.desc,id.desc').catch(function () { return null; }) : Promise.resolve([]);
      var admin = me ? api('/rest/v1/pcmt_admins?select=user_id&user_id=eq.' + me.id).catch(function () { return []; }) : Promise.resolve([]);
      // Card packs for sale (public) and the cards you own (empty until setup/cards-setup.sql has been run)
      // (season: throwback packs and past-season cards; falls back to the older columns until setup/cards-setup.sql is re-run)
      var packs = api('/rest/v1/card_packs?select=id,name,region,season,cards,odds,price,active,open_to_all&active=is.true&order=id')
        .catch(function () { return api('/rest/v1/card_packs?select=id,name,region,cards,odds,price,active,open_to_all&active=is.true&order=id'); }).catch(function () { return []; });
      var mine = me ? apiAll('/rest/v1/user_cards?select=card_id,count,in_deck&order=card_id').catch(function () { return apiAll('/rest/v1/user_cards?select=card_id,count&order=card_id'); }).catch(function () { return []; }) : Promise.resolve([]);
      var onLibrary = /"data-pcmt-root":"Library"/.test((document.getElementById('dc-tree') || {}).textContent || ''); // not the address: the site serves /library as well as /library.html
      var catalog = onLibrary ? apiAll('/rest/v1/cards?select=id,player,variant,rarity,region,season,title&order=id')
        .catch(function () { return apiAll('/rest/v1/cards?select=id,player,variant,rarity,region,title&order=id'); }).catch(function () { return []; }) : Promise.resolve([]);
      // Released Rare-and-up cards, so the Store shows the odds a pack can really drop (null = not known yet)
      var onStore = /"data-pcmt-root":"Store"/.test((document.getElementById('dc-tree') || {}).textContent || '');
      var released = onStore ? apiAll('/rest/v1/cards?select=region,season,rarity&active=is.true&released=is.true&rarity=neq.common&order=id').catch(function () { return null; }) : Promise.resolve(null);
      // Pick'ems page: who may see it while it's closed, your picks, the standings and each bracket's settings
      var onPickems = /"data-pcmt-root":"Pickems"/.test((document.getElementById('dc-tree') || {}).textContent || '');
      var staff = me ? api('/rest/v1/rpc/is_freshbatch', { method: 'POST', body: {} }).catch(function () { return false; }) : Promise.resolve(false);
      var picks = me && onPickems ? api('/rest/v1/pickem_picks?select=event,series,winner,win_maps,lose_maps&limit=1000').catch(function () { return []; }) : Promise.resolve([]);
      var pkEvents = onPickems ? api('/rest/v1/pickem_events?select=id,open,credits_win,credits_exact,lock_at').catch(function () { return api('/rest/v1/pickem_events?select=id,open,credits_win,credits_exact'); }).catch(function () { return []; }) : Promise.resolve([]);
      var pkBoard = onPickems ? Promise.all((window.PCMT_PICKEMS || []).map(function (b) {
        return api('/rest/v1/rpc/pickem_standings', { method: 'POST', body: { p_event: b.id } }).then(function (r) { return [b.id, r || []]; }, function () { return [b.id, []]; });
      })) : Promise.resolve([]);
      // Players taken out of The Deck's store on the backend
      var onMain = /"data-pcmt-root":"Main"/.test(tree);
      var removed = onMain ? apiAll('/rest/v1/store_removed_players?select=player&order=player').catch(function () { return []; }) : Promise.resolve([]);
      return Promise.all([decks, profiles, unlocks, vp, multi, admin, packs, mine, catalog, prices, released, staff, picks, pkEvents, pkBoard, removed]);
    }).then(function (res) {
      attachMulti(res[4] || []);
      PRICE_LOG = (res[9] || []).map(function (c) { return { player: c.player, price: c.price == null ? null : +c.price, t: Date.parse(c.changed_at) }; });
      // Today's prices everywhere on the site (The Deck, packs, budget): window.PCMT_PRICES = { <player id>: price }
      window.PCMT_PRICES = {};
      PLAYERS.forEach(function (p) { p.price = priceAt(p.id, Infinity); window.PCMT_PRICES[p.id] = p.price; });
      window.PCMT_BASE_PRICES = BASE_PRICE;
      window.PCMT_REMOVED_PLAYERS = {};
      (res[15] || []).forEach(function (r) { window.PCMT_REMOVED_PLAYERS[r.player] = true; });
      window.PCMT_IS_ADMIN = !!(res[5] && res[5].length);
      window.PCMT_PACKS = res[6] || [];
      window.PCMT_MY_CARDS = {};
      window.PCMT_CARD_CATALOG = res[8] || [];
      window.PCMT_RELEASED_RARES = res[10] || null;
      window.PCMT_IS_STAFF = res[11] === true;
      window.PCMT_MY_PICKS = {};
      (res[12] || []).forEach(function (p) { (window.PCMT_MY_PICKS[p.event] = window.PCMT_MY_PICKS[p.event] || {})[p.series] = { winner: p.winner, win: p.win_maps, lose: p.lose_maps }; });
      window.PCMT_PICKEM_EVENTS = {};
      (res[13] || []).forEach(function (e) { window.PCMT_PICKEM_EVENTS[e.id] = e; });
      window.PCMT_PICKEM_STANDINGS = {};
      (res[14] || []).forEach(function (x) { window.PCMT_PICKEM_STANDINGS[x[0]] = x[1].map(function (r) { return { id: r.user_id, name: r.name, points: r.points, correct: r.correct, exact: r.exact, picked: r.picked, me: !!me && r.user_id === me.id }; }); });
      window.PCMT_MY_IN_DECK = {};   // Rares picked for the MVP VS deck (Library page)
      (res[7] || []).forEach(function (c) { window.PCMT_MY_CARDS[c.card_id] = c.count; if (c.in_deck) window.PCMT_MY_IN_DECK[c.card_id] = true; });
      var decks = res[0] || [], profiles = res[1] || [], unlocks = res[2] || [];
      window.PCMT_SERVER_UNLOCKS = unlocks.map(function (u) { return u.unlock; });
      var names = {};
      profiles.forEach(function (p) { names[p.id] = p.name; });
      var subsBy = {};
      decks.forEach(function (d) { (subsBy[d.user_id] = subsBy[d.user_id] || []).push({ slots: d.slots, igl: d.igl, name: d.name, t: Date.parse(d.created_at) }); });
      var weeks = buildWeeks(now), curB = weekStart(now), curKey = weekKey(curB);
      var rows = [], scoredBy = {};
      Object.keys(subsBy).forEach(function (uid) {
        var sc = scoredBy[uid] = scoreManager(subsBy[uid], weeks);
        var w = {};
        sc.forEach(function (x) { w[x.week.key] = x.pts; });
        var latest = sc.length ? sc[sc.length - 1].deck : subsBy[uid][subsBy[uid].length - 1];
        var iglP = latest && BY_ID[latest.igl];
        rows.push({ id: uid, manager: names[uid] || 'Manager', squad: (latest && latest.name) ? pcmtCensorName(latest.name).text : '—', igl: iglP ? iglP.name : '—', weeks: w, me: !!me && uid === me.id });
      });
      window.PCMT_STANDINGS = rows;

      // Overall order (season total) for The Deck's rank and the Champion's Aura.
      function totalUpTo(row, key) { var s = 0; Object.keys(row.weeks).forEach(function (k) { if (k <= key) s += row.weeks[k]; }); return s; }
      var ranked = rows.map(function (r) { return { id: r.id, total: totalUpTo(r, curKey) }; }).sort(function (a, b) { return b.total - a.total; });
      var finished = weeks.filter(function (w) { return w.done; });
      var lastDone = finished.length ? finished[finished.length - 1] : null;
      var aura = { holderId: null, me: me ? me.id : null };
      if (lastDone) {
        var atEnd = rows.map(function (r) { return { id: r.id, t: totalUpTo(r, lastDone.key) }; }).sort(function (a, b) { return b.t - a.t; });
        if (atEnd.length && atEnd[0].t > 0) aura.holderId = atEnd[0].id;
      }
      window.PCMT_AURA_LIVE = aura;
      window.PCMT_WEEK_WINNERS_LIVE = finished.map(function (w) {
        var best = 0, who = [];
        rows.forEach(function (r) { var p = r.weeks[w.key] || 0; if (p > best) { best = p; who = [r.id]; } else if (p === best && p > 0) who.push(r.id); });
        return { week: w.key, winners: best > 0 ? who : [] };
      });
      if (me) {
        mySubs = subsBy[me.id] || [];
        myScored = scoredBy[me.id] || [];
        var mine = ranked.findIndex(function (x) { return x.id === me.id; });
        var myTotal = mine >= 0 ? ranked[mine].total : 0;
        var rank = mine >= 0 ? 1 + ranked.filter(function (x) { return x.total > myTotal; }).length : null;
        window.PCMT_LEAGUE_VALS = { total: String(Math.round(myTotal * 10) / 10), rank: rank ? '#' + rank : '—', rankLabel: rank ? 'Rank #' + rank + ' of ' + ranked.length : 'Rank —' };
        var teamPts = {}, best = 0, champ = false, missed = false, active = 0;
        myScored.forEach(function (x) {
          Object.keys(x.byTeam).forEach(function (t) { teamPts[t] = (teamPts[t] || 0) + x.byTeam[t]; });
          if (x.week.done) { active++; best = Math.max(best, x.pts); }
          if (x.champWin) champ = true;
          if (x.missedWin) missed = true;
        });
        window.PCMT_ME_STATS = { teamPoints: teamPts, activeWeeks: active, bestWeek: best, championWin: champ, missedWin: missed, id: me.id };
        window.PCMT_VP = buildVP(res[3], weeks, myScored, curB);
        var last = mySubs[mySubs.length - 1];
        if (last) { window.PCMT_MY_REMOTE_DECK = { slots: last.slots, igl: last.igl, name: pcmtCensorName(last.name).bad ? '' : last.name, uid: me.id }; lastSubmitted = JSON.stringify({ slots: last.slots || {}, igl: last.igl || null, name: last.name || '' }); }
      }
      if (window.PCMT_LOGIN_ERROR) setTimeout(function () { toast('Discord sign-in didn\'t finish: ' + window.PCMT_LOGIN_ERROR); }, 600);
    }).catch(function (e) { console.warn('league load failed', e); }).then(launchDecide);
  }
  window.PCMT_LEAGUE_READY = load();
})();

/* Credits window: clicking "PCMT" in the footer's "A PCMT product" line opens a glass panel with the team. */
(function () {
  'use strict';
  var NAMES = ['Night', 'Ronnie', 'Toxic', 'Sting', 'Linus', 'Clutch', 'Mark', 'Oddlqt']
    .sort(function (a, b) { return a.toLowerCase() < b.toLowerCase() ? -1 : 1; });
  var css = document.createElement('style');
  css.textContent =
    'footer b.pcmt-credits-link{cursor:pointer;border-bottom:1px dotted #a5dcdd;transition:color .15s}' +
    'footer b.pcmt-credits-link:hover,footer b.pcmt-credits-link:focus-visible{color:#a5dcdd!important;outline:none}' +
    '.pcmt-cr-back{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;' +
    'background:rgba(6,10,12,.45);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);opacity:0;transition:opacity .2s}' +
    '.pcmt-cr-back.on{opacity:1}' +
    '.pcmt-cr{position:relative;width:100%;max-width:420px;box-sizing:border-box;padding:30px 28px 26px;border-radius:20px;color:#eaf4f4;' +
    'background:linear-gradient(145deg,rgba(165,220,221,.16),rgba(255,255,255,.04) 45%,rgba(165,220,221,.07));' +
    'border:1px solid rgba(255,255,255,.18);box-shadow:0 24px 60px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.22);' +
    '-webkit-backdrop-filter:blur(22px) saturate(160%);backdrop-filter:blur(22px) saturate(160%);' +
    'transform:translateY(10px) scale(.98);transition:transform .2s;font-family:"Space Grotesk",system-ui,sans-serif}' +
    '.pcmt-cr-back.on .pcmt-cr{transform:none}' +
    '.pcmt-cr-k{margin:0 0 6px;font:12px "JetBrains Mono",monospace;letter-spacing:.14em;text-transform:uppercase;color:#a5dcdd}' +
    '.pcmt-cr h2{margin:0 0 20px;font:400 34px/1.05 "Cabin Sketch","Space Grotesk",sans-serif;color:#fff}' +
    '.pcmt-cr ul{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:1fr 1fr;gap:8px}' +
    '.pcmt-cr li{padding:11px 14px;border-radius:12px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.1);font-size:16px;font-weight:600}' +
    '.pcmt-cr-f{margin:20px 0 0;font:11px "JetBrains Mono",monospace;color:#93a9aa;text-align:center}' +
    '.pcmt-cr-x{position:absolute;top:14px;right:14px;width:34px;height:34px;border-radius:50%;border:1px solid rgba(255,255,255,.18);' +
    'background:rgba(255,255,255,.08);color:#eaf4f4;font-size:18px;line-height:1;cursor:pointer}' +
    '.pcmt-cr-x:hover,.pcmt-cr-x:focus-visible{background:rgba(165,220,221,.25);outline:none}' +
    '@media (prefers-reduced-motion:reduce){.pcmt-cr-back,.pcmt-cr{transition:none}}';
  (document.head || document.documentElement).appendChild(css);

  var open = null, back = null;
  function isLink(el) { return el && el.tagName === 'B' && el.closest && el.closest('footer') && el.textContent.trim() === 'PCMT'; }
  function mark() {
    var bs = document.querySelectorAll('footer b');
    for (var i = 0; i < bs.length; i++) if (isLink(bs[i]) && !bs[i].classList.contains('pcmt-credits-link')) {
      bs[i].classList.add('pcmt-credits-link'); bs[i].setAttribute('role', 'button'); bs[i].setAttribute('tabindex', '0');
      bs[i].setAttribute('aria-haspopup', 'dialog'); bs[i].title = 'Thank You!';
    }
  }
  function close() {
    if (!open) return;
    var el = open, from = back; open = null; back = null;
    el.classList.remove('on'); setTimeout(function () { el.remove(); }, 200);
    document.removeEventListener('keydown', onKey, true);
    if (from && from.focus) from.focus();
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'Tab') { e.preventDefault(); open.querySelector('.pcmt-cr-x').focus(); }
  }
  function show(from) {
    if (open) return;
    back = from;
    var wrap = document.createElement('div');
    wrap.className = 'pcmt-cr-back';
    wrap.innerHTML = '<div class="pcmt-cr" role="dialog" aria-modal="true" aria-labelledby="pcmt-cr-t">' +
      '<button type="button" class="pcmt-cr-x" aria-label="Close">&times;</button>' +
      '<h2 id="pcmt-cr-t">Thank You!</h2><ul></ul>' +
      '<p class="pcmt-cr-f">fantasy.pcmt.gg · Plat Chat Members Tourney</p></div>';
    var ul = wrap.querySelector('ul');
    NAMES.forEach(function (n) { var li = document.createElement('li'); li.textContent = n; ul.appendChild(li); });
    wrap.addEventListener('click', function (e) { if (e.target === wrap || e.target.closest('.pcmt-cr-x')) close(); });
    document.body.appendChild(wrap);
    open = wrap;
    document.addEventListener('keydown', onKey, true);
    requestAnimationFrame(function () { wrap.classList.add('on'); wrap.querySelector('.pcmt-cr-x').focus(); });
  }
  document.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('b'); if (isLink(b)) { e.preventDefault(); show(b); } });
  document.addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && isLink(e.target)) { e.preventDefault(); show(e.target); } });
  function watch() { mark(); new MutationObserver(mark).observe(document.body, { childList: true, subtree: true }); }
  if (document.body) watch(); else document.addEventListener('DOMContentLoaded', watch);
})();


/* Privacy notice window (footer link "Privacy notice", or #privacy in the address) and the Delete my account window
   (button at the bottom of Home). Both use the glass panel style of the Thank You window above. */
(function () {
  'use strict';
  var css = document.createElement('style');
  css.textContent =
    '.pcmt-cr.pcmt-wide{max-width:640px;max-height:min(86vh,820px);overflow:auto;text-align:left}' +
    '.pcmt-pv h3{margin:22px 0 6px;font:600 13px/1.3 "JetBrains Mono",monospace;letter-spacing:.08em;text-transform:uppercase;color:#a5dcdd}' +
    '.pcmt-pv p,.pcmt-pv li{margin:0 0 8px;font-size:15px;line-height:1.55;color:#d6e4e4}' +
    '.pcmt-cr .pcmt-pv ul,.pcmt-cr .pcmt-del ul{display:block;list-style:disc;margin:0 0 12px;padding-left:20px}' +
    '.pcmt-cr .pcmt-pv li,.pcmt-cr .pcmt-del li{padding:0;border:0;border-radius:0;background:none;font-weight:400;font-size:15px;line-height:1.55;margin:0 0 6px;color:#d6e4e4}' +
    '.pcmt-cr.pcmt-wide h2{font-size:30px;margin-bottom:16px;padding-right:44px}' +
    '.pcmt-pv .pcmt-pv-date{margin:-12px 0 4px;font:12px "JetBrains Mono",monospace;color:#93a9aa}' +
    '.pcmt-del p{margin:0 0 12px;font-size:15px;line-height:1.55;color:#d6e4e4}' +
    '.pcmt-del label{display:block;margin:4px 0 6px;font:12px "JetBrains Mono",monospace;letter-spacing:.06em;text-transform:uppercase;color:#93a9aa}' +
    '.pcmt-del input{width:100%;box-sizing:border-box;height:46px;padding:0 14px;border-radius:10px;border:1px solid rgba(255,255,255,.2);background:rgba(0,0,0,.35);color:#fff;font:600 16px "JetBrains Mono",monospace;letter-spacing:.1em}' +
    '.pcmt-del input:focus{outline:none;border-color:#ff8a80;box-shadow:0 0 0 3px rgba(255,138,128,.3)}' +
    '.pcmt-del-row{display:flex;flex-wrap:wrap;gap:10px;justify-content:flex-end;margin-top:18px}' +
    '.pcmt-del-row button{min-height:46px;padding:0 20px;border-radius:10px;font:700 13px "JetBrains Mono",monospace;letter-spacing:.06em;text-transform:uppercase;cursor:pointer}' +
    '.pcmt-del-no{border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.06);color:#eaf4f4}' +
    '.pcmt-del-yes{border:1px solid #ff8a80;background:#ff8a80;color:#1a0b0a}' +
    '.pcmt-del-yes:disabled{opacity:.4;cursor:not-allowed}' +
    '.pcmt-del-row button:focus-visible{outline:2px solid #fff;outline-offset:2px}' +
    '.pcmt-del-msg{margin:12px 0 0;min-height:1.4em;font-size:14px;color:#ff8a80}' +
    '.pcmt-del-msg.ok{color:#8be4b7}' +
    '.pcmt-set-row{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:16px 0;border-top:1px solid rgba(255,255,255,.12)}' +
    '.pcmt-set-name{display:block;font-size:17px;font-weight:700;color:#fff}' +
    '.pcmt-set-note{display:block;margin-top:4px;font-size:14px;line-height:1.45;color:#c4d4d4}' +
    '.pcmt-switch{flex:none;position:relative;width:56px;height:32px;padding:0;border-radius:999px;border:1px solid rgba(255,255,255,.3);background:rgba(255,255,255,.1);cursor:pointer;transition:background .2s,border-color .2s}' +
    '.pcmt-switch span{position:absolute;top:3px;left:3px;width:24px;height:24px;border-radius:50%;background:#eaf4f4;box-shadow:0 2px 6px rgba(0,0,0,.4);transition:transform .2s}' +
    '.pcmt-switch[aria-checked="true"]{background:#a5dcdd;border-color:#a5dcdd}' +
    '.pcmt-switch[aria-checked="true"] span{transform:translateX(24px);background:#0d1416}' +
    '.pcmt-switch:focus-visible{outline:2px solid #fff;outline-offset:3px}' +
    '.pcmt-set-foot{margin:14px 0 0;padding-top:14px;border-top:1px solid rgba(255,255,255,.12);font:12px "JetBrains Mono",monospace;color:#93a9aa}' +
    '@media (prefers-reduced-motion:reduce){.pcmt-switch,.pcmt-switch span{transition:none}}';
  (document.head || document.documentElement).appendChild(css);

  var open = null, back = null;
  function close() {
    if (!open) return;
    var el = open, from = back; open = null; back = null;
    el.classList.remove('on'); setTimeout(function () { el.remove(); }, 200);
    document.removeEventListener('keydown', onKey, true);
    if (from && from.focus) try { from.focus(); } catch (e) {}
  }
  function focusables() { return Array.prototype.filter.call(open.querySelectorAll('button,input,a[href],[tabindex="0"]'), function (x) { return !x.disabled; }); }
  function onKey(e) {
    if (!open) return;
    if (e.key === 'Escape' && !open.getAttribute('data-busy')) { e.preventDefault(); close(); }
    else if (e.key === 'Tab') {
      var f = focusables(); if (!f.length) return;
      var i = f.indexOf(document.activeElement);
      e.preventDefault();
      f[(i + (e.shiftKey ? f.length - 1 : 1)) % f.length].focus();
    }
  }
  function show(html, from, label, focusSel) {
    if (open) close();
    back = from || document.activeElement;
    var wrap = document.createElement('div');
    wrap.className = 'pcmt-cr-back';
    wrap.innerHTML = '<div class="pcmt-cr pcmt-wide" role="dialog" aria-modal="true" aria-labelledby="' + label + '">' +
      '<button type="button" class="pcmt-cr-x" aria-label="Close">&times;</button>' + html + '</div>';
    wrap.addEventListener('click', function (e) {
      if (wrap.getAttribute('data-busy')) return;
      if (e.target === wrap || e.target.closest('.pcmt-cr-x') || e.target.closest('[data-close]')) close();
    });
    document.body.appendChild(wrap);
    open = wrap;
    document.addEventListener('keydown', onKey, true);
    requestAnimationFrame(function () { wrap.classList.add('on'); (wrap.querySelector(focusSel || '.pcmt-cr-x') || wrap.querySelector('.pcmt-cr-x')).focus(); });
    return wrap;
  }

  var PRIVACY = '<div class="pcmt-pv"><h2 id="pcmt-pv-t">Privacy notice</h2><p class="pcmt-pv-date">Last updated October 26, 2026</p>' +
    '<p>fantasy.pcmt.gg is a free fan site for the Plat Chat Members Tourney, run by the PCMT Team. This is what we keep about you and why.</p>' +
    '<h3>What we keep</h3><ul>' +
    '<li><b>From Discord, when you log in:</b> your display name, avatar, username and Discord account ID. We use them to know it’s you and to show your name on the leaderboards.</li>' +
    '<li><b>Your email:</b> Discord sends it when you log in, but we throw it away straight away. It is never stored.</li>' +
    '<li><b>What you do on the site:</b> your decks and deck names (with when you saved them), Pick’ems picks, Credits, cards and codes you redeem.</li>' +
    '<li><b>Comments and complaints</b> you send from Home.</li>' +
    '<li><b>Login records:</b> our database provider keeps the time, IP address and browser of each login, to keep you signed in and stop abuse.</li>' +
    '<li><b>On your device:</b> your browser remembers your login and some settings (favorites, opened packs, panels you collapsed). This is not used for tracking or ads.</li></ul>' +
    '<h3>Who can see it</h3><ul>' +
    '<li><b>Everyone:</b> your display name and avatar, your saved decks and deck names, and your place in the standings.</li>' +
    '<li><b>Only you:</b> your Pick’ems picks before they score, your Credits and your cards.</li>' +
    '<li><b>PCMT Team staff:</b> comments and complaints, and the account details above when needed to run the site.</li>' +
    '<li>We never sell your information, show ads, or share it with anyone else.</li></ul>' +
    '<h3>Services we use</h3><p>Discord (login), Supabase (database), Cloudflare (hosting) and Google Fonts (lettering). Like any website, they can see your IP address when your browser contacts them.</p>' +
    '<h3>How long we keep it</h3><p>For as long as you have an account. Delete it any time with <b>Delete my account</b> at the bottom of Home: your account, decks, picks, Credits, cards and comments are removed straight away. Login records are removed with the account.</p>' +
    '<h3>Your choices</h3><p>You can ask what we hold about you, ask us to fix it, or delete your account. Use the comments and complaints box on Home or message the PCMT Team on Discord.</p>' +
    '<h3>Age</h3><p>You need a Discord account to log in, so you must meet Discord’s minimum age (13 in most countries).</p>' +
    '<h3>Changes</h3><p>If this notice changes, the date at the top changes too.</p></div>';
  function showPrivacy(from) { show(PRIVACY, from, 'pcmt-pv-t'); }

  function showDelete(from) {
    var L = window.PCMT_LEAGUE;
    if (!L || !L.signedIn) { if (L && L.toast) L.toast('Log in with Discord to delete your account.'); return; }
    var name = (window.PCMT_AUTH && window.PCMT_AUTH.name) || 'your account';
    var w = show('<div class="pcmt-del"><h2 id="pcmt-del-t">Delete your account?</h2>' +
      '<p>This permanently deletes <b class="pcmt-del-name"></b> from fantasy.pcmt.gg:</p>' +
      '<ul><li>your decks and deck names, and your place on the leaderboards</li><li>your Pick’ems picks and standings</li>' +
      '<li>your Credits, cards and unlocks</li><li>your comments and complaints</li></ul>' +
      '<p><b>This can’t be undone.</b> If you log in with Discord again later, you start over with a new, empty account.</p>' +
      '<label for="pcmt-del-in">Type DELETE to confirm</label><input id="pcmt-del-in" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false">' +
      '<div class="pcmt-del-row"><button type="button" class="pcmt-del-no" data-close>Keep my account</button><button type="button" class="pcmt-del-yes" disabled>Delete my account</button></div>' +
      '<p class="pcmt-del-msg" role="status" aria-live="polite"></p></div>', from, 'pcmt-del-t', '.pcmt-del-no');
    w.querySelector('.pcmt-del-name').textContent = name;
    var inp = w.querySelector('#pcmt-del-in'), yes = w.querySelector('.pcmt-del-yes'), msg = w.querySelector('.pcmt-del-msg');
    inp.addEventListener('input', function () { yes.disabled = inp.value.trim().toUpperCase() !== 'DELETE'; });
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !yes.disabled) yes.click(); });
    yes.addEventListener('click', function () {
      if (inp.value.trim().toUpperCase() !== 'DELETE') return;
      w.setAttribute('data-busy', '1'); yes.disabled = true; inp.disabled = true; w.querySelector('.pcmt-del-no').disabled = true;
      msg.className = 'pcmt-del-msg ok'; msg.textContent = 'Deleting…';
      L.deleteAccount().then(function () {
        msg.textContent = 'Your account has been deleted. Taking you to Home…';
        setTimeout(function () { location.href = 'home.html'; }, 1800);
      }, function (e) {
        w.removeAttribute('data-busy'); inp.disabled = false; w.querySelector('.pcmt-del-no').disabled = false;
        yes.disabled = inp.value.trim().toUpperCase() !== 'DELETE';
        msg.className = 'pcmt-del-msg'; msg.textContent = 'Couldn’t delete your account: ' + (e && e.message ? e.message : 'try again.');
      });
    });
  }

  // Settings: a window with per-device options. Glass mode is saved in this browser only (localStorage 'pcmt-glass').
  function showSettings(from) {
    var looks = window.PCMT_LOOKS || [];   // [{ id, name, note, on(), set(on) }] registered by the look blocks below
    var w = show('<div class="pcmt-set"><h2 id="pcmt-set-t">Settings</h2>' + looks.map(function (k) {
      return '<div class="pcmt-set-row"><div><span class="pcmt-set-name" id="pcmt-set-' + k.id + '-l">' + k.name + '</span></div>' +
        '<button type="button" class="pcmt-switch" data-look="' + k.id + '" role="switch" aria-labelledby="pcmt-set-' + k.id + '-l"><span></span></button></div>';
    }).join('') + '<p class="pcmt-set-foot">Saved on this device only.</p></div>', from, 'pcmt-set-t', '.pcmt-switch');
    function draw() { looks.forEach(function (k) { var b = w.querySelector('[data-look="' + k.id + '"]'); if (b) b.setAttribute('aria-checked', k.on() ? 'true' : 'false'); }); }
    w.addEventListener('click', function (e) {
      var b = e.target.closest('[data-look]'); if (!b) return;
      var pick = null; looks.forEach(function (k) { if (k.id === b.getAttribute('data-look')) pick = k; });
      if (!pick) return;
      var turnOn = !pick.on();
      // looks in the same group (light and glass) can't be on together: switching one on switches the others off
      if (turnOn && pick.group) looks.forEach(function (k) { if (k !== pick && k.group === pick.group && k.on()) k.set(false); });
      pick.set(turnOn);
      draw();
    });
    draw();
  }
  window.PCMT_SETTINGS = { show: showSettings };
  document.addEventListener('click', function (e) {
    var st = e.target.closest && e.target.closest('[data-pcmt-settings],a[href="#settings"]');
    if (st) { e.preventDefault(); showSettings(st); return; }
    var a = e.target.closest && e.target.closest('[data-pcmt-privacy],a[href="#privacy"]');
    if (a) { e.preventDefault(); showPrivacy(a); return; }
    var d = e.target.closest && e.target.closest('[data-pcmt-delete]');
    if (d) { e.preventDefault(); showDelete(d); }
  });
  window.PCMT_PRIVACY = { show: showPrivacy, deleteAccount: showDelete };
  function fromHash() { if (location.hash === '#privacy') setTimeout(function () { showPrivacy(null); }, 400); else if (location.hash === '#settings') setTimeout(function () { showSettings(null); }, 400); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fromHash); else fromHash();
  window.addEventListener('hashchange', fromHash);
})();


/* Glass mode (Settings): html.pcmt-glass turns the dark panels into frosted glass over a soft coloured backdrop.
   The pages keep their colours inline, so the rules below match those inline backgrounds. Card backs, buttons and
   logos aren't touched. Turned on early so the page doesn't flash dark first. */
(function () {
  'use strict';
  var KEY = 'pcmt-glass', d = document.documentElement;
  function read() { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } }
  var css = document.createElement('style');
  var P = 'html.pcmt-glass ';
  var glassy = 'background-color:rgba(255,255,255,.06)!important;background-image:linear-gradient(145deg,rgba(255,255,255,.07),rgba(255,255,255,.02))!important;border-color:rgba(255,255,255,.14)!important;box-shadow:inset 0 1px 0 rgba(255,255,255,.08),0 8px 24px rgba(0,0,0,.25)';
  css.textContent =
    P + '{color-scheme:dark}' +
    P + 'body{background:#071012!important;background-image:radial-gradient(900px 600px at 8% 0%,rgba(68,170,175,.38),transparent 65%),radial-gradient(800px 700px at 100% 30%,rgba(118,82,196,.32),transparent 60%),radial-gradient(900px 700px at 30% 100%,rgba(40,120,160,.30),transparent 60%),linear-gradient(160deg,#081417,#0b1020)!important;background-attachment:fixed!important}' +
    P + '[data-pcmt-root]{background:transparent!important}' +
    P + 'header[style*="background: #111a1c"],' + P + '[style*="background: #111a1c"]{background:rgba(10,18,20,.42)!important;-webkit-backdrop-filter:blur(18px) saturate(150%);backdrop-filter:blur(18px) saturate(150%);border-color:rgba(255,255,255,.12)!important}' +
    P + '[style*="background: #172124"]:not([style*="backface-visibility"]),' + P + '.hm-panel,' + P + '.hm-tile,' + P + '.lib-mvp{' + glassy + ';-webkit-backdrop-filter:blur(14px) saturate(140%);backdrop-filter:blur(14px) saturate(140%)}' +
    P + '[style*="background: #172124"][style*="backface-visibility"],' + P + '.pk-front,' + P + '.st-card{background-color:rgba(20,32,36,.72)!important;border-color:rgba(255,255,255,.16)!important}' +
    P + '[style*="background: #0d1416"]:not(.pcmt-loading):not([data-pcmt-root]){background:rgba(0,0,0,.22)!important;border-color:rgba(255,255,255,.16)!important}' +
    P + '[style*="background: #080b0c"]{background:rgba(0,0,0,.24)!important}' +
    P + '[style*="background: #13292b"]{background:rgba(165,220,221,.12)!important}' +
    P + '[style*="background: #111819"]{background:rgba(0,0,0,.2)!important}' +
    P + '.hm-cc textarea,' + P + 'input[type=text],' + P + 'input[type=search],' + P + 'select{background-color:rgba(0,0,0,.22)!important;border-color:rgba(255,255,255,.18)!important}' +
    P + 'footer{background:rgba(6,12,14,.35);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px)}' +
    P + 'table.grid,' + P + '.sheet{background:rgba(255,255,255,.04)!important}' +
    '@media (prefers-reduced-transparency:reduce){html.pcmt-glass [style]{-webkit-backdrop-filter:none!important;backdrop-filter:none!important}}';
  (document.head || d).appendChild(css);
  function apply(on) { d.classList.toggle('pcmt-glass', !!on); }
  apply(read());
  window.PCMT_GLASS = {
    on: function () { return d.classList.contains('pcmt-glass'); },
    set: function (on) { apply(on); try { if (on) localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY); } catch (e) {} }
  };
  (window.PCMT_LOOKS = window.PCMT_LOOKS || []).push({ id: 'glass', group: 'theme', name: 'Glass mode', note: 'A see-through, frosted look for the whole site.', on: window.PCMT_GLASS.on, set: window.PCMT_GLASS.set });
  window.addEventListener('storage', function (e) { if (e.key === KEY) apply(e.newValue === '1'); });   // other open tabs follow
})();


/* Light mode (Settings): html.pcmt-light swaps the dark palette for a light one. The pages keep their colours inline,
   so each dark colour the site uses is mapped to a light one below (backgrounds, text, borders). Card backs, team
   colours, logos and buttons keep their own colours. Light and Glass can't be on together (same 'theme' group).
   Saved per device ('pcmt-light'). A new inline colour added to the boards needs a line here to follow. */
(function () {
  'use strict';
  var KEY = 'pcmt-light', d = document.documentElement;
  function read() { try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; } }
  var P = 'html.pcmt-light ';
  var BG = { '#0f1d1e': '#e3f2f2', '#0d1416': '#eef3f3', '#111a1c': '#ffffff', '#172124': '#ffffff', '#080b0c': '#f3f7f7', '#13292b': '#dff1f1', '#111819': '#eef3f3', '#2a3a3e': '#d5e0e0' };
  var FG = { '#eaf4f4': '#142322', '#c4d4d4': '#3b5153', '#93a9aa': '#566d6f', '#a5dcdd': '#17767a', '#f5d76e': '#8a6a0a', '#ff8a80': '#c0392b',
             '#8be4b7': '#1e8a57', '#ef8f8f': '#c0392b', '#7f9597': '#677d7f', '#d6e4e4': '#2b3f40' };
  var BD = { '#2a3a3e': '#d5e0e0', '#3a4f53': '#b9caca', '#3a2a2a': '#e6c9c6' };
  var rules = [
    P.trim() + '{color-scheme:light}',
    P + 'body{background:#eef3f3!important}',
    P + 'a{color:#17767a}', P + 'a:hover{color:#0d4f52}',
    P + '*{scrollbar-color:#b9caca #eef3f3}',
    P + '.hm-panel,' + P + '.hm-tile,' + P + '.lib-mvp{background:#ffffff!important;border-color:#d5e0e0!important;box-shadow:0 1px 2px rgba(20,35,34,.06),0 6px 18px rgba(20,35,34,.06)}',
    P + '.hm-cc textarea,' + P + 'input[type=text],' + P + 'input[type=search],' + P + 'select{background-color:#ffffff!important;color:#142322!important;border-color:#b9caca!important}',
    P + 'input::placeholder,' + P + 'textarea::placeholder{color:#7b9092!important}',
    P + 'table.grid,' + P + '.sheet{background:#ffffff!important}',
    // white role icons (duelist, initiator, sentinel, controller) turn dark
    P + 'img[src*="3911a104"],' + P + 'img[src*="8f7fb7ff"],' + P + 'img[src*="006daf34"],' + P + 'img[src*="783fdcc5"]{filter:invert(1) brightness(.35)}'
  ];
  Object.keys(BG).forEach(function (h) {
    // round elements (the logo circle on card backs) keep the card's own dark colour
    rules.push(P + '[style*="background: ' + h + '"]:not([style*="border-radius: 50%"]),' + P + '[style*="background:' + h + '"]:not([style*="border-radius:50%"]){background-color:' + BG[h] + '!important}');
  });
  // panels get a soft shadow so white-on-light still reads as a card
  rules.push(P + '[style*="background: #172124"][style*="border-radius: 12px"]{box-shadow:0 1px 2px rgba(20,35,34,.06),0 6px 18px rgba(20,35,34,.06)}');
  Object.keys(FG).forEach(function (h) {
    rules.push(P + '[style*=" color: ' + h + '"],' + P + '[style^="color: ' + h + '"],' + P + '[style*=";color:' + h + '"],' + P + '[style^="color:' + h + '"]{color:' + FG[h] + '!important}');
  });
  Object.keys(BD).forEach(function (h) {
    rules.push(P + '[style*="solid ' + h + '"],' + P + '[style*="dashed ' + h + '"]{border-color:' + BD[h] + '!important}');
  });
  var css = document.createElement('style');
  css.textContent = rules.join('');
  (document.head || d).appendChild(css);
  function apply(on) { d.classList.toggle('pcmt-light', !!on); }
  apply(read());
  if (read() && window.PCMT_GLASS && window.PCMT_GLASS.on()) window.PCMT_GLASS.set(false);   // only one of the two
  // Text in a team's own colour (yellows, lime, near-white) can be too pale on white. While light mode is on, any inline
  // text colour with less than 3.5:1 contrast on a light background is darkened just enough (the original is kept in
  // data-pcmt-c and put back when light mode goes off). Text sitting on a dark or pictured background is left alone.
  function rgb(c) { var m = String(c).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/); return m ? [+m[1], +m[2], +m[3], m[4] == null ? 1 : +m[4]] : null; }
  function lum(v) { return [0, 1, 2].reduce(function (t, i) { var c = v[i] / 255; c = c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); return t + [0.2126, 0.7152, 0.0722][i] * c; }, 0); }
  function onDark(el) {
    for (var e = el; e && e !== document.body; e = e.parentElement) {
      var cs = getComputedStyle(e);
      if (cs.backgroundImage && cs.backgroundImage !== 'none' && !/^url\(/.test(cs.backgroundImage) ) return true;
      var b = rgb(cs.backgroundColor);
      if (b && b[3] > 0.5) return lum(b) < 0.35;
    }
    return false;
  }
  var seen = new WeakMap();
  function fix() {
    if (!d.classList.contains('pcmt-light')) return;
    var els = document.querySelectorAll('[style*="color"]');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (el.hasAttribute('data-pcmt-c') || !el.style.color) continue;
      var st = el.getAttribute('style'); if (seen.get(el) === st) continue;   // already checked with this style
      seen.set(el, st);
      var v = rgb(getComputedStyle(el).color); if (!v) continue;
      if ((1.05) / (lum(v) + 0.05) >= 3.5 || onDark(el)) continue;
      var k = 1;
      while (k > 0.2 && 1.05 / (lum([v[0] * k, v[1] * k, v[2] * k]) + 0.05) < 3.5) k -= 0.05;
      el.setAttribute('data-pcmt-c', el.style.color);
      el.style.setProperty('color', 'rgb(' + Math.round(v[0] * k) + ',' + Math.round(v[1] * k) + ',' + Math.round(v[2] * k) + ')', 'important');
    }
  }
  function unfix() {
    seen = new WeakMap();
    var els = document.querySelectorAll('[data-pcmt-c]');
    for (var i = 0; i < els.length; i++) { els[i].style.setProperty('color', els[i].getAttribute('data-pcmt-c')); els[i].removeAttribute('data-pcmt-c'); }
  }
  var queued = false;
  function soon() { if (!queued) { queued = true; requestAnimationFrame(function () { queued = false; fix(); }); } }
  function watch() {
    new MutationObserver(function (list) {
      // a redraw that changes an element's colour drops its mark, so it's checked again
      list.forEach(function (m) { if (m.type === 'attributes' && m.target.hasAttribute && m.target.hasAttribute('data-pcmt-c') && m.target.style.getPropertyPriority('color') !== 'important') m.target.removeAttribute('data-pcmt-c'); });
      soon();
    }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['style'] });
    soon();
  }
  if (document.body) watch(); else document.addEventListener('DOMContentLoaded', watch);
  var api = {
    on: function () { return d.classList.contains('pcmt-light'); },
    set: function (on) { apply(on); if (on) soon(); else unfix(); try { if (on) localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY); } catch (e) {} }
  };
  (window.PCMT_LOOKS = window.PCMT_LOOKS || []).unshift({ id: 'light', group: 'theme', name: 'Light mode', note: 'A bright, light look for the whole site.', on: api.on, set: api.set });
  window.addEventListener('storage', function (e) { if (e.key === KEY) apply(e.newValue === '1'); });
})();
