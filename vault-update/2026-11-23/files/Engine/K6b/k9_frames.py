"""Konzept 6b (Boss fight): one glow-white square box, one glassy boss ball with a health bar + number inside, a small hitter ball, damage number above the box.
Fibonacci: hit n deals F(n); boss health 1,000,000,000 dies on hit 43.
Usage: python k9_frames.py <out.png> [hit] [scale]   (test frame)"""
import sys, math, random
import cairo, os
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os; sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import bb_render as B

BOSS_HP = int(os.environ.get('K6B_HP', 3*10**10))
TITLE_HP = os.environ.get('K6B_HPTXT', '30 BILLION'); LIMIT = int(os.environ.get('K6B_LIMIT', 70))
BX, BY, BW, BH = 140, 370, 800, 800          # box: square
R_BOSS, R_HIT = 112, 20
NUM_HOOK = None

def fib(n):
    a, b = 0, 1
    for _ in range(n): a, b = b, a + b
    return a
def total(n): return fib(n + 2) - 1
def fmt_dmg(v):
    for lim, s in ((10**9, 'B'), (10**6, 'M'), (10**3, 'K')):
        if v >= lim: return f"{v/lim:.3g}{s}"
    return str(int(v))
def hcol(frac):                                   # green (full) -> yellow -> red (empty)
    g, y, r = (70, 215, 115), (255, 205, 70), (255, 85, 85)
    a, b, u = (g, y, (1 - frac)*2) if frac > 0.5 else (y, r, (0.5 - frac)*2)
    return tuple(int(a[i] + (b[i] - a[i])*u) for i in range(3))

def text(im, cx, cy, t, size, col, glow=False, alpha=1.0):
    if alpha <= 0: return
    d = ImageDraw.Draw(im, 'RGBA'); font = ImageFont.truetype(B.FONT, int(size*B.SC)); w = d.textlength(t, font=font)
    if glow:
        g = Image.new('RGBA', im.size, (0, 0, 0, 0)); ImageDraw.Draw(g).text((cx*B.SC - w/2, cy*B.SC), t, font=font, fill=tuple(col) + (int(150*alpha),), anchor='lm')
        g = g.filter(ImageFilter.GaussianBlur(14*B.SC)); im.paste(g, mask=g.split()[3])
    d.text((cx*B.SC - w/2, cy*B.SC), t, font=font, fill=tuple(col) + (int(255*alpha),), anchor='lm')

