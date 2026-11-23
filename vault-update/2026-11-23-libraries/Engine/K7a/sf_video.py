"""Shape filler (revived) test videos. One concept, three variants.
 pulse : simple ball flies -> first wall hit turns it into a ring (same physics) -> ring's next wall hit makes it grow until it fills the free circle -> layer stamped -> next wave starts with a ball from the same spot and direction
 bricks: ball bounces; each wall approach adds ONE smooth brick element that grows in just before the ball arrives (no teleport, no gaps)
 layers: ball bounces; each wall hit adds one layer until the ball is boxed in
End: a bright 'done' chime exactly when the shape is completely filled (no boom).
Usage: python sf_video.py <pulse|bricks|layers> <out.mp4> [scale]      (low quality test: scale 0.5)
       python sf_video.py still <variant> <out.png> <t_seconds> [scale]"""
import sys, os, math, subprocess, bisect
import numpy as np
from PIL import Image
from scipy.ndimage import distance_transform_edt as edt
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import sf_frames as S
K = S.K; B = S.B
FPS = 30
G = {}                                        # shared with forked workers
BRICK_SPEED = 760.0                           # px/s at 1080 wide (first test video: about 250)
LAYER_SPEED = 700.0                           # px/s (first test: 221, second: 278, third: 480)
INTRO, HOLD, FLASH, RUSH = 0.6, 0.8, 0.12, 0.8
RAMP = 1.6                                    # ring speed at the last wave = (1+RAMP) x the first

# ------------------------------------------------------------------ pulse physics
class PulseSim:
    """wave = simple ball flies -> first wall hit turns it into a ring (same physics) -> every further wall hit makes the ring a small step bigger,
    5 to 8 hits until it fills the free circle -> layer stamped -> next wave starts with a ball from the same place, same direction"""
    HZ = 120
    STEP_T, INFL = 0.06, 0.10
    def __init__(self, v, N=56):
        self.N = N; self.step = (400 - 24)/N; HZ = self.HZ; dt = 1/HZ; rng = np.random.default_rng(7); rec = []
        self.stamp, self.hit_ev = [], []; self.anim_ticks = 0
        c = np.zeros(2); a0 = rng.uniform(0, 2*math.pi); u = np.array([math.cos(a0), math.sin(a0)])
        sm = lambda s_: s_*s_*(3 - 2*s_)
        def refl(u, n):
            u = u - 2*(u @ n)*n; th = rng.uniform(-0.28, 0.28); co, si = math.cos(th), math.sin(th)      # more variation in every bounce
            u = np.array([co*u[0] - si*u[1], si*u[0] + co*u[1]])
            return u if u @ n < -0.12 else u - n*(u @ n + 0.2)
        v0 = v; trav = 0.0; DIST = 80.0
        for w in range(N):
            v = v0*(1 + RAMP*(w/N)**2)
            Rf = 400 - w*self.step; rb = min(12.0, Rf*0.3); rc = max(min(0.2*Rf, Rf*0.5), rb + 3)
            nst = int(rng.integers(5, 9)); sched = [rc + (Rf - rc)*i/nst for i in range(nst + 1)]
            while True:                                           # A: the simple ball flies until it hits the wall
                c = c + u*v*dt; m = np.hypot(*c); trav += v*dt
                if trav >= DIST: trav = 0.0
                if m + rb >= Rf:
                    n = c/m; u = refl(u, n); c = n*(Rf - rb - 0.01); break
                rec.append((c[0], c[1], rb, 0, w))
            self.hit_ev.append((len(rec)/HZ, 0))
            rho = rb; anim = (rb, rc, 0, int(self.INFL*HZ)); i = 0
            while True:                                           # B: ring, small growth step on every wall hit
                c = c + u*v*dt; trav += v*dt
                if trav >= DIST: trav = 0.0
                if anim:
                    f0, t0, k, nn_ = anim; k += 1; rho = f0 + (t0 - f0)*sm(k/nn_); anim = (f0, t0, k, nn_) if k < nn_ else None; self.anim_ticks += 1
                m = np.hypot(*c); lim = max(Rf - rho, 0.0)
                if m > lim:
                    n = c/max(m, 1e-9); c = n*lim
                    if anim is None and i < nst:
                        u = refl(u, n); i += 1; self.hit_ev.append((len(rec)/HZ, i)); anim = (rho, sched[i], 0, int(self.STEP_T*HZ))
                    elif u @ n > 0: u = refl(u, n)
                rec.append((c[0], c[1], rho, 1, w))
                if anim is None and i >= nst: break
            self.stamp.append(len(rec)/HZ); c = np.zeros(2)       # next wave: a ball again, same direction
        ng = int(0.3*HZ)
        for j in range(1, ng + 1):
            s_ = j/ng; rec.append((0.0, 0.0, 3 + 21*sm(s_), 2, N))
        self.anim_ticks += ng
        self.t_done = len(rec)/HZ; self.rec = np.array(rec, np.float32); self.moving = len(rec)/HZ
    def at(self, t):
        i = min(int(t*self.HZ), len(self.rec) - 1); x, y, rho, mode, w = self.rec[i]; return x, y, rho, int(mode), int(w)

