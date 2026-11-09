import { create } from 'zustand';
import { listRecordings, recorderAvailable, recorderInfo, type Recording } from '@/lib/recorder';

interface RecorderState {
  available: boolean | null; dir: string; recordings: Recording[]; error: string | null;
  /** Espacio libre del disco de las grabaciones (-1 = no se sabe) y días de borrado automático (0 = nunca) */
  freeBytes: number; retentionDays: number;
  refresh: () => Promise<void>;
}

export const useRecorderStore = create<RecorderState>((set) => ({
  available: null, dir: '', recordings: [], error: null, freeBytes: -1, retentionDays: 0,
  refresh: async () => {
    if (!(await recorderAvailable())) { set({ available: false }); return; }
    try {
      const [{ dir, recordings }, info] = await Promise.all([listRecordings(), recorderInfo()]);
      set({ available: true, dir, recordings, error: null, ...(info ?? {}) });
    }
    catch (e) { set({ available: true, error: e instanceof Error ? e.message : String(e) }); }
  },
}));
