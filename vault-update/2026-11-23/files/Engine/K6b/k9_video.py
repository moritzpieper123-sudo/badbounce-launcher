"""Konzept 6b (Boss fight) video: Fibonacci hits a 1 billion boss ball, 43 hits, one hit every 1.2 s, big explosion at the end.
The boss moves around the box, the hitter ball bounces off one wall between two hits. Slow-mo shortly around the winning hit.
Sound as Konzept 6: same tone per hit (slightly rising), very subtle tok on wall hits, deep boom at the end. Title counts down every 3 s.
Usage: python k9_video.py <out.mp4> [scale]"""
import sys, os, math, random, subprocess
import numpy as np
from scipy.signal import lfilter
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image, ImageDraw, ImageFont
import k9_frames as K
import bb_render as B

FPS, SR = 30, 48000
N = int(os.environ.get('K6B_N', 50))
BX, BY, BW, BH = K.BX, K.BY, K.BW, K.BH
RB, RH = K.R_BOSS, K.R_HIT

def smooth(u): u = min(max(u, 0.0), 1.0); return u*u*(3 - 2*u)
def fold(v, lo, hi):
    span = hi - lo; m = (v - lo) % (2*span); return lo + (m if m <= span else 2*span - m)

SPEED = 640.0                    # px/s, the hitter ball never speeds up or slows down

class Game:
    def __init__(self, seed=11):
        self.rng = random.Random(seed)
        M = RB + 2*RH + 22
        self.xr = (BX + M, BX + BW - M); self.yr = (BY + M, BY + BH - M)
        self.t_hit = []            # time of every hit (follows from the path length at constant speed)
        self.key = []              # hitter key points: (t, x, y)
        self.contact = []          # contact point of every hit
        self.tok = []              # wall bounce times
        self._route()
        self.t_win = self.t_hit[-1]; self.t_x = self.t_win + 0.08; self.t_end = self.t_x + 2.2
    def boss(self, t):
        return (fold(540 + 85*t, *self.xr), fold(770 + 62*t, *self.yr))
    def _route(self):
        rng = self.rng; xmin, xmax = BX + RH + 3, BX + BW - RH - 3; ymin, ymax = BY + RH + 3, BY + BH - RH - 3
        prev = (BX + 110, BY + BH - 110); ta = 0.0; self.key.append((0.0, *prev))
        for k in range(N):
            best = None
            for lvl in range(5):
                if best is not None: break
                cmin, thr, dlo, dhi = ((0.45, RB + RH - 4, 620, 920), (0.2, RB + RH - 10, 560, 1000), (0.0, RB + RH - 16, 500, 1100), (-0.3, RB + RH - 22, 420, 1300), (-1.0, RB + RH - 30, 300, 1600))[lvl]
                for _ in range(700):
                    s = rng.choice('LRTB')
                    W = (xmin if s == 'L' else xmax if s == 'R' else rng.uniform(xmin, xmax), ymin if s == 'T' else ymax if s == 'B' else rng.uniform(ymin, ymax))
                    tb = ta + 760/SPEED
                    for _it in range(5):                                   # contact point depends on the boss position at the hit time, the hit time on the path length
                        bpos = self.boss(tb); dx, dy = W[0] - bpos[0], W[1] - bpos[1]; L = math.hypot(dx, dy)
                        C = (bpos[0] + dx/L*(RB + RH), bpos[1] + dy/L*(RB + RH))
                        d1 = math.hypot(W[0] - prev[0], W[1] - prev[1]); d2 = math.hypot(C[0] - W[0], C[1] - W[1]); tn = ta + (d1 + d2)/SPEED
                        if abs(tn - tb) < 0.002: break
                        tb = tn
                    D = d1 + d2
                    if not (xmin <= C[0] <= xmax and ymin <= C[1] <= ymax) or not dlo <= D <= dhi: continue
                    bpa = self.boss(ta); nx, ny = prev[0] - bpa[0], prev[1] - bpa[1]; nl = math.hypot(nx, ny) or 1
                    lx, ly = W[0] - prev[0], W[1] - prev[1]; ll = math.hypot(lx, ly) or 1
                    if (lx*nx + ly*ny)/(ll*nl) < cmin and ta > 0: continue          # leave the boss outwards (bounce off it)
                    T = tb - ta; tw = ta + d1/SPEED; ok = True
                    for i in range(1, 40):
                        t = ta + T*i/40
                        if t < tw: u = (t - ta)/(tw - ta); p = (prev[0] + (W[0] - prev[0])*u, prev[1] + (W[1] - prev[1])*u)
                        else: u = (t - tw)/(tb - tw); p = (W[0] + (C[0] - W[0])*u, W[1] + (C[1] - W[1])*u)
                        bp = self.boss(t)
                        if math.hypot(p[0] - bp[0], p[1] - bp[1]) < thr and 0.08*T < t - ta and tb - t > 0.08*T: ok = False; break
                    if not ok: continue
                    score = abs(D - 770) + rng.uniform(0, 90)
                    if best is None or score < best[0]: best = (score, W, C, tw, tb)
            if best is None: raise RuntimeError(f'no wall route for hit {k + 1}')
            _, W, C, tw, tb = best
            self.tok.append(tw); self.t_hit.append(tb); self.key += [(tw, *W), (tb, *C)]; self.contact.append(C); prev = C; ta = tb
    def hitter(self, t):
        ks = self.key
        if t >= ks[-1][0]: return ks[-1][1], ks[-1][2]
        for i in range(len(ks) - 1):
            if ks[i][0] <= t <= ks[i + 1][0]:
                u = (t - ks[i][0])/max(ks[i + 1][0] - ks[i][0], 1e-6); return ks[i][1] + (ks[i + 1][1] - ks[i][1])*u, ks[i][2] + (ks[i + 1][2] - ks[i][2])*u
        return ks[0][1], ks[0][2]

