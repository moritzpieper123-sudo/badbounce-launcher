"""Badbounce SOUND LIBRARY: one .wav per sound that each concept's STANDARD engine really puts into its videos (nothing unused).
usage:  python build_sounds.py <Engine folder> <Libraries folder> [ID ...]
writes  <Libraries>/Sounds/<ID>/<NN name>.wav  +  <Libraries>/Sounds/<ID>/index.json  +  <Libraries>/Sounds/index.json
Every ID runs in its own process from inside Engine/<ID> (engines share module names like bb_render).
Sounds that are module functions are imported from the engine (always current). Sounds that are written inline inside an
engine's audio function are copied here 1:1 -> when such an engine sound changes, update its block below (see KEEP CURRENT in README.md)."""
import sys, os, json, math, subprocess, wave, shutil
import numpy as np

IDS = ['K1', 'K2', 'K3', 'K4', 'K5a', 'K5b', 'K5c', 'K6a', 'K6b', 'K7a', 'K7b', 'K8', 'K9', 'K10']
NAME = {'K1': 'Crush & multiply', 'K2': 'Edge increase', 'K3': 'Meme drop', 'K4': 'Ball escape', 'K5a': 'Line battle', 'K5b': 'Battle box',
        'K5c': 'Column break', 'K6a': 'Math damage battle', 'K6b': 'Boss fight', 'K7a': 'Shape filler pulse', 'K7b': 'Shape filler layers',
        'K8': 'Spiral roll', 'K9': 'Sheet drop', 'K10': 'Gamble crush'}


class Lib:
    def __init__(self, out, sr):
        self.out, self.sr, self.items = out, sr, []
        if os.path.isdir(out): shutil.rmtree(out)
        os.makedirs(out)

    def add(self, name, x, when, sr=None):
        """name = short title, x = mono float signal, when = when the engine plays it"""
        sr = sr or self.sr; x = np.asarray(x, np.float64).ravel()
        if x.size == 0: return
        x = x/(np.max(np.abs(x)) + 1e-12)*0.89
        fo = min(len(x), int(0.01*sr)); x[-fo:] *= np.linspace(1, 0, fo)
        x = np.concatenate([np.zeros(int(0.03*sr)), x, np.zeros(int(0.12*sr))])
        fn = f"{len(self.items) + 1:02d} " + "".join(c for c in name.replace(":", " -") if c not in '<>:"/\\|?*') + ".wav"
        with wave.open(os.path.join(self.out, fn), 'wb') as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes((x*32767).astype('<i2').tobytes())
        self.items.append(dict(file=fn, name=name, when=when, seconds=round(len(x)/sr, 2)))


def seq(parts, sr, gap=0.0):
    """several short sounds after each other (for sounds the engine always plays as a group)"""
    n = int(sum(len(p) for p in parts) + gap*sr*len(parts)); o = np.zeros(n); i = 0
    for p in parts: o[i:i + len(p)] += p; i += len(p) + int(gap*sr)
    return o


def at(pairs, sr, dur):
    """[(t, signal, gain)] mixed into one clip of length dur"""
    o = np.zeros(int(dur*sr))
    for t, s, g in pairs:
        i = int(t*sr); s = s[:max(0, len(o) - i)]; o[i:i + len(s)] += s*g
    return o


