// Pick'ems graphic: one game's pick split as a 1050 x 560 picture (the promo square on the PCMT S4 break screen).
// Used by the backend's Pick'ems tab (download) and by promo/pickems.html (the live "Pick'ems slide" on the break screen).
// Made to share before the game: no result. Top: "NA Season 4 · <round>"; a line per team (logo, full name, a bar of its
// pick % in the team colour, the %); fantasy.pcmt.gg bottom right. All text in Nova Flat (load it on the page; it has one weight).
//
//   PCMT_PICKEMS_GRAPHIC.draw(canvas, { season: 'NA Season 4', round, a: team, b: team, pa, pb }, base) -> Promise
//   team = { label, name, color, logo }   (season-teams.js entries); base = prefix for relative logo paths ('' or '/')
//   PCMT_PICKEMS_GRAPHIC.teams('s4-na') -> { <code>: team }   from season-teams.js
(function () {
  var W = 1050, H = 560, F = "'Nova Flat', 'National Park', system-ui, sans-serif", imgs = {};
  function img(src) {
    if (!src) return Promise.resolve(null);
    if (!imgs[src]) imgs[src] = new Promise(function (ok) { var im = new Image(); im.onload = function () { ok(im); }; im.onerror = function () { ok(null); }; im.src = src; });
    return imgs[src];
  }
  function round(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function inkOn(hex) {   // black or white, whichever reads better on the colour
    var n = parseInt(String(hex).slice(1), 16), ch = [n >> 16, (n >> 8) & 255, n & 255].map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2] > 0.2 ? '#000' : '#fff';
  }
  function src(logo, base) { return !logo ? '' : /^(https?:|\/|data:)/.test(logo) ? logo : (base || '') + logo; }
  function teams(ev) {
    var by = {};
    (window.PCMT_SEASON_TEAMS || []).forEach(function (sn) { if (sn.event === ev) (sn.teams || []).forEach(function (t) { by[t.label] = t; }); });
    return by;
  }
  function draw(cv, g, base) {
    var ta = g.a || {}, tb = g.b || {};
    var fonts = document.fonts ? Promise.all(["400 80px 'Nova Flat'", "400 32px 'Nova Flat'"].map(function (f) { return document.fonts.load(f).catch(function () {}); })) : Promise.resolve();
    return Promise.all([fonts, img(src(ta.logo, base)), img(src(tb.logo, base))]).then(function (r) {
      var c = cv.getContext('2d');
      cv.width = W; cv.height = H;
      var bg = c.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#13292b'); bg.addColorStop(1, '#070c0d');
      c.fillStyle = bg; c.fillRect(0, 0, W, H);
      c.textBaseline = 'alphabetic'; c.textAlign = 'left';
      c.fillStyle = '#ffffff'; c.font = '400 32px ' + F; c.fillText((g.season || 'NA Season 4') + (g.round ? ' · ' + g.round : ''), 48, 70);
      [[ta, r[1], g.pa], [tb, r[2], g.pb]].forEach(function (t, i) {
        var y = 100 + i * 180, col = t[0].color || (i ? '#3a4f53' : '#a5dcdd');
        c.fillStyle = 'rgba(255,255,255,.05)'; round(c, 40, y, W - 80, 156, 22); c.fill();
        if (t[1]) c.drawImage(t[1], 66, y + 24, 108, 108);
        else { c.fillStyle = col; c.beginPath(); c.arc(120, y + 78, 52, 0, 7); c.fill(); c.fillStyle = inkOn(col); c.font = '400 26px ' + F; c.textAlign = 'center'; c.fillText(t[0].label || '?', 120, y + 87); c.textAlign = 'left'; }
        var nm = t[0].name || t[0].label || '', px = 34, maxW = W - 80 - 210 - 190;
        c.font = '400 ' + px + 'px ' + F;
        while (c.measureText(nm).width > maxW && px > 22) { px -= 2; c.font = '400 ' + px + 'px ' + F; }
        c.fillStyle = '#ffffff'; c.fillText(nm, 206, y + 64);
        var bx = 206, bw = W - 80 - 206 - 190, by2 = y + 88, bh = 32;
        c.fillStyle = 'rgba(255,255,255,.1)'; round(c, bx, by2, bw, bh, 16); c.fill();
        if (t[2] > 0) { c.fillStyle = col; round(c, bx, by2, Math.max(32, Math.round(bw * t[2] / 100)), bh, 16); c.fill(); }
        c.fillStyle = '#ffffff'; c.font = '400 80px ' + F; c.textAlign = 'right';
        c.fillText((t[2] || 0) + '%', W - 64, y + 112); c.textAlign = 'left';
      });
      c.fillStyle = '#a5dcdd'; c.font = '400 40px ' + F; c.textAlign = 'right'; c.fillText('fantasy.pcmt.gg', W - 48, H - 34); c.textAlign = 'left';
      cv.setAttribute('aria-label', "Pick'ems, " + (ta.label || '') + ' ' + (g.pa || 0) + '%, ' + (tb.label || '') + ' ' + (g.pb || 0) + '%');
    });
  }
  // Same look with a message instead of the two teams (the live slide, when there's no game to show)
  function drawNote(cv, text) {
    var fonts = document.fonts ? document.fonts.load("400 56px 'Nova Flat'").catch(function () {}) : Promise.resolve();
    return fonts.then(function () {
      var c = cv.getContext('2d'); cv.width = W; cv.height = H;
      var bg = c.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#13292b'); bg.addColorStop(1, '#070c0d');
      c.fillStyle = bg; c.fillRect(0, 0, W, H);
      c.fillStyle = '#ffffff'; c.font = '400 56px ' + F; c.textAlign = 'center'; c.fillText(text, W / 2, H / 2);
      c.fillStyle = '#a5dcdd'; c.font = '400 40px ' + F; c.textAlign = 'right'; c.fillText('fantasy.pcmt.gg', W - 48, H - 34); c.textAlign = 'left';
      cv.setAttribute('aria-label', text);
    });
  }
  window.PCMT_PICKEMS_GRAPHIC = { draw: draw, drawNote: drawNote, teams: teams, W: W, H: H };
})();
