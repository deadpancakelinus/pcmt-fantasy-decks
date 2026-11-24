// Playoff bracket formats for Pick'ems. Staff pick one on the backend (Schedule tab, PCMT.gg events) when they label an
// event Playoffs, and set its seeds; tools/pcmt-sync.js then writes the bracket into pickems.js and the Pick'ems page
// draws it from the layout here. Shared by the backend, the sync (Node) and the Pick'ems page.
//   teams:  how many seeds (S1 = the top seed).
//   series: n, round, a and b (a seed "S1", the winner of series n "W1" or its loser "L1"), bo.
//   layout: where each series box sits on the 1230 x 690 bracket (box top-left; boxes are 150 x 84, middles y + 42).
//   lines:  the connectors between boxes (SVG paths). The grand final is always the last series, at x 1060, y 330,
//           under the crown. The seeds table sits top left (24, 36), 330 wide, 40 per row.
// Two formats are the shapes of past PCMT playoffs: EMEA Season 2 (10 teams) and NA Season 3 (8 teams, top 2 get byes).
(function (root) {
  'use strict';
  function S(n, round, a, b, bo) { return { n: n, round: round, a: a, b: b, bo: bo || 3 }; }
  var F = {
    'de10': {
      name: '10 teams · double elimination (top 2 byes, seeds 7-10 start in the lower bracket)',
      short: '10-team double elimination', teams: 10,
      series: [
        S(1, 'Upper round 1', 'S3', 'S6'), S(2, 'Upper round 1', 'S4', 'S5'),
        S(3, 'Upper semifinal', 'S2', 'W1'), S(4, 'Upper semifinal', 'S1', 'W2'),
        S(5, 'Upper final', 'W3', 'W4'),
        S(6, 'Lower round 1', 'S7', 'S10'), S(7, 'Lower round 1', 'S8', 'S9'),
        S(8, 'Lower round 2', 'L1', 'W6'), S(9, 'Lower round 2', 'L2', 'W7'),
        S(10, 'Lower round 3', 'L4', 'W8'), S(11, 'Lower round 3', 'L3', 'W9'),
        S(12, 'Lower semifinal', 'W10', 'W11'), S(13, 'Lower final', 'L5', 'W12'),
        S(14, 'Grand final', 'W5', 'W13', 5)
      ],
      layout: [
        { n: 1, x: 430, y: 120 }, { n: 3, x: 620, y: 120 }, { n: 2, x: 430, y: 250 }, { n: 4, x: 620, y: 250 }, { n: 5, x: 830, y: 185 },
        { n: 6, x: 60, y: 430 }, { n: 8, x: 245, y: 430 }, { n: 10, x: 430, y: 430 },
        { n: 7, x: 60, y: 555 }, { n: 9, x: 245, y: 555 }, { n: 11, x: 430, y: 555 },
        { n: 12, x: 640, y: 490 }, { n: 13, x: 830, y: 490 }, { n: 14, x: 1060, y: 330 }
      ],
      lines: [
        'M580 162 H620', 'M580 292 H620', 'M770 162 H800 V292 H770', 'M800 227 H830',
        'M210 472 H245', 'M395 472 H430', 'M210 597 H245', 'M395 597 H430',
        'M580 472 H610 V597 H580', 'M610 532 H640', 'M790 532 H830',
        'M980 227 H1020 V532 H980', 'M1020 372 H1060'
      ]
    },
    'de8bye': {
      name: '8 teams · double elimination (top 2 byes, seeds 7-8 start in the lower bracket)',
      short: '8-team double elimination, top 2 byes', teams: 8,
      series: [
        S(1, 'Upper round 1', 'S3', 'S6'), S(2, 'Upper round 1', 'S4', 'S5'),
        S(3, 'Upper semifinal', 'S2', 'W1'), S(4, 'Upper semifinal', 'S1', 'W2'),
        S(5, 'Lower round 1', 'S7', 'L1'), S(6, 'Lower round 1', 'S8', 'L2'),
        S(7, 'Lower round 2', 'L3', 'W6'), S(8, 'Lower round 2', 'L4', 'W5'),
        S(9, 'Upper final', 'W3', 'W4'), S(10, 'Lower semifinal', 'W7', 'W8'),
        S(11, 'Lower final', 'L9', 'W10', 5), S(12, 'Grand final', 'W9', 'W11', 5)
      ],
      layout: [
        { n: 1, x: 430, y: 120 }, { n: 3, x: 620, y: 120 }, { n: 2, x: 430, y: 250 }, { n: 4, x: 620, y: 250 }, { n: 9, x: 830, y: 185 },
        { n: 5, x: 60, y: 430 }, { n: 8, x: 245, y: 430 },
        { n: 6, x: 60, y: 555 }, { n: 7, x: 245, y: 555 },
        { n: 10, x: 450, y: 490 }, { n: 11, x: 660, y: 490 }, { n: 12, x: 1060, y: 330 }
      ],
      lines: [
        'M580 162 H620', 'M580 292 H620', 'M770 162 H800 V292 H770', 'M800 227 H830',
        'M210 472 H245', 'M210 597 H245', 'M395 472 H422 V597 H395', 'M422 532 H450', 'M600 532 H660',
        'M980 227 H1020 V532 H810', 'M1020 372 H1060'
      ]
    },
    'de8': {
      name: '8 teams · double elimination (everyone starts in the upper bracket)',
      short: '8-team double elimination', teams: 8,
      series: [
        S(1, 'Upper round 1', 'S1', 'S8'), S(2, 'Upper round 1', 'S4', 'S5'),
        S(3, 'Upper round 1', 'S2', 'S7'), S(4, 'Upper round 1', 'S3', 'S6'),
        S(5, 'Upper semifinal', 'W1', 'W2'), S(6, 'Upper semifinal', 'W3', 'W4'),
        S(7, 'Lower round 1', 'L1', 'L2'), S(8, 'Lower round 1', 'L3', 'L4'),
        S(9, 'Lower round 2', 'L6', 'W7'), S(10, 'Lower round 2', 'L5', 'W8'),
        S(11, 'Upper final', 'W5', 'W6'), S(12, 'Lower semifinal', 'W9', 'W10'),
        S(13, 'Lower final', 'L11', 'W12', 5), S(14, 'Grand final', 'W11', 'W13', 5)
      ],
      layout: [
        { n: 1, x: 400, y: 40 }, { n: 2, x: 400, y: 140 }, { n: 3, x: 400, y: 240 }, { n: 4, x: 400, y: 340 },
        { n: 5, x: 590, y: 90 }, { n: 6, x: 590, y: 290 }, { n: 11, x: 780, y: 190 },
        { n: 7, x: 60, y: 470 }, { n: 8, x: 60, y: 590 }, { n: 9, x: 245, y: 470 }, { n: 10, x: 245, y: 590 },
        { n: 12, x: 430, y: 530 }, { n: 13, x: 620, y: 530 }, { n: 14, x: 1060, y: 330 }
      ],
      lines: [
        'M550 82 H570 V182 H550', 'M570 132 H590', 'M550 282 H570 V382 H550', 'M570 332 H590',
        'M740 132 H760 V332 H740', 'M760 232 H780',
        'M210 512 H245', 'M210 632 H245', 'M395 512 H412 V632 H395', 'M412 572 H430', 'M580 572 H620',
        'M930 232 H1020 V572 H770', 'M1020 372 H1060'
      ]
    },
    'se8': {
      name: '8 teams · single elimination', short: '8-team single elimination', teams: 8,
      series: [
        S(1, 'Quarterfinal', 'S1', 'S8'), S(2, 'Quarterfinal', 'S4', 'S5'),
        S(3, 'Quarterfinal', 'S2', 'S7'), S(4, 'Quarterfinal', 'S3', 'S6'),
        S(5, 'Semifinal', 'W1', 'W2'), S(6, 'Semifinal', 'W3', 'W4'),
        S(7, 'Grand final', 'W5', 'W6', 5)
      ],
      layout: [
        { n: 1, x: 420, y: 60 }, { n: 2, x: 420, y: 170 }, { n: 3, x: 420, y: 400 }, { n: 4, x: 420, y: 510 },
        { n: 5, x: 640, y: 115 }, { n: 6, x: 640, y: 455 }, { n: 7, x: 1060, y: 330 }
      ],
      lines: [
        'M570 102 H605 V212 H570', 'M605 157 H640', 'M570 442 H605 V552 H570', 'M605 497 H640',
        'M790 157 H1020 V497 H790', 'M1020 372 H1060'
      ]
    },
    'se4': {
      name: '4 teams · single elimination', short: '4-team single elimination', teams: 4,
      series: [
        S(1, 'Semifinal', 'S1', 'S4'), S(2, 'Semifinal', 'S2', 'S3'),
        S(3, 'Grand final', 'W1', 'W2', 5)
      ],
      layout: [{ n: 1, x: 640, y: 160 }, { n: 2, x: 640, y: 500 }, { n: 3, x: 1060, y: 330 }],
      lines: ['M790 202 H1020 V542 H790', 'M1020 372 H1060']
    }
  };
  // The pickems.js bracket for a format and its seeds ({ S1: 'TEAM', ... }). Series keep start, url and score from
  // `old` (the same bracket from an earlier run) where the series number and its seeds haven't changed.
  F.build = function (format, seeds, old) {
    var f = F[format];
    if (!f || typeof f !== 'object' || !f.series) return null;
    var prev = {};
    ((old && old.series) || []).forEach(function (s) { prev[s.n] = s; });
    var sameSeeds = !!old && old.format === format && JSON.stringify(old.seeds || {}) === JSON.stringify(seeds || {});
    return {
      seeds: seeds,
      series: f.series.map(function (t) {
        var p = sameSeeds ? prev[t.n] : null;
        return { n: t.n, round: t.round, a: t.a, b: t.b, bo: p && p.bo ? p.bo : t.bo,
          start: p ? p.start || null : null, score: p ? p.score || null : null, url: p ? p.url || null : null };
      })
    };
  };
  F.list = function () { return Object.keys(F).filter(function (k) { return F[k] && F[k].series; }); };
  if (typeof module !== 'undefined' && module.exports) module.exports = F;
  else root.PCMT_PICKEM_FORMATS = F;
})(typeof window !== 'undefined' ? window : this);
