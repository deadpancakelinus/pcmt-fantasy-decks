"""Build trumps-cards.js (the Top Trumps card list) from the PCMT stats export.

    python3 -I trumps/build_cards.py            (run from the repo root)

Inputs
  trumps/data/pcmt-stats.tsv  Every player row from pcmt.gg/stats for S3 NA and S2 EMEA
                              (Show Subs on, Showmatches off, seasons not combined).
                              Columns are the site's, in order: see COLS below.
  trumps/data/ratings.json    Hand-set Mechanics / Brains, keyed "na:claps" or "emea:shipty".
                              Anything listed here replaces the placeholder number.

Card stats (higher always wins)
  toxic     pcmt.gg "toxic" rating
  acs       pcmt.gg ACS
  kast      pcmt.gg KAST (%)
  mechanics placeholder until set in ratings.json: percentile mix of HS%, KPR, FKPR, ADR within the region
  brains    placeholder until set in ratings.json: percentile mix of APR, KAST, low DPR, low FDPR within the region
"""
import json
import os
import re

COLS = ['name', 'team', 'season', 'toxic', 'angus', 'acs', 'mp', 'rp', 'k', 'd', 'a', 'kd', 'kda',
        'kpr', 'dpr', 'apr', 'kast', 'adr', 'fk', 'fd', 'fkpr', 'fdpr', 'pm', 'hs', 'kmax', 'href', 'logo']
SEASONS = {'S3 NA': 'na', 'S2 EMEA': 'emea'}
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def num(v):
    return float(v.rstrip('%'))


def pct_ranks(values, invert=False):
    """Percentile (0..1) of each value within the list; ties share the average rank."""
    order = sorted(values, reverse=invert)
    n = len(values)
    out = []
    for v in values:
        lo = order.index(v)
        hi = n - 1 - order[::-1].index(v)
        out.append(((lo + hi) / 2) / (n - 1) if n > 1 else 0.5)
    return out


def scale(p):
    return int(round(20 + p * 79))  # 20..99


def main():
    rows = []
    with open(os.path.join(HERE, 'data', 'pcmt-stats.tsv'), encoding='utf-8') as f:
        for line in f.read().split('\n'):
            if not line.strip():
                continue
            cells = line.split('\t')
            if len(cells) != len(COLS):
                raise SystemExit('Bad row (%d columns): %s' % (len(cells), line[:60]))
            rows.append(dict(zip(COLS, cells)))

    path = os.path.join(HERE, 'data', 'ratings.json')
    overrides = json.load(open(path, encoding='utf-8')) if os.path.exists(path) else {}
    overrides = {k: v for k, v in overrides.items() if not k.startswith('_')}

    out = {'na': [], 'emea': []}
    for season, region in SEASONS.items():
        pool = [r for r in rows if r['season'] == season]
        if not pool:
            raise SystemExit('No rows for ' + season)
        cols = {c: [num(r[c]) for r in pool] for c in ('hs', 'kpr', 'fkpr', 'adr', 'apr', 'kast', 'dpr', 'fdpr')}
        mech = [pct_ranks(cols[c]) for c in ('hs', 'kpr', 'fkpr', 'adr')]
        brain = [pct_ranks(cols['apr']), pct_ranks(cols['kast']),
                 pct_ranks(cols['dpr'], invert=True), pct_ranks(cols['fdpr'], invert=True)]
        seen = set()
        for i, r in enumerate(pool):
            slug = re.sub(r'[^a-z0-9]+', '', r['href'].rsplit('/', 1)[-1].lower()) or re.sub(r'[^a-z0-9]+', '', r['name'].lower())
            if slug in seen:
                raise SystemExit('Duplicate player in %s: %s' % (season, slug))
            seen.add(slug)
            key = region + ':' + slug
            ov = overrides.get(key, {})
            out[region].append({
                'id': region + '-' + slug,
                'name': r['name'],
                'team': '' if r['team'] == '(sub)' else r['team'],
                'sub': r['team'] == '(sub)',
                'maps': int(r['mp']),
                'toxic': num(r['toxic']),
                'acs': int(num(r['acs'])),
                'kast': int(num(r['kast'])),
                'mechanics': int(ov.get('mechanics', scale(sum(m[i] for m in mech) / 4))),
                'brains': int(ov.get('brains', scale(sum(b[i] for b in brain) / 4))),
                'set': sorted(k for k in ('mechanics', 'brains') if k in ov),
            })
    unknown = sorted(set(overrides) - {c['id'].replace('-', ':', 1) for r in out.values() for c in r})
    if unknown:
        print('Warning: ratings.json names players that are not in the stats:', ', '.join(unknown))

    js = ('// Top Trumps cards. Built by trumps/build_cards.py from pcmt.gg stats (S3 NA, S2 EMEA). Do not edit by hand.\n'
          'var PCMT_TRUMPS_CARDS = ' + json.dumps(out, separators=(',', ':')) + ';\n')
    with open(os.path.join(ROOT, 'trumps-cards.js'), 'w', encoding='utf-8') as f:
        f.write(js)
    print('trumps-cards.js: %d NA, %d EMEA cards' % (len(out['na']), len(out['emea'])))


if __name__ == '__main__':
    main()
