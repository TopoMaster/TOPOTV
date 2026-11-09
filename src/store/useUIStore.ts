import { create } from 'zustand';
interface UIState {
  sidebarOpen: boolean; searchOpen: boolean; activeGroupId: string | null;
  setSidebarOpen: (v: boolean) => void; toggleSidebar: () => void;
  setSearchOpen: (v: boolean) => void; setActiveGroup: (id: string | null) => void;
  onboardingOpen: boolean; setOnboardingOpen: (v: boolean) => void;
}
export const useUIStore = create<UIState>((set) => ({
  sidebarOpen: true, searchOpen: false, activeGroupId: null,
  setSidebarOpen: (v) => set({ sidebarOpen: v }),
  toggleSidebar: () => set(s => ({ sidebarOpen: !s.sidebarOpen })),
  setSearchOpen: (v) => set({ searchOpen: v }),
  setActiveGroup: (id) => set({ activeGroupId: id }),
  onboardingOpen: false, setOnboardingOpen: (v) => set({ onboardingOpen: v }),
}));
