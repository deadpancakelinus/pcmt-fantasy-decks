// LosersQ: build a team of 5 with a coach, then the sim bot plays your run through a simulated NA Season 3.
// Players and stats come from trumps-cards.js (the S3 NA cards, from pcmt.gg/stats); each player's numbers per role come
// from losersq-roles.js (every NA S3 map on PCMT.gg, built by tools/losersq-roles.js). Format is NA S3's: two groups
// of 8 (Alpha, Omega), a Bo3 round robin, then the top 4 of each into the same 8-team double elimination bracket
// (lower final and grand final Bo5). Your team takes the place of one real team.
// The engine (LQ) is pure and seeded, so a season code always replays the same season; losersq/test.js runs it in Node.
(function (root) {
  'use strict';

  // ---------- season data (NA S3, finished; from pcmt.gg/api/matches/s3-na.json) ----------
  var TEAMS = {
    C9: 'Clown9', T1: 'Team 1', SRB: 'Sunshine and Rainbows', TS: 'Team Slugshow', SPG: 'Spank Ptheory Gaming',
    BAKA: 'Beautiful and Kinda Adorable', NAVI: 'No Actual Valorant Intelligence', TL: 'Team Dyslexia',
    SSG: 'Squirtle Squad Gaming', RRQ: 'Rage Re-Queuers', FNC: 'cow paulo FaN Club', '100T': "100 Tony's",
    IHOP: 'I Hate Odin Party', EPY: 'Team Entropy', FSG: 'Furry Squirrels Gaming', DFM: 'Dementia Found Me'
  };
  var GROUPS = {
    Alpha: ['C9', 'T1', 'FSG', 'TL', 'SSG', 'RRQ', 'IHOP', 'FNC'],
    Omega: ['SRB', 'SPG', 'TS', 'NAVI', 'BAKA', '100T', 'EPY', 'DFM']
  };
  var LOGOS = {
    '100T': '2afecaefb84157c171a79e0bae8932b5.png', BAKA: '09e5595acee6eb70652c84027ef2e6d6.png', C9: '46ec4a1f510710db9670e64c202b0cee.png',
    DFM: 'a59455af931db22aaf5f61e2da9f3686.png', EPY: '2b237feaf70d67ef58a84efbab9a3e51.png', FNC: '8a102a19e71060bb2dacb6d6b5263457.png',
    FSG: 'ad1fa170a11534a10c9a953f0a092175.png', IHOP: '209d81a7df0d79fc71d99063600358ef.png', NAVI: 'f6b846609af48437299bc42d13d5dad0.png',
    RRQ: '2c8df8598d3c163942e4d347ee4d7e8e.png', SPG: 'fb1551434b59a200d90d2e9ed6a51e8b.png', SRB: '24ce287349ef3d8ae3c603e22142a375.png',
    SSG: '1e20352a30572a577222d14b6a2389ce.png', T1: 'ce2bf22e2df8751703c00f132b854650.png', TL: '18b0eb4cbe217fc77dda8f01e3ff4c16.png',
    TS: '56f2be02d04c1bb89902b3eb4f989ac4.png'
  };
  var MAPS = ['Lotus', 'Ascent', 'Haven', 'Split', 'Summit', 'Sunset', 'Pearl'];   // the 7 most played S3 maps
  // NA S3 playoff bracket, as in pickems.js (na-s3). W3 = winner of series 3, L1 = loser of series 1.
  var BRACKET = [
    { n: 1, round: 'Upper round 1', a: 'A2', b: 'B3', bo: 3 }, { n: 2, round: 'Upper round 1', a: 'B2', b: 'A3', bo: 3 },
    { n: 3, round: 'Upper semifinal', a: 'B1', b: 'W1', bo: 3 }, { n: 4, round: 'Upper semifinal', a: 'A1', b: 'W2', bo: 3 },
    { n: 5, round: 'Lower round 1', a: 'A4', b: 'L1', bo: 3 }, { n: 6, round: 'Lower round 1', a: 'B4', b: 'L2', bo: 3 },
    { n: 7, round: 'Lower round 2', a: 'L3', b: 'W6', bo: 3 }, { n: 8, round: 'Lower round 2', a: 'L4', b: 'W5', bo: 3 },
    { n: 9, round: 'Upper final', a: 'W3', b: 'W4', bo: 3 }, { n: 10, round: 'Lower semifinal', a: 'W7', b: 'W8', bo: 3 },
    { n: 11, round: 'Lower final', a: 'L9', b: 'W10', bo: 5 }, { n: 12, round: 'Grand final', a: 'W9', b: 'W11', bo: 5 }
  ];
  // Where a team finishes when it loses series n.
  var OUT_PLACE = { 5: '7th-8th', 6: '7th-8th', 7: '5th-6th', 8: '5th-6th', 10: '4th', 11: '3rd', 12: '2nd' };

  // ---------- coaches (no budget yet) ----------
  var COACHES = [
    { id: 'tactician', name: 'The Tactician', short: 'Map veto', text: 'Bans the other team\'s best map instead of your worst one, and your map picks play a little better.' },
    { id: 'hype', name: 'The Hype Man', short: 'Momentum', text: 'Win streaks hit twice as hard. Lose a map and the team comes back angrier on the next one.' },
    { id: 'analyst', name: 'The Analyst', short: 'Upsets', text: 'Scouts every team rated above you and finds an edge. No help against teams you should beat.' },
    { id: 'vet', name: 'The Vet', short: 'Playoffs', text: 'Been here before. A real boost in the playoffs, and calm in overtime.' },
    { id: 'bestie', name: 'The Bestie', short: 'Chemistry', text: 'Makes five randoms play like a real roster: full-team chemistry and steadier form.' }
  ];

  // ---------- tuning ----------
  var K = 1.8;              // round win chance = logistic(K x strength difference)
  var FORM = 0.045;         // a team's form on one map (normal, sd)
  var CHEM_PAIR = 0.0045;   // per pair of teammates who played together in S3 (a full real roster: 10 pairs)
  var SEASON_FORM = 0.012; // how a team's whole season goes (normal, sd), drawn once per season
  var MOMENTUM = 0.007;     // per round of a win streak, up to 3
  var PRIOR = 0.93, PRIOR_MAPS = 6;   // small samples (subs) are pulled toward an average player
  var STAND_IN = 0.84;      // a stand-in nobody has heard of
  var ROLE_PRIOR = 5;       // a role's numbers are pulled toward the player's overall rating, as if over this many maps

  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(r) { var u = 1 - r(), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function hash(s) { var h = 2166136261; s = String(s); for (var i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; }
  var CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  function newCode(r) { var s = ''; for (var i = 0; i < 6; i++) s += CODE_CHARS.charAt(Math.floor((r ? r() : Math.random()) * CODE_CHARS.length)); return s; }

  // ---------- players ----------
  // LQ rating: mostly the Toxic rating (pcmt.gg's R1.0), some ACS and KAST, pulled toward average on small samples.
  function rate(c) {
    var raw = 0.6 * c.toxic + 0.25 * c.acs / 240 + 0.15 * c.kast / 72;
    return (raw * c.maps + PRIOR * PRIOR_MAPS) / (c.maps + PRIOR_MAPS);
  }
  // Each player carries roles: { <role>: { maps, toxic, acs, kast, dpr, agents, r } }, only for roles they played in S3
  // (PCMT.gg agent per map). A role's rating starts from that role's own numbers and is pulled toward the player's
  // overall rating on a small sample, so one great map on a new role doesn't make a star. Their listed role
  // (from The Deck / MVP VS) is the default and always allowed.
  function makePool(cards, roleStats) {
    roleStats = roleStats || {};
    return (cards || []).map(function (c) {
      var all = rate(c), roles = {}, rs = roleStats[c.id] || {};
      Object.keys(rs).forEach(function (role) {
        var x = rs[role], raw = 0.6 * x.toxic + 0.25 * x.acs / 240 + 0.15 * x.kast / 72;
        roles[role] = { maps: x.maps, toxic: x.toxic, acs: x.acs, kast: x.kast, dpr: x.dpr, agents: x.agents || [], r: (raw * x.maps + all * ROLE_PRIOR) / (x.maps + ROLE_PRIOR) };
      });
      if (c.role && !roles[c.role]) roles[c.role] = { maps: 0, toxic: c.toxic, acs: c.acs, kast: c.kast, dpr: c.dpr, agents: [], r: all };
      var p = { id: c.id, name: c.name, team: c.team || '', teamName: c.teamName || '', color: c.color || '#a5dcdd', role: c.role || '', mainRole: c.role || '',
        sub: !!c.sub, champ: !!c.champ, maps: c.maps, toxic: c.toxic, acs: c.acs, kast: c.kast, hs: c.hs, dpr: c.dpr, all: all, roles: roles, r: all, roleMaps: c.maps };
      return c.role ? onRole(p, c.role) : p;
    });
  }
  function canPlay(p, role) { return !!(p && p.roles && p.roles[role]); }
  // The player as they play on that role: rating, ACS, KAST and DPR from their maps on it. Unplayed roles: unchanged.
  function onRole(p, role) {
    if (!canPlay(p, role)) return p;
    var x = p.roles[role], q = {};
    for (var k in p) q[k] = p[k];
    q.role = role; q.r = x.r;
    if (x.maps) { q.acs = x.acs; q.kast = x.kast; q.dpr = x.dpr; }
    q.roleMaps = x.maps;
    return q;
  }
  function score100(r) { return Math.round(r * 100); }

  // ---------- teams ----------
  function strengthOf(players, coach) {
    var n = players.length, sum = 0, roles = { duelist: 0, initiator: 0, controller: 0, sentinel: 0 }, pairs = 0, i, j;
    for (i = 0; i < n; i++) { sum += players[i].r; if (roles[players[i].role] != null) roles[players[i].role]++; }
    for (i = 0; i < n; i++) for (j = i + 1; j < n; j++) if (players[i].team && players[i].team === players[j].team) pairs++;
    var role = 0, notes = [];
    if (!roles.controller) { role -= 0.035; notes.push('No controller'); }
    if (!roles.initiator) { role -= 0.02; notes.push('No initiator'); }
    if (!roles.sentinel) { role -= 0.015; notes.push('No sentinel'); }
    if (!roles.duelist) { role -= 0.01; notes.push('No duelist'); }
    if (roles.duelist > 2) { role -= 0.015 * (roles.duelist - 2); notes.push(roles.duelist + ' duelists'); }
    var chem = pairs * CHEM_PAIR;
    if (coach === 'bestie') chem = Math.max(chem, 10 * CHEM_PAIR);
    var base = n ? sum / n : 0;
    return { base: base, role: role, chem: chem, pairs: pairs, roles: roles, notes: notes, total: base + role + chem };
  }

  // Builds the 16 teams. opts.mine = { name, players: [card ids], coach }, opts.replace = team code your team replaces.
  function makeLeague(pool, opts) {
    var byId = {}, taken = {}, mine = opts.mine, replace = opts.replace;
    pool.forEach(function (p) { byId[p.id] = p; });
    (mine.players || []).forEach(function (id) { taken[id] = true; });
    var subs = pool.filter(function (p) { return !p.team && !taken[p.id]; }).sort(function (a, b) { return b.r - a.r; });
    var teams = {}, order = [];
    Object.keys(GROUPS).forEach(function (g) {
      GROUPS[g].forEach(function (code) {
        var t;
        if (code === replace) {
          var set = mine.roles || {};
          var players = mine.players.map(function (id) { var p = byId[id]; return p && set[id] ? onRole(p, set[id]) : p; }).filter(Boolean);
          t = { code: 'YOU', name: mine.name || 'LosersQ', color: '#ff4655', logo: '', players: players, coach: mine.coach || '', mine: true, replaced: code };
        } else {
          var own = pool.filter(function (p) { return p.team === code && !taken[p.id]; }).sort(function (a, b) { return b.maps - a.maps || b.r - a.r; });
          var five = own.slice(0, 5), missing = 5 - five.length;
          for (var k = 0; k < missing; k++) {
            var s = subs.shift();
            five.push(s || { id: 'standin-' + code + '-' + k, name: 'Stand-in ' + (k + 1), team: '', role: '', r: STAND_IN, maps: 0, acs: 200, kast: 68, dpr: 0.78, toxic: 0.84, standin: true });
          }
          t = { code: code, name: TEAMS[code], color: (own[0] || pool.filter(function (p) { return p.team === code; })[0] || {}).color || '#a5dcdd',
            logo: LOGOS[code] || '', players: five, coach: '', mine: false, lost: missing };
        }
        t.group = g;
        t.str = strengthOf(t.players, t.coach);
        teams[t.code] = t; order.push(t.code);
      });
    });
    return { teams: teams, order: order, groups: { Alpha: GROUPS.Alpha.map(function (c) { return c === replace ? 'YOU' : c; }), Omega: GROUPS.Omega.map(function (c) { return c === replace ? 'YOU' : c; }) } };
  }

  // ---------- one map ----------
  function comfortFor(team, r) { var m = { _season: gauss(r) * SEASON_FORM }; MAPS.forEach(function (map) { m[map] = gauss(r) * 0.02 + (team.coach === 'tactician' ? 0.01 : 0); }); return m; }

  function veto(A, B, bo, comfort) {
    var left = MAPS.slice(), maps = [];
    function score(t, o, map) { return comfort[t.code][map] - comfort[o.code][map]; }
    function ban(t, o) {
      // A normal team bans its own worst map; the Tactician bans the map that's worst for you against them.
      var best = null, bv = Infinity;
      left.forEach(function (map) { var v = t.coach === 'tactician' ? score(t, o, map) : comfort[t.code][map]; if (v < bv) { bv = v; best = map; } });
      left.splice(left.indexOf(best), 1);
    }
    function pick(t, o) {
      var best = null, bv = -Infinity;
      left.forEach(function (map) { var v = t.coach === 'tactician' ? score(t, o, map) : comfort[t.code][map]; if (v > bv) { bv = v; best = map; } });
      left.splice(left.indexOf(best), 1); maps.push({ map: best, pick: t.code });
    }
    ban(A, B); ban(B, A);
    pick(A, B); pick(B, A);
    if (bo === 5) { pick(A, B); pick(B, A); } else { ban(A, B); ban(B, A); }
    maps.push({ map: left[0], pick: '' });
    return maps;
  }

  function edge(t, o, ctx) {
    var e = t.str.total + ctx.comfort[t.code]._season + ctx.comfort[t.code][ctx.map] + (ctx.pick === t.code && t.coach === 'tactician' ? 0.008 : 0);
    if (t.coach === 'analyst' && o.str.total > t.str.total) e += 0.022;
    if (t.coach === 'vet' && ctx.playoffs) e += 0.025;
    if (t.coach === 'hype' && ctx.lostLast[t.code]) e += 0.02;
    return e;
  }

  function playMap(A, B, ctx, r, withStats) {
    var fa = gauss(r) * FORM * (A.coach === 'bestie' ? 0.6 : 1), fb = gauss(r) * FORM * (B.coach === 'bestie' ? 0.6 : 1);
    var ea = edge(A, B, ctx) + fa, eb = edge(B, A, ctx) + fb;
    var a = 0, b = 0, streak = 0, rounds = [];   // streak > 0: A on a run, < 0: B
    while (true) {
      var mom = Math.min(Math.abs(streak), 3) * MOMENTUM, ot = a >= 12 && b >= 12;
      var ma = streak > 0 ? mom * (A.coach === 'hype' ? 2 : 1) : 0, mb = streak < 0 ? mom * (B.coach === 'hype' ? 2 : 1) : 0;
      var d = (ea + ma) - (eb + mb);
      if (ot) d += (A.coach === 'vet' ? 0.02 : 0) - (B.coach === 'vet' ? 0.02 : 0);
      var p = 1 / (1 + Math.exp(-K * d));
      if (r() < p) { a++; streak = streak > 0 ? streak + 1 : 1; rounds.push(1); } else { b++; streak = streak < 0 ? streak - 1 : -1; rounds.push(0); }
      if ((a >= 13 || b >= 13) && Math.abs(a - b) >= 2) break;
      if (a + b >= 48) break;   // never happens in practice; just a guard
    }
    var res = { map: ctx.map, pick: ctx.pick, a: a, b: b };
    if (withStats) {
      var R = a + b, killsA = Math.round(a * 4.25 + b * 2.55 + gauss(r) * 3), killsB = Math.round(b * 4.25 + a * 2.55 + gauss(r) * 3);
      res.sa = boxScore(A.players, killsA, killsB, R, r);
      res.sb = boxScore(B.players, killsB, killsA, R, r);
    }
    return res;
  }

  var ROLE_K = { duelist: 1.12, initiator: 1, sentinel: 0.96, controller: 0.92, '': 1 };
  var ROLE_A = { duelist: 0.7, initiator: 1.35, sentinel: 0.9, controller: 1.2, '': 1 };
  function split(total, weights) {
    var sum = weights.reduce(function (s, w) { return s + w; }, 0), out = weights.map(function (w) { return Math.floor(total * w / sum); });
    var left = total - out.reduce(function (s, x) { return s + x; }, 0), order = weights.map(function (w, i) { return [total * w / sum - out[i], i]; }).sort(function (x, y) { return y[0] - x[0]; });
    for (var i = 0; i < left; i++) out[order[i % order.length][1]]++;
    return out;
  }
  function boxScore(players, kills, deaths, R, r) {
    var kw = players.map(function (p) { return Math.pow(p.r, 2) * ROLE_K[p.role || ''] * Math.exp(gauss(r) * 0.3); });
    var dw = players.map(function (p) { return (p.dpr || 0.75) * (p.role === 'duelist' ? 1.08 : 1) * Math.exp(gauss(r) * 0.18); });
    var aw = players.map(function (p) { return ROLE_A[p.role || ''] * Math.exp(gauss(r) * 0.3); });
    var K_ = split(Math.max(0, kills), kw), D_ = split(Math.max(0, deaths), dw), A_ = split(Math.max(0, Math.round(kills * 0.42)), aw);
    return players.map(function (p, i) {
      var kpr = K_[i] / R, dpr = D_[i] / R, apr = A_[i] / R;
      return { id: p.id, k: K_[i], d: D_[i], a: A_[i], acs: Math.round(200 * kpr + 25 * apr + 40 + gauss(r) * 8), rating: 0.5 * kpr / 0.72 + 0.3 * (1 - dpr) / 0.28 + 0.2 * apr / 0.28, r: R };
    });
  }

  // ---------- one series ----------
  function playSeries(A, B, bo, ctx, r, withStats) {
    var comfort = ctx.comfort, maps = veto(A, B, bo, comfort), need = Math.ceil(bo / 2), wa = 0, wb = 0, played = [], lostLast = {};
    for (var i = 0; i < maps.length && wa < need && wb < need; i++) {
      var m = playMap(A, B, { map: maps[i].map, pick: maps[i].pick, comfort: comfort, playoffs: ctx.playoffs, lostLast: lostLast }, r, withStats);
      played.push(m);
      lostLast = {};
      if (m.a > m.b) { wa++; lostLast[B.code] = true; } else { wb++; lostLast[A.code] = true; }
    }
    return { a: A.code, b: B.code, bo: bo, maps: played, score: [wa, wb], winner: wa > wb ? A.code : B.code, loser: wa > wb ? B.code : A.code };
  }

  // ---------- season ----------
  function roundRobin(codes) {   // circle method: 7 rounds of 4 for 8 teams
    var t = codes.slice(), rounds = [];
    for (var k = 0; k < t.length - 1; k++) {
      var games = [];
      for (var i = 0; i < t.length / 2; i++) { var x = t[i], y = t[t.length - 1 - i]; games.push(k % 2 ? [y, x] : [x, y]); }
      rounds.push(games);
      t.splice(1, 0, t.pop());
    }
    return rounds;
  }

  function addStats(tot, list) {
    list.forEach(function (s) {
      var x = tot[s.id] || (tot[s.id] = { id: s.id, maps: 0, k: 0, d: 0, a: 0, acsSum: 0, ratingSum: 0, rounds: 0 });
      x.maps++; x.k += s.k; x.d += s.d; x.a += s.a; x.acsSum += s.acs * s.r; x.ratingSum += s.rating * s.r; x.rounds += s.r;
    });
  }

  function table(codes, series) {
    var row = {};
    codes.forEach(function (c) { row[c] = { code: c, w: 0, l: 0, mw: 0, ml: 0, rw: 0, rl: 0 }; });
    series.forEach(function (s) {
      var A = row[s.a], B = row[s.b];
      if (s.winner === s.a) { A.w++; B.l++; } else { B.w++; A.l++; }
      A.mw += s.score[0]; A.ml += s.score[1]; B.mw += s.score[1]; B.ml += s.score[0];
      s.maps.forEach(function (m) { A.rw += m.a; A.rl += m.b; B.rw += m.b; B.rl += m.a; });
    });
    var list = codes.map(function (c) { return row[c]; });
    list.sort(function (x, y) {
      if (y.w !== x.w) return y.w - x.w;
      if ((y.mw - y.ml) !== (x.mw - x.ml)) return (y.mw - y.ml) - (x.mw - x.ml);
      var h = series.filter(function (s) { return (s.a === x.code && s.b === y.code) || (s.a === y.code && s.b === x.code); })[0];
      if (h) return h.winner === x.code ? -1 : 1;
      return (y.rw - y.rl) - (x.rw - x.rl);
    });
    return list;
  }

  // Plays a whole season. Returns everything the page shows; withStats adds box scores and season stat totals.
  function simSeason(pool, opts, seed, withStats) {
    var r = rng(seed), L = makeLeague(pool, opts), T = L.teams, comfort = {};
    L.order.forEach(function (c) { comfort[c] = comfortFor(T[c], r); });
    var ctx = { comfort: comfort, playoffs: false }, stats = {}, weeks = [];
    var groups = {};
    Object.keys(L.groups).forEach(function (g) { groups[g] = { codes: L.groups[g], rounds: roundRobin(L.groups[g]), series: [] }; });
    for (var w = 0; w < 7; w++) {
      var week = { label: 'Week ' + (w + 1), stage: 'group', series: [] };
      Object.keys(groups).forEach(function (g) {
        groups[g].rounds[w].forEach(function (pair) {
          var s = playSeries(T[pair[0]], T[pair[1]], 3, ctx, r, withStats);
          s.stage = 'Group ' + g; s.week = w + 1;
          groups[g].series.push(s); week.series.push(s);
          if (withStats) s.maps.forEach(function (m) { addStats(stats, m.sa); addStats(stats, m.sb); });
        });
      });
      weeks.push(week);
    }
    var seeds = {}, tables = {};
    Object.keys(groups).forEach(function (g) {
      tables[g] = table(groups[g].codes, groups[g].series);
      tables[g].forEach(function (row, i) { row.place = i + 1; if (i < 4) seeds[(g === 'Alpha' ? 'A' : 'B') + (i + 1)] = row.code; });
    });
    // Playoffs
    ctx.playoffs = true;
    var res = {}, playoffs = [], place = {};
    function who(slot) {
      var c = slot.charAt(0), n = +slot.slice(1);
      if (c === 'W') return res[n].winner; if (c === 'L') return res[n].loser; return seeds[slot];
    }
    var pWeeks = {};
    BRACKET.forEach(function (b) {
      var A = T[who(b.a)], B = T[who(b.b)], s = playSeries(A, B, b.bo, ctx, r, withStats);
      s.n = b.n; s.round = b.round; s.stage = 'Playoffs'; s.slotA = b.a; s.slotB = b.b;
      res[b.n] = s; playoffs.push(s);
      if (OUT_PLACE[b.n]) place[s.loser] = OUT_PLACE[b.n];
      if (b.n === 12) place[s.winner] = '1st';
      if (withStats) s.maps.forEach(function (m) { addStats(stats, m.sa); addStats(stats, m.sb); });
      (pWeeks[b.round] = pWeeks[b.round] || { label: b.round, stage: 'playoffs', series: [] }).series.push(s);
    });
    ['Upper round 1', 'Upper semifinal', 'Lower round 1', 'Lower round 2', 'Upper final', 'Lower semifinal', 'Lower final', 'Grand final'].forEach(function (k) { weeks.push(pWeeks[k]); });
    Object.keys(tables).forEach(function (g) {
      tables[g].forEach(function (row) { if (row.place > 4) place[row.code] = row.place + 'th in Group ' + g; });
    });
    return { seed: seed, league: L, weeks: weeks, tables: tables, seeds: seeds, playoffs: playoffs, place: place, stats: stats, champion: res[12].winner };
  }

  // The bot's preseason read: plays n quick seasons (no box scores) and counts how far your team gets.
  function project(pool, opts, n, seed) {
    var r = rng(seed || 1), out = { n: n, playoffs: 0, title: 0, final: 0, top4: 0, groupPlace: 0, places: {} };
    for (var i = 0; i < n; i++) {
      var s = simSeason(pool, opts, (r() * 4294967296) >>> 0, false), p = s.place.YOU;
      out.places[p] = (out.places[p] || 0) + 1;
      if (p.indexOf('Group') < 0) out.playoffs++;
      if (p === '1st') out.title++;
      if (p === '1st' || p === '2nd') out.final++;
      if (/^(1st|2nd|3rd|4th)$/.test(p)) out.top4++;
      var g = s.league.teams.YOU.group; out.groupPlace += s.tables[g].filter(function (x) { return x.code === 'YOU'; })[0].place;
    }
    out.groupPlace /= n;
    return out;
  }

  var LQ = { TEAMS: TEAMS, GROUPS: GROUPS, LOGOS: LOGOS, MAPS: MAPS, BRACKET: BRACKET, COACHES: COACHES, rng: rng, hash: hash, newCode: newCode,
    makePool: makePool, onRole: onRole, canPlay: canPlay, strengthOf: strengthOf, makeLeague: makeLeague, simSeason: simSeason, project: project, score100: score100,
    roundRobin: roundRobin };
  if (typeof module !== 'undefined' && module.exports) module.exports = LQ;
  root.PCMT_LOSERSQ = LQ;

  if (typeof document === 'undefined') return;

  // =====================================================================================================
  // Page
  // =====================================================================================================
  var POOL = makePool(((root.PCMT_TRUMPS_CARDS || {}).na) || [], root.PCMT_LQ_ROLES), BY_ID = {};
  POOL.forEach(function (p) { BY_ID[p.id] = p; });
  var ROLE_ICONS = { duelist: '3911a104cbddaf481d7a7bf070a2e696.png', initiator: '8f7fb7ffa93c48ba09a00fcd223c7f7c.png',
    sentinel: '006daf34642009c6f6749139f80a613e.png', controller: '783fdcc50fe04d2622938ee185d4ed32.png' };
  var NA_LOGO = 'assets/c265e976f8968e60e4a2bdd32542b499.png';
  var STORE = 'pcmt-losersq';
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''; }

  var ui = { screen: 'build', name: 'Losers Queue', players: [], roles: {}, coach: 'tactician', replace: 'DFM',
    role: '', team: '', q: '', sort: 'r', proj: null, projKey: '', season: null, code: '', step: 0, timer: null, tab: 'you' };
  try {
    var saved = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (saved) {
      ui.name = typeof saved.name === 'string' ? saved.name.slice(0, 24) : ui.name;
      ui.players = (saved.players || []).filter(function (id) { return BY_ID[id]; }).slice(0, 5);
      if (COACHES.some(function (c) { return c.id === saved.coach; })) ui.coach = saved.coach;
      if (TEAMS[saved.replace]) ui.replace = saved.replace;
      Object.keys(saved.roles || {}).forEach(function (id) { if (ui.players.indexOf(id) >= 0 && canPlay(BY_ID[id], saved.roles[id])) ui.roles[id] = saved.roles[id]; });
    }
  } catch (e) {}
  function save() { try { localStorage.setItem(STORE, JSON.stringify({ name: ui.name, players: ui.players, roles: ui.roles, coach: ui.coach, replace: ui.replace })); } catch (e) {} }
  function opts() { return { mine: { name: ui.name.trim() || 'Losers Queue', players: ui.players.slice(), roles: myRoles(), coach: ui.coach }, replace: ui.replace }; }
  function myRoles() { var o = {}; ui.players.forEach(function (id) { if (ui.roles[id] && ui.roles[id] !== BY_ID[id].mainRole) o[id] = ui.roles[id]; }); return o; }
  function mineP(id) { return ui.roles[id] ? onRole(BY_ID[id], ui.roles[id]) : BY_ID[id]; }

  function qMark(size) {   // the LosersQ "Q": an octagon with the red tail, as in the intro
    return '<svg class="lq-q" width="' + size + '" height="' + size + '" viewBox="0 0 40 40" aria-hidden="true"><path d="M13 4h14l9 9v14l-9 9H13l-9-9V13z" fill="none" stroke="#ece8e1" stroke-width="3.4" stroke-linejoin="miter"/><path d="M22 24l12 12" stroke="#ff4655" stroke-width="4"/></svg>';
  }
  function logoHTML(code, cls) {
    if (code === 'YOU') return '<span class="' + (cls || 'lq-logo') + ' lq-logo-q">' + qMark(22) + '</span>';
    var l = LOGOS[code];
    return l ? '<img class="' + (cls || 'lq-logo') + '" src="assets/' + l + '" alt="" loading="lazy">' : '<img class="' + (cls || 'lq-logo') + '" src="' + NA_LOGO + '" alt="" loading="lazy">';
  }
  var ROLE_LIST = ['duelist', 'initiator', 'controller', 'sentinel'];
  function rolesPlayed(p) {   // small icons for the other roles a player has S3 maps on
    var list = Object.keys(p.roles || {}).filter(function (r) { return r !== p.mainRole; });
    if (!list.length) return '';
    return '<span class="lq-alts" title="Also played: ' + esc(list.map(function (r) { return cap(r) + ' ' + p.roles[r].maps; }).join(', ')) + '">' +
      list.map(function (r) { return '<img src="assets/' + ROLE_ICONS[r] + '" alt="' + cap(r) + '">'; }).join('') + '</span>';
  }
  function roleIcon(role) { return role ? '<img class="lq-role" src="assets/' + ROLE_ICONS[role] + '" alt="' + cap(role) + '" title="' + cap(role) + '">' : '<span class="lq-role lq-role-none" title="No role data"></span>'; }
  function teamName(s, code) { return code === 'YOU' ? s.league.teams.YOU.name : (TEAMS[code] || code); }
  function short(code) { return code === 'YOU' ? (ui.season ? ui.season.league.teams.YOU.name : 'You') : code; }

  // ---------- build screen ----------
  function renderBuild() {
    var mine = ui.players.map(mineP);
    var str = strengthOf(mine, ui.coach);
    var pool = POOL.map(function (p) { return ui.role ? onRole(p, ui.role) : p; }).filter(function (p) {
      if (ui.role && !canPlay(p, ui.role)) return false;
      if (ui.team && (ui.team === 'SUB' ? p.team : p.team !== ui.team)) return false;
      if (ui.q && p.name.toLowerCase().indexOf(ui.q.toLowerCase()) < 0) return false;
      return true;
    }).sort(function (a, b) {
      if (ui.sort === 'name') return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1;
      if (ui.sort === 'dpr') return a[ui.sort] - b[ui.sort];
      return b[ui.sort] - a[ui.sort];
    });
    var full = ui.players.length >= 5;
    var teamOpts = '<option value="">All teams</option>' + Object.keys(TEAMS).sort().map(function (c) { return '<option value="' + c + '"' + (ui.team === c ? ' selected' : '') + '>' + c + ' · ' + esc(TEAMS[c]) + '</option>'; }).join('') + '<option value="SUB"' + (ui.team === 'SUB' ? ' selected' : '') + '>Subs</option>';
    var html = '<div class="lq-build">';
    // pool
    html += '<section class="lq-panel lq-pool" aria-label="Player pool"><div class="lq-panel-head"><h2>Player pool</h2><span class="lq-dim mono">' + pool.length + ' of ' + POOL.length + ' · NA S3</span></div>' +
      '<div class="lq-filters"><div class="lq-chips" role="group" aria-label="Role">' + ['', 'duelist', 'initiator', 'controller', 'sentinel'].map(function (r) {
        return '<button type="button" data-role="' + r + '" aria-pressed="' + (ui.role === r) + '">' + (r ? '<img src="assets/' + ROLE_ICONS[r] + '" alt="">' + cap(r) : 'All') + '</button>';
      }).join('') + '</div>' +
      '<div class="lq-filter-row"><label class="lq-field"><span>Team</span><select id="lq-team">' + teamOpts + '</select></label>' +
      '<label class="lq-field"><span>Sort</span><select id="lq-sort">' + [['r', 'LQ rating'], ['toxic', 'Toxic rating'], ['acs', 'ACS'], ['kast', 'KAST'], ['dpr', 'DPR'], ['maps', 'Maps'], ['name', 'Name']].map(function (o) { return '<option value="' + o[0] + '"' + (ui.sort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select></label>' +
      '<label class="lq-field lq-grow"><span>Search</span><input id="lq-q" type="search" autocomplete="off" placeholder="Player" value="' + esc(ui.q) + '"></label></div></div>' +
      '<div class="lq-table-wrap"><table class="lq-ptable"><thead><tr><th scope="col">Player</th><th scope="col" class="num">LQ</th><th scope="col" class="num hide-s">ACS</th><th scope="col" class="num hide-s">KAST</th><th scope="col" class="num hide-s">DPR</th><th scope="col" class="num hide-xs">Maps</th><th scope="col"><span class="sr">Add</span></th></tr></thead><tbody>' +
      pool.map(function (p) {
        var inTeam = ui.players.indexOf(p.id) >= 0;
        return '<tr class="' + (inTeam ? 'is-in' : '') + '" style="--team:' + esc(p.color) + '"><td><div class="lq-pl">' + logoHTML(p.team || 'SUB') + roleIcon(p.mainRole) +
          '<span class="lq-pl-n"><b>' + esc(p.name) + '</b><small>' + (p.team ? esc(p.team) : 'Sub') + (p.maps < 6 ? ' · small sample' : '') + (ui.role && p.role !== p.mainRole ? ' · ' + p.roleMaps + (p.roleMaps === 1 ? ' map' : ' maps') + ' as ' + p.role : '') + '</small></span>' + rolesPlayed(p) + '</div></td>' +
          '<td class="num"><b class="lq-rt">' + score100(p.r) + '</b></td><td class="num hide-s">' + p.acs + '</td><td class="num hide-s">' + p.kast + '%</td><td class="num hide-s">' + p.dpr.toFixed(2) + '</td><td class="num hide-xs">' + (ui.role ? p.roleMaps : p.maps) + '</td>' +
          '<td class="act">' + (inTeam ? '<button type="button" class="lq-mini on" data-drop="' + esc(p.id) + '" aria-label="Take ' + esc(p.name) + ' off your team">✓</button>'
            : '<button type="button" class="lq-mini" data-add="' + esc(p.id) + '"' + (full ? ' disabled' : '') + ' aria-label="Add ' + esc(p.name) + '">+</button>') + '</td></tr>';
      }).join('') + (pool.length ? '' : '<tr><td colspan="7" class="lq-dim lq-empty">No players match.</td></tr>') + '</tbody></table></div></section>';

    // your team
    var spotOpts = Object.keys(GROUPS).map(function (g) {
      return '<optgroup label="Group ' + g + '">' + GROUPS[g].map(function (c) { return '<option value="' + c + '"' + (ui.replace === c ? ' selected' : '') + '>' + c + ' · ' + esc(TEAMS[c]) + '</option>'; }).join('') + '</optgroup>';
    }).join('');
    html += '<section class="lq-panel lq-mine" aria-label="Your team"><div class="lq-panel-head"><h2>Your team</h2><span class="lq-dim mono">' + ui.players.length + ' / 5</span></div>' +
      '<label class="lq-field lq-name"><span>Team name</span><input id="lq-name" maxlength="24" autocomplete="off" value="' + esc(ui.name) + '"></label>' +
      '<ol class="lq-slots">' + [0, 1, 2, 3, 4].map(function (i) {
        var p = mine[i];
        if (!p) return '<li class="lq-slot empty"><span class="lq-slot-n">' + (i + 1) + '</span><span class="lq-dim">Pick a player</span></li>';
        var x = p.roles[p.role] || {}, off = p.role !== p.mainRole;
        return '<li class="lq-slot" style="--team:' + esc(p.color) + '"><div class="lq-slot-top"><span class="lq-slot-n">' + (i + 1) + '</span>' + logoHTML(p.team || 'SUB') +
          '<span class="lq-pl-n"><b>' + esc(p.name) + '</b><small>' + (p.team ? esc(p.teamName) : 'Sub') + '</small></span><b class="lq-rt">' + score100(p.r) + '</b>' +
          '<button type="button" class="lq-x" data-drop="' + esc(p.id) + '" aria-label="Take ' + esc(p.name) + ' off your team">×</button></div>' +
          '<div class="lq-slot-roles"><div class="lq-rolepick" role="radiogroup" aria-label="' + esc(p.name) + ' role">' + ROLE_LIST.map(function (r) {
            var y = p.roles[r], on = p.role === r;
            var tip = y ? cap(r) + ': ' + (y.maps ? y.maps + (y.maps === 1 ? ' map' : ' maps') + ' in S3' + (y.agents.length ? ' (' + y.agents.slice(0, 3).join(', ') + ')' : '') : 'listed role') + ', LQ ' + score100(y.r) : p.name + ' never played ' + r + ' in S3';
            return '<button type="button" role="radio" aria-checked="' + on + '" data-setrole="' + r + '" data-for="' + esc(p.id) + '"' + (y ? '' : ' disabled') + ' title="' + esc(tip) + '" aria-label="' + esc(tip) + '"><img src="assets/' + ROLE_ICONS[r] + '" alt=""></button>';
          }).join('') + '</div><small class="lq-role-note' + (off ? ' off' : '') + '">' + cap(p.role) + (x.maps ? ' · ' + x.maps + (x.maps === 1 ? ' map' : ' maps') + (x.agents && x.agents.length ? ' · ' + esc(x.agents.slice(0, 2).join(', ')) : '') : '') + (off ? ' · off role' : '') + '</small></div></li>';
      }).join('') + '</ol>' +
      '<div class="lq-quick"><button type="button" class="tt-btn ghost" data-act="random">Random 5</button><button type="button" class="tt-btn ghost" data-act="clear"' + (ui.players.length ? '' : ' disabled') + '>Clear</button></div>' +
      '<h3 class="lq-h3">Coach</h3><div class="lq-coaches" role="radiogroup" aria-label="Coach">' + COACHES.map(function (c) {
        return '<button type="button" role="radio" aria-checked="' + (ui.coach === c.id) + '" data-coach="' + c.id + '"><b>' + esc(c.name) + '</b><span class="lq-kicker">' + esc(c.short) + '</span><small>' + esc(c.text) + '</small></button>';
      }).join('') + '</div>' +
      '<label class="lq-field lq-spot"><span>Your spot in the season (you replace this team; its players go back in the pool)</span><select id="lq-replace">' + spotOpts + '</select></label>' +
      '<div class="lq-meter">' + meter(str, mine.length) + '</div>' +
      '<div class="lq-proj" id="lq-proj">' + projHTML(mine.length) + '</div>' +
      '<button type="button" class="tt-btn lq-go" data-act="sim"' + (mine.length < 5 ? ' disabled' : '') + '>' + (mine.length < 5 ? 'Pick ' + (5 - mine.length) + ' more' : 'Sim the season') + '</button>' +
      '</section></div>';
    return html;
  }

  function meter(str, n) {
    if (!n) return '<p class="lq-dim">Your team rating shows here as you pick.</p>';
    var roles = ['duelist', 'initiator', 'controller', 'sentinel'].map(function (r) {
      var c = str.roles[r]; return '<span class="lq-rolechip' + (c ? '' : ' miss') + '"><img src="assets/' + ROLE_ICONS[r] + '" alt="">' + c + '</span>';
    }).join('');
    return '<div class="lq-meter-top"><div><span class="lq-kicker">Team rating</span><b class="lq-big">' + score100(str.total) + '</b></div>' +
      '<dl class="lq-break"><div><dt>Players</dt><dd>' + score100(str.base) + '</dd></div><div><dt>Roles</dt><dd>' + (str.role ? (str.role * 100).toFixed(1) : '0') + '</dd></div><div><dt>Chemistry</dt><dd>+' + (str.chem * 100).toFixed(1) + '</dd></div></dl></div>' +
      '<div class="lq-roles">' + roles + '</div>' + (n === 5 && str.notes.length ? '<p class="lq-warn">' + esc(str.notes.join(' · ')) + '</p>' : '') +
      '<p class="lq-dim lq-small">For reference, real S3 rosters rate ' + realRange() + '.</p>';
  }
  var _range = null;
  function realRange() {
    if (_range) return _range;
    var L = makeLeague(POOL, { mine: { players: [], coach: '' }, replace: '' }), v = L.order.map(function (c) { return score100(L.teams[c].str.total); }).sort(function (a, b) { return a - b; });
    var top = L.order.reduce(function (b, c) { return !b || L.teams[c].str.total > L.teams[b].str.total ? c : b; }, '');
    _range = v[0] + ' to ' + v[v.length - 1] + ' (' + top + ' highest)';
    return _range;
  }

  function projHTML(n) {
    if (n < 5) return '<p class="lq-dim lq-small">Once you have 5, the bot plays 200 quick seasons with your team and tells you what to expect.</p>';
    var p = ui.proj;
    if (!p || ui.projKey !== projKey()) return '<p class="lq-dim lq-small">The bot is reading your team…</p>';
    function pct(x) { return Math.round(100 * x / p.n) + '%'; }
    return '<div class="lq-proj-grid"><div><span class="lq-kicker">Playoffs</span><b>' + pct(p.playoffs) + '</b></div><div><span class="lq-kicker">Final</span><b>' + pct(p.final) + '</b></div><div><span class="lq-kicker">Title</span><b>' + pct(p.title) + '</b></div><div><span class="lq-kicker">Group finish</span><b>' + p.groupPlace.toFixed(1) + '</b></div></div>' +
      '<p class="lq-bot">' + esc(botTake(p)) + '</p>';
  }
  function botTake(p) {
    var t = p.title / p.n, po = p.playoffs / p.n;
    if (t >= 0.35) return 'Bot: this is the team to beat. Anything short of a trophy is a choke.';
    if (t >= 0.15) return 'Bot: real contender. Win the upper bracket and you control your own fate.';
    if (po >= 0.75) return 'Bot: playoff team for sure. The title needs some luck on the Bo5s.';
    if (po >= 0.45) return 'Bot: coin flip to get out of groups. Every map counts.';
    if (po >= 0.2) return 'Bot: you\'ll need to steal a few series to make playoffs.';
    return 'Bot: honestly? This one lives up to the name.';
  }
  function projKey() { var rl = myRoles(); return ui.players.slice().sort().map(function (id) { return id + (rl[id] ? '@' + rl[id] : ''); }).join(',') + '|' + ui.coach + '|' + ui.replace; }
  var projTimer = null;
  function queueProj() {
    clearTimeout(projTimer);
    if (ui.players.length < 5 || ui.projKey === projKey()) return;
    projTimer = setTimeout(function () {
      var k = projKey();
      ui.proj = project(POOL, opts(), 200, hash(k)); ui.projKey = k;
      var el = $('lq-proj'); if (el && ui.screen === 'build') el.innerHTML = projHTML(ui.players.length);
    }, 60);
  }

  // ---------- season screen ----------
  function involves(s) { return s.a === 'YOU' || s.b === 'YOU'; }
  function seriesHTML(S, s, big) {
    var mine = involves(s), meFirst = s.b === 'YOU';
    var A = meFirst ? s.b : s.a, B = meFirst ? s.a : s.b, sa = meFirst ? s.score[1] : s.score[0], sb = meFirst ? s.score[0] : s.score[1];
    var won = mine ? s.winner === 'YOU' : null;
    var maps = s.maps.map(function (m) {
      var ma = meFirst ? m.b : m.a, mb = meFirst ? m.a : m.b;
      return '<li class="' + (ma > mb ? 'w' : 'l') + '"><span>' + esc(m.map) + '</span><b>' + ma + '–' + mb + '</b></li>';
    }).join('');
    var html = '<article class="lq-series' + (mine ? ' mine ' + (won ? 'won' : 'lost') : '') + (big ? ' big' : '') + '">' +
      '<div class="lq-series-head"><span class="lq-kicker">' + esc(s.round || s.stage) + ' · Bo' + s.bo + '</span>' + (mine ? '<span class="lq-res ' + (won ? 'w' : 'l') + '">' + (won ? 'WIN' : 'LOSS') + '</span>' : '') + '</div>' +
      '<div class="lq-vs"><span class="lq-side' + (s.winner === A ? ' win' : '') + '">' + logoHTML(A) + '<b>' + esc(short(A)) + '</b></span><span class="lq-score">' + sa + '<i>–</i>' + sb + '</span>' +
      '<span class="lq-side r' + (s.winner === B ? ' win' : '') + '"><b>' + esc(short(B)) + '</b>' + logoHTML(B) + '</span></div>' +
      '<ul class="lq-maps">' + maps + '</ul>';
    if (big && mine) html += '<p class="lq-call">' + esc(callout(S, s)) + '</p>';
    return html + '</article>';
  }

  function callout(S, s) {   // one line from the bot about your series
    var r = rng(hash(S.seed + ':' + (s.n || s.week) + s.a + s.b));
    var mineA = s.a === 'YOU', best = null, tot = {};
    s.maps.forEach(function (m) { (mineA ? m.sa : m.sb).forEach(function (x) { var t = tot[x.id] || (tot[x.id] = { k: 0, d: 0, acs: 0, n: 0, maps: [] }); t.k += x.k; t.d += x.d; t.acs += x.acs; t.n++; t.maps.push([m.map, x.k]); }); });
    Object.keys(tot).forEach(function (id) { if (!best || tot[id].k > tot[best].k) best = id; });
    var p = BY_ID[best] || { name: 'Someone' }, b = tot[best], top = b.maps.slice().sort(function (x, y) { return y[1] - x[1]; })[0];
    var opp = mineA ? s.b : s.a, oppName = TEAMS[opp] || opp, won = s.winner === 'YOU', sweep = s.score[0] === 0 || s.score[1] === 0;
    var close = s.maps.some(function (m) { return Math.abs(m.a - m.b) <= 2; });
    var lines = won ? [
      p.name + ' goes ' + b.k + '-' + b.d + ' across ' + b.n + ' maps and ' + oppName + ' have no answer.',
      p.name + ' drops ' + top[1] + ' on ' + top[0] + '. ' + (sweep ? 'Clean sweep.' : 'Not pretty, but it counts.'),
      (close ? 'Sweaty one. ' : '') + p.name + ' carries with ' + Math.round(b.acs / b.n) + ' ACS.'
    ] : [
      'Even ' + p.name + '\'s ' + b.k + ' kills couldn\'t save it against ' + oppName + '.',
      oppName + ' had the read. ' + p.name + ' tried (' + top[1] + ' on ' + top[0] + ').',
      (close ? 'So close. ' : '') + 'Back to the losers queue. ' + p.name + ' top frags with ' + b.k + '.'
    ];
    return lines[Math.floor(r() * lines.length)];
  }

  function tableHTML(S, g, upto) {
    var codes = S.league.groups[g], series = [];
    S.weeks.forEach(function (w, i) { if (i < upto && w.stage === 'group') w.series.forEach(function (s) { if (s.stage === 'Group ' + g) series.push(s); }); });
    var rows = table(codes, series);
    return '<div class="lq-gtable"><h3>Group ' + g + '</h3><table><thead><tr><th scope="col">#</th><th scope="col">Team</th><th scope="col" class="num">W–L</th><th scope="col" class="num">Maps</th><th scope="col" class="num hide-xs">RD</th></tr></thead><tbody>' +
      rows.map(function (x, i) {
        return '<tr class="' + (x.code === 'YOU' ? 'me' : '') + (i === 3 ? ' cut' : '') + '"><td>' + (i + 1) + '</td><td><span class="lq-tn">' + logoHTML(x.code, 'lq-logo sm') + esc(short(x.code)) + '</span></td><td class="num">' + x.w + '–' + x.l + '</td><td class="num">' + x.mw + '–' + x.ml + '</td><td class="num hide-xs">' + (x.rw - x.rl > 0 ? '+' : '') + (x.rw - x.rl) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function bracketHTML(S, upto) {
    var shown = {};
    S.weeks.forEach(function (w, i) { if (i < upto && w.stage === 'playoffs') w.series.forEach(function (s) { shown[s.n] = s; }); });
    function box(n) {
      var b = BRACKET[n - 1], s = shown[n];
      function slot(code, label, score, win) {
        return '<div class="lq-bslot' + (code === 'YOU' ? ' me' : '') + (win ? ' win' : '') + '">' + (code ? logoHTML(code, 'lq-logo sm') + '<span>' + esc(short(code)) + '</span>' : '<span class="lq-dim">' + label + '</span>') + '<b>' + (score == null ? '' : score) + '</b></div>';
      }
      var a = s ? s.a : (/^[AB]/.test(b.a) ? S.seeds[b.a] : ''), bb = s ? s.b : (/^[AB]/.test(b.b) ? S.seeds[b.b] : '');
      return '<div class="lq-bbox"><span class="lq-kicker">' + esc(b.round) + (b.bo === 5 ? ' · Bo5' : '') + '</span>' + slot(a, b.a, s ? s.score[0] : null, s && s.winner === s.a) + slot(bb, b.b, s ? s.score[1] : null, s && s.winner === s.b) + '</div>';
    }
    var cols = [['Upper bracket', [[1, 2], [3, 4], [9]]], ['Lower bracket', [[5, 6], [7, 8], [10], [11]]], ['Grand final', [[12]]]];
    return '<div class="lq-bracket">' + cols.map(function (c) {
      return '<div class="lq-bcol"><h3>' + c[0] + '</h3><div class="lq-brounds">' + c[1].map(function (r) { return '<div class="lq-bround">' + r.map(box).join('') + '</div>'; }).join('') + '</div></div>';
    }).join('') + '</div>';
  }

  function inLeague(S, id) { var f = null; S.league.order.forEach(function (c) { S.league.teams[c].players.forEach(function (x) { if (x.id === id) f = x; }); }); return f; }
  function statRows(S, ids) {
    return ids.map(function (id) { var x = S.stats[id]; if (!x) return null; return { id: id, p: inLeague(S, id) || BY_ID[id] || { name: id.indexOf('standin') === 0 ? 'Stand-in' : id, role: '' }, x: x, rating: x.ratingSum / x.rounds, acs: x.acsSum / x.rounds }; })
      .filter(Boolean).sort(function (a, b) { return b.rating - a.rating; });
  }
  function statsTable(rows, withTeam) {
    return '<div class="lq-table-wrap"><table class="lq-stable"><thead><tr><th scope="col">Player</th>' + (withTeam ? '<th scope="col">Team</th>' : '') + '<th scope="col" class="num">Maps</th><th scope="col" class="num">K</th><th scope="col" class="num">D</th><th scope="col" class="num hide-xs">A</th><th scope="col" class="num">K/D</th><th scope="col" class="num">ACS</th><th scope="col" class="num">Rating</th></tr></thead><tbody>' +
      rows.map(function (r, i) {
        return '<tr><td><span class="lq-tn">' + roleIcon(r.p.role) + esc(r.p.name) + (i === 0 && !withTeam ? ' <span class="lq-mvp">MVP</span>' : '') + '</span></td>' + (withTeam ? '<td>' + esc(short(r.team)) + '</td>' : '') +
          '<td class="num">' + r.x.maps + '</td><td class="num">' + r.x.k + '</td><td class="num">' + r.x.d + '</td><td class="num hide-xs">' + r.x.a + '</td><td class="num">' + (r.x.k / Math.max(1, r.x.d)).toFixed(2) + '</td><td class="num">' + Math.round(r.acs) + '</td><td class="num"><b>' + r.rating.toFixed(2) + '</b></td></tr>';
      }).join('') + '</tbody></table></div>';
  }

  function placeLine(p) {
    if (p === '1st') return 'NA S3 champions';
    if (p === '2nd') return 'Runners-up';
    if (/^(3rd|4th|5th-6th|7th-8th)$/.test(p)) return p + ' place · Playoffs';
    return p.replace(/^(\d+)th/, '$1th') + ' · Out in groups';
  }

  function renderSeason() {
    var S = ui.season, me = S.league.teams.YOU, total = S.weeks.length, done = ui.step >= total;
    var upto = ui.step, cur = S.weeks[Math.max(0, upto - 1)];
    var myAll = []; S.weeks.forEach(function (w, i) { if (i < upto) w.series.forEach(function (s) { if (involves(s)) myAll.push(s); }); });
    var w = 0, l = 0, mw = 0, ml = 0;
    myAll.forEach(function (s) { var mine = s.a === 'YOU' ? 0 : 1; if (s.winner === 'YOU') w++; else l++; mw += s.score[mine]; ml += s.score[1 - mine]; });
    var coach = COACHES.filter(function (c) { return c.id === me.coach; })[0];
    var html = '<div class="lq-season">';
    html += '<div class="lq-teambar"><div class="lq-tb-id">' + qMark(40) + '<div><b class="lq-tb-name">' + esc(me.name) + '</b><span class="lq-dim mono">' + (coach ? esc(coach.name) + ' · ' : '') + 'Group ' + me.group + ' · replaced ' + esc(me.replaced) + ' · Season ' + esc(ui.code) + '</span></div></div>' +
      '<div class="lq-tb-rec"><div><span class="lq-kicker">Series</span><b>' + w + '–' + l + '</b></div><div><span class="lq-kicker">Maps</span><b>' + mw + '–' + ml + '</b></div><div><span class="lq-kicker">Rating</span><b>' + score100(me.str.total) + '</b></div></div></div>';

    if (done) html += summaryHTML(S);
    else {
      var my = cur ? cur.series.filter(involves)[0] : null;
      html += '<div class="lq-now"><div class="lq-now-head"><h2>' + (cur ? esc(cur.label) : 'Preseason') + '</h2><span class="lq-dim mono">' + upto + ' / ' + total + '</span></div>';
      if (!cur) html += '<p class="lq-dim">The bot is lining up the season. Seven group weeks, then the playoffs if you get there.</p>';
      else if (my) html += seriesHTML(S, my, true);
      else html += '<p class="lq-out">' + (S.place.YOU.indexOf('Group') >= 0 ? 'You didn\'t make playoffs. The bot plays the rest of the season without you.' : 'Not playing this round. You\'re waiting on the winner.') + '</p>';
      html += '<div class="lq-controls"><button type="button" class="tt-btn" data-act="next">' + (ui.timer ? 'Pause' : (upto ? 'Next' : 'Start the season')) + '</button>' +
        '<button type="button" class="tt-btn ghost" data-act="auto"' + (ui.timer ? ' aria-pressed="true"' : '') + '>' + (ui.timer ? 'Auto-playing…' : 'Auto-play') + '</button>' +
        '<button type="button" class="tt-btn ghost" data-act="skip">Skip to the end</button></div></div>';
      if (cur) {
        var others = cur.series.filter(function (s) { return !involves(s); });
        if (others.length) html += '<h3 class="lq-h3">Around the league</h3><div class="lq-league">' + others.map(function (s) { return seriesHTML(S, s, false); }).join('') + '</div>';
      }
    }
    var groupDone = Math.min(upto, 7);
    html += '<div class="lq-tables">' + tableHTML(S, 'Alpha', groupDone) + tableHTML(S, 'Omega', groupDone) + '</div>';
    if (upto >= 7) html += '<h3 class="lq-h3">Playoffs</h3>' + bracketHTML(S, upto);
    html += '<div class="lq-foot-actions"><button type="button" class="tt-btn ghost" data-act="edit">Edit team</button><button type="button" class="tt-btn ghost" data-act="again">New season, same team</button></div>';
    return html + '</div>';
  }

  function summaryHTML(S) {
    var me = S.league.teams.YOU, p = S.place.YOU, champ = S.champion;
    var mine = statRows(S, me.players.map(function (x) { return x.id; }));
    var all = []; S.league.order.forEach(function (c) { S.league.teams[c].players.forEach(function (x) { var row = statRows(S, [x.id])[0]; if (row && row.x.maps >= 10) { row.team = c; all.push(row); } }); });
    all.sort(function (a, b) { return b.rating - a.rating; });
    var mvp = mine[0];
    var html = '<div class="lq-final' + (p === '1st' ? ' champ' : '') + '"><span class="lq-kicker">Season ' + esc(ui.code) + ' · final result</span><b class="lq-place">' + esc(p.split(' ')[0]) + '</b><p>' + esc(placeLine(p)) + '</p>' +
      (p !== '1st' ? '<p class="lq-dim">Champions: ' + logoHTML(champ, 'lq-logo sm') + ' ' + esc(teamName(S, champ)) + '</p>' : '') +
      (mvp ? '<p class="lq-bot">Bot: ' + esc(mvp.p.name) + ' was your MVP, ' + mvp.rating.toFixed(2) + ' rating over ' + mvp.x.maps + ' maps. ' + esc(endLine(p)) + '</p>' : '') + '</div>';
    html += '<h3 class="lq-h3">Your players</h3>' + statsTable(mine, false);
    html += '<h3 class="lq-h3">League leaders <span class="lq-dim">(10+ maps)</span></h3>' + statsTable(all.slice(0, 8), true);
    return html;
  }
  function endLine(p) {
    if (p.indexOf('Group') >= 0) return 'Groups were rough. Try a different coach or fix the roles.';
    if (p === '1st') return 'Trophy. Losers queue no more.';
    if (p === '2nd') return 'One series away. Run it back.';
    if (/3rd|4th/.test(p)) return 'Deep run. The Bo5s are where it gets decided.';
    if (/5th|7th/.test(p)) return 'Made playoffs, ran out of road.';
    return 'Groups were rough. Try a different coach or fix the roles.';
  }

  // ---------- render + events ----------
  function render() {
    var app = $('lq-app'); if (!app) return;
    var focus = document.activeElement && document.activeElement.id, pos = focus && document.activeElement.selectionStart;
    app.innerHTML = ui.screen === 'build' ? renderBuild() : renderSeason();
    if (focus && $(focus)) { var el = $(focus); el.focus(); if (pos != null && el.setSelectionRange) try { el.setSelectionRange(pos, pos); } catch (e) {} }
    if (ui.screen === 'build') queueProj();
  }
  function stop() { if (ui.timer) { clearInterval(ui.timer); ui.timer = null; } }
  function startSeason(code) {
    stop();
    ui.code = code || newCode();
    ui.season = simSeason(POOL, opts(), hash('LQ:' + ui.code + ':' + projKey()), true);
    ui.step = 0; ui.screen = 'season';
    render(); window.scrollTo({ top: 0 });
  }
  function next() {
    if (!ui.season) return;
    ui.step = Math.min(ui.season.weeks.length, ui.step + 1);
    // Out of the playoffs: no point stepping through series you aren't in.
    if (ui.step >= 7 && ui.step < ui.season.weeks.length && !/^(1st|2nd)$/.test(ui.season.place.YOU)) {
      var stillIn = ui.season.weeks.slice(ui.step).some(function (w) { return w.series.some(involves); });
      if (!stillIn) ui.step = ui.season.weeks.length;
    }
    if (ui.step >= ui.season.weeks.length) stop();
    render();
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest('button'); if (!t || !$('lq-app').contains(t)) return;
    var id;
    if ((id = t.getAttribute('data-add'))) { if (ui.players.length < 5 && ui.players.indexOf(id) < 0) ui.players.push(id); save(); return render(); }
    if ((id = t.getAttribute('data-drop'))) { ui.players = ui.players.filter(function (x) { return x !== id; }); delete ui.roles[id]; save(); return render(); }
    if ((id = t.getAttribute('data-for'))) {
      var role = t.getAttribute('data-setrole');
      if (!canPlay(BY_ID[id], role)) return;   // never played it in S3: not allowed
      if (role === BY_ID[id].mainRole) delete ui.roles[id]; else ui.roles[id] = role;
      save(); return render();
    }
    if (t.hasAttribute('data-role')) { ui.role = t.getAttribute('data-role'); return render(); }
    if ((id = t.getAttribute('data-coach'))) { ui.coach = id; save(); return render(); }
    var act = t.getAttribute('data-act');
    if (act === 'random') {
      var left = POOL.filter(function (p) { return ui.players.indexOf(p.id) < 0 && p.maps >= 6; });
      while (ui.players.length < 5 && left.length) ui.players.push(left.splice(Math.floor(Math.random() * left.length), 1)[0].id);
      save(); return render();
    }
    if (act === 'clear') { ui.players = []; ui.roles = {}; save(); return render(); }
    if (act === 'sim' && ui.players.length === 5) return startSeason();
    if (act === 'next') { if (ui.timer) { stop(); return render(); } return next(); }
    if (act === 'auto') { if (ui.timer) { stop(); return render(); } ui.timer = setInterval(next, 1400); return next(); }
    if (act === 'skip') { stop(); ui.step = ui.season.weeks.length; return render(); }
    if (act === 'edit') { stop(); ui.screen = 'build'; ui.season = null; render(); return window.scrollTo({ top: 0 }); }
    if (act === 'again') return startSeason();
  });
  document.addEventListener('input', function (e) {
    if (e.target.id === 'lq-q') { ui.q = e.target.value; render(); }
    if (e.target.id === 'lq-name') { ui.name = e.target.value.slice(0, 24); save(); }
  });
  document.addEventListener('change', function (e) {
    if (e.target.id === 'lq-team') { ui.team = e.target.value; render(); }
    if (e.target.id === 'lq-sort') { ui.sort = e.target.value; render(); }
    if (e.target.id === 'lq-replace') { ui.replace = e.target.value; save(); render(); }
  });

  // ---------- intro ----------
  function intro() {
    var box = $('lq-intro'), v = $('lq-intro-video');
    if (!box) return;
    var seen = false; try { seen = sessionStorage.getItem('pcmt-losersq-intro') === '1'; } catch (e) {}
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    function done() { box.classList.add('is-done'); setTimeout(function () { box.hidden = true; }, 450); try { sessionStorage.setItem('pcmt-losersq-intro', '1'); } catch (e) {} }
    if (seen || reduce || !v) { box.hidden = true; return; }
    box.hidden = false;
    v.addEventListener('ended', done);
    v.addEventListener('error', done);
    $('lq-intro-skip').addEventListener('click', done);
    document.addEventListener('keydown', function k(e) { if (e.key === 'Escape') { done(); document.removeEventListener('keydown', k); } });
    // The page stays hidden until the staff check in <head> lets it through; play the intro once it's showing.
    var d = document.documentElement, played = false;
    function go() {
      if (played || d.classList.contains('pcmt-gate')) return;
      played = true; obs.disconnect();
      var p = v.play(); if (p && p.catch) p.catch(done);
      setTimeout(function () { if (!box.hidden) done(); }, 6000);   // never stuck on the intro
    }
    var obs = new MutationObserver(go);
    obs.observe(d, { attributes: true, attributeFilter: ['class'] });
    go();
  }

  function start() {
    // Discord name in the header, same as the other pages.
    try {
      var s = JSON.parse(localStorage.getItem('pcmt-auth') || 'null'), md = s && s.user && s.user.user_metadata;
      if (md && $('tt-auth-label')) $('tt-auth-label').textContent = md.custom_claims && md.custom_claims.global_name || md.full_name || md.name || 'Logged in';
    } catch (e) {}
    intro();
    render();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})(typeof window !== 'undefined' ? window : globalThis);
