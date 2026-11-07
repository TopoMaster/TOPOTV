import { create } from 'zustand';
import { checkCiriaco, fetchCiriaco, fetchCiriacoStatus, refreshCiriaco, setCiriacoWarpConnected, type CiriacoData, type CiriacoStatus } from '@/lib/ciriaco';
import { useM3UStore } from './useM3UStore';

interface CiriacoState {
  data: CiriacoData | null; status: CiriacoStatus | null; online: boolean | null;
  loading: boolean; updating: boolean; error: string | null;
  warpBusy: boolean; warpError: string | null;
  load: () => Promise<void>;
  syncStatus: () => Promise<void>;
  setWarpConnected: (connected: boolean) => Promise<void>;
  refresh: () => Promise<void>;
}

export const useCiriacoStore = create<CiriacoState>((set, get) => ({
  data: null, status: null, online: null, loading: false, updating: false, error: null, warpBusy: false, warpError: null,
  syncStatus: async () => {
    const [online, status] = await Promise.all([checkCiriaco(), fetchCiriacoStatus()]);
    set({ online, status });
  },
  setWarpConnected: async connected => {
    if (get().warpBusy) return;
    set({ warpBusy: true, warpError: null });
    try {
      const status = await setCiriacoWarpConnected(connected);
      set({ status });
    } catch (e) {
      set({ warpError: e instanceof Error ? e.message : String(e) });
      await get().syncStatus();
    } finally {
      set({ warpBusy: false });
    }
  },
  load: async () => {
    if (get().loading) return;
    set({ loading: true, error: null });
    const ok = await checkCiriaco();
    set({ online: ok });
    if (!ok) { set({ loading: false, status: await fetchCiriacoStatus() }); return; }
    try { const data = await fetchCiriaco(); set({ data, status: data.status }); }
    catch (e) { set({ error: e instanceof Error ? e.message : 'Error' }); }
    finally { set({ loading: false }); }
  },
  refresh: async () => {
    if (get().updating) return;
    set({ updating: true, error: null });
    // sondeo del progreso (conectando WARP, leyendo, desconectando…)
    const poll = setInterval(async () => { const st = await fetchCiriacoStatus(); if (st) set({ status: st }); }, 1500);
    try {
      await refreshCiriaco();
      const data = await fetchCiriaco();
      set({ data, status: data.status, online: true });
      await useM3UStore.getState().reloadSources();
    } catch (e) { set({ error: e instanceof Error ? e.message : 'Error' }); }
    finally { clearInterval(poll); set({ updating: false }); }
  },
}));
