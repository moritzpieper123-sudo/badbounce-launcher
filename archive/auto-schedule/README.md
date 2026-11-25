# Auto-schedule (put aside 2026-11-24, launcher 1.21.0)

Mo uploads by hand, so every automatic TikTok upload feature was removed from the launcher.

- Full working version: git tag `auto-schedule-1.20.2` (last version that still had it).
- `uploader.js`: the Electron side that ran Engine\Upload\bb_upload.py (kept here unchanged).
- `removal.patch`: everything removed from the app, as a diff. Bring it back with `git apply -R archive/auto-schedule/removal.patch` (from the repo root, on the 1.21.0 code).
- Removed: Auto / Test buttons, "Schedule all ready", Next slot button, the autopilot's just-in-time scheduling step, upload status/alerts, IPC `autoUpload`, `autoUploadBatch`, `uploadStatus`.
- Kept: rendering, review/approve, auto-approve, Upload pack + "Mark uploaded" (manual), the autopilot's render planning.
