import { useState, useRef, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Server, ShieldCheck, Upload, RotateCcw, Check, AlertTriangle, Tv2, RefreshCw, Wifi, Monitor, Share2, Smartphone, HelpCircle, Zap, Palette, Languages, ListVideo, Bell, Film, Users, Cpu, ChevronRight, ChevronLeft } from 'lucide-react';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useM3UStore } from '@/store/useM3UStore';
import { useUIStore } from '@/store/useUIStore';
import { warpDown, warpState, warpUp } from '@/lib/warpAndroid';
import { epgKnownIds, epgSourceUrls } from '@/lib/epg';
import { ENGINE_DOCS_URL, findEngineApp, installEngine, installEngineFromFile, openEngineAppSettings, startEngineApp, type EngineApp } from '@/lib/engineAndroid';
import { allSources } from '@/lib/ciriaco';
import { folderInfo, openListsFolder, type FolderInfo } from '@/lib/folderLists';
import { getLocalLists, removeLocalList } from '@/lib/localLists';
import { useEPGStore } from '@/store/useEPGStore';
import { AddonsSection, AppearanceSection, BackupSection, LanguageSection, ProfilesSection, ChecksSection, SystemSection, TeamsSection, RewindSection, TorrentLinksSection } from '@/pages/SettingsExtras';
import { shareStatus, tunnelStart, tunnelStop, shareRevoke, type ShareStatus } from '@/lib/share';

const inp: React.CSSProperties = { padding:'9px 12px',background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:'var(--radius-md)',color:'var(--text-primary)',fontSize:'0.85rem',fontFamily:'DM Mono,monospace',outline:'none',width:'100%' };
const focus = (e: React.FocusEvent<HTMLInputElement>) => (e.target.style.borderColor='var(--border-accent)');
const blur  = (e: React.FocusEvent<HTMLInputElement>) => (e.target.style.borderColor='var(--border-subtle)');

function Card({children}:{children:React.ReactNode}) {
  return <div style={{background:'var(--bg-card)',border:'1px solid var(--border-subtle)',borderRadius:'var(--radius-lg)',padding:'20px'}}>{children}</div>;
}
function SLabel({icon:Icon,label}:{icon:React.ElementType;label:string}) {
  return <div className="slabel flex items-center gap-2 mb-4"><Icon size={16} strokeWidth={1.8} style={{color:'var(--text-muted)'}} /><h2 className="font-body" style={{fontSize:'0.75rem',color:'var(--text-muted)',letterSpacing:'0.1em',textTransform:'uppercase'}}>{label}</h2></div>;
}

function BackendSection() {
  const {backendConfig,backendStatus,setBackendConfig,checkBackend} = useSettingsStore();
  const [host,setHost] = useState(backendConfig.host);
  const [port,setPort] = useState(String(backendConfig.port));
  const [checking,setChecking] = useState(false);
  const [saved,setSaved] = useState(false);
  const sc={'online':'var(--online-green)','offline':'var(--offline-red)','unknown':'var(--text-muted)'}[backendStatus];
  const sl={'online':'Online','offline':'Offline','unknown':'Sin comprobar'}[backendStatus];
  return (
    <section className="mb-8">
      <SLabel icon={Server} label="Backend AceStream" />
      <Card>
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2"><span className={`status-dot ${backendStatus}`} /><span style={{fontSize:'0.85rem',color:sc,fontWeight:500}}>{sl}</span><span style={{fontSize:'0.75rem',color:'var(--text-muted)'}}>— {backendConfig.host}:{backendConfig.port}</span></div>
          <button onClick={async()=>{setChecking(true);await checkBackend();setChecking(false);}} disabled={checking} style={{background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:'var(--radius-md)',color:'var(--text-secondary)',fontSize:'0.75rem',padding:'6px 12px',cursor:'pointer',display:'flex',alignItems:'center',gap:'6px'}}>
            <RotateCcw size={12} strokeWidth={2} style={{animation:checking?'spin 0.8s linear infinite':'none'}} />{checking?'Comprobando...':'Comprobar'}
          </button>
        </div>
        <div className="flex gap-3 mb-4">
          <div className="flex-1"><label style={{fontSize:'0.7rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.06em',display:'block',marginBottom:'6px'}}>Host</label><input type="text" value={host} onChange={e=>setHost(e.target.value)} placeholder="127.0.0.1" style={inp} onFocus={focus} onBlur={blur} /></div>
          <div style={{width:'100px'}}><label style={{fontSize:'0.7rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.06em',display:'block',marginBottom:'6px'}}>Puerto</label><input type="number" value={port} onChange={e=>setPort(e.target.value)} placeholder="6878" style={inp} onFocus={focus} onBlur={blur} /></div>
        </div>
        <button onClick={()=>{setBackendConfig({host,port:parseInt(port)||6878});setSaved(true);setTimeout(()=>setSaved(false),2000);}} style={{padding:'9px 18px',background:saved?'rgba(34,197,94,0.15)':'var(--accent)',color:saved?'var(--online-green)':'#080a0e',border:saved?'1px solid rgba(34,197,94,0.3)':'none',borderRadius:'var(--radius-md)',fontSize:'0.78rem',fontWeight:700,letterSpacing:'0.06em',textTransform:'uppercase',cursor:'pointer',display:'flex',alignItems:'center',gap:'6px'}}>
          {saved&&<Check size={14} strokeWidth={2.5} />}{saved?'Guardado':'Guardar'}
        </button>
      </Card>
    </section>
  );
}

