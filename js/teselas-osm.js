// Respaldo del Entorno y de los accesos con las teselas vectoriales de OpenStreetMap (OpenFreeMap)
"use strict";

// Cuando los servidores de Overpass están caídos o saturados (pasa seguido), el Entorno y los accesos se arman con
// las mismas teselas que usa la vista 3D: vienen de un CDN, responden rápido y traen agua, edificaciones, vías,
// puentes, túneles, cobertura del suelo, poblados y lugares. Las etiquetas se traducen a las de OpenStreetMap para
// que el resto de la app (categorías, nombres en español, reporte) funcione igual.
const OFM_TILEJSON = "https://tiles.openfreemap.org/planet", MVT_Z = 14, MVT_MAX_TILES = 30;
let ofmTiles = null;
async function ofmTemplate() {
  if (!ofmTiles) ofmTiles = getJSON(OFM_TILEJSON, {}, 15000, 2).then(j => j.tiles[0]).catch(e => { ofmTiles = null; throw e; });
  return ofmTiles;
}

// ---------- Lector mínimo de Mapbox Vector Tiles (protobuf) ----------
function pbfReader(buf) {
  const b = new Uint8Array(buf), dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let p = 0;
  const varint = () => { let v = 0, s = 1, x; do { x = b[p++]; v += (x & 0x7f) * s; s *= 128; } while (x >= 128); return v; };
  return {
    get pos() { return p; }, end: b.length, varint,
    sub(len) { const r = pbfReader(b.subarray(p, p + len)); p += len; return r; },
    str(len) { const s = new TextDecoder().decode(b.subarray(p, p + len)); p += len; return s; },
    f32() { const v = dv.getFloat32(p, true); p += 4; return v; }, f64() { const v = dv.getFloat64(p, true); p += 8; return v; },
    skip(wt) { if (wt === 0) varint(); else if (wt === 1) p += 8; else if (wt === 2) p += varint(); else if (wt === 5) p += 4; },
    packed() { const len = varint(), e = p + len, out = []; while (p < e) out.push(varint()); return out; },
  };
}
const zz = n => (n >>> 1) ^ -(n & 1);
function mvtValue(r) {
  const e = r.pos + r.varint(); let v = null;
  while (r.pos < e) {
    const k = r.varint(), f = k >> 3, wt = k & 7;
    if (f === 1) v = r.str(r.varint()); else if (f === 2) v = r.f32(); else if (f === 3) v = r.f64();
    else if (f === 4 || f === 5) v = r.varint(); else if (f === 6) v = zz(r.varint()); else if (f === 7) v = !!r.varint(); else r.skip(wt);
  }
  return v;
}
// Devuelve { capa: [{ id, type (1 punto, 2 línea, 3 polígono), props, rings: [[ [x,y]… ]] (coordenadas de la tesela) }] , extent }
function mvtDecode(buf) {
  const r = pbfReader(buf), layers = {};
  while (r.pos < r.end) {
    const k = r.varint();
    if (k >> 3 !== 3) { r.skip(k & 7); continue; }
    const L = r.sub(r.varint()), keys = [], vals = [], feats = [];
    let name = "", extent = 4096;
    while (L.pos < L.end) {
      const lk = L.varint(), f = lk >> 3;
      if (f === 1) name = L.str(L.varint());
      else if (f === 2) feats.push(L.sub(L.varint()));
      else if (f === 3) keys.push(L.str(L.varint()));
      else if (f === 4) vals.push(mvtValue(L));
      else if (f === 5) extent = L.varint();
      else L.skip(lk & 7);
    }
    layers[name] = feats.map(F => {
      let id = 0, tags = [], type = 0, geom = [];
      while (F.pos < F.end) {
        const fk = F.varint(), f = fk >> 3;
        if (f === 1) id = F.varint(); else if (f === 2) tags = F.packed(); else if (f === 3) type = F.varint(); else if (f === 4) geom = F.packed(); else F.skip(fk & 7);
      }
      const props = {}; for (let i = 0; i + 1 < tags.length; i += 2) props[keys[tags[i]]] = vals[tags[i + 1]];
      const rings = []; let x = 0, y = 0, cur = null;
      for (let i = 0; i < geom.length;) {
        const c = geom[i++], cmd = c & 7, n = c >> 3;
        if (cmd === 7) { if (cur && cur.length) cur.push(cur[0]); continue; }
        for (let j = 0; j < n; j++) {
          x += zz(geom[i++]); y += zz(geom[i++]);
          if (cmd === 1) { cur = [[x, y]]; rings.push(cur); } else cur.push([x, y]);
        }
      }
      return { id, type, props, rings };
    });
    layers[name].extent = extent;
  }
  return layers;
}

