/**
 * TOPOTV — aplicación de escritorio.
 * Arranca en el propio proceso: servidor de la web (5174), servicio de eventos (3004) y VLC helper (3002).
 * La agenda se lee con un BrowserWindow oculto (Chromium de Electron): no hace falta Playwright.
 */
const { app, BrowserWindow, shell, session, Menu, dialog } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');

const WEB_PORT = 5174;
const APP_DIR = path.join(__dirname, '..', 'app');
const TOOLS = path.join(__dirname, '..', 'tools');
const LOG = () => path.join(app.getPath('userData'), 'topotv.log');
const log = (...a) => { const line = `${new Date().toISOString()} ${a.join(' ')}\n`; try { fs.appendFileSync(LOG(), line); } catch { /* sin log */ } console.log(...a); };

if (!app.requestSingleInstanceLock()) app.quit();

/* ── Servidor de la web (SPA) ───────────────────────────────── */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ico': 'image/x-icon' };
function startWeb() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = path.normalize(path.join(APP_DIR, p));
    if (!file.startsWith(APP_DIR)) { res.writeHead(403); return res.end(); }
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
  mainWin.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  mainWin.loadURL(`http://127.0.0.1:${WEB_PORT}/`);
  mainWin.on('closed', () => { mainWin = null; });
}

app.on('second-instance', () => { if (mainWin) { if (mainWin.isMinimized()) mainWin.restore(); mainWin.focus(); } });
app.on('window-all-closed', () => app.quit());

app.whenReady().then(async () => {
  log('TOPOTV arrancando', app.getVersion());
  // El motor AceStream no envía CORS en todas las versiones: lo permitimos para la web local.
  session.defaultSession.webRequest.onHeadersReceived((d, cb) => {
    const h = d.responseHeaders || {};
    if (/^https?:\/\/(127\.0\.0\.1|localhost):(6878|3002|3004|3006)\//.test(d.url)) h['Access-Control-Allow-Origin'] = ['*'];
    cb({ responseHeaders: h });
  });
  try {
    await startWeb();
    process.env.CIRIACO_PORT = '3004';
    const { start: startCiriaco, extractInBrowser } = require(path.join(TOOLS, 'ciriaco-server.cjs'));
    startCiriaco({ scrape: electronScrape(extractInBrowser), cacheFile: path.join(app.getPath('userData'), 'agenda-cache.json') });
    const vlc = require(path.join(TOOLS, 'vlc-helper.cjs'));
    vlc.start({ log });
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
