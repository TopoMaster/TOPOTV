/**
 * TOPOTV — aplicación de escritorio.
 * Arranca en el propio proceso: servidor de la web (5174), servicio de eventos (3004) y VLC helper (3002).
 * La agenda se lee con un BrowserWindow oculto (Chromium de Electron): no hace falta Playwright.
 */
const { app, BrowserWindow, shell, session, Menu, dialog, powerSaveBlocker } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

const WEB_PORT = 5174;
const APP_DIR = path.join(__dirname, '..', 'app');
const TOOLS = path.join(__dirname, '..', 'tools');
const LOG = () => path.join(app.getPath('userData'), 'topotv.log');
const log = (...a) => { const line = `${new Date().toISOString()} ${a.join(' ')}\n`; try { fs.appendFileSync(LOG(), line); } catch { /* sin log */ } console.log(...a); };

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) app.quit();

/* ── Servidor de la web (SPA) ───────────────────────────────── */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ico': 'image/x-icon' };
function startWeb() {
  const server = http.createServer((req, res) => {
    let p;
    try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400); return res.end(); }
    let file = path.normalize(path.join(APP_DIR, p));
    const rel = path.relative(APP_DIR, file);
    if (rel.startsWith('..') || path.isAbsolute(rel)) { res.writeHead(403); return res.end(); }   // nada fuera de la carpeta de la web
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "object-src 'none'; base-uri 'self'; frame-ancestors 'none'");
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(APP_DIR, 'index.html');   // SPA fallback
    res.setHeader('Content-Type', MIME[path.extname(file)] || 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve, reject) => { server.once('error', reject); server.listen(WEB_PORT, '127.0.0.1', () => resolve(server)); });
}

/* ── Lectura de la agenda con Chromium de Electron ──────────── */
function electronScrape(extractInBrowser) {
  return async (proxy, timeout) => {
    const partition = `scrape-${Date.now()}`;
    const ses = session.fromPartition(partition, { cache: false });
    if (proxy) await ses.setProxy({ proxyRules: proxy });
    const win = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { session: ses, sandbox: true, contextIsolation: true, backgroundThrottling: false } });
    try {
      await Promise.race([
        win.loadURL('https://ciriaco.netlify.app/'),
        new Promise((_, rej) => setTimeout(() => rej(new Error('Tiempo de espera agotado cargando la agenda')), timeout)),
      ]);
      for (let i = 0; i < 30; i++) {
        if (await win.webContents.executeJavaScript(`!!document.querySelector('table.tabla-eventos tbody tr')`)) break;
        await new Promise(r => setTimeout(r, 500));
      }
      return await win.webContents.executeJavaScript(`(${extractInBrowser.toString()})()`);
    } finally { if (!win.isDestroyed()) win.destroy(); await ses.clearStorageData().catch(() => {}); }
  };
}

/* ── Ventana principal ──────────────────────────────────────── */
let mainWin = null;
function createWindow() {
  mainWin = new BrowserWindow({
    width: 1440, height: 900, minWidth: 980, minHeight: 640, backgroundColor: '#080a0e', title: 'TOPOTV', autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'build', 'icon.png'), fullscreen: process.argv.includes('--fullscreen'),
    webPreferences: { contextIsolation: true, sandbox: true, spellcheck: false },
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ label: 'TOPOTV', submenu: [
    { label: 'Pantalla completa', accelerator: 'F11', click: () => mainWin.setFullScreen(!mainWin.isFullScreen()) },
    { label: 'Recargar', accelerator: 'CmdOrCtrl+R', click: () => mainWin.reload() },
    { label: 'Abrir registro', click: () => shell.showItemInFolder(LOG()) },
    { type: 'separator' }, { role: 'quit', label: 'Salir' }] }]));
  // Enlaces externos: solo http/https (otros esquemas como file:, smb: o ms-msdt: pueden ejecutar programas en Windows)
  const openSafe = url => { try { if (/^https?:$/.test(new URL(url).protocol)) void shell.openExternal(url); } catch { /* dirección no válida */ } };
  mainWin.webContents.setWindowOpenHandler(({ url }) => { openSafe(url); return { action: 'deny' }; });
  // La ventana principal no debe cargar páginas ajenas (tendrían a mano los servicios locales): se abren en el navegador
  const ownOrigin = `http://127.0.0.1:${WEB_PORT}`;
  const keepInside = (e, url) => { if (!url.startsWith(ownOrigin + '/') && url !== ownOrigin) { e.preventDefault(); openSafe(url); } };
  mainWin.webContents.on('will-navigate', keepInside);
  mainWin.webContents.on('will-redirect', keepInside);
  mainWin.loadURL(`http://127.0.0.1:${WEB_PORT}/`);
  mainWin.on('closed', () => { mainWin = null; });
}

