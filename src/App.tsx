import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { AppShell } from '@/components/layout/AppShell';
import { ChannelsPage } from '@/pages/ChannelsPage';
import { RecordingsPage } from '@/pages/RecordingsPage';
import { useRecorderStore } from '@/store/useRecorderStore';
import { HomePage } from '@/pages/HomePage';
import { CategoryPage } from '@/pages/CategoryPage';
import { ChannelPage } from '@/pages/ChannelPage';
import { SearchPage } from '@/pages/SearchPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { FavoritesPage } from '@/pages/FavoritesPage';
import { TVGuidePage } from '@/pages/TVGuidePage';
import { EventsPage } from '@/pages/EventsPage';
import { FlashscorePage } from '@/pages/FlashscorePage';
import { CheckerPage } from '@/pages/CheckerPage';
import { useM3UStore } from '@/store/useM3UStore';
import { useSettingsStore } from '@/store/useSettingsStore';
import { useEPGStore } from '@/store/useEPGStore';
import { checkCiriaco } from '@/lib/ciriaco';
import { useCiriacoStore } from '@/store/useCiriacoStore';

/**
 * BackgroundPreloader
 *
 * On startup:
 * 1. Syncs EPG server status (server started by setup.bat before opening browser)
 * 2. If server is already ready (cached), updates store immediately
 * 3. If server is loading, starts polling until done
 * 4. If M3U is loaded and server is idle, triggers a new EPG load
 *
 * Zero parsing in the browser — everything runs in Node.js (epg-server.cjs)
 */
function BackgroundPreloader() {
  const meta         = useM3UStore(s => s.meta);
  const allChannels  = useM3UStore(s => s.allChannels);
  const manualEpgUrl = useSettingsStore(s => s.manualEpgUrl);
  const loadEPG      = useEPGStore(s => s.load);
  const syncStatus   = useEPGStore(s => s.syncStatus);
  const syncCiriacoStatus = useCiriacoStore(s => s.syncStatus);
  const pollUntilReady = useEPGStore(s => s.pollUntilReady);
  const epgStatus    = useEPGStore(s => s.status);

  // Estado del motor AceStream (punto verde/rojo del menú)
  const checkBackend = useSettingsStore(s => s.checkBackend);
  useEffect(() => { checkBackend(); const i = setInterval(checkBackend, 30000); return () => clearInterval(i); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // On mount: check if EPG server already has data (from cache or previous session)
  useEffect(() => {
    syncStatus();
  }, []);

  useEffect(() => {
    syncCiriacoStatus();
    const interval = setInterval(syncCiriacoStatus, 10000);
    return () => clearInterval(interval);
  }, [syncCiriacoStatus]);

  // Estado del grabador de escritorio (botón «Grabar» en Eventos)
  useEffect(() => {
    if (Capacitor.isNativePlatform()) return;
    const refresh = useRecorderStore.getState().refresh;
    void refresh();
    const interval = setInterval(refresh, 15000);
    return () => clearInterval(interval);
  }, []);

  // Al arrancar: Elcano + listas del usuario + agenda de Ciriaco, fusionadas por categorías.
  useEffect(() => {
    let cancelled = false;
    const loadSources = async () => {
      const reload = () => useM3UStore.getState().reloadSources();
      const isNative = Capacitor.isNativePlatform();
      const online = isNative || await checkCiriaco();
      if (!isNative && online) useCiriacoStore.getState().load();
      await reload();
      if (isNative || online) return;
      // Escritorio: el servicio local de Ciriaco puede tardar unos segundos en arrancar.
      for (let attempt = 0; attempt < 8 && !cancelled; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 750));
        if (await checkCiriaco()) {
          useCiriacoStore.getState().load();
          if (!cancelled) await reload();
          return;
        }
      }
    };
    void loadSources();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!allChannels.length) return;
    const refreshMs = Math.max(5 * 60 * 1000, (meta?.refreshInterval ?? 3600) * 1000);
    const interval = setInterval(() => { void useM3UStore.getState().reloadSources(); }, refreshMs);
    return () => clearInterval(interval);
  }, [meta?.refreshInterval, allChannels.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

  // When M3U loads: trigger EPG load on server if needed
  useEffect(() => {
    if (!meta || allChannels.length === 0) return;
    if (epgStatus === 'ready' || epgStatus === 'loading' || epgStatus === 'parsing') return;

    const fromM3U = meta.epgUrls ?? [];
    const urls = [
      ...(manualEpgUrl.trim() ? [manualEpgUrl.trim()] : []),
      ...fromM3U,
    ].filter(Boolean);

    if (urls.length === 0) return;

    const knownIds = allChannels.map(c => c.tvgId).filter(Boolean);

    // Small delay so initial render finishes first
    const timer = setTimeout(() => loadEPG(urls, knownIds), 500);
    return () => clearTimeout(timer);
  }, [meta, allChannels, manualEpgUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // If server was already loading when we opened, poll for completion
  useEffect(() => {
    if (epgStatus === 'loading' || epgStatus === 'parsing') {
      pollUntilReady();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-trigger when manual URL changes
  useEffect(() => {
    if (!manualEpgUrl.trim() || !meta) return;
    const knownIds = allChannels.map(c => c.tvgId).filter(Boolean);
    const urls = [manualEpgUrl.trim(), ...(meta.epgUrls ?? [])];
    loadEPG(urls, knownIds);
  }, [manualEpgUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

export default function App() {
  const isNativeApp = Capacitor.isNativePlatform();
  return (
    <BrowserRouter>
      <BackgroundPreloader />
      <AppShell>
        <Routes>
          <Route path="/"               element={<HomePage />} />
          <Route path="/categories"     element={<ChannelsPage />} />
          <Route path="/favorites"      element={<FavoritesPage />} />
          <Route path="/tv-guide" element={<Navigate to="/events" replace />} />
          <Route path="/epg-xmltv" element={<TVGuidePage />} />
          <Route path="/events" element={<EventsPage />} />
          {!isNativeApp&&<Route path="/recordings" element={<RecordingsPage />} />}
          <Route path="/scores" element={<EventsPage />} />
          <Route path="/flashscore" element={<FlashscorePage />} />
          <Route path="/checker"        element={<CheckerPage />} />
          <Route path="/category/:slug" element={<CategoryPage />} />
          <Route path="/channel/:id"    element={<ChannelPage />} />
          <Route path="/search"         element={<SearchPage />} />
          <Route path="/settings"       element={<SettingsPage />} />
          {isNativeApp&&<Route path="*" element={<Navigate to="/" replace />} />}
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}
