# PCMT Fantasy Decks (Version 1.0 BETA)

Fantasy game for the Plat Chat Members Tourney (NA Season 3, EMEA Season 2).

## What's in this folder

| Path | What it is |
|---|---|
| `site/` | **The website.** Upload this folder to any static host (see LAUNCH-CHECKLIST.md). |
| `site/index.html` | Deck Builder (home page) |
| `site/customization.html` | Card backs, auras, favorites, codes, card packs |
| `site/leaderboard.html` | Leaderboard |
| `site/guide.html` | How to play |
| `site/login.html` | Discord log in (needs the Phase 3 backend to work) |
| `site/data.js` | **Season data**: scheduled matches and finished results. The only file that changes week to week. |
| `site/dc-lite.js` | The small engine that draws the pages |
| `site/assets/` | Logos, role icons, deck art |
| `site/_headers` | Tells Cloudflare not to cache `data.js`, so new results show right away |
| `tools/build.py` | Rebuilds `site/` from the canvas boards after design changes |
| `LAUNCH-CHECKLIST.md` | Everything needed to go live, in order |

## Updating match data by hand

Open `site/data.js`:

- Add a scheduled series to `PCMT_MATCHES`:
  `{ region: 'NA', start: '2026-10-24T00:00:00Z', a: 'T1', b: 'NAVI', bo: 5, hours: 5, url: 'https://pcmt.gg/...' }`
  (`start` is UTC; `hours` is 3 for Bo3, 5 for Bo5.)
- When it's finished, add it to `PCMT_RESULTS` with the "All Maps" stats from PCMT.gg:
  `{ region: 'NA', start: '...same as above...', a: 'T1', b: 'NAVI', winner: 'T1', url: '...', stats: { crocman: [K, D, A, FK, ACS, KAST], ... } }`
  Keys are player ids from the store (lowercase names; Night is `night` for BAKA and `night-emea` for ATLC).
  Anyone not in the store goes in as `'~name'` so they still count for top ACS / top KAST.

Card points are worked out automatically: kill +2, assist +1, death −1, first kill +1, series won +2,
top ACS +3, top KAST +1 (ties all get it). They add up through the gameweek and reset at 5:00 AM Monday EDT.

## Rebuilding from the canvas

If the design changes in the canvas, export its `project/` folder and run:

```
python3 tools/build.py <canvas project folder> <assets folder> site
```
