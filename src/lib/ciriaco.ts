import type { Channel, Stream } from '@/types';
import { Capacitor } from '@capacitor/core';
import { buildStreamUrl } from '@/lib/aceApi';
import { useSettingsStore } from '@/store/useSettingsStore';
import { buildAgendaM3U, nativeAgenda, nativeScrape, nativeStatus } from '@/lib/ciriacoNative';

const isNative = () => Capacitor.isNativePlatform();

const CIRIACO_URL = 'http://localhost:3004';
export const CIRIACO_PLAYLIST_URL = `${CIRIACO_URL}/api/ciriaco/playlist.m3u`;
const ELCANO_PLAYLIST_URL = 'https://tokyo.elcano-ipfs.workers.dev/k51qzi5uqu5dh5qej4b9wlcr5i6vhc7rcfkekhrxqek5c9lk6gdaiik820fecs/hashes_acestream.m3u';
/** Fuente interna: canales de TDT en abierto (lista incluida en la app, ver src/lib/tdt.ts). */
export const TDT_SOURCE_URL = 'topotv://tdt';
/** Listas que TOPOTV carga siempre: Elcano (categorías), TDT (si está activada), las del usuario y, al final, la agenda de Ciriaco (que se fusiona con las anteriores). */
export const withDefaultSources = (userUrls: string[] = []) => [...new Set([ELCANO_PLAYLIST_URL, ...(useSettingsStore.getState().includeTdt ? [TDT_SOURCE_URL] : []), ...userUrls, CIRIACO_PLAYLIST_URL])];
export const CIRIACO_SOURCE_URL = 'https://ciriaco.netlify.app/';
export const ELCANO_SOURCE_URL = 'https://tokyo.elcano-ipfs.workers.dev/k51qzi5uqu5dh5qej4b9wlcr5i6vhc7rcfkekhrxqek5c9lk6gdaiik820fecs/';

export interface CiriacoLink { hash: string; label: string; channel: string; channelKey: string; quality: string; marks: number; server: string; }
export interface CiriacoEvent {
  id: string; time: string; sport: string; competition: string; round: string; flag: string;
  title: string; home: string; away: string; logos: string[]; channelKeys: string[]; links: CiriacoLink[];
}
export interface CiriacoDay { date: string; label: string; events: CiriacoEvent[]; }
export interface CiriacoChannel { name: string; logo: string; }
export interface CiriacoStatus {
  fetchedAt: string | null; via: string | null; fresh: boolean; updating: boolean; phase: string; lastError: string;
  warp: { available: boolean; connected: boolean | null; mode: string };
}
export interface CiriacoData {
  source: string; fetchedAt: string; via: string; days: CiriacoDay[];
  channels: Record<string, CiriacoChannel>; status: CiriacoStatus;
}

export async function checkCiriaco(): Promise<boolean> {
  if (isNative()) return true;
  try { return (await fetch(`${CIRIACO_URL}/health`, { signal: AbortSignal.timeout(2500) })).ok; } catch { return false; }
}
export async function fetchCiriaco(): Promise<CiriacoData> {
  if (isNative()) return nativeAgenda();
  const r = await fetch(`${CIRIACO_URL}/api/ciriaco/events`, { signal: AbortSignal.timeout(240000) });
  if (!r.ok) { const j = await r.json().catch(() => null); throw new Error(j?.error ?? `Ciriaco HTTP ${r.status}`); }
  return r.json();
}
export async function fetchCiriacoStatus(): Promise<CiriacoStatus | null> {
  if (isNative()) return nativeStatus();
  try { return await (await fetch(`${CIRIACO_URL}/api/ciriaco/status`, { signal: AbortSignal.timeout(2500) })).json(); } catch { return null; }
}
export async function setCiriacoWarpConnected(connected: boolean): Promise<CiriacoStatus> {
  const action = connected ? 'connect' : 'disconnect';
  const r = await fetch(`${CIRIACO_URL}/api/ciriaco/warp/${action}`, { method: 'POST', signal: AbortSignal.timeout(45000) });
  const result = await r.json() as CiriacoStatus & { error?: string };
  if (!r.ok) throw new Error(result.error ?? `WARP HTTP ${r.status}`);
  return result;
}
/** Fuerza actualización (el servidor activa WARP solo durante el scrape). Puede tardar ~1 min. */
export async function refreshCiriaco(): Promise<void> {
  if (isNative()) { await nativeScrape(); return; }
  const r = await fetch(`${CIRIACO_URL}/api/ciriaco/refresh`, { method: 'POST', signal: AbortSignal.timeout(240000) });
  if (!r.ok) { const j = await r.json().catch(() => null); throw new Error(j?.error ?? `Ciriaco HTTP ${r.status}`); }
}

