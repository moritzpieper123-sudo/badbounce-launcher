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
  at: string;        // ISO post time = the slot time it filled (Mo 2026-11-14: a late post counts at its slot time)
  realAt?: string;   // ISO time it was actually marked uploaded
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
  doneAt?: string;   // when it was moved to Done (done tasks vanish after 5 h)
}

export interface Idea {
  id: string;
  text: string;
  konzept: number | null;
  newKonzept?: boolean; // idea for a brand-new Konzept (NewStyle round)
  markers?: { id: string; t: number; note?: string }[]; // timeline markers on the reference video
  link?: string;
  file?: string;     // stored file name (in vault Ideas/files)
  createdAt: string;
  used?: boolean;
}

export interface DayStat { date: string; views?: number; likes?: number; comments?: number; shares?: number; profileViews?: number; followers?: number; newFollowers?: number; }
export interface PostStat { title: string; link?: string; postTime?: string; views?: number; likes?: number; comments?: number; shares?: number; saves?: number; avgWatch?: number; fullWatch?: number; newFollowers?: number; retention?: number[]; traffic?: Breakdown[]; }

export interface Breakdown { label: string; pct: number }
export interface Audience { at: string; traffic?: Breakdown[]; age?: Breakdown[]; gender?: Breakdown[]; countries?: Breakdown[]; activeHours?: number[]; }

export interface Stats {
  importedAt?: string;
  audience?: Audience;                                  // viewers / followers / traffic (stats fetch)
  snaps?: { t: string; v: Record<string, number[]> }[]; // per fetch: video id -> [views, likes, comments, shares, saves]
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
  skipSlots?: string[];       // ISO times of upload slots that are skipped (not shown, not filled)
}

export interface AppState {
  version: 1;
  uploads: Record<string, UploadRec>;
  notes: Record<string, string>;
  tasks: Task[];
  autoCols: Record<string, Col>;
  autoDoneAt?: Record<string, string>; // when an auto task was moved to Done
  ideas: Idea[];
  stats: Stats;
  milestonesSeen: number[];
  alertsSeen: Record<string, string>;
  settings: Settings;
  lastBackup?: string;
  migrations?: Record<string, boolean>; // one-time fixes already applied
}

export interface RenderStatus { video?: string; konzept?: number; progress?: number; etaSec?: number; label?: string; updated?: string; }

export interface MailItem { id: string; threadId: string; from: string; fromAddr?: string; subject: string; snippet: string; date: string; unread: boolean; }
export interface MailStatus { canModify?: boolean; connected: boolean; email: string | null; unread: number; items: MailItem[]; updated: string | null; error: string | null; }
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
  winFull?: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  day1: '2026-11-11',
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
