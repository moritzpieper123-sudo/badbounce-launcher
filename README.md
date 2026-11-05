# Badbounce Launcher

Mo's control centre for the Badbounce TikTok channel: upload schedule, tasks, analytics, idea inbox.

- **Windows app** (Electron, with the Dynamic Island): installed from `OneDrive\Badbounce\.claude-workspace\launcher` with `Install.cmd`.
- **Phone / iPad app**: the same React app, hosted on GitHub Pages. Open it in Safari → Share → Add to Home Screen.
- Both sync through Supabase (table `launcher`, storage bucket `videos`, setup in `supabase-setup.sql`).

Build: `npm ci && npx tsc -p . && npx vite build` (output in `dist/`).
