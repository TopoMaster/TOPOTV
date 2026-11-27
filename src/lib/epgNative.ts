/** EPG XMLTV dentro de la app (Android): sustituye al servidor local del puerto 3003 de escritorio. */
import { CapacitorHttp } from '@capacitor/core';
import type { EPGEvent } from '@/types';
import type { EPGServerStatus } from '@/lib/epg';

/** Clave de comparación: minúsculas, sin tildes y solo letras y números de cualquier alfabeto (también cirílico). */
const norm = (s: string) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]+/gu, '');
/** Igual que norm() pero sin la calidad del nombre: «DAZN_Baloncesto_720p_», «DAZN Baloncesto HD» → «daznbaloncesto». */
const loose = (s: string) => norm(String(s || '').replace(/[_.*-]+/g, ' ').replace(/\b(?:4k|uhd|fhd|hd|sd|hevc|h265|backup|multiaudio)\b|\b\d{3,4}p\b/gi, ' '));
/* Cada canal de cada guía guarda SU programación («n|id»); al buscar se elige uno solo, primero por identificador
   exacto y si no por nombre (antes se mezclaban los canales que se llaman igual en guías distintas). */
const programmes = new Map<string, EPGEvent[]>(); // «n|id» -> eventos
const idOwners = new Map<string, string[]>();
const nameOwners = new Map<string, string[]>();
const claim = (map: Map<string, string[]>, k: string, uid: string) => { if (!k) return; const a = map.get(k); if (!a) map.set(k, [uid]); else if (!a.includes(uid)) a.push(uid); };
function lookup(id: string): EPGEvent[] | null {
  for (const owners of [idOwners, nameOwners]) for (const k of [norm(id), loose(id)]) for (const uid of owners.get(k) ?? []) { const list = programmes.get(uid); if (list?.length) return list; }
  return null;
}
let status: EPGServerStatus = { status: 'idle', progress: 0, channels: 0, error: null, lastUpdated: null };
let running = false;

/** "20260101203000 +0100" → Date */
function xmltvDate(v: string | null): Date | null {
  const m = (v || '').trim().match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})?\s*([+-]\d{4}|Z)?/);
  if (!m) return null;
  const [, y, mo, d, h, mi, s = '00', tz = '+0000'] = m;
  const off = tz === 'Z' ? '+00:00' : `${tz.slice(0, 3)}:${tz.slice(3)}`;
  const date = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}${off}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

const decode = (v: string | undefined) => (v ?? '')
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, '&').trim();

/** Recorre el XMLTV con expresiones regulares (sin DOM) y guarda solo lo que cae en la ventana y en los canales pedidos. */
function parseXmltv(xml: string, wanted: Set<string>, from: number, to: number, gi: number) {
  const names = new Map<string, string[]>();
  for (const m of xml.matchAll(/<channel\s+id="([^"]*)"[^>]*>([\s\S]*?)<\/channel>/g)) {
    const id = decode(m[1]);
    const list = [...m[2].matchAll(/<display-name[^>]*>([\s\S]*?)<\/display-name>/g)].map(x => decode(x[1]));
    names.set(id, list);
    const uid = `${gi}|${id}`;
    claim(idOwners, norm(id), uid); claim(idOwners, loose(id), uid);
    for (const n of list) { claim(nameOwners, norm(n), uid); claim(nameOwners, loose(n), uid); }
  }
  for (const m of xml.matchAll(/<programme\s+([^>]*)>([\s\S]*?)<\/programme>/g)) {
    const id = decode(m[1].match(/channel="([^"]*)"/)?.[1]);
    const start = xmltvDate(m[1].match(/start="([^"]*)"/)?.[1] ?? null), end = xmltvDate(m[1].match(/stop="([^"]*)"/)?.[1] ?? null);
    if (!id || !start || !end || end.getTime() < from || start.getTime() > to) continue;
    const all = [id, ...(names.get(id) ?? [])];
    const keys = [...new Set([...all.map(norm), ...all.map(loose)].filter(Boolean))];
    if (wanted.size && !keys.some(k => wanted.has(k))) continue;
    const pick = (tag: string) => decode(m[2].match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))?.[1]);
    const icon = m[2].match(/<icon\s+src="([^"]*)"/)?.[1];
    const ev: EPGEvent = { channelId: id, title: pick('title'), description: pick('desc'), startTime: start, endTime: end, category: pick('category') || undefined, poster: icon ? decode(icon) : undefined };
    const uid = `${gi}|${id}`;
    if (!names.has(id)) claim(idOwners, norm(id), uid);   // programa de un canal sin ficha <channel>
    const list = programmes.get(uid) ?? []; list.push(ev); programmes.set(uid, list);
  }
}

async function download(url: string): Promise<string> {
  const res = await CapacitorHttp.get({ url, responseType: 'blob', connectTimeout: 20000, readTimeout: 120000 });
  if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status} en ${url}`);
  const bin = Uint8Array.from(atob(String(res.data)), c => c.charCodeAt(0));
  const gz = bin[0] === 0x1f && bin[1] === 0x8b;
  if (!gz) return new TextDecoder().decode(bin);
  if (typeof DecompressionStream === 'undefined') throw new Error('Este dispositivo no puede descomprimir la guía (.gz).');
  const stream = new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

export const nativeEPGStatus = (): EPGServerStatus => status;

export async function nativeEPGLoad(urls: string[], knownIds: string[]): Promise<boolean> {
  if (running) return true;
  running = true;
  status = { status: 'loading', progress: 20, channels: 0, error: null, lastUpdated: null };
  void (async () => {
    try {
      programmes.clear(); idOwners.clear(); nameOwners.clear();
      const wanted = new Set(knownIds.flatMap(k => [norm(k), loose(k)]).filter(Boolean));
      const from = Date.now() - 6 * 3600e3, to = Date.now() + 36 * 3600e3;
      let ok = 0, lastErr = '';
      for (const [gi, url] of urls.entries()) {
        try {
          const xml = await download(url);
          status = { ...status, status: 'parsing', progress: 70 };
          parseXmltv(xml, wanted, from, to, gi);
          ok++;
        } catch (e) { lastErr = e instanceof Error ? e.message : String(e); }
      }
      for (const list of programmes.values()) list.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
      if (!ok) throw new Error(lastErr || 'No se pudo cargar ninguna guía EPG');
      status = { status: 'ready', progress: 100, channels: programmes.size, error: null, lastUpdated: new Date().toISOString() };
    } catch (e) {
      status = { status: 'error', progress: 0, channels: 0, error: e instanceof Error ? e.message : String(e), lastUpdated: null };
    } finally { running = false; }
  })();
  return true;
}

export function nativeEPGToday(channelId: string) {
  const list = lookup(channelId);
  if (!list?.length) return null;
  const now = Date.now();
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const events = list.filter(e => e.endTime.getTime() > dayStart.getTime() && e.startTime.getTime() < dayStart.getTime() + 86400e3);
  return { events, now: events.find(e => e.startTime.getTime() <= now && e.endTime.getTime() > now) ?? null, next: events.find(e => e.startTime.getTime() > now) ?? null };
}
export function nativeEPGAll(channelId: string) {
  return lookup(channelId);
}
export const nativeEPGCoverage = (ids: string[]) => ids.filter(id => !!nativeEPGAll(id));
export function nativeEPGClear() { programmes.clear(); idOwners.clear(); nameOwners.clear(); status = { status: 'idle', progress: 0, channels: 0, error: null, lastUpdated: null }; }
