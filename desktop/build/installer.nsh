; Dependencias de TOPOTV: Cloudflare WARP, VLC y AceStream. Se ofrecen si no están instaladas.
!macro customInstall
  IfSilent deps_done

  ; --- Cloudflare WARP (solo se usa durante la actualización diaria de la agenda) ---
  IfFileExists "$PROGRAMFILES64\Cloudflare\Cloudflare WARP\warp-cli.exe" warp_ok warp_ask
  warp_ask:
    MessageBox MB_YESNO|MB_ICONQUESTION "TOPOTV usa Cloudflare WARP para poder leer la agenda de eventos si tu operador la bloquea (se conecta solo unos segundos al día).$\r$\n$\r$\n¿Instalar Cloudflare WARP ahora?" IDNO warp_ok
    DetailPrint "Instalando Cloudflare WARP..."
    nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\resources\install-deps.ps1" -Dep warp'
  warp_ok:

  ; --- VLC ---
  IfFileExists "$PROGRAMFILES64\VideoLAN\VLC\vlc.exe" vlc_ok 0
  IfFileExists "$PROGRAMFILES32\VideoLAN\VLC\vlc.exe" vlc_ok vlc_ask
  vlc_ask:
    MessageBox MB_YESNO|MB_ICONQUESTION "TOPOTV reproduce los canales con VLC.$\r$\n$\r$\n¿Instalar VLC ahora?" IDNO vlc_ok
    DetailPrint "Instalando VLC..."
    nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\resources\install-deps.ps1" -Dep vlc'
  vlc_ok:

  ; --- AceStream (motor) ---
  SetShellVarContext current
  IfFileExists "$APPDATA\ACEStream\engine\ace_engine.exe" ace_ok ace_ask
  ace_ask:
    MessageBox MB_YESNO|MB_ICONQUESTION "TOPOTV necesita el motor AceStream para reproducir.$\r$\n$\r$\nSe abrirá el instalador oficial de AceStream Media (no tiene modo silencioso): sigue sus pasos.$\r$\n$\r$\n¿Instalar AceStream ahora?" IDNO ace_ok
    DetailPrint "Instalando AceStream Media..."
    nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\resources\install-deps.ps1" -Dep ace'
  ace_ok:
  SetShellVarContext all

  deps_done:
!macroend