class PulseTL:
    def __init__(self, target=62.0):
        v = 900.0
        for _ in range(9):
            sim = PulseSim(v); fixed = sim.anim_ticks/sim.HZ
            legs = sim.moving - fixed; want = max(target - HOLD - fixed, 6.0); v *= legs/want
        self.sim = PulseSim(v); self.v = v; sim = self.sim
        self.N = sim.N; self.step = sim.step; self.tb = list(sim.stamp); self.soft = list(sim.hit_ev)       # soft = (time, step in wave)
        self.t_done = sim.t_done; self.total = self.t_done + FLASH + HOLD; self.FLASH = FLASH

# ------------------------------------------------------------------ brick timeline
class PathTL:
    """constant ball speed along the simulated path"""
    def __init__(self, sim, speed):
        path = sim['path']; seg = np.hypot(*np.diff(path, axis=0).T); self.cum = np.concatenate([[0], np.cumsum(np.minimum(seg, 3.0))])
        self.speed = speed; self.T = lambda i: INTRO + self.cum[i]/self.speed; T = self.T; self.path = path
        self.sim_end = T(len(path) - 1); self.tb = [T(i) for i in sim['bounces']]
        self.t_flood0 = self.sim_end + 0.1; self.flood = RUSH; self.t_done = self.t_flood0 + RUSH
        self.total = self.t_done + FLASH + HOLD; self.FLASH = FLASH
    def ball_at(self, t):
        if t <= INTRO: return self.path[0]
        d = (t - INTRO)*self.speed
        if d >= self.cum[-1]: return self.path[-1]
        i = min(int(np.searchsorted(self.cum, d, side='right') - 1), len(self.path) - 2)
        f = min(max((d - self.cum[i])/max(self.cum[i + 1] - self.cum[i], 1e-6), 0), 1)
        return self.path[i]*(1 - f) + self.path[i + 1]*f

class BrickTL(PathTL):
    def __init__(self, sim):
        super().__init__(sim, BRICK_SPEED); T = self.T; hits = sim['hits']; self.t_flood0 = self.sim_end + 0.05; self.flood = 0.25; self.t_done = self.t_flood0 + 0.25; self.total = self.t_done + FLASH + HOLD
        self.tt = [T(h['trig_idx']) for h in hits]                      # element appears (about 0.1 s after the ball hit)
        self.dur = [0.08]*len(hits); self.reach = [340]*len(hits)       # every element appears almost instantly
        self.fail = sim.get('why') == 'trapped'
        if self.fail: self.t_flood0 = 1e9; self.t_done = self.sim_end + 0.1; self.total = self.t_done + FLASH + 1.6
        else: self.t_flood0 = self.sim_end + 0.05; self.t_done = self.t_flood0 + 0.25; self.total = self.t_done + FLASH + HOLD
        self.tf = [T(h['fill_idx']) if h['fill_idx'] is not None else self.sim_end for h in hits]

