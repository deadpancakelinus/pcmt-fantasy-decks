# PCMT Fantasy League — project package

Plat Chat Members Tourney NA Season 3 fantasy site, built as a design canvas
(5 pages: Team Builder, Customization, Leaderboard, Guide, Log in).

## What's inside
- `project/` — the canvas exactly as it was published:
  - `canvas.json` — board layout (positions, sizes, page order)
  - `Main.dc.html` (Team Builder), `Customization.dc.html`, `Leaderboard.dc.html`,
    `Rules.dc.html` (Guide), `Login.dc.html`
- `assets/` — every image the pages use (24 PNGs): 16 team logos, 4 role icons,
  the PCMT logo, the PCMT Retro logo, the PCMT Champion trophy cutout and the loader card back.
- `asset-map.json` — maps each image address used in the pages (`/_blob/<id>`)
  to its file in `assets/`.

## Moving it to a new canvas
The image addresses only work inside the original canvas. To move the boards, upload every
image in `assets/` to the new canvas and swap each `/_blob/...` address in the .dc.html files
for the new upload's address using `asset-map.json`.

## Notes for whoever picks it up
- Fonts load from Google Fonts (Cabin Sketch, JetBrains Mono, Space Grotesk).
- Placeholders the live site needs to fill (marked in the code): weekly player points,
  leaderboard rows, Champion's Aura holder, team-deck points, unlock streaks/flags,
  Season 1 champion list, NA match schedule from PCMT.gg.
- Preview switches live in each board's Tweaks panel (lockPreview, auraPreview,
  samplePoints, ethanPreview, haloPreview, goldPreview, championPreview, teamDeckPreview).
