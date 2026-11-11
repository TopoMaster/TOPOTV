/**
 * Ciriaco Scraper — puerto 3004
 * Lee https://ciriaco.netlify.app/ (tablas .tabla-eventos, enlaces acestream://HASH) con Playwright.
 *
 *   GET  /health
 *   GET  /api/ciriaco/events           -> agenda (de la caché; solo scrapea si no hay ninguna)
 *   GET  /api/ciriaco/status           -> { fetchedAt, updating, lastError, via, warp }
 *   POST /api/ciriaco/refresh          -> fuerza actualización y espera (también GET)
 *   GET  /api/ciriaco/playlist.m3u     -> M3U de todos los canales (?host=127.0.0.1&port=6878)
 *
 * Actualización: UNA vez al día (al arrancar si la caché es de otro día, y a partir de las 05:00).
 * Red: con Cloudflare WARP (warp-cli) instalado lo conecta SIEMPRE para actualizar y lo desconecta al terminar (modo auto: prueba directo primero y WARP si falla; lo conecta SOLO
 * durante la actualización y lo desconecta después. Así AceStream/VLC nunca van por WARP.
 *
 * Variables: CIRIACO_WARP=always|auto|off (def. always) · CIRIACO_PROXY=socks5://... (proxy manual) ·
 *            WARP_CLI=ruta\warp-cli.exe · CIRIACO_PORT
 */
const http = require('http');
const { guard } = require('./guard.cjs');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { canon, clean, logoFor } = require('./channel-logos.cjs');

const SOURCE = 'https://ciriaco.netlify.app/';
const PORT = Number(process.env.CIRIACO_PORT || 3004);
const PROXY = process.env.CIRIACO_PROXY || '';
const WARP_MODE = (process.env.CIRIACO_WARP || 'always').toLowerCase();
const TRUSTED_WARP_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1):(5173|5174)$/;
let CACHE_FILE = path.join(__dirname, '.ciriaco-cache.json');
const DAILY_HOUR = 5;

let cache = null;            // { fetchedAt, via, data }
let inflight = null;
let lastError = '';
let phase = '';              // texto de progreso para la UI
let warpConnectedState = null;
let warpStatusCheck = null;
let warpActionInFlight = false;

