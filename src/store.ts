import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppState, Snapshot } from './types';
import { bb } from './bridge';

export function useSnapshot(refreshMs = 20000) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const latest = useRef<Snapshot | null>(null);
  const load = useCallback(async () => {
    const s = await bb.getSnapshot();
    latest.current = s; setSnap(s);
  }, []);
  useEffect(() => {
    load();
    const off = bb.onChange(load);
    const t = setInterval(load, refreshMs);
    return () => { off(); clearInterval(t); };
  }, [load, refreshMs]);
  const update = useCallback(async (fn: (st: AppState) => AppState) => {
    const cur = latest.current; if (!cur) return;
    const next = fn(cur.state);
    const s = { ...cur, state: next };
    latest.current = s; setSnap(s);
    await bb.saveState(next);
  }, []);
  return { snap, update, reload: load };
}
