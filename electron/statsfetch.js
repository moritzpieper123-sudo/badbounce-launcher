// Background TikTok stats fetch (replaces the CSV download).
// Hidden window, same login as csvfetch (persist:tiktok). It never shows itself and never steals focus.
//  1) Public profile page: every video with views / likes / comments / shares / saves, plus follower count. No login needed.
//  2) TikTok Studio per-video analytics page (needs the login the CSV fetch already saved): watch time, full-watch rate,
//     new followers. The JSON answers the page loads are read and mapped by key name.
// Raw answers are saved to launcher-data/stats-debug so the key mapping can be tuned after the first real run.
const { BrowserWindow, session, app } = require('electron');
const fs = require('fs');
const path = require('path');

const HANDLE = (process.env.BB_TIKTOK_HANDLE || 'badb0unce').replace(/^@/, '');
const PROFILE = `https://www.tiktok.com/@${HANDLE}`;
const STUDIO_VIDEO = (id) => `https://www.tiktok.com/tiktokstudio/analytics/${id}`;
const STUDIO_VIEWERS = 'https://www.tiktok.com/tiktokstudio/analytics/viewers';
const STUDIO_FOLLOWERS = 'https://www.tiktok.com/tiktokstudio/analytics/followers';
let running = false;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const n = (v) => (v === undefined || v === null || v === '' || isNaN(+v) ? undefined : +v);
function chromeUA() { return (app.userAgentFallback || '').replace(/\s?Electron\/\S+/, '').replace(/\s?badbounce-launcher\/\S+/i, '').replace(/\s?Badbounce Launcher\/\S+/i, ''); }

