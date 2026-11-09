import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useM3UStore } from '@/store/useM3UStore';
import { ChannelCard } from '@/components/catalog/ChannelCard';
import { ErrorState, LoadingState } from '@/components/shared/States';
import { TDT_PRIVADAS } from '@/lib/tdt';
import { sortAlive, useHealthStore } from '@/store/useHealthStore';

export function CategoryPage() {
  const {slug} = useParams<{slug:string}>();
  const navigate = useNavigate();
  const getGroup = useM3UStore(s=>s.getGroup);
  const loading = useM3UStore(s=>s.isLoading||s.allChannels.length===0);
  const health = useHealthStore(s=>s.streams);
  const group = getGroup(slug??'');
  if (!group) return loading ? <LoadingState message="Cargando canales..." /> : <ErrorState message={`Categoría no encontrada.`} />;
  return (
    <div className="fade-in" style={{padding:'24px',paddingBottom:'48px'}}>
      <div className="flex items-center gap-4 mb-8">
        <button onClick={()=>navigate(-1)} className="flex items-center justify-center" style={{width:'36px',height:'36px',borderRadius:'var(--radius-md)',background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',cursor:'pointer',color:'var(--text-secondary)',flexShrink:0}} onMouseEnter={e=>(e.currentTarget.style.color='var(--text-primary)')} onMouseLeave={e=>(e.currentTarget.style.color='var(--text-secondary)')}>
          <ArrowLeft size={16} strokeWidth={2} />
        </button>
        <div>
          <h1 className="font-display" style={{fontSize:'clamp(1.8rem,4vw,3rem)',lineHeight:1}}>{group.title}</h1>
          <p style={{color:'var(--text-muted)',fontSize:'0.78rem',marginTop:'4px'}}>{group.channels.length} {group.channels.length === 1 ? 'canal' : 'canales'}</p>
        </div>
      </div>
      {group.id==='tdt'&&<div style={{marginBottom:20,padding:'12px 14px',background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',borderRadius:'var(--radius-lg)'}}>
        <p style={{fontSize:'0.74rem',color:'var(--text-muted)',lineHeight:1.5,marginBottom:8}}>Las cadenas privadas solo emiten en sus apps oficiales (con protección), así que no se pueden incluir aquí. Ábrelas en su web:</p>
        <div className="flex flex-wrap gap-2">{TDT_PRIVADAS.map(l=><a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" style={{padding:'8px 14px',background:'var(--bg-card)',border:'1px solid var(--border-mid)',borderRadius:100,color:'var(--text-secondary)',fontSize:'0.76rem',textDecoration:'none'}}>{l.name}</a>)}</div>
      </div>}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))',gap:'16px'}}>
        {sortAlive(group.channels, health).map((ch,i)=>(
          <div key={ch.id} className="slide-up" style={{animationDelay:`${Math.min(i*0.02,0.4)}s`}}>
            <ChannelCard channel={ch} size="md" />
          </div>
        ))}
      </div>
    </div>
  );
}
