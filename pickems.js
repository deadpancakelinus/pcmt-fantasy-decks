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
    "seeds": { "A1": "NIP", "A2": "XTC", "A3": "ATLC", "A4": "FaZe", "A5": "HOT", "B1": "SOG", "B2": "NATS", "B3": "NOOT", "B4": "LARP", "B5": "SEAL" },
    "series": [
      { "n": 1, "round": "Upper round 1", "a": "A2", "b": "B3", "bo": 3, "start": "2026-10-17T18:00:00Z", "score": [2, 0], "url": "https://pcmt.gg/events/s2-emea/noot-vs-xtc-s2-playoffs-2026-10-17" },
      { "n": 2, "round": "Upper round 1", "a": "B2", "b": "A3", "bo": 3, "start": "2026-10-24T17:00:00Z", "score": null, "url": "https://pcmt.gg/events/s2-emea/nats-vs-atlc-s2-playoffs-2026-10-24" },
      { "n": 3, "round": "Upper semifinal", "a": "B1", "b": "W1", "bo": 3, "start": null, "score": null, "url": null },
      { "n": 4, "round": "Upper semifinal", "a": "A1", "b": "W2", "bo": 3, "start": null, "score": null, "url": null },
      { "n": 5, "round": "Upper final", "a": "W3", "b": "W4", "bo": 3, "start": null, "score": null, "url": null },
      { "n": 6, "round": "Lower round 1", "a": "A4", "b": "B5", "bo": 3, "start": "2026-10-11T18:00:00Z", "score": [1, 2], "url": "https://pcmt.gg/events/s2-emea/faze-vs-seal-s2-playoffs-2026-10-11" },
      { "n": 7, "round": "Lower round 1", "a": "B4", "b": "A5", "bo": 3, "start": "2026-10-18T18:00:00Z", "score": [0, 2], "url": "https://pcmt.gg/events/s2-emea/larp-vs-hot-s2-playoffs-2026-10-18" },
      { "n": 8, "round": "Lower round 2", "a": "L1", "b": "W6", "bo": 3, "start": null, "score": null, "url": null },
      { "n": 9, "round": "Lower round 2", "a": "L2", "b": "W7", "bo": 3, "start": null, "score": null, "url": null },
      { "n": 10, "round": "Lower round 3", "a": "L4", "b": "W8", "bo": 3, "start": null, "score": null, "url": null },
      { "n": 11, "round": "Lower round 3", "a": "L3", "b": "W9", "bo": 3, "start": null, "score": null, "url": null },
      { "n": 12, "round": "Lower semifinal", "a": "W10", "b": "W11", "bo": 3, "start": null, "score": null, "url": null },
      { "n": 13, "round": "Lower final", "a": "L5", "b": "W12", "bo": 3, "start": null, "score": null, "url": null },
      { "n": 14, "round": "Grand final", "a": "W5", "b": "W13", "bo": 5, "start": null, "score": null, "url": null }
    ]
  }
];
