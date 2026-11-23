# K9 notes
- Shape 42 Circle, sunset gradient, deterministic (no seed in engine). 540x960, 30 fps, 63.4 s, 20.6 MB.
- Params: K9_FULL=50 (full-energy bouncing until 50 s instead of 15 s), E=0.80, HOLD=1.5 s after all rings are flat; ring periods unchanged (no slow motion).
- Engine changes (eng/K9/sd_video_shapes.py): FPS 24 -> 30, FULL_UNTIL via env K9_FULL default 50, Pool(2). Watermark already in the engine (BADBOUNCE, baseline 1792).
- Thumbnail: 1080x1920, no text (sheet rule), shape = video shape. Description unchanged (no counts).
- Checks: ffprobe h264 540x960 30 fps + aac 63.4 s; frames at 1/32/62 s show watermark; ends 1.5 s after flat.
