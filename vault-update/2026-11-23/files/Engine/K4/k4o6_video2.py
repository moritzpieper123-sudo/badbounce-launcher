"""K4 Opt #6 test video 2: corridor passes. White rings flow inward while the ball passes a corridor of lined-up gaps (music OPEN);
between passes the ball bounces in the cell against the solid wall (music MUFFLED, low-pass ~450 Hz).
Usage: python k4o6_video2.py <seed> <out.mp4> [scale=0.75] [song.mp3] [song_start_s]"""
import sys, math, random, subprocess, os
import numpy as np, cv2
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from scipy.signal import sosfilt, butter, lfilter

W, H = 1080, 1920
CX, CY, SP, K0 = 540, 900, 6.0, 41
CELL = K0*SP; RB = 9.0
N_TOT = 430                 # rings to pass (counter = rings left x6)
FPS = 30; SR = 48000
T_TARGET = 61.0
TFORM = 1.4                 # seconds the gaps need to line up before a pass
LIMIT = float(os.environ.get('K4O6_LIMIT', '0'))
FONT = "/usr/share/fonts/opentype/inter/Inter-Black.otf"
YEL = (255, 198, 58); TXT = (243, 239, 230)

def smooth(u): u = min(max(u, 0.0), 1.0); return u*u*(3 - 2*u)
def wrapa(a): return (a + np.pi) % (2*np.pi) - np.pi

# ------------------------------------------------------------ schedule: streaks (corridor passes) and waits
def rate_at(t): return 8.0 + 6.0*min(t/T_TARGET, 1.0)            # rings per second while passing

def make_schedule(seed, wscale):
    rng = random.Random(seed*13 + 5); streaks = []; a = 0; s = 0; t = 0.0; th = rng.uniform(-math.pi, math.pi)
    # first wait short so there is action in frame 1
    wait = 1.0
    while a < N_TOT:
        tt = min(t/T_TARGET, 1.0)
        L = int(round(rng.uniform(8, 14)*(1 + 2.1*tt)))
        L = min(L, N_TOT - a)
        t_start = t + wait
        # integrate rings/s -> duration
        c = 0.0; tp = t_start; dt = 0.002
        while c < L:
            # ramp in/out of the rate over 0.15 s
            r = rate_at(tp)*smooth((tp - t_start)/0.15 + 0.15)
            c += r*dt; tp += dt
        streaks.append(dict(a=a, b=a + L, t0=t_start, t1=tp, th=th))
        a += L; s += 1; t = tp
        th += rng.uniform(-0.8, 0.8)
        tt = min(t/T_TARGET, 1.0)
        wait = max(0.4, rng.uniform(1.2, 2.8)*(1 - 0.72*tt))*wscale
    return streaks

def tune(seed):
    lo, hi = 0.3, 2.5
    for _ in range(16):
        mid = (lo + hi)/2
        if make_schedule(seed, mid)[-1]['t1'] > T_TARGET: hi = mid
        else: lo = mid
    ws = (lo + hi)/2; return ws, make_schedule(seed, ws)

def consumed_table(streaks, dt=0.001, T=140):
    n = int(T/dt); c = np.zeros(n); cur = 0.0; si = 0
    for i in range(n):
        t = i*dt
        while si < len(streaks) and t >= streaks[si]['t1']: si += 1
        if si < len(streaks) and streaks[si]['t0'] <= t < streaks[si]['t1']:
            S = streaks[si]; cur = min(cur + rate_at(t)*smooth((t - S['t0'])/0.15 + 0.15)*dt, S['b'])
        c[i] = cur
    return c

