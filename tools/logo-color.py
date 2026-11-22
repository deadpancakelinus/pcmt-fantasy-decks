"""Prints a team colour picked from a logo, as #rrggbb, for the card backs (tools/pcmt-teams.js).

    python3 -I tools/logo-color.py <logo.png>

Takes the most common bright, saturated colour among the logo's solid pixels (ignoring near-black, near-white and grey
outlines), so a dark card back still shows it. Falls back to the average solid colour, then to the site's blue. Needs Pillow.
"""
import colorsys, sys
from PIL import Image

img = Image.open(sys.argv[1]).convert('RGBA')
img.thumbnail((96, 96))
counts, solid = {}, []
for r, g, b, a in img.getdata():
    if a < 160:
        continue
    solid.append((r, g, b))
    h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
    if s < 0.35 or l < 0.18 or l > 0.88:
        continue
    key = (r // 24, g // 24, b // 24)
    c = counts.setdefault(key, [0, 0, 0, 0])
    c[0] += 1; c[1] += r; c[2] += g; c[3] += b
if counts and max(c[0] for c in counts.values()) >= max(8, len(solid) // 50):
    n, r, g, b = max(counts.values(), key=lambda c: c[0])
    r, g, b = r // n, g // n, b // n
elif solid:
    r, g, b = (sum(p[i] for p in solid) // len(solid) for i in range(3))
else:
    print('#a5dcdd'); sys.exit(0)
# Lift a dark colour so it reads on the dark card back.
h, l, s = colorsys.rgb_to_hls(r / 255, g / 255, b / 255)
if l < 0.45:
    r, g, b = (round(x * 255) for x in colorsys.hls_to_rgb(h, 0.45, s))
print('#%02x%02x%02x' % (r, g, b))
