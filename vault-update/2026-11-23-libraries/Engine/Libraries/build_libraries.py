"""Badbounce LIBRARIES: preview picture + name for every item a concept engine can use (machines, heads, flags, weapons, bosses, shapes, boxes)
plus the SOUND library (build_sounds.py). The launcher shows <Libraries>/*/index.json on its "Libraries" page.
usage:  python build_libraries.py <Engine folder> <Libraries folder> [library ...]      (no library = all, sounds included)
        libraries: machines heads flags weapons bosses shapes boxes sounds
        --if-changed: only rebuild when an engine file changed since the last build (the launcher runs this by itself)
Every library is read from the engine itself (registries, draw functions, asset folders), so re-running this script after an engine
change keeps the libraries current. KEEP CURRENT: see README.md in this folder."""
import sys, os, json, math, re, shutil, subprocess, time
import numpy as np
from PIL import Image, ImageDraw, ImageFont

LIBS = ['machines', 'heads', 'flags', 'weapons', 'bosses', 'shapes', 'boxes']
META = {'machines': ('K1', 'Machines', 'K1 Crush & multiply: every press in the machine registry (k1_registry.py). New video = new machine, added here.'),
        'heads': ('K3', 'Heads', 'K3 Meme drop: merge-ladder heads (heads/*.png), lowest tier first.'),
        'flags': ('K5b', 'Flags', 'K5b Battle box: flag balls (fonts/flags/*.png).'),
        'weapons': ('K5b', 'Weapons', 'K5b Battle box: every weapon the engine can draw (wdraw.py). STANDARD MIX = used in the standard weapon mode.'),
        'bosses': ('K6b', 'Bosses', 'K6b Boss fight: the 100 bosses (boss_library.py), BOSS=<number>.'),
        'shapes': ('K9', 'Shapes', 'K9 Sheet drop: the 100 shapes (sd_shapes.py), K9_SHAPE=<number>.'),
        'boxes': ('K10', 'Boxes & effects', 'K10 Gamble crush: every box the arena can hold (gc_layout4.py), GC_LAYOUT=<names>.')}
BG = (4, 5, 10); INK = (10, 13, 24); FROST = (170, 195, 240); TXT = (243, 239, 230); YEL = (255, 198, 58)
TILE = 360


def font(E, sz):
    for p in (os.path.join(E, 'K9', 'fonts', 'Inter-Black.otf'), os.path.join(E, 'K1', 'fonts', 'Inter-Black.otf')):
        if os.path.exists(p): return ImageFont.truetype(p, sz)
    return ImageFont.load_default()


