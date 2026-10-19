# Handoff: fantasy.pcmt.gg (PCMT Fantasy Decks)

Start here. It covers what exists, how changes are made and shipped, and what's next.

## 1. Links

| What | Where |
|---|---|
| Live site | https://pcmt-fantasy.pages.dev (custom domain fantasy.pcmt.gg not connected yet) |
| GitHub repo | `deadpancakelinus/pcmt-fantasy-decks` (Cloudflare Pages redeploys on every push to `main`) |
| Designs | Five page boards in the design canvas; the current copy is in `tools/canvas/` |
| Supabase | https://wwrsavqipkxvdsxcemos.supabase.co, publishable key `sb_publishable_e8v-uyAo4fnvwJCHUVA5FQ_LXR6yYM7` (public, already in league.js) |
| Results check | Scheduled job "PCMT.gg match check for PCMT Fantasy Decks": reads PCMT.gg every 6 h at :29 ET and updates `data.js` |

**Never** put these in the site or the repo, or share them: the Supabase database password, the Supabase secret / service_role key, or the Discord Client Secret. Only the publishable key belongs in the site.

## 2. Pages

| Design board | Site file | Shown as |
|---|---|---|
| Main.dc.html | index.html | **The Deck** (deck building, player store, next match, lock countdown) |
| Customization.dc.html | customization.html | Card backs, auras, favorites, codes, card packs |
| Leaderboard.dc.html | leaderboard.html | This gameweek / overall standings |
| Rules.dc.html | guide.html | Guide + Patch Notes ("Version 1.0 BETA", "Welcome to the BETA") |
| Login.dc.html | login.html | Discord log in |

Branding: header and titles say **fantasy.pcmt.gg**. Colors black + `#a5dcdd`; fonts Cabin Sketch / Space Grotesk / JetBrains Mono.

## 3. How the site is built

- The boards in `tools/canvas/` are the design source.
- `tools/build.py` compiles the boards into plain HTML (template as JSON + logic class). `tools/wire.py` applies site-only changes (Discord login label, saved decks, server-side codes, live standings).
- `dc-lite.js` is the small page engine; `league.js` is sign-in, deck saving, scoring and standings (plain `fetch` to Supabase, no SDK).
- `data.js` holds `PCMT_MATCHES` / `PCMT_RESULTS`. It is **live data** kept up to date by the scheduled check. Never overwrite it from a build.

## 4. Making a change (the routine)

1. Edit the board(s) in `tools/canvas/*.dc.html`.
2. Build: `python3 -I tools/build.py tools/canvas assets <out>`
3. Test: copy the repo `data.js` into `<out>`, serve it (`python3 -m http.server 8766 --directory <out>`, in the background) and run `NODE_PATH=$(npm root -g) node tools/smoke-test.js http://localhost:8766 <out>/shots`. It mocks Supabase and checks every page on desktop and phone. Look at the screenshots for visual changes.
4. Copy `index.html customization.html leaderboard.html guide.html login.html players.js league.js dc-lite.js _headers` from `<out>` into the repo root (**not** `data.js`, **not** `assets/`). Copy changed boards into `tools/canvas/`.
5. Update the design canvas with the changed boards so it stays in step with `tools/canvas/`.
6. Commit, then `git fetch && git stash && git rebase origin/main && git stash pop && git push` (the scheduled check also pushes to `main`).

`league.js` and `dc-lite.js` sources live in `tools/`; edit those, not the root copies.

## 5. Game rules (as built)

- Deck: 11 players, roles filled, budget 95, max 2 per team, twin rule; one IGL scores ×1.5.
- Scoring per series: kill +2, assist +1, death −1, first kill +1, series won +2, top ACS +3, top KAST +1 (ties all get it).
- Gameweeks start Monday 09:00 UTC (5:00 AM EDT). Decks lock 12 h before the week's first series. 2 transfers per gameweek, counted against the last scored deck; an invalid deck falls back to the previous one.
- Unlocks: team decks at 100 team points, Gold by active weeks, champion/missed win, Midlife Crisis at a 200-point week, Ethan aura for two consecutive weekly #1s, Champion's Aura holder from standings. Codes are redeemed server-side with `redeem_code` (PRIDE is seeded).

## 6. Supabase

Tables: `profiles`, `deck_history` (insert-only, server timestamps, 60/hour limit), `codes` (private), `user_unlocks`; RLS on all. Setup SQL is in `setup/`. Discord provider on; Site URL and Redirect URLs point at pcmt-fantasy.pages.dev.

## 7. Known limits

- Decks are publicly readable before the lock.
- Favorites, equipped card back and opened packs are stored per device.
- Supabase free projects pause after a week with no activity.
- Estimated prices for sovaraa, k 9, luna, danaxa, sy, amara, adeline, kennys, lazy.

## 8. Open items

- Run `setup/fix-display-names.sql` in the Supabase SQL Editor if not done yet.
- Connect fantasy.pcmt.gg: Cloudflare Pages → Custom domains, then add it to Supabase Redirect URLs.
- **Top Trumps** (private beta, branch `trumps`, see section 9).

## 9. Top Trumps (branch `trumps`, not merged, not pushed while the repo is public)

- Files: `trumps.html`, `trumps.js` (engine, bot, online rooms, UI), `trumps-cards.js` (built), `trumps/build_cards.py`, `trumps/data/pcmt-stats.tsv`, `trumps/data/ratings.json`, `trumps/test.js`, `setup/trumps-setup.sql`. Nothing in the existing pages links to it.
- Cards: every S3 NA and S2 EMEA player from pcmt.gg/stats (Show Subs on, Showmatches off, seasons not combined): 87 NA, 51 EMEA. A region toggle picks which set is dealt; a game never mixes them.
- Stats compared (higher wins): Toxics rating, ACS, KAST (from pcmt.gg), Mechanics and Brains (placeholders: percentile mixes of HS%/KPR/FKPR/ADR and APR/KAST/DPR/FDPR within the region). Set real values in `trumps/data/ratings.json`, then `python3 -I trumps/build_cards.py`.
- Refreshing stats: re-export the pcmt.gg/stats rows for S3 NA and S2 EMEA into `pcmt-stats.tsv` (same columns as the site, plus player link and logo path), then rebuild.
- Rules: the whole region deck is dealt between two players (odd spare card starts in the pot). Higher stat takes both cards and picks next; ties go to the pot. Win by holding every card, or most cards after round 60 (nearly every game, per simulation).
- Modes: vs bot (works offline), 1v1 online with a 5-letter room code (Discord sign-in, Supabase `trumps_rooms` polled every 1.5 s, writes only through `trumps_create` / `trumps_join` / `trumps_move`, testers listed in `trumps_testers`). Run `setup/trumps-setup.sql` once, then add testers with the commented lines at its end.
- Known beta limits: the game state is trusted from the clients and contains both hands, so a tester with dev tools could peek. Fine for a tester-only beta, not for public launch.
- Test: serve the repo root (`python3 -m http.server 8767 --directory .`) and run `NODE_PATH=$(npm root -g) node trumps/test.js http://localhost:8767 <shots>`.
- Before going public: decide how to keep it private (the GitHub repo is public, so a pushed branch is visible), Cloudflare Access on previews, add `trumps.html` to Supabase Redirect URLs if they are not a wildcard, then link it from the site nav.
