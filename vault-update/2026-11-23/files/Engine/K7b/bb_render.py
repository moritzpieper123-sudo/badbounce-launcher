"""Badbounce brand renderer: draws one 1080x1920 frame in the brand style.
Layers: background -> devices (navy glass) -> glow (balls, lines, accents) -> reflection on glass floor -> text."""
import math, cairo, numpy as np
from PIL import Image, ImageFilter, ImageDraw, ImageFont

W, H = 1080, 1920
import os as _o
GLOW = float(_o.environ.get('BB_GLOW', '0.65'))   # brand-wide glow factor (re-render 2026-11-11: about 35% less than the old finals)
SC = 1.0  # render scale (0.5 = low-quality test)
def set_scale(s):
    global SC, PW, PH
    SC = s; PW, PH = int(W*s), int(H*s)
set_scale(1.0)
_BG = {}
C = dict(void=(4,5,10), ink=(10,13,24), stark=(27,42,74), night=(14,22,42), frost=(170,195,240),
         rivet=(150,175,220), glow=(244,246,255), yellow=(255,198,58), text=(243,239,230), red=(255,72,72))
import os as _os
_FD = _os.path.join(_os.path.dirname(_os.path.abspath(__file__)), "fonts")
FONT = "/usr/share/fonts/opentype/inter/Inter-Black.otf"
if not _os.path.exists(FONT): FONT = _os.path.join(_FD, "Inter-Black.otf")   # Windows / portable fallback

def rgb(c, a=1.0): return (c[0]/255, c[1]/255, c[2]/255, a)
def surf(): return cairo.ImageSurface(cairo.FORMAT_ARGB32, PW, PH)
def to_np(s):
    a = np.ndarray((PH, PW, 4), np.uint8, s.get_data()).astype(np.float32) / 255
    return a[..., [2, 1, 0]], a[..., 3:4]   # premultiplied rgb, alpha
def blur(x, r):
    r = r*SC
    if r <= 0: return x
    out = np.empty_like(x)
    for i in range(x.shape[2]):
        im = Image.fromarray(np.clip(x[..., i] * 255, 0, 255).astype(np.uint8))
        out[..., i] = np.asarray(im.filter(ImageFilter.GaussianBlur(r)), np.float32) / 255
    return out

def background(cx, cy, seed=1):
    key=(cx,cy,seed,SC)
    if key in _BG: return _BG[key]
    yy, xx = np.mgrid[0:PH, 0:PW].astype(np.float32)/SC
    d = np.sqrt(((xx-cx)/560)**2 + ((yy-cy)/640)**2)
    lift = np.clip(1 - d, 0, 1)**1.6
    img = np.array(C['void'], np.float32)/255 + lift[..., None]*(np.array(C['ink'], np.float32)-C['void'])/255*2.2
    vig = np.clip(1 - 0.55*(((xx-W/2)/(W*0.75))**2 + ((yy-H/2)/(H*0.7))**2), 0.35, 1)
    img *= vig[..., None]
    rng = np.random.default_rng(seed); dust = Image.new('L', (PW, PH)); dd = ImageDraw.Draw(dust)
    for _ in range(28):
        x, y, r = rng.uniform(0, PW), rng.uniform(0, PH), rng.uniform(1.5, 4)*SC
        dd.ellipse([x-r, y-r, x+r, y+r], fill=int(rng.uniform(40, 110)))
    dust = np.asarray(dust.filter(ImageFilter.GaussianBlur(2.2*SC)), np.float32)/255
    out = img + dust[..., None]*0.35*np.array(C['frost'], np.float32)/255
    _BG[key] = out; return out

# ---------- device drawing helpers (cairo) ----------
def rounded_rect(ctx, x, y, w, h, r):
    r = min(r, w/2, h/2)
    ctx.new_sub_path(); ctx.arc(x+w-r, y+r, r, -math.pi/2, 0); ctx.arc(x+w-r, y+h-r, r, 0, math.pi/2)
    ctx.arc(x+r, y+h-r, r, math.pi/2, math.pi); ctx.arc(x+r, y+r, r, math.pi, 1.5*math.pi); ctx.close_path()

def glass_body(ctx, path_fn, bbox):
    """Frosted Glass Hazard body: navy gradient ~55%, sheen streaks, Frost Blue outline."""
    x0, y0, x1, y1 = bbox
    g = cairo.LinearGradient(0, y0, 0, y1)
    g.add_color_stop_rgba(0, *rgb((40,60,100), .62)); g.add_color_stop_rgba(1, *rgb(C['night'], .62))
    path_fn(ctx); ctx.set_source(g); ctx.fill_preserve()
    ctx.save(); ctx.clip()
    for k in (0.15, 0.55):
        sx = x0 + (x1-x0)*k; ctx.move_to(sx, y0); ctx.line_to(sx+18, y0); ctx.line_to(sx+18-(y1-y0)*0.5, y1); ctx.line_to(sx-(y1-y0)*0.5, y1); ctx.close_path()
        ctx.set_source_rgba(1, 1, 1, 0.05); ctx.fill()
    ctx.restore()
    path_fn(ctx); ctx.set_source_rgba(*rgb(C['frost'], .9)); ctx.set_line_width(2); ctx.stroke()

