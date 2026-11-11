import { Capacitor, CapacitorHttp } from '@capacitor/core';
import type { Stream } from '@/types';

/**
 * Cliente del protocolo de addons de Stremio (abierto: https://github.com/Stremio/stremio-addon-sdk).
 * Un addon es una dirección que responde en JSON: /manifest.json, /catalog/{tipo}/{id}.json, /meta/{tipo}/{id}.json
 * y /stream/{tipo}/{id}.json. TOPOTV no incluye ningún addon: el usuario añade los suyos.
 */
export interface AddonResource { name: string; types?: string[]; idPrefixes?: string[] }
export interface AddonCatalog {
  type: string; id: string; name?: string;
  extra?: { name: string; isRequired?: boolean; options?: string[] }[];
  extraSupported?: string[]; extraRequired?: string[];
}
export interface AddonManifest {
  id: string; name: string; version?: string; description?: string; logo?: string;
  types?: string[]; resources: (string | AddonResource)[]; catalogs?: AddonCatalog[]; idPrefixes?: string[];
}
export interface Addon { base: string; manifest: AddonManifest; enabled: boolean; addedAt: number }

export interface MetaPreview { id: string; type: string; name: string; poster?: string; posterShape?: string; year?: string | number; releaseInfo?: string; description?: string; imdbRating?: string; genres?: string[] }
export interface MetaVideo { id: string; title?: string; name?: string; season?: number; episode?: number; released?: string; thumbnail?: string; overview?: string }
export interface Meta extends MetaPreview { background?: string; logo?: string; runtime?: string; cast?: string[]; director?: string[]; videos?: MetaVideo[] }
export interface AddonStream {
  url?: string; ytId?: string; infoHash?: string; fileIdx?: number; externalUrl?: string;
  name?: string; title?: string; description?: string; sources?: string[];
  subtitles?: { id?: string; url: string; lang: string }[];
  behaviorHints?: { notWebReady?: boolean; videoSize?: number; filename?: string };
}
/** Un enlace de un addon, ya clasificado según cómo se puede reproducir. */
export interface StreamOption {
  key: string; addon: string; label: string; detail: string;
  kind: 'direct' | 'torrent' | 'external';
  stream?: Stream;          // direct y torrent
  externalUrl?: string;     // external (web o YouTube)
  subtitles: { url: string; lang: string }[];
}

const TIMEOUT_MS = 12000;
const MAX_BYTES = 6_000_000;

/** «stremio://host/ruta/manifest.json» o una dirección normal → base del addon y dirección del manifiesto. */
export function normalizeAddonUrl(input: string): { base: string; manifestUrl: string } {
  let u = input.trim();
  if (/^stremio:\/\//i.test(u)) u = 'https://' + u.slice('stremio://'.length);
  if (!/^https?:\/\//i.test(u)) throw new Error('La dirección debe empezar por https:// o stremio://');
  const url = new URL(u);
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) throw new Error('Solo se aceptan addons por https (o locales de prueba).');
  let path = url.pathname.replace(/\/+$/, '');
  if (path.endsWith('/manifest.json')) path = path.slice(0, -'/manifest.json'.length);
  const base = `${url.origin}${path}`;
  return { base, manifestUrl: `${base}/manifest.json${url.search}` };
}

async function getJson<T>(url: string): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`El addon respondió ${r.status}`);
    const text = await r.text();
    if (text.length > MAX_BYTES) throw new Error('Respuesta demasiado grande');
    return JSON.parse(text) as T;
  } catch (e) {
    // Android: algunos addons no envían CORS; se pide desde el sistema
    if (Capacitor.isNativePlatform()) {
      const r = await CapacitorHttp.get({ url, readTimeout: TIMEOUT_MS, connectTimeout: TIMEOUT_MS });
      if (r.status < 200 || r.status >= 300) throw new Error(`El addon respondió ${r.status}`);
      return (typeof r.data === 'string' ? JSON.parse(r.data) : r.data) as T;
    }
    throw e instanceof Error && e.name === 'AbortError' ? new Error('El addon no respondió a tiempo') : e;
  } finally { clearTimeout(timer); }
}