function PlayerSection() {
  const {preferredPlayer,setPreferredPlayer,playback,setPlayback} = useSettingsStore();
  const isNativeApp = Capacitor.isNativePlatform();
  const playerOptions = (isNativeApp ? ['native','vlc','browser'] : ['browser','vlc']) as readonly ('native'|'vlc'|'browser')[];
  const range = (label: string, value: number, min: number, max: number, step: number, unit: string, help: string, onChange: (value: number) => void) => (
    <label className="block" style={{marginBottom:14}}>
      <span className="flex items-center justify-between gap-3" style={{fontSize:'0.75rem',color:'var(--text-secondary)',marginBottom:5}}>
        <span>{label}</span><strong style={{color:'var(--accent)',fontVariantNumeric:'tabular-nums'}}>{value}{unit}</strong>
      </span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={e=>onChange(Number(e.target.value))}
        style={{width:'100%',accentColor:'var(--accent)',cursor:'pointer'}} />
      <span style={{fontSize:'0.66rem',color:'var(--text-muted)',lineHeight:1.4}}>{help}</span>
    </label>
  );
  return (
    <section className="mb-8">
      <SLabel icon={Monitor} label="Reproductor" />
      <Card>
        <p style={{fontSize:'0.8rem',color:'var(--text-secondary)',marginBottom:'16px',lineHeight:1.6}}>{isNativeApp?'«TOPOTV» usa el reproductor integrado: pantalla completa, imagen en imagen, audio y subtítulos, reanuda donde lo dejaste y, si un enlace falla, pasa al siguiente. VLC abre el stream en la app VLC for Android; «Navegador» lo reproduce en la propia pantalla. Para los canales de AceStream el motor debe estar instalado y activo.':'«Dentro de TOPOTV» reproduce en la propia app, con subtítulos y selección de audio; si un formato no se puede ver (MKV, algunos audios), se abre solo en VLC. «VLC» lo abre siempre en una ventana aparte.'}</p>
        <div className="flex gap-3 mb-4">
          {playerOptions.map(p=>(
            <button key={p} onClick={()=>setPreferredPlayer(p)} style={{flex:1,padding:'12px',background:preferredPlayer===p?'var(--accent-dim)':'var(--bg-elevated)',border:`1px solid ${preferredPlayer===p?'var(--accent)':'var(--border-mid)'}`,borderRadius:'var(--radius-md)',color:preferredPlayer===p?'var(--accent)':'var(--text-secondary)',cursor:'pointer',textAlign:'center',transition:'all 0.15s'}}>
              <div style={{fontSize:'1.2rem',marginBottom:'4px'}}>{p==='native'?'🦫':p==='vlc'?'🎬':'🌐'}</div>
              <div style={{fontSize:'0.78rem',fontWeight:600}}>{p==='native'?'TOPOTV':p==='vlc'?'VLC':isNativeApp?'Navegador':'Dentro de TOPOTV'}</div>
              <div style={{fontSize:'0.65rem',color:'var(--text-muted)',marginTop:'2px'}}>{p==='native'?'Recomendado':p==='vlc'?(isNativeApp?'App externa':'Ventana aparte'):isNativeApp?'En la pantalla':'Recomendado'}</div>
            </button>
          ))}
        </div>
        {!isNativeApp&&<div style={{padding:'14px',background:'var(--bg-elevated)',borderRadius:'var(--radius-md)',border:'1px solid var(--border-subtle)',marginBottom:14}}>
          <p style={{fontSize:'0.74rem',fontWeight:600,marginBottom:12}}>VLC · buffers de red</p>
          {range('Buffer de red',playback.vlcNetworkCachingMs,1000,30000,500,` ms (${(playback.vlcNetworkCachingMs/1000).toFixed(1)} s)`,'Más buffer puede reducir cortes, pero aumenta el retardo. Se aplica al abrir el siguiente stream en VLC.',value=>setPlayback({vlcNetworkCachingMs:value}))}
          {range('Buffer de directo',playback.vlcLiveCachingMs,1000,30000,500,` ms (${(playback.vlcLiveCachingMs/1000).toFixed(1)} s)`,'Buffer específico para streams en directo de VLC.',value=>setPlayback({vlcLiveCachingMs:value}))}
        </div>}
        <div style={{padding:'14px',background:'var(--bg-elevated)',borderRadius:'var(--radius-md)',border:'1px solid var(--border-subtle)',marginBottom:14}}>
          <p style={{fontSize:'0.74rem',fontWeight:600,marginBottom:12}}>Navegador · directo HLS</p>
          {range('Retardo objetivo',playback.hlsLiveSyncDurationCount,1,10,1,' segmentos','Menos segmentos reduce el retardo; aumentarlo puede mejorar la estabilidad.',value=>setPlayback({hlsLiveSyncDurationCount:value}))}
          {range('Buffer máximo',playback.hlsMaxBufferLengthSec,10,120,5,' s','Límite aproximado de contenido HLS que se mantiene en buffer.',value=>setPlayback({hlsMaxBufferLengthSec:value}))}
          {range('Reintentos al cargar manifiesto',playback.hlsManifestLoadingMaxRetry,0,10,1,'','Más reintentos tolera fallos temporales de red.',value=>setPlayback({hlsManifestLoadingMaxRetry:value}))}
          {range('Reintentos al cargar segmentos',playback.hlsFragLoadingMaxRetry,0,10,1,'','Más reintentos puede recuperar cortes breves; también tarda más en declarar un error.',value=>setPlayback({hlsFragLoadingMaxRetry:value}))}
        </div>
        {!isNativeApp&&<div style={{padding:'10px 14px',background:'var(--bg-elevated)',borderRadius:'var(--radius-md)',border:'1px solid var(--border-subtle)'}}>
          <p style={{fontSize:'0.72rem',color:'var(--text-secondary)',fontWeight:600,marginBottom:'4px'}}>Requisito VLC:</p>
          <p style={{fontSize:'0.68rem',color:'var(--text-muted)',lineHeight:1.5}}>VLC debe estar en: <code style={{color:'var(--accent)',background:'rgba(0,0,0,0.3)',padding:'1px 5px',borderRadius:'3px'}}>C:\Program Files\VideoLAN\VLC\vlc.exe</code><br/>O define la variable de entorno <code style={{color:'var(--accent)'}}>VLC_PATH</code> antes de ejecutar setup.bat.</p>
        </div>}
      </Card>
    </section>
  );
}

