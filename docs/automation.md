# Badbounce automation: how everything is linked (launcher 1.26.0)

**Data flow, in order**
1. **Stats** (hourly, hidden window): TikTok Studio -> `launcher-data/state.json` (`stats.posts`, `stats.days`). Posts are matched to videos by caption and scheduled time (`matchPosts` in `src/logic.ts`).
2. **Chooser** (`src/dayPlan.ts`): from those stats it scores every concept and variant (50% reach, 30% new followers, 20% watched to the end), keeps the test board and picks the concepts per free slot (4 test + 1 best-guess early, never the same concept in neighbouring slots, hot concepts first).
3. **Plan** (`src/cloud/dayRun.ts`, runs inside the launcher every minute while the Autopilot is ON): from 22:00 on day D it plans D+2. Slots that already hold a hand upload are skipped. Videos that already exist or are planned reserve the earliest free slots. Result: `auto.plans[date]` in state.json and `launcher-data/day-plan.json` (`{ plans: [ { date, items: [ { num, cid, variant?, kind, reason, slotIso } ] } ] }`).
4. **Mother thread** (Claude, wakes 00:00 Berlin): reads day-plan.json, asks the coordinator for one sub thread per missing video.
5. **Sub threads** (Claude): render with the Gen skill from the engines on the PC and save `Results\#N\Badbounce #N.mp4, Thumbnail #N.png, Description #N.txt, Notes #N.md`. The first lines of Notes are read by the launcher: `Konzept <n> (<ID>) <name>` and optionally `Variant: job|cat`.
6. **Launcher scan** (Results folder): a folder with video + thumbnail + description is "delivered". With Auto-approve ON it runs `electron/checks.js` (length 60-70 s, files, hashtags, silence); otherwise the video waits in the Control Room review queue.
7. **Review** (Control Room): Approve moves the video to the Upload page, Reject keeps it in Results and never offers it.
8. **Upload page**: `buildPlan` fills the slots; a video planned for a slot by step 3 keeps that slot. With the Autopilot ON only approved videos are offered. You upload by hand in TikTok Studio and tick "Mark uploaded".
9. Back to 1: the post you made shows up in the next stats pull and feeds the chooser.

**What must be on:** PC on overnight, launcher running (Autopilot ON, Evening plan ON), Claude app connected. Nothing in this chain uses Supabase.
