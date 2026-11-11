# Seguridad

## Versiones con soporte

Solo la última versión publicada (la que ofrece la propia app al buscar actualizaciones). Las anteriores no reciben arreglos.

## Cómo avisar de un fallo de seguridad

Usa **Security → Report a vulnerability** en la página de GitHub del proyecto (aviso privado). Por favor, no abras un *issue* público con los detalles hasta que haya arreglo. Incluye la versión, el sistema (Windows/Android), los pasos para reproducirlo y qué impacto crees que tiene.

## Cómo está pensada la seguridad

- **Servicios locales de Windows** (puertos 3002–3009): escuchan solo en `127.0.0.1` y solo atienden a la propia app. Rechazan cualquier otra web (aunque la abras en tu navegador), los ataques de «DNS rebinding» y las imágenes o formularios de otros sitios (`tools/guard.cjs`).
- **Actualizaciones**: se descargan únicamente de las *releases* oficiales de GitHub de este proyecto y se comprueba su tamaño y su huella SHA-256 antes de ejecutarlas.
- **Instalación de dependencias** (WARP, VLC, AceStream): se comprueba la firma digital del instalador (y, para WARP y VLC, quién lo firma) antes de ejecutarlo.
- **App de escritorio**: aislamiento de contexto y *sandbox* activados; solo se abren enlaces `http`/`https` fuera de la app; la ventana principal no puede navegar a páginas ajenas; permisos del navegador limitados a notificaciones, pantalla completa y portapapeles de escritura.
- **Android**: el tráfico sin cifrar solo se permite hacia el propio móvil (el motor AceStream en `127.0.0.1`); sin copia de seguridad automática de Android; los componentes internos no están expuestos a otras apps.
- **Datos**: favoritos, historial, ajustes, addons y listas se guardan **solo en tu dispositivo**. TOPOTV no tiene servidores propios ni envía estadísticas.

## Qué no cubre

- El contenido de las listas, los addons y los enlaces que cargue cada persona: TOPOTV no incluye ninguno ni se hace responsable de su origen. Usa solo fuentes propias o autorizadas.
- Las direcciones de algunos addons pueden llevar claves personales (p. ej. de un servicio de descargas). Se guardan en tu dispositivo y también van dentro de la copia de seguridad: guárdala en un sitio privado.
- El motor de torrents (`torrent-stream`) y el motor AceStream son software de terceros; las dependencias con avisos conocidos sin arreglo disponible se anotan en el historial de cambios.