// ---------- De las clases de OpenMapTiles a etiquetas de OpenStreetMap ----------
const OMT_AMENITY = new Set(["hospital", "clinic", "doctors", "police", "fire_station", "fuel", "school", "college", "university", "kindergarten", "place_of_worship",
  "townhall", "pharmacy", "bank", "marketplace", "prison", "community_centre", "grave_yard", "bus_station", "ferry_terminal", "post_office", "courthouse", "shelter", "drinking_water"]);
const OMT_TOURISM = new Set(["attraction", "viewpoint", "museum", "camp_site", "hotel", "zoo", "information", "picnic_site"]);
const OMT_LEISURE = new Set(["park", "nature_reserve", "garden", "stadium", "sports_centre", "marina", "golf_course"]);
const OMT_HW = { motorway: "motorway", trunk: "trunk", primary: "primary", secondary: "secondary", tertiary: "tertiary", minor: "residential", service: "service", track: "track", path: "path", raceway: "raceway", busway: "service" };
function omtTags(layer, p) {
  const name = p["name:es"] || p.name || p["name:latin"] || "", t = name ? { name } : {};
  switch (layer) {
    case "water": {
      if (p.class === "swimming_pool" || p.class === "ocean") return null; // el mar sería un polígono enorme
      const w = { lake: "lake", river: "river", pond: "pond", dock: "basin" }[p.class];
      return Object.assign(t, { natural: "water" }, w ? { water: w } : {});
    }
    case "water_name": return p.class === "ocean" || p.class === "sea" || !name ? null : Object.assign(t, { natural: "water" }, p.class === "lake" ? { water: "lake" } : {});
    case "waterway": return Object.assign(t, { waterway: p.class }, p.brunnel === "tunnel" ? { tunnel: "culvert" } : {});
    case "transportation": {
      const rail = /^(rail|transit)$/.test(p.class), hw = OMT_HW[p.class];
      if (p.class === "aerialway") return Object.assign(t, { aerialway: p.subclass || "cable_car" });
      if (p.class === "ferry" || (!rail && !hw)) return null;
      const base = rail ? { railway: p.subclass === "subway" ? "subway" : p.subclass === "light_rail" ? "light_rail" : "rail" } : { highway: hw };
      if (p.surface) base.surface = p.surface;
      if (p.brunnel === "bridge") return Object.assign(t, base, { bridge: "yes" });
      if (p.brunnel === "tunnel") return Object.assign(t, base, { tunnel: "yes" });
      return Object.assign(t, base, { _road: 1 });
    }
    case "landcover": {
      const s = p.subclass || p.class;
      if (/^(forest|wood)$/.test(s)) return { landuse: "forest" };
      if (/^(wetland|bog|swamp|marsh|mangrove|reedbed|saltmarsh|tidalflat)$/.test(s)) return { natural: "wetland" };
      if (/^(scrub|grassland|heath|beach|sand|bare_rock|scree|glacier)$/.test(s)) return { natural: s === "scree" ? "bare_rock" : s };
      if (/^(farmland|orchard|plantation|meadow|vineyard|allotments|grass|park)$/.test(s)) return { landuse: s, _cover: 1 };
      return null;
    }
    case "landuse": return /^(quarry|military|cemetery|industrial|landfill|railway|construction)$/.test(p.class) ? Object.assign(t, { landuse: p.class })
      : /^(residential|commercial|retail|farmland|stadium|school|university|hospital)$/.test(p.class) ? { landuse: p.class, _cover: 1 } : null;
    case "park": return Object.assign(t, p.class === "national_park" ? { boundary: "national_park" } : p.class === "protected_area" ? { boundary: "protected_area" } : { leisure: "nature_reserve" });
    case "mountain_peak": return Object.assign(t, { natural: p.class === "volcano" ? "volcano" : p.class === "saddle" ? "saddle" : p.class === "ridge" ? "ridge" : "peak" }, p.ele != null ? { ele: String(p.ele) } : {});
    case "aeroway": return /^(aerodrome|runway|helipad|heliport)$/.test(p.class) ? Object.assign(t, { aeroway: p.class }) : null;
    case "aerodrome_label": return Object.assign(t, { aeroway: "aerodrome" });
    case "place": return /^(town|village|hamlet|isolated_dwelling|neighbourhood|suburb|quarter|island|islet|locality)$/.test(p.class) ? Object.assign(t, { place: p.class }) : null;
    case "poi": {
      const s = p.subclass || p.class;
      if (s === "bridge") return null;
      if (OMT_AMENITY.has(s)) return Object.assign(t, { amenity: s });
      if (OMT_TOURISM.has(s)) return Object.assign(t, { tourism: s });
      if (OMT_LEISURE.has(s)) return Object.assign(t, { leisure: s });
      if (/^(tower|water_tower|lighthouse|mast|communications_tower|silo|chimney|windmill|storage_tank|pier|works|wastewater_plant|water_works)$/.test(s)) return Object.assign(t, { man_made: s });
      if (/^(waterfall|spring|cave_entrance|peak)$/.test(s)) return Object.assign(t, s === "waterfall" ? { waterway: s } : { natural: s });
      if (/^(monument|memorial|castle|ruins|archaeological_site|fort)$/.test(s)) return Object.assign(t, { historic: s });
      if (/^(halt|station|subway)$/.test(s) && p.class === "railway") return Object.assign(t, { railway: "station" });
      if (s === "bus_station") return Object.assign(t, { amenity: s });
      return null;
    }
  }
  return null;
}
const OMT_LAYERS = ["water", "water_name", "waterway", "transportation", "landcover", "landuse", "park", "mountain_peak", "aeroway", "aerodrome_label", "place", "poi", "building"];

