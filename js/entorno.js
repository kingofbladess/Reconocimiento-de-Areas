// Elementos cercanos de OpenStreetMap (puentes, ríos, estructuras…)
"use strict";

// ---------- Alrededores (Overpass / OpenStreetMap) ----------
const CATS = {
  puente: { label: "Puentes", color: "--c-puente" }, agua: { label: "Ríos y agua", color: "--c-agua" },
  naturaleza: { label: "Naturaleza", color: "--c-naturaleza" }, estructura: { label: "Estructuras", color: "--c-estructura" },
  interes: { label: "Lugares de interés", color: "--c-interes" }, servicio: { label: "Servicios", color: "--c-servicio" },
};
const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
const FORM = { "Content-Type": "application/x-www-form-urlencoded" };
// Overpass responde 200 aunque la consulta se corte por tiempo o memoria (zonas urbanas densas): trae "remark" y
// ningún elemento. Antes eso se tomaba como "no hay nada" (0 estructuras en pleno Caracas) y quedaba guardado.
function overpassCheck(d) {
  if (!d || !Array.isArray(d.elements)) throw netErr("OpenStreetMap devolvió una respuesta incompleta", true);
  if (d.remark && /error|timed out|out of memory|timeout/i.test(d.remark)) throw netErr("OpenStreetMap cortó la consulta por saturación. Reintenta en unos segundos.", true);
}

