import { Upload, Tv, AlertCircle } from 'lucide-react';
import { useM3UStore } from '@/store/useM3UStore';
import { useRef } from 'react';

export function EmptyState() {
  const { loadFromFile, isLoading } = useM3UStore();
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-col items-center justify-center fade-in" style={{minHeight:'70vh',gap:'24px'}}>
      <div style={{width:'80px',height:'80px',borderRadius:'20px',background:'var(--bg-elevated)',border:'1px solid var(--border-mid)',display:'flex',alignItems:'center',justifyContent:'center'}}>
        <Tv size={36} strokeWidth={1} style={{color:'var(--text-muted)'}} />
      </div>
      <div className="text-center" style={{maxWidth:'360px'}}>
        <h2 className="font-display" style={{fontSize:'2rem',marginBottom:'8px'}}>Sin lista cargada</h2>
        <p style={{color:'var(--text-secondary)',fontSize:'0.9rem',lineHeight:1.6}}>Carga tu archivo M3U para empezar a navegar los canales.</p>
      </div>
      <button onClick={()=>fileRef.current?.click()} disabled={isLoading}
        className="flex items-center gap-2"
        style={{padding:'12px 28px',background:'var(--accent)',color:'#080a0e',border:'none',borderRadius:'var(--radius-md)',fontSize:'0.85rem',fontWeight:700,letterSpacing:'0.06em',textTransform:'uppercase',cursor:isLoading?'not-allowed':'pointer',opacity:isLoading?0.6:1}}>
        <Upload size={16} strokeWidth={2.5} />{isLoading?'Cargando...':'Cargar archivo M3U'}
      </button>
      <input ref={fileRef} type="file" accept=".m3u,.m3u8" className="hidden"
        onChange={async e=>{const f=e.target.files?.[0];if(f)await loadFromFile(f);e.target.value='';}} />
    </div>
  );
}

export function LoadingState({message='Cargando...'}:{message?:string}) {
  return (
    <div className="flex flex-col items-center justify-center fade-in" style={{minHeight:'70vh',gap:'16px'}}>
      <div style={{width:'36px',height:'36px',border:'2px solid var(--border-mid)',borderTopColor:'var(--accent)',borderRadius:'50%',animation:'spin 0.8s linear infinite'}} />
      <p style={{color:'var(--text-muted)',fontSize:'0.85rem',letterSpacing:'0.04em'}}>{message}</p>
    </div>
  );
}

export function ErrorState({message}:{message:string}) {
  return (
    <div className="flex flex-col items-center justify-center fade-in" style={{minHeight:'40vh',gap:'16px'}}>
      <AlertCircle size={40} strokeWidth={1} style={{color:'var(--offline-red)'}} />
      <p style={{color:'var(--text-secondary)',fontSize:'0.9rem',maxWidth:'320px',textAlign:'center'}}>{message}</p>
    </div>
  );
}
