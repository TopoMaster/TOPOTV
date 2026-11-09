import { create } from 'zustand';
import { listRecordings, recorderAvailable, type Recording } from '@/lib/recorder';

interface RecorderState {
  available: boolean | null; dir: string; recordings: Recording[]; error: string | null;
  refresh: () => Promise<void>;
}

export const useRecorderStore = create<RecorderState>((set) => ({
  available: null, dir: '', recordings: [], error: null,
  refresh: async () => {
    if (!(await recorderAvailable())) { set({ available: false }); return; }
    try { const { dir, recordings } = await listRecordings(); set({ available: true, dir, recordings, error: null }); }
    catch (e) { set({ available: true, error: e instanceof Error ? e.message : String(e) }); }
  },
}));