# ------------------------------------------------------------------ frames
def render_frame(fi):
    t = fi/FPS; var = G['variant']; tl = G['tl']; scale = G['scale']; V = K.VARIANTS[var]
    B.set_scale(scale)
    f = B.Frame(cx=K.CX, cy=K.CY, floor_y=1360, seed=8); g = f.gctx
    col = V['col']; edge_col = tuple(int(255*v) for v in S.tone(col, 0.0)) if col else B.C['glow']
    pts = K.shape_points(V['shape'])
    def pathfn(c):
        c.new_path()
        if pts is None: c.arc(K.CX, K.CY, 400, 0, 2*math.pi)
        else:
            c.move_to(*pts[0]); [c.line_to(*q) for q in pts[1:]]; c.close_path()
    f.boundary(pathfn, edge_col, 0.25, 3.5)
    fail = getattr(tl, 'fail', False); done = t >= tl.t_done and not fail
    if var == 'pulse':
        n = bisect.bisect_right(tl.tb, t); pop = 0.0
        if n: pop = max(0.0, 1 - (t - tl.tb[n - 1])/0.15)
        S.vec_layers(g, 'circle', n, tl.step, col, tl.N + 1, pop)
        if done:
            g.arc(K.CX, K.CY, 400 - tl.N*tl.step + 1, 0, 2*math.pi); g.set_source_rgba(*(float(v) for v in S.tone(col, 1.0)), 0.55); g.fill()
        else:
            x, y, rho, mode, w = tl.sim.at(t)
            if mode >= 0:
                nxt = tuple(min(float(v)*1.3, 1.0) for v in S.tone(col, min(w/max(tl.N, 1), 1)))
                if mode == 0: f.ball(K.CX + x, K.CY + y, rho, tuple(int(255*v) for v in nxt))
                else:
                    g.arc(K.CX + x, K.CY + y, rho, 0, 2*math.pi); g.set_source_rgba(*nxt, 1); g.set_line_width(5); g.stroke()
    elif var == 'layers':
        sim = G['sim']; p = tl.ball_at(t); k = bisect.bisect_right(tl.tb, t); nL = len(sim['bounces']); step = sim['step']; ntot = G['ntot']
        n = k; pop = 0.0
        if k > 0 and t < tl.t_flood0: pop = max(0.0, 1 - (t - tl.tb[k - 1])/0.15)
        if t >= tl.t_flood0:
            e = min((t - tl.t_flood0)/tl.flood, 1.0); n = nL + int(e**1.3*(ntot - nL))
        if done: n = ntot
        S.vec_layers(g, 'hexagon', n, step, col, ntot, pop)
        if not done and n*step < G['sdf'][int(round(p[1])), int(round(p[0]))] - 2: f.ball(K.GX0 + p[0], K.GY0 + p[1], V['r'], B.C['glow'])
    else:
        hits = G['hits']; p = tl.ball_at(t); empty = G['empty']
        kt = bisect.bisect_right(tl.tt, t); new = None; pop = 0.0
        if kt == 0: SM = empty
        else:
            h = kt - 1; age = t - tl.tt[h]; dur = tl.dur[h]; prev = hits[h - 1]['full'] if h > 0 else empty
            if age >= dur and t >= tl.tf[h]: SM = hits[h]['full']
            else:
                E = hits[h]['full'] & ~prev; x = min(age/dur, 1.0); rho = tl.reach[h]*(1 - (1 - x)**2)
                vis = E & (np.hypot(G['XX'] - hits[h]['hit'][0], G['YY'] - hits[h]['hit'][1]) <= rho)
                if t < tl.tf[h]: vis &= ~hits[h]['notch']
                SM = prev | vis; new = vis
            pop = max(0.0, 1 - age/0.12)
            if new is None and age < 0.12: new = hits[h]['full'] & ~prev
        hide = False
        if t >= tl.t_flood0:
            base = hits[-1]['full']; e = min((t - tl.t_flood0)/tl.flood, 1.0)**1.6*G['Ffree'].max()*1.05
            SM = base | (G['mask'] & (G['Ffree'] <= e)); new = None; pop = 0.0
            hide = G['Ffree'][int(round(p[1])), int(round(p[0]))] <= e
        if done: SM = G['mask']; hide = True
        surf = K.to_cairo(S.tiles_rgba(SM, G['th'], G['r'], new=new, flash=0.6*pop), scale)
        es = K.to_cairo(S.tiles_rgba(SM, G['th'], G['r'], part='edge'), scale)
        for ctx, sf in ((f.sctx, surf), (g, es)):
            ctx.save(); ctx.identity_matrix(); ctx.set_source_surface(sf, K.GX0*scale, K.GY0*scale); ctx.paint(); ctx.restore()
        if not hide: f.ball(K.GX0 + p[0], K.GY0 + p[1], V['r'], B.C['glow'])
    im = f.compose(None).convert('RGB')
    if fail and t >= tl.t_done:
        a_ = max(0.0, 1 - (t - tl.t_done)/0.3)*0.22
        if a_ > 0: im = Image.fromarray(np.clip(np.asarray(im, np.float32)*(1 - a_) + a_*np.array([255, 90, 90], np.float32), 0, 255).astype(np.uint8))      # slight red tone: challenge lost
    if done:
        x = (t - tl.t_done)/FLASH; a_ = max(0.0, 1 - x)*0.16 if x < 1 else 0.0
        if a_ > 0: im = Image.fromarray(np.clip(np.asarray(im, np.float32)*(1 - a_) + a_*np.array([150, 255, 190], np.float32), 0, 255).astype(np.uint8))   # slight green tone
    arr = np.maximum(np.maximum(np.asarray(im, np.uint8), K.title_img(var)), bottom_img())
    return arr.tobytes()

