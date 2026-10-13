#!/usr/bin/env python3
"""Build welcome/app-demo.html and welcome/app-ambient.css from the real app.

The beta landing page shows the actual EBBLESS player, not a copy: this lifts
the app's own stylesheet, player markup (tabs, art / record / cassette,
cymatics canvas, lyrics, seek bar, controls) and the exact JS that animates
them out of index.html, wraps them with a small shim (scripts/landing-demo-*.js)
that stands in for the playback engine, and writes a self-contained page the
landing embeds in an iframe. Nothing is played and nothing is stored.

Re-run after changing the player in index.html:  python3 scripts/build-landing-demo.py
It fails loudly if a marker it relies on has moved.
"""
import re, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = (ROOT / 'index.html').read_text()
HERE = pathlib.Path(__file__).resolve().parent


def die(msg):
    sys.exit('build-landing-demo: ' + msg)


def between(start, end, src=SRC, include_end=False):
    a = src.find(start)
    if a < 0:
        die('start marker not found: %r' % start[:60])
    b = src.find(end, a + len(start))
    if b < 0:
        die('end marker not found: %r' % end[:60])
    return src[a:b + (len(end) if include_end else 0)]


def comment_start(marker, after=0):
    """Start of the /* ==== banner comment that contains marker."""
    i = SRC.find(marker, after)
    if i < 0:
        die('marker not found: %r' % marker)
    return SRC.rfind('/* ====', 0, i)


def function(name):
    m = re.search(r'^(?:async )?function %s\(' % re.escape(name), SRC, re.M)
    if not m:
        die('function not found: ' + name)
    i = SRC.index('{', SRC.index(')', m.start()))
    depth, j = 0, i
    while True:
        c = SRC[j]
        if c == '{':
            depth += 1
        elif c == '}':
            depth -= 1
            if depth == 0:
                break
        j += 1
    return SRC[m.start():j + 1]


def verbatim(label, code):
    return '\n/* ---- from index.html: %s ---- */\n%s\n' % (label, code)


# ---- CSS: the app's whole main stylesheet, verbatim (the iframe isolates it)
css = between('<style>\n:root{', '</style>')[len('<style>\n'):]

# ---- markup: the real player view
view = between('<main class="view" id="view-player" hidden>', '</main>', include_end=True)
view = view.replace('<main class="view" id="view-player" hidden>', '<main class="view" id="view-player">', 1)
topbar = between('<header id="topbar">', '</header>', include_end=True)
bottom_nav = between('<nav id="bottom-nav">', '</nav>', include_end=True)
ambient_markup = '<div id="ambient"><div class="layer" id="ambient-a"></div><div class="layer" id="ambient-b"></div></div>'

# ---- JS: the app's own animation code
viz = SRC[comment_start('VISUALIZER — cymatics'):comment_start('VISUAL MODE — album art')]
visual_mode = SRC[comment_start('VISUAL MODE — album art'):SRC.index('\napplyArtStyle();', SRC.index('function applyArtStyle')) + len('\napplyArtStyle();')]
_r = comment_start('RECORD — physical object')
record = SRC[_r:SRC.index('/* RECORD TAP GAME (issue', _r)]
cassette = SRC[comment_start('CASSETTE — physical object'):SRC.index('cassetteApplyRotation(0);\n\nvisualTabs.forEach')]
cassette += 'cassetteApplyRotation(0);\n'
if 'const CS_ANG_K = 8000;' not in cassette:
    die('CS_ANG_K moved; update the demo patch')
cassette = cassette.replace('const CS_ANG_K = 8000;', 'const CS_ANG_K = 40000;')
tabs = between('visualTabs.forEach(btn => btn.addEventListener', 'vizControlsPlace();\napplyVisualMode();', include_end=True)
lyrics = '\n'.join(function(n) for n in ('renderLyrics', 'updateLyricsHighlight', 'lyricsAutoScrollActive', 'lyricsAutoScrollTick', 'lyricsAutoScrollStart', 'lyricsAutoScrollStop', 'lyricsSetPlaying'))
# the app scrolls a line into view with the page; here only the lyrics pane may scroll
if "el.scrollIntoView({ block: 'center', behavior: 'smooth' });" not in lyrics:
    die('lyrics scrollIntoView changed; update the demo patch')
