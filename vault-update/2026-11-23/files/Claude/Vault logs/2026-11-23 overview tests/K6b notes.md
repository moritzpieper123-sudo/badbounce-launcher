# K6b notes
- Seed 13 (Game route seed), boss #2 Ember Horned Grump, scale 0.5, 540x960 30 fps, 61.1 s.
- Params: K6B_HP=30,000,000,000 (title "30 BILLION"), K6B_N=50 hits (Fibonacci total after 50 hits = 32.95B, last hit 12.6B), limit text/clock 70 s.
- Engine changes (eng/K6b): standard watermark in bb_render.py; env-driven HP/hits/limit/seed; slow-mo warp removed (constant speed); tail after boom 3.4 -> 2.2 s; title "IN UNDER 70 SECONDS" and clock counts 1:10 -> freezes at the last hit; Pool(2).
- Title and description say "under 70 seconds" (not 60) because the video must be 60-70 s; counts: 30 billion (exact round number).
- Checks: ffprobe 540x960 30 fps h264 + aac 61.1 s, 2.5 MB; frames at 1 s, 30 s, 59 s show caps title with yellow key words, watermark, clock, damage counter ends on 12.6B.
