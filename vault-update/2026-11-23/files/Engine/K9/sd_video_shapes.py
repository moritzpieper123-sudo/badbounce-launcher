import numpy as np, math, subprocess, wave, os
from multiprocessing import Pool
import sd_shape_frame as F, sd_shapes as SH
SHAPE=int(os.environ.get('K9_SHAPE','1'))-1   # 1..100
CAP=float(os.environ.get('K9_CAP','0'))   # >0 = short test render
FPS=30; OUT=os.path.dirname(os.path.abspath(__file__))
F.STOPS=[(0,(110,40,235)),(0.35,(255,60,160)),(0.7,(255,140,40)),(1,(255,220,70))]
YG=F.YG; H=850.0; F.YR=H; NR=34
T_HOVER=0.6; T0=2.4; SLOW=0.08; TF0=T0/2
FULL_UNTIL=float(os.environ.get('K9_FULL','50')); E=0.80; HOLD=1.5
def per(r): return T0*(1+SLOW*(1-r))
def plan(r):
    """list of (start,duration,height) for each bounce after the first drop; flat time"""
    t=T_HOVER+TF0; T=per(r); h=H; out=[]
    while True:
        out.append((t,T,h)); t+=T
        if t>FULL_UNTIL: h*=E*E; T*=E
        if h<3: return out,t
PLANS={i:plan(i/NR) for i in range(1,NR+1)}
DUR=max(p[1] for p in PLANS.values())+HOLD
def y_ring(r,t):
    if t<T_HOVER: return YG+H
    c=t-T_HOVER
    if c<TF0: return YG+H*(1-(c/TF0)**2)
    seq,flat=PLANS[int(round(r*NR))]
    if t>=flat: return YG
    for s,T,h in seq:
        if s<=t<s+T:
            u=(t-s)/T; return YG+4*h*u*(1-u)
    return YG
F.height=lambda r,t,phase: y_ring(r,phase)
def watermark(im):
    """standard watermark (Mo 2026-11-22/23): BADBOUNCE, Inter Black 22 px, spacing 4.2 px, Frost Blue, baseline y 1792, centred"""
    from PIL import ImageDraw, ImageFont
    d=ImageDraw.Draw(im); f=ImageFont.truetype(os.path.join(OUT,'fonts','Inter-Black.otf'),22); t='BADBOUNCE'
    w=sum(d.textlength(c,font=f) for c in t)+4.2*(len(t)-1); x=(im.width-w)/2
    for c in t: d.text((x,1792),c,font=f,fill=(170,195,240),anchor='ls'); x+=d.textlength(c,font=f)+4.2
    return im
def job(n):
    im=watermark(F.render(SHAPE,n/FPS,rings=NR,S=1).convert('RGB')).resize((540,960))
    im.save(f"{OUT}/fr/{n:05d}.png")
sr=44100; rng=np.random.default_rng(7)
def lp(x,n): return np.convolve(x,np.ones(n)/n,'same')
def tone(f,d,dec):
    t=np.arange(int(d*sr))/sr; return np.sin(2*np.pi*f*t)*np.exp(-t*dec)
def k10(f,a):   # K10 tick (approved for K9 Opt 13)
    f=f*8; return a*3*(tone(f,.04,160)+0.35*tone(f*1.52,.04,220))
def s2(f,a):
    n=int(.15*sr);x=np.arange(n)/sr; f=f*2
    return a*(np.sin(2*np.pi*f*x)*np.exp(-x/.03)+0.4*np.sin(2*np.pi*f*2.76*x)*np.exp(-x/.012)+0.3*lp(rng.standard_normal(n),6)*np.exp(-x/.003))
pent=[0,2,4,7,9]
def freq(i):
    deg=int(i/NR*14); return 110*2**((pent[deg%5]+12*(deg//5))/12)
def audio():
    a=np.zeros(int(sr*(DUR+0.5)))
    for i in range(1,NR+1):
        seq,flat=PLANS[i]
        ev=[(T_HOVER+TF0,H)]+[(s+T,h) for s,T,h in seq]   # landing times with height of the bounce that ends
        # the landing after bounce k has the energy of bounce k
        for t,h in ev:
            k=int(t*sr); x=k10(freq(i),0.06*max(0.25,(h/H)**0.5))
            if k<len(a): a[k:k+len(x)]+=x[:len(a)-k]
    a/=np.abs(a).max()/0.8
    w=wave.open(f"{OUT}/k9.wav","wb");w.setnchannels(1);w.setsampwidth(2);w.setframerate(sr)
    w.writeframes((a*32767).astype('<i2').tobytes());w.close()
if __name__=="__main__":
    os.system(f"rm -rf {OUT}/fr"); os.makedirs(f"{OUT}/fr")
    DUR=min(DUR,CAP) if CAP>0 else DUR; audio(); print("DUR",DUR,SH.NAMES[SHAPE])
    with Pool(2) as p: p.map(job,range(int(DUR*FPS)),chunksize=4)
    subprocess.run(["ffmpeg","-y","-v","error","-framerate",str(FPS),"-i",f"{OUT}/fr/%05d.png","-i",f"{OUT}/k9.wav","-t",f"{DUR:.2f}","-c:v","libx264","-pix_fmt","yuv420p","-crf","22","-c:a","aac","-b:a","160k",f"{OUT}/K9 shape {SHAPE+1:03d} {SH.NAMES[SHAPE]}.mp4"],check=True)
