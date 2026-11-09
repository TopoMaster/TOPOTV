import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { Check } from 'lucide-react';
import { LogoMark } from '@/components/brand/Logo';
import { useSettingsStore, type TvMode } from '@/store/useSettingsStore';
import { useM3UStore } from '@/store/useM3UStore';
import { useUIStore } from '@/store/useUIStore';

const choice = (active: boolean) => ({
  flex: '1 1 120px', minHeight: 48, padding: '8px 12px', cursor: 'pointer', textAlign: 'center' as const,
  background: active ? 'var(--accent-dim)' : 'var(--bg-elevated)', border: `1px solid ${active ? 'var(--accent)' : 'var(--border-mid)'}`,
  borderRadius: 'var(--radius-md)', color: active ? 'var(--accent)' : 'var(--text-secondary)', fontSize: '0.8rem', fontWeight: active ? 700 : 500,
});

/** Guía interactiva del primer arranque (se puede repetir desde Ajustes). */
export function Onboarding() {
  const navigate = useNavigate();
  const isNative = Capacitor.isNativePlatform();
  const done = useSettingsStore(s => s.onboardingDone);
  const setDone = useSettingsStore(s => s.setOnboardingDone);
  const open = useUIStore(s => s.onboardingOpen);
  const setOpen = useUIStore(s => s.setOnboardingOpen);
  const { preferredPlayer, setPreferredPlayer, tvMode, setTvMode, includeTdt, setIncludeTdt } = useSettingsStore();
  const reloadSources = useM3UStore(s => s.reloadSources);
  const [step, setStep] = useState(0);

  // primera vez: se abre sola
  useEffect(() => { if (!done) setOpen(true); }, [done, setOpen]);
  useEffect(() => { if (open) setStep(0); }, [open]);
  if (!open) return null;

  const close = () => { setDone(true); setOpen(false); };
  const go = (path: string) => { close(); navigate(path); };

  const steps: { title: string; body: React.ReactNode }[] = [
    {
      title: 'Bienvenido a TOPOTV',
      body: (
        <>
          <p>Canales, eventos y TDT en un mismo sitio. Esta guía dura un minuto y puedes repetirla cuando quieras desde <strong>Ajustes</strong>.</p>
          <p style={{ color: 'var(--text-muted)' }}>TOPOTV no incluye canales de pago: usa solo listas y fuentes propias o autorizadas.</p>
        </>
      ),
    },
    {
      title: 'Canales por categorías',
      body: (
        <>
          <p>{isNative ? 'En la pestaña «Canales» tienes todas las categorías' : 'A la izquierda tienes todas las categorías'} (DAZN, La Liga, Liga de Campeones, TDT…). Las listas de Elcano y los canales de Ciriaco se fusionan solos en ellas.</p>
          <button style={{ ...choice(includeTdt), width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }} onClick={() => { setIncludeTdt(!includeTdt); void reloadSources(); }}>
            {includeTdt && <Check size={14} />}Incluir TDT en abierto (RTVE y autonómicas)
          </button>
        </>
      ),
    },
    {
      title: '¿Dónde quieres ver los canales?',
      body: (
        <>
          <p>Elige tu reproductor. Puedes cambiarlo cuando quieras en Ajustes → Reproductor.</p>
          <div className="flex gap-2 flex-wrap">
            <button style={choice(preferredPlayer === 'vlc')} onClick={() => setPreferredPlayer('vlc')}>🎬 VLC<br /><small style={{ fontWeight: 400 }}>más estable</small></button>
            <button style={choice(preferredPlayer === 'browser')} onClick={() => setPreferredPlayer('browser')}>🌐 Navegador<br /><small style={{ fontWeight: 400 }}>dentro de TOPOTV</small></button>
          </div>
          <p style={{ color: 'var(--text-muted)' }}>Los canales de AceStream necesitan el motor activo; la TDT en abierto no.</p>
        </>
      ),
    },
    {
      title: 'Eventos del día',
      body: (
        <>
          <p>En <strong>Eventos</strong> ves la agenda deportiva con sus enlaces. Pulsa <strong>Ver</strong> para reproducir o el desplegable para elegir otro enlace.</p>
          {!isNative && <p>Con <strong>Grabar</strong> programas una grabación y luego la ves en <strong>Grabaciones</strong>.</p>}
          <p>{isNative ? 'Al pulsar Actualizar, TOPOTV conecta su WARP integrado (solo para la app) y lo apaga al terminar. La primera vez Android pedirá permiso de VPN.' : 'Al pulsar Actualizar, TOPOTV conecta Cloudflare WARP solo mientras lee la agenda y lo desconecta al terminar.'}</p>
        </>
      ),
    },
    {
      title: 'Modo TV',
      body: (
        <>
          <p>Interfaz más grande y manejable con mando a distancia. «Automático» solo se activa en Android TV.</p>
          <div className="flex gap-2 flex-wrap">
            {(['auto', 'on', 'off'] as TvMode[]).map(m => (
              <button key={m} style={choice(tvMode === m)} onClick={() => setTvMode(m)}>{m === 'auto' ? 'Automático' : m === 'on' ? 'Activado' : 'Desactivado'}</button>
            ))}
          </div>
        </>
      ),
    },
    {
      title: '¡Todo listo!',
      body: (
        <>
          <p>Por dónde empezar:</p>
          <div className="flex gap-2 flex-wrap">
            <button style={choice(false)} onClick={() => go(isNative ? '/categories' : '/')}>Ver canales</button>
            <button style={choice(false)} onClick={() => go('/events')}>Ver eventos</button>
            <button style={choice(false)} onClick={() => go('/settings')}>Ajustes</button>
          </div>
        </>
      ),
    },
  ];
  const last = step === steps.length - 1;
  const cur = steps[step];

  return (
    <div role="dialog" aria-modal="true" aria-label="Guía de uso" className="fade-in"
      style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(4,6,9,0.82)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="slide-up" key={step} style={{ width: '100%', maxWidth: 480, background: 'var(--bg-card)', border: '1px solid var(--border-mid)', borderRadius: 18, padding: 24, boxShadow: '0 24px 70px rgba(0,0,0,0.6)' }}>
        <div className="flex items-center gap-3 mb-4">
          <div className="mole-float"><LogoMark size={step === 0 ? 64 : 44} /></div>
          <h2 className="font-display" style={{ fontSize: '1.9rem', letterSpacing: '0.05em' }}>{cur.title}</h2>
        </div>
        <div className="flex flex-col gap-3" style={{ fontSize: '0.88rem', lineHeight: 1.6, color: 'var(--text-secondary)', minHeight: 150 }}>{cur.body}</div>
        <div className="flex items-center justify-between mt-5">
          <div className="flex gap-1.5" aria-label={`Paso ${step + 1} de ${steps.length}`}>
            {steps.map((_, i) => <span key={i} style={{ width: i === step ? 22 : 8, height: 8, borderRadius: 4, background: i === step ? 'var(--accent)' : 'var(--border-mid)', transition: 'width .2s' }} />)}
          </div>
          <div className="flex items-center gap-2">
            {!last && <button onClick={close} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.78rem', cursor: 'pointer', padding: '8px 10px' }}>Saltar</button>}
            {step > 0 && <button onClick={() => setStep(step - 1)} style={choice(false)}>Atrás</button>}
            <button autoFocus onClick={() => (last ? close() : setStep(step + 1))}
              style={{ minHeight: 44, padding: '0 22px', background: 'var(--accent-gradient)', color: '#080a0e', border: 'none', borderRadius: 100, fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' }}>
              {last ? 'Empezar' : 'Siguiente'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