def hazard(ctx, path_fn, bbox, w=14):
    x0, y0, x1, y1 = bbox
    ctx.save(); path_fn(ctx); ctx.clip()
    ctx.set_source_rgba(*rgb(C['night'], .7)); ctx.paint()
    n = int((x1-x0+y1-y0)/w)+2
    for i in range(-n, n, 2):
        bx = x0 + i*w
        ctx.move_to(bx, y1); ctx.line_to(bx+w, y1); ctx.line_to(bx+w+(y1-y0), y0); ctx.line_to(bx+(y1-y0), y0); ctx.close_path()
        ctx.set_source_rgba(*rgb(C['yellow'], .85)); ctx.fill()
    ctx.restore()
    path_fn(ctx); ctx.set_source_rgba(*rgb(C['frost'], .9)); ctx.set_line_width(2); ctx.stroke()

def rivet(ctx, x, y, r=4):
    ctx.arc(x, y, r, 0, 2*math.pi); ctx.set_source_rgba(*rgb(C['rivet'], 1)); ctx.fill()
    ctx.arc(x-r*0.3, y-r*0.3, r*0.35, 0, 2*math.pi); ctx.set_source_rgba(1, 1, 1, .5); ctx.fill()

class Frame:
    def __init__(self, cx=540, cy=830, floor_y=1330, seed=1):
        self.cx, self.cy, self.floor_y, self.seed = cx, cy, floor_y, seed
        self.dev = surf(); self.dctx = cairo.Context(self.dev); self.dctx.set_antialias(cairo.ANTIALIAS_BEST); self.dctx.scale(SC, SC)
        self.glw = surf(); self.gctx = cairo.Context(self.glw); self.gctx.set_antialias(cairo.ANTIALIAS_BEST); self.gctx.scale(SC, SC)
        self.tint = surf(); self.tctx = cairo.Context(self.tint); self.tctx.scale(SC, SC)
        self.counter = None; self.below = False
        self.bnd = surf(); self.bctx = cairo.Context(self.bnd); self.bctx.set_antialias(cairo.ANTIALIAS_BEST); self.bctx.scale(SC, SC); self.boundary_glow = 0
        self.flash = 0.0; self.fade = 1.0
        self.sol = surf(); self.sctx = cairo.Context(self.sol); self.sctx.set_antialias(cairo.ANTIALIAS_BEST); self.sctx.scale(SC, SC)  # crisp layer (trails): no bloom
    # boundary: path_fn draws the container path; colour = pressure colour
    def boundary(self, path_fn, color=C['glow'], glow=0.0, width=3.5):
        path_fn(self.tctx); self.tctx.set_source_rgba(*rgb((120,150,220), .05)); self.tctx.fill()
        self.boundary_glow = glow
        path_fn(self.bctx); self.bctx.set_source_rgba(*rgb(color, 1)); self.bctx.set_line_width(width); self.bctx.stroke()
    def ball(self, x, y, r, color=C['glow']):
        g = self.gctx; g.arc(x, y, r, 0, 2*math.pi); g.set_source_rgba(*rgb(color, 1)); g.fill()
        rg = cairo.RadialGradient(x-r*0.3, y-r*0.3, 0, x, y, r)       # bright core
        rg.add_color_stop_rgba(0, 1, 1, 1, .55 if color==C['glow'] else .22); rg.add_color_stop_rgba(1, 1, 1, 1, 0)
        g.arc(x, y, r, 0, 2*math.pi); g.set_source(rg); g.fill()
    def spark(self, x, y, r=3):
        self.gctx.arc(x, y, r, 0, 2*math.pi); self.gctx.set_source_rgba(*rgb(C['yellow'], 1)); self.gctx.fill()
    def strip(self, path_fn):   # Signal Yellow active surface (glows)
        path_fn(self.gctx); self.gctx.set_source_rgba(*rgb(C['yellow'], 1)); self.gctx.fill()

    def compose(self, out=None):
        bg = background(self.cx, self.cy, self.seed)
        drgb, da = to_np(self.dev); grgb, ga = to_np(self.glw); trgb, ta = to_np(self.tint)
        bloom = grgb + (blur(grgb, 4)*0.9 + blur(grgb, 14)*0.75 + blur(grgb, 40)*0.45)*GLOW
        brgb, ba = to_np(self.bnd); bg_ = self.boundary_glow
        bloom = bloom + brgb + (blur(brgb, 4)*(0.3+1.2*bg_) + blur(brgb, 18)*(0.1+1.0*bg_) + blur(brgb, 50)*(0.6*bg_))*GLOW
        ga = np.clip(ga + ba, 0, 1)
        srgb, sa = to_np(self.sol)
        scene_rgb = (trgb + drgb)*(1 - sa) + srgb + blur(srgb, 3)*0.18 + bloom*(1 - da*0.25)
        scene_a = np.clip(ta + da + sa + ga + blur(ga, 16)*0.5, 0, 1)
        # reflection about the floor line
        fy = int(self.floor_y*SC); refl = np.zeros_like(scene_rgb); n = min(fy, PH - fy)
        refl[fy:fy+n] = scene_rgb[fy-1::-1][:n]
        refl = blur(refl, 5)
        fade = np.zeros((PH, 1, 1), np.float32); d = np.arange(PH-fy, dtype=np.float32)/SC
        fade[fy:, 0, 0] = 0.5*np.clip(1 - d/520, 0, 1)**1.5
        img = bg*(1 - scene_a) + scene_rgb
        img[fy:] = bg[fy:] + refl[fy:]*fade[fy:] + (scene_rgb[fy:] if self.below else 0)
        # floor sheen line
        yy, xx = np.mgrid[0:PH, 0:PW]
        sheen = np.exp(-((yy-fy)/1.6)**2) * np.exp(-((xx-self.cx*SC)/(360*SC))**2) * 0.22
        img += sheen[..., None]*np.array(C['frost'], np.float32)/255
        mx = img.max(axis=2, keepdims=True); k = np.where(mx > 1, (1 + np.log(np.maximum(mx,1))*0.25)/np.maximum(mx,1e-6), 1)
        img = img*k
        if self.flash > 0: img = img*(1-self.flash) + self.flash*np.array([1,0.98,0.94],np.float32)
        img = img*self.fade
        im = Image.fromarray(np.clip(img*255, 0, 255).astype(np.uint8))
        self._text(im)
        if out: im.save(out)
        return im

    def _text(self, im):
        d = ImageDraw.Draw(im, 'RGBA')
        # subtle watermark under the reflection
        f = ImageFont.truetype(FONT, max(8,int(round(22*SC)))); t = "BADBOUNCE"; sp = 4.2*SC       # standard watermark (Mo 2026-11-23)
        w = sum(d.textlength(c, font=f) for c in t) + sp*(len(t) - 1); x = (PW - w)/2
        for c in t:
            d.text((x, 1792*SC), c, font=f, fill=(170, 195, 240, 255), anchor='ls'); x += d.textlength(c, font=f) + sp
        if self.counter is None: return
        txt, scale = self.counter
        f = ImageFont.truetype(FONT, int(96*scale*SC)); w = d.textlength(txt, font=f)
        x, y = (PW-w)/2, (self.counter_y - 48*scale)*SC
        sh = Image.new('RGBA', im.size, (0,0,0,0)); ImageDraw.Draw(sh).text((x, y+6*SC), txt, font=f, fill=(0,0,0,200))
        im.paste(Image.new('RGB', im.size, (0,0,0)), mask=sh.split()[3].filter(ImageFilter.GaussianBlur(12*SC)))
        gl = Image.new('RGBA', im.size, (0,0,0,0)); ImageDraw.Draw(gl).text((x, y), txt, font=f, fill=C['text']+(110,))
        gl = gl.filter(ImageFilter.GaussianBlur(14*SC)); im.paste(gl, mask=gl.split()[3])
        d = ImageDraw.Draw(im); d.text((x, y), txt, font=f, fill=tuple(int(v*self.fade) for v in C['text']))

