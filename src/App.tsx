import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { AppShell } from '@/components/layout/AppShell';
import { ChannelsPage } from '@/pages/ChannelsPage';
import { LibraryPage } from '@/pages/LibraryPage';
import { MultiViewPage } from '@/pages/MultiViewPage';
import { MetaPage } from '@/pages/MetaPage';
import { RecordingsPage } from '@/pages/RecordingsPage';
import { Onboarding } from '@/components/shared/Onboarding';
import { BackgroundChecker } from '@/components/shared/BackgroundChecker';
import { useAddonsStore } from '@/store/useAddonsStore';
import { Reminders } from '@/components/shared/Reminders';
import { InputControls } from '@/components/shared/InputControls';
import { androidEdition, isAndroidTv } from '@/lib/externalPlayer';
import { engineWokeBefore, findEngineApp, installEngine, startEngineApp } from '@/lib/engineAndroid';
import { epgKnownIds, epgSourceUrls } from '@/lib/epg';
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

  // Modo TV: clase en <html> según el ajuste (automático = solo en Android TV)
  const tvMode = useSettingsStore(s => s.tvMode);
  const [deviceTv, setDeviceTv] = useState(false);
  useEffect(() => { if (Capacitor.isNativePlatform()) void Promise.all([isAndroidTv(), androidEdition()]).then(([tv, ed]) => setDeviceTv(tv || ed === 'tv')); }, []);
  useEffect(() => {
    const active = tvMode === 'on' || (tvMode === 'auto' && deviceTv);
    document.documentElement.classList.toggle('tv-mode', active);
  }, [tvMode, deviceTv]);

  // Catálogo de películas y series que viene de serie (Cinemeta)
  useEffect(() => { void useAddonsStore.getState().ensureDefaults(); }, []);

  // Tema de color, fondo negro, tamaño y tipo de letra
  const theme = useSettingsStore(s => s.theme);
  const amoled = useSettingsStore(s => s.amoled);
  const fontScale = useSettingsStore(s => s.fontScale);
  const fontFamily = useSettingsStore(s => s.fontFamily);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.classList.toggle('amoled', amoled);
    for (const f of ['small', 'large', 'xl'] as const) root.classList.toggle(`fs-${f}`, fontScale === f);
    root.classList.toggle('ff-system', fontFamily === 'system');
    root.classList.toggle('ff-legible', fontFamily === 'legible');
    // color de la barra del navegador / sistema a juego con el fondo del tema
    const bg = getComputedStyle(root).getPropertyValue('--bg-void').trim();
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg || '#080a0e');
  }, [theme, amoled, fontScale, fontFamily]);

  // Android: encender el motor AceStream (su app) al entrar, si está activado y no responde
  const onboardingDone = useSettingsStore(s => s.onboardingDone);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const { engineAutoStart, backendConfig } = useSettingsStore.getState();
    if (!engineAutoStart) return;
    void findEngineApp().then(async app => {
      if (app) {
        // con Ace Serve, la primera vez se espera a que el usuario vea un canal (Android preguntará con qué abrir y se explica allí)
        if (app.pkg === 'org.free.aceserve' && !engineWokeBefore()) return;
        await startEngineApp(backendConfig); void useSettingsStore.getState().checkBackend(); return;
      }
      // sin motor: se ofrece instalar el oficial una sola vez, cuando ya terminó la guía de bienvenida (luego, desde Ajustes → Motor AceStream)
      if (!useSettingsStore.getState().onboardingDone) return;
      let asked = false;
      try { asked = localStorage.getItem('topotv-engine-asked') === '1'; localStorage.setItem('topotv-engine-asked', '1'); } catch { /* sin almacenamiento */ }
      if (!asked && window.confirm('Para ver los canales de AceStream hace falta el motor oficial de AceStream. ¿Descargarlo e instalarlo ahora? (Android te pedirá confirmar)')) void installEngine(() => undefined);
    });
  }, [onboardingDone]); // eslint-disable-line react-hooks/exhaustive-deps

  // Estado del grabador de escritorio (botón «Grabar» en Eventos)
  useEffect(() => {
    const refresh = useRecorderStore.getState().refresh;
    void refresh();
    const interval = setInterval(refresh, 15000);
    return () => clearInterval(interval);
  }, []);

  // La guía se renueva cada 6 horas (si no, al día siguiente seguiría mostrando la de ayer)
  useEffect(() => {
    const interval = setInterval(() => {
      const { meta: m, allChannels: chs } = useM3UStore.getState();
      if (!m || !chs.length) return;
      useEPGStore.getState().reset();
      setTimeout(() => void useEPGStore.getState().load(epgSourceUrls(m.epgUrls ?? [], useSettingsStore.getState().manualEpgUrl), epgKnownIds(chs)), 300);
    }, 6 * 3600e3);
    return () => clearInterval(interval);
  }, []);

  // Al arrancar: TDT + listas del usuario (carpeta de listas, archivos guardados y enlaces) + agenda de Ciriaco, fusionadas por categorías.
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
    // load() decide: si la guía ya está cargada con estos canales no hace nada; si hay canales nuevos, recarga
    // (y si está cargando, lo deja pendiente para cuando termine)

    const urls = epgSourceUrls(meta.epgUrls ?? [], manualEpgUrl);
    const knownIds = epgKnownIds(allChannels);

    // Small delay so initial render finishes first
    const timer = setTimeout(() => loadEPG(urls, knownIds), 500);
    return () => clearTimeout(timer);
  }, [meta, allChannels, manualEpgUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  // Qué canales tienen guía (una sola consulta): para avisar de los que no tienen
  useEffect(() => {
    if (epgStatus !== 'ready' || !allChannels.length) return;
    const t = setTimeout(() => void useEPGStore.getState().computeCoverage(allChannels), 800);
    return () => clearTimeout(t);
  }, [epgStatus, allChannels]); // eslint-disable-line react-hooks/exhaustive-deps

  // If server was already loading when we opened, poll for completion
  useEffect(() => {
    if (epgStatus === 'loading' || epgStatus === 'parsing') {
      pollUntilReady();
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-trigger when manual URL changes
  useEffect(() => {
    if (!manualEpgUrl.trim() || !meta) return;
    loadEPG(epgSourceUrls(meta.epgUrls ?? [], manualEpgUrl), epgKnownIds(allChannels));
  }, [manualEpgUrl]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}

export default function App() {
  const isNativeApp = Capacitor.isNativePlatform();
  return (
    <BrowserRouter>
      <BackgroundPreloader />
      <BackgroundChecker />
      <Reminders />
      <InputControls />
      <Onboarding />
      <AppShell>
        <Routes>
          <Route path="/"               element={<HomePage />} />
          <Route path="/categories"     element={<ChannelsPage />} />
          <Route path="/favorites"      element={<FavoritesPage />} />
          <Route path="/tv-guide" element={<Navigate to="/events" replace />} />
          <Route path="/epg-xmltv" element={<TVGuidePage />} />
          <Route path="/guide" element={<TVGuidePage />} />
          <Route path="/events" element={<EventsPage />} />
          <Route path="/recordings" element={<RecordingsPage />} />
          <Route path="/scores" element={<EventsPage />} />
          <Route path="/flashscore" element={<FlashscorePage />} />
          <Route path="/checker"        element={<CheckerPage />} />
          <Route path="/category/:slug" element={<CategoryPage />} />
          <Route path="/channel/:id"    element={<ChannelPage />} />
          <Route path="/multi"          element={<MultiViewPage />} />
          <Route path="/library"        element={<LibraryPage />} />
          <Route path="/library/:type/:id" element={<MetaPage />} />
          <Route path="/search"         element={<SearchPage />} />
          <Route path="/settings"       element={<SettingsPage />} />
          {isNativeApp&&<Route path="*" element={<Navigate to="/" replace />} />}
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}
