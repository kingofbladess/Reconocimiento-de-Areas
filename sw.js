// Service worker: guarda la app para abrirla sin conexión y conserva las teselas del mapa ya vistas.
// Al cambiar cualquier archivo de la app, sube VERSION para que los usuarios reciban la versión nueva.
const VERSION = "v3.1.0";
const APP = `app-${VERSION}`, LIBS = "libs-v1", TILES = "teselas-v1", MAX_TILES = 3000;
const SHELL = ["./", "index.html", "css/estilos.css", "manifest.webmanifest", "iconos/icono-192.png", "iconos/icono-512.png",
  ...["nucleo", "mapa", "geo", "red", "busqueda", "fuentes", "entorno", "terreno", "mis-lugares", "ficha", "interaccion", "visor", "herramientas", "reporte", "inicio"].map(m => `js/${m}.js`)];
const LIB_HOSTS = ["unpkg.com", "fonts.googleapis.com", "fonts.gstatic.com"];
const TILE_RE = /(arcgisonline\.com\/ArcGIS\/rest\/services\/.+\/tile\/|tile\.openstreetmap\.org|tile\.opentopomap\.org)/;

self.addEventListener("install", e => { e.waitUntil(caches.open(APP).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith("app-") && k !== APP).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

async function trimTiles() {
  const c = await caches.open(TILES), keys = await c.keys();
  for (let i = 0; i < keys.length - MAX_TILES; i++) await c.delete(keys[i]); // borra las más antiguas
}
async function cacheFirst(req, name, after) {
  const hit = await caches.match(req); if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === "opaque") { const c = await caches.open(name); await c.put(req, res.clone()); if (after) after(); }
  return res;
}
async function networkFirst(req) {
  try { const res = await fetch(req); if (res.ok) (await caches.open(APP)).put(req, res.clone()); return res; }
  catch (e) { const hit = await caches.match(req, { ignoreSearch: true }); if (hit) return hit; throw e; }
}

self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === location.origin) return e.respondWith(networkFirst(req)); // archivos de la app: siempre la última versión si hay red
  if (LIB_HOSTS.includes(url.hostname)) return e.respondWith(cacheFirst(req, LIBS));
  if (TILE_RE.test(req.url)) return e.respondWith(cacheFirst(req, TILES, trimTiles));
  // APIs (clima, OSM, Wikipedia…) van directo a la red: sus datos deben ser actuales
});
