/** Cliente del servicio local de enlaces compartidos (tools/share-server.cjs, puerto 3006). */
const ADMIN = 'http://localhost:3006';

interface ShareInfo { token: string; name: string; hash: string; created: number; expires: number; maxViewers: number; viewers: number; url: string | null; }
interface TunnelInfo { state: 'off' | 'downloading' | 'starting' | 'on' | 'error'; url: string | null; error: string | null; }
export interface ShareStatus { tunnel: TunnelInfo; shares: ShareInfo[]; }

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(ADMIN + path, { ...init, signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
export const shareStatus = () => call<ShareStatus>('/status');
export const tunnelStart = () => call<ShareStatus>('/tunnel/start', { method: 'POST' });
export const tunnelStop = () => call<ShareStatus>('/tunnel/stop', { method: 'POST' });
export const shareRevoke = (token: string) => call<ShareStatus>(`/share/revoke?token=${token}`, { method: 'POST' });
const shareCreate = (hash: string, name: string, ttlHours = 6, maxViewers = 3) =>
  call<{ share: ShareInfo; tunnel: TunnelInfo }>('/share', { method: 'POST', body: JSON.stringify({ hash, name, ttlHours, maxViewers }) });

/** Espera a que el túnel publique su URL (hasta ~3 min la primera vez, que lo descarga) y devuelve el enlace listo para compartir. */
export async function createShareLink(hash: string, name: string, ttlHours = 6, maxViewers = 3): Promise<string> {
  const { share } = await shareCreate(hash, name, ttlHours, maxViewers);
  for (let i = 0; i < 180; i++) {
    const st = await shareStatus();
    if (st.tunnel.state === 'error') throw new Error(st.tunnel.error || 'No se pudo abrir el túnel');
    const s = st.shares.find(x => x.token === share.token);
    if (s?.url) return s.url;
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error('El túnel tardó demasiado en abrirse. Inténtalo otra vez en un minuto.');
}
