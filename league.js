/* PCMT Fantasy Decks league layer: Discord sign-in (through Supabase), saved decks, scoring and the leaderboard.
 * Needs data.js (matches + results) and players.js (player list) loaded first.
 * Every page waits on window.PCMT_LEAGUE_READY before it draws (dc-lite.js), then reads the globals set here.
 */
(function () {
  'use strict';
  var SB_URL = 'https://wwrsavqipkxvdsxcemos.supabase.co';
  var SB_KEY = 'sb_publishable_e8v-uyAo4fnvwJCHUVA5FQ_LXR6yYM7';
  var TOKEN_KEY = 'pcmt-auth';
  var BUDGET = 100, TEAM_LIMIT = 2, TRANSFERS = 2, LOCK_LEAD_H = 12;
  var ROLES = ['duelist', 'controller', 'initiator', 'sentinel'];
  var SCORING = { kill: 2, assist: 1, death: -1, firstKill: 1, seriesWin: 2, topAcs: 3, topKast: 1 };
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
  var TWIN = window.PCMT_SITE_TWIN || {};
  var CHAMPS = window.PCMT_SITE_CHAMPS || {};
  var LOWEST = {};
  (function () {
    var min = {};
    PLAYERS.forEach(function (p) { if (min[p.team] == null || p.price < min[p.team]) min[p.team] = p.price; });
    PLAYERS.forEach(function (p) { if (p.price === min[p.team]) LOWEST[p.id] = true; });
  })();

  function seriesPoints(r) {
    var out = {}, ids = Object.keys(r.stats || {});
    var topAcs = Math.max.apply(null, ids.map(function (k) { return +r.stats[k][4] || 0; }));
    var topKast = Math.max.apply(null, ids.map(function (k) { return +r.stats[k][5] || 0; }));
    ids.forEach(function (k) {
      var st = r.stats[k], p = BY_ID[k];
      if (!p) return;
      var pts = st[0] * SCORING.kill + st[2] * SCORING.assist + st[1] * SCORING.death + st[3] * SCORING.firstKill;
      if (p.team === r.winner) pts += SCORING.seriesWin;
      if (+st[4] === topAcs) pts += SCORING.topAcs;
      if (+st[5] === topKast) pts += SCORING.topKast;
      out[k] = pts;
    });
    return out;
  }

  // A deck counts only if it follows every rule.
  function deckIds(slots) { return Object.keys(slots || {}).map(function (k) { return slots[k]; }); }
  function validDeck(slots) {
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
      cost += p.price;
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

  // For each manager: which deck counted each gameweek, and the points it scored.
  function scoreManager(subs, weeks) {
    subs = subs.slice().sort(function (a, b) { return a.t - b.t; });
    var prev = null, out = [];
    weeks.forEach(function (w) {
      if (!w.locked) return;
      var before = subs.filter(function (s) { return s.t < w.lockAt && validDeck(s.slots); });
      var use = null;
      for (var i = before.length - 1; i >= 0; i--) {
        if (!prev || transfersBetween(prev.slots, before[i].slots) <= TRANSFERS) { use = before[i]; break; }
      }
      if (!use) use = prev;
      if (!use) return;
      prev = use;
      var pts = 0, byTeam = {}, champWin = false, missedWin = false, ids = deckIds(use.slots);
      w.results.forEach(function (r) {
        var sp = seriesPoints(r);
        ids.forEach(function (id) {
          var p = BY_ID[id], base = sp[id] || 0;
          pts += base * (id === use.igl ? 1.5 : 1);
          byTeam[p.team] = (byTeam[p.team] || 0) + base;
          if (p.team === r.winner && CHAMPS[id]) champWin = true;
          if (p.team === r.winner && LOWEST[id]) missedWin = true;
        });
      });
      out.push({ week: w, deck: use, pts: Math.round(pts * 10) / 10, byTeam: byTeam, champWin: champWin, missedWin: missedWin });
    });
    return out;
  }

  // VP for one gameweek: each card's number on The Deck (that player's points), no IGL bonus,
  // and a card below zero counts as 0. Supabase pays the same amount when the gameweek ends (setup/vp-setup.sql).
  function weekCardVP(week, deck) {
    var pts = {}, cards = {}, total = 0;
    week.results.forEach(function (r) { var sp = seriesPoints(r); Object.keys(sp).forEach(function (k) { pts[k] = (pts[k] || 0) + sp[k]; }); });
    deckIds(deck.slots).forEach(function (id) { var v = Math.max(0, pts[id] || 0); cards[id] = v; total += v; });
    return { total: total, cards: cards };
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
  function api(path, opts) {
    opts = opts || {};
    return fetch(SB_URL + path, { method: opts.method || 'GET', headers: headers(opts.headers), body: opts.body ? JSON.stringify(opts.body) : undefined })
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
      el.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:2147483600;max-width:min(560px,calc(100% - 32px));padding:14px 18px;border-radius:10px;background:#0b1011;border:1px solid #a5dcdd;color:#eaf4f4;font:500 14px/1.45 "Space Grotesk",system-ui,sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.6);transition:opacity .3s;';
      document.body.appendChild(el);
    }
    el.textContent = msg; el.style.opacity = '1';
    clearTimeout(toast.t); toast.t = setTimeout(function () { el.style.opacity = '0'; }, 5000);
  }

  // ---------- the league API used by the pages ----------
  var me = null, mySubs = [], myScored = [], lastSubmitted = null, submitting = false;
  var L = window.PCMT_LEAGUE = {
    get signedIn() { return !!me; },
    signIn: function () {
      var back = location.origin + location.pathname.replace(/[^/]*$/, '') + 'index.html';
      location.href = SB_URL + '/auth/v1/authorize?provider=discord&redirect_to=' + encodeURIComponent(back);
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
      var used = L.transfersUsed(s.slots);
      if (used > TRANSFERS) { toast('That\'s ' + used + ' transfers. You get ' + TRANSFERS + ' per gameweek: swap some players back to last week\'s deck.'); return false; }
      return true;
    },
    statusNote: function (slots, text, locked) {
      if (!me || locked) return text;
      var base = L.lastLockedDeck();
      if (!base) return text;
      return text + ' Transfers this gameweek: ' + Math.min(L.transfersUsed(slots), 99) + '/' + TRANSFERS + '.';
    },
    // Called whenever The Deck saves; sends a locked-in deck to the league.
    onDeck: function (s) {
      if (!me || !s.saved || submitting) return;
      var json = JSON.stringify({ slots: s.slots || {}, igl: s.igl || null, name: s.squadName || '' });
      if (json === lastSubmitted) return;
      if (!validDeck(s.slots)) return;
      submitting = true;
      api('/rest/v1/deck_history', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: { user_id: me.id, slots: s.slots, igl: s.igl || null, name: s.squadName || '' } })
        .then(function () { lastSubmitted = json; toast('Deck entered in the league.'); })
        .catch(function (e) { toast('Couldn\'t save your deck: ' + e.message); })
        .then(function () { submitting = false; });
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
      if (l.amount < 0) spent.push({ date: new Date(l.created_at).toLocaleDateString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric' }), pack: (l.detail && (l.detail.pack || l.detail.name)) || 'Card pack', vp: String(-l.amount) });
    });
    var history = Object.keys(byWeek).sort().reverse().map(function (k) {
      var h = byWeek[k];
      return { label: 'Week of ' + fmtDay(k), deck: h.deck || '—', vp: String(h.vp) };
    });
    var cw = weeks.filter(function (w) { return w.b === curB; })[0], week = { vp: '0', state: 'nomatch', note: 'No matches are scheduled this gameweek yet.' };
    if (cw && !cw.locked) week = { vp: '0', state: 'open', note: 'Your deck locks ' + fmtWhen(cw.lockAt) + '. VP starts counting from then.' };
    else if (cw) {
      var mine = scored.filter(function (x) { return x.week.b === cw.b; })[0];
      week = mine
        ? { vp: String(weekCardVP(mine.week, mine.deck).total), state: 'live', note: 'So far from the deck you locked in. Paid ' + fmtWhen(cw.e) + ', when your cards reset.' }
        : { vp: '0', state: 'nodeck', note: 'No deck counted this gameweek. Lock one in on The Deck before the next gameweek locks.' };
    }
    var arriving = 0;
    if (ready) scored.forEach(function (x) { if (x.week.done) arriving += Math.max(0, weekCardVP(x.week, x.deck).total - (paidByWeek[x.week.key] || 0)); });
    return { signedIn: true, ready: ready, balance: String(balance), earned: String(earned), history: history, spent: spent, week: week, arriving: arriving };
  }
  window.PCMT_VP = { signedIn: false, ready: true, balance: '0', earned: '0', history: [], spent: [], week: { vp: '0', state: 'out', note: '' }, arriving: 0 };

  // ---------- load everything, then let the page draw ----------
  function load() {
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
      var decks = api('/rest/v1/deck_history?select=user_id,name,slots,igl,created_at&order=created_at.asc&limit=20000').catch(function () { return []; });
      var profiles = api('/rest/v1/profiles?select=id,name').catch(function () { return []; });
      var unlocks = me ? api('/rest/v1/user_unlocks?select=unlock').catch(function () { return []; }) : Promise.resolve([]);
      // null = the VP table isn't set up yet (setup/vp-setup.sql not run)
      var vp = me ? api('/rest/v1/vp_ledger?select=kind,week,amount,detail,created_at&order=created_at.desc&limit=5000').catch(function () { return null; }) : Promise.resolve([]);
      return Promise.all([decks, profiles, unlocks, vp]);
    }).then(function (res) {
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
        rows.push({ id: uid, manager: names[uid] || 'Manager', squad: (latest && latest.name) || '—', igl: iglP ? iglP.name : '—', weeks: w, me: !!me && uid === me.id });
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
        if (last) { window.PCMT_MY_REMOTE_DECK = { slots: last.slots, igl: last.igl, name: last.name, uid: me.id }; lastSubmitted = JSON.stringify({ slots: last.slots || {}, igl: last.igl || null, name: last.name || '' }); }
      }
      if (window.PCMT_LOGIN_ERROR) setTimeout(function () { toast('Discord sign-in didn\'t finish: ' + window.PCMT_LOGIN_ERROR); }, 600);
    }).catch(function (e) { console.warn('league load failed', e); });
  }
  window.PCMT_LEAGUE_READY = load();
})();
