/**
 * Normalización de nombres de canal de Ciriaco + resolución de logos (repo tv-logo/tv-logos).
 * Ciriaco escribe el mismo canal de muchas formas: "M. Deportes HD", "M+ Deportes", "ES: DAZN LALIGA", "DAZN1"...
 */
const path = require('path');
const BASE = 'https://raw.githubusercontent.com/tv-logo/tv-logos/main/countries/';
const INDEX = require(path.join(__dirname, 'channel-logos.json')); // { key: "spain/xxx.png" }

const NOISE = /\b(\d{3,4}p|hd|hdr|uhd|fhd|4k|app|gratis|solo|eventos|disabled|multi|audio|sd)\b/g;

/** Clave canónica de un canal (para agrupar variantes y buscar logo). */
function canon(name) {
  let s = String(name || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  s = s.replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').replace(/^[a-z]{2}:\s*/, '');
  s = s.replace(/movistar\s*plus\s*\+?|movistar\s*\+|\bm\s*\+|\bm\.\s|\bmovistar\b/g, ' mplus ');
  s = s.replace(/\bla\s+liga\b/g, 'laliga').replace(/formula\s*1/g, 'f1');
  s = s.replace(/\b(dazn|esport|eurosport)\s*(\d)/g, '$1 $2').replace(/\bdazn(\d)/g, 'dazn $1');
  s = s.replace(NOISE, ' ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  s = s.replace(/^mplus laliga tv\b/, 'mplus laliga').replace(/^rtve play$/, 'rtve play');
  return s;
}

/** Nombre legible: quita prefijos de país, corchetes, etiquetas y calidad. */
function clean(raw) {
  return String(raw || '')
    .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').replace(/^[A-Za-z]{2}:\s*/, '')
    .replace(/\b(4K|2160p|1080p|720p|576p|480p|FHD|HDR|UHD|HD|SD)\b/gi, ' ')
    .replace(/\b(Gratis|App)\b/gi, ' ')
    .replace(/^M\.\s*/, 'M+ ').replace(/^Movistar\s+(?!plus|\+)/i, 'M+ ').replace(/^Movistar\s*(Plus\s*\+?|\+)\s*$/i, 'M+')
    .replace(/\s+/g, ' ').trim();
}

const FALLBACKS = [
  [/^mplus laliga/, 'mplus laliga'], [/^mplus liga de campeones/, 'mplus liga de campeones'], [/^mplus golf/, 'mplus golf'],
  [/^mplus vamos/, 'mplus vamos'], [/^mplus deportes/, 'mplus deportes'], [/^mplus/, 'mplus'], [/^vamos$/, 'mplus vamos'],
  [/^dazn laliga/, 'dazn laliga'], [/^dazn f1/, 'dazn f1'], [/^dazn/, 'dazn'],
  [/^eurosport/, 'eurosport 1'], [/^laliga tv/, 'laliga tv hypermotion'], [/^esport/, 'esport 3'],
];

function logoFor(key) {
  let file = INDEX[key];
  if (!file) for (const [re, k] of FALLBACKS) if (re.test(key) && INDEX[k]) { file = INDEX[k]; break; }
  return file ? BASE + file : '';
}

module.exports = { canon, clean, logoFor };
