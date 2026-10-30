// EMEA power rankings from PCMT.gg match data (used by tools/pcmt-sync.js, which writes rankings.js), done the way
// VLR.gg ranks teams: an Elo rating built from series results. Everyone starts at 1500 and every finished series,
// oldest first, moves points from the loser to the winner:
//   * beating a higher-rated team earns more, losing to a lower-rated team costs more (Elo expectation)
//   * playoff series count more than group games (K 40 vs 32)
//   * a sweep (2-0, 3-0) counts 1.25x, 3-1 counts 1.1x, a series that goes the distance counts 1x
// The table shows what VLR.gg's rankings show: rating, streak, series record and when the team last played.
const START = 1500, K_GROUP = 32, K_PLAYOFF = 40;

const expect = (ra, rb) => 1 / (1 + Math.pow(10, (rb - ra) / 400));
function margin(w, l) { return l === 0 ? 1.25 : w - l >= 2 ? 1.1 : 1; }

function rate(matches, until) {
  const R = {}, rec = {};
  const team = (code, name) => {
    if (!(code in R)) { R[code] = START; rec[code] = { code, name: name || code, w: 0, l: 0, results: [], lastPlayed: null }; }
    return rec[code];
  };
  matches
    .filter(M => M.completed && M.score1 !== M.score2 && (!until || Date.parse(M.date) < until))
    .sort((x, y) => Date.parse(x.date) - Date.parse(y.date))
    .forEach(M => {
      const a = team(M.team1, M.team1Name), b = team(M.team2, M.team2Name);
      const aw = M.score1 > M.score2;
      const k = (/playoff/i.test(M.stage || M.id) ? K_PLAYOFF : K_GROUP) * margin(Math.max(M.score1, M.score2), Math.min(M.score1, M.score2));
      const d = k * ((aw ? 1 : 0) - expect(R[a.code], R[b.code]));
      R[a.code] += d; R[b.code] -= d;
      (aw ? a : b).w++; (aw ? b : a).l++;
      a.results.push(aw ? 'W' : 'L'); b.results.push(aw ? 'L' : 'W');
      a.lastPlayed = b.lastPlayed = M.date;
    });
  return Object.keys(rec)
    .map(c => Object.assign(rec[c], { rating: Math.round(R[c]) }))
    .sort((x, y) => y.rating - x.rating || (y.w - y.l) - (x.w - x.l));
}

function streak(results) {
  if (!results.length) return '';
  const last = results[results.length - 1];
  let n = 0;
  for (let i = results.length - 1; i >= 0 && results[i] === last; i--) n++;
  return n + last;
}

// -> { event, updated, teams: [{ rank, code, name, rating, change (rating change over the last week of games),
//      last (rank then, or null), w, l, streak ("3W"), lastPlayed (ISO) }] }
function powerRankings(event, matches) {
  const played = matches.filter(M => M.completed).map(M => M.date).sort();
  const latest = played.length ? Date.parse(played[played.length - 1]) : 0;
  const before = {};
  rate(matches, latest - 7 * 864e5).forEach((t, i) => { before[t.code] = { rank: i + 1, rating: t.rating }; });
  const teams = rate(matches).map((t, i) => ({
    rank: i + 1, code: t.code, name: t.name, rating: t.rating,
    change: before[t.code] ? t.rating - before[t.code].rating : 0, last: before[t.code] ? before[t.code].rank : null,
    w: t.w, l: t.l, streak: streak(t.results), lastPlayed: t.lastPlayed
  }));
  return { event, updated: played[played.length - 1] || null, teams };
}

module.exports = { powerRankings };