app.on('second-instance', () => { if (mainWin) { if (mainWin.isMinimized()) mainWin.restore(); mainWin.focus(); } });
app.on('window-all-closed', () => app.quit());

if (gotLock) app.whenReady().then(async () => {
  log('TOPOTV arrancando', app.getVersion());
  // El motor AceStream no envía CORS en todas las versiones: lo permitimos para la web local.
  // (los servicios de TOPOTV ya responden con CORS solo para la app; el motor AceStream no, y se le añade solo para la app)
  session.defaultSession.webRequest.onHeadersReceived((d, cb) => {
    const h = d.responseHeaders || {};
    const fromApp = (d.referrer || '').startsWith(`http://127.0.0.1:${WEB_PORT}`);
    if (fromApp && /^https?:\/\/(127\.0\.0\.1|localhost):6878\//.test(d.url)) h['Access-Control-Allow-Origin'] = ['*'];
    cb({ responseHeaders: h });
  });
  // permisos del navegador: solo notificaciones, pantalla completa y copiar al portapapeles (nada de cámara, micrófono, ubicación…)
  const GRANTED = new Set(['notifications', 'fullscreen', 'clipboard-sanitized-write']);
  session.defaultSession.setPermissionRequestHandler((_wc, permission, cb) => cb(GRANTED.has(permission)));
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => GRANTED.has(permission));
  app.on('web-contents-created', (_e, wc) => wc.on('will-attach-webview', e => e.preventDefault()));
  try {
    await startWeb();
    process.env.CIRIACO_PORT = '3004';
    const { start: startCiriaco, extractInBrowser } = require(path.join(TOOLS, 'ciriaco-server.cjs'));
    startCiriaco({ scrape: electronScrape(extractInBrowser), cacheFile: path.join(app.getPath('userData'), 'agenda-cache.json') });
    const vlc = require(path.join(TOOLS, 'vlc-helper.cjs'));
    vlc.start({ log });
    require(path.join(TOOLS, 'epg-server.cjs')).start({ log });   // guía de programación (puerto 3003)
    // Grabaciones programadas: evitan que Windows suspenda el equipo mientras se graba
    let sleepBlock = null;
    require(path.join(TOOLS, 'recorder.cjs')).start({
      log,
      file: path.join(app.getPath('userData'), 'grabaciones.json'),
      dir: path.join(app.getPath('videos'), 'TOPOTV'),
      ensureEngine: vlc.ensureEngine,
      onBusy: busy => {
        if (busy && sleepBlock === null) sleepBlock = powerSaveBlocker.start('prevent-app-suspension');
        else if (!busy && sleepBlock !== null) { powerSaveBlocker.stop(sleepBlock); sleepBlock = null; }
      },
      openFile: file => { const exe = vlc.findVlc(); if (exe) require('child_process').spawn(exe, [file], { detached: true, stdio: 'ignore' }).unref(); else shell.openPath(file); },
      openFolder: dir => shell.openPath(dir),
    });
    // Sistema: actualizaciones desde GitHub, registro y diagnóstico (puerto 3008)
    // Motor de torrents para los enlaces de los addons (peerflix, puerto 3009): descarga en la carpeta de datos y la borra al parar
    try { require(path.join(TOOLS, 'torrent-server.cjs')).start({ log, dir: path.join(app.getPath('userData'), 'torrents') }); } catch (e) { log('motor de torrents no disponible:', e.message); }
    require(path.join(TOOLS, 'system-server.cjs')).start({
      log, version: app.getVersion(), logFile: LOG(),
      openLog: () => shell.showItemInFolder(LOG()),
      runInstaller: file => { try { require('child_process').spawn(file, [], { detached: true, stdio: 'ignore' }).unref(); } catch (e) { log('no se pudo abrir el instalador', e.message); return; } setTimeout(() => app.quit(), 1500); },
    });
    require(path.join(TOOLS, 'share-server.cjs')).start({ log, binDir: path.join(app.getPath('userData'), 'bin') });
    createWindow();
    // Motor AceStream: lo arranca si está instalado y parado
    vlc.ensureEngine(log).then(r => {
      log('motor AceStream:', r);
      if (r === 'missing') dialog.showMessageBox(mainWin, { type: 'info', title: 'TOPOTV', message: 'No se encontró el motor AceStream.', detail: 'Instala AceStream Media (acestream.org) o arranca tu motor en Docker (puerto 6878). Sin él no se pueden reproducir los canales.', buttons: ['Entendido'] }).catch(() => {});
    });
  } catch (e) {
    log('ERROR de arranque', e && e.stack || e);
    dialog.showErrorBox('TOPOTV no pudo arrancar', String(e && e.message || e) + `\n\nRegistro: ${LOG()}`);
    app.quit();
  }
});