function M3USection() {
  const {loadFromFile,loadFromUrls,reloadSources,reset,meta,allChannels,isLoading,error} = useM3UStore();
  const [locals,setLocals] = useState(getLocalLists);
  const [folder,setFolder] = useState<FolderInfo|null>(null);
  useEffect(() => { void folderInfo().then(setFolder); }, [allChannels.length]);
  const {m3uSourceUrls,setM3uSourceUrls} = useSettingsStore();
  const [sourcesInput,setSourcesInput] = useState(m3uSourceUrls.join('\n'));
  const [sourceError,setSourceError] = useState<string|null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  async function saveAndLoadSources() {
    const urls = [...new Set(sourcesInput.split(/\r?\n/).map(url=>url.trim()).filter(Boolean))];
    const invalid = urls.find(url => {
      try { return !['http:', 'https:'].includes(new URL(url).protocol); }
      catch { return true; }
    });
    if (invalid) { setSourceError('Cada línea debe ser una URL HTTP o HTTPS válida.'); return; }
    setSourceError(null);
    setM3uSourceUrls(urls);
    const sources = await allSources(urls);
    if (sources.length) await loadFromUrls(sources);
  }
  return (
    <section className="mb-8">
      <SLabel icon={Upload} label="Lista M3U" />
      <Card>
        {meta&&<div style={{padding:'10px 14px',background:'var(--bg-elevated)',borderRadius:'var(--radius-md)',border:'1px solid var(--border-subtle)',marginBottom:'16px'}}><div className="flex items-center gap-2 mb-1"><Check size={14} style={{color:'var(--online-green)'}} strokeWidth={2.5} /><span style={{fontSize:'0.78rem',color:'var(--online-green)',fontWeight:600}}>Lista cargada</span></div><p style={{fontSize:'0.72rem',color:'var(--text-muted)'}}>{allChannels.length} canales · {allChannels.reduce((n,c)=>n+c.streams.length,0)} enlaces</p>{!!meta.duplicates?.links&&<p style={{fontSize:'0.72rem',color:'var(--accent)',marginTop:4}}>{meta.duplicates.links} {meta.duplicates.links===1?'enlace repetido':'enlaces repetidos'} (mismo ID de AceStream que otra lista) no se han añadido{meta.duplicates.channels?` · ${meta.duplicates.channels} ${meta.duplicates.channels===1?'canal ya lo tenías':'canales ya los tenías'}`:''}.</p>}</div>}
        <div className="flex flex-col gap-4">
          {folder&&<div>
            <p style={{fontSize:'0.72rem',color:'var(--text-muted)',marginBottom:'8px',textTransform:'uppercase',letterSpacing:'0.04em'}}>Carpeta de listas</p>
            <p style={{fontSize:'0.68rem',color:'var(--text-muted)',lineHeight:1.5,marginBottom:8}}>Las listas .m3u que dejes en esta carpeta se cargan solas cada vez que TOPOTV actualiza. Si renuevas tu lista, sustituye el archivo y pulsa «Actualizar» en Eventos.</p>
            <code style={{display:'block',fontSize:'0.7rem',color:'var(--text-secondary)',background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:'var(--radius-md)',padding:'8px 10px',marginBottom:8,wordBreak:'break-all'}}>{folder.dir}</code>
            <div className="flex gap-2 flex-wrap items-center">
              <button onClick={()=>void openListsFolder()} style={{padding:'9px 16px',background:'var(--bg-elevated)',color:'var(--text-secondary)',border:'1px solid var(--border-mid)',borderRadius:'var(--radius-md)',fontSize:'0.78rem',fontWeight:600,cursor:'pointer'}}>Abrir la carpeta</button>
              <button onClick={()=>void reloadSources().then(()=>folderInfo().then(setFolder))} disabled={isLoading} style={{padding:'9px 16px',background:'var(--bg-elevated)',color:'var(--text-secondary)',border:'1px solid var(--border-mid)',borderRadius:'var(--radius-md)',fontSize:'0.78rem',fontWeight:600,cursor:isLoading?'wait':'pointer'}}>{isLoading?'Cargando…':'Volver a leerla'}</button>
              <span style={{fontSize:'0.7rem',color:folder.files.length?'var(--online-green)':'var(--text-muted)'}}>{folder.files.length?`${folder.files.length} ${folder.files.length===1?'lista':'listas'}: ${folder.files.map(f=>f.name).join(', ')}`:'Todavía no hay ninguna lista'}</span>
            </div>
          </div>}
          <div>
            <p style={{fontSize:'0.72rem',color:'var(--text-muted)',marginBottom:'8px',textTransform:'uppercase',letterSpacing:'0.04em'}}>Desde archivo</p>
            <button onClick={()=>fileRef.current?.click()} disabled={isLoading} style={{padding:'9px 18px',background:'var(--bg-elevated)',color:'var(--text-secondary)',border:'1px solid var(--border-mid)',borderRadius:'var(--radius-md)',fontSize:'0.78rem',fontWeight:600,cursor:isLoading?'not-allowed':'pointer',display:'flex',alignItems:'center',gap:'6px'}} onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--border-accent)';e.currentTarget.style.color='var(--text-primary)';}} onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border-mid)';e.currentTarget.style.color='var(--text-secondary)';}}>
              <Upload size={14} strokeWidth={2} />{isLoading?'Cargando...':'Seleccionar .m3u'}
            </button>
            <input ref={fileRef} type="file" accept=".m3u,.m3u8,.txt" className="hidden" onChange={async e=>{const f=e.target.files?.[0];if(f)await loadFromFile(f);e.target.value='';setLocals(getLocalLists());}} />
            <p style={{fontSize:'0.68rem',color:'var(--text-muted)',marginTop:8,lineHeight:1.5}}>El archivo se guarda en este dispositivo y se recarga solo junto con las demás fuentes. Si lo actualizas, cárgalo otra vez: sustituye al anterior con el mismo nombre.</p>
            {locals.length>0&&<div className="flex flex-col gap-2" style={{marginTop:10}}>
              {locals.map(l=>(
                <div key={l.id} className="flex items-center gap-3" style={{padding:'8px 12px',background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:'var(--radius-md)'}}>
                  <ListVideo size={15} style={{color:'var(--accent)',flexShrink:0}} />
                  <span className="flex-1 min-w-0"><strong style={{display:'block',fontSize:'0.78rem',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{l.name}</strong><span style={{fontSize:'0.66rem',color:'var(--text-muted)'}}>{l.channels} canales · guardada {new Date(l.addedAt).toLocaleDateString('es-ES',{day:'numeric',month:'short'})}</span></span>
                  <button onClick={()=>{removeLocalList(l.id);setLocals(getLocalLists());void reloadSources();}} style={{padding:'6px 12px',background:'none',border:'1px solid var(--border-mid)',borderRadius:'var(--radius-md)',color:'var(--text-secondary)',fontSize:'0.72rem',cursor:'pointer'}}>Quitar</button>
                </div>
              ))}
            </div>}
          </div>
          <div>
            <p style={{fontSize:'0.72rem',color:'var(--text-muted)',marginBottom:'8px',textTransform:'uppercase',letterSpacing:'0.04em'}}>Fuentes automáticas</p>
            <textarea value={sourcesInput} onChange={e=>setSourcesInput(e.target.value)} rows={4} placeholder="Pega una URL M3U por línea" style={{...inp,resize:'vertical',minHeight:96,fontFamily:'DM Mono,monospace'}} />
            <p style={{fontSize:'0.68rem',color:'var(--text-muted)',marginTop:8,lineHeight:1.5}}>
              La agenda de Ciriaco (y la TDT, si la tienes activada) se carga siempre; tus listas, de archivo o de enlace, se fusionan con ella por categorías.
              {' '}Las fuentes se guardan en este dispositivo, se combinan y actualizan al iniciar; si una lista cambia, TOPOTV te avisa en Inicio de los canales nuevos.
            </p>
            {(sourceError||error)&&<p role="alert" style={{color:'var(--offline-red)',fontSize:'0.72rem',marginTop:8}}>{sourceError||error}</p>}
            <button onClick={()=>void saveAndLoadSources()} disabled={isLoading} style={{marginTop:10,padding:'9px 16px',background:'var(--accent)',color:'#080a0e',border:'none',borderRadius:'var(--radius-md)',fontSize:'0.78rem',fontWeight:700,cursor:isLoading?'wait':'pointer',display:'flex',alignItems:'center',gap:7}}>
              <RefreshCw size={13} style={{animation:isLoading?'spin 0.8s linear infinite':'none'}} />{isLoading?'Cargando fuentes…':'Guardar y cargar fuentes'}
            </button>
          </div>
          {allChannels.length>0&&<div style={{borderTop:'1px solid var(--border-subtle)',paddingTop:'14px'}}><button onClick={reset} style={{background:'none',border:'none',color:'var(--text-muted)',fontSize:'0.75rem',cursor:'pointer',padding:0,display:'flex',alignItems:'center',gap:'6px'}} onMouseEnter={e=>(e.currentTarget.style.color='var(--offline-red)')} onMouseLeave={e=>(e.currentTarget.style.color='var(--text-muted)')}><AlertTriangle size={13} strokeWidth={1.8} />Limpiar lista</button></div>}
        </div>
      </Card>
    </section>
  );
}

