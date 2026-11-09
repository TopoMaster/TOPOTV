/**
 * Versión Android de la agenda Ciriaco: lo que en Windows hace desktop/tools/ciriaco-server.cjs
 * (descarga + extracción + normalización + M3U), pero dentro de la propia app.
 * La descarga usa HTTP nativo de Capacitor, que no está sujeto a CORS.
 */
import { CapacitorHttp, registerPlugin } from '@capacitor/core';
import logoIndex from './channel-logos.json';
import { useSettingsStore } from '@/store/useSettingsStore';
import { warpDown, warpUp } from '@/lib/warpAndroid';
import type { CiriacoData, CiriacoDay, CiriacoLink, CiriacoStatus } from './ciriaco';

const SOURCE = 'https://ciriaco.netlify.app/';
const CACHE_KEY = 'topotv-ciriaco-cache';
const LOGO_BASE = 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/';
const INDEX = logoIndex as Record<string, string>;
const NOISE = /\b(\d{3,4}p|hd|hdr|uhd|fhd|4k|app|gratis|solo|eventos|disabled|multi|audio|sd)\b/g;
const QUALITY_G = /\b(4K|2160p|1080p|720p|576p|480p|FHD|HD|SD)\b/gi;
const FALLBACKS: [RegExp, string][] = [
  [/^mplus laliga/, 'mplus laliga'], [/^mplus liga de campeones/, 'mplus liga de campeones'], [/^mplus golf/, 'mplus golf'],
  [/^mplus vamos/, 'mplus vamos'], [/^mplus deportes/, 'mplus deportes'], [/^mplus/, 'mplus'], [/^vamos$/, 'mplus vamos'],
  [/^dazn laliga/, 'dazn laliga'], [/^dazn f1/, 'dazn f1'], [/^dazn/, 'dazn'],
  [/^eurosport/, 'eurosport 1'], [/^laliga tv/, 'laliga tv hypermotion'], [/^esport/, 'esport 3'],
];

