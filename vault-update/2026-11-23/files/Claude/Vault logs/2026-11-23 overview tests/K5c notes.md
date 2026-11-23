# K5c notes
- Seed CB_SEED=15, env CB_HITS=16 CB_TF0=1.2 CB_TF1=0.2 CB_G=1700; 65,535 lines -> counter ends on 66,000 (verified in frames at 59.5 s / 60.3 s), thumbnail `66,000 LINES`.
- Duration 60.73 s, 540x960 30 fps (frames at scale 0.5, 2 workers), re-encoded to 2.6 Mbit/s: 22 MB. Last rip at 58.1 s.
- Engine changes: standard watermark (bb_render._text: Inter Black 22 px, spacing 4.2, #AAC3F0, baseline y 1792, centred) now drawn in every frame and in the thumbnail (cb_v8.frame always calls _text); label `X2 EVERY BOUNCE` in caps with X2 yellow; post-final-rip tail shortened 3.8 s -> 2.5 s so the video ends about 2.5 s after the payoff (60.7 s total instead of 62 s).
- Colours: the engine palette is fixed (yellow->cyan gradient); seed changes only the ball start. Description: only 65,000 -> 66,000 changed (the fire emoji was kept from the old description).
- Checks: ffprobe, frames at 1/30/58/59.5/60.3 s (watermark, caps label, counter), thumbnail 1080x1920.
