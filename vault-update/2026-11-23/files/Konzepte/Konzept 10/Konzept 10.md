---
tags: [konzept, K10]
id: K10
aliases: ["K10", "Gamble crush"]
---
# K10: Gamble crush

Back to [[Konzepte/Konzepte Overview|Konzepte Overview]] · Engine: [[Engine/K10/README|K10 engine]]

![[Konzepte/Konzept 10/Final/K10 thumbnail.png|200]]

**Standard reference video:** `Konzepte/Konzept 10/Final/K10 video.mp4` (reference only, never uploaded; every upload is a fresh `Gen` video).
**Description template:** `One ball. One spinning crusher. Every box it slams decides: multiply… or disappear. Watch till the arena bursts ⚪` + `#satisfying #oddlysatisfying #physics #simulation #asmr` (flag-safe, max 5 hashtags).

## Standard rules (current, wins over everything below)
> Built from the Opt rounds #3 to #13 (cleaned 2026-11-23). The brand style and the rules for every Konzept are in [[Konzepte/Konzepte Overview|Konzepte Overview]] and the Gen skill. The History below applies only where these Standard rules say nothing.

### Final rules (2026-11-13, still standard; Mo: K10 is already good)
- **60-70 s (Mo 2026-11-23):** the final ran 57.9 s; reach 60-70 s by seed search (`GC_SEED2`) and the end threshold (`GC_FINAL`), then end 0.1 s after the last slam as before. Test video 2026-11-23 (v4 engine, see `Engine/K10/README.md`): `GC_SEED=15 GC_FORCE=0,5,2,7,0 GC_SEED2=38 GC_FINAL=500 GC_BURST_S=1.3`, burst at 65.6 s, 10,925 balls -> counter scaled to end on 11,000, thumbnail `1 BALL -> 11,000`. Bursts only land on the 3.45 s cycle grid.

> These final rules come from Mo's Overview review rounds 1 to 7 (2026-11-11 to 2026-11-13). **They win over every older rule further down this sheet.** Final files: `Final/`. Exact final engine: `Engine/K10/` (with `report.md`).

### Final rules: Gamble crush (final 2026-11-13)
- **Physics = the approved draft physics** (Mo 2026-11-13): zero gravity, drag 0.15, wall bounce 1.0, ball bounce 0.95, speed cap 650, spawn speeds 250-520 px/s, also after the burst (balls fly straight out). No gravity, no forced roaming or pull-to-middle.
- **Rhythm:** cycle 3.45 s (rest 0.4 s). Every box is used at least once; the skull only from 12 balls. Slot WIN sound on a multiplier or BIG, FAIL sound (descending buzzer + thud) on the skull.
- **Wall ticks (standard rule, Mo 2026-11-16):** every ball that bounces off the arena wall makes a tiny, quiet high tick (~1.4-3.2 kHz, 20 ms, random pitch, one per frame, louder with more hits, capped; about -25 to -15 dB under the slam). It adds to the other sounds, nothing else changes. Engine: `WH` log in `gc_sim3.py` (`'wall'` events) and the `'wall'` branch in `gc_video3.py`.
- **Spawn:** multiplied balls appear INSTANTLY at the slam, right at the plate face (crushing edge), and spread out from there. Crush zone 95 px in front of the plate; tiny early magnet toward the chosen box while under 40 balls. Ball radius 6.4.
- **Escalation:** once the flood starts, **3 forced x20 slams**. The box explodes **0.1 s after the last hit** (only slams that really spawn balls count). Counter has a thousands comma, counts up and grows, freezes exactly at the burst. Red pressure ramp over 5 s from the start of the flood. Target ≥ ~6,850 balls.
- **Thumbnail:** `1 BALL → [count]` / `WILL IT HOLD?`, count = final count rounded to the nearest thousand, and the counter ends on that number (Mo 2026-11-23).
- **Size:** keep under 25 MB (crf 22-24).
- **Meme variant (later):** meme image per ball, meme sound replaces the spawn pop.
- **Final video:** seed 13, 57.9 s, 30 fps, 8,084 balls (thumbnail 8,050). Run: `GC_FINAL=500 GC_LANE6=10 GC_SEED=13 GC_SCALE=1.0 python gc_video3.py out.mp4`, `python thumb_gc.py thumb.png` (`search_seed.py` = seed sweep; many seeds never escalate without gravity).

> **Finals are reference videos only.** They live in `Final/` and in the launcher Overview page; they are never uploaded. Every upload is a fresh `Gen` video built with these rules.


### 0. Locked rules (approved)
**Format:** an octagon arena with 8 effect boxes cut outward into the wall. In the middle, a crusher (T stamp) on a pivot. Every 4.1 s it rolls like a slot machine, stops on one box, then its stem shoots out and the plate sweeps the whole lane, shoving every ball in its path into that box. The box effect hits every caught ball. The video starts with ONE white ball, escalates slowly, and only bursts after full escalation (final ×20 floods the arena, about 55-65 s).