def headline(im, lines, y0=150, size=92, gap=1.15):
    """Hook text: list of lines, each a list of (text, colour). Inter Black, soft dark shadow, yellow words get a glow."""
    d = ImageDraw.Draw(im); font = ImageFont.truetype(FONT, int(size*SC)); y = y0*SC
    for parts in lines:
        x = (PW - sum(d.textlength(t, font=font) for t, _ in parts))/2
        for t, col in parts:
            sh = Image.new('RGBA', im.size, (0,0,0,0)); ImageDraw.Draw(sh).text((x, y+7*SC), t, font=font, fill=(0,0,0,220))
            im.paste((0,0,0), mask=sh.split()[3].filter(ImageFilter.GaussianBlur(13*SC)))
            if col == C['yellow']:
                gl = Image.new('RGBA', im.size, (0,0,0,0)); ImageDraw.Draw(gl).text((x, y), t, font=font, fill=col+(160,))
                gl = gl.filter(ImageFilter.GaussianBlur(15*SC)); im.paste(gl, mask=gl.split()[3])
            ImageDraw.Draw(im).text((x, y), t, font=font, fill=col); x += d.textlength(t, font=font)
        y += size*gap*SC
    return im

def label(im, text, y, size=26, color=None, alpha=150):
    d = ImageDraw.Draw(im, 'RGBA'); font = ImageFont.truetype(FONT, int(size*SC))
    sp = " ".join(text); w = d.textlength(sp, font=font)
    d.text(((PW-w)/2, y*SC), sp, font=font, fill=(color or C['frost']) + (alpha,))
