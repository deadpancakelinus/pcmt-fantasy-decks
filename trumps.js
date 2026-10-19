// PCMT MVP VS (Top Trumps-style game, private beta). Rules engine, bot, online rooms (Supabase) and the page UI.
// Cards come from trumps-cards.js (built by trumps/build_cards.py). Database setup: setup/trumps-setup.sql.
(function () {
  'use strict';
  var CARDS = window.PCMT_TRUMPS_CARDS || { na: [], emea: [] };
  var SB_URL = 'https://wwrsavqipkxvdsxcemos.supabase.co';
  var SB_KEY = 'sb_publishable_e8v-uyAo4fnvwJCHUVA5FQ_LXR6yYM7';
  var TOKEN_KEY = 'pcmt-auth'; // same sign-in as the rest of the site
  var ROUND_LIMIT = 60;
  var REGIONS = { na: { label: 'NA', season: 'S3 NA', logo: 'assets/c265e976f8968e60e4a2bdd32542b499.png' },
                  emea: { label: 'EMEA', season: 'S2 EMEA', logo: 'assets/3c7e7374dceead68d5c58818d0bcfe8a.png' } };
  var STATS = [
    { k: 'toxic', label: 'Toxics rating', fmt: function (v) { return v.toFixed(2); } },
    { k: 'acs', label: 'ACS', fmt: String },
    { k: 'kast', label: 'KAST', fmt: function (v) { return v + '%'; } },
    { k: 'mechanics', label: 'Mechanics', fmt: String },
    { k: 'brains', label: 'Brains', fmt: String }
  ];
  var LOGOS = {
    '100T': '2afecaefb84157c171a79e0bae8932b5.png', ATLC: '086abe908c829ddcb51bee4b1db16b83.png', BAKA: '09e5595acee6eb70652c84027ef2e6d6.png',
    C9: '46ec4a1f510710db9670e64c202b0cee.png', DFM: 'a59455af931db22aaf5f61e2da9f3686.png', EPY: '2b237feaf70d67ef58a84efbab9a3e51.png',
    FNC: '8a102a19e71060bb2dacb6d6b5263457.png', FSG: 'ad1fa170a11534a10c9a953f0a092175.png', FaZe: '9da6e0491a922186cad6bc5daf699626.png',
    HOT: 'e078dfeeea5c9d916197f71d8b7ea80a.jpg', IHOP: '209d81a7df0d79fc71d99063600358ef.png', LARP: 'f06cf372e21c32dbf3754b8bd506e0b5.jpg',
    NATS: '8cbc4258cff847c1db533f124fd9addf.jpg', NAVI: 'f6b846609af48437299bc42d13d5dad0.png', NIP: 'f953d56be563808b39dbb961891fae8e.png',
    NOOT: '195da1efa2549707b6737764479c066c.png', RRQ: '2c8df8598d3c163942e4d347ee4d7e8e.png', SEAL: '7f2055fcc7e78ae7d1510fe56608fd83.png',
    SOG: '85e0857300495ee3133b6acf79e286c0.png', SPG: 'fb1551434b59a200d90d2e9ed6a51e8b.png', SRB: '24ce287349ef3d8ae3c603e22142a375.png',
    SSG: '1e20352a30572a577222d14b6a2389ce.png', T1: 'ce2bf22e2df8751703c00f132b854650.png', TL: '18b0eb4cbe217fc77dda8f01e3ff4c16.png',
    TS: '56f2be02d04c1bb89902b3eb4f989ac4.png', XTC: '570eadcaf88a4d369017946bff2b0356.png'
  };

  // ---------- rules engine (pure; both online players run the same code) ----------
  var BY_ID = {}, RANK = {};
  Object.keys(CARDS).forEach(function (r) {
    CARDS[r].forEach(function (c) { BY_ID[c.id] = c; });
    STATS.forEach(function (s) {
      var vals = CARDS[r].map(function (c) { return c[s.k]; }).sort(function (a, b) { return a - b; });
      CARDS[r].forEach(function (c) {
        RANK[c.id] = RANK[c.id] || {};
        RANK[c.id][s.k] = vals.length > 1 ? vals.indexOf(c[s.k]) / (vals.length - 1) : 0.5;
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
  function newGame(region, seed) {
    var r = rng(seed), ids = CARDS[region].map(function (c) { return c.id; });
    for (var i = ids.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)), t = ids[i]; ids[i] = ids[j]; ids[j] = t; }
    var even = ids.length - (ids.length % 2), hands = [[], []];
    for (var k = 0; k < even; k++) hands[k % 2].push(ids[k]);
    return { region: region, seed: seed, hands: hands, pot: ids.slice(even), turn: r() < 0.5 ? 0 : 1, round: 1, last: null, over: null };
  }
  function play(s, stat) {
    if (s.over) return s;
    s = JSON.parse(JSON.stringify(s));
    var a = s.hands[0].shift(), b = s.hands[1].shift(), picker = s.turn;
    var va = BY_ID[a][stat], vb = BY_ID[b][stat];
    var w = va > vb ? 0 : vb > va ? 1 : -1, taken = 0;
    if (w < 0) {
      s.pot.push(a, b);
    } else {
      taken = s.pot.length;
      Array.prototype.push.apply(s.hands[w], (w === 0 ? [a, b] : [b, a]).concat(s.pot));
      s.pot = [];
      s.turn = w;
    }
    s.last = { round: s.round, picker: picker, stat: stat, cards: [a, b], winner: w, pot: taken };
    s.round++;
    var n0 = s.hands[0].length, n1 = s.hands[1].length;
    if (!n0 || !n1) s.over = { winner: !n0 && !n1 ? -1 : n0 ? 0 : 1, reason: 'cards' };
    else if (s.round > ROUND_LIMIT) s.over = { winner: n0 === n1 ? -1 : n0 > n1 ? 0 : 1, reason: 'limit' };
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
      return fetch(SB_URL + path, { method: opts.method || 'GET', headers: h, body: opts.body ? JSON.stringify(opts.body) : undefined });
    }).then(function (res) {
      return res.text().then(function (txt) {
        var d = null; try { d = txt ? JSON.parse(txt) : null; } catch (e) { d = txt; }
        if (!res.ok) throw new Error((d && (d.message || d.msg)) || 'Request failed (' + res.status + ')');
        return d;
      });
    });
  }
  function rpc(name, body) { return api('/rest/v1/rpc/' + name, { method: 'POST', body: body }); }
  function myId() { try { return JSON.parse(atob(session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).sub; } catch (e) { return null; } }
  function signIn() {
    location.href = SB_URL + '/auth/v1/authorize?provider=discord&redirect_to=' + encodeURIComponent(location.origin + location.pathname);
  }

  // ---------- page state ----------
  var ui = {
    region: 'na', mode: 'lobby', state: null, me: 0, seen: 0, busy: false, error: '',
    names: ['You', 'Bot'], room: null, version: 0, poll: null, tester: null, joinCode: ''
  };
  try { var saved = localStorage.getItem('pcmt-trumps-region'); if (REGIONS[saved]) ui.region = saved; } catch (e) {}
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  var ROLE_ICONS = { duelist: '3911a104cbddaf481d7a7bf070a2e696.png', initiator: '8f7fb7ffa93c48ba09a00fcd223c7f7c.png',
                    sentinel: '006daf34642009c6f6749139f80a613e.png', controller: '783fdcc50fe04d2622938ee185d4ed32.png' };
  var CHAMP_ICON = 'assets/7dd283457b69773e4aa58012ed89ad9a.png', EMBLEM = 'assets/3bf9d529cabff94109b561693539029f.png';

  // Same build as the player cards in The Deck: team-colour edges, team logo, name, full team name,
  // role icon, and the region logo as a faint watermark behind everything.
  function cardHTML(id, o) {
    o = o || {};
    if (o.hidden) return '<div class="tt-card tt-back" aria-label="Face-down card"><i class="tt-back-in1"></i><i class="tt-back-in2"></i>' +
      '<i class="tt-gem t"></i><i class="tt-gem b"></i><i class="tt-gem l"></i><i class="tt-gem r"></i>' +
      '<span class="tt-back-emblem"><img src="' + EMBLEM + '" alt=""></span></div>';
    var c = BY_ID[id], region = id.split('-')[0], logo = LOGOS[c.team];
    var rows = STATS.map(function (s) {
      var cls = 'tt-stat' + (o.stat === s.k ? ' is-picked ' + (o.result || '') : '');
      var star = c.set.indexOf(s.k) < 0 && (s.k === 'mechanics' || s.k === 'brains') ? '<i title="Placeholder number, to be set by hand">*</i>' : '';
      var inner = '<span class="tt-stat-l">' + s.label + star + '</span><span class="tt-stat-v">' + s.fmt(c[s.k]) + '</span>';
      return o.pick ? '<button type="button" class="' + cls + '" data-stat="' + s.k + '">' + inner + '</button>' : '<div class="' + cls + '">' + inner + '</div>';
    }).join('');
    var nameSize = Math.max(18, Math.min(34, Math.floor(230 / Math.max(4, c.name.length * 0.62))));
    return '<div class="tt-card' + (o.result ? ' ' + o.result : '') + '" style="--team:' + c.color + '">' +
      '<span class="tt-wm" aria-hidden="true"><img src="' + REGIONS[region].logo + '" alt=""></span>' +
      '<span class="tt-edge"></span><div class="tt-card-body">' +
      '<div class="tt-card-top">' + (logo ? '<img class="tt-team" src="assets/' + logo + '" alt="' + esc(c.teamName) + '" title="' + esc(c.teamName) + '">' : '<span class="tt-nologo">SUB</span>') +
      '<span class="tt-maps" title="' + c.maps + ' maps played in ' + REGIONS[region].season + '">' + c.maps + '<small>MAPS</small></span></div>' +
      '<div class="tt-name" style="font-size:' + nameSize + 'px"><span>' + esc(c.name) + '</span>' +
      (c.champ ? '<img src="' + CHAMP_ICON + '" alt="PCMT champion" title="PCMT champion">' : '') + '</div>' +
      '<div class="tt-teamname">' + esc(c.teamName) + ' · ' + REGIONS[region].season + '</div>' +
      '<div class="tt-stats">' + rows + '</div>' +
      '<div class="tt-card-foot">' + (c.role ? '<img src="assets/' + ROLE_ICONS[c.role] + '" alt="' + c.role + '" title="' + c.role.charAt(0).toUpperCase() + c.role.slice(1) + '">' : '<span></span>') +
      (o.pick ? '<span class="tt-hint">Pick a stat</span>' : '') + '</div>' +
      '</div><span class="tt-edge"></span></div>';
  }

  function counts(s) {
    var them = 1 - ui.me;
    return '<div class="tt-counts">' +
      '<div><span>' + esc(ui.names[ui.me]) + '</span><b>' + s.hands[ui.me].length + '</b></div>' +
      '<div><span>Pot</span><b>' + s.pot.length + '</b></div>' +
      '<div><span>' + esc(ui.names[them]) + '</span><b>' + s.hands[them].length + '</b></div>' +
      '<div><span>Round</span><b>' + Math.min(s.round, ROUND_LIMIT) + '<small>/' + ROUND_LIMIT + '</small></b></div></div>';
  }

  function render() {
    var root = $('tt-app'); if (!root) return;
    document.querySelectorAll('[data-region]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-region') === ui.region));
      b.disabled = ui.mode !== 'lobby';
    });
    if (ui.mode === 'lobby') return renderLobby(root);
    var s = ui.state, them = 1 - ui.me, html = '';
    if (ui.mode === 'online' && !ui.room.guest) {
      root.innerHTML = '<div class="tt-panel tt-center"><div class="tt-kicker">ROOM CODE</div><div class="tt-code">' + esc(ui.room.code) + '</div>' +
        '<p>Send this code to the other player. The game starts when they join.</p><p class="tt-dim">' + REGIONS[s.region].label + ' cards · ' + CARDS[s.region].length + ' players</p>' +
        '<button type="button" class="tt-btn ghost" data-act="leave">Leave room</button></div>';
      return;
    }
    html += counts(s);
    var last = s.last, showReveal = last && last.round > ui.seen;
    if (showReveal) {
      var mine = last.cards[ui.me], theirs = last.cards[them], st = STATS.filter(function (x) { return x.k === last.stat; })[0];
      var res = last.winner < 0 ? 'tie' : last.winner === ui.me ? 'win' : 'lose';
      var who = last.picker === ui.me ? 'You' : esc(ui.names[them]);
      var msg = res === 'tie' ? 'Tie on ' + st.label + '. Both cards go to the pot.' :
        res === 'win' ? 'You win the round' + (last.pot ? ' and the pot (+' + (last.pot + 1) + ' cards)' : ' (+1 card)') + '.' :
        esc(ui.names[them]) + ' wins the round' + (last.pot ? ' and the pot' : '') + '.';
      html += '<div class="tt-result ' + res + '"><span>' + who + ' picked <b>' + st.label + '</b></span><strong>' + msg + '</strong></div>';
      html += '<div class="tt-table"><div><div class="tt-seat">' + esc(ui.names[ui.me]) + '</div>' + cardHTML(mine, { stat: last.stat, result: res === 'tie' ? 'tie' : res }) + '</div>' +
        '<div><div class="tt-seat">' + esc(ui.names[them]) + '</div>' + cardHTML(theirs, { stat: last.stat, result: res === 'tie' ? 'tie' : res === 'win' ? 'lose' : 'win' }) + '</div></div>';
      html += '<div class="tt-actions"><button type="button" class="tt-btn" data-act="next">' + (s.over ? 'See result' : 'Next round') + '</button></div>';
    } else if (s.over) {
      var w = s.over.winner, title = w < 0 ? 'Draw' : w === ui.me ? 'You win!' : esc(ui.names[them]) + ' wins';
      html += '<div class="tt-panel tt-center"><div class="tt-kicker">GAME OVER</div><div class="tt-big">' + title + '</div><p>' +
        (s.over.reason === 'limit' ? 'Round ' + ROUND_LIMIT + ' reached, so the most cards wins: ' + s.hands[ui.me].length + ' to ' + s.hands[them].length + '.' : 'Every card ended up in one hand.') +
        '</p><div class="tt-actions">' + (ui.mode === 'bot' ? '<button type="button" class="tt-btn" data-act="again">Play again</button>' : '') +
        '<button type="button" class="tt-btn ghost" data-act="leave">Back to lobby</button></div></div>';
    } else {
      var myTurn = s.turn === ui.me;
      html += '<div class="tt-turn">' + (myTurn ? 'Your pick. Choose the stat you think beats their card.' : esc(ui.names[them]) + ' is picking a stat…') + '</div>';
      html += '<div class="tt-table"><div><div class="tt-seat">' + esc(ui.names[ui.me]) + '</div>' + cardHTML(s.hands[ui.me][0], { pick: myTurn && !ui.busy }) + '</div>' +
        '<div><div class="tt-seat">' + esc(ui.names[them]) + '</div>' + cardHTML(null, { hidden: true }) + '</div></div>';
      html += '<div class="tt-actions"><button type="button" class="tt-btn ghost" data-act="leave">' + (ui.mode === 'online' ? 'Leave room' : 'Quit game') + '</button></div>';
    }
    if (ui.error) html += '<p class="tt-error" role="alert">' + esc(ui.error) + '</p>';
    root.innerHTML = html;
    if (!showReveal && !s.over && s.turn !== ui.me && ui.mode === 'bot' && !ui.busy) {
      ui.busy = true;
      setTimeout(function () { ui.busy = false; ui.state = play(ui.state, botPick(ui.state, 1)); render(); }, 900);
    }
  }

  function renderLobby(root) {
    var n = CARDS[ui.region].length, signedIn = !!session;
    var online = window.PCMT_TRUMPS_PREVIEW
      ? '<p>Online rooms need the site itself (Discord log-in and the game database), so this test copy only has the bot. They work once the page is on a private site preview.</p>'
      : !signedIn
      ? '<p>Online games use your Discord log-in from fantasy.pcmt.gg.</p><button type="button" class="tt-btn discord" data-act="signin">Log in with Discord</button>'
      : ui.tester === false
        ? '<p>Online play is in a private beta and your account isn’t on the tester list yet.</p>'
        : '<div class="tt-actions left"><button type="button" class="tt-btn" data-act="create"' + (ui.busy ? ' disabled' : '') + '>Create a room</button></div>' +
          '<form class="tt-join" data-act="join"><label for="tt-code">Join with a code</label><div><input id="tt-code" maxlength="5" autocomplete="off" placeholder="ABCDE" value="' + esc(ui.joinCode) + '">' +
          '<button type="submit" class="tt-btn ghost"' + (ui.busy ? ' disabled' : '') + '>Join</button></div></form>';
    root.innerHTML =
      '<div class="tt-lobby">' +
      '<div class="tt-panel"><div class="tt-kicker">VS THE BOT</div><h2>Practice game</h2><p>Deal the ' + REGIONS[ui.region].label + ' deck (' + n + ' cards) between you and the bot.</p>' +
      '<button type="button" class="tt-btn" data-act="bot">Deal ' + REGIONS[ui.region].label + ' cards</button></div>' +
      '<div class="tt-panel"><div class="tt-kicker">ONLINE · 1V1</div><h2>Play a friend</h2>' + online + '</div>' +
      '</div>' + (ui.error ? '<p class="tt-error" role="alert">' + esc(ui.error) + '</p>' : '') +
      '<div class="tt-preview"><div class="tt-kicker">' + REGIONS[ui.region].season + ' · TOP 3 BY TOXICS RATING</div><div class="tt-preview-row">' +
      CARDS[ui.region].slice().sort(function (a, b) { return b.toxic - a.toxic; }).slice(0, 3).map(function (c) { return cardHTML(c.id); }).join('') + '</div></div>';
  }

  // ---------- online rooms ----------
  function stopPoll() { clearInterval(ui.poll); ui.poll = null; }
  function applyRoom(r) {
    var changed = !ui.room || r.version !== ui.version || (!ui.room.guest && r.guest);
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
  function enterRoom(r) { ui.mode = 'online'; ui.seen = r.state.last ? r.state.last.round : 0; ui.room = null; ui.error = ''; applyRoom(r); startPoll(); render(); }

  // ---------- actions ----------
  document.addEventListener('click', function (e) {
    var reg = e.target.closest('[data-region]');
    if (reg && ui.mode === 'lobby') { ui.region = reg.getAttribute('data-region'); try { localStorage.setItem('pcmt-trumps-region', ui.region); } catch (x) {} ui.error = ''; return render(); }
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
      ui.mode = 'bot'; ui.me = 0; ui.names = ['You', 'Bot']; ui.seen = 0; ui.error = '';
      ui.state = newGame(region, (Math.random() * 4294967296) >>> 0); render();
    } else if (a === 'next') {
      ui.seen = ui.state.last.round; render();
    } else if (a === 'leave') {
      stopPoll(); ui.mode = 'lobby'; ui.state = null; ui.room = null; ui.error = ''; render();
    } else if (a === 'signin') {
      signIn();
    } else if (a === 'create') {
      ui.busy = true; ui.error = ''; render();
      var g = newGame(ui.region, (Math.random() * 4294967296) >>> 0);
      rpc('trumps_create', { p_region: ui.region, p_state: g })
        .then(function (code) { return api('/rest/v1/trumps_rooms?code=eq.' + encodeURIComponent(code) + '&select=*'); })
        .then(function (rows) { ui.busy = false; enterRoom(rows[0]); })
        .catch(function (err) { ui.busy = false; ui.error = err.message; render(); });
    }
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
  window.PCMT_TRUMPS = { newGame: newGame, play: play, botPick: botPick, STATS: STATS, ROUND_LIMIT: ROUND_LIMIT, cards: CARDS };
  function start() {
    takeRedirectTokens();
    session = readSession();
    render();
    if (session) refreshIfNeeded().then(function () {
      if (!session) return render();
      return rpc('trumps_is_tester', {}).then(function (ok) { ui.tester = !!ok; }, function () { ui.tester = null; }).then(render);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