/* ---------- pure parsing (unit-tested) ---------- */
/** One item from TikTok's item_list answer -> PostStat. */
function itemToPost(it) {
  const s = it.stats || {};
  const id = String(it.id || it.aweme_id || '');
  if (!id) return null;
  const sec = n(it.createTime || it.create_time);
  const o = {
    title: String(it.desc || it.title || '').trim(),
    link: `https://www.tiktok.com/@${HANDLE}/video/${id}`,
    postTime: sec ? new Date(sec * 1000).toISOString() : undefined,
    views: n(s.playCount ?? s.play_count),
    likes: n(s.diggCount ?? s.digg_count),
    comments: n(s.commentCount ?? s.comment_count),
    shares: n(s.shareCount ?? s.share_count),
    saves: n(s.collectCount ?? s.collect_count),
  };
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)); // never overwrite CSV values with blanks
}
/** Walk any JSON and collect the first number for each wanted key pattern (Studio answers are nested and change names). */
function pickMetrics(json) {
  const want = {
    avgWatch: /^(avg|average)_?(play|watch|view)_?(time|duration)|^avg_?watch/i,
    fullWatch: /(finish|complet|full)_?(rate|ratio|watch)|watched_?full|full_?video_?watched/i,
    newFollowers: /^(new_?followers?|follower_?(increase|net|growth|delta)|net_?followers?|add_?follower)/i,
    views: /^(video_?)?(views?|play_?count|play_?cnt|vv)$/i,
  };
  const out = {};
  const seen = new Set();
  const walk = (o, depth) => {
    if (!o || typeof o !== 'object' || depth > 8 || seen.has(o)) return; seen.add(o);
    for (const [k, v] of Object.entries(o)) {
      for (const [name, re] of Object.entries(want)) {
        if (out[name] !== undefined || !re.test(k)) continue;
        const val = typeof v === 'object' && v ? n(v.value ?? v.total ?? v.count) : n(v);
        if (val !== undefined) out[name] = val;
      }
      if (v && typeof v === 'object') walk(v, depth + 1);
    }
  };
  walk(json, 0);
  if (out.fullWatch !== undefined && out.fullWatch <= 1) out.fullWatch = Math.round(out.fullWatch * 1000) / 10; // 0.34 -> 34 %
  delete out.views; // views already come from the profile; only used as a sanity probe
  return out;
}
/* ---------- audience / traffic / retention (Studio answers; key names are matched loosely, raw JSON is dumped for tuning) ---------- */
const LABEL_KEYS = ['name', 'label', 'key', 'type', 'source', 'country', 'region', 'territory', 'gender', 'age', 'age_range', 'range', 'category'];
const VALUE_KEYS = ['percentage', 'percent', 'ratio', 'rate', 'proportion', 'value', 'count', 'num', 'number'];
function toBreakdown(arr) {
  if (!Array.isArray(arr) || arr.length < 2 || arr.length > 40) return null;
  const rows = [];
  for (const it of arr) {
    if (!it || typeof it !== 'object') return null;
    const lk = LABEL_KEYS.find((k) => typeof it[k] === 'string' && it[k]);
    const vk = VALUE_KEYS.find((k) => n(it[k]) !== undefined);
    if (!lk || !vk) return null;
    rows.push({ label: String(it[lk]), v: n(it[vk]) });
  }
  const tot = rows.reduce((s, r) => s + Math.max(0, r.v), 0);
  if (!(tot > 0)) return null;
  const scale = tot <= 1.05 ? 100 : tot <= 100.5 ? 1 : 100 / tot; // shares already (0-1 or 0-100): keep, even for a partial top list; counts: normalise
  return rows.map((r) => ({ label: r.label.replace(/_/g, ' '), pct: Math.round(Math.max(0, r.v) * scale * 10) / 10 })).sort((a, b) => b.pct - a.pct);
}
function objToBreakdown(o) { // {for_you: 0.8, following: 0.1, ...}
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null;
  const e = Object.entries(o).map(([k, v]) => [k, n(v && typeof v === 'object' ? v.value ?? v.percentage ?? v.ratio : v)]).filter(([, v]) => v !== undefined);
  if (e.length < 2 || e.length > 30) return null;
  return toBreakdown(e.map(([k, v]) => ({ name: k, value: v })));
}
/** Find the first value under a key matching `re` and turn it into a breakdown (array of {name,value} or {name:value}). */
function findBreakdown(json, re) {
  let out = null; const seen = new Set();
  const walk = (o, d) => {
    if (out || !o || typeof o !== 'object' || d > 9 || seen.has(o)) return; seen.add(o);
    for (const [k, v] of Object.entries(o)) {
      if (out) return;
      if (re.test(k) && v && typeof v === 'object') { out = toBreakdown(v) || objToBreakdown(v) || (v.list && toBreakdown(v.list)) || (v.items && toBreakdown(v.items)) || null; if (out) return; }
      if (v && typeof v === 'object') walk(v, d + 1);
    }
  };
  walk(json, 0); return out;
}
const pickTraffic = (json) => findBreakdown(json, /(traffic|source|channel)/i);
const pickAge = (json) => findBreakdown(json, /(^|_)age/i);
const pickGender = (json) => findBreakdown(json, /gender/i);
const pickCountries = (json) => findBreakdown(json, /(countr|region|territor|location|geo)/i);
/** 24 numbers (hour 0-23) from an "active hours" answer. */
function pickActiveHours(json) {
  let out = null; const seen = new Set();
  const walk = (o, d) => {
    if (out || !o || typeof o !== 'object' || d > 9 || seen.has(o)) return; seen.add(o);
    for (const [k, v] of Object.entries(o)) {
      if (out) return;
      if (/(active|online|hour)/i.test(k) && Array.isArray(v) && v.length >= 24) {
        const nums = v.map((x) => (x && typeof x === 'object' ? n(x.value ?? x.count ?? x.num ?? x.ratio) : n(x)));
        if (nums.every((x) => x !== undefined)) { out = nums.slice(0, 24); return; }
      }
      if (v && typeof v === 'object') walk(v, d + 1);
    }
  };
  walk(json, 0);
  if (!out) return null;
  const mx = Math.max(...out); return mx > 0 ? out.map((x) => Math.round((x / mx) * 100)) : null; // 0-100, busiest hour = 100
}
/** Retention curve of one video: array of numbers (share still watching) -> max 50 points, percent. */
function pickRetention(json) {
  let out = null; const seen = new Set();
  const walk = (o, d) => {
    if (out || !o || typeof o !== 'object' || d > 9 || seen.has(o)) return; seen.add(o);
    for (const [k, v] of Object.entries(o)) {
      if (out) return;
      if (/(retention|duration_?curve|watch_?curve|play_?curve|completion_?curve)/i.test(k) && v && typeof v === 'object') {
        const arr = Array.isArray(v) ? v : (v.list || v.values || v.data || v.curve);
        if (Array.isArray(arr) && arr.length >= 5) {
          const nums = arr.map((x) => (x && typeof x === 'object' ? n(x.value ?? x.ratio ?? x.rate ?? x.percentage) : n(x)));
          if (nums.every((x) => x !== undefined)) { out = nums; return; }
        }
      }
      if (v && typeof v === 'object') walk(v, d + 1);
    }
  };
  walk(json, 0);
  if (!out) return null;
  const mx = Math.max(...out); const scale = mx <= 1.5 ? 100 : 1;
  const step = Math.max(1, Math.ceil(out.length / 50));
  return out.filter((_, i) => i % step === 0).map((x) => Math.round(x * scale * 10) / 10);
}
function pickAudience(hits) {
  const a = {};
  for (const h of hits) {
    a.age = a.age || pickAge(h.json) || undefined; a.gender = a.gender || pickGender(h.json) || undefined;
    a.countries = a.countries || pickCountries(h.json) || undefined; a.activeHours = a.activeHours || pickActiveHours(h.json) || undefined;
    a.traffic = a.traffic || pickTraffic(h.json) || undefined;
  }
  return Object.fromEntries(Object.entries(a).filter(([, v]) => v));
}