export async function fetchManifest(manifestUrl: string): Promise<AddonManifest> {
  const m = await getJson<AddonManifest>(manifestUrl);
  if (!m || typeof m.id !== 'string' || typeof m.name !== 'string' || !Array.isArray(m.resources)) throw new Error('Eso no parece un addon de Stremio (manifiesto no válido).');
  return m;
}

export async function installAddon(input: string): Promise<Addon> {
  const { base, manifestUrl } = normalizeAddonUrl(input);
  return { base, manifest: await fetchManifest(manifestUrl), enabled: true, addedAt: Date.now() };
}

const typesOf = (a: Addon) => a.manifest.types ?? [];
function resourceInfo(a: Addon, resource: string): AddonResource | null {
  for (const r of a.manifest.resources) {
    if (typeof r === 'string') { if (r === resource) return { name: r, types: typesOf(a), idPrefixes: a.manifest.idPrefixes }; }
    else if (r.name === resource) return { name: r.name, types: r.types ?? typesOf(a), idPrefixes: r.idPrefixes ?? a.manifest.idPrefixes };
  }
  return null;
}
/** ¿Puede este addon dar `resource` para ese tipo e identificador? */
export function supports(a: Addon, resource: 'meta' | 'stream' | 'catalog' | 'subtitles', type: string, id?: string): boolean {
  if (!a.enabled) return false;
  const r = resourceInfo(a, resource);
  if (!r) return false;
  if (r.types && r.types.length && !r.types.includes(type)) return false;
  if (id && r.idPrefixes && r.idPrefixes.length && !r.idPrefixes.some(p => id.startsWith(p))) return false;
  return true;
}

const extraNames = (c: AddonCatalog) => new Set([...(c.extra ?? []).map(e => e.name), ...(c.extraSupported ?? [])]);
const requiredExtras = (c: AddonCatalog) => [...(c.extra ?? []).filter(e => e.isRequired).map(e => e.name), ...(c.extraRequired ?? [])];
/** Catálogos que se pueden mostrar tal cual (sin parámetros obligatorios). */
export const browsableCatalogs = (a: Addon, type: string) => a.enabled && supports(a, 'catalog', type) ? (a.manifest.catalogs ?? []).filter(c => c.type === type && requiredExtras(c).length === 0) : [];
export const searchableCatalogs = (a: Addon, type?: string) => a.enabled ? (a.manifest.catalogs ?? []).filter(c => (!type || c.type === type) && extraNames(c).has('search') && requiredExtras(c).every(n => n === 'search')) : [];

const enc = encodeURIComponent;
export async function fetchCatalog(a: Addon, c: AddonCatalog, extra?: Record<string, string>): Promise<MetaPreview[]> {
  const ex = extra && Object.keys(extra).length ? '/' + Object.entries(extra).map(([k, v]) => `${enc(k)}=${enc(v)}`).join('&') : '';
  const r = await getJson<{ metas?: MetaPreview[] }>(`${a.base}/catalog/${enc(c.type)}/${enc(c.id)}${ex}.json`);
  return (r.metas ?? []).filter(m => m && m.id && m.name).slice(0, 60);
}

