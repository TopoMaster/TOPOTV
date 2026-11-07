import { useNavigate } from 'react-router-dom';
import { Heart, Trash2 } from 'lucide-react';
import { useM3UStore } from '@/store/useM3UStore';
import { useFavoritesStore } from '@/store/useFavoritesStore';
import { ChannelCard } from '@/components/catalog/ChannelCard';
import { EmptyState } from '@/components/shared/States';
import type { Channel } from '@/types';

export function FavoritesPage() {
  const navigate = useNavigate();
  const allChannels = useM3UStore(s=>s.allChannels);
  const {ids,clear} = useFavoritesStore();
  if (!allChannels.length) return <EmptyState />;
  const favChannels = [...ids].map(id=>allChannels.find(c=>c.id===id)).filter(Boolean) as Channel[];
  return (
    <div className="fade-in" style={{padding:'24px',paddingBottom:'48px'}}>
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Heart size={24} strokeWidth={1.8} style={{color:'var(--accent)'}} fill="var(--accent)" />
          <div>
            <h1 className="font-display" style={{fontSize:'clamp(1.8rem,4vw,3rem)',lineHeight:1}}>Favoritos</h1>
            <p style={{color:'var(--text-muted)',fontSize:'0.78rem',marginTop:'4px'}}>{favChannels.length} {favChannels.length===1?'canal':'canales'}</p>
          </div>
        </div>
        {favChannels.length>0&&<button onClick={()=>{if(confirm('¿Borrar todos?'))clear();}} className="flex items-center gap-2" style={{background:'none',border:'1px solid var(--border-mid)',borderRadius:'var(--radius-md)',color:'var(--text-muted)',fontSize:'0.75rem',padding:'7px 14px',cursor:'pointer'}} onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--offline-red)';e.currentTarget.style.color='var(--offline-red)';}} onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border-mid)';e.currentTarget.style.color='var(--text-muted)';}}>
          <Trash2 size={13} strokeWidth={1.8} />Borrar todos
        </button>}
      </div>
      {favChannels.length===0
        ? <div className="flex flex-col items-center justify-center fade-in" style={{minHeight:'40vh',gap:'16px'}}>
            <Heart size={48} strokeWidth={1} style={{color:'var(--text-muted)',opacity:0.4}} />
            <p style={{color:'var(--text-secondary)',fontSize:'0.95rem'}}>Aún no tienes favoritos</p>
            <button onClick={()=>navigate('/')} style={{padding:'9px 20px',background:'var(--accent)',color:'#080a0e',border:'none',borderRadius:'var(--radius-md)',fontSize:'0.82rem',fontWeight:700,cursor:'pointer'}}>Explorar canales</button>
          </div>
        : <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))',gap:'16px'}}>
            {favChannels.map((ch,i)=><div key={ch.id} className="slide-up" style={{animationDelay:`${Math.min(i*0.025,0.4)}s`}}><ChannelCard channel={ch} size="md" /></div>)}
          </div>
      }
    </div>
  );
}
