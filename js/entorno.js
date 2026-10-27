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
// Dos consultas: la principal (mismo costo que antes de v3.10, para que el Entorno salga siempre) y otra con los
// extras (túneles, lagunas con water=*, poblados, vías férreas, edificaciones con uso…). En v3.10.0 iba todo en una
// sola consulta pesada que los servidores rechazaban o cortaban por tiempo, y el Entorno no salía en ningún lado.
const FEAT_MAX = 1000, EXTRA_MAX = 800, BLD_MAX = 500; // tope de elementos por bloque; si se alcanza se avisa en la ficha
function overpassQuery(lat, lon, r) {
  const A = `(around:${r},${lat},${lon})`;
  return `[out:json][timeout:60][maxsize:268435456];
(
way${A}["bridge"]["bridge"!="no"];
nwr${A}["man_made"="bridge"];
way${A}["waterway"~"^(river|stream|canal|drain|ditch|brook|rapids|tidal_channel)$"];
nwr${A}["natural"~"^(water|wood|peak|wetland|beach|cliff|spring|volcano|cave_entrance|scrub|grassland|heath|bay|hill|ridge|sand|bare_rock|valley|saddle|cape|shoal|reef|hot_spring|gorge|plateau)$"];
nwr${A}["leisure"~"^(park|nature_reserve|garden|stadium|sports_centre|marina|golf_course)$"];
nwr${A}["boundary"~"^(national_park|protected_area)$"];
nwr${A}["landuse"~"^(forest|reservoir|basin|aquaculture|salt_pond|quarry|landfill|military|cemetery|construction|industrial|port)$"];
nwr${A}["waterway"~"^(riverbank|dam|weir|waterfall|lock_gate|dock)$"];
nwr${A}["man_made"~"^(tower|water_tower|mast|dam|lighthouse|silo|pier|chimney|storage_tank|antenna|communications_tower|petroleum_well|pipeline|works|water_works|wastewater_plant|reservoir_covered|water_well|dyke|breakwater|groyne|mineshaft|adit|tailings_pond|quay|observatory)$"];
nwr${A}["power"~"^(plant|substation|generator|line)$"];
nwr${A}["building"]["name"];
nwr${A}["aeroway"~"^(aerodrome|helipad|heliport|runway|airstrip)$"];
nwr${A}["historic"];
nwr${A}["tourism"~"^(attraction|viewpoint|museum|camp_site|hotel|zoo)$"];
nwr${A}["amenity"~"^(hospital|clinic|doctors|police|fire_station|fuel|school|college|university|place_of_worship|townhall|pharmacy|bank|marketplace|prison|community_centre|grave_yard|bus_station|ferry_terminal|water_point|drinking_water|shelter|post_office|courthouse|ranger_station)$"];
);
out tags geom(${bboxAround(lat, lon, r)}) ${FEAT_MAX};
way${A}["building"];
out count;`;
}
// Edificaciones "genéricas" (viviendas, techos, galpones sin uso): se cuentan pero no se listan una por una.
const GENERIC_BLD = "^(yes|house|residential|apartments|detached|semidetached_house|terrace|hut|shed|roof|garage|garages|carport|bungalow|cabin|static_caravan|ruins)$";
function extraQuery(lat, lon, r) {
  const A = `(around:${r},${lat},${lon})`;
  return `[out:json][timeout:45][maxsize:268435456];
(
way${A}["tunnel"]["tunnel"!~"^(no|building_passage)$"]["highway"!~"^(footway|path|steps|corridor|service)$"];
nwr${A}["water"]["natural"!="water"];
nwr${A}["place"~"^(island|islet|town|village|hamlet|isolated_dwelling|neighbourhood|suburb|farm|locality)$"];
nwr${A}["military"];
way${A}["railway"~"^(rail|light_rail|subway|narrow_gauge)$"];
node${A}["railway"~"^(station|halt)$"];
way${A}["aerialway"];
nwr${A}["barrier"~"^(city_wall|retaining_wall|border_control|toll_booth)$"];
);
out tags geom(${bboxAround(lat, lon, r)}) ${EXTRA_MAX};
(
way${A}["building"]["building"!~"${GENERIC_BLD}"]["name"!~"."];
nwr${A}["construction"]["name"!~"."];
);
out tags center ${BLD_MAX};`;
}
const WATER_LU = ["reservoir", "basin", "aquaculture", "salt_pond"];
function classify(t) {
  if ((t.bridge && t.bridge !== "no") || t.man_made === "bridge") return "puente";
  if (t.waterway || t.water || WATER_LU.includes(t.landuse) || ["water", "wetland", "spring", "bay", "hot_spring", "geyser", "shoal", "reef"].includes(t.natural)) return "agua";
  if (t.natural || t.landuse === "forest" || ["national_park", "protected_area"].includes(t.boundary) || ["park", "nature_reserve", "garden"].includes(t.leisure) || ["island", "islet", "archipelago"].includes(t.place)) return "naturaleza";
  if (t.amenity || t.emergency || t.office) return "servicio";
  if (t.historic || t.tourism || t.place) return "interes";
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
  drain: "Desagüe / caño", ditch: "Zanja / acequia", brook: "Arroyo", rapids: "Raudal / rápidos", tidal_channel: "Caño de marea", riverbank: "Cauce del río",
  lock_gate: "Esclusa", dock: "Dique / dársena", boatyard: "Astillero", heath: "Sabana arbustiva", bare_rock: "Roca desnuda / laja", valley: "Valle",
  saddle: "Abra / portachuelo", cape: "Cabo / punta", rock: "Roca", stone: "Piedra", arch: "Arco natural", shoal: "Bajo / banco de arena", reef: "Arrecife",
  mud: "Fangal", glacier: "Glaciar", hot_spring: "Aguas termales", geyser: "Géiser", sinkhole: "Sima / dolina", gorge: "Cañón / garganta", plateau: "Meseta / tepuy",
  quarry: "Cantera / mina", landfill: "Vertedero de basura", cemetery: "Cementerio", construction: "Construcción en curso", brownfield: "Terreno baldío",
  industrial: "Zona industrial", port: "Puerto", depot: "Depósito / patio", aquaculture: "Lagunas de cría", salt_pond: "Salina", basin: "Laguna artificial", reservoir: "Embalse",
  island: "Isla", islet: "Islote", archipelago: "Archipiélago", city: "Ciudad", town: "Pueblo", village: "Caserío / pueblo", hamlet: "Caserío",
  isolated_dwelling: "Vivienda aislada", neighbourhood: "Sector / barrio", suburb: "Urbanización / parroquia", quarter: "Sector", farm: "Finca / hato", locality: "Paraje",
  stadium: "Estadio", sports_centre: "Centro deportivo", marina: "Marina", golf_course: "Campo de golf", track: "Pista", water_park: "Parque acuático", slipway: "Rampa de botes",
  protected_area: "Área protegida", water_works: "Planta potabilizadora", wastewater_plant: "Planta de tratamiento", reservoir_covered: "Tanque de agua",
  water_well: "Pozo de agua", embankment: "Terraplén", dyke: "Dique", breakwater: "Rompeolas", groyne: "Espigón", crane: "Grúa", mineshaft: "Pozo minero",
  adit: "Socavón / bocamina", cross: "Cruz", monitoring_station: "Estación de monitoreo", telescope: "Telescopio", kiln: "Horno", gasometer: "Gasómetro",
  bunker_silo: "Silo búnker", tailings_pond: "Laguna de relaves", quay: "Muelle", levee: "Dique", observatory: "Observatorio", satellite_dish: "Antena satelital",
  offshore_platform: "Plataforma costa afuera", line: "Línea eléctrica", minor_line: "Línea eléctrica", transformer: "Transformador",
  rail: "Vía férrea", light_rail: "Tren ligero", subway: "Metro", narrow_gauge: "Vía férrea", station: "Estación", halt: "Parada de tren", tram: "Tranvía",
  cable_car: "Teleférico", gondola: "Teleférico", chair_lift: "Telesilla", heliport: "Helipuerto", runway: "Pista de aterrizaje", airstrip: "Pista de aterrizaje",
  city_wall: "Muralla", wall: "Muro", retaining_wall: "Muro de contención", border_control: "Puesto fronterizo", gate: "Portón / alcabala", toll_booth: "Peaje",
  hotel: "Hotel / posada", information: "Información turística", picnic_site: "Área de picnic", zoo: "Zoológico", doctors: "Consultorio", college: "Instituto",
  kindergarten: "Preescolar", bank: "Banco", marketplace: "Mercado", prison: "Cárcel", community_centre: "Centro comunal", grave_yard: "Cementerio",
  bus_station: "Terminal de pasajeros", ferry_terminal: "Terminal de ferry", water_point: "Toma de agua", drinking_water: "Agua potable", shelter: "Refugio",
  post_office: "Correo", courthouse: "Tribunal", ranger_station: "Puesto de guardaparques", emergency_service: "Emergencias", ambulance_station: "Ambulancias",
  assembly_point: "Punto de encuentro", government: "Oficina de gobierno",
};
// Agua: lago, laguna, embalse… según la etiqueta water=*
const WATER_ES = { lake: "Lago", lagoon: "Laguna", pond: "Laguna / estanque", reservoir: "Embalse", river: "Cauce del río", oxbow: "Madre vieja (laguna)", canal: "Canal",
  basin: "Laguna artificial", wastewater: "Laguna de oxidación", fishpond: "Lagunas de cría", stream: "Quebrada", ditch: "Zanja", rapids: "Raudal", moat: "Foso", salt: "Salina", lock: "Esclusa" };
