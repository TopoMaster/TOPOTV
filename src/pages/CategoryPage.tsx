import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useM3UStore } from '@/store/useM3UStore';
import { ChannelCard } from '@/components/catalog/ChannelCard';
import { ErrorState } from '@/components/shared/States';

export function CategoryPage() {
  const {slug} = useParams<{slug:string}>();
  const navigate = useNavigate();
  const getGroup = useM3UStore(s=>s.getGroup);
  const group = getGroup(slug??'');
  if (!group) return <ErrorState message={`Categoría no encontrada.`} />;
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
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))',gap:'16px'}}>
        {group.channels.map((ch,i)=>(
          <div key={ch.id} className="slide-up" style={{animationDelay:`${Math.min(i*0.02,0.4)}s`}}>
            <ChannelCard channel={ch} size="md" />
          </div>
        ))}
      </div>
    </div>
  );
}
