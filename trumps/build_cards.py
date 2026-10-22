"""Build trumps-cards.js (the Top Trumps card list) from the PCMT stats export.

    python3 -I trumps/build_cards.py            (run from the repo root)

Inputs
  trumps/data/pcmt-stats.tsv  Every player row from pcmt.gg/stats for S3 NA and S2 EMEA, plus the past
                              seasons S1 NA, S2 NA and S1 EMEA (Show Subs on, Showmatches off, seasons not combined).
                              Columns are the site's, in order: see COLS below.
  trumps/data/agent-roles.json  Maps per agent for players not in The Deck's list (role = most played).
                              Past-season cards always take their role from here.
  trumps/data/old-teams.json  Past seasons' teams: name, colour, logo (in assets/) and who won the season.

Card stats, in card order, all straight from pcmt.gg/stats
  acs       ACS                       higher wins
  kast      KAST (%)                  higher wins
  hs        headshot %                higher wins
  dpr       deaths per round          LOWER wins
  toxic     the "toxic" rating        higher wins
"""
import json
import os
import re

COLS = ['name', 'team', 'season', 'toxic', 'angus', 'acs', 'mp', 'rp', 'k', 'd', 'a', 'kd', 'kda',
        'kpr', 'dpr', 'apr', 'kast', 'adr', 'fk', 'fd', 'fkpr', 'fdpr', 'pm', 'hs', 'kmax', 'href', 'logo']
SEASONS = {'S3 NA': 'na', 'S2 EMEA': 'emea'}
# Winner of each current season (team code); None until the season's final is played.
CURRENT_CHAMPION = {'S3 NA': None, 'S2 EMEA': None}
# Past seasons: in MVP VS and their own throwback packs, never on The Deck.
OLD_SEASONS = {'S1 NA': 'nas1', 'S2 NA': 'nas2', 'S1 EMEA': 'emeas1'}
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)


def num(v):
    return float(v.rstrip('%'))




AGENT_ROLES = {
    'duelist': ['Jett', 'Reyna', 'Raze', 'Phoenix', 'Yoru', 'Neon', 'Iso', 'Waylay'],
    'initiator': ['Sova', 'Breach', 'Skye', 'KAY/O', 'Fade', 'Gekko', 'Tejo'],
    'controller': ['Brimstone', 'Viper', 'Omen', 'Astra', 'Harbor', 'Clove', 'Miks'],
    'sentinel': ['Killjoy', 'Cypher', 'Sage', 'Chamber', 'Deadlock', 'Vyse', 'Veto'],
}
AGENT_TO_ROLE = {a: r for r, agents in AGENT_ROLES.items() for a in agents}


def role_from_agents(maps):
    """Role with the most maps; a tie goes to the role of the single most-played agent."""
    unknown = [a for a in maps if a not in AGENT_TO_ROLE]
    if unknown:
        raise SystemExit('Unknown agent(s) in agent-roles.json: ' + ', '.join(unknown))
    totals = {}
    for agent, n in maps.items():
        totals[AGENT_TO_ROLE[agent]] = totals.get(AGENT_TO_ROLE[agent], 0) + n
    best = max(totals.values())
    tied = [r for r, n in totals.items() if n == best]
    if len(tied) == 1:
        return tied[0]
    top_agent = max((a for a in maps if AGENT_TO_ROLE[a] in tied), key=lambda a: maps[a])
    return AGENT_TO_ROLE[top_agent]


# PCMT.gg names that differ from the player's name in The Deck: (region, PCMT.gg name lower case) -> Deck name.
DECK_NAMES = {
}


def deck_info():
    """Team names/colors and player roles from The Deck board, so MVP VS cards look like deck cards."""
    src = open(os.path.join(ROOT, 'tools', 'canvas', 'Main.dc.html'), encoding='utf-8').read()
    teams = {}
    for m in re.finditer(r"""\{ ?code: '([A-Za-z0-9]+)', name: (['"])(.+?)\2, color: '(#[0-9a-fA-F]{6})'(, region: 'EMEA')?""", src):
        teams[m.group(1)] = {'name': m.group(3), 'color': m.group(4).lower(), 'region': 'emea' if m.group(5) else 'na'}
    roles = {}
    champs = set()
    pj = open(os.path.join(ROOT, 'players.js'), encoding='utf-8').read()
    cm = re.search(r'PCMT_SITE_CHAMPS = \{([^}]*)\}', pj)
    if cm:
        champs = set(re.findall(r"'?([a-z0-9-]+)'?\s*:\s*true", cm.group(1)))
    for m in re.finditer(r"\{ ?id: '([a-z0-9-]+)', name: '([^']+)', team: '([A-Za-z0-9]+)', role: '([a-z/]+)'", src):
        pid, name, team, role = m.group(1), m.group(2).lower(), m.group(3), m.group(4).split('/')[0]
        role = 'duelist' if role == 'yoru' else role
        region = teams.get(team, {}).get('region', 'na')
        roles.setdefault((region, name), []).append((team, role, pid in champs, pid))
    return teams, roles


