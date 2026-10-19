# fantasy.pcmt.gg — PCMT Fantasy Decks (Version 1.0 BETA)

**New to the project? Read [HANDOFF.md](HANDOFF.md) first.**

Fantasy game for the Plat Chat Members Tourney (NA Season 3, EMEA Season 2).

Live at https://pcmt-fantasy.pages.dev. Every push to `main` redeploys it through Cloudflare Pages.

## What's in this repo

| Path | What it is |
|---|---|
| `index.html` | The Deck (home page) |
| `customization.html` | Card backs, auras, favorites, codes, card packs |
| `leaderboard.html` | Leaderboard |
| `guide.html` | How to play |
| `login.html` | Discord log in |
| `data.js` | **Season data**: scheduled matches and finished results. The only file that changes week to week. |
| `dc-lite.js` | The small engine that draws the pages |
| `league.js` | Discord sign-in (through Supabase), saving decks, scoring and the leaderboard |
| `players.js` | Player list used for scoring (generated from The Deck) |
| `setup/supabase-setup.sql` | Database setup: paste into Supabase → SQL Editor → Run |
| `setup/fix-display-names.sql` | Makes leaderboard names always come from Discord (already included in the setup file) |
| `tools/` | Canvas source and build tools to rebuild the pages (see tools/README.md) |
| `assets/` | Logos, role icons, deck art |
| `_headers` | Tells Cloudflare not to cache `data.js`, so new results show right away |

## Updating match data by hand

Open `data.js`:

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