// Teselas ya leídas en esta sesión (el Entorno y los accesos piden casi las mismas)
const mvtCache = new Map();
function mvtTile(tpl, X, Y) {
  const k = `${X}/${Y}`;
  if (!mvtCache.has(k)) {
    if (mvtCache.size > 80) mvtCache.delete(mvtCache.keys().next().value);
    mvtCache.set(k, fetch(tpl.replace("{z}", MVT_Z).replace("{x}", X).replace("{y}", Y))
      .then(res => res.ok ? res.arrayBuffer() : Promise.reject(new Error(res.status))).then(mvtDecode)
      .catch(() => { mvtCache.delete(k); return null; }));
  }
  return mvtCache.get(k);
}
// Lee las teselas z14 que cubren el círculo y devuelve elementos con el formato de Overpass
async function tileElements(lat, lon, r) {
  const n = 2 ** MVT_Z, tx = x => (x + 180) / 360 * n, ty = la => { const s = Math.sin(la * rad); return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n; };
  const [s, w, nn, e] = bboxAround(lat, lon, r).split(",").map(Number);
  const x0 = Math.floor(tx(w)), x1 = Math.floor(tx(e)), y0 = Math.floor(ty(nn)), y1 = Math.floor(ty(s));
  const list = []; for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) list.push([x, y]);
  if (list.length > MVT_MAX_TILES) throw netErr("Área demasiado grande para el respaldo de teselas", false);
  const tpl = await ofmTemplate();
  const toLL = (X, Y, ext, px, py) => { const gx = (X + px / ext) / n, gy = (Y + py / ext) / n; return { lat: Math.atan(Math.sinh(Math.PI * (1 - 2 * gy))) / rad, lon: gx * 360 - 180 }; };
  const byId = new Map(), blds = new Set();
  let ok = 0;
  await Promise.all(list.map(async ([X, Y]) => {
    const L = await mvtTile(tpl, X, Y);
    if (!L) return;
    ok++;
    for (const name of OMT_LAYERS) for (const f of L[name] || []) {
      const ext = L[name].extent;
      if (name === "building") { // solo se cuentan, por el primer vértice dentro del círculo
        const p0 = f.rings[0] && f.rings[0][0]; if (!p0) continue;
        const ll = toLL(X, Y, ext, p0[0], p0[1]); if (dist({ lat, lon }, ll) <= r) blds.add(f.id || `${X}/${Y}/${p0}`);
        continue;
      }
      const t = omtTags(name, f.props); if (!t) continue;
      const key = `${name}/${f.id || X + "/" + Y + "/" + byId.size}`;
      const rings = f.rings.map(rg => rg.map(([px, py]) => toLL(X, Y, ext, px, py)));
      const prev = byId.get(key);
      if (prev) { if (f.type !== 1 && prev.members) prev.members.push(...rings.map(g => ({ geometry: g, tile: `${X}/${Y}` }))); continue; }
      byId.set(key, f.type === 1 && rings[0] ? { type: "node", id: key, tags: t, ...rings[0][0] } : { type: "relation", id: key, tags: t, members: rings.map(g => ({ geometry: g, tile: `${X}/${Y}` })) });
    }
  }));
  if (!ok) throw netErr("No se pudieron descargar las teselas de OpenStreetMap", true);
  return { elements: [...byId.values()], buildings: blds.size };
}

