# K7b notes
- Seed SF_SEED=7 (old final used 3), layers N=155 (was 54), ball speed 700 px/s unchanged, hexagon, violet.
- Run: SF_SEED=7 python sf_video.py layers out.mp4 0.5; SF_SEED=7 python thumb_sf.py layers thumb.png
- Duration 64.63 s, 540x960, 30 fps, H.264 yuv420p + AAC, 1.9 MB. No slow motion; ball ends boxed in, finish about 2 s after last bounce.
- Thumbnail "1 BALL -> 150 LAYERS" (155 rounded down to 50). Video has no layer counter.
- Engine changes: N 54->155 in sf_frames.py; Pool(4)->Pool(2); watermark in bb_render.py replaced by standard one (Inter Black 22 px, spacing 4.2, #AAC3F0, baseline 1792, centred, opaque).
- Checked: ffprobe, frames at 1 s, 32 s, 61.5 s, 63.5 s, 64.4 s (watermark, caps title, yellow BOX), thumbnail 1080x1920.
