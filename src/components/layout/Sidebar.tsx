import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Home,Search,Settings,Tv,LayoutGrid,CircleDot,ChevronLeft,ChevronRight,Heart,Activity,Shield,Power,Trophy,Film,Columns2,CalendarRange } from 'lucide-react';
import { useAddonsStore, hasLibrary } from '@/store/useAddonsStore';
import { LogoMark, LogoWord } from '@/components/brand/Logo';
import { useUIStore } from '@/store/useUIStore';
import { useM3UStore } from '@/store/useM3UStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useFavoritesStore } from '@/store/useFavoritesStore';
import { useCiriacoStore } from '@/store/useCiriacoStore';
import { Capacitor } from '@capacitor/core';
const TOP_NAV: {to:string;icon:React.ElementType;label:string;short?:string;badge:boolean;cls?:string}[] = [
  {to:'/',icon:Home,label:'Inicio',badge:false},
  {to:'/categories',icon:LayoutGrid,label:'Canales',badge:false,cls:'nav-mobile-only'},
  {to:'/favorites',icon:Heart,label:'Favoritos',badge:true},
  {to:'/events',icon:Activity,label:'Eventos',badge:false},
  {to:'/library',icon:Film,label:'Cine y series',short:'Cine',badge:false},
  {to:'/recordings',icon:CircleDot,label:'Grabaciones',short:'Grabadas',badge:false},
  {to:'/flashscore',icon:Trophy,label:'Flashscore',badge:false,cls:'nav-desktop-only'},
  {to:'/checker',icon:Shield,label:'Checker',badge:false,cls:'nav-desktop-only'},
  {to:'/search',icon:Search,label:'Buscar',badge:false,cls:'nav-desktop-only'},
  {to:'/guide',icon:CalendarRange,label:'Parrilla',badge:false,cls:'nav-desktop-only'},
  {to:'/multi',icon:Columns2,label:'Multivista',badge:false,cls:'nav-desktop-only'},
];
const BOTTOM_NAV = [{to:'/settings',icon:Settings,label:'Ajustes'}];
export function Sidebar() {
  const isNativeApp = Capacitor.isNativePlatform();
  const {sidebarOpen,toggleSidebar} = useUIStore();
  const groups = useM3UStore(s=>s.groups);
  const backendStatus = useSettingsStore(s=>s.backendStatus);
  const ciriacoStatus = useCiriacoStore(s=>s.status);
  const warpBusy = useCiriacoStore(s=>s.warpBusy);
  const warpError = useCiriacoStore(s=>s.warpError);
  const setWarpConnected = useCiriacoStore(s=>s.setWarpConnected);
  const favCount = useFavoritesStore(s=>s.ids.size);
  const addons = useAddonsStore(s=>s.addons);
  const visibleNav = TOP_NAV.filter(i => i.to !== '/library' || hasLibrary(addons));
  const navigate = useNavigate();
  const checkBackend = useSettingsStore(s=>s.checkBackend);
  const [engineBusy,setEngineBusy] = useState(false);
  async function toggleEngine() {
    setEngineBusy(true);
    try { await fetch(`http://localhost:3002/engine/${backendStatus==='online'?'stop':'start'}`,{signal:AbortSignal.timeout(50000)}); } catch { /* el asistente no responde */ }
    await checkBackend(); setEngineBusy(false);
  }
  return (
    <aside className="app-sidebar fixed left-0 top-0 h-full flex flex-col z-40 transition-all duration-300" style={{width:sidebarOpen?'240px':'64px',background:'var(--bg-surface)',borderRight:'1px solid var(--border-subtle)'}}>
      <div className="flex items-center gap-3 px-4 shrink-0" style={{height:'60px',borderBottom:'1px solid var(--border-subtle)'}}>
        <LogoMark size={34} />
        {sidebarOpen&&<span className="fade-in"><LogoWord /></span>}
      </div>
      <nav className="px-2 pt-3 flex flex-col gap-0.5" style={{ ['--nav-count' as string]: visibleNav.filter(i => !(i.cls ?? '').includes('desktop-only')).length }}>
        {visibleNav.map(({to,icon:Icon,label,short,badge,cls})=>(
          <NavLink key={to} to={to} end={to==='/'} className={({isActive})=>`nav-item ${isActive?'active':''} ${cls??''}`} title={!sidebarOpen?label:undefined}>
            <div className="relative shrink-0">
              <Icon size={18} strokeWidth={1.8} />
              {badge&&favCount>0&&<span className="absolute -top-1 -right-1 flex items-center justify-center" style={{width:'14px',height:'14px',borderRadius:'50%',background:'var(--accent)',fontSize:'0.55rem',fontWeight:700,color:'#080a0e'}}>{favCount>9?'9+':favCount}</span>}
            </div>
            {sidebarOpen&&<span className="fade-in truncate">{short?<><span className="nav-full">{label}</span><span className="nav-short">{short}</span></>:label}</span>}
          </NavLink>
        ))}
      </nav>
      <div style={{height:'1px',background:'var(--border-subtle)',margin:'8px 12px'}} />
      {sidebarOpen&&groups.length>0&&<div className="px-4 pb-2"><span style={{fontSize:'0.65rem',color:'var(--text-muted)',letterSpacing:'0.1em',textTransform:'uppercase'}}>Categorías</span></div>}
      {<div className="flex-1 overflow-y-auto px-2 flex flex-col gap-0.5">
        {groups.map(group=>(
          <button key={group.id} onClick={()=>navigate(`/category/${group.id}`)} className="nav-item w-full text-left" title={!sidebarOpen?group.title:undefined}>
            {group.logo?<img src={group.logo} alt={group.title} className="shrink-0 object-contain" style={{width:'18px',height:'18px'}} onError={e=>{(e.target as HTMLImageElement).style.display='none';}} />:<Tv size={18} strokeWidth={1.8} className="shrink-0" />}
            {sidebarOpen&&<span className="fade-in truncate text-xs uppercase tracking-wider">{group.title}</span>}
          </button>
        ))}
      </div>}
      <div className="px-2 pb-3 flex flex-col gap-0.5" style={{borderTop:'1px solid var(--border-subtle)',paddingTop:'12px'}}>
        {!isNativeApp&&sidebarOpen&&<div className="flex flex-col gap-1 px-3 py-1.5">
          <div className="flex items-center gap-2"><span className={`status-dot ${backendStatus}`} /><span style={{fontSize:'0.7rem',color:'var(--text-muted)',letterSpacing:'0.04em'}}>{backendStatus==='online'?'AceStream online':backendStatus==='offline'?'AceStream offline':'Comprobando...'}</span>
            <button onClick={toggleEngine} disabled={engineBusy} aria-label={backendStatus==='online'?'Apagar el motor AceStream':'Encender el motor AceStream'} style={{marginLeft:'auto',display:'inline-flex',alignItems:'center',gap:4,padding:'3px 8px',background:'var(--bg-elevated)',border:'1px solid var(--border-mid)',borderRadius:'100px',color:'var(--text-secondary)',fontSize:'0.62rem',cursor:engineBusy?'wait':'pointer'}}><Power size={10} />{engineBusy?'…':backendStatus==='online'?'Apagar':'Encender'}</button></div>
          <div className="flex items-center gap-2" title="WARP afecta a la conexión de todo el equipo. Úsalo solo para actualizar eventos y canales; desconéctalo antes de reproducir.">
            <span className={`status-dot ${!ciriacoStatus || ciriacoStatus.warp.connected === null ? 'unknown' : ciriacoStatus.warp.connected ? 'online' : 'offline'}`} />
            <span style={{fontSize:'0.7rem',color:'var(--text-muted)',letterSpacing:'0.04em'}}>
              {!ciriacoStatus ? 'WARP sin comprobar' : !ciriacoStatus.warp.available ? 'WARP no instalado' : ciriacoStatus.warp.connected === null ? 'Estado WARP desconocido' : ciriacoStatus.warp.connected ? 'WARP conectado' : 'WARP desconectado'}
            </span>
            {ciriacoStatus?.warp.available&&ciriacoStatus.warp.connected!==null&&<button
              onClick={()=>{
                const next = !ciriacoStatus.warp.connected;
                const action = next ? 'conectar' : 'desconectar';
                if (!window.confirm(`${next?'Conectar':'Desconectar'} Cloudflare WARP cambiará la conexión de red de todo el equipo. Úsalo solo para actualizar eventos y canales; para reproducir, desconéctalo. ¿Quieres ${action} WARP ahora?`)) return;
                void setWarpConnected(next);
              }}
              disabled={warpBusy}
              aria-label={ciriacoStatus.warp.connected?'Desconectar Cloudflare WARP':'Conectar Cloudflare WARP'}
              title={ciriacoStatus.warp.connected?'Desconectar WARP para reproducir':'Conectar WARP para actualizar eventos y canales'}
              style={{display:'inline-flex',alignItems:'center',gap:4,padding:'3px 7px',background:'var(--bg-elevated)',border:'1px solid var(--border-mid)',borderRadius:'100px',color:warpBusy?'var(--text-muted)':ciriacoStatus.warp.connected?'var(--accent)':'var(--text-secondary)',fontSize:'0.62rem',cursor:warpBusy?'wait':'pointer'}}>
              <Power size={11} />{warpBusy?'Cambiando…':ciriacoStatus.warp.connected?'Desconectar':'Conectar'}
            </button>}
          </div>
          <p style={{fontSize:'0.62rem',lineHeight:1.4,color:'var(--text-muted)',paddingLeft:'16px'}}>
            Solo para actualizar eventos y canales. Desconéctalo para reproducir.
          </p>
          {warpError&&<p role="alert" style={{fontSize:'0.62rem',lineHeight:1.4,color:'var(--offline-red)',paddingLeft:'16px'}}>{warpError}</p>}
        </div>}
        {BOTTOM_NAV.map(({to,icon:Icon,label})=>(
          <NavLink key={to} to={to} className={({isActive})=>`nav-item ${isActive?'active':''}`} title={!sidebarOpen?label:undefined}>
            <Icon size={18} strokeWidth={1.8} className="shrink-0" />
            {sidebarOpen&&<span className="fade-in">{label}</span>}
          </NavLink>
        ))}
        {!isNativeApp&&<button onClick={toggleSidebar} className="nav-item justify-center" style={{marginTop:'4px'}} title={sidebarOpen?'Colapsar':'Expandir'}>
          {sidebarOpen?<ChevronLeft size={16} strokeWidth={1.8} />:<ChevronRight size={16} strokeWidth={1.8} />}
        </button>}
      </div>
    </aside>
  );
}
