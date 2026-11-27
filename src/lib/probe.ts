import { Capacitor } from '@capacitor/core';
import { buildStreamUrl } from '@/lib/aceApi';
import { probeLinkNative } from '@/lib/recorder';
import type { AceBackendConfig, Stream } from '@/types';

/** Vídeo de verdad: al menos 16 KB (el motor a veces contesta al instante con un mensaje de error de pocos bytes) */
const MIN_BYTES = 16384;

/** Lee el stream hasta tener vídeo suficiente (o se agota el tiempo). */
async function readVideo(url: string, timeoutMs: number): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok && res.status !== 206) return false;
    if (/json|text/i.test(res.headers.get('content-type') ?? '')) return false;
    const reader = res.body?.getReader();
    if (!reader) return false;
    let total = 0;
    while (total < MIN_BYTES) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value?.length ?? 0;
    }
    void reader.cancel();
    return total >= MIN_BYTES;
  } catch { return false; } finally { clearTimeout(t); }
}

/* El motor AceStream solo atiende bien una consulta a la vez (con dos a la vez, una devuelve un error al instante) y
   necesita un momento para cerrar la anterior: todas las comprobaciones de la app pasan por esta cola, de una en una. */
let engineQueue: Promise<unknown> = Promise.resolve();
const GAP_MS = 1500;
function inEngineQueue<T>(job: () => Promise<T>): Promise<T> {
  const run = engineQueue.then(job, job);
  engineQueue = run.then(() => new Promise(r => setTimeout(r, GAP_MS)), () => new Promise(r => setTimeout(r, GAP_MS)));
  return run;
}

export interface ProbeResult { ok: boolean; ms: number; timeout: boolean }

async function probeOnce(stream: Stream, cfg: AceBackendConfig, timeoutMs: number): Promise<ProbeResult> {
  const t0 = Date.now();
  let ok: boolean;
  if (stream.direct) {
    try { await fetch(stream.url, { mode: 'no-cors', signal: AbortSignal.timeout(timeoutMs) }); ok = true; } catch { ok = false; }
  } else {
    ok = await inEngineQueue(() => (Capacitor.isNativePlatform()
      ? probeLinkNative(cfg.host, cfg.port, stream.aceId, timeoutMs)   // Android: desde Java (el WebView no puede leer el motor)
      : readVideo(buildStreamUrl(stream.aceId, cfg), timeoutMs)));
  }
  const ms = Date.now() - t0;
  return { ok, ms, timeout: !ok && ms >= timeoutMs - 300 };
}

/**
 * Comprueba un enlace (lo usan el comprobador, el botón de la ficha del canal y la comprobación en segundo plano).
 *  - AceStream: se pide vídeo al motor (de uno en uno). Si falla, se reintenta una vez a los pocos segundos, porque el
 *    motor a veces contesta vacío si acaba de cerrar ese mismo canal.
 *  - Enlaces directos (HLS de la TDT…): basta con que el servidor responda.
 */
export async function probeStream(stream: Stream, cfg: AceBackendConfig, timeoutMs: number, retry = true): Promise<ProbeResult> {
  const first = await probeOnce(stream, cfg, timeoutMs);
  if (first.ok || stream.direct || !retry) return first;
  await new Promise(r => setTimeout(r, 3000));
  const second = await probeOnce(stream, cfg, timeoutMs);
  return { ...second, ms: first.ms + second.ms };
}