/** Followers + first video list from the page's embedded JSON (works without the XHR). */
function readRehydration(html) {
  const m = /<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/.exec(html);
  if (!m) return {};
  try {
    const j = JSON.parse(m[1]); const scope = j.__DEFAULT_SCOPE__ || {};
    const ud = scope['webapp.user-detail'] || {};
    return { followers: n(ud.userInfo?.stats?.followerCount ?? ud.userInfo?.statsV2?.followerCount), items: ud.itemList || [] };
  } catch { return {}; }
}

/* ---------- browser plumbing ---------- */
function sniff(win, match) {
  const dbg = win.webContents.debugger; const hits = []; const pending = new Map();
  try { dbg.attach('1.3'); } catch { /* already attached */ }
  dbg.sendCommand('Network.enable').catch(() => {});
  dbg.on('message', (_e, method, p) => {
    if (method === 'Network.responseReceived' && match.test(p.response.url) && /json/i.test(p.response.mimeType || '')) pending.set(p.requestId, p.response.url);
    if (method === 'Network.loadingFinished' && pending.has(p.requestId)) {
      const url = pending.get(p.requestId); pending.delete(p.requestId);
      dbg.sendCommand('Network.getResponseBody', { requestId: p.requestId }).then((b) => { try { hits.push({ url, json: JSON.parse(b.base64Encoded ? Buffer.from(b.body, 'base64').toString('utf8') : b.body) }); } catch { /* not json */ } }).catch(() => {});
    }
  });
  return { hits, stop() { try { dbg.detach(); } catch { /* ignore */ } } };
}
async function loadAndWait(win, url, ms) {
  win.loadURL(url).catch(() => {});
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { await wait(400); if (!win.webContents.isLoading()) break; }
}

