"""K10 video v4 (Gen #11-13): renders sim4 with the 10 box effects. Env: GC_SEED, GC_SCALE, GC_FINAL, GC_BURST_S (1.3), GC_LAYOUT (see gc_layout4)."""
import os, sys, math, random, subprocess, wave, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from multiprocessing import Pool
import bb_render as bb
import gc_layout4 as LY
import gc_frame as G
import gc_sim4 as S
import gc_fxlib as X
from bb_render import C, rgb
FPS = 30; SEED = int(os.environ.get("GC_SEED", "1")); SCALE = float(os.environ.get("GC_SCALE", "0.5")); BURST_S = float(os.environ.get('GC_BURST_S', '1.3'))
OUT = os.environ.get('GC_OUT', os.path.dirname(os.path.abspath(__file__)) + "/")
CY_COUNT = 290
fr, ev, burst_t = S.run(SEED, tmax=110, final_count=int(os.environ.get('GC_FINAL', '500')))
n_sim = len(fr); n_b = int(BURST_S*FPS); N = n_sim + n_b
disp = float(fr[0]['count']); scale = 1.0; vs = 0.0; CNT = []; prev = fr[0]['count']
for f in fr:
    c = f['count']
    if c > prev: vs += 0.05
    elif c < prev: vs -= 0.05
    prev = c
    disp += (c - disp)*(0.6 if f['burst_t'] is not None else 0.22)
    if abs(c - disp) < 0.6: disp = c
    vs += (1.0 - scale)*0.3; vs *= 0.78; scale = min(1.22, max(0.84, scale + vs))
    CNT.append((int(round(disp)), scale))
NICE = lambda n: int(round(n/1000.0))*1000 if n >= 1000 else n//50*50      # rule 2026-11-23: counter ends on the rounded number
RATIO = NICE(fr[-1]['count'])/float(fr[-1]['count'])
CNT = [(int(round(c*RATIO)), s_) for c, s_ in CNT]
CNT[-1] = (NICE(fr[-1]['count']), CNT[-1][1])
print('final count', fr[-1]['count'], 'shown', CNT[-1][0], flush=True)
def glow_of(ang):
    a = math.radians(ang); d = np.array([math.sin(a), -math.cos(a)]); out = []
    for k in range(8):
        c = float(d @ S.GDIR[k]); x = min(1, max(0, (c - 0.80)/0.19)); out.append(x*x*(3 - 2*x))
    return out
last = fr[-1]; rng = np.random.default_rng(5)
dvec = last['pos'] - S.CEN; dn = np.linalg.norm(dvec, axis=1); bvel = dvec/np.maximum(dn, 1)[:, None]*(rng.uniform(600, 1500, len(dvec)) + dn*1.2)[:, None]
srnd = random.Random(11); pts = G.octo_pts(); SH = []
for i in range(len(pts)):
    a, b = pts[i], pts[(i + 1) % len(pts)]
    for s in range(3): SH.append((a, b, s/3 + 0.04, (s + 1)/3 - 0.04, srnd.uniform(80, 300)))
RED = (255, 84, 84); YEL = (255, 214, 70); BLUE = (70, 130, 255); P_GRAV = (170, 195, 240)
def lerpc(a, b, t): return tuple(int(a[i] + (b[i] - a[i])*t) for i in range(3))
POPS = [e for e in ev if e[1] == 'pop']; TIMED = [e for e in ev if e[1] == 'timed']; MERGES = [e for e in ev if e[1] == 'merge']; BOOMS = [e for e in ev if e[1] == 'boom']
RAIN = [k for k, (n, c) in enumerate(LY.GATES) if n == 'RAINBOW']
# ash particles (K4 final-ring style: fine dust, drifts, fades 1.6-3.8 s)
_ar = np.random.default_rng(21); A = []
for e in ev:
    if e[1] == 'ash':
        for _ in range(7): A.append((e[0], e[2] + _ar.normal(0, 14), e[3] + _ar.normal(0, 14), _ar.normal(0, 16), _ar.normal(-8, 12), _ar.uniform(1.6, 3.8), _ar.uniform(0.9, 2.0)))
