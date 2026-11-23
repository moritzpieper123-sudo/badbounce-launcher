"""K5C v6 (rebuilt from a frame + audio + ball-track analysis of the @clippomat05 reference).
- every band group has a real thickness (grows with its size); the ball sinks smoothly INSIDE its own group, the lines stay pinned
  to the walls at their own height and are dragged into a fan that meets at the ball; tiny groups just snap (instant rebound)
- RIP: the whole group breaks at once, counter + tier colour + ball colour flip, ball keeps its sideways speed and is boosted up
- the column has enough headroom so the ball never bounces off the ceiling; camera: dead zone + look-ahead + hard clamp
Usage: python cb_v8.py sim | frames <scale> <worker> <nworkers> | audio"""
import math, sys, os, math, json, colorsys, cairo, numpy as np
import bb_render as B

CX = 540; CW = 860; X0, X1 = CX - CW/2, CX + CW/2
STACK0 = 900; TOP = STACK0 - 560; CAM_MIN = TOP - 120
NHITS = int(os.environ.get('CB_HITS', 16)); NL = 2**NHITS - 1
DZ0, DZ1 = 360, 820; FPS = 30; R = 26
G = float(os.environ.get('CB_G', 1700)); TF0 = float(os.environ.get('CB_TF0', 1.2)); TF1 = float(os.environ.get('CB_TF1', 0.2))
TH = float(os.environ.get('CB_TH', 0.19)); SEED = int(os.environ.get('CB_SEED', 12)); RIP = 0.06
OUT = os.path.dirname(os.path.abspath(__file__))

