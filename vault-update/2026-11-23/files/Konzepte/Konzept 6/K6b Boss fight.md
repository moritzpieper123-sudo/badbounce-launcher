---
tags: [konzept, K6b]
id: K6b
aliases: ["K6b", "Boss fight (100-boss library)"]
---
# K6b: Boss fight (100-boss library)

Back to [[Konzepte/Konzepte Overview|Konzepte Overview]] · Engine: [[Engine/K6b/README|K6b engine]] · Family: [[Konzepte/Konzept 6/Konzept 6|K6a Math damage battle]].

![[Konzepte/Konzept 6/Final/K6b thumbnail.png|200]]

**Standard reference video:** `Konzepte/Konzept 6/Final/K6b video.mp4` (reference only, never uploaded; every upload is a fresh `Gen` video).
**Description template:** `Can [rule] destroy [health] in under 70 seconds? One ball, one boss… every hit is the next [rule] number 🔢` (hashtag `#[rule]`) + `#satisfying #oddlysatisfying #physics #simulation #fibonacci` (flag-safe, max 5 hashtags).

## Standard rules (current, wins over everything below)
> Built from the Opt rounds #3 to #13 (cleaned 2026-11-23). The brand style and the rules for every Konzept are in [[Konzepte/Konzepte Overview|Konzepte Overview]] and the Gen skill. The History below applies only where these Standard rules say nothing.

