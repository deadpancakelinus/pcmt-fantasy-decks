// PCMT Fantasy Decks season data. This is the only file that changes as the season goes on.
// PCMT_MATCHES: scheduled series (drives Next Match and the gameweek lock).
// PCMT_RESULTS: finished series with each player's stats; card points and weekly VP are worked out from these.
// Both arrays are written as strict JSON (double quotes, quoted keys, no trailing commas) because the server reads them too.
// Entry formats are explained next to these names in index.html.

var PCMT_MATCHES = [
  {
    "region": "EMEA",
    "start": "2026-11-15T15:00:00Z",
    "a": "SOG",
    "b": "XTC",
    "bo": 3,
    "hours": 3,
    "url": "https://pcmt.gg/events/s2-emea/sog-vs-xtc-s2-playoffs-2026-11-15-2"
  },
  {
    "region": "NA",
    "start": "2026-11-18T03:00:00Z",
    "a": "FNC",
    "b": "WBG",
    "bo": 3,
    "hours": 3,
    "url": "https://pcmt.gg/events/s4-na/fnc-vs-wbg-s4-group-a-2026-11-18"
  },
  {
    "region": "NA",
    "start": "2026-11-20T01:00:00Z",
    "a": "EDM",
    "b": "CR",
    "bo": 3,
    "hours": 3,
    "url": "https://pcmt.gg/events/s4-na/edm-vs-cr-s4-group-b-2026-11-20"
  },
  {
    "region": "NA",
    "start": "2026-11-22T02:00:00Z",
    "a": "NBR",
    "b": "PRX",
    "bo": 3,
    "hours": 3,
    "url": "https://pcmt.gg/events/s4-na/nbr-vs-prx-s4-group-c-2026-11-22"
  },
  {
    "region": "NA",
    "start": "2026-11-23T02:00:00Z",
    "a": "BLG",
    "b": "TANK",
    "bo": 3,
    "hours": 3,
    "url": "https://pcmt.gg/events/s4-na/blg-vs-tank-s4-group-d-2026-11-23"
  },
  {
    "region": "NA",
    "start": "2026-11-26T03:00:00Z",
    "a": "LOUD",
    "b": "SRG",
    "bo": 3,
    "hours": 3,
    "url": "https://pcmt.gg/events/s4-na/loud-vs-srg-s4-group-a-2026-11-26"
  },
  {
    "region": "NA",
    "start": "2026-11-28T00:00:00Z",
    "a": "DEI",
    "b": "EDG",
    "bo": 3,
    "hours": 3,
    "url": "https://pcmt.gg/events/s4-na/dei-vs-edg-s4-group-b-2026-11-28"
  },
  {
    "region": "NA",
    "start": "2026-11-29T22:00:00Z",
    "a": "DRX",
    "b": "NRG",
    "bo": 3,
    "hours": 3,
    "url": "https://pcmt.gg/events/s4-na/drx-vs-nrg-s4-group-c-2026-11-29"
  },
  {
    "region": "NA",
    "start": "2027-06-08T04:59:00Z",
    "a": "WOOD",
    "b": "WING",
    "bo": 5,
    "hours": 5,
    "url": "https://pcmt.gg/events/s2-na/wood-vs-wing-s2-group-stage-2027-06-08"
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
  },
  {
    "region": "EMEA",
    "start": "2026-11-01T19:00:00Z",
    "a": "NOOT",
    "b": "SEAL",
    "winner": "SEAL",
    "url": "https://pcmt.gg/events/s2-emea/noot-vs-seal-s2-playoffs-2026-11-01",
    "stats": {
      "haike": [
        36,
        42,
        25,
        6,
        206,
        73,
        148.7,
        1.025
      ],
      "taylorgzz": [
        41,
        46,
        16,
        4,
        227,
        66,
        152.9,
        0.994
      ],
      "jamit": [
        38,
        43,
        15,
        4,
        202,
        75,
        133.5,
        0.964
      ],
      "king": [
        43,
        44,
        6,
        8,
        213,
        64,
        134.2,
        0.936
      ],
      "pengu": [
        18,
        44,
        11,
        0,
        100,
        53,
        78.7,
        0.534
      ],
      "~nana": [
        48,
        28,
        24,
        7,
        260,
        87,
        176.3,
        1.366
      ],
      "ghrf6": [
        50,
        32,
        13,
        8,
        236,
        82,
        156.8,
        1.243
      ],
      "hmmmdead": [
        47,
        40,
        12,
        10,
        238,
        82,
        167.7,
        1.173
      ],
      "eva": [
        39,
        37,
        31,
        4,
        196,
        76,
        131.2,
        1.087
      ],
      "otaka": [
        29,
        40,
        18,
        4,
        167,
        76,
        112.3,
        0.862
      ]
    },
    "maps": [
      {
        "map": "Ascent",
        "a": 5,
        "b": 13,
        "k": {
          "haike": 10,
          "jamit": 13,
          "taylorgzz": 13,
          "king": 10,
          "pengu": 5,
          "ghrf6": 22,
          "~nana": 17,
          "hmmmdead": 13,
          "eva": 12,
          "otaka": 11
        }
      },
      {
        "map": "Haven",
        "a": 13,
        "b": 9,
        "k": {
          "jamit": 19,
          "king": 23,
          "taylorgzz": 18,
          "haike": 16,
          "pengu": 8,
          "hmmmdead": 19,
          "eva": 16,
          "ghrf6": 16,
          "otaka": 12,
          "~nana": 11
        }
      },
      {
        "map": "Abyss",
        "a": 2,
        "b": 13,
        "k": {
          "taylorgzz": 10,
          "haike": 10,
          "king": 10,
          "jamit": 6,
          "pengu": 5,
          "~nana": 20,
          "hmmmdead": 15,
          "eva": 11,
          "ghrf6": 12,
          "otaka": 6
        }
      }
    ]
  },
  {
    "region": "EMEA",
    "start": "2026-11-05T21:30:00Z",
    "a": "NATS",
    "b": "NIP",
    "winner": "NIP",
    "url": "https://pcmt.gg/events/s2-emea/nats-vs-nip-s2-playoffs-2026-11-05",
    "stats": {
      "asra": [
        45,
        30,
        3,
        3,
        259,
        76,
        164.5,
        1.212
      ],
      "denial": [
        36,
        33,
        13,
        5,
        239,
        65,
        157.5,
        1.075
      ],
      "~syim": [
        29,
        36,
        17,
        2,
        182,
        67,
        111.4,
        0.875
      ],
      "reoken": [
        25,
        32,
        12,
        5,
        178,
        70,
        122.5,
        0.874
      ],
      "spolen": [
        17,
        32,
        22,
        3,
        111,
        76,
        72.3,
        0.724
      ],
      "kai": [
        60,
        27,
        8,
        14,
        346,
        83,
        220.2,
        1.604
      ],
      "pandyro": [
        39,
        35,
        14,
        6,
        251,
        76,
        167.4,
        1.155
      ],
      "sb": [
        32,
        35,
        12,
        5,
        201,
        67,
        122.6,
        0.923
      ],
      "jinno": [
        14,
        26,
        23,
        1,
        85,
        70,
        54.8,
        0.685
      ],
      "goofy": [
        18,
        29,
        8,
        2,
        110,
        63,
        80,
        0.673
      ]
    },
    "maps": [
      {
        "map": "Ascent",
        "a": 12,
        "b": 12,
        "k": {
          "asra": 28,
          "denial": 22,
          "~syim": 13,
          "reoken": 10,
          "spolen": 7,
          "kai": 28,
          "pandyro": 22,
          "goofy": 12,
          "sb": 11,
          "jinno": 5
        }
      },
      {
        "map": "Split",
        "a": 9,
        "b": 13,
        "k": {
          "asra": 17,
          "reoken": 15,
          "~syim": 16,
          "denial": 14,
          "spolen": 10,
          "kai": 32,
          "sb": 21,
          "pandyro": 17,
          "jinno": 9,
          "goofy": 6
        }
      }
    ]
  },
  {
    "region": "EMEA",
    "start": "2026-11-15T15:00:00Z",
    "a": "SOG",
    "b": "XTC",
    "winner": "XTC",
    "url": "https://pcmt.gg/events/s2-emea/sog-vs-xtc-s2-playoffs-2026-11-15",
    "stats": {
      "faye": [
        32,
        30,
        8,
        3,
        244,
        76,
        150.3,
        1.079
      ],
      "~k 9": [
        25,
        31,
        7,
        5,
        203,
        76,
        130.8,
        0.909
      ],
      "magmoz": [
        21,
        28,
        9,
        3,
        185,
        59,
        123.5,
        0.828
      ],
      "alet": [
        19,
        30,
        8,
        6,
        166,
        68,
        110.5,
        0.761
      ],
      "charlotte": [
        8,
        29,
        4,
        0,
        65,
        41,
        51.3,
        0.353
      ],
      "alexx": [
        30,
        21,
        20,
        6,
        243,
        81,
        155.4,
        1.259
      ],
      "~kaiser": [
        31,
        25,
        21,
        5,
        237,
        87,
        143.9,
        1.221
      ],
      "riyako": [
        28,
        18,
        17,
        1,
        195,
        81,
        140.6,
        1.209
      ],
      "sinderinho": [
        30,
        20,
        7,
        5,
        227,
        89,
        145.3,
        1.19
      ],
      "yessi": [
        29,
        21,
        10,
        3,
        197,
        70,
        126.5,
        1.076
      ]
    },
    "maps": [
      {
        "map": "Summit",
        "a": 10,
        "b": 13,
        "k": {
          "faye": 27,
          "~k 9": 17,
          "alet": 14,
          "magmoz": 12,
          "charlotte": 4,
          "sinderinho": 20,
          "alexx": 19,
          "~kaiser": 16,
          "riyako": 12,
          "yessi": 13
        }
      },
      {
        "map": "Sunset",
        "a": 1,
        "b": 13,
        "k": {
          "~k 9": 8,
          "magmoz": 9,
          "alet": 5,
          "faye": 5,
          "charlotte": 4,
          "riyako": 16,
          "yessi": 16,
          "~kaiser": 15,
          "alexx": 11,
          "sinderinho": 10
        }
      }
    ]
  },
  {
    "region": "NA",
    "start": "2026-11-18T03:00:00Z",
    "a": "FNC",
    "b": "WBG",
    "winner": "FNC",
    "url": "https://pcmt.gg/events/s4-na/fnc-vs-wbg-s4-group-a-2026-11-18",
    "stats": {
      "claps-s4": [
        56,
        20,
        10,
        15,
        404,
        90,
        239,
        1.812
      ],
      "~caesparz": [
        24,
        26,
        12,
        4,
        196,
        74,
        147.6,
        1.016
      ],
      "nameless-s4": [
        29,
        25,
        9,
        3,
        200,
        68,
        126.8,
        1.013
      ],
      "radical-s4": [
        26,
        23,
        10,
        3,
        178,
        76,
        115.6,
        0.995
      ],
      "psyclone-s4": [
        20,
        24,
        21,
        3,
        148,
        87,
        104.6,
        0.969
      ],
      "pavel-s4": [
        40,
        29,
        8,
        7,
        306,
        66,
        192.7,
        1.276
      ],
      "caleb-s4": [
        30,
        31,
        8,
        0,
        218,
        61,
        142.6,
        0.967
      ],
      "igneous-s4": [
        19,
        33,
        10,
        2,
        164,
        61,
        101.6,
        0.695
      ],
      "lucas-s4": [
        18,
        31,
        6,
        1,
        151,
        61,
        106.2,
        0.691
      ],
      "tery-s4": [
        11,
        31,
        14,
        0,
        100,
        63,
        69.8,
        0.556
      ]
    },
    "maps": [
      {
        "map": "Lotus",
        "a": 13,
        "b": 4,
        "k": {
          "claps-s4": 25,
          "radical-s4": 19,
          "~caesparz": 12,
          "nameless-s4": 12,
          "psyclone-s4": 7,
          "pavel-s4": 17,
          "igneous-s4": 10,
          "tery-s4": 9,
          "caleb-s4": 10,
          "lucas-s4": 5
        }
      },
      {
        "map": "Corrode",
        "a": 13,
        "b": 8,
        "k": {
          "claps-s4": 31,
          "nameless-s4": 17,
          "psyclone-s4": 13,
          "~caesparz": 12,
          "radical-s4": 7,
          "pavel-s4": 23,
          "caleb-s4": 20,
          "lucas-s4": 13,
          "igneous-s4": 9,
          "tery-s4": 2
        }
      }
    ]
  },
  {
    "region": "NA",
    "start": "2026-11-20T01:00:00Z",
    "a": "EDM",
    "b": "CR",
    "winner": "EDM",
    "url": "https://pcmt.gg/events/s4-na/edm-vs-cr-s4-group-b-2026-11-20",
    "stats": {
      "james-s4": [
        56,
        34,
        21,
        7,
        325,
        88,
        212.8,
        1.524
      ],
      "jaypee-s4": [
        56,
        34,
        11,
        10,
        319,
        86,
        200.9,
        1.442
      ],
      "li-s4": [
        34,
        27,
        16,
        6,
        183,
        78,
        111.7,
        1.033
      ],
      "hascan-s4": [
        33,
        29,
        10,
        3,
        172,
        65,
        110.5,
        0.934
      ],
      "~caesparz": [
        13,
        22,
        14,
        1,
        143,
        73,
        99.9,
        0.8
      ],
      "corina-s4": [
        8,
        12,
        5,
        1,
        129,
        84,
        78.6,
        0.772
      ],
      "nolan-s4": [
        43,
        41,
        17,
        5,
        259,
        80,
        165.7,
        1.155
      ],
      "apple-s4": [
        39,
        39,
        7,
        6,
        224,
        67,
        145.9,
        0.994
      ],
      "jooah-s4": [
        32,
        42,
        18,
        6,
        187,
        61,
        118,
        0.851
      ],
      "nut-s4": [
        28,
        41,
        16,
        1,
        162,
        67,
        108.1,
        0.801
      ],
      "ceiliuir-s4": [
        16,
        37,
        19,
        3,
        101,
        63,
        65.2,
        0.596
      ]
    },
    "maps": [
      {
        "map": "Corrode",
        "a": 16,
        "b": 14,
        "k": {
          "jaypee-s4": 29,
          "james-s4": 27,
          "hascan-s4": 26,
          "li-s4": 18,
          "~caesparz": 13,
          "nolan-s4": 26,
          "jooah-s4": 20,
          "apple-s4": 22,
          "nut-s4": 20,
          "ceiliuir-s4": 14
        }
      },
      {
        "map": "Lotus",
        "a": 13,
        "b": 6,
        "k": {
          "james-s4": 29,
          "jaypee-s4": 27,
          "li-s4": 16,
          "corina-s4": 8,
          "hascan-s4": 7,
          "apple-s4": 17,
          "nolan-s4": 17,
          "jooah-s4": 12,
          "nut-s4": 8,
          "ceiliuir-s4": 2
        }
      }
    ]
  },
  {
    "region": "NA",
    "start": "2026-11-22T02:00:00Z",
    "a": "NBR",
    "b": "PRX",
    "winner": "NBR",
    "url": "https://pcmt.gg/events/s4-na/nbr-vs-prx-s4-group-c-2026-11-22",
    "stats": {
      "josh-s4": [
        68,
        43,
        21,
        4,
        298,
        70,
        199.6,
        1.384
      ],
      "platy-s4": [
        49,
        45,
        23,
        9,
        231,
        73,
        164.9,
        1.135
      ],
      "art-s4": [
        45,
        46,
        11,
        2,
        201,
        70,
        125.6,
        0.942
      ],
      "makya-s4": [
        35,
        47,
        19,
        5,
        162,
        75,
        99.9,
        0.828
      ],
      "lore-s4": [
        29,
        46,
        27,
        1,
        130,
        70,
        85,
        0.759
      ],
      "crocman-s4": [
        65,
        44,
        12,
        11,
        284,
        71,
        181.5,
        1.278
      ],
      "jaden-s4": [
        63,
        46,
        10,
        16,
        284,
        76,
        177.2,
        1.244
      ],
      "toastemup-s4": [
        44,
        48,
        27,
        5,
        214,
        73,
        145.9,
        1.038
      ],
      "~tawngay": [
        33,
        45,
        25,
        5,
        155,
        68,
        101.9,
        0.831
      ],
      "hankyjanky-s4": [
        22,
        43,
        26,
        5,
        107,
        67,
        67.5,
        0.662
      ]
    },
    "maps": [
      {
        "map": "Lotus",
        "a": 8,
        "b": 13,
        "k": {
          "josh-s4": 25,
          "platy-s4": 13,
          "art-s4": 15,
          "makya-s4": 9,
          "lore-s4": 6,
          "crocman-s4": 21,
          "toastemup-s4": 21,
          "jaden-s4": 21,
          "~tawngay": 15,
          "hankyjanky-s4": 7
        }
      },
      {
        "map": "Summit",
        "a": 13,
        "b": 5,
        "k": {
          "josh-s4": 26,
          "platy-s4": 14,
          "art-s4": 14,
          "makya-s4": 11,
          "lore-s4": 10,
          "crocman-s4": 19,
          "toastemup-s4": 11,
          "jaden-s4": 14,
          "~tawngay": 7,
          "hankyjanky-s4": 5
        }
      },
      {
        "map": "Sunset",
        "a": 13,
        "b": 11,
        "k": {
          "platy-s4": 22,
          "josh-s4": 17,
          "art-s4": 16,
          "makya-s4": 15,
          "lore-s4": 13,
          "jaden-s4": 28,
          "crocman-s4": 25,
          "toastemup-s4": 12,
          "~tawngay": 11,
          "hankyjanky-s4": 10
        }
      }
    ]
  }
];
