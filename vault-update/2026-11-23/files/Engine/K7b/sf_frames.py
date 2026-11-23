"""Shape filler (revived) test frames, three variants of ONE concept.
 pulse : a glowing ring pulses (dot -> big ring) and stamps one coloured layer on the wall when it touches it (ref video 1)
 bricks: one ball bounces in a circle, every wall hit adds ONE brick element (polar tile, slightly different sizes, no gaps, one connected brick texture)
 layers: one ball bounces in a hexagon, every wall hit adds one coloured inset layer until the ball is boxed in
Layers are one colour, tone goes from light (outside) to deep (centre).
Usage: python sf_frames.py <pulse|bricks|layers> <out.png> [scale] [progress 0..1]"""
import sys, os, math
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt as edt
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sfbase as K
B = K.B
HALF, R_ARENA = K.HALF, 400
TONE_LIGHT, DIM = 0.30, 0.86     # re-render 2026-11-11: a little less bright (old: 0.45 / 1.0)
SEED = int(os.environ.get('SF_SEED', 3))   # layers path seed (old final: 3)
T_ = lambda *l: [[(t, c) for t, c in ln] for ln in l]
K.VARIANTS['pulse']  = dict(shape='circle',  style='rings', r=17, N=26, trail=False, col=(60, 170, 255), title=T_([("CAN ONE RING", 'text')], [("FILL", 'yellow'), (" THE CIRCLE?", 'text')]))
K.VARIANTS['bricks'] = dict(shape='circle',  style='tiles', r=17, N=110, trail=False, col=None,            title=T_([("CAN ONE BALL", 'text')], [("WALL", 'yellow'), (" ITSELF IN?", 'text')]))
K.VARIANTS['layers'] = dict(shape='hexagon', style='rings', r=17, N=155, trail=False, col=(176, 112, 255), title=T_([("CAN ONE BALL", 'text')], [("BOX", 'yellow'), (" ITSELF IN?", 'text')]))

# ------------------------------------------------------------ tone gradient (same colour, other tone)
def tone(col, t):
    """t = 0 outer (light) .. 1 centre (deep): same hue, lighter outside, deeper inside"""
    c = np.array(col, np.float32)/255
    light = c + (1 - c)*TONE_LIGHT; deep = c*0.14
    return light*(1 - t) + deep*t

def rings_rgba(L, col, Nmax):
    filled = L >= 0
    out = np.zeros(L.shape + (4,), np.float32)
    ids = np.clip(L, 0, None).astype(np.float32); t = np.clip((ids - 1)/max(Nmax - 1, 1), 0, 1)
    light = np.array(col, np.float32)/255; lt = light + (1 - light)*TONE_LIGHT; dp = light*0.14
    cc = lt[None, None, :]*(1 - t[..., None]) + dp[None, None, :]*t[..., None]
    e = np.zeros(L.shape, bool)
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)): e |= (np.roll(L, (dy, dx), (0, 1)) != L)
    edge = e & filled; edge2 = edge.copy()
    for dy, dx in ((1, 0), (0, 1)): edge2 |= np.roll(edge, (dy, dx), (0, 1))
    edge2 &= filled
    a = np.zeros(L.shape, np.float32); a[filled] = 0.20; a[edge2] = 0.95
    out[..., :3] = cc*a[..., None]; out[..., 3] = a
    return out

# ------------------------------------------------------------ brick tiles (polar, jittered, gap-free)
DR_ROWS = 6
DR_STEP = (R_ARENA - 24)/DR_ROWS
def build_tiles(seed=11):
    rng = np.random.default_rng(seed); dr = (R_ARENA - 24)/DR_ROWS
    S = [30, 26, 21, 16, 11, 6]; bounds = []; tid = {}; k = 0
    for m in range(DR_ROWS):
        w = rng.uniform(0.78, 1.25, S[m]); w = w/w.sum()*2*math.pi
        b = np.concatenate([[0], np.cumsum(w)]) + rng.uniform(0, 2*math.pi); bounds.append(b)
    yy, xx = np.mgrid[0:2*HALF, 0:2*HALF]; r = np.hypot(xx - HALF, yy - HALF); th = np.arctan2(yy - HALF, xx - HALF) % (2*math.pi)
    Tm = np.full(r.shape, -1, np.int32); k = 0; info = []
    for m in range(DR_ROWS):
        b = bounds[m]; off = b[0] % (2*math.pi); rel = (th - off) % (2*math.pi); edges = np.concatenate([[0], np.cumsum(np.diff(b))])
        sec = np.clip(np.searchsorted(edges, rel, side='right') - 1, 0, S[m] - 1)
        ring = (r <= R_ARENA - m*dr) & (r > R_ARENA - (m + 1)*dr) if m < DR_ROWS - 1 else (r <= R_ARENA - m*dr)
        Tm[ring] = k + sec[ring]; k += S[m]
    return Tm, r, th

