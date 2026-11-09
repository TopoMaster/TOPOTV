import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Play, Check, X, Clock, Loader } from 'lucide-react';
import { useM3UStore } from '@/store/useM3UStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { streamPlayUrl } from '@/lib/aceApi';

type StreamStatus = 'pending'|'checking'|'online'|'offline'|'timeout';
interface CheckResult { channelId:string; channelName:string; streamLabel:string; aceId:string; url:string; status:StreamStatus; responseMs?:number; }
const SC: Record<StreamStatus,string> = {pending:'var(--text-muted)',checking:'var(--accent)',online:'var(--online-green)',offline:'var(--offline-red)',timeout:'#f59e0b'};
const SL: Record<StreamStatus,string> = {pending:'Pendiente',checking:'Comprobando...',online:'Online',offline:'Offline',timeout:'Timeout'};

async function checkStreamReal(url:string,timeoutMs:number):Promise<{status:StreamStatus;ms:number}> {
  const start=Date.now(); const ctrl=new AbortController(); const t=setTimeout(()=>ctrl.abort(),timeoutMs);
  try {
    const res=await fetch(url,{method:'GET',signal:ctrl.signal,headers:{'Range':'bytes=0-1023'}});
    clearTimeout(t); const ms=Date.now()-start;
    if(!res.ok&&res.status!==206) return {status:'offline',ms};
    const reader=res.body?.getReader();
    if(reader){const{value}=await reader.read();reader.cancel();if(!value||!value.length) return {status:'offline',ms:Date.now()-start};}
    return {status:'online',ms:Date.now()-start};
  } catch(e:any) {
    clearTimeout(t); const ms=Date.now()-start;
    return {status:ms>=timeoutMs-100?'timeout':'offline',ms};
  }
}

