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
/* ---------- TikTok Studio insight answers (https://www.tiktok.com/aweme/v2/data/insight/...) ----------
   The answers have fixed key names (verified on real data 2026-11-20). Every answer holds many keys, most of them null; the
   non-null ones of all answers of a page are merged first (mergeInsight), then picked with the exact key names below. */
function mergeInsight(hits) {
  const M = {};
  for (const h of hits) {
    if (!/\/aweme\/v\d\/data\/insight/.test(h.url || '') || !h.json || typeof h.json !== 'object') continue;
    for (const [k, v] of Object.entries(h.json)) if (v !== null && v !== undefined && M[k] === undefined) M[k] = v;
  }
  return M;
}
const ok = (x) => x && typeof x === 'object' && (x.status === undefined || x.status === 0);
const r1 = (x) => Math.round(x * 10) / 10;
/** [{key, value: 0..1}] -> [{label, pct}] sorted, percent with one decimal; null when empty / all zero */
function shareList(list, keyName = 'key') {
  if (!Array.isArray(list)) return null;
  const rows = list.map((x) => ({ label: String(x?.[keyName] ?? ''), v: n(x?.value) })).filter((x) => x.label && x.v !== undefined && x.v >= 0);
  const tot = rows.reduce((s, x) => s + x.v, 0); if (!(tot > 0)) return null;
  return rows.map((x) => ({ label: x.label, pct: r1((x.v / tot) * 100) })).filter((x) => x.pct > 0).sort((a, b) => b.pct - a.pct);
}
const pickShares = (o) => (ok(o) ? shareList(o.value) : null);
function pickCountries(o) { // {country_percent_list: [{country_name:'DE', country_vv_percent:0.13}, ..., {country_name:'Others', is_other:true}]}
  if (!o || !Array.isArray(o.country_percent_list)) return null;
  const rows = o.country_percent_list.map((x) => ({ label: x.is_other ? 'Others' : String(x.country_name || ''), v: n(x.country_vv_percent) })).filter((x) => x.label && x.v !== undefined && x.v > 0);
  const tot = rows.reduce((s, x) => s + x.v, 0); if (!(tot > 0)) return null;
  const list = rows.map((x) => ({ label: x.label, pct: r1((x.v / tot) * 100) }));
  return [...list.filter((x) => x.label !== 'Others').sort((a, b) => b.pct - a.pct), ...list.filter((x) => x.label === 'Others')];
}
/** [{status, value:[24 numbers]}] one entry per day -> 24 numbers (0-100, busiest hour = 100); null when no activity at all */
function pickHours(list) {
  if (!Array.isArray(list)) return null;
  const days = list.filter((d) => d && d.status === 0 && Array.isArray(d.value) && d.value.length === 24);
  if (!days.length) return null;
  const sum = Array.from({ length: 24 }, (_, h) => days.reduce((s, d) => s + (n(d.value[h]) || 0), 0));
  const mx = Math.max(...sum); return mx > 0 ? sum.map((x) => Math.round((x / mx) * 100)) : null;
}
/** Account audience from the merged answers of the Viewers + Followers pages. */
function pickAudience(M) {
  const a = {};
  const set = (k, v) => { if (v && (!Array.isArray(v) || v.length)) a[k] = v; };
  set('age', pickShares(M.viewer_age_distribution)); set('gender', pickShares(M.viewer_gender_percent)); set('countries', pickCountries(M.viewer_country_city_percent));
  set('fAge', pickShares(M.follower_age_distribution)); set('fGender', pickShares(M.follower_gender_percent)); set('fCountries', pickCountries(M.follower_location_percent));
  const fh = pickHours(M.follower_active_history_hours), vh = pickHours(M.viewer_active_history_hours);
  set('activeHours', fh); set('viewerHours', vh);
  // new vs returning viewers per day (days_before_today -7 .. -1; status 2 = TikTok has no number yet)
  const uv = Array.isArray(M.unique_viewer) ? M.unique_viewer : [], nv = Array.isArray(M.new_viewer) ? M.new_viewer : [];
  const vw = uv.map((u, i) => ({ ago: -u.days_before_today, total: u.status === 0 ? n(u.value) : undefined, fresh: nv[i] && nv[i].status === 0 ? n(nv[i].value) : undefined })).filter((x) => x.total !== undefined);
  if (vw.length) a.viewers = vw.map((x) => ({ ago: x.ago, total: x.total, fresh: Math.min(x.total, x.fresh ?? 0) }));
  if (ok(M.unique_viewer_num) && n(M.unique_viewer_num.value) !== undefined) a.uniqueViewers = n(M.unique_viewer_num.value);
  // net follower change per day, 16 days ending today (last entry = today, still running)
  if (Array.isArray(M.net_follower_history)) {
    const L = M.net_follower_history.length;
    const nf = M.net_follower_history.map((x, i) => ({ ago: L - 1 - i, n: x && x.status === 0 ? n(x.value) : undefined })).filter((x) => x.n !== undefined);
    if (nf.length) a.netFollowers = nf;
  }
  if (ok(M.follower_num) && n(M.follower_num.value) !== undefined) a.followerNum = n(M.follower_num.value);
  return a;
}
/** One video's Studio answers -> extra PostStat fields (exact keys). */
function pickVideoInsight(M) {
  const o = {};
  const v = (x) => (x && x.value && ok(x.value) ? n(x.value.value) : x && ok(x) && !x.value?.status ? n(x.value) : undefined);
  const avg = v(M.video_per_duration_realtime); if (avg !== undefined) o.avgWatch = r1(avg);
  const fin = v(M.video_finish_rate_realtime); if (fin !== undefined) o.fullWatch = r1(fin * 100);
  const nf = v(M.realtime_new_followers) ?? (ok(M.video_new_followers) ? n(M.video_new_followers.value) : undefined); if (nf !== undefined) o.newFollowers = nf;
  const rt = M.video_retention_rate_realtime && M.video_retention_rate_realtime.value && M.video_retention_rate_realtime.value.list;
  if (Array.isArray(rt) && rt.length >= 3) {
    const pts = rt.map((x) => n(x.value)).filter((x) => x !== undefined);
    const secs = Math.round((n(rt[rt.length - 1].timestamp) || 0) / 1000);
    const step = Math.max(1, Math.ceil(pts.length / 60));
    o.retention = pts.filter((_, i) => i % step === 0).map((x) => r1(x * 100));
    if (secs > 0) o.retentionSecs = secs;
  }
  const tr = M.video_traffic_source_percent_realtime && M.video_traffic_source_percent_realtime.value;
  const trs = ok(tr) ? shareList(tr.value) : null; if (trs) o.traffic = trs;
  const hv = M.realtime_video_view_history;
  if (hv && ok(hv) && Array.isArray(hv.list) && hv.list.length) {
    const step = hv.interval === 1 ? 3600 : 86400;
    const pts = hv.list.map((x) => [n(x.key), n(x.value)]).filter((x) => x[0] !== undefined && x[1] !== undefined);
    if (pts.length) { o.hist = pts; o.histStep = step; }
  }
  return o;
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

async function run({ dataDir, status, result, deep }) {
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
    studio = 'ok'; let logged = true; let probed = 0, keysFound = 0;
    for (const p of posts.values()) {
      if (!logged) break;
      if (deep && !deep(p)) continue; // older videos only change slowly: skip their Studio page to keep every run short
      const id = p.link.split('/video/')[1];
      const s2 = sniff(win, /(creator|insight|analytics|aweme).*(video|item|post|detail|overview)|\/api\/v\d\/creator/i);
      await loadAndWait(win, STUDIO_VIDEO(id), 20000);
      if (/login|passport|signup/i.test(win.webContents.getURL())) { logged = false; studio = 'login'; s2.stop(); break; }
      await wait(2200);
      const hits = s2.hits.splice(0); s2.stop();
      dump(`studio-${id}.json`, hits);
      const got = pickVideoInsight(mergeInsight(hits)); probed++; if (Object.keys(got).length) keysFound++;
      Object.assign(p, got);
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
        audience = { ...audience, ...Object.fromEntries(Object.entries(pickAudience(mergeInsight(hits))).filter(([k]) => audience[k] === undefined)) };
      }
      if (Object.keys(audience).length) audience.at = new Date().toISOString();
    }
    // health for the launcher's alerts: did the Studio pages still answer in the format we read?
    const health = { studio: studio === 'login' ? 'login' : probed && !keysFound ? 'changed' : 'ok', probed, keysFound, videos: posts.size };
    result({ posts: [...posts.values()], followers, at: new Date().toISOString(), audience, health });
    const secs = Math.round((Date.now() - t0) / 1000);
    status({ state: 'done', msg: `Stats updated: ${posts.size} videos in ${secs}s` + (studio === 'login' ? ' (watch time needs the TikTok login, run "Fetch automatically" once)' : '') });
  } catch (e) {
    status({ state: 'error', msg: 'Stats fetch failed: ' + (e.message || e) });
  } finally {
    try { if (!win.isDestroyed()) win.destroy(); } catch { /* ignore */ }
    running = false;
  }
}

module.exports = { run, isRunning: () => running, itemToPost, pickMetrics, readRehydration, mergeInsight, pickAudience, pickVideoInsight };