# ------------------------------------------------------------ renderer
class Renderer:
    def __init__(self, S, streaks, seed):
        self.S = S; self.PW, self.PH = int(W*S), int(H*S); self.streaks = streaks
        yy, xx = np.mgrid[0:self.PH, 0:self.PW].astype(np.float32)/S
        dx, dy = xx - CX, yy - CY
        self.R = np.sqrt(dx*dx + dy*dy).astype(np.float32); self.TH = np.arctan2(dy, dx).astype(np.float32)
        self.vig = np.clip(1 - 0.35*(((xx - 540)/760)**2 + ((yy - 960)/1100)**2), 0.5, 1)[..., None].astype(np.float32)
        self.void = np.array([4, 5, 10], np.float32)/255
        self.NJ = N_TOT + 260
        rng = np.random.default_rng(seed + 40)
        self.noise_w = rng.normal(0, math.radians(4.5), self.NJ); self.noise_c = rng.normal(0, math.radians(2.0), self.NJ)
        self.hook = self.make_hook(); self.wm = self.make_wm()
    def font(self, size): return ImageFont.truetype(FONT, max(8, int(size*self.S)))
    def make_hook(self):
        S = self.S; im = Image.new('RGBA', (self.PW, self.PH), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
        f = self.font(100); parts = [("CAN IT ", TXT), ("ESCAPE?", YEL)]
        x = (self.PW - sum(d.textlength(t, font=f) for t, _ in parts))/2; y = 170*S
        sh = Image.new('RGBA', im.size, (0, 0, 0, 0)); sd = ImageDraw.Draw(sh); xx = x
        for t, c in parts: sd.text((xx, y + 7*S), t, font=f, fill=(0, 0, 0, 220)); xx += d.textlength(t, font=f)
        im = Image.alpha_composite(im, sh.filter(ImageFilter.GaussianBlur(13*S)))
        gl = Image.new('RGBA', im.size, (0, 0, 0, 0)); gd = ImageDraw.Draw(gl); xx = x
        for t, c in parts:
            if c == YEL: gd.text((xx, y), t, font=f, fill=c + (160,))
            xx += d.textlength(t, font=f)
        im = Image.alpha_composite(im, gl.filter(ImageFilter.GaussianBlur(15*S)))
        d = ImageDraw.Draw(im); xx = x
        for t, c in parts: d.text((xx, y), t, font=f, fill=c + (255,)); xx += d.textlength(t, font=f)
        return im
    def make_wm(self):
        im = Image.new('RGBA', (self.PW, self.PH), (0, 0, 0, 0)); d = ImageDraw.Draw(im); f = self.font(22); S = self.S
        t = "BADBOUNCE"; sp = 4.2*S; ws = [d.textlength(ch, font=f) for ch in t]; tot = sum(ws) + sp*(len(t) - 1); x = (self.PW - tot)/2
        for ch, w in zip(t, ws): d.text((x, 1792*S), ch, font=f, fill=(170, 195, 240, 255), anchor='ls'); x += w + sp
        return im
    def gap_arrays(self, t, c):
        """gap centre (rad) and width (rad) for every ring index j at time t, consumed rings c"""
        phi = np.zeros(self.NJ); w = np.zeros(self.NJ); J = np.arange(self.NJ)
        for st in self.streaks:
            a, b = st['a'], st['b']
            if b <= c - 1: continue
            al = 1.0
            jj = np.arange(a, b); i = jj - a
            ph_m = st['th'] + i*0.115; w_m = np.full(len(jj), 0.38)
            d = np.maximum(jj - c, 0)
            wdeg = 30 + 80*np.minimum(d/45.0, 1.0)**0.8
            w_a = np.radians(np.maximum(wdeg, 14)) + self.noise_w[jj]; w_a = np.maximum(w_a, 0.25)
            ph_a = st['th'] + np.radians(0.25)*i + self.noise_c[jj]
            vis = 1.0
            phi[a:b] = ph_m + al*(ph_a - ph_m); w[a:b] = (w_m + al*(w_a - w_m))*vis
        return phi, w
    def render(self, t, c, st_info, parts, flashes, ball, trail, flash, hook_a, cnt, cscale, rim_a):
        S = self.S
        reff = self.R + c*SP
        jf = reff/SP; j = np.clip(np.floor(jf).astype(np.int32) - K0, 0, self.NJ - 1); frac = jf - np.floor(jf)
        line = np.exp(-(((frac - 0.5)*SP)/1.15)**2)
        wave = 0.62 + 0.28*np.sin(reff/38.0 - 0.3*t) + 0.10*np.sin(reff/11.0 + 1.3)
        tcol = np.clip(self.R/1100, 0, 1)[..., None]
        col = (np.array([236, 242, 255], np.float32)/255)*(1 - tcol) + (np.array([120, 150, 225], np.float32)/255)*tcol
        phi, w = self.gap_arrays(t, c)
        dd = np.abs(wrapa(self.TH - phi[j].astype(np.float32)))
        eaten = (dd < (w[j].astype(np.float32)/2)) | (self.R < CELL)
        base = self.void*1.6*(0.5 + 0.5*np.clip(1 - self.R/1300, 0, 1))[..., None]
        img = np.where(eaten[..., None], self.void, (col*(line*wave)[..., None]*0.80 + base)*self.vig)
        G = np.zeros((self.PH, self.PW, 3), np.uint8); P = lambda v: (int(round(v[0]*S*16)), int(round(v[1]*S*16)))
        # wall: dull while waiting, fully lit during a pass
        g = int(255*(0.10 + 0.88*rim_a)); cv2.circle(G, P((CX, CY)), int(round(CELL*S*16)), (g, g, g), max(1, int(round((3 + 4*rim_a)*S))), cv2.LINE_AA, 4)
        for (x, y, a, s_) in parts:
            cc = int(255*min(a, 1)); cv2.circle(G, P((CX + x, CY + y)), int(round(max(0.6, s_*S)*16)), (cc, cc, cc), -1, cv2.LINE_AA, 4)
        for (th, a) in flashes:
            pts = np.array([[(CX + CELL*math.cos(th + u))*S*16, (CY + CELL*math.sin(th + u))*S*16] for u in np.linspace(-0.2, 0.2, 12)], np.int32)
            cc = int(200*a); cv2.polylines(G, [pts], False, (cc, cc, cc), max(1, int(round(7*S))), cv2.LINE_AA, 4)
        tp = list(trail) + [ball]
        for k in range(len(tp) - 1):
            f = (k + 1)/len(tp); cc = int(170*f)
            cv2.line(G, P((CX + tp[k][0], CY + tp[k][1])), P((CX + tp[k+1][0], CY + tp[k+1][1])), (cc, cc, cc), max(1, int(round(RB*1.6*f*S))), cv2.LINE_AA, 4)
        cv2.circle(G, P((CX + ball[0], CY + ball[1])), int(round(RB*S*16)), (255, 255, 255), -1, cv2.LINE_AA, 4)
        Gf = G.astype(np.float32)/255
        bloom = Gf + cv2.GaussianBlur(Gf, (0, 0), 4*S)*0.9 + cv2.GaussianBlur(Gf, (0, 0), 14*S)*0.75 + cv2.GaussianBlur(Gf, (0, 0), 40*S)*0.4
        img = img + bloom
        pil = Image.fromarray(np.clip(img*255, 0, 255).astype(np.uint8)).convert('RGBA'); pil = Image.alpha_composite(pil, self.wm)
        if hook_a > 0:
            h = self.hook.copy()
            if hook_a < 1: h.putalpha(h.split()[3].point(lambda v: int(v*hook_a)))
            pil = Image.alpha_composite(pil, h)
        if cnt is not None:
            txt = f"{cnt}"; f = self.font(96*1.55*cscale); d = ImageDraw.Draw(pil); wd = d.textlength(txt, font=f)
            x, y = (self.PW - wd)/2, (CY - 48*1.55*cscale)*S
            shd = Image.new('RGBA', pil.size, (0, 0, 0, 0)); ImageDraw.Draw(shd).text((x, y + 6*S), txt, font=f, fill=(0, 0, 0, 200))
            pil = Image.alpha_composite(pil, shd.filter(ImageFilter.GaussianBlur(12*S)))
            ImageDraw.Draw(pil).text((x, y), txt, font=f, fill=TXT + (255,))
        arr = np.asarray(pil.convert('RGB'), np.float32)/255
        if flash > 0: arr = arr*(1 - flash) + flash*np.array([1, 0.98, 0.94], np.float32)
        hi = arr > 0.85; arr[hi] = 0.85 + 0.15*(1 - np.exp(-(arr[hi] - 0.85)/0.15))
        return np.clip(arr*255, 0, 255).astype(np.uint8)

# ------------------------------------------------------------ audio
def lpf(x, c): a = math.exp(-2*math.pi*c/SR); return lfilter([1 - a], [1, -a], x)
def tt_(d): return np.arange(int(SR*d))/SR
def env(d, a, dec): x = tt_(d); return np.minimum(x/a, 1)*np.exp(-x/dec)

def build_audio(T, streaks, ring_times, bounces, t_esc, song, start, seed):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-ss', str(start), '-t', str(T + 1), '-i', song, '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-'], capture_output=True, check=True).stdout
    x = np.frombuffer(raw, np.float32).reshape(-1, 2).T.copy(); n = int(T*SR); x = x[:, :n]
    lo = sosfilt(butter(4, 450, 'low', fs=SR, output='sos'), x, axis=1)
    gate = np.zeros(n, np.float32)
    for st in streaks:
        if st['t0'] < T: gate[int(st['t0']*SR):min(n, int((st['t1'] + 0.1)*SR))] = 1
    ds = 16; gd = gate[::ds]; od = np.zeros(len(gd), np.float32); cur = 0.0
    ka = 1 - math.exp(-ds/(0.04*SR)); kr = 1 - math.exp(-ds/(0.15*SR))
    for i, v in enumerate(gd): cur += (v - cur)*(ka if v > cur else kr); od[i] = cur
    g = np.interp(np.arange(n), np.arange(len(od))*ds, od).astype(np.float32)
    mixs = (lo*(1 - g) + x*g)*(0.5 + 0.5*np.clip(np.arange(n)/(20*SR), 0, 1))
    rng = np.random.default_rng(seed); fx = np.zeros(n)
    def put(s, st, gain=1.0):
        i = int(st*SR)
        if i >= n: return
        s = s[:n - i]; fx[i:i + len(s)] += s*gain
    for rt in ring_times:                                    # original K4 layer pop for every ring passed (light, chaos allowed)
        d = 0.25; xx = tt_(d); fr = 210*0.45 + 210*0.55*np.exp(-xx*22)
        put(np.sin(2*np.pi*np.cumsum(fr)/SR)*env(d, 0.002, 0.06), rt, 0.07)
    for bt in bounces:                                       # subtle deep ticks on solid bounces
        d = 0.10; xx = tt_(d); put(np.sin(2*np.pi*520*xx)*env(d, 0.0004, 0.022) + 0.25*np.sin(2*np.pi*1400*xx)*env(d, 0.0003, 0.008), bt, 0.12)
    if t_esc is not None:
        d = 3.6; xx = tt_(d); f = 24 + 96*np.exp(-xx*1.7); b = np.sin(2*np.pi*np.cumsum(f)/SR)*env(d, 0.004, 1.1)
        nz = lpf(rng.standard_normal(len(xx)), 650)*env(d, 0.001, 0.22)*0.5; boom = b + nz; put(boom/np.max(np.abs(boom)), t_esc, 0.8)
    mixs = mixs*0.85 + fx[None, :]*0.5
    mixs = np.tanh(mixs*1.3)/np.tanh(1.3); mixs = mixs/np.max(np.abs(mixs))*0.9
    fade = np.ones(n, np.float32); fo = int(0.5*SR); fade[-fo:] = np.linspace(1, 0, fo)
    return (mixs*fade).T.astype(np.float32), g

def main():
    seed = int(sys.argv[1]); out = sys.argv[2]; S = float(sys.argv[3]) if len(sys.argv) > 3 else 0.75
    song = sys.argv[4] if len(sys.argv) > 4 else os.path.join(os.path.dirname(os.path.abspath(__file__)), "song.mp3")
    start = float(sys.argv[5]) if len(sys.argv) > 5 else 56.8
    ws, streaks = tune(seed); t_esc = streaks[-1]['t1']
    print(f"tuned wait scale {ws:.2f}, {len(streaks)} streaks, lengths {[s['b'] - s['a'] for s in streaks]}, escape {t_esc:.1f}s", flush=True)
    ctab = consumed_table(streaks, 0.001, t_esc + 4)
    R = Renderer(S, streaks, seed); rng = random.Random(seed + 77); prng = np.random.default_rng(seed + 9)
    ff = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{R.PW}x{R.PH}', '-r', str(FPS), '-i', '-', '-an',
                           '-c:v', 'libx264', '-preset', 'fast', '-crf', '20', '-pix_fmt', 'yuv420p', out + '.silent.mp4'], stdin=subprocess.PIPE)
    # ball state
    a0 = rng.uniform(0, 2*math.pi); bx, by = 40.0, 30.0; sp0 = 800.0; vx, vy = math.cos(a0)*sp0, math.sin(a0)*sp0
    parts = []; flashes = []; trail = []; bounces = []; ring_times = []; last_c_int = 0; hist = []
    mouth_blend = 0.0; rim_a = 0.0; cs = 1.0; T_END = t_esc + 1.9; fi = 0; sub = 8
    while True:
        t = fi/FPS; c = float(ctab[min(int(t*1000), len(ctab) - 1)])
        cur = None
        for s_ in streaks:
            if s_['t0'] <= t < s_['t1']: cur = s_
        passing = cur is not None
        # ball: bounce in the cell while waiting, hover at the corridor mouth while passing
        for _ in range(sub):
            dt = 1.0/(FPS*sub); tt_now = t
            if passing:
                th = cur['th'] + 0.07*math.sin(8*t); target = (math.cos(th)*(CELL - RB - 2), math.sin(th)*(CELL - RB - 2))
                bx += (target[0] - bx)*min(1.0, dt*14); by += (target[1] - by)*min(1.0, dt*14)
                vx, vy = -math.cos(th)*900 + 300*math.sin(th), -math.sin(th)*900 - 300*math.cos(th)
            else:
                sp = 800 + 700*min(t/T_TARGET, 1)
                m = math.hypot(vx, vy); vx, vy = vx/m*sp, vy/m*sp
                bx += vx*dt; by += vy*dt; r = math.hypot(bx, by)
                if r + RB >= CELL and (bx*vx + by*vy) > 0:
                    nx, ny = bx/r, by/r; dot = vx*nx + vy*ny; vx -= 2*dot*nx; vy -= 2*dot*ny
                    ang = rng.uniform(-0.3, 0.3); cc, ss = math.cos(ang), math.sin(ang); vx, vy = vx*cc - vy*ss, vx*ss + vy*cc
                    bx, by = nx*(CELL - RB - 0.5), ny*(CELL - RB - 0.5)
                    bounces.append(t); flashes.append([math.atan2(ny, nx), 1.0])
                    for _ in range(8):
                        a = math.atan2(ny, nx) + prng.normal(0, 0.3); s2 = prng.uniform(20, 70); parts.append([CELL*math.cos(a), CELL*math.sin(a), -s2*math.cos(a), -s2*math.sin(a), prng.uniform(0.3, 0.6), 0.0, prng.uniform(0.8, 1.8)])
        hist.append((bx, by)); trail = hist[-8:-1]
        # dust: lots inside the wall while passing
        if passing:
            for _ in range(16):
                a = prng.uniform(0, 2*math.pi); d_ = CELL - 4 - abs(prng.normal(0, 14))
                parts.append([d_*math.cos(a), d_*math.sin(a), prng.normal(0, 6), prng.normal(0, 6), prng.uniform(0.25, 0.6), 0.0, prng.uniform(0.8, 2.2)])
        ci = int(c)
        while last_c_int < ci:
            last_c_int += 1; ring_times.append(t)
        for p in parts: p[0] += p[2]/FPS; p[1] += p[3]/FPS; p[2] *= 0.95; p[3] *= 0.95; p[5] += 1.0/FPS
        parts = [p for p in parts if p[5] < p[4]]
        for f_ in flashes: f_[1] -= 1.0/FPS/0.18
        flashes = [f_ for f_ in flashes if f_[1] > 0]
        rim_a += ((1.0 if passing else 0.0) - rim_a)*(0.5 if passing else 0.25)
        cs += ((0.94 if passing else 1.0) - cs)*0.25
        left = int(round(max(N_TOT - c, 0)*6))
        escd = t >= t_esc
        flash = 0.9*math.exp(-(t - t_esc)/0.22) if escd else 0.0
        ha = 1.0 if t < 3.5 else max(0.0, 1 - (t - 3.5)/0.7)
        pp = [(p[0], p[1], 0.9*(1 - p[5]/p[4])**1.4, p[6]) for p in parts]
        fl = [(f_[0], max(f_[1], 0)) for f_ in flashes]
        ff.stdin.write(R.render(t, c, cur, pp, fl, (bx, by), trail, flash, ha, None if (escd and t > t_esc + 0.4) else left, cs, rim_a).tobytes()); fi += 1
        if t >= T_END or (LIMIT and t >= LIMIT): break
        if fi % 90 == 0: print(f"t={t:.1f}s passing={passing} left={left}", flush=True)
    ff.stdin.close(); ff.wait()
    T = fi/FPS
    audio, gate = build_audio(T, streaks, ring_times, bounces, t_esc if not LIMIT else None, song, start, seed)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', '2', '-i', '-', '-i', out + '.silent.mp4', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', out],
                   input=audio.tobytes(), check=True)
    os.remove(out + '.silent.mp4')
    print(f"done {T:.1f}s, {len(streaks)} passes, escape {t_esc:.1f}s, open {sum(s['t1'] - s['t0'] for s in streaks)/t_esc*100:.0f}% of the time")

if __name__ == '__main__':
    main()
