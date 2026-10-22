"""Writes setup/cards-setup.sql: the card catalog, card packs and buying.

    python3 -I tools/cards.py <built players.js>

Every player in the store is a Common card ("c:<player id>"). Variants are listed below ("v:<variant id>").
Past seasons (S1 NA, S2 NA, S1 EMEA) come from trumps-cards.js: every player of that season is a Common card
("o:<MVP VS card id>", e.g. "o:nas1-igneous"), that season's champions also get a Rare champion card
("v:champ-<MVP VS card id>"), and each season has its own throwback pack. They are never on The Deck.
Re-run this (and the SQL) when players or variants change; cards that disappear are switched off, never deleted,
so nobody loses a card they own.
"""
import json, os, sys

VARIANTS = [
    # id, player id, rarity (common / rare / epic / legendary), title
    ('teklo-variant', 'teklo', 'rare', 'The Role of Yoru'),
    ('straight-variant', 'straight', 'rare', 'Straight Ace'),
    ('claps-variant', 'claps', 'rare', 'claps Clove'),
    # Champion Rares only exist for the season a player won: past seasons get theirs from trumps-cards.js
    # (see PAST below). Nobody has won NA S3 or EMEA S2 yet; when one ends, add that season's winners here
    # as ('champ-<player id>', '<player id>', 'rare', '<name> Champion') and their art in the Store and Library boards.
]
ODDS = {'common': 70, 'rare': 22, 'epic': 7, 'legendary': 1}
PACKS = [
    # id, name, region it draws from, cards per pack, odds per card (percent), season (None = this season)
    ('na-pack', 'NA Card Pack', 'NA', 5, ODDS, None),
    ('emea-pack', 'EMEA Card Pack', 'EMEA', 5, ODDS, None),
    ('nas1-pack', 'NA S1 Throwback Pack', 'NA', 5, ODDS, 'S1 NA'),
    ('nas2-pack', 'NA S2 Throwback Pack', 'NA', 5, ODDS, 'S2 NA'),
    ('emeas1-pack', 'EMEA S1 Throwback Pack', 'EMEA', 5, ODDS, 'S1 EMEA'),
]
# MVP VS deck key of each past season in trumps-cards.js
PAST = {'S1 NA': 'nas1', 'S2 NA': 'nas2', 'S1 EMEA': 'emeas1'}
PAST_VARIANTS = [
    # id, MVP VS card id (past season), rarity, title; only in that season's throwback pack
]

here = os.path.dirname(os.path.abspath(__file__))
js = open(sys.argv[1], encoding='utf-8').read()
start = js.index('var PCMT_SITE_PLAYERS = ') + len('var PCMT_SITE_PLAYERS = ')
players = json.loads(js[start:js.index('];', start) + 1])
ids = {p['id'] for p in players}
# Region of each team, from The Deck board's team list (teams without a region are NA).
import re
board = open(os.path.join(here, 'canvas', 'Main.dc.html'), encoding='utf-8').read()
tl = board[board.index('var PCMT_TEAM_LIST = ['):]
tl = tl[:tl.index('];')]
team_region = {}
for m in re.finditer(r"\{ code: '([^']+)'([^}]*)\}", tl):
    r = re.search(r"region: '([A-Z]+)'", m.group(2))
    team_region[m.group(1)] = r.group(1) if r else 'NA'
region = {p['id']: team_region.get(p['team'], 'NA') for p in players}
assert set(region.values()) <= {'NA', 'EMEA'}
for v in VARIANTS:
    assert v[1] in ids, 'unknown player in variant: %s' % v[1]

lit = lambda s: 'null' if s is None else "'" + str(s).replace("'", "''") + "'"
card_ids = ['c:' + p['id'] for p in players] + ['v:' + v[0] for v in VARIANTS]
rows = ['(%s, %s, null, %s, %s, %s, null)' % (lit('c:' + p['id']), lit(p['id']), lit('common'), lit(p['name']), lit(region[p['id']])) for p in players]
rows += ['(%s, %s, %s, %s, %s, %s, null)' % (lit('v:' + v[0]), lit(v[1]), lit(v[0]), lit(v[2]), lit(v[3]), lit(region[v[1]])) for v in VARIANTS]

# Past seasons, from the MVP VS cards
tj = open(os.path.join(here, '..', 'trumps-cards.js'), encoding='utf-8').read()
trumps = json.loads(tj[tj.index('{'):tj.rindex('}') + 1])
past_count = {}
for season, key in PAST.items():
    reg = 'EMEA' if key.startswith('emea') else 'NA'
    deck = trumps[key]
    assert deck, 'no MVP VS cards for ' + season
    for c in deck:
        card_ids.append('o:' + c['id'])
        rows.append('(%s, %s, null, %s, %s, %s, %s)' % (lit('o:' + c['id']), lit(c['id']), lit('common'), lit(c['name']), lit(reg), lit(season)))
        if c['champ']:
            card_ids.append('v:champ-' + c['id'])
            rows.append('(%s, %s, %s, %s, %s, %s, %s)' % (lit('v:champ-' + c['id']), lit(c['id']), lit('champ-' + c['id']), lit('rare'),
                                                         lit('%s %s Champion' % (c['name'], season)), lit(reg), lit(season)))
    for v in PAST_VARIANTS:
        if v[1].split('-', 1)[0] != key:
            continue
        assert any(c['id'] == v[1] for c in deck), 'unknown past-season card in variant: %s' % v[1]
        card_ids.append('v:' + v[0])
        rows.append('(%s, %s, %s, %s, %s, %s, %s)' % (lit('v:' + v[0]), lit(v[1]), lit(v[0]), lit(v[2]), lit(v[3]), lit(reg), lit(season)))
    past_count[season] = (len(deck), sum(1 for c in deck if c['champ']))
packs = ['(%s, %s, %s, %d, %s::jsonb, 0, %s)' % (lit(p[0]), lit(p[1]), lit(p[2]), p[3], lit(json.dumps(p[4])), lit(p[5])) for p in PACKS]

base = open(os.path.join(here, 'cards-base.sql'), encoding='utf-8').read()
catalog = """
-- ===================== Catalog (generated by tools/cards.py) =====================
insert into public.cards (id, player, variant, rarity, title, region, season) values
%s
on conflict (id) do update set player = excluded.player, variant = excluded.variant, rarity = excluded.rarity, title = excluded.title, region = excluded.region, season = excluded.season, active = true;
update public.cards set active = false where id not in (%s);

-- Packs: a new pack starts at 0 VP (change it on admin.html). Odds and size come from tools/cards.py.
insert into public.card_packs (id, name, region, cards, odds, price, season) values
%s
on conflict (id) do update set name = excluded.name, region = excluded.region, cards = excluded.cards, odds = excluded.odds, season = excluded.season;
-- Packs no longer listed in tools/cards.py stop being sold (they stay in the table for history).
update public.card_packs set active = false where id not in (%s);
""" % (',\n'.join(rows), ', '.join(lit(i) for i in card_ids), ',\n'.join(packs), ', '.join(lit(p[0]) for p in PACKS))
out = os.path.join(here, '..', 'setup', 'cards-setup.sql')
open(out, 'w', encoding='utf-8').write(base + catalog)
print('cards-setup.sql: %d commons (%d NA, %d EMEA), %d variants, %d pack(s); past seasons: %s' % (len(players), list(region.values()).count('NA'), list(region.values()).count('EMEA'), len(VARIANTS), len(PACKS),
      ', '.join('%s %d cards + %d champions' % (k, v[0], v[1]) for k, v in past_count.items())))