_BOT = []
def bottom_img():
    if not _BOT:
        base = Image.new('RGB', (B.PW, B.PH), (0, 0, 0))
        B.headline(base, [[("WAIT TIL THE ", B.C['text']), ("END", B.C['yellow'])]], y0=1500, size=56)
        B.headline(base, [[("VIDEO ENDS WHEN IT'S FULL", B.C['frost'])]], y0=1590, size=34)
        _BOT.append(np.asarray(base, np.uint8))
    return _BOT[0]

def setup(var, scale):
    B.set_scale(scale); K.TITLE_CACHE.clear(); _BOT.clear(); G.update(variant=var, scale=scale)
    if var == 'pulse': G['tl'] = PulseTL()
    elif var == 'layers':
        sim = K.simulate('layers'); tl = PathTL(sim, LAYER_SPEED); mask = K.shape_mask('hexagon'); sdf = edt(mask)
        tl.flood = 0.25; tl.t_flood0 = tl.sim_end - 0.25; tl.t_done = tl.sim_end; tl.total = tl.t_done + FLASH + HOLD; tl.chime_t = tl.sim_end      # chime + flash exactly when the ball stops
        G.update(sim=sim, tl=tl, sdf=sdf, ntot=int(math.ceil(sdf.max()/sim['step'])))
    else:
        Tm, r, th = S.build_tiles(); sim = S.simulate_tiles(Tm, K.VARIANTS['bricks']['r'], K.VARIANTS['bricks']['N'], seed=int(os.environ.get('SF_SEED', 16)))
        mask = K.shape_mask('circle'); tl = BrickTL(sim); yy, xx = np.mgrid[0:2*S.HALF, 0:2*S.HALF]
        G.update(sim=sim, tl=tl, th=th, r=r, mask=mask, hits=sim['hits'], empty=np.zeros(mask.shape, bool), XX=xx.astype(np.float32), YY=yy.astype(np.float32),
                 Ffree=edt(mask & ~sim['hits'][-1]['full']))
    K.title_img(var)
    return G['tl']

