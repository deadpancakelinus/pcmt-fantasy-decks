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
  }
];

var PCMT_RESULTS = [];
