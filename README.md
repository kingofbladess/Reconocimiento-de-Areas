# Reconocimiento Venezuela

Mapa para reconocer cualquier punto de Venezuela: terreno, clima, fotos, historia, entorno (puentes, ríos, estructuras, naturaleza), sismos y tus propios lugares con fotos y PDF.

Versión 3.6 · octubre 2026

## Cómo abrirla

Descomprime el `.zip` en una carpeta y elige una opción:

| Opción | Qué hacer | Qué obtienes |
|---|---|---|
| **Recomendada en Windows** | Doble clic en `Iniciar (Windows).bat` | La app se abre en `http://localhost:8765`. Puedes instalarla con el botón **Instalar** y usarla sin conexión. |
| **Recomendada en Mac** | Doble clic en `Iniciar (Mac).command` (la primera vez: clic derecho → Abrir) | Igual que en Windows. Necesita Python 3. |
| **Linux** | `./iniciar.sh` en una terminal | Igual que arriba. |
| **Rápida** | Doble clic en `index.html` | La app funciona completa, pero no se puede instalar ni usar sin conexión. |

Deja abierta la ventana negra del lanzador mientras uses la app. Al cerrarla, la app se detiene.

**Importante sobre "Mis lugares":** se guardan dentro del navegador y dependen de cómo abriste la app. Si guardas lugares con doble clic en `index.html` no aparecerán al abrir con el lanzador, y al revés. Para pasarlos de un lado a otro o a otro equipo usa **Mis lugares → Exportar** y luego **Importar**.

## Usarla en el teléfono (Vercel)

La app se publica en **Vercel** desde GitHub. Cada cambio que se sube a la rama `main` se publica solo en 1 o 2 minutos.

Primera vez:

1. Entra a https://vercel.com/new e inicia sesión con tu cuenta de GitHub.
2. En *Import Git Repository* elige `Reconocimiento-de-Areas` y pulsa **Import**.
3. Deja *Framework Preset* en **Other**, sin comando de build ni carpeta de salida, y pulsa **Deploy**.
4. Vercel te da un enlace como `https://reconocimiento-de-areas.vercel.app`.

En el teléfono abre ese enlace y elige **Instalar app** (Android, Chrome) o **Compartir → Agregar a inicio** (iPhone, Safari). Queda como una app con su ícono y abre sin conexión con los mapas que ya viste.

`vercel.json` hace que el teléfono reciba siempre la última versión de la app.

## Qué hace

- **Búsqueda** por nombre, coordenadas decimales o GMS (`10°30'22"N 66°54'53"O`). También puedes tocar el mapa o abrir un enlace `#lat,lon`.
- **Ficha del punto:** coordenadas (decimal, GMS, UTM), estado, municipio, información de Wikipedia/Wikidata y enlaces a Google Maps, Street View y Google Earth.
- **Terreno:** tipo de relieve, pendiente y orientación, desnivel, mapa de alturas sombreado, perfiles, uso del suelo, vías y trochas cercanas, y alertas de inundación o deslizamiento. Al pasar el cursor o el dedo por el mapa de alturas o por un perfil, el punto se marca en el mapa con su altitud y distancia.
- **Vista 3D:** botón **3D** del mapa o de la ficha (o tecla `3`). Muestra el relieve real con imagen satelital, relieve topográfico o mapa; se puede inclinar (Cenital, Oblicua, Rasante), girar, exagerar la altura del relieve (×1 a ×4) y hacer que la cámara gire sola alrededor del punto. Incluye el punto elegido, el radio, el trazo de medición y los elementos del entorno. Clic derecho o Ctrl + arrastrar gira e inclina; en el teléfono, dos dedos.
- **Clima:** condiciones actuales, próximas 24 horas, pronóstico de 7 días y calidad del aire.
- **Fotos** geolocalizadas de Wikimedia Commons y artículos de Wikipedia cercanos.
- **Entorno:** puentes, ríos, estructuras, naturaleza y servicios en un radio de 250 m a 5 km.
- **Sismos** del último año en 300 km (USGS).
- **Herramientas:** medir distancias con perfil del terreno que se actualiza solo (los puntos se arrastran para corregir el trazo y un toque los quita), capa **Pendientes** que colorea las laderas según su inclinación, capas Satélite, Mapa, Relieve y Sombras, y **Mi ubicación**.
- **Manejo del mapa:** zoom continuo con la rueda, doble toque para acercar sin abrir la ficha, altitud bajo el cursor, y menú con clic derecho o manteniendo presionado (ver ficha, ver en 3D, medir desde ahí, copiar coordenadas). Atajos: `3` vista 3D, `M` medir, `P` pendientes, `/` buscar, `Esc` cerrar.
- **Analizar:** el botón de la ficha reúne todo lo consultado en un **reporte operativo del área de dos hojas**:
  - Hoja 1: identificación del punto, nivel de riesgo general, croquis, mapa de relieve, datos clave y evaluación de riesgos.
  - Hoja 2: pronóstico de 72 h, movilidad y puentes, apoyo disponible y una **apreciación argumentada** (terreno, meteorología, movilidad, apoyo y riesgos) que concluye si el área es favorable, favorable con restricciones o desfavorable, con las recomendaciones principales.

  El botón **Ver versión detallada** muestra el reporte completo de varias páginas. Ambos se imprimen o guardan como PDF, o se descargan como archivo HTML.
