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
library = between('<main class="view" id="view-library">', '</main>', include_end=True)
library = re.sub(r'<video class="lib-bg-video".*?</video>', '', library, flags=re.S)
library = library.replace('id="libraryListWrap" class="hidden"', 'id="libraryListWrap"')
queue = between('<div id="queue-panel">', '<!-- ===== PLAYING HISTORY PANEL')
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

_gs = SRC.index('/* RECORD TAP GAME (issue')
_ge = SRC.index("recGameEl.addEventListener('click', recordGameTap);") + len("recGameEl.addEventListener('click', recordGameTap);")
game = SRC[_gs:_ge]
_old = 'function recordGameInFlow(){ return !!state.flowOpen && flowArtWrap.contains(recGameEl); }'
if _old not in game:
    die('recordGameInFlow changed; update the demo patch')
game = game.replace(_old, 'function recordGameInFlow(){ return true; }')

_ls = SRC.index('/* ---------- LP needle sfx')
_le = SRC.index('// Fetch the files up front in LP mode')
lpsfx = SRC[_ls:_le]
if 'function playLpNeedle' not in lpsfx or 'function lpSfxContext' not in lpsfx:
    die('LP sfx block moved; update the demo patch')

shim = (HERE / 'landing-demo-shim.js').read_text()
driver = (HERE / 'landing-demo-driver.js').read_text()

js = shim
_blocks = viz + visual_mode + record + game + cassette + tabs + lyrics + lpsfx
_declared = set(re.findall(r'\b(?:const|let|var)\s+(LS_[A-Z_]+)', _blocks)) | set(re.findall(r'\b(?:const|let|var)\s+(LS_[A-Z_]+)', shim))
_used = set(re.findall(r'\b(LS_[A-Z_0-9]+)\b', _blocks))
js += '\n// storage keys the app code names (values unused: storage is in-memory here)\n' + ''.join("const %s = '%s';\n" % (n, n) for n in sorted(_used - _declared))
for label, code in (('visualizer (cymatics)', viz), ('visual mode + art style', visual_mode), ('record', record), ('record tap game', game), ('LP needle and tape sounds', lpsfx),
                    ('cassette', cassette), ('player tabs', tabs), ('lyrics', lyrics)):
    js += verbatim(label, code)
js += driver

