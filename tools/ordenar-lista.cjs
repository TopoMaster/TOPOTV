#!/usr/bin/env node
/**
 * Ordena una lista M3U de canales deportivos: grupos claros, nombres limpios, calidad aparte,
 * enlaces repetidos fuera e identificadores (tvg-id) de la guía EPG para que la Parrilla y los
 * eventos de TOPOTV (y cualquier reproductor) reconozcan cada canal.
 *
 *   node tools/ordenar-lista.cjs [entrada=lista.txt] [salida=lista.m3u]
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
const DEFAULT_EPG = ['https://raw.githubusercontent.com/davidmuma/EPG_dobleM/master/guiatv.xml', 'https://epgshare01.online/epgshare01/epg_ripper_ES1.xml.gz'];
/** Guías gratuitas por país (epgshare01) que se añaden si la lista tiene canales de ese país. Rusia no tiene (la única pesa ~50 MB). */
const EPG_BY_COUNTRY = {
  DE: 'epg_ripper_DE1', PL: 'epg_ripper_PL1', UK: 'epg_ripper_UK1', BE: 'epg_ripper_BE2', TR: 'epg_ripper_TR1',
  US: 'epg_ripper_US2', PT: 'epg_ripper_PT1', NL: 'epg_ripper_NL1',
};
const epgFor = cc => EPG_BY_COUNTRY[cc] ? `https://epgshare01.online/epgshare01/${EPG_BY_COUNTRY[cc]}.xml.gz` : null;

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
  [/^azteca deportes$/i, 'Azteca Deportes'], [/^sport ?tv ?(\d)$/i, 'Sport TV $1'], [/^nbc sports$/i, 'NBC Sports'],
];
/** «DAZN 2 1080p **» → { base: 'DAZN 2', quality: '1080p', mark: 2 } · «Eurosport 1 HD [DE] (sport)» → país DE, tipo sport */
function splitName(raw) {
  let s = raw.trim();
  let kind = '', country = '';
  s = s.replace(/\s*\(([a-z]+)\)\s*$/i, (_, k) => { kind = k.toLowerCase(); return ''; }).trim();
  s = s.replace(/\s*\[([A-Z]{2})\]\s*$/, (_, c) => { country = c; return ''; }).trim();
  const mark = (s.match(/\*+\s*$/) || [''])[0].trim().length;
  s = s.replace(/\*+\s*$/, '').trim();
  s = s.replace(/^M\.\s+/, 'M+ ').replace(/^(DAZN)(\d)\b/i, 'DAZN $2');
  let quality = '';
  const q = s.match(/\s(4k|uhd|\d{3,4}p|fhd|hd|sd)$/i);
  if (q) { quality = q[1].toUpperCase().replace(/(\d)P$/, '$1p'); s = s.slice(0, q.index).trim(); }
  s = s.replace(/\s+tve(\s+4k)?$/i, (_, k) => { if (k) quality = '4K'; return ''; }).trim();
  for (const [re, fix] of FIXES) if (re.test(s)) { s = s.replace(re, fix); break; }
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
    out.push({ name: inf.slice(inf.lastIndexOf(',') + 1).trim(), logo: attr('tvg-logo'), tvgId: attr('tvg-id'), url });
    i = j;
  }
  return { tvgUrls, entries: out };
}

function download(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'TOPOTV' }, timeout: 120000 }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) return resolve(download(new URL(res.headers.location, url).href));
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`));
      const chunks = []; res.on('data', c => chunks.push(c));
      res.on('end', () => { let b = Buffer.concat(chunks); if (b[0] === 0x1f && b[1] === 0x8b) b = zlib.gunzipSync(b); resolve(b.toString('utf8')); });
    }).on('error', reject).on('timeout', function () { this.destroy(new Error('tiempo agotado')); });
  });
}
/** loose(nombre) → id de canal de la guía */
async function epgIndex(urls) {
  const idx = new Map();
  for (const u of urls.filter(x => /^https:\/\//.test(x))) {
    try {
      const xml = await download(u);
      for (const m of xml.matchAll(/<channel\s+id="([^"]*)"[^>]*>([\s\S]*?)<\/channel>/g)) {
        const names = [m[1], ...[...m[2].matchAll(/<display-name[^>]*>([^<]*)<\/display-name>/g)].map(x => x[1])];
        for (const n of names) { const k = loose(n); if (k && !idx.has(k)) idx.set(k, m[1]); }
      }
      console.log(`guía: ${u.slice(0, 70)} (${idx.size} nombres)`);
    } catch (e) { console.log(`guía no disponible (${u.slice(0, 60)}): ${e.message}`); }
  }
  return idx;
}

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
  const countries = new Set(entries.map(e => splitName(e.name).country).filter(Boolean));
  const epgUrls = [...new Set([...tvgUrls.map(u => u.replace('/refs/heads/master/', '/master/')), ...DEFAULT_EPG, ...[...countries].map(epgFor).filter(Boolean)])];
  const idx = await epgIndex(epgUrls);

  const seen = new Set();
  const channels = new Map();   // base → { base, group, logo, tvgId, links[] }
  let dup = 0;
  for (const e of entries) {
    if (seen.has(e.url)) { dup++; continue; }
    seen.add(e.url);
    const { base, plain, quality, mark, kind, country } = splitName(e.name);
    if (!channels.has(base)) channels.set(base, { base, group: groupOf(plain, country, kind), logo: e.logo, tvgId: idx.get(loose(base)) || (country ? '' : idx.get(loose(plain))) || '', links: [] });
    const ch = channels.get(base);
    if (!ch.logo && e.logo) ch.logo = e.logo;
    ch.links.push({ quality, mark, url: e.url });
  }

  const order = [...GROUPS.map(g => g[0]), 'DEPORTES', 'CINE', 'INFANTIL', 'MÚSICA', 'DOCUMENTALES', 'OTROS',
    ...Object.values(COUNTRIES).flatMap(c => [`${c} · DEPORTES`, c])];
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
  const folder = await listsFolder();
  if (folder) {
    try { fs.mkdirSync(folder, { recursive: true }); fs.writeFileSync(path.join(folder, path.basename(output)), out.join('\n')); console.log(`copiada en la carpeta de listas de TOPOTV: ${path.join(folder, path.basename(output))}`); }
    catch (e) { console.log(`no se pudo copiar en la carpeta de listas (${e.message})`); }
  }
  const byGroup = list.reduce((m, c) => (m[c.group] = (m[c.group] || 0) + 1, m), {});
  console.log(`\n${path.basename(output)}: ${list.length} canales, ${seen.size} enlaces (${dup} repetidos quitados)`);
  for (const g of order) if (byGroup[g]) console.log(`  ${g.padEnd(20)} ${byGroup[g]}`);
  const noEpg = list.filter(c => !c.tvgId).map(c => c.base);
  console.log(`con guía: ${list.length - noEpg.length} de ${list.length}${noEpg.length ? ` · sin guía: ${noEpg.join(', ')}` : ''}`);
})().catch(e => { console.error('Error:', e.message); process.exit(1); });
