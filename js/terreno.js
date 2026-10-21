// Reconocimiento del terreno: relieve, pendientes, perfiles, suelo y accesos
"use strict";

// ---------- Terreno: elevación Copernicus 90 m (Open‑Meteo) + cobertura y accesos (OpenStreetMap) ----------
const GRID = 9; // 9×9 muestras en un cuadro del tamaño del radio de análisis
const offset = (p, dn, de) => ({ lat: p.lat + dn / 111320, lon: p.lon + de / (111320 * Math.cos(p.lat * rad)) });
async function elevations(pts) {
  const out = [];
  for (let k = 0; k < pts.length; k += 100) {
    const ch = pts.slice(k, k + 100);
    const d = await getJSON(`https://api.open-meteo.com/v1/elevation?latitude=${ch.map(p => p.lat.toFixed(5)).join(",")}&longitude=${ch.map(p => p.lon.toFixed(5)).join(",")}`);
    out.push(...d.elevation);
  }
  return out;
}
async function loadTerrain(id) {
  S.busy.terrain = true; S.errs.terrain = null; S.terrain = null; renderTerrain();
  const P = S.point, R = Math.max(500, S.radius), step = 2 * R / (GRID - 1), h = 90;
  const pts = [];
  for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) pts.push(offset(P, R - r * step, -R + c * step)); // fila 0 = norte
  pts.push(offset(P, h, 0), offset(P, -h, 0), offset(P, 0, h), offset(P, 0, -h), P);
  try {
    const e = await elevations(pts); if (id !== reqId) return;
    const g = e.slice(0, GRID * GRID), [eN, eS, eE, eW, e0] = e.slice(GRID * GRID);
    const dzx = (eE - eW) / (2 * h), dzy = (eN - eS) / (2 * h);
    const slopes = [];
    for (let r = 1; r < GRID - 1; r++) for (let c = 1; c < GRID - 1; c++) {
      const gx = (g[r * GRID + c + 1] - g[r * GRID + c - 1]) / (2 * step), gy = (g[(r - 1) * GRID + c] - g[(r + 1) * GRID + c]) / (2 * step);
      slopes.push(Math.atan(Math.hypot(gx, gy)) / rad);
    }
    const mn = Math.min(...g), mx = Math.max(...g);
    S.terrain = { g, e0, R, step, mn, mx, relief: mx - mn,
      slope: Math.atan(Math.hypot(dzx, dzy)) / rad,
      aspect: (Math.atan2(-dzx, -dzy) / rad + 360) % 360, // hacia dónde baja la ladera
      mean: slopes.reduce((a, b) => a + b, 0) / slopes.length,
      steep: slopes.filter(s => s > 15).length / slopes.length,
      below: g.filter(v => v < e0).length / g.length,
      water: g.filter(v => v <= 0.5).length / g.length };
  } catch (err) { if (id === reqId) S.errs.terrain = err.message; }
  if (id === reqId) { S.busy.terrain = false; renderTerrain(); renderCoords(); }
}
function groundQuery(lat, lon) {
  return `[out:json][timeout:30];
is_in(${lat},${lon})->.a;
area.a[~"^(landuse|natural|leisure|boundary)$"~"."]->.b;
.b out tags;
(
way(around:3000,${lat},${lon})["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|track)$"];
way(around:400,${lat},${lon})["highway"];
);
out tags geom(${bboxAround(lat, lon, 3000)}) 800;`;
}
async function loadGround(id) {
  S.busy.ground = true; S.errs.ground = null; S.ground = null; renderTerrain();
  const { lat, lon } = S.point, body = "data=" + encodeURIComponent(groundQuery(lat, lon));
  let data = null, lastErr = null;
  for (const ep of OVERPASS) { try { data = await getJSON(ep, { method: "POST", body, headers: FORM }, 40000, 1); break; } catch (e) { lastErr = e; } }
  if (id !== reqId) return;
  S.busy.ground = false;
  if (!data) { S.errs.ground = (lastErr && lastErr.message) || "No se pudo consultar OpenStreetMap"; renderTerrain(); return; }
  const areas = [], roads = [];
  for (const el of data.elements || []) {
    const t = el.tags || {};
    if (el.type === "area") { if (t.boundary !== "administrative") areas.push(t); continue; }
    if (!t.highway) continue;
    const g = (el.geometry || []).filter(Boolean), best = g.length ? nearestOn(S.point, g) : null;
    if (best) roads.push({ t, ...best });
  }
  roads.sort((a, b) => a.d - b.d);
  S.ground = { areas, roads,
    near: roads[0], main: roads.find(r => /^(motorway|trunk|primary|secondary|tertiary)$/.test(r.t.highway)),
    dirt: roads.find(r => /^(track|path|footway)$/.test(r.t.highway)) };
  renderTerrain();
}
const COVER_ES = {
  forest: "Bosque", wood: "Bosque", scrub: "Matorral", grassland: "Sabana / pastizal", meadow: "Pradera", heath: "Sabana arbustiva", wetland: "Humedal / estero",
  water: "Cuerpo de agua", sand: "Arena / médanos", bare_rock: "Roca desnuda", beach: "Playa", farmland: "Cultivos", farmyard: "Finca", orchard: "Frutales",
  plantation: "Plantación", residential: "Zona residencial", commercial: "Zona comercial", retail: "Zona comercial", industrial: "Zona industrial",
  military: "Zona militar", quarry: "Cantera / mina", landfill: "Vertedero", cemetery: "Cementerio", grass: "Áreas verdes", park: "Parque",
  nature_reserve: "Reserva natural", national_park: "Parque nacional", protected_area: "Área protegida", reservoir: "Embalse", basin: "Laguna artificial",
  recreation_ground: "Área recreativa", cliff: "Farallón", peak: "Cumbre", ridge: "Fila", valley: "Valle", bay: "Bahía", island: "Isla", islet: "Islote",
};
const HW_ES = {
  motorway: "Autopista", trunk: "Troncal", primary: "Carretera principal", secondary: "Carretera secundaria", tertiary: "Carretera local",
  unclassified: "Vía rural", residential: "Calle", service: "Vía de servicio", track: "Trocha / camino de tierra", path: "Sendero", footway: "Camino peatonal",
  living_street: "Calle", pedestrian: "Vía peatonal", steps: "Escaleras", cycleway: "Ciclovía", bridleway: "Camino de herradura",
};
const SURF_ES = { paved: "pavimentada", asphalt: "asfaltada", concrete: "de concreto", unpaved: "sin pavimento", dirt: "de tierra", earth: "de tierra", gravel: "de granzón", ground: "de tierra", sand: "de arena", grass: "de grama", mud: "de barro" };
function terrainClass(t) {
  if (t.water > 0.6 && t.mx < 5) return ["Agua o costa baja", "Casi toda el área está a nivel del mar."];
  if (t.mean < 2) return t.relief < 60 ? ["Llanura", "Terreno plano, típico de llanos, sabanas o planicies costeras."] : ["Llanura con lomas", "Mayormente plano, con alguna elevación aislada en el área."];
  if (t.mean < 5) return ["Terreno ondulado", "Pendientes suaves y lomas bajas."];
  if (t.mean < 12) return ["Colinas", "Relieve moderado con subidas y bajadas marcadas."];
  if (t.mean < 25) return ["Montañoso", "Laderas pronunciadas y valles encajados."];
  return ["Montañoso escarpado", "Pendientes muy fuertes, farallones o paredes de tepuy."];
}
const transit = s => s < 3 ? "Apto para vehículos comunes en el punto" : s < 8 ? "Transitable en vehículo; cuidado con lluvia" : s < 15 ? "Requiere 4x4 o ir a pie" : s < 30 ? "Solo a pie, con dificultad" : "Pendiente extrema: requiere equipo de escalada";
function hypso(v, t) {
  if (v <= 0.5 && t.mn <= 0.5) return "rgb(90,162,255)";
  const k = t.mx > t.mn ? (v - t.mn) / (t.mx - t.mn) : 0.5;
  const st = [[0, [46, 125, 50]], [0.35, [166, 190, 86]], [0.65, [214, 170, 92]], [0.85, [150, 104, 66]], [1, [236, 236, 230]]];
  let i = 1; while (i < st.length - 1 && k > st[i][0]) i++;
  const [k0, c0] = st[i - 1], [k1, c1] = st[i], f = Math.min(1, Math.max(0, (k - k0) / (k1 - k0)));
  return `rgb(${c0.map((c, j) => Math.round(c + (c1[j] - c) * f)).join(",")})`;
}
function terrainSVG(t) {
  const M = 33, S2 = 150 / M, at = (r, c) => t.g[r * GRID + c];
  let cells = "";
  for (let i = 0; i < M; i++) for (let j = 0; j < M; j++) {
    const y = i * (GRID - 1) / (M - 1), x = j * (GRID - 1) / (M - 1), r = Math.min(GRID - 2, Math.floor(y)), c = Math.min(GRID - 2, Math.floor(x)), fy = y - r, fx = x - c;
    const v = at(r, c) * (1 - fx) * (1 - fy) + at(r, c + 1) * fx * (1 - fy) + at(r + 1, c) * (1 - fx) * fy + at(r + 1, c + 1) * fx * fy;
    cells += `<rect x="${(j * S2).toFixed(2)}" y="${(i * S2).toFixed(2)}" width="${(S2 + 0.3).toFixed(2)}" height="${(S2 + 0.3).toFixed(2)}" fill="${hypso(v, t)}"/>`;
  }
  return `<svg viewBox="0 0 150 150" role="img" aria-label="Mapa de altitudes del área: verde bajo, marrón alto" shape-rendering="crispEdges">${cells}
    <circle cx="75" cy="75" r="5" fill="#f2b928" stroke="#fff" stroke-width="2" shape-rendering="auto"/>
    <text x="7" y="16" font-size="12" font-weight="700" fill="#fff" stroke="rgba(0,0,0,.6)" stroke-width="2.5" paint-order="stroke">N ↑</text>
    <text x="143" y="143" font-size="10" text-anchor="end" fill="#fff" stroke="rgba(0,0,0,.6)" stroke-width="2.5" paint-order="stroke">${fmtDist(2 * t.R)}</text></svg>`;
}
function profileSVG(vals, total, a = "", b = "") {
  const W = 400, H = 110, pl = 40, pr = 6, pt = 10, pb = 20;
  const mn = Math.min(...vals), mx = Math.max(...vals), span = Math.max(mx - mn, 10), lo = mn - span * 0.1, hi = mx + span * 0.1;
  const x = i => pl + i * (W - pl - pr) / (vals.length - 1), y = v => pt + (1 - (v - lo) / (hi - lo)) * (H - pt - pb);
  const line = vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  return `<svg class="prof" viewBox="0 0 ${W} ${H}" role="img" aria-label="Perfil de elevación de ${esc(a)} a ${esc(b)}">
    <line x1="${pl}" x2="${W - pr}" y1="${y(mx)}" y2="${y(mx)}" stroke="var(--line)"/><line x1="${pl}" x2="${W - pr}" y1="${y(mn)}" y2="${y(mn)}" stroke="var(--line)"/>
    <path d="${line}L${x(vals.length - 1).toFixed(1)},${H - pb}L${pl},${H - pb}Z" fill="var(--c-naturaleza)" opacity=".2"/>
    <path d="${line}" fill="none" stroke="var(--c-naturaleza)" stroke-width="2"/>
    <text x="${pl - 4}" y="${y(mx) + 4}" font-size="10" text-anchor="end" fill="var(--muted)">${fmtNum(Math.round(mx))} m</text>
    <text x="${pl - 4}" y="${y(mn) + 4}" font-size="10" text-anchor="end" fill="var(--muted)">${fmtNum(Math.round(mn))} m</text>
    <text x="${pl}" y="${H - 5}" font-size="10" fill="var(--muted)">${esc(a)}</text>
    <text x="${W - pr}" y="${H - 5}" font-size="10" text-anchor="end" fill="var(--muted)">${esc(b)} · ${fmtDist(total)}</text></svg>`;
}
function roadLine(label, r) {
  if (!r) return "";
  const t = r.t, kind = HW_ES[t.highway] || "Vía", sf = SURF_ES[t.surface] || "";
  const surf = sf && !kind.includes(sf.replace(/^de /, "")) ? `, ${sf}` : "";

  const nm = t.name || t.ref ? ` (${esc(t.name || t.ref)})` : "";
  return `<div class="kv"><dt>${label}</dt><dd style="font:14px var(--f-body)">${esc(kind)}${nm}${esc(surf)}</dd><span class="src" style="white-space:nowrap">${fmtDist(r.d)} ${rumbo(bearing(S.point, r))}</span></div>`;
}
function renderTerrain() {
  const el = $("#s-terreno"); if (!el) return;
  const t = S.terrain;
  let top;
  if (S.busy.terrain) top = `<div class="loading">Analizando el relieve…</div>`;
  else if (S.errs.terrain) top = errBox("terrain", S.errs.terrain);
  else if (t) {
    const [cls, cdesc] = terrainClass(t), C = (GRID - 1) / 2;
    const row = t.g.slice(C * GRID, C * GRID + GRID), col = t.g.filter((_, i) => i % GRID === C).reverse();
    const pos = t.below >= 0.85 ? "Punto alto: domina visualmente el entorno" : t.below <= 0.15 ? "Punto bajo (fondo de valle o depresión): acumula agua y la vista es limitada" : "Posición intermedia respecto al entorno";
    const water = S.feats.find(f => f.cat === "agua" && f.d < 600);
    const notes = [transit(t.slope), pos];
    if (t.steep > 0.2) notes.push(`${Math.round(t.steep * 100)} % del área supera 15° de pendiente: posible riesgo de deslizamientos con lluvias fuertes.`);
    if (water && t.below <= 0.35) notes.push(`${water.name || water.type} a ${fmtDist(water.d)} y terreno bajo: zona potencialmente inundable.`);
    top = `<div class="terr">${terrainSVG(t)}<div><p class="tclass">${cls}</p><p class="src" style="margin:0">${cdesc}</p>
      <div class="facts" style="grid-template-columns:repeat(2,minmax(0,1fr));margin-top:10px">
        <div class="fact"><small>Altitud</small><b>${fmtNum(Math.round(t.e0))} m</b></div>
        <div class="fact"><small>Pendiente aquí</small><b>${t.slope.toFixed(0)}°${t.slope >= 2 ? ` ↘ ${rumbo(t.aspect)}` : ""}</b></div>
        <div class="fact"><small>Desnivel</small><b>${fmtNum(Math.round(t.relief))} m</b></div>
        <div class="fact"><small>Pendiente media</small><b>${t.mean.toFixed(0)}°</b></div></div></div></div>
      <ul class="tnote">${notes.map(n => `<li>${esc(n)}</li>`).join("")}</ul>
      <div class="sub">Perfil oeste → este</div>${profileSVG(row, 2 * t.R, "O", "E")}
      <div class="sub">Perfil sur → norte</div>${profileSVG(col, 2 * t.R, "S", "N")}
      <p class="src">Cuadro de ${fmtDist(2 * t.R)} de lado (${GRID}×${GRID} puntos cada ${fmtDist(t.step)}). La pendiente “aquí” usa puntos a 90 m; la flecha indica hacia dónde baja la ladera. Cambia el radio en “Entorno” para analizar un área mayor.</p>`;
  } else top = "";
  let ground;
  if (S.busy.ground) ground = `<div class="loading">Consultando cobertura del suelo y accesos…</div>`;
  else if (S.errs.ground) ground = errBox("ground", S.errs.ground);
  else if (S.ground) {
    const g = S.ground, seen = new Set(), tags = [];
    for (const a of g.areas) for (const k of ["boundary", "leisure", "landuse", "natural"]) {
      const lab = COVER_ES[a[k]]; if (!lab) continue;
      const txt = a.name && /^(boundary|leisure)$/.test(k) ? `${lab}: ${a.name}` : lab;
      if (!seen.has(txt)) { seen.add(txt); tags.push(txt); }
    }
    ground = `<div class="sub">Cobertura y uso del suelo en el punto</div>${tags.length ? `<div class="tags">${tags.map(x => `<span class="tag">${esc(x)}</span>`).join("")}</div>` : `<p class="src">OpenStreetMap no tiene áreas mapeadas que contengan este punto. Usa la vista Satélite para identificarlo.</p>`}
      <div class="sub">Accesos</div>${g.roads.length ? `<dl>${roadLine("Vía más cercana", g.near)}${g.main && g.main !== g.near ? roadLine("Carretera", g.main) : ""}${g.dirt && g.dirt !== g.near ? roadLine("Trocha / sendero", g.dirt) : ""}</dl>`
        : `<p class="src">No hay vías mapeadas en 3 km: el acceso probablemente es fluvial, aéreo o a pie.</p>`}`;
  } else ground = "";
  el.innerHTML = `<h3>Reconocimiento del terreno <small>Copernicus 90 m · OSM</small></h3>${top}${ground}`;
}
