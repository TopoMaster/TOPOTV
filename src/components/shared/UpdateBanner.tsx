import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { useSettingsStore } from '@/store/useSettingsStore';
import { checkUpdate, startUpdate, systemAvailable, updateProgress, type UpdateInfo } from '@/lib/system';

/** Aviso de versión nueva en la app de Windows: un botón descarga el instalador oficial de GitHub y lo abre. */
export function UpdateBanner() {
  const auto = useSettingsStore(s => s.autoUpdateCheck);
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [hidden, setHidden] = useState(false);
  const [busy, setBusy] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!auto) return;
    let cancelled = false;
    const run = async () => {
      if (!(await systemAvailable())) return;
      try { const i = await checkUpdate(); if (!cancelled && i.newer) setInfo(i); } catch { /* sin conexión o límite de GitHub: se reintenta luego */ }
    };
    const first = setTimeout(run, 8000);
    const every = setInterval(run, 6 * 3600e3);
    return () => { cancelled = true; clearTimeout(first); clearInterval(every); };
  }, [auto]);

  if (!info || hidden) return null;

  const install = async () => {
    setError(''); setBusy(0);
    try {
      await startUpdate();
      for (let i = 0; i < 600; i++) {
        await new Promise(r => setTimeout(r, 1000));
        const p = await updateProgress();
        if (p.phase === 'error') throw new Error(p.error || 'La descarga falló');
        setBusy(p.percent);
        if (p.phase === 'ready') {   // Windows: la app se cierra sola y abre el instalador; Android: el diálogo de instalación ya está abierto
          if (Capacitor.isNativePlatform()) setBusy(null);
          return;
        }
      }
      throw new Error('La descarga tarda demasiado');
    } catch (e) { setBusy(null); setError(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <div role="status" className="flex items-center gap-3 flex-wrap update-banner" style={{ padding: '8px 16px', background: 'var(--accent-dim)', borderBottom: '1px solid var(--border-accent)', fontSize: '0.8rem' }}>
      <Download size={15} style={{ color: 'var(--accent)', flexShrink: 0 }} />
      <span style={{ flex: '1 1 240px', color: 'var(--text-primary)' }}>
        <strong>TOPOTV {info.latest}</strong> ya está disponible (tienes la {info.current}).
        {error && <span style={{ color: 'var(--offline-red)' }}> {error}</span>}
      </span>
      <button onClick={install} disabled={busy !== null}
        style={{ minHeight: 32, padding: '0 16px', background: 'var(--accent-gradient)', color: '#080a0e', border: 'none', borderRadius: 100, fontWeight: 700, fontSize: '0.76rem', cursor: busy !== null ? 'wait' : 'pointer' }}>
        {busy === null ? 'Actualizar ahora' : busy >= 100 ? 'Abriendo instalador…' : `Descargando ${busy}%`}
      </button>
      {busy === null && <button onClick={() => setHidden(true)} title="Ahora no" aria-label="Ahora no" style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={16} /></button>}
    </div>
  );
}