def main():
    teams, roles = deck_info()
    rows = []
    with open(os.path.join(HERE, 'data', 'pcmt-stats.tsv'), encoding='utf-8') as f:
        for line in f.read().split('\n'):
            if not line.strip():
                continue
            cells = line.split('\t')
            if len(cells) != len(COLS):
                raise SystemExit('Bad row (%d columns): %s' % (len(cells), line[:60]))
            rows.append(dict(zip(COLS, cells)))

    ap = os.path.join(HERE, 'data', 'agent-roles.json')
    agent_roles = {k: role_from_agents(v) for k, v in json.load(open(ap, encoding='utf-8')).items() if not k.startswith('_')} if os.path.exists(ap) else {}

    old_teams = json.load(open(os.path.join(HERE, 'data', 'old-teams.json'), encoding='utf-8'))['seasons']
    out = {r: [] for r in list(SEASONS.values()) + list(OLD_SEASONS.values())}
    for season, region in list(SEASONS.items()) + list(OLD_SEASONS.items()):
        pool = [r for r in rows if r['season'] == season]
        if not pool:
            raise SystemExit('No rows for ' + season)
        seen = set()
        for i, r in enumerate(pool):
            slug = re.sub(r'[^a-z0-9]+', '', r['href'].rsplit('/', 1)[-1].lower()) or re.sub(r'[^a-z0-9]+', '', r['name'].lower())
            if slug in seen:
                raise SystemExit('Duplicate player in %s: %s' % (season, slug))
            seen.add(slug)
            key = region + ':' + slug
            team = '' if r['team'] == '(sub)' else r['team']
            if season in OLD_SEASONS:
                t = old_teams[season].get(team)
                if team and not t:
                    raise SystemExit('Team %s missing from old-teams.json for %s' % (team, season))
                out[region].append({
                    'id': region + '-' + slug, 'deck': '', 'name': r['name'], 'team': team,
                    'teamName': t['name'] if t else 'Sub', 'color': t['color'] if t else '#93a9aa',
                    'logo': t['logo'] if t else '', 'role': agent_roles.get(key, ''),
                    'champ': bool(t and t['champion']), 'sub': r['team'] == '(sub)', 'maps': int(r['mp']),
                    'toxic': num(r['toxic']), 'acs': int(num(r['acs'])), 'kast': int(num(r['kast'])),
                    'hs': int(num(r['hs'])), 'dpr': num(r['dpr']),
                })
                continue
            cands = roles.get((region, DECK_NAMES.get((region, r['name'].lower()), r['name'].lower())), [])
            pick = [c for c in cands if c[0] == team] or (cands if len(cands) == 1 else [])
            out[region].append({
                'id': region + '-' + slug,
                'deck': pick[0][3] if pick else '',   # the player's id in The Deck (players.js), if they're in it
                'name': r['name'],
                'team': team,
                'teamName': teams[team]['name'] if team in teams else ('Sub' if not team else team),
                'color': teams[team]['color'] if team in teams else '#93a9aa',
                'role': pick[0][1] if pick else agent_roles.get(key, ''),
                'champ': bool(team and CURRENT_CHAMPION.get(season) == team),   # only who won this season
                'sub': r['team'] == '(sub)',
                'maps': int(r['mp']),
                'toxic': num(r['toxic']),
                'acs': int(num(r['acs'])),
                'kast': int(num(r['kast'])),
                'hs': int(num(r['hs'])),
                'dpr': num(r['dpr']),
            })
    unknown = sorted(set(agent_roles) - {c['id'].replace('-', ':', 1) for r in out.values() for c in r})
    if unknown:
        print('Warning: agent-roles.json names players that are not in the stats:', ', '.join(unknown))

    js = ('// Top Trumps cards. Built by trumps/build_cards.py from pcmt.gg stats (S3 NA, S2 EMEA; past seasons nas1, nas2, emeas1). Do not edit by hand.\n'
          'var PCMT_TRUMPS_CARDS = ' + json.dumps(out, separators=(',', ':')) + ';\n')
    with open(os.path.join(ROOT, 'trumps-cards.js'), 'w', encoding='utf-8') as f:
        f.write(js)
    print('trumps-cards.js: ' + ', '.join('%d %s' % (len(v), k) for k, v in out.items()))
    missing = [c['name'] for r in out.values() for c in r if not c['role']]
    print('Roles from agents:', ', '.join('%s %s' % (k, v) for k, v in sorted(agent_roles.items())))
    if missing:
        print('Still no role:', ', '.join(missing))


if __name__ == '__main__':
    main()