export function CheckerPage() {
  const navigate = useNavigate();
  const allChannels = useM3UStore(s=>s.allChannels);
  const groups = useM3UStore(s=>s.groups);
  const backendConfig = useSettingsStore(s=>s.backendConfig);
  const [results,setResults] = useState<CheckResult[]>([]);
  const [isRunning,setIsRunning] = useState(false);
  const [currentIdx,setCurrentIdx] = useState(0);
  const [selectedGroup,setSelectedGroup] = useState('all');
  const [checkMode,setCheckMode] = useState<'first'|'all'>('first');
  const [timeoutMs,setTimeoutMs] = useState(10000);
  const stopRef = useRef(false);
  const targets = selectedGroup==='all'?allChannels:allChannels.filter(c=>c.group===selectedGroup);
  function buildList():CheckResult[] {
    return targets.flatMap(ch=>(checkMode==='first'?ch.streams.slice(0,1):ch.streams).map(s=>({channelId:ch.id,channelName:ch.name,streamLabel:s.label,aceId:s.aceId,url:streamPlayUrl(s,backendConfig),status:'pending' as StreamStatus})));
  }
  async function runCheck() {
    stopRef.current=false; setIsRunning(true);
    const list=buildList(); setResults(list.map(r=>({...r,status:'pending'})));
    for(let i=0;i<list.length;i++){
      if(stopRef.current) break; setCurrentIdx(i);
      setResults(prev=>prev.map((r,idx)=>idx===i?{...r,status:'checking'}:r));
      const {status,ms}=await checkStreamReal(list[i].url,timeoutMs);
      setResults(prev=>prev.map((r,idx)=>idx===i?{...r,status,responseMs:ms}:r));
    }
    setIsRunning(false);
  }
  const online=results.filter(r=>r.status==='online').length;
  const offline=results.filter(r=>r.status==='offline').length;
  const timeout=results.filter(r=>r.status==='timeout').length;
  if(!allChannels.length) return <div className="flex flex-col items-center justify-center fade-in" style={{minHeight:'60vh',gap:'16px'}}><Shield size={48} strokeWidth={1} style={{color:'var(--text-muted)',opacity:0.4}} /><p style={{color:'var(--text-secondary)'}}>Carga una lista M3U primero</p><button onClick={()=>navigate('/settings')} style={{padding:'9px 20px',background:'var(--accent)',color:'#080a0e',border:'none',borderRadius:'var(--radius-md)',fontSize:'0.82rem',fontWeight:700,cursor:'pointer'}}>Ir a Ajustes</button></div>;
  return (
    <div className="fade-in" style={{padding:'24px',paddingBottom:'48px',maxWidth:'900px'}}>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3"><Shield size={22} strokeWidth={1.8} style={{color:'var(--accent)'}} /><h1 className="font-display" style={{fontSize:'clamp(1.8rem,4vw,2.8rem)',lineHeight:1}}>Channel Checker</h1></div>
        {results.length>0&&<div className="flex items-center gap-3"><span style={{fontSize:'0.7rem',color:'var(--online-green)'}}>✓ {online}</span><span style={{fontSize:'0.7rem',color:'var(--offline-red)'}}>✗ {offline}</span>{timeout>0&&<span style={{fontSize:'0.7rem',color:'#f59e0b'}}>⏱ {timeout}</span>}</div>}
      </div>
      <div style={{background:'var(--bg-card)',border:'1px solid var(--border-subtle)',borderRadius:'var(--radius-lg)',padding:'20px',marginBottom:'20px'}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))',gap:'16px',marginBottom:'16px'}}>
          <div><label style={{fontSize:'0.7rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.06em',display:'block',marginBottom:'6px'}}>Categoría</label>
            <select value={selectedGroup} onChange={e=>setSelectedGroup(e.target.value)} style={{width:'100%',padding:'8px 10px',background:'var(--bg-elevated)',border:'1px solid var(--border-mid)',borderRadius:'var(--radius-md)',color:'var(--text-primary)',fontSize:'0.82rem',cursor:'pointer',outline:'none'}}>
              <option value="all">Todos ({allChannels.length})</option>{groups.map(g=><option key={g.id} value={g.title}>{g.title} ({g.channels.length})</option>)}
            </select>
          </div>
          <div><label style={{fontSize:'0.7rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.06em',display:'block',marginBottom:'6px'}}>Streams</label>
            <select value={checkMode} onChange={e=>setCheckMode(e.target.value as 'first'|'all')} style={{width:'100%',padding:'8px 10px',background:'var(--bg-elevated)',border:'1px solid var(--border-mid)',borderRadius:'var(--radius-md)',color:'var(--text-primary)',fontSize:'0.82rem',cursor:'pointer',outline:'none'}}>
              <option value="first">Primero (rápido)</option><option value="all">Todos (completo)</option>
            </select>
          </div>
          <div><label style={{fontSize:'0.7rem',color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.06em',display:'block',marginBottom:'6px'}}>Timeout: {timeoutMs/1000}s</label>
            <input type="range" min={5000} max={20000} step={1000} value={timeoutMs} onChange={e=>setTimeoutMs(Number(e.target.value))} style={{width:'100%',accentColor:'var(--accent)',cursor:'pointer'}} />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={isRunning?()=>{stopRef.current=true;setIsRunning(false);}:runCheck} style={{padding:'10px 24px',background:isRunning?'var(--offline-red)':'var(--accent)',color:'#080a0e',border:'none',borderRadius:'var(--radius-md)',fontSize:'0.82rem',fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',gap:'8px'}}>
            {isRunning?<><X size={14} strokeWidth={2.5} />Detener</>:<><Play size={14} fill="#080a0e" strokeWidth={0} />Iniciar</>}
          </button>
          <span style={{fontSize:'0.72rem',color:'var(--text-muted)'}}>{buildList().length} streams · secuencial · descarga real</span>
          {results.length>0&&!isRunning&&<button onClick={()=>setResults([])} style={{marginLeft:'auto',background:'none',border:'1px solid var(--border-mid)',borderRadius:'var(--radius-md)',color:'var(--text-muted)',fontSize:'0.72rem',padding:'6px 12px',cursor:'pointer'}}>Limpiar</button>}
        </div>
        {isRunning&&<div style={{marginTop:'16px'}}>
          <div className="flex justify-between mb-1"><span style={{fontSize:'0.72rem',color:'var(--text-muted)'}}>Comprobando {currentIdx+1}/{results.length}: <strong style={{color:'var(--text-secondary)'}}>{results[currentIdx]?.channelName}</strong></span><span style={{fontSize:'0.72rem',color:'var(--text-secondary)'}}>{currentIdx+1}/{results.length}</span></div>
          <div style={{height:'4px',background:'var(--bg-elevated)',borderRadius:'2px',overflow:'hidden'}}><div style={{height:'100%',width:`${results.length?(currentIdx/results.length*100):0}%`,background:'var(--accent)',transition:'width 0.3s ease'}} /></div>
        </div>}
      </div>
      {results.length>0&&<div className="flex flex-col gap-1.5">
        <div style={{display:'grid',gridTemplateColumns:'1fr 2fr 100px 60px',gap:'12px',padding:'6px 14px',fontSize:'0.62rem',color:'var(--text-muted)',letterSpacing:'0.08em',textTransform:'uppercase'}}><span>Canal</span><span>Stream</span><span>Estado</span><span style={{textAlign:'right'}}>ms</span></div>
        {results.map(r=>(
          <div key={`${r.channelId}-${r.aceId}`} style={{display:'grid',gridTemplateColumns:'1fr 2fr 100px 60px',gap:'12px',padding:'9px 14px',background:r.status==='online'?'rgba(34,197,94,0.04)':r.status==='offline'?'rgba(239,68,68,0.04)':'var(--bg-card)',border:'1px solid var(--border-subtle)',borderRadius:'var(--radius-md)',alignItems:'center',borderLeftColor:SC[r.status],borderLeftWidth:'3px',opacity:r.status==='pending'?0.45:1}}>
            <span style={{fontSize:'0.76rem',fontWeight:500,color:'var(--text-primary)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.channelName}</span>
            <span style={{fontSize:'0.65rem',color:'var(--text-muted)',fontFamily:'DM Mono,monospace',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{r.streamLabel}</span>
            <div className="flex items-center gap-1.5">
              {r.status==='checking'&&<Loader size={11} strokeWidth={2} style={{animation:'spin 0.8s linear infinite',color:'var(--accent)',flexShrink:0}} />}
              {r.status==='online'&&<Check size={11} strokeWidth={2.5} style={{color:'var(--online-green)',flexShrink:0}} />}
              {r.status==='offline'&&<X size={11} strokeWidth={2.5} style={{color:'var(--offline-red)',flexShrink:0}} />}
              {r.status==='timeout'&&<Clock size={11} strokeWidth={2} style={{color:'#f59e0b',flexShrink:0}} />}
              <span style={{fontSize:'0.65rem',color:SC[r.status]}}>{SL[r.status]}</span>
            </div>
            <span style={{fontSize:'0.65rem',color:'var(--text-muted)',textAlign:'right',fontFamily:'DM Mono,monospace'}}>{r.responseMs??'—'}</span>
          </div>
        ))}
      </div>}
      {results.length===0&&!isRunning&&<div style={{textAlign:'center',padding:'60px 24px'}}><Shield size={40} strokeWidth={1} style={{color:'var(--text-muted)',opacity:0.25,marginBottom:'16px'}} /><p style={{color:'var(--text-muted)',fontSize:'0.85rem'}}>Configura y pulsa "Iniciar"</p></div>}
    </div>
  );
}
