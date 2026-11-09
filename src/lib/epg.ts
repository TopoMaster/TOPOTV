import { Capacitor } from '@capacitor/core';
import type { Channel, EPGEvent, EPGSchedule } from '@/types';
import { nativeEPGClear, nativeEPGLoad, nativeEPGStatus, nativeEPGToday } from '@/lib/epgNative';
export interface EPGData { schedules: Map<string, EPGSchedule>; fetchedAt: Date; }
const EPG = 'http://localhost:3003';
export interface EPGServerStatus { status: 'idle'|'loading'|'parsing'|'ready'|'error'; progress: number; channels: number; error: string|null; lastUpdated: string|null; }
export async function getEPGStatus(): Promise<EPGServerStatus|null> {
  if (Capacitor.isNativePlatform()) return nativeEPGStatus();
  try { const r=await fetch(`${EPG}/status`,{signal:AbortSignal.timeout(2000)}); return r.ok?r.json():null; } catch { return null; }
}
export async function triggerEPGLoad(urls: string[], knownIds: string[]): Promise<boolean> {
  if (Capacitor.isNativePlatform()) return nativeEPGLoad(urls, knownIds);
  try {
    const r=await fetch(`${EPG}/load`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({urls,knownIds}),signal:AbortSignal.timeout(3000)});
    return r.ok;
  } catch { return false; }
}
export async function fetchTodaySchedule(channelId: string): Promise<{events:EPGEvent[];now:EPGEvent|null;next:EPGEvent|null}|null> {
  if (Capacitor.isNativePlatform()) return nativeEPGToday(channelId);
  try {
    const r=await fetch(`${EPG}/today/${encodeURIComponent(channelId)}`,{signal:AbortSignal.timeout(3000)});
    if(!r.ok) return null;
    const d=await r.json();
    return { events: d.events.map(de), now: d.now?de(d.now):null, next: d.next?de(d.next):null };
  } catch { return null; }
}
function de(e: any): EPGEvent { return {...e, startTime:new Date(e.startTime), endTime:new Date(e.endTime)}; }
export function buildEmptyEPGData(): EPGData { return {schedules:new Map(),fetchedAt:new Date()}; }
export function getNowPlaying(s: EPGSchedule|undefined): EPGEvent|null {
  if(!s) return null; const now=Date.now(); return s.events.find(e=>e.startTime.getTime()<=now&&e.endTime.getTime()>now)??null;
}
export function getUpNext(s: EPGSchedule|undefined): EPGEvent|null {
  if(!s) return null; const now=Date.now(); return s.events.find(e=>e.startTime.getTime()>now)??null;
}
export function getProgressPercent(e: EPGEvent): number {
  const now=Date.now(), total=e.endTime.getTime()-e.startTime.getTime();
  return total<=0?0:Math.min(100,Math.max(0,(now-e.startTime.getTime())/total*100));
}
export function formatTime(d: Date) { return d.toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'}); }
export function formatDuration(s: Date, e: Date) {
  const m=Math.round((e.getTime()-s.getTime())/60000);
  if(m<60) return `${m}min`; const h=Math.floor(m/60),mm=m%60; return mm>0?`${h}h ${mm}min`:`${h}h`;
}
export function clearEPGCache() { nativeEPGClear(); }

/** Guías que anuncia la lista de Elcano (cabecera url-tvg): se cargan siempre, aunque la lista no llegue a descargarse. */
const ELCANO_EPG_URLS = [
  'https://raw.githubusercontent.com/davidmuma/EPG_dobleM/refs/heads/master/guiatv.xml',
  'https://epgshare01.online/epgshare01/epg_ripper_NL1.xml.gz',
];
/** Guías a cargar: la manual, las de las listas y las de Elcano (sin repetir). */
export function epgSourceUrls(m3uEpgUrls: string[] = [], manual = ''): string[] {
  return [...new Set([manual.trim(), ...m3uEpgUrls, ...ELCANO_EPG_URLS].filter(Boolean))];
}
/** Ids por los que se buscan canales en la guía: tvg-id y nombre. */
export function epgKnownIds(channels: Channel[]): string[] {
  return [...new Set(channels.flatMap(c => [c.tvgId, c.name]).filter(Boolean))];
}
