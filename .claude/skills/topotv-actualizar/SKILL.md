---
name: topotv-actualizar
description: Flujo completo para actualizar TOPOTV (web, Windows/Electron y Android/Capacitor) - cambiar código, verificar, subir versión, publicar release en GitHub y comprobar que están el .exe, la .apk y el .zip. Úsala SIEMPRE que Alvaro pida cambiar, arreglar, mejorar o publicar algo de TOPOTV (canales, listas M3U Elcano/Ciriaco, eventos, WARP, VLC, logo/estética, APK, instalador, "sube la release", "actualiza", "no me funciona en el móvil"), aunque no nombre la skill.
---

# Actualizar TOPOTV

Proyecto: `c:\Users\Usuario\Desktop\TOPOCODE\topotv-proyecto` · repo `TopoMaster/TOPOTV` (rama `main`). Responde siempre en español, con frases cortas y sin jerga innecesaria: Alvaro prueba la app en su móvil y en Windows, no lee código.

## Cómo está montado

- **Web (React 19 + Vite + zustand + Tailwind)** en `src/`. Se compila con `npm run build` (`tsc -b && vite build`).
- **Windows**: Electron en `desktop/`. Arranca servicios locales: web 5174, **Ciriaco 3004** (`tools/ciriaco-server.cjs`, lee la agenda y gestiona **WARP**), VLC helper 3002, enlaces compartidos 3005/3006.
- **Android**: Capacitor 8 en `android/`. No hay servidores locales, así que `src/lib/ciriacoNative.ts` (agenda Ciriaco) y `src/lib/epgNative.ts` (EPG XMLTV) hacen dentro del móvil lo que en Windows hacen los servidores. VLC se abre con el plugin nativo `android/app/src/main/java/tv/topo/topotv/ExternalPlayerPlugin.java` (envoltorio en `src/lib/externalPlayer.ts`).
- **Listas de canales**: `withDefaultSources()` en `src/lib/ciriaco.ts` carga siempre Elcano (categorías) + URLs del usuario + Ciriaco al final. `mergeM3ULists()` en `src/lib/m3uParser.ts` las fusiona por categorías: un canal de Ciriaco que ya existe suma enlaces; si no existe va a su categoría por palabras del nombre (`CATEGORY_RULES`, por defecto "DEPORTES"). No debe existir un grupo "TOPOTV".
- **WARP**: en Windows, `CIRIACO_WARP` por defecto `always`: se conecta para actualizar y se desconecta al terminar, para que la reproducción vaya sin VPN. En Android no hay WARP: el usuario activa su VPN.
- **Grabaciones (Windows y Android)**: en Android `RecorderPlugin`/`RecorderService`/`RecorderReceiver`/`RecordingStore` (alarma `setAlarmClock` + servicio en primer plano tipo dataSync, guarda en Películas/TOPOTV con MediaStore); `src/lib/recorder.ts` elige HTTP 3007 o plugin con el mismo contrato. Sin probar en móvil real. En Windows: `tools/recorder.cjs` (puerto 3007) programa y graba el stream del motor AceStream en .ts (carpeta Vídeos/TOPOTV); cliente en `src/lib/recorder.ts`, página `RecordingsPage.tsx`, botón Grabar en `EventRow`. Prueba aislada: motor falso + `recorder.cjs` con `RECORDER_PORT` distinto.
- **Android y la agenda**: la web de Ciriaco dibuja la tabla con JavaScript, así que la APK usa un WebView oculto (`AgendaScraperPlugin.java`) y, si falla, descarga HTML directa. El script que se ejecuta en la página (`IN_PAGE_SCRIPT`) se puede validar en Chromium headless con una página que dibuje la tabla.
- **TDT**: `src/lib/tdt.ts` (lista curada de emisiones HLS oficiales verificadas; se convierte en M3U y pasa por el mismo parser). Los streams que no son del motor llevan `direct: true`; usa siempre `streamPlayUrl()` / `streamHlsUrl()` de `aceApi.ts`, nunca `buildStreamUrl(stream.aceId)` a pelo. Las privadas (Antena 3, Telecinco…) no se incluyen: emiten con protección.
- **EPG**: `tools/epg-server.cjs` (puerto 3003, arrancado desde `main.cjs`, procesa XMLTV con regex y soporta .gz) en Windows; `epgNative.ts` (mismo método, sin DOM) en Android. Las guías de Elcano (`ELCANO_EPG_URLS` en `src/lib/epg.ts`) se cargan SIEMPRE junto a las de las listas y la manual (`epgSourceUrls`), y se renuevan cada 6 h. Probado con la guía real (34 MB en ~2 s).
- **Modo TV** (`tvMode` en ajustes, clase `html.tv-mode`, CSS con `zoom`; auto = `isAndroidTv()` del plugin) y **guía de primer arranque** (`components/shared/Onboarding.tsx`, `onboardingDone`).
- **WARP en Android**: `WarpPlugin.java` (WireGuard `com.wireguard.android:tunnel` + cuenta WARP gratuita registrada con la API de Cloudflare, VPN por aplicación solo para TOPOTV). `ciriacoNative.nativeScrape` lo conecta y lo apaga. Experimental: no probado en dispositivo.
- **Motor AceStream**: no se puede meter dentro de la APK (software propietario). Windows lo lleva en el instalador (`install-deps.ps1`) y hay botón Encender/Apagar en la barra lateral (`/engine/start|stop` del asistente VLC). Android: `src/lib/engineAndroid.ts` detecta la app con motor (Ace Serve `org.free.aceserve`, Ace Stream Media/Engine…), la abre con `ExternalPlayerPlugin.launchApp` y espera al puerto 6878; apagar solo es posible abriendo la pantalla de información de la app (Android no deja cerrar apps ajenas). Estudiado el APK de Ace Serve que pasó Alvaro (`org.free.aceserve_1.5.0_14.apk`, ignorado por git por `*.apk`): es una app Mono/Avalonia solo arm64 que empaqueta el motor oficial de AceStream (CoreApp.so, live.so, node.so + Python), sin servicios exportados salvo MainActivity y el manejador de `acestream://`. Alvaro decidió llevar ese APK DENTRO de nuestra app: está en `android/app/src/main/assets/engine/aceserve.apk` (60 MB, `noCompress 'apk'`) y `ApkInstallerPlugin.installBundled` lo copia a caché y abre el instalador de Android (el usuario confirma; solo arm64; si no hay asset o el móvil no es arm64 se descarga el motor oficial de `download.acestream.media/products/android[-tv]/acestream-core/<abi>/latest`). OJO: `*.apk` está en .gitignore, así que ese asset NO viaja a GitHub ni a las releases de CI salvo que se añada con `git add -f` (sería redistribuir software de terceros en un repo público: avisado a Alvaro, decide él). Sin el asset, la APK de CI cae en la descarga oficial. v1.0.9 añade el ORIGEN PRIVADO: Ajustes → Motor AceStream → enlace https (+ token opcional) que `installEngine` usa antes que el asset y la descarga oficial (`directDownloadUrl` convierte enlaces de Drive/Dropbox; el token solo se manda al primer host). Es la forma de no redistribuir el motor en el repo público. Además `pickAndInstall` (Ajustes → «Elegir el APK del motor») instala un APK elegido del almacenamiento sin token. El motor vive en un repo PRIVADO aparte (carpeta local `../topotv-motor`, repo `TopoMaster/TOPOTV-motor`, URL raw `https://raw.githubusercontent.com/TopoMaster/TOPOTV-motor/main/aceserve.apk` + token de solo lectura): el repo público TOPOTV NO se hace privado. Crear tokens/cambiar visibilidad exige el código de verificación de GitHub, que a Alvaro no le llegaba.
- Guía TV fue eliminada a petición de Alvaro (`/tv-guide` redirige a Eventos). No la reintroduzcas.
- Marca: logo de topo (`public/favicon.svg`, `src/components/brand/Logo.tsx`, iconos Android en `res/mipmap-*`, `desktop/build/icon.png|ico`). Paleta oscura con acento dorado (`src/index.css`).

