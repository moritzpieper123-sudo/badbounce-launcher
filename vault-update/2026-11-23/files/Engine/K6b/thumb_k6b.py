"""OPT #9 K6b thumbnail: start state with library boss N (default 2), HP pill + bar above it, white ball above the pill with a gap, hook text over the reflection. Usage: python thumb_k6b.py <out.png> [boss 1-100]"""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import k9_frames as K, bb_render as B, boss_library as L
def thumbnail(out, n=2):
    B.set_scale(1.0); L.use(n - 1)
    bx, by = 540, 790; px, py, _ = K.NUM_HOOK(bx, by)
    im = K.draw(None, 0, (bx, by), (540, py - 19 - 34 - K.R_HIT), K.LIMIT)
    B.headline(im, [[("WILL THE ", B.C['text']), ("BOSS", B.C['yellow'])], [("SURVIVE?", B.C['text'])]], y0=1330, size=84, gap=1.05)
    im.save(out); return im
if __name__ == "__main__": thumbnail(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 2)
