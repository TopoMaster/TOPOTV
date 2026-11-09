import { useEffect, useState } from 'react';
import { Palette, Star, Activity, Cpu, X, Archive } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { buildBackup, downloadBackup, restoreBackup } from '@/lib/backup';
import { useSettingsStore, type FontScale } from '@/store/useSettingsStore';
import { useHealthStore } from '@/store/useHealthStore';
import { checkUpdate, diagnostic, openLog, startUpdate, systemAvailable, updateProgress, type UpdateInfo } from '@/lib/system';

function Card({ children }: { children: React.ReactNode }) {
  return <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: 20 }}>{children}</div>;
}
function SLabel({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return <div className="flex items-center gap-2 mb-4"><Icon size={16} strokeWidth={1.8} style={{ color: 'var(--text-muted)' }} /><h2 className="font-body" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{label}</h2></div>;
}
const opt = (active: boolean) => ({ flex: '1 1 110px', minHeight: 44, padding: '8px 12px', cursor: 'pointer', background: active ? 'var(--accent-dim)' : 'var(--bg-elevated)', border: `1px solid ${active ? 'var(--accent)' : 'var(--border-mid)'}`, borderRadius: 'var(--radius-md)', color: active ? 'var(--accent)' : 'var(--text-secondary)', fontSize: '0.78rem', fontWeight: active ? 700 : 500 } as const);
const title = { fontSize: '0.78rem', fontWeight: 600, marginBottom: 6 } as const;
const help = { fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 10 } as const;

export function AppearanceSection() {
  const { theme, setTheme, fontScale, setFontScale } = useSettingsStore();
  const sizes: [FontScale, string][] = [['normal', 'Normal'], ['large', 'Grande'], ['xl', 'Muy grande']];
  return (
    <section className="mb-8">
      <SLabel icon={Palette} label="Apariencia" />
      <Card>
        <p style={title}>Tema</p>
        <div className="flex gap-2 flex-wrap mb-5">
          <button style={opt(theme === 'dark')} onClick={() => setTheme('dark')}>Oscuro</button>
          <button style={opt(theme === 'light')} onClick={() => setTheme('light')}>Claro</button>
        </div>
        <p style={title}>Tamaño de la interfaz</p>
        <p style={help}>Agranda textos y botones. «Muy grande» está pensado para verla desde el sofá.</p>
        <div className="flex gap-2 flex-wrap">
          {sizes.map(([v, l]) => <button key={v} style={opt(fontScale === v)} onClick={() => setFontScale(v)}>{l}</button>)}
        </div>
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
        <p style={help}>Marca la campana de un evento en Eventos y Windows te avisa con esta antelación (con TOPOTV abierto, aunque esté minimizado).</p>
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
        <p style={help}>Guarda en un archivo tus favoritos, historial, ajustes, equipos y avisos, para no perderlos al reinstalar o cambiar de equipo. Las grabaciones programadas y los vídeos grabados no van en la copia.</p>
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
