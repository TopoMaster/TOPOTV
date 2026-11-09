import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { useM3UStore } from '@/store/useM3UStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useFavoritesStore } from '@/store/useFavoritesStore';
import { useHistoryStore } from '@/store/useHistoryStore';
import { useHealthStore } from '@/store/useHealthStore';
import { useRecorderStore } from '@/store/useRecorderStore';
import { usePlayerStore } from '@/store/usePlayerStore';
import { buildStreamUrl } from '@/lib/aceApi';
import type { Channel, Stream } from '@/types';

const STEP_MS = 20000;          // un enlace cada 20 s: sin saturar el motor ni la red
const TIMEOUT_MS = 15000;       // primer intento: si en 15 s no llegan datos, se repite más tarde
const RETRY_TIMEOUT_MS = 30000; // segundo intento, más paciente: AceStream a veces tarda en encontrar peers
const FRESH_MS = 12 * 3600e3;   // un resultado de hace menos de 12 h no se repite
const QUIET_AFTER_PLAY_MS = 30 * 60e3;   // mientras ves algo (o hace poco), no se toca el motor

/** Lee un trozo del stream del motor: si llegan datos, el enlace funciona. */
async function probe(url: string, timeoutMs: number): Promise<boolean> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Range: 'bytes=0-1023' } });
    if (!res.ok && res.status !== 206) return false;
    const reader = res.body?.getReader();
    if (!reader) return false;
    const { value } = await reader.read();
    void reader.cancel();
    return !!value && value.length > 0;
  } catch { return false; } finally { clearTimeout(t); }
}

/** Qué comprobar y en qué orden: favoritos, vistos hace poco y, después, el resto de canales de la lista. */
function nextTarget(): Stream | null {
  const { allChannels } = useM3UStore.getState();
  const { streams } = useHealthStore.getState();
  const fav = useFavoritesStore.getState().ids;
  const history = useHistoryStore.getState().entries.map(e => e.channel.id);
  const rank = (c: Channel) => fav.has(c.id) ? 0 : history.includes(c.id) ? 1 : 2;
  const channels = allChannels.filter(c => !c.id.startsWith('ciriaco-')).sort((a, b) => rank(a) - rank(b));
  const now = Date.now();
  let best: { s: Stream; at: number } | null = null;
  for (const c of channels) {
    for (const s of c.streams) {
      if (s.direct) continue;
      const e = streams[s.aceId];
      if (e && now - e.at < FRESH_MS) continue;
      // lo nunca comprobado va antes que lo caducado
      const at = e ? e.at : 0;
      if (!best || at < best.at) best = { s, at };
      if (!e) return s;
    }
  }
  return best ? best.s : null;
}

/** Comprueba los enlaces en segundo plano y deja anotados los caídos (solo app de Windows). */
export function BackgroundChecker() {
  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;
    let busy = false;
    let retry: Stream | null = null;   // enlace que falló una vez: solo se da por caído si falla también el segundo intento
    const timer = setInterval(async () => {
      if (busy) return;
      const settings = useSettingsStore.getState();
      if (!settings.autoCheck || settings.backendStatus !== 'online') return;
      if (usePlayerStore.getState().status !== 'idle') return;
      if (Date.now() - useHealthStore.getState().lastPlayAt < QUIET_AFTER_PLAY_MS) return;
      if (useRecorderStore.getState().recordings.some(r => r.status === 'recording')) return;
      const second = retry; retry = null;
      const target = second ?? nextTarget();
      if (!target) return;
      busy = true;
      try {
        const ok = await probe(buildStreamUrl(target.aceId, settings.backendConfig), second ? RETRY_TIMEOUT_MS : TIMEOUT_MS);
        if (ok) useHealthStore.getState().mark(target.aceId, true);
        else if (second) useHealthStore.getState().mark(target.aceId, false);
        else retry = target;
      } finally { busy = false; }
    }, STEP_MS);
    return () => clearInterval(timer);
  }, []);
  return null;
}
