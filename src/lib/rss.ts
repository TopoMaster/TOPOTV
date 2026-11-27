import { Capacitor, CapacitorHttp } from '@capacitor/core';

/**
 * Lector de feeds RSS/Atom que añade el usuario (Ajustes no trae ninguno de serie).
 * En Windows los descarga el servicio local del sistema (puerto 3008) porque muchos feeds no dejan leerse desde una
 * página; en Android los descarga el propio móvil. Cada noticia se abre en el navegador.
 */
const SYS = 'http://localhost:3008';
export interface FeedItem { id: string; feed: string; feedTitle: string; title: string; link: string; date: number; order: number; summary: string; image?: string }
export interface Feed { url: string; title: string; items: FeedItem[]; error?: string }

async function download(url: string): Promise<string> {
  if (Capacitor.isNativePlatform()) {
    const r = await CapacitorHttp.get({ url, responseType: 'text', connectTimeout: 15000, readTimeout: 20000, headers: { 'User-Agent': 'Mozilla/5.0 TOPOTV' } });
    if (r.status < 200 || r.status >= 300) throw new Error(`HTTP ${r.status}`);
    return String(r.data ?? '');
  }
  let r: Response;
  try { r = await fetch(`${SYS}/rss?url=${encodeURIComponent(url)}`, { signal: AbortSignal.timeout(25000) }); }
  catch { r = await fetch(url, { signal: AbortSignal.timeout(20000) }); }   // web suelta: directo (si el feed lo permite)
  if (!r.ok) throw new Error((await r.text().catch(() => '')) || `HTTP ${r.status}`);
  return r.text();
}

const text = (el: Element | null | undefined) => (el?.textContent ?? '').trim();
const strip = (html: string) => {
  const d = new DOMParser().parseFromString(html, 'text/html');
  return (d.body.textContent ?? '').replace(/\s+/g, ' ').trim();
};
const firstImg = (html: string) => (html.match(/<img[^>]+src=["']([^"']+)["']/i) || [])[1];

/** Lee un feed RSS 2.0 o Atom */
export async function fetchFeed(url: string): Promise<Feed> {
  try {
    const xml = new DOMParser().parseFromString(await download(url), 'text/xml');
    if (xml.querySelector('parsererror')) throw new Error('no es un feed RSS válido');
    const atom = !!xml.querySelector('feed > entry');
    const feedTitle = text(xml.querySelector(atom ? 'feed > title' : 'channel > title')) || new URL(url).hostname;
    const nodes = [...xml.querySelectorAll(atom ? 'feed > entry' : 'item')].slice(0, 100);
    const items: FeedItem[] = nodes.map((n, i) => {
      const get = (tag: string) => [...n.children].find(c => c.localName === tag);
      const link = atom ? ([...n.children].find(c => c.localName === 'link' && (c.getAttribute('rel') ?? 'alternate') === 'alternate')?.getAttribute('href') ?? '') : text(get('link'));
      const rawDesc = text(get('description')) || text(get('summary')) || text(get('content')) || text(get('encoded'));
      const media = [...n.children].find(c => (c.localName === 'thumbnail' || c.localName === 'content') && c.getAttribute('url'))?.getAttribute('url')
        ?? [...n.querySelectorAll('*')].find(c => c.localName === 'thumbnail' && c.getAttribute('url'))?.getAttribute('url')
        ?? (get('enclosure')?.getAttribute('type')?.startsWith('image') ? get('enclosure')?.getAttribute('url') : undefined)
        ?? firstImg(rawDesc);
      const title = strip(text(get('title'))) || '(sin título)';
      const when = Date.parse(text(get('pubDate')) || text(get('published')) || text(get('updated')) || text(get('date')));
      // sin fecha en el feed: la del título («… 26.11.2026»), si la lleva
      const dm = Number.isNaN(when) ? title.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/) : null;
      const date = dm ? new Date(Number(dm[3]), Number(dm[2]) - 1, Number(dm[1]), 12).getTime() : (Number.isNaN(when) ? 0 : when);
      return { id: `${url}#${text(get('guid')) || text(get('id')) || link || i}`, feed: url, feedTitle, title, link, date, order: i,
        summary: strip(rawDesc).slice(0, 280), image: media && /^https?:\/\//.test(media) ? media.replace(/^http:\/\//, 'https://') : undefined };
    });
    return { url, title: feedTitle, items };
  } catch (e) {
    return { url, title: (() => { try { return new URL(url).hostname; } catch { return url; } })(), items: [], error: e instanceof Error ? e.message : String(e) };
  }
}
