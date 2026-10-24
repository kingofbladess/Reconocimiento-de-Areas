// Búsqueda por nombre o coordenadas y selección de un punto
"use strict";

// ---------- Búsqueda ----------
const resultsEl = $("#results");
$("#featured").innerHTML = FEATURED.map((f, i) => `<button data-f="${i}">${esc(f[0])}</button>`).join("");
$("#featured").addEventListener("click", e => {
  const b = e.target.closest("button[data-f]"); if (!b) return;
  const [name, lat, lon, z] = FEATURED[+b.dataset.f];
  $("#q").value = name; closeFinder();
  searchByName(name, { lat, lon, z });
});
$("#searchForm").addEventListener("submit", e => {
  e.preventDefault();
  const q = $("#q").value.trim(); if (!q) return;
  const c = parseCoords(q);
  $("#q").blur(); // en el teléfono se cierra el teclado para ver el resultado
  if (c) { resultsEl.hidden = true; closeFinder(); return selectPoint(c.lat, c.lon, { zoom: 15 }); }
  searchByName(q);
});
const norm = s => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
let found = [];
resultsEl.addEventListener("click", ev => {
  const m = ev.target.closest("button[data-mine]");
  if (m) { resultsEl.hidden = true; closeFinder(); return openMine(m.dataset.mine); }
  const b = ev.target.closest("button[data-i]"); if (!b) return;
  const d = found[+b.dataset.i]; resultsEl.hidden = true; closeFinder();
  const bb = d.boundingbox && d.boundingbox.map(Number);
  selectPoint(+d.lat, +d.lon, { bounds: bb ? [[bb[0], bb[2]], [bb[1], bb[3]]] : null, place: d });
});
async function searchByName(q, featured) {
  resultsEl.hidden = false; resultsEl.innerHTML = '<div class="loading">Buscando en Venezuela y Guyana…</div>';
  const vb = `${AREA_BBOX.w},${AREA_BBOX.n},${AREA_BBOX.e},${AREA_BBOX.s}`;
  const qn = norm(q), mine = featured ? [] : MY.places.filter(p => norm(`${p.name} ${p.desc} ${p.notes}`).includes(qn)).slice(0, 5);
  const mineHtml = mine.map(p => `<button data-mine="${esc(p.id)}"><b>★ ${esc(p.name)}</b><span>Mi lugar · ${esc(catOf(p).label)}</span></button>`).join("");
  try {
    const data = (await getJSON(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&extratags=1&limit=8&accept-language=es&countrycodes=${AREA_CC.join(",")}&viewbox=${vb}&bounded=1&q=${encodeURIComponent(q)}`)).map(esPlace);
    if (featured) {
      resultsEl.hidden = true;
      const near = data.find(d => dist({ lat: +d.lat, lon: +d.lon }, featured) < 30000);
      return selectPoint(featured.lat, featured.lon, { zoom: featured.z, place: near || null, title: q, force: true });
    }
    found = data;
    if (!data.length && !mine.length) { resultsEl.innerHTML = offline() ? '<div class="note">Sin conexión: solo se pueden buscar coordenadas, tus lugares y búsquedas que ya hiciste antes.</div>' : '<div class="note">No encontré ese lugar en Venezuela ni en Guyana. Prueba agregando el estado o la ciudad, por ejemplo “Plaza Bolívar, Mérida”.</div>'; return; }
    resultsEl.innerHTML = mineHtml + data.map((d, i) => `<button data-i="${i}"><b>${esc(d.name || d.display_name.split(",")[0])}</b><span>${esc(d.display_name.replace(/, (Venezuela|Guyana)$/, ""))}</span></button>`).join("");
  } catch (err) {
    if (featured) { resultsEl.hidden = true; return selectPoint(featured.lat, featured.lon, { zoom: featured.z, title: q, force: true }); }
    resultsEl.innerHTML = mineHtml + `<div class="err">${esc(err.message)}</div>`;
  }
}
document.addEventListener("click", e => { if (!e.target.closest(".finder")) resultsEl.hidden = true; });
// Búsqueda vacía con el teclado abierto: muestra los lugares destacados y tus lugares
$("#q").addEventListener("focus", () => openFinder());

// ---------- Selección de punto ----------
let reqId = 0;
async function selectPoint(lat, lon, opts = {}) {
  if (!opts.force && !inArea(lat, lon)) { toast("Ese punto está fuera de Venezuela y Guyana. Elige una ubicación dentro de ellas."); return; }
  const id = ++reqId;
  const custom = opts.custom || MY.places.find(p => dist(p, { lat, lon }) < 3) || null;
  NET.staleAt = null;
  Object.assign(S, { point: { lat, lon }, place: opts.place || null, title: opts.title || null, recon: !!opts.recon, weather: null, air: null, info: null, sat: null, photos: [], wiki: [], feats: [], terrain: null, ground: null, custom, busy: {}, errs: {} });
  featLayer.clearLayers(); wikiLayer.clearLayers();
  if (pointMarker) pointMarker.setLatLng([lat, lon]);
  else pointMarker = L.marker([lat, lon], { icon: pinIcon, draggable: true, zIndexOffset: 1000 }).addTo(map)
    .on("dragend", e => { const p = e.target.getLatLng(); selectPoint(p.lat, p.lng); });
  drawRadius();
  // la ficha se abre a media altura en el teléfono, y el mapa se corre para que el punto no quede tapado por ella
  if (opts.sheet !== false) setSheet("half");
  if (opts.bounds) fitVisible(L.latLngBounds(opts.bounds).pad(0.1), 16);
  else focusVisible([lat, lon], opts.zoom ? Math.max(map.getZoom(), opts.zoom) : map.getZoom());
  try { history.replaceState(null, "", `#${lat.toFixed(5)},${lon.toFixed(5)}`); } catch (_) {}
  renderSheet();
  if (opts.form) renderForm(null);
  loadWeather(id); loadAir(id); loadTerrain(id); loadPhotos(id); loadSat(id); loadWiki(id); loadFeatures(id); loadGround(id);
  if (!S.place) await reverse(id);
  if (id !== reqId) return;
  if (!areaShape && S.place && S.place.address && S.place.address.country_code && !AREA_CC.includes(S.place.address.country_code)) {
    toast("Ese punto está fuera de Venezuela y Guyana."); return;
  }
  loadInfo(id);
}
let pickNew = false; // "Agregar lugar": el siguiente toque en el mapa abre el formulario
// Un toque elige el punto; se espera un instante para que el doble toque solo acerque el mapa y no abra dos fichas
let clickTimer = 0;
map.on("click", e => {
  if (ctxOpen()) return closeCtx();
  if (measuring) return addMeasure(e.latlng);
  clearTimeout(clickTimer);
  clickTimer = setTimeout(() => { const form = pickNew; pickNew = false; selectPoint(e.latlng.lat, e.latlng.lng, { form }); }, 260);
});
map.on("dblclick zoomstart", () => clearTimeout(clickTimer));

async function reverse(id) {
  try {
    const d = await getJSON(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&addressdetails=1&extratags=1&accept-language=es&lat=${S.point.lat}&lon=${S.point.lon}`);
    if (id !== reqId) return;
    S.place = d.error ? { display_name: "Zona sin dirección registrada (agua o área remota)" } : esPlace(d);
  } catch (_) { if (id === reqId) S.place = { display_name: "No se pudo obtener la dirección" }; }
  if (id === reqId) {
    renderHead(); renderCoords();
    const ni = $("#placeForm [name=name]"); if (ni && !ni.value && S.place && S.place.name) ni.value = S.place.name;
  }
}
function drawRadius() {
  const ll = [S.point.lat, S.point.lon];
  if (radiusCircle) radiusCircle.setLatLng(ll).setRadius(S.radius);
  else radiusCircle = L.circle(ll, { radius: S.radius, color: cssVar("--gold"), weight: 2, dashArray: "6 6", fillOpacity: 0.05, interactive: false }).addTo(map);
}
function adminOf(p) {
  const a = (p && p.address) || {};
  return {
    estado: a.state || a.region || "",
    municipio: a.county || a.municipality || "",
    localidad: a.city || a.town || a.village || a.hamlet || "",
    sector: a.suburb || a.city_district || a.quarter || a.neighbourhood || "",
  };
}
