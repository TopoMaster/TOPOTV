import { create } from 'zustand';
import type { Channel, EPGSchedule } from '@/types';
import { Capacitor } from '@capacitor/core';
import { clearEPGCache, getEPGStatus, triggerEPGLoad, fetchTodaySchedule, fetchAllSchedule, fetchCoverage, buildEmptyEPGData, type EPGData } from '@/lib/epg';
import type { EPGEvent } from '@/types';

type EPGStatus = 'idle'|'loading'|'parsing'|'ready'|'error'|'unavailable';
function normalize(s: string) { return s.toLowerCase().replace(/[\s._-]+/g,'').replace(/[^a-z0-9]/g,''); }
const scheduleCache = new Map<string, EPGSchedule>();
/** Canales con los que se cargó la guía: si cambian las listas y aparecen canales nuevos, se vuelve a cargar */
let loadedIds = new Set<string>();
/** Carga pedida mientras otra estaba en marcha (se hace al terminar) */
let pending: { urls: string[]; ids: string[] } | null = null;

interface EPGState {
  status: EPGStatus; progress: number; channelCount: number;
  data: EPGData; error: string|null; serverAvailable: boolean;
  load: (epgUrls: string[], knownIds?: string[]) => Promise<void>;
  pollUntilReady: () => Promise<void>;
  getScheduleForChannel: (channel: Channel) => Promise<EPGSchedule|null>;
  /** Toda la programación cargada (hoy y mañana) */
  getAllForChannel: (channel: Channel) => Promise<EPGEvent[]|null>;
  /** id de canal → tiene guía (null hasta que la guía esté lista y se haya comprobado) */
  coverage: Record<string, boolean> | null;
  computeCoverage: (channels: Channel[]) => Promise<void>;
  syncStatus: () => Promise<void>;
  reset: () => void;
}

export const useEPGStore = create<EPGState>((set, get) => ({
  status: 'idle', progress: 0, channelCount: 0,
  data: buildEmptyEPGData(), error: null, serverAvailable: false, coverage: null,

  load: async (epgUrls, knownIds=[]) => {
    const cur = get().status;
    if (cur==='loading'||cur==='parsing') { if (knownIds.some(id => !loadedIds.has(id))) pending = { urls: epgUrls, ids: knownIds }; return; }
    const srv = await getEPGStatus();
    if (!srv) { set({status:'unavailable',serverAvailable:false}); return; }
    set({serverAvailable:true});
    const newIds = knownIds.some(id => !loadedIds.has(id));
    if (srv.status==='ready'&&srv.channels>0&&!newIds) { set({status:'ready',channelCount:srv.channels,progress:100}); return; }
    loadedIds = new Set(knownIds);
    scheduleCache.clear();
    set({status:'loading',progress:10,error:null});
    await triggerEPGLoad(epgUrls, knownIds);
    get().pollUntilReady();
  },

  pollUntilReady: async () => {
    const maxWait = 5*60*1000;
    const start = Date.now();
    const poll = async () => {
      if (Date.now()-start>maxWait) { set({status:'error',error:'EPG timeout'}); return; }
      const srv = await getEPGStatus();
      if (!srv) { set({status:'unavailable'}); return; }
      const progress = srv.status==='loading'?(srv.progress||30):srv.status==='parsing'?80:srv.status==='ready'?100:0;
      set({status:srv.status as EPGStatus,progress,channelCount:srv.channels||0});
      if (srv.status==='ready') {
        scheduleCache.clear();
        if (pending) { const p = pending; pending = null; void get().load(p.urls, p.ids); }
        return;
      }
      if (srv.status==='error') { set({error:srv.error||'EPG error'}); return; }
      setTimeout(poll, 2000);
    };
    setTimeout(poll, 2000);
  },

  syncStatus: async () => {
    const srv = await getEPGStatus();
    if (!srv) { set({serverAvailable:false,status:'unavailable'}); return; }
    set({serverAvailable:true,status:srv.status as EPGStatus,progress:srv.status==='ready'?100:(srv.progress||0),channelCount:srv.channels||0,error:srv.error});
    if (srv.status==='loading'||srv.status==='parsing') get().pollUntilReady();
  },

  getScheduleForChannel: async (channel) => {
    if (get().status!=='ready') return null;
    const ids = [channel.tvgId, channel.id, normalize(channel.tvgId||''), normalize(channel.name)].filter(Boolean);
    for (const cid of ids) {
      if (scheduleCache.has(cid)) return scheduleCache.get(cid)!;
      const result = await fetchTodaySchedule(cid);
      if (result && result.events.length>0) {
        const schedule: EPGSchedule = {channelId:cid,events:result.events};
        [cid,channel.tvgId,channel.id].filter(Boolean).forEach(k=>scheduleCache.set(k,schedule));
        return schedule;
      }
    }
    return null;
  },

  getAllForChannel: async (channel) => {
    if (get().status!=='ready') return null;
    for (const cid of [channel.tvgId, channel.name, channel.id].filter(Boolean)) {
      const events = await fetchAllSchedule(cid);
      if (events?.length) return events;
    }
    return null;
  },

  computeCoverage: async (channels) => {
    if (get().status!=='ready' || !channels.length) return;
    const ids = [...new Set(channels.flatMap(c => [c.tvgId, c.name]).filter(Boolean))];
    const have = await fetchCoverage(ids);
    const coverage: Record<string, boolean> = {};
    for (const c of channels) coverage[c.id] = have.has(c.tvgId) || have.has(c.name);
    set({ coverage });
  },

  reset: async () => {
    scheduleCache.clear();
    if (Capacitor.isNativePlatform()) clearEPGCache();
    else try { await fetch('http://localhost:3003/clear-cache',{signal:AbortSignal.timeout(2000)}); } catch {}
    set({status:'idle',channelCount:0,progress:0,error:null,coverage:null});
  },
}));
