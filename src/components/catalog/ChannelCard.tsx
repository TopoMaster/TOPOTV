import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Play, Tv, Heart } from 'lucide-react';
import type { Channel, EPGSchedule } from '@/types';
import { useEPGStore } from '@/store/useEPGStore';
import { useFavoritesStore } from '@/store/useFavoritesStore';
import { getNowPlaying } from '@/lib/epg';
import { channelDead, useHealthStore } from '@/store/useHealthStore';
interface ChannelCardProps { channel: Channel; size?: 'sm'|'md'|'lg'; }
export function ChannelCard({ channel, size='md' }: ChannelCardProps) {
  const navigate = useNavigate();
  const [imgError, setImgError] = useState(false);
  const [schedule, setSchedule] = useState<EPGSchedule|null>(null);
  const epgStatus = useEPGStore(s=>s.status);
  const getScheduleForChannel = useEPGStore(s=>s.getScheduleForChannel);
  const isFavorite = useFavoritesStore(s=>s.isFavorite);
  const toggleFav = useFavoritesStore(s=>s.toggle);
  const dims = {sm:{card:'120px',logo:'44px',fontSize:'0.65rem'},md:{card:'150px',logo:'56px',fontSize:'0.72rem'},lg:{card:'180px',logo:'68px',fontSize:'0.78rem'}}[size];
  const isFav = isFavorite(channel.id);
  const dead = useHealthStore(st => channelDead(channel, st.streams));
  useEffect(()=>{
    if(epgStatus!=='ready') return;
    let cancelled=false;
    getScheduleForChannel(channel).then(s=>{ if(!cancelled) setSchedule(s); });
    return ()=>{ cancelled=true; };
  },[epgStatus,channel.id]); // eslint-disable-line
  const nowPlaying = getNowPlaying(schedule??undefined);
  return (
    <div className="channel-card flex flex-col items-center justify-center gap-2 select-none group" style={{width:dims.card,minHeight:dims.card,padding:'14px 8px 10px',opacity:dead?0.45:1}} title={dead?'Sus enlaces no responden ahora mismo':undefined} onClick={()=>navigate(`/channel/${channel.id}`)} tabIndex={0} role="button" aria-label={`Ver ${channel.name}`} onKeyDown={e=>e.key==='Enter'&&navigate(`/channel/${channel.id}`)}>
      {isFav&&<div className="absolute top-2 right-2 z-10" onClick={e=>{e.stopPropagation();toggleFav(channel.id);}} style={{cursor:'pointer'}}><Heart size={12} fill="var(--accent)" color="var(--accent)" strokeWidth={0} /></div>}
      <div className="flex items-center justify-center shrink-0" style={{width:dims.logo,height:dims.logo,borderRadius:'var(--radius-md)',background:'linear-gradient(160deg,#1d2433,#10141c)',overflow:'hidden',border:'1px solid var(--border-subtle)'}}>
        {channel.logo&&!imgError?<img src={channel.logo} alt={channel.name} style={{width:'80%',height:'80%',objectFit:'contain'}} onError={()=>setImgError(true)} loading="lazy" />:<Tv size={parseInt(dims.logo)*0.4} strokeWidth={1.5} style={{color:'var(--text-muted)'}} />}
      </div>
      <span className="text-center leading-tight font-medium w-full" style={{fontSize:dims.fontSize,color:'var(--text-secondary)',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden',letterSpacing:'0.02em'}}>{channel.name}</span>
      {nowPlaying?<span style={{fontSize:'0.58rem',color:'var(--accent)',letterSpacing:'0.02em',textAlign:'center',width:'100%',display:'-webkit-box',WebkitLineClamp:1,WebkitBoxOrient:'vertical',overflow:'hidden',opacity:0.85}} title={nowPlaying.title}>▶ {nowPlaying.title}</span>:channel.streams.length>1?<span style={{fontSize:'0.58rem',color:'var(--text-muted)',letterSpacing:'0.05em',textTransform:'uppercase'}}>{channel.streams.length} streams</span>:null}
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200" style={{background:'rgba(8,10,14,0.75)',borderRadius:'var(--radius-md)'}}>
        <div className="flex items-center justify-center" style={{width:'40px',height:'40px',borderRadius:'50%',background:'var(--accent)'}}><Play size={16} fill="#080a0e" color="#080a0e" strokeWidth={0} /></div>
      </div>
    </div>
  );
}
