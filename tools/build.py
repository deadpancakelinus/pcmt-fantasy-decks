"""Compile the PCMT Fantasy Decks canvas boards into a plain static website.

python3 build.py <boards dir> <assets dir> <out dir>
"""
import sys, os, re, json, html, shutil
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import wire

SRC, ASSETS, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
PAGES = {  # board -> output file
    'Home.dc.html': 'home.html',
    'Main.dc.html': 'index.html',
    'Customization.dc.html': 'customization.html',
    'Leaderboard.dc.html': 'leaderboard.html',
    'Rules.dc.html': 'guide.html',
    'Login.dc.html': 'login.html',
    'Transactions.dc.html': 'transactions.html',
    'Store.dc.html': 'store.html',
    'Library.dc.html': 'library.html',
}
VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr'}
RAW = {'script', 'style'}

TAG_RE = re.compile(r'<(/?)([A-Za-z][A-Za-z0-9:-]*)((?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|\'[^\']*\'|[^\s>]+))?)*)\s*(/?)>', re.S)
ATTR_RE = re.compile(r'([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|\'([^\']*)\'|([^\s>]+)))?', re.S)


def parse(src):
    """Case-preserving HTML -> nested [tag, attrs, children] / text."""
    root = ['#root', {}, []]
    stack = [root]
    i = 0
    while i < len(src):
        if src.startswith('<!--', i):
            j = src.find('-->', i)
            i = len(src) if j < 0 else j + 3
            continue
        m = TAG_RE.match(src, i) if src[i] == '<' else None
        if not m:
            j = src.find('<', i + 1)
            j = len(src) if j < 0 else j
            text = html.unescape(src[i:j])
            if text:
                stack[-1][2].append(text)
            i = j
            continue
        closing, tag, attrs_s, selfclose = m.group(1), m.group(2), m.group(3), m.group(4)
        i = m.end()
        if closing:
            for k in range(len(stack) - 1, 0, -1):
                if stack[k][0] == tag:
                    del stack[k:]
                    break
            continue
        attrs = {}
        for am in ATTR_RE.finditer(attrs_s):
            name = am.group(1)
            val = am.group(2) if am.group(2) is not None else am.group(3) if am.group(3) is not None else am.group(4)
            attrs[name] = html.unescape(val) if val is not None else ''
        node = [tag, attrs, []]
        stack[-1][2].append(node)
        if tag.lower() in RAW:
            end = src.lower().find('</' + tag.lower(), i)
            end = len(src) if end < 0 else end
            node[2].append(src[i:end])
            i = src.find('>', end) + 1 if end < len(src) else end
            continue
        if selfclose or tag.lower() in VOID:
            continue
        stack.append(node)
    return root[2]


def jsx_text(s):
    """JSX whitespace rules: drop whitespace-only lines, trim line edges, join lines with one space."""
    lines = s.split('\n')
    out = []
    for i, line in enumerate(lines):
        if i > 0:
            line = line.lstrip(' \t\r')
        if i < len(lines) - 1:
            line = line.rstrip(' \t\r')
        if line:
            out.append(line)
    return ' '.join(out)


def strip_ws(nodes, pre=False):
    out = []
    for n in nodes:
        if isinstance(n, str):
            s = n if pre else jsx_text(n)
            if s:
                out.append(s)
        else:
            style = n[1].get('style', '')
            out.append([n[0], n[1], strip_ws(n[2], pre or 'pre' in style or n[0] in ('style', 'script'))])
    return out


os.makedirs(OUT, exist_ok=True)
os.makedirs(os.path.join(OUT, 'assets'), exist_ok=True)
blob_map = {}
for f in os.listdir(ASSETS):
    bid, ext = os.path.splitext(f)
    shutil.copy(os.path.join(ASSETS, f), os.path.join(OUT, 'assets', f))
    blob_map[bid] = 'assets/' + f


# Pages that are hand-written instead of compiled from a board; nav links to their board still point here.
# MVP VS (mvp-vs.html) is the game itself (mvp-vs.html + trumps.js + trumps-cards.js); its canvas board
# MvpVs.dc.html is only the old "Coming soon" design, so it is not built.
LINKS = {'MvpVs.dc.html': 'mvp-vs.html'}


