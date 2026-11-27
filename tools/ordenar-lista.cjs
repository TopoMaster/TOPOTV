#!/usr/bin/env node
/**
 * Ordena una lista M3U de canales deportivos: grupos claros, nombres limpios, calidad aparte,
 * enlaces repetidos fuera e identificadores (tvg-id) de la guía EPG para que la Parrilla y los
 * eventos de TOPOTV (y cualquier reproductor) reconozcan cada canal.
 *
 *   node tools/ordenar-lista.cjs [entrada=lista.txt] [salida=lista.m3u]
 *   node tools/ordenar-lista.cjs lista.m3u lista.m3u   ← reordena la lista ya hecha (p. ej. tras pegarle otra al final)
 *
 * Repetidos: dos enlaces con el mismo ID de AceStream son el mismo, aunque estén escritos distinto.
 * Si la lista ya estaba ordenada por esta herramienta (lleva tvg-name), se respetan sus grupos.
 *
 * Guías (EPG): prueba todas las guías gratuitas candidatas (GUIDE_POOL) y se queda con el conjunto más ligero que
 * cubre más canales (el móvil descarga y lee todas las que anuncie la lista). Cada canal recibe el identificador
 * exacto de su guía, comprobando que la app lo resolverá a ese canal y no a otro con el mismo nombre.
 * Logos: los que traiga la lista; si no, el de la guía del canal (o el de otra guía que lo tenga).
 *
 * También deja una copia en la carpeta de listas de TOPOTV (Documentos\TOPOTV\Listas), que la app de
 * Windows carga sola en cada actualización.
 *
 * La lista es tuya y se queda en tu equipo: lista*.txt y lista*.m3u están en .gitignore.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const zlib = require('zlib');
const { loose } = require('./epg-server.cjs');

const ROOT = path.join(__dirname, '..');
const input = path.resolve(ROOT, process.argv[2] || 'lista.txt');
const output = path.resolve(ROOT, process.argv[3] || 'lista.m3u');
const R = n => `https://epgshare01.online/epgshare01/epg_ripper_${n}.xml.gz`;
/** Guías gratuitas candidatas. cc = país; serves = otros países cuyos canales lleva (las austriacas, canales alemanes; la ucraniana, rusos).
 *  logos: solo se usa para sacar logos (es demasiado grande para que la descargue la app). */
const GUIDE_POOL = [
  { url: 'https://raw.githubusercontent.com/davidmuma/EPG_dobleM/master/guiatv.xml.gz', cc: 'ES', always: true },
  { url: R('ES1'), cc: 'ES' }, { url: R('DE1'), cc: 'DE' }, { url: R('AT1'), cc: 'AT', serves: ['DE'] }, { url: R('PL1'), cc: 'PL' },
  { url: R('UK1'), cc: 'UK' }, { url: R('US_SPORTS1'), cc: 'US' }, { url: R('US2'), cc: 'US' }, { url: R('BE2'), cc: 'BE' },
  { url: R('NL1'), cc: 'NL' }, { url: R('TR1'), cc: 'TR' }, { url: R('PT1'), cc: 'PT' }, { url: R('IT1'), cc: 'IT' },
  { url: R('UA1'), cc: 'UA', serves: ['RU'] },
  { url: 'https://iptvx.one/EPG_LITE', cc: '', logos: true },
];
/** Canales sin país en el nombre que son de otro país (para buscarlos en su guía) */
const BRAND_COUNTRY = [[/^sport tv/i, 'PT'], [/ziggo/i, 'NL'], [/supertennis|^sky sport (motogp|tennis)/i, 'IT'], [/^nba|^tennis channel/i, 'US']];

/* ── Grupos (en este orden). Mismos nombres que usa TOPOTV para los canales de la agenda
   (src/lib/m3uParser.ts → CATEGORY_RULES), para que no salgan categorías repetidas. ── */