const log = (...a) => console.log('[ciriaco]', ...a);
const localDay = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/* ── Caché en disco ─────────────────────────────────────────── */
const loadCache = () => { try { cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')); log('caché cargada:', cache.fetchedAt); } catch { /* sin caché */ } };
const saveCache = () => { try { fs.writeFileSync(CACHE_FILE, JSON.stringify(cache)); } catch (e) { log('no se pudo guardar caché', e.message); } };
const isFresh = () => !!cache && localDay(new Date(cache.fetchedAt)) === localDay();

/* ── Cloudflare WARP ────────────────────────────────────────── */
function findWarpCli() {
  const c = [process.env.WARP_CLI, 'C:\\Program Files\\Cloudflare\\Cloudflare WARP\\warp-cli.exe',
    'C:\\Program Files (x86)\\Cloudflare\\Cloudflare WARP\\warp-cli.exe', '/usr/bin/warp-cli', '/Applications/Cloudflare WARP.app/Contents/Resources/warp-cli']
    .filter(Boolean);
  return c.find(p => fs.existsSync(p)) || null;
}
const WARP_CLI = findWarpCli();
function warp(...args) {
  return new Promise(resolve => {
    const run = list => execFile(WARP_CLI, list, { timeout: 20000, windowsHide: true }, (err, stdout, stderr) => resolve({ err, out: `${stdout}${stderr}` }));
    execFile(WARP_CLI, ['--accept-tos', ...args], { timeout: 20000, windowsHide: true }, (err, stdout, stderr) => {
      if (err && /unexpected argument|unrecognized|unknown/i.test(`${stdout}${stderr}`)) return run(args);
      resolve({ err, out: `${stdout}${stderr}` });
    });
  });
}
async function warpConnected() {
  const { err, out } = await warp('status');
  if (err) throw new Error(out.trim() || err.message);
  return /connected/i.test(out) && !/disconnected|connecting|unable/i.test(out);
}
async function runWarpCommand(...args) {
  const { err, out } = await warp(...args);
  if (err) throw new Error(out.trim() || err.message);
}
function syncWarpStatus() {
  if (!WARP_CLI) { warpConnectedState = null; return Promise.resolve(null); }
  if (warpStatusCheck) return warpStatusCheck;
  warpStatusCheck = warpConnected()
    .then(connected => { warpConnectedState = connected; return connected; })
    .catch(e => { warpConnectedState = null; log('no se pudo comprobar WARP:', e.message); return null; })
    .finally(() => { warpStatusCheck = null; });
  return warpStatusCheck;
}
async function waitWarp(connected, ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { if ((await warpConnected()) === connected) return true; }
    catch { /* Reintenta hasta agotar el tiempo de espera. */ }
    await new Promise(r => setTimeout(r, 1000));
  }
  return false;
}
async function setWarpConnected(connected) {
  if (!WARP_CLI) throw new Error('No se encontró warp-cli en este equipo.');
  if (inflight || warpActionInFlight) throw new Error('Espera a que termine la operación de red actual.');
  warpActionInFlight = true;
  try {
    if (await warpConnected() === connected) {
      warpConnectedState = connected;
      return status();
    }
    if (connected) {
      await runWarpCommand('mode', 'warp');
      await runWarpCommand('connect');
      if (!(await waitWarp(true, 25000))) throw new Error('WARP no llegó a conectar.');
    } else {
      await runWarpCommand('disconnect');
      if (!(await waitWarp(false, 15000))) throw new Error('No se pudo confirmar la desconexión de WARP.');
    }
    warpConnectedState = connected;
    return status();
  } finally {
    warpActionInFlight = false;
  }
}

/* ── Scraping ───────────────────────────────────────────────── */
/** Se ejecuta en el navegador: lee h2.fecha + table.tabla-eventos en orden de documento. */
function extractInBrowser() {
  const cl = s => (s || '').replace(/\s+/g, ' ').trim();
  const days = [];
  let cur = null;
  for (const el of document.querySelectorAll('h2.fecha, table.tabla-eventos')) {
    if (el.tagName === 'H2') {
      const m = cl(el.textContent).match(/(\d{2})\/(\d{2})\/(\d{4})/);
      cur = { date: m ? `${m[3]}-${m[2]}-${m[1]}` : '', label: cl(el.textContent), events: [] };
      days.push(cur);
      continue;
    }
    if (!cur) continue;
    for (const tr of el.tBodies[0] ? el.tBodies[0].rows : []) {
      const c = k => tr.querySelector(`td[data-label="${k}"]`);
      const time = cl(c('Hora')?.textContent);
      if (!/^\d{1,2}:\d{2}$/.test(time)) continue;
      const compCell = c('Competición');
      const compClone = compCell ? compCell.cloneNode(true) : null;
      const round = cl(compClone?.querySelector('.ronda')?.textContent);
      compClone?.querySelector('.ronda')?.remove();
      const flag = (compCell?.querySelector('[class*="flag-icon-"]')?.className.match(/flag-icon-([a-z-]+)/) || [])[1] || '';
      const evCell = c('Evento');
      const chCell = c('Canales');
      cur.events.push({
        time, round, flag,
        sport: cl(c('Deporte')?.querySelector('.deporte')?.textContent || c('Deporte')?.textContent),
        competition: cl(compClone?.textContent),
        title: cl(evCell?.textContent),
        logos: [...(evCell?.querySelectorAll('img') || [])].map(i => i.src).filter(Boolean),
        channelsText: cl(chCell?.querySelector('span')?.textContent),
        links: [...(chCell?.querySelectorAll('a[href^="acestream://"]') || [])].map(a => ({ href: a.getAttribute('href'), text: cl(a.textContent) })),
      });
    }
  }
  return days;
}

const QUALITY_G = /\b(4K|2160p|1080p|720p|576p|480p|FHD|HD|SD)\b/gi;
function parseLink(l) {
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

/** Une variantes ("M. Deportes HD", "M+ Deportes") en un canal y le asigna logo. */
function normalize(rawDays) {
  const variants = new Map(); // key -> Map(display -> count)
  const see = raw => {
    const key = canon(raw);
    if (!key) return '';
    const disp = clean(raw);
    if (!variants.has(key)) variants.set(key, new Map());
    const m = variants.get(key);
    m.set(disp, (m.get(disp) || 0) + 1);
    return key;
  };
  let n = 0;
  const days = rawDays.map(d => ({
    date: d.date, label: d.label,
    events: d.events.map(e => {
      const seen = new Set();
      const links = e.links.map(parseLink).filter(l => l && !seen.has(l.hash) && seen.add(l.hash))
        .map(l => ({ ...l, channelKey: see(l.rawChannel) }));
      const chanNames = e.channelsText.split(/\s+-\s+|\s*,\s*/).map(s => s.trim()).filter(Boolean);
      const channelKeys = [...new Set([...chanNames.map(see), ...links.map(l => l.channelKey)].filter(Boolean))];
      const vs = e.title.split(/\s+vs\.?\s+/i);
      return {
        id: `${d.date}-${e.time.replace(':', '')}-${n++}`, time: e.time.padStart(5, '0'),
        sport: e.sport, competition: e.competition, round: e.round, flag: e.flag, title: e.title,
        home: vs.length === 2 ? vs[0] : '', away: vs.length === 2 ? vs[1] : '', logos: e.logos,
        channelKeys, links,
      };
    }),
  }));
  const channels = {};
  for (const [key, m] of variants) {
    const best = [...m].sort((a, b) => b[1] - a[1] || (/[a-z]/.test(b[0]) ? 1 : 0) - (/[a-z]/.test(a[0]) ? 1 : 0))[0][0];
    channels[key] = { name: best, logo: logoFor(key) };
  }
  for (const d of days) for (const e of d.events) for (const l of e.links) { l.channel = channels[l.channelKey]?.name || l.rawChannel; delete l.rawChannel; }
  return { days, channels };
}

/** Proveedor por defecto (Playwright). La app de escritorio inyecta el suyo basado en Electron. */
async function playwrightScrape(proxy, timeout) {
  const { chromium } = require('playwright');
  const browser = await chromium.launch(proxy ? { proxy: { server: proxy } } : {});
  try {
    const page = await browser.newPage();
    await page.goto(SOURCE, { waitUntil: 'networkidle', timeout });
    await page.waitForSelector('table.tabla-eventos', { timeout: 15000 });
    return await page.evaluate(extractInBrowser);
  } finally { await browser.close(); }
}
let scrapeRaw = playwrightScrape;
const scrapeOnce = async (proxy, timeout) => normalize(await scrapeRaw(proxy, timeout));

/** Intenta directo; si falla y hay WARP, lo conecta solo durante el scrape. */
async function scrapeSmart() {
  if (PROXY) { phase = 'Leyendo Ciriaco (proxy)…'; return { ...(await scrapeOnce(PROXY, 45000)), via: 'proxy' }; }
  if (WARP_MODE === 'always') {
    // WARP obligatorio: Ciriaco se bloquea en muchas redes y, sin WARP, la agenda no se actualiza (se sigue viendo la última guardada)
    if (!WARP_CLI) throw new Error('Falta Cloudflare WARP (gratis, one.one.one.one). Instálalo y reinicia TOPOTV: sin él no se puede actualizar la agenda.');
    try { return await scrapeViaWarp(); }
    catch (warpError) { throw new Error(`No se pudo usar WARP (${warpError.message.split('\n')[0]}). Sin WARP no se puede actualizar la agenda.`); }
  }
  if (WARP_MODE !== 'always' || !WARP_CLI) {
    try { phase = 'Leyendo Ciriaco…'; return { ...(await scrapeOnce('', 20000)), via: 'directo' }; }
    catch (e) { if (WARP_MODE === 'off' || !WARP_CLI) throw new Error(`Ciriaco no carga${WARP_CLI ? '' : ' y no se encontró warp-cli'} (${e.message.split('\n')[0]})`); log('directo falló, probando WARP:', e.message.split('\n')[0]); }
  }
  // Con WARP: se conecta solo para leer la agenda y se desconecta siempre al terminar.
  // Si WARP no se puede usar (servicio parado, sin registro...), se intenta una última vez en directo.
  try {
    return await scrapeViaWarp();
  } catch (warpError) {
    log('WARP falló, probando en directo:', warpError.message.split('\n')[0]);
    try { phase = 'Leyendo Ciriaco…'; return { ...(await scrapeOnce('', 20000)), via: 'directo' }; }
    catch { throw new Error(`No se pudo actualizar con WARP (${warpError.message.split('\n')[0]}) ni en directo.`); }
  }
}

async function scrapeViaWarp() {
  const wasOn = await warpConnected();
  warpConnectedState = wasOn;
  try {
    if (!wasOn) {
      phase = 'Conectando WARP…';
      await runWarpCommand('mode', 'warp');
      await runWarpCommand('connect');
      if (!(await waitWarp(true, 25000))) throw new Error('WARP no llegó a conectar');
      warpConnectedState = true;
      await new Promise(r => setTimeout(r, 1500));
    }
    phase = 'Leyendo Ciriaco vía WARP…';
    return { ...(await scrapeOnce('', 45000)), via: 'warp' };
  } finally {
    if (!wasOn) {
      phase = 'Desconectando WARP…';
      try {
        await runWarpCommand('disconnect');
        const disconnected = await waitWarp(false, 10000);
        warpConnectedState = disconnected ? false : await warpConnected();
        log(disconnected ? 'WARP desconectado' : 'no se pudo confirmar la desconexión de WARP');
      } catch (e) { log('no se pudo desconectar WARP:', e.message.split('\n')[0]); warpConnectedState = null; }
    }
  }
}

function update(reason) {
  if (!inflight) {
    log('actualizando agenda —', reason);
    lastError = '';
    inflight = scrapeSmart()
      .then(r => { cache = { fetchedAt: new Date().toISOString(), via: r.via, data: { source: SOURCE, days: r.days, channels: r.channels } }; saveCache(); log(`OK ${r.days.reduce((n, d) => n + d.events.length, 0)} eventos vía ${r.via}`); return cache; })
      .catch(e => { lastError = e.message.split('\n')[0]; log('ERROR', lastError); throw e; })
      .finally(() => { inflight = null; phase = ''; });
    inflight.catch(() => {});
  }
  return inflight;
}

/** Una vez al día: al arrancar si la caché no es de hoy y cada 30 min a partir de las 05:00. */
function dailyCheck(reason) {
  if (isFresh() || inflight || warpActionInFlight) return;
  if (reason !== 'arranque' && new Date().getHours() < DAILY_HOUR) return;
  update(reason).catch(() => {});
}

/* ── M3U ────────────────────────────────────────────────────── */
function buildM3U(data, host, port) {
  const byChannel = new Map();
  const seen = new Set();
  for (const d of data.days) for (const e of d.events) for (const l of e.links) {
    if (seen.has(l.hash)) continue;
    seen.add(l.hash);
    if (!byChannel.has(l.channelKey)) byChannel.set(l.channelKey, []);
    byChannel.get(l.channelKey).push(l);
  }
  const q = l => (parseInt(l.quality) || (l.quality === 'HD' ? 720 : 0)) * 10 + l.marks;
  const out = ['#EXTM3U'];
  const entries = [...byChannel].map(([key, links]) => [key, data.channels[key]?.name || key, links]).sort((a, b) => a[1].localeCompare(b[1], 'es'));
  for (const [key, name, links] of entries) {
    const logo = data.channels[key]?.logo || '';
    for (const l of links.sort((a, b) => q(b) - q(a))) {
      const label = `${name}${l.quality ? ' ' + l.quality : ''}${l.marks ? ' ' + '*'.repeat(l.marks) : ''} --> ${l.server || 'DEFAULT'}`;
      out.push(`#EXTINF:-1 tvg-id="ciriaco-${key.replace(/[^a-z0-9]+/g, '-')}" tvg-logo="${logo}" group-title="TOPOTV",${label}`);
      out.push(`http://${host}:${port}/ace/getstream?id=${l.hash}`);
    }
  }
  return out.join('\n') + '\n';
}

/* ── HTTP ───────────────────────────────────────────────────── */
const status = () => ({
  fetchedAt: cache?.fetchedAt || null, via: cache?.via || null, fresh: isFresh(),
  updating: !!inflight, phase, lastError,
  warp: { available: !!WARP_CLI, connected: warpConnectedState, mode: PROXY ? 'proxy' : WARP_MODE },
});

function start(opts = {}) {
  if (opts.scrape) scrapeRaw = opts.scrape;
  if (opts.cacheFile) CACHE_FILE = opts.cacheFile;
  loadCache();
  const server = http.createServer(async (req, res) => {
  if (!guard(req, res)) return;   // solo la propia app puede leer la agenda o disparar WARP
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const u = new URL(req.url, 'http://x');
  const json = (code, obj) => { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.writeHead(code); res.end(JSON.stringify(obj)); };
  try {
    if (u.pathname === '/health') return json(200, { ok: true });
    if (u.pathname === '/api/ciriaco/status') return json(200, status());
    if (u.pathname === '/api/ciriaco/warp/connect' || u.pathname === '/api/ciriaco/warp/disconnect') {
      if (req.method !== 'POST') return json(405, { error: 'method not allowed' });
      if (!TRUSTED_WARP_ORIGIN.test(req.headers.origin || '')) return json(403, { error: 'origen no permitido para controlar WARP' });
      try {
        const connected = u.pathname.endsWith('/connect');
        return json(200, { ok: true, ...(await setWarpConnected(connected)) });
      } catch (e) {
        return json(409, { ok: false, error: e instanceof Error ? e.message : String(e), ...status() });
      }
    }
    if (u.pathname === '/api/ciriaco/refresh') {
      if (warpActionInFlight) return json(409, { ok: false, error: 'Espera a que termine el cambio de estado de WARP.', ...status() });
      try { await update('manual'); return json(200, { ok: true, ...status() }); }
      catch (e) { return json(502, { ok: false, error: e.message, ...status() }); }
    }
    if (!cache) await update('primera vez');   // sin caché no hay nada que servir
    if (u.pathname === '/api/ciriaco/playlist.m3u') {
      res.setHeader('Content-Type', 'audio/x-mpegurl; charset=utf-8'); res.writeHead(200);
      return res.end(buildM3U(cache.data, u.searchParams.get('host') || '127.0.0.1', u.searchParams.get('port') || '6878'));
    }
    if (u.pathname === '/api/ciriaco/events') return json(200, { ...cache.data, fetchedAt: cache.fetchedAt, via: cache.via, status: status() });
    json(404, { error: 'not found' });
  } catch (e) { json(502, { error: e.message, ...status() }); }
});
  server.listen(PORT, '127.0.0.1', () => {
    log(`http://localhost:${PORT} · WARP: ${WARP_CLI ? WARP_MODE : 'warp-cli no encontrado'}${PROXY ? ' · proxy ' + PROXY : ''}`);
    syncWarpStatus();
    setInterval(syncWarpStatus, 10000);
    dailyCheck('arranque');
    setInterval(() => dailyCheck('programada'), 30 * 60 * 1000);
  });
  server.on('error', e => log('ERROR servidor:', e.message));
  return server;
}

module.exports = { start, extractInBrowser };
if (require.main === module) start();
