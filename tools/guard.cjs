/**
 * Control de acceso común a los servicios locales de TOPOTV (todos escuchan solo en 127.0.0.1).
 *
 * Un servicio local sin control lo puede usar CUALQUIER página web que abras en tu navegador (con peticiones a
 * http://localhost:puerto) y también un ataque de «DNS rebinding». Por eso se exige:
 *   1) que el nombre de servidor (Host) sea localhost o 127.0.0.1;
 *   2) que, si la petición trae Origin, sea de la propia app (o de desarrollo);
 *   3) que, si no trae Origin pero el navegador la marca como de otro sitio (Sec-Fetch-Site: cross-site, p. ej. una
 *      imagen o un vídeo incrustados), venga de una página de la propia app (Referer).
 * Las llamadas sin cabeceras de navegador (la app de escritorio por dentro, VLC, curl) pasan.
 */
const HOST_OK = /^(localhost|127\.0\.0\.1)(:\d+)?$/;
const TRUSTED_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1):(5173|5174|4173)$/;
const TRUSTED_REFERER = /^https?:\/\/(localhost|127\.0\.0\.1):(5173|5174|4173)(\/|$)/;

/** ¿Se acepta la petición? Devuelve null si sí; si no, el motivo. */
function check(req) {
  if (!HOST_OK.test(req.headers.host || '')) return 'host no permitido';
  const origin = req.headers.origin || '';
  if (origin) return TRUSTED_ORIGIN.test(origin) ? null : 'origen no permitido';
  if (req.headers['sec-fetch-site'] === 'cross-site' && !TRUSTED_REFERER.test(req.headers.referer || '')) return 'petición de otro sitio';
  return null;
}

/** Aplica `check`: si no pasa, responde 403 y devuelve false; si pasa, pone CORS solo para el origen de la app y devuelve true. */
function guard(req, res, { methods = 'GET,POST,OPTIONS', headers = 'Content-Type, Range' } = {}) {
  const why = check(req);
  if (why) { res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Acceso denegado: ' + why); return false; }
  const origin = req.headers.origin || '';
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', methods);
    res.setHeader('Access-Control-Allow-Headers', headers);
  }
  return true;
}

module.exports = { check, guard, HOST_OK, TRUSTED_ORIGIN };
