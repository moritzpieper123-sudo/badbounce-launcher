"""Konzept 6 (Math damage battle) test video: Factorial or Fibonacci. Both balls hit on the SAME beat; the formulas alone decide the winner.
Usage: python k6_video.py <out.mp4> [scale=0.5]"""
import sys, math, subprocess, os
import numpy as np
from scipy.signal import lfilter
import bb_render as B, k6_bong as K
FPS, SR = 30, 48000
T_HIT, T0, N_MAX = 2.25, 1.0, 60
RADIUS = 22; CEIL = K.BTOP + 14 + RADIUS
def fib(n):
    a, b = 0, 1
    for _ in range(n): a, b = b, a + b
    return a
FORM = [lambda k: math.factorial(k), lambda k: fib(3*k)]          # team 0 = Factorial (red), team 1 = Fibonacci (blue)
def smooth(u): u = min(max(u, 0.0), 1.0); return u*u*(3 - 2*u)
def top_y(S):
    st = K.state(S)
    if not st: return K.FY
    slot = K.NBLK - 1 - st[0][0]; return K.BOT - (slot + 1)*(K.BH + K.BG) + K.BG
class Game:
    def _settle(self, k):
        """after the winning hit: the ball drops and bounces ever flatter until it lies still (gravity, restitution, friction)"""
        if not hasattr(self, 'settle_hits'): self.settle_hits = [[], []]
        tw = self.t_win; x, y = self._scripted(k, tw); x2, _ = self._scripted(k, tw - 0.02); vx = (x - x2)/0.02
        floor = self.tops[self.N][k] - RADIUS; vy = 0.0; dt = 1/240; lo, hi = 12 + RADIUS, K.BW - 12 - RADIUS; out = []; t = tw; rest = False
        while t < self.t_end + 1.0:
            if not rest:
                vy += 2600*dt; x += vx*dt; y += vy*dt; vx *= math.exp(-0.9*dt)
                if x < lo or x > hi:
                    x = min(max(x, lo), hi); vx = -vx*0.6
                    if abs(vx) > 25: self.settle_hits[k].append(t)
                if y >= floor:
                    y = floor
                    if abs(vy) < 90: vy = 0.0; rest = True; vx = 0.0
                    else: vy = -vy*0.52; vx *= 0.8
            out.append((x, y)); t += dt
        return out

    def __init__(self):
        self.S = [[0, 0]]; self.hits = []           # S[k] after hit k; hits: (t, team, n, damage)
        S = [0, 0]; self.dmg = [[0, 0]]; self.tops = [[top_y(0), top_y(0)]]; self.win = None; self.t_win = None; self.brk = []
        for n in range(1, N_MAX):
            t = T0 + (n - 1)*T_HIT; d = [FORM[0](n), FORM[1](n)]
            before = [K.state(S[0]), K.state(S[1])]
            for k in (0, 1): S[k] += d[k]
            self.S.append(list(S)); self.dmg.append(d); self.tops.append([top_y(S[0]), top_y(S[1])])
            for k in (0, 1):                         # blocks broken by this hit
                gone = {i for i, _ in before[k]} - {i for i, _ in K.state(S[k])}
                for i in gone: self.brk.append((t, k, i))
            done = [S[k] >= K.CUM[-1] for k in (0, 1)]
            if any(done):
                self.win = 0 if (done[0] and not done[1]) else 1 if (done[1] and not done[0]) else (0 if S[0] >= S[1] else 1); self.t_hit_last = t; self.t_win = t + 0.28; self.N = n; break
        self.t_end = self.t_win + 2.0; self.tok = []
        self.settle = [self._settle(k) for k in (0, 1)]
        lo, hi = 12 + RADIUS, K.BW - 12 - RADIUS; span = hi - lo
        for k in (0, 1):                                  # wall hits before the win (subtle tok)
            ph = 0.5 if k == 0 else 0.0; m = 1
            while True:
                tm = (m*span - ph*span*2)/210.0
                if tm >= self.t_win: break
                if tm > 0.05: self.tok.append(tm)
                m += 1
        for k in (0, 1): self.tok += [tm for tm in self.settle_hits[k]]
    def hit_index(self, t): return max(0, min(self.N, int((t - T0)//T_HIT) + 1)) if t >= T0 else 0
    def state_at(self, t):
        n = 0 if t < T0 else min(self.N, int((t - T0)/T_HIT + 1e-9) + 1)       # hits that already happened (hit n at T0+(n-1)T)
        return n
    def ball(self, k, t):
        if t >= self.t_win:
            i = min(int((t - self.t_win)*240), len(self.settle[k]) - 1); return self.settle[k][i]
        return self._scripted(k, t)
    def _scripted(self, k, t):
        phase = (0.5 if k == 0 else 0.0)
        if t >= self.t_hit_last:                                    # last block gone: ball falls onto the finish line
            lo, hi = 12 + RADIUS, K.BW - 12 - RADIUS; span = hi - lo; p = (phase*span*2 + 210.0*t) % (2*span); x = lo + (p if p < span else 2*span - p)
            y0 = self.tops[self.N - 1][k] - RADIUS; fl = self.tops[self.N][k] - RADIUS; g = 2600.0; dt_ = t - self.t_hit_last
            return x, min(fl, y0 + 0.5*g*dt_*dt_)
        lo, hi = K.BW*0.0 + 12 + RADIUS, K.BW - 12 - RADIUS; span = hi - lo; v = 210.0
        p = (phase*span*2 + v*t) % (2*span); x = lo + (p if p < span else 2*span - p)
        n = self.state_at(t)
        if t >= self.t_win: n = self.N; t = self.t_win - 1e-6
        t_n = T0 + (n - 1)*T_HIT if n >= 1 else 0.0
        y0 = (self.tops[n - 1][k] if n >= 1 else CEIL) - RADIUS if n >= 1 else CEIL
        if n >= 1 and n < self.N + 1:
            y0 = self.tops[n - 1][k] - RADIUS                     # position at the moment of hit n = old top
        t_next = T0 + n*T_HIT; y1 = self.tops[n][k] - RADIUS if n <= self.N else y0
        if n == 0: t_n = 0.0; t_next = T0; y0 = CEIL; u = t/T0; return x, y0 + (y1 - y0)*u*u
        u = (t - t_n)/(t_next - t_n); mid = (y0 + y1)/2; Hp = min(520.0, 0.88*(mid - CEIL)); y = y0 + (y1 - y0)*u - 4*Hp*u*(1 - u)
        return x, y
def warp(game):
    """playback speed over sim time (slow-mo around the winning hit)"""
    tw = game.t_win
    def s(t):                                         # only shortly before the last block is hit, resume shortly after it is gone
        if t < tw - 0.8: return 1.0
        if t < tw - 0.45: return 1 - 0.78*smooth((t - (tw - 0.8))/0.35)
        if t < tw + 0.25: return 0.22
        if t < tw + 0.6: return 0.22 + 0.78*smooth((t - (tw + 0.25))/0.35)
        return 1.0
    return s
def frame(game, t):
    n = game.state_at(t); S = game.S[n]; d = game.dmg[n]
    pos = [game.ball(k, t) for k in (0, 1)]
    markers = []; shards = []; blink = [0, 0]; grey = [0, 0]
    loser = 1 - game.win; ta = t - game.t_win
    if ta > 0.3: grey[loser] = smooth((ta - 0.3)/0.8)
    for m in range(max(1, n - 1), n + 1):
        tm = T0 + (m - 1)*T_HIT; age = t - tm
        if m >= 1 and 0 <= age < 1.1:
            for k in (0, 1):
                bx = K.BX[k] + pos[k][0] if False else K.BX[k] + K.BW/2
                markers.append((K.BX[k] + K.BW/2, top_y(game.S[m - 1][k]) - 70 - 50*smooth(age/1.1), "-" + K.fmt(game.dmg[m][k]), K.gm((K.RED, K.BLUE)[k], grey[k]), 0.62*(1 - age/1.1)*(1 - 0.45*grey[k])))
    for (tb, k, i) in game.brk:
        age = t - tb
        if 0 <= age < 0.55:
            slot = K.NBLK - 1 - i; y = K.BOT - (slot + 1)*(K.BH + K.BG) + K.BG + K.BH/2; col = K.hcol(K.HEALTH[i])
            for j in range(16):
                a = j*2.4 + i; vx = math.cos(a)*(120 + 14*j); vy = math.sin(a)*(90 + 9*j) - 60
                shards.append((K.BX[k] + K.BW/2 + (j - 8)*22 + vx*age, y + vy*age + 400*age*age, 8, col, 0.9*(1 - age/0.55)))
    if ta > 0.6: blink[game.win] = 0.5 + 0.5*math.sin((ta - 0.6)*2*math.pi*1.6) if ta < 2.4 else 0.0
    return K.draw(None, d if n else (0, 0), S, d, pos, markers=markers, shards=shards, grey=grey, blink=blink, ball_a=(1, 1) if n else (1, 1))
# ---------------- audio ----------------
def tt(d): return np.arange(int(SR*d))/SR
def env(d, a, dec): x = tt(d); return np.minimum(x/a, 1)*np.exp(-x/dec)
def lp(x, c): a = math.exp(-2*math.pi*c/SR); return lfilter([1 - a], [1, -a], x)
def build_audio(T, ev):
    rng = np.random.default_rng(5); mix = np.zeros(int(SR*T))
    def put(x, s, g):
        i = int(s*SR)
        if i < 0 or i >= len(mix): return
        x = x[:len(mix) - i]; mix[i:i + len(x)] += x*g
    for kind, tv, a in ev:
        if kind == 'hit' or kind == 'tok':                    # K10 tick (gc_video3 'wall'): 2300 Hz +-900, 1.52x partial, tiny and dry
            g_ = 0.30 if kind == 'hit' else 0.075; fq = 2300 + 900*rng.uniform(-1, 1); d = 0.03; x = tt(d)
            put(np.sin(2*np.pi*fq*x)*np.exp(-x*160) + 0.35*np.sin(2*np.pi*fq*1.52*x)*np.exp(-x*220), tv, g_)
        elif kind == 'sparkle':                               # K10 coin sparkle at the finish-line touch
            for q in range(6): d = 0.05; x = tt(d); put(np.sin(2*np.pi*(2400 + 300*q)*x)*np.exp(-x*90), tv + 0.05 + q*0.06, 0.12)
        elif kind == 'break':                                 # quick short deep boom
            d = 0.7; x = tt(d); f = 62 + 50*np.exp(-x*28); put(np.sin(2*np.pi*np.cumsum(f)/SR)*env(d, 0.002, 0.09) + 0.2*lp(rng.standard_normal(len(x)), 900)*env(d, 0.001, 0.02), tv, 0.55)
        elif kind == 'win':                                   # deep boom that sinks
            d = 3.4; x = tt(d); f = 52 + 90*np.exp(-x*6); put(np.sin(2*np.pi*np.cumsum(f)/SR)*env(d, 0.003, 0.6) + 0.25*lp(rng.standard_normal(len(x)), 700)*env(d, 0.001, 0.12), tv, 0.95)
    mix = np.tanh(mix*1.4)/np.tanh(1.4); return (mix/np.max(np.abs(mix))*0.9).astype(np.float32)
def render(out, S=0.5):
    game = Game(); B.set_scale(S); sp = warp(game)
    ff = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{int(1080*S)}x{int(1920*S)}', '-r', str(FPS), '-i', '-',
                           '-an', '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p', out + '.silent.mp4'], stdin=subprocess.PIPE)
    ts, fi, ts_of = 0.0, 0, []
    while ts < game.t_end:
        im = frame(game, ts); ff.stdin.write(np.asarray(im).tobytes()); ts_of.append(ts); fi += 1; ts += sp(ts)/FPS
        if fi % 60 == 0: print(f"video {fi/FPS:.1f}s  sim {ts:.1f}s", flush=True)
    ff.stdin.close(); ff.wait(); T = fi/FPS; ts_arr = np.array(ts_of); tv_arr = np.arange(fi)/FPS
    to_v = lambda t: float(np.interp(t, ts_arr, tv_arr))
    ev = []
    for n in range(1, game.N + 1):
        tm = T0 + (n - 1)*T_HIT
        for k in (0, 1): ev.append(('hit', to_v(tm) + 0.0, n))
    for (tb, k, i) in game.brk: ev.append(('break', to_v(tb), i))
    ev.append(('win', to_v(game.t_win), 0))
    for tk in game.tok:
        if tk < game.t_end: ev.append(('tok', to_v(tk), 0))
    audio = build_audio(T + 0.5, ev)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-', '-i', out + '.silent.mp4', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', out],
                   input=audio.tobytes(), check=True)
    os.remove(out + '.silent.mp4')
    print(f"done {T:.1f}s video, winner {'Factorial' if game.win == 0 else 'Fibonacci'} at hit {game.N} (sim {game.t_win:.1f}s)")
if __name__ == '__main__':
    render(sys.argv[1], float(sys.argv[2]) if len(sys.argv) > 2 else 0.5)

def audio_only(out, src):
    game = Game(); sp = warp(game); ts = 0.0; ts_of = []
    while ts < game.t_end: ts_of.append(ts); ts += sp(ts)/FPS
    fi = len(ts_of); T = fi/FPS; ts_arr = np.array(ts_of); tv_arr = np.arange(fi)/FPS
    to_v = lambda t: float(np.interp(t, ts_arr, tv_arr)); ev = []
    for n in range(1, game.N + 1):
        tm = T0 + (n - 1)*T_HIT
        for k in (0, 1): ev.append(('hit', to_v(tm), n))
    for (tb, k, i) in game.brk: ev.append(('break', to_v(tb), i))
    ev.append(('win', to_v(game.t_win), 0))
    for tk in game.tok:
        if tk < game.t_end: ev.append(('tok', to_v(tk), 0))
    audio = build_audio(T + 0.5, ev)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '1', '-i', '-', '-i', src, '-map', '1:v', '-map', '0:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', out], input=audio.tobytes(), check=True)
    print("audio done", T)
