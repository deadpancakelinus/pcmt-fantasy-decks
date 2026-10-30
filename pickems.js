// Pick'ems brackets. Strict JSON inside the array (double quotes, no trailing commas, no comments) because the server reads it too.
// seeds: group placings (A1 = 1st in Group A) -> team code.
// series n: a and b are a seed ("A2"), the winner of series n ("W1") or the loser of series n ("L1").
// start: when picks for that series lock (null = time not known yet). score: [a maps, b maps] once finished, else null.
// url: the series page on PCMT.gg once it is listed.

var PCMT_PICKEMS = [
  {
    "id": "emea-s2",
    "name": "EMEA S2 Playoffs",
    "region": "EMEA",
    "event": "s2-emea",
    "seeds": {
      "A1": "NIP",
      "A2": "XTC",
      "A3": "ATLC",
      "A4": "FaZe",
      "A5": "HOT",
      "B1": "SOG",
      "B2": "NATS",
      "B3": "NOOT",
      "B4": "LARP",
      "B5": "SEAL"
    },
    "series": [
      {
        "n": 1,
        "round": "Upper round 1",
        "a": "A2",
        "b": "B3",
        "bo": 3,
        "start": "2026-10-17T18:00:00Z",
        "score": [
          2,
          0
        ],
        "url": "https://pcmt.gg/events/s2-emea/noot-vs-xtc-s2-playoffs-2026-10-17"
      },
      {
        "n": 2,
        "round": "Upper round 1",
        "a": "B2",
        "b": "A3",
        "bo": 3,
        "start": "2026-10-24T17:00:00Z",
        "score": [
          2,
          0
        ],
        "url": "https://pcmt.gg/events/s2-emea/nats-vs-atlc-s2-playoffs-2026-10-24"
      },
      {
        "n": 3,
        "round": "Upper semifinal",
        "a": "B1",
        "b": "W1",
        "bo": 3,
        "start": null,
        "score": null,
        "url": null
      },
      {
        "n": 4,
        "round": "Upper semifinal",
        "a": "A1",
        "b": "W2",
        "bo": 3,
        "start": null,
        "score": null,
        "url": null
      },
      {
        "n": 5,
        "round": "Upper final",
        "a": "W3",
        "b": "W4",
        "bo": 3,
        "start": null,
        "score": null,
        "url": null
      },
      {
        "n": 6,
        "round": "Lower round 1",
        "a": "A4",
        "b": "B5",
        "bo": 3,
        "start": "2026-10-11T18:00:00Z",
        "score": [
          1,
          2
        ],
        "url": "https://pcmt.gg/events/s2-emea/faze-vs-seal-s2-playoffs-2026-10-11"
      },
      {
        "n": 7,
        "round": "Lower round 1",
        "a": "B4",
        "b": "A5",
        "bo": 3,
        "start": "2026-10-18T18:00:00Z",
        "score": [
          0,
          2
        ],
        "url": "https://pcmt.gg/events/s2-emea/larp-vs-hot-s2-playoffs-2026-10-18"
      },
      {
        "n": 8,
        "round": "Lower round 2",
        "a": "L1",
        "b": "W6",
        "bo": 3,
        "start": "2026-11-01T19:00:00Z",
        "score": null,
        "url": "https://pcmt.gg/events/s2-emea/noot-vs-seal-s2-playoffs-2026-11-01"
      },
      {
        "n": 9,
        "round": "Lower round 2",
        "a": "L2",
        "b": "W7",
        "bo": 3,
        "start": null,
        "score": null,
        "url": null
      },
      {
        "n": 10,
        "round": "Lower round 3",
        "a": "L4",
        "b": "W8",
        "bo": 3,
        "start": null,
        "score": null,
        "url": null
      },
      {
        "n": 11,
        "round": "Lower round 3",
        "a": "L3",
        "b": "W9",
        "bo": 3,
        "start": null,
        "score": null,
        "url": null
      },
      {
        "n": 12,
        "round": "Lower semifinal",
        "a": "W10",
        "b": "W11",
        "bo": 3,
        "start": null,
        "score": null,
        "url": null
      },
      {
        "n": 13,
        "round": "Lower final",
        "a": "L5",
        "b": "W12",
        "bo": 3,
        "start": null,
        "score": null,
        "url": null
      },
      {
        "n": 14,
        "round": "Grand final",
        "a": "W5",
        "b": "W13",
        "bo": 5,
        "start": null,
        "score": null,
        "url": null
      }
    ]
  },
  {
    "id": "na-s3",
    "name": "NA S3 Playoffs",
    "region": "NA",
    "event": "s3-na",
    "seeds": {
      "A1": "C9",
      "A2": "T1",
      "A3": "FSG",
      "A4": "TL",
      "B1": "SRB",
      "B2": "SPG",
      "B3": "TS",
      "B4": "NAVI"
    },
    "series": [
      {
        "n": 1,
        "round": "Upper round 1",
        "a": "A2",
        "b": "B3",
        "bo": 3,
        "start": "2026-08-26T00:00:00Z",
        "score": [
          2,
          0
        ],
        "url": "https://pcmt.gg/events/s3-na/t1-vs-ts-s3-playoffs-2026-08-26"
      },
      {
        "n": 2,
        "round": "Upper round 1",
        "a": "B2",
        "b": "A3",
        "bo": 3,
        "start": "2026-09-12T00:00:00Z",
        "score": [
          2,
          0
        ],
        "url": "https://pcmt.gg/events/s3-na/spg-vs-fsg-s3-playoffs-2026-09-12"
      },
      {
        "n": 3,
        "round": "Upper semifinal",
        "a": "B1",
        "b": "W1",
        "bo": 3,
        "start": "2026-09-10T01:00:00Z",
        "score": [
          0,
          2
        ],
        "url": "https://pcmt.gg/events/s3-na/t1-vs-srb-s3-playoffs-2026-09-09"
      },
      {
        "n": 4,
        "round": "Upper semifinal",
        "a": "A1",
        "b": "W2",
        "bo": 3,
        "start": "2026-09-19T00:30:00Z",
        "score": [
          0,
          2
        ],
        "url": "https://pcmt.gg/events/s3-na/c9-vs-spg-s3-playoffs-2026-09-19"
      },
      {
        "n": 5,
        "round": "Lower round 1",
        "a": "A4",
        "b": "L1",
        "bo": 3,
        "start": "2026-09-20T00:00:00Z",
        "score": [
          2,
          0
        ],
        "url": "https://pcmt.gg/events/s3-na/tl-vs-ts-s3-playoffs-2026-09-20"
      },
      {
        "n": 6,
        "round": "Lower round 1",
        "a": "B4",
        "b": "L2",
        "bo": 3,
        "start": "2026-09-19T01:00:00Z",
        "score": [
          2,
          0
        ],
        "url": "https://pcmt.gg/events/s3-na/fsg-vs-navi-s3-playoffs-2026-09-19"
      },
      {
        "n": 7,
        "round": "Lower round 2",
        "a": "L3",
        "b": "W6",
        "bo": 3,
        "start": "2026-09-27T00:00:00Z",
        "score": [
          0,
          2
        ],
        "url": "https://pcmt.gg/events/s3-na/srb-vs-navi-s3-playoffs-2026-09-27-2"
      },
      {
        "n": 8,
        "round": "Lower round 2",
        "a": "L4",
        "b": "W5",
        "bo": 3,
        "start": "2026-09-28T01:00:00Z",
        "score": [
          2,
          1
        ],
        "url": "https://pcmt.gg/events/s3-na/c9-vs-tl-s3-playoffs-2026-09-28"
      },
      {
        "n": 9,
        "round": "Upper final",
        "a": "W3",
        "b": "W4",
        "bo": 3,
        "start": "2026-10-03T00:00:00Z",
        "score": [
          1,
          2
        ],
        "url": "https://pcmt.gg/events/s3-na/t1-vs-spg-s3-playoffs-2026-10-03"
      },
      {
        "n": 10,
        "round": "Lower semifinal",
        "a": "W7",
        "b": "W8",
        "bo": 3,
        "start": "2026-10-10T01:00:00Z",
        "score": [
          2,
          1
        ],
        "url": "https://pcmt.gg/events/s3-na/navi-vs-c9-s3-playoffs-2026-10-10"
      },
      {
        "n": 11,
        "round": "Lower final",
        "a": "L9",
        "b": "W10",
        "bo": 5,
        "start": "2026-10-24T00:00:00Z",
        "score": [
          3,
          0
        ],
        "url": "https://pcmt.gg/events/s3-na/t1-vs-navi-s3-playoffs-2026-10-24-2"
      },
      {
        "n": 12,
        "round": "Grand final",
        "a": "W9",
        "b": "W11",
        "bo": 5,
        "start": "2026-10-28T23:30:00Z",
        "score": [
          3,
          0
        ],
        "url": "https://pcmt.gg/events/s3-na/t1-vs-spg-s3-playoffs-2026-10-28-2"
      }
    ]
  }
];