const qScore = (l: CiriacoLink) => (parseInt(l.quality) || (l.quality === 'HD' ? 720 : 0)) * 10 + l.marks;
export const sortLinks = (links: CiriacoLink[]) => [...links].sort((a, b) => qScore(b) - qScore(a));

/** Evento (o un subconjunto de sus enlaces) → Channel reproducible; cada enlace es un stream/opción. */
export function eventToChannel(ev: CiriacoEvent, links: CiriacoLink[] = ev.links, backend?: { host: string; port: number }): Channel {
  const streams: Stream[] = sortLinks(links).map(l => ({ aceId: l.hash, url: buildStreamUrl(l.hash, backend), label: l.label, provider: l.server || 'DEFAULT' }));
  return { id: `ciriaco-${ev.id}`, tvgId: '', name: ev.title || ev.competition, rawName: ev.title, logo: ev.logos[0] ?? '', group: ev.sport || 'Eventos', streams };
}

export function linkTag(l: CiriacoLink) {
  return [l.quality, l.marks ? '★'.repeat(l.marks) : '', l.server].filter(Boolean).join(' · ');
}

export function eventStatus(date: string, time: string, now = new Date()): 'live' | 'soon' | 'upcoming' | 'finished' {
  const diff = (now.getTime() - new Date(`${date}T${time}:00`).getTime()) / 60000;
  if (diff < -30) return 'upcoming';
  if (diff < 0) return 'soon';
  if (diff < 150) return 'live';
  return 'finished';
}

export function todayIso(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Duración estimada (min) por deporte: Ciriaco solo da la hora de inicio. */
const DURATION: Record<string, number> = {
  'fútbol': 120, 'fútbol sala': 120, 'baloncesto': 150, 'tenis': 180, 'automovilismo': 150, 'ciclismo': 240, 'golf': 240,
  'béisbol': 200, 'fútbol americano': 200, 'rugby': 120, 'boxeo': 180, 'snooker': 240, 'hípica': 120, 'hockey patines': 100,
  'deportes de invierno': 150, 'gimnasia': 120, 'patinaje artístico': 120,
};
export const eventDuration = (sport: string) => DURATION[sport.toLowerCase()] ?? 120;

/** Eventos de hoy en directo o por empezar (con enlaces primero), para la portada. */
export function liveAndNext(data: CiriacoData | null, now = new Date(), limit = 16): { ev: CiriacoEvent; date: string; status: 'live' | 'soon' | 'upcoming' }[] {
  const day = data?.days.find(d => d.date === todayIso(now));
  if (!day) return [];
  const out = day.events
    .map(ev => ({ ev, date: day.date, status: eventStatus(day.date, ev.time, now) }))
    .filter((x): x is { ev: CiriacoEvent; date: string; status: 'live' | 'soon' | 'upcoming' } => x.status !== 'finished')
    .filter(x => x.ev.links.length > 0);
  const rank = { live: 0, soon: 1, upcoming: 2 } as const;
  return out.sort((a, b) => rank[a.status] - rank[b.status] || a.ev.time.localeCompare(b.ev.time)).slice(0, limit);
}

/** Progreso (0-1) de un evento en directo según su duración estimada. */
export function eventProgress(date: string, time: string, sport: string, now = new Date()) {
  const diff = (now.getTime() - new Date(`${date}T${time}:00`).getTime()) / 60000;
  return Math.min(1, Math.max(0, diff / eventDuration(sport)));
}

/** Carga la agenda como lista M3U: servidor local en escritorio, generada en el propio dispositivo en Android. */
export async function ciriacoPlaylistText(backend: { host: string; port: number }): Promise<string> {
  return buildAgendaM3U(await fetchCiriaco(), backend.host, backend.port);
}
