import { useState, useRef, useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { Server, ShieldCheck, Upload, RotateCcw, Check, AlertTriangle, Tv2, RefreshCw, Wifi, Monitor, Share2, Smartphone } from 'lucide-react';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useM3UStore } from '@/store/useM3UStore';
import { CIRIACO_PLAYLIST_URL } from '@/lib/ciriaco';
import { useEPGStore } from '@/store/useEPGStore';
import { shareStatus, tunnelStart, tunnelStop, shareRevoke, type ShareStatus } from '@/lib/share';

const inp: React.CSSProperties = { padding:'9px 12px',background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:'var(--radius-md)',color:'var(--text-primary)',fontSize:'0.85rem',fontFamily:'DM Mono,monospace',outline:'none',width:'100%' };
const focus = (e: React.FocusEvent<HTMLInputElement>) => (e.target.style.borderColor='var(--border-accent)');
const blur  = (e: React.FocusEvent<HTMLInputElement>) => (e.target.style.borderColor='var(--border-subtle)');

function Card({children}:{children:React.ReactNode}) {
  return <div style={{background:'var(--bg-card)',border:'1px solid var(--border-subtle)',borderRadius:'var(--radius-lg)',padding:'20px'}}>{children}</div>;
}
function SLabel({icon:Icon,label}:{icon:React.ElementType;label:string}) {
  return <div className="flex items-center gap-2 mb-4"><Icon size={16} strokeWidth={1.8} style={{color:'var(--text-muted)'}} /><h2 className="font-body" style={{fontSize:'0.75rem',color:'var(--text-muted)',letterSpacing:'0.1em',textTransform:'uppercase'}}>{label}</h2></div>;
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
  const playerOptions = isNativeApp ? ['browser'] as const : ['vlc','browser'] as const;
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
        <p style={{fontSize:'0.8rem',color:'var(--text-secondary)',marginBottom:'16px',lineHeight:1.6}}>{isNativeApp?'En Android, TOPOTV reproduce el stream dentro de la app. El motor AceStream debe estar instalado y activo por separado en este dispositivo.':'VLC abre el stream en una ventana aparte (recomendado, más estable). "Navegador" lo reproduce dentro de TOPOTV y puede tardar más en arrancar.'}</p>
        <div className="flex gap-3 mb-4">
          {playerOptions.map(p=>(
            <button key={p} onClick={()=>setPreferredPlayer(p)} style={{flex:1,padding:'12px',background:preferredPlayer===p?'var(--accent-dim)':'var(--bg-elevated)',border:`1px solid ${preferredPlayer===p?'var(--accent)':'var(--border-mid)'}`,borderRadius:'var(--radius-md)',color:preferredPlayer===p?'var(--accent)':'var(--text-secondary)',cursor:'pointer',textAlign:'center',transition:'all 0.15s'}}>
              <div style={{fontSize:'1.2rem',marginBottom:'4px'}}>{p==='vlc'?'🎬':'🌐'}</div>
              <div style={{fontSize:'0.78rem',fontWeight:600}}>{p==='vlc'?'VLC':'Navegador'}</div>
              <div style={{fontSize:'0.65rem',color:'var(--text-muted)',marginTop:'2px'}}>{p==='vlc'?'Recomendado':'Reproductor integrado'}</div>
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
        <div style={{padding:'10px 14px',background:'var(--bg-elevated)',borderRadius:'var(--radius-md)',border:'1px solid var(--border-subtle)'}}>
          <p style={{fontSize:'0.72rem',color:'var(--text-secondary)',fontWeight:600,marginBottom:'4px'}}>Requisito VLC:</p>
          <p style={{fontSize:'0.68rem',color:'var(--text-muted)',lineHeight:1.5}}>VLC debe estar en: <code style={{color:'var(--accent)',background:'rgba(0,0,0,0.3)',padding:'1px 5px',borderRadius:'3px'}}>C:\Program Files\VideoLAN\VLC\vlc.exe</code><br/>O define la variable de entorno <code style={{color:'var(--accent)'}}>VLC_PATH</code> antes de ejecutar setup.bat.</p>
        </div>
      </Card>
    </section>
  );
}

function M3USection() {
  const {loadFromFile,loadFromUrls,reset,meta,allChannels,isLoading,error} = useM3UStore();
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
    const sources = [...new Set([CIRIACO_PLAYLIST_URL, ...urls])];
    if (sources.length) await loadFromUrls(sources);
  }
  return (
    <section className="mb-8">
      <SLabel icon={Upload} label="Lista M3U" />
      <Card>
        {meta&&<div style={{padding:'10px 14px',background:'var(--bg-elevated)',borderRadius:'var(--radius-md)',border:'1px solid var(--border-subtle)',marginBottom:'16px'}}><div className="flex items-center gap-2 mb-1"><Check size={14} style={{color:'var(--online-green)'}} strokeWidth={2.5} /><span style={{fontSize:'0.78rem',color:'var(--online-green)',fontWeight:600}}>Lista cargada</span></div><p style={{fontSize:'0.72rem',color:'var(--text-muted)'}}>{meta.source} · {allChannels.length} canales · {meta.epgUrls.length} URLs EPG</p></div>}
        <div className="flex flex-col gap-4">
          <div>
            <p style={{fontSize:'0.72rem',color:'var(--text-muted)',marginBottom:'8px',textTransform:'uppercase',letterSpacing:'0.04em'}}>Desde archivo</p>
            <button onClick={()=>fileRef.current?.click()} disabled={isLoading} style={{padding:'9px 18px',background:'var(--bg-elevated)',color:'var(--text-secondary)',border:'1px solid var(--border-mid)',borderRadius:'var(--radius-md)',fontSize:'0.78rem',fontWeight:600,cursor:isLoading?'not-allowed':'pointer',display:'flex',alignItems:'center',gap:'6px'}} onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--border-accent)';e.currentTarget.style.color='var(--text-primary)';}} onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border-mid)';e.currentTarget.style.color='var(--text-secondary)';}}>
              <Upload size={14} strokeWidth={2} />{isLoading?'Cargando...':'Seleccionar .m3u'}
            </button>
            <input ref={fileRef} type="file" accept=".m3u,.m3u8" className="hidden" onChange={async e=>{const f=e.target.files?.[0];if(f)await loadFromFile(f);e.target.value='';}} />
          </div>
          <div>
            <p style={{fontSize:'0.72rem',color:'var(--text-muted)',marginBottom:'8px',textTransform:'uppercase',letterSpacing:'0.04em'}}>Fuentes automáticas</p>
            <textarea value={sourcesInput} onChange={e=>setSourcesInput(e.target.value)} rows={4} placeholder="Pega una URL M3U por línea" style={{...inp,resize:'vertical',minHeight:96,fontFamily:'DM Mono,monospace'}} />
            <p style={{fontSize:'0.68rem',color:'var(--text-muted)',marginTop:8,lineHeight:1.5}}>
              La agenda de TOPOTV (Ciriaco) se añade automáticamente; estas URLs se combinan con ella.
              {' '}Las fuentes se guardan en este dispositivo, se combinan y actualizan al iniciar.
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