from scipy.ndimage import gaussian_filter, label
SIGMA = 22.0
def smooth_fill(R, mask):
    """rounded, organic wall: blur the raw tiles (outside the arena counts as wall), so every new element bulges out of the wall with soft tangential edges, no corners"""
    solid = (R | ~mask).astype(np.float32)
    return (gaussian_filter(solid, SIGMA) > 0.47) & mask

def tiles_rgba(SM, th, r, new=None, flash=0.0, part='fill'):
    filled = SM
    out = np.zeros(SM.shape + (4,), np.float32)
    rowh = 15.0; row = np.floor(r/rowh); ncol = np.maximum(np.round(2*math.pi*(row + 0.5)*rowh/44.0), 6)
    u = th/(2*math.pi)*ncol + 0.5*(row % 2)
    mortar = ((r % rowh) < 1.7) | (((u % 1.0)*44.0) < 1.7)
    pale = np.array((226, 232, 250), np.float32)/255; navy = np.array((12, 16, 34), np.float32)/255
    col = np.where(mortar[..., None], navy, pale)
    a = np.zeros(SM.shape, np.float32); a[filled] = 0.62; a[filled & mortar] = 0.42
    free_edge = np.zeros(SM.shape, bool)
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)): free_edge |= (np.roll(filled, (dy, dx), (0, 1)) != filled)
    free_edge &= filled; fe2 = free_edge.copy()
    for dy, dx in ((1, 0), (0, 1)): fe2 |= np.roll(free_edge, (dy, dx), (0, 1))
    fe2 &= filled
    if part == 'edge':
        a = np.zeros(SM.shape, np.float32); a[fe2] = 0.95; col = np.ones(SM.shape + (3,), np.float32)*np.array(B.C['glow'], np.float32)/255
        out[..., :3] = col*a[..., None]; out[..., 3] = a; return out
    a[fe2] = 0.0
    if new is not None and flash > 0:           # newest element pops in with a soft white flash that fades
        fm = new & filled; col[fm] = col[fm]*(1 - flash) + flash; a[fm] = np.maximum(a[fm], 0.5 + 0.5*flash)
    out[..., :3] = col*a[..., None]; out[..., 3] = a
    return out