def warp(game):
    tw = game.t_win                                            # constant speed until shortly before the last hit, slow motion around it, then back to normal
    def s(t):
        if t < tw - 0.8: return 1.0
        if t < tw - 0.45: return 1 - 0.78*smooth((t - (tw - 0.8))/0.35)
        if t < tw + 0.25: return 0.22
        if t < tw + 0.6: return 0.22 + 0.78*smooth((t - (tw + 0.25))/0.35)
        return 1.0
    return s

def frame(game, t):
    f = B.Frame(cx=540, cy=830, floor_y=1215, seed=9); gl = f.gctx
    def boxp(c): B.rounded_rect(c, BX, BY, BW, BH, 10)
    f.boundary(boxp, B.C['glow'], 0.0, 3.5)
    import bisect
    nhit = bisect.bisect_right(game.t_hit, t)
    tk = game.t_hit[nhit - 1] if nhit else -9; dt = t - tk
    bx, by = game.boss(t)
    if nhit:
        sh = 7*math.exp(-dt/0.09); bx += math.sin(dt*90)*sh; by += math.cos(dt*77)*sh*0.7
        rem = K.BOSS_HP - K.total(nhit - 1) - K.fib(nhit)*smooth(dt/0.15)
    else: rem = K.BOSS_HP
    rem = max(rem, 0)
    alive = t < game.t_x
    if alive: K.draw_boss(f, bx, by, rem, t)
    hx, hy = game.hitter(t); f.ball(hx, hy, RH, B.C['glow'])
    if nhit and dt < 0.30:                                    # OPT #9 hit burst: bright ring + 16 rays + flying dots, lasts 0.3 s
        cx_, cy_ = game.contact[nhit - 1]; u_ = dt/0.30; a_ = 1 - u_; r = 10 + 46*math.sqrt(u_)
        gl.arc(cx_, cy_, r*0.8, 0, 2*math.pi); gl.set_source_rgba(*B.rgb((255, 250, 225), .85*a_)); gl.set_line_width(4); gl.stroke()
        for k in range(16):
            a = k*2*math.pi/16 + 0.2; r0 = r*0.35; r1 = r*(1.0 if k % 2 == 0 else 0.7)
            gl.move_to(cx_ + math.cos(a)*r0, cy_ + math.sin(a)*r0); gl.line_to(cx_ + math.cos(a)*r1, cy_ + math.sin(a)*r1)
            gl.set_source_rgba(*B.rgb(B.C['yellow'] if k % 2 == 0 else (255, 255, 255), a_)); gl.set_line_width(4); gl.stroke()
        rn = random.Random(nhit)
        for k in range(14):
            a = rn.uniform(0, 2*math.pi); d_ = rn.uniform(30, 95)*math.sqrt(u_); sz = rn.uniform(3, 6)*(1 - 0.5*u_)
            gl.arc(cx_ + math.cos(a)*d_, cy_ + math.sin(a)*d_, sz, 0, 2*math.pi); gl.set_source_rgba(*B.rgb((255, 236, 150), a_)); gl.fill()
    if t >= game.t_x:                                         # big explosion: flash, ring, shards
        de = t - game.t_x; ex, ey = game.boss(game.t_x)
        f.flash = max(0.0, 0.6*(1 - de/0.35))
        rr = RB + 650*math.sqrt(de); gl.arc(ex, ey, rr, 0, 2*math.pi); gl.set_source_rgba(*B.rgb(B.C['glow'], max(0, .55*(1 - de/0.9)))); gl.set_line_width(7); gl.stroke()
        gl.arc(ex, ey, RB*(1 + 1.6*de), 0, 2*math.pi); gl.set_source_rgba(*B.rgb(B.C['yellow'], max(0, .5*(1 - de/0.5)))); gl.fill()
        rnd = random.Random(3)
        for k in range(46):
            a = rnd.uniform(0, 2*math.pi); v = rnd.uniform(250, 950); sz = rnd.uniform(7, 20); d_ = v*(1 - math.exp(-3*de))/3
            col = rnd.choice([B.C['glow'], B.C['frost'], B.C['yellow'], B.C['glow']]); al = max(0, 1 - de/1.8)
            px, py = ex + math.cos(a)*d_, ey + math.sin(a)*d_
            gl.save(); gl.translate(px, py); gl.rotate(a + de*rnd.uniform(-4, 4)); gl.rectangle(-sz/2, -sz/2, sz, sz); gl.set_source_rgba(*B.rgb(col, al)); gl.fill(); gl.restore()
    im = f.compose().convert('RGB')
    if alive: K.draw_num(im, bx, by, rem)
    K.text(im, 540, 262, K.fmt_dmg(K.fib(nhit)) if nhit else "0", 78, B.C['glow'], True)
    if nhit and dt < 1.0 and alive:                           # OPT #9: red damage number: spawn spot chosen ONCE per hit (no jumping), never on the boss; then only rises + fades
        if not hasattr(game, 'dmgpos'): game.dmgpos = {}
        if nhit not in game.dmgpos:
            cx_, cy_ = game.contact[nhit - 1]; tx_ = "-" + K.fmt_dmg(K.fib(nhit)); d_ = ImageDraw.Draw(im); w_ = d_.textlength(tx_, font=ImageFont.truetype(B.FONT, int(46*B.SC)))/B.SC + 14; h_ = 60
            t0 = game.t_hit[nhit - 1]; bps = [game.boss(t0 + q) for q in (0, 0.5, 1.0)]; hp0 = game.hitter(t0); b0 = bps[0]
            ang0 = math.atan2(cy_ - b0[1], cx_ - b0[0]); pos = None
            for off in (0, 25, -25, 50, -50, 80, -80, 110, -110, 140, -140, 180):
                ang = ang0 + math.radians(off)
                for rad in (RB + 30 + h_/2, RB + 30 + w_/2, RB + 30 + w_/2 + 50):
                    px, py = b0[0] + math.cos(ang)*rad, b0[1] + math.sin(ang)*rad
                    if px - w_/2 < BX + 8 or px + w_/2 > BX + BW - 8 or py - h_/2 < BY + 40 or py + h_/2 > BY + BH - 8: continue
                    ok = True
                    for (qx, qy) in bps:                                # clear of the boss now and during the next second
                        nx, ny = min(max(qx, px - w_/2), px + w_/2), min(max(qy, py - h_/2), py + h_/2)
                        if math.hypot(nx - qx, ny - qy) < RB*1.18 + 6: ok = False
                    if math.hypot(min(max(hp0[0], px - w_/2), px + w_/2) - hp0[0], min(max(hp0[1], py - h_/2), py + h_/2) - hp0[1]) < RH + 8: ok = False
                    if ok: pos = (px, py); break
                if pos: break
            game.dmgpos[nhit] = pos or (b0[0], b0[1] + RB + 30 + h_/2)
        pos = game.dmgpos[nhit]; tx_ = "-" + K.fmt_dmg(K.fib(nhit))
        def back(u, s=1.9): u = min(max(u, 0.0), 1.0) - 1; return 1 + (s + 1)*u**3 + s*u**2          # ease-out-back: small overshoot, settles
        def eio(u): u = min(max(u, 0.0), 1.0); return u*u*u*(u*(6*u - 15) + 10)                         # smootherstep
        T_POP, T_FADE0 = 0.26, 0.40
        pop = 0.5 + 0.5*back(dt/T_POP)                                       # grows 0.5 -> ~1.08 -> 1.0
        rise = 1 - (1 - min(dt/1.0, 1.0))**2.2                               # continuous ease-out rise (sub-pixel)
        fi = eio(dt/0.10); fo = 1 - eio((dt - T_FADE0 - 0.1)/(1.0 - T_FADE0 - 0.1))     # fade-in 0.1 s, fade-out at the end
        shrink = 1 - 0.68*eio((dt - T_FADE0)/(1.0 - T_FADE0))                # shrinks to ~1/3 while it vanishes
        paste_num(im, tx_, pos[0]*B.SC, (pos[1] + 10 - 46*rise)*B.SC, pop*shrink, fi*fo)
    K.title(im)
    K.timer(im, max(K.LIMIT - min(t, game.t_win), 0.0))
    return im

