# K5a notes
- Seed 423 (fresh; old reference/approved was 396). Seed search: `python search4.py 396 700 4 108 2.5 1.0 39 10` -> only 396 and 423 fit; 423: deaths 6.9 / 9.9 / 67.1 s (final 2-ball duel is long). Winner chosen by seed search (disclose).
- Params: V0 108, RAMP_A 2.5, RAMP_P 1.0, 39 start lines, +10 per wall bounce, 4 balls, scale 0.5.
- Duration 68.37 s, 540x960, 30 fps, H.264 yuv420p + AAC, 6.9 MB. Ends ~1.2 s after last death.
- Engine change: search4.py Pool(4) -> Pool(2) (CPU limit). Engine already has the standard watermark (BADBOUNCE 22px, 4.2 spacing, #AAC3F0, y1792); old watermark was only in the old reference file.
- Checks: verify.py 423 -> 0 lines touching a ball (strict rule OK); frames at 1/34/66.5 s: only one watermark, title WHO WILL WIN (caps, WIN yellow). Thumbnail 1080x1920, standard watermark. No counts in description.