DEBUG = []
TAIL_K, END_K, MIN_GAP = 0, 1.7, 150     # cavity smaller than TAIL_K ball radii: one new element at most every MIN_GAP steps; smaller than END_K: the ball cannot move any more, the end
def simulate_tiles(Tm, r_ball, N, seed=3, delay_steps=46):
    """ball bounces in the circle. Every real wall hit schedules ONE brick element at the exact hit point; it appears delay_steps path pixels
    (about 0.1 s) after the hit, when the ball has already flown away, so nothing overlaps the ball (no teleport, no push-out).
    hits[k] = dict(trig_idx = path index where the element appears, bounce_idx, hit point, full state, notch pixels still open (fallback only), fill_idx)
    bounces = path indices of every real reflection (sound)."""
    rng = np.random.default_rng(seed); mask = K.shape_mask('circle')
    L = np.full(mask.shape, -1, np.int32); yy, xx = np.mgrid[0:mask.shape[0], 0:mask.shape[1]]
    r_map = np.hypot(xx - HALF, yy - HALF); th_map = np.arctan2(yy - HALF, xx - HALF)
    SM = np.zeros(mask.shape, bool); SMfull = SM.copy(); pending = None
    def field():
        free = mask & ~SM; F = edt(free); gy, gx = np.gradient(F); return F, gx, gy
    F, gx, gy = field(); EX = np.zeros(mask.shape, bool)               # EX = pockets already turned into wall (they stay wall)
    p = np.array([HALF + 40.0, HALF + 20.0]); ang = rng.uniform(0, 2*math.pi); dr = np.array([math.cos(ang), math.sin(ang)])
    def samp(a, q): return a[int(round(min(max(q[1], 0), 2*HALF-1))), int(round(min(max(q[0], 0), 2*HALF-1)))]
    def unreachable(S):
        """free pixels the ball can never reach (sealed pockets and channels thinner than the ball), for the ball's current place"""
        Fp = edt(mask & ~S); cen = Fp >= r_ball - 0.5; lab_, _n = label(cen)
        pi_, pj_ = int(round(min(max(p[1], 0), 2*HALF-1))), int(round(min(max(p[0], 0), 2*HALF-1))); lp_ = lab_[pi_, pj_]
        if lp_ == 0:
            ys_, xs_ = np.where(lab_ > 0)
            if len(ys_):
                dd_ = (ys_ - pi_)**2 + (xs_ - pj_)**2; near_ = lab_[ys_[dd_ <= (dd_.min()**0.5 + 6)**2], xs_[dd_ <= (dd_.min()**0.5 + 6)**2]]
                sizes_ = np.bincount(lab_[lab_ > 0]); lp_ = int(near_[np.argmax(sizes_[near_])])      # nearest components: take the biggest, not a tiny sliver
        comp = lab_ == lp_ if lp_ > 0 else np.zeros_like(cen)
        body = edt(~comp) <= (r_ball + 1.5) if comp.any() else np.zeros_like(cen)
        return mask & ~S & ~body, (float(Fp[comp].max()) if comp.any() else 0.0)
    def nrm(q):
        n = np.array([samp(gx, q), samp(gy, q)]); m = np.hypot(*n); return n/m if m > 1e-6 else None
    path = [p.copy()]; bounces = []; hits = []; queue = []; end_at = None; stuck = 0; st = dict(tail=False, last=-10**9)
    def close_pending():
        nonlocal SM, SMfull, pending, F, gx, gy, EX
        if len(path) < st.get('retry', 0): return
        SMn = SMfull.copy(); pk, _c = unreachable(SMn)
        if pk.sum() > 2500 and _c < r_ball*4: st['trap'] = True; pk = np.zeros_like(pk)      # closing seals the ball off from a big free area: trapped
        EX |= pk; SMn |= pk
        SMfull = SMn; SM = SMn.copy(); hits[-1]['full'] = SMn; F, gx, gy = field(); hits[-1]['fill_idx'] = len(path) - 1; pending = None
    def place(hit, bidx):
        nonlocal SM, SMfull, pending, F, gx, gy, end_at, stuck, EX
        hx, hy = int(np.clip(round(hit[0]), 0, 2*HALF-1)), int(np.clip(round(hit[1]), 0, 2*HALF-1)); tid = int(Tm[hy, hx])
        if tid < 0 or (L == tid).any():
            free_ids = np.unique(Tm[(Tm >= 0) & (L < 0)])
            if len(free_ids) == 0: return False
            best = None
            for t_ in free_ids:
                ys, xs = np.where((Tm == t_) & (L < 0)); d_ = np.min((xs - hit[0])**2 + (ys - hit[1])**2)
                if best is None or d_ < best[0]: best = (d_, t_)
            tid = int(best[1])
        for _ in range(DR_ROWS):                                       # walls grow from the outside in
            ys, xs = np.where(Tm == tid); ang_c = math.atan2(np.mean(np.sin(th_map[ys, xs])), np.mean(np.cos(th_map[ys, xs]))); rm = float(np.mean(r_map[ys, xs]))
            ox, oy = int(round(HALF + math.cos(ang_c)*(rm + DR_STEP))), int(round(HALF + math.sin(ang_c)*(rm + DR_STEP)))
            if 0 <= ox < 2*HALF and 0 <= oy < 2*HALF and Tm[oy, ox] >= 0 and Tm[oy, ox] != tid and not (L[oy, ox] >= 0): tid = int(Tm[oy, ox])
            else: break
        L[(Tm == tid) & (L < 0)] = tid
        new_full = smooth_fill(L >= 0, mask) | EX
        qq, dd, pts = p.copy(), dr.copy(), [p.copy()]                       # look ahead: where will the ball fly next? keep that tunnel free until it has passed
        for _ in range(150):
            n2 = qq + dd
            if samp(F, n2) < r_ball:
                nn2 = nrm(n2)
                if nn2 is not None and dd @ nn2 < 0: dd = dd - 2*(dd @ nn2)*nn2
                else: break
            qq = qq + dd; pts.append(qq.copy())
        tun = np.zeros(mask.shape, bool)
        for pt in pts[::2]: tun[int(round(min(max(pt[1], 0), 2*HALF-1))), int(round(min(max(pt[0], 0), 2*HALF-1)))] = True
        disc = edt(~tun) <= (r_ball + 4)
        part = SM | (new_full & ~disc)
        # everything the ball cannot reach any more (sealed pockets AND channels thinner than the ball) becomes wall: no holes in the bricks
        pockets, cavity = unreachable(part)
        if pockets.sum() > 2500 and cavity < r_ball*4: st['trap'] = True; pockets = np.zeros_like(pockets)      # this element seals the ball off from a big free area: the ball is TRAPPED (challenge lost), the cut-off area stays empty
        EX |= pockets; part = part | pockets; new_full = new_full | pockets
        notch = new_full & ~part; SMfull = new_full
        if notch.any(): SM = part; pending = np.where(notch)
        else: SM = new_full
        F, gx, gy = field(); stuck = 0
        hits.append(dict(trig_idx=len(path) - 1, bounce_idx=bidx, hit=(float(hit[0]), float(hit[1])), full=new_full, notch=notch if pending is not None else np.zeros_like(notch), fill_idx=len(path) - 1 if pending is None else None))
        st['last'] = len(path) - 1
        DEBUG.append(("cav", len(hits), round(cavity,1)))
        if cavity < r_ball*TAIL_K: st["tail"] = True
        why = 'trapped' if st.get('trap') else 'boxed' if cavity < r_ball*END_K else ('N' if len(hits) >= N else ('tiles' if not ((Tm >= 0) & (L < 0)).any() else None))
        if why and end_at is None: end_at = len(path) + (420 if why == 'trapped' else 45); st['why'] = why; DEBUG.append((len(hits), why))     # ball boxed in: the rest fills in the finale
        return True
    while True:
        if pending is not None and np.min((pending[1] - p[0])**2 + (pending[0] - p[1])**2) > (r_ball + 5)**2:
            close_pending()
        while queue and len(path) - 1 >= queue[0][0]:
            _, hit, bidx = queue.pop(0)
            if end_at is None and not (st['tail'] and len(path) - 1 - st['last'] < MIN_GAP): place(hit, bidx)
        if end_at is not None and len(path) >= end_at: break
        q = p + dr
        if samp(F, q) < r_ball:
            nn = nrm(q)
            if nn is None: nn = (np.array([HALF, HALF]) - p); nn /= np.hypot(*nn)
            if dr @ nn < 0:
                hit = p - nn*r_ball
                dr = dr - 2*(dr @ nn)*nn
                th = rng.uniform(-0.07, 0.07); c, sn = math.cos(th), math.sin(th); dr = np.array([c*dr[0]-sn*dr[1], sn*dr[0]+c*dr[1]])
                if dr @ nn < 0.05: dr = dr + nn*0.2; dr /= np.hypot(*dr)
                bounces.append(len(path) - 1); queue.append((len(path) - 1 + delay_steps, hit.copy(), len(bounces) - 1)); stuck += 1
                if stuck > 90 and end_at is None: end_at = len(path) + 10
                continue
        p = q; path.append(p.copy())
        if len(path) > 200000: break
    if pending is not None: close_pending()
    return dict(path=np.array(path), bounces=bounces, hits=hits, F=F, why=st.get('why'))

