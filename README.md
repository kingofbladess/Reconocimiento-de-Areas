# Reconocimiento Venezuela

Mapa para reconocer cualquier punto de Venezuela: terreno, clima, fotos, historia, entorno (puentes, ríos, estructuras, naturaleza), sismos y tus propios lugares con fotos y PDF.

Versión 3.0 · octubre 2026

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
- **Terreno:** tipo de relieve, pendiente y orientación, desnivel, mapa de alturas, perfiles, uso del suelo, vías y trochas cercanas, y alertas de inundación o deslizamiento.
- **Clima:** condiciones actuales, próximas 24 horas, pronóstico de 7 días y calidad del aire.
- **Fotos** geolocalizadas de Wikimedia Commons y artículos de Wikipedia cercanos.
- **Entorno:** puentes, ríos, estructuras, naturaleza y servicios en un radio de 250 m a 5 km.
- **Sismos** del último año en 300 km (USGS).
- **Herramientas:** medir distancias con perfil del terreno, y capas Satélite, Mapa, Relieve y Sombras.
- **Mis lugares:** guarda puntos con nombre, categoría, notas, fotos y PDF. Exporta e importa respaldos.

El mapa resalta Venezuela y no acepta puntos fuera del país. El contorno viene de OpenStreetMap, que deja fuera la Guayana Esequiba.

## Estructura

```
reconocimiento-venezuela/
├── index.html              Página principal (estructura de la interfaz)
├── css/estilos.css         Diseño, colores y modo oscuro
├── js/                     Lógica, cargada en este orden:
│   ├── nucleo.js           Utilidades, límites del país, lugares destacados, estado
│   ├── mapa.js             Mapa base, capas y contorno de Venezuela
│   ├── geo.js              Formatos de coordenadas y geometría
│   ├── red.js              Peticiones con reintento y mensajes de error
│   ├── busqueda.js         Búsqueda y selección de un punto
│   ├── fuentes.js          Wikipedia, Commons, clima, aire y sismos
│   ├── entorno.js          Elementos cercanos de OpenStreetMap
│   ├── terreno.js          Relieve, pendientes, perfiles, suelo y accesos
│   ├── mis-lugares.js      Lugares propios con fotos y PDF
│   ├── ficha.js            Dibujo de la ficha lateral
│   ├── interaccion.js      Clics, formularios y archivos de la ficha
│   ├── visor.js            Visor de fotos y PDF
│   ├── herramientas.js     Avisos, medición y perfil del terreno
│   └── inicio.js           Arranque e instalación
├── sw.js                   Modo sin conexión (guarda la app y los mapas ya vistos)
├── manifest.webmanifest    Datos para instalar la app
├── vercel.json             Configuración de publicación en Vercel
├── iconos/                 Íconos de la app
├── Iniciar (Windows).bat   Lanzador de Windows (usa servidor.ps1)
├── servidor.ps1            Servidor local para Windows, sin instalar nada
├── Iniciar (Mac).command   Lanzador de Mac
└── iniciar.sh              Lanzador de Linux
```

Los archivos `js/` comparten variables globales y deben cargarse en el orden de `index.html`. No usan módulos ES, para que la app también funcione con doble clic.

## Servicios que usa

Todos son gratuitos y no necesitan clave: OpenStreetMap (Nominatim y Overpass), Open-Meteo (clima, calidad del aire y elevación Copernicus 90 m), Esri y OpenTopoMap (mapas), Wikipedia, Wikidata, Wikimedia Commons y USGS (sismos).

Hace falta internet para consultar datos nuevos. Sin conexión se abre la app con los mapas ya vistos y tus lugares guardados. Si un servicio está saturado, la sección muestra el aviso y un botón **Reintentar**.

## Para quien la modifique

- Al cambiar cualquier archivo, sube `VERSION` en `sw.js` para que quien la tenga instalada reciba la versión nueva.
- Para publicar un cambio: `git add -A`, `git commit -m "..."` y `git push`. Vercel lo publica solo.
- Los lugares destacados están en `FEATURED`, en `js/nucleo.js`.
- Las categorías de Mis lugares están en `MYCATS`, en `js/mis-lugares.js`.