// Entorno de respaldo: los elementos de las teselas sin las vías comunes ni la cobertura del suelo
async function tileFeatures(lat, lon, r) {
  const { elements } = await tileElements(lat, lon, r); // las edificaciones vienen fusionadas en las teselas: no sirven para contarlas
  return { elements: elements.filter(el => !el.tags._road && !el.tags._cover) };
}
// Punto dentro de un polígono (anillos en lat/lon)
function insideRings(P, rings) {
  let inside = false;
  for (const g of rings) for (let i = 0, j = g.length - 1; i < g.length; j = i++)
    if ((g[i].lat > P.lat) !== (g[j].lat > P.lat) && P.lon < (g[j].lon - g[i].lon) * (P.lat - g[i].lat) / (g[j].lat - g[i].lat) + g[i].lon) inside = !inside;
  return inside;
}
// Accesos y cobertura del suelo de respaldo, con la misma forma que S.ground
async function tileGround(lat, lon) {
  const P = { lat, lon }, { elements } = await tileElements(lat, lon, 3000), areas = [], roads = [];
  for (const el of elements) {
    const t = el.tags, rings = (el.members || []).map(m => m.geometry);
    if (t.highway) {
      for (const g of rings) {
        const best = g.length ? nearestOn(P, g) : null;
        if (best && (best.d <= 400 || /^(motorway|trunk|primary|secondary|tertiary|track)$/.test(t.highway))) roads.push({ t, ...best, geom: g });
      }
      continue;
    }
    if (!(t.landuse || t.natural || t.leisure || t.boundary || t.place)) continue;
    // cada tesela trae su pedazo del polígono (con borde que se solapa): se prueba tesela por tesela
    const byTile = {}; for (const m of el.members || []) if (m.geometry.length > 3) (byTile[m.tile] = byTile[m.tile] || []).push(m.geometry);
    if (Object.values(byTile).some(g => insideRings(P, g))) areas.push(t);
  }
  roads.sort((a, b) => a.d - b.d);
  return { areas, roads, near: roads[0], main: roads.find(r => /^(motorway|trunk|primary|secondary|tertiary)$/.test(r.t.highway)),
    dirt: roads.find(r => /^(track|path|footway)$/.test(r.t.highway)), src: "teselas" };
}