def fix_refs(s):
    s = re.sub(r'/_blob/([0-9a-f]{32})', lambda m: blob_map[m.group(1)], s)
    for b, o in list(PAGES.items()) + list(LINKS.items()):
        s = s.replace(b, o)
    return s


def logic_fix(js):
    js = fix_refs(js)
    # canvas board links -> site pages in the navigation-loader check
    js = js.replace(r"/\.dc\.html(#|$|\?)/", r"/\.html(#|$|\?)/")
    return js


for board, outname in PAGES.items():
    src = open(os.path.join(SRC, board), encoding='utf-8').read()
    title = re.search(r'<title>(.*?)</title>', src, re.S).group(1)
    xs, xe = src.index('<x-dc>') + 6, src.index('</x-dc>')
    body = src[xs:xe]
    hs, he = body.index('<helmet>'), body.index('</helmet>')
    helmet = body[hs + 8:he]
    tpl = body[he + 9:]
    ps = src.index("data-props='") + len("data-props='")
    pe = src.index("'>", ps)
    props_spec = json.loads(html.unescape(src[ps:pe]))
    logic = src[pe + 2:src.index('</script>', pe)]
    props = {k: v.get('default') for k, v in props_spec.items() if not k.startswith('$') and 'default' in v}
    tree = strip_ws(parse(fix_refs(wire.tpl(board, tpl))))
    tree_json = json.dumps(tree, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
    logic = logic_fix(logic)
    if board == 'Main.dc.html':
        open(os.path.join(OUT, 'players.js'), 'w', encoding='utf-8').write(wire.players_js(logic))
        data = []
        for name in ('PCMT_MATCHES', 'PCMT_RESULTS'):
            s = logic.index('var %s = [' % name)
            depth, j = 0, logic.index('[', s)
            while True:
                c = logic[j]
                depth += c == '['
                depth -= c == ']'
                j += 1
                if depth == 0:
                    break
            arr = logic[logic.index('[', s):j]
            logic = logic[:s] + 'var %s = window.%s || [];' % (name, name) + logic[j + 1 if logic[j] == ';' else j:]
            data.append('var %s = %s;' % (name, arr))
        open(os.path.join(OUT, 'data.js'), 'w', encoding='utf-8').write(
            '// PCMT Fantasy Decks season data. This is the only file that changes as the season goes on.\n'
            '// PCMT_MATCHES: scheduled series (drives Next Match and the gameweek lock).\n'
            '// PCMT_RESULTS: finished series with each player\'s stats; card points are worked out from these.\n'
            '// Entry formats are explained next to these names in index.html.\n\n' + '\n\n'.join(data) + '\n')
    logic = wire.logic(board, logic)
    assert '</script' not in logic.lower()
    data_tag = '<script src="data.js"></script>\n<script src="players.js"></script>\n<script src="league.js"></script>\n'
    if board in ('Library.dc.html', 'Store.dc.html'):  # Library and Store show each card's MVP VS stats
        data_tag += '<script src="trumps-cards.js"></script>\n'
    page = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="PCMT Fantasy Decks: build a deck of Plat Chat Members Tourney players and score points every match.">
<link rel="icon" href="assets/{os.path.basename(blob_map['3bf9d529cabff94109b561693539029f'])}">
{fix_refs(helmet).strip()}
</head>
<body>
<div id="dc-root"></div>
<script type="application/json" id="dc-tree">{tree_json}</script>
<script type="application/json" id="dc-props">{json.dumps(props)}</script>
<script type="text/plain" id="dc-logic">{logic}</script>
{data_tag}<script src="dc-lite.js"></script>
</body>
</html>
'''
    open(os.path.join(OUT, outname), 'w', encoding='utf-8').write(page)
    print(board, '->', outname, len(page))
for f in ('dc-lite.js', 'league.js'):
    shutil.copy(os.path.join(os.path.dirname(os.path.abspath(__file__)), f), os.path.join(OUT, f))
open(os.path.join(OUT, '_headers'), 'w').write('/*.js\n  Cache-Control: no-cache\n/*.html\n  Cache-Control: no-cache\n')
print('done')
