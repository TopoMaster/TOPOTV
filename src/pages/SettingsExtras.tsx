import { useEffect, useState } from 'react';
import { Palette, Star, Activity, Cpu, X, Archive, Puzzle, Users, Lock, Check, Languages } from 'lucide-react';
import { useAddonsStore } from '@/store/useAddonsStore';
import { useProfileStore } from '@/store/useProfileStore';
import { Capacitor } from '@capacitor/core';
import { buildBackup, downloadBackup, restoreBackup } from '@/lib/backup';
import { useSettingsStore, type FontFamily, type FontScale, type ThemeId } from '@/store/useSettingsStore';
import { useHealthStore } from '@/store/useHealthStore';
import { availableLanguages } from '@/lib/translate';
import { checkUpdate, diagnostic, openLog, startUpdate, systemAvailable, updateProgress, type UpdateInfo } from '@/lib/system';

function Card({ children }: { children: React.ReactNode }) {
  return <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: 20 }}>{children}</div>;
}
function SLabel({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return <div className="slabel flex items-center gap-2 mb-4"><Icon size={16} strokeWidth={1.8} style={{ color: 'var(--text-muted)' }} /><h2 className="font-body" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{label}</h2></div>;
}
const opt = (active: boolean) => ({ flex: '1 1 110px', minHeight: 44, padding: '8px 12px', cursor: 'pointer', background: active ? 'var(--accent-dim)' : 'var(--bg-elevated)', border: `1px solid ${active ? 'var(--accent)' : 'var(--border-mid)'}`, borderRadius: 'var(--radius-md)', color: active ? 'var(--accent)' : 'var(--text-secondary)', fontSize: '0.78rem', fontWeight: active ? 700 : 500 } as const);
const title = { fontSize: '0.78rem', fontWeight: 600, marginBottom: 6 } as const;
const help = { fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 10 } as const;

const THEMES: { id: ThemeId; name: string; bg: string; card: string; accent: string; grad: string }[] = [
  { id: 'gold', name: 'Oro', bg: '#080a0e', card: '#1a2030', accent: '#e2c97e', grad: 'linear-gradient(135deg,#f1dd9b,#d4b25c)' },
  { id: 'emerald', name: 'Césped', bg: '#060b09', card: '#15231d', accent: '#5fd897', grad: 'linear-gradient(135deg,#a6f4c5,#2fbf71)' },
  { id: 'ocean', name: 'Azul noche', bg: '#070a12', card: '#162036', accent: '#6cb4ff', grad: 'linear-gradient(135deg,#b3dbff,#3b8bf6)' },
  { id: 'sunset', name: 'Atardecer', bg: '#0d0907', card: '#251b16', accent: '#ffa45c', grad: 'linear-gradient(135deg,#ffcf9e,#f2711c)' },
  { id: 'violet', name: 'Violeta', bg: '#09070f', card: '#1d1830', accent: '#b39dff', grad: 'linear-gradient(135deg,#dcd2ff,#8b5cf6)' },
];
const SIZES: { v: FontScale; label: string; px: number }[] = [
  { v: 'small', label: 'Pequeño', px: 14.5 }, { v: 'normal', label: 'Normal', px: 16 }, { v: 'large', label: 'Grande', px: 18 }, { v: 'xl', label: 'Muy grande', px: 20 },
];
const FONTS: { v: FontFamily; label: string; desc: string; css: string }[] = [
  { v: 'topotv', label: 'TOPOTV', desc: 'La de siempre', css: "'DM Sans Variable','DM Sans',sans-serif" },
  { v: 'system', label: 'Del móvil', desc: 'La de tu sistema', css: "system-ui,Roboto,'Segoe UI',sans-serif" },
  { v: 'legible', label: 'Muy legible', desc: 'Letras más claras', css: "'Atkinson Hyperlegible',sans-serif" },
];

export function AppearanceSection() {
  const { theme, setTheme, amoled, setAmoled, fontScale, setFontScale, fontFamily, setFontFamily, tvMode, setTvMode } = useSettingsStore();
  const pick = (active: boolean): React.CSSProperties => ({ cursor: 'pointer', background: active ? 'var(--accent-dim)' : 'var(--bg-elevated)', border: `1.5px solid ${active ? 'var(--accent)' : 'var(--border-mid)'}`, borderRadius: 14, color: active ? 'var(--accent)' : 'var(--text-secondary)' });
  return (
    <section className="mb-8">
      <SLabel icon={Palette} label="Apariencia" />
      <Card>
        <p style={title}>Color</p>
        <p style={help}>Cambia el color de botones, resaltados y fondos.</p>
        <div className="grid gap-2 mb-4" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(96px,1fr))' }}>
          {THEMES.map(t => (
            <button key={t.id} onClick={() => setTheme(t.id)} aria-pressed={theme === t.id} style={{ ...pick(theme === t.id), padding: 6, textAlign: 'left' }}>
              <div style={{ height: 54, borderRadius: 9, background: amoled ? '#000' : t.bg, padding: 7, display: 'flex', flexDirection: 'column', gap: 5, position: 'relative', overflow: 'hidden' }}>
                <div style={{ height: 8, width: '70%', borderRadius: 4, background: amoled ? '#0c0c0e' : t.card }} />
                <div style={{ height: 8, width: '45%', borderRadius: 4, background: amoled ? '#0c0c0e' : t.card }} />
                <div style={{ position: 'absolute', right: 7, bottom: 7, width: 22, height: 22, borderRadius: '50%', background: t.grad, boxShadow: `0 0 12px ${t.accent}66` }} />
              </div>
              <div className="flex items-center justify-between" style={{ padding: '6px 2px 1px', fontSize: '0.74rem', fontWeight: 700 }}>
                {t.name}{theme === t.id && <Check size={13} strokeWidth={3} />}
              </div>
            </button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap mb-6">
          <button style={opt(!amoled)} onClick={() => setAmoled(false)}>Fondo oscuro</button>
          <button style={opt(amoled)} onClick={() => setAmoled(true)}>Negro puro (OLED)</button>
        </div>

        <p style={title}>Tamaño del texto</p>
        <p style={help}>Se aplica al momento en toda la app.</p>
        <div className="grid gap-2 mb-3" style={{ gridTemplateColumns: 'repeat(4,1fr)' }}>
          {SIZES.map(s => (
            <button key={s.v} onClick={() => setFontScale(s.v)} aria-pressed={fontScale === s.v} style={{ ...pick(fontScale === s.v), padding: '10px 4px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: s.px + 4, fontWeight: 700, lineHeight: 1 }}>Aa</span>
              <span style={{ fontSize: 11, fontWeight: 600 }}>{s.label}</span>
            </button>
          ))}
        </div>
        <div style={{ padding: '12px 14px', borderRadius: 12, background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', marginBottom: 22 }}>
          <p style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: 2 }}>Real Madrid – Barcelona</p>
          <p style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>LaLiga · hoy 21:00 · así se leerán los textos</p>
        </div>

        <p style={title}>Tipo de letra</p>
        <div className="grid gap-2 mb-6" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
          {FONTS.map(f => (
            <button key={f.v} onClick={() => setFontFamily(f.v)} aria-pressed={fontFamily === f.v} style={{ ...pick(fontFamily === f.v), padding: '10px 6px', fontFamily: f.css }}>
              <span style={{ display: 'block', fontSize: '1.15rem', fontWeight: 700, lineHeight: 1.1 }}>Aa 123</span>
              <span style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, marginTop: 4 }}>{f.label}</span>
              <span style={{ display: 'block', fontSize: '0.64rem', color: 'var(--text-muted)' }}>{f.desc}</span>
            </button>
          ))}
        </div>

        <p style={title}>Modo TV</p>
        <p style={help}>Interfaz más grande y con selección clara para manejarla con mando. «Automático» se activa solo en Android TV.</p>
        <div className="flex gap-2 flex-wrap">
          {(['auto', 'on', 'off'] as const).map(m => <button key={m} style={opt(tvMode === m)} onClick={() => setTvMode(m)}>{m === 'auto' ? 'Automático' : m === 'on' ? 'Activado' : 'Desactivado'}</button>)}
        </div>
      </Card>
    </section>
  );
}

export function LanguageSection() {
  const { translateAuto, translateTo, setTranslate } = useSettingsStore();
  return (
    <section className="mb-8">
      <SLabel icon={Languages} label="Idioma y traducción" />
      <Card>
        <p style={title}>Tu idioma</p>
        <p style={help}>Se usa para traducir y para ordenar los enlaces de Cine y series (primero los que tienen audio o subtítulos en tu idioma).</p>
        <div className="grid gap-2 mb-5" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(110px,1fr))' }}>
          {availableLanguages().map(l => <button key={l.code} style={{ ...opt(translateTo === l.code), flex: undefined }} onClick={() => setTranslate(translateAuto, l.code)}>{l.name}</button>)}
        </div>
        <p style={title}>Traducir solo lo que esté en otro idioma</p>
        <p style={help}>La guía de programación de canales de otros países y las sinopsis y episodios de Cine y series se traducen al abrirlos (se ve un icono de traducción; al pasar el ratón por encima, el texto original). Los nombres de equipos y canales no se tocan.</p>
        <div className="flex gap-2 flex-wrap mb-3">
          <button style={opt(translateAuto)} onClick={() => setTranslate(true)}>Traducir automáticamente</button>
          <button style={opt(!translateAuto)} onClick={() => setTranslate(false)}>No traducir</button>
        </div>
        <p style={{ ...help, marginBottom: 0 }}>{Capacitor.isNativePlatform() ? 'Se traduce dentro del móvil con Google ML Kit (los paquetes sin conexión de Google Traductor).' : 'Se traduce dentro del equipo con el motor de Firefox Translations.'} Es gratis, sin cuenta y privado: el texto no sale del dispositivo. La primera vez que hace falta un idioma se descarga su paquete (unos 20–30 MB) y después funciona sin internet.</p>
      </Card>
    </section>
  );
}

export function TeamsSection() {
  const { favTeams, setFavTeams, reminderLead, setReminderLead } = useSettingsStore();
  const [text, setText] = useState('');
  const add = () => {
    const names = text.split(',').map(t => t.trim()).filter(Boolean);
    if (!names.length) return;
    setFavTeams([...new Set([...favTeams, ...names])]);
    setText('');
  };
  return (
    <section className="mb-8">
      <SLabel icon={Star} label="Mis equipos y avisos" />
      <Card>
        <p style={title}>Equipos o competiciones favoritos</p>
        <p style={help}>Sus partidos salen con una estrella en Eventos y en la portada aparece «Hoy en tus equipos». Escribe el nombre como sale en la agenda (por ejemplo «Real Madrid», «Barcelona», «Fórmula 1»).</p>
        <div className="flex gap-2 mb-3">
          <input value={text} onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} placeholder="Real Madrid, Barcelona…"
            style={{ flex: 1, minWidth: 0, padding: '9px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }} />
          <button style={{ ...opt(false), flex: '0 0 auto' }} onClick={add}>Añadir</button>
        </div>
        <div className="flex gap-2 flex-wrap mb-5">
          {favTeams.length === 0 && <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Todavía no has añadido ninguno.</span>}
          {favTeams.map(t => (
            <span key={t} className="flex items-center gap-1.5" style={{ padding: '5px 8px 5px 12px', background: 'var(--accent-dim)', border: '1px solid var(--accent)', borderRadius: 100, color: 'var(--accent)', fontSize: '0.76rem' }}>
              {t}<button aria-label={`Quitar ${t}`} onClick={() => setFavTeams(favTeams.filter(x => x !== t))} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', display: 'flex' }}><X size={13} /></button>
            </span>
          ))}
        </div>
        <p style={title}>Avisarme antes de un evento</p>
        <p style={help}>{Capacitor.isNativePlatform() ? 'Marca la campana de un evento en Eventos y el móvil te avisa con esta antelación, aunque TOPOTV esté cerrado.' : 'Marca la campana de un evento en Eventos y Windows te avisa con esta antelación (con TOPOTV abierto, aunque esté minimizado).'}</p>
        <div className="flex gap-2 flex-wrap">
          {[5, 10, 15, 30].map(m => <button key={m} style={opt(reminderLead === m)} onClick={() => setReminderLead(m)}>{m} min</button>)}
        </div>
      </Card>
    </section>
  );
}

export function ChecksSection() {
  const { autoCheck, setAutoCheck, hideDead, setHideDead } = useSettingsStore();
  const streams = useHealthStore(s => s.streams);
  const clear = useHealthStore(s => s.clear);
  const all = Object.values(streams);
  const ok = all.filter(e => e.ok).length;
  return (
    <section className="mb-8">
      <SLabel icon={Activity} label="Enlaces caídos" />
      <Card>
        <p style={title}>Comprobar los enlaces en segundo plano</p>
        <p style={help}>Con el motor activo y sin estar viendo nada, TOPOTV prueba un enlace cada 20 segundos (primero tus favoritos). Los canales cuyos enlaces están todos caídos pasan al final y se ven apagados, y al abrir un canal se prueba antes el que funciona. Se aparta solo cuando ves algo o hay una grabación.</p>
        <div className="flex gap-2 flex-wrap mb-4">
          <button style={opt(autoCheck)} onClick={() => setAutoCheck(true)}>Activada</button>
          <button style={opt(!autoCheck)} onClick={() => setAutoCheck(false)}>Desactivada</button>
        </div>
        <p style={title}>Qué hacer con los canales caídos</p>
        <div className="flex gap-2 flex-wrap mb-4">
          <button style={opt(!hideDead)} onClick={() => setHideDead(false)}>Dejarlos al final</button>
          <button style={opt(hideDead)} onClick={() => setHideDead(true)}>Ocultarlos</button>
        </div>
        <p style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginBottom: 10 }}>{all.length ? `${all.length} enlaces comprobados: ${ok} funcionan y ${all.length - ok} están caídos.` : 'Todavía no se ha comprobado ningún enlace.'}</p>
        {all.length > 0 && <button style={opt(false)} onClick={clear}>Olvidar resultados</button>}
      </Card>
    </section>
  );
}

export function SystemSection() {
  const { autoUpdateCheck, setAutoUpdateCheck } = useSettingsStore();
  const [available, setAvailable] = useState<boolean | null>(null);
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState<number | null>(null);
  useEffect(() => { void systemAvailable().then(setAvailable); }, []);
  if (!available) return null;

  const search = async () => {
    setMsg('Buscando…');
    try { const i = await checkUpdate(); setInfo(i); setMsg(i.newer ? '' : `Tienes la última versión (${i.current}).`); }
    catch (e) { setMsg(`No se pudo comprobar: ${e instanceof Error ? e.message : e}`); }
  };
  const update = async () => {
    setMsg(''); setBusy(0);
    try {
      await startUpdate();
      for (let i = 0; i < 600; i++) {
        await new Promise(r => setTimeout(r, 1000));
        const p = await updateProgress();
        if (p.phase === 'error') throw new Error(p.error);
        setBusy(p.percent);
        if (p.phase === 'ready') {
          if (Capacitor.isNativePlatform()) { setBusy(null); setMsg('Confirma la instalación en el diálogo de Android.'); }
          return;
        }
      }
    } catch (e) { setBusy(null); setMsg(e instanceof Error ? e.message : String(e)); }
  };
  const copyDiag = async () => {
    setMsg('Preparando…');
    try { const t = await diagnostic(); try { await navigator.clipboard.writeText(t); setMsg('Diagnóstico copiado: pégalo en el chat o en un mensaje.'); } catch { window.prompt('Copia este diagnóstico:', t); setMsg(''); } }
    catch (e) { setMsg(`No se pudo preparar: ${e instanceof Error ? e.message : e}`); }
  };
  return (
    <section className="mb-8">
      <SLabel icon={Cpu} label={Capacitor.isNativePlatform() ? 'Actualizaciones y diagnóstico' : 'Sistema (Windows)'} />
      <Card>
        <p style={title}>Actualizaciones</p>
        <p style={help}>TOPOTV mira en GitHub si hay una versión nueva y, si quieres, la descarga y abre el instalador por ti.</p>
        <div className="flex gap-2 flex-wrap mb-3">
          <button style={opt(autoUpdateCheck)} onClick={() => setAutoUpdateCheck(true)}>Avisar de versiones nuevas</button>
          <button style={opt(!autoUpdateCheck)} onClick={() => setAutoUpdateCheck(false)}>No avisar</button>
        </div>
        <div className="flex gap-2 flex-wrap mb-3">
          <button style={opt(false)} onClick={search} disabled={busy !== null}>Buscar actualizaciones</button>
          {info?.newer && <button style={{ ...opt(true), fontWeight: 700 }} onClick={update} disabled={busy !== null}>{busy === null ? `Instalar la ${info.latest}` : busy >= 100 ? 'Abriendo instalador…' : `Descargando ${busy}%`}</button>}
        </div>
        <p style={title}>Si algo falla</p>
        <p style={help}>Copia el diagnóstico (versión, servicios y últimas líneas del registro) para enviarlo, o abre el archivo de registro.</p>
        <div className="flex gap-2 flex-wrap">
          <button style={opt(false)} onClick={copyDiag}>Copiar diagnóstico</button>
          {!Capacitor.isNativePlatform() && <button style={opt(false)} onClick={() => void openLog()}>Abrir el registro</button>}
        </div>
        {msg && <p role="status" style={{ marginTop: 10, fontSize: '0.74rem', color: 'var(--text-secondary)' }}>{msg}</p>}
      </Card>
    </section>
  );
}

export function BackupSection() {
  const native = Capacitor.isNativePlatform();
  const [msg, setMsg] = useState('');
  const [pasted, setPasted] = useState('');
  const doRestore = (text: string) => {
    try { const n = restoreBackup(text); setMsg(`Copia restaurada (${n} apartados). Recargando…`); setTimeout(() => location.reload(), 900); }
    catch (err) { setMsg(err instanceof Error ? err.message : String(err)); }
  };
  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f) return;
    try {
      const n = restoreBackup(await f.text());
      setMsg(`Copia restaurada (${n} apartados). Recargando…`);
      setTimeout(() => location.reload(), 900);
    } catch (err) { setMsg(err instanceof Error ? err.message : String(err)); }
  };
  return (
    <section className="mb-8">
      <SLabel icon={Archive} label="Copia de seguridad" />
      <Card>
        <p style={help}>Guarda en un archivo tus favoritos, historial, ajustes, equipos y avisos, para no perderlos al reinstalar o cambiar de equipo. Las grabaciones programadas y los vídeos grabados no van en la copia. Ojo: incluye las direcciones de tus addons, que pueden llevar claves personales; guárdala en un sitio privado y no la compartas.</p>
        {native ? (
          <>
            <p style={help}>En el móvil la copia se pasa por el portapapeles: pulsa «Copiar copia» y pégala en una nota o en un mensaje a ti mismo. Para restaurar, pega el texto aquí debajo.</p>
            <div className="flex gap-2 flex-wrap mb-3">
              <button style={opt(false)} onClick={async () => { try { await navigator.clipboard.writeText(buildBackup()); setMsg('Copia en el portapapeles. Pégala en un sitio seguro.'); } catch { setMsg('No se pudo copiar al portapapeles.'); } }}>Copiar copia</button>
            </div>
            <textarea value={pasted} onChange={e => setPasted(e.target.value)} placeholder="Pega aquí la copia para restaurarla" rows={3} style={{ width: '100%', padding: '9px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontSize: '0.78rem', fontFamily: 'DM Mono, monospace', marginBottom: 8 }} />
            <button style={opt(false)} onClick={() => doRestore(pasted)} disabled={!pasted.trim()}>Restaurar copia pegada</button>
          </>
        ) : (
        <div className="flex gap-2 flex-wrap">
          <button style={opt(false)} onClick={() => { downloadBackup(); setMsg('Copia guardada en tu carpeta de Descargas.'); }}>Guardar copia</button>
          <label style={{ ...opt(false), display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Restaurar copia
            <input type="file" accept="application/json,.json" onChange={onFile} style={{ display: 'none' }} />
          </label>
        </div>
        )}
        {msg && <p role="status" style={{ marginTop: 10, fontSize: '0.74rem', color: 'var(--text-secondary)' }}>{msg}</p>}
      </Card>
    </section>
  );
}

export function AddonsSection() {
  const { addons, install, remove, toggle } = useAddonsStore();
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const add = async () => {
    if (!url.trim()) return;
    setBusy(true); setMsg('');
    try { const a = await install(url); setMsg(`Instalado: ${a.manifest.name}`); setUrl(''); }
    catch (e) { setMsg(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };
  const kinds = (a: (typeof addons)[number]) => a.manifest.resources.map(r => typeof r === 'string' ? r : r.name).filter((v, i, arr) => arr.indexOf(v) === i).join(', ');
  return (
    <section className="mb-8">
      <SLabel icon={Puzzle} label="Addons de Stremio" />
      <Card>
        <p style={help}>Los addons añaden catálogos de películas, series y canales (pestaña «Cine y series») y enlaces para verlos. TOPOTV solo lleva de serie el catálogo oficial (Cinemeta: listas y fichas, sin ningún enlace); los addons de enlaces los pones tú, y no recomienda ninguno: pega la dirección del que quieras usar (acaba en <code>manifest.json</code>, o empieza por <code>stremio://</code>). Usa solo fuentes propias o autorizadas. Los enlaces directos funcionan en Windows y Android; los torrents solo en Windows, con el motor de torrents integrado.</p>
        <div className="flex gap-2 mb-3">
          <input value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && void add()} placeholder="https://…/manifest.json" aria-label="Dirección del addon"
            style={{ flex: 1, minWidth: 0, padding: '9px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontSize: '0.82rem', outline: 'none' }} />
          <button style={{ ...opt(false), flex: '0 0 auto' }} onClick={() => void add()} disabled={busy}>{busy ? 'Instalando…' : 'Instalar'}</button>
        </div>
        {msg && <p role="status" style={{ fontSize: '0.74rem', color: 'var(--text-secondary)', marginBottom: 10 }}>{msg}</p>}
        {addons.length === 0 && <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>Todavía no has instalado ningún addon.</p>}
        <div className="flex flex-col gap-2">
          {addons.map(a => (
            <div key={a.base} className="flex items-center gap-3" style={{ padding: '10px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', opacity: a.enabled ? 1 : 0.55 }}>
              {a.manifest.logo ? <img src={a.manifest.logo} alt="" width={32} height={32} style={{ borderRadius: 6, objectFit: 'contain', flexShrink: 0 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} /> : null}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: '0.82rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.manifest.name} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>{a.manifest.version ? `v${a.manifest.version}` : ''}</span>{a.builtin && <span style={{ marginLeft: 8, fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--accent)' }}>Incluido</span>}</p>
                <p style={{ fontSize: '0.66rem', color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{kinds(a)} · {(a.manifest.types ?? []).join(', ')}</p>
              </div>
              <button onClick={() => toggle(a.base)} style={{ ...opt(a.enabled), flex: '0 0 auto', minHeight: 36, padding: '4px 12px' }}>{a.enabled ? 'Activo' : 'Apagado'}</button>
              {!a.builtin && <button onClick={() => remove(a.base)} aria-label={`Quitar ${a.manifest.name}`} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={16} /></button>}
            </div>
          ))}
        </div>
      </Card>
    </section>
  );
}

export function ProfilesSection() {
  const { profiles, activeId, add, remove, setPin } = useProfileStore();
  const [name, setName] = useState('');
  const [pinFor, setPinFor] = useState<string | null>(null);
  const [pin, setPinText] = useState('');
  const savePin = async () => { if (pinFor) { await setPin(pinFor, pin.length >= 4 ? pin : null); setPinFor(null); setPinText(''); } };
  return (
    <section className="mb-8">
      <SLabel icon={Users} label="Perfiles" />
      <Card>
        <p style={help}>Cada perfil tiene sus propios favoritos, historial, avisos, progreso y addons (un perfil sin addons no ve «Cine y series»). Los demás ajustes son comunes. Un PIN de 4 a 8 cifras protege entrar en un perfil; frena a los niños, pero no es una caja fuerte. Con más de un perfil aparece un círculo con tu inicial arriba para cambiar.</p>
        <div className="flex gap-2 mb-3">
          <input value={name} onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { add(name); setName(''); } }} placeholder="Nombre del perfil" aria-label="Nombre del perfil"
            style={{ flex: 1, minWidth: 0, padding: '9px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontSize: '0.85rem', outline: 'none' }} />
          <button style={{ ...opt(false), flex: '0 0 auto' }} onClick={() => { add(name); setName(''); }}>Crear</button>
        </div>
        <div className="flex flex-col gap-2">
          {profiles.map(p => (
            <div key={p.id} style={{ padding: '10px 12px', background: 'var(--bg-elevated)', border: `1px solid ${p.id === activeId ? 'var(--accent)' : 'var(--border-subtle)'}`, borderRadius: 'var(--radius-md)' }}>
              <div className="flex items-center gap-3">
                <span style={{ width: 28, height: 28, borderRadius: '50%', background: p.color, color: '#080a0e', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.78rem' }}>{p.name[0]?.toUpperCase()}</span>
                <span style={{ flex: 1, fontSize: '0.84rem', fontWeight: 600 }}>{p.name}{p.id === activeId && <span style={{ color: 'var(--accent)', fontWeight: 400, fontSize: '0.7rem' }}> · en uso</span>}</span>
                {p.pinHash && <Lock size={13} style={{ color: 'var(--text-muted)' }} />}
                <button onClick={() => { setPinFor(pinFor === p.id ? null : p.id); setPinText(''); }} style={{ ...opt(false), flex: '0 0 auto', minHeight: 34, padding: '4px 12px' }}>{p.pinHash ? 'Cambiar PIN' : 'Poner PIN'}</button>
                {p.id !== activeId && profiles.length > 1 && <button onClick={() => remove(p.id)} aria-label={`Borrar ${p.name}`} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}><X size={16} /></button>}
              </div>
              {pinFor === p.id && (
                <div className="flex gap-2" style={{ marginTop: 10 }}>
                  <input type="password" inputMode="numeric" value={pin} onChange={e => setPinText(e.target.value.replace(/\D/g, '').slice(0, 8))} placeholder="4 a 8 cifras (vacío = quitar PIN)" aria-label="PIN"
                    style={{ flex: 1, minWidth: 0, padding: '8px 10px', background: 'var(--bg-card)', border: '1px solid var(--border-mid)', borderRadius: 'var(--radius-md)', color: 'var(--text-primary)', fontSize: '0.8rem' }} />
                  <button onClick={() => void savePin()} style={{ ...opt(true), flex: '0 0 auto', minHeight: 36 }}>Guardar</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>
    </section>
  );
}