ASH = np.array(A) if A else np.zeros((0, 7))
def ballcol(f, k, t):
    flg = f['fl'][k]; c = S.PAL[f['col'][k]]
    if flg == 3: return X.hue(f['bid'][k]*0.0937 + t*0.45), 1.0
    if flg == 1:
        g = 1.0 if t < f['te'][k] else max(0.0, 1 - (t - f['te'][k])/0.25); return X.mix(c, YEL, g), g
    if flg == 2:
        g = 1.0 if t < f['te'][k] else max(0.0, 1 - (t - f['te'][k])/0.25); return X.mix(c, BLUE, g), g
    if flg == 4: return RED, 1.0
    return c, 0.0
def render(i):
    bb.set_scale(SCALE)
    if i < n_sim:
        f = fr[i]; t = f['t']; gl = glow_of(f['ang'])
        pr = 0.0
        if f['final_t'] is not None: pr = min(1, max(0, (t - f['final_t'])/5.0))
        fm = G.base(glow=gl, border=lerpc(C['glow'], RED, pr), bglow=0.95 + 0.6*pr)
        for k in RAIN: X.rainbow_glow(fm, t*0.5, gl[k], k)
        G.seesaw(fm, f['ang'], f['L'])
        for (a_, b_) in [(m[2:4], m[4:6]) for m in MERGES if 0 <= t - m[0] < 0.2]:
            pass
        for m in MERGES:
            u = (t - m[0])/0.2
            if 0 <= u < 1:
                mx, my = (m[2] + m[4])/2, (m[3] + m[5])/2; p1 = (m[2] + (mx - m[2])*u, m[3] + (my - m[3])*u); p2 = (m[4] + (mx - m[4])*u, m[5] + (my - m[5])*u)
                c_ = fm.gctx; c_.set_line_cap(1); c_.move_to(*p1); c_.line_to(*p2); c_.set_source_rgba(*rgb(LY.COLX['MERGE'], 0.95)); c_.set_line_width(2*S.RB); c_.stroke()
        for k, ((x, y), r) in enumerate(zip(f['pos'], f['rad'])):
            flg = f['fl'][k]
            if flg == 0: fm.ball(x, y, r, S.PAL[f['col'][k]]); continue
            c, g = ballcol(f, k, t)
            if flg == 2 and g > 0:
                X.dot(fm, x, y, r*3.0, BLUE, 0.22*g); X.dot(fm, x, y, r*1.9, BLUE, 0.45*g)
            if flg == 1 and t < f['te'][k]:
                v = f['vel'][k]; X.ptail(fm, x, y, v[0], v[1], YEL, n=8, r=r, a=0.55)
            if flg == 4 and t > f['te'][k]: X.ballx(fm, x, y, r, RED, max(0.0, 1 - (t - f['te'][k])/0.15)); continue
            fm.ball(x, y, r, c)
        g = fm.gctx
        for p in f['parts']:
            a = max(0, min(1, p[4]/0.4)); g.arc(p[0], p[1], 3.0, 0, 2*math.pi); g.set_source_rgba(*rgb(S.PAL[int(p[5])], a)); g.fill()
        for b in BOOMS:
            u = (t - b[0])/0.3
            if 0 <= u < 1: X.ring(fm, b[2], b[3], 8 + 22*X.ease_out(u), LY.COLX['BOMB'], 3, 0.9*(1 - u)); X.dot(fm, b[2], b[3], 8 + 22*X.ease_out(u), LY.COLX['BOMB'], 0.18*(1 - u))
        if len(ASH):
            dtm = t - ASH[:, 0]; m = (dtm >= 0) & (dtm < ASH[:, 5])
            for a_ in ASH[m]:
                d_ = t - a_[0]; X.dot(fm, a_[1] + a_[3]*d_, a_[2] + a_[4]*d_, a_[6], LY.COLX['BOMB'] if d_ < 1.2 else C['glow'], 0.7*(1 - d_/a_[5]))
        txt, sc = CNT[i]; fm.counter = (f"{txt:,}", sc); fm.counter_y = CY_COUNT
        im = fm.compose(); G.labels(im, -1, gl)
        for p_ in POPS:
            u = (t - p_[0])/1.0
            if 0 <= u < 1:
                pp = S.CEN + S.GDIR[p_[2]]*(S.PLATE - 130); X.popup(im, p_[3], u, LY.GATES[p_[2]][1], pp[0], pp[1])
        act = [e for e in TIMED if e[3] <= t < e[4]]
        if act:
            e = act[-1]; frac = (e[4] - t)/(e[4] - e[3])
            lab, col_ = {'turbo': ('SPEED ×1.5', YEL), 'magnet': ('MAGNET', BLUE), 'grav': ('GRAVITY 3 s', P_GRAV)}[e[2]]
            X.barabove(im, lab, frac, col_)
    else:
        j = i - n_sim; t = j/FPS; p = min(1, t/0.9)
        fm = G.base(burst=True)
        c = fm.bctx; fade = max(0, 1 - p)
        for a, b, t0, t1, off in SH:
            mx = (a[0] + b[0])/2 - G.CX; my = (a[1] + b[1])/2 - G.CY; d = math.hypot(mx, my) + 1e-6; dx, dy = mx/d*off*p*3, my/d*off*p*3
            c.move_to(a[0] + (b[0] - a[0])*t0 + dx, a[1] + (b[1] - a[1])*t0 + dy); c.line_to(a[0] + (b[0] - a[0])*t1 + dx*1.1, a[1] + (b[1] - a[1])*t1 + dy*1.1)
        c.set_source_rgba(*rgb(lerpc(RED, C['glow'], min(1, t*4)), fade)); c.set_line_width(4); c.stroke(); fm.boundary_glow = fade
        rr = 120 + t*1500; ra = max(0, 1 - t/0.7)
        if ra > 0:
            g = fm.gctx
            for k in range(90):
                a = k/90*2*math.pi; g.arc(G.CX + rr*math.cos(a), G.CY + rr*math.sin(a), 4, 0, 2*math.pi); g.set_source_rgba(*rgb(C['glow'], ra)); g.fill()
        tl = last['t'] + t
        for k, ((x, y), v, r) in enumerate(zip(last['pos'], bvel, last['rad'])):
            c_, _ = ballcol(last, k, tl) if last['fl'][k] in (3, 4) else (S.PAL[last['col'][k]], 0)
            fm.ball(x + v[0]*t, y + v[1]*t, r, c_)
        fm.flash = max(0, 0.22*(1 - j/7))
        txt, sc = CNT[-1]; fm.counter = (f"{txt:,}", 1.0 + 0.12*max(0, 1 - j/9)); fm.counter_y = CY_COUNT
        im = fm.compose()
    return np.asarray(im).tobytes()