- **Mis lugares:** guarda puntos con nombre, categoría, notas, fotos y PDF. Exporta e importa respaldos.
- **Sin conexión:** la app abre sin internet. Cada ficha que abres queda guardada (dirección, clima, terreno, entorno, fotos, Wikipedia) y sin señal se muestra con la fecha de la copia. El botón **Sin conexión** descarga la zona que ves (imagen satelital, relieve topográfico o sombras, más el modelo de elevación para altitudes, perfiles, pendientes y 3D), muestra las zonas guardadas y el espacio usado, y permite borrarlas. El mapa de calles de OpenStreetMap no se descarga en bloque porque su política lo prohíbe.
- **En el teléfono:** la ficha es una hoja que se arrastra entre tres alturas (solo título, media pantalla y casi completa); las herramientas son una columna de íconos; los lugares destacados aparecen al tocar el buscador; y las secciones de la ficha se pliegan tocando su título.

El mapa cubre **Venezuela y Guyana** (incluida la Guayana Esequiba): búsqueda, ficha, terreno, entorno, 3D, Analizar, Mis lugares y descarga sin conexión funcionan en ambos. No acepta puntos fuera de ellos. Los contornos vienen de OpenStreetMap (`datos/venezuela.json` y `datos/guyana.json`).

## Estructura

```
reconocimiento-venezuela/
├── index.html              Página principal (estructura de la interfaz)
├── css/estilos.css         Diseño, colores y modo oscuro
├── js/                     Lógica, cargada en este orden:
│   ├── nucleo.js           Utilidades, límites del país, lugares destacados, estado
│   ├── mapa.js             Mapa base, capas y contorno de Venezuela
│   ├── geo.js              Formatos de coordenadas y geometría
│   ├── red.js              Peticiones con reintento, mensajes de error y copia guardada para usar sin conexión
│   ├── espanol.js          Nombres en español (Guyana) y traducción de textos de Wikipedia y Commons
│   ├── relieve.js          Modelo de elevación en teselas, altitud al instante y capa de pendientes
│   ├── busqueda.js         Búsqueda y selección de un punto
│   ├── fuentes.js          Wikipedia, Commons, clima, aire y sismos
│   ├── entorno.js          Elementos cercanos de OpenStreetMap
│   ├── terreno.js          Relieve, pendientes, perfiles, suelo y accesos
│   ├── mis-lugares.js      Lugares propios con fotos y PDF
│   ├── ficha.js            Dibujo de la ficha lateral
│   ├── interfaz.js         Ficha deslizable, buscador compacto, capas, secciones plegables, aviso sin conexión
│   ├── interaccion.js      Clics, formularios y archivos de la ficha
│   ├── visor.js            Visor de fotos y PDF
│   ├── herramientas.js     Avisos, medición, menú del mapa, mi ubicación y atajos
│   ├── sin-conexion.js     Descarga de zonas y panel Sin conexión
│   ├── reporte.js          Botón Analizar: reporte operativo del área
│   ├── vista3d.js          Vista 3D del terreno (MapLibre GL)
│   └── inicio.js           Arranque e instalación
├── datos/                  Contornos de Venezuela y Guyana (OpenStreetMap simplificado), incluidos para abrir rápido
├── vendor/leaflet/         Leaflet 1.9.4 incluido (no depende de unpkg)
├── sw.js                   Modo sin conexión (guarda la app y los mapas ya vistos)
├── manifest.webmanifest    Datos para instalar la app
├── vercel.json             Configuración de publicación en Vercel
├── iconos/                 Logotipo (logo.svg) e íconos de la app
├── Iniciar (Windows).bat   Lanzador de Windows (usa servidor.ps1)
├── servidor.ps1            Servidor local para Windows, sin instalar nada
├── Iniciar (Mac).command   Lanzador de Mac
└── iniciar.sh              Lanzador de Linux
```

Los archivos `js/` comparten variables globales y deben cargarse en el orden de `index.html`. No usan módulos ES, para que la app también funcione con doble clic.

## Servicios que usa

Todos son gratuitos y no necesitan clave: OpenStreetMap (Nominatim y Overpass), Open-Meteo (clima, calidad del aire y elevación Copernicus 90 m de respaldo), AWS Terrain Tiles (elevación SRTM 30 m para el terreno, las pendientes y la vista 3D), MapLibre GL (vista 3D), Esri y OpenTopoMap (mapas), Wikipedia, Wikidata, Wikimedia Commons y USGS (sismos).

Hace falta internet para consultar datos nuevos. Sin conexión se abre la app con los mapas ya vistos o descargados, las fichas ya abiertas y tus lugares guardados. Si un servicio está saturado, la sección muestra el aviso y un botón **Reintentar**.

## Para quien la modifique

- Al cambiar cualquier archivo, sube `VERSION` en `sw.js` para que quien la tenga instalada reciba la versión nueva.
- Para publicar un cambio: `git add -A`, `git commit -m "..."` y `git push`. Vercel lo publica solo.
- Los lugares destacados están en `FEATURED`, en `js/nucleo.js`.
- Las categorías de Mis lugares están en `MYCATS`, en `js/mis-lugares.js`.
- Los colores están al inicio de `css/estilos.css` (modo claro y oscuro). El verde del botón Analizar es `--go`.
- Si cambias `iconos/logo.svg`, vuelve a generar los PNG de `iconos/` con el mismo dibujo.
