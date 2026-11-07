import { create } from 'zustand';
import type { Channel, EPGSchedule } from '@/types';
import { getEPGStatus, triggerEPGLoad, fetchTodaySchedule, buildEmptyEPGData, type EPGData } from '@/lib/epg';

type EPGStatus = 'idle'|'loading'|'parsing'|'ready'|'error'|'unavailable';
function normalize(s: string) { return s.toLowerCase().replace(/[\s._-]+/g,'').replace(/[^a-z0-9]/g,''); }
const scheduleCache = new Map<string, EPGSchedule>();

interface EPGState {
  status: EPGStatus; progress: number; channelCount: number;
  data: EPGData; error: string|null; serverAvailable: boolean;
  load: (epgUrls: string[], knownIds?: string[]) => Promise<void>;
  pollUntilReady: () => Promise<void>;
  getScheduleForChannel: (channel: Channel) => Promise<EPGSchedule|null>;
  syncStatus: () => Promise<void>;
  reset: () => void;
}

export const useEPGStore = create<EPGState>((set, get) => ({
  status: 'idle', progress: 0, channelCount: 0,
  data: buildEmptyEPGData(), error: null, serverAvailable: false,

  load: async (epgUrls, knownIds=[]) => {
    const cur = get().status;
    if (cur==='loading'||cur==='parsing') return;
    const srv = await getEPGStatus();
    if (!srv) { set({status:'unavailable',serverAvailable:false}); return; }
    set({serverAvailable:true});
    if (srv.status==='ready'&&srv.channels>0) { set({status:'ready',channelCount:srv.channels,progress:100}); return; }
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
      if (srv.status==='ready') { scheduleCache.clear(); return; }
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

  reset: async () => {
    scheduleCache.clear();
    try { await fetch('http://localhost:3003/clear-cache',{signal:AbortSignal.timeout(2000)}); } catch {}
    set({status:'idle',channelCount:0,progress:0,error:null});
  },
}));