_NUMSPR = {}
def paste_num(im, tx, cx, cy, scale, alpha):
    """damage number as a 4x sprite, drawn with a sub-pixel affine transform (smooth scale + motion, no font-size stepping)"""
    if alpha <= 0.003 or scale <= 0.01: return
    if tx not in _NUMSPR:
        old = B.SC; B.SC = 4.0
        spr = Image.new('RGBA', (1000, 420), (0, 0, 0, 0)); K.text(spr, 125, 52.5, tx, 46, (255, 78, 98), True, 1.0); B.SC = old; _NUMSPR[tx] = spr
    spr = _NUMSPR[tx]; f = scale*B.SC/4.0; Wc, Hc = int(1000*f) + 6, int(420*f) + 6
    ix, iy = int(math.floor(cx - Wc/2)), int(math.floor(cy - Hc/2)); lx, ly = cx - ix, cy - iy      # centre inside the patch (float)
    patch = spr.transform((Wc, Hc), Image.AFFINE, (1/f, 0, 500 - lx/f, 0, 1/f, 210 - ly/f), resample=Image.BICUBIC)
    if alpha < 0.999: patch.putalpha(patch.split()[3].point(lambda p: int(p*alpha)))
    im.alpha_composite(patch, (0, 0)) if False else im.paste(patch, (ix, iy), patch)