import cairo
def vec_layers(g, shape, n, step, col, Nmax, pop=0.0, wave=None, lit=0.0):
    """crisp vector layers (no pixel grid): annulus tint + glowing edge per layer, light at the wall -> deep at the centre"""
    def outline(c, d):
        c.new_path()
        if shape == 'circle': c.arc(K.CX, K.CY, 400 - d, 0, 2*math.pi)
        else:
            Rc = (420*math.cos(math.radians(30)) - d)/math.cos(math.radians(30))
            for k in range(6):
                a = math.radians(-90 + 60*k); x, y = K.CX + Rc*math.cos(a), K.CY + Rc*math.sin(a)
                (c.move_to if k == 0 else c.line_to)(x, y)
            c.close_path()
    for i in range(1, n + 1):
        t = min((i - 1)/max(Nmax - 1, 1), 1.0); rgb = tuple(float(v) for v in tone(col, t))
        rgb = tuple(v*DIM for v in rgb)
        if i == n and pop > 0: rgb = tuple(float(v)*(1 - pop) + pop for v in rgb)
        bw_ = 0.0
        if wave is not None: bw_ = math.exp(-((i - wave[0])/wave[1])**2)          # light wave band travelling from the centre (layer n) to the wall (layer 1)
        if bw_ > 0.01 or lit > 0: k_ = max(bw_*0.85, lit*0.4); rgb = tuple(v*(1 - k_) + k_ for v in rgb)
        outline(g, (i - 1)*step); outline_in = None
        g.save(); outline(g, (i - 1)*step); sub = g.copy_path(); g.new_path(); outline(g, i*step); inner = g.copy_path(); g.new_path()
        g.append_path(sub); g.append_path(inner); g.set_fill_rule(cairo.FILL_RULE_EVEN_ODD); g.set_source_rgba(*rgb, 0.19 + 0.35*bw_ + 0.15*lit); g.fill(); g.restore()
        outline(g, i*step); g.set_source_rgba(*rgb, 0.9); g.set_line_width(3.2 + (3.0*pop if i == n else 0) + 2.5*bw_); g.set_line_join(cairo.LINE_JOIN_ROUND); g.stroke()

