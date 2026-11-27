// PCMT MVP VS (Top Trumps-style card game). Rules engine, bot, online rooms (Supabase) and the page UI.
// Decks come from trumps-cards.js: one per PCMT season, built from PCMT.gg by tools/mvp-vs-cards.js in the hourly sync.
// Database setup: setup/trumps-setup.sql (and setup/trumps-seasons.sql).
(function () {
  'use strict';
  var CARDS = window.PCMT_TRUMPS_CARDS || {};
  var SB_URL = 'https://wwrsavqipkxvdsxcemos.supabase.co';
  var SB_KEY = 'sb_publishable_e8v-uyAo4fnvwJCHUVA5FQ_LXR6yYM7';
  var TOKEN_KEY = 'pcmt-auth'; // same sign-in as the rest of the site
  var ROUND_LIMIT = 60, MAX_ROUNDS = 999;   // 60 unless the players set another number before dealing
  // One deck per season (PCMT_TRUMPS_SEASONS, current seasons first): label "NA S4", season "S4 NA", the region's logo.
  var REGIONS = {}, SEASON_LIST = (window.PCMT_TRUMPS_SEASONS || []).filter(function (x) { return CARDS[x.id] && CARDS[x.id].length; });
  SEASON_LIST.forEach(function (x) { REGIONS[x.id] = { label: x.label, season: x.season, logo: x.logo, past: !x.current, region: x.region }; });
  var STATS = [
    { k: 'acs', label: 'ACS', fmt: String },
    { k: 'kast', label: 'KAST', fmt: function (v) { return v + '%'; } },
    { k: 'hs', label: 'HS%', fmt: function (v) { return v + '%'; } },
    { k: 'deaths', label: 'Deaths', low: true, fmt: function (v) { return v.toFixed(1); }, tip: 'Deaths per map' },
    { k: 'toxic', label: 'Toxic rating', fmt: function (v) { return v.toFixed(2); } }
  ];
  var STAT_BY_KEY = {};
  STATS.forEach(function (s) { STAT_BY_KEY[s.k] = s; });
  // ---------- rules engine (pure; both online players run the same code) ----------
  var BY_ID = {}, RANK = {};
  Object.keys(CARDS).forEach(function (r) {
    CARDS[r].forEach(function (c) { BY_ID[c.id] = c; });
    STATS.forEach(function (s) {
      var vals = CARDS[r].map(function (c) { return c[s.k]; }).sort(function (a, b) { return a - b; });
      CARDS[r].forEach(function (c) {
        RANK[c.id] = RANK[c.id] || {};
        var p = vals.length > 1 ? vals.indexOf(c[s.k]) / (vals.length - 1) : 0.5;
        RANK[c.id][s.k] = s.low ? 1 - p : p;
      });
    });
  });
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // A deck is one or more seasons: their ids joined by "+" (e.g. "nas4+emeas2"), in the order the seasons are listed.
  function deckSeasons(deck) { return String(deck || '').split('+').filter(function (id) { return CARDS[id]; }); }
  function deckCards(deck) { var out = []; deckSeasons(deck).forEach(function (id) { out = out.concat(CARDS[id]); }); return out; }
  function roundsOk(n) { n = Math.floor(+n); return n >= 1 && n <= MAX_ROUNDS ? n : ROUND_LIMIT; }
  // firstSeat: 0 or 1 to choose who picks first (vs the bot the player always does); leave it out for a coin flip.
  // rounds: how many rounds before the most cards wins (60 if left out).
  function newGame(region, seed, firstSeat, rounds) {
    var r = rng(seed), ids = deckCards(region).map(function (c) { return c.id; });
    for (var i = ids.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), t = ids[i]; ids[i] = ids[j]; ids[j] = t; }
    // Every card is dealt. With an odd number of players, the player who picks second gets the extra card.
    var flip = r() < 0.5 ? 0 : 1, first = firstSeat === 0 || firstSeat === 1 ? firstSeat : flip, hands = [[], []];
    for (var k = 0; k < ids.length; k++) hands[(first + 1 + k) % 2].push(ids[k]);
    return { region: region, seed: seed, limit: roundsOk(rounds), hands: hands, turn: first, round: 1, last: null, over: null };
  }
  function play(s, stat) {
    if (s.over) return s;
    s = JSON.parse(JSON.stringify(s));
    var a = s.hands[0].shift(), b = s.hands[1].shift(), picker = s.turn;
    var va = BY_ID[a][stat], vb = BY_ID[b][stat];
    if (STAT_BY_KEY[stat].low) { va = -va; vb = -vb; } // Deaths: fewer wins
    var w = va > vb ? 0 : vb > va ? 1 : -1;
    if (w < 0) {
      // Tie: each player puts their own card back at the bottom of their deck; the same player picks again.
      s.hands[0].push(a); s.hands[1].push(b);
    } else {
      s.hands[w].push(w === 0 ? a : b, w === 0 ? b : a);
      s.turn = w;
    }
    s.last = { round: s.round, picker: picker, stat: stat, cards: [a, b], winner: w };
    s.round++;
    var n0 = s.hands[0].length, n1 = s.hands[1].length;
    if (!n0 || !n1) s.over = { winner: !n0 && !n1 ? -1 : n0 ? 0 : 1, reason: 'cards' };
    else if (s.round > (s.limit || ROUND_LIMIT)) s.over = { winner: n0 === n1 ? -1 : n0 > n1 ? 0 : 1, reason: 'limit' };
    return s;
  }
  function botPick(s, seat) {
    var id = s.hands[seat][0], best = STATS[0].k;
    STATS.forEach(function (st) { if (RANK[id][st.k] > RANK[id][best]) best = st.k; });
    return best;
  }

  // ---------- sign-in + Supabase (same session as the rest of the site) ----------
  var session = null;
  function readSession() { try { return JSON.parse(localStorage.getItem(TOKEN_KEY) || 'null'); } catch (e) { return null; } }
  function writeSession(x) { session = x; try { if (x) localStorage.setItem(TOKEN_KEY, JSON.stringify(x)); else localStorage.removeItem(TOKEN_KEY); } catch (e) {} }
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
    if (h.indexOf('access_token=') < 0) return;
    var q = new URLSearchParams(h.slice(1));
    writeSession({ access_token: q.get('access_token'), refresh_token: q.get('refresh_token'), expires_at: Date.now() + (+q.get('expires_in') || 3600) * 1000 });
    history.replaceState(null, '', location.pathname + location.search);
  }
  function refreshIfNeeded() {
    if (!session || session.expires_at - Date.now() > 120000) return Promise.resolve();
    return fetch(SB_URL + '/auth/v1/token?grant_type=refresh_token', { method: 'POST', headers: { apikey: SB_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: session.refresh_token }) })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { writeSession(d && d.access_token ? { access_token: d.access_token, refresh_token: d.refresh_token, expires_at: Date.now() + (d.expires_in || 3600) * 1000 } : null); })
      .catch(function () {});
  }
  function api(path, opts) {
    opts = opts || {};
    return refreshIfNeeded().then(function () {
      var h = { apikey: SB_KEY, 'Content-Type': 'application/json' };
      if (session) h.Authorization = 'Bearer ' + session.access_token;
      if (opts.headers) Object.keys(opts.headers).forEach(function (k) { h[k] = opts.headers[k]; });
      return fetch(SB_URL + path, { method: opts.method || 'GET', headers: h, body: opts.body ? JSON.stringify(opts.body) : undefined });
    }).then(function (res) {
      return res.text().then(function (txt) {
        var d = null; try { d = txt ? JSON.parse(txt) : null; } catch (e) { d = txt; }
        if (!res.ok) throw new Error((d && (d.message || d.msg)) || 'Request failed (' + res.status + ')');
        return d;
      });
    });
  }
  function rpc(name, body) {
    return api('/rest/v1/rpc/' + name, { method: 'POST', body: body }).catch(function (err) {
      // Before setup/trumps-setup.sql has been run, Supabase answers "could not find the function".
      if (/could not find the function|schema cache|does not exist/i.test(err.message)) throw new Error('Online play isn’t switched on yet. Play the bot for now.');
      throw err;
    });
  }
  function myId() { try { return JSON.parse(atob(session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub; } catch (e) { return null; } }
  function signIn() {
    location.href = SB_URL + '/auth/v1/authorize?provider=discord&redirect_to=' + encodeURIComponent(location.origin + location.pathname);
  }

  // ---------- page state ----------
  var ui = {
    region: (SEASON_LIST[0] || {}).id || '', rounds: ROUND_LIMIT, mode: 'lobby', state: null, me: 0, seen: 0, busy: false, error: '',
    names: ['You', 'Bot'], room: null, version: 0, poll: null, tester: null, joinCode: ''
  };
  // The seasons picked last time (one or more) and the round count.
  try {
    var picked = deckSeasons(localStorage.getItem('pcmt-trumps-region'));
    if (picked.length) ui.region = picked.join('+');
    var savedRounds = localStorage.getItem('pcmt-trumps-rounds'); if (savedRounds) ui.rounds = roundsOk(savedRounds);
  } catch (e) {}
  function deckLabel(deck) { return deckSeasons(deck).map(function (id) { return REGIONS[id].label; }).join(' + '); }
  function deckLogo(deck) { var x = deckSeasons(deck); return x.length ? REGIONS[x[0]].logo : ''; }
  function limitOf(s) { return (s && s.limit) || ROUND_LIMIT; }
  var $ = function (id) { return document.getElementById(id); };
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  var ROLE_ICONS = { duelist: '3911a104cbddaf481d7a7bf070a2e696.png', initiator: '8f7fb7ffa93c48ba09a00fcd223c7f7c.png',
                    sentinel: '006daf34642009c6f6749139f80a613e.png', controller: '783fdcc50fe04d2622938ee185d4ed32.png' };
  var CHAMP_ICON = 'assets/7dd283457b69773e4aa58012ed89ad9a.png', EMBLEM = 'assets/3bf9d529cabff94109b561693539029f.png';

  // Team-colour edges, the region logo (top left), name, full team name, an icon for every role the player played that
  // season (most played first), and the team logo as a faint watermark behind everything (a sub: the region's).
  function cardHTML(id, o) {
    o = o || {};
    if (o.hidden) return '<div class="tt-card tt-back" aria-label="Face-down card"><i class="tt-back-in1"></i><i class="tt-back-in2"></i>' +
      '<i class="tt-gem t"></i><i class="tt-gem b"></i><i class="tt-gem l"></i><i class="tt-gem r"></i>' +
      '<span class="tt-back-emblem"><img src="' + EMBLEM + '" alt=""></span></div>';
    var c = BY_ID[id], region = id.split('-')[0], R = REGIONS[region], logo = c.logo || '';
    var rows = STATS.map(function (s) {
      var cls = 'tt-stat' + (o.stat === s.k ? ' is-picked ' + (o.result || '') : '');
      var star = s.low ? '<i title="Lower wins on this stat">lower wins</i>' : '';
      if (s.tip) star = '<span class="tt-sr"> (' + s.tip.toLowerCase() + ')</span>' + star;
      var inner = '<span class="tt-stat-l">' + s.label + star + '</span><span class="tt-stat-v">' + s.fmt(c[s.k]) + '</span>';
      return o.pick ? '<button type="button" class="' + cls + '" data-stat="' + s.k + '">' + inner + '</button>' : '<div class="' + cls + '">' + inner + '</div>';
    }).join('');
    var nameSize = Math.max(18, Math.min(34, Math.floor(230 / Math.max(4, c.name.length * 0.62))));
    return '<div class="tt-card' + (o.result ? ' ' + o.result : '') + '" style="--team:' + c.color + '">' +
      '<span class="tt-wm' + (logo ? ' tt-team-wm' : '') + '" aria-hidden="true"><img src="' + esc(logo || R.logo) + '" alt=""></span>' +
      '<span class="tt-edge"></span><div class="tt-card-body">' +
      '<div class="tt-card-top"><img class="tt-region-logo" src="' + R.logo + '" alt="' + R.label.split(' ')[0] + '" title="' + esc(R.season) + (c.sub ? ' sub' : '') + '">' +
      '<span class="tt-maps" title="' + c.maps + ' maps played in ' + R.season + '">' + c.maps + '<small>MAPS</small></span></div>' +
      '<div class="tt-name" style="font-size:' + nameSize + 'px"><span>' + esc(c.name) + '</span>' +
      (c.champ ? '<img src="' + CHAMP_ICON + '" alt="PCMT champion" title="PCMT champion">' : '') + '</div>' +
      '<div class="tt-teamname">' + esc(c.teamName) + ' · ' + R.season + '</div>' +
      '<div class="tt-stats">' + rows + '</div>' +
      '<div class="tt-card-foot"><span class="tt-roles">' + (c.roles && c.roles.length ? c.roles : (c.role ? [{ role: c.role, maps: 0 }] : [])).map(function (x) {
        var t = cap(x.role) + (x.maps ? ' · ' + x.maps + (x.maps === 1 ? ' map' : ' maps') : '');
        return '<img src="assets/' + ROLE_ICONS[x.role] + '" alt="' + t + '" title="' + t + '">';
      }).join('') + '</span>' +
      (o.pick ? '<span class="tt-hint">Pick a stat</span>' : '') + '</div>' +
      '</div><span class="tt-edge"></span></div>';
  }

  // Card back for a seat. Everyone gets the deck card back for now; later, online players will show
  // the card back they picked in Customization (look it up here by seat).
  function backFor(seat) { return cardHTML(null, { hidden: true }); }

  // A card that can lie face down or face up on the table (both faces stacked in one grid cell).
  function flipHTML(front, seat, down, id) {
    return '<div class="tt-flip' + (down ? ' is-down' : '') + '"' + (id ? ' id="' + id + '"' : '') + '><div class="tt-flip-in">' +
      '<div class="tt-face tt-front">' + front + '</div><div class="tt-face tt-backface">' + backFor(seat) + '</div></div></div>';
  }
  function deckHTML(seat, n) {
    var layers = '', k = Math.min(n, 5);
    for (var i = k - 1; i >= 0; i--) layers += '<div class="tt-stack-card" style="--k:' + i + '">' + backFor(seat) + '</div>';
    var who = seat === ui.me ? 'me' : 'them';
    return '<div class="tt-deck tt-deck-' + who + '" id="tt-deck-' + who + '">' +
      '<div class="tt-stack' + (n ? '' : ' is-empty') + '">' + layers + '</div>' +
      '<div class="tt-deck-label"><span>' + esc(ui.names[seat]) + '</span><b data-count="' + n + '">' + n + '</b></div></div>';
  }
  function tableHTML(s, deckMe, deckThem, middle) {
    return '<div class="tt-tabletop">' +
      '<img class="tt-felt-mark" src="' + deckLogo(s.region) + '" alt="" aria-hidden="true">' +
      deckHTML(ui.me, deckMe) + deckHTML(1 - ui.me, deckThem) + middle + '</div>';
  }
  function slotHTML(who, label, inner) {
    return '<div class="tt-slot tt-slot-' + who + '" id="tt-slot-' + who + '"><div class="tt-seat">' + esc(label) + '</div>' + inner + '</div>';
  }
  var REDUCED = (function () { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } })();
  function ms(n) { return REDUCED ? 1 : n; }

  // The deck buttons, one per season (current NA and EMEA first). Pick one or more: their cards are dealt together.
  function seasonButtons() {
    var box = $('tt-seasons'); if (!box || box.childNodes.length) return;
    box.innerHTML = SEASON_LIST.map(function (x) { return '<button type="button" data-region="' + x.id + '" aria-pressed="false"><img src="' + x.logo + '" alt="">' + esc(x.label) + '</button>'; }).join('');
  }
  function render() {
    var root = $('tt-app'); if (!root) return;
    seasonButtons();
    document.querySelectorAll('[data-region]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(deckSeasons(ui.region).indexOf(b.getAttribute('data-region')) >= 0));
      b.disabled = ui.mode !== 'lobby';
    });
    if (ui.mode === 'lobby') return renderLobby(root);
    var s = ui.state, them = 1 - ui.me, html = '';
    if (ui.mode === 'online' && !ui.room.guest) {
      root.innerHTML = '<div class="tt-panel tt-center"><div class="tt-kicker">ROOM CODE</div><div class="tt-code">' + esc(ui.room.code) + '</div>' +
        '<p>Send this code to the other player. The game starts when they join.</p><p class="tt-dim">' + esc(deckLabel(s.region)) + ' cards · ' + deckCards(s.region).length + ' players · ' + limitOf(s) + ' rounds</p>' +
        '<button type="button" class="tt-btn ghost" data-act="leave">Leave room</button></div>';
      return;
    }
    var last = s.last, showReveal = last && last.round > ui.seen, phase;
    var round = '<span class="tt-round">Round ' + Math.min(showReveal ? last.round : s.round, limitOf(s)) + '<small>/' + limitOf(s) + '</small></span>';
    if (showReveal) {
      phase = 'reveal';
      var mine = last.cards[ui.me], theirs = last.cards[them], st = STAT_BY_KEY[last.stat];
      var res = last.winner < 0 ? 'tie' : last.winner === ui.me ? 'win' : 'lose';
      var who = last.picker === ui.me ? 'You' : esc(ui.names[them]);
      var msg = res === 'tie' ? 'Tie on ' + st.label + '. Both cards go back to their decks.' :
        res === 'win' ? 'You win the round (+1 card).' : esc(ui.names[them]) + ' wins the round.';
      // Counts as they look before the cards are collected (the two played cards are still on the table).
      var d = [s.hands[0].length, s.hands[1].length];
      if (last.winner < 0) { d[0] -= 1; d[1] -= 1; } else d[last.winner] -= 2;
      html += '<div class="tt-status">' + round + '<div class="tt-result ' + res + '"><span>' + who + ' picked <b>' + st.label + '</b></span><strong>' + msg + '</strong></div></div>';
      html += tableHTML(s, d[ui.me], d[them],
        slotHTML('me', ui.names[ui.me], flipHTML(cardHTML(mine, { stat: last.stat, result: res === 'tie' ? 'tie' : res }), ui.me, false)) +
        slotHTML('them', ui.names[them], flipHTML(cardHTML(theirs, { stat: last.stat, result: res === 'tie' ? 'tie' : res === 'win' ? 'lose' : 'win' }), them, ui.revealed !== last.round)));
      html += '<div class="tt-actions"><button type="button" class="tt-btn" data-act="next"' + (ui.collecting ? ' disabled' : '') + '>' + (s.over ? 'See result' : 'Next round') + '</button></div>';
    } else if (s.over) {
      phase = 'over';
      var w = s.over.winner, title = w < 0 ? 'Draw' : w === ui.me ? 'You win!' : esc(ui.names[them]) + ' wins';
      html += '<div class="tt-status">' + round + '<div class="tt-result ' + (w < 0 ? 'tie' : w === ui.me ? 'win' : 'lose') + '"><span>Game over</span><strong>' + title + '</strong></div></div>';
      html += tableHTML(s, s.hands[ui.me].length, s.hands[them].length,
        '<div class="tt-over"><div class="tt-kicker">GAME OVER</div><div class="tt-big">' + title + '</div><p>' +
        (s.over.reason === 'limit' ? 'Round ' + limitOf(s) + ' reached, so the most cards wins: ' + s.hands[ui.me].length + ' to ' + s.hands[them].length + '.' : 'Every card ended up in one deck.') +
        '</p><div class="tt-actions">' + (ui.mode === 'bot' ? '<button type="button" class="tt-btn" data-act="again">Play again</button>' : '') +
        '<button type="button" class="tt-btn ghost" data-act="leave">Back to lobby</button></div></div>');
    } else {
      phase = 'pick';
      var myTurn = s.turn === ui.me;
      html += '<div class="tt-status">' + round + '<div class="tt-result neutral"><span>' + (myTurn ? 'Your pick' : esc(ui.names[them]) + '’s pick') + '</span><strong>' +
        (myTurn ? 'Choose the stat you think beats their card.' : esc(ui.names[them]) + ' is picking a stat…') + '</strong></div></div>';
      html += tableHTML(s, s.hands[ui.me].length - 1, s.hands[them].length - 1,
        slotHTML('me', ui.names[ui.me], flipHTML(cardHTML(s.hands[ui.me][0], { pick: myTurn && !ui.busy }), ui.me, ui.dealt !== s.round)) +
        slotHTML('them', ui.names[them], flipHTML('<div class="tt-card tt-blank"></div>', them, true)));
      html += '<div class="tt-actions"><button type="button" class="tt-btn ghost" data-act="leave">' + (ui.mode === 'online' ? 'Leave room' : 'Quit game') + '</button></div>';
    }
    if (ui.error) html += '<p class="tt-error" role="alert">' + esc(ui.error) + '</p>';
    root.innerHTML = html;
    animateIn(phase, s);
    if (phase === 'pick' && s.turn !== ui.me && ui.mode === 'bot' && !ui.busy) {
      ui.busy = true;
      setTimeout(function () { ui.busy = false; if (ui.mode !== 'bot') return; ui.state = play(ui.state, botPick(ui.state, 1)); render(); }, ms(1700));
    }
  }

  // ---------- table animations ----------
  function centre(el) { var r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; }
  function topOf(deckEl) { return deckEl.querySelector('.tt-stack-card:last-child') || deckEl.querySelector('.tt-stack'); }
  function flyFrom(el, fromEl, dur, tilt) {
    if (!el || !fromEl || !el.animate) return Promise.resolve();
    var a = centre(fromEl), b = centre(el);
    return el.animate([
      { transform: 'translate(' + (a.x - b.x) + 'px,' + (a.y - b.y) + 'px) scale(' + (a.w / b.w) + ') rotate(' + tilt + 'deg)' },
      { transform: 'translate(0,0) scale(1) rotate(0deg)' }
    ], { duration: ms(dur), easing: 'cubic-bezier(.2,.8,.2,1)' }).finished.catch(function () {});
  }
  function flyTo(el, toEl, dur, delay, tilt) {
    if (!el || !toEl || !el.animate) return Promise.resolve();
    var a = centre(el), b = centre(toEl);
    return el.animate([
      { transform: 'translate(0,0) scale(1) rotate(0deg)', offset: 0 },
      { transform: 'translate(0,-14px) scale(1.03) rotate(' + (tilt / 3) + 'deg)', offset: 0.18 },
      { transform: 'translate(' + (b.x - a.x) + 'px,' + (b.y - a.y) + 'px) scale(' + (b.w / a.w) + ') rotate(' + tilt + 'deg)', offset: 1 }
    ], { duration: ms(dur), delay: ms(delay), easing: 'cubic-bezier(.5,0,.25,1)', fill: 'forwards' }).finished.catch(function () {});
  }
  function animateIn(phase, s) {
    if (phase === 'pick' && ui.dealt !== s.round) {
      var round = s.round; ui.dealt = round;
      var me = $('tt-slot-me'), th = $('tt-slot-them');
      var cMe = me && me.querySelector('.tt-flip'), cTh = th && th.querySelector('.tt-flip');
      Promise.all([flyFrom(cMe, topOf($('tt-deck-me')), 560, -10), flyFrom(cTh, topOf($('tt-deck-them')), 560, 10)]).then(function () {
        if (cMe && document.body.contains(cMe) && ui.state && ui.state.round === round) cMe.classList.remove('is-down');
      });
    }
    if (phase === 'reveal' && ui.revealed !== s.last.round) {
      ui.revealed = s.last.round;
      var flip = document.querySelector('#tt-slot-them .tt-flip');
      if (flip) setTimeout(function () { flip.classList.remove('is-down'); }, ms(60));
    }
  }
  function collect() {
    var s = ui.state, last = s.last;
    ui.collecting = true;
    var nb = document.querySelector('[data-act="next"]'); if (nb) nb.disabled = true;
    // Winner takes both cards; on a tie each card goes back to its own deck.
    var deckMe = topOf($('tt-deck-me')) || $('tt-deck-me'), deckThem = topOf($('tt-deck-them')) || $('tt-deck-them');
    var destMe = last.winner < 0 ? deckMe : last.winner === ui.me ? deckMe : deckThem;
    var destThem = last.winner < 0 ? deckThem : destMe;
    var tilt = last.winner === ui.me ? -14 : 14;
    // Turn the played cards face down as they travel, so they land on the deck as card backs.
    document.querySelectorAll('.tt-slot .tt-flip').forEach(function (f) { f.classList.add('is-down'); });
    var moves = [flyTo(document.querySelector('#tt-slot-me .tt-flip'), destMe, 620, 0, last.winner < 0 ? -14 : tilt),
                 flyTo(document.querySelector('#tt-slot-them .tt-flip'), destThem, 620, 90, last.winner < 0 ? 14 : tilt)];
    Promise.all(moves).then(function () {
      ui.collecting = false;
      ui.seen = last.round;
      render();
    });
  }

  function renderLobby(root) {
    var pool = deckCards(ui.region), n = pool.length, label = deckLabel(ui.region), signedIn = !!session;
    var online = window.PCMT_TRUMPS_PREVIEW
      ? '<p>Online rooms need the site itself (Discord log-in and the game database), so this test copy only has the bot. They work once the page is on a private site preview.</p>'
      : !signedIn
      ? '<p>Online games use your Discord log-in from fantasy.pcmt.gg.</p><button type="button" class="tt-btn discord" data-act="signin">Log in with Discord</button>'
      : '<div class="tt-actions left"><button type="button" class="tt-btn" data-act="create"' + (ui.busy ? ' disabled' : '') + '>Create a room</button></div>' +
          '<form class="tt-join" data-act="join"><label for="tt-code">Join with a code</label><div><input id="tt-code" maxlength="5" autocomplete="off" placeholder="ABCDE" value="' + esc(ui.joinCode) + '">' +
          '<button type="submit" class="tt-btn ghost"' + (ui.busy ? ' disabled' : '') + '>Join</button></div></form>';
    root.innerHTML =
      '<div class="tt-setup"><span class="tt-setup-deck"><b>' + esc(label) + '</b> · ' + n + ' cards</span>' +
      '<label class="tt-rounds" for="tt-rounds">Rounds <input id="tt-rounds" type="number" inputmode="numeric" min="1" max="' + MAX_ROUNDS + '" step="1" value="' + ui.rounds + '" aria-describedby="tt-rounds-help"></label>' +
      '<span id="tt-rounds-help" class="tt-dim">After this many rounds, whoever holds more cards wins.</span></div>' +
      '<div class="tt-lobby">' +
      '<div class="tt-panel"><div class="tt-kicker">VS THE BOT</div><h2>Practice game</h2><p id="tt-bot-line">Deal the ' + esc(label) + ' cards (' + n + ') between you and the bot, ' + ui.rounds + ' rounds.</p>' +
      '<button type="button" class="tt-btn" data-act="bot">Deal ' + esc(label) + ' cards</button></div>' +
      '<div class="tt-panel"><div class="tt-kicker">ONLINE · 1V1</div><h2>Play a friend</h2>' + online + '</div>' +
      '</div>' + (ui.error ? '<p class="tt-error" role="alert">' + esc(ui.error) + '</p>' : '') +
      '<div class="tt-preview"><div class="tt-kicker">' + esc(deckSeasons(ui.region).map(function (id) { return REGIONS[id].season; }).join(' + ')) + ' · TOP 3 BY TOXIC RATING</div><div class="tt-preview-row">' +
      pool.slice().sort(function (a, b) { return b.toxic - a.toxic; }).slice(0, 3).map(function (c) { return cardHTML(c.id); }).join('') + '</div></div>';
  }

  // ---------- online rooms ----------
  function stopPoll() { clearInterval(ui.poll); ui.poll = null; }
  function applyRoom(r) {
    var changed = !ui.room || r.version !== ui.version || (!ui.room.guest && r.guest);
    if (ui.collecting) changed = false; // let the collect animation finish; the next poll catches up
    ui.room = r; ui.version = r.version; ui.state = r.state;
    ui.me = r.host === myId() ? 0 : 1;
    ui.names = ui.me === 0 ? ['You', r.guest_name || 'Waiting…'] : ['You', r.host_name || 'Host'];
    if (changed) render();
  }
  function startPoll() {
    stopPoll();
    ui.poll = setInterval(function () {
      api('/rest/v1/trumps_rooms?code=eq.' + encodeURIComponent(ui.room.code) + '&select=*').then(function (rows) {
        if (rows && rows[0]) applyRoom(rows[0]);
      }).catch(function () {});
    }, 1500);
  }
  function enterRoom(r) { ui.mode = 'online'; ui.seen = r.state.last ? r.state.last.round : 0; ui.dealt = 0; ui.revealed = ui.seen; ui.collecting = false; ui.room = null; ui.error = ''; applyRoom(r); startPoll(); render(); }

  // ---------- actions ----------
  document.addEventListener('click', function (e) {
    var reg = e.target.closest('[data-region]');
    if (reg && ui.mode === 'lobby') {   // toggle a season; at least one stays picked
      var id = reg.getAttribute('data-region'), on = deckSeasons(ui.region), at = on.indexOf(id);
      if (at >= 0) { if (on.length > 1) on.splice(at, 1); } else on.push(id);
      ui.region = SEASON_LIST.map(function (x) { return x.id; }).filter(function (x) { return on.indexOf(x) >= 0; }).join('+');
      try { localStorage.setItem('pcmt-trumps-region', ui.region); } catch (x) {}
      ui.error = ''; return render();
    }
    var stat = e.target.closest('[data-stat]');
    if (stat && ui.state && ui.state.turn === ui.me && !ui.busy) {
      var k = stat.getAttribute('data-stat');
      if (ui.mode === 'bot') { ui.state = play(ui.state, k); return render(); }
      ui.busy = true; render();
      var next = play(ui.state, k);
      return rpc('trumps_move', { p_code: ui.room.code, p_version: ui.version, p_state: next }).then(function (v) {
        ui.busy = false; ui.error = ''; ui.version = v; ui.state = next; render();
      }).catch(function (err) { ui.busy = false; ui.error = err.message; render(); });
    }
    var act = e.target.closest('[data-act]'); if (!act || act.tagName === 'FORM') return;
    var a = act.getAttribute('data-act');
    if (a === 'bot' || a === 'again') {
      var region = a === 'again' ? ui.state.region : ui.region;
      ui.mode = 'bot'; ui.me = 0; ui.names = ['You', 'Bot']; ui.seen = 0; ui.error = ''; ui.dealt = 0; ui.revealed = 0; ui.collecting = false;
      ui.state = newGame(region, (Math.random() * 4294967296) >>> 0, 0, a === 'again' ? limitOf(ui.state) : ui.rounds); render(); // you always pick first against the bot
    } else if (a === 'next') {
      if (!ui.collecting) collect();
    } else if (a === 'leave') {
      stopPoll(); ui.mode = 'lobby'; ui.state = null; ui.room = null; ui.error = ''; render();
    } else if (a === 'signin') {
      signIn();
    } else if (a === 'create') {
      ui.busy = true; ui.error = ''; render();
      var g = newGame(ui.region, (Math.random() * 4294967296) >>> 0, undefined, ui.rounds);
      rpc('trumps_create', { p_region: ui.region, p_state: g })
        .then(function (code) { return api('/rest/v1/trumps_rooms?code=eq.' + encodeURIComponent(code) + '&select=*'); })
        .then(function (rows) { ui.busy = false; enterRoom(rows[0]); })
        .catch(function (err) { ui.busy = false; ui.error = err.message; render(); });
    }
  });
  // Rounds: a whole number from 1 to 999 counts as soon as it's typed; anything else goes back to 60 when you leave the box.
  function setRounds(n) { ui.rounds = n; try { localStorage.setItem('pcmt-trumps-rounds', String(n)); } catch (x) {} }
  document.addEventListener('input', function (e) {
    if (e.target.id !== 'tt-rounds') return;
    var v = e.target.value.trim(), n = +v;
    if (/^\d+$/.test(v) && n >= 1 && n <= MAX_ROUNDS) {
      setRounds(n);
      var line = $('tt-bot-line'); if (line) line.textContent = line.textContent.replace(/\d+ rounds\.$/, n + ' rounds.');
    }
  });
  document.addEventListener('change', function (e) {
    if (e.target.id !== 'tt-rounds') return;
    setRounds(roundsOk(e.target.value)); e.target.value = ui.rounds;
    var line = $('tt-bot-line'); if (line) line.textContent = line.textContent.replace(/\d+ rounds\.$/, ui.rounds + ' rounds.');
  });
  document.addEventListener('submit', function (e) {
    if (!e.target.matches('[data-act="join"]')) return;
    e.preventDefault();
    var code = $('tt-code').value.trim().toUpperCase(); ui.joinCode = code;
    if (!/^[A-Z0-9]{5}$/.test(code)) { ui.error = 'Room codes are 5 letters or numbers.'; return render(); }
    ui.busy = true; ui.error = ''; render();
    rpc('trumps_join', { p_code: code }).then(function (r) { ui.busy = false; enterRoom(r); })
      .catch(function (err) { ui.busy = false; ui.error = err.message; render(); });
  });

  // ---------- start ----------
  // cardHTML: the backend's View cards window draws cards exactly as they look here.
  window.PCMT_TRUMPS = { newGame: newGame, play: play, botPick: botPick, STATS: STATS, ROUND_LIMIT: ROUND_LIMIT, cards: CARDS, cardHTML: cardHTML, deckCards: deckCards };
  function start() {
    if (!$('tt-app')) return;   // loaded on a page without the game (backend.html, for cardHTML): nothing to start
    takeRedirectTokens();
    session = readSession();
    render();
    if (session) refreshIfNeeded().then(function () {
      if (!session) return render();
      // Same as the other pages: show the Discord name in the header and keep the profile name fresh
      // (rooms show each player's profile name).
      return api('/auth/v1/user').then(function (user) {
        if (!user || !user.id) return;
        var md = user.user_metadata || {};
        var name = pickName(md);
        var lab = $('tt-auth-label'); if (lab) lab.textContent = name;
        api('/rest/v1/profiles', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: { id: user.id, name: name, avatar_url: md.avatar_url || '', updated_at: new Date().toISOString() } }).catch(function () {});
      }).catch(function () { writeSession(null); }).then(render);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
