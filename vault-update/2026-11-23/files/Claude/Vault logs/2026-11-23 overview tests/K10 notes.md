# K10 notes
- Engine v4 (README command): GC_SEED=15 GC_FORCE=0,5,2,7,0 GC_SEED2=38 GC_FINAL=500 GC_BURST_S=1.3 GC_LAYOUT default (x20,SPLIT 3,MERGE,x5,SKULL,+10,?,x3), scale 0.5, crf 24.
- Seed search over GC_SEED2 1-39: bursts fall on the 3.45 s cycle grid (55.3 / 58.8 / 62.2 / 65.6 / 69.1 s); seed 38 chosen (burst 65.6 s, 10,925 balls). Seeds 15/24/26/32 also gave 62.2 s.
- Final duration 66.97 s, 540x960, 30 fps, H.264 yuv420p + AAC, 12 MB.
- Counter: shown values scaled by 11,000/10,925 so it ends exactly on 11,000 after the burst (thumbnail "1 BALL -> 11,000", description has no count).
- Engine changes: standard BADBOUNCE watermark in bb_render.py (also on thumbnail); counter scaling (NICE/RATIO) in gc_video4.py; Pool(2).
- Checks: ffprobe, frames at 1 s, 33 s, 64 s, 65.5 s, 66.8 s (watermark ok, counter ends 11,000); thumbnail 1080x1920 caps, HOLD? yellow.
- Note: the counter reads 5,242 at 65.5 s, just before the last x20 slam resolves, then jumps to 11,000 at the burst.
