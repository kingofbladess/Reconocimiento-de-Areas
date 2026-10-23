// Vista 3D del terreno con MapLibre GL: relieve real (AWS Terrain Tiles), imagen satelital, inclinación y giro
"use strict";

// ---------- Vista 3D ----------
// MapLibre se descarga solo la primera vez que se abre la vista (unos 800 kB) y queda guardado para usarla sin conexión.
const ML_VER = "4.7.1";
let gl = null, glLoading = null, glPin = null, glPopup = null, orbitRaf = 0;
const is3D = () => !$("#v3d").hidden;
function loadMapLibre() {
  if (window.maplibregl) return Promise.resolve();
  return glLoading || (glLoading = new Promise((ok, fail) => {
    const css = document.createElement("link"); css.rel = "stylesheet"; css.href = `https://unpkg.com/maplibre-gl@${ML_VER}/dist/maplibre-gl.css`;
    const js = document.createElement("script"); js.src = `https://unpkg.com/maplibre-gl@${ML_VER}/dist/maplibre-gl.js`;
    js.onload = ok; js.onerror = () => { glLoading = null; css.remove(); js.remove(); fail(new Error("No se pudo descargar el visor 3D. Revisa la conexión.")); };
    document.head.append(css, js);
  }));
}
const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/";
function style3D() {
  const dem = { type: "raster-dem", tiles: [DEM_URL], encoding: "terrarium", tileSize: 256, maxzoom: 15 };
  return {
    version: 8,
    sources: {
      satelite: { type: "raster", tiles: [ESRI + "World_Imagery/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, maxzoom: 19, attribution: "Imágenes &copy; Esri, Maxar" },
      relieve: { type: "raster", tiles: ["a", "b", "c"].map(s => `https://${s}.tile.opentopomap.org/{z}/{x}/{y}.png`), tileSize: 256, maxzoom: 17, attribution: "&copy; OpenTopoMap (CC-BY-SA)" },
      mapa: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 19, attribution: "&copy; OpenStreetMap" },
      nombres: { type: "raster", tiles: [ESRI + "Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, maxzoom: 19 },
      dem: { ...dem, attribution: "Relieve: AWS Terrain Tiles (SRTM)" },
      demSombra: dem, // fuente aparte para el sombreado, como recomienda MapLibre
    },
    layers: [
      { id: "satelite", type: "raster", source: "satelite" },
      { id: "relieve", type: "raster", source: "relieve", layout: { visibility: "none" } },
      { id: "mapa", type: "raster", source: "mapa", layout: { visibility: "none" } },
      { id: "sombras", type: "hillshade", source: "demSombra", paint: { "hillshade-exaggeration": 0.3, "hillshade-shadow-color": "#0f1c2e", "hillshade-accent-color": "#33415a", "hillshade-illumination-direction": 315 } },
      { id: "nombres", type: "raster", source: "nombres", paint: { "raster-opacity": 0.9 } },
    ],
    terrain: { source: "dem", exaggeration: 1.5 },
    sky: { "sky-color": "#3f7fd6", "horizon-color": "#d5e4f5", "fog-color": "#e8eef6", "sky-horizon-blend": 0.55, "horizon-fog-blend": 0.6, "fog-ground-blend": 0.8, "atmosphere-blend": 0.75 },
  };
}
const fc = features => ({ type: "FeatureCollection", features });
const ringAround = (p, r) => Array.from({ length: 73 }, (_, i) => { const a = i * 5 * rad, q = offset(p, r * Math.cos(a), r * Math.sin(a)); return [q.lon, q.lat]; });
// Contorno del país, punto elegido con su radio, trazo de medición y elementos del entorno
function sync3D() {
  if (!gl || !gl.isStyleLoaded()) return;
  const set = (id, data) => gl.getSource(id) && gl.getSource(id).setData(data);
  if (areaShape) {
    const polys = areaShape.type === "Polygon" ? [areaShape.coordinates] : areaShape.coordinates;
    set("pais", fc([{ type: "Feature", geometry: { type: "Polygon", coordinates: [[[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]], ...polys.map(p => p[0])] } },
      { type: "Feature", properties: { borde: 1 }, geometry: { type: "MultiLineString", coordinates: polys.map(p => p[0]) } }]));
  }
  const P = S.point;
  set("radio", fc(P ? [{ type: "Feature", geometry: { type: "LineString", coordinates: ringAround(P, S.radius) } }] : []));
  if (glPin) { glPin.remove(); glPin = null; }
  if (P) { const el = document.createElement("div"); el.className = "pin3d"; el.innerHTML = '<div class="pin"></div>'; glPin = new maplibregl.Marker({ element: el, anchor: "bottom" }).setLngLat([P.lon, P.lat]).addTo(gl); }
  set("trazo", fc(mPts.length ? [{ type: "Feature", geometry: { type: "LineString", coordinates: mPts.map(p => [p.lng, p.lat]) } },
    ...mPts.map(p => ({ type: "Feature", geometry: { type: "Point", coordinates: [p.lng, p.lat] } }))] : []));
  set("entorno", fc(S.feats.filter(f => !S.hiddenCats.has(f.cat)).map(f => ({ type: "Feature", properties: { n: f.name || f.type, t: f.type, c: cssVar(CATS[f.cat].color), d: fmtDist(f.d) }, geometry: { type: "Point", coordinates: [f.lon, f.lat] } }))));
}
function addOverlays() {
  const gold = cssVar("--gold") || "#f2a900";
  ["pais", "radio", "trazo", "entorno"].forEach(id => gl.addSource(id, { type: "geojson", data: fc([]) }));
  gl.addLayer({ id: "pais-mascara", type: "fill", source: "pais", filter: ["!", ["has", "borde"]], paint: { "fill-color": "#000", "fill-opacity": 0.35 } });
  gl.addLayer({ id: "pais-borde", type: "line", source: "pais", filter: ["has", "borde"], paint: { "line-color": gold, "line-width": 2 } });
  gl.addLayer({ id: "radio", type: "line", source: "radio", paint: { "line-color": gold, "line-width": 2, "line-dasharray": [2, 2] } });
  gl.addLayer({ id: "trazo", type: "line", source: "trazo", filter: ["==", ["geometry-type"], "LineString"], paint: { "line-color": gold, "line-width": 4 } });
  gl.addLayer({ id: "trazo-vertices", type: "circle", source: "trazo", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": 5, "circle-color": "#fff", "circle-stroke-color": gold, "circle-stroke-width": 2.5 } });
  gl.addLayer({ id: "entorno", type: "circle", source: "entorno", paint: { "circle-radius": 6, "circle-color": ["get", "c"], "circle-stroke-color": "#fff", "circle-stroke-width": 2 } });
}
function setBase3D(k) {
  ["satelite", "relieve", "mapa"].forEach(id => gl.setLayoutProperty(id, "visibility", id === k ? "visible" : "none"));
  gl.setLayoutProperty("nombres", "visibility", k === "satelite" ? "visible" : "none");
  document.querySelectorAll("#v3dBase button").forEach(b => b.setAttribute("aria-pressed", b.dataset.b === k));
}
function stopOrbit() { cancelAnimationFrame(orbitRaf); orbitRaf = 0; $("#v3dOrbit").setAttribute("aria-pressed", "false"); }
function startOrbit() {
  let last = performance.now();
  const step = now => { gl.setBearing((gl.getBearing() + (now - last) * 0.008) % 360); last = now; orbitRaf = requestAnimationFrame(step); };
  $("#v3dOrbit").setAttribute("aria-pressed", "true"); orbitRaf = requestAnimationFrame(step);
}
function pointPopup(ll) {
  const inside = inArea(ll.lat, ll.lng), c = `${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)}`;
  if (glPopup) glPopup.remove();
  glPopup = new maplibregl.Popup({ offset: 8, maxWidth: "240px" }).setLngLat(ll)
    .setHTML(`<b>${c}</b><br><span id="v3dAlt">Altitud…</span>${inside ? `<br><button class="btn" data-open3d="${ll.lat},${ll.lng}" style="margin-top:6px">Ver ficha de este punto</button>` : "<br>Fuera de Venezuela y Guyana"}`).addTo(gl);
  elevAt(ll.lat, ll.lng).then(v => { const a = $("#v3dAlt"); if (a) a.textContent = `${fmtNum(Math.round(v))} m s. n. m.`; }).catch(() => {});
}
async function create3D(center, zoom) {
  await loadMapLibre();
  gl = new maplibregl.Map({
    container: "v3dMap", style: style3D(), center, zoom, pitch: 0, bearing: 0, maxPitch: 85, minZoom: 4.5,
    maxBounds: [[AREA_BBOX.w - 8, AREA_BBOX.s - 6], [AREA_BBOX.e + 8, AREA_BBOX.n + 6]],
    attributionControl: { compact: true }, fadeDuration: 150, cooperativeGestures: false,
  });
  gl.addControl(new maplibregl.NavigationControl({ visualizePitch: true, showZoom: true, showCompass: true }), "top-right");
  gl.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");
  gl.on("load", () => { addOverlays(); sync3D(); });
  gl.on("error", e => { if (e && e.error && /webgl/i.test(String(e.error.message))) toast("Este equipo no puede mostrar la vista 3D (WebGL desactivado)"); });
  gl.on("mousemove", e => {
    const c = `${e.lngLat.lat.toFixed(5)}, ${e.lngLat.lng.toFixed(5)}`, el = $("#v3dRead"); el.textContent = c;
    hoverElevation({ lat: e.lngLat.lat, lng: e.lngLat.lng }, v => { el.innerHTML = `${c} · <b>${fmtNum(Math.round(v))} m</b>`; });
  });
  gl.on("click", e => {
    const f = gl.queryRenderedFeatures(e.point, { layers: ["entorno"] })[0];
    if (f) { if (glPopup) glPopup.remove(); glPopup = new maplibregl.Popup({ offset: 8 }).setLngLat(f.geometry.coordinates).setHTML(`<b>${esc(f.properties.n)}</b><br>${esc(f.properties.t)} · ${esc(f.properties.d)}`).addTo(gl); return; }
    pointPopup(e.lngLat);
  });
  gl.on("mouseenter", "entorno", () => { gl.getCanvas().style.cursor = "pointer"; });
  gl.on("mouseleave", "entorno", () => { gl.getCanvas().style.cursor = ""; });
  gl.on("move", () => { $("#v3dHud").textContent = `Rumbo ${Math.round((gl.getBearing() + 360) % 360)}° · inclinación ${Math.round(gl.getPitch())}°`; });
  ["mousedown", "touchstart", "wheel"].forEach(t => gl.getCanvasContainer().addEventListener(t, () => { if (orbitRaf) stopOrbit(); }, { passive: true }));
}
async function open3D(at) {
  const P = at || S.point, c = map.getCenter();
  const center = P ? [P.lon, P.lat] : [c.lng, c.lat];
  const zoom = Math.max(P ? 13.5 : 5, map.getZoom() - 1); // las teselas de MapLibre son de 512 px: un nivel menos equivale a la misma escala
  $("#v3d").hidden = false; document.body.classList.add("in3d"); closeCtx();
  $("#v3dLoad").hidden = !!gl;
  try {
    if (!gl) await create3D(center, zoom);
    else { gl.resize(); gl.jumpTo({ center, zoom, pitch: gl.getPitch() }); }
  } catch (err) { $("#v3dLoad").hidden = true; close3D(); toast(err.message); return; }
  $("#v3dLoad").hidden = true;
  if (gl.isStyleLoaded()) sync3D();
  if (at && !S.point) pointPopup({ lat: at.lat, lng: at.lon });
  const intro = () => gl.easeTo({ pitch: Math.max(gl.getPitch(), 62), bearing: gl.getBearing() || -25, duration: 1600 });
  gl.loaded() ? intro() : gl.once("load", intro);
}
function close3D() {
  if (!is3D()) return;
  stopOrbit();
  if (gl) { const c = gl.getCenter(); map.setView([c.lat, c.lng], Math.min(18, gl.getZoom() + 1), { animate: false }); }
  $("#v3d").hidden = true; document.body.classList.remove("in3d");
}
$("#v3dClose").addEventListener("click", close3D);
$("#v3dBase").addEventListener("click", e => { const b = e.target.closest("button[data-b]"); if (b && gl) setBase3D(b.dataset.b); });
$("#v3dExag").addEventListener("input", e => {
  const v = +e.target.value; $("#v3dExagVal").textContent = `×${v.toLocaleString("es-VE")}`;
  if (gl && gl.isStyleLoaded()) gl.setTerrain({ source: "dem", exaggeration: v });
});
$("#v3dShade").addEventListener("click", e => {
  const on = e.currentTarget.getAttribute("aria-pressed") !== "true"; e.currentTarget.setAttribute("aria-pressed", on);
  if (gl) gl.setLayoutProperty("sombras", "visibility", on ? "visible" : "none");
});
$("#v3dView").addEventListener("click", e => {
  const b = e.target.closest("button[data-p]"); if (!b || !gl) return;
  stopOrbit(); gl.easeTo({ pitch: +b.dataset.p, duration: 900 });
});
$("#v3dOrbit").addEventListener("click", () => { if (!gl) return; orbitRaf ? stopOrbit() : startOrbit(); });
$("#v3dNorth").addEventListener("click", () => { if (gl) { stopOrbit(); gl.easeTo({ bearing: 0, duration: 700 }); } });
$("#v3dCenter").addEventListener("click", () => {
  if (!gl) return; stopOrbit();
  if (S.point) gl.flyTo({ center: [S.point.lon, S.point.lat], zoom: Math.max(gl.getZoom(), 13.5), duration: 1200 });
  else gl.fitBounds([[AREA_BBOX.w, AREA_BBOX.s], [AREA_BBOX.e, AREA_BBOX.n]], { pitch: 45, duration: 1200 });
});
document.addEventListener("click", e => {
  const b = e.target.closest("[data-open3d]"); if (!b) return;
  const [lat, lon] = b.dataset.open3d.split(",").map(Number);
  if (glPopup) glPopup.remove();
  close3D(); selectPoint(lat, lon);
});
