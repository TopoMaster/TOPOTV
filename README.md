<div align="center">
  <img src="public/favicon.svg" alt="TOPOTV" width="88" height="88">
  <h1>TOPOTV</h1>
  <p><strong>Canales, programación y eventos. Todo en un mismo lugar.</strong></p>
  <p>Windows · Android · Android TV</p>
  <p>
    <a href="#descargas">DESCARGAR</a> ·
    <a href="#guia-de-uso">GUÍA DE USO</a> ·
    <a href="https://github.com/TopoMaster/TOPOTV/releases">TODAS LAS VERSIONES</a>
  </p>
</div>

TOPOTV te ayuda a organizar tus canales, encontrar programas y consultar eventos deportivos desde el ordenador, el móvil o la tele. **No incluye canales ni listas de reproducción**: usa únicamente fuentes propias o autorizadas.

## Descargas

| Plataforma | Descarga |
| --- | --- |
| Windows 10/11, 64 bits | [TOPOTV para Windows (.exe)](https://github.com/TopoMaster/TOPOTV/releases/latest/download/TOPOTV-Setup-1.4.3.exe) |
| Android (móvil y tableta) | [TOPOTV para Android (.apk)](https://github.com/TopoMaster/TOPOTV/releases/latest/download/TOPOTV-v1.4.3.apk) |
| Android TV y Google TV | [TOPOTV para Android TV (.apk)](https://github.com/TopoMaster/TOPOTV/releases/latest/download/TOPOTV-TV-v1.4.3.apk) |

La versión de Android TV es la misma app preparada para la tele: arranca en modo TV y se maneja con el mando. Si en una tele tenías la de Android, al actualizar se pasa sola a la de TV.

**Versión actual: v1.4.3.** Consulta las notas y el historial en [Versiones de TOPOTV](https://github.com/TopoMaster/TOPOTV/releases).

## Qué incluye

- Canales organizados por categorías, búsqueda y favoritos.
- Guía de programación cuando la lista incluye una fuente EPG compatible.
- Agenda de eventos deportivos y enlaces de reproducción disponibles en las fuentes configuradas.
- Pestaña Flashscore: integrada en Windows; en Android se abre en el navegador del dispositivo.
- Agenda de eventos y guía EPG también en Android (se descargan directamente en el móvil).
- Canales organizados por categorías: tus listas M3U (de archivo o de enlace) se fusionan con la agenda de Ciriaco. Las listas cargadas desde un archivo se guardan en el dispositivo y no se pierden al actualizar. En Windows, las listas que dejes en **Documentos\TOPOTV\Listas** se cargan solas en cada actualización.
- Sin enlaces repetidos: un mismo ID de AceStream solo se guarda una vez aunque venga en varias listas; Ajustes indica cuántos repetidos se han quitado.
- Guía para cada canal: cada canal muestra su programación o el aviso «sin guía de momento», y Ajustes indica cuántos canales tienen guía. Los canales de otros países usan guías de su país.
- En Windows, menú lateral con las categorías en carpetas (las de otros países, una carpeta por país) y buscador de categorías.
- Eventos cruzados con la guía: cada evento muestra los canales de tus listas que lo emiten, y los partidos en directo que solo aparecen en la guía se añaden como eventos («GUÍA TV»).
- En Android, reproducción dentro de la app o en VLC for Android (Ajustes → Reproductor).
- Grabación programada de eventos (Windows y Android): botón «Grabar» en Eventos y sección Grabaciones para verlas después en VLC. En Android graba en segundo plano y guarda en Películas/TOPOTV.
- TDT en abierto (RTVE y televisiones autonómicas con emisión oficial gratuita), sin necesidad del motor AceStream.
- Guía interactiva en el primer arranque (se puede repetir desde Ajustes).
- Modo TV (Ajustes): interfaz grande y manejable con mando; automático en Android TV.
- Guía de programación (EPG) siempre cargada (guías de TV de España y las que anuncien tus listas), en Windows y en Android. Reconoce los canales aunque su nombre lleve la calidad («720p», «HD»…).
- Motor AceStream en Android: TOPOTV detecta la app del motor (Ace Serve, Ace Stream Media…) y la enciende sola al ver un canal; con Ace Serve no hace falta abrirla ni pulsar START (la primera vez, en «Abrir con», elige TOPOTV y «Siempre»). Si falta, la instala con un toque desde el enlace privado que configures en Ajustes (o desde la web oficial). El motor no se incluye en las descargas públicas.
- WARP integrado en Android: se conecta solo al actualizar la agenda y se apaga al terminar (solo para el tráfico de TOPOTV).
- Interfaz compatible con Android TV y adaptada a móvil: en el móvil, barra Inicio · Eventos · Canales · Cine · Más (con todas las demás secciones).
- Apariencia (Ajustes): cinco colores oscuros y «Negro puro» para pantallas OLED, cuatro tamaños de texto y tres tipos de letra (uno muy legible).

La pestaña Flashscore es independiente de la agenda de eventos de TOPOTV. La etiqueta «Directo» de la agenda se estima según el horario; no es un marcador oficial en tiempo real.

## Guía de uso

### 1. Instala TOPOTV

Descarga el archivo correspondiente a tu dispositivo desde la tabla anterior. Windows puede mostrar un aviso de editor desconocido porque el instalador no tiene certificado Authenticode. Android también puede mostrar avisos al instalar una APK obtenida fuera de una tienda oficial; verifica que la descarga provenga de este repositorio antes de continuar.

### 2. Prepara la reproducción

TOPOTV no incluye el motor de reproducción. En Android, instala Ace Stream Engine por separado desde los enlaces oficiales disponibles en **Ajustes → Motor para móvil y TV**. En **Ajustes → Backend AceStream**, configura la dirección y el puerto del motor; el puerto habitual es `6878`.

En Windows, instala las dependencias de reproducción que necesites y comprueba su estado en **Ajustes → Dependencias**. Si utilizas un backend en otro dispositivo, indica su dirección local en **Backend AceStream**.

### 3. Carga tu lista

Pulsa **Cargar M3U** y selecciona un archivo `.m3u` o `.m3u8` propio o autorizado. TOPOTV lo guarda en el dispositivo y lo fusiona con las demás fuentes; si lo actualizas, cárgalo otra vez (sustituye al del mismo nombre). Las listas guardadas se ven y se quitan en **Ajustes → Canales y listas**.

### 4. Encuentra y guarda canales

Abre **Buscar** para encontrar canales por nombre. Explora las categorías desde Inicio y añade los canales que quieras conservar a **Favoritos** desde sus tarjetas.

### 5. Consulta la programación

La guía EPG se carga desde la información incluida en tu lista. Si tu proveedor te dio una dirección de guía, puedes añadirla en **Ajustes → Guía de Programación (EPG)**. En **Eventos** encontrarás la agenda disponible y sus enlaces; Flashscore se consulta desde su pestaña independiente.

## Seguridad y privacidad

- Tus datos (favoritos, historial, ajustes, addons y listas) se guardan **solo en tu dispositivo**; TOPOTV no tiene servidores propios.
- En Windows, los servicios internos solo atienden a la propia app: ninguna web que abras puede usarlos.
- Las actualizaciones se descargan solo de las *releases* de este proyecto y se verifican antes de instalarse.
- TOPOTV no incluye ni recomienda listas, addons ni enlaces de terceros: usa solo fuentes propias o autorizadas.
- Más detalle y cómo avisar de un fallo: [SECURITY.md](SECURITY.md).

## Ayuda rápida

| Problema | Qué comprobar |
| --- | --- |
| No aparecen canales | Carga una lista `.m3u` o `.m3u8` válida y autorizada. |
| Un canal no reproduce | Comprueba que la fuente esté disponible y que AceStream esté instalado, activo y configurado en Backend. |
| No aparece la guía | Verifica que la lista tenga una fuente EPG o añade la URL proporcionada por tu proveedor en Ajustes. |
| Flashscore no carga dentro de TOPOTV | Usa **Abrir en navegador**; el sitio puede solicitar sus propias opciones de privacidad o edad. |

Si necesitas reportar un problema, incluye tu plataforma, la versión de TOPOTV y los pasos para reproducirlo. No publiques listas privadas, contraseñas ni datos personales.
