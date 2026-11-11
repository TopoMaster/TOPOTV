import { useState } from 'react';
import { Check, Lock } from 'lucide-react';
import { useProfileStore } from '@/store/useProfileStore';

/** Círculo con la inicial del perfil activo (solo si hay más de uno): abre la lista para cambiar. */
export function ProfileMenu() {
  const { profiles, activeId, switchTo } = useProfileStore();
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  if (profiles.length < 2) return null;
  const active = profiles.find(p => p.id === activeId) ?? profiles[0];

  const choose = async (id: string) => {
    const p = profiles.find(x => x.id === id);
    if (!p || id === activeId) { setOpen(false); return; }
    if (p.pinHash) { setAsking(id); setPin(''); setError(''); return; }
    await switchTo(id);
  };
  const confirmPin = async () => {
    if (!asking) return;
    if (!(await switchTo(asking, pin))) { setError('PIN incorrecto'); setPin(''); }
  };

  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => { setOpen(o => !o); setAsking(null); }} aria-label={`Perfil: ${active.name}`} aria-expanded={open} title={`Perfil: ${active.name}`}
        style={{ width: 34, height: 34, borderRadius: '50%', background: active.color, color: '#080a0e', border: '2px solid var(--border-mid)', fontWeight: 800, fontSize: '0.82rem', cursor: 'pointer' }}>
        {active.name[0]?.toUpperCase()}
      </button>
      {open && (
        <div role="menu" className="fade-in" style={{ position: 'absolute', right: 0, top: 42, zIndex: 80, minWidth: 210, padding: 8, background: 'var(--bg-surface)', border: '1px solid var(--border-mid)', borderRadius: 'var(--radius-lg)', boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
          {asking ? (
            <div style={{ padding: 8 }}>
              <p style={{ fontSize: '0.78rem', marginBottom: 8 }}>PIN de {profiles.find(p => p.id === asking)?.name}</p>
              <input autoFocus type="password" inputMode="numeric" value={pin} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} onKeyDown={e => e.key === 'Enter' && void confirmPin()} aria-label="PIN"
                style={{ width: '100%', padding: '8px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border-mid)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', letterSpacing: '0.3em', textAlign: 'center' }} />
              {error && <p role="alert" style={{ fontSize: '0.7rem', color: 'var(--offline-red)', marginTop: 6 }}>{error}</p>}
              <div className="flex gap-2" style={{ marginTop: 8 }}>
                <button onClick={() => setAsking(null)} style={{ flex: 1, minHeight: 34, background: 'var(--bg-elevated)', border: '1px solid var(--border-mid)', borderRadius: 100, color: 'var(--text-secondary)', cursor: 'pointer' }}>Atrás</button>
                <button onClick={() => void confirmPin()} style={{ flex: 1, minHeight: 34, background: 'var(--accent-gradient)', color: '#080a0e', border: 'none', borderRadius: 100, fontWeight: 700, cursor: 'pointer' }}>Entrar</button>
              </div>
            </div>
          ) : profiles.map(p => (
            <button key={p.id} role="menuitem" onClick={() => void choose(p.id)} className="flex items-center gap-2" style={{ width: '100%', padding: '8px 10px', background: p.id === activeId ? 'var(--accent-dim)' : 'transparent', border: 'none', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontSize: '0.84rem', cursor: 'pointer', textAlign: 'left' }}>
              <span style={{ width: 24, height: 24, borderRadius: '50%', background: p.color, color: '#080a0e', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.7rem' }}>{p.name[0]?.toUpperCase()}</span>
              <span style={{ flex: 1 }}>{p.name}</span>
              {p.pinHash && <Lock size={12} style={{ color: 'var(--text-muted)' }} />}
              {p.id === activeId && <Check size={14} style={{ color: 'var(--accent)' }} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
