/**
 * Traductor de contenido (guía de programación, sinopsis de Cine y series…) al idioma que elija el usuario.
 * Todo se traduce DENTRO del dispositivo, gratis y sin cuenta:
 *  - Android: Google ML Kit (los paquetes sin conexión de Google Traductor), plugin nativo «Translate».
 *  - Windows / web: el motor de Firefox Translations (bergamot-translator, MPL-2.0), en public/bergamot.
 * La primera vez que hace falta un idioma se descarga su paquete (unos 20–30 MB) y después funciona sin internet.
 * Lo ya traducido se guarda en este dispositivo para no repetirlo.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';

const native = Capacitor.isNativePlatform();
const NativeTranslate = registerPlugin<{ translate(o: { text: string; to: string; from?: string }): Promise<{ text: string; from?: string }> }>('Translate');

/** Idiomas a los que se puede traducir en cada sistema */
export const LANGUAGES: { code: string; name: string; win: boolean; android: boolean }[] = [
  { code: 'es', name: 'Español', win: true, android: true }, { code: 'ca', name: 'Català', win: false, android: true },
  { code: 'gl', name: 'Galego', win: false, android: true }, { code: 'en', name: 'English', win: true, android: true },
  { code: 'fr', name: 'Français', win: true, android: true }, { code: 'pt', name: 'Português', win: true, android: true },
  { code: 'it', name: 'Italiano', win: true, android: true }, { code: 'de', name: 'Deutsch', win: true, android: true },
  { code: 'nl', name: 'Nederlands', win: true, android: true }, { code: 'pl', name: 'Polski', win: true, android: true },
  { code: 'ro', name: 'Română', win: false, android: true }, { code: 'ru', name: 'Русский', win: true, android: true },
  { code: 'uk', name: 'Українська', win: true, android: true }, { code: 'ar', name: 'العربية', win: false, android: true },
];
export const availableLanguages = () => LANGUAGES.filter(l => (native ? l.android : l.win));

const KEY = 'topotv-translations';
const MAX = 3000;
let cache: Record<string, string> | null = null;
const load = () => { if (!cache) { try { cache = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { cache = {}; } } return cache!; };
let saveTimer: ReturnType<typeof setTimeout> | null = null;
function remember(k: string, v: string) {
  const c = load();
  c[k] = v;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const keys = Object.keys(c);
    if (keys.length > MAX) for (const old of keys.slice(0, keys.length - MAX)) delete c[old];
    try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* sin espacio: queda en memoria */ }
  }, 1500);
}

/** Palabras muy frecuentes por idioma: para adivinar el idioma (Windows no trae detector) y no traducir lo que ya está en el idioma elegido. */
const COMMON: Record<string, RegExp> = {
  es: /\b(el|la|los|las|del|de|y|en|con|para|por|una?|que|se)\b/gi,
  en: /\b(the|and|of|to|in|with|for|is|on|at|from|by|an?)\b/gi,
  pt: /\b(o|a|os|as|do|da|de|e|em|com|para|um|uma|que|não)\b/gi,
  fr: /\b(le|la|les|des|du|de|et|en|avec|pour|un|une|que|est)\b/gi,
  it: /\b(il|la|gli|le|del|della|di|e|in|con|per|un|una|che)\b/gi,
  de: /\b(der|die|das|und|mit|für|von|ein|eine|im|zu|auf|ist)\b/gi,
  nl: /\b(de|het|een|en|van|met|voor|op|is|niet)\b/gi,
  pl: /\b(i|w|z|na|do|nie|się|jest|że|od|po)\b/gi,
};
export function looksLike(text: string, lang: string): boolean {
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words < 3) return false;
  return guessLang(text) === lang;
}
/** Idioma probable de un texto (o undefined si no se sabe) */
export function guessLang(text: string): string | undefined {
  if (/[Ѐ-ӿ]/.test(text)) return /[іїєґ]/i.test(text) ? 'uk' : 'ru';
  if (/[ąćęłńśźż]/i.test(text)) return 'pl';
  let best: string | undefined, bestN = 1;
  for (const [l, re] of Object.entries(COMMON)) { const n = (text.match(re) ?? []).length; if (n > bestN) { best = l; bestN = n; } }
  return best;
}