# ------------------------------------------------------------ frame
def draw(variant, out, scale=1.0, prog=0.55, flash=0.6, center=False):
    B.set_scale(scale); V = K.VARIANTS[variant]; K.TITLE_CACHE.clear()
    mask = K.shape_mask(V['shape']); pts = K.shape_points(V['shape']); ring = ball = vec = None; col = V['col']; edge_col = B.C['glow']
    if variant == 'pulse':
        sdf = edt(mask); N = V['N']; step = (400 - 24)/N; n = int(prog*N)
        L = np.full(mask.shape, -1, np.int16); m_ = mask & (sdf <= n*step); L[m_] = np.ceil(sdf[m_]/step).astype(np.int16)
        vec = ('circle', n, step, N)
        Rfree = 400 - n*step; rho = 0.6*Rfree; off = 0.0 if center else 0.32*Rfree; a = math.radians(-35)
        ring = (HALF + off*math.cos(a), HALF + off*math.sin(a), rho)
    elif variant == 'layers':
        sim = K.simulate(variant, seed=SEED); j = int(prog*(len(sim['bounces']) - 1)); L = sim['states'][j + 1]
        ball = (HALF, HALF) if center else sim['path'][sim['bounces'][j] + 1]; vec = ('hexagon', j + 1, sim['step'], V['N'])
    else:
        Tm, r_, th_ = build_tiles(); sim = simulate_tiles(Tm, V['r'], V['N']); j = int(prog*(len(sim['hits']) - 1))
        SMj = sim['hits'][j]['full']; ball = sim['path'][sim['hits'][j]['trig_idx']]
        prev_ = sim['hits'][j - 1]['full'] if j > 0 else np.zeros_like(SMj)
        surf_arr = tiles_rgba(SMj, th_, r_, new=SMj & ~prev_, flash=flash); edge_arr = tiles_rgba(SMj, th_, r_, part='edge')
    if col: edge_col = tuple(int(255*v) for v in tone(col, 0.0))
    f = B.Frame(cx=K.CX, cy=K.CY, floor_y=1360, seed=8)
    def pathfn(c):
        c.new_path()
        if pts is None: c.arc(K.CX, K.CY, 400, 0, 2*math.pi)
        else:
            c.move_to(*pts[0]); [c.line_to(*q) for q in pts[1:]]; c.close_path()
    f.boundary(pathfn, edge_col, 0.25, 3.5)
    g = f.gctx
    if vec: vec_layers(g, vec[0], vec[1], vec[2], col, vec[3])
    else: surf = K.to_cairo(surf_arr, scale)
    tgt = f.sctx if variant == 'bricks' else g          # brick fill on the crisp layer (no bloom), edge glows
    if not vec: tgt.save(); tgt.identity_matrix(); tgt.set_source_surface(surf, K.GX0*scale, K.GY0*scale); tgt.paint(); tgt.restore()
    if variant == 'bricks':
        es = K.to_cairo(edge_arr, scale); g.save(); g.identity_matrix(); g.set_source_surface(es, K.GX0*scale, K.GY0*scale); g.paint(); g.restore()
    if ring:
        nxt = tone(col, min((n)/max(V['N'] - 1, 1), 1)); x, y, r2 = K.GX0 + ring[0], K.GY0 + ring[1], ring[2]
        g.arc(x, y, r2, 0, 2*math.pi); g.set_source_rgba(*(min(v*1.12, 1) for v in nxt), 1); g.set_line_width(5); g.stroke()
    else:
        f.ball(K.GX0 + ball[0], K.GY0 + ball[1], V['r'], B.C['glow'])
    im = f.compose(None).convert('RGB')
    arr = np.maximum(np.asarray(im, np.uint8), K.title_img(variant))
    Image.fromarray(arr).save(out)

if __name__ == '__main__':
    draw(sys.argv[1], sys.argv[2], float(sys.argv[3]) if len(sys.argv) > 3 else 1.0, float(sys.argv[4]) if len(sys.argv) > 4 else 0.55)
