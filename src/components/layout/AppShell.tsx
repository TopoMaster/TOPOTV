import type { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { useUIStore } from '@/store/useUIStore';
import { PlayerOverlay } from '@/components/player/PlayerOverlay';
import { UpdateBanner } from '@/components/shared/UpdateBanner';
export function AppShell({ children }: { children: ReactNode }) {
  const sidebarOpen = useUIStore(s => s.sidebarOpen);
  return (
    <div className="app-shell flex h-screen overflow-hidden" style={{background:'var(--bg-void)'}}>
      <Sidebar />
      <div className="app-content flex flex-col flex-1 min-w-0 transition-all duration-300" style={{marginLeft:sidebarOpen?'240px':'64px'}}>
        <UpdateBanner />
        <TopBar />
        <main className="flex-1 overflow-y-auto" style={{background:'radial-gradient(900px 360px at 75% -80px, rgba(226,201,126,0.09), transparent 70%), var(--bg-void)'}}>{children}</main>
      </div>
      <PlayerOverlay />
    </div>
  );
}
