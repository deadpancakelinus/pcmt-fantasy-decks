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
  // players: 2 to 4 hands (2 if left out). firstSeat: the seat that picks first (vs the bot the player always does);
  // leave it out for a random seat. rounds: how many rounds before the most cards wins (60 if left out).
  function newGame(region, seed, firstSeat, rounds, players) {
    var n = players >= 2 && players <= 4 ? Math.floor(players) : 2;
    var r = rng(seed), ids = deckCards(region).map(function (c) { return c.id; });
    for (var i = ids.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), t = ids[i]; ids[i] = ids[j]; ids[j] = t; }
    // Every card is dealt, one at a time starting with the seat after the first picker, so the first picker never gets
    // an extra card (with 2 players and an odd deck, the player who picks second gets it).
    var flip = r() < 0.5 ? 0 : 1, first;
    if (n === 2) first = firstSeat === 0 || firstSeat === 1 ? firstSeat : flip;
    else first = firstSeat >= 0 && firstSeat < n ? firstSeat : Math.floor(r() * n);
    var hands = []; for (var h = 0; h < n; h++) hands.push([]);
    for (var k = 0; k < ids.length; k++) hands[(first + 1 + k) % n].push(ids[k]);
    return { region: region, seed: seed, limit: roundsOk(rounds), hands: hands, turn: first, round: 1, last: null, over: null };
  }
  // The seats whose card is best on the stat (one seat, or several on a tie). cards: one id per seat, null if out.
  function bestSeats(cards, stat) {
    var best = null, top = [];
    cards.forEach(function (id, i) {
      if (!id) return;
      var v = BY_ID[id][stat]; if (STAT_BY_KEY[stat].low) v = -v;   // Deaths: fewer wins
      if (best === null || v > best) { best = v; top = [i]; } else if (v === best) top.push(i);
    });
    return top;
  }
  // One round: everyone still holding cards plays their top card; the best card on the picked stat takes them all and
  // its player picks next. A tie for the best card: every card goes back to the bottom of its own deck and the same
  // player picks again. A player with no cards left is out. The game ends when one player holds every card, or at the
  // round limit (the most cards wins; a tie for the most is a draw).
  function play(s, stat) {
    if (s.over) return s;
    s = JSON.parse(JSON.stringify(s));
    var n = s.hands.length, picker = s.turn, cards = s.hands.map(function (h) { return h.length ? h.shift() : null; });
    var top = bestSeats(cards, stat), w = top.length === 1 ? top[0] : -1;
    if (w < 0) cards.forEach(function (id, i) { if (id) s.hands[i].push(id); });
    else {
      s.hands[w].push(cards[w]);   // the winner's own card first, then the others in seat order
      cards.forEach(function (id, i) { if (id && i !== w) s.hands[w].push(id); });
      s.turn = w;
    }
    s.last = { round: s.round, picker: picker, stat: stat, cards: cards, winner: w };
    s.round++;
    var left = [], most = -1, mostAt = [];
    s.hands.forEach(function (h, i) {
      if (h.length) left.push(i);
      if (h.length > most) { most = h.length; mostAt = [i]; } else if (h.length === most) mostAt.push(i);
    });
    if (left.length <= 1) s.over = { winner: left.length ? left[0] : -1, reason: 'cards' };
    else if (s.round > (s.limit || ROUND_LIMIT)) s.over = { winner: mostAt.length === 1 ? mostAt[0] : -1, reason: 'limit' };
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
  // ---------- tiers (setup/trumps-tiers.sql) ----------
  // Only online wins against another player count: every 5 wins is the next tier, Iron 1 to Radiant (at 120 wins).
  var T_ = window.PCMT_TIERS, WINS_PER_TIER = T_.perTier, TIERS = T_.list, tierOf = T_.of;   // tiers.js
  function tierImg(t, size) { return '<img class="tt-tier-img" src="' + t.img + '" alt="' + t.name + '" title="' + t.name + '" width="' + size + '" height="' + size + '">'; }
  // Wins by player id, read from the database when needed (the lobby, a room's two players, after an online game).
  var WINS = {}, ASKED = {};
  function loadWins(ids, again) {   // asks once per player unless `again` (after a game ends)
    ids = (ids || []).filter(function (id) { return id && (again || !ASKED[id]); });
    if (!ids.length) return Promise.resolve();
    ids.forEach(function (id) { ASKED[id] = true; });
    return rpc('trumps_wins', { p_ids: ids }).then(function (rows) {
      var changed = false;
      (rows || []).forEach(function (r) { if (WINS[r.user_id] !== r.wins) { WINS[r.user_id] = r.wins; changed = true; } });
      if (changed) render();
    }).catch(function () {});
  }
  function seatId(seat) { return ui.mode === 'online' && ui.room ? (ui.room.players || [])[seat] || null : null; }
  function seatsOf(s) { return s && s.hands ? s.hands.length : 2; }
  // Everyone else at the table, starting with the seat after yours.
  function others(s) { var n = seatsOf(s), out = []; for (var i = 1; i < n; i++) out.push((ui.me + i) % n); return out; }
  function nameOf(seat) { return seat === ui.me ? 'You' : (ui.names[seat] || 'Player ' + (seat + 1)); }

  function flipHTML(front, seat, down, id) {
    return '<div class="tt-flip' + (down ? ' is-down' : '') + '"' + (id ? ' id="' + id + '"' : '') + '><div class="tt-flip-in">' +
      '<div class="tt-face tt-front">' + front + '</div><div class="tt-face tt-backface">' + backFor(seat) + '</div></div></div>';
  }
  function deckHTML(seat, n, out) {
    var layers = '', k = Math.min(n, 5);
    for (var i = k - 1; i >= 0; i--) layers += '<div class="tt-stack-card" style="--k:' + i + '">' + backFor(seat) + '</div>';
    var who = seat === ui.me ? 'me' : 'them';
    return '<div class="tt-deck tt-deck-' + who + '" id="tt-deck-' + seat + '">' +
      '<div class="tt-stack' + (n ? '' : ' is-empty') + '">' + layers + '</div>' +
      '<div class="tt-deck-label"><span>' + (seatId(seat) && WINS[seatId(seat)] != null ? tierImg(tierOf(WINS[seatId(seat)]), 20) : '') + esc(nameOf(seat)) + '</span><b data-count="' + n + '">' + n + '</b>' +
      (out ? '<em class="tt-out">Out</em>' : '') + '</div></div>';
  }
  // counts: cards in each seat's deck; slots: each seat's played card (html) for this screen; middle: the game-over panel.
  // Two players: decks at the ends and the two cards side by side. Three or four: the others across the top, you below.
  function tableHTML(s, counts, slots, middle) {
    var n = seatsOf(s), felt = '<img class="tt-felt-mark" src="' + deckLogo(s.region) + '" alt="" aria-hidden="true">';
    var isOut = function (seat) { return !s.over && !s.hands[seat].length && !(s.last && s.last.cards[seat] && s.last.round > ui.seen); };
    if (n === 2) {
      var them = 1 - ui.me;
      return '<div class="tt-tabletop">' + felt + deckHTML(ui.me, counts[ui.me]) + deckHTML(them, counts[them]) +
        (middle || (slots[ui.me] + slots[them])) + '</div>';
    }
    return '<div class="tt-tabletop tt-multi tt-n' + n + '">' + felt +
      '<div class="tt-opps">' + others(s).map(function (seat) {
        return '<div class="tt-opp">' + deckHTML(seat, counts[seat], isOut(seat)) + (middle ? '' : slots[seat]) + '</div>';
      }).join('') + '</div>' + (middle || '') +
      '<div class="tt-mine">' + deckHTML(ui.me, counts[ui.me], isOut(ui.me)) + (middle ? '' : slots[ui.me]) + '</div></div>';
  }
  function slotHTML(seat, inner) {
    var who = seat === ui.me ? 'me' : 'them';
    return '<div class="tt-slot tt-slot-' + who + '" id="tt-slot-' + seat + '"><div class="tt-seat">' + esc(nameOf(seat)) + '</div>' + inner + '</div>';
  }
  function outSlot(seat) { return slotHTML(seat, '<div class="tt-gone">Out of cards</div>'); }
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
    var s = ui.state, html = '', n = seatsOf(s);
    if (ui.mode === 'online' && !ui.room.started) return renderWaiting(root);
    var last = s.last, showReveal = last && last.round > ui.seen, phase;
    var round = '<span class="tt-round">Round ' + Math.min(showReveal ? last.round : s.round, limitOf(s)) + '<small>/' + limitOf(s) + '</small></span>';
    var slots = [];
    if (showReveal) {
      phase = 'reveal';
      var st = STAT_BY_KEY[last.stat], played = last.cards.filter(Boolean).length, top = bestSeats(last.cards, last.stat);
      var res = last.winner < 0 ? (top.indexOf(ui.me) >= 0 ? 'tie' : last.cards[ui.me] ? 'lose' : 'tie') : last.winner === ui.me ? 'win' : 'lose';
      var who = last.picker === ui.me ? 'You' : esc(nameOf(last.picker));
      var msg = last.winner < 0 ? (n === 2 ? 'Tie on ' + st.label + '. Both cards go back to their decks.' : 'Tie for the best ' + st.label + '. Every card goes back to its deck.') :
        last.winner === ui.me ? 'You win the round (+' + (played - 1) + (played - 1 === 1 ? ' card).' : ' cards).') : esc(nameOf(last.winner)) + ' wins the round.';
      // Counts as they look before the cards are collected (the played cards are still on the table).
      var d = s.hands.map(function (h) { return h.length; });
      if (last.winner < 0) last.cards.forEach(function (id, i) { if (id) d[i] -= 1; }); else d[last.winner] -= played;
      html += '<div class="tt-status">' + round + '<div class="tt-result ' + res + '"><span>' + who + ' picked <b>' + st.label + '</b></span><strong>' + msg + '</strong></div></div>';
      for (var i = 0; i < n; i++) {
        var id = last.cards[i];
        if (!id) { slots[i] = outSlot(i); continue; }
        var r = last.winner < 0 ? (top.indexOf(i) >= 0 ? 'tie' : 'lose') : last.winner === i ? 'win' : 'lose';
        slots[i] = slotHTML(i, flipHTML(cardHTML(id, { stat: last.stat, result: r }), i, i !== ui.me && ui.revealed !== last.round));
      }
      html += tableHTML(s, d, slots);
      html += '<div class="tt-actions"><button type="button" class="tt-btn" data-act="next"' + (ui.collecting ? ' disabled' : '') + '>' + (s.over ? 'See result' : 'Next round') + '</button></div>';
    } else if (s.over) {
      phase = 'over';
      var w = s.over.winner, title = w < 0 ? 'Draw' : w === ui.me ? 'You win!' : esc(nameOf(w)) + ' wins';
      var tally = n === 2 ? s.hands[ui.me].length + ' to ' + s.hands[1 - ui.me].length :
        [ui.me].concat(others(s)).map(function (x) { return esc(nameOf(x)) + ' ' + s.hands[x].length; }).join(' · ');
      html += '<div class="tt-status">' + round + '<div class="tt-result ' + (w < 0 ? 'tie' : w === ui.me ? 'win' : 'lose') + '"><span>Game over</span><strong>' + title + '</strong></div></div>';
      html += tableHTML(s, s.hands.map(function (h) { return h.length; }), [],
        '<div class="tt-over"><div class="tt-kicker">GAME OVER</div><div class="tt-big">' + title + '</div><p>' +
        (s.over.reason === 'limit' ? 'Round ' + limitOf(s) + ' reached, so the most cards wins: ' + tally + '.' : 'Every card ended up in one deck.') +
        '</p>' + overTier(s) + '<div class="tt-actions">' + (ui.mode === 'bot' ? '<button type="button" class="tt-btn" data-act="again">Play again</button>' : '') +
        '<button type="button" class="tt-btn ghost" data-act="leave">Back to lobby</button></div></div>');
    } else {
      phase = 'pick';
      var myTurn = s.turn === ui.me, picker = esc(nameOf(s.turn));
      html += '<div class="tt-status">' + round + '<div class="tt-result neutral"><span>' + (myTurn ? 'Your pick' : picker + '’s pick') + '</span><strong>' +
        (myTurn ? (n === 2 ? 'Choose the stat you think beats their card.' : 'Choose the stat you think beats every other card.') : picker + ' is picking a stat…') + '</strong></div></div>';
      for (var j = 0; j < n; j++) {
        if (!s.hands[j].length) { slots[j] = outSlot(j); continue; }
        slots[j] = j === ui.me ? slotHTML(j, flipHTML(cardHTML(s.hands[j][0], { pick: myTurn && !ui.busy }), j, ui.dealt !== s.round))
          : slotHTML(j, flipHTML('<div class="tt-card tt-blank"></div>', j, true));
      }
      html += tableHTML(s, s.hands.map(function (h) { return h.length ? h.length - 1 : 0; }), slots);
      html += '<div class="tt-actions"><button type="button" class="tt-btn ghost" data-act="leave">' + (ui.mode === 'online' ? 'Leave room' : 'Quit game') + '</button></div>';
    }
    if (ui.error) html += '<p class="tt-error" role="alert">' + esc(ui.error) + '</p>';
    root.innerHTML = html;
    animateIn(phase, s);
    if (phase === 'pick' && s.turn !== ui.me && ui.mode === 'bot' && !ui.busy) {
      ui.busy = true;
      setTimeout(function () { ui.busy = false; if (ui.mode !== 'bot') return; ui.state = play(ui.state, botPick(ui.state, ui.state.turn)); render(); }, ms(1700));
    }
  }
  // Online, before the deal: the room code, who's in (up to 4), and Start for the host once 2 or more are in.
  var MAX_PLAYERS = 4;
  function renderWaiting(root) {
    var R = ui.room, s = ui.state, players = R.players || [], host = players[0] === myId(), seats = '';
    for (var i = 0; i < MAX_PLAYERS; i++) {
      var id = players[i];
      seats += '<li class="' + (id ? 'in' : 'open') + '">' + (id ? (WINS[id] != null ? tierImg(tierOf(WINS[id]), 24) : '<span class="tt-seat-dot" aria-hidden="true"></span>') +
        '<span>' + esc(i === ui.me ? 'You' : (R.names || [])[i] || 'Player ' + (i + 1)) + (i === 0 ? ' <small>host</small>' : '') + '</span>' : '<span>Open seat</span>') + '</li>';
    }
    root.innerHTML = '<div class="tt-panel tt-center tt-wait"><div class="tt-kicker">ROOM CODE</div><div class="tt-code">' + esc(R.code) + '</div>' +
      '<div class="tt-copy"><button type="button" class="tt-btn" data-act="copy-code">Copy code</button><button type="button" class="tt-btn ghost" data-act="copy-link">Copy invite link</button></div>' +
      '<p class="tt-copied" id="tt-copied" role="status" aria-live="polite"></p>' +
      '<p>Send the code or the invite link to your friends. Up to ' + MAX_PLAYERS + ' players can join.</p>' +
      '<p class="tt-dim">' + esc(deckLabel(s.region)) + ' cards · ' + deckCards(s.region).length + ' players · ' + limitOf(s) + ' rounds</p>' +
      '<ul class="tt-seats" aria-label="Players in the room">' + seats + '</ul>' +
      '<div class="tt-actions">' + (host ? '<button type="button" class="tt-btn" data-act="start"' + (players.length < 2 || ui.busy ? ' disabled' : '') + '>Start game (' + players.length + ' players)</button>' :
        '<p class="tt-dim tt-wait-host">Waiting for ' + esc((R.names || [])[0] || 'the host') + ' to start the game.</p>') +
      '<button type="button" class="tt-btn ghost" data-act="leave">Leave room</button></div>' +
      (ui.error ? '<p class="tt-error" role="alert">' + esc(ui.error) + '</p>' : '') + '</div>';
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
      var flies = [], mine = null;
      for (var i = 0; i < seatsOf(s); i++) {
        var slot = $('tt-slot-' + i), card = slot && slot.querySelector('.tt-flip'), deck = $('tt-deck-' + i);
        if (!card || !deck) continue;
        if (i === ui.me) mine = card;
        flies.push(flyFrom(card, topOf(deck), 560, i === ui.me ? -10 : 10));
      }
      Promise.all(flies).then(function () {
        if (mine && document.body.contains(mine) && ui.state && ui.state.round === round) mine.classList.remove('is-down');
      });
    }
    if (phase === 'reveal' && ui.revealed !== s.last.round) {
      ui.revealed = s.last.round;
      var flips = document.querySelectorAll('.tt-slot-them .tt-flip');
      if (flips.length) setTimeout(function () { flips.forEach(function (f) { f.classList.remove('is-down'); }); }, ms(60));
    }
  }
  function collect() {
    var s = ui.state, last = s.last;
    ui.collecting = true;
    var nb = document.querySelector('[data-act="next"]'); if (nb) nb.disabled = true;
    // The best card takes every played card; on a tie each card goes back to its own deck.
    var deckOf = function (seat) { var d = $('tt-deck-' + seat); return d ? topOf(d) || d : null; };
    // Turn the played cards face down as they travel, so they land on the deck as card backs.
    document.querySelectorAll('.tt-slot .tt-flip').forEach(function (f) { f.classList.add('is-down'); });
    var moves = [];
    last.cards.forEach(function (id, i) {
      if (!id) return;
      var to = last.winner < 0 ? i : last.winner, tilt = last.winner < 0 ? (i === ui.me ? -14 : 14) : last.winner === ui.me ? -14 : 14;
      moves.push(flyTo(document.querySelector('#tt-slot-' + i + ' .tt-flip'), deckOf(to), 620, i === ui.me ? 0 : 90, tilt));
    });
    Promise.all(moves).then(function () {
      ui.collecting = false;
      ui.seen = last.round;
      render();
    });
  }

  // Under the game-over line: online, your tier (a win counts toward it); against the bot, a reminder that it doesn't.
  function overTier(s) {
    if (ui.mode !== 'online') return '<p class="tt-dim">Games against the bot don\'t count toward your MVP VS tier.</p>';
    var me = myId(); if (WINS[me] == null) return '';
    var t = tierOf(WINS[me]);
    return '<div class="tt-tier-line">' + tierImg(t, 40) + '<span><b>' + t.name + '</b> · ' + t.wins + (t.wins === 1 ? ' win' : ' wins') +
      (t.next ? ' · ' + t.left + ' more to ' + t.next : '') + '</span></div>';
  }
  function tierPanel() {
    var me = myId(), w = WINS[me];
    if (w == null) { loadWins([me]); return ''; }
    var t = tierOf(w), into = t.next ? (WINS_PER_TIER - t.left) : WINS_PER_TIER;
    return '<div class="tt-tier"><div class="tt-tier-badge">' + tierImg(t, 64) + '</div><div class="tt-tier-text"><span class="tt-kicker">YOUR TIER</span><b>' + t.name + '</b>' +
      '<span>' + t.wins + (t.wins === 1 ? ' online win' : ' online wins') + (t.next ? ' · ' + t.left + ' more to ' + t.next : ' · the top tier') + '</span>' +
      '<span class="tt-tier-bar" role="img" aria-label="' + into + ' of ' + WINS_PER_TIER + ' wins to the next tier"><i style="width:' + (into / WINS_PER_TIER * 100) + '%"></i></span></div></div>';
  }

  // ---------- MVP VS leaderboard (a window over the page) ----------
  // Everyone who has finished a counted online game, most wins first (then fewest games), with their tier.
  function pictureUrl(uid, at) { var t = at ? Date.parse(at) : NaN; return uid && !isNaN(t) ? SB_URL + '/storage/v1/object/public/avatars/' + uid + '.webp?v=' + t : ''; }
  function openLadder() {
    if ($('tt-ladder')) return;
    var back = document.createElement('div'), prev = document.activeElement, me = session ? myId() : null;
    back.className = 'tt-ladder-back'; back.id = 'tt-ladder';
    back.innerHTML = '<div class="tt-ladder" role="dialog" aria-modal="true" aria-labelledby="tt-ladder-h"><div class="tt-ladder-head"><div><span class="tt-kicker">ONLINE WINS</span>' +
      '<h2 id="tt-ladder-h">MVP VS leaderboard</h2><p>Every ' + WINS_PER_TIER + ' online wins is the next tier, Iron 1 to Radiant.</p></div>' +
      '<button type="button" class="tt-ladder-x" data-ladder-close aria-label="Close">×</button></div><div class="tt-ladder-body" id="tt-ladder-body"><p class="tt-ladder-empty">Loading…</p></div></div>';
    function close() { back.remove(); document.removeEventListener('keydown', key, true); try { if (prev && prev.focus) prev.focus(); } catch (e) {} }
    function key(e) { if (e.key === 'Escape') { e.preventDefault(); close(); } }
    back.addEventListener('click', function (e) { if (e.target === back || e.target.closest('[data-ladder-close]')) close(); });
    document.addEventListener('keydown', key, true);
    document.body.appendChild(back);
    back.querySelector('[data-ladder-close]').focus();
    rpc('trumps_ladder', {}).then(function (rows) {
      rows = (rows || []).slice().sort(function (a, b) { return b.wins - a.wins || a.games - b.games || String(a.name).localeCompare(String(b.name)); });
      var rank = 0, prev2 = null;
      var html = rows.map(function (r, i) {
        if (prev2 === null || r.wins !== prev2) { rank = i + 1; prev2 = r.wins; }
        var t = tierOf(r.wins), pic = pictureUrl(r.user_id, r.picture_at) || r.avatar_url || '';
        return '<tr' + (r.user_id === me ? ' class="me"' : '') + '><td class="' + (rank <= 3 ? 'rank' + rank : '') + '">' + rank + '</td>' +
          '<td><span class="who">' + (pic ? '<img src="' + esc(pic) + '" alt="" loading="lazy">' : '<span class="ini" aria-hidden="true">' + esc(String(r.name || '?').charAt(0).toUpperCase()) + '</span>') +
          '<span>' + esc(r.name || 'Manager') + (r.user_id === me ? ' (you)' : '') + '</span></span></td>' +
          '<td><span class="tier">' + tierImg(t, 28) + t.name + '</span></td><td class="num"><b>' + r.wins + '</b></td><td class="num">' + r.games + '</td></tr>';
      }).join('');
      $('tt-ladder-body').innerHTML = rows.length
        ? '<table><thead><tr><th scope="col">#</th><th scope="col">Player</th><th scope="col">Tier</th><th scope="col" class="num">Wins</th><th scope="col" class="num">Games</th></tr></thead><tbody>' + html + '</tbody></table>'
        : '<p class="tt-ladder-empty">No online games have been played yet. Win one to get on the board.</p>';
    }).catch(function () { var b = $('tt-ladder-body'); if (b) b.innerHTML = '<p class="tt-ladder-empty">The leaderboard couldn\'t load. Try again in a bit.</p>'; });
  }

  function renderLobby(root) {
    var pool = deckCards(ui.region), n = pool.length, label = deckLabel(ui.region), signedIn = !!session;
    var online = window.PCMT_TRUMPS_PREVIEW
      ? '<p>Online rooms need the site itself (Discord log-in and the game database), so this test copy only has the bot. They work once the page is on a private site preview.</p>'
      : !signedIn
      ? '<p>Online games use your Discord log-in from fantasy.pcmt.gg.</p><button type="button" class="tt-btn discord" data-act="signin">Log in with Discord</button>'
      : tierPanel() + '<div class="tt-actions left"><button type="button" class="tt-btn" data-act="create"' + (ui.busy ? ' disabled' : '') + '>Create a room</button></div>' +
          '<form class="tt-join" data-act="join"><label for="tt-code">Join with a code</label><div><input id="tt-code" maxlength="5" autocomplete="off" placeholder="ABCDE" value="' + esc(ui.joinCode) + '">' +
          '<button type="submit" class="tt-btn ghost"' + (ui.busy ? ' disabled' : '') + '>Join</button></div></form>';
    root.innerHTML =
      '<div class="tt-setup"><span class="tt-setup-deck"><b>' + esc(label) + '</b> · ' + n + ' cards</span></div>' +
      '<div class="tt-lobby">' +
      '<div class="tt-panel"><div class="tt-kicker">VS THE BOT</div><h2>Practice game</h2><p id="tt-bot-line">Deal the ' + esc(label) + ' cards (' + n + ') between you and the bot, ' + ui.rounds + ' rounds.</p>' +
      '<div class="tt-deal"><button type="button" class="tt-btn" data-act="bot">Deal</button>' +
      '<label class="tt-rounds" for="tt-rounds">Rounds <input id="tt-rounds" type="number" inputmode="numeric" min="1" max="' + MAX_ROUNDS + '" step="1" value="' + ui.rounds + '" title="After this many rounds, whoever holds more cards wins"></label></div></div>' +
      '<div class="tt-panel"><div class="tt-kicker">ONLINE · 2 TO 4 PLAYERS</div><h2>Play friends</h2><p class="tt-dim">Up to 4 players in a room. Online wins climb the MVP VS tiers, Iron to Radiant: every ' + WINS_PER_TIER + ' wins is the next tier.</p>' + online + '</div>' +
      '</div>' + (ui.error ? '<p class="tt-error" role="alert">' + esc(ui.error) + '</p>' : '') +
      '<div class="tt-preview"><div class="tt-kicker">' + esc(deckSeasons(ui.region).map(function (id) { return REGIONS[id].season; }).join(' + ')) + ' · TOP 3 BY TOXIC RATING</div><div class="tt-preview-row">' +
      pool.slice().sort(function (a, b) { return b.toxic - a.toxic; }).slice(0, 3).map(function (c) { return cardHTML(c.id); }).join('') + '</div></div>';
  }

  // Copy to the clipboard (with a fallback for browsers without the clipboard API).
  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(t).then(function () { return true; }, function () { return fallback(); });
    return Promise.resolve(fallback());
    function fallback() {
      var ta = document.createElement('textarea'); ta.value = t; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(ta); ta.select(); var ok = false; try { ok = document.execCommand('copy'); } catch (e) {} ta.remove(); return ok;
    }
  }
  // An invite link (mvp-vs.html#join=CODE) joins the room when opened (after logging in, if needed).
  function joinFromLink() {
    var m = (location.hash || '').match(/join=([A-Za-z0-9]{5})/), code = m ? m[1].toUpperCase() : null;
    if (!code) { try { code = sessionStorage.getItem('pcmt-trumps-join'); } catch (e) {} }
    if (!code) return;
    if (m) history.replaceState(null, '', location.pathname + location.search);
    if (!session) { ui.joinCode = code; try { sessionStorage.setItem('pcmt-trumps-join', code); } catch (e) {} ui.error = 'Log in with Discord to join room ' + code + '.'; return render(); }
    try { sessionStorage.removeItem('pcmt-trumps-join'); } catch (e) {}
    ui.joinCode = code; ui.busy = true; ui.error = ''; render();
    rpc('trumps_join', { p_code: code }).then(function (r) { ui.busy = false; enterRoom(r); })
      .catch(function (err) { ui.busy = false; ui.error = err.message; render(); });
  }

  // ---------- online rooms ----------
  function stopPoll() { clearInterval(ui.poll); ui.poll = null; }
  function applyRoom(r) {
    var old = ui.room, players = r.players || [];
    var changed = !old || r.version !== ui.version || (old.players || []).length !== players.length || !!old.started !== !!r.started;
    if (ui.collecting) changed = false; // let the collect animation finish; the next poll catches up
    ui.room = r; ui.version = r.version; ui.state = r.state;
    var me = players.indexOf(myId()); ui.me = me < 0 ? 0 : me;
    ui.names = players.map(function (id, i) { return i === ui.me ? 'You' : ((r.names || [])[i] || 'Player ' + (i + 1)); });
    loadWins(players);
    // The game just ended: the win is counted by the move that ended it, so read the tiers again.
    var endKey = r.code + ':' + (r.state && r.state.seed);
    if (r.state && r.state.over && ui.overSeen !== endKey) { ui.overSeen = endKey; setTimeout(function () { loadWins(players, true); }, 1200); }
    if (changed) render();
  }
  function startPoll() {
    stopPoll();
    ui.poll = setInterval(function () {
      api('/rest/v1/trumps_rooms?code=eq.' + encodeURIComponent(ui.room.code) + '&select=*').then(function (rows) {
        if (rows && rows[0]) return applyRoom(rows[0]);
        if (ui.mode === 'online' && !ui.room.started) {   // the host left before the deal: the room is gone
          stopPoll(); ui.mode = 'lobby'; ui.state = null; ui.room = null; ui.error = 'The host closed the room.'; render();
        }
      }).catch(function () {});
    }, 1500);
  }
  function enterRoom(r) { ui.mode = 'online'; ui.seen = r.state && r.state.last ? r.state.last.round : 0; ui.dealt = 0; ui.revealed = ui.seen; ui.collecting = false; ui.room = null; ui.error = ''; applyRoom(r); startPoll(); render(); }

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
    if (a === 'ladder') return openLadder();
    if ((a === 'copy-code' || a === 'copy-link') && ui.room) {
      var link = location.origin + location.pathname + '#join=' + ui.room.code;
      var text = a === 'copy-code' ? ui.room.code : 'Join my MVP VS room on fantasy.pcmt.gg: ' + link;
      return copyText(text).then(function (ok) {
        var say = $('tt-copied'); if (!say) return;
        say.textContent = ok ? (a === 'copy-code' ? 'Room code copied. Paste it to your friends.' : 'Invite link copied. Opening it joins the room.') : 'Couldn\u2019t copy. Select the code and copy it yourself.';
      });
    }
    if (a === 'bot' || a === 'again') {
      var region = a === 'again' ? ui.state.region : ui.region;
      ui.mode = 'bot'; ui.me = 0; ui.names = ['You', 'Bot']; ui.seen = 0; ui.error = ''; ui.dealt = 0; ui.revealed = 0; ui.collecting = false;
      ui.state = newGame(region, (Math.random() * 4294967296) >>> 0, 0, a === 'again' ? limitOf(ui.state) : ui.rounds); render(); // you always pick first against the bot
    } else if (a === 'next') {
      if (!ui.collecting) collect();
    } else if (a === 'leave') {
      // Before the deal, leaving gives the seat back (the host leaving closes the room); after it, the game stays as is.
      if (ui.mode === 'online' && ui.room) rpc('trumps_leave', { p_code: ui.room.code }).catch(function () {});
      stopPoll(); ui.mode = 'lobby'; ui.state = null; ui.room = null; ui.error = ''; render();
    } else if (a === 'start') {
      var R = ui.room; if (!R || ui.busy) return;
      ui.busy = true; ui.error = ''; render();
      var dealt = newGame(R.region, (Math.random() * 4294967296) >>> 0, undefined, limitOf(R.state), (R.players || []).length);
      rpc('trumps_start', { p_code: R.code, p_version: ui.version, p_state: dealt }).then(function (v) {
        ui.busy = false; ui.version = v; ui.room.started = true; ui.state = dealt; ui.seen = 0; ui.dealt = 0; ui.revealed = 0; render();
      }).catch(function (err) { ui.busy = false; ui.error = err.message; render(); });
    } else if (a === 'signin') {
      signIn();
    } else if (a === 'create') {
      ui.busy = true; ui.error = ''; render();
      rpc('trumps_create', { p_region: ui.region, p_state: { region: ui.region, limit: ui.rounds, lobby: true } })
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
  window.PCMT_TRUMPS = { newGame: newGame, play: play, botPick: botPick, STATS: STATS, ROUND_LIMIT: ROUND_LIMIT, cards: CARDS, cardHTML: cardHTML, deckCards: deckCards, tierOf: tierOf, TIERS: TIERS };
  function start() {
    if (!$('tt-app')) return;   // loaded on a page without the game (backend.html, for cardHTML): nothing to start
    takeRedirectTokens();
    session = readSession();
    render();
    if (!session) joinFromLink();
    if (session) refreshIfNeeded().then(function () {
      if (!session) return render();
      joinFromLink();
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