def tt(d): return np.arange(int(SR*d))/SR
def env(d, a, dec): x = tt(d); return np.minimum(x/a, 1)*np.exp(-x/dec)
def lp(x, c): a = math.exp(-2*math.pi*c/SR); return lfilter([1 - a], [1, -a], x)
def fade(x, frac=0.35):
    n = len(x); k = max(int(n*frac), 8); x = x.copy(); x[-k:] *= 0.5*(1 + np.cos(np.linspace(0, np.pi, k))); return x
def reverb(x, dur=0.35, mix=0.16, dark=4500):
    rng = np.random.default_rng(2); ir = rng.standard_normal(int(SR*dur))*np.exp(-tt(dur)/(dur/5)); ir = lp(ir, dark); ir /= np.abs(ir).sum()**.5*6
    n = len(x) + len(ir); w = np.fft.irfft(np.fft.rfft(x, n)*np.fft.rfft(ir, n), n); w = w/np.max(np.abs(w))*np.max(np.abs(x))*.7
    y = np.pad(x, (0, len(ir)))*(1 - mix) + w*mix; return y
def hit_sound(a):
    """OPT #9 hit = Soft punch (Mo's pick 2026-11-22): deep thud with a quick pitch drop + muffled noise puff. Pitch rises slightly per hit."""
    f = 85 + 2*a; x = tt(.35)
    return fade(np.sin(2*np.pi*(f + 90*np.exp(-x*35))*x)*env(.35, .001, .09) + .5*lp(np.random.default_rng(int(a)).standard_normal(len(x)), 900)*env(.35, .0005, .02), .4)
