import { useNavigate } from 'react-router-dom';
import { ListPlus, X } from 'lucide-react';
import { useListChangesStore } from '@/store/useListChangesStore';

/** Aviso en la portada cuando una lista de canales ha cambiado desde la última vez. */
export function ListChangesBanner() {
  const navigate = useNavigate();
  const items = useListChangesStore(s => s.items);
  const dismiss = useListChangesStore(s => s.dismiss);
  if (!items.length) return null;
  return (
    <div className="px-6" style={{ marginTop: 16 }}>
      {items.map(c => (
        <div key={c.label} role="status" className="flex items-center gap-3 flex-wrap" style={{ marginBottom: 8, padding: '10px 14px', background: 'var(--accent-dim)', border: '1px solid var(--border-accent)', borderRadius: 'var(--radius-lg)', fontSize: '0.8rem' }}>
          <ListPlus size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <span style={{ flex: '1 1 240px' }}>
            <strong>{c.label}</strong> ha cambiado:
            {c.added > 0 && <> {c.added} {c.added === 1 ? 'canal nuevo' : 'canales nuevos'}{c.names.length ? ` (${c.names.join(', ')}${c.added > c.names.length ? '…' : ''})` : ''}</>}
            {c.added > 0 && c.removed > 0 && ','}
            {c.removed > 0 && <> {c.removed} {c.removed === 1 ? 'enlace quitado' : 'enlaces quitados'}</>}.
          </span>
          <button onClick={() => navigate('/categories')} style={{ minHeight: 32, padding: '0 14px', background: 'var(--bg-elevated)', border: '1px solid var(--border-mid)', borderRadius: 100, color: 'var(--text-secondary)', fontSize: '0.74rem', cursor: 'pointer' }}>Ver canales</button>
          <button onClick={() => dismiss(c.label)} aria-label="Entendido" title="Entendido" style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={16} /></button>
        </div>
      ))}
    </div>
  );
}
