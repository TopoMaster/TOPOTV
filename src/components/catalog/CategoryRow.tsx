import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import type { Group } from '@/types';
import { ChannelCard } from './ChannelCard';
import { sortAlive, useHealthStore } from '@/store/useHealthStore';
import { useSettingsStore } from '@/store/useSettingsStore';
export function CategoryRow({ group, maxVisible=12 }: { group: Group; maxVisible?: number }) {
  const navigate = useNavigate();
  const health = useHealthStore(s => s.streams);
  const hideDead = useSettingsStore(s => s.hideDead);
  const visible = sortAlive(group.channels, health, hideDead).slice(0, maxVisible);
  if (!group.channels.length) return null;
  return (
    <section className="slide-up" style={{marginBottom:'36px'}}>
      <div className="flex items-center justify-between px-6 mb-4">
        <div className="flex items-center gap-3">
          <h2 className="section-heading">{group.title}</h2>
          <span style={{fontSize:'0.7rem',color:'var(--text-muted)',letterSpacing:'0.06em',textTransform:'uppercase',alignSelf:'flex-end',paddingBottom:'2px'}}>{group.channels.length}</span>
        </div>
        {group.channels.length>maxVisible&&<button onClick={()=>navigate(`/category/${group.id}`)} className="flex items-center gap-1" style={{fontSize:'0.75rem',color:'var(--text-muted)',background:'none',border:'none',cursor:'pointer',letterSpacing:'0.04em',textTransform:'uppercase'}} onMouseEnter={e=>(e.currentTarget.style.color='var(--accent)')} onMouseLeave={e=>(e.currentTarget.style.color='var(--text-muted)')}>Ver todos <ChevronRight size={14} strokeWidth={2} /></button>}
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2" style={{paddingLeft:'24px',paddingRight:'24px',scrollbarWidth:'none'}}>
        {visible.map((ch,i)=>(
          <div key={ch.id} className="shrink-0 fade-in" style={{animationDelay:`${i*0.03}s`}}><ChannelCard channel={ch} size="md" /></div>
        ))}
        {group.channels.length>maxVisible&&<button onClick={()=>navigate(`/category/${group.id}`)} className="shrink-0 flex flex-col items-center justify-center gap-2" style={{width:'150px',minHeight:'150px',background:'var(--bg-card)',border:'1px dashed var(--border-mid)',borderRadius:'var(--radius-md)',cursor:'pointer',color:'var(--text-muted)'}} onMouseEnter={e=>{e.currentTarget.style.borderColor='var(--accent)';e.currentTarget.style.color='var(--accent)';}} onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border-mid)';e.currentTarget.style.color='var(--text-muted)';}}>
          <ChevronRight size={22} strokeWidth={1.5} />
          <span style={{fontSize:'0.7rem',letterSpacing:'0.06em',textTransform:'uppercase'}}>+{group.channels.length-maxVisible} más</span>
        </button>}
      </div>
    </section>
  );
}
