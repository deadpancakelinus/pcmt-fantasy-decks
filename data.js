// PCMT Fantasy Decks season data. This is the only file that changes as the season goes on.
// PCMT_MATCHES: scheduled series (drives Next Match and the gameweek lock).
// PCMT_RESULTS: finished series with each player's stats; card points and weekly VP are worked out from these.
// Both arrays are written as strict JSON (double quotes, quoted keys, no trailing commas) because the server reads them too.
// Entry formats are explained next to these names in index.html.

var PCMT_MATCHES = [
  {
    "region": "NA",
    "start": "2026-10-24T00:00:00Z",
    "a": "T1",
    "b": "NAVI",
    "bo": 5,
    "hours": 5,
    "url": "https://pcmt.gg/events/s3-na/t1-vs-navi-s3-playoffs-2026-10-24-2"
  },
  {
    "region": "EMEA",
    "start": "2026-10-24T17:00:00Z",
    "a": "NATS",
    "b": "ATLC",
    "bo": 3,
    "hours": 3,
    "url": "https://pcmt.gg/events/s2-emea/nats-vs-atlc-s2-playoffs-2026-10-24"
  },
  {
    "region": "NA",
    "start": "2026-10-28T23:30:00Z",
    "a": "T1",
    "b": "SPG",
    "bo": 5,
    "hours": 5,
    "url": "https://pcmt.gg/events/s3-na/t1-vs-spg-s3-playoffs-2026-10-28-2"
  }
];