/** Cuántos canales tienen guía y cuáles no (se comprueba una vez cargada la guía). */
function EPGCoverage() {
  const coverage = useEPGStore(s => s.coverage);
  const allChannels = useM3UStore(s => s.allChannels);
  const [open, setOpen] = useState(false);
  if (!coverage || !allChannels.length) return null;
  const without = allChannels.filter(c => coverage[c.id] === false);
  const withGuide = allChannels.length - without.length;
  return (
    <div style={{ padding: '10px 14px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', marginBottom: 16 }}>
      <p style={{ fontSize: '0.78rem', fontWeight: 600 }}>{withGuide} de {allChannels.length} canales tienen guía de programación</p>
      {without.length > 0 && <>
        <button onClick={() => setOpen(o => !o)} style={{ background: 'none', border: 'none', padding: 0, marginTop: 4, color: 'var(--accent)', fontSize: '0.72rem', cursor: 'pointer' }}>{open ? 'Ocultar' : 'Ver'} los {without.length} que no tienen guía de momento</button>
        {open && <p style={{ marginTop: 6, fontSize: '0.68rem', color: 'var(--text-muted)', lineHeight: 1.6, maxHeight: 220, overflowY: 'auto' }}>{without.map(c => c.name).join(' · ')}</p>}
      </>}
    </div>
  );
}

