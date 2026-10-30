// EMEA power rankings from PCMT.gg match data (used by tools/pcmt-sync.js, which writes rankings.js).
// Every finished map of the event, oldest first, moves both teams' rating like chess Elo (everyone starts at 1500):
// the winner takes points from the loser, more for an upset and more for a big round difference.
// Winning the series adds a smaller swing on top. "Last week" is the same table built without the last 7 days of
// games before the latest one, so the window can show who moved up or down (it only changes when a new game is played).
const START = 1500, K_MAP = 24, K_SERIES = 12;

const expect = (ra, rb) => 1 / (1 + Math.pow(10, (rb - ra) / 400));

function rate(matches, until) {
  const R = {}, rec = {};
  const team = (code, name) => {
    if (!(code in R)) { R[code] = START; rec[code] = { code, name: name || code, sw: 0, sl: 0, mw: 0, ml: 0, rd: 0, form: [] }; }
    return rec[code];
  };
  matches
    .filter(M => M.completed && (!until || Date.parse(M.date) < until))
    .sort((x, y) => Date.parse(x.date) - Date.parse(y.date))
    .forEach(M => {
      const a = team(M.team1, M.team1Name), b = team(M.team2, M.team2Name);
      (M.mapDetails || []).forEach(md => {
        const s1 = +md.score1, s2 = +md.score2; if (s1 === s2) return;
        const aw = s1 > s2, diff = Math.abs(s1 - s2);
        const mult = Math.log(diff + 1) / Math.log(14) + 0.5;   // 13-12 ~0.75, 13-6 ~1.3, 13-0 1.5
        const d = K_MAP * mult * ((aw ? 1 : 0) - expect(R[a.code], R[b.code]));
        R[a.code] += d; R[b.code] -= d;
        if (aw) { a.mw++; b.ml++; } else { b.mw++; a.ml++; }
        a.rd += s1 - s2; b.rd += s2 - s1;
      });
      const aw = M.score1 > M.score2;
      const d = K_SERIES * ((aw ? 1 : 0) - expect(R[a.code], R[b.code]));
      R[a.code] += d; R[b.code] -= d;
      (aw ? a : b).sw++; (aw ? b : a).sl++;
      a.form.push({ r: aw ? 'W' : 'L', vs: b.code, score: M.score1 + '-' + M.score2 });
      b.form.push({ r: aw ? 'L' : 'W', vs: a.code, score: M.score2 + '-' + M.score1 });
    });
  return Object.keys(rec)
    .map(c => Object.assign(rec[c], { rating: Math.round(R[c]) }))
    .sort((x, y) => y.rating - x.rating || y.rd - x.rd);
}

// -> { event, updated, teams: [{ rank, code, name, rating, last (rank a week ago, or null), sw, sl, mw, ml, rd, form }] }
function powerRankings(event, matches) {
  const played = matches.filter(M => M.completed).map(M => M.date).sort();
  const latest = played.length ? Date.parse(played[played.length - 1]) : 0;
  const lastWeek = {};
  rate(matches, latest - 7 * 864e5).forEach((t, i) => { lastWeek[t.code] = i + 1; });
  const teams = rate(matches).map((t, i) => ({
    rank: i + 1, code: t.code, name: t.name, rating: t.rating, last: lastWeek[t.code] || null,
    sw: t.sw, sl: t.sl, mw: t.mw, ml: t.ml, rd: t.rd, form: t.form.slice(-5)
  }));
  return { event, updated: played[played.length - 1] || null, teams };
}

module.exports = { powerRankings };