var PCMT_RESULTS = [
  {
    "region": "NA",
    "start": "2026-10-24T00:00:00Z",
    "a": "T1",
    "b": "NAVI",
    "winner": "T1",
    "url": "https://pcmt.gg/events/s3-na/t1-vs-navi-s3-playoffs-2026-10-24-2",
    "stats": {
      "crocman": [
        101,
        42,
        21,
        15,
        370,
        79,
        225.3,
        1.688
      ],
      "ceiliuir": [
        56,
        49,
        18,
        3,
        231,
        76,
        152,
        1.102
      ],
      "roro": [
        46,
        50,
        39,
        3,
        177,
        68,
        118,
        0.975
      ],
      "pi": [
        41,
        47,
        32,
        8,
        179,
        69,
        118.9,
        0.94
      ],
      "radical": [
        39,
        56,
        24,
        8,
        173,
        75,
        113.2,
        0.848
      ],
      "kennys": [
        60,
        55,
        27,
        7,
        237,
        68,
        156.9,
        1.111
      ],
      "stingray": [
        57,
        54,
        10,
        12,
        231,
        72,
        147,
        1.028
      ],
      "linus": [
        43,
        56,
        27,
        3,
        189,
        68,
        130.8,
        0.91
      ],
      "kaydeg": [
        47,
        59,
        11,
        10,
        195,
        54,
        129.6,
        0.826
      ],
      "cassie": [
        37,
        59,
        16,
        3,
        156,
        61,
        111.4,
        0.741
      ]
    },
    "maps": [
      {
        "map": "Summit",
        "a": 15,
        "b": 13,
        "k": {
          "crocman": 40,
          "roro": 20,
          "pi": 20,
          "ceiliuir": 20,
          "radical": 12,
          "kennys": 30,
          "kaydeg": 20,
          "stingray": 18,
          "linus": 15,
          "cassie": 13
        }
      },
      {
        "map": "Split",
        "a": 14,
        "b": 12,
        "k": {
          "crocman": 34,
          "ceiliuir": 25,
          "roro": 17,
          "pi": 8,
          "radical": 10,
          "stingray": 26,
          "linus": 15,
          "cassie": 18,
          "kennys": 17,
          "kaydeg": 18
        }
      },
      {
        "map": "Lotus",
        "a": 13,
        "b": 5,
        "k": {
          "crocman": 27,
          "radical": 17,
          "pi": 13,
          "ceiliuir": 11,
          "roro": 9,
          "linus": 13,
          "stingray": 13,
          "kennys": 13,
          "kaydeg": 9,
          "cassie": 6
        }
      }
    ]
  },
  {
    "region": "EMEA",
    "start": "2026-10-24T17:00:00Z",
    "a": "NATS",
    "b": "ATLC",
    "winner": "NATS",
    "url": "https://pcmt.gg/events/s2-emea/nats-vs-atlc-s2-playoffs-2026-10-24",
    "stats": {
      "~heef": [
        53,
        30,
        27,
        1,
        309,
        79,
        207.3,
        1.523
      ],
      "~denial": [
        39,
        34,
        21,
        5,
        258,
        73,
        174.5,
        1.197
      ],
      "~syim": [
        37,
        30,
        10,
        5,
        200,
        73,
        126.8,
        1.039
      ],
      "reoken": [
        29,
        39,
        13,
        10,
        176,
        67,
        120.4,
        0.845
      ],
      "spolen": [
        25,
        38,
        10,
        5,
        148,
        63,
        96.7,
        0.722
      ],
      "night-emea": [
        47,
        37,
        6,
        6,
        266,
        67,
        169.2,
        1.157
      ],
      "optimus": [
        37,
        35,
        15,
        6,
        221,
        75,
        144.6,
        1.068
      ],
      "~taylorgzz": [
        37,
        39,
        11,
        5,
        232,
        69,
        172.7,
        1.064
      ],
      "sky": [
        29,
        35,
        9,
        4,
        166,
        60,
        106.3,
        0.807
      ],
      "~angel": [
        21,
        37,
        22,
        1,
        138,
        71,
        90.5,
        0.753
      ]
    },
    "maps": [
      {
        "map": "Sunset",
        "a": 13,
        "b": 11,
        "k": {
          "~heef": 30,
          "~denial": 22,
          "~syim": 19,
          "reoken": 11,
          "spolen": 11,
          "night-emea": 28,
          "~taylorgzz": 20,
          "optimus": 21,
          "~angel": 10,
          "sky": 13
        }
      },
      {
        "map": "Ascent",
        "a": 13,
        "b": 11,
        "k": {
          "~heef": 23,
          "~denial": 17,
          "~syim": 18,
          "reoken": 18,
          "spolen": 14,
          "optimus": 16,
          "~taylorgzz": 17,
          "sky": 16,
          "night-emea": 19,
          "~angel": 11
        }
      }
    ]
  },
  {
    "region": "NA",
    "start": "2026-10-28T23:30:00Z",
    "a": "T1",
    "b": "SPG",
    "winner": "SPG",
    "url": "https://pcmt.gg/events/s3-na/t1-vs-spg-s3-playoffs-2026-10-28-2",
    "stats": {
      "crocman": [
        60,
        49,
        12,
        5,
        267,
        73,
        177,
        1.191
      ],
      "ceiliuir": [
        31,
        48,
        22,
        6,
        162,
        67,
        114.9,
        0.811
      ],
      "roro": [
        37,
        50,
        21,
        3,
        161,
        66,
        102.8,
        0.81
      ],
      "pi": [
        33,
        50,
        19,
        7,
        162,
        61,
        101.5,
        0.751
      ],
      "radical": [
        32,
        51,
        9,
        6,
        153,
        53,
        114.8,
        0.708
      ],
      "cooleo": [
        65,
        39,
        16,
        5,
        272,
        73,
        171.6,
        1.303
      ],
      "phuzzy": [
        54,
        35,
        17,
        8,
        233,
        81,
        160.9,
        1.237
      ],
      "thighs": [
        49,
        35,
        11,
        6,
        202,
        78,
        142.4,
        1.117
      ],
      "dunkn": [
        40,
        36,
        31,
        3,
        179,
        80,
        117.7,
        1.048
      ],
      "derpina": [
        40,
        48,
        10,
        15,
        177,
        72,
        106.8,
        0.84
      ]
    },
    "maps": [
      {
        "map": "Abyss",
        "a": 3,
        "b": 13,
        "k": {
          "crocman": 15,
          "roro": 10,
          "ceiliuir": 8,
          "pi": 4,
          "radical": 6,
          "phuzzy": 17,
          "thighs": 16,
          "dunkn": 14,
          "cooleo": 16,
          "derpina": 8
        }
      },
      {
        "map": "Summit",
        "a": 5,
        "b": 13,
        "k": {
          "crocman": 19,
          "pi": 12,
          "ceiliuir": 9,
          "roro": 8,
          "radical": 6,
          "cooleo": 19,
          "phuzzy": 16,
          "derpina": 17,
          "dunkn": 11,
          "thighs": 8
        }
      },
      {
        "map": "Lotus",
        "a": 14,
        "b": 16,
        "k": {
          "crocman": 26,
          "roro": 19,
          "radical": 20,
          "ceiliuir": 14,
          "pi": 17,
          "cooleo": 30,
          "thighs": 25,
          "phuzzy": 21,
          "dunkn": 15,
          "derpina": 15
        }
      }
    ]
  }
];
