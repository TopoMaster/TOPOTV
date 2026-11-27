import { useNavigate } from 'react-router-dom';
import { Search, Upload, ShieldCheck } from 'lucide-react';
import { useRef } from 'react';
import { useM3UStore } from '@/store/useM3UStore';
import { useCheckerStore } from '@/store/useCheckerStore';
import { StatusPills } from './StatusPills';
import { ProfileMenu } from './ProfileMenu';
export function TopBar() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const { loadFromFile, isLoading, allChannels } = useM3UStore();
  // valores sueltos (un objeto nuevo en cada lectura haría repintar sin parar)
  const running = useCheckerStore(s => s.running), done = useCheckerStore(s => s.done), total = useCheckerStore(s => s.rows.length), paused = useCheckerStore(s => s.paused);
  const checker = running ? { done, total, paused } : null;
  return (
    <header className="flex items-center justify-between px-6 shrink-0" style={{height:'60px',borderBottom:'1px solid var(--border-subtle)',background:'var(--bg-surface)'}}>
      <button onClick={()=>navigate('/search')} className="flex items-center gap-3" style={{height:'38px',minWidth:'min(380px,40vw)',padding:'0 16px',borderRadius:'100px',background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',color:'var(--text-muted)',fontSize:'0.82rem',cursor:'text',transition:'border-color .15s'}} onMouseEnter={e=>(e.currentTarget.style.borderColor='var(--border-mid)')} onMouseLeave={e=>(e.currentTarget.style.borderColor='var(--border-subtle)')}>
        <Search size={15} strokeWidth={1.8} />Buscar canales
      </button>
      <div className="flex items-center gap-3">
        {checker && <button onClick={() => navigate('/checker')} title={checker.paused ? 'Comprobación en pausa mientras ves un canal' : 'Comprobando enlaces en segundo plano'} className="flex items-center gap-2" style={{ height: 30, padding: '0 12px', borderRadius: 100, border: '1px solid var(--border-accent)', background: 'var(--accent-dim)', color: 'var(--accent)', fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}><ShieldCheck size={13} style={checker.paused ? undefined : { animation: 'livePulse 2s ease-in-out infinite' }} />{checker.done}/{checker.total}</button>}
        <StatusPills />
        <ProfileMenu />
        {allChannels.length>0&&<span className="topbar-count" style={{fontSize:'0.75rem',color:'var(--text-muted)',letterSpacing:'0.04em'}}>{allChannels.length} canales</span>}
        <button onClick={()=>fileRef.current?.click()} disabled={isLoading} aria-label="Cargar una lista M3U" title="Cargar una lista M3U" className="flex items-center gap-2 px-3" style={{height:'36px',borderRadius:'var(--radius-md)',background:isLoading?'var(--bg-elevated)':'var(--bg-elevated)',color:isLoading?'var(--text-muted)':'var(--text-primary)',border:'1px solid var(--border-mid)',fontSize:'0.78rem',fontWeight:600,letterSpacing:'0.04em',cursor:isLoading?'not-allowed':'pointer'}}>
          <Upload size={14} strokeWidth={2.5} /><span className="topbar-load-label">{isLoading?'Cargando...':'Cargar M3U'}</span>
        </button>
        <input ref={fileRef} type="file" accept=".m3u,.m3u8,.txt" className="hidden" onChange={async e=>{const f=e.target.files?.[0];if(f)await loadFromFile(f);e.target.value='';}} />
      </div>
    </header>
  );
}