const BLD_ES = { church: "Iglesia", chapel: "Capilla", cathedral: "Catedral", mosque: "Mezquita", temple: "Templo", school: "Escuela", university: "Universidad",
  college: "Instituto", hospital: "Hospital", industrial: "Galpón industrial", warehouse: "Galpón / depósito", commercial: "Edificio comercial", retail: "Local comercial",
  office: "Edificio de oficinas", hotel: "Hotel", government: "Edificio público", public: "Edificio público", civic: "Edificio público", military: "Edificio militar",
  construction: "Edificación en construcción", farm: "Casa de finca", farm_auxiliary: "Instalación agrícola", barn: "Granero", stable: "Establo", cowshed: "Vaquera",
  greenhouse: "Invernadero", hangar: "Hangar", train_station: "Estación", transportation: "Terminal", stadium: "Estadio", sports_hall: "Gimnasio", grandstand: "Tribuna",
  parking: "Estacionamiento", service: "Caseta de servicio", water_tower: "Tanque elevado", tower: "Torre", bunker: "Búnker", fire_station: "Bomberos",
  kindergarten: "Preescolar", supermarket: "Supermercado", dormitory: "Residencia", hut: "Rancho", ruins: "Ruinas", bridge: "Puente", toilets: "Baños", kiosk: "Kiosco" };
