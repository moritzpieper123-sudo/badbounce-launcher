---
tags: [hub, home]
---
# Badbounce

> Satisfying physics, one ball at a time ⚪

## Mind map
- [[Konzepte/Konzepte Overview|Konzepte]]: the 14 standard Konzepte (K1 to K10 with K5a/b/c, K6a/b, K7a/b), one sheet each
- [[Engine/Engine|Engine]]: one tested standard engine folder per Konzept
- [[Libraries/Libraries|Libraries]]: previews of machines, heads, flags, weapons, bosses, shapes, boxes + the sound library per Konzept
- [[Results/Results Index|Results]]: every finished video (#1, #2, …)
- [[Ideas/Ideas|Ideas]]: idea inbox from the launcher
- [[Branding/Branding|Branding]]: profile, colours, reference frame · [[Branding/Brand Style|Brand Style]]
- [[Analytics/Analytics|Analytics]]: views, followers, monetisation progress · [[Analytics/Tracker|Tracker]]
- [[Archive/Archive|Archive]]: on hold and discarded concepts, old engines and finals
- [[Claude/Claude|Claude]]: Claude's logs, cloud workspace copy and uploads from Mo
- Profile: [[Branding/Profile/Profile Picture.png|Profile picture]] ![[Branding/Profile/Profile Picture.png|80]]

## Folder map
| Folder | What is inside |
|---|---|
| `Konzepte/Konzept N/` | `Konzept N.md` (+ variant sheets like `K5b Battle box.md`), `Final/` = standard video, thumbnail, description per ID, `References/`, `notes.txt` |
| `Engine/<ID>/` | standard engine per ID (`README.md` first), `assets/`, `fonts/`, `Upload/` |
| `Libraries/` | asset previews + `Sounds/<ID>/` (rebuild: `python Engine\Libraries\build_libraries.py Engine Libraries`) |
| `Results/` | one folder `#X` per finished video |
| `Ideas/` | idea inbox, `files/` = saved videos |
| `Branding/` | brand style, profile, reference frame |
| `Analytics/` | tracker, niche research |
| `Archive/` | parked concepts, old engines, old finals |
| `Trash/` | removed items, same relative paths (restore by moving back) |
| `Claude/` | `Vault logs/`, `Cloud workspace/`, `Uploads from Mo/` |
| `.claude-workspace/` | launcher + launcher data only (hidden) |

## Commands
| Command | What happens |
|---|---|
| `Gen` | New thread "Video #X": one idea per Konzept, you pick, frame, then video + thumbnail + description |
| `Gen x3` | Batch of 3 videos (any number works) |
| `OPT` | New thread "Optimization #X": pick a Konzept or the launcher to improve |

## Monetisation path
1. TikTok Creator Rewards: 10,000 followers + 100,000 views in the last 30 days, age 18+, videos over 1 minute (check current rules in the TikTok app, they change).
2. Until then: grow with daily posts, test which Konzepte perform best.