export function canon(name: string) {
  let s = String(name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  s = s.replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').replace(/^[a-z]{2}:\s*/, '');
  s = s.replace(/movistar\s*plus\s*\+?|movistar\s*\+|\bm\s*\+|\bm\.\s|\bmovistar\b/g, ' mplus ');
  s = s.replace(/\bla\s+liga\b/g, 'laliga').replace(/formula\s*1/g, 'f1');
  s = s.replace(/\b(dazn|esport|eurosport)\s*(\d)/g, '$1 $2').replace(/\bdazn(\d)/g, 'dazn $1');
  s = s.replace(NOISE, ' ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  return s.replace(/^mplus laliga tv\b/, 'mplus laliga');
}
export function clean(raw: string) {
  return String(raw || '')
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').replace(/^[A-Za-z]{2}:\s*/, '')
    .replace(/\b(4K|2160p|1080p|720p|576p|480p|FHD|HDR|UHD|HD|SD)\b/gi, ' ')
    .replace(/\b(Gratis|App)\b/gi, ' ')
    .replace(/^M\.\s*/, 'M+ ').replace(/^Movistar\s+(?!plus|\+)/i, 'M+ ').replace(/^Movistar\s*(Plus\s*\+?|\+)\s*$/i, 'M+')
    .replace(/\s+/g, ' ').trim();
}
export function logoFor(key: string) {
  let file = INDEX[key];
  if (!file) for (const [re, k] of FALLBACKS) if (re.test(key) && INDEX[k]) { file = INDEX[k]; break; }
  return file ? LOGO_BASE + file : '';
}

interface RawLink { href: string; text: string }
interface RawEvent { time: string; round: string; flag: string; sport: string; competition: string; title: string; logos: string[]; channelsText: string; links: RawLink[] }
interface RawDay { date: string; label: string; events: RawEvent[] }

/** Misma lectura que extractInBrowser() del servidor de escritorio, sobre un documento parseado. */
export function extractAgenda(doc: Document): RawDay[] {
  const cl = (s?: string | null) => (s || '').replace(/\s+/g, ' ').trim();
  const days: RawDay[] = [];
  let cur: RawDay | null = null;
  for (const el of Array.from(doc.querySelectorAll('h2.fecha, table.tabla-eventos'))) {
    if (el.tagName === 'H2') {
      const m = cl(el.textContent).match(/(\d{2})\/(\d{2})\/(\d{4})/);
      cur = { date: m ? `${m[3]}-${m[2]}-${m[1]}` : '', label: cl(el.textContent), events: [] };
      days.push(cur);
      continue;
    }
    if (!cur) continue;
    const body = (el as HTMLTableElement).tBodies[0];
    for (const tr of Array.from(body ? body.rows : [])) {
      const c = (k: string) => tr.querySelector(`td[data-label="${k}"]`);
      const time = cl(c('Hora')?.textContent);
      if (!/^\d{1,2}:\d{2}$/.test(time)) continue;
      const compClone = c('Competición')?.cloneNode(true) as Element | undefined;
      const round = cl(compClone?.querySelector('.ronda')?.textContent);
      compClone?.querySelector('.ronda')?.remove();
      const flag = (c('Competición')?.querySelector('[class*="flag-icon-"]')?.className.match(/flag-icon-([a-z-]+)/) || [])[1] || '';
      const evCell = c('Evento');
      const chCell = c('Canales');
      cur.events.push({
        time, round, flag,
        sport: cl(c('Deporte')?.querySelector('.deporte')?.textContent || c('Deporte')?.textContent),
        competition: cl(compClone?.textContent),
        title: cl(evCell?.textContent),
        logos: Array.from(evCell?.querySelectorAll('img') || []).map(i => i.getAttribute('src') || '').filter(Boolean)
          .map(src => { try { return new URL(src, SOURCE).href; } catch { return src; } }),
        channelsText: cl(chCell?.querySelector('span')?.textContent),
        links: Array.from(chCell?.querySelectorAll('a[href^="acestream://"]') || []).map(a => ({ href: a.getAttribute('href') || '', text: cl(a.textContent) })),
      });
    }
  }
  return days;
}

function parseLink(l: RawLink) {
  const hash = (l.href.match(/acestream:\/\/([a-f0-9]{40})/i) || [])[1];
  if (!hash) return null;
  const [left, right] = l.text.split('-->').map(s => (s || '').trim());
  const qs = left.match(QUALITY_G) || [];
  const best = qs.find(x => /p$/i.test(x)) || qs[0] || '';
  return {
    hash: hash.toLowerCase(), label: l.text, rawChannel: left.replace(/\*+/g, '').replace(QUALITY_G, '').replace(/\s+/g, ' ').trim(),
    quality: /p$/i.test(best) ? best.toLowerCase() : best.toUpperCase(), marks: (left.match(/\*+/) || [''])[0].length, server: right || '',
  };
}

export function normalizeAgenda(rawDays: RawDay[]): Pick<CiriacoData, 'days' | 'channels'> {
  const variants = new Map<string, Map<string, number>>();
  const see = (raw: string) => {
    const key = canon(raw);
    if (!key) return '';
    const disp = clean(raw);
    if (!variants.has(key)) variants.set(key, new Map());
    const m = variants.get(key)!;
    m.set(disp, (m.get(disp) || 0) + 1);
    return key;
  };
  let n = 0;
  const days: CiriacoDay[] = rawDays.map(d => ({
    date: d.date, label: d.label,
    events: d.events.map(e => {
      const seen = new Set<string>();
      const links = e.links.map(parseLink).filter((l): l is NonNullable<ReturnType<typeof parseLink>> => !!l && !seen.has(l.hash) && !!seen.add(l.hash))
        .map(l => ({ ...l, channelKey: see(l.rawChannel) }));
      const chanNames = e.channelsText.split(/\s+-\s+|\s*,\s*/).map(s => s.trim()).filter(Boolean);
      const channelKeys = [...new Set([...chanNames.map(see), ...links.map(l => l.channelKey)].filter(Boolean))];
      const vs = e.title.split(/\s+vs\.?\s+/i);
      return {
        id: `${d.date}-${e.time.replace(':', '')}-${n++}`, time: e.time.padStart(5, '0'),
        sport: e.sport, competition: e.competition, round: e.round, flag: e.flag, title: e.title,
        home: vs.length === 2 ? vs[0] : '', away: vs.length === 2 ? vs[1] : '', logos: e.logos,
        channelKeys, links: links as unknown as CiriacoLink[],
      };
    }),
  }));
  const channels: CiriacoData['channels'] = {};
  for (const [key, m] of variants) {
    const best = [...m].sort((a, b) => b[1] - a[1] || (/[a-z]/.test(b[0]) ? 1 : 0) - (/[a-z]/.test(a[0]) ? 1 : 0))[0][0];
    channels[key] = { name: best, logo: logoFor(key) };
  }
  for (const d of days) for (const e of d.events) for (const l of e.links) {
    const raw = l as CiriacoLink & { rawChannel?: string };
    raw.channel = channels[l.channelKey]?.name || raw.rawChannel || '';
    delete raw.rawChannel;
  }
  return { days, channels };
}

/* ── Estado y caché local ───────────────────────────────────── */
const state = { updating: false, phase: '', lastError: '', via: 'directo' };
let cached: { fetchedAt: string; data: CiriacoData } | null = null;
function readCache() {
  if (cached) return cached;
  try { const raw = localStorage.getItem(CACHE_KEY); if (raw) cached = JSON.parse(raw); } catch { /* sin caché */ }
  return cached;
}
const sameDay = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

export function nativeStatus(): CiriacoStatus {
  const c = readCache();
  return { fetchedAt: c?.fetchedAt ?? null, via: c ? (c.data.via || 'directo') : null, fresh: !!c && sameDay(c.fetchedAt), updating: state.updating, phase: state.phase, lastError: state.lastError, warp: { available: false, connected: null, mode: 'off' } };
}

/** Plugin nativo (AgendaScraperPlugin.java): carga la web en un WebView oculto y ejecuta un script cuando ya se ha dibujado. */
const AgendaScraper = registerPlugin<{ scrape(o: { url: string; script: string; readySelector: string; timeoutMs: number }): Promise<{ data: string }> }>('AgendaScraper');

/** Mismo recorrido que extractAgenda(), en JavaScript plano para ejecutarlo dentro de la página. */
const IN_PAGE_SCRIPT = String.raw`(function(){
var cl=function(s){return (s||'').replace(/\s+/g,' ').trim();};
var days=[],cur=null;
var els=document.querySelectorAll('h2.fecha, table.tabla-eventos');
for(var i=0;i<els.length;i++){var el=els[i];
if(el.tagName==='H2'){var m=cl(el.textContent).match(/(\d{2})\/(\d{2})\/(\d{4})/);cur={date:m?m[3]+'-'+m[2]+'-'+m[1]:'',label:cl(el.textContent),events:[]};days.push(cur);continue;}
if(!cur)continue;
var body=el.tBodies[0];var rows=body?body.rows:[];
for(var j=0;j<rows.length;j++){var tr=rows[j];
var c=function(k){return tr.querySelector('td[data-label="'+k+'"]');};
var time=cl((c('Hora')||{}).textContent);
if(!/^\d{1,2}:\d{2}$/.test(time))continue;
var comp=c('Competición');var clone=comp?comp.cloneNode(true):null;
var ronda=clone?clone.querySelector('.ronda'):null;var round=cl(ronda?ronda.textContent:'');
if(ronda)ronda.remove();
var fm=comp?comp.querySelector('[class*="flag-icon-"]'):null;var fc=fm?fm.className.match(/flag-icon-([a-z-]+)/):null;
var evCell=c('Evento'),chCell=c('Canales'),dep=c('Deporte');
var depEl=dep?dep.querySelector('.deporte'):null;
var imgs=evCell?evCell.querySelectorAll('img'):[];var logos=[];for(var k=0;k<imgs.length;k++){if(imgs[k].src)logos.push(imgs[k].src);}
var links=[];var as=chCell?chCell.querySelectorAll('a[href^="acestream://"]'):[];for(k=0;k<as.length;k++){links.push({href:as[k].getAttribute('href'),text:cl(as[k].textContent)});}
var span=chCell?chCell.querySelector('span'):null;
cur.events.push({time:time,round:round,flag:fc?fc[1]:'',sport:cl(depEl?depEl.textContent:(dep?dep.textContent:'')),competition:cl(clone?clone.textContent:''),title:cl(evCell?evCell.textContent:''),logos:logos,channelsText:cl(span?span.textContent:''),links:links});
}}
return JSON.stringify(days);
})()`;

async function readAgenda(): Promise<RawDay[]> {
  // 1) WebView oculto: la tabla de Ciriaco se dibuja con JavaScript, igual que en Windows
  let webError = '';
  try {
    const res = await AgendaScraper.scrape({ url: SOURCE, script: IN_PAGE_SCRIPT, readySelector: 'table.tabla-eventos tbody tr', timeoutMs: 45000 });
    const raw = JSON.parse(JSON.parse(res.data)) as RawDay[];
    if (raw.some(d => d.events.length)) return raw;
    webError = 'La página cargó pero sin eventos.';
  } catch (e) { webError = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e); }
  // 2) Descarga directa del HTML (por si la web llegara a servir las tablas ya hechas)
  try {
    const res = await CapacitorHttp.get({ url: SOURCE, headers: { Accept: 'text/html' }, connectTimeout: 20000, readTimeout: 30000, responseType: 'text' });
    if (res.status >= 200 && res.status < 300) {
      const raw = extractAgenda(new DOMParser().parseFromString(String(res.data), 'text/html'));
      if (raw.some(d => d.events.length)) return raw;
    }
  } catch { /* se informa abajo */ }
  const blocked = /TIMEOUT|NETWORK/.test(webError);
  throw new Error(blocked
    ? 'No se pudo abrir Ciriaco (tu red puede estar bloqueándolo). Comprueba que el WARP integrado esté en «Automático» en Ajustes, o usa tu propia VPN y vuelve a pulsar Actualizar.'
    : 'No se encontraron eventos en la página de Ciriaco (puede haber cambiado de formato).');
}

export async function nativeScrape(): Promise<CiriacoData> {
  state.updating = true; state.phase = 'Leyendo Ciriaco…'; state.lastError = '';
  try {
    // WARP integrado: se conecta solo mientras se lee la agenda y se apaga siempre al terminar
    let warpOn = false;
    if (useSettingsStore.getState().warpAuto) {
      state.phase = 'Conectando WARP…';
      const problem = await warpUp();
      warpOn = problem === null;
      if (problem) console.warn('[WARP]', problem);   // se sigue sin WARP
    }
    let raw: RawDay[];
    try { state.phase = warpOn ? 'Leyendo Ciriaco vía WARP…' : 'Leyendo Ciriaco…'; raw = await readAgenda(); }
    finally { if (warpOn) { state.phase = 'Desconectando WARP…'; await warpDown(); } }
    state.via = warpOn ? 'warp' : 'directo';
    const { days, channels } = normalizeAgenda(raw);
    const fetchedAt = new Date().toISOString();
    const data: CiriacoData = { source: SOURCE, fetchedAt, via: state.via, days, channels, status: { ...nativeStatus(), fetchedAt, fresh: true, updating: false } };
    cached = { fetchedAt, data };
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(cached)); } catch { /* sin espacio */ }
    return data;
  } catch (e) {
    state.lastError = e instanceof Error ? e.message : String(e);
    throw e;
  } finally { state.updating = false; state.phase = ''; }
}