function EPGSection() {
  const {manualEpgUrl,setManualEpgUrl,mobileGuide,setMobileGuide} = useSettingsStore();
  const meta = useM3UStore(s=>s.meta);
  const {status:epgStatus,progress,load:loadEPG,reset:resetEPG,syncStatus} = useEPGStore();
  const allChannels = useM3UStore(s=>s.allChannels);
  const [inputUrl,setInputUrl] = useState(manualEpgUrl);
  const [saved,setSaved] = useState(false);
  const m3uEpgUrls = meta?.epgUrls??[];
  const sl: Record<string,string> = {idle:'Sin cargar',unavailable:'Servidor EPG no activo',loading:`Descargando... ${progress}%`,parsing:'Procesando XML...',ready:'Guía cargada',error:'Error al cargar'};
  const sc: Record<string,string> = {idle:'var(--text-muted)',unavailable:'var(--offline-red)',loading:'var(--accent)',parsing:'var(--accent)',ready:'var(--online-green)',error:'var(--offline-red)'};
  function handleSave() {
    setManualEpgUrl(inputUrl.trim());
    setSaved(true); setTimeout(()=>setSaved(false),2000);
    const urls=epgSourceUrls(m3uEpgUrls,inputUrl,allChannels);
    const knownIds=epgKnownIds(allChannels);
    resetEPG();setTimeout(()=>loadEPG(urls,knownIds),100);
  }
  return (
    <section className="mb-8">
      <SLabel icon={Tv2} label="Guía de Programación (EPG)" />
      <Card>
        <EPGCoverage />
        {Capacitor.isNativePlatform()&&<div style={{marginBottom:16}}>
          <p style={{fontSize:'0.72rem',color:'var(--text-muted)',marginBottom:8,textTransform:'uppercase',letterSpacing:'0.04em'}}>Guía en este móvil</p>
          <div className="flex gap-2 flex-wrap">
            {([['light','Ligera (recomendada)'],['full','Completa']] as const).map(([k,t])=><button key={k} onClick={()=>{setMobileGuide(k);const urls=epgSourceUrls(m3uEpgUrls,manualEpgUrl,allChannels);resetEPG();setTimeout(()=>loadEPG(urls,epgKnownIds(allChannels)),100);}} style={{flex:'1 1 140px',minHeight:40,padding:'8px 12px',cursor:'pointer',background:mobileGuide===k?'var(--accent-dim)':'var(--bg-elevated)',border:`1px solid ${mobileGuide===k?'var(--accent)':'var(--border-mid)'}`,borderRadius:'var(--radius-md)',color:mobileGuide===k?'var(--accent)':'var(--text-secondary)',fontSize:'0.78rem',fontWeight:mobileGuide===k?700:500}}>{t}</button>)}
          </div>
          <p style={{fontSize:'0.68rem',color:'var(--text-muted)',lineHeight:1.5,marginTop:6}}>{mobileGuide==='light'?'Solo la guía de España y la de los países de tus canales favoritos: se descarga y se lee mucho más rápido y gasta menos batería y datos.':'Todas las guías de tus listas (varios cientos de MB que leer): más lenta y puede fallar en móviles modestos.'}</p>
        </div>}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {(epgStatus==='loading'||epgStatus==='parsing')&&<div style={{width:'8px',height:'8px',borderRadius:'50%',border:'2px solid var(--accent)',borderTopColor:'transparent',animation:'spin 0.8s linear infinite'}} />}
            {epgStatus==='ready'&&<span className="status-dot online" />}
            {epgStatus==='error'&&<span className="status-dot offline" />}
            {(epgStatus==='idle'||epgStatus==='unavailable')&&<span className="status-dot unknown" />}
            <span style={{fontSize:'0.85rem',color:sc[epgStatus]??'var(--text-muted)',fontWeight:500}}>{sl[epgStatus]??epgStatus}</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={()=>syncStatus()} style={{background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:'var(--radius-md)',color:'var(--text-secondary)',fontSize:'0.7rem',padding:'5px 10px',cursor:'pointer',display:'flex',alignItems:'center',gap:'5px'}}><RefreshCw size={11} strokeWidth={2} />Sync</button>
            {(epgStatus==='ready'||epgStatus==='error')&&<button onClick={()=>{const urls=epgSourceUrls(m3uEpgUrls,manualEpgUrl,allChannels);const ids=epgKnownIds(allChannels);resetEPG();setTimeout(()=>loadEPG(urls,ids),100);}} style={{background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:'var(--radius-md)',color:'var(--text-secondary)',fontSize:'0.75rem',padding:'6px 12px',cursor:'pointer',display:'flex',alignItems:'center',gap:'6px'}}><RefreshCw size={12} strokeWidth={2} />Recargar</button>}
          </div>
        </div>
        {(epgStatus==='loading'||epgStatus==='parsing')&&<div style={{height:'3px',background:'var(--bg-elevated)',borderRadius:'2px',overflow:'hidden',marginBottom:'16px'}}><div style={{height:'100%',width:`${epgStatus==='parsing'?95:progress}%`,background:'var(--accent)',borderRadius:'2px',transition:'width 0.5s ease'}} /></div>}
        {m3uEpgUrls.length>0&&<div style={{marginBottom:'16px',padding:'10px 14px',background:'var(--bg-elevated)',borderRadius:'var(--radius-md)',border:'1px solid var(--border-subtle)'}}><p style={{fontSize:'0.7rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'6px'}}>URLs en el M3U</p>{m3uEpgUrls.map((url,i)=><p key={i} style={{fontSize:'0.68rem',color:'var(--text-secondary)',fontFamily:'DM Mono,monospace',wordBreak:'break-all',marginBottom:i<m3uEpgUrls.length-1?'4px':0}}>{url}</p>)}</div>}
        <div>
          <div className="flex items-center gap-2 mb-2"><Wifi size={13} strokeWidth={1.8} style={{color:'var(--text-muted)'}} /><label style={{fontSize:'0.7rem',color:'var(--text-muted)',letterSpacing:'0.06em',textTransform:'uppercase'}}>URL Manual (prioridad)</label></div>
          <div className="flex gap-2">
            <input type="url" value={inputUrl} onChange={e=>setInputUrl(e.target.value)} placeholder="https://ejemplo.com/guia.xml o .xml.gz" style={inp} onFocus={focus} onBlur={blur} onKeyDown={e=>e.key==='Enter'&&handleSave()} />
            <button onClick={handleSave} style={{padding:'9px 16px',background:saved?'rgba(34,197,94,0.15)':'var(--accent)',color:saved?'var(--online-green)':'#080a0e',border:saved?'1px solid rgba(34,197,94,0.3)':'none',borderRadius:'var(--radius-md)',fontSize:'0.78rem',fontWeight:700,cursor:'pointer',whiteSpace:'nowrap',display:'flex',alignItems:'center',gap:'6px'}}>
              {saved&&<Check size={14} strokeWidth={2.5} />}{saved?'Guardado':'Guardar'}
            </button>
          </div>
          <p style={{fontSize:'0.68rem',color:'var(--text-muted)',marginTop:'8px',lineHeight:1.5}}>El servidor EPG (tools/epg-server.cjs) descarga y parsea en Node.js. Soporta .xml y .xml.gz.</p>
        </div>
      </Card>
    </section>
  );
}

interface Deps { vlc: boolean; warp: boolean; aceInstalled: boolean; aceRunning: boolean; }
function DepsSection() {
  const [deps, setDeps] = useState<Deps | null | undefined>(undefined);
  const check = () => fetch('http://localhost:3002/deps', { signal: AbortSignal.timeout(4000) }).then(r => r.json()).then(setDeps).catch(() => setDeps(null));
  useEffect(() => { check(); }, []);
  const rows: { label: string; ok: boolean | undefined; hint: string }[] = [
    { label: 'Motor AceStream', ok: deps ? deps.aceRunning : undefined, hint: deps && !deps.aceRunning ? (deps.aceInstalled ? 'Instalado pero parado' : 'No instalado (acestream.org)') : '' },
    { label: 'VLC', ok: deps?.vlc, hint: 'videolan.org' },
    { label: 'Cloudflare WARP', ok: deps?.warp, hint: 'Opcional: solo para leer la agenda si tu operador la bloquea' },
  ];
  return (
    <section className="mb-8">
      <SLabel icon={ShieldCheck} label="Dependencias" />
      <Card>
        {deps === null && <p style={{fontSize:'0.78rem',color:'var(--text-muted)'}}>Servicio local no disponible (puerto 3002). Reinicia TOPOTV.</p>}
        {deps !== null && rows.map(r => (
          <div key={r.label} className="flex items-center justify-between" style={{padding:'8px 0',borderBottom:'1px solid var(--border-subtle)'}}>
            <span style={{fontSize:'0.85rem'}}>{r.label}</span>
            <span className="flex items-center gap-2" style={{fontSize:'0.72rem',color:r.ok===undefined?'var(--text-muted)':r.ok?'var(--online-green)':'var(--offline-red)'}}>
              <span className={`status-dot ${r.ok===undefined?'unknown':r.ok?'online':'offline'}`} />{r.ok===undefined?'Comprobando…':r.ok?'Listo':(r.hint||'No encontrado')}
            </span>
          </div>
        ))}
        <button onClick={()=>{setDeps(undefined);check();}} className="flex items-center gap-2" style={{marginTop:14,padding:'7px 14px',background:'var(--bg-elevated)',border:'1px solid var(--border-mid)',borderRadius:'100px',color:'var(--text-secondary)',fontSize:'0.75rem',cursor:'pointer'}}><RefreshCw size={13} />Comprobar</button>
      </Card>
    </section>
  );
}

const DL = 'https://download.acestream.media/products';
const ABIS: [string, string][] = [['ARM 64-bit (la mayoría)', 'armv8_64'], ['ARM 32-bit', 'armv7'], ['x86_64', 'x86_64'], ['x86', 'x86']];
const DEVICES: { title: string; hint: string; path: (abi: string) => string }[] = [
  { title: 'Móvil / tablet Android', hint: 'Ace Stream Engine (acestream-core)', path: a => `${DL}/android/acestream-core/${a}/latest` },
  { title: 'Android TV', hint: 'Ace Stream Engine para Android TV', path: a => `${DL}/android-tv/acestream-core/${a}/latest` },
  { title: 'Smart TV / Android (Media)', hint: 'Ace Stream Media, con reproductor propio', path: a => `${DL}/acestream-engine/android/${a}/latest` },
];
function DevicesSection() {
  const a = { color: 'var(--accent)', fontSize: '0.74rem', textDecoration: 'none', marginRight: 14 } as const;
  return (
    <section className="mb-8">
      <SLabel icon={Smartphone} label="Motor para móvil y TV" />
      <Card>
        <p style={{fontSize:'0.78rem',color:'var(--text-muted)',marginBottom:12}}>En Android el motor AceStream se instala como APK (descarga oficial). Después, en Backend usa la IP del dispositivo y el puerto 6878. Elige tu arquitectura (si dudas, ARM 64-bit).</p>
        {DEVICES.map(d => (
          <div key={d.title} style={{padding:'8px 0',borderBottom:'1px solid var(--border-subtle)'}}>
            <div style={{fontSize:'0.85rem'}}>{d.title} <span style={{fontSize:'0.68rem',color:'var(--text-muted)'}}>· {d.hint}</span></div>
            <div style={{marginTop:6}}>{ABIS.map(([l, abi]) => <a key={abi} href={d.path(abi)} target="_blank" rel="noreferrer" style={a}>{l}</a>)}</div>
          </div>
        ))}
      </Card>
    </section>
  );
}

function ShareSection() {
  const [st, setSt] = useState<ShareStatus | null | undefined>(undefined);
  const refresh = () => shareStatus().then(setSt).catch(() => setSt(null));
  useEffect(() => { refresh(); const t = setInterval(refresh, 4000); return () => clearInterval(t); }, []);
  const tun = st?.tunnel;
  const label = !tun ? '' : { off: 'Apagado', downloading: 'Descargando cloudflared…', starting: 'Abriendo túnel…', on: 'Activo', error: tun.error || 'Error' }[tun.state];
  const btn = { padding: '7px 14px', background: 'var(--bg-elevated)', border: '1px solid var(--border-mid)', borderRadius: '100px', color: 'var(--text-secondary)', fontSize: '0.75rem', cursor: 'pointer' } as const;
  return (
    <section className="mb-8">
      <SLabel icon={Share2} label="Compartir por enlace" />
      <Card>
        <p style={{fontSize:'0.78rem',color:'var(--text-muted)',marginBottom:12}}>Crea enlaces con el botón de compartir en Eventos. Quien los abra ve el canal en su navegador, usando el motor de este equipo. Caducan solos y puedes revocarlos.</p>
        {st === null && <p style={{fontSize:'0.78rem',color:'var(--offline-red)'}}>Servicio de enlaces no disponible (puerto 3006). Reinicia TOPOTV.</p>}
        {tun && (
          <div className="flex items-center justify-between" style={{padding:'8px 0',borderBottom:'1px solid var(--border-subtle)'}}>
            <span style={{fontSize:'0.85rem'}}>Túnel Cloudflare</span>
            <span className="flex items-center gap-2" style={{fontSize:'0.72rem',color:tun.state==='on'?'var(--online-green)':tun.state==='error'?'var(--offline-red)':'var(--text-muted)'}}>
              <span className={`status-dot ${tun.state==='on'?'online':tun.state==='error'?'offline':'unknown'}`} />{label}
            </span>
          </div>
        )}
        {st?.shares.map(s => (
          <div key={s.token} className="flex items-center justify-between gap-3" style={{padding:'8px 0',borderBottom:'1px solid var(--border-subtle)'}}>
            <div style={{minWidth:0}}>
              <div style={{fontSize:'0.82rem',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{s.name}</div>
              <div style={{fontSize:'0.68rem',color:'var(--text-muted)'}}>{s.viewers}/{s.maxViewers} viendo · caduca {new Date(s.expires).toLocaleTimeString('es-ES',{hour:'2-digit',minute:'2-digit'})}</div>
            </div>
            <div className="flex gap-2" style={{flexShrink:0}}>
              <button style={btn} disabled={!s.url} onClick={() => s.url && navigator.clipboard.writeText(s.url).catch(() => window.prompt('Enlace:', s.url!))}>Copiar</button>
              <button style={btn} onClick={() => shareRevoke(s.token).then(setSt)}>Revocar</button>
            </div>
          </div>
        ))}
        {st && !st.shares.length && <p style={{fontSize:'0.75rem',color:'var(--text-muted)',margin:'8px 0'}}>No hay enlaces activos.</p>}
        {tun && (
          <button style={{...btn,marginTop:14}} onClick={() => (tun.state === 'on' || tun.state === 'starting' ? tunnelStop() : tunnelStart()).then(setSt)}>
            {tun.state === 'on' || tun.state === 'starting' ? 'Apagar túnel' : 'Encender túnel'}
          </button>
        )}
      </Card>
    </section>
  );
}

function TdtSection() {
  const { includeTdt, setIncludeTdt } = useSettingsStore();
  const reloadSources = useM3UStore(s => s.reloadSources);
  const opt = (active: boolean) => ({ flex: '1 1 110px', minHeight: 44, padding: '8px 12px', cursor: 'pointer', background: active ? 'var(--accent-dim)' : 'var(--bg-elevated)', border: `1px solid ${active ? 'var(--accent)' : 'var(--border-mid)'}`, borderRadius: 'var(--radius-md)', color: active ? 'var(--accent)' : 'var(--text-secondary)', fontSize: '0.78rem', fontWeight: active ? 700 : 500 } as const);
  return (
    <section className="mb-8">
      <SLabel icon={Tv2} label="TDT en abierto" />
      <Card>
        <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 10 }}>RTVE (La 1, La 2, 24 Horas, Teledeporte, Clan) y televisiones autonómicas con emisión oficial gratuita. No necesitan el motor AceStream.</p>
        <div className="flex gap-2 flex-wrap">
          <button style={opt(includeTdt)} onClick={() => { setIncludeTdt(true); void reloadSources(); }}>Incluir</button>
          <button style={opt(!includeTdt)} onClick={() => { setIncludeTdt(false); void reloadSources(); }}>No incluir</button>
        </div>
      </Card>
    </section>
  );
}

function HelpSection() {
  const setOnboardingOpen = useUIStore(s => s.setOnboardingOpen);
  return (
    <section className="mb-8">
      <SLabel icon={HelpCircle} label="Ayuda" />
      <Card>
        <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 10 }}>La guía de bienvenida explica en un minuto lo principal de TOPOTV.</p>
        <button onClick={() => setOnboardingOpen(true)} style={{ minHeight: 44, padding: '8px 16px', cursor: 'pointer', background: 'var(--bg-elevated)', border: '1px solid var(--border-mid)', borderRadius: 'var(--radius-md)', color: 'var(--text-secondary)', fontSize: '0.78rem' }}>Ver la guía de uso otra vez</button>
      </Card>
    </section>
  );
}

function EngineAndroidSection() {
  const { backendConfig, backendStatus, checkBackend, engineAutoStart, setEngineAutoStart, engineApkUrl, engineApkToken, setEngineApk } = useSettingsStore();
  const [urlInput, setUrlInput] = useState(engineApkUrl);
  const [tokenInput, setTokenInput] = useState(engineApkToken);
  const [app, setApp] = useState<EngineApp | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [installing, setInstalling] = useState<number | null | 'idle'>('idle');
  useEffect(() => { void findEngineApp().then(setApp); void checkBackend(); }, [checkBackend]);
  // al volver de la instalación (o de los permisos) se vuelve a buscar el motor
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') void findEngineApp().then(setApp); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);
  async function installFromFile() {
    setMsg('');
    const r = await installEngineFromFile();
    if (r.needsPermission) setMsg('Activa «Permitir desde esta fuente» para TOPOTV en la pantalla que se ha abierto, vuelve y pulsa de nuevo.');
    else if (r.error) setMsg(r.error);
    else if (r.ok) setMsg('Confirma la instalación en el diálogo de Android. Al terminar vuelve a TOPOTV.');
  }
  async function install() {
    setMsg(''); setInstalling(null);
    const r = await installEngine(setInstalling);
    setInstalling('idle');
    if (r.needsPermission) setMsg('Activa «Permitir desde esta fuente» para TOPOTV en la pantalla que se ha abierto, vuelve y pulsa de nuevo.');
    else if (!r.ok) setMsg((r.error ?? 'No se pudo instalar.') + ' Puedes bajarlo a mano desde la web oficial.');
    else setMsg('Confirma la instalación en el diálogo de Android. Al terminar vuelve a TOPOTV.');
  }
  const online = backendStatus === 'online';
  const opt = (active: boolean) => ({ flex: '1 1 110px', minHeight: 44, padding: '8px 12px', cursor: 'pointer', background: active ? 'var(--accent-dim)' : 'var(--bg-elevated)', border: `1px solid ${active ? 'var(--accent)' : 'var(--border-mid)'}`, borderRadius: 'var(--radius-md)', color: active ? 'var(--accent)' : 'var(--text-secondary)', fontSize: '0.78rem', fontWeight: active ? 700 : 500 } as const);
  async function turnOn() {
    setBusy(true); setMsg('');
    const r = await startEngineApp(backendConfig);
    if (!r.ok && r.error) setMsg(r.error);
    await checkBackend(); setBusy(false);
  }
  return (
    <section className="mb-8">
      <SLabel icon={Server} label="Motor AceStream" />
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <span className={`status-dot ${backendStatus}`} />
          <strong style={{ fontSize: '0.85rem' }}>{online ? 'Motor en marcha' : backendStatus === 'offline' ? 'Motor apagado' : 'Comprobando…'}</strong>
          <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{app === undefined ? '' : app ? `· ${app.name}` : '· no hay ninguna app con motor instalada'}</span>
        </div>
        <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 12 }}>
          El motor AceStream va en su propia app. TOPOTV la instala por ti con un toque y la enciende sola cuando vas a ver un canal: con Ace Serve no hace falta abrirla ni pulsar START. La primera vez Android puede preguntar «Abrir con»: elige TOPOTV y «Siempre». Para apagarlo, Android solo deja cerrarlo desde la información de la app («Forzar detención»).
        </p>
        <div className="flex gap-2 flex-wrap mb-3">
          <button style={opt(false)} onClick={turnOn} disabled={busy || online || !app}>{busy ? 'Encendiendo…' : online ? 'Ya está encendido' : 'Encender motor'}</button>
          {app && <button style={opt(false)} onClick={() => openEngineAppSettings(app)}>Apagar (Ajustes de Android)</button>}
          {app === null && <button style={opt(false)} onClick={install} disabled={installing !== 'idle'}>{installing === 'idle' ? 'Instalar el motor (oficial)' : installing === null ? 'Descargando…' : `Descargando ${installing}%`}</button>}
          {app === null && <a href={ENGINE_DOCS_URL} target="_blank" rel="noopener noreferrer" style={{ ...opt(false), display: 'flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>Descargar a mano</a>}
        </div>
        <div className="flex gap-2 flex-wrap">
          <button style={opt(engineAutoStart)} onClick={() => setEngineAutoStart(true)}>Encender al abrir TOPOTV</button>
          <button style={opt(!engineAutoStart)} onClick={() => setEngineAutoStart(false)}>Solo al ver un canal</button>
        </div>
        <p style={{ fontSize: '0.74rem', fontWeight: 600, margin: '16px 0 6px' }}>Instalar el motor desde un archivo</p>
        <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 8 }}>Si ya tienes el APK en el móvil (por ejemplo, bajado de tu repositorio privado desde el navegador), elígelo aquí y TOPOTV lo instala. No hace falta ningún token.</p>
        <button style={opt(false)} onClick={installFromFile}>Elegir el APK del motor</button>
        <p style={{ fontSize: '0.74rem', fontWeight: 600, margin: '16px 0 6px' }}>Origen privado del instalador (opcional)</p>
        <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', lineHeight: 1.5, marginBottom: 8 }}>Pega un enlace https a tu copia del APK del motor (Dropbox, Google Drive, tu servidor o un archivo de una release privada de GitHub). Se guarda solo en este dispositivo y TOPOTV lo usa antes que cualquier otro origen. El token solo hace falta si el sitio lo exige.</p>
        <input type="url" value={urlInput} onChange={e => setUrlInput(e.target.value)} placeholder="https://…/motor.apk" style={{ ...inp, width: '100%', marginBottom: 8 }} />
        <input type="password" value={tokenInput} onChange={e => setTokenInput(e.target.value)} placeholder="Token (opcional)" style={{ ...inp, width: '100%', marginBottom: 8 }} />
        <div className="flex gap-2 flex-wrap">
          <button style={opt(false)} onClick={() => { setEngineApk(urlInput, tokenInput); setMsg(urlInput.trim() ? 'Enlace guardado.' : 'Enlace borrado: se usará el instalador incluido o el oficial.'); }}>Guardar enlace</button>
          {(engineApkUrl || urlInput.trim()) && <button style={opt(false)} onClick={install} disabled={installing !== 'idle'}>{installing === 'idle' ? 'Instalar ahora desde el enlace' : installing === null ? 'Descargando…' : `Descargando ${installing}%`}</button>}
        </div>
        {msg && <p role="alert" style={{ fontSize: '0.74rem', color: 'var(--offline-red)', marginTop: 8 }}>{msg}</p>}
      </Card>
    </section>
  );
}

