import { useNavigate } from 'react-router-dom';
import { Search, Upload } from 'lucide-react';
import { useRef } from 'react';
import { useM3UStore } from '@/store/useM3UStore';
import { StatusPills } from './StatusPills';
import { ProfileMenu } from './ProfileMenu';
export function TopBar() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const { loadFromFile, isLoading, allChannels } = useM3UStore();
  return (
    <header className="flex items-center justify-between px-6 shrink-0" style={{height:'60px',borderBottom:'1px solid var(--border-subtle)',background:'var(--bg-surface)'}}>
      <button onClick={()=>navigate('/search')} className="flex items-center gap-3" style={{height:'38px',minWidth:'min(380px,40vw)',padding:'0 16px',borderRadius:'100px',background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',color:'var(--text-muted)',fontSize:'0.82rem',cursor:'text',transition:'border-color .15s'}} onMouseEnter={e=>(e.currentTarget.style.borderColor='var(--border-mid)')} onMouseLeave={e=>(e.currentTarget.style.borderColor='var(--border-subtle)')}>
        <Search size={15} strokeWidth={1.8} />Buscar canales
      </button>
      <div className="flex items-center gap-3">
        <StatusPills />
        <ProfileMenu />
        {allChannels.length>0&&<span className="topbar-count" style={{fontSize:'0.75rem',color:'var(--text-muted)',letterSpacing:'0.04em'}}>{allChannels.length} canales</span>}
        <button onClick={()=>fileRef.current?.click()} disabled={isLoading} aria-label="Cargar una lista M3U" title="Cargar una lista M3U" className="flex items-center gap-2 px-3" style={{height:'36px',borderRadius:'var(--radius-md)',background:isLoading?'var(--bg-elevated)':'var(--bg-elevated)',color:isLoading?'var(--text-muted)':'var(--text-primary)',border:'1px solid var(--border-mid)',fontSize:'0.78rem',fontWeight:600,letterSpacing:'0.04em',cursor:isLoading?'not-allowed':'pointer'}}>
          <Upload size={14} strokeWidth={2.5} /><span className="topbar-load-label">{isLoading?'Cargando...':'Cargar M3U'}</span>
        </button>
        <input ref={fileRef} type="file" accept=".m3u,.m3u8" className="hidden" onChange={async e=>{const f=e.target.files?.[0];if(f)await loadFromFile(f);e.target.value='';}} />
      </div>
    </header>
  );
}