function typeLabel(t, cat) {
  if (cat === "puente") { const via = t.railway ? "férreo" : ["footway", "path", "pedestrian", "steps", "cycleway"].includes(t.highway) ? "peatonal" : t.highway ? "vehicular" : ""; return "Puente" + (via ? " " + via : ""); }
  if (t.tunnel && t.tunnel !== "no" && (t.highway || t.railway || t.waterway)) return t.waterway ? "Embaulado / alcantarilla" : t.railway ? "Túnel férreo" : "Túnel";
  if (t.water && WATER_ES[t.water]) return WATER_ES[t.water];
  if (t.construction || t.building === "construction" || t.landuse === "construction") return "Construcción en curso";
  if (t.building && !new RegExp(GENERIC_BLD).test(t.building) && BLD_ES[t.building] && !t.amenity) return BLD_ES[t.building];
  if (t.power === "line" || t.power === "minor_line") { const kv = parseFloat(String(t.voltage || "").split(";")[0]) / 1000; return "Línea eléctrica" + (kv >= 1 ? ` ${Math.round(kv)} kV` : ""); }
  if (t.military) return "Zona militar";
  const k = t.waterway || t.natural || (WATER_LU.includes(t.landuse) && t.landuse) || (t.boundary && TYPE_ES[t.boundary] && t.boundary) || t.leisure || t.man_made || t.power
    || t.railway || (t.aerialway && (TYPE_ES[t.aerialway] ? t.aerialway : "cable_car")) || t.aeroway || t.amenity || t.emergency || t.office || t.tourism || t.place || t.landuse || t.barrier;
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
async function overpassFetch(q, ms) {
  const body = "data=" + encodeURIComponent(q);
  let lastErr = null;
  for (const [i, ep] of OVERPASS.entries()) { // un servidor tras otro; la copia guardada solo si fallan todos
    try { return await getJSON(ep, { method: "POST", body, headers: FORM, key: "overpass\n" + body, stale: i === OVERPASS.length - 1, check: overpassCheck }, ms, 1); } catch (e) { lastErr = e; }
  }
  throw lastErr || new Error("No se pudieron cargar los alrededores");
}
// Convierte la respuesta de Overpass en elementos de la ficha; seen agrupa por nombre y tipo, ids evita repetidos
function addFeatures(els, seen, ids) {
  const r = S.radius;
  for (const el of els) {
    if (el.type === "count" || ids.has(el.type + el.id)) continue;
    ids.add(el.type + el.id);
    const t = el.tags || {}, cat = classify(t), lines = geomsOf(el);
    let best = null;
    if (el.type === "node") best = { lat: el.lat, lon: el.lon, d: dist(S.point, el) };
    else if (el.center) best = { lat: el.center.lat, lon: el.center.lon, d: dist(S.point, el.center) };
    else for (const line of lines) { const n = line.length ? nearestOn(S.point, line) : null; if (n && (!best || n.d < best.d)) best = n; }
    if (!best || best.d > r * 1.05) continue;
    const name = t.name || t.ref || ""; // esTags ya dejó el nombre en español
    const f = { id: el.type + el.id, cat, name, type: typeLabel(t, cat), tags: t, lat: best.lat, lon: best.lon, d: best.d, lines, parts: 1,
      closed: lines.length > 0 && lines.every(l => l.length > 3 && l[0].lat === l[l.length - 1].lat && l[0].lon === l[l.length - 1].lon) };
    // los tramos sin nombre de líneas eléctricas, vías férreas, tuberías y teleféricos se agrupan en un solo elemento
    const linear = !name && lines.length && (t.power || t.railway || t.aerialway || t.man_made === "pipeline");
    const key = name ? `${cat}|${f.type}|${name}` : linear ? `${cat}|${f.type}` : f.id, prev = seen.get(key);
    if (prev) { prev.lines.push(...lines); prev.parts++; if (f.d < prev.d) Object.assign(prev, { lat: f.lat, lon: f.lon, d: f.d }); }
    else seen.set(key, f);
  }
  S.feats = [...seen.values()].sort((a, b) => a.d - b.d);
}
async function loadFeatures(id) {
  S.busy.feats = true; S.errs.feats = null; S.featsCut = false; S.featsExtra = null; featLayer.clearLayers(); renderFeats();
  const { lat, lon } = S.point, r = S.radius;
  let data = null;
  try { data = await overpassFetch(overpassQuery(lat, lon, r), 65000); } catch (e) { if (id === reqId) { S.busy.feats = false; S.errs.feats = e.message; renderFeats(); } return; }
  if (id !== reqId) return;
  S.busy.feats = false; esTags(data);
  const seen = new Map(), ids = new Set(), els = data.elements || [], cnt = els.find(el => el.type === "count");
  S.buildings = cnt ? +(cnt.tags.total || cnt.tags.ways || 0) : null; // todas las edificaciones mapeadas, con o sin nombre
  // Overpass corta la salida en FEAT_MAX sin avisar: si se llega al tope, faltan elementos y se dice en la ficha
  S.featsCut = els.filter(el => el.type !== "count").length >= FEAT_MAX;
  addFeatures(els, seen, ids);
  S.featsExtra = "loading";
  drawFeatures(); renderFeats(); renderNav(); renderTerrain();
  // extras después (no a la vez: los servidores limitan las consultas simultáneas por usuario)
  let extra = null;
  try { extra = await overpassFetch(extraQuery(lat, lon, r), 50000); } catch (_) { /* se queda lo principal */ }
  if (id !== reqId) return;
  S.featsExtra = extra ? "ok" : "error";
  if (extra) {
    esTags(extra);
    const xe = extra.elements || [];
    if (xe.filter(el => !el.center).length >= EXTRA_MAX || xe.filter(el => el.center).length >= BLD_MAX) S.featsCut = true;
    addFeatures(xe, seen, ids);
    drawFeatures(); renderNav(); renderTerrain();
  }
  renderFeats();
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
