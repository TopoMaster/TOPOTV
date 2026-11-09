import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useReminderStore } from '@/store/useReminderStore';
import { useSettingsStore } from '@/store/useSettingsStore';

/** Lanza el aviso de Windows cuando se acerca la hora de un evento marcado con la campana. */
export function Reminders() {
  const navigate = useNavigate();
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    useReminderStore.getState().prune();
    const check = () => {
      const lead = useSettingsStore.getState().reminderLead * 60000;
      const now = Date.now();
      for (const r of useReminderStore.getState().items) {
        if (r.notified || r.at - now > lead || r.at < now - 15 * 60000) continue;
        useReminderStore.getState().markNotified(r.key);
        const mins = Math.max(0, Math.round((r.at - now) / 60000));
        const heading = mins > 0 ? `Empieza en ${mins} min` : 'Empieza ahora';
        let shown = false;
        try {
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            const n = new Notification(heading, { body: r.title, silent: false });
            n.onclick = () => { window.focus(); navigate('/events'); n.close(); };
            shown = true;
          }
        } catch { /* sin notificaciones del sistema */ }
        if (!shown) { setToast(`${heading}: ${r.title}`); setTimeout(() => setToast(null), 45000); }   // sin permiso del sistema: aviso dentro de la app
      }
    };
    check();
    const timer = setInterval(check, 20000);
    return () => clearInterval(timer);
  }, [navigate]);
  if (!toast) return null;
  return (
    <div role="alert" className="fixed z-50 flex items-center gap-3 fade-in" style={{ left: 16, bottom: 16, maxWidth: 420, padding: '12px 14px', background: 'var(--bg-surface)', border: '1px solid var(--accent)', borderRadius: 'var(--radius-lg)', boxShadow: '0 12px 40px rgba(0,0,0,0.5)' }}>
      <button onClick={() => { setToast(null); navigate('/events'); }} style={{ background: 'none', border: 'none', color: 'var(--text-primary)', fontSize: '0.82rem', textAlign: 'left', cursor: 'pointer' }}>🔔 {toast}</button>
      <button onClick={() => setToast(null)} aria-label="Cerrar aviso" style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer' }}><X size={16} /></button>
    </div>
  );
}

/** Pide permiso para avisar (solo la primera vez que se marca un evento). */
export async function ensureNotifyPermission(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try { return (await Notification.requestPermission()) === 'granted'; } catch { return false; }
}
