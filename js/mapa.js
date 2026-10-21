// Mapa base, capas, marcadores y contorno del país
"use strict";

// ---------- Mapa ----------
const map = L.map("map", { zoomControl: false, worldCopyJump: false, minZoom: 5, maxBoundsViscosity: 0.8,
  maxBounds: [[VE_BBOX.s - 3, VE_BBOX.w - 4], [VE_BBOX.n + 4, VE_BBOX.e + 4]] });
L.control.zoom({ position: "topright" }).addTo(map);
L.control.scale({ imperial: false, position: "bottomright" }).addTo(map);
const veBounds = L.latLngBounds([VE_BBOX.s, VE_BBOX.w], [VE_BBOX.n, VE_BBOX.e]);
map.fitBounds(veBounds);
const base = {
  satelite: L.layerGroup([
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, attribution: "Imágenes &copy; Esri, Maxar" }),
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19 }),
  ]),
  mapa: L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "&copy; OpenStreetMap" }),
  topo: L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", { maxZoom: 17, attribution: "&copy; OpenTopoMap (CC-BY-SA)" }),
  sombras: L.layerGroup([
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19, maxNativeZoom: 16, attribution: "Sombreado &copy; Esri" }),
    L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}", { maxZoom: 19 }),
  ]),
};
let curBase = base.satelite.addTo(map);
$("#layers").addEventListener("click", e => {
  const b = e.target.closest("button[data-layer]"); if (!b) return;
  map.removeLayer(curBase); curBase = base[b.dataset.layer].addTo(map); curBase.bringToBack && curBase.bringToBack();
  document.querySelectorAll("#layers button").forEach(x => x.setAttribute("aria-pressed", x === b));
});
const pinIcon = L.divIcon({ className: "", html: '<div class="pin"></div>', iconSize: [24, 24], iconAnchor: [12, 28], popupAnchor: [0, -26] });
const wIcon = L.divIcon({ className: "", html: '<div class="wpin">W</div>', iconSize: [22, 22], iconAnchor: [11, 11] });
let pointMarker = null, radiusCircle = null, maskLayer = null;
const featLayer = L.layerGroup().addTo(map), wikiLayer = L.layerGroup().addTo(map), quakeLayer = L.layerGroup().addTo(map);

map.on("mousemove", e => { const r = $("#readout"); r.hidden = false; r.textContent = `${e.latlng.lat.toFixed(5)}, ${e.latlng.lng.toFixed(5)}`; });
map.on("mouseout", () => { $("#readout").hidden = true; });

// Contorno del país y máscara oscura fuera de Venezuela
async function loadCountry() {
  try {
    const d = await getJSON("https://nominatim.openstreetmap.org/search?country=Venezuela&format=jsonv2&polygon_geojson=1&polygon_threshold=0.003&limit=1");
    const g = d[0] && d[0].geojson; if (!g) return;
    veShape = g;
    const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
    const holes = polys.map(p => p[0].map(([x, y]) => [y, x]));
    maskLayer = L.polygon([[[-90, -360], [-90, 360], [90, 360], [90, -360]], ...holes],
      { stroke: false, fillColor: "#000", fillOpacity: 0.38, interactive: false }).addTo(map);
    L.polyline(holes, { color: cssVar("--gold"), weight: 2, opacity: 0.9, interactive: false }).addTo(map);
  } catch (_) { /* sin contorno: se valida con el recuadro y la geocodificación inversa */ }
}
function inPolygon(lat, lon, g) {
  const ringHas = ring => { let inside = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside; } return inside; };
  const polys = g.type === "Polygon" ? [g.coordinates] : g.coordinates;
  return polys.some(p => ringHas(p[0]) && !p.slice(1).some(ringHas));
}
function inVenezuela(lat, lon) { if (!inBBox(lat, lon)) return false; return veShape ? inPolygon(lat, lon, veShape) : true; }
