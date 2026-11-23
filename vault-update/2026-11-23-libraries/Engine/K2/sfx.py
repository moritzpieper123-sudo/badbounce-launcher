import numpy as np, subprocess, sys, os
SR=48000; OUT=sys.argv[1]; rng=np.random.default_rng(7)
def t(d): return np.arange(int(SR*d))/SR
def env(d,a,dec): x=t(d); return np.minimum(x/a,1)*np.exp(-x/dec)
def sweep(f0,f1,d,k=6):
    x=t(d); f=f1+(f0-f1)*np.exp(-x*k); return np.sin(2*np.pi*np.cumsum(f)/SR)
def lp(x,c):
    a=np.exp(-2*np.pi*c/SR); y=np.zeros_like(x); s=0
    for i,v in enumerate(x): s=(1-a)*v+a*s; y[i]=s
    return y
def hp(x,c): return x-lp(x,c)
def reverb(x,dur=1.5,mix=.3,dark=3000):
    ir=rng.standard_normal(int(SR*dur))*np.exp(-t(dur)/(dur/5)); ir=lp(ir,dark); ir/=np.abs(ir).sum()**.5*8
    n=len(x)+len(ir); w=np.fft.irfft(np.fft.rfft(x,n)*np.fft.rfft(ir,n),n); w=w/np.max(np.abs(w))*np.max(np.abs(x))*.6; y=np.pad(x,(0,len(ir))); return y*(1-mix)+w*mix
def norm(x,p=.9): return x/np.max(np.abs(x))*p
def pad(x,s=.3): return np.concatenate([np.zeros(int(SR*.05)),x,np.zeros(int(SR*s))])
def save(name,x):
    x=norm(x); p=os.path.join(OUT,name+'.mp3')
    subprocess.run(['ffmpeg','-v','error','-y','-f','f32le','-ar',str(SR),'-ac','1','-i','-','-b:a','192k',p],input=x.astype(np.float32).tobytes(),check=True)
# crush thumps
def crushA(): d=.6; return sweep(140,45,d,14)*env(d,.002,.12)+.25*lp(rng.standard_normal(int(SR*d)),1500)*env(d,.001,.015)
def crushB(): # thump + glass crack
    d=.6; c=crushA(); g=hp(rng.standard_normal(int(SR*d)),3500)*env(d,.0005,.03)*.35
    g+=.15*np.sin(2*np.pi*3100*t(d))*env(d,.001,.05); return c+g
def crushC(): # heavy hydraulic
    d=.9; return sweep(110,32,d,8)*env(d,.004,.22)+.4*lp(rng.standard_normal(int(SR*d)),600)*env(d,.002,.06)+.15*lp(rng.standard_normal(int(SR*d)),4000)*env(d,.03,.08)
def tickA(f=2600): d=.08; return np.sin(2*np.pi*f*t(d))*env(d,.0003,.012)+.3*np.sin(2*np.pi*f*2.7*t(d))*env(d,.0003,.006)
def tickB(): d=.08; return hp(rng.standard_normal(int(SR*d)),2500)*env(d,.0002,.006)*.6+np.sin(2*np.pi*1800*t(d))*env(d,.0003,.008)*.5
def popA(): d=.15; x=t(d); f=350+900*(1-np.exp(-x*60)); return np.sin(2*np.pi*np.cumsum(f)/SR)*env(d,.001,.03)
def popB(): d=.2; x=t(d); f=600+500*(1-np.exp(-x*40)); s=np.sin(2*np.pi*np.cumsum(f)/SR)+.3*np.sin(2*np.pi*np.cumsum(2*f)/SR); return s*env(d,.002,.04)*.8
def boomA(): # deep bass + pitch-down reverb trail
    d=3.5; x=t(d); f=28+70*np.exp(-x*2.2); b=np.sin(2*np.pi*np.cumsum(f)/SR)*env(d,.003,.9)
    n=lp(rng.standard_normal(len(x)),700)*env(d,.001,.2)*.5; tf=180*np.exp(-x*.9)+25; tr=np.sin(2*np.pi*np.cumsum(tf)/SR)*env(d,.15,1.1)*.35; return reverb(b+n+tr,2.5,.35,800)
def boomB(): # boom + glass shatter
    b=boomA(); d=1.2; g=hp(rng.standard_normal(int(SR*d)),3000)*env(d,.001,.18)*.25
    for k in range(25):
        o=int(rng.uniform(0,.6)*SR); f=rng.uniform(2500,6000); g[o:o+3000]+=np.sin(2*np.pi*f*t(3000/SR))*env(3000/SR,.0002,.01)*.2
    g=np.pad(g,(0,len(b)-len(g))); return b+reverb(g,1.5,.4)[:len(b)]
for n,fn in [('Crush A - deep thump',crushA),('Crush B - thump plus glass',crushB),('Crush C - heavy hydraulic',crushC),('Tick A - glassy',tickA),('Tick B - soft click',tickB),('Pop A - quick bubble',popA),('Pop B - soft chime pop',popB),('Explosion A - bass and deep trail',boomA),('Explosion B - bass plus glass shatter',boomB)]:
    x=fn(); x=pad(np.concatenate([x,np.zeros(int(SR*.3)),x,np.zeros(int(SR*.3)),x])) if n.startswith(('Tick','Pop')) else pad(x); save(n,x)
# demo: 12 s mini video sound with crush A, tick A, pop A, explosion A
L=14; mix=np.zeros(SR*L)
def put(x,s,g=1):
    i=int(s*SR); x=x[:len(mix)-i]; mix[i:i+len(x)]+=x*g
balls=1
for k in range(8):
    tc=.8+k*1.25; put(norm(crushA()),tc,.9)
    balls*=2
    for j in range(min(balls,12)): put(norm(popA()),tc+.08+j*.02,.15)
    nt=int(4+balls*.8)
    for j in range(min(nt,60)): put(norm(tickA(rng.uniform(2200,3400))),tc+rng.uniform(.1,1.2),rng.uniform(.05,.15)*min(1,.3+k*.1))
put(norm(boomA()),.8+8*1.25+.2,1)
save('DEMO - full sequence (A sounds)',mix)
