import { create } from 'zustand';
import { Capacitor } from '@capacitor/core';
import { checkCiriaco, fetchCiriaco, fetchCiriacoStatus, refreshCiriaco, setCiriacoWarpConnected, type CiriacoData, type CiriacoStatus } from '@/lib/ciriaco';
import { epgKnownIds, epgSourceUrls } from '@/lib/epg';
import { useM3UStore } from './useM3UStore';
import { useEPGStore } from './useEPGStore';
import { useSettingsStore } from './useSettingsStore';

interface CiriacoState {
  data: CiriacoData | null; status: CiriacoStatus | null; online: boolean | null;
  loading: boolean; updating: boolean; error: string | null;
  /** Qué se está haciendo ahora además de leer la agenda (p. ej. «Actualizando la lista de canales…») */
  step: string | null;
  warpBusy: boolean; warpError: string | null;
  load: () => Promise<void>;
  syncStatus: () => Promise<void>;
  setWarpConnected: (connected: boolean) => Promise<void>;
  refresh: () => Promise<void>;
}

export const useCiriacoStore = create<CiriacoState>((set, get) => ({
  data: null, status: null, online: null, loading: false, updating: false, error: null, step: null, warpBusy: false, warpError: null,
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
    // Windows: WARP se conecta al principio y se mantiene mientras se actualizan la agenda, las listas y la guía
    // (antes solo duraba la lectura de la agenda y lo demás se descargaba sin él). Si ya estaba conectado, se deja como estaba.
    let warpByUs = false;
    let agendaError: string | null = null;
    if (!Capacitor.isNativePlatform()) {
      const st = await fetchCiriacoStatus();
      if (st?.warp.available && st.warp.mode === 'always' && st.warp.connected === false) {
        set({ step: 'Conectando WARP…' });
        try { const s2 = await setCiriacoWarpConnected(true); set({ status: s2 }); warpByUs = s2.warp.connected === true; }
        catch { /* el servidor lo intentará al leer la agenda */ }
      }
    }
    try {
    // sondeo del progreso (conectando WARP, leyendo, desconectando…)
    const poll = setInterval(async () => { const st = await fetchCiriacoStatus(); if (st) set({ status: st }); }, 1500);
    // 1) la agenda de eventos (en Windows exige WARP)
    try {
      await refreshCiriaco();
      const data = await fetchCiriaco();
      set({ data, status: data.status, online: true });
    } catch (e) { agendaError = e instanceof Error ? e.message : 'Error'; }
    clearInterval(poll);
    // 2) las listas de canales y la guía se actualizan SIEMPRE, aunque la agenda no haya podido (p. ej. sin WARP)
    set({ step: 'Actualizando la lista de canales…' });
    try { await useM3UStore.getState().reloadSources(); } catch { /* el error de la lista ya se muestra en su sitio */ }
    set({ step: 'Actualizando la guía de programación…' });
    try {
      const { meta, allChannels } = useM3UStore.getState();
      if (meta && allChannels.length) {
        useEPGStore.getState().reset();
        await new Promise(r => setTimeout(r, 300));
        void useEPGStore.getState().load(epgSourceUrls(meta.epgUrls ?? [], useSettingsStore.getState().manualEpgUrl, allChannels), epgKnownIds(allChannels));
        // con WARP puesto, se espera a que la guía termine de descargarse (máx. 3 min)
        if (warpByUs) {
          for (let i = 0; i < 90; i++) {
            await new Promise(r => setTimeout(r, 2000));
            const st = useEPGStore.getState().status;
            if (i > 1 && (st === 'ready' || st === 'error' || st === 'unavailable' || st === 'idle')) break;
          }
        }
      }
    } catch { /* la guía se reintenta sola más tarde */ }
    } finally {
      if (warpByUs) {
        set({ step: 'Desconectando WARP…' });
        try { set({ status: await setCiriacoWarpConnected(false) }); } catch { await get().syncStatus(); }
      }
    }
    set({ updating: false, step: null, error: agendaError });
  },
}));
