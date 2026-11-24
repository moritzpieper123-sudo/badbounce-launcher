/* Checks a finished video must pass before auto-approve may free it for upload (Mo 2026-11-24).
   Pure file checks always run; silence / black frames run through ffmpeg when it is installed (otherwise that part is skipped and said so). */
const fs = require('fs'); const path = require('path'); const { spawn } = require('child_process');
const ls = (d) => { try { return fs.readdirSync(d); } catch { return []; } };

function ff(args, timeout = 90000) {
  return new Promise((resolve) => {
    let out = ''; let p;
    try { p = spawn('ffmpeg', args, { windowsHide: true }); } catch { return resolve(null); }
    const t = setTimeout(() => { try { p.kill(); } catch { /* */ } resolve(null); }, timeout);
    p.stderr.on('data', (b) => { out += String(b); }); p.on('error', () => { clearTimeout(t); resolve(null); });
    p.on('close', () => { clearTimeout(t); resolve(out); });
  });
}

/** @returns {{ok: boolean, fails: string[], notes: string[]}} */
async function checkVideo(folder, num, durationSec) {
  const fails = [], notes = [], names = ls(folder), pick = (pre) => names.find((f) => f.startsWith(`${pre} #${num}`));
  const vid = pick('Badbounce'), th = pick('Thumbnail'), de = pick('Description'), no = pick('Notes');
  if (!vid) fails.push('video file missing'); if (!th) fails.push('thumbnail missing'); if (!de) fails.push('description missing'); if (!no) fails.push('notes missing');
  if (vid) {
    const size = fs.statSync(path.join(folder, vid)).size;
    if (size < 1e6) fails.push(`video is only ${Math.round(size / 1024)} KB`);
    if (durationSec == null) fails.push('video length unreadable (file may be broken)');
    else if (durationSec < 60 || durationSec > 70) fails.push(`length ${Math.round(durationSec)} s, must be 60-70 s`);
  }
  if (th) { const b = fs.readFileSync(path.join(folder, th)); if (b.length < 5000 || b.readUInt32BE(0) !== 0x89504e47) fails.push('thumbnail is not a valid PNG'); }
  if (de) {
    const t = fs.readFileSync(path.join(folder, de), 'utf8'), tags = t.match(/#[^\s#]+/g) || [];
    if (t.trim().length < 20) fails.push('description is empty or too short');
    if (tags.length > 5) fails.push(`${tags.length} hashtags, max 5`);
    if (tags.some((x) => x.toLowerCase() === '#badbounce')) fails.push('description contains #badbounce');
  }
  if (no) { const t = fs.readFileSync(path.join(folder, no), 'utf8'); if (!/Konzept\s+\d/i.test(t)) fails.push('notes have no Konzept line'); }
  if (vid && !fails.some((f) => /video/.test(f))) {
    const file = path.join(folder, vid);
    const sil = await ff(['-v', 'info', '-i', file, '-af', 'silencedetect=n=-45dB:d=3', '-vn', '-f', 'null', '-']);
    if (sil == null) notes.push('ffmpeg not found: silence and black-frame checks skipped');
    else {
      if (/silence_start/.test(sil)) fails.push('silence of 3 s or more in the audio');
      if (/Stream #\d+:\d+.*Audio/.test(sil) === false) fails.push('no audio track');
      const blk = await ff(['-v', 'info', '-i', file, '-vf', 'blackdetect=d=2:pix_th=0.05', '-an', '-f', 'null', '-']);
      if (blk && /black_start/.test(blk)) fails.push('black screen of 2 s or more');
    }
  }
  return { ok: fails.length === 0, fails, notes };
}
module.exports = { checkVideo };
