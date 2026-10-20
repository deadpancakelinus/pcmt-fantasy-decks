"""Site-only changes that connect the canvas pages to the league (accounts, saved decks, scoring).
The canvas itself stays a design file; these edits are applied while building the website."""
import json
import re


def sub1(s, old, new, where):
    assert s.count(old) == 1, (where, s.count(old), old[:80])
    return s.replace(old, new)


HEADER_LOGIN = re.compile(r'(<a href="Login\.dc\.html"[^>]*>.*?)Log in with Discord</a>', re.S)


def tpl(board, t):
    t, n = HEADER_LOGIN.subn(lambda m: m.group(1) + '{{auth.label}}</a>', t)
    assert n == (0 if board == 'Login.dc.html' else 1), (board, n)
    if board == 'Main.dc.html':
        t = sub1(t, 'font-size: 44px; line-height: 1">0</div>\n<span style="font-family: \'JetBrains Mono\', monospace; font-size: 12px; color: #93a9aa">Rank —</span>',
                 'font-size: 44px; line-height: 1">{{league.total}}</div>\n<span style="font-family: \'JetBrains Mono\', monospace; font-size: 12px; color: #93a9aa">{{league.rankLabel}}</span>', board)
    if board == 'Login.dc.html':
        t = sub1(t, '>[Discord username]</span>', '>{{auth.name}}</span>', board)
        t = sub1(t, 'font-size: 40px">?</div>', 'font-size: 40px">{{auth.initial}}</div>', board)
    return t


def logic(board, js):
    if board == 'Main.dc.html':
        js = sub1(js, 'var PCMT_AURA = { holderId: null, me: null };', 'var PCMT_AURA = window.PCMT_AURA_LIVE || { holderId: null, me: null };', board)
        s = js.index('function pcmtReadMyDeck() {')
        e = js.index('function pcmtReadDeck() {')
        js = js[:s] + r'''function pcmtReadMyDeck() {
  var ok = {};
  PCMT_PLAYERS.forEach(function (p) { ok[p.id] = true; });
  function clean(v, saved) {
    var out = { slots: {}, igl: null, squadName: '', saved: !!saved };
    Object.keys(v.slots || {}).forEach(function (k) { if (ok[v.slots[k]]) out.slots[k] = v.slots[k]; });
    out.igl = ok[v.igl] ? v.igl : null;
    out.squadName = typeof (v.squadName != null ? v.squadName : v.name) === 'string' ? String(v.squadName != null ? v.squadName : v.name).slice(0, 32) : '';
    return out;
  }
  var local = null;
  try { local = JSON.parse(window.localStorage.getItem('pcmt-mydeck') || 'null'); } catch (e) {}
  var remote = window.PCMT_MY_REMOTE_DECK;
  // Signed in: use the deck entered in the league, unless there are newer edits on this device that aren't locked in yet.
  if (remote && !(local && local.uid === remote.uid && !local.saved)) return clean(remote, true);
  if (local && typeof local === 'object') return clean(local, local.saved);
  return { slots: {}, igl: null, squadName: '', saved: false };
}
function pcmtSaveMyDeck(s) {
  var uid = window.PCMT_ME_STATS ? window.PCMT_ME_STATS.id : (window.PCMT_MY_REMOTE_DECK ? window.PCMT_MY_REMOTE_DECK.uid : null);
  var json = JSON.stringify({ slots: s.slots || {}, igl: s.igl || null, squadName: s.squadName || '', saved: !!s.saved, uid: uid });
  if (json !== pcmtSaveMyDeck.last) {
    pcmtSaveMyDeck.last = json;
    try { window.localStorage.setItem('pcmt-mydeck', json); } catch (e) {}
  }
  if (window.PCMT_LEAGUE) window.PCMT_LEAGUE.onDeck(s);
}
''' + js[e:]
        js = sub1(js, "      save: function () {\n        if (weekLocked) return;\n",
                  "      save: function () {\n        if (weekLocked) return;\n        if (window.PCMT_LEAGUE && !window.PCMT_LEAGUE.canLockIn(self.state)) return;\n", board)
        js = sub1(js, '      statusText: statusText,\n', '      statusText: window.PCMT_LEAGUE ? window.PCMT_LEAGUE.statusNote(s.slots, statusText, weekLocked) : statusText,\n', board)
    if board == 'Customization.dc.html':
        js = sub1(js, 'var PCMT_WEEK_WINNERS = [];', 'var PCMT_WEEK_WINNERS = window.PCMT_WEEK_WINNERS_LIVE || [];', board)
        js = sub1(js, 'var PCMT_ME_ID = null;', 'var PCMT_ME_ID = window.PCMT_ME_STATS ? window.PCMT_ME_STATS.id : null;', board)
        js = sub1(js, 'var PCMT_ACTIVE_WEEKS = 0;', 'var PCMT_ACTIVE_WEEKS = window.PCMT_ME_STATS ? window.PCMT_ME_STATS.activeWeeks : 0;', board)
        js = sub1(js, 'var PCMT_CHAMPION_WIN = false;', 'var PCMT_CHAMPION_WIN = !!(window.PCMT_ME_STATS && window.PCMT_ME_STATS.championWin);', board)
        js = sub1(js, 'var PCMT_MISSED_WIN = false;', 'var PCMT_MISSED_WIN = !!(window.PCMT_ME_STATS && window.PCMT_ME_STATS.missedWin);', board)
        js = sub1(js, 'var PCMT_TEAM_POINTS = {};', 'var PCMT_TEAM_POINTS = window.PCMT_ME_STATS ? window.PCMT_ME_STATS.teamPoints : {};', board)
        js = sub1(js, 'var PCMT_BEST_WEEK = 0;', 'var PCMT_BEST_WEEK = window.PCMT_ME_STATS ? window.PCMT_ME_STATS.bestWeek : 0;', board)
        # Codes are checked by the server now; nothing about them is in the page.
        s = js.index('var PCMT_CODES = {')
        e = js.index('};', s) + 2
        js = js[:s] + 'var PCMT_CODES = {}; // codes live on the server (Supabase): redeemed with redeem_code()' + js[e:]
        js = sub1(js, '    var codeSet = {};\n', '    var codeSet = {};\n    (window.PCMT_SERVER_UNLOCKS || []).forEach(function (k) { codeSet[k] = true; });\n', board)
        s = js.index('  redeemCode() {')
        e = js.index('  equip(code) {')
        js = js[:s] + r'''  redeemCode() {
    var self = this;
    clearTimeout(this._msgT);
    var raw = String(this.state.codeInput || '').toUpperCase().replace(/\s+/g, '');
    if (!raw) return;
    if (!window.PCMT_LEAGUE || !window.PCMT_LEAGUE.signedIn) { this.flashMsg('Log in with Discord to redeem codes.', false); return; }
    this.flashMsg('Checking code…', true);
    window.PCMT_LEAGUE.redeem(raw).then(function (unlocks) {
      self.flashMsg('Code accepted. Unlocked: ' + unlocks.map(pcmtUnlockName).join(', ') + '.', true, { codeInput: '', codes: (self.state.codes || []).slice() });
    }, function (err) {
      self.flashMsg(err && err.message ? err.message : "That code isn't valid. Check it and try again.", false);
    });
  }
''' + js[e:]
    if board == 'Leaderboard.dc.html':
        js = sub1(js, 'var PCMT_STANDINGS = [];', 'var PCMT_STANDINGS = window.PCMT_STANDINGS || [];', board)
    if board == 'Login.dc.html':
        js = sub1(js, "    this.state = { signedIn: false };", "    this.state = { signedIn: !!(window.PCMT_AUTH && window.PCMT_AUTH.signedIn) };", board)
        js = sub1(js, "      signIn: function () { self.bufferFor('Connecting to Discord', 1600, function () { self.setState({ signedIn: true }); }); },",
                  "      signIn: function () { self.showLoader('Connecting to Discord'); window.PCMT_LEAGUE.signIn(); },", board)
        js = sub1(js, "      signOut: function () { self.bufferFor('Logging out of Discord', 1000, function () { self.setState({ signedIn: false }); }); }",
                  "      signOut: function () { self.showLoader('Logging out'); window.PCMT_LEAGUE.signOut(); }", board)
    return js


