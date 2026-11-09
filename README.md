<div align="center">
  <img src="public/favicon.svg" alt="TOPOTV" width="88" height="88">
  <h1>TOPOTV</h1>
  <p><strong>Canales, programación y eventos. Todo en un mismo lugar.</strong></p>
  <p>Web · Windows · Android · Android TV</p>
  <p>
    <a href="#descargas">DESCARGAR</a> ·
    <a href="#guia-de-uso">GUÍA DE USO</a> ·
    <a href="https://github.com/TopoMaster/TOPOTV/releases">TODAS LAS VERSIONES</a>
  </p>
</div>

TOPOTV te ayuda a organizar tus canales, encontrar programas y consultar eventos deportivos desde el navegador, el ordenador o un dispositivo Android. **No incluye canales ni listas de reproducción**: usa únicamente fuentes propias o autorizadas.

## Descargas

| Plataforma | Descarga |
| --- | --- |
| Windows 10/11, 64 bits | [TOPOTV para Windows (.exe)](https://github.com/TopoMaster/TOPOTV/releases/latest/download/TOPOTV-Setup-1.0.9.exe) |
| Android y Android TV | [TOPOTV para Android (.apk)](https://github.com/TopoMaster/TOPOTV/releases/latest/download/TOPOTV-v1.0.9.apk) |
| Web | [TOPOTV Web (.zip)](https://github.com/TopoMaster/TOPOTV/releases/latest/download/TOPOTV-Web-v1.0.9.zip) |

**Versión actual: v1.0.9.** Consulta las notas y el historial en [Versiones de TOPOTV](https://github.com/TopoMaster/TOPOTV/releases).

## Qué incluye

- Canales organizados por categorías, búsqueda y favoritos.
- Guía de programación cuando la lista incluye una fuente EPG compatible.
- Agenda de eventos deportivos y enlaces de reproducción disponibles en las fuentes configuradas.
- Pestaña Flashscore: integrada en Web y Windows; en Android se abre en el navegador del dispositivo.
- Agenda de eventos y guía EPG también en Android (se descargan directamente en el móvil).
- Canales organizados por categorías: la lista de Elcano se fusiona con la agenda de Ciriaco.
- En Android, reproducción dentro de la app o en VLC for Android (Ajustes → Reproductor).
- Grabación programada de eventos (Windows y Android): botón «Grabar» en Eventos y sección Grabaciones para verlas después en VLC. En Android graba en segundo plano y guarda en Películas/TOPOTV.
- TDT en abierto (RTVE y televisiones autonómicas con emisión oficial gratuita), sin necesidad del motor AceStream.
- Guía interactiva en el primer arranque (se puede repetir desde Ajustes).
- Modo TV (Ajustes): interfaz grande y manejable con mando; automático en Android TV.
- Guía de programación (EPG) siempre cargada con las guías de la lista de Elcano, en Windows y en Android.
- Motor AceStream en Android: TOPOTV detecta la app del motor (Ace Serve, Ace Stream Media…), la abre al entrar si lo activas y espera a que arranque. Si falta, la instala con un toque desde el enlace privado que configures en Ajustes (o desde la web oficial). El motor no se incluye en las descargas públicas.
- WARP integrado en Android: se conecta solo al actualizar la agenda y se apaga al terminar (solo para el tráfico de TOPOTV).
- Interfaz compatible con Android TV y adaptada a móvil.

La pestaña Flashscore es independiente de la agenda de eventos de TOPOTV. La etiqueta «Directo» de la agenda se estima según el horario; no es un marcador oficial en tiempo real.

## Guía de uso

### 1. Instala TOPOTV

Descarga el archivo correspondiente a tu dispositivo desde la tabla anterior. Windows puede mostrar un aviso de editor desconocido porque el instalador no tiene certificado Authenticode. Android también puede mostrar avisos al instalar una APK obtenida fuera de una tienda oficial; verifica que la descarga provenga de este repositorio antes de continuar.

### 2. Prepara la reproducción

TOPOTV no incluye el motor de reproducción. En Android, instala Ace Stream Engine por separado desde los enlaces oficiales disponibles en **Ajustes → Motor para móvil y TV**. En **Ajustes → Backend AceStream**, configura la dirección y el puerto del motor; el puerto habitual es `6878`.

En Windows, instala las dependencias de reproducción que necesites y comprueba su estado en **Ajustes → Dependencias**. Si utilizas un backend en otro dispositivo, indica su dirección local en **Backend AceStream**.

### 3. Carga tu lista

Pulsa **Cargar M3U** y selecciona un archivo `.m3u` o `.m3u8` propio o autorizado. TOPOTV mostrará los canales y las categorías que incluya la lista. Para cambiarla, carga otro archivo.

### 4. Encuentra y guarda canales

Abre **Buscar** para encontrar canales por nombre. Explora las categorías desde Inicio y añade los canales que quieras conservar a **Favoritos** desde sus tarjetas.

### 5. Consulta la programación

La guía EPG se carga desde la información incluida en tu lista. Si tu proveedor te dio una dirección de guía, puedes añadirla en **Ajustes → Guía de Programación (EPG)**. En **Eventos** encontrarás la agenda disponible y sus enlaces; Flashscore se consulta desde su pestaña independiente.

### 6. Usa la versión web

El ZIP web contiene la interfaz para alojarla en un servicio web compatible. La reproducción con AceStream y algunas funciones de eventos o de compartir requieren servicios adicionales en el dispositivo; el ZIP por sí solo no los instala.

## Ayuda rápida

| Problema | Qué comprobar |
| --- | --- |
| No aparecen canales | Carga una lista `.m3u` o `.m3u8` válida y autorizada. |
| Un canal no reproduce | Comprueba que la fuente esté disponible y que AceStream esté instalado, activo y configurado en Backend. |
| No aparece la guía | Verifica que la lista tenga una fuente EPG o añade la URL proporcionada por tu proveedor en Ajustes. |
| Flashscore no carga dentro de TOPOTV | Usa **Abrir en navegador**; el sitio puede solicitar sus propias opciones de privacidad o edad. |

Si necesitas reportar un problema, incluye tu plataforma, la versión de TOPOTV y los pasos para reproducirlo. No publiques listas privadas, contraseñas ni datos personales.