def wall_tick(rng, nh=1):
    """K10 wall tick (standard from Konzept 10): tiny bright tick, 2300 Hz +- 900, fast decay"""
    g_ = min(0.16, 0.06 + 0.04*np.log10(1 + nh)); fq = 2300 + 900*rng.uniform(-1, 1)
    def tone(fr, dd, dec, g): xx = tt(dd); return np.sin(2*np.pi*fr*xx)*np.exp(-xx*dec)*g
    x1, x2 = tone(fq, 0.022, 160, g_), tone(fq*1.52, 0.015, 220, g_*0.35); o = np.zeros(len(x1)); o += x1; o[:len(x2)] += x2; return o
def build_audio(T, ev):
    rng = np.random.default_rng(5); mix = np.zeros(int(SR*T))
    def put(x, s, g):
        i = int(s*SR)
        if i < 0 or i >= len(mix): return
        x = x[:len(mix) - i]; mix[i:i + len(x)] += x*g
    for kind, tv, a in ev:
        if kind == 'hit': put(hit_sound(a), tv, 0.42)
        elif kind == 'tok': put(wall_tick(rng), tv, 1.0)          # K10 wall tick on every wall bounce
        elif kind == 'win':                                   # deep boom that sinks and rings out
            d = 2.8; x = tt(d); f = 50 + 95*np.exp(-x*6)
            put(fade(np.sin(2*np.pi*np.cumsum(f)/SR)*env(d, 0.003, 0.75) + 0.3*lp(rng.standard_normal(len(x)), 800)*env(d, 0.001, 0.15), 0.5), tv, 0.95)
    mix = np.tanh(mix*1.15)/np.tanh(1.15); mix = mix/np.max(np.abs(mix))*0.9
    k = int(SR*0.35); mix[-k:] *= 0.5*(1 + np.cos(np.linspace(0, np.pi, k)))              # clean fade-out at the very end
    return mix.astype(np.float32)

G = None; SC_ = 0.5
def worker(t): return np.asarray(frame(G, t)).tobytes()

def render(out, S=0.5):
    global G, SC_
    G = Game(int(os.environ.get('SEED','11'))); SC_ = S; B.set_scale(S); sp = lambda t: 1.0   # never slow motion (Mo 2026-11-23)
    ts, ts_list = 0.0, []
    while ts < G.t_end: ts_list.append(ts); ts += sp(ts)/FPS
    print(f"{len(ts_list)} frames, video {len(ts_list)/FPS:.1f} s, sim {G.t_end:.1f} s, win at sim {G.t_win:.1f} s", flush=True)
    ff = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{int(1080*S)}x{int(1920*S)}', '-r', str(FPS), '-i', '-',
                           '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '22', '-pix_fmt', 'yuv420p', out + '.silent.mp4'], stdin=subprocess.PIPE)
    from multiprocessing import Pool
    with Pool(2) as pool:
        for i, b in enumerate(pool.imap(worker, ts_list, chunksize=4)):
            ff.stdin.write(b)
            if i % 150 == 0: print('frame', i, '/', len(ts_list), flush=True)
    ff.stdin.close(); ff.wait()
    fi = len(ts_list); T = fi/FPS; ts_arr = np.array(ts_list); tv_arr = np.arange(fi)/FPS
    to_v = lambda t: float(np.interp(t, ts_arr, tv_arr))
    ev = [('hit', to_v(G.t_hit[k]), k + 1) for k in range(N)] + [('tok', to_v(t), 0) for t in G.tok if t < G.t_end] + [('win', to_v(G.t_x), 0)]
    audio = build_audio(T + 0.1, ev)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-', '-i', out + '.silent.mp4', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', out],
                   input=audio.tobytes(), check=True)
    os.remove(out + '.silent.mp4'); print(f"done {T:.1f} s")

if __name__ == '__main__':
    import boss_library as L; L.use(int(os.environ.get('BOSS', '2')) - 1)
    if sys.argv[1] == 'still':
        B.set_scale(1.0); G = Game(int(os.environ.get('SEED','11'))); frame(G, float(sys.argv[3])).save(sys.argv[2])
    else: render(sys.argv[1], float(sys.argv[2]) if len(sys.argv) > 2 else 0.5)
