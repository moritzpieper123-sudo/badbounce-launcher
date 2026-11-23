---
tags: [konzept, K7b]
id: K7b
aliases: ["K7b", "Shape filler: layers"]
---
# K7b: Shape filler: layers

Back to [[Konzepte/Konzepte Overview|Konzepte Overview]] · Engine: [[Engine/K7b/README|K7b engine]] · Family: [[Konzepte/Konzept 7/Konzept 7|K7a Pulse ring]]. Shared rules apply to both variants; the pulse parts are replaced by K7a.

![[Konzepte/Konzept 7/Final/K7b thumbnail.png|200]]

**Standard reference video:** `Konzepte/Konzept 7/Final/K7b video.mp4` (reference only, never uploaded; every upload is a fresh `Gen` video).
**Description template:** `Every bounce adds a new layer… will the ball box itself in? 🟣` + `#satisfying #oddlysatisfying #physics #simulation #layers` (flag-safe, max 5 hashtags).

## Standard rules (current, wins over everything below)
> Built from the Opt rounds #3 to #13 (cleaned 2026-11-23). The brand style and the rules for every Konzept are in [[Konzepte/Konzepte Overview|Konzepte Overview]] and the Gen skill. The History below applies only where these Standard rules say nothing.

### Final rules: Layers (final 2026-11-11, still standard, no Opt round)
- **60-70 s (Mo 2026-11-23):** the final ran 25 s; reach 60-70 s with more layers (thinner steps) and the ball speed, never by slow motion. Thumbnail layer count rounded down to 50. Test video 2026-11-23: `SF_SEED=7`, N=155 layers in `sf_frames.py`, 64.6 s, thumbnail `1 BALL -> 150 LAYERS`.
- A little less bright. Finish: rings light up from the middle outward like a light wave, the ding plays right after the outer layer, then the whole shape lights up, all within 1 s.
- **Thumbnail:** less bright, ball centred, same text.
- **Final video:** run `python sf_video.py layers out.mp4 1.0`, `python thumb_sf.py layers thumb.png`.

> **Finals are reference videos only.** They live in `Final/` and in the launcher Overview page; they are never uploaded. Every upload is a fresh `Gen` video built with these rules.


### Principle
One closed arena (shape), the result is shown by the shape filling up. Question title, result is always yes (fully filled), no speed-up, no loop. Two variants:

1. **Pulse ring** (circle, blue). A wave starts with a simple ball in the layer colour. Its first wall hit turns it into a ring (same bounce physics). Every further wall hit makes the ring a small step bigger; after 5 to 8 hits it fills the free circle and the layer locks in. The next wave starts with a ball from the same spot and direction (no reset). Bounce angle varies a bit (about +/-0.28 rad). 26 layers, about 37 s.
2. **Layers** (hexagon, violet). A ball bounces, every wall hit adds one layer on the wall until the ball is boxed in. 54 layers, ball 700 px/s, about 25 s. The done chime and the end flash come exactly when the ball stops.


### Look (Mo's rules)
- Coloured glow rings, one hue per variant, light tone at the wall and deep tone toward the centre.
- Drawn as crisp cairo vector paths on the glow layer (annulus tint, glowing stroke per layer, round joins). NEVER a pixel grid scaled down. This is a standing rule for every concept with rings or layers.
- Badbounce brand renderer: floating arena above the glass floor, title at the top.
- Titles: "CAN ONE RING FILL THE CIRCLE?" and "CAN ONE BALL BOX ITSELF IN?" (key word yellow).


### Sound
- Rising-pitch glassy tick per wall hit (soft ticks on the pulse wall hits), no music.
- Ending: NO boom (nothing breaks). A bright "done" chime (E6 then B6), quiet, exactly on the frame the shape is complete.
- End screen: slight green flash (not white).


### Thumbnail and description (approved)
- Thumbnail: finished-look frame at about 55 percent progress, no pop flash, yellow "<ball or ring> -> <layer count>" line plus the question. Script thumb_sf.py.
- Description: one sentence plus emoji, then max 5 tags (TikTok limit, no #badbounce): four standard tags plus one concept tag, for example `#satisfying #oddlysatisfying #physics #simulation #fillthecircle` (pulse) or `... #layers` (layers).
