// Vista 3D del terreno con MapLibre GL: relieve real (AWS Terrain Tiles), imagen satelital, inclinación y giro
"use strict";

// ---------- Vista 3D ----------
// MapLibre se descarga solo la primera vez que se abre la vista (unos 800 kB) y queda guardado para usarla sin conexión.
// Encima van, si cargan, las curvas de nivel (maplibre-contour, calculadas en el navegador) y los nombres y edificios de OpenFreeMap.
const ML_VER = "4.7.1", CONTOUR_VER = "0.1.0", OFM = "https://tiles.openfreemap.org";
let gl = null, glLoading = null, glPin = null, glPopup = null, orbitRaf = 0, contours = null;
const is3D = () => !$("#v3d").hidden;
function loadMapLibre() {
  if (window.maplibregl) return Promise.resolve();
  return glLoading || (glLoading = new Promise((ok, fail) => {
    const css = document.createElement("link"); css.rel = "stylesheet"; css.href = `https://unpkg.com/maplibre-gl@${ML_VER}/dist/maplibre-gl.css`;
    const js = document.createElement("script"); js.src = `https://unpkg.com/maplibre-gl@${ML_VER}/dist/maplibre-gl.js`;
    js.onload = () => {
      // el complemento de curvas es opcional: si no descarga, la vista 3D funciona igual sin ellas
      const ct = document.createElement("script"); ct.src = `https://unpkg.com/maplibre-contour@${CONTOUR_VER}/dist/index.min.js`;
      ct.onload = ct.onerror = ok; document.head.append(ct);
    };
    js.onerror = () => { glLoading = null; css.remove(); js.remove(); fail(new Error("No se pudo descargar el visor 3D. Revisa la conexión.")); };
    document.head.append(css, js);
  }));
}
const ESRI = "https://server.arcgisonline.com/ArcGIS/rest/services/";
const nameEs = ["coalesce", ["get", "name:es"], ["get", "name"]];
const HALO = { "text-color": "#fff", "text-halo-color": "rgba(10,17,29,.85)", "text-halo-width": 1.4 };
const NAME_LAYERS = ["n-lugares", "n-ciudades", "n-picos", "n-rios", "n-vias", "curvas-cota"];
// Exageración efectiva: la del control en vista amplia y relieve real (×1) a nivel de calle, donde exagerar deforma la imagen
const exagFor = z => { const v = +$("#v3dExag").value, f = Math.max(0, Math.min(1, (15.5 - z) / 2.5)); return Math.round((1 + (v - 1) * f) * 20) / 20; };
let exagNow = 0;
function applyExag() { if (!gl || !gl.isStyleLoaded()) return; const e = exagFor(gl.getZoom()); if (e !== exagNow) { exagNow = e; gl.setTerrain({ source: "dem", exaggeration: e }); } }
function style3D(zoom0) {
  // El SRTM de 30 m no es un modelo del suelo urbano: en ciudades trae edificios y árboles como lomas falsas.
  // Se usa hasta el nivel 12 (MapLibre suaviza al acercar) y así calles y plazas quedan planas bajo los edificios en 3D.
  const dem = { type: "raster-dem", tiles: [DEM_URL], encoding: "terrarium", tileSize: 256, maxzoom: 12 };
  const sources = {
    satelite: { type: "raster", tiles: [ESRI + "World_Imagery/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, maxzoom: 19, attribution: "Imágenes &copy; Esri, Maxar" },
    relieve: { type: "raster", tiles: ["a", "b", "c"].map(s => `https://${s}.tile.opentopomap.org/{z}/{x}/{y}.png`), tileSize: 256, maxzoom: 17, attribution: "&copy; OpenTopoMap (CC-BY-SA)" },
    mapa: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 19, attribution: "&copy; OpenStreetMap" },
    omt: { type: "vector", url: OFM + "/planet", attribution: "Nombres y edificios &copy; OpenFreeMap, OpenStreetMap" },
    dem: { ...dem, attribution: "Relieve: AWS Terrain Tiles (SRTM)" },
    demSombra: dem, // fuente aparte para el sombreado, como recomienda MapLibre
  };
  const layers = [
    { id: "satelite", type: "raster", source: "satelite", paint: { "raster-contrast": 0.08, "raster-saturation": 0.1 } },
    { id: "relieve", type: "raster", source: "relieve", layout: { visibility: "none" } },
    { id: "mapa", type: "raster", source: "mapa", layout: { visibility: "none" } },
    { id: "sombras", type: "hillshade", source: "demSombra", paint: { "hillshade-exaggeration": ["interpolate", ["linear"], ["zoom"], 12, 0.35, 16, 0.08], "hillshade-shadow-color": "#0b1424", "hillshade-highlight-color": "rgba(255,244,214,.35)", "hillshade-accent-color": "#2b3a52", "hillshade-illumination-direction": 315 } },
  ];
  if (window.mlcontour) {
    // curvas de nivel calculadas del mismo modelo SRTM; la equidistancia se ajusta al acercar
    contours = contours || new mlcontour.DemSource({ url: DEM_URL, encoding: "terrarium", maxzoom: 14, worker: true });
    contours.setupMaplibre(maplibregl);
    sources.curvas = { type: "vector", maxzoom: 15, tiles: [contours.contourProtocolUrl({
      thresholds: { 9: [500, 1000], 10: [200, 1000], 11: [100, 500], 12: [50, 250], 13: [50, 250], 14: [20, 100] },
      elevationKey: "ele", levelKey: "level", contourLayer: "c" })] };
    layers.push(
      { id: "curvas", type: "line", source: "curvas", "source-layer": "c", minzoom: 9, layout: { visibility: "none" },
        paint: { "line-color": "#ffe29a", "line-width": ["match", ["get", "level"], 1, 1.3, 0.6], "line-opacity": ["match", ["get", "level"], 1, 0.9, 0.4] } },
      { id: "curvas-cota", type: "symbol", source: "curvas", "source-layer": "c", minzoom: 10, filter: [">", ["get", "level"], 0], layout: { visibility: "none",
        "symbol-placement": "line", "text-field": ["concat", ["number-format", ["get", "ele"], { locale: "es-VE" }], " m"], "text-font": ["Noto Sans Regular"], "text-size": 10.5 },
        paint: { "text-color": "#ffe9a8", "text-halo-color": "rgba(10,17,29,.85)", "text-halo-width": 1.2 } });
  }
  layers.push(
    { id: "edificios", type: "fill-extrusion", source: "omt", "source-layer": "building", minzoom: 14,
      paint: { "fill-extrusion-color": "#e3ddd0", "fill-extrusion-height": ["coalesce", ["get", "render_height"], 6], "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0], "fill-extrusion-opacity": 0.88 } },
    { id: "n-vias", type: "symbol", source: "omt", "source-layer": "transportation_name", minzoom: 13,
      layout: { "symbol-placement": "line", "text-field": nameEs, "text-font": ["Noto Sans Regular"], "text-size": 11 }, paint: { ...HALO, "text-color": "#f3f4f6" } },
    { id: "n-rios", type: "symbol", source: "omt", "source-layer": "waterway", minzoom: 11, filter: ["in", ["get", "class"], ["literal", ["river", "stream", "canal"]]],
      layout: { "symbol-placement": "line", "text-field": nameEs, "text-font": ["Noto Sans Italic"], "text-size": 12, "text-letter-spacing": 0.05 }, paint: { ...HALO, "text-color": "#bfe3ff" } },
    { id: "n-picos", type: "symbol", source: "omt", "source-layer": "mountain_peak", minzoom: 9,
      layout: { "text-field": ["case", ["has", "ele"], ["format", ["concat", "▲ ", nameEs], {}, "\n", {}, ["concat", ["number-format", ["get", "ele"], { locale: "es-VE" }], " m"], { "font-scale": 0.85 }], ["concat", "▲ ", nameEs]],
        "text-font": ["Noto Sans Bold"], "text-size": 12, "text-anchor": "bottom", "text-offset": [0, -0.2] }, paint: { ...HALO, "text-color": "#ffe9a8" } },
    { id: "n-lugares", type: "symbol", source: "omt", "source-layer": "place", minzoom: 9, filter: ["in", ["get", "class"], ["literal", ["village", "hamlet", "suburb", "neighbourhood"]]],
      layout: { "text-field": nameEs, "text-font": ["Noto Sans Regular"], "text-size": 12 }, paint: HALO },
    { id: "n-ciudades", type: "symbol", source: "omt", "source-layer": "place", filter: ["in", ["get", "class"], ["literal", ["city", "town"]]],
      layout: { "text-field": nameEs, "text-font": ["Noto Sans Bold"], "text-size": ["match", ["get", "class"], "city", 16, 13.5] }, paint: HALO });
  return {
    version: 8, glyphs: OFM + "/fonts/{fontstack}/{range}.pbf", sources, layers,
    terrain: { source: "dem", exaggeration: exagFor(zoom0) },
    sky: { "sky-color": "#2f6fd0", "horizon-color": "#cfe0f4", "fog-color": "#dfe8f3", "sky-horizon-blend": 0.5, "horizon-fog-blend": 0.55, "fog-ground-blend": 0.85, "atmosphere-blend": 0.8 },
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
  document.querySelectorAll("#v3dBase button").forEach(b => b.setAttribute("aria-pressed", b.dataset.b === k));
}
function stopOrbit() { cancelAnimationFrame(orbitRaf); orbitRaf = 0; $("#v3dOrbit").setAttribute("aria-pressed", "false"); }
function startOrbit() {
  let last = performance.now();
  const step = now => { gl.setBearing((gl.getBearing() + (now - last) * 0.008) % 360); last = now; orbitRaf = requestAnimationFrame(step); };
  $("#v3dOrbit").setAttribute("aria-pressed", "true"); orbitRaf = requestAnimationFrame(step);
}
// Recorrido: la cámara vuela a baja altura siguiendo el trazo de medición, mirando hacia adelante
function flyTrace() {
  if (mPts.length < 2) return;
  stopOrbit(); if (glPopup) glPopup.remove();
  const pts = mPts.map(p => ({ lat: p.lat, lon: p.lng })), seg = [];
  let total = 0; for (let i = 1; i < pts.length; i++) { const d = dist(pts[i - 1], pts[i]); seg.push(d); total += d; }
  const at = s => { let i = 0; s = Math.max(0, Math.min(total, s)); while (i < seg.length - 1 && s > seg[i]) { s -= seg[i]; i++; } const f = seg[i] ? s / seg[i] : 0, a = pts[i], b = pts[i + 1]; return { lat: a.lat + (b.lat - a.lat) * f, lon: a.lon + (b.lon - a.lon) * f }; };
  const ms = Math.max(9000, Math.min(45000, total / 0.12)), zoom = Math.max(13, Math.min(15.5, 16.5 - Math.log2(Math.max(total, 500) / 500))), t0 = performance.now();
  let brg = bearing(at(0), at(Math.min(total, 400)));
  $("#v3dOrbit").setAttribute("aria-pressed", "true");
  const step = now => {
    const k = Math.min(1, (now - t0) / ms), e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2, s = e * total, p = at(s), ahead = at(s + Math.max(250, total * 0.06));
    const want = dist(p, ahead) > 5 ? bearing(p, ahead) : brg, dd = ((want - brg + 540) % 360) - 180; brg = (brg + dd * 0.06 + 360) % 360;
    gl.jumpTo({ center: [p.lon, p.lat], bearing: brg, pitch: 72, zoom });
    orbitRaf = k < 1 ? requestAnimationFrame(step) : (stopOrbit(), 0);
  };
  gl.easeTo({ center: [pts[0].lon, pts[0].lat], bearing: brg, pitch: 72, zoom, duration: 1200 });
  setTimeout(() => { if (is3D()) orbitRaf = requestAnimationFrame(step); }, 1250);
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
    container: "v3dMap", style: style3D(zoom), center, zoom, pitch: 0, bearing: 0, maxPitch: 85, minZoom: 4.5, maxZoom: 17.5,
    maxBounds: [[AREA_BBOX.w - 8, AREA_BBOX.s - 6], [AREA_BBOX.e + 8, AREA_BBOX.n + 6]],
    attributionControl: { compact: true }, fadeDuration: 150, cooperativeGestures: false,
  });
  gl.addControl(new maplibregl.NavigationControl({ visualizePitch: true, showZoom: true, showCompass: true }), "top-right");
  gl.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");
  gl.on("load", () => { addOverlays(); sync3D(); exagNow = exagFor(gl.getZoom()); });
  gl.on("zoomend", applyExag);
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
  const zoom = Math.min(16, Math.max(P ? 13.5 : 5, map.getZoom() - 1)); // las teselas de MapLibre son de 512 px: un nivel menos equivale a la misma escala
  $("#v3d").hidden = false; document.body.classList.add("in3d"); closeCtx();
  $("#v3dLoad").hidden = !!gl;
  try {
    if (!gl) await create3D(center, zoom);
    else { gl.resize(); gl.jumpTo({ center, zoom, pitch: gl.getPitch() }); }
  } catch (err) { $("#v3dLoad").hidden = true; close3D(); toast(err.message); return; }
  $("#v3dLoad").hidden = true;
  if (gl.isStyleLoaded()) sync3D();
  $("#v3dTrace").hidden = mPts.length < 2;
  if (!window.mlcontour) $("#v3dLayers [data-l=curvas]").hidden = true;
  if (at && !S.point) pointPopup({ lat: at.lat, lng: at.lon });
  const intro = () => gl.easeTo({ pitch: Math.max(gl.getPitch(), 62), bearing: gl.getBearing() || -25, duration: 1600 });
  gl.loaded() ? intro() : gl.once("load", intro);
}
function close3D() {
  if (!is3D()) return;
  stopOrbit();
  if (gl) { const c = gl.getCenter(); map.setView([c.lat, c.lng], Math.min(18, gl.getZoom() + 1), { animate: false }); }
  $("#v3d").hidden = true; document.body.classList.remove("in3d");
  requestAnimationFrame(fitMapSize);
}
$("#v3dClose").addEventListener("click", close3D);
$("#v3dBase").addEventListener("click", e => { const b = e.target.closest("button[data-b]"); if (b && gl) setBase3D(b.dataset.b); });
$("#v3dExag").addEventListener("input", e => {
  const v = +e.target.value; $("#v3dExagVal").textContent = `×${v.toLocaleString("es-VE")}`;
  applyExag();
});
const LAYER_SETS = { sombras: ["sombras"], curvas: ["curvas", "curvas-cota"], nombres: NAME_LAYERS.filter(id => id !== "curvas-cota"), edificios: ["edificios"] };
$("#v3dLayers").addEventListener("click", e => {
  const b = e.target.closest("button[data-l]"); if (!b || !gl) return;
  const on = b.getAttribute("aria-pressed") !== "true"; b.setAttribute("aria-pressed", on);
  for (const id of LAYER_SETS[b.dataset.l]) if (gl.getLayer(id)) gl.setLayoutProperty(id, "visibility", on ? "visible" : "none");
  if (b.dataset.l === "curvas" && on && gl.getZoom() < 10) toast("Acerca la vista para ver las curvas de nivel");
});
$("#v3dTrace").addEventListener("click", () => { if (gl) flyTrace(); });
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
