// Deck Breakdown (deck-breakdown.html): every player in The Deck's store, ranked by the points they've scored for decks,
// with their two best games. A game opens its scoring table (every event, map by map); a map opens that map's table.
// The scoring is league.js's (PCMT_LEAGUE.seriesBreakdown, the same rules decks are scored with), so every number here
// adds up to what a deck earns. A player's points: every series counts, except NA Stage 1 series, where a player's two
// best series count (the stage rule).
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var fmt = function (n) { n = Math.round((+n || 0) * 10) / 10; return (n % 1 ? n.toFixed(1) : String(n)); };
  var signed = function (n) { return (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n)); };
  var ROLE_ICONS = { duelist: 'assets/3911a104cbddaf481d7a7bf070a2e696.png', initiator: 'assets/8f7fb7ffa93c48ba09a00fcd223c7f7c.png',
    sentinel: 'assets/006daf34642009c6f6749139f80a613e.png', controller: 'assets/783fdcc50fe04d2622938ee185d4ed32.png' };
  var ui = { region: 'NA', q: '', rows: { NA: [], EMEA: [] }, removed: {} };
  try { var saved = localStorage.getItem('pcmt-deck-region'); if (saved === 'EMEA' || saved === 'NA') ui.region = saved; } catch (e) {}
  var L = null;

  // ---------- teams: region, logo, name (players.js, edits from the backend, the season's team cards) ----------
  var TEAMS = {};
  function loadTeams() {
    (window.PCMT_SITE_TEAMS || []).forEach(function (t) {
      var cur = TEAMS[t.code];
      if (cur && !cur.retired && t.retired) return;   // a code used again: the active team wins
      TEAMS[t.code] = { code: t.code, name: t.name, region: t.region || 'NA', logo: t.logo || '', retired: !!t.retired, color: t.color, active: !t.retired || (cur && cur.active) };
    });
    (window.PCMT_DECK_TEAMS || []).forEach(function (t) {
      var x = TEAMS[t.code] || (TEAMS[t.code] = { code: t.code });
      if (t.name) x.name = t.name; if (t.region) x.region = t.region; if (t.logo) x.logo = t.logo; if (t.color) x.color = t.color;
      if (t.retired != null) { x.retired = !!t.retired; x.active = !t.retired; }
    });
    (window.PCMT_SEASON_TEAMS || []).forEach(function (s) {
      (s.teams || []).forEach(function (t) { var x = TEAMS[t.label]; if (x && !x.logo && t.logo) x.logo = t.logo; });
    });
  }
  // In the store: an active team's player (a team code used again only for its Season 4 players), not taken out on the backend.
  function inStore(p) {
    var t = TEAMS[p.team];
    if (!t || ui.removed[p.id]) return false;
    var retired = (window.PCMT_SITE_TEAMS || []).some(function (x) { return x.code === p.team && x.retired; });
    return !(retired && (!t.active || !/-s4$/.test(p.id)));
  }
  function regionOf(p) { return (p.regions && p.regions[0]) || (TEAMS[p.team] || {}).region || 'NA'; }
  function roleOf(p) { var r = String(p.role || '').split('/')[0]; return r === 'yoru' ? 'duelist' : r; }

  // ---------- the leaderboard ----------
  function build() {
    var results = window.PCMT_RESULTS || [], games = {};
    results.forEach(function (r) {
      var sp = L.seriesPoints(r), stage = L.inNaStage(r);
      Object.keys(sp).forEach(function (id) { (games[id] = games[id] || []).push({ r: r, pts: sp[id], stage: stage }); });
    });
    ui.rows = { NA: [], EMEA: [] };
    L.players.forEach(function (p) {
      if (!inStore(p)) return;
      var rg = regionOf(p), list = (games[p.id] || []).filter(function (g) { return (g.r.region === 'EMEA' ? 'EMEA' : 'NA') === rg; });
      // every series counts, except NA Stage 1, where the two best stage series count
      var stage = list.filter(function (g) { return g.stage; }).sort(function (a, b) { return b.pts - a.pts; }).slice(0, 2);
      var total = list.filter(function (g) { return !g.stage; }).reduce(function (t, g) { return t + g.pts; }, 0) + stage.reduce(function (t, g) { return t + g.pts; }, 0);
      var best = list.slice().sort(function (a, b) { return b.pts - a.pts || Date.parse(b.r.start) - Date.parse(a.r.start); }).slice(0, 2);
      ui.rows[rg].push({ p: p, total: Math.round(total * 10) / 10, best: best, played: list.length });
    });
    ['NA', 'EMEA'].forEach(function (rg) {
      ui.rows[rg].sort(function (a, b) { return b.total - a.total || b.played - a.played || a.p.name.localeCompare(b.p.name); });
      var rank = 0, last = null;
      ui.rows[rg].forEach(function (x, i) { if (x.total !== last) { rank = i + 1; last = x.total; } x.rank = rank; });
    });
  }
  function when(r) { return new Date(r.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' }); }
  function logo(code, size) {
    var t = TEAMS[code];
    return t && t.logo ? '<img class="bd-logo" src="' + esc(t.logo) + '" alt="" width="' + size + '" height="' + size + '">' : '<span class="bd-logo bd-nologo" aria-hidden="true">' + esc(String(code || '?').slice(0, 1)) + '</span>';
  }
  function gameHTML(id, g, idx) {
    var b = L.seriesBreakdown(g.r, id); if (!b) return '';
    var key = id + '|' + idx;
    return '<div class="bd-game"><button type="button" class="bd-chip bd-chip-game" data-game="' + esc(key) + '" aria-label="' + esc('Game vs ' + b.opp + ', ' + when(g.r) + ': ' + fmt(b.pts) + ' points. Open the scoring table') + '">' +
      '<span class="bd-vs">vs</span>' + logo(b.opp, 18) + '<span>' + esc(b.opp) + '</span><span class="bd-when">' + esc(when(g.r)) + '</span><b>' + fmt(b.pts) + '</b></button>' +
      b.maps.map(function (m, i) {
        var res = m.us == null ? '' : m.us > m.them ? 'w' : m.us < m.them ? 'l' : '';
        return '<button type="button" class="bd-chip bd-chip-map ' + res + '" data-map="' + esc(key + '|' + i) + '" aria-label="' + esc('Map ' + (i + 1) + ', ' + m.map + (m.us == null ? '' : ', ' + m.us + ' to ' + m.them) + ': ' + fmt(m.pts) + ' points. Open the scoring table') + '">' +
          '<span>' + esc(m.map) + '</span>' + (m.us == null ? '' : '<small>' + m.us + '–' + m.them + '</small>') + '<b>' + fmt(m.pts) + '</b></button>';
      }).join('') + '</div>';
  }
  function render() {
    var list = ui.rows[ui.region], q = ui.q.trim().toLowerCase();
    var shown = list.filter(function (x) { return !q || x.p.name.toLowerCase().indexOf(q) >= 0 || String(x.p.team).toLowerCase().indexOf(q) >= 0 || String((TEAMS[x.p.team] || {}).name || '').toLowerCase().indexOf(q) >= 0; });
    document.querySelectorAll('[data-region]').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-region') === ui.region ? 'true' : 'false'); });
    $('bd-note').textContent = ui.region === 'NA' ? 'NA Season 4 · Stage 1: a player’s two best series count, like on The Deck.' : 'EMEA: every series counts.';
    $('bd-count').textContent = shown.length + ' of ' + list.length + ' players';
    $('bd-rows').innerHTML = shown.map(function (x) {
      var p = x.p, role = roleOf(p);
      return '<li class="bd-row">' +
        '<span class="bd-rank">' + x.rank + '</span>' +
        '<span class="bd-who">' + logo(p.team, 30) + '<span class="bd-name"><b>' + esc(p.name) + '</b><small>' + (ROLE_ICONS[role] ? '<img src="' + ROLE_ICONS[role] + '" alt="" width="14" height="14">' : '') +
          esc(p.team) + ' · ' + esc(role || '') + '</small></span></span>' +
        '<span class="bd-pts"><b>' + fmt(x.total) + '</b><small>pts</small></span>' +
        '<span class="bd-best">' + (x.best.length ? x.best.map(function (g, i) { return gameHTML(p.id, g, i); }).join('') : '<span class="bd-none">No games yet</span>') + '</span>' +
        '</li>';
    }).join('') || '<li class="bd-empty">' + (q ? 'No players match that search.' : 'No players yet.') + '</li>';
  }

  // ---------- the scoring tables ----------
  function find(key) {   // "<player id>|<0 or 1>" -> { p, g, b }
    var k = key.split('|'), id = k[0], row = ui.rows[ui.region].filter(function (x) { return x.p.id === id; })[0];
    var g = row && row.best[+k[1]];
    return g ? { p: row.p, g: g, b: L.seriesBreakdown(g.r, id) } : null;
  }
  function tableHTML(b, mapIdx) {
    var ev = L.events, oneMap = mapIdx != null, m = oneMap ? b.maps[mapIdx] : null;
    var cols = oneMap ? [] : b.maps;
    var head = '<tr><th scope="col">Event</th><th scope="col">Per</th>' +
      (oneMap ? '<th scope="col" class="n">Count</th>' : cols.map(function (x, i) { return '<th scope="col" class="n">' + esc(x.map) + '<small>Map ' + (i + 1) + '</small></th>'; }).join('') + '<th scope="col" class="n">Game</th>') +
      '<th scope="col" class="n">Value</th><th scope="col" class="n">Points</th></tr>';
    var body = ev.map(function (e) {
      var v = b.values[e.key], count, pts;
      if (oneMap) {
        if (!e.map) return '<tr class="bd-whole"><th scope="row">' + esc(e.label) + '</th><td>' + esc(e.per) + '</td><td class="n" colspan="1">whole game</td><td class="n">' + signed(v) + '</td><td class="n">–</td></tr>';
        var mapsHave = !(e.key === 'assist' || e.key === 'fb') || b.mapStats || (m.rows.assist != null || m.rows.fb != null);
        count = m.rows[e.key] || 0; pts = count * v;
        return '<tr' + (count ? ' class="on"' : '') + '><th scope="row">' + esc(e.label) + '</th><td>' + esc(e.per) + '</td><td class="n">' + (mapsHave ? count : 'n/a') + '</td><td class="n">' + signed(v) + '</td><td class="n">' + (count ? signed(pts) : '–') + '</td></tr>';
      }
      count = b.game[e.key] || 0; pts = count * v;
      var cells = cols.map(function (x) {
        if (!e.map) return '<td class="n bd-dim">·</td>';
        var has = !(e.key === 'assist' || e.key === 'fb') || b.mapStats;
        return '<td class="n">' + (has ? (x.rows[e.key] || 0) || '<span class="bd-dim">0</span>' : '<span class="bd-dim">n/a</span>') + '</td>';
      }).join('');
      return '<tr' + (count ? ' class="on"' : '') + '><th scope="row">' + esc(e.label) + '</th><td>' + esc(e.per) + '</td>' + cells + '<td class="n"><b>' + count + '</b></td><td class="n">' + signed(v) + '</td><td class="n">' + (count ? signed(pts) : '–') + '</td></tr>';
    }).join('');
    var foot = oneMap ?
      '<tr class="bd-total"><th scope="row" colspan="4">Points on this map</th><td class="n">' + fmt(m.pts) + '</td></tr>' :
      '<tr class="bd-total"><th scope="row" colspan="2">Points</th>' + cols.map(function (x) { return '<td class="n">' + fmt(x.pts) + '</td>'; }).join('') + '<td class="n" colspan="2"></td><td class="n">' + fmt(b.pts) + '</td></tr>';
    return '<div class="bd-tablewrap" tabindex="0" role="region" aria-label="Scoring table"><table class="bd-table"><thead>' + head + '</thead><tbody>' + body + '</tbody><tfoot>' + foot + '</tfoot></table></div>';
  }
  var lastFocus = null;
  function openWindow(key, mapIdx) {
    var x = find(key); if (!x) return;
    var b = x.b, r = x.g.r, m = mapIdx != null ? b.maps[mapIdx] : null;
    var score = b.maps.map(function (z) { return z.us == null ? '' : z.us + '–' + z.them; }).filter(Boolean).join(', ');
    var won = r.winner === x.p.team;
    $('bd-win-title').textContent = x.p.name + (m ? ' · ' + m.map : ' · vs ' + b.opp);
    $('bd-win-sub').innerHTML = esc((m ? 'Map ' + (mapIdx + 1) + ' of ' + x.p.team + ' vs ' + b.opp + (m.us == null ? '' : ' · ' + m.us + '–' + m.them) :
      x.p.team + ' vs ' + b.opp + ' · ' + (won ? 'won' : 'lost') + (score ? ' (' + score + ')' : '')) + ' · ' + when(r) + (x.g.stage ? ' · NA Stage 1' : '')) +
      (r.url ? ' · <a href="' + esc(r.url) + '" target="_blank" rel="noopener">PCMT.gg</a>' : '');
    $('bd-win-body').innerHTML = tableHTML(b, mapIdx) +
      (m ? '<p class="bd-foot">Toxic rating, top ACS and KAST, ADR, the series score and 4Ks/5Ks count for the whole game.' + (b.mapStats ? '' : ' Assists and first bloods for each map aren’t in yet: they show in the game’s table.') + '</p>' +
        '<div class="bd-win-actions"><button type="button" class="bd-btn" data-game="' + esc(key) + '">Open the whole game</button></div>' :
        '<p class="bd-foot">Kills, assists and first bloods are scored from the game’s totals on PCMT.gg' + (b.mapStats ? '; a map’s own numbers can differ by one when PCMT.gg’s map and game totals don’t match.' : '.') +
        ' Game: the count for the whole game. 4Ks and 5Ks are entered by the PCMT Team after each game.</p>' +
        '<div class="bd-win-actions">' + b.maps.map(function (z, i) { return '<button type="button" class="bd-btn ghost" data-map="' + esc(key + '|' + i) + '">' + esc(z.map) + '</button>'; }).join('') + '</div>');
    var win = $('bd-win');
    if (win.hidden) { lastFocus = document.activeElement; win.hidden = false; document.body.classList.add('bd-modal'); }
    setTimeout(function () { $('bd-win-close').focus(); }, 0);
  }
  function closeWindow() {
    $('bd-win').hidden = true; document.body.classList.remove('bd-modal');
    try { if (lastFocus && document.body.contains(lastFocus)) lastFocus.focus(); } catch (e) {}
  }

  // ---------- events ----------
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('button, [data-close]');
    if (!t) { if (e.target.id === 'bd-win') closeWindow(); return; }
    if (t.hasAttribute('data-region')) { ui.region = t.getAttribute('data-region'); try { localStorage.setItem('pcmt-deck-region', ui.region); } catch (x) {} return render(); }
    if (t.hasAttribute('data-game')) return openWindow(t.getAttribute('data-game'));
    if (t.hasAttribute('data-map')) { var k = t.getAttribute('data-map').split('|'); return openWindow(k[0] + '|' + k[1], +k[2]); }
    if (t.hasAttribute('data-close')) return closeWindow();
  });
  document.addEventListener('keydown', function (e) {
    var win = $('bd-win'); if (!win || win.hidden) return;
    if (e.key === 'Escape') { e.preventDefault(); return closeWindow(); }
    if (e.key === 'Tab') {   // keep focus inside the window
      var f = [].slice.call(win.querySelectorAll('button, a[href], [tabindex="0"]')).filter(function (x) { return x.offsetParent !== null; });
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });
  $('bd-q').addEventListener('input', function () { ui.q = this.value; render(); });

  // ---------- start ----------
  function start() {
    L = window.PCMT_LEAGUE;
    var auth = window.PCMT_AUTH;
    if (auth && auth.signedIn) { $('bd-auth-label').textContent = auth.label; $('bd-auth').setAttribute('href', 'login.html'); }
    loadTeams();
    var removed = L.apiAll('/rest/v1/store_removed_players?select=player&order=player').catch(function () { return []; });
    return removed.then(function (rows) {
      (rows || []).forEach(function (x) { ui.removed[x.player] = true; });
      build(); render();
      $('bd-loading').hidden = true;
    });
  }
  (window.PCMT_LEAGUE_READY || Promise.resolve()).then(start).catch(function (e) {
    console.warn(e); $('bd-loading').textContent = 'Couldn’t load the breakdown. Refresh to try again.';
  });
})();
