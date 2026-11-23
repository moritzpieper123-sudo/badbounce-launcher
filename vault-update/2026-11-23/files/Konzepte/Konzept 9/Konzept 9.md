---
tags: [konzept, K9]
id: K9
aliases: ["K9", "Sheet drop (100 shapes)"]
---
# K9: Sheet drop (100 shapes)

Back to [[Konzepte/Konzepte Overview|Konzepte Overview]] · Engine: [[Engine/K9/README|K9 engine]]

![[Konzepte/Konzept 9/Final/K9 thumbnail.png|200]]

**Standard reference video:** `Konzepte/Konzept 9/Final/K9 video.mp4` (reference only, never uploaded; every upload is a fresh `Gen` video).
**Description template:** `Every ring bounces at its own speed... and the wave appears. 🌈` + `#satisfying #oddlysatisfying #physics #simulation #asmr` (flag-safe, max 5 hashtags).

## Standard rules (current, wins over everything below)
> Built from the Opt rounds #3 to #13 (cleaned 2026-11-23). The brand style and the rules for every Konzept are in [[Konzepte/Konzepte Overview|Konzepte Overview]] and the Gen skill. The History below applies only where these Standard rules say nothing.

- **60-70 s (Mo 2026-11-23):** the test ran 28 s; reach 60-70 s by keeping the rings bouncing longer (`FULL_UNTIL`, energy loss `E`, more drops/waves), every contact keeps ticking. Test video 2026-11-23: shape 42 (circle), `FULL_UNTIL=50` (env), 30 fps, 63.4 s, standard watermark.
- **Watermark:** standard BADBOUNCE in the video (`watermark()` in `sd_video_shapes.py`, added 2026-11-23); the thumbnail stays without text.
- **Sound:** the K10 wall tick replaces the ceramic tok (pentatonic note per ring, louder for higher bounces). Test: [[Konzepte/Konzept 9/Final/K9 video.mp4|standard video]].
- **Shape library:** 100 shapes (list: [[Engine/K9/shape-list.txt|shape-list]], preview: `Engine/K9/K9 shape library - contact sheet.png`). The shape sets the sheet footprint AND the glass floor (floor = same outline, 9% bigger; rings = scaled copies). One shape per video, never repeat a shape with the same gradient (check the Results Index).
- **Thumbnail (Mo 2026-11-22, wins):** the video's own shape as an UPSIDE-DOWN pyramid (centre lowest, outer rows high, small balls x0.6 so every row shows), standard video perspective, floor under it, **NO text** (no title, no BADBOUNCE), picture centred. Thumbnail shape ALWAYS = video shape. `K9_SHAPE=<N> python thumb_sd_shapes.py out.png`.
- **Engine** (`Engine\K9\`): `sd_shapes.py`, `sd_shape_frame.py`, `sd_video_shapes.py` (`K9_SHAPE=1..100`, `K9_CAP=6` short test), `thumb_sd_shapes.py`. Not done: full-quality render with 60 s+ pacing.

## History (older rules, reference only)
#### Old header notes
Source idea: launcher idea "Satisfying ball sheet drop" (2026-11-05). Reference: [[Ideas/files/2026-11-05-v26044gc0000db90iknog65rhh03kiug.mp4|reference video]] (34 s, 576x1024, TikTok watermark @blend3dfy; only the format was used, not their look). Mo skipped the 30 questions and steered by test rounds.


### Final rules (review rounds 2026-11-11 to 2026-11-13)

> These final rules come from Mo's Overview review rounds 1 to 7 (2026-11-11 to 2026-11-13). **They win over every older rule further down this sheet.** Final files: `Drafts/Final/`. Exact final engine: `Engine/K9/` (with `report.md`).

#### Final rules: Sheet drop (final 2026-11-11, approved)
- A little less bright: ball colours x0.82, bloom 0.55, brand glow 0.65.
- **Finish:** once all rings lie flat, a quick light-up runs from the inner ring outward (0.9 s, each ring decays in ~0.45 s), no sound; hold 2.6 s after flat.
- **Thumbnail:** the wavy dome state (t = 11 s), same text.
- **Meme variant (later):** meme snippet per ring bounce instead of the tok.
- **Final video:** deterministic (no seed), sunset gradient, 29.5 s, 24 fps. Run: `python sd_video.py`, `python thumb_sd.py thumb.png 11`.

> **Finals are reference videos only.** They live in `Final/` and in the launcher Overview page; they are never uploaded. Every upload is a fresh `Gen` video built with these rules.


### 0. Locked rules (approved)
**Format:** a flat sheet (disc) of about 2,000 small balls in 34 concentric rings hovers above a glass floor circle. All balls drop at once and hit the floor together. Then every ring bounces off the floor, endlessly at the same high peak, each ring a little slower than the one outside it (centre about 8 % slower). The tiny speed difference drifts the rings apart on its own and builds a wave: flat disc, dome, funnel, spring. At about 15 s every ring slowly loses energy until the whole sheet lies flat on the floor. The video ends 1.5 s after that (about 28 s).

**Look**
- ONE colourful gradient per video on the balls (Mo's decision, not brand-limited). The colour follows the height of each ball (low = first colour, top = last colour). The gradient is picked per video and never changes inside a video. First video: sunset (purple, magenta, orange, yellow).
- Everything else is brand style: Void Black background, glass floor circle with a Frost Blue edge and a soft reflection, vignette, no text in the video.
- Round disc, tilted 3D view, glowing glossy balls (small highlight), 34 rings.

**Motion (locked after 3 corrections)**
- Hover 0.6 s, then the whole sheet drops together and lands on the FLOOR (never bounces in the air).
- Peak height about 850 px, outer ring period 2.4 s, each ring slower toward the middle (SLOW 8 %). Slow and calm.
- No energy loss until about 15 s, then restitution 0.8 per bounce until flat.

**Sound = Sound 2 "Ceramic tok" (Mo's pick)**
- One dry, short tok per ring per bounce (not a ding, not a long tone). Each ring has its own pitch (outer low about 110 Hz, centre high, stepped on a pentatonic scale), so you can follow ONE ring bouncing and hear the wave as a melody.
- Quieter toks while rings lose energy. No music, no thump. Rejected: wood thock, rubber thud, sub pluck, hollow tom, glass bloop.

**Thumbnail (1080x1920 PNG)**
The colourful funnel frame (about 7 s into the video), title "WATCH THE **WAVE**" (Inter Black, WAVE Signal Yellow) at the top, small "BADBOUNCE" at the bottom (`thumb_sd.py`).

**Description (.txt)**
```
Every ring bounces at its own speed... and the wave appears. 🌈 Wait for the funnel.

#satisfying #oddlysatisfying #physics #simulation #asmr
```

**Remix space (never repeat a combination; check the Results Index)**
Gradient (sunset, ocean, aurora, lava, candy ...), one per video; ring count; ring shape (round first, square or hex only after Mo approves a frame); peak height; outer period and SLOW percent; hover time; title wording; sound pitch set (K10 tick, see OPT #13).

**Engine** (`Engine\K9\`, the `sd_` prefix because `k9_` is Konzept 6b): `sd_frames.py` (ring points, perspective, glow, floor and reflection, `render(t)`), `sd_video.py` (motion plan per ring, synthesised audio, 24 fps frames to ffmpeg; test render about 1 min at 540x960 on 4 cores), `sd_sounds.py` (the 5 sound styles, for reference), `thumb_sd.py <out.png>`. Set `F.STOPS` for the gradient.
**Tests:** (old drafts, moved to Trash 2026-11-23) (v1 to v4 videos, frames, thumbnail and description drafts). The original sounds are kept in `Konzepte/Konzept 9/Sound Examples`.


### 1. Analysis of the reference
- A flat disc of about 1,500 balls in rings floats above a grey glass floor. Black background.
- Colour by height (purple low, orange middle, yellow top), smooth.
- The disc drops, the centre hits first, the outer rings later. The sheet bounces back up and folds into a cone and a funnel, then falls again. Loops without an end.
- The delay between rings is the core effect: a plain bounce becomes a visible rhythm.
- Why it works: endless loop, strong symmetry, hypnotic colour flow, no text needed.
- Weak points: only about 6 clear sound hits, so sound was weak. Watermark. Our version fixes this with one tok per ring.


### 2. History
v1 (air bounce, dings: wrong) -> v2 (drop, floor bounces, decaying: wrong, too short) -> v3 (endless high bounce, ring speeds) -> v4 (slower, Sound 2, ends flat) -> approved with thumbnail and description 2026-11-10.

Note (Mo, 2026-11-11): the description has no bracket line, only the sentence and the hashtags.
