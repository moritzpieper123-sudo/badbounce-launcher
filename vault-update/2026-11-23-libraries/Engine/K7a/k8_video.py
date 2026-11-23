"""Konzept 8 (Shape filler) engine.
One white ball in a closed arena. Every bounce adds one fill step. The arena always ends completely filled.
Variants: shape (circle, hexagon, star), fill style (rings = inset layers, bricks = patch at the hit point), ball size, trail.
Usage: python k8_video.py <variant> <out.mp4> [scale]   variant: circle | hexagon | star
"""
import sys, os, math, subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy.ndimage import distance_transform_edt as edt
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))   # bb_render.py, sfx.py live in this folder
import bb_render as B
import cairo

W, H = 1080, 1920
CX, CY = 540, 840
HALF = 450                       # arena grid half size (px, full-res coordinates)
GX0, GY0 = CX - HALF, CY - HALF
FPS = 30

VARIANTS = {
    'circle':  dict(shape='circle',  style='rings',  r=17, N=26, trail=False, title=[[("CAN ONE BALL", 'text')], [("FILL", 'yellow'), (" THE CIRCLE?", 'text')]]),
    'hexagon': dict(shape='hexagon', style='bricks', r=17, N=30, trail=False, title=[[("CAN ONE BALL", 'text')], [("WALL", 'yellow'), (" ITSELF IN?", 'text')]]),
    'star':    dict(shape='star',    style='rings',  r=11, N=16, trail=True,  title=[[("CAN ONE BALL", 'text')], [("FILL", 'yellow'), (" THE STAR?", 'text')]]),
}

def shape_points(name):
    if name == 'hexagon':
        return [(CX + 420*math.cos(math.radians(-90 + 60*k)), CY + 420*math.sin(math.radians(-90 + 60*k))) for k in range(6)]
    if name == 'star':
        pts = []
        for k in range(10):
            rad = 440 if k % 2 == 0 else 440*0.46
            a = math.radians(-90 + 36*k); pts.append((CX + rad*math.cos(a), CY + rad*math.sin(a)))
        return pts
    return None

def shape_mask(name):
    im = Image.new('L', (2*HALF, 2*HALF), 0); d = ImageDraw.Draw(im)
    if name == 'circle': d.ellipse([HALF-400, HALF-400, HALF+400, HALF+400], fill=255)
    else: d.polygon([(x-GX0, y-GY0) for x, y in shape_points(name)], fill=255)
    return np.asarray(im) > 0

# ---------------------------------------------------------------- simulation
def simulate(variant, seed=3):
    V = VARIANTS[variant]; rng = np.random.default_rng(seed); r = V['r']; N = V['N']
    mask = shape_mask(V['shape']); sdf = edt(mask)
    maxsdf = sdf.max(); step = (maxsdf - r*1.1)/N
    area = mask.sum()
    L = np.full(mask.shape, -1, np.int16)             # layer id per pixel, -1 = free
    yy, xx = np.mgrid[0:mask.shape[0], 0:mask.shape[1]]
    def field():
        free = mask & (L < 0); F = edt(free); gy, gx = np.gradient(F); return F, gx, gy
    F, gx, gy = field()
    p = np.array([HALF + 120.0, HALF + 60.0]); ang = rng.uniform(0, 2*math.pi); dr = np.array([math.cos(ang), math.sin(ang)])
    def samp(a, q): return a[int(round(q[1])), int(round(q[0]))]
    def nrm(q):
        n = np.array([samp(gx, q), samp(gy, q)]); m = np.hypot(*n)
        return n/m if m > 1e-6 else None
    path = [p.copy()]; bounces = []                   # path index of each bounce
    states = [L.copy()]                               # fill state after k bounces
    n = 0; s = 0
    while True:
        q = p + dr
        if samp(F, q) < r:
            nn = nrm(q)
            if nn is None: nn = (np.array([HALF, HALF]) - p); nn /= np.hypot(*nn)
            if dr @ nn < 0:
                dr = dr - 2*(dr @ nn)*nn
                th = rng.uniform(-0.07, 0.07); c, sn = math.cos(th), math.sin(th); dr = np.array([c*dr[0]-sn*dr[1], sn*dr[0]+c*dr[1]])
                if dr @ nn < 0.05: dr = dr + nn*0.2; dr /= np.hypot(*dr)
                n += 1; hit = p - nn*r
                if V['style'] == 'rings':
                    L[mask & (sdf <= n*step) & (L < 0)] = n
                else:
                    rho = math.sqrt(2*area/(math.pi*N))*(0.85 + 0.35*n/N)
                    L[mask & (L < 0) & ((xx-hit[0])**2 + (yy-hit[1])**2 <= rho*rho)] = n
                F, gx, gy = field()
                bounces.append(len(path) - 1)
                # push the ball out of the freshly filled zone
                for _ in range(400):
                    if samp(F, p) >= r: break
                    g = nrm(p)
                    if g is None: break
                    p = p + g
                if samp(F, p) < r:
                    iy, ix = np.unravel_index(np.argmax(F), F.shape); p = np.array([float(ix), float(iy)])
                path.append(p.copy()); states.append(L.copy())
                if n >= N or F.max() < r*1.15: break
                continue
        p = q; path.append(p.copy())
        if len(path) > 200000: break
    return dict(V=V, path=np.array(path), bounces=bounces, states=states, mask=mask, F=F, L=L, step=step, final_p=p.copy())

