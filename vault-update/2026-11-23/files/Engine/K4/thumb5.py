import sys, numpy as np
OUT = sys.argv[1] if len(sys.argv) > 1 else 'K4 thumbnail.png'; sys.argv=['x']
import k4o6_video5 as V, k4o6_sim4 as SIM, k4o6_video7 as V7
from PIL import Image, ImageDraw
kL,kv,res=SIM.tune(3,60.7)
R=V.Renderer(1.0,res,3)
t=0.15; c=R.cvis(t)
img=R.render(t,c,[],(60,-100),[(40,-90),(50,-95)],0.0,1.0,V7.nice_count(res['n_tot']),1.0)
im=Image.fromarray(img).convert('RGB'); d=ImageDraw.Draw(im)
f=R.font(96*1.0); txt="1 BALL"; 
def center(txt,y,font,fill):
    w=d.textlength(txt,font=font); d.text(((1080-w)/2,y),txt,font=font,fill=fill)
fy=R.font(120); 
center(f"{V7.nice_count(res['n_tot']):,} LAYERS",1500,fy,(255,206,60))
center("1 BALL",1400,R.font(90),(255,255,255))
im.save(OUT)
