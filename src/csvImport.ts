/* One import path for both ways of getting the TikTok CSV: dropped by hand or fetched in the background. */
import { bb } from './bridge';
import { fmtNum, mergeStats, MILESTONES, parseTikTokCsv, type CsvResult } from './logic';
import type { AppState } from './types';

export async function importCsvTexts(files: { name: string; text: string }[], update: (fn: (st: AppState) => AppState) => Promise<void>, toast: (m: string) => void): Promise<CsvResult[]> {
  const res = files.filter((f) => /\.(csv|txt)$/i.test(f.name)).map((f) => parseTikTokCsv(f.text));
  for (const f of files) if (!/\.(csv|txt)$/i.test(f.name)) toast(`${f.name}: please export as CSV`);
  if (!res.length) return res;
  let celebrate: number[] = [];
  await update((st) => {
    const stats = mergeStats(st.stats, res);
    const fol = stats.days.filter((d) => d.followers != null).pop()?.followers ?? 0;
    celebrate = MILESTONES.filter((m) => fol >= m && !st.milestonesSeen.includes(m));
    return { ...st, stats, milestonesSeen: [...st.milestonesSeen, ...celebrate] };
  });
  const top = celebrate[celebrate.length - 1];
  if (top) bb.islandToast(`${fmtNum(top)} followers!`, 'Milestone reached');
  const rows = res.reduce((s, r) => s + r.rows, 0);
  toast(rows ? `Imported ${rows} rows from ${res.length} file${res.length > 1 ? 's' : ''}` : 'The CSV had no rows I could read');
  return res;
}