# ---------------------------------------------------------------- drawing
WHITE = np.array(B.C['glow'], np.float32)/255

def layer_rgba(L, style, free_extra=None, flood_id=None):
    """Return premultiplied RGBA float image (grid size) for the fill state."""
    filled = L >= 0
    e = np.zeros(L.shape, bool)
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        e |= (np.roll(L, (dy, dx), (0, 1)) != L)
    edge = e & filled | (np.roll(filled, 1, 0) ^ filled) & filled | (np.roll(filled, 1, 1) ^ filled) & filled
    edge2 = edge.copy()
    for dy, dx in ((1, 0), (0, 1)): edge2 |= np.roll(edge, (dy, dx), (0, 1))
    edge2 &= filled
    a = np.zeros(L.shape, np.float32)
    if style == 'rings':
        a[filled] = 0.14; a[edge2] = 0.55
    else:
        a[filled] = 0.30
        yy, xx = np.mgrid[0:L.shape[0], 0:L.shape[1]]
        row = yy//14; mortar = (yy % 14 < 2) | (((xx + (row % 2)*15) % 30) < 2)
        a[filled & mortar] = 0.06; a[edge2] = 0.85
    out = np.zeros(L.shape + (4,), np.float32); out[..., :3] = WHITE*a[..., None]; out[..., 3] = a
    return out

def to_cairo(arr_rgba, scale):
    """Resize premultiplied RGBA float image to scale and make a cairo surface (BGRA premultiplied)."""
    h, w = arr_rgba.shape[:2]; nw, nh = int(w*scale), int(h*scale)
    chans = [np.asarray(Image.fromarray((arr_rgba[..., i]*255).astype(np.uint8)).resize((nw, nh), Image.BOX), np.float32)/255 for i in range(4)]
    a = np.stack([chans[2], chans[1], chans[0], chans[3]], -1)
    data = np.ascontiguousarray((np.clip(a, 0, 1)*255).astype(np.uint8))
    surf = cairo.ImageSurface.create_for_data(bytearray(data.tobytes()), cairo.FORMAT_ARGB32, nw, nh, nw*4)
    return surf

# ---------------------------------------------------------------- timeline
TITLE_CACHE = {}
def title_img(variant):
    if variant in TITLE_CACHE: return TITLE_CACHE[variant]
    V = VARIANTS[variant]
    base = Image.new('RGB', (B.PW, B.PH), (0, 0, 0))
    lines = [[(t, B.C[c]) for t, c in ln] for ln in V['title']]
    B.headline(base, lines, y0=170, size=88)
    TITLE_CACHE[variant] = np.asarray(base, np.uint8); return TITLE_CACHE[variant]

class Timeline:
    def __init__(self, variant, sim, total_target=24.0):
        self.v = variant; self.sim = sim; V = sim['V']
        path = sim['path']; seg = np.hypot(*np.diff(path, axis=0).T); cum = np.concatenate([[0], np.cumsum(seg)])
        # teleports (push-outs) have non-trivial length: treat them as instantaneous by capping their length contribution
        cum = np.concatenate([[0], np.cumsum(np.minimum(seg, 3.0))])
        self.cum = cum
        self.intro = 0.6; self.flood = 1.1; self.flash = 0.18; self.hold = 1.8
        sim_time = total_target - self.intro - self.flood - self.flash - self.hold
        self.speed = cum[-1]/sim_time
        self.sim_end = self.intro + cum[-1]/self.speed
        self.tb = [self.intro + cum[i]/self.speed for i in sim['bounces']]       # bounce times
        self.t_flood0 = self.sim_end + 0.15; self.t_boom = self.t_flood0 + self.flood
        self.total = self.t_boom + self.flash + self.hold
    def ball_at(self, t):
        if t <= self.intro: return self.sim['path'][0], 0
        d = (t - self.intro)*self.speed
        if d >= self.cum[-1]: return self.sim['path'][-1], len(self.sim['bounces'])
        i = int(np.searchsorted(self.cum, d, side='right') - 1); i = min(i, len(self.sim['path'])-2)
        f = (d - self.cum[i])/max(self.cum[i+1] - self.cum[i], 1e-6); f = min(max(f, 0), 1)
        p = self.sim['path'][i]*(1 - f) + self.sim['path'][i+1]*f
        k = sum(1 for b in self.sim['bounces'] if b < i + 1)   # bounces completed
        return p, k

