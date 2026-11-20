// Assisted TikTok scheduling (Mo 2026-11-20). Official route only: TikTok Studio's own upload + schedule page, in a VISIBLE window
// that uses the normal TikTok login of the launcher (persist:tiktok). Nothing is clicked or typed for you and nothing is hidden:
// the launcher prepares the files, copies the description, opens the Studio upload page and shows a small panel with the exact slot
// time to pick. When Studio takes you to the content list (= you scheduled the video), the launcher marks the video as scheduled.
const { BrowserWindow, session, app, clipboard, shell } = require('electron');
const fs = require('fs');
const path = require('path');

const UPLOAD = 'https://www.tiktok.com/tiktokstudio/upload';
let win = null;

function chromeUA() { return (app.userAgentFallback || '').replace(/\s?Electron\/\S+/, '').replace(/\s?badbounce-launcher\/\S+/i, '').replace(/\s?Badbounce Launcher\/\S+/i, ''); }

/** Small floating panel on top of the Studio page (our own DOM element, re-added if the page redraws). */
function panelScript(info) {
  return `(() => {
    const I = ${JSON.stringify(info)};
    const build = () => {
      if (document.getElementById('bb-sched')) return;
      const p = document.createElement('div'); p.id = 'bb-sched';
      p.style.cssText = 'position:fixed;top:12px;right:12px;z-index:2147483647;width:300px;padding:14px 16px;border-radius:16px;background:rgba(14,18,32,.96);color:#F4F6FF;font:13px/1.45 system-ui,sans-serif;box-shadow:0 10px 40px rgba(0,0,0,.5);border:1px solid rgba(170,195,240,.3)';
      const h = (t, s) => { const e = document.createElement('div'); e.textContent = t; e.style.cssText = s || ''; p.appendChild(e); return e; };
      h('Badbounce · schedule #' + I.num, 'font-weight:800;font-size:15px;margin-bottom:6px');
      h(I.tooSoon ? 'Slot ' + I.slotLabel + ' is past or too close. Post it now ("Post now"); it still fills this slot.' : 'Schedule for', 'color:#AAC3F0');
      if (!I.tooSoon) { h(I.slotLabel, 'font-size:20px;font-weight:800;color:#FFC63A;margin:2px 0'); h('Berlin time · UK ' + I.uk + ' · US East ' + I.et + ' · US West ' + I.pt, 'color:#AAC3F0;font-size:12px;margin-bottom:6px'); }
      h('1. Drag the video from the folder that just opened (' + I.folder + ')', 'margin-top:4px');
      h('2. Paste the description (already copied)');
      h('3. Cover: pick the thumbnail from the same folder');
      h(I.tooSoon ? '4. Choose "Now", then Post' : '4. Under "When to post" choose Schedule and set the date and time above, then press Schedule');
      h('The launcher marks it scheduled as soon as Studio shows your content list.', 'color:#8c97b8;font-size:12px;margin-top:6px');
      document.body.appendChild(p);
    };
    build(); new MutationObserver(build).observe(document.documentElement, { childList: true, subtree: true });
  })()`;
}

/** info: { num, slotISO, slotLabel, uk, et, pt, tooSoon, video, thumb, description }  onDone(num) when Studio shows the content list */
function open(info, onDone) {
  if (win && !win.isDestroyed()) { win.focus(); return { ok: false, error: 'A scheduling window is already open' }; }
  const dest = path.join(app.getPath('downloads'), 'Badbounce upload');
  try {
    fs.mkdirSync(dest, { recursive: true });
    for (const f of fs.readdirSync(dest)) try { fs.unlinkSync(path.join(dest, f)); } catch { /* */ }
    fs.copyFileSync(info.video, path.join(dest, path.basename(info.video)));
    if (info.thumb) fs.copyFileSync(info.thumb, path.join(dest, path.basename(info.thumb)));
    if (info.description) clipboard.writeText(String(info.description).trim());
    shell.openPath(dest);
  } catch (e) { return { ok: false, error: String(e.message || e) }; }
  const ses = session.fromPartition('persist:tiktok'); ses.setUserAgent(chromeUA());
  win = new BrowserWindow({ width: 1280, height: 900, title: `TikTok Studio · schedule #${info.num}`, autoHideMenuBar: true, webPreferences: { session: ses, sandbox: true, contextIsolation: true } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const panel = { ...info, folder: 'Downloads\\Badbounce upload' }; delete panel.video; delete panel.thumb; delete panel.description;
  let onUpload = false, done = false;
  const inject = () => { if (!win || win.isDestroyed()) return; const u = win.webContents.getURL(); if (/tiktokstudio\/upload/.test(u)) { onUpload = true; win.webContents.executeJavaScript(panelScript(panel), true).catch(() => {}); } };
  const nav = (_e, url) => { if (onUpload && !done && /tiktokstudio\/content/.test(url)) { done = true; try { onDone(info.num); } catch { /* */ } } };
  win.webContents.on('did-finish-load', inject);
  win.webContents.on('did-navigate', (e, url) => { nav(e, url); });
  win.webContents.on('did-navigate-in-page', (e, url) => { nav(e, url); inject(); });
  win.on('closed', () => { win = null; });
  win.loadURL(UPLOAD).catch(() => {});
  return { ok: true, folder: 'Downloads\\Badbounce upload' };
}
module.exports = { open };