/** Busca en todos los catálogos con búsqueda de los addons activos. Devuelve resultados con el addon que los dio. */
export async function searchAddons(addons: Addon[], query: string, type?: string): Promise<{ meta: MetaPreview; addon: Addon }[]> {
  const jobs: Promise<{ meta: MetaPreview; addon: Addon }[]>[] = [];
  for (const a of addons) for (const c of searchableCatalogs(a, type).slice(0, 4)) jobs.push(fetchCatalog(a, c, { search: query }).then(ms => ms.map(meta => ({ meta, addon: a }))));
  const out = (await Promise.allSettled(jobs)).flatMap(r => r.status === 'fulfilled' ? r.value : []);
  const seen = new Set<string>();
  return out.filter(x => { const k = `${x.meta.type}:${x.meta.id}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

export async function fetchMeta(addons: Addon[], type: string, id: string, preferred?: string): Promise<{ meta: Meta; addon: Addon } | null> {
  const list = addons.filter(a => supports(a, 'meta', type, id)).sort((x, y) => (y.base === preferred ? 1 : 0) - (x.base === preferred ? 1 : 0));
  for (const a of list) {
    try {
      const r = await getJson<{ meta?: Meta }>(`${a.base}/meta/${enc(type)}/${enc(id)}.json`);
      if (r.meta && r.meta.name) return { meta: { ...r.meta, type: r.meta.type || type, id: r.meta.id || id }, addon: a };
    } catch { /* se prueba el siguiente addon */ }
  }
  return null;
}

const clean = (s?: string) => (s ?? '').replace(/\s*\n+\s*/g, ' · ').replace(/\s+/g, ' ').trim();
let seq = 0;
function classify(a: Addon, s: AddonStream): StreamOption | null {
  const label = clean(s.name) || a.manifest.name;
  const detail = clean(s.title ?? s.description) || s.behaviorHints?.filename || '';
  const subtitles = (s.subtitles ?? []).filter(t => t.url && /^https?:/i.test(t.url)).map(t => ({ url: t.url, lang: t.lang }));
  const base = { addon: a.manifest.name, label, detail, subtitles, key: `${a.base}#${seq++}` };
  if (s.url && /^https?:\/\//i.test(s.url)) {
    const stream: Stream = { aceId: `addon:${base.key}`, url: s.url, label: [label, detail].filter(Boolean).join(' · ').slice(0, 160), provider: a.manifest.name, direct: true };
    return { ...base, kind: 'direct', stream };
  }
  if (s.infoHash && /^[0-9a-f]{40}$/i.test(s.infoHash)) {
    const trackers = (s.sources ?? []).filter(x => x.startsWith('tracker:')).map(x => x.slice(8)).filter(x => /^(udp|http|https|ws|wss):\/\//i.test(x)).slice(0, 30);
    const stream: Stream = { aceId: `torrent:${s.infoHash.toLowerCase()}:${s.fileIdx ?? ''}`, url: '', label: [label, detail].filter(Boolean).join(' · ').slice(0, 160), provider: a.manifest.name, torrent: { infoHash: s.infoHash.toLowerCase(), fileIdx: s.fileIdx, trackers } };
    return { ...base, kind: 'torrent', stream };
  }
  if (s.ytId) return { ...base, kind: 'external', externalUrl: `https://www.youtube.com/watch?v=${enc(s.ytId)}` };
  if (s.externalUrl && /^https?:\/\//i.test(s.externalUrl)) return { ...base, kind: 'external', externalUrl: s.externalUrl };
  return null;
}

/** Pide los enlaces a todos los addons activos que los dan para este tipo e identificador (cada uno con su plazo). */
export async function fetchStreams(addons: Addon[], type: string, id: string): Promise<StreamOption[]> {
  const jobs = addons.filter(a => supports(a, 'stream', type, id)).map(async a => {
    const r = await getJson<{ streams?: AddonStream[] }>(`${a.base}/stream/${enc(type)}/${enc(id)}.json`);
    return (r.streams ?? []).slice(0, 60).map(s => classify(a, s)).filter((x): x is StreamOption => !!x);
  });
  return (await Promise.allSettled(jobs)).flatMap(r => r.status === 'fulfilled' ? r.value : []);
}

export const typeLabel = (t: string) => ({ movie: 'Películas', series: 'Series', tv: 'TV', channel: 'Canales', anime: 'Anime' } as Record<string, string>)[t] ?? t[0].toUpperCase() + t.slice(1);
