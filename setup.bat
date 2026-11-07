@echo off
setlocal
cd /d "%~dp0"
echo ============================================
echo  AceStream TV - Arranque
echo ============================================

if not exist node_modules (
  echo [1/4] Instalando dependencias...
  call npm install || (echo Error en npm install & pause & exit /b 1)
)

if not exist tools\node_modules\playwright (
  echo [2/4] Instalando Playwright para Ciriaco...
  pushd tools
  if not exist package.json (call npm init -y >nul)
  call npm install playwright
  call npx playwright install chromium
  popd
)

echo [3/4] Arrancando servidores auxiliares...
REM Ciriaco se actualiza 1 vez al dia. Si no carga directo, el servidor activa Cloudflare WARP
REM SOLO durante la actualizacion y lo desconecta despues (CIRIACO_WARP=auto^|always^|off).
REM set CIRIACO_WARP=auto
if exist tools\share-server.cjs   start "Compartir :3005/3006" /min node tools\share-server.cjs
if exist tools\vlc-helper.cjs     start "VLC Helper :3002" /min node tools\vlc-helper.cjs
if exist tools\epg-server.cjs     start "EPG :3003"        /min node tools\epg-server.cjs
if exist tools\ciriaco-server.cjs start "Ciriaco :3004"    /min cmd /c "cd tools && node ciriaco-server.cjs"
if exist flashscore-proxy\server.js start "Proxy :3001"    /min cmd /c "cd flashscore-proxy && node server.js"

if not exist tools\vlc-helper.cjs echo AVISO: falta tools\vlc-helper.cjs (VLC no se podra abrir)
echo Comprobando Ciriaco...
set /a n=0
:wait
node -e "require('http').get('http://127.0.0.1:3004/health',r=>process.exit(r.statusCode==200?0:1)).on('error',()=>process.exit(1))"
if errorlevel 1 (
  set /a n+=1
  if %n% lss 10 (timeout /t 1 >nul & goto wait)
  echo AVISO: Ciriaco no responde en :3004
) else (echo Ciriaco OK)

echo [4/4] Iniciando app en http://localhost:5173
start "" cmd /c "timeout /t 4 >nul & start http://localhost:5173"
call npm run dev
