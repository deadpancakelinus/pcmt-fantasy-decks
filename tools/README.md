# Rebuilding the website

Each page is designed as a board in `canvas/` and compiled into plain HTML by `build.py`.

| File | What it is |
|---|---|
| `canvas/*.dc.html` | The page boards (the design source). |
| `build.py` | Turns the boards into `index.html`, `customization.html`, `leaderboard.html`, `guide.html`, `login.html`, plus `players.js` and `data.js`. |
| `wire.py` | Website-only changes: Discord sign-in in the header, saved decks, server-checked codes, live leaderboard. |
| `dc-lite.js` | Source of the page engine (copied to the site root). |
| `league.js` | Source of the sign-in / scoring layer (copied to the site root). |

## Steps

```
python3 tools/build.py tools/canvas assets /tmp/pcmt-out
```

Then copy everything from `/tmp/pcmt-out` into the repo root **except `data.js` and `assets/`**
(the live `data.js` is kept up to date by the PCMT.gg check; `assets/` is already the source).
Open the pages locally (`python3 -m http.server` in the repo root), check them, commit, push.
Cloudflare Pages redeploys on every push to `main`.

A rebuild of an unchanged canvas produces byte-identical pages, so `git diff` after a rebuild shows exactly what a design change did.