def tile(im, pad=0):
    """fit any picture on a square dark tile"""
    im = im.convert('RGBA'); im.thumbnail((TILE - 2*pad, TILE - 2*pad), Image.LANCZOS)
    t = Image.new('RGB', (TILE, TILE), BG); t.paste(im, ((TILE - im.width)//2, (TILE - im.height)//2), im); return t


def _retry(f, *a):
    import time
    for k in range(8):
        try: return f(*a)
        except FileNotFoundError: return
        except OSError:
            if k == 7: raise
            time.sleep(0.5*(k + 1))   # OneDrive / a viewer can hold a file for a moment


def swap(tmp, final):
    """put a freshly built folder in place FILE BY FILE (no folder renames: those fail on Windows/OneDrive);
    the old folder stays untouched if the build failed before this"""
    os.makedirs(final, exist_ok=True); new = set(os.listdir(tmp))
    for f in os.listdir(final):
        p = os.path.join(final, f)
        if f not in new and os.path.isfile(p): _retry(os.remove, p)
    for f in sorted(new, key=lambda x: x == 'index.json'):   # index.json last
        _retry(os.replace, os.path.join(tmp, f), os.path.join(final, f))
    shutil.rmtree(tmp, ignore_errors=True)


def clean_leftovers(root):
    """remove *.new / *.old folders an interrupted or older build left behind"""
    if not os.path.isdir(root): return
    for d in os.listdir(root):
        p = os.path.join(root, d)
        if os.path.isdir(p):
            if d.endswith(('.new', '.old')): shutil.rmtree(p, ignore_errors=True)
            elif d == 'Sounds': clean_leftovers(p)


STAMP_EXT = ('.py', '.png', '.jpg', '.wav', '.mp3', '.otf', '.ttf'); STAMP_SKIP = {'__pycache__', 'Upload', 'out', 'renders', 'tmp'}


def engine_stamp(E):
    """size + mtime of every engine file a library can depend on"""
    h = []
    for r, ds, fs in os.walk(E):
        ds[:] = sorted(d for d in ds if d not in STAMP_SKIP and not d.startswith('.'))
        for f in sorted(fs):
            if f.lower().endswith(STAMP_EXT):
                st = os.stat(os.path.join(r, f)); h.append(f"{os.path.relpath(os.path.join(r, f), E)}|{st.st_size}|{int(st.st_mtime)}")
    import hashlib; return hashlib.sha1('\n'.join(h).encode()).hexdigest()


class Out:
    def __init__(self, LIB, key):
        self.final = os.path.join(LIB, META[key][1]); self.dir = self.final + '.new'; self.key = key; self.items = []
        if os.path.isdir(self.dir): shutil.rmtree(self.dir)
        os.makedirs(self.dir)

    def add(self, im, name, desc='', tag=None):
        safe = ''.join(c for c in name if c not in '<>:"/\\|?*').strip()
        fn = f"{len(self.items) + 1:03d} {safe}.png"; im.save(os.path.join(self.dir, fn))
        self.items.append(dict(file=fn, name=name, desc=desc, tag=tag))

    def done(self):
        cid, title, desc = META[self.key]
        json.dump(dict(kind='images', key=self.key, concept=cid, title=title, desc=desc, items=self.items),
                  open(os.path.join(self.dir, 'index.json'), 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
        swap(self.dir, self.final); print(self.key, len(self.items), 'items')


def run(key, E, LIB):
    cid = META[key][0]; os.chdir(os.path.join(E, cid)); sys.path.insert(0, os.getcwd()); O = Out(LIB, key)

    if key == 'machines':
        import k1_thumb as TH
        from k1_registry import MACHINES
        tmp = os.path.join(O.dir, '_tmp.png')
        for k, f in MACHINES.items():
            m = f(); TH.make_thumbnail(m, tmp, 0.5, spot=TH.OVERRIDES.get(k))
            O.add(tile(Image.open(tmp).crop((45, 205, 495, 655))), f"{k} {m.get('name', '')}", m.get('note', '') or '')
        os.remove(tmp)

    elif key == 'heads':
        import k3_heads as H
        order = [n.lower() for n in getattr(H, 'ORDER', [])] if hasattr(H, 'ORDER') else []
        files = sorted(os.listdir('heads'), key=lambda f: (order.index(f[:-4]) if f[:-4] in order else 99, f))
        for f in files:
            if f.lower().endswith('.png'): O.add(tile(Image.open(os.path.join('heads', f)), 30), f[:-4].title())

    elif key == 'flags':
        names = dict(BR='Brazil', CN='China', DE='Germany', ES='Spain', FR='France', GB='United Kingdom', IL='Israel', IT='Italy', JP='Japan', US='USA')
        for f in sorted(os.listdir(os.path.join('fonts', 'flags'))):
            if f.endswith('.png'): O.add(tile(Image.open(os.path.join('fonts', 'flags', f)), 40), names.get(f[:-4], f[:-4]), f[:-4])

    elif key == 'weapons':
        import cairo, wdraw as WD
        src = open('weapons_v6.py').read(); info = {}
        for m in re.finditer(r'\("(\d+)","([^"]+)","([^"]+)",(\w+),', src): info[m.group(4)] = (m.group(2), m.group(3))
        mix = set()
        for m in re.finditer(r"MIX\s*=\s*\{(.*)\}", open('k5w.py').read()): mix = set(re.findall(r"'(\w+)'", m.group(1)))
        for kind, fn in WD.FN.items():
            S = cairo.ImageSurface(cairo.FORMAT_ARGB32, TILE, TILE); c = cairo.Context(S); c.set_source_rgb(*[v/255 for v in BG]); c.paint()
            WD.set_ctx(c); c.translate(70, TILE/2)
            g = cairo.RadialGradient(0, 0, WD.R*.8, 0, 0, WD.R*2.2); g.add_color_stop_rgba(0, 1, 1, 1, .35); g.add_color_stop_rgba(1, 1, 1, 1, 0)
            c.set_source(g); c.arc(0, 0, WD.R*2.2, 0, 2*math.pi); c.fill(); c.save(); fn(); c.restore()
            c.new_path(); c.arc(0, 0, WD.R, 0, 2*math.pi); c.set_source_rgba(1, 1, 1, 1); c.fill()
            p = os.path.join(O.dir, '_w.png'); S.write_to_png(p); im = Image.open(p).convert('RGB'); os.remove(p)
            name, desc = info.get(kind, (kind.upper(), ''))
            O.add(im, name.title(), desc, 'STANDARD MIX' if kind in mix else None)

    elif key == 'bosses':
        import boss_library as BL, k9_frames as K, bb_render as B
        B.set_scale(1.0)
        for i in range(len(BL.NAMES)):
            BL.use(i); f = B.Frame(cx=540, cy=830, floor_y=1215, seed=9); K.draw_boss(f, 540, 830, K.BOSS_HP, 0.0)
            im = f.compose(None).crop((320, 560, 760, 1000))
            O.add(tile(im), BL.NAMES[i][4:], f"BOSS={i + 1}")

    elif key == 'shapes':
        import sd_shapes as SH
        for i, n in enumerate(SH.NAMES):
            W = TILE*3; im = Image.new('RGB', (W, W), BG); d = ImageDraw.Draw(im)
            for k, sc in enumerate((1.0, 0.78, 0.56, 0.34)):
                P = SH.ring_points(i, sc, 0.045)
                col = tuple(int(a + (b - a)*k/3) for a, b in zip((255, 120, 70), (255, 214, 90)))
                for x, z in P:
                    X, Y = W/2 + x*W*0.42, W/2 + z*W*0.42; d.ellipse([X - 9, Y - 9, X + 9, Y + 9], fill=col)
            O.add(im.resize((TILE, TILE), Image.LANCZOS), n, f"K9_SHAPE={i + 1}")

    elif key == 'boxes':
        import gc_layout4 as GL
        desc = {'mul': 'multiplies every ball that lands', 'split': 'splits a ball into 3', 'plus': 'adds 10 balls', 'div': 'halves the balls', 'merge': 'merges balls into one',
                'turbo': 'speeds the balls up', 'magnet': 'pulls the balls together', 'grav': 'flips / boosts gravity', 'myst': 'random effect', 'bomb': 'blasts balls away',
                'rain': 'rains new balls', 'small': 'shrinks a ball', 'kill': 'removes the ball', 'big': 'makes a ball big'}
        std = set(GL.LAYOUT); f1, f2 = font(E, 78), font(E, 26)
        names = list(dict.fromkeys(list(GL.COLX.keys()) + list(GL.FIXED.keys())))
        for n in names:
            kind = ('mul', int(n[1:])) if n.startswith('×') else GL.FIXED.get(n, ('?', 0)); col = tuple(GL.COLX.get(n, FROST))
            im = Image.new('RGB', (TILE, TILE), BG); d = ImageDraw.Draw(im)
            for g in range(14, 0, -1): d.rounded_rectangle([60 - g*2, 90 - g*2, 300 + g*2, 270 + g*2], 30, outline=tuple(int(c*0.06*(15 - g)/4) for c in col), width=2)
            d.rounded_rectangle([60, 90, 300, 270], 26, fill=INK, outline=col, width=5)
            d.text((180, 182), n, font=f1, fill=col, anchor='mm')
            O.add(im, n, desc.get(kind[0], ''), 'STANDARD LAYOUT' if n in std else None)
    O.done()


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]; check = '--if-changed' in sys.argv
    E, LIB = os.path.abspath(args[0]), os.path.abspath(args[1]); keys = args[2:]
    if len(keys) == 1 and keys[0] in LIBS: run(keys[0], E, LIB); sys.exit()
    os.makedirs(LIB, exist_ok=True); sp = os.path.join(LIB, '.engine-stamp'); stamp = engine_stamp(E)
    if check and os.path.exists(sp):
        old = open(sp).read()   # same engines: skip; earlier failures are retried at most every 6 h
        if old.split()[0:1] == [stamp] and ('failed' not in old or time.time() - os.path.getmtime(sp) < 6*3600): print('up to date'); sys.exit()
    clean_leftovers(LIB); bad = []
    for k in keys or LIBS + ['sounds']:
        if k == 'sounds': cmd = [sys.executable, os.path.join(os.path.dirname(os.path.abspath(__file__)), 'build_sounds.py'), E, LIB]
        else: cmd = [sys.executable, os.path.abspath(__file__), E, LIB, k]
        if subprocess.run(cmd).returncode: bad.append(k)
    libs = []
    for d in sorted(os.listdir(LIB)):
        p = os.path.join(LIB, d, 'index.json')
        if os.path.exists(p): j = json.load(open(p, encoding='utf-8')); libs.append(dict(folder=d, kind=j.get('kind'), title=j.get('title', d), concept=j.get('concept')))
    json.dump(dict(libraries=libs, failed=bad), open(os.path.join(LIB, 'index.json'), 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    if not keys: open(sp, 'w').write(stamp + ('\nfailed: ' + ' '.join(bad) if bad else '') + '\n')
    print('failed:', bad or 'none'); sys.exit(1 if bad else 0)
