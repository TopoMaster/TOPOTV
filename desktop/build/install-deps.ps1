# Instala una dependencia de TOPOTV. Uso: install-deps.ps1 -Dep warp|vlc|ace
param([Parameter(Mandatory=$true)][ValidateSet('warp','vlc','ace')][string]$Dep)
$ErrorActionPreference = 'Continue'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Have-Winget { return [bool](Get-Command winget -ErrorAction SilentlyContinue) }
function Download($url, $out) { Write-Host "Descargando $url"; Invoke-WebRequest -Uri $url -OutFile $out -UseBasicParsing }

# No se ejecuta nada descargado sin comprobar su firma digital (y, si se conoce, quién la firma).
function Test-Signed($file, $publisher) {
  $sig = Get-AuthenticodeSignature -FilePath $file
  if ($sig.Status -ne 'Valid') { Write-Host "ERROR: $file no tiene una firma digital válida ($($sig.Status)). No se instala."; return $false }
  $subject = $sig.SignerCertificate.Subject
  if ($publisher -and $subject -notmatch $publisher) { Write-Host "ERROR: el archivo está firmado por '$subject', no por el editor esperado. No se instala."; return $false }
  Write-Host "Firma válida: $subject"; return $true
}

switch ($Dep) {
  'warp' {
    if (Have-Winget) {
      winget install --id Cloudflare.Warp -e --silent --accept-package-agreements --accept-source-agreements
      if ($LASTEXITCODE -eq 0) { exit 0 }
    }
    $f = Join-Path $env:TEMP 'Cloudflare_WARP.msi'
    Download 'https://downloads.cloudflareclient.com/v1/download/windows/ga' $f
    if (-not (Test-Signed $f 'Cloudflare')) { Remove-Item $f -ErrorAction SilentlyContinue; exit 1 }
    Start-Process msiexec.exe -ArgumentList "/i `"$f`" /qn /norestart" -Wait
  }
  'vlc' {
    if (Have-Winget) {
      winget install --id VideoLAN.VLC -e --silent --accept-package-agreements --accept-source-agreements
      if ($LASTEXITCODE -eq 0) { exit 0 }
    }
    $f = Join-Path $env:TEMP 'vlc-setup.exe'
    Download 'https://get.videolan.org/vlc/last/win64/vlc-3.0.21-win64.exe' $f
    if (-not (Test-Signed $f 'VideoLAN')) { Remove-Item $f -ErrorAction SilentlyContinue; exit 1 }
    Start-Process $f -ArgumentList '/S' -Wait
  }
  'ace' {
    # Instalador oficial de AceStream Media 3.2.8 (incluido en el instalador de TOPOTV). No tiene modo silencioso: se abre su asistente.
    $f = Join-Path $PSScriptRoot 'Ace_Stream_Media_3_2_8.exe'
    if (-not (Test-Path $f)) {
      $f = Join-Path $env:TEMP 'Ace_Stream_Media.exe'
      Download 'https://download.acestream.media/products/acestream-full/win/latest' $f
    }
    # Si el instalador no está firmado, no se ejecuta: se abre la web oficial para bajarlo a mano
    if (-not (Test-Signed $f $null)) { Remove-Item (Join-Path $env:TEMP 'Ace_Stream_Media.exe') -ErrorAction SilentlyContinue; Start-Process 'https://acestream.org'; exit 1 }
    Start-Process $f -Wait
    # Arranca el motor en modo consola y espera a que responda en el puerto 6878
    $dir = $null
    try { $dir = (Get-ItemProperty 'HKCU:\Software\ACEStream' -ErrorAction Stop).InstallDir } catch {}
    foreach ($d in @($dir, "$env:APPDATA\ACEStream\engine", "$dir\engine")) {
      if ($d -and (Test-Path "$d\ace_console.exe")) { Start-Process "$d\ace_console.exe" -ArgumentList '--client-console' -WindowStyle Hidden; break }
    }
    for ($i = 0; $i -lt 40; $i++) {
      try { Invoke-WebRequest 'http://127.0.0.1:6878/webui/api/service?method=get_version' -UseBasicParsing -TimeoutSec 2 | Out-Null; Write-Host 'Motor AceStream respondiendo'; break } catch { Start-Sleep 1 }
    }
  }
}
exit 0