def render_frame(args):
    tl, fi, scale = args
    B.set_scale(scale); sim = tl.sim; V = sim['V']; t = fi/FPS
    p, k = tl.ball_at(t); L = sim['states'][min(k, len(sim['states'])-1)]
    flood_e = None
    if t >= tl.t_flood0:
        e = (t - tl.t_flood0)/tl.flood; e = min(e, 1)**1.6*sim['F'].max()*1.05
        L = L.copy(); L[(L < 0) & sim['mask'] & (sim['F'] <= e)] = 99; flood_e = e
    f = B.Frame(cx=CX, cy=CY, floor_y=1360, seed=8)
    pts = shape_points(V['shape'])
    def pathfn(c):
        c.new_path()
        if pts is None: c.arc(CX, CY, 400, 0, 2*math.pi)
        else:
            c.move_to(*pts[0]); [c.line_to(*q) for q in pts[1:]]; c.close_path()
    f.boundary(pathfn, B.C['glow'], 0.25, 3.5)
    surf = to_cairo(layer_rgba(L, V['style']), scale)
    g = f.gctx; g.save(); g.identity_matrix(); g.set_source_surface(surf, GX0*scale, GY0*scale); g.paint(); g.restore()
    show_ball = True
    if flood_e is not None and sim['F'][int(round(p[1])), int(round(p[0]))] <= flood_e: show_ball = False
    if t >= tl.t_boom: show_ball = False
    if show_ball:
        bx, by = GX0 + p[0], GY0 + p[1]
        if V['trail']:
            for j in range(1, 9):
                tt = t - j*0.025; pp, _ = tl.ball_at(tt); a = 0.5*(1 - j/9)
                g.arc(GX0 + pp[0], GY0 + pp[1], V['r']*(1 - j*0.07), 0, 2*math.pi); g.set_source_rgba(*B.rgb(B.C['glow'], a)); g.fill()
        f.ball(bx, by, V['r'], B.C['glow'])
    if t >= tl.t_boom:
        x = (t - tl.t_boom)/tl.flash; f.flash = max(0.0, 1 - x)*0.55 if x < 1 else 0.0
    im = f.compose(None).convert('RGB')
    arr = np.maximum(np.asarray(im, np.uint8), title_img(tl.v))
    return arr.tobytes()

# ---------------------------------------------------------------- sound
def build_audio(tl, out_wav):
    sys.argv = ['x', '/tmp']
    src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sfx.py')).read().split("for n,fn in")[0]
    ns = {}; exec(src, ns)
    SR = ns['SR']; tickA = ns['tickA']; boomA = ns['boomA']; norm = ns['norm']
    mix = np.zeros(int((tl.total + 0.5)*SR), np.float32)
    def put(x, s, g=1.0):
        i = int(s*SR); x = x[:len(mix) - i]; mix[i:i+len(x)] += x*g
    n = len(tl.tb)
    for k, s in enumerate(tl.tb):
        f = 1800*(2.6**(k/max(n - 1, 1)))                 # rising pitch per bounce: 1800 Hz to about 4700 Hz
        put(norm(tickA(f)), s, 0.55 + 0.35*k/max(n - 1, 1))
        put(norm(ns['np'].sin(2*np.pi*(f/8)*ns['t'](0.12))*ns['env'](0.12, .001, .03)), s, 0.3)   # small low body so the click punches
    put(norm(boomA()), tl.t_boom - 0.02, 1.0)
    mix = mix/np.max(np.abs(mix))*0.9
    import wave
    with wave.open(out_wav, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix*32767).astype(np.int16).tobytes())

def main(variant, out, scale=0.5):
    sim = simulate(variant); tl = Timeline(variant, sim)
    print(variant, 'bounces', len(sim['bounces']), 'total', round(tl.total, 1), 's, speed', int(tl.speed), 'px/s', flush=True)
    B.set_scale(scale); title_img(variant)
    nf = int(tl.total*FPS)
    wav = out + '.wav'; build_audio(tl, wav)
    from multiprocessing import Pool
    w, h = B.PW, B.PH
    ff = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{w}x{h}', '-r', str(FPS), '-i', '-', '-i', wav,
                           '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-shortest', out], stdin=subprocess.PIPE)
    with Pool(4) as pool:
        for i, b in enumerate(pool.imap(render_frame, [(tl, i, scale) for i in range(nf)], chunksize=4)):
            ff.stdin.write(b)
            if i % 100 == 0: print('frame', i, '/', nf, flush=True)
    ff.stdin.close(); ff.wait(); os.remove(wav)

def still(variant, out, t_frac=0.5, scale=1.0):
    sim = simulate(variant); tl = Timeline(variant, sim); B.set_scale(scale); title_img(variant)
    b = render_frame((tl, int(tl.total*FPS*t_frac), scale))
    Image.frombytes('RGB', (B.PW, B.PH), b).save(out)

if __name__ == '__main__':
    if sys.argv[1] == 'still': still(sys.argv[2], sys.argv[3], float(sys.argv[4]) if len(sys.argv) > 4 else 0.5)
    else: main(sys.argv[1], sys.argv[2], float(sys.argv[3]) if len(sys.argv) > 3 else 0.5)