const GROUPS = [
  ['LA LIGA', /^(m\+|dazn) ?laliga|la liga/i],
  ['HYPERMOTION', /hypermotion|laliga tv/i],
  ['LIGA DE CAMPEONES', /liga de campeones|champions/i],
  ['MOVISTAR DEPORTES', /^m\+ ?deportes/i],
  ['FORMULA 1', /\bf1\b|formula ?1/i],
  ['MOTOGP', /motogp/i],
  ['BALONCESTO', /baloncesto|basket|acb|euroliga/i],
  ['NBA', /\bnba\b/i],
  ['TENNIS', /tenis|tennis/i],
  ['GOLF', /golf/i],
  ['MOVISTAR', /^m\+|movistar/i],
  ['DAZN', /dazn/i],
  ['EUROSPORT', /eurosport/i],
  ['TDT', /^(la ?1|la ?2|teledeporte|telecinco|cuatro|antena ?3|la ?sexta|24 ?h)\b/i],
  ['TDT AUTONÓMICAS', /^(esport ?3|tv3|[àa] punt|etb|tvg|canal sur|telemadrid|aragon|cmm|ib3)\b/i],
  ['RFEF TV', /rfef/i],
  ['TOROS', /toro/i],
  ['COMBATE', /\bufc\b|boxeo|boxing|\bwwe\b|combate/i],
  ['INTERNACIONAL', /sport ?tv|fox sports|azteca|nbc|espn|sky sport|tnt|bein|eleven|ziggo/i],
];
/* Canales de otros países («Eurosport 1 HD [DE] (sport)»): un grupo por país y otro con sus deportes */
const COUNTRIES = { UK: 'REINO UNIDO', US: 'EE. UU.', PT: 'PORTUGAL', FR: 'FRANCIA', IT: 'ITALIA', DE: 'ALEMANIA', NL: 'PAÍSES BAJOS', BE: 'BÉLGICA', PL: 'POLONIA', TR: 'TURQUÍA', RU: 'RUSIA' };
const countryName = cc => COUNTRIES[cc] || cc;
const SPORT_WORDS = /sport|dazn|eurosport|bundesliga|bein|eleven|espn|setanta|ufc|fight|motorvision|motowizja|матч|футбол|хоккей|кхл|бокс|спорт/i;
function groupOf(name, country, kind) {
  if (country && country !== 'ES' && kind !== 'sport' && SPORT_WORDS.test(name)) kind = 'sport';
  if (country && country !== 'ES') return `${countryName(country)}${kind === 'sport' ? ' · DEPORTES' : ''}`;
  if (kind && kind !== 'sport') return { movies: 'CINE', kids: 'INFANTIL', music: 'MÚSICA', educational: 'DOCUMENTALES' }[kind] || 'OTROS';
  return (GROUPS.find(([, re]) => re.test(name)) || ['DEPORTES'])[0];
}

