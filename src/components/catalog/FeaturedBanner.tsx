import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Layers } from 'lucide-react';
import type { Group } from '@/types';
const PRIORITY = ['LA LIGA','LIGA DE CAMPEONES','DAZN','NBA','FORMULA 1','MOVISTAR'];
export function FeaturedBanner({ groups }: { groups: Group[] }) {
  const navigate = useNavigate();
  const [activeIdx, setActiveIdx] = useState(0);
  const featured = [...PRIORITY.map(t=>groups.find(g=>g.title===t)).filter(Boolean),...groups.filter(g=>!PRIORITY.includes(g.title))].slice(0,5) as Group[];
  if (!featured.length) return null;
  const active = featured[activeIdx];
  return (
    <div className="relative overflow-hidden mx-6 mt-6 mb-8 rounded-2xl" style={{minHeight:'200px',background:'var(--bg-card)',border:'1px solid var(--border-subtle)'}}>
      <div className="absolute inset-0" style={{background:'radial-gradient(ellipse at 85% 20%,rgba(226,201,126,0.14) 0%,transparent 55%),radial-gradient(ellipse at 10% 100%,rgba(226,201,126,0.05) 0%,transparent 50%),linear-gradient(135deg,var(--bg-elevated) 0%,var(--bg-card) 100%)'}} />
      <div className="relative z-10 flex flex-col justify-between h-full p-6" style={{minHeight:'200px'}}>
        <div className="flex items-center gap-2 flex-wrap">
          {featured.map((g,i)=><button key={g.id} onClick={()=>setActiveIdx(i)} className="category-pill" style={i===activeIdx?{borderColor:'var(--accent)',color:'var(--accent)',background:'var(--accent-dim)'}:{}}>{g.title}</button>)}
        </div>
        <div className="flex items-end justify-between gap-6 mt-4">
          <div>
            <h1 className="font-display" style={{fontSize:'clamp(2rem,5vw,3.5rem)',color:'var(--text-primary)',lineHeight:1}}>{active.title}</h1>
            <p style={{color:'var(--text-secondary)',fontSize:'0.85rem',marginTop:'8px'}}>{active.channels.length} canales</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {active.channels.slice(0,5).map(ch=>(
              <div key={ch.id} title={ch.name} style={{width:'44px',height:'44px',borderRadius:'var(--radius-md)',background:'var(--bg-elevated)',border:'1px solid var(--border-mid)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                {ch.logo?<img src={ch.logo} alt={ch.name} style={{width:'80%',height:'80%',objectFit:'contain'}} onError={e=>{(e.target as HTMLImageElement).style.display='none';}} />:<Layers size={18} style={{color:'var(--text-muted)'}} />}
              </div>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-3 mt-4">
          <button onClick={()=>navigate(`/category/${active.id}`)} className="flex items-center gap-2" style={{padding:'10px 20px',background:'var(--accent-gradient)',color:'#080a0e',border:'none',borderRadius:'100px',fontSize:'0.82rem',fontWeight:700,letterSpacing:'0.06em',textTransform:'uppercase',cursor:'pointer'}} onMouseEnter={e=>(e.currentTarget.style.opacity='0.88')} onMouseLeave={e=>(e.currentTarget.style.opacity='1')}>
            <Play size={14} fill="#080a0e" strokeWidth={0} />Ver categoría
          </button>
        </div>
      </div>
    </div>
  );
}