def nice_count(n):
    """Mo 2026-11-23: shown counts >= 1,000 are rounded to the nearest thousand (2,932 -> 3,000); below that rounded down to 50."""
    n = int(n)
    return int(round(n/1000.0))*1000 if n >= 1000 else max(n//50*50, n if n < 50 else 50)

def vest(h): return G*(TF0 + TF1*h)/2                               # boost speed after the rip
def Th(h): return 0.03 if h <= 3 else 0.05 + TH*(h - 3)              # stretch time grows with the group
def Dh(h): return 0.64*vest(h)*Th(h)               # sink depth: starts at ~0.4x the impact speed, smooth
def Hh(h): return max(36.0*1.45**h, 1.3*Dh(h))                       # thickness of group h (always deeper than the sink)
HH = [Hh(h) for h in range(NHITS)]
GS = [STACK0]
for _h in range(NHITS): GS.append(GS[-1] + HH[_h])                   # start of every group; GS[NHITS] = column floor
BOT = GS[-1] + 8; FLOOR = BOT + 40
STRIPE = 6.0
YS = STACK0 + STRIPE*np.arange(int((GS[-1] - STACK0)/STRIPE))
HS = np.clip(np.searchsorted(GS, YS, side='right') - 1, 0, NHITS - 1)
JS = np.array([(2**h - 1) + min(2**h - 1, int((y - GS[h])/HH[h]*2**h)) for y, h in zip(YS, HS)])   # stripe -> line index (break time)
def col_path(ctx): B.rounded_rect(ctx, X0, TOP - 40, CW, BOT - TOP + 46, 18)

KEYS = [(235, 190, 60), (238, 120, 40), (225, 50, 70), (222, 60, 170), (150, 80, 230), (100, 100, 255), (60, 150, 255), (50, 205, 220)]
def palette(h):
    p = min(1.0, h/(NHITS - 1))*(len(KEYS) - 1); i = min(int(p), len(KEYS) - 2); u = p - i
    return tuple((KEYS[i][k]*(1 - u) + KEYS[i + 1][k]*u)/255 for k in range(3))
def ball_col(h):
    r, g, b = palette(h); hh, ss, vv = colorsys.rgb_to_hsv(r, g, b)
    r, g, b = colorsys.hsv_to_rgb((hh + 0.45) % 1, 0.45, 1.0); return (int(r*255), int(g*255), int(b*255))

def simulate():
    rng = np.random.default_rng(SEED)
    ev = []; traj = []; breaks = np.full(NL, np.nan)
    t = 0.0; x = CX - 190.0; y = GS[0] - 260.0 - R; vx = rng.uniform(190, 250)*rng.choice([1, 1, -1]); vy = 0.0
    h = 0; dt = 1/1200; state = 'fly'; ts = 0.0; Ts = 1.0; D = 0.0; ytop = 0.0; lift = 0.0; vkeep = 0.0; t_boom = 1e9
    while True:
        t += dt
        if state == 'fly':
            x += vx*dt
            if x < X0 + R: x = 2*(X0 + R) - x; vx = -vx
            if x > X1 - R: x = 2*(X1 - R) - x; vx = -vx
            vy += G*dt; y += vy*dt
            if y < TOP - 30 + R: y = TOP - 30 + R; vy = abs(vy)*0.3                       # (should never happen: headroom is large enough)
            if h < NHITS and vy > 0 and y + R >= GS[h]:
                state = 'stretch'; ytop = GS[h]; ts = t; D = Dh(h); v0 = max(vy, 300.0); Ts = math.pi*D/(2*v0); y = ytop - R; vkeep = vx
                ev.append((t, 'hit', h)); ev.append((t, 'stretch', h, Ts, D))
        else:
            tau = min(1.0, (t - ts)/Ts); lift = D*math.sin(0.5*math.pi*tau)   # spring: deceleration grows with stretch, stops at depth D
            y = ytop - R + lift                                  # ball sinks in smoothly, x stays put
            x += vx*(1.0 - 0.55*tau)*dt                          # keeps its sideways drift, slowed a little by the band
            if x < X0 + R: x = 2*(X0 + R) - x; vx = -vx
            if x > X1 - R: x = 2*(X1 - R) - x; vx = -vx
            if tau >= 1.0:
                g0 = 2**h - 1; q = 2**h
                for j in range(g0, g0 + q):
                    tb = t + RIP*(j - g0)/q; breaks[j] = tb; ev.append((tb, 'snap', j))
                ev.append((t, 'rip', h)); h += 1; state = 'fly'; lift = 0.0
                vy = -vest(h)*rng.uniform(0.97, 1.03); vx = vx
                if h >= NHITS:                       # last group: the video ends a few seconds after the final rip, like the reference
                    for _ in range(int(2.5/dt)):
                        t += dt; vy += G*dt; y += vy*dt; x += vx*dt
                        if x < X0 + R or x > X1 - R: vx = -vx
                        traj.append((t, x, y, 0.0, -1))
                    break
        traj.append((t, x, y, lift if state == 'stretch' else 0.0, h if state == 'stretch' else -1))
    end = t + 0.2
    ev.sort(key=lambda e: e[0]); traj = traj[::5]
    cam_max = FLOOR + 430 - 1920; cam = []; c = CAM_MIN; v = 0.0; nf = int(end*FPS) + 1; tt = [p[0] for p in traj]
    for fi in range(nf):
        tf = fi/FPS; j = min(np.searchsorted(tt, tf + 0.10), len(traj) - 1); by_ = traj[j][2]          # look 0.1 s ahead
        target = min(max(min(max(c, by_ - DZ1), by_ - DZ0), CAM_MIN), cam_max)
        w = 16.0; dtf = 1/FPS
        for _ in range(4):
            a = w*w*(target - c) - 2*w*v; v += a*dtf/4; c += v*dtf/4
        jb = min(np.searchsorted(tt, tf), len(traj) - 1); b0 = traj[jb][2]
        c = min(max(c, b0 - 1000), b0 - 260)                              # hard limit: ball never closer than 260 px to a screen edge
        c = min(max(c, CAM_MIN), cam_max)
        cam.append(c)
    return dict(traj=traj, ev=ev, breaks=breaks.tolist(), end=end, t_boom=1e9, cam=cam)

def load():
    p = os.path.join(OUT, 'cb_v8_sim.json')
    if not os.path.exists(p): json.dump(simulate(), open(p, 'w'))
    return json.load(open(p))

def fan(ctx, yj, yb, xb):
    """line pinned to both walls at its own height yj, dragged down so that it passes through the ball (concave arcs)"""
    xl, xr = X0 + 3, X1 - 3
    ctx.move_to(xl, yj)
    for k in range(1, 41):
        a = k/40; ctx.line_to(xl + (xb - xl)*a, yj + (yb - yj)*a**1.6)
    for k in range(1, 41):
        a = k/40; ctx.line_to(xb + (xr - xb)*a, yj + (yb - yj)*(1 - a)**1.6)

def frame(S, fi, scale):
    t = fi/FPS; tr = S['traj']; br = np.array(S['breaks'])
    j = min(np.searchsorted(S['_tt'], t), len(tr) - 1); _, bx, by, lift, hst = tr[j]
    cam = S['cam'][min(fi, len(S['cam']) - 1)]
    rips = [e for e in S['ev'] if e[1] == 'rip' and e[0] <= t]; ct = len(rips)
    B.set_scale(scale); f = B.Frame(cx=CX, cy=800, floor_y=min(FLOOR - cam, 1920), seed=2)
    for c_ in (f.dctx, f.gctx, f.tctx, f.bctx, f.sctx): c_.translate(0, -cam)
    vis0, vis1 = cam - 700, cam + 1920 + 60
    f.boundary(col_path, glow=0.15, width=3.5)
    s = f.sctx; s.set_line_cap(cairo.LINE_CAP_ROUND); s.set_line_join(cairo.LINE_JOIN_ROUND)
    for c_ in (s, f.gctx): B.rounded_rect(c_, X0 + 2, TOP - 38, CW - 4, BOT - TOP + 42, 16); c_.clip()
    rng = np.random.default_rng(3)
    Ls = rng.uniform(0.5, 1.0, (len(YS), 2))*CW*0.55; As = np.radians(rng.uniform(62, 88, (len(YS), 2)))
    surf = GS[min(ct, NHITS)]
    pal = palette(ct); yb_c = by + R*0.5
    tbs = br[JS]
    k0 = int(np.searchsorted(YS, vis0)); k1 = int(np.searchsorted(YS, vis1))
    for k in range(k0, k1):
        y = YS[k]; tb = tbs[k]; h_i = HS[k]; col_i = palette(h_i)
        if t < tb:                                           # intact: the whole stack wears the current tier colour, fading with depth
            a = 0.95*(1 - 0.62*min(1.0, max(0.0, y - surf)/1500))
            if hst >= 0 and h_i == hst and y < yb_c:         # being stretched: pinned to the walls at its own height, dragged to the ball
                s.set_source_rgba(*pal, 1.0); s.set_line_width(2.0); fan(s, y, yb_c, bx); s.stroke()
                gl = f.gctx; gl.set_source_rgba(*pal, 0.07); gl.set_line_width(2.0); fan(gl, y, yb_c, bx); gl.stroke(); continue
            s.set_source_rgba(*pal, a); s.set_line_width(2.4)
            s.move_to(X0 + 3, y); s.line_to(X1 - 3, y); s.stroke(); continue
        age = t - tb; ph = (k*0.6180339) % 1*2*math.pi; ya = y
        kk = 1 - math.exp(-age*1.4)*math.cos(age*6.0); wob = math.exp(-age*0.5)*0.2
        for side, (xw, sd_) in enumerate(((X0 + 3, 1), (X1 - 3, -1))):
            a = As[k, side]*min(kk, 1.2); Lf = Ls[k, side]
            w1 = wob*math.sin(age*9.0 + ph + side*1.7); w2 = wob*math.sin(age*13.0 + ph*1.3 + side)
            ex = xw + sd_*Lf*math.cos(a + w1*0.8); ey = ya + Lf*math.sin(a + w1*0.8)
            c1x = xw + sd_*Lf*0.35*math.cos(a*0.3 + w2); c1y = ya + Lf*0.35*math.sin(a*0.3 + w2)
            c2x = xw + sd_*Lf*0.7*math.cos(a*0.8 - w1*1.5); c2y = ya + Lf*0.7*math.sin(a*0.8 - w1*1.5)
            if age < 0.2:
                g = f.gctx; g.set_source_rgba(*col_i, 0.9*(1 - age/0.2)); g.set_line_width(1.8)
                g.move_to(xw, ya); g.curve_to(c1x, c1y, c2x, c2y, ex, ey); g.stroke()
            s.set_source_rgba(*col_i, 0.8*min(1, age/0.15)); s.set_line_width(1.3)
            s.move_to(xw, ya); s.curve_to(c1x, c1y, c2x, c2y, ex, ey); s.stroke()
    if hst >= 0 and lift > 0.5:                               # glow where all the bands meet on the ball
        gl = f.gctx; rg = cairo.RadialGradient(bx, yb_c, 0, bx, yb_c, 130); rg.add_color_stop_rgba(0, *pal, 0.6); rg.add_color_stop_rgba(1, *pal, 0)
        gl.set_source(rg); gl.arc(bx, yb_c, 130, 0, 2*math.pi); gl.fill()
    recent = np.where((tbs <= t) & (tbs > t - 0.3))[0]
    for k in recent[::max(1, len(recent)//45)]:
        age = t - tbs[k]; r2 = np.random.default_rng(int(k)); cc = palette(HS[k])
        for _ in range(2):
            a = r2.uniform(math.pi*1.05, math.pi*1.95); v = r2.uniform(160, 520)
            sx = r2.choice([X0 + 12, X1 - 12]) + math.cos(a)*v*age*0.4; sy = YS[k] - 40 + math.sin(a)*v*age*0.6 + 700*age*age
            f.gctx.arc(sx, sy, 3.2*(1 - age/0.3) + 0.6, 0, 2*math.pi); f.gctx.set_source_rgba(*cc, 1); f.gctx.fill()
    bc = ball_col(ct); bcf = tuple(v/255 for v in bc)
    TR = 70; pts = [tr[max(0, j - k)][1:3] for k in range(0, TR, 2)]
    g = f.gctx; g.set_line_cap(cairo.LINE_CAP_ROUND); g.set_line_join(cairo.LINE_JOIN_ROUND)
    for k in range(len(pts) - 1, 0, -1):
        uu = 1 - k/len(pts); g.set_line_width(1.0 + 14*uu*uu); g.set_source_rgba(*bcf, 0.5*uu)
        g.move_to(*pts[k]); g.line_to(*pts[k - 1]); g.stroke()
    q = 0.0
    if rips: q = math.exp(-(t - rips[-1][0])*22)*math.cos((t - rips[-1][0])*40)*0.3
    if hst >= 0: q = -0.12*min(1.0, lift/200)
    g = f.gctx; g.save(); g.translate(bx, by); g.scale(1 + q, 1 - q); f.ball(0, 0, R, bc); g.restore()
    n = 2**ct; pop = 0
    if rips: pop = max(0, 1 - (t - rips[-1][0])/0.3)
    f.counter = None; f.counter_y = 110
    im = f.compose()
    from PIL import Image as _I
    a_ = np.asarray(im).astype(np.float32); hh = int(300*scale); k_ = np.clip(min(1.0, (cam - CAM_MIN)/120.0), 0, 1)
    band = (1 - 0.82*k_*np.clip(1 - np.arange(hh)/hh, 0, 1)**1.3)[:, None, None]
    a_[:hh] *= band; im = _I.fromarray(a_.clip(0, 255).astype(np.uint8))
    if ct >= 1 and pop > 0:
        prev = 2**(ct - 1); uu = 1 - pop; n_show = int(round(prev + (n - prev)*min(1.0, uu*2.2)))
    else: n_show = n
    if not S.get('_nohud'):
        _fin = 2**NHITS   # final counter value before rounding (65,536 at 16 hits)
        f.counter = (f"{int(round(n_show*nice_count(_fin)/_fin)):,}", 1.0 + 0.32*pop*pop**0.3)
        _d = B.ImageDraw.Draw(im, 'RGBA'); _f = B.ImageFont.truetype(B.FONT, int(26*scale)); _p1, _p2 = " ".join("X2") + "  ", " ".join("EVERY BOUNCE")
        _x = (im.width - _d.textlength(_p1 + _p2, font=_f))/2; _d.text((_x, 168*scale), _p1, font=_f, fill=(255, 198, 58, 255))
        _d.text((_x + _d.textlength(_p1, font=_f), 168*scale), _p2, font=_f, fill=(244, 246, 255, 235))
    f._text(im)                                              # standard BADBOUNCE watermark (always; counter only when HUD is on)
    return im

def render_frames(scale, w, nw):
    S = load(); S['_tt'] = [p[0] for p in S['traj']]
    d = os.path.join(OUT, 'cb_v8_out'); os.makedirs(d, exist_ok=True)
    for fi in range(w, int(S['end']*FPS), nw): frame(S, fi, scale).save(os.path.join(d, f'{fi:05d}.png'))

# ---------------------------------------------------------------- audio (mimics the reference spectrogram)
SR = 44100
SCALE = [0, 2, 3, 5, 7, 8, 10, 12, 13, 15, 17, 19, 20, 22, 24, 26]            # semitones above A3, climbs like the reference (220 -> 660 Hz)
def env(n, a, d): t = np.arange(n)/SR; return np.minimum(t/a, 1)*np.exp(-t/d)
def chord(h, big):
    """rip (measured on the reference): instant onset, smooth chime chord (root, 1.5, 2, 3, 4, 6) with a long ring, a soft low body that
    thumps twice (at 0 and +0.15 s), only a tiny short click on top. Nothing crackly."""
    n = int(SR*(2.6 + 0.9*big)); t = np.arange(n)/SR; f0 = 220*2**(SCALE[min(h, len(SCALE) - 1)]/12)
    x = np.zeros(n)
    for r, a, d in ((1, 1.0, 0.6), (1.5, 0.55, 0.5), (2, 0.65, 0.45), (3, 0.35, 0.3), (4, 0.2, 0.2), (6, 0.08, 0.1)):
        x += a*np.sin(2*np.pi*f0*r*t + 0.7*r)*env(n, 0.0015, d*(1 + 0.8*big))
    body = np.sin(2*np.pi*np.cumsum(95 - 25*(1 - np.exp(-t*6)))/SR)*(env(n, 0.003, 0.30) + 0.8*env(n, 0.003, 0.30)[np.clip(np.arange(n) - int(0.15*SR), 0, n - 1)]*(np.arange(n) > int(0.15*SR)))
    rng = np.random.default_rng(h + 7)
    from scipy.signal import lfilter, butter, sosfilt
    sos = butter(2, [1500, 5000], btype='band', fs=SR, output='sos')
    click = sosfilt(sos, rng.standard_normal(n))*env(n, 0.0005, 0.012)*0.22
    y = x*0.40 + body*(0.25 + 0.6*big) + click
    y = sosfilt(butter(2, 9000, btype='low', fs=SR, output='sos'), y)*(0.7 + 0.3*big)
    return y*fade_tail(n, 0.8)
def fade_tail(n, sec):
    """smooth fade to zero over the last `sec` seconds so nothing is ever cut off"""
    m = min(n, int(SR*sec)); w = np.ones(n); w[n - m:] = 0.5*(1 + np.cos(np.linspace(0, np.pi, m))); return w
def tension(dur, h):
    """hum at ~180 Hz that ramps up and sweeps upward to 600-880 Hz just before the rip (quiet next to the rip)"""
    n = int(SR*dur); t = np.arange(n)/SR; u = t/dur
    f = 180 + (480 + 20*min(h, 12))*np.clip((u - 0.55)/0.45, 0, 1)**2.2
    ph = 2*np.pi*np.cumsum(f)/SR
    return (np.sin(ph) + 0.3*np.sin(2*ph))*(0.03 + 0.16*u**2.5)*np.minimum(t/0.03, 1)*np.minimum((dur - t)/0.02, 1)

def audio():
    S = load(); L = int((S["end"] + 0.1)*SR); out = np.zeros((L, 2))
    def add(t, x, pan=0.0):
        i = int(t*SR); x = x[:max(0, L - i)]
        out[i:i + len(x), 0] += x*math.sqrt(0.5*(1 - pan)); out[i:i + len(x), 1] += x*math.sqrt(0.5*(1 + pan))
    for e in S['ev']:
        t, k = e[0], e[1]
        if k == 'stretch' and e[3] > 0.2: add(t, tension(e[3], e[2]))
        elif k == 'rip':
            big = e[2]/max(1, NHITS - 1); add(t, chord(e[2], big))
    out = np.tanh(out*1.1)/np.tanh(1.1); out /= max(1e-6, np.abs(out).max())/0.95
    out *= fade_tail(len(out), 0.9)[:, None]
    from scipy.io import wavfile
    wavfile.write(os.path.join(OUT, 'cb_v8_audio.wav'), SR, (out*32767).astype(np.int16))

if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'sim':
        p = os.path.join(OUT, 'cb_v8_sim.json'); os.path.exists(p) and os.remove(p); S = load()
        print('end', round(S['end'], 2), 'rips', [round(e[0], 2) for e in S['ev'] if e[1] == 'rip'], 'end', round(S['end'], 2))
    elif cmd == 'frames': render_frames(float(sys.argv[2]), int(sys.argv[3]), int(sys.argv[4]))
    elif cmd == 'audio': audio()
