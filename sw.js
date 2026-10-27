// Service worker: abre la app al instante (también sin conexión) y guarda las teselas del mapa ya vistas.
// Al cambiar archivos de la app, sube VERSION: así se descargan todos juntos en la versión nueva.
const VERSION = "v3.9.7";
const APP = `app-${VERSION}`, LIBS = "libs-v1", TILES = "teselas-v2", ZONES = "zonas-v1", MAX_TILES = 4000;
const MODS = ["nucleo", "mapa", "geo", "red", "espanol", "relieve", "busqueda", "fuentes", "entorno", "terreno", "mis-lugares", "ficha", "interfaz", "interaccion", "visor", "herramientas", "reconocimiento", "sin-conexion", "reporte", "vista3d", "inicio"];
const SHELL = ["./", "index.html", "css/estilos.css", "manifest.webmanifest", "datos/venezuela.json", "datos/guyana.json", "vendor/leaflet/leaflet.js", "vendor/leaflet/leaflet.css",
  "iconos/logo.svg", "iconos/icono-192.png", "iconos/icono-512.png", ...MODS.map(m => `js/${m}.js`)];
const LIB_HOSTS = ["unpkg.com", "fonts.googleapis.com", "fonts.gstatic.com"];
const TILE_RE = /(arcgisonline\.com\/ArcGIS\/rest\/services\/.+\/tile\/|tile\.openstreetmap\.org|tile\.opentopomap\.org|elevation-tiles-prod\/terrarium\/|tiles\.openfreemap\.org\/(planet\/|fonts\/))/;

self.addEventListener("install", e => { e.waitUntil(caches.open(APP).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => {
  // teselas-v1 guardaba respuestas "opacas" (sin CORS), que inflan la cuota de almacenamiento: se descartan
  const old = k => (k.startsWith("app-") && k !== APP) || k === "teselas-v1";
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(old).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// Recorta la caché de teselas vistas cada 60 teselas nuevas (antes se listaba entera con cada tesela, muy lento en el teléfono)
let newTiles = 0, trimming = null;
function trimTiles() {
  if (++newTiles % 60 || trimming) return;
  trimming = (async () => {
    const c = await caches.open(TILES), keys = await c.keys();
    for (let i = 0; i < keys.length - MAX_TILES; i++) await c.delete(keys[i]); // las más antiguas primero
  })().finally(() => { trimming = null; });
}
async function cacheFirst(req, name, after) {
  const hit = await caches.match(req, { ignoreVary: true }); if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) { const c = await caches.open(name); await c.put(req, res.clone()); if (after) after(); }
  return res;
}
// Archivos de la app: se responde al instante con la copia guardada y se actualiza en segundo plano
// (antes se esperaba a la red para cada uno de los ~25 archivos, lo que hacía lenta la apertura con mala señal)
async function staleWhileRevalidate(e) {
  const req = e.request, nav = req.mode === "navigate";
  const hit = await caches.match(nav ? "index.html" : req, { ignoreSearch: true });
  const net = fetch(req).then(async res => {
    if (res.ok && res.type === "basic") { const c = await caches.open(APP); await c.put(nav ? "index.html" : req, res.clone()); }
    return res;
  });
  if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
  return net;
}

self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === location.origin) return e.respondWith(staleWhileRevalidate(e));
  if (LIB_HOSTS.includes(url.hostname)) return e.respondWith(cacheFirst(req, LIBS));
  if (url.searchParams.has("rvzona")) return; // descarga de zonas: la página la guarda ella misma en ZONES
  if (TILE_RE.test(req.url)) return e.respondWith(cacheFirst(req, TILES, trimTiles));
  // APIs (clima, OSM, Wikipedia…) van directo a la red; la app guarda su propia copia para usarla sin conexión
});
