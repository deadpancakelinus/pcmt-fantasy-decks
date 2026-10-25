# Handoff: fantasy.pcmt.gg (PCMT Fantasy Decks)

Start here. It covers what exists, how changes are made and shipped, and what's next.

## 1. Links

| What | Where |
|---|---|
| Live site | **https://fantasy.pcmt.gg** (connected Oct 24 2026; the Cloudflare Pages address https://pcmt-fantasy.pages.dev still works) |
| GitHub repo | `deadpancakelinus/pcmt-fantasy-decks` (Cloudflare Pages redeploys on every push to `main`) |
| Designs | The page boards in the design canvas; the current copy is in `tools/canvas/` |
| Supabase | https://wwrsavqipkxvdsxcemos.supabase.co, publishable key `sb_publishable_e8v-uyAo4fnvwJCHUVA5FQ_LXR6yYM7` (public, already in league.js) |
| Results check | Scheduled job "PCMT.gg match check for PCMT Fantasy Decks": reads PCMT.gg every 6 h at :29 ET and updates `data.js` |

**Never** put these in the site or the repo, or share them: the Supabase database password, the Supabase secret / service_role key, or the Discord Client Secret. Only the publishable key belongs in the site.

## 2. Pages

| Design board | Site file | Shown as |
|---|---|---|
| Home.dc.html | home.html | **Home** (first in the menu): a text tile for every page (no icons), the next two series and the deck lock (each series card links to its own PCMT.gg page, from its `url` in data.js, so every series the match check adds gets its link automatically) the latest Batch Note (`PCMT_HOME_NOTE`, keep in step with the Guide) and the "comments and complaints always welcome :)" box (50 words maximum; `submit_complaint()` in setup/backend-setup.sql; staff read them in backend.html's Complaints tab). Open to everyone. It's at home.html; it can become the front page later. |
| Main.dc.html | index.html | **The Deck** (deck building, player store, next match, lock countdown) |
| Customization.dc.html | customization.html | Card backs, auras, favorites, codes, card packs |
| Leaderboard.dc.html | leaderboard.html | **The Deck Leaderboard** (renamed Oct 24 2026, also in the menu and Home tile): this gameweek / overall standings, no Rankings heading |
| Rules.dc.html | guide.html | Guide + Batch Notes (site is "Version 1.5 BETA"; footers on every page show the version) |
| Login.dc.html | login.html | Discord log in |
| (removed) | transactions.html | Redirects to store.html#credits. Paychecks and spending now live at the bottom of the Store. |
| Store.dc.html | store.html | **Store**: The Bank, NA and EMEA card packs (buy with VP, then the pack opening plays with the cards you pulled), and the variants found in packs (The Role of Yoru: Rare, NA). Everyone except admins sees an empty page with only the card animation and "Coming Soon..." (nothing of the page is drawn). |
| Library.dc.html | library.html | **Library** (right after Store): every card the player owns from packs, MVP VS-size with their MVP VS stats (from trumps-cards.js), one row per rarity (Rare, Common, ...), rarest first; each row is a fanned stack with faces showing, and hovering or tapping a card lifts it out (phones: one stack per row you swipe sideways); ×count on each card; All / NA / EMEA / Rare filters. Everyone except admins sees an empty page with only the card animation and "Coming Soon..." (nothing of the page is drawn). |
| Pickems.dc.html | pickems.html | **Pick'ems** (EMEA S2 playoffs bracket), right after Home in the menu and the first Home tile. Open to the public (Oct 24 2026). See section 12. |
| (hand-written) | admin.html | Old admin page: now just sends people to backend.html (4Ks and 5Ks and card pack prices moved there). |
| (hand-written) | mvp-vs.html | **MVP VS** card game (see section 9). Its board MvpVs.dc.html is only the old "Coming soon" design and is not built. |

Branding: header and titles say **fantasy.pcmt.gg**. The site is a PCMT Team product (Freshbatch is no longer involved, Oct 24 2026); every page footer says "A PCMT product" (plain text; the old Freshbatch credits window, freshbatch.js and its intro video were removed) above Riot's required fan-project notice. Every page footer carries Riot's required fan-project notice ("created under Riot Games' Legal Jibber Jabber policy…", linking riotgames.com/en/legal); keep it on any new page. Colors black + `#a5dcdd`; fonts Cabin Sketch / Space Grotesk / JetBrains Mono.

## 3. How the site is built

- The boards in `tools/canvas/` are the design source.
- `tools/build.py` compiles the boards into plain HTML (template as JSON + logic class). `tools/wire.py` applies site-only changes (Discord login label, saved decks, server-side codes, live standings).
- `dc-lite.js` is the small page engine; `league.js` is sign-in, deck saving, scoring and standings (plain `fetch` to Supabase, no SDK).
- `data.js` holds `PCMT_MATCHES` / `PCMT_RESULTS`. It is **live data** kept up to date by the scheduled check. Never overwrite it from a build.
- `data.js` and `players.js` must stay strict JSON inside each `var X = [...]` (double quotes, no trailing commas, no comments inside the arrays). Supabase reads both from the live site every hour to pay VP.

## 4. Making a change (the routine)

1. Edit the board(s) in `tools/canvas/*.dc.html`.
2. Build: `python3 -I tools/build.py tools/canvas assets <out>`
3. Test: copy the repo `data.js` and `pickems.js` into `<out>`, serve it (`python3 -m http.server 8766 --directory <out>`, in the background) and run `NODE_PATH=$(npm root -g) node tools/smoke-test.js http://localhost:8766 <out>/shots`. It mocks Supabase and checks every page on desktop and phone. Look at the screenshots for visual changes.
4. Copy `home.html index.html customization.html leaderboard.html guide.html login.html store.html library.html pickems.html players.js league.js dc-lite.js variant-art.js _headers` from `<out>` into the repo root (**not** `data.js` or `pickems.js`, **not** `assets/`, **not** `mvp-vs.html` or `admin.html`, which are hand-written). Copy changed boards into `tools/canvas/`.
5. Update the design canvas with the changed boards so it stays in step with `tools/canvas/`.
6. Commit, then `git fetch && git stash && git rebase origin/main && git stash pop && git push` (the scheduled check also pushes to `main`).

`league.js` and `dc-lite.js` sources live in `tools/`; edit those, not the root copies.

## 5. Game rules (as built)

- Deck: 11 players, roles filled, budget 100, max 2 per team, twin rule; one IGL scores ×1.5.
- Scoring per series (from the Oct 19 2026 gameweek): kill +1, every 5 kills on one map +1, assist +0.5, first blood +0.5, Toxic rating (PCMT.gg's RT column, `R1.0` in its data) #1/#2/#3 in the series +3/+2/+1, top ACS +2, top KAST +1 (ties all get it), every 50 ADR +1, map win +1, map won by 4-9 +1 / by 10-12 +2 / 13-0 +7 (instead of the round-difference points), map lost 0-13 -5, 0 kills on a map -5, series won 2-0 +2 / 3-0 +3 / 3-1 +1 (2-1 and 3-2 get nothing extra), 4K +1, 5K (ace) +3. Deaths don't score. The same rules live in three places that must agree: `seriesPoints()` in tools/league.js (with `SCORING`), `pcmtSeriesPoints()` in the Main board, and `vp_series_points()` in setup/vp-setup.sql. Credits are the week's card numbers (cards below zero count 0), rounded to a whole number.
- 4Ks and 5Ks are the only numbers typed in by hand (PCMT.gg doesn't have them). Staff enter them on backend.html into the `multikills` table, keyed by series `start|a|b` as in data.js. league.js attaches them to each result as `multi: { id: [4K, 5K] }`. Everything else comes from the match page: `node tools/pcmt-result.js page.html players.js <url>` turns a saved PCMT.gg match page into a PCMT_RESULTS entry (series stats [K, D, A, FK, ACS, KAST, ADR, RT] plus `maps: [{ map, a, b, k: { id: kills } }]`); the scheduled match check uses it.
- Gameweeks start Monday 09:00 UTC (5:00 AM EDT). Decks lock 12 h before the week's first series and stay locked while the week still has a game to play; once every game posted for the week is played (result in, or its time slot over) and nothing else is posted, decks open again (Oct 25 2026; `pcmtWeekLock` in the Main board, `lockLabel` on Home). The deck that counts for a week is still the last one saved before its lock, so changes made after it count from the next gameweek. Transfers are unlimited while the deck is unlocked (since Oct 24 2026; was 2 per gameweek): the last valid deck saved before the lock counts, and an invalid deck falls back to the previous one. `TRANSFERS = Infinity` in tools/league.js; vp_compute in setup/vp-setup.sql has no transfer check.
- Unlocks: all NA and EMEA team decks are unlocked for everyone (Oct 24 2026; EMEA panel above NA on Customization), Gold by active weeks, champion/missed win, Midlife Crisis at a 200-point week, Ethan aura for two consecutive weekly #1s, Champion's Aura holder from standings. Codes are redeemed server-side with `redeem_code` (PRIDE is seeded).

- Batch Notes (the Guide's update notes, formerly Patch Notes): all removed on Oct 24 2026 ahead of release; a new one will be written then. Home hides its Latest Batch Notes section while `PCMT_HOME_NOTE` is null, and the Guide's Batch Notes section was taken out (add it back with the new note). Entries are signed "PCMT Team · <month>".
- Deck names: blocked words (fuck, shit, ass, poop, pee, piss, Israel, faggot, and since Oct 24 2026 penis and other NSFW words and slurs, with look-alike characters and spacing) can't be saved. Short words (cum, sex, anal, dick, cock, rape, nude, horny ...) only count as whole words, so names like Document, Sussex, Canal, Peacock, Grape, Basement and thorny stay allowed. The Deck refuses them with a message, league.js never sends them, and the `deck_history` insert trigger refuses them (`pcmt_bad_name` in setup/supabase-setup.sql). Older names already saved show with the word starred out on the Leaderboard. The rules are `pcmtCensorName` in the Main board and tools/league.js and `pcmt_bad_name` in SQL; keep the three in step.

## 6. Supabase

Tables: `profiles`, `deck_history` (insert-only, server timestamps, 60/hour limit), `codes` (private), `user_unlocks`, `vp_ledger` (read own rows only; written only by the payout), `vp_sync_log` (private), `multikills` (everyone reads, admins write), `pcmt_admins` (site admins: they see hidden pages like the Store early; add someone with `insert into public.pcmt_admins (user_id) values ('<account id>');`); RLS on all. Setup SQL is in `setup/`. Discord provider on; Site URL and Redirect URLs point at pcmt-fantasy.pages.dev.

## 7. Known limits

- Decks are publicly readable before the lock.
- Favorites, equipped card back and opened packs are stored per device.
- Supabase free projects pause after a week with no activity.
- Estimated prices for sovaraa, k9, luna, danaxa, sy.

## 8. Open items

- Run `setup/cards-setup.sql` in the Supabase SQL Editor (after vp-setup.sql) to switch on card packs; then set prices on backend.html (Card packs tab).
- Run `setup/vp-setup.sql` in the Supabase SQL Editor to switch on VP (until then, the Store's paychecks panel shows "VP isn't switched on yet" to admins).
- Run `setup/fix-display-names.sql` in the Supabase SQL Editor if not done yet.
- Run `setup/trumps-setup.sql` in the Supabase SQL Editor to switch on MVP VS online rooms (until then, online shows "not switched on yet" and the bot game works). Re-run it after 2026-10-21 so online rooms accept the past seasons.
- If Supabase Redirect URLs are not a wildcard, add `https://fantasy.pcmt.gg/mvp-vs.html` (and the pages.dev one) so logging in from MVP VS returns there.

## 9. MVP VS (mvp-vs.html, public since 2026-10-19)

- Files: `mvp-vs.html` (page, hand-written, same header as the site), `trumps.js` (engine, bot, online rooms, UI), `trumps-cards.js` (built), `trumps/build_cards.py`, `trumps/data/pcmt-stats.tsv`, `trumps/data/agent-roles.json`, `trumps/test.js`, `setup/trumps-setup.sql`.
- Cards: every S3 NA and S2 EMEA player from pcmt.gg/stats (Show Subs on, Showmatches off, seasons not combined): 87 NA, 51 EMEA. Past seasons too: NA S1 (25), NA S2 (62), EMEA S1 (21), as decks `nas1`, `nas2`, `emeas1` in trumps-cards.js. A picker chooses which set is dealt; a game never mixes them. Past-season cards are never on The Deck.
- Stats on each card, in order: ACS, KAST, HS%, DPR, Toxic rating, all from pcmt.gg/stats. Higher wins except DPR (lower wins).
- Roles: from The Deck's player list; players not in it get the role they played most maps on that season (`trumps/data/agent-roles.json`, from pcmt.gg player pages; ties go to their top agent's role). Past-season cards always use that file: maps per agent from that season's pcmt.gg match data (S2 NA group-stage maps have no agents, so those players use their nearest other season). jenji, amiable, rudesubs, VALENTIA, cloud and Jack (S2 NA) have no agent data anywhere and show no role icon.
- Past-season teams: `trumps/data/old-teams.json` (name and logo from each team's pcmt.gg page, colour picked from the logo, and which team won the season). Logos are in `assets/`.
- Refreshing stats: re-export the pcmt.gg/stats rows for S3 NA and S2 EMEA into `pcmt-stats.tsv` (same columns as the site, plus player link and logo path), then rebuild. The past-season rows (S1 NA, S2 NA, S1 EMEA) are in the same file and won't change. After a rebuild, also re-run `tools/cards.py` (it reads the past-season cards from trumps-cards.js).
- Rules: the whole region deck is dealt between two players (with an odd count, whoever picks second gets the extra card). The better stat (higher, or lower for DPR) takes both cards and picks next. No pot: on a tie each card goes back to the bottom of its own deck and the same player picks again. Win by holding every card, or most cards after round 60 (nearly every game, per simulation).
- Game screen: a card table with each player's deck on their side. Cards are dealt from the decks, yours flips face up, theirs flips on the reveal, and both fly face down to the winner's deck (on a tie, each back to its own deck). Card backs come from `backFor(seat)` in `trumps.js`: everyone uses the deck card back for now; later, online players will show their chosen card back there.
- Modes: vs bot, and 1v1 online with a 5-letter room code for anyone logged in with Discord (Supabase `trumps_rooms`, polled every 1.5 s; writes only through `trumps_create` / `trumps_join` / `trumps_move`; players only see rooms they sit in; rooms idle for a day are removed).
- Known limit: the game state is trusted from the two players' browsers and holds both hands, so a player with dev tools could peek at the other hand or fake a move. Moving the rules into a Supabase function would fix it if that ever matters.
- Test: serve the repo root (`python3 -m http.server 8767 --directory .`) and run `NODE_PATH=$(npm root -g) node trumps/test.js http://localhost:8767 <shots>`. The site smoke test also opens mvp-vs.

## 10. VP (Credits) and the Store paychecks panel

- VP for a gameweek = the sum of the card numbers of the deck that counted that week (the same deck the leaderboard scores: locked deck, transfer and fallback rules). Each card counts at least 0, and there is no IGL bonus.
- Paid when the gameweek ends (Monday 09:00 UTC), when the card numbers reset. If a late result raises a card, the difference is paid as a top-up. A payout is never taken back.
- Server side: `setup/vp-setup.sql`. `vp_sync()` runs every hour (pg_cron, minute 7). It fetches the live `data.js` and `players.js`, recomputes every finished gameweek with `vp_compute` and writes only the missing amounts to `vp_ledger`. Players can only read their own rows and cannot run the payout. `vp_sync_log` keeps the last runs.
- Ledger lines: `week` = payout (positive), `pack` = VP spent on a card pack (negative, `detail.pack` = pack name). A check constraint enforces this. The Bank is the sum of a player's lines, so buying a pack lowers it.
- Site side: `league.js` reads `vp_ledger` and shows it in the "Paychecks and spending" panel at the bottom of store.html (top line: total Credits). Last Paycheck is what the ledger paid for the last finished gameweek.
- Test: start a throwaway Postgres, then run `node tools/vp-test.js "psql -h /tmp/pg -p 5499 -U postgres" <out>/players.js`. It checks the SQL against the site's own scoring in random seasons, plus top-ups, re-runs and permissions.
- Next phases: card packs bought with VP, cards stored per player on the server, a card album page, then MVP VS hands from owned cards and VP bets (game run on the server).

## 11. Cards and card packs

- Catalog: every store player is a Common card (`c:<player id>`); variants are `v:<variant id>` with a rarity (The Role of Yoru, Straight Ace, claps Clove and Croc Spotlight = Rare). Each card has a region (from its team).
- Packs: NA Card Pack and EMEA Card Pack, 5 cards each, drawn only from that region's current-season cards. Odds per card: Common 70, Rare 22, Epic 7, Legendary 1. If a tier has no cards yet, the card drops to the next tier down.
- Throwback packs: NA S1, NA S2 and EMEA S1 Throwback Pack, same size and odds, each drawing only that season (`season` on `cards` and `card_packs`; null = current). Every player of the season is a Common `o:<MVP VS card id>` (e.g. `o:nas1-igneous`); that season's champions also have a Rare `v:champ-<MVP VS card id>` with the trophy art (6 S1 NA, 5 S2 NA, 5 S1 EMEA). Cards show that season's team, logo and MVP VS stats (`pcmtPastCard` in the Store and Library boards). They are for MVP VS and the Library, never The Deck. Past-season variants go in `PAST_VARIANTS` in tools/cards.py and only drop from that season's pack. Clove Value (lore) and Butterfly Effect (claps S2) were taken out of packs on 2026-10-21; copies already pulled stay.
- `tools/cards.py` holds the variants, packs and odds and writes `setup/cards-setup.sql` (run `python3 -I tools/cards.py <out>/players.js`). Re-run it and the SQL when players or variants change; removed cards are switched off, never deleted.
- Buying is only the `buy_pack(pack)` function on the server: it checks the price, the buyer's VP (one purchase at a time per player), writes the `pack` line in `vp_ledger`, draws the cards, adds them to `user_cards` (duplicates are counted) and logs `pack_openings`. The browser only shows the result.
- Prices and "Open to everyone" are set on backend.html (Card packs tab). Until a pack is open to everyone, only admins and PCMT Team staff can buy it (a price of 0 is free, for testing).
- The Store board carries a copy of the Customization board's pack opening (`pcmtPackAnim`), changed for store packs: a team per card, rarity glow and tag, variant art, NEW / ×n badges, and it stays open until closed. The pack images on the Store are that same pack, drawn once (assets `1ebfc850…` NA, `87166e6b…` EMEA).
- Champion cards: a player only has a champion card (Rare, trophy art, gold sheen) and the trophy by their name for the season they won: S1 NA (YD), S2 NA (JDG) and S1 EMEA (WFC), in those throwback packs. Nobody has won NA S3 or EMEA S2 yet, so current-season cards have no champion card. Current-season cards of past champions (`PCMT_SITE_CHAMPS`) still show the small trophy by their name, on The Deck, in packs, the Library and MVP VS; a past-season card shows it only if the player won that season. The 11 old current-season champion cards were switched off on 2026-10-21 (copies already pulled stay). When a season ends: set `CURRENT_CHAMPION` in trumps/build_cards.py and add the winners' `champ-<player id>` cards in tools/cards.py. The Deck still marks past champions with `PCMT_SITE_CHAMPS` for its unlocks.
- Series: a variant in `PCMT_STORE_ITEMS` can have `series` (e.g. 'Spotlight Moment'); the Store shows each series under its own heading with a note that it can only be pulled from packs (never sold on its own), and every card says which pack it comes from. Spotlight Moment: claps Clove and Croc Spotlight (NA Card Pack), The Lurking Sova (stingray) and Psyclone Spotlight (NA S2 Throwback Pack). Snapshot Moments: Straight Ace (NA Card Pack) and Detained (lazy, NA S2 Throwback Pack, full-card screenshot).
- Variant art comes two ways: a cut-out picture that sits at the side of the card (The Role of Yoru, claps Clove), or a screenshot that fills the whole card face (Straight Ace; listed in `PCMT_VARIANT_FULL`). Screenshots are cropped to 5:7 first.
- To add a variant: add it to `VARIANTS` in tools/cards.py, its art to `PCMT_VARIANT_ART` (and `PCMT_STORE_ITEMS` to show it) in the Store board, rebuild, run the SQL.
- Player names match PCMT.gg everywhere (The Deck, packs, MVP VS), except lazy, who shows as lazynottired, and teklo, who shows as teklologik (ids stay `lazy` and `teklo`; results and VP use ids). `DECK_NAMES` and `SHOW_NAMES` in trumps/build_cards.py handle names that differ from PCMT.gg.
- Store pack opening: the pack waits for a tap and rips; the 5 cards come out face down in a stack and each tap reveals the next one, big in the middle (a Rare glows and shakes in its colour first); the last tap spreads all 5 out. Cards are MVP VS cards (same layout and stats, from trumps-cards.js, scaled to fit) with no rainbow sheen (Rares keep their own light). buy_pack shuffles the order, so a rare can be anywhere.
- Rare and up: a soft light sweep across the card every 5 s, the same as the champion cards on The Deck and a shiny stamp with the rarity, both in the card's team colour.
- Test: `node tools/cards-test.js "psql -h /tmp/pg -p 5499 -U postgres"` (odds, region, throwback seasons, VP, duplicates, at-once purchases, permissions).

## PCMT Team backend (backend.html)
- Hand-written page, not in the nav, noindex. Opens with a window that asks for the page password, then the Discord login, then checks the PCMT Team staff list. Tabs: Player prices (editable), Cards (rarity, pack, copies, owners), Rare cards (art, pack, series, owners; Release / Hold back each one with `fb_release_card`), Card packs (price and open to everyone, from the old admin page; staff and admins can save and test-buy unopened packs), 4Ks & 5Ks, Complaints.
- SQL: setup/backend-setup.sql, after supabase → vp → cards. The staff list (`freshbatch_staff`, `is_freshbatch()`) is in vp-setup.sql so the 4K/5K rules can use it.
- Add staff: `insert into public.freshbatch_staff (user_id) values ('<account id>') on conflict do nothing;` (the page shows the id to anyone not on the list).
- Page password: set or change it in the Supabase SQL editor with `select public.fb_set_page_password('<password>');`. Only a bcrypt hash is stored; the site checks it with `fb_page_unlock`. It's a front door only; the data itself is staff-only in the database.
- Prices: every change is a dated row in `player_price_changes` (null = back to the players.js price). league.js and vp_compute both check a deck against the prices from when it was saved, so a price change never breaks a saved deck.
- Test: `node tools/backend-test.js "psql -h /tmp/pg -p 5499 -U postgres" players.js`.

## Rare card release (Oct 23 2026)
- `cards.released`: only released cards can be pulled. Commons are always released; every Rare (variants and champions) starts held back. A Rare roll on a pack with no released Rares gives a Common (same drop-down rule as before), so the 80/20 odds stay set and start counting the moment one is released.
- Staff release or hold back each Rare on backend.html (Rare cards tab), via `fb_release_card(card, released)` (staff only). The Store's odds line shows what a pack can really drop (league.js loads released Rares as `PCMT_RELEASED_RARES`).
- The Store is open to everyone, packs only: the Rare card series sections were taken off the page. `PCMT_STORE_ITEMS` stays in the Store board (pack opening uses its stats, and the build writes each variant's art and series to `variant-art.js` for the backend).
- Store (packs only) and Library are open to everyone (Oct 23 2026); the Transactions page was folded into the bottom of the Store; they no longer depend on `PCMT_IS_ADMIN`.
- MVP VS Rares (Oct 23 2026): on the Library page a player picks which of their Rare-or-up cards go in their MVP VS deck (`user_cards.in_deck`, set only with `set_card_in_deck()`, which checks they own it and it isn't a Common). In MVP VS (trumps.js), when one of your cards is dealt and you picked Rares of that player, it shows as one of them (chosen at random from the game seed, so it stays the same all game): their art, a glow and a RARE stamp. Nothing picked: the Common. Stats never change, and only your own cards change (the bot's and your opponent's stay Common). Art comes from variant-art.js.
- Library MVP VS panel (Oct 23 2026): titled "MVP VS", "Display your wealth in MVP VS". Players drag Rare cards from the stacks below into it (mouse: drag; phone: press and hold, then drag; keyboard: focus a Rare card and press Enter); × takes one out. Same `set_card_in_deck()` underneath.
- MVP VS subs (cards with no team logo) show the NA or EMEA logo of the region they sub for.
- Header: the Discord button sits top right on every page (same spot at every width); the page links have their own row underneath.

## 12. Pick'ems (pickems.html, added Oct 23 2026, open to the public)

- Bracket: EMEA S2 playoffs, double elimination, 14 series (upper R1 1-2, semis 3-4, upper final 5; lower R1 6-7, R2 8-9, R3 10-11, semi 12, lower final 13; grand final 14, Bo5; the rest Bo3). Seeds from the PCMT.gg group tables: Group Alpha NIP, XTC, ATLC, FaZe, HOT; Group Omega SOG, NATS, NOOT, LARP, SEAL. NA S3 has no pick'ems.
- Data: `pickems.js` (strict JSON like data.js; hand-written, never overwritten by a build). Each series has `a`/`b` (a seed like `A2`, or `W1` / `L1` = winner / loser of series 1), `bo`, `start` (when picks lock; null = not announced), `score` ([a maps, b maps] once finished) and `url`. Keep it up to date from PCMT.gg: add each series' `start` and `url` as soon as it is listed, and its `score` when it ends. The match check does this too.
- Layout: the bracket is drawn like the PCMT bracket picture (group table top left, upper bracket, lower bracket, grand final with the crown), from `PCMT_PICKEM_LAYOUT` and `PCMT_PICKEM_LINES` in the board. Each box is just the two teams, with no series numbers beside them (unknown slots show W1 / L2 like the picture). A faded EMEA logo sits behind the bracket. Phones swipe it sideways.
- Picks: the winner of every series (no score). Tap a team to pick it (light blue), tap it again to clear it; once a series is played your pick turns green if right, red if wrong; picks that can no longer happen (after an earlier pick changed) drop off. Your winners move on through the bracket (italic = only there because of your picks). Nothing is sent until **Save picks** under the bracket, which saves the whole bracket at once with `save_bracket()` (it checks every pick follows the real results and your own earlier picks).
- Lock: the whole bracket locks **6 hours before the next game** (the earliest series in pickems.js with a start and no score) and stays locked for good. `pickem_check_lock()` saves that moment in `pickem_events.lock_at` the first time it's reached (run by the hourly sync and before every save); it never moves after that. While no unplayed series has a time, picks are open. Oct 25 2026: lock_at set by hand to Oct 31 11:59 PM ET (`2026-11-01 04:00+00`), so picks stay open until then; games played before that still lock their own series. To change it: `update public.pickem_events set lock_at = '<time>' where id = 'emea-s2';` (or `null` to go back to locking 6 hours before the next game).
- Top of the page: the "Pick'ems" heading on the left and a small NEXT UP panel on the right (the next scheduled EMEA playoff game from pickems.js, and when picks lock). No description text or staff badge.
- Under the bracket: the Save picks row, then Standings (no heading, just the manager search), as wide as the bracket, styled like the Leaderboard's rankings (gold #1, your row pinned). Columns: Picked (picks made) and Points.
- Scoring: 1 point and 20 Credits for the right winner (`credits_win` in `pickem_events`; `credits_exact` is 0). Paid into `vp_ledger` as kind `pickem` (shown in the Store's "Paychecks and spending" panel), once per pick, never taken back.
- Server: `setup/pickems-setup.sql` (after vp-setup.sql). `pickem_sync()` runs every hour at minute 37, fetches the live pickems.js into `pickem_state` and pays. `save_pick()` is the only way to write a pick (checks the lock, the teams, the score, and that the bracket is open or you are staff/admin). Players read only their own picks; standings come from `pickem_standings()`.
- Open to the public (`open = true` in `pickem_events`, Oct 24 2026). `update public.pickem_events set open = false where id = 'emea-s2';` closes it again (players then see "Coming soon"; staff and admins still see and use it).
- Test: `node tools/pickems-test.js "psql -h /tmp/pg -p 5499 -U postgres"`.

## 13. Pages waiting for launch (Oct 24 2026)

- **MVP VS, Store and Library wait for launch on backend.html (Pages tab, the first tab).** Each has an Open link (staff can open it) and a Launch button (press twice). Launching makes the page live for everyone: it shows in the menu and the Home tiles and leaves the list. Launching the Store also opens every card pack to everyone.
- Until a page is launched, links to it are hidden for everyone, staff included (staff use the backend's Open link), and anyone but staff and site admins who opens it is sent to home.html (transactions.html and collection.html count as the Store).
- Server: `setup/pages-setup.sql`: the `site_pages` table (everyone reads it) and `fb_launch_page(page)` (staff only). Test: `node tools/pages-test.js "psql -h /tmp/pg -p 5499 -U postgres"`.
- Site: `LAUNCH_PAGES` / `launchDecide()` at the top of tools/league.js, and the same check in the `<head>` of mvp-vs.html (it doesn't load league.js). A link with `data-pcmt-keep` is never hidden (the backend's Open links).
- To hide a launched page again: `update public.site_pages set launched = false, launched_at = null, launched_by = null where id = '<page>';` (for the Store, also close packs in the Card packs tab if needed).
- New pages can be added to the list: insert a `site_pages` row and add the page to `LAUNCH_PAGES` (league.js and mvp-vs.html).

## 14. Link previews (Oct 24 2026)

- Every page shares (Discord, texts) as title **fantasy.pcmt.gg** with the description **"Pickems, Fantasy League and more. Built by PCMT Team"**: `description`, `og:title`, `og:description`, `og:type` and `twitter:*` tags (no `og:site_name`, so Discord shows the name once) written by `tools/build.py` into each built page, and the same tags by hand in mvp-vs.html. No share image yet.

## 15. Launch check (Oct 24 2026)

- **Lists are read in pages.** The Supabase API returns at most 1,000 rows per request. `apiAll()` in tools/league.js (also `PCMT_LEAGUE.apiAll`, used by backend.html) reads a list 1,000 rows at a time until a page comes back empty, so saved decks, names, 4Ks/5Ks, price changes, Credits lines, cards and complaints are never cut off. Every list it reads has an `order=` so pages don't overlap. Tested with 1,500 managers and 4,500 saved decks: everyone loads, about 3 s.
- **Only pages that score decks load them.** The Deck, The Deck Leaderboard, Customization and the Store load every saved deck, name, 4K/5K and Credits line; Home, Pick'ems, Library, the Guide and Login skip them (`needDecks` in league.js).
- Checked: all test suites pass (vp, backend, cards, pickems, MVP VS on an ungated copy, smoke test); both hourly jobs run with no failures; no secrets in the repo; data files are strict JSON; Supabase security advisories are only expected items (functions check the caller themselves).
- trumps/test.js now meets the staff-only gate on mvp-vs.html: run it against a copy with the gate script removed.
- Watch as it grows: Supabase free plan data allowance (each visit to the four scoring pages downloads every saved deck). If it gets close, move the scoring to a database function that returns only each manager's counted decks.

## 16. Custom domain fantasy.pcmt.gg (Oct 24 2026)

- **fantasy.pcmt.gg is the site's address.** pcmt.gg's DNS is on Cloudflare in a different account from the Pages project, so it was added as a Pages custom domain with a CNAME `fantasy` → `pcmt-fantasy.pages.dev` in the pcmt.gg account. Never "transfer DNS" for pcmt.gg; that would move the whole domain.
- Supabase: Site URL `https://fantasy.pcmt.gg`, Redirect URLs include `https://fantasy.pcmt.gg/**` (pages.dev kept so both addresses log in). Discord login confirmed working on the new address.
- Hourly jobs: `vp_sync()` and `pickem_sync()` read data.js, players.js and pickems.js from fantasy.pcmt.gg (switched Oct 24 2026 with `setup/domain-switch.sql`; both ran ok on the new address).

## 17. Freshbatch out (Oct 24 2026)

- Freshbatch is no longer part of the site. Everything players and staff see says **PCMT Team** instead: page footers ("A PCMT product"), the link preview ("Pickems, Fantasy League and more. Built by PCMT Team"), the Home thank-you message, Batch Note signatures, the backend ("PCMT Team backend", "PCMT Team staff list") and the database's "PCMT Team staff only." messages.
- Removed: the Freshbatch credits window (freshbatch.js) and media/freshbatch-intro.mp4 (the backend sign-in window no longer plays a video).
- Internal names stay as they were so nothing breaks: the `freshbatch_staff` table, `is_freshbatch()`, `freshbatch_settings`, the `fb_*` functions and the `fb-unlocked` session key. They mean "PCMT Team staff".

## 18. Credits window (Oct 25 2026)
Clicking **PCMT** in the footer line "A PCMT product" opens a glass Credits panel (Esc, the × or a click outside closes it). It lives at the end of `tools/league.js` (copied to `league.js`), so it works on every page that loads league.js with no rebuild. Names are in the `NAMES` list there and sort A–Z on their own.