/** Idioma probable por el país del nombre del canal («Eurosport 1 [DE]» → de) */
export function langFromChannel(name: string): string | undefined {
  const cc = name.match(/\[([A-Z]{2})\]/)?.[1];
  return cc ? ({ DE: 'de', PL: 'pl', RU: 'ru', UK: 'en', US: 'en', BE: 'nl', TR: 'tr', PT: 'pt', NL: 'nl', FR: 'fr', IT: 'it', ES: 'es' } as Record<string, string>)[cc] : undefined;
}

/* ── Windows / web: motor de Firefox Translations ─────────────────────────── */
interface Bergamot { translate(o: { from: string; to: string; text: string; html: boolean }): Promise<{ target: { text: string } }> }
let engine: Promise<{ t: Bergamot; pairs: Set<string> } | null> | null = null;
function bergamot() {
  if (!engine) engine = (async () => {
    try {
      // los paquetes los descarga y guarda la app de Windows (servidor local, mismo origen); la web suelta no los tiene
      const REGISTRY = `${location.origin}/bergamot-models`;
      const reg = await (await fetch(`${REGISTRY}/registry.json`, { signal: AbortSignal.timeout(20000) })).json() as Record<string, Record<string, { name: string }>>;
      for (const [pair, files] of Object.entries(reg)) for (const f of Object.values(files)) if (f?.name && !/^https?:/.test(f.name)) f.name = `${REGISTRY}/${pair}/${f.name}`;
      const registryUrl = URL.createObjectURL(new Blob([JSON.stringify(reg)], { type: 'application/json' }));
      const mod = await import(/* @vite-ignore */ `${location.origin}/bergamot/translator.js`) as { LatencyOptimisedTranslator: new (o: object) => Bergamot };
      return { t: new mod.LatencyOptimisedTranslator({ registryUrl, pivotLanguage: 'en', downloadTimeout: 120000, cacheSize: 2000 }), pairs: new Set(Object.keys(reg)) };
    } catch { setTimeout(() => { engine = null; }, 60000); return null; }   // sin paquetes (web suelta o sin red): se reintenta en un minuto
  })();
  return engine;
}
/** ¿Hay modelos para traducir de «from» a «to» (directo o pasando por el inglés)? */
const canPivot = (pairs: Set<string>, from: string, to: string) => pairs.has(from + to) || ((from === 'en' || pairs.has(from + 'en')) && (to === 'en' || pairs.has('en' + to)));

// Bergamot traduce de uno en uno: se encolan para que no se pisen (y los de la pantalla salen en orden)
let queue: Promise<unknown> = Promise.resolve();

const inflight = new Map<string, Promise<string>>();

/** Traduce un texto (con caché). Si no se puede, devuelve el original. */
export function translate(text: string, to: string, from?: string): Promise<string> {
  const t = text.trim();
  if (!t || t.length < 2 || from === to) return Promise.resolve(text);
  const k = `${to}|${t}`;
  const hit = load()[k];
  if (hit) return Promise.resolve(hit);
  if (inflight.has(k)) return inflight.get(k)!;
  const p = (async () => {
    try {
      let out = text;
      if (native) {
        // la primera vez se descarga el paquete del idioma (puede tardar): si se atasca, se deja el original y se reintenta otro día
        const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('tiempo agotado')), 180000));
        out = (await Promise.race([NativeTranslate.translate({ text: t, to, from }), timeout])).text;
      } else {
        const src = from ?? guessLang(t);
        if (!src || src === to) return text;
        const b = await bergamot();
        if (!b || !canPivot(b.pairs, src, to)) return text;
        const job = queue.then(() => b.t.translate({ from: src, to, text: t, html: false }));
        queue = job.catch(() => undefined);
        out = (await job).target.text;
      }
      if (out && out.trim() && out.trim() !== t) { remember(k, out.trim()); return out.trim(); }
      return text;
    } catch { return text; }
    finally { inflight.delete(k); }
  })();
  inflight.set(k, p);
  return p;
}