async function run({ dataDir, status, result }) {
  if (running) return; running = true;
  const t0 = Date.now(); const debug = path.join(dataDir(), 'stats-debug');
  const dump = (name, obj) => { try { fs.mkdirSync(debug, { recursive: true }); fs.writeFileSync(path.join(debug, name), typeof obj === 'string' ? obj : JSON.stringify(obj, null, 1)); } catch { /* ignore */ } };
  const ses = session.fromPartition('persist:tiktok'); ses.setUserAgent(chromeUA());
  const win = new BrowserWindow({ show: false, width: 1280, height: 900, skipTaskbar: true, focusable: false, webPreferences: { session: ses, sandbox: true, contextIsolation: true, backgroundThrottling: false, images: false } });
  win.webContents.setAudioMuted(true);
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  const posts = new Map(); let followers; let studio = 'skipped';
  try {
    status({ state: 'running', msg: 'Reading your TikTok profile…' });
    const sn = sniff(win, /\/api\/post\/item_list/);
    await loadAndWait(win, PROFILE, 25000);
    const html = await win.webContents.executeJavaScript('document.documentElement.outerHTML', true).catch(() => '');
    const re = readRehydration(html); followers = re.followers;
    for (const it of re.items || []) { const p = itemToPost(it); if (p) posts.set(p.link, p); }
    // scroll to load older videos until nothing new arrives
    let last = -1;
    for (let i = 0; i < 12 && posts.size !== last; i++) {
      last = posts.size;
      await win.webContents.executeJavaScript('window.scrollTo(0, document.body.scrollHeight)', true).catch(() => {});
      await wait(1100);
      for (const h of sn.hits.splice(0)) for (const it of h.json.itemList || []) { const p = itemToPost(it); if (p) posts.set(p.link, p); }
    }
    sn.stop();
    dump('profile-meta.json', { at: new Date().toISOString(), followers, videos: posts.size, htmlHasData: !!re.items });
    if (!posts.size) { status({ state: 'error', msg: 'Could not read any video from the TikTok profile (maybe a captcha). Try again later.' }); return; }

    // Studio per-video analytics (login required; silently skipped if not logged in)
    status({ state: 'running', msg: `Got ${posts.size} videos, reading watch time…` });
    studio = 'ok'; let logged = true;
    for (const p of posts.values()) {
      if (!logged) break;
      const id = p.link.split('/video/')[1];
      const s2 = sniff(win, /(creator|insight|analytics|aweme).*(video|item|post|detail|overview)|\/api\/v\d\/creator/i);
      await loadAndWait(win, STUDIO_VIDEO(id), 20000);
      if (/login|passport|signup/i.test(win.webContents.getURL())) { logged = false; studio = 'login'; s2.stop(); break; }
      await wait(2200);
      const hits = s2.hits.splice(0); s2.stop();
      dump(`studio-${id}.json`, hits);
      const m = {}; for (const h of hits) Object.assign(m, Object.fromEntries(Object.entries(pickMetrics(h.json)).filter(([k]) => m[k] === undefined)));
      Object.assign(p, m);
      for (const h of hits) { const r = pickRetention(h.json); if (r && !p.retention) p.retention = r; const t = pickTraffic(h.json); if (t && !p.traffic) p.traffic = t; }
    }
    // audience pages: viewers (age, gender, countries, traffic) + followers (active hours); same login, skipped if not logged in
    let audience = {};
    if (logged) {
      status({ state: 'running', msg: 'Reading audience and traffic…' });
      for (const [name, url] of [['viewers', STUDIO_VIEWERS], ['followers', STUDIO_FOLLOWERS]]) {
        const s3 = sniff(win, /(creator|insight|analytics|aweme|mweb).*/i);
        await loadAndWait(win, url, 20000);
        if (/login|passport|signup/i.test(win.webContents.getURL())) { s3.stop(); break; }
        await wait(3500);
        const hits = s3.hits.splice(0); s3.stop();
        dump(`audience-${name}.json`, hits);
        audience = { ...audience, ...Object.fromEntries(Object.entries(pickAudience(hits)).filter(([k]) => audience[k] === undefined)) };
      }
      if (Object.keys(audience).length) audience.at = new Date().toISOString();
    }
    result({ posts: [...posts.values()], followers, at: new Date().toISOString(), audience });
    const secs = Math.round((Date.now() - t0) / 1000);
    status({ state: 'done', msg: `Stats updated: ${posts.size} videos in ${secs}s` + (studio === 'login' ? ' (watch time needs the TikTok login, run "Fetch automatically" once)' : '') });
  } catch (e) {
    status({ state: 'error', msg: 'Stats fetch failed: ' + (e.message || e) });
  } finally {
    try { if (!win.isDestroyed()) win.destroy(); } catch { /* ignore */ }
    running = false;
  }
}

module.exports = { run, isRunning: () => running, itemToPost, pickMetrics, readRehydration, pickAudience, pickRetention, pickTraffic, pickActiveHours };
