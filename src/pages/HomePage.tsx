import { useNavigate } from 'react-router-dom';
import { Heart, Clock, ChevronRight } from 'lucide-react';
import { useM3UStore } from '@/store/useM3UStore';
import { useFavoritesStore } from '@/store/useFavoritesStore';
import { useHistoryStore } from '@/store/useHistoryStore';
import { FeaturedBanner } from '@/components/catalog/FeaturedBanner';
import { CategoryRow } from '@/components/catalog/CategoryRow';
import { LiveRail } from '@/components/catalog/LiveRail';
import { ChannelCard } from '@/components/catalog/ChannelCard';
import { EmptyState, LoadingState } from '@/components/shared/States';
import type { Channel } from '@/types';

function QuickRow({ title, icon: Icon, channels, accentColor }: { title: string; icon: React.ElementType; channels: Channel[]; accentColor: string }) {
  const navigate = useNavigate();
  if (!channels.length) return null;
  return (
    <section className="slide-up" style={{marginBottom:'32px'}}>
      <div className="flex items-center justify-between px-6 mb-4">
        <div className="flex items-center gap-2">
          <Icon size={16} strokeWidth={1.8} style={{color:accentColor}} />
          <h2 className="section-heading" style={{fontSize:'1.5rem'}}>{title}</h2>
          <span style={{fontSize:'0.7rem',color:'var(--text-muted)',letterSpacing:'0.06em',textTransform:'uppercase',alignSelf:'flex-end',paddingBottom:'2px'}}>{channels.length}</span>
        </div>
        {channels.length>8&&<button onClick={()=>navigate('/search')} className="flex items-center gap-1" style={{fontSize:'0.75rem',color:'var(--text-muted)',background:'none',border:'none',cursor:'pointer',letterSpacing:'0.04em',textTransform:'uppercase'}} onMouseEnter={e=>(e.currentTarget.style.color='var(--accent)')} onMouseLeave={e=>(e.currentTarget.style.color='var(--text-muted)')}>Ver todos <ChevronRight size={14} strokeWidth={2} /></button>}
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2" style={{paddingLeft:'24px',paddingRight:'24px',scrollbarWidth:'none'}}>
        {channels.slice(0,12).map((ch,i)=>(
          <div key={ch.id} className="shrink-0 fade-in" style={{animationDelay:`${i*0.03}s`}}><ChannelCard channel={ch} size="md" /></div>
        ))}
      </div>
    </section>
  );
}

export function HomePage() {
  const {groups,isLoading,allChannels} = useM3UStore();
  const favIds = useFavoritesStore(s=>s.ids);
  const historyEntries = useHistoryStore(s=>s.entries);
  if (isLoading) return <LoadingState message="Procesando lista M3U..." />;
  if (!allChannels.length) return <EmptyState />;
  const favChannels = [...favIds].map(id=>allChannels.find(c=>c.id===id)).filter(Boolean) as Channel[];
  const historyChannels = historyEntries.map(e=>e.channel);
  return (
    <div className="fade-in" style={{paddingBottom:'40px'}}>
      <LiveRail />
      <FeaturedBanner groups={groups} />
      <QuickRow title="Favoritos" icon={Heart} channels={favChannels} accentColor="var(--accent)" />
      <QuickRow title="Recientes" icon={Clock} channels={historyChannels} accentColor="var(--text-secondary)" />
      {groups.map(group=><CategoryRow key={group.id} group={group} maxVisible={10} />)}
    </div>
  );
}