function EPGSection() {
  const {manualEpgUrl,setManualEpgUrl} = useSettingsStore();
  const meta = useM3UStore(s=>s.meta);
  const {status:epgStatus,progress,channelCount,load:loadEPG,reset:resetEPG,syncStatus} = useEPGStore();
  const allChannels = useM3UStore(s=>s.allChannels);
  const [inputUrl,setInputUrl] = useState(manualEpgUrl);
  const [saved,setSaved] = useState(false);
  const m3uEpgUrls = meta?.epgUrls??[];
  const sl: Record<string,string> = {idle:'Sin cargar',unavailable:'Servidor EPG no activo',loading:`Descargando... ${progress}%`,parsing:'Procesando XML...',ready:`${channelCount} canales con guía`,error:'Error al cargar'};
  const sc: Record<string,string> = {idle:'var(--text-muted)',unavailable:'var(--offline-red)',loading:'var(--accent)',parsing:'var(--accent)',ready:'var(--online-green)',error:'var(--offline-red)'};
  function handleSave() {
    setManualEpgUrl(inputUrl.trim());
    setSaved(true); setTimeout(()=>setSaved(false),2000);
    const urls=[...(inputUrl.trim()?[inputUrl.trim()]:[]),...m3uEpgUrls].filter(Boolean);
    const knownIds=allChannels.map(c=>c.tvgId).filter(Boolean);
    if(urls.length){resetEPG();setTimeout(()=>loadEPG(urls,knownIds),100);}
  }
  return (
    <section className="mb-8">
      <SLabel icon={Tv2} label="Guía de Programación (EPG)" />
      <Card>
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
            {(epgStatus==='ready'||epgStatus==='error')&&<button onClick={()=>{const urls=[...(manualEpgUrl.trim()?[manualEpgUrl.trim()]:[]),...m3uEpgUrls].filter(Boolean);const ids=allChannels.map(c=>c.tvgId).filter(Boolean);resetEPG();setTimeout(()=>loadEPG(urls,ids),100);}} style={{background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:'var(--radius-md)',color:'var(--text-secondary)',fontSize:'0.75rem',padding:'6px 12px',cursor:'pointer',display:'flex',alignItems:'center',gap:'6px'}}><RefreshCw size={12} strokeWidth={2} />Recargar</button>}
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

export function SettingsPage() {
  const isNativeApp = Capacitor.isNativePlatform();
  return (
    <div className="settings-page fade-in" style={{padding:'24px',paddingBottom:'48px',maxWidth:'640px'}}>
      <h1 className="font-display mb-8" style={{fontSize:'clamp(1.8rem,4vw,2.8rem)'}}>Ajustes</h1>
      {!isNativeApp&&<DepsSection />}
      {!isNativeApp&&<DevicesSection />}
      {!isNativeApp&&<ShareSection />}
      <BackendSection />
      <PlayerSection />
      <M3USection />
      <EPGSection />
    </div>
  );
}