def draw_boss(f, bx, by, rem, t=0.0):
    """OPT #9 boss: obsidian armoured demon ball. Spiked rotating armour crown, lava cracks that spread as health drops,
    glowing angry eyes, horns, jagged mouth; segmented health bar sits ABOVE the boss, number stays inside."""
    so, dv, gl = f.sctx, f.dctx, f.gctx; frac = max(rem, 0)/BOSS_HP; R = R_BOSS
    rage = 1 - frac; pulse = 0.5 + 0.5*math.sin(t*6)
    # red aura
    au = cairo.RadialGradient(bx, by, R*0.9, bx, by, R*1.55)
    au.add_color_stop_rgba(0, 1, .15, .1, .05 + .06*rage); au.add_color_stop_rgba(1, 1, .1, .1, 0)
    gl.arc(bx, by, R*1.55, 0, 2*math.pi); gl.set_source(au); gl.fill()
    # spikes (rotating crown, 14 spikes)
    n = 14; rot = t*0.35
    for k in range(n):
        a = rot + k*2*math.pi/n; w = math.pi/n*0.62; L = R*(1.28 if k % 2 == 0 else 1.15)
        so.move_to(bx + math.cos(a - w)*R*0.92, by + math.sin(a - w)*R*0.92)
        so.line_to(bx + math.cos(a)*L, by + math.sin(a)*L); so.line_to(bx + math.cos(a + w)*R*0.92, by + math.sin(a + w)*R*0.92); so.close_path()
        g = cairo.LinearGradient(bx + math.cos(a)*R*0.9, by + math.sin(a)*R*0.9, bx + math.cos(a)*L, by + math.sin(a)*L)
        g.add_color_stop_rgba(0, *B.rgb((46, 50, 66), 1)); g.add_color_stop_rgba(1, *B.rgb((200, 206, 224), 1)); so.set_source(g); so.fill_preserve()
        so.set_source_rgba(*B.rgb((255, 90, 70), .85)); so.set_line_width(1.8); so.stroke()
    # obsidian body
    gr = cairo.RadialGradient(bx - R*0.35, by - R*0.4, 8, bx, by, R)
    gr.add_color_stop_rgba(0, *B.rgb((92, 84, 112), 1)); gr.add_color_stop_rgba(.5, *B.rgb((30, 26, 44), 1)); gr.add_color_stop_rgba(1, *B.rgb((8, 6, 14), 1))
    so.arc(bx, by, R, 0, 2*math.pi); so.set_source(gr); so.fill()
    so.arc(bx, by, R, 0, 2*math.pi); so.set_source_rgba(*B.rgb((255, 80, 60), .9)); so.set_line_width(4); so.stroke()
    so.arc(bx, by, R*0.9, math.radians(200), math.radians(270)); so.set_source_rgba(1, 1, 1, .22); so.set_line_width(5); so.stroke()
    # armour plate lines
    so.save(); so.arc(bx, by, R - 3, 0, 2*math.pi); so.clip()
    for k in range(6):
        a = rot*0.5 + k*math.pi/3; so.move_to(bx + math.cos(a)*R*0.55, by + math.sin(a)*R*0.55); so.line_to(bx + math.cos(a)*R, by + math.sin(a)*R)
        so.set_source_rgba(*B.rgb((120, 112, 150), .5)); so.set_line_width(3); so.stroke()
    # lava cracks, more with damage
    rnd = random.Random(11)
    for k in range(int(4 + rage*16)):
        a = rnd.uniform(0, 2*math.pi); x, y = bx + math.cos(a)*R, by + math.sin(a)*R; so.move_to(x, y); L = rnd.uniform(50, 120) + 70*rage
        for s_ in range(5):
            a += rnd.uniform(-.55, .55); x -= math.cos(a)*L/5; y -= math.sin(a)*L/5; so.line_to(x, y)
        so.set_source_rgba(*B.rgb((255, 120, 40), .35 + .5*rage)); so.set_line_width(5); so.stroke_preserve()
        so.set_source_rgba(*B.rgb((255, 225, 120), .9)); so.set_line_width(1.8); so.stroke()
    so.restore()
    # horns
    for sg in (-1, 1):
        so.move_to(bx + sg*R*0.42, by - R*0.82); so.curve_to(bx + sg*R*0.62, by - R*1.25, bx + sg*R*0.98, by - R*1.3, bx + sg*R*1.08, by - R*1.62)
        so.curve_to(bx + sg*R*0.9, by - R*1.1, bx + sg*R*0.82, by - R*0.95, bx + sg*R*0.62, by - R*0.72); so.close_path()
        g = cairo.LinearGradient(bx, by - R*0.8, bx, by - R*1.6); g.add_color_stop_rgba(0, *B.rgb((50, 44, 64), 1)); g.add_color_stop_rgba(1, *B.rgb((235, 228, 205), 1))
        so.set_source(g); so.fill_preserve(); so.set_source_rgba(*B.rgb((255, 90, 70), .8)); so.set_line_width(2); so.stroke()
    # angry eyes + brows
    for sg in (-1, 1):
        ex, ey = bx + sg*R*0.36, by - R*0.38
        e = cairo.RadialGradient(ex, ey, 2, ex, ey, R*0.22); e.add_color_stop_rgba(0, 1, 1, .8, .5); e.add_color_stop_rgba(.35, 1, .25, .1, .35); e.add_color_stop_rgba(1, 1, .1, .1, 0)
        gl.arc(ex, ey, R*0.22, 0, 2*math.pi); gl.set_source(e); gl.fill()
        so.move_to(ex - sg*R*0.26, ey - R*0.06); so.line_to(ex + sg*R*0.26, ey - R*0.2); so.line_to(ex + sg*R*0.24, ey + R*0.1); so.line_to(ex - sg*R*0.18, ey + R*0.14); so.close_path()
        so.set_source_rgba(*B.rgb((255, 240, 170), 1)); so.fill()
        so.arc(ex + sg*R*0.04, ey, R*0.065, 0, 2*math.pi); so.set_source_rgba(0, 0, 0, 1); so.fill()
        so.move_to(ex - sg*R*0.34, ey - R*0.26 + sg*R*0.0); so.line_to(ex + sg*R*0.3, ey - R*0.1 - R*0.0); so.set_source_rgba(0, 0, 0, 1); so.set_line_width(9); so.stroke()
    # jagged mouth
    my = by + R*0.42; so.move_to(bx - R*0.5, my)
    for k in range(9):
        so.line_to(bx - R*0.5 + (k + .5)*R*0.111, my + (R*0.16 if k % 2 == 0 else -R*0.02))
    so.line_to(bx + R*0.5, my); so.curve_to(bx + R*0.3, my + R*0.32, bx - R*0.3, my + R*0.32, bx - R*0.5, my); so.close_path()
    so.set_source_rgba(*B.rgb((30, 4, 6), 1)); so.fill_preserve(); so.set_source_rgba(*B.rgb((255, 90, 70), .9)); so.set_line_width(2.5); so.stroke()
    # segmented health bar above the boss (20 segments)
    bw_, bh_ = 300, 26; x0, y0 = bx - bw_/2, by - R*1.72 - 40
    B.rounded_rect(so, x0 - 5, y0 - 5, bw_ + 10, bh_ + 10, 12); so.set_source_rgba(*B.rgb((10, 12, 22), .95)); so.fill()
    segs = 20; sw = (bw_ - 4)/segs
    for k in range(segs):
        lit = (k + 1)/segs <= frac + 1e-9 or (k/segs < frac)
        if lit:
            B.rounded_rect(so, x0 + 2 + k*sw + 1, y0 + 3, sw - 2, bh_ - 6, 3); so.set_source_rgba(*B.rgb(hcol(frac), 1)); so.fill()
    B.rounded_rect(so, x0 - 5, y0 - 5, bw_ + 10, bh_ + 10, 12); so.set_source_rgba(*B.rgb((255, 90, 70), .95)); so.set_line_width(2.2); so.stroke()

