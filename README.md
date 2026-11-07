<div align="center">
   <img src="public/favicon.svg" alt="TOPOTV" width="84" height="84">
   <h1>TOPOTV</h1>
   <p><strong>Tu televisión en directo, organizada en un solo lugar.</strong></p>
   <p>Web · Windows · Android · Android TV</p>
   <p>
      <img src="https://img.shields.io/badge/Node.js-22-339933?logo=node.js&logoColor=white" alt="Node.js 22">
      <img src="https://img.shields.io/badge/Android-SDK%2036-3DDC84?logo=android&logoColor=white" alt="Android SDK 36">
      <img src="https://img.shields.io/badge/Desktop-Electron-47848F?logo=electron&logoColor=white" alt="Electron">
   </p>
</div>

TOPOTV reúne canales, favoritos, búsqueda, guía de programación y eventos deportivos en una experiencia para navegador, ordenador y dispositivos Android. La reproducción depende de las fuentes y servicios configurados por cada usuario; el proyecto no distribuye canales ni listas de terceros.

## Una aplicación, tres destinos

| Producto | Descripción | Salida de compilación |
| --- | --- | --- |
| Web | Interfaz web estática para servir desde un hosting compatible. | `artifacts/web/` |
| Windows | Aplicación de escritorio empaquetada como instalador NSIS x64. | `artifacts/windows/` |
| Android | Aplicación para móvil y Android TV, distribuida como APK. | `artifacts/android/` |

El código web compartido vive en `src/`. `dist/` es una carpeta temporal que usan Capacitor y Electron durante sus compilaciones; no es el paquete final ni se debe subir al repositorio. Los archivos listos para probar o distribuir quedan juntos bajo `artifacts/`, separados por plataforma.

## Funciones

- Organiza canales por categorías y permite buscarlos y guardarlos como favoritos.
- Consulta la programación y la guía EPG, además de eventos deportivos.
- Accede a Flashscore desde una pestaña integrada en web y Windows, con opción para abrir el sitio aparte.
- Carga listas M3U y fuentes de programación propias o autorizadas.
- Incluye una interfaz compatible con Android TV.

La pestaña Flashscore muestra el sitio externo; no combina sus marcadores con la agenda de Ciriaco. En Eventos, la etiqueta «Directo» sigue basándose en el horario y la duración estimada del evento.

En Android, el motor AceStream se instala y ejecuta por separado; no se incluye en la APK. En Windows, los avisos de SmartScreen pueden aparecer porque el instalador todavía no tiene firma Authenticode.

## Requisitos

- Node.js 22 LTS y npm.
- Android: JDK 21 y Android SDK 36.
- Windows: Windows x64 para generar el instalador.

## Desarrollo local

```powershell
npm ci
npm run dev
```

Para crear el build web listo para servir:

```powershell
npm run web:dist
```

El contenido compilado queda en `artifacts/web/`. Es un frontend estático; las funciones que dependen de servicios de guía, eventos o reproducción requieren sus fuentes y servicios correspondientes.

## Crear los instaladores

| Comando | Resultado |
| --- | --- |
| `npm run web:dist` | Sitio web estático en `artifacts/web/` |
| `npm run desktop:dist` | Instalador Windows en `artifacts/windows/` |
| `npm run android:debug` | APK de prueba en `artifacts/android/TOPOTV-debug.apk` |
| `npm run android:release` | APK firmada en `artifacts/android/` |

`Build-Installer.bat` también genera el instalador Windows. Las APK debug sirven para pruebas; no se pueden usar como actualización de una APK firmada con la clave de publicación.

### Firma de publicación Android

Android exige que las actualizaciones mantengan la misma clave de firma. Crea el keystore fuera del repositorio y conserva una copia de respaldo cifrada:

```powershell
keytool -genkeypair -v -keystore "$HOME\topotv-release.jks" -alias topotv -keyalg RSA -keysize 2048 -validity 10000
```

Para compilar localmente, configura la ruta y los metadatos de versión en PowerShell. Las contraseñas se solicitan ocultas y no deben guardarse en el repositorio:

```powershell
$env:ANDROID_KEYSTORE_PATH = "$HOME\topotv-release.jks"
$env:ANDROID_KEY_ALIAS = "topotv"
$env:ANDROID_VERSION_CODE = "2"
$env:ANDROID_VERSION_NAME = "1.0.1"

function Set-SecretEnv([string]$name) {
   $secret = Read-Host $name -AsSecureString
   $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
   try {
      [Environment]::SetEnvironmentVariable($name, [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr), [EnvironmentVariableTarget]::Process)
   } finally {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
   }
}
Set-SecretEnv "ANDROID_KEYSTORE_PASSWORD"
Set-SecretEnv "ANDROID_KEY_PASSWORD"
npm run android:release
```

Incrementa `ANDROID_VERSION_CODE` en cada publicación. No pierdas ni reemplaces el keystore después de distribuir una versión: una clave diferente rompe la cadena de actualizaciones.

## Publicar en GitHub

El workflow de `.github/workflows/build.yml` compila los tres productos. En pushes y pull requests deja los builds de prueba en **Actions → ejecución → Artifacts**. Al publicar un tag `vX.Y.Z`, crea una release con el instalador Windows, la APK firmada y el paquete web ZIP.

Antes de crear un tag, configura estos **Actions secrets** en **Settings → Secrets and variables → Actions**:

- `ANDROID_KEYSTORE_BASE64`: keystore codificado en Base64. En PowerShell puedes copiarlo con `[Convert]::ToBase64String([IO.File]::ReadAllBytes("$HOME\topotv-release.jks")) | Set-Clipboard`.
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

El tag debe coincidir con `version` en `desktop/package.json`, por ejemplo `v1.0.1`. El workflow comprueba la firma de la APK antes de publicarla. Nunca subas el `.jks`, contraseñas ni certificados privados al repositorio.

## Estructura del proyecto

| Ruta | Contenido |
| --- | --- |
| `src/` | Aplicación web compartida |
| `android/` | Proyecto nativo y configuración Gradle |
| `desktop/` | Aplicación Electron y configuración del instalador |
| `tools/` | Herramientas y scripts de empaquetado |
| `dist/` | Build temporal usado durante la compilación |
| `artifacts/` | Salidas locales separadas por plataforma; ignoradas por Git |

Para reproducción, utiliza únicamente listas y fuentes que tengas derecho a usar. La firma de una APK identifica su clave de publicación, pero no evita todos los avisos de instalación de Android; el instalador Windows requiere un certificado Authenticode distinto para mostrar un editor verificado.