def players_js(main_logic):
    """players.js: the player list for scoring on every page.

    Written as JSON inside the JavaScript, so the server (Supabase) can read the same list when it pays out VP.
    """
    s = main_logic.index('var PCMT_PLAYERS = [')
    e = main_logic.index('];', s) + 2
    block = main_logic[s:e]
    rows = re.findall(r"\{ id: '([^']*)', name: '([^']*)', team: '([^']*)', role: '([^']*)', price: ([0-9.]+) \}", block)
    assert len(rows) == block.count('{ id:'), 'players.js: an entry in PCMT_PLAYERS is not in the expected shape'
    players = [{'id': i, 'name': n, 'team': t, 'role': r, 'price': float(pr)} for i, n, t, r, pr in rows]
    tw = re.search(r'var PCMT_TWIN = (\{[^}]*\});', main_logic).group(1)
    ch = re.search(r'var PCMT_CHAMPS = (\{[^}]*\});', main_logic).group(1)
    twin = dict(re.findall(r"'([^']+)':\s*'([^']+)'", tw))
    champs = {k: True for k in re.findall(r"'?([A-Za-z0-9_-]+)'?\s*:\s*true", ch)}
    rows_js = ',\n'.join('  ' + json.dumps(p, ensure_ascii=False) for p in players)
    return ('// Player list used for scoring (generated from The Deck). Kept as JSON so the server can read it too.\n'
            'var PCMT_SITE_PLAYERS = [\n' + rows_js + '\n];\n'
            'var PCMT_SITE_TWIN = ' + json.dumps(twin) + ';\n'
            'var PCMT_SITE_CHAMPS = ' + json.dumps(champs) + ';\n')