/** Agenda en caché; si no es de hoy intenta actualizarla y, si falla, usa la antigua. */
export async function nativeAgenda(): Promise<CiriacoData> {
  const c = readCache();
  if (c && sameDay(c.fetchedAt)) return { ...c.data, status: nativeStatus() };
  try { return await nativeScrape(); }
  catch (e) { if (c) return { ...c.data, status: nativeStatus() }; throw e; }
}

/** Mismo formato que /api/ciriaco/playlist.m3u del servidor de escritorio. */
export function buildAgendaM3U(data: CiriacoData, host: string, port: number): string {
  const byChannel = new Map<string, CiriacoLink[]>();
  const seen = new Set<string>();
  for (const d of data.days) for (const e of d.events) for (const l of e.links) {
    if (seen.has(l.hash)) continue;
    seen.add(l.hash);
    if (!byChannel.has(l.channelKey)) byChannel.set(l.channelKey, []);
    byChannel.get(l.channelKey)!.push(l);
  }
  const q = (l: CiriacoLink) => (parseInt(l.quality) || (l.quality === 'HD' ? 720 : 0)) * 10 + l.marks;
  const out = ['#EXTM3U'];
  const entries = [...byChannel].map(([key, links]) => [key, data.channels[key]?.name || key, links] as const).sort((a, b) => a[1].localeCompare(b[1], 'es'));
  for (const [key, name, links] of entries) {
    const logo = data.channels[key]?.logo || '';
    for (const l of [...links].sort((a, b) => q(b) - q(a))) {
      const label = `${name}${l.quality ? ' ' + l.quality : ''}${l.marks ? ' ' + '*'.repeat(l.marks) : ''} --> ${l.server || 'DEFAULT'}`;
      out.push(`#EXTINF:-1 tvg-id="ciriaco-${key.replace(/[^a-z0-9]+/g, '-')}" tvg-logo="${logo}" group-title="TOPOTV",${label}`);
      out.push(`http://${host}:${port}/ace/getstream?id=${l.hash}`);
    }
  }
  return out.join('\n') + '\n';
}
