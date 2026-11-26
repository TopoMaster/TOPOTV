#!/usr/bin/env node
/**
 * Ordena una lista M3U de canales deportivos: grupos claros, nombres limpios, calidad aparte,
 * enlaces repetidos fuera e identificadores (tvg-id) de la guía EPG para que la Parrilla y los
 * eventos de TOPOTV (y cualquier reproductor) reconozcan cada canal.
 *
 *   node tools/ordenar-lista.cjs [entrada=lista.txt] [salida=lista.m3u]
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
const DEFAULT_EPG = ['https://raw.githubusercontent.com/davidmuma/EPG_dobleM/master/guiatv.xml'];

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
  ['INTERNACIONAL', /sport ?tv|fox sports|azteca|nbc|espn|sky sport|tnt|bein|eleven/i],
];
const groupOf = name => (GROUPS.find(([, re]) => re.test(name)) || ['DEPORTES'])[0];

/* ── Nombres ────────────────────────────────────────────────── */
const FIXES = [
  [/^movistar plus\+?$/i, 'Movistar Plus+'], [/^m\+ ?vamos/i, 'M+ Vamos'], [/^dazn motogp/i, 'DAZN MotoGP'], [/^dazn f1/i, 'DAZN F1'],
  [/^la ?1( tve)?$/i, 'La 1'], [/^la ?2( tve)?$/i, 'La 2'], [/^cuatro$/i, 'Cuatro'], [/^a punt$/i, 'À Punt'], [/^rally tv$/i, 'Rally TV'],
  [/^azteca deportes$/i, 'Azteca Deportes'], [/^sport ?tv ?(\d)$/i, 'Sport TV $1'], [/^nbc sports$/i, 'NBC Sports'],
];
/** «DAZN 2 1080p **» → { base: 'DAZN 2', quality: '1080p', mark: 2 } */
function splitName(raw) {
  let s = raw.trim();
  const mark = (s.match(/\*+\s*$/) || [''])[0].trim().length;
  s = s.replace(/\*+\s*$/, '').trim();
  let quality = '';
  const q = s.match(/\s(4k|uhd|\d{3,4}p|fhd|hd|sd)$/i);
  if (q) { quality = q[1].toUpperCase().replace(/(\d)P$/, '$1p'); s = s.slice(0, q.index).trim(); }
  s = s.replace(/\s+tve(\s+4k)?$/i, (_, k) => { if (k) quality = '4K'; return ''; }).trim();
  for (const [re, fix] of FIXES) if (re.test(s)) { s = s.replace(re, fix); break; }
  return { base: s, quality, mark };
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
  for (const u of urls.filter(x => /^https:\/\//.test(x)).slice(0, 3)) {
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

(async () => {
  const { tvgUrls, entries } = parse(fs.readFileSync(input, 'utf8'));
  const epgUrls = [...new Set([...tvgUrls.map(u => u.replace('/refs/heads/master/', '/master/')), ...DEFAULT_EPG])];
  const idx = await epgIndex(epgUrls);

  const seen = new Set();
  const channels = new Map();   // base → { base, group, logo, tvgId, links[] }
  let dup = 0;
  for (const e of entries) {
    if (seen.has(e.url)) { dup++; continue; }
    seen.add(e.url);
    const { base, quality, mark } = splitName(e.name);
    if (!channels.has(base)) channels.set(base, { base, group: groupOf(base), logo: e.logo, tvgId: idx.get(loose(base)) || '', links: [] });
    const ch = channels.get(base);
    if (!ch.logo && e.logo) ch.logo = e.logo;
    ch.links.push({ quality, mark, url: e.url });
  }

  const order = [...GROUPS.map(g => g[0]), 'DEPORTES'];
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
  const byGroup = list.reduce((m, c) => (m[c.group] = (m[c.group] || 0) + 1, m), {});
  console.log(`\n${path.basename(output)}: ${list.length} canales, ${seen.size} enlaces (${dup} repetidos quitados)`);
  for (const g of order) if (byGroup[g]) console.log(`  ${g.padEnd(20)} ${byGroup[g]}`);
  const noEpg = list.filter(c => !c.tvgId).map(c => c.base);
  console.log(`con guía: ${list.length - noEpg.length} de ${list.length}${noEpg.length ? ` · sin guía: ${noEpg.join(', ')}` : ''}`);
})().catch(e => { console.error('Error:', e.message); process.exit(1); });