def title(im, secs=None):
    B.headline(im, [[("CAN ", B.C['text']), ("FIBONACCI", B.C['yellow']), (" DESTROY", B.C['text'])],
                    [(TITLE_HP, B.C['yellow']), (f" IN UNDER {LIMIT} SECONDS?", B.C['text'])]], y0=54, size=56, gap=1.12)

def timer(im, left):
    """countdown clock under the box (the title always says 60 seconds)"""
    left = max(left, 0.0); s_ = int(math.ceil(left)); t = f"{s_//60}:{s_%60:02d}"
    text(im, 540, 1262, t, 64, (244, 246, 255), True)

def draw_num(im, bx, by, rem):
    tx = f"{int(rem):,}"
    if NUM_HOOK:
        px, py, acc = NUM_HOOK(bx, by); d = ImageDraw.Draw(im, 'RGBA'); fnt = ImageFont.truetype(B.FONT, int(26*B.SC)); w = d.textlength(tx, font=fnt)/B.SC
        d.rounded_rectangle([(px - w/2 - 18)*B.SC, (py - 19)*B.SC, (px + w/2 + 18)*B.SC, (py + 19)*B.SC], radius=int(19*B.SC), fill=(10, 12, 22, 235), outline=tuple(acc) + (255,), width=max(2, int(2*B.SC)))
        d.text((px*B.SC, py*B.SC), tx, font=fnt, fill=(244, 246, 255, 255), anchor='mm')
    else: text(im, bx, by + R_BOSS + 42, tx, 36 if len(tx) <= 11 else 30, (244, 246, 255), False)

def draw(out, hit, boss, hitter, secs_left, flash_pt=None):
    f = B.Frame(cx=540, cy=830, floor_y=1215, seed=9); gl = f.gctx
    def boxp(c): B.rounded_rect(c, BX, BY, BW, BH, 10)
    f.boundary(boxp, B.C['glow'], 0.0, 3.5)
    rem = max(BOSS_HP - total(hit), 0); bx, by = boss
    draw_boss(f, bx, by, rem)
    f.ball(hitter[0], hitter[1], R_HIT, B.C['glow'])
    if flash_pt:
        for k in range(10):
            a = k*2*math.pi/10
            gl.move_to(flash_pt[0], flash_pt[1]); gl.line_to(flash_pt[0] + math.cos(a)*12, flash_pt[1] + math.sin(a)*12)
            gl.set_source_rgba(*B.rgb(B.C['yellow'], .9)); gl.set_line_width(2); gl.stroke()
    im = f.compose().convert('RGB')
    if NUM_HOOK:      # OPT #9: HP number in a pill above the health bar
        px, py, acc = NUM_HOOK(bx, by); d = ImageDraw.Draw(im, 'RGBA'); tx = f"{rem:,}"; fnt = ImageFont.truetype(B.FONT, int(26*B.SC)); w = d.textlength(tx, font=fnt)/B.SC
        d.rounded_rectangle([(px - w/2 - 18)*B.SC, (py - 19)*B.SC, (px + w/2 + 18)*B.SC, (py + 19)*B.SC], radius=int(19*B.SC), fill=(10, 12, 22, 235), outline=tuple(acc) + (255,), width=max(2, int(2*B.SC)))
        d.text((px*B.SC, py*B.SC), tx, font=fnt, fill=(244, 246, 255, 255), anchor='mm')
    else: text(im, bx, by + R_BOSS + 42, f"{rem:,}", 36 if len(f"{rem:,}") <= 11 else 30, (244, 246, 255), False)
    text(im, 540, 262, fmt_dmg(fib(hit)), 78, B.C['glow'], True)
    if flash_pt: text(im, flash_pt[0] - 40, flash_pt[1] + 90, "-" + fmt_dmg(fib(hit)), 40, (255, 78, 98), True, 0.4)
    title(im)
    timer(im, secs_left)
    if out: im.save(out)
    return im

if __name__ == '__main__':
    B.set_scale(float(sys.argv[3]) if len(sys.argv) > 3 else 1.0)
    hit = int(sys.argv[2]) if len(sys.argv) > 2 else 41
    draw(sys.argv[1], hit, (600, 700), (500, 855), max(60 - int(hit*1.2), 1), flash_pt=(520, 818))
