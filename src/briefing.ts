/* The J.A.R.V.I.S. report on the Home screen (text only, Mo 2026-11-24): a general status of the channel and the autopilot, including the morning render summary. */
import type { Snapshot } from './types';
import { autoOf } from './autopilot';
import { KONZEPTE, fmtNum, kpis, konzeptTable, ymd } from './logic';
import { armStats } from './dayPlan';

export function briefing(snap: Snapshot, now: Date): { title: string; lines: string[] } {
  const au = autoOf(snap.state), k = kpis(snap), kt = konzeptTable(snap), lines: string[] = [];
  const h = now.getHours();
  const title = `${h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'}, Sir. Here is your report.`;
  // channel
  if (k.hasData) {
    const fol = k.followers ?? 0, left = Math.max(0, 10000 - fol);
    lines.push(`The channel stands at ${fmtNum(fol)} followers${k.followers7 != null ? `, ${k.followers7 >= 0 ? '+' : ''}${k.followers7} over the last 7 days` : ''}. ${left ? `${fmtNum(left)} to go to 10,000.` : 'The 10,000 goal is reached.'}`);
    lines.push(`Views over 30 days: ${fmtNum(k.views30)}.${kt[0] ? ` The strongest concept so far is K${kt[0].k} ${KONZEPTE[kt[0].k]?.name}, with ${fmtNum(Math.round(kt[0].avgViews))} views on average.` : ''}`);
  } else lines.push('No channel data has been pulled yet, Sir. The first pull fills this report.');
  // render summary
  const tomorrow = ymd(new Date(now.getTime() + 864e5)), today = ymd(now), p = au.plans?.[today] ?? au.plans?.[tomorrow] ?? au.dayPlan;
  const have = new Set(snap.videos.filter((v) => v.hasVideo).map((v) => v.num));
  if (au.cloud === false) lines.push('Cloud rendering is switched off; renders run on this PC.');
  else if (p && (p.date === today || p.date === tomorrow)) {
    const got = p.items.filter((i) => have.has(i.num)), miss = p.items.filter((i) => !have.has(i.num));
    const posted = p.items.filter((i) => snap.state.uploads[String(i.num)]).length;
    lines.push(`Render summary for ${p.date === today ? 'today' : 'tomorrow'}: ${got.length} of ${p.items.length} videos delivered${posted ? `, ${posted} already scheduled` : ''}.${miss.length ? ` Still missing: ${miss.map((m) => `#${m.num} ${m.cid}${m.variant ? '/' + m.variant : ''}`).join(', ')}.` : ' Everything is ready for scheduling.'}`);
  } else lines.push(`No day plan is active. ${h >= 22 ? 'The plan for tomorrow is made when the autopilot runs.' : 'Tomorrow\'s plan is made from 22:00.'}`);
  // tests
  const arms = armStats(snap, now), open = arms.filter((a) => a.verdict === 'testing').length, drop = arms.filter((a) => a.verdict === 'drop').length, win = arms.filter((a) => a.verdict === 'winner');
  lines.push(`Testing: ${open} of ${arms.length} arms still collecting posts${drop ? `, ${drop} dropped` : ''}${win.length ? `, winners: ${win.slice(0, 3).map((w) => w.key.replace('|plain', '').replace('|', ' ')).join(', ')}` : ''}.`);
  // alerts
  const al = au.alerts.filter((a) => !a.resolved && a.kind !== 'hot');
  lines.push(!au.enabled ? 'The autopilot is switched off, Sir.' : al.length ? `${al.length} item${al.length > 1 ? 's need' : ' needs'} your attention: ${al.slice(0, 3).map((a) => a.title).join('; ')}.` : 'The autopilot is running and nothing needs your attention.');
  return { title, lines };
}
