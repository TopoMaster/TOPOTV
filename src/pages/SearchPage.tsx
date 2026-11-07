import { useState, useEffect, useRef } from 'react';
import { Search, X } from 'lucide-react';
import { useM3UStore } from '@/store/useM3UStore';
import { ChannelCard } from '@/components/catalog/ChannelCard';
import { EmptyState } from '@/components/shared/States';
import type { Channel } from '@/types';

export function SearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Channel[]>([]);
  const searchChannels = useM3UStore(s=>s.searchChannels);
  const allChannels = useM3UStore(s=>s.allChannels);
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(()=>{ inputRef.current?.focus(); },[]);
  useEffect(()=>{ setResults(query.trim()?searchChannels(query.trim()):[]) },[query,searchChannels]);
  if (!allChannels.length) return <EmptyState />;
  return (
    <div className="fade-in" style={{padding:'24px',paddingBottom:'48px'}}>
      <div className="flex items-center gap-3 mb-8" style={{background:'var(--bg-card)',border:'1px solid var(--border-mid)',borderRadius:'var(--radius-lg)',padding:'0 16px',maxWidth:'600px'}} onFocusCapture={e=>(e.currentTarget.style.borderColor='var(--border-accent)')} onBlurCapture={e=>(e.currentTarget.style.borderColor='var(--border-mid)')}>
        <Search size={18} strokeWidth={1.8} style={{color:'var(--text-muted)',flexShrink:0}} />
        <input ref={inputRef} type="text" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Buscar canales, categorías..." style={{flex:1,background:'transparent',border:'none',outline:'none',color:'var(--text-primary)',fontSize:'1rem',padding:'14px 0',fontFamily:'DM Sans,sans-serif'}} />
        {query&&<button onClick={()=>setQuery('')} style={{background:'none',border:'none',cursor:'pointer',color:'var(--text-muted)',padding:'4px',display:'flex',alignItems:'center'}}><X size={16} strokeWidth={2} /></button>}
      </div>
      {!query.trim()
        ? <div style={{textAlign:'center',color:'var(--text-muted)',marginTop:'60px'}}><p style={{fontSize:'0.85rem',letterSpacing:'0.04em'}}>Escribe para buscar entre {allChannels.length} canales</p></div>
        : results.length===0
          ? <div style={{textAlign:'center',color:'var(--text-muted)',marginTop:'60px'}}><p>Sin resultados para "{query}"</p></div>
          : <>
              <p style={{color:'var(--text-muted)',fontSize:'0.78rem',marginBottom:'16px'}}>{results.length} resultado{results.length!==1?'s':''}</p>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))',gap:'16px'}}>
                {results.map((ch,i)=><div key={ch.id} className="slide-up" style={{animationDelay:`${Math.min(i*0.02,0.3)}s`}}><ChannelCard channel={ch} size="md" /></div>)}
              </div>
            </>
      }
    </div>
  );
}
