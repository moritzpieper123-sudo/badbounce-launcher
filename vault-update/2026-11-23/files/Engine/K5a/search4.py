import sys, numpy as np
from multiprocessing import Pool
import k5_sim as S
n,V0,RA,RP,NS,NB=int(sys.argv[3]),float(sys.argv[4]),float(sys.argv[5]),float(sys.argv[6]),int(sys.argv[7]),int(sys.argv[8])
def f(seed):
    S.V0=V0; S.RAMP_A=RA; S.RAMP_P=RP; S.N_START=NS; S.N_BOUNCE=NB
    r=S.run(seed,n=n,tmax=95); d=sorted(r['death_t'].values()); return seed,r['T'],d,int(r['alive'].sum())
if __name__=='__main__':
    a,b=int(sys.argv[1]),int(sys.argv[2])
    with Pool(2) as p: res=p.map(f,range(a,b),chunksize=4)
    good=[]
    for seed,T,d,al in res:
        if al!=1 or len(d)<n-1: continue
        gaps=np.diff([0]+d)
        if 60<=T<=85 and d[0]>=4 and gaps.min()>=3.0: good.append((round(float(gaps.max()),1),seed,round(T,1),[round(x,1) for x in d]))
    good.sort()
    for g in good[:10]: print(g)
    print(len(good),'good of',len(res),flush=True)
