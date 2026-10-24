// Mapa base, capas, marcadores y contorno del país
"use strict";

// ---------- Mapa ----------
// Zoom fraccionado y rueda más fina: el mapa se acerca de forma continua en lugar de a saltos
// preferCanvas: el contorno del país y los cientos de trazos del entorno se dibujan en un lienzo, mucho más fluido en el teléfono que SVG
const map = L.map("map", { zoomControl: false, worldCopyJump: false, minZoom: 5, maxBoundsViscosity: 0.8, preferCanvas: true,
  zoomSnap: 0.25, zoomDelta: 0.5, wheelPxPerZoomLevel: 110, wheelDebounceTime: 25, bounceAtZoomLimits: false,
  inertiaDeceleration: 2200, easeLinearity: 0.2, doubleClickZoom: true,
  maxBounds: [[AREA_BBOX.s - 3, AREA_BBOX.w - 4], [AREA_BBOX.n + 4, AREA_BBOX.e + 4]] });
L.control.zoom({ position: "topright", zoomInTitle: "Acercar (+)", zoomOutTitle: "Alejar (−)" }).addTo(map);
// Botones bajo el zoom: vista 3D, mi ubicación y norte/país
const MapButtons = L.Control.extend({
  options: { position: "topright" },
  onAdd() {
    const d = L.DomUtil.create("div", "leaflet-bar map-btns");
    d.innerHTML = `<a href="#" role="button" id="mb3d" title="Vista 3D del terreno (tecla 3)" class="mb-3d">3D</a>
      <a href="#" role="button" id="mbLocate" title="Seguir mi posición GPS en tiempo real"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg></a>`;
    L.DomEvent.disableClickPropagation(d); L.DomEvent.disableScrollPropagation(d);
    return d;
  },
});
new MapButtons().addTo(map);
L.control.scale({ imperial: false, position: "bottomright" }).addTo(map);
const areaBounds = L.latLngBounds([AREA_BBOX.s, AREA_BBOX.w], [AREA_BBOX.n, AREA_BBOX.e]);
map.fitBounds(areaBounds);
// crossOrigin: las teselas llegan como respuestas CORS normales; así el modo sin conexión las guarda con su tamaño real
// (las respuestas "opacas" ocupan unos 7 MB cada una en la cuota del navegador y la llenaban enseguida)
const TILE_OPTS = { crossOrigin: "anonymous", keepBuffer: 3 };
const tl = (url, o) => L.tileLayer(url, { ...TILE_OPTS, ...o });
const base = {
  satelite: L.layerGroup([
    tl("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Imágenes &copy; Esri, Maxar" }),
    tl("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19 }),
  ]),
  mapa: tl("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap" }),
  topo: tl("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", { maxZoom: 17, attribution: "&copy; OpenTopoMap (CC-BY-SA)" }),
  sombras: L.layerGroup([
    tl("https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, maxNativeZoom: 16, attribution: "Sombreado &copy; Esri" }),
    tl("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19 }),
  ]),
};
let curBase = base.satelite.addTo(map), curBaseKey = "satelite";
$("#layers").addEventListener("click", e => {
  const b = e.target.closest("button[data-layer]"); if (!b) return;
  curBaseKey = b.dataset.layer;
  map.removeLayer(curBase); curBase = base[curBaseKey].addTo(map); curBase.bringToBack && curBase.bringToBack();
  document.querySelectorAll("#layers button").forEach(x => x.setAttribute("aria-pressed", x === b));
});
const pinIcon = L.divIcon({ className: "", html: '<div class="pin"></div>', iconSize: [24, 24], iconAnchor: [12, 28], popupAnchor: [0, -26] });
const wIcon = L.divIcon({ className: "", html: '<div class="wpin">W</div>', iconSize: [22, 22], iconAnchor: [11, 11] });
let pointMarker = null, radiusCircle = null, maskLayer = null;
const featLayer = L.layerGroup().addTo(map), wikiLayer = L.layerGroup().addTo(map);

// Coordenadas y altitud bajo el cursor
const HOVER = matchMedia("(hover: hover)").matches;
map.on("mousemove", e => {
  if (!HOVER) return; // en pantallas táctiles un toque también genera "mousemove": no se consulta la altitud en vano
  const r = $("#readout"), ll = e.latlng, c = `${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)}`;
  r.hidden = false; r.textContent = c;
  if (map.getZoom() >= 7) hoverElevation(ll, v => { r.innerHTML = `${c} · <b>${fmtNum(Math.round(v))} m</b>`; });
});
map.on("mouseout", () => { $("#readout").hidden = true; });

// Contorno de Venezuela y Guyana, con máscara oscura fuera de ellos.
// Viene incluido en la app (datos/*.json, OpenStreetMap simplificado): carga al instante y funciona sin conexión.
// Antes se pedía a Nominatim en cada arranque, lo que retrasaba varios segundos la apertura de un enlace #lat,lon.
async function countryShape(file, name) {
  try { const r = await fetch(`datos/${file}.json`); if (r.ok) return await r.json(); } catch (_) { /* abierta con doble clic: file:// no permite fetch */ }
  try { const d = await getJSON(`https://nominatim.openstreetmap.org/search?country=${name}&format=jsonv2&polygon_geojson=1&polygon_threshold=0.003&limit=1`); return d[0] && d[0].geojson; }
  catch (_) { return null; /* sin contorno: se valida con el recuadro y la geocodificación inversa */ }
}
const polysOf = g => g.type === "Polygon" ? [g.coordinates] : g.coordinates;
async function loadCountry() {
  const shapes = (await Promise.all([countryShape("venezuela", "Venezuela"), countryShape("guyana", "Guyana")])).filter(Boolean);
  if (!shapes.length) return;
  areaShape = { type: "MultiPolygon", coordinates: shapes.flatMap(polysOf) };
  const holes = areaShape.coordinates.map(p => p[0].map(([x, y]) => [y, x]));
  maskLayer = L.polygon([[[-90, -360], [-90, 360], [90, 360], [90, -360]], ...holes],
    { stroke: false, fillColor: "#000", fillOpacity: 0.38, interactive: false }).addTo(map);
  L.polyline(holes, { color: cssVar("--gold"), weight: 2, opacity: 0.9, interactive: false }).addTo(map);
}
function inPolygon(lat, lon, g) {
  const ringHas = ring => { let inside = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside; } return inside; };
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  return polys.some(p => ringHas(p[0]) && !p.slice(1).some(ringHas));
}
function inArea(lat, lon) { if (!inBBox(lat, lon)) return false; return areaShape ? inPolygon(lat, lon, areaShape) : true; }