def audio(path):
    sr = 44100; T = N/FPS + 1.0; y = np.zeros(int(T*sr)); R = np.random.default_rng(3)
    def add(t, sig, g=1.0):
        s = int(t*sr); e = min(len(y), s + len(sig))
        if e > s: y[s:e] += sig[:e - s]*g
    def tone(f, d, dec, g=1.0, f2=None):
        tt = np.arange(int(d*sr))/sr; ph = 2*np.pi*(f*tt if f2 is None else (f*tt + (f2 - f)*tt*tt/(2*d)))
        return np.sin(ph)*np.exp(-tt*dec)*g
    def noise(d, dec, g=1.0, lp=0.3):
        n = R.standard_normal(int(d*sr)); out = np.zeros_like(n); acc = 0
        for k in range(len(n)): acc += lp*(n[k] - acc); out[k] = acc
        return out*np.exp(-np.arange(len(n))/sr*dec)*g
    def mix(*sg):
        n = max(len(x) for x in sg); o = np.zeros(n)
        for x in sg: o[:len(x)] += x
        return o
    crunch = noise(0.18, 30, 1.0, 0.35)
    _A = [(2, 523.3), (3, 587.3), (5, 659.3), (10, 784.0), (20, 1046.5)]
    MULF = lambda n: float(np.interp(math.log(max(2, n)), [math.log(a) for a, _ in _A], [b for _, b in _A]))
    GOOD = ('mul', 'big', 'split', 'plus', 'merge', 'myst', 'bomb', 'rain', 'turbo', 'magnet', 'grav')
    for e in ev:
        t = e[0]
        if burst_t is not None and t > burst_t: continue
        k_ = e[1]
        if k_ == 'tick': add(t, mix(tone(760, 0.05, 70, 0.22), tone(1520, 0.05, 110, 0.06)))
        elif k_ == 'land':
            if e[3] in GOOD:
                for q, fq in enumerate((523.3, 659.3, 784.0, 1046.5, 1318.5)): add(t + q*0.07, mix(tone(fq, 0.45, 7, 0.22), tone(fq*2, 0.3, 12, 0.07)))
                add(t + 0.36, mix(tone(1046.5, 0.9, 4, 0.2), tone(1568.0, 0.9, 5, 0.1)))
                for q in range(6): add(t + 0.05 + q*0.06, tone(2400 + 300*q, 0.05, 90, 0.05))
            elif e[3] in ('kill', 'div'):
                tt_ = np.arange(int(0.75*sr))/sr; f_ = 260 - 170*(tt_/0.75) + 12*np.sin(2*np.pi*7*tt_)
                ph_ = 2*np.pi*np.cumsum(f_)/sr; wah = (np.sign(np.sin(ph_))*0.5 + np.sin(ph_)*0.5)*np.exp(-tt_*2.2)*np.clip(tt_*60, 0, 1)*0.32*(1.0 if e[3] == 'kill' else 0.6)
                add(t, wah); add(t + 0.02, tone(90, 0.7, 3.5, 0.3, f2=45))
        elif k_ == 'wall':
            nh, spd = e[2], e[3]; g_ = min(0.16, 0.06 + 0.04*math.log10(1 + nh)); fq = 2300 + 900*R.uniform(-1, 1)
            add(t, mix(tone(fq, 0.022, 160, g_), tone(fq*1.52, 0.015, 220, g_*0.35)))
            if nh > 40: add(t + 0.011, tone(fq*0.83, 0.02, 170, g_*0.7))
        elif k_ == 'slam':
            add(t, mix(tone(86, 0.35, 11, 0.85), tone(172, 0.12, 30, 0.25)))
            if e[3] > 0: add(t, crunch, 0.35)
        elif k_ == 'spawn':
            Nn = e[4] if len(e) > 4 else S.EFFECT[e[2]][1]; f0 = MULF(Nn)
            for q in range(min(14, e[3])): add(t + 0.02 + q*0.018, tone(f0*(1 + 0.03*R.uniform(-1, 1)), 0.12, 35, 0.16))
            add(t + 0.02, mix(tone(f0, 0.5, 6, 0.18), tone(f0*1.5, 0.5, 7, 0.08)))
        elif k_ == 'kill': add(t, mix(tone(62, 0.6, 6, 0.7), tone(55, 0.6, 5, 0.3))); add(t, noise(0.35, 10, 0.25, 0.08))
        elif k_ == 'big': add(t, tone(300, 0.35, 6, 0.3, f2=600))
        elif k_ == 'small': add(t, tone(600, 0.35, 6, 0.3, f2=300))
        elif k_ == 'gone':
            for q in range(min(5, e[2])): add(t + q*0.03, tone(320, 0.09, 28, 0.1, f2=120))
        elif k_ == 'fxs':
            kk = e[2]
            if kk == 'div': add(t, tone(520, 0.3, 7, 0.22, f2=260))
            elif kk == 'merge': add(t, tone(660, 0.14, 18, 0.2, f2=990)); add(t + 0.1, tone(990, 0.1, 25, 0.1))
            elif kk == 'turbo': add(t, mix(tone(300, 0.45, 4, 0.22, f2=1100), noise(0.35, 8, 0.1, 0.5)))
            elif kk == 'magnet': add(t, mix(tone(140, 0.55, 3, 0.25, f2=260), tone(280, 0.55, 3, 0.1, f2=520)))
            elif kk == 'grav': add(t, tone(900, 0.5, 3, 0.25, f2=180))
            elif kk == 'rain':
                for q, fq in enumerate((1046.5, 1318.5, 1568.0, 2093.0)): add(t + q*0.05, tone(fq, 0.18, 14, 0.1))
            elif kk == 'bomb': add(t, mix(tone(110, 0.6, 5, 0.6, f2=45), noise(0.4, 9, 0.35, 0.15)))
        elif k_ == 'launch': add(t, mix(noise(0.35, 8, 0.3, 0.5), tone(200, 0.35, 6, 0.25, f2=700)))
    if burst_t is not None:
        add(burst_t, tone(90, 2.2, 1.6, 1.0, f2=32)); add(burst_t, noise(1.8, 3.0, 0.7, 0.25)); add(burst_t, tone(180, 0.6, 5, 0.3, f2=60))
    ne = int((N/FPS)*sr); y[ne - int(0.3*sr):ne] *= np.linspace(1, 0, int(0.3*sr)); y[ne:] = 0
    y = np.tanh(y*1.2); y = y/max(1e-6, np.abs(y).max())*0.92
    with wave.open(path, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes((y*32767).astype(np.int16).tobytes())

if __name__ == "__main__":
    name = sys.argv[1] if len(sys.argv) > 1 else "gc_test4.mp4"
    stills = os.environ.get('GC_STILLS')
    if stills:        # comma-separated frame times in seconds -> PNG stills (tests)
        from PIL import Image
        W, H = int(1080*SCALE), int(1920*SCALE)
        for s_ in stills.split(','):
            i = min(N - 1, int(float(s_)*FPS)); Image.frombytes('RGB', (W, H), render(i)).save(OUT + f"still_{name}_{s_}.png")
        print('stills', n_sim, burst_t); sys.exit()
    W, H = int(1080*SCALE), int(1920*SCALE)
    seg = os.environ.get('GC_SEG')
    if seg:           # resumable segment: video-only mp4 for frames a..b
        a, b_ = [int(x) for x in seg.split(',')]; b_ = min(b_, N)
        if a == 0: audio(OUT + f"{name}.wav")
        ff = subprocess.Popen(["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
                               "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", os.environ.get('GC_CRF', '22'), "-preset", "veryfast", "-g", "30", OUT + f"seg_{a:05d}.tmp.mp4"], stdin=subprocess.PIPE)
        with Pool(2) as pl:
            for bb in pl.imap(render, range(a, b_), chunksize=4): ff.stdin.write(bb)
        ff.stdin.close(); ff.wait(); os.rename(OUT + f"seg_{a:05d}.tmp.mp4", OUT + f"seg_{a:05d}.mp4"); print('seg', a, b_, N, flush=True); sys.exit()
    audio(OUT + f"{name}.wav")
    ff = subprocess.Popen(["ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-", "-i", OUT + f"{name}.wav",
                           "-c:v", "libx264", "-pix_fmt", "yuv420p", "-threads", "0", "-crf", os.environ.get('GC_CRF', '22'), "-preset", "veryfast", "-c:a", "aac", "-b:a", "160k", "-shortest", OUT + name], stdin=subprocess.PIPE)
    with Pool(2) as pl:
        for k, b in enumerate(pl.imap(render, range(N), chunksize=4)):
            ff.stdin.write(b)
            if k % 300 == 0: print(k, N, flush=True)
    ff.stdin.close(); ff.wait(); print("done", N, burst_t)
