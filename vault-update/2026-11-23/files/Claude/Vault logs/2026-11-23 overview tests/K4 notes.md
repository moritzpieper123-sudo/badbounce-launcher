# K4 notes
- Seed 3 (tune target 60.7 -> kL 0.80, kv 1.200), escape at 62.5 s, 2,862 rings -> shown as 3,000 (counter starts at 3,000, thumbnail `3,000 LAYERS`). 16 streaks, first pass 0.39 s, gate open 45%.
- Song: Rihanna Umbrella test mp3 from k4-opt6 (/mnt/attach/project-files/k4-opt6), start 182.59 s (existing mp3 found, no extraction from old video needed).
- Render: `k4o6_video7.py 3 out 0.5 song.mp3 182.59`, 540x960 30 fps, final duration 69.0 s (62.5 s + approved 5.4 s end card), re-encoded crf 24 to be under 25 MB.
- Engine changes: watermark in k4o6_video2.py make_wm and bb_render._text -> Inter Black 22 px (scaled), letter spacing 4.2 px, #AAC3F0 opaque, baseline y 1792, centred. thumb5.py: seed 3, frame t=0.15.
- Checks: ffprobe, frames at 1 s/34 s/63 s/66.5 s/68.5 s (watermark, caps, counter 2,942 at 1 s, 0 at end card), thumbnail 1080x1920.
- Note: the end card is the approved standard (no empty tail); 69.0 s is close to the 70 s limit.
