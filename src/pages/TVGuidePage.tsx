import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, Clock, Tv, Search } from 'lucide-react';
import { useEPGStore } from '@/store/useEPGStore';
import { useM3UStore } from '@/store/useM3UStore';
import { formatTime, formatDuration } from '@/lib/epg';
import { LoadingState } from '@/components/shared/States';
import type { EPGEvent } from '@/types';

function getDays() {
  const today=new Date(); const days=[];
  for(let i=-3;i<=3;i++){const d=new Date(today);d.setDate(today.getDate()+i);d.setHours(0,0,0,0);const l=i===0?'Hoy':i===-1?'Ayer':i===1?'Mañana':d.toLocaleDateString('es-ES',{weekday:'short',day:'numeric',month:'short'});days.push({date:d,label:l,key:d.toISOString().split('T')[0]});}
  return days;
}

function ChannelRow({channelId,channelName,channelLogo,selectedDate,onClick}:{channelId:string;channelName:string;channelLogo:string;selectedDate:Date;onClick:(id:string)=>void}) {
  const navigate = useNavigate();
  const [imgErr,setImgErr]=useState(false);
  const [events,setEvents]=useState<EPGEvent[]>([]);
  const epgStatus=useEPGStore(s=>s.status);
  const getScheduleForChannel=useEPGStore(s=>s.getScheduleForChannel);
  const allChannels=useM3UStore(s=>s.allChannels);
  useEffect(()=>{
    if(epgStatus!=='ready') return;
    const ch=allChannels.find(c=>c.id===channelId);
    if(!ch) return;
    getScheduleForChannel(ch).then(schedule=>{
      if(schedule) setEvents(schedule.events.filter(e=>{
        const d=selectedDate; d.setHours(0,0,0,0);
        const next=new Date(d); next.setDate(d.getDate()+1);
        return e.endTime.getTime()>d.getTime()&&e.startTime.getTime()<next.getTime();
      }));
    });
  },[epgStatus,channelId,selectedDate]); // eslint-disable-line
  const now=Date.now();
  return (
    <div style={{display:'flex',borderBottom:'1px solid var(--border-subtle)',minHeight:'64px'}}>
      <div style={{width:'160px',minWidth:'160px',padding:'10px 14px',display:'flex',alignItems:'center',gap:'10px',cursor:'pointer',background:'var(--bg-surface)',borderRight:'1px solid var(--border-subtle)',position:'sticky',left:0,zIndex:2}} onClick={()=>navigate(`/channel/${channelId}`)}>
        <div style={{width:'28px',height:'28px',borderRadius:'6px',background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)',display:'flex',alignItems:'center',justifyContent:'center',overflow:'hidden',flexShrink:0}}>
          {channelLogo&&!imgErr?<img src={channelLogo} alt={channelName} style={{width:'80%',height:'80%',objectFit:'contain'}} onError={()=>setImgErr(true)} loading="lazy" />:<Tv size={14} strokeWidth={1.5} style={{color:'var(--text-muted)'}} />}
        </div>
        <span style={{fontSize:'0.68rem',fontWeight:600,color:'var(--text-secondary)',lineHeight:1.3,overflow:'hidden',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical'}}>{channelName}</span>
      </div>
      <div style={{flex:1,display:'flex',gap:'2px',padding:'6px 8px',alignItems:'stretch',overflowX:'auto',scrollbarWidth:'none'}}>
        {events.length===0?<div style={{display:'flex',alignItems:'center',paddingLeft:'12px'}}><span style={{fontSize:'0.68rem',color:'var(--text-muted)'}}>Sin datos EPG</span></div>:events.map(ev=>{
          const prog=(now-ev.startTime.getTime())/(ev.endTime.getTime()-ev.startTime.getTime())*100;
          const isNow=prog>=0&&prog<=100; const isPast=prog>100;
          const mins=Math.round((ev.endTime.getTime()-ev.startTime.getTime())/60000);
          const width=Math.max(80,mins*2.2);
          return (
            <div key={ev.startTime.getTime()} onClick={()=>onClick(channelId)} style={{minWidth:`${width}px`,padding:'6px 8px',background:isNow?'rgba(226,201,126,0.08)':isPast?'rgba(255,255,255,0.02)':'var(--bg-elevated)',border:`1px solid ${isNow?'rgba(226,201,126,0.25)':'var(--border-subtle)'}`,borderRadius:'6px',cursor:'pointer',position:'relative',overflow:'hidden',flexShrink:0,transition:'border-color 0.15s'}} onMouseEnter={e=>(e.currentTarget as HTMLDivElement).style.borderColor='var(--border-accent)'} onMouseLeave={e=>(e.currentTarget as HTMLDivElement).style.borderColor=isNow?'rgba(226,201,126,0.25)':'var(--border-subtle)'} title={`${ev.title}\n${formatTime(ev.startTime)} – ${formatTime(ev.endTime)}`}>
              {isNow&&<div style={{position:'absolute',bottom:0,left:0,height:'2px',width:`${Math.min(100,prog)}%`,background:'var(--accent)',borderRadius:'0 1px 0 0'}} />}
              <div style={{fontSize:'0.6rem',color:isNow?'var(--accent)':'var(--text-muted)',marginBottom:'2px'}}>{formatTime(ev.startTime)} · {formatDuration(ev.startTime,ev.endTime)}</div>
              <div style={{fontSize:'0.72rem',fontWeight:isNow?600:400,color:isNow?'var(--text-primary)':isPast?'var(--text-muted)':'var(--text-secondary)',overflow:'hidden',display:'-webkit-box',WebkitLineClamp:1,WebkitBoxOrient:'vertical'}}>{ev.title}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TVGuidePage() {
  const navigate = useNavigate();
  const epgStatus = useEPGStore(s=>s.status);
  const allChannels = useM3UStore(s=>s.allChannels);
  const days = useMemo(()=>getDays(),[]);
  const todayKey = new Date().toISOString().split('T')[0];
  const [selectedDayKey,setSelectedDayKey] = useState(todayKey);
  const [searchQuery,setSearchQuery] = useState('');
  const selectedDay = days.find(d=>d.key===selectedDayKey)!;
  const epgChannels = useMemo(()=>{
    return allChannels.map(ch=>({channelId:ch.id,channelName:ch.name,channelLogo:ch.logo}));
  },[allChannels]);
  const filtered = useMemo(()=>{
    if(!searchQuery.trim()) return epgChannels;
    const q=searchQuery.toLowerCase(); return epgChannels.filter(c=>c.channelName.toLowerCase().includes(q));
  },[epgChannels,searchQuery]);

  if (epgStatus==='idle'||epgStatus==='unavailable') return (
    <div className="flex flex-col items-center justify-center fade-in" style={{minHeight:'60vh',gap:'16px'}}>
      <Calendar size={48} strokeWidth={1} style={{color:'var(--text-muted)',opacity:0.4}} />
      <div className="text-center"><p style={{color:'var(--text-secondary)',fontSize:'0.95rem',marginBottom:'8px'}}>No hay guía EPG cargada</p><p style={{color:'var(--text-muted)',fontSize:'0.82rem',lineHeight:1.6,maxWidth:'360px'}}>Carga tu lista M3U o configura una URL de EPG en Ajustes. El servidor EPG debe estar activo (setup.bat).</p></div>
      <button onClick={()=>navigate('/settings')} style={{padding:'9px 20px',background:'var(--accent)',color:'#080a0e',border:'none',borderRadius:'var(--radius-md)',fontSize:'0.82rem',fontWeight:700,cursor:'pointer'}}>Ir a Ajustes</button>
    </div>
  );
  if (epgStatus==='loading'||epgStatus==='parsing') return <LoadingState message="Cargando guía de programación..." />;
  return (
    <div className="fade-in" style={{display:'flex',flexDirection:'column',height:'calc(100vh - 60px)',overflow:'hidden'}}>
      <div style={{padding:'16px 24px 0',background:'var(--bg-surface)',borderBottom:'1px solid var(--border-subtle)',flexShrink:0}}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3"><Calendar size={20} strokeWidth={1.8} style={{color:'var(--accent)'}} /><h1 className="font-display" style={{fontSize:'clamp(1.6rem,3vw,2.4rem)',lineHeight:1}}>Guía de TV</h1><span style={{fontSize:'0.7rem',color:'var(--text-muted)',alignSelf:'flex-end',paddingBottom:'2px'}}>{filtered.length} canales</span></div>
          <div className="flex items-center gap-2" style={{background:'var(--bg-elevated)',border:'1px solid var(--border-mid)',borderRadius:'var(--radius-md)',padding:'0 12px',height:'36px'}}>
            <Search size={14} strokeWidth={1.8} style={{color:'var(--text-muted)',flexShrink:0}} />
            <input type="text" value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} placeholder="Buscar canal..." style={{background:'transparent',border:'none',outline:'none',color:'var(--text-primary)',fontSize:'0.82rem',width:'160px'}} />
          </div>
        </div>
        <div className="flex items-center gap-0 overflow-x-auto" style={{scrollbarWidth:'none'}}>
          {days.map(day=><button key={day.key} onClick={()=>setSelectedDayKey(day.key)} style={{padding:'8px 14px',background:'transparent',border:'none',borderBottom:`2px solid ${day.key===selectedDayKey?'var(--accent)':'transparent'}`,color:day.key===selectedDayKey?'var(--accent)':day.key===todayKey?'var(--text-primary)':'var(--text-secondary)',fontSize:'0.8rem',fontWeight:day.key===selectedDayKey?600:400,cursor:'pointer',whiteSpace:'nowrap',transition:'color 0.15s',paddingBottom:'10px'}}>{day.label}</button>)}
        </div>
      </div>
      <div style={{flex:1,overflowY:'auto',overflowX:'hidden'}}>
        {filtered.length===0?<div style={{padding:'48px 24px',textAlign:'center'}}><p style={{color:'var(--text-muted)',fontSize:'0.85rem'}}>{searchQuery?`Sin resultados para "${searchQuery}"`:''}</p></div>:filtered.map(ch=><ChannelRow key={ch.channelId} channelId={ch.channelId} channelName={ch.channelName} channelLogo={ch.channelLogo} selectedDate={selectedDay.date} onClick={id=>navigate(`/channel/${id}`)} />)}
      </div>
      <div style={{padding:'8px 24px',background:'var(--bg-surface)',borderTop:'1px solid var(--border-subtle)',flexShrink:0}}>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2"><div style={{width:'8px',height:'8px',borderRadius:'2px',background:'rgba(226,201,126,0.15)',border:'1px solid rgba(226,201,126,0.3)'}} /><span style={{fontSize:'0.62rem',color:'var(--text-muted)'}}>En emisión</span></div>
          <div className="flex items-center gap-2"><div style={{width:'8px',height:'8px',borderRadius:'2px',background:'var(--bg-elevated)',border:'1px solid var(--border-subtle)'}} /><span style={{fontSize:'0.62rem',color:'var(--text-muted)'}}>Próximo</span></div>
          <Clock size={11} strokeWidth={1.8} style={{color:'var(--text-muted)',marginLeft:'auto'}} />
        </div>
      </div>
    </div>
  );
}