lyrics = lyrics.replace("el.scrollIntoView({ block: 'center', behavior: 'smooth' });",
                        "lyricsScroller.scrollTo({ top: el.offsetTop - lyricsScroller.clientHeight / 2 + el.offsetHeight / 2, behavior: 'smooth' });")

shim = (HERE / 'landing-demo-shim.js').read_text()
driver = (HERE / 'landing-demo-driver.js').read_text()

js = shim
_blocks = viz + visual_mode + record + cassette + tabs + lyrics
_declared = set(re.findall(r'\b(?:const|let|var)\s+(LS_[A-Z_]+)', _blocks)) | set(re.findall(r'\b(?:const|let|var)\s+(LS_[A-Z_]+)', shim))
_used = set(re.findall(r'\b(LS_[A-Z_0-9]+)\b', _blocks))
js += '\n// storage keys the app code names (values unused: storage is in-memory here)\n' + ''.join("const %s = '%s';\n" % (n, n) for n in sorted(_used - _declared))
for label, code in (('visualizer (cymatics)', viz), ('visual mode + art style', visual_mode), ('record', record),
                    ('cassette', cassette), ('player tabs', tabs), ('lyrics', lyrics)):
    js += verbatim(label, code)
js += driver

override = """
/* landing demo overrides: the app's own HUD, minus what needs a library or account */
html,body{height:100%;overflow:hidden;background:transparent}
#app{position:fixed;inset:0}
#ambient{background:transparent}
.view-scroll{padding:6px 12px 8px;max-width:none}
#topbar{padding:0 10px;padding-top:0}
#topbar .tester-banner,#topbar #helpBtn,#topbar #topnav,#topbar .install-banner,#installBanner,.paste-guide,#pasteGuide{display:none!important}
#fsBtn,#desktopFsExitBtn,#castBtn,#chapBtn,#chapPanel,#reportMatchBtn,#playerDeclineBtn,#emptyFindBtn,#castBar,#npLivePill,#adsReportBtn,#skipBackBtn,#skipFwdBtn{display:none!important}
.track-meta .title-row::before{display:none}
.title-row{gap:10px}
.lyrics-scroller{scrollbar-width:none;-ms-overflow-style:none}
.lyrics-scroller::-webkit-scrollbar{display:none}
#bottom-nav button{pointer-events:none}
.demo-test .controls-row #prevBtn,.demo-test .controls-row #nextBtn,.demo-test #shuffleBtn,.demo-test #repeatBtn{display:none}
.demo-lock #urlInput{opacity:.5;pointer-events:none}
.demo-loop .seek-row .t{display:none}
/* compact: the stage only, for the phone dock */
.compact #topbar,.compact #bottom-nav,.compact .visual-tabs{display:none!important}
.compact .view{top:0;bottom:0}
.compact .view-scroll{padding:6px 10px 6px}
.compact .player-stage{padding-top:0}
.compact .artwork-wrap{width:min(88vw,calc(100vh - 104px))!important}
.compact .transport-full{margin-top:0}
.compact .track-meta{margin-top:6px}
"""

html = """<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>EBBLESS player demo</title>
<!-- GENERATED by scripts/build-landing-demo.py from index.html. Do not edit by hand. -->
<style>
%s
%s
</style></head>
<body>
%s
<div id="app">
%s
</div>
<script>
%s
</script>
</body></html>
""" % (css, override, '', ambient_markup + '\n' + topbar + '\n' + view + '\n' + bottom_nav, js)

# the base href makes the app's relative asset paths (brand/assets/...) resolve from beta/
html = html.replace('<head><meta charset="UTF-8">', '<head><meta charset="UTF-8">\n<base href="../">', 1)
(ROOT / 'welcome' / 'app-demo.html').write_text(html)

# ---- the same ambient background CSS, for the landing page itself
amb = between('/* ambient background: blurred artwork', '/* ---------- topbar (desktop)')
(ROOT / 'welcome' / 'app-ambient.css').write_text(
    '/* GENERATED by scripts/build-landing-demo.py from index.html (#ambient). */\n'
    ':root{--dur-surface:500ms;--ease-in-out:cubic-bezier(.65,0,.35,1)}\n' + amb)
print('wrote welcome/app-demo.html (%d KB), welcome/app-ambient.css' % (len(html) // 1024))
