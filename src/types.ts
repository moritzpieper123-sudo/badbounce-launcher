export type Col = 'todo' | 'prog' | 'done';

export interface Video {
  num: number;            // #X
  folder: string;         // absolute folder path
  konzept: number | null; // 1..7
  title: string;
  hasVideo: boolean;
  hasThumb: boolean;
  hasDesc: boolean;
  videoFile?: string;
  thumbFile?: string;
  descFile?: string;
  description?: string;
  durationSec?: number | null;
  createdMs: number;
}

export interface UploadRec {
  at: string;        // ISO time it was marked uploaded
  slot?: string;     // ISO slot it filled
  link?: string;     // TikTok post link
}

export interface Task {
  id: string;
  title: string;
  tag: string;
  konzept?: number | null;
  prio: '' | 'High' | 'Urgent';
  col: Col;
  due?: string;      // YYYY-MM-DD
  createdAt: string;
  auto?: string;     // key for auto-generated tasks
  videoNum?: number; // linked video (upload tasks)
}

export interface Idea {
  id: string;
  text: string;
  konzept: number | null;
  link?: string;
  file?: string;     // stored file name (in vault Ideas/files)
  createdAt: string;
  used?: boolean;
}

export interface DayStat { date: string; views?: number; likes?: number; comments?: number; shares?: number; profileViews?: number; followers?: number; newFollowers?: number; }
export interface PostStat { title: string; link?: string; postTime?: string; views?: number; likes?: number; comments?: number; shares?: number; saves?: number; avgWatch?: number; fullWatch?: number; newFollowers?: number; }

export interface Stats {
  importedAt?: string;
  days: DayStat[];
  posts: PostStat[];
}

export interface Settings {
  day1: string;               // YYYY-MM-DD
  quietEnabled?: boolean;     // quiet hours on/off (default on)
  quietFrom: number;          // hour
  quietTo: number;            // hour
  islandEnabled: boolean;
  dnd: boolean;               // manual do not disturb
  dndFullscreen: boolean;     // auto quiet when a full-screen app runs
  commentReminderMin: number;
  projectUrl: string;
  autostart: boolean;
  csvWeekday: number;         // 0 = Sunday
}

export interface AppState {
  version: 1;
  uploads: Record<string, UploadRec>;
  notes: Record<string, string>;
  tasks: Task[];
  autoCols: Record<string, Col>;
  ideas: Idea[];
  stats: Stats;
  milestonesSeen: number[];
  alertsSeen: Record<string, string>;
  settings: Settings;
  lastBackup?: string;
}

export interface RenderStatus { video?: string; konzept?: number; progress?: number; etaSec?: number; label?: string; updated?: string; }

export interface MailItem { id: string; threadId: string; from: string; fromAddr?: string; subject: string; snippet: string; date: string; unread: boolean; }
export interface MailStatus { connected: boolean; email: string | null; unread: number; items: MailItem[]; updated: string | null; error: string | null; }
export interface Snapshot {
  vaultPath: string;
  vaultOk: boolean;
  videos: Video[];
  state: AppState;
  render: RenderStatus | null;
  mail?: MailStatus | null;
  update?: UpdateStatus | null;
  fullscreen: boolean;
  now: string;
}

export const DEFAULT_SETTINGS: Settings = {
  day1: '2026-11-05',
  quietEnabled: true,
  quietFrom: 22,
  quietTo: 8,
  islandEnabled: true,
  dnd: false,
  dndFullscreen: true,
  commentReminderMin: 20,
  projectUrl: 'https://claude.ai/code/project/chan_01RphMgk3koQT52rqVy41WMd',
  autostart: true,
  csvWeekday: 0,
};

export interface UpdateStatus { current: string; ready: string | null; error: string | null }
export interface MailBody { ok: boolean; error?: string; id?: string; from?: string; to?: string; subject?: string; date?: string; html?: string; files?: string[] }