def run(ID, E, LIB):
    os.chdir(os.path.join(E, ID)); sys.path.insert(0, os.getcwd()); out = os.path.join(LIB, 'Sounds', ID + '.new')

    if ID == 'K1':
        import k1_sound as KS; L = Lib(out, KS.SR)
        L.add('Snap', KS.snap(0.3), 'every press hit')
        L.add('Load-up swell', KS.loadup(1.2), 'rises from just before the machine moves until the hit')
        L.add('Plop', seq([KS.norm(KS.plop(560*k)) for k in (0.9, 1.1, 1.35)], KS.SR, 0.08), 'new balls spawn (spammed, ~1 per 2 balls, higher with more balls)')
        L.add('Wall tick', KS.wall_tick(8.0), 'ball hits the wall (quiet, density follows the ball count)')
        L.add('Build-up', KS.buildup(1.4), 'once, 1.4 s before the explosion')
        L.add('Boom', KS.boom(), 'explosion on the last spawn')
        L.add('Sinking bass', KS.sinking_bass(3.0), 'after the boom (only sound left)')

    elif ID == 'K2':
        sys.argv = ['x', '/tmp']; ns = {}
        exec(open(os.path.join(E, ID, 'sfx.py')).read().split("for n,fn in")[0], ns); L = Lib(out, ns['SR'])
        L.add('Boom', ns['norm'](ns['boomA']()), 'the ring breaks at the end')
        L.items.append(dict(file=None, name='Song gate', when="Mo's song mp3 plays only while the ball touches the edge (not a library sound)", seconds=0))

    elif ID == 'K3':
        SR = 48000; L = Lib(out, SR)
        raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', os.path.join('src', 'mkay.mp3'), '-ar', str(SR), '-ac', '1', '-f', 'f32le', '-'], capture_output=True, check=True).stdout
        mk = np.frombuffer(raw, np.float32).copy(); mk = mk[int(0.10*SR):int(0.66*SR)]
        fd0 = int(0.01*SR); mk[:fd0] *= np.linspace(0, 1, fd0); mk[-int(0.03*SR):] *= np.linspace(1, 0, int(0.03*SR))
        from scipy.signal import resample
        L.add("M'kay merge (high, first tier)", resample(mk, int(len(mk)/1.45)), 'merge into tier 1 (playback 1.45x)')
        L.add("M'kay merge (deep, top tier)", resample(mk, int(len(mk)/0.5)), 'top merges and the burst at the end (0.5x, extra slow)')
        n_ = int(0.14*SR); tt = np.arange(n_)/SR
        pop = np.sin(2*np.pi*np.cumsum(900*np.exp(-tt/0.035) + 220)/SR)*np.exp(-tt/0.04)
        L.add('Start pop', pop, 'first ball appears (flask / stack layouts)')
        n_ = int(0.07*SR); tt = np.arange(n_)/SR
        L.add('Landing tick', seq([(np.sin(2*np.pi*(2600/1.17**k)*tt) + 0.4*np.sin(2*np.pi*(2600/1.17**k)*2.01*tt))*np.exp(-tt/0.012) for k in (1, 4, 7)], SR, 0.12),
              'a ball lands / bounces (pitch lower for bigger heads)')

    elif ID == 'K4':
        import k4o6_video2 as V2; SR = V2.SR; L = Lib(out, SR)
        d = 0.25; xx = V2.tt_(d); fr = 210*0.45 + 210*0.55*np.exp(-xx*22)
        L.add('Layer pop', np.sin(2*np.pi*np.cumsum(fr)/SR)*V2.env(d, 0.002, 0.06), 'every 6th ring the ball passes (light)')
        d = 0.10; xx = V2.tt_(d)
        L.add('Bounce tick', np.sin(2*np.pi*520*xx)*V2.env(d, 0.0004, 0.022) + 0.25*np.sin(2*np.pi*1400*xx)*V2.env(d, 0.0003, 0.008), 'ball bounces on a ring')
        d = 3.6; xx = V2.tt_(d); f = 24 + 96*np.exp(-xx*1.7); b = np.sin(2*np.pi*np.cumsum(f)/SR)*V2.env(d, 0.004, 1.1)
        nz = V2.lpf(np.random.default_rng(3).standard_normal(len(xx)), 650)*V2.env(d, 0.001, 0.22)*0.5
        L.add('Escape boom', b + nz, 'the ball escapes')
        L.items.append(dict(file=None, name='Song gate', when="Mo's song mp3: full while rings are passed, low-passed otherwise (not a library sound)", seconds=0))

    elif ID == 'K5a':
        import k5_destroy_sound as DS; SR = DS.SR; L = Lib(out, SR); ar = np.random.default_rng(5)
        L.add('Line cut tick', seq([DS.tick(ar, gain=0.3, click=DS.CLICK) for _ in range(4)], SR, 0.05), 'every line a ball cuts (ticks overlap when many lines go fast)')
        def thump(f0, f1, tau_f, tau_a, gain, dur=0.6):
            t = np.arange(int(SR*dur))/SR; ph = 2*np.pi*(f1*t + (f0 - f1)*tau_f*(1 - np.exp(-t/tau_f))); y = np.sin(ph)*np.exp(-t/tau_a)*np.minimum(1, t/0.001)
            c = ar.standard_normal(int(SR*0.003))*np.exp(-np.arange(int(SR*0.003))/(SR*0.0008))*0.25; y[:len(c)] += c; return y*gain
        L.add('Wall thump', thump(430, 150, 0.025, 0.07, 0.38), 'ball hits the arena wall')
        L.add('Ball thump', thump(520, 185, 0.02, 0.05, 0.30), 'two balls hit each other')
        L.add('Death thump', thump(240, 55, 0.08, 0.25, 0.55, 1.2), 'a ball is out')

    elif ID == 'K5b':
        import k5w as W, k5b_video as V; SR = W.SR; L = Lib(out, SR)
        L.add('Hitmarker', W.snd_hitmarker(), "every weapon hit (Mo's hitmarker file, unchanged)")
        L.add('Death boom', V.snd_boom(0), 'a ball is out')
        L.add('Death hit', V.snd_hit(200, 0), 'layered under the death boom')
        L.add('Bomb blast', W.snd_explode(0), 'BOMB weapon goes off')

    elif ID == 'K5c':
        import cb_v8 as CB; L = Lib(out, CB.SR)
        L.add('Tension hum', CB.tension(1.2, 6), 'while the column stretches before a rip (sweeps up)')
        L.add('Rip chord (early)', CB.chord(2, 2/(CB.NHITS - 1)), 'a group of lines rips (low hits)')
        L.add('Rip chord (final)', CB.chord(CB.NHITS - 1, 1.0), 'the biggest, last rip')

    elif ID == 'K6a':
        import k6_bong_video as V; SR = V.SR; L = Lib(out, SR); rng = np.random.default_rng(5); tt, env, lp = V.tt, V.env, V.lp
        def tick(): fq = 2300 + 900*rng.uniform(-1, 1); x = tt(0.03); return np.sin(2*np.pi*fq*x)*np.exp(-x*160) + 0.35*np.sin(2*np.pi*fq*1.52*x)*np.exp(-x*220)
        L.add('Hit tick', seq([tick() for _ in range(3)], SR, 0.12), 'every ball hit on a block (also quieter as wall tok)')
        d = 0.7; x = tt(d); f = 62 + 50*np.exp(-x*28)
        L.add('Block break', np.sin(2*np.pi*np.cumsum(f)/SR)*env(d, 0.002, 0.09) + 0.2*lp(rng.standard_normal(len(x)), 900)*env(d, 0.001, 0.02), 'a block breaks')
        d = 3.4; x = tt(d); f = 52 + 90*np.exp(-x*6)
        L.add('Win boom', np.sin(2*np.pi*np.cumsum(f)/SR)*env(d, 0.003, 0.6) + 0.25*lp(rng.standard_normal(len(x)), 700)*env(d, 0.001, 0.12), 'a ball reaches the finish line')

    elif ID == 'K6b':
        import k9_video as V; SR = V.SR; L = Lib(out, SR); rng = np.random.default_rng(5)
        L.add('Hit (soft punch)', seq([V.hit_sound(a) for a in (1, 10, 25)], SR, 0.05), 'every hit on the boss (pitch rises a little per hit)')
        L.add('Wall tick', seq([V.wall_tick(rng) for _ in range(3)], SR, 0.15), 'ball bounces on the box wall')
        d = 2.8; x = V.tt(d); f = 50 + 95*np.exp(-x*6)
        L.add('Win boom', V.fade(np.sin(2*np.pi*np.cumsum(f)/SR)*V.env(d, 0.003, 0.75) + 0.3*V.lp(rng.standard_normal(len(x)), 800)*V.env(d, 0.001, 0.15), 0.5), 'the boss is destroyed')

    elif ID in ('K7a', 'K7b'):
        sys.argv = ['x', '/tmp']; ns = {}
        exec(open('sfx.py').read().split("for n,fn in")[0], ns); SR = ns['SR']; L = Lib(out, SR); tickA, norm, t_, env = ns['tickA'], ns['norm'], ns['t'], ns['env']
        L.add('Layer tick', seq([norm(tickA(1800*2.6**u)) + 0.3*norm(np.sin(2*np.pi*(1800*2.6**u/8)*t_(0.12))*env(0.12, .001, .03))[:len(tickA(1800*2.6**u))]
                                 for u in (0, 0.5, 1.0)], SR, 0.15), 'every new layer locks in (pitch climbs over the video)')
        if ID == 'K7a':
            PENTA = [0, 2, 4, 7, 9, 12, 14, 16]
            L.add('Soft wall tick', seq([norm(tickA(1700*2**(PENTA[j]/12))) for j in (0, 3, 6)], SR, 0.12), 'ring touches the wall without locking (pentatonic)')
        else:
            L.add('Soft wall tick', seq([norm(tickA(1500*(1 + 0.05*j))) for j in (0, 3, 6)], SR, 0.12), 'ball touches a wall without a new layer')
        def note(fr, dur=1.1):
            tt = np.arange(int(dur*SR))/SR
            return (np.sin(2*np.pi*fr*tt)*np.exp(-tt*4.2) + 0.35*np.sin(2*np.pi*2*fr*tt)*np.exp(-tt*7.0) + 0.12*np.sin(2*np.pi*3*fr*tt)*np.exp(-tt*10.0))*np.minimum(tt/0.002, 1.0)
        L.add('Done chime', at([(0, note(1318.5), 0.34), (0.09, note(1975.5), 0.30)], SR, 1.3), 'the shape is full (E6 -> B6)')

    elif ID == 'K8':
        SR = 44100; L = Lib(out, SR); rng = np.random.default_rng(13)
        dd = int(.09*SR); tt = np.arange(dd)/SR
        def brk():
            nz = np.diff(rng.standard_normal(dd), prepend=0)
            return nz*np.exp(-tt*170)*0.2 + np.sin(2*np.pi*2352*rng.uniform(.93, 1.07)*tt)*np.exp(-tt*90)*0.07 + np.sin(2*np.pi*rng.uniform(220, 420)*tt)*np.exp(-tt*95)*0.16
        L.add('Tile break', seq([brk() for _ in range(3)], SR, 0.1), 'a tile breaks (stone crack + low thud)')
        d2 = int(.05*SR); t2 = np.arange(d2)/SR
        L.add('Rubble clink (splinter)', seq([np.sin(2*np.pi*rng.uniform(2800, 5600)*t2)*np.exp(-t2*140) + 0.5*np.diff(rng.standard_normal(d2), prepend=0)*np.exp(-t2*220) for _ in range(4)], SR, 0.06),
              'a splinter hits a lane wall (real physics impacts)')
        d2 = int(.09*SR); t2 = np.arange(d2)/SR
        L.add('Rubble clack (chunk)', seq([np.sin(2*np.pi*rng.uniform(380, 820)*t2)*np.exp(-t2*55) + .6*rng.standard_normal(d2)*np.exp(-t2*120) for _ in range(3)], SR, 0.08), 'a chunk hits a lane wall')
        d3 = int(.25*SR); t3 = np.arange(d3)/SR
        L.add('Landing tock', np.sin(2*np.pi*190*t3*(1 - .4*t3))*np.exp(-t3*18), 'a ball lands in the spiral')
        dist_step = 60.0; s = np.concatenate([np.linspace(0.1, 1, int(2.5*SR)), np.ones(int(0.5*SR))]); n = len(s)
        dist = np.cumsum(s*2600/SR); y = np.zeros(n + SR); d = int(.16*SR); tq = np.arange(d)/SR
        for i in np.nonzero(np.diff(np.floor(dist/dist_step)) > 0)[0]:
            f = 110 + 60*s[i]; y[i:i + d] += np.tanh(2*np.sin(2*np.pi*(f*tq - 220*tq*tq)))*np.exp(-tq*28)*(0.25 + 0.75*s[i])
        L.add('Momentum thump rate', y[:n], 'whole video: one thump per 60 px rolled, faster + louder with speed (example ramp)')
        d4 = int(2.2*SR); t4 = np.arange(d4)/SR; parts = [(0, np.tanh(2.6*np.sin(2*np.pi*(95 - 28*t4)*t4))*np.exp(-t4*2.2)*0.62, 1)]
        for i, f in enumerate((523.25, 659.25, 783.99, 1046.5, 1318.5, 1568.0, 2093.0)):
            t5 = np.arange(int(1.6*SR))/SR; parts.append((i*0.085, (np.sin(2*np.pi*f*t5) + .35*np.sin(2*np.pi*f*2.76*t5)*np.exp(-t5*6))*np.exp(-t5*(3.2 if i < 6 else 1.6))*(0.16 + .02*i), 1))
        for f in (523.25, 783.99, 1046.5, 1318.5):
            t6 = np.arange(int(2.6*SR))/SR; parts.append((.6, np.sin(2*np.pi*f*t6)*np.exp(-t6*1.5)*0.08, 1))
        for k in range(70):
            t7 = np.arange(int(.06*SR))/SR; parts.append((.05 + k*0.018 + rng.uniform(0, .01), np.sin(2*np.pi*rng.uniform(3500, 7500)*t7)*np.exp(-t7*90)*0.06*(1 - k/90), 1))
        L.add('Gem reward', np.tanh(at(parts, SR, 3.4)*1.4), 'the last ball touches the gem (boom + bell arpeggio + chord + sparkle)')

    elif ID == 'K9':
        sr = 44100; L = Lib(out, sr)
        def tone(f, d, dec): t = np.arange(int(d*sr))/sr; return np.sin(2*np.pi*f*t)*np.exp(-t*dec)
        def k10(f, a): f = f*8; return a*3*(tone(f, .04, 160) + 0.35*tone(f*1.52, .04, 220))
        pent = [0, 2, 4, 7, 9]; fr = lambda deg: 110*2**((pent[deg % 5] + 12*(deg//5))/12)
        L.add('Ring landing tick', seq([k10(fr(dg), 1) for dg in (0, 3, 6, 9, 13)], sr, 0.1), 'every ring lands on the floor (pitch by ring: pentatonic, outer = low)')

    elif ID == 'K10':
        sr = 44100; L = Lib(out, sr); R = np.random.default_rng(3)
        def tone(f, d, dec, g=1.0, f2=None):
            tt = np.arange(int(d*sr))/sr; ph = 2*np.pi*(f*tt if f2 is None else (f*tt + (f2 - f)*tt*tt/(2*d))); return np.sin(ph)*np.exp(-tt*dec)*g
        def noise(d, dec, g=1.0, lp=0.3):
            n = R.standard_normal(int(d*sr)); o = np.zeros_like(n); acc = 0
            for k in range(len(n)): acc += lp*(n[k] - acc); o[k] = acc
            return o*np.exp(-np.arange(len(n))/sr*dec)*g
        def mix(*sg):
            n = max(len(x) for x in sg); o = np.zeros(n)
            for x in sg: o[:len(x)] += x
            return o
        L.add('Slot tick', mix(tone(760, 0.05, 70, 0.22), tone(1520, 0.05, 110, 0.06)), 'the crusher passes a box (roll tick)')
        L.add('Wall tick', seq([mix(tone(fq, 0.022, 160, .12), tone(fq*1.52, 0.015, 220, .04)) for fq in (1700, 2300, 3000)], sr, 0.12), 'every ball hits the arena wall')
        L.add('Slam', mix(tone(86, 0.35, 11, 0.85), tone(172, 0.12, 30, 0.25), noise(0.18, 30, 0.35, 0.35)), 'the crusher slams a box')
        good = [(q*0.07, mix(tone(fq, 0.45, 7, 0.22), tone(fq*2, 0.3, 12, 0.07)), 1) for q, fq in enumerate((523.3, 659.3, 784.0, 1046.5, 1318.5))]
        good += [(0.36, mix(tone(1046.5, 0.9, 4, 0.2), tone(1568.0, 0.9, 5, 0.1)), 1)] + [(0.05 + q*0.06, tone(2400 + 300*q, 0.05, 90, 0.05), 1) for q in range(6)]
        L.add('Good box', at(good, sr, 1.4), 'landing on a good box (x2.., SPLIT, +10, MERGE, ?...)')
        tt_ = np.arange(int(0.75*sr))/sr; f_ = 260 - 170*(tt_/0.75) + 12*np.sin(2*np.pi*7*tt_); ph_ = 2*np.pi*np.cumsum(f_)/sr
        wah = (np.sign(np.sin(ph_))*0.5 + np.sin(ph_)*0.5)*np.exp(-tt_*2.2)*np.clip(tt_*60, 0, 1)*0.32
        L.add('Bad box (wah)', at([(0, wah, 1), (0.02, tone(90, 0.7, 3.5, 0.3, f2=45), 1)], sr, 0.8), 'landing on SKULL or ÷2')
        L.add('Multiply spawn', at([(0.02 + q*0.018, tone(784*(1 + 0.03*R.uniform(-1, 1)), 0.12, 35, 0.16), 1) for q in range(14)] + [(0.02, mix(tone(784, 0.5, 6, 0.18), tone(784*1.5, 0.5, 7, 0.08)), 1)], sr, 0.7),
              'new balls appear (pitch by multiplier: x2 C5 ... x20 C6)')
        L.add('Skull kill', mix(tone(62, 0.6, 6, 0.7), tone(55, 0.6, 5, 0.3), noise(0.35, 10, 0.25, 0.08)), 'SKULL removes balls')
        L.add('Grow', tone(300, 0.35, 6, 0.3, f2=600), 'BIG: a ball grows')
        L.add('Shrink', tone(600, 0.35, 6, 0.3, f2=300), 'a ball shrinks')
        L.add('Gone', at([(q*0.03, tone(320, 0.09, 28, 0.1, f2=120), 1) for q in range(5)], sr, 0.3), 'balls disappear')
        L.add('Effect: divide', tone(520, 0.3, 7, 0.22, f2=260), '÷2 effect')
        L.add('Effect: merge', at([(0, tone(660, 0.14, 18, 0.2, f2=990), 1), (0.1, tone(990, 0.1, 25, 0.1), 1)], sr, 0.25), 'MERGE effect')
        L.add('Effect: turbo', mix(tone(300, 0.45, 4, 0.22, f2=1100), noise(0.35, 8, 0.1, 0.5)), 'TURBO effect')
        L.add('Effect: magnet', mix(tone(140, 0.55, 3, 0.25, f2=260), tone(280, 0.55, 3, 0.1, f2=520)), 'MAGNET effect')
        L.add('Effect: gravity', tone(900, 0.5, 3, 0.25, f2=180), 'GRAVITY effect')
        L.add('Effect: rain', at([(q*0.05, tone(fq, 0.18, 14, 0.1), 1) for q, fq in enumerate((1046.5, 1318.5, 1568.0, 2093.0))], sr, 0.4), 'RAIN effect')
        L.add('Effect: bomb', mix(tone(110, 0.6, 5, 0.6, f2=45), noise(0.4, 9, 0.35, 0.15)), 'BOMB effect')
        L.add('Launch', mix(noise(0.35, 8, 0.3, 0.5), tone(200, 0.35, 6, 0.25, f2=700)), 'a ball is launched')
        L.add('Arena burst', mix(tone(90, 2.2, 1.6, 1.0, f2=32), noise(1.8, 3.0, 0.7, 0.25), tone(180, 0.6, 5, 0.3, f2=60)), 'the arena bursts at the end')

    json.dump(dict(id=ID, name=NAME[ID], items=L.items), open(os.path.join(out, 'index.json'), 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    final = out[:-4]; old = final + '.old'   # swap the fresh folder in; the old one stays if this ID failed
    if os.path.isdir(old): shutil.rmtree(old, ignore_errors=True)
    if os.path.isdir(final): os.rename(final, old)
    os.rename(out, final); shutil.rmtree(old, ignore_errors=True)
    print(ID, len([i for i in L.items if i['file']]), 'sounds')


if __name__ == '__main__':
    E, LIB = os.path.abspath(sys.argv[1]), os.path.abspath(sys.argv[2]); ids = sys.argv[3:]
    if len(ids) == 1: run(ids[0], E, LIB); sys.exit()
    bad = []
    for ID in ids or IDS:
        r = subprocess.run([sys.executable, os.path.abspath(__file__), E, LIB, ID])
        if r.returncode: bad.append(ID)
    allx = []
    for ID in IDS:
        p = os.path.join(LIB, 'Sounds', ID, 'index.json')
        if os.path.exists(p): allx.append(json.load(open(p, encoding='utf-8')))
    json.dump(dict(kind='sounds', title='Sound library', concepts=allx), open(os.path.join(LIB, 'Sounds', 'index.json'), 'w', encoding='utf-8'), indent=1, ensure_ascii=False)
    print('failed:', bad or 'none'); sys.exit(1 if bad else 0)