/* ── Nombres ────────────────────────────────────────────────── */
const FIXES = [
  [/^movistar plus\+?$/i, 'Movistar Plus+'], [/^m\+ ?vamos/i, 'M+ Vamos'], [/^dazn motogp/i, 'DAZN MotoGP'], [/^dazn f1/i, 'DAZN F1'],
  [/^la ?1( tve)?$/i, 'La 1'], [/^la ?2( tve)?$/i, 'La 2'], [/^cuatro$/i, 'Cuatro'], [/^a punt$/i, 'À Punt'], [/^rally tv$/i, 'Rally TV'],
  [/^esport ?3$/i, 'Esport 3'], [/^onetoro( tv)?$/i, 'OneToro TV'], [/^bein sports? hd (\d)/i, 'beIN Sports $1'], [/^bein sports?/i, 'beIN Sports'],
  [/^azteca deportes$/i, 'Azteca Deportes'], [/^sport ?tv ?(\d)$/i, 'Sport TV $1'], [/^nbc sports$/i, 'NBC Sports'],
];
/** «DAZN 2 1080p **» → { base: 'DAZN 2', quality: '1080p', mark: 2 } · «Eurosport 1 HD [DE] (sport)» → país DE, tipo sport */
function splitName(raw, bareCountry = false) {
  let s = raw.trim();
  let kind = '', country = '';
  s = s.replace(/\s*\(opci[oó]n \d+\)\s*$/i, '').trim();          // «(opción 2)» de una pasada anterior
  s = s.replace(/\s*\(([a-z]+)\)\s*$/i, (_, k) => { kind = k.toLowerCase(); return ''; }).trim();
  s = s.replace(/\s*\[([A-Z]{2})\]/, (_, c) => { country = c; return ''; }).trim();   // «Eurosport 1 [DE] HD»
  const mark = (s.match(/\*+\s*$/) || [''])[0].trim().length;
  s = s.replace(/\*+\s*$/, '').trim();
  s = s.replace(/^M\.\s+/, 'M+ ').replace(/^(DAZN)(\d)\b/i, 'DAZN $2');
  let quality = '';
  const q = s.match(/\s(4k|uhd|\d{3,4}p|fhd|hd|sd)$/i);
  if (q) { quality = q[1].toUpperCase().replace(/(\d)P$/, '$1p'); s = s.slice(0, q.index).trim(); }
  // otras listas ponen el país suelto al final («Bein Sports 2 TR»)
  if (bareCountry && !country) s = s.replace(/\s+(TR|DE|PL|UK|US|RU|PT|FR|IT|NL|BE)$/, (_, c) => { country = c; return ''; }).trim();
  s = s.replace(/\s+tve(\s+4k)?$/i, (_, k) => { if (k) quality = '4K'; return ''; }).trim();
  for (const [re, fix] of FIXES) if (re.test(s)) { s = s.replace(re, fix); break; }
  if (/^[a-zñç][a-zñç0-9 ]*$/.test(s)) s = s[0].toUpperCase() + s.slice(1);   // «luz» → «Luz»
  return { base: country ? `${s} [${country}]` : s, plain: s, quality, mark, kind, country };
}
const QRANK = q => ({ '4K': 4, UHD: 4, '1080p': 3, FHD: 3, '720p': 2, HD: 2, SD: 1 }[q] || 0);

/* ── M3U ────────────────────────────────────────────────────── */
function parse(text) {
  const lines = text.split(/\r?\n/);
  const header = lines.find(l => l.startsWith('#EXTM3U')) || '#EXTM3U';
  const tvgUrls = ((header.match(/url-tvg="([^"]*)"/) || [])[1] || '').split(',').map(u => u.trim()).filter(Boolean);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith('#EXTINF')) continue;
    const inf = lines[i];
    let j = i + 1;
    while (j < lines.length && (!lines[j].trim() || lines[j].startsWith('#EXTVLCOPT'))) j++;
    const url = (lines[j] || '').trim();
    if (!/^(acestream|https?):\/\//i.test(url)) continue;
    const attr = k => (inf.match(new RegExp(`${k}="([^"]*)"`)) || [])[1] || '';
    out.push({ name: inf.slice(inf.lastIndexOf(',') + 1).trim(), logo: attr('tvg-logo'), tvgId: attr('tvg-id'), tvgName: attr('tvg-name'), group: attr('group-title'), url });
    i = j;
  }
  return { tvgUrls, entries: out };
}

function download(url, n = 0) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 TOPOTV' }, timeout: 180000 }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && n < 5) return resolve(download(new URL(res.headers.location, url).href, n + 1));
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      const chunks = []; res.on('data', c => chunks.push(c));
      res.on('end', () => { const raw = Buffer.concat(chunks); const b = raw[0] === 0x1f && raw[1] === 0x8b ? zlib.gunzipSync(raw) : raw; resolve({ xml: b.toString('utf8'), gz: raw.length, size: b.length }); });
    }).on('error', reject).on('timeout', function () { this.destroy(new Error('tiempo agotado')); });
  });
}
/** Clave para emparejar nombres (cualquier alfabeto): sin tildes, sin calidad y con el «+» («SPORT1+» no es «SPORT1») */
const key = s => String(s || '').replace(/\s*\[[^\]]*\]/g, ' ').replace(/\.[a-z]{2}\d?$/, '')   // «Матч Премьер [RU]», «ESPN.HD.us2»
  .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ł/g, 'l').replace(/ß/g, 'ss').replace(/ё/g, 'е')
  .replace(/\+/g, ' plus ').replace(/\b(?:4k|uhd|fhd|hd|sd|hevc|h265|backup|multiaudio)\b|\b\d{3,4}p\b/g, ' ').replace(/[^\p{L}\p{N}]+/gu, '');
