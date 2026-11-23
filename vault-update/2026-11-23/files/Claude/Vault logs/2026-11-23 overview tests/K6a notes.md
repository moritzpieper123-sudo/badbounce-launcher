# K6a notes
- Engine is deterministic (no seed): Factorial vs Fib(3n), hit every 2.25 s, 11 blocks 1M..10Oc; Factorial wins by the formulas (not steered). Scale 0.5.
- Duration 65.07 s, 540x960, 30 fps, H.264 yuv420p + AAC, 1.4 MB.
- Engine changes: (1) title already ALL CAPS `FACTORIAL OR FIBONACCI?` (patched earlier in k6_bong.py); (2) bb_render.py: old faint watermark replaced by standard BADBOUNCE (Inter Black 22 px, spacing 4.2, #AAC3F0, baseline y 1792, centred); (3) k6_bong_video.py: end tail after win 4.0 s -> 2.0 s (no long empty ending). The existing short slow-mo window around the finish touch is unchanged (ending effect, not length steering).
- Checks: ffprobe ok; frames at 1/33/63.5 s show caps title (FACTORIAL red, FIBONACCI blue, OR/? white) and one standard watermark; thumbnail 1080x1920 with caps title, FINISH yellow, standard watermark, no numbers >=1,000. Description unchanged (no counts, flag-safe, 5 hashtags).