# ------------------------------------------------------------------ sound: tick per bounce (rising pitch) + a bright 'done' chime exactly at completion
PENTA = [0, 2, 4, 7, 9, 12, 14, 16]            # every wall hit climbs a pentatonic step inside the wave
def build_audio(ticks, soft, t_done, total, out_wav, fail=False):
    sys.argv = ['x', '/tmp']
    src = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'sfx.py')).read().split("for n,fn in")[0]
    ns = {}; exec(src, ns); SR = ns['SR']; tickA = ns['tickA']; norm = ns['norm']; npp = ns['np']
    mix = np.zeros(int((total + 1.0)*SR), np.float32)
    def put(x, s, g=1.0):
        i = int(s*SR); x = x[:len(mix) - i]; mix[i:i + len(x)] += x*g
    n = len(ticks)
    for k, s in enumerate(ticks):
        f = 1800*(2.6**(k/max(n - 1, 1)))
        put(norm(tickA(f)), s, 0.55 + 0.35*k/max(n - 1, 1))
        put(norm(npp.sin(2*npp.pi*(f/8)*ns['t'](0.12))*ns['env'](0.12, .001, .03)), s, 0.3)
    for s_, j in soft:
        put(norm(tickA(1700*2**(PENTA[min(j, 7)]/12))), s_, 0.30)
    def note(fr, dur=1.1):
        tt = np.arange(int(dur*SR))/SR
        w = np.sin(2*np.pi*fr*tt)*np.exp(-tt*4.2) + 0.35*np.sin(2*np.pi*2*fr*tt)*np.exp(-tt*7.0) + 0.12*np.sin(2*np.pi*3*fr*tt)*np.exp(-tt*10.0)
        w *= np.minimum(tt/0.002, 1.0); return w.astype(np.float32)
    if fail: put(note(392.0, 1.4), t_done, 0.34); put(note(277.2, 1.6), t_done + 0.22, 0.34)       # low falling 'lost' notes
    else: put(note(1318.5), t_done, 0.34); put(note(1975.5), t_done + 0.09, 0.30)           # E6 -> B6 'done' chime, starts on the completion frame
    mix = mix/np.max(np.abs(mix))*0.9; mix[-int(0.4*SR):] *= np.linspace(1, 0, int(0.4*SR))
    import wave
    with wave.open(out_wav, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix*32767).astype(np.int16).tobytes())

def main(var, out, scale=0.5):
    tl = setup(var, scale); nf = int(tl.total*FPS)
    soft = getattr(tl, 'soft', [])
    print(var, 'ticks', len(tl.tb), 'total', round(tl.total, 1), 's', 'speed', round(getattr(tl, 'speed', getattr(tl, 'v', 0))), flush=True)
    wav = out + '.wav'; build_audio(tl.tb, soft, getattr(tl, 'chime_t', tl.t_done), tl.total, wav, getattr(tl, 'fail', False))
    from multiprocessing import Pool
    w, h = B.PW, B.PH
    ff = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{w}x{h}', '-r', str(FPS), '-i', '-', '-i', wav,
                           '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '24', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-shortest', out], stdin=subprocess.PIPE)
    with Pool(4) as pool:
        for i, b in enumerate(pool.imap(render_frame, range(nf), chunksize=4)):
            ff.stdin.write(b)
            if i % 100 == 0: print('frame', i, '/', nf, flush=True)
    ff.stdin.close(); ff.wait(); os.remove(wav); print('done', out, flush=True)

if __name__ == '__main__':
    if sys.argv[1] == 'still':
        var, out, t = sys.argv[2], sys.argv[3], float(sys.argv[4]); sc = float(sys.argv[5]) if len(sys.argv) > 5 else 0.5
        tl = setup(var, sc); print('total', round(tl.total, 1), 'tdone', round(tl.t_done, 2)); Image.frombytes('RGB', (B.PW, B.PH), render_frame(int(t*FPS))).save(out)
    else: main(sys.argv[1], sys.argv[2], float(sys.argv[3]) if len(sys.argv) > 3 else 0.5)