/** Las claves con las que la APP busca en la guía (tools/epg-server.cjs y src/lib/epgNative.ts): deben coincidir */
const appNorm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}]+/gu, '');
/** Nombres que han cambiado y la guía ya usa con el nombre nuevo */
const ALIASES = [
  [/^bt sport (\d)$/i, 'TNT Sports $1'], [/^bt sport \/ espn$/i, 'TNT Sports 4'], [/^sky sports cricket$/i, 'SkySp Cricket'],
  [/^fox sports 1$/i, 'FS1'], [/^fox sports 2$/i, 'FS2'], [/^espn2$/i, 'ESPN 2'], [/^eurosport$/i, 'Eurosport 1'],
  [/^sky bundesliga/i, 'Sky Sport Bundesliga'], [/^sky 1$/i, 'Sky One'], [/^universal tv$/i, 'Universal Channel'], [/^history$/i, 'The HISTORY Channel'],
  [/^discovery channel$/i, 'Discovery'], [/^nat geographic$/i, 'Nat Geo'], [/^13th street$/i, '13th Street Universal'], [/^wdr\b.*/i, 'WDR'], [/^swr\b.*/i, 'SWR/SR'],
  [/^canal \+$/i, 'CANAL+ 1'], [/^axnspin(hd)?$/i, 'AXN Spin'], [/^tv puls 2$/i, 'PULS 2'], [/^jimjam$/i, 'Polsat JimJam'], [/^kuchnia\+?$/i, 'CANAL+ KUCHNIA'],
  [/^paramount channel$/i, 'Paramount Network'], [/^sundance channel$/i, 'Sundance TV'], [/^extreme sports$/i, 'Extreme Channel'], [/^servus tv$/i, 'ServusTV'],
  [/^ziggo sport$/i, 'Ziggo Sport 1'], [/^movistar plus\+?$/i, 'Movistar Plus'], [/^dazn (\d)$/i, 'DAZN $1 HD'],
];
/** Variantes de un nombre para buscarlo en la guía */
function variants(name, country) {
  const out = [name];
  for (const [re, to] of ALIASES) if (re.test(name)) out.push(name.replace(re, to));
  if (country === 'PL') out.push(`${name} Polska`);
  if (country === 'DE') out.push(`${name} Deutschland`);
  out.push(name.replace(/\s*\(.*?\)\s*/g, ' ').trim());
  out.push(name.replace(/\s+polska$/i, ''), `${name} Channel`, name.replace(/\s+channel$/i, ''), name.replace(/\s+tv$/i, ''), `${name} TV`);
  return [...new Set(out.filter(Boolean))];
}
/** Descarga cada guía candidata y la indexa: nombre → id, logos y qué canales tienen programación */
async function loadGuides() {
  const guides = [];
  for (const g of GUIDE_POOL) {
    try {
      const { xml, gz, size } = await download(g.url);
      const byKey = new Map(), icons = new Map(), names = new Map();
      for (const m of xml.matchAll(/<channel\s+id="([^"]*)"[^>]*>([\s\S]*?)<\/channel>/g)) {
        const id = m[1];
        const dn = [...m[2].matchAll(/<display-name[^>]*>([^<]*)<\/display-name>/g)].map(x => x[1]);
        names.set(id, dn);
        for (const n of [id, ...dn]) { const k = key(n); if (k && !byKey.has(k)) byKey.set(k, id); }
        const icon = (m[2].match(/<icon\s+src="([^"]+)"/) || [])[1];
        const src = icon && icon.replace(/&amp;/g, '&');
        // solo direcciones limpias (alguna guía mete trozos de HTML) y no la imagen genérica; siempre https (el móvil bloquea http)
        if (src && /^https?:\/\/[^\s"'<>]+$/.test(src) && !/\/default\.(png|jpg)$/i.test(src)) icons.set(id, src.replace(/^http:\/\//, 'https://'));
      }
      const withProgs = new Set([...xml.matchAll(/<programme\b[^>]*\bchannel="([^"]*)"/g)].map(m => m[1]));
      guides.push({ ...g, byKey, icons, names, withProgs, gzMB: gz / 1048576, xmlMB: size / 1048576 });
      console.log(`guía: ${g.url.replace(/.*\//, '').padEnd(28)} ${(gz / 1048576).toFixed(1).padStart(5)} MB (${(size / 1048576).toFixed(0)} MB sin comprimir) · ${names.size} canales${g.logos ? ' · solo logos' : ''}`);
    } catch (e) { console.log(`guía no disponible (${g.url.replace(/.*\//, '')}): ${e.message}`); }
  }
  return guides;
}
/** ¿Puede esta guía dar la programación de un canal de este país? */
function servesCountry(g, country, plain) {
  if (g.logos) return false;
  if (country) return g.cc === country || (g.serves || []).includes(country);
  const hint = (BRAND_COUNTRY.find(([re]) => re.test(plain)) || [])[1];
  return hint ? g.cc === hint : g.cc === 'ES';
}
/** id del canal en una guía (o '') */
const findIn = (g, tries) => tries.map(t => g.byKey.get(key(t))).find(Boolean) || '';

/** Carpeta de listas de TOPOTV: se la pregunta a la app si está abierta; si no, Documentos\TOPOTV\Listas. */
async function listsFolder() {
  if (process.platform !== 'win32') return null;
  const fromApp = await new Promise(resolve => {
    const req = require('http').get({ host: '127.0.0.1', port: 3008, path: '/lists', timeout: 2000 }, res => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => { try { resolve(JSON.parse(d).dir || null); } catch { resolve(null); } });
    });
    req.on('timeout', () => { req.destroy(); resolve(null); }); req.on('error', () => resolve(null));
  });
  if (fromApp) return fromApp;
  try {
    const docs = require('child_process').execFileSync('powershell.exe', ['-NoProfile', '-Command', "[Environment]::GetFolderPath('MyDocuments')"], { encoding: 'utf8', windowsHide: true }).trim();
    return docs ? path.join(docs, 'TOPOTV', 'Listas') : null;
  } catch { return path.join(require('os').homedir(), 'Documents', 'TOPOTV', 'Listas'); }
}

