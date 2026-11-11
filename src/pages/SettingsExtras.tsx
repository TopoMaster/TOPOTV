import { useEffect, useState } from 'react';
import { Palette, Star, Activity, Cpu, X, Archive, Puzzle, Users, Lock } from 'lucide-react';
import { useAddonsStore } from '@/store/useAddonsStore';
import { useProfileStore } from '@/store/useProfileStore';
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
