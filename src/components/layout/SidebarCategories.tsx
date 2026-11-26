import { useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { ChevronDown, ChevronRight, Folder, FolderOpen, Search } from 'lucide-react';
import type { Group } from '@/types';
import de from 'flag-icons/flags/4x3/de.svg';
import pl from 'flag-icons/flags/4x3/pl.svg';
import ru from 'flag-icons/flags/4x3/ru.svg';
import gb from 'flag-icons/flags/4x3/gb.svg';
import us from 'flag-icons/flags/4x3/us.svg';
import be from 'flag-icons/flags/4x3/be.svg';
import tr from 'flag-icons/flags/4x3/tr.svg';
import pt from 'flag-icons/flags/4x3/pt.svg';
import fr from 'flag-icons/flags/4x3/fr.svg';
import it from 'flag-icons/flags/4x3/it.svg';
import nl from 'flag-icons/flags/4x3/nl.svg';
import es from 'flag-icons/flags/4x3/es.svg';

/**
 * Categorías del menú lateral (escritorio) en carpetas: las principales a la vista y los canales de otros
 * países en una carpeta por país («ALEMANIA · DEPORTES» y «ALEMANIA» → Alemania › Deportes / Otros canales).
 * Con muchas categorías aparece un buscador. Las carpetas abiertas se recuerdan en este dispositivo.
 */
const KEY = 'topotv-sidebar-open';
const COUNTRY_RE = /^(REINO UNIDO|EE\. UU\.|PORTUGAL|FRANCIA|ITALIA|ALEMANIA|PAÍSES BAJOS|BÉLGICA|POLONIA|TURQUÍA|RUSIA)$/i;
const MAIN = 'Principales';
const FLAGS: Record<string, string> = { 'Reino Unido': gb, 'EE. UU.': us, 'Portugal': pt, 'Francia': fr, 'Italia': it, 'Alemania': de, 'Países Bajos': nl, 'Bélgica': be, 'Polonia': pl, 'Turquía': tr, 'Rusia': ru, [MAIN]: es };
/** Siglas que se quedan en mayúsculas al poner «LIGA DE CAMPEONES» como «Liga de Campeones». */
const KEEP = /^(TDT|NBA|NFL|RFEF|DAZN|M\+|F1|UFC|TV|ACB|ESPN|BT|TNT|HD|UK|EE\.|UU\.|II|III)$/;
const SMALL = /^(de|del|la|las|el|los|y|e|en)$/i;
const nice = (s: string) => s === s.toUpperCase() && /[A-ZÁÉÍÓÚÑ]{3}/.test(s)
  ? s.split(/(\s+|·)/).map((w, i) => KEEP.test(w) ? w : i > 0 && SMALL.test(w) ? w.toLowerCase() : w.charAt(0) + w.slice(1).toLowerCase()).join('')
  : s;

interface FolderNode { name: string; items: { group: Group; label: string }[]; count: number }
const pretty = (s: string) => s === 'EE. UU.' ? s : s.toLowerCase().replace(/(^|\s)(\p{L})/gu, (_, sp, c) => sp + c.toUpperCase());

function buildFolders(groups: Group[]): FolderNode[] {
  const folders = new Map<string, FolderNode>();
  const add = (folder: string, group: Group, label: string) => {
    if (!folders.has(folder)) folders.set(folder, { name: folder, items: [], count: 0 });
    const f = folders.get(folder)!;
    f.items.push({ group, label }); f.count += group.channels.length;
  };
  for (const g of groups) {
    const m = g.title.match(/^(.+?)\s+·\s+(.+)$/);
    if (m && COUNTRY_RE.test(m[1])) add(pretty(m[1]), g, pretty(m[2]));
    else if (COUNTRY_RE.test(g.title)) add(pretty(g.title), g, 'Otros canales');
    else add(MAIN, g, g.title);
  }
  // dentro de cada país, primero los deportes
  for (const f of folders.values()) if (f.name !== MAIN) f.items.sort((a, b) => Number(b.label === 'Deportes') - Number(a.label === 'Deportes'));
  const list = [...folders.values()];
  return list.sort((a, b) => Number(b.name === MAIN) - Number(a.name === MAIN) || a.name.localeCompare(b.name, 'es'));
}

export function SidebarCategories({ groups }: { groups: Group[] }) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>(() => { try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; } });
  const folders = useMemo(() => buildFolders(groups), [groups]);
  const toggle = (name: string) => setOpen(o => { const n = { ...o, [name]: !isOpen(name, o) }; try { localStorage.setItem(KEY, JSON.stringify(n)); } catch { /* sin almacenamiento */ } return n; });
  const isOpen = (name: string, o = open) => o[name] ?? name === MAIN;
  const query = q.trim().toLowerCase();
  const flat = folders.length === 1;   // sin países: la lista de siempre, sin carpetas

  const item = (g: Group, label: string, indent: boolean) => {
    const active = pathname === `/category/${g.id}`;
    return (
      <button key={g.id} onClick={() => navigate(`/category/${g.id}`)} className={`nav-item w-full text-left ${active ? 'active' : ''}`} title={`${g.title} · ${g.channels.length} canales`}
        style={{ padding: indent ? '6px 10px 6px 34px' : '7px 12px', gap: 10 }}>
        {g.logo ? <img src={g.logo} alt="" className="shrink-0 object-contain" style={{ width: 14, height: 14 }} onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} /> : <span className="cat-dot" />}
        <span className="truncate flex-1" style={{ fontSize: '0.78rem' }}>{nice(label)}</span>
        <span className="cat-count">{g.channels.length}</span>
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-0.5">
      {groups.length > 12 && (
        <label className="flex items-center gap-2 mx-1 mb-1" style={{ padding: '5px 10px', background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', borderRadius: 8 }}>
          <Search size={12} style={{ color: 'var(--text-muted)' }} />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar categoría" aria-label="Buscar categoría"
            style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: '0.72rem' }} />
        </label>
      )}
      {query
        ? folders.flatMap(f => f.items.filter(i => `${f.name} ${i.label} ${i.group.title}`.toLowerCase().includes(query)).map(i => item(i.group, f.name === MAIN ? i.label : `${f.name} · ${i.label}`, false)))
        : flat
          ? folders[0]?.items.map(i => item(i.group, i.label, false))
          : folders.map(f => {
            const o = isOpen(f.name);
            return (
              <div key={f.name}>
                <button onClick={() => toggle(f.name)} className="nav-item w-full text-left" aria-expanded={o} style={{ padding: '7px 10px', gap: 8 }}>
                  {o ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                  {FLAGS[f.name] ? <img className="folder-flag" src={FLAGS[f.name]} alt="" aria-hidden /> : o ? <FolderOpen size={15} strokeWidth={1.8} style={{ color: 'var(--accent)' }} /> : <Folder size={15} strokeWidth={1.8} />}
                  <span className="truncate flex-1" style={{ fontSize: '0.8rem', fontWeight: 600 }}>{f.name}</span>
                  <span className="cat-count">{f.count}</span>
                </button>
                {o && f.items.map(i => item(i.group, i.label, f.name !== MAIN))}
              </div>
            );
          })}
    </div>
  );
}
