// MVP VS tiers: Iron 1 to Radiant, like Valorant's ranks. Only online wins against another player count, and every
// 5 wins is the next tier (Iron 1 = 0-4 wins, Iron 2 = 5-9, ... Immortal 3 = 115-119, Radiant = 120 and up).
// Used by MVP VS (trumps.js) and the leaderboards (league.js). Logos: assets/tiers/<tier>-<1|2|3>.webp, radiant.webp.
(function () {
  'use strict';
  var PER = 5, LIST = [];
  ['Iron', 'Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'Ascendant', 'Immortal'].forEach(function (t) {
    for (var d = 1; d <= 3; d++) LIST.push({ name: t + ' ' + d, img: 'assets/tiers/' + t.toLowerCase() + '-' + d + '.webp' });
  });
  LIST.push({ name: 'Radiant', img: 'assets/tiers/radiant.webp' });
  function tierOf(wins) {
    wins = Math.max(0, wins | 0);
    var i = Math.min(LIST.length - 1, Math.floor(wins / PER)), next = LIST[i + 1];
    return { i: i, name: LIST[i].name, img: LIST[i].img, wins: wins, next: next ? next.name : '', left: next ? (i + 1) * PER - wins : 0 };
  }
  window.PCMT_TIERS = { list: LIST, perTier: PER, of: tierOf };
})();