**Boxes** (clockwise from the top, colour = glow + label): ×2 purple, ×10 orange, ×3 teal, SMALL cyan, skull red, ×5 green, ×20 gold, BIG pink.
- ×N: every caught ball becomes N balls in the NEW round colour (one new saturated colour per multiply round, white start).
- Skull: every caught ball is destroyed (counter counts down). Blocked while fewer than 12 balls, so a video can never die early.
- BIG: caught balls ×1.9 size (max 2.6× base). SMALL: ×0.6 size (min 0.5× base).
- Empty boxes are often slammed too (nothing happens) and that builds tension.

**Look**
- No headline in the video. Brand style: black glass world, floor reflection, vignette, dust, watermark.
- Arena border: white, glowy (Glow White, 4 px). Only in the last 0.75 s before the burst it turns soft red (pressure).
- Container about 12 % bigger than the first test frame (R0 370 px, R1 461 px at 1080x1920, centre 540/830).
- Box glow: the box colour glows from the wall towards the middle and fades out smoothly about halfway into the box (no hard line). A box lights up when the crusher points straight at it (smooth in and out). No glow after the burst.
- Box labels: tops point to the centre (so the upper ones read upside down).
- Crusher: navy glass T stamp (pivot rivet, telescoping stem, plate), yellow strip on the outer slam face. Plate width = box width (about 200 px).
- Balls: r = 9 px at 1080 (60 % of the first frame), saturated palette, glow. Particles in the ball colour on every slam (red on skull).
- Counter above the container (Inter Black, y 250): counts up/down, grows a little on up, shrinks a little on down (team rule).

**Rhythm (fixed cycle 4.1 s)**
Slot roll 2.4 s (ease-out, tick each time a box is passed) → hold 0.15 s → slam out 0.15 s → effect → retract 0.35 s → rest. The roll spins more turns (faster) the more balls there are. Zero gravity, light drag, balls keep drifting.

**Hard rule:** no ball may EVER be outside the arena. The sim puts any pushed-out ball straight back inside (`contain()` in `gc_sim3.py`); check `outside 0` when searching seeds.

**Ending:** when the count passes 380, the next roll is forced onto ×20. The flood fills the arena, the border turns red, then the burst: flash, the border shatters into shards, a white dotted shockwave ring, all balls fly out of frame. Video ends 2.2 s after the burst.

**Sound (synthesised, physical, no music)**
Tiny wall tick on every ball-wall bounce (standard rule 2026-11-16), Slot tick per passed box (~760 Hz tok), deep slam thump (86 Hz) + crunch when balls are caught, pop burst on spawn (pitch rises with the multiplier), low dark thud on skull, pitch slide up/down for BIG/SMALL, deep sinking boom + noise on the burst. Silence in between.

**Thumbnail (1080x1920 PNG)**
Empty arena, crusher stopped on ×20 (glowing), one white ball in the ×20 lane. Title "1 BALL → [final count]" / "WILL IT **HOLD?**" (HOLD yellow). `thumb_gc.py <out.png>` (set the count in the file).

**Description (.txt)**
```
One ball. One spinning crusher. Every box it slams decides: multiply… or die 🎰 Watch till it breaks 💥

#satisfying #oddlysatisfying #physics #simulation #asmr
```

**Remix space (never repeat a combination; check the Results Index)**
Arena shape (octagon first; others only after Mo approves a frame), box order and multipliers, colour palette, start ball colour, final threshold, seed. Keep the 4.1 s cycle and the hard wall rule.

**Engine** (`Engine\K10\`, prefix `gc_`): `gc_frame.py` (arena, gate glow, labels, crusher `seesaw(f, ang, L)`), `gc_sim3.py` (cycle, director, physics, `contain()`, `run(seed)`; `python gc_sim3.py a b` scans seeds), `gc_video3.py` (env `GC_SEED`, `GC_SCALE`; renders video + audio, about 4 min at 0.5 scale on 4 cores), `thumb_gc.py`. They import `bb_render` from their own folder. Needs `pycairo numpy pillow scipy` + ffmpeg.
**Tests:** (old drafts, moved to Trash 2026-11-23) (v1-v4 videos, frames, thumbnail and description drafts, reference analysis). v4 = seed 2.

## History (older rules, reference only)
#### Old header notes
Source idea: launcher idea "Gamble Crush" (2026-11-05, tagged Konzept 1). Reference: [[Ideas/files/2026-11-05-v26044gc0000dbj1h17og65tvo8f5pig.mp4|reference video]] (@ballbreaker25 "Part 3", 576x1024, 59 s game). Only the format is used, never their look. Own Konzept because the mechanic (slot roll + box effects) differs from Konzept 1; it keeps the Konzept 1 colour rule (one new colour per multiply round).


### 1. Analysis of the reference
See [[Konzepte/Konzept 10/Gamble crush - reference analysis|Gamble crush - reference analysis]]. Key facts: fixed 3.3 s cycle (we use 4.1 s, Mo wanted a longer roll), slot roll, stem slam sweeps the lane, ×N per caught ball, new colour per round, skull kills, no gravity, 1 ball until ~9 s, finale ×20 → 430 balls, red border, dotted shockwave burst.


### 2. History
v1 (gates multiply on contact: wrong) → v2 (pusher glow + speed-up, still wrong mechanic) → v3 (rebuilt after the deep reference analysis) → v4 (longer roll, hard wall rule, bigger BIG) → approved with thumbnail and description 2026-11-10.
