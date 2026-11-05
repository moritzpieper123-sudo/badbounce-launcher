import { createContext, useContext } from 'react';
import type { AppState, Snapshot } from './types';

export interface Ctx {
  snap: Snapshot;
  update: (fn: (st: AppState) => AppState) => Promise<void>;
  toast: (m: string) => void;
  go: (page: string) => void;
}
export const AppCtx = createContext<Ctx | null>(null);
export const useApp = () => useContext(AppCtx)!;