override = """
/* landing demo overrides: the app's own HUD, minus what needs a library or account */
html,body{height:100%;overflow:hidden;background:#121212}
#app{position:fixed;inset:0}
#ambient{background:#121212}
.view-scroll{padding:6px 12px 8px;max-width:none}
#topbar{padding:0 10px;padding-top:0}
#topbar .tester-banner,#topbar #helpBtn,#topbar #topnav,#topbar .install-banner,#installBanner,.paste-guide,#pasteGuide{display:none!important}
#fsBtn,#desktopFsExitBtn,#castBtn,#chapBtn,#chapPanel,#reportMatchBtn,#playerDeclineBtn,#emptyFindBtn,#castBar,#npLivePill,#adsReportBtn,#skipBackBtn,#skipFwdBtn{display:none!important}
.title-row{gap:10px}
.lyrics-scroller{scrollbar-width:none;-ms-overflow-style:none}
.lyrics-scroller::-webkit-scrollbar{display:none}
#bottom-nav button{pointer-events:none}
/* the real song's player: invisible but on screen (audio only; browsers will not start an offscreen video) until video mode puts it over the art */
#ytWrap0,#ytWrap1{position:fixed;right:0;bottom:0;width:200px;height:200px;opacity:0;pointer-events:none;z-index:-1}
#ytWrap0.on,#ytWrap1.on{right:auto;bottom:auto;opacity:1;z-index:6;border-radius:12px;overflow:hidden}
.ytw iframe{width:100%;height:100%;border:0}
#adNote{position:fixed;left:50%;bottom:calc(var(--nav-h,64px) + 14px);transform:translateX(-50%);z-index:40;max-width:calc(100% - 32px);padding:8px 14px;border-radius:999px;background:rgba(24,24,24,.92);border:1px solid rgba(255,255,255,.14);color:#cfcfcf;font-size:12px;text-align:center;pointer-events:none}
body.split-desktop #adNote{bottom:84px}
#adNote[hidden]{display:none}
/* the artist name is a link, like in the app */
#trackArtist.demo-link{cursor:pointer}
#trackArtist.demo-link:hover span{text-decoration:underline;text-underline-offset:3px}
#bio{position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(10,10,10,.72);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}
.bio-card{position:relative;width:min(380px,100%);max-height:100%;overflow:auto;padding:22px 20px 18px;border-radius:16px;background:#181818;border:1px solid rgba(255,255,255,.12);box-shadow:0 20px 60px rgba(0,0,0,.6);color:#f2f2f2;font-size:14px;line-height:1.5}
.bio-card h2{margin:0 0 10px;font-size:26px;letter-spacing:-.01em}
.bio-card p{margin:0 0 10px;color:#b4b4b4}
.bio-card .bio-eyebrow{margin:0 0 4px;font-size:11px;letter-spacing:1.6px;text-transform:uppercase;color:var(--accent)}
.bio-card .bio-made{color:#f2f2f2;font-weight:600;margin-bottom:0}
.bio-x{position:absolute;top:8px;right:10px;width:32px;height:32px;border-radius:50%;font-size:22px;line-height:1;color:#b4b4b4;background:none;border:0;cursor:pointer}
/* art styles: one row with the art in the middle. The side buttons show on narrow widths, the app's tab bar on wide ones. */
#artRow{display:flex;align-items:stretch;justify-content:center;gap:10px;width:100%}
.art-side{display:none}
.side-btn{flex:1 1 0;min-height:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;border-radius:12px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);color:#b4b4b4;font:inherit;font-size:10px;letter-spacing:.3px;cursor:pointer;padding:4px 2px}
.side-btn svg{width:20px;height:20px}
.side-btn.is-active{background:var(--accent);border-color:var(--accent);color:#121212}
.side-btn:disabled{opacity:.35;cursor:default}
@media (max-width:859.98px){
  .visual-tabs{display:none!important}
  .art-side{display:flex;flex-direction:column;gap:8px;width:56px;flex:none}
  #artRow .artwork-wrap{flex:1 1 auto;min-width:0;width:auto!important;max-width:calc(100vh - 230px)}
}
/* the library and queue panes: the app's own desktop layout, only on frames wide enough for it */
body:not(.split-desktop) #view-library,body:not(.split-desktop) #queue-panel{display:none!important}
body.split-desktop .art-side{display:none}
body.split-desktop #bottom-nav{display:none}
body.split-desktop:not(.desktop-fs) .artwork-wrap{width:min(820px,calc(100vw - 690px),max(72px,calc(100dvh - var(--topbar-h) - 262px)))}
.lib-bg-poster{background:url(brand/assets/library-bg-poster.jpg) center/cover no-repeat}
#queue-panel .queue-head .discover-toggle,#queue-panel .queue-head .qh-icon{pointer-events:none}
.bio-photo{display:block;width:100%;max-height:230px;object-fit:cover;object-position:center 20%;border-radius:12px;margin-bottom:14px}
/* phone dock: the search bar shows while the page is teaching search */
.compact.show-search #topbar{display:flex!important;position:absolute;top:0;left:0;right:0;z-index:30;background:transparent;border:0;box-shadow:none}
.compact.show-search #topbar .wordmark{display:none}
.side-btn svg.cym-icon{width:20px;height:20px}
/* a phone frame has a notch: give the top bar room beneath it */
@media (max-width:430px){body:not(.compact){--topbar-h:100px}body:not(.compact) #topbar{padding-top:40px}}
/* compact: the stage only, for the phone dock */
.compact #topbar,.compact #bottom-nav{display:none!important}
.compact .view{top:0;bottom:0}
.compact .view-scroll{padding:6px 10px 6px}
.compact .player-stage{padding-top:0}
.compact #artRow .artwork-wrap{max-width:calc(100vh - 120px)}
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
""" % (css, override, '', ambient_markup + '\n' + topbar + '\n' + library + '\n' + view + '\n' + queue + '\n' + bottom_nav, js)

# the base href makes the app's relative asset paths (brand/assets/...) resolve from beta/
html = html.replace('<head><meta charset="UTF-8">', '<head><meta charset="UTF-8">\n<base href="../">', 1)
(ROOT / 'welcome' / 'app-demo.html').write_text(html)

# ---- the same ambient background CSS, for the landing page itself
amb = between('/* ambient background: blurred artwork', '/* ---------- topbar (desktop)')
(ROOT / 'welcome' / 'app-ambient.css').write_text(
    '/* GENERATED by scripts/build-landing-demo.py from index.html (#ambient). */\n'
    ':root{--dur-surface:500ms;--ease-in-out:cubic-bezier(.65,0,.35,1)}\n' + amb)
print('wrote welcome/app-demo.html (%d KB), welcome/app-ambient.css' % (len(html) // 1024))