function WarpAndroidSection() {
  const { warpAuto, setWarpAuto } = useSettingsStore();
  const [state, setState] = useState<'idle' | 'busy' | 'ok' | 'error'>('idle');
  const [msg, setMsg] = useState('');
  const opt = (active: boolean) => ({ flex: '1 1 110px', minHeight: 44, padding: '8px 12px', cursor: 'pointer', background: active ? 'var(--accent-dim)' : 'var(--bg-elevated)', border: `1px solid ${active ? 'var(--accent)' : 'var(--border-mid)'}`, borderRadius: 'var(--radius-md)', color: active ? 'var(--accent)' : 'var(--text-secondary)', fontSize: '0.78rem', fontWeight: active ? 700 : 500 } as const);
  async function test() {
    setState('busy'); setMsg('');
    const problem = await warpUp();
    if (problem) { setState('error'); setMsg(problem); return; }
    await new Promise(r => setTimeout(r, 2500));
    const st = await warpState();
    await warpDown();
    setState(st.connected ? 'ok' : 'error'); setMsg(st.connected ? 'WARP conectó correctamente y se apagó de nuevo.' : 'El túnel no llegó a conectar.');
  }
  return (
    <section className="mb-8">
      <SLabel icon={ShieldCheck} label="WARP (agenda de Eventos)" />
      <Card>
        <p style={{ fontSize: '0.74rem', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 12 }}>
          Ciriaco puede estar bloqueado en tu red. TOPOTV incluye su propio túnel Cloudflare WARP: se conecta solo al pulsar «Actualizar» en Eventos y se apaga al terminar. Solo pasa por él el tráfico de TOPOTV, así que la reproducción y el resto del móvil no se ven afectados. La primera vez Android pedirá permiso de VPN.
        </p>
        <div className="flex gap-2 flex-wrap mb-3">
          <button style={opt(warpAuto)} onClick={() => setWarpAuto(true)}>Automático</button>
          <button style={opt(!warpAuto)} onClick={() => setWarpAuto(false)}>Desactivado</button>
          <button style={opt(false)} onClick={test} disabled={state === 'busy'}>{state === 'busy' ? 'Probando…' : 'Probar conexión'}</button>
        </div>
        {msg && <p role="status" style={{ fontSize: '0.74rem', color: state === 'ok' ? 'var(--online-green)' : 'var(--offline-red)', marginBottom: 8 }}>{msg}</p>}
        <p style={{ fontSize: '0.68rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
          ¿Prefieres la app oficial? <a href="https://play.google.com/store/apps/details?id=com.cloudflare.onedotonedotonedotone" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>Descargar 1.1.1.1 + WARP</a>. Con ella el cambio es manual: actívala antes de actualizar y desactívala después. Desactiva el modo automático para no mezclarlas.
        </p>
      </Card>
    </section>
  );
}

/* ── Ajustes por categorías: una portada con tarjetas y cada categoría en su pantalla ── */
interface Cat { id: string; icon: React.ElementType; title: string; desc: string; color: string; body: () => React.ReactNode }
function categories(isNativeApp: boolean): Cat[] {
  const all: (Cat | false)[] = [
    { id: 'motor', icon: Zap, title: 'Motor y reproducción', desc: isNativeApp ? 'Motor AceStream, reproductor y buffers' : 'Programas necesarios, reproductor, rebobinado y motor', color: '#f5b84a',
      body: () => <>{isNativeApp ? <EngineAndroidSection /> : <DepsSection />}<PlayerSection />{!isNativeApp && <RewindSection />}<BackendSection /></> },
    { id: 'apariencia', icon: Palette, title: 'Apariencia', desc: 'Color, tamaño y tipo de letra, modo TV', color: '#c792ff', body: () => <AppearanceSection /> },
    { id: 'idioma', icon: Languages, title: 'Idioma y traducción', desc: 'Traducir la guía y las sinopsis a tu idioma', color: '#6ee7d8', body: () => <LanguageSection /> },
    { id: 'canales', icon: ListVideo, title: 'Canales y listas', desc: 'Tus listas, TDT, enlaces caídos y guía', color: '#5fb8ff',
      body: () => <><M3USection /><TdtSection /><ChecksSection /><EPGSection /></> },
    { id: 'eventos', icon: Bell, title: 'Eventos y avisos', desc: isNativeApp ? 'Tus equipos, avisos y WARP' : 'Tus equipos y avisos', color: '#ff7a7a',
      body: () => <><TeamsSection />{isNativeApp && <WarpAndroidSection />}</> },
    { id: 'cine', icon: Film, title: 'Cine y series', desc: 'Addons de Stremio y enlaces de torrent', color: '#5fd897', body: () => <><AddonsSection /><TorrentLinksSection /></> },
    { id: 'perfiles', icon: Users, title: 'Perfiles', desc: 'Uno por persona, con PIN opcional', color: '#ffa45c', body: () => <ProfilesSection /> },
    !isNativeApp && { id: 'compartir', icon: Share2, title: 'Compartir y otros equipos', desc: 'Enlaces para ver fuera de casa, móvil y TV', color: '#6ee7d8',
      body: () => <><ShareSection /><DevicesSection /></> },
    { id: 'sistema', icon: Cpu, title: 'Copia y sistema', desc: 'Actualizaciones, diagnóstico, copia de seguridad', color: '#9aa4b8',
      body: () => <><SystemSection /><BackupSection /><HelpSection /></> },
  ];
  return all.filter(Boolean) as Cat[];
}

function EngineStatusCard() {
  const backendStatus = useSettingsStore(s => s.backendStatus);
  const navigate = useNavigate();
  const online = backendStatus === 'online';
  return (
    <button onClick={() => navigate('/settings?s=motor')} className="w-full flex items-center gap-3 mb-5" style={{ padding: '14px 16px', borderRadius: 16, cursor: 'pointer', textAlign: 'left', background: online ? 'linear-gradient(135deg,rgba(34,197,94,0.14),rgba(34,197,94,0.03))' : 'linear-gradient(135deg,rgba(239,68,68,0.14),rgba(239,68,68,0.03))', border: `1px solid ${online ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)'}`, color: 'var(--text-primary)' }}>
      <span className={`status-dot ${backendStatus}`} style={{ width: 12, height: 12 }} />
      <span className="flex-1 min-w-0">
        <strong style={{ display: 'block', fontSize: '0.9rem' }}>{online ? 'Motor AceStream en marcha' : backendStatus === 'offline' ? 'Motor AceStream apagado' : 'Comprobando el motor…'}</strong>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>{online ? 'Listo para ver canales' : 'Se enciende solo al ver un canal. Toca para opciones.'}</span>
      </span>
      <ChevronRight size={18} style={{ color: 'var(--text-muted)' }} />
    </button>
  );
}

export function SettingsPage() {
  const isNativeApp = Capacitor.isNativePlatform();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const cats = categories(isNativeApp);
  const current = cats.find(c => c.id === params.get('s'));
  useEffect(() => { document.querySelector('main')?.scrollTo({ top: 0 }); }, [current?.id]);
  if (current) {
    const Icon = current.icon;
    return (
      <div className="settings-page page-center fade-in" style={{ padding: '24px', paddingBottom: '48px', maxWidth: '760px' }}>
        <button onClick={() => { if ((window.history.state?.idx ?? 0) > 0) navigate(-1); else navigate('/settings', { replace: true }); }} className="flex items-center gap-1 mb-4" style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontSize: '0.82rem', padding: '6px 0' }}>
          <ChevronLeft size={18} />Ajustes
        </button>
        <div className="flex items-center gap-3 mb-6">
          <span className="flex items-center justify-center" style={{ width: 44, height: 44, borderRadius: 14, background: `${current.color}22`, color: current.color }}><Icon size={22} /></span>
          <div><h1 className="font-display" style={{ fontSize: 'clamp(1.6rem,4vw,2.4rem)' }}>{current.title}</h1><p style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>{current.desc}</p></div>
        </div>
        <div className="settings-cat">{current.body()}</div>
      </div>
    );
  }
  return (
    <div className="settings-page page-center fade-in" style={{ padding: '24px', paddingBottom: '48px', maxWidth: '760px' }}>
      <h1 className="font-display mb-5" style={{ fontSize: 'clamp(1.8rem,4vw,2.8rem)' }}>Ajustes</h1>
      <EngineStatusCard />
      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(250px,1fr))' }}>
        {cats.map(c => {
          const Icon = c.icon;
          return (
            <button key={c.id} onClick={() => navigate(`/settings?s=${c.id}`)} className="surface-card flex items-center gap-3" style={{ padding: '14px', cursor: 'pointer', textAlign: 'left', color: 'var(--text-primary)' }}>
              <span className="flex items-center justify-center shrink-0" style={{ width: 42, height: 42, borderRadius: 13, background: `${c.color}1f`, color: c.color }}><Icon size={20} /></span>
              <span className="flex-1 min-w-0">
                <strong style={{ display: 'block', fontSize: '0.88rem' }}>{c.title}</strong>
                <span style={{ display: 'block', fontSize: '0.7rem', color: 'var(--text-muted)', lineHeight: 1.35 }}>{c.desc}</span>
              </span>
              <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