(async () => {
  const { tvgUrls, entries } = parse(fs.readFileSync(input, 'utf8'));
  const guides = await loadGuides();
  const poolUrls = new Set(GUIDE_POOL.map(g => g.url));
  // guías que hubieras puesto tú a mano en la cabecera (que no son de las candidatas): se conservan
  const extraUrls = tvgUrls.map(u => u.replace('/refs/heads/master/', '/master/').replace(/(guiatv\.xml)$/, '$1.gz')).filter(u => !poolUrls.has(u) && !/epgshare01\.online\/epgshare01\/epg_ripper_/.test(u));

  const order0 = [...GROUPS.map(g => g[0]), 'DEPORTES', 'CINE', 'INFANTIL', 'MÚSICA', 'DOCUMENTALES', 'OTROS', ...Object.values(COUNTRIES).flatMap(c => [`${c} · DEPORTES`, c])];
  const KNOWN = new Set(order0);
  /** Grupo: el de una pasada anterior se respeta; si no, las reglas; y si las reglas no saben, el de la lista de origen */
  const pickGroup = (e, n) => {
    const fits = !n.country || e.group.startsWith(countryName(n.country));   // el país del nombre no lo contradice
    if (e.tvgName && KNOWN.has(e.group) && fits) return e.group;
    const g = groupOf(n.plain, n.country, n.kind);
    return g === 'DEPORTES' && KNOWN.has(e.group) && e.group !== 'OTROS' ? e.group : g;
  };
  const idOf = url => (url.match(/[0-9a-f]{40}/i) || [url])[0].toLowerCase();
  const seen = new Set();
  const channels = new Map();   // base → { base, group, logo, tvgId, links[] }
  let dup = 0;
  for (const e of entries) {
    const id = idOf(e.url);
    if (seen.has(id)) { dup++; continue; }
    seen.add(id);
    const n = splitName(e.name, true);
    const { base, plain, quality, mark, country } = n;
    const ckey = base.toLowerCase().replace(/\s+/g, ' ');   // «BeIN Sports» y «beIN Sports» son el mismo canal
    if (!channels.has(ckey)) channels.set(ckey, { base, plain, country, group: pickGroup(e, n), logo: e.logo, srcTvgId: e.tvgId, tvgId: '', links: [] });
    const ch = channels.get(ckey);
    if (!ch.logo && e.logo) ch.logo = e.logo;
    // estaba en el grupo por defecto y otra lista sabe dónde va (p. ej. Elcano lo pone en MOTOGP)
    if (ch.group === 'DEPORTES' && !e.tvgName && KNOWN.has(e.group) && !['DEPORTES', 'OTROS'].includes(e.group) && !country) ch.group = e.group;
    ch.links.push({ quality, mark, url: `acestream://${id}` });
  }

  /* ── Guías: candidatas de cada canal y elección del conjunto más ligero ── */
  const all = [...channels.values()];
  for (const ch of all) {
    const tries = variants(ch.plain, ch.country);
    ch.cands = guides.map((g, gi) => (servesCountry(g, ch.country, ch.plain) ? { gi, id: findIn(g, tries) || (g.names.has(ch.srcTvgId) ? ch.srcTvgId : '') } : null))
      .filter(c => c && c.id && guides[c.gi].withProgs.has(c.id));
    if (process.env.DEPURAR && ch.base.includes(process.env.DEPURAR)) console.log('DEPURAR', ch.base, ch.country, JSON.stringify(ch.cands), tries.map(key).join(','), guides.map(g => `${g.url.slice(-22)}:${servesCountry(g, ch.country, ch.plain) ? findIn(g, tries) || '-' : 'x'}`).join(' '));
  }
  const cost = g => g.gzMB + g.xmlMB / 8;   // descargar + leer (en el móvil pesa sobre todo el tamaño sin comprimir)
  const chosen = new Set(guides.map((g, gi) => (g.always ? gi : -1)).filter(gi => gi >= 0));
  const coveredBy = set => new Set(all.filter(ch => ch.cands.some(c => set.has(c.gi))));
  for (;;) {
    const have = coveredBy(chosen);
    let best = null;
    guides.forEach((g, gi) => {
      if (chosen.has(gi) || g.logos) return;
      const gain = all.filter(ch => !have.has(ch) && ch.cands.some(c => c.gi === gi)).length;
      const score = gain / cost(g);
      if (gain >= 2 && score >= 0.5 && (!best || score > best.score)) best = { gi, gain, score };
    });
    if (!best) break;
    chosen.add(best.gi);
    console.log(`  + ${guides[best.gi].url.replace(/.*\//, '')}: ${best.gain} canales más`);
  }
  const used = guides.map((g, gi) => gi).filter(gi => chosen.has(gi));   // en el orden de GUIDE_POOL
  const epgUrls = [...used.map(gi => guides[gi].url), ...extraUrls];
  // la app busca primero por identificador y luego por nombre, guía a guía: se comprueba que cada tvg-id le lleve a SU canal
  const idOwners = new Map(), nameOwners = new Map();
  const claim = (map, k, uid) => { if (!k) return; const a = map.get(k); if (!a) map.set(k, [uid]); else if (!a.includes(uid)) a.push(uid); };
  used.forEach((gi, pos) => { for (const [id, dn] of guides[gi].names) { const uid = `${pos}|${id}`; claim(idOwners, appNorm(id), uid); claim(idOwners, loose(id), uid); for (const d of dn) { claim(nameOwners, appNorm(d), uid); claim(nameOwners, loose(d), uid); } } });
  const appLookup = id => { for (const o of [idOwners, nameOwners]) for (const k of [appNorm(id), loose(id)]) for (const uid of o.get(k) || []) { const [pos, cid] = [Number(uid.split('|')[0]), uid.slice(uid.indexOf('|') + 1)]; if (guides[used[pos]].withProgs.has(cid)) return uid; } return null; };
  let clash = 0;
  for (const ch of all) {
    for (const c of ch.cands.filter(c => chosen.has(c.gi)).sort((a, b) => used.indexOf(a.gi) - used.indexOf(b.gi))) {
      if (appLookup(c.id) === `${used.indexOf(c.gi)}|${c.id}`) { ch.tvgId = c.id; ch.guide = c.gi; break; }
      clash++;
    }
  }
  /* ── Logos: el de la lista (si sigue funcionando); si no, el de su guía; si no, el de cualquier guía que lo tenga ── */
  const alive = u => new Promise(res => {
    try {
      const r = require(u.startsWith('https') ? 'https' : 'http').request(u, { headers: { 'User-Agent': 'Mozilla/5.0 TOPOTV', Range: 'bytes=0-64' }, timeout: 15000 }, x => { x.resume(); res(x.statusCode >= 200 && x.statusCode < 400); });
      r.on('error', () => res(false)); r.on('timeout', () => { r.destroy(); res(false); }); r.end();
    } catch { res(false); }
  });
  const withLogo = all.filter(ch => ch.logo);
  let broken = 0;
  for (let i = 0; i < withLogo.length; i += 12) await Promise.all(withLogo.slice(i, i + 12).map(async ch => {
    const https1 = ch.logo.replace(/^http:\/\//, 'https://');
    if (await alive(https1)) ch.logo = https1; else if (!(await alive(ch.logo)) || ch.logo.startsWith('http:')) { ch.logo = ''; broken++; }
  }));
  if (broken) console.log(`logos de la lista que ya no funcionan (o solo http): ${broken} → se buscan en las guías`);
  let logos = 0;
  for (const ch of all) {
    if (ch.logo) continue;
    const tries = variants(ch.plain, ch.country);
    const order = guides.map((g, gi) => gi).sort((a, b) => Number(b === ch.guide) - Number(a === ch.guide) || Number(servesCountry(guides[b], ch.country, ch.plain)) - Number(servesCountry(guides[a], ch.country, ch.plain)));
    for (const gi of order) { const id = gi === ch.guide ? ch.tvgId : findIn(guides[gi], tries); const icon = id && guides[gi].icons.get(id); if (icon) { ch.logo = icon; logos++; break; } }
  }

  // último recurso: la base de datos pública de canales de iptv-org (logos por país)
  const noLogo = all.filter(ch => !ch.logo);
  if (noLogo.length) {
    try {
      const [cj, lj] = await Promise.all([download('https://iptv-org.github.io/api/channels.json'), download('https://iptv-org.github.io/api/logos.json')]);
      const best = new Map();   // canal → mejor logo (en uso, del canal y no de una variante, PNG)
      const rank = l => (l.in_use ? 0 : 4) + (l.feed ? 2 : 0) + (l.format === 'PNG' ? 0 : 1);
      for (const l of JSON.parse(lj.xml)) { if (!/^https:\/\/[^\s"'<>]+$/.test(l.url)) continue; const cur = best.get(l.channel); if (!cur || rank(l) < cur.r) best.set(l.channel, { r: rank(l), url: l.url }); }
      const byName = new Map();   // «PAÍS|nombre» → logo
      for (const c of JSON.parse(cj.xml)) { if (!best.has(c.id)) continue; for (const n of [c.name, ...(c.alt_names || [])]) { const k = `${c.country}|${key(n)}`; if (!byName.has(k)) byName.set(k, best.get(c.id).url); } }
      const CC = { UK: ['GB'], DE: ['DE', 'AT', 'CH'] };
      let extra = 0;
      for (const ch of noLogo) {
        const hint = (BRAND_COUNTRY.find(([re]) => re.test(ch.plain)) || [])[1];
        const ccs = ch.country ? (CC[ch.country] || [ch.country]) : [hint || 'ES'];
        const tries = variants(ch.plain, ch.country);
        const url = ccs.flatMap(cc => tries.map(t => byName.get(`${cc}|${key(t)}`))).find(Boolean);
        if (url) { ch.logo = url; logos++; extra++; }
      }
      console.log(`logos sacados de iptv-org: ${extra}`);
    } catch (e) { console.log(`logos de iptv-org no disponibles: ${e.message}`); }
  }

  // canales numerados sin logo: el de su hermano («Magenta Sport 10» → el de «Magenta Sport 1»)
  const family = ch => `${ch.country}|${key(ch.plain.replace(/\s*\d+$/, ''))}`;
  const famLogo = new Map(all.filter(ch => ch.logo).map(ch => [family(ch), ch.logo]));
  for (const ch of all) if (!ch.logo && famLogo.has(family(ch))) { ch.logo = famLogo.get(family(ch)); logos++; }

  const order = [...order0];
  for (const ch of channels.values()) if (!order.includes(ch.group)) order.push(ch.group);
  const list = [...channels.values()].sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group) || a.base.localeCompare(b.base, 'es', { numeric: true }));
  const esc = s => String(s).replace(/"/g, "'");
  const out = [`#EXTM3U url-tvg="${epgUrls.join(',')}" refresh="3600"`, '',
    `# Lista personal ordenada con TOPOTV (tools/ordenar-lista.cjs) · ${new Date().toLocaleString('es-ES')}`,
    `# ${list.length} canales · ${seen.size} enlaces · origen: ${path.basename(input)}`, ''];
  let lastGroup = '';
  for (const ch of list) {
    if (ch.group !== lastGroup) { out.push(`# ── ${ch.group} ──`); lastGroup = ch.group; }
    ch.links.sort((a, b) => QRANK(b.quality) - QRANK(a.quality) || a.mark - b.mark);
    const count = new Map();
    for (const l of ch.links) {
      const k = l.quality || '-';
      const n = (count.get(k) || 0) + 1; count.set(k, n);
      const label = [ch.base, l.quality].filter(Boolean).join(' ') + (n > 1 ? ` (opción ${n})` : '');
      out.push(`#EXTINF:-1 tvg-id="${esc(ch.tvgId || ch.base)}" tvg-name="${esc(ch.base)}" tvg-logo="${esc(ch.logo)}" group-title="${ch.group}",${label}`);
      out.push(l.url);
    }
    out.push('');
  }
  fs.writeFileSync(output, out.join('\n'));
  // copia en la carpeta de listas de TOPOTV (Windows): la app la carga sola en cada actualización
  const folder = process.env.SIN_COPIA ? null : await listsFolder();   // SIN_COPIA=1: solo escribe la salida (pruebas)
  if (folder) {
    try { fs.mkdirSync(folder, { recursive: true }); fs.writeFileSync(path.join(folder, path.basename(output)), out.join('\n')); console.log(`copiada en la carpeta de listas de TOPOTV: ${path.join(folder, path.basename(output))}`); }
    catch (e) { console.log(`no se pudo copiar en la carpeta de listas (${e.message})`); }
  }
  const byGroup = list.reduce((m, c) => (m[c.group] = (m[c.group] || 0) + 1, m), {});
  console.log(`\n${path.basename(output)}: ${list.length} canales, ${seen.size} enlaces (${dup} repetidos quitados)`);
  for (const g of order) if (byGroup[g]) console.log(`  ${g.padEnd(20)} ${byGroup[g]}`);
  const noEpg = list.filter(c => !c.tvgId).map(c => c.base);
  const mb = used.reduce((a, gi) => [a[0] + guides[gi].gzMB, a[1] + guides[gi].xmlMB], [0, 0]);
  console.log(`guías elegidas (${used.length}): ${used.map(gi => guides[gi].url.replace(/.*\//, '')).join(', ')} · ${mb[0].toFixed(1)} MB de descarga, ${mb[1].toFixed(0)} MB sin comprimir${clash ? ` · ${clash} coincidencias descartadas para no confundir canales` : ''}`);
  console.log(`con logo: ${list.filter(c => c.logo).length} de ${list.length} (${logos} nuevos)`);
  console.log(`con guía: ${list.length - noEpg.length} de ${list.length}${noEpg.length ? ` · sin guía: ${noEpg.join(', ')}` : ''}`);
})().catch(e => { console.error('Error:', e.message); process.exit(1); });