- **60-70 s (Mo 2026-11-23):** the approved test ran 57 s; pick boss health / hit count (and seed) so the boss dies between 60 and 70 s.
- **Boss:** any of the 100 library bosses (`Engine/K6b/boss_library.py`, `L.use(N-1)`, names in `Boss library/Boss list.txt`, default #002 Ember Horned Grump). Radius 112 (was 150). Segmented health bar (150 px) ABOVE the boss, HP number in a dark pill above the bar (border = boss accent colour), white ball above the pill in the thumbnail.
- **Sound:** hit = Soft punch (deep thud 85 Hz + 2 Hz/hit, drop + muffled noise puff, no glass/metal); wall bounce = the K10 tick (2300 Hz +-900, gain 0.06-0.16). Boom at the end stays.
- **Damage number (red):** fixed spawn spot per hit, never on boss/hitter, free spot in the box; pop-in 0.26 s with overshoot, ease-out rise 46 px, from 0.4 s shrinks to ~1/3 while fading; drawn as a 4x sprite with sub-pixel affine (no stepping).
- **Hit burst:** 0.3 s, ring + 16 rays + 14 sparks.
- **Thumbnail:** `thumb_k6b.py <out> [N]` = start state, "WILL THE BOSS SURVIVE?".
- Engine: `Engine/K6b/` (k9_frames.py, k9_video.py `BOSS=<N> python k9_video.py out.mp4 scale`, boss_library.py, thumb_k6b.py). Approved test: `Final/`.

## History (older rules, reference only)
#### Old header notes
Started 2026-11-08 in thread "Setup #5" from the launcher idea "New damage increase fight concept" (Konzept 6). Reference video: Ideas/files/2026-11-05-v12025gd0000dbf7a2nog65sanmp4gcg.mp4 (link https://vm.tiktok.com/ZGdXrxdb2/).


### Final rules (review rounds 2026-11-11 to 2026-11-13)

> These final rules come from Mo's Overview review rounds 1 to 7 (2026-11-11 to 2026-11-13). **They win over every older rule further down this sheet.** Final files: `Drafts/Final/`. Exact final engine: `Engine/K6b/` (with `report.md`).

#### Final rules: Mode 6b Boss fight (final 2026-11-13)
- **Boss:** a big devilish ball: very dark red radial gradient (near-black rim) with a subtle dark crimson vein texture, angry demon eyes (`Branding/.assets/K6b boss eyes.png`, both eyes with their black slit pupil), eyes glow red a little and have a thin pale cream outline (2.5 px at 1080) so they stand out. Health number and bar inside stay readable.
- **Hitter:** the white ball speeds up a little on every bounce (replaces the old constant-speed rule).
- **Damage counter:** standard count-up on every hit (0.5 s ease-out, grows up to +16% while counting, then settles).
- **Clock:** in the last 10 s it turns a yellow/red gradient and shakes like an alarm clock, more and more. The timer **freezes** when the boss dies.
- **Sound:** short egg-crack break sound on the hits (`Branding/Sounds/Egg crack (shorten).mp3`) plus the K6 tones; deep boom at the end.
- **Final video:** seed 131, 63.3 s, 30 fps (still a little over 60 s; fine for now). Engine needs `../assets/` (eyes image, sounds). Run: `python k9_video.py out.mp4 1.0`, `python thumb_k9.py thumb.png`.

> **Finals are reference videos only.** They live in `Final/` and in the launcher Overview page; they are never uploaded. Every upload is a fresh `Gen` video built with these rules.


### Analysis of the reference (576x1024, 62.7 s, picture only)
- Title with countdown: "CAN CATALAN DESTROY 1 UNDECILLION IN UNDER 59 SECONDS", the seconds drop every 3 s down to 2.
- One box, one boss ball with a huge health number shown as digits inside it (999,999,999,... = 1 undecillion). Both the hitter and the boss move around.
- Damage under the box follows a maths rule: 1, 5, 429, 208,012, 129,644,790 ... are Catalan numbers. Health digits count down after every hit, red cracks spread over the boss, ends in a big explosion with shards.
- Look is cream with a grid and gold trail: off-brand, only the principle is used.


### Mo's answers (2026-11-08)
- One boss ball with its health number; the boss moves around.
- Standard glow-white box.
- First rule: Fibonacci.
- Title with a countdown, "under 70 seconds" (Mo 2026-11-23: videos are 60-70 s; clock counts down from 1:10 and freezes at the last hit). Test video 2026-11-23: boss #2, health 30 billion, 50 Fibonacci hits, 61 s, no slow motion at the end (`K6B_HP`, `K6B_N`, seed env in `k9_video.py`).
- Health shown as a bar plus the number inside the boss.
- Crack effect on the boss as it gets weaker: yes.
- Damage number under the box and floating hit number as in Konzept 6: yes.
- Ending: big explosion.
- Result always yes. The boss dies after 40 to 60 s.
- Sound follows the Konzept 6 rules (same tone per hit, slightly rising pitch, deep boom at the end).


### Look rules (2026-11-08)
- Title: "CAN FIBONACCI DESTROY 1 BILLION IN UNDER 60 SECONDS?" with FIBONACCI and 1 BILLION in yellow, the rest warm white. This is the default for all videos. The title always says "under 60 seconds"; the countdown clock sits under the box.
- Hitter ball moves at constant speed (no speeding up or slowing down); slow motion only around the final hit.
- Hit sound: soft glass tone, slightly rising pitch, quiet tok on wall hits, deep boom at the end, every sound faded.
- Thumbnail: boss ball centred in the box, white ball centred above it with a small gap, "WILL THE BOSS SURVIVE?" below (BOSS yellow).
- Description (approved), max 5 hashtags (TikTok limit, no #badbounce), the last tag follows the rule:
```
Can Fibonacci destroy 1 billion in under 60 seconds? One ball, one boss… every hit is the next Fibonacci number 🔢💥
#satisfying #oddlysatisfying #physics #simulation #fibonacci
```


### Maths (checked)
- Fibonacci, hit n deals F(n): after 42 hits the total is 701,408,732, after 43 hits 1,134,903,169. So a boss with 1,000,000,000 health dies on hit 43. At about 1.2 s per hit that is about 52 s, inside the 40 to 60 s window.
- Doubling, hit n deals 2^(n-1): 40 hits reach 1 trillion.
- Powers of 3, hit n deals 3^(n-1): 20 hits reach 1 billion.


### Status
✅ Done. Mo picked Fibonacci / 1 billion, test video v3, thumbnail and description were approved (2026-11-08), and the mode is saved in the Gen skill (section "Konzept 6b").
