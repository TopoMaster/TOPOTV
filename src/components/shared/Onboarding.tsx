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

/** Versión de la guía: al cambiarla, la guía se enseña otra vez (una sola) a quien ya vio la anterior. */
const GUIDE_KEY = 'topotv-guide-version';
const GUIDE_VERSION = '3';

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

  // primera vez (o guía renovada desde la última vez que se vio): se abre sola
  useEffect(() => {
    let seen = '';
    try { seen = localStorage.getItem(GUIDE_KEY) ?? ''; } catch { /* sin almacenamiento */ }
    if (!done || seen !== GUIDE_VERSION) setOpen(true);
  }, [done, setOpen]);
  useEffect(() => { if (open) setStep(0); }, [open]);
  if (!open) return null;

  const close = () => { setDone(true); setOpen(false); try { localStorage.setItem(GUIDE_KEY, GUIDE_VERSION); } catch { /* sin almacenamiento */ } };
  const go = (path: string) => { close(); navigate(path); };

  const steps: { title: string; body: React.ReactNode }[] = [
    {
      title: 'Bienvenido a TOPOTV',
      body: (
        <>
          <p>Canales, eventos deportivos, TDT y cine en un mismo sitio. Esta guía dura un minuto y puedes repetirla cuando quieras en <strong>Ajustes → Copia y sistema</strong>.</p>
          <p style={{ color: 'var(--text-muted)' }}>TOPOTV no incluye canales de pago: usa solo listas y fuentes propias o autorizadas.</p>
        </>
      ),
    },
    {
      title: 'Tus canales',
      body: (
        <>
          {isNative
            ? <p>En la pestaña <strong>Canales</strong> están todas las categorías. Carga tu lista M3U con el botón de subir (arriba) o en <strong>Ajustes → Canales y listas</strong>: se guarda en el móvil y no se pierde al actualizar.</p>
            : <p>Deja tus listas <strong>.m3u</strong> en la carpeta <strong>Documentos\TOPOTV\Listas</strong> y se cargan solas cada vez que actualizas (también puedes usar <strong>Cargar M3U</strong>). A la izquierda verás las categorías en carpetas, con una por país.</p>}
          <p>Si un mismo enlace (ID de AceStream) viene en varias listas, solo se guarda una vez. Cada canal muestra su guía de programación o «sin guía».</p>
          <button style={{ ...choice(includeTdt), width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }} onClick={() => { setIncludeTdt(!includeTdt); void reloadSources(); }}>
            {includeTdt && <Check size={14} />}Incluir TDT en abierto (RTVE y autonómicas)
          </button>
        </>
      ),
    },
    {
      title: '¿Dónde quieres verlos?',
      body: (
        <>
          <p>Elige tu reproductor (se cambia en <strong>Ajustes → Motor y reproducción</strong>).</p>
          <div className="flex gap-2 flex-wrap">
            {isNative
              ? <>
                <button style={choice(preferredPlayer === 'native')} onClick={() => setPreferredPlayer('native')}>📺 TOPOTV<br /><small style={{ fontWeight: 400 }}>recomendado</small></button>
                <button style={choice(preferredPlayer === 'vlc')} onClick={() => setPreferredPlayer('vlc')}>🎬 VLC<br /><small style={{ fontWeight: 400 }}>app aparte</small></button>
              </>
              : <>
                <button style={choice(preferredPlayer === 'browser')} onClick={() => setPreferredPlayer('browser')}>📺 Dentro de TOPOTV<br /><small style={{ fontWeight: 400 }}>recomendado</small></button>
                <button style={choice(preferredPlayer === 'vlc')} onClick={() => setPreferredPlayer('vlc')}>🎬 VLC<br /><small style={{ fontWeight: 400 }}>ventana aparte</small></button>
              </>}
          </div>
          <p style={{ color: 'var(--text-muted)' }}>{isNative
            ? 'El motor AceStream se enciende solo al ver un canal. La primera vez Android pregunta «Abrir con»: elige TOPOTV y «Siempre».'
            : 'Si un vídeo tiene un formato que no se puede ver dentro de la app, se abre solo en VLC. La TDT en abierto no necesita el motor.'}</p>
        </>
      ),
    },
    {
      title: 'Eventos del día',
      body: (
        <>
          <p>En <strong>Eventos</strong> está la agenda deportiva. Pulsa <strong>Ver</strong>, y debajo verás <strong>«En tus canales»</strong>: los canales de tus listas que lo emiten. Los partidos que solo aparecen en la guía salen marcados <strong>GUÍA TV</strong>.</p>
          <p>Con la <strong>campana</strong> te avisa antes de empezar y con <strong>Grabar</strong> lo guardas para verlo después.</p>
          <p style={{ color: 'var(--text-muted)' }}>{isNative ? 'Al pulsar Actualizar, TOPOTV conecta su WARP integrado (solo para la app) y lo apaga al terminar. La primera vez Android pide permiso de VPN.' : 'Al pulsar Actualizar, TOPOTV conecta Cloudflare WARP mientras actualiza la agenda, las listas y la guía, y lo desconecta al terminar.'}</p>
        </>
      ),
    },
    {
      title: 'Cine y series',
      body: (
        <>
          <p>TOPOTV trae de serie los catálogos de <strong>Cinemeta</strong> y de <strong>Netflix, Disney+, Prime Video, Apple TV+ y HBO Max</strong>. Para tener enlaces, añade tus addons de Stremio: en <strong>Ajustes → Cine y series</strong>, pega la dirección del addon (la que acaba en <em>manifest.json</em>). Hay un catálogo de addons de la comunidad en <strong>stremio-addons.net</strong>.</p>
          <p>Al pulsar <strong>Ver</strong>, cada enlace indica el <strong>idioma del audio</strong> 🔊 y los <strong>subtítulos</strong> 💬; los que están en tu idioma salen primero.</p>
          <p style={{ color: 'var(--text-muted)' }}>{isNative ? '¿Ya los tienes en Windows? Allí, en Ajustes → Copia de seguridad, pulsa «Guardar copia» y aquí «Restaurar desde archivo»: se pasan tus addons y tus listas. Los torrents se ven con el motor AceStream, como los canales.' : 'Los torrents se ven con el motor de torrents de TOPOTV, dentro de la app o en VLC. Para pasar tus addons y tus listas al móvil o a la tele, usa Ajustes → Copia de seguridad.'}</p>
        </>
      ),
    },
    {
      title: 'Hazla tuya',
      body: (
        <>
          <p>En <strong>Ajustes → Apariencia</strong> eliges color, tamaño y tipo de letra. En <strong>Idioma y traducción</strong>, el idioma al que se traducen solas la guía y las sinopsis que estén en otro idioma.</p>
          <p>Modo TV: interfaz más grande para manejarla con mando. «Automático» solo se activa en Android TV.</p>
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
            <button style={choice(false)} onClick={() => go('/library')}>Cine y series</button>
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
