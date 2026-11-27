import { Fragment, useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Home,Settings,Zap,Tv,LayoutGrid,CircleDot,ChevronLeft,ChevronRight,Heart,Activity,Shield,Trophy,Film,Columns2,CalendarRange,Menu, Rss } from 'lucide-react';
import { MoreSheet } from './MoreSheet';
import { SidebarCategories } from './SidebarCategories';
import { LogoMark, LogoWord } from '@/components/brand/Logo';
import { useUIStore } from '@/store/useUIStore';
import { useM3UStore } from '@/store/useM3UStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useFavoritesStore } from '@/store/useFavoritesStore';
import { useCiriacoStore } from '@/store/useCiriacoStore';
import { liveAndNext } from '@/lib/ciriaco';
import { Capacitor } from '@capacitor/core';
const TOP_NAV: {to:string;icon:React.ElementType;label:string;short?:string;badge:boolean;cls?:string;sec?:string}[] = [
  // En el móvil la barra de abajo lleva solo Inicio, Eventos, Canales y Cine; el resto está en «Más»
  {to:'/',icon:Home,label:'Inicio',badge:false,sec:'Ver'},
  {to:'/events',icon:Activity,label:'Eventos',badge:false},
  {to:'/categories',icon:LayoutGrid,label:'Canales',badge:false,cls:'nav-mobile-only'},
  {to:'/library',icon:Film,label:'Cine y series',short:'Cine',badge:false},
  {to:'/favorites',icon:Heart,label:'Favoritos',badge:true,cls:'nav-desktop-only',sec:'Tu contenido'},
  {to:'/recordings',icon:CircleDot,label:'Grabaciones',badge:false,cls:'nav-desktop-only'},
  {to:'/guide',icon:CalendarRange,label:'Parrilla',badge:false,cls:'nav-desktop-only',sec:'Herramientas'},
  {to:'/multi',icon:Columns2,label:'Multivista',badge:false,cls:'nav-desktop-only'},
  {to:'/flashscore',icon:Trophy,label:'Resultados',badge:false,cls:'nav-desktop-only'},
  {to:'/feeds',icon:Rss,label:'RSS',badge:false,cls:'nav-desktop-only'},
  {to:'/checker',icon:Shield,label:'Comprobar enlaces',badge:false,cls:'nav-desktop-only'},
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
  const liveCount = useCiriacoStore(s=>liveAndNext(s.data).filter(i=>i.status==='live').length);
  const moreOpen = useUIStore(s=>s.moreOpen);
  const setMoreOpen = useUIStore(s=>s.setMoreOpen);
  const visibleNav = TOP_NAV;
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
      <div className="sidebar-head flex items-center gap-3 px-4 shrink-0" style={{height:'64px'}}>
        <button onClick={()=>!sidebarOpen&&toggleSidebar()} className="logo-glow" style={{background:'none',border:'none',padding:0,cursor:sidebarOpen?'default':'pointer',display:'flex'}} title={sidebarOpen?undefined:'Abrir el menú'} aria-label={sidebarOpen?'TOPOTV':'Abrir el menú'}><LogoMark size={34} /></button>
        {sidebarOpen&&<span className="fade-in flex-1"><LogoWord /></span>}
        {sidebarOpen&&!isNativeApp&&<button onClick={toggleSidebar} className="sidebar-fold" title="Plegar el menú" aria-label="Plegar el menú"><ChevronLeft size={15} strokeWidth={2} /></button>}
      </div>
      <nav className="px-2 pt-3 flex flex-col gap-0.5" style={{ ['--nav-count' as string]: visibleNav.filter(i => !(i.cls ?? '').includes('desktop-only')).length + 1 }}>
        {visibleNav.map(({to,icon:Icon,label,short,badge,cls,sec})=>(
          <Fragment key={to}>
          {sec&&sidebarOpen&&<div className="nav-section nav-desktop-only">{sec}</div>}
          <NavLink key={to} to={to} end={to==='/'} className={({isActive})=>`nav-item ${isActive&&!moreOpen?'active':''} ${cls??''}`} title={!sidebarOpen?label:undefined}>
            <div className="relative shrink-0">
              <Icon size={18} strokeWidth={1.8} />
              {badge&&favCount>0&&<span className="absolute -top-1 -right-1 flex items-center justify-center" style={{width:'14px',height:'14px',borderRadius:'50%',background:'var(--accent)',fontSize:'0.55rem',fontWeight:700,color:'#080a0e'}}>{favCount>9?'9+':favCount}</span>}
            </div>
            {sidebarOpen&&<span className="fade-in truncate">{short?<><span className="nav-full">{label}</span><span className="nav-short">{short}</span></>:label}</span>}
            {to==='/events'&&sidebarOpen&&liveCount>0&&<span className="nav-live nav-desktop-only" title={`${liveCount} en directo ahora`}>{liveCount}</span>}
          </NavLink>
          </Fragment>
        ))}
        <button onClick={()=>setMoreOpen(!moreOpen)} className={`nav-item nav-mobile-only ${moreOpen?'active':''}`} aria-expanded={moreOpen} aria-label="Más secciones">
          <div className="relative shrink-0"><Menu size={18} strokeWidth={1.8} /></div>
          <span>Más</span>
        </button>
      </nav>
      <MoreSheet />
      <div style={{height:'1px',background:'linear-gradient(90deg, transparent, var(--border-mid), transparent)',margin:'10px 14px 6px'}} />
      {sidebarOpen&&groups.length>0&&<div className="px-4 pb-1 flex items-center justify-between"><span className="nav-section" style={{padding:0}}>Categorías</span><button onClick={()=>navigate('/categories')} className="sidebar-link" title="Ver todas las categorías en grande">Ver todas</button></div>}
      <div className="sidebar-cats flex-1 overflow-y-auto px-2 flex flex-col gap-0.5" style={{minHeight:0}}>
        {sidebarOpen
          ? <SidebarCategories groups={groups} />
          : groups.length>0&&<button onClick={()=>navigate('/categories')} className="nav-item w-full justify-center" title="Categorías"><Tv size={18} strokeWidth={1.8} /></button>}
      </div>
      <div className="sidebar-foot px-2 pb-3 flex flex-col gap-1" style={{paddingTop:'10px'}}>
        {!isNativeApp&&sidebarOpen&&<div className="sidebar-status flex flex-col gap-1.5">
          <div className="sw-row"><Zap size={14} style={{color:backendStatus==='online'?'var(--online-green)':'var(--text-muted)'}} /><span className="sw-label">Motor AceStream<small>{engineBusy?'Cambiando…':backendStatus==='online'?'En marcha':backendStatus==='offline'?'Apagado':'Comprobando…'}</small></span>
            <button onClick={toggleEngine} disabled={engineBusy} className={`sw ${backendStatus==='online'?'on':''}`} role="switch" aria-checked={backendStatus==='online'} aria-label={backendStatus==='online'?'Apagar el motor AceStream':'Encender el motor AceStream'} title={backendStatus==='online'?'Apagar el motor':'Encender el motor'} /></div>
          <div className="sw-row" title="WARP cambia la conexión de todo el equipo: TOPOTV lo conecta solo al actualizar y lo apaga al terminar.">
            <Shield size={14} style={{color:ciriacoStatus?.warp.connected?'var(--accent)':'var(--text-muted)'}} />
            <span className="sw-label">Cloudflare WARP<small>{warpBusy?'Cambiando…':!ciriacoStatus?'Comprobando…':!ciriacoStatus.warp.available?'No instalado':ciriacoStatus.warp.connected?'Conectado':'Apagado'}</small></span>
            {ciriacoStatus?.warp.available&&ciriacoStatus.warp.connected!==null&&<button
              onClick={()=>{
                const next = !ciriacoStatus.warp.connected;
                if (!window.confirm(`${next?'Conectar':'Desconectar'} Cloudflare WARP cambiará la conexión de red de todo el equipo. TOPOTV ya lo conecta solo al actualizar. ¿Quieres ${next?'conectarlo':'desconectarlo'} ahora?`)) return;
                void setWarpConnected(next);
              }}
              disabled={warpBusy} className={`sw ${ciriacoStatus.warp.connected?'on':''}`} role="switch" aria-checked={!!ciriacoStatus.warp.connected}
              aria-label={ciriacoStatus.warp.connected?'Desconectar Cloudflare WARP':'Conectar Cloudflare WARP'} title={ciriacoStatus.warp.connected?'Desconectar WARP':'Conectar WARP'} />}
          </div>
          {warpError&&<p role="alert" style={{fontSize:'0.62rem',lineHeight:1.4,color:'var(--offline-red)',paddingLeft:'16px'}}>{warpError}</p>}
        </div>}
        {BOTTOM_NAV.map(({to,icon:Icon,label})=>(
          <NavLink key={to} to={to} className={({isActive})=>`nav-item ${isActive?'active':''}`} title={!sidebarOpen?label:undefined}>
            <Icon size={18} strokeWidth={1.8} className="shrink-0" />
            {sidebarOpen&&<span className="fade-in">{label}</span>}
          </NavLink>
        ))}
        {!isNativeApp&&!sidebarOpen&&<button onClick={toggleSidebar} className="nav-item justify-center" title="Abrir el menú" aria-label="Abrir el menú">
          <ChevronRight size={16} strokeWidth={1.8} />
        </button>}
      </div>
    </aside>
  );
}
