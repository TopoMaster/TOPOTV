/** EPG XMLTV dentro de la app (Android): sustituye al servidor local del puerto 3003 de escritorio. */
import { CapacitorHttp } from '@capacitor/core';
import type { EPGEvent } from '@/types';
import type { EPGServerStatus } from '@/lib/epg';

const norm = (s: string) => s.toLowerCase().replace(/[\s._-]+/g, '').replace(/[^a-z0-9]/g, '');
const programmes = new Map<string, EPGEvent[]>(); // clave normalizada -> eventos
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
      programmes.clear();
      const wanted = new Set(knownIds.map(norm).filter(Boolean));
      const from = Date.now() - 6 * 3600e3, to = Date.now() + 36 * 3600e3;
      let ok = 0, lastErr = '';
      for (const url of urls) {
        try {
          const xml = await download(url);
          status = { ...status, status: 'parsing', progress: 70 };
          const doc = new DOMParser().parseFromString(xml, 'text/xml');
          const names = new Map<string, string>();
          doc.querySelectorAll('channel').forEach(ch => {
            const id = ch.getAttribute('id') || '';
            const dn = ch.querySelector('display-name')?.textContent || '';
            if (id) names.set(id, dn);
          });
          doc.querySelectorAll('programme').forEach(p => {
            const id = p.getAttribute('channel') || '';
            const start = xmltvDate(p.getAttribute('start')), end = xmltvDate(p.getAttribute('stop'));
            if (!id || !start || !end || end.getTime() < from || start.getTime() > to) return;
            const keys = [norm(id), norm(names.get(id) || '')].filter(Boolean);
            if (wanted.size && !keys.some(k => wanted.has(k))) return;
            const ev: EPGEvent = {
              channelId: id, title: p.querySelector('title')?.textContent?.trim() || '', description: p.querySelector('desc')?.textContent?.trim() || '',
              startTime: start, endTime: end, category: p.querySelector('category')?.textContent?.trim() || undefined,
              poster: p.querySelector('icon')?.getAttribute('src') || undefined,
            };
            for (const k of keys) { const list = programmes.get(k) ?? []; list.push(ev); programmes.set(k, list); }
          });
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
  const list = programmes.get(norm(channelId));
  if (!list?.length) return null;
  const now = Date.now();
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
  const events = list.filter(e => e.endTime.getTime() > dayStart.getTime() && e.startTime.getTime() < dayStart.getTime() + 86400e3);
  return { events, now: events.find(e => e.startTime.getTime() <= now && e.endTime.getTime() > now) ?? null, next: events.find(e => e.startTime.getTime() > now) ?? null };
}
export function nativeEPGClear() { programmes.clear(); status = { status: 'idle', progress: 0, channels: 0, error: null, lastUpdated: null }; }