## Flujo de una actualización

1. **Entender y acotar.** Si el pedido es ambiguo y cambia mucho el trabajo (p. ej. "grabar eventos"), pregunta una vez con opciones concretas; si no, decide y avisa de lo decidido.
2. **Editar.** Prefiere Edit/Write. Los archivos del repo están en CRLF (git avisa "LF will be replaced", es normal).
3. **Verificar antes de decir "hecho"** (no des por bueno lo que no hayas ejecutado):
   - `npx tsc -b` y `npm run build` sin errores.
   - Cambios visuales: capturas con el Chromium de Playwright (ver Trampas) en 1366 px y 500 px de ancho.
   - Cambios de lógica de listas: prueba rápida con `npx -y tsx --tsconfig tsconfig.app.json` sobre un fichero temporal dentro de `src/` (bórralo después).
   - Cambios Android: `npx cap sync android` y, en PowerShell, `$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"; cd android; .\gradlew.bat --no-daemon assembleDebug`.
4. **Versionar** (solo si va a publicarse): subir versión en `package.json` y `desktop/package.json` (deben coincidir; el workflow exige tag `v<versión>`), en las dos primeras líneas de versión de `package-lock.json` y `desktop/package-lock.json`, y los enlaces del `README.md`.
5. **Publicar** cuando Alvaro lo pida (ha pedido las releases en cada ciclo; si no queda claro, pregunta): `git add -A`, commit con el pie `Co-Authored-By` que indique el sistema, `git push origin main`, `git tag -a vX.Y.Z -m "TOPOTV vX.Y.Z"`, `git push origin vX.Y.Z`. No uses force, no saltes hooks.
6. **Esperar y comprobar la release.** El workflow `Build TOPOTV` tarda varios minutos. Usa un `until` en segundo plano (`run_in_background`) sobre `https://api.github.com/repos/TopoMaster/TOPOTV/releases/tags/vX.Y.Z` con `sleep 45`. Confirma que están `TOPOTV-Setup-X.Y.Z.exe`, `TOPOTV-vX.Y.Z.apk` y `TOPOTV-Web-vX.Y.Z.zip` y da los tres enlaces. Si Alvaro pregunta "¿cómo va?", consulta el estado real, no supongas.

