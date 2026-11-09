import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { useNavigate } from 'react-router-dom';
import { useReminderStore } from '@/store/useReminderStore';
import { useSettingsStore } from '@/store/useSettingsStore';

const isNative = () => Capacitor.isNativePlatform();

/** Número estable para identificar la notificación de un aviso. */
function nid(key: string): number {
  let h = 7;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return (Math.abs(h) % 2147483000) + 1;
}

/** Android: deja programadas las notificaciones de los avisos (el sistema las lanza aunque TOPOTV esté cerrado). */
async function syncNative(items: { key: string; title: string; at: number }[], leadMin: number) {
  try {
    if ((await LocalNotifications.checkPermissions()).display !== 'granted') return;
    const now = Date.now();
    const want = new Map<number, { key: string; title: string; at: number }>();
    for (const r of items) if (r.at - leadMin * 60000 > now + 2000) want.set(nid(r.key), r);
    const pending = (await LocalNotifications.getPending()).notifications;
    const stale = pending.filter(n => !want.has(n.id)).map(n => ({ id: n.id }));
    if (stale.length) await LocalNotifications.cancel({ notifications: stale });
    const list = [...want.entries()].map(([id, r]) => ({
      id, title: `Empieza en ${leadMin} min`, body: r.title,
      schedule: { at: new Date(r.at - leadMin * 60000), allowWhileIdle: true },
    }));
    if (list.length) {
      await LocalNotifications.cancel({ notifications: list.map(l => ({ id: l.id })) });   // por si cambió la antelación
      await LocalNotifications.schedule({ notifications: list });
    }
  } catch { /* sin notificaciones: el aviso no saltará */ }
}

/** Lanza el aviso de Windows (o la notificación de Android) cuando se acerca la hora de un evento marcado con la campana. */
export function Reminders() {
  const navigate = useNavigate();
  const [toast, setToast] = useState<string | null>(null);
  const items = useReminderStore(s => s.items);
  const lead = useSettingsStore(s => s.reminderLead);

  // Android: el sistema se encarga
  useEffect(() => { if (isNative()) void syncNative(items, lead); }, [items, lead]);

  // Windows / navegador: se vigila desde la app
  useEffect(() => {
    if (isNative()) return;
    useReminderStore.getState().prune();
    const check = () => {
      const leadMs = useSettingsStore.getState().reminderLead * 60000;
      const now = Date.now();
      for (const r of useReminderStore.getState().items) {
        if (r.notified || r.at - now > leadMs || r.at < now - 15 * 60000) continue;
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
  if (isNative()) {
    try {
      if ((await LocalNotifications.checkPermissions()).display === 'granted') return true;
      return (await LocalNotifications.requestPermissions()).display === 'granted';
    } catch { return false; }
  }
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  try { return (await Notification.requestPermission()) === 'granted'; } catch { return false; }
}