function bboxAround(lat, lon, r) {
  const dLat = r / 111320, dLon = r / (111320 * Math.cos(lat * rad));
  return [lat - dLat, lon - dLon, lat + dLat, lon + dLon].map(v => v.toFixed(6)).join(",");
}
function overpassQuery(lat, lon, r) {
  const A = `(around:${r},${lat},${lon})`;
  return `[out:json][timeout:60][maxsize:268435456];
(
way${A}["bridge"]["bridge"!="no"];
nwr${A}["man_made"="bridge"];
way${A}["waterway"~"^(river|stream|canal)$"];
nwr${A}["natural"~"^(water|wood|peak|wetland|beach|cliff|spring|volcano|cave_entrance|scrub|grassland|bay|hill|ridge|sand)$"];
nwr${A}["leisure"~"^(park|nature_reserve|garden)$"];
nwr${A}["boundary"="national_park"];
nwr${A}["landuse"="forest"];
nwr${A}["waterway"~"^(dam|weir|waterfall)$"];
nwr${A}["man_made"~"^(tower|water_tower|mast|dam|lighthouse|silo|pier|chimney|storage_tank|antenna|communications_tower|petroleum_well|pipeline|works)$"];
nwr${A}["power"~"^(plant|substation|generator)$"]["name"];
nwr${A}["building"]["name"];
nwr${A}["aeroway"~"^(aerodrome|helipad)$"];
nwr${A}["historic"];
nwr${A}["tourism"~"^(attraction|viewpoint|museum|camp_site)$"];
nwr${A}["amenity"~"^(hospital|clinic|police|fire_station|fuel|school|university|place_of_worship|townhall|pharmacy)$"];
);
out tags geom(${bboxAround(lat, lon, r)}) 900;
way${A}["building"];
out count;`;
}
function classify(t) {
  if ((t.bridge && t.bridge !== "no") || t.man_made === "bridge") return "puente";
  if (t.waterway || ["water", "wetland", "spring", "bay"].includes(t.natural)) return "agua";
  if (t.natural || t.landuse === "forest" || t.boundary === "national_park" || ["park", "nature_reserve", "garden"].includes(t.leisure)) return "naturaleza";
  if (t.amenity) return "servicio";
  if (t.historic || t.tourism) return "interes";
  return "estructura";
}
const TYPE_ES = {
  river: "Río", stream: "Quebrada", canal: "Canal", dam: "Represa", weir: "Vertedero", waterfall: "Salto / cascada", water: "Laguna / cuerpo de agua",
  wetland: "Humedal / estero", spring: "Manantial", bay: "Bahía", wood: "Bosque", forest: "Bosque", peak: "Cerro / pico", hill: "Colina", ridge: "Fila / cresta",
  beach: "Playa", cliff: "Farallón", volcano: "Volcán", cave_entrance: "Cueva", scrub: "Matorral", grassland: "Sabana", sand: "Médanos / arena",
  park: "Parque", nature_reserve: "Reserva natural", garden: "Jardín", national_park: "Parque nacional",
  tower: "Torre", water_tower: "Tanque elevado", mast: "Mástil", lighthouse: "Faro", silo: "Silo", pier: "Muelle", chimney: "Chimenea", storage_tank: "Tanque",
  antenna: "Antena", communications_tower: "Torre de comunicaciones", petroleum_well: "Pozo petrolero", pipeline: "Tubería / oleoducto", works: "Planta industrial",
  plant: "Planta eléctrica", substation: "Subestación eléctrica", generator: "Generador", aerodrome: "Aeródromo", helipad: "Helipuerto",
  hospital: "Hospital", clinic: "Ambulatorio / clínica", police: "Policía", fire_station: "Bomberos", fuel: "Estación de servicio", school: "Escuela / liceo",
  university: "Universidad", place_of_worship: "Iglesia / templo", townhall: "Alcaldía", pharmacy: "Farmacia",
  attraction: "Atracción", viewpoint: "Mirador", museum: "Museo", camp_site: "Campamento",
};
function typeLabel(t, cat) {
  if (cat === "puente") { const via = t.railway ? "férreo" : ["footway", "path", "pedestrian", "steps", "cycleway"].includes(t.highway) ? "peatonal" : t.highway ? "vehicular" : ""; return "Puente" + (via ? " " + via : ""); }
  const k = t.waterway || t.natural || (t.landuse === "forest" && "forest") || (t.boundary === "national_park" && "national_park") || t.leisure || t.man_made || t.power || t.aeroway || t.amenity || t.tourism;
  if (k && TYPE_ES[k]) return TYPE_ES[k];
  if (t.historic) return "Sitio histórico";
  if (t.building) return "Edificación";
  return "Elemento";
}
// Punto más cercano sobre una línea (en sus tramos, no solo en los vértices), con proyección local
function nearestOn(P, line) {
  const kx = 111320 * Math.cos(P.lat * rad), ky = 110570, xy = q => [(q.lon - P.lon) * kx, (q.lat - P.lat) * ky];
  let best = null;
  for (let i = 0; i < line.length; i++) {
    const [ax, ay] = xy(line[i]), [bx, by] = xy(line[i + 1] || line[i]), dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    const t = L2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L2)) : 0, x = ax + t * dx, y = ay + t * dy, d = Math.hypot(x, y);
    if (!best || d < best.d) best = { d, lat: P.lat + y / ky, lon: P.lon + x / kx };
  }
  return best;
}
const geomsOf = el => el.type === "node" ? [] : el.type === "way" ? (el.geometry ? [el.geometry.filter(Boolean)] : []) : (el.members || []).filter(m => m.geometry).map(m => m.geometry.filter(Boolean));
async function loadFeatures(id) {
  S.busy.feats = true; S.errs.feats = null; featLayer.clearLayers(); renderFeats();
  const { lat, lon } = S.point, r = S.radius, body = "data=" + encodeURIComponent(overpassQuery(lat, lon, r));
  let data = null, lastErr = null;
  for (const [i, ep] of OVERPASS.entries()) { // un servidor tras otro; la copia guardada solo si fallan todos
    try { data = await getJSON(ep, { method: "POST", body, headers: FORM, key: "overpass\n" + body, stale: i === OVERPASS.length - 1, check: overpassCheck }, 65000, 1); break; } catch (e) { lastErr = e; }
  }
  if (id !== reqId) return;
  S.busy.feats = false; esTags(data);
  if (!data) { S.errs.feats = (lastErr && lastErr.message) || "No se pudieron cargar los alrededores"; renderFeats(); return; }
  const seen = new Map(), cnt = (data.elements || []).find(el => el.type === "count");
  S.buildings = cnt ? +(cnt.tags.total || cnt.tags.ways || 0) : null; // todas las edificaciones mapeadas, con o sin nombre
  for (const el of data.elements || []) {
    if (el.type === "count") continue;
    const t = el.tags || {}, cat = classify(t), lines = geomsOf(el);
    let best = null;
    if (el.type === "node") best = { lat: el.lat, lon: el.lon, d: dist(S.point, el) };
    else for (const line of lines) { const n = line.length ? nearestOn(S.point, line) : null; if (n && (!best || n.d < best.d)) best = n; }
    if (!best || best.d > r * 1.05) continue;
    const name = t.name || t.ref || ""; // esTags ya dejó el nombre en español
    const f = { id: el.type + el.id, cat, name, type: typeLabel(t, cat), tags: t, lat: best.lat, lon: best.lon, d: best.d, lines, parts: 1,
      closed: lines.length > 0 && lines.every(l => l.length > 3 && l[0].lat === l[l.length - 1].lat && l[0].lon === l[l.length - 1].lon) };
    const key = name ? `${cat}|${f.type}|${name}` : f.id, prev = seen.get(key);
    if (prev) { prev.lines.push(...lines); prev.parts++; if (f.d < prev.d) Object.assign(prev, { lat: f.lat, lon: f.lon, d: f.d }); }
    else seen.set(key, f);
  }
  S.feats = [...seen.values()].sort((a, b) => a.d - b.d);
  drawFeatures(); renderFeats(); renderNav(); renderTerrain();
}
function drawFeatures() {
  featLayer.clearLayers();
  for (const f of S.feats) {
    if (S.hiddenCats.has(f.cat)) continue;
    const color = cssVar(CATS[f.cat].color);
    const popup = `<b>${esc(f.name || f.type)}</b><br>${esc(f.type)}<br>${fmtDist(f.d)} al ${rumbo(bearing(S.point, f))}<br><span style="font-family:monospace">${f.lat.toFixed(5)}, ${f.lon.toFixed(5)}</span>${extraInfo(f.tags)}`;
    for (const line of f.lines) {
      if (line.length < 2) continue;
      const ll = line.map(p => [p.lat, p.lon]), area = f.closed && f.cat !== "puente" && !f.tags.waterway;
      (area ? L.polygon(ll, { color, weight: 1.5, fillOpacity: 0.15 }) : L.polyline(ll, { color, weight: f.cat === "puente" ? 6 : f.tags.waterway === "river" ? 4 : 2.5, opacity: 0.9 })).bindPopup(popup).addTo(featLayer);
    }
    f.marker = L.circleMarker([f.lat, f.lon], { radius: 6, color: "#fff", weight: 2, fillColor: color, fillOpacity: 1 }).bindPopup(popup).addTo(featLayer);
  }
}
function extraInfo(t) {
  const rows = [];
  if (t.ele) rows.push(`Altitud: ${esc(t.ele)} m`); if (t.height) rows.push(`Altura: ${esc(t.height)} m`);
  if (t.maxweight) rows.push(`Peso máx.: ${esc(t.maxweight)} t`); if (t.width) rows.push(`Ancho: ${esc(t.width)} m`);
  if (t.highway && t.bridge) rows.push(`Vía: ${esc(t.highway)}`); if (t.operator) rows.push(`Operador: ${esc(t.operator)}`);
  if (t.opening_hours) rows.push(`Horario: ${esc(t.opening_hours)}`); if (t.phone) rows.push(`Tel.: ${esc(t.phone)}`);
  if (t.wikipedia) { const [lang, title] = t.wikipedia.split(":"); if (title) rows.push(`<a href="https://${esc(lang)}.wikipedia.org/wiki/${encodeURIComponent(title)}" target="_blank" rel="noopener">Wikipedia</a>`); }
  const soc = socialFromTags(t); if (soc.length) rows.push(soc.map(a => `<a href="${esc(a.url)}" target="_blank" rel="noopener nofollow">${esc(NETS[a.net].label)}</a>`).join(" · "));
  return rows.length ? "<br>" + rows.join("<br>") : "";
}