## Trampas que ya nos han mordido

- **Los servidores de escritorio se editan en `tools/` (raíz), NUNCA en `desktop/tools/`**: esa carpeta está en .gitignore y la regenera `desktop/scripts/prepare.cjs` copiando una lista fija de archivos. Si añades un archivo nuevo a `tools/`, añádelo también a esa lista. (En v1.0.4 se editó la copia ignorada y el WARP automático no llegó a la release; se corrigió en v1.0.5.) Antes de publicar, comprueba con `git status` que los archivos tocados aparecen.
- **Scripts con barras invertidas o regex por heredoc de Bash**: la herramienta los corrompe (`\b` se convierte en carácter de retroceso, `\\` se pierde). Escribe esos scripts con la herramienta Write y ejecútalos con `node`. Después de editar regex, comprueba que no hay caracteres `\x08` en `src/`.
- **No hay Python** en la máquina. Usa Node.
- **gh no está autenticado**; `git push` sí funciona. Para consultar GitHub usa la API pública con `curl` y **sin sondear en bucle rápido**: el límite sin autenticar se agota (devuelve "rate limit exceeded"). Espera con `sleep 45` o más.
- **Chromium headless** (`C:/Users/Usuario/AppData/Local/ms-playwright/chromium-1248/chrome-win64/chrome.exe`): la ventana mínima ronda 500 px, así que capturas a 400 px salen recortadas; usa `--window-size=500,900`. Para esperar a la carga usa `--virtual-time-budget`. La ruta de `--screenshot` debe ser de Windows con barras normales (`C:/...`).
- **Red de pruebas**: Elcano y Ciriaco pueden dar timeout o 000 desde aquí. Si fallan, usa un servidor simulado en el puerto 3004 (`/health`, `/api/ciriaco/events`, `/api/ciriaco/status`, `playlist.m3u`) y dilo: no afirmes que la carga real funciona.
- **Procesos sueltos**: al terminar, para `vite preview` y los mocks (PowerShell: `Get-CimInstance Win32_Process` + `Stop-Process`; no existe `pkill`).
- **Android 11+** oculta paquetes ajenos: no compruebes si VLC está instalado con `getPackageInfo`; intenta abrirlo y reacciona (y mantén el bloque `<queries>` del manifiesto).
- **Cambios de ajustes persistentes**: `preferredPlayer` se guarda en el dispositivo; cambiar su valor por defecto no afecta a quien ya lo tiene guardado.

## Sé honesto con lo no verificado

Anota siempre en la respuesta final qué NO se ha probado en dispositivo real. Pendientes conocidos: la lectura de `ciriaco.netlify.app` desde la APK (depende de que la web entregue las tablas sin JavaScript), la apertura de VLC en un Android real, la guía EPG con una lista real y WARP automático en un Windows con Cloudflare WARP instalado.

## Otras skills que conviene invocar

- `code-review` (o `/code-review`) antes de publicar cambios grandes o de lógica de listas/reproducción.
- `simplify` tras añadir mucho código, para limpiar duplicados.
- `security-review` si se toca red, intents de Android, el servidor local o el servicio de enlaces compartidos.
- `run` para arrancar la app y ver un cambio funcionando.
- `fewer-permission-prompts` / `update-config` si Alvaro se queja de pedir permiso a cada comando.
- No necesitas las skills `kairos-*`, `soundsystem-*`, `termux-*` ni `topocode-*` para TOPOTV: son de otros proyectos.

## Ideas ya valoradas (no implementadas)

- (Hecho en 1.0.8) Grabación en Android: arriesgada por el ahorro de batería de cada fabricante; si falla, mirar primero ese ajuste del móvil. Alvaro comprobó en el registro de Windows (`%APPDATA%/TOPOTV/topotv.log`) que seguía con 1.0.2: antes de investigar «no me sale X», mira qué versión corre de verdad.
