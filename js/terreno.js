// Reconocimiento del terreno: relieve, pendientes, perfiles, suelo y accesos
"use strict";

// ---------- Terreno: elevación SRTM 30 m (teselas en el navegador, respaldo Copernicus 90 m de Open‑Meteo) + cobertura y accesos (OpenStreetMap) ----------
const GRID = 9, HI = 51; // 9×9 muestras en un cuadro del tamaño del radio de análisis
const offset = (p, dn, de) => ({ lat: p.lat + dn / 111320, lon: p.lon + de / (111320 * Math.cos(p.lat * rad)) });
// Primero el modelo en teselas (rápido y sin límite de consultas); si no carga, Open‑Meteo. El arreglo lleva .src con la fuente usada.
async function elevations(pts) {
  try { return Object.assign(await demElevations(pts), { src: DEM_SRC }); } catch (_) { /* respaldo */ }
  const out = [];
  for (let k = 0; k < pts.length; k += 100) {
    const ch = pts.slice(k, k + 100);
    const d = await getJSON(`https://api.open-meteo.com/v1/elevation?latitude=${ch.map(p => p.lat.toFixed(5)).join(",")}&longitude=${ch.map(p => p.lon.toFixed(5)).join(",")}`);
    out.push(...d.elevation);
  }
  return Object.assign(out, { src: "Copernicus 90 m (Open‑Meteo)" });
}
async function loadTerrain(id) {
  S.busy.terrain = true; S.errs.terrain = null; S.terrain = null; renderTerrain();
  const P = S.point, R = Math.max(500, S.radius), step = 2 * R / (GRID - 1), h = 90;
  const pts = [];
  for (let r = 0; r < GRID; r++) for (let c = 0; c < GRID; c++) pts.push(offset(P, R - r * step, -R + c * step)); // fila 0 = norte
  pts.push(offset(P, h, 0), offset(P, -h, 0), offset(P, 0, h), offset(P, 0, -h), P);
  // perfiles densos oeste → este y sur → norte por el punto
  const NP = 61, line = f => Array.from({ length: NP }, (_, k) => f(-R + 2 * R * k / (NP - 1)));
  const pWE = line(d => offset(P, 0, d)), pSN = line(d => offset(P, d, 0));
  pts.push(...pWE, ...pSN);
  try {
    const e = await elevations(pts); if (id !== reqId) return;
    const base = GRID * GRID + 5, prof = (pp, k) => ({ pts: pp, vals: e.slice(base + k * NP, base + (k + 1) * NP) });
    const g = e.slice(0, GRID * GRID), [eN, eS, eE, eW, e0] = e.slice(GRID * GRID);
    const dzx = (eE - eW) / (2 * h), dzy = (eN - eS) / (2 * h);
    const slopes = [];
    for (let r = 1; r < GRID - 1; r++) for (let c = 1; c < GRID - 1; c++) {
      const gx = (g[r * GRID + c + 1] - g[r * GRID + c - 1]) / (2 * step), gy = (g[(r - 1) * GRID + c] - g[(r + 1) * GRID + c]) / (2 * step);
      slopes.push(Math.atan(Math.hypot(gx, gy)) / rad);
    }
    const mn = Math.min(...g), mx = Math.max(...g);
    // relieve fino para el mapa sombreado (solo con el modelo en teselas, que no tiene límite de consultas)
    let hi = null;
    if (e.src === DEM_SRC) {
      const hp = []; for (let i = 0; i < HI; i++) for (let j = 0; j < HI; j++) hp.push(offset(P, R - 2 * R * i / (HI - 1), -R + 2 * R * j / (HI - 1)));
      hi = await demElevations(hp).catch(() => null); if (id !== reqId) return;
    }
    S.terrain = { g, e0, R, step, mn, mx, relief: mx - mn, src: e.src, hi, pWE: prof(pWE, 0), pSN: prof(pSN, 1),
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
    if (best) roads.push({ t, ...best, geom: g });
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
// Altitud en una posición relativa del cuadro (fx de oeste a este, fy de norte a sur, entre 0 y 1)
function terrAt(t, fx, fy) {
  const [n, g] = t.hi ? [HI, t.hi] : [GRID, t.g];
  const y = fy * (n - 1), x = fx * (n - 1), r = Math.min(n - 2, Math.floor(y)), c = Math.min(n - 2, Math.floor(x)), dy = y - r, dx = x - c, at = (i, j) => g[i * n + j];
  return at(r, c) * (1 - dx) * (1 - dy) + at(r, c + 1) * dx * (1 - dy) + at(r + 1, c) * (1 - dx) * dy + at(r + 1, c + 1) * dx * dy;
}
// Mapa hipsométrico con sombreado de laderas (luz del noroeste)
function terrainSVG(t, hover = false) {
  const M = 51, S2 = 150 / M, cell = 2 * t.R / (M - 1), v = [];
  for (let i = 0; i < M; i++) for (let j = 0; j < M; j++) v.push(terrAt(t, j / (M - 1), i / (M - 1)));
  const vz = (i, j) => v[Math.min(M - 1, Math.max(0, i)) * M + Math.min(M - 1, Math.max(0, j))];
  const ex = Math.max(1, Math.min(4, 300 / Math.max(t.relief, 1))); // realza el sombreado en terreno plano
  let cells = "";
  for (let i = 0; i < M; i++) for (let j = 0; j < M; j++) {
    const gx = (vz(i, j + 1) - vz(i, j - 1)) / (2 * cell) * ex, gy = (vz(i - 1, j) - vz(i + 1, j)) / (2 * cell) * ex;
    const sl = Math.atan(Math.hypot(gx, gy)), az = Math.atan2(gx, gy); // az: dirección de subida
    const sh = Math.cos(0.785) * Math.cos(sl) + Math.sin(0.785) * Math.sin(sl) * Math.cos(az - 5.498 + Math.PI);
    const k = Math.max(0.55, Math.min(1.25, 0.45 + 0.85 * sh)), base = hypso(v[i * M + j], t).match(/\d+/g).map(Number);
    cells += `<rect x="${(j * S2).toFixed(2)}" y="${(i * S2).toFixed(2)}" width="${(S2 + 0.3).toFixed(2)}" height="${(S2 + 0.3).toFixed(2)}" fill="rgb(${base.map(c => Math.min(255, Math.round(c * k))).join(",")})"/>`;
  }
  return `<svg viewBox="0 0 150 150" role="img" aria-label="Mapa de altitudes del área: verde bajo, marrón alto"${hover ? ' class="terrmap" data-terr="1"' : ""} shape-rendering="crispEdges">${cells}
    <circle cx="75" cy="75" r="5" fill="#f2b928" stroke="#fff" stroke-width="2" shape-rendering="auto"/>
    <text x="7" y="16" font-size="12" font-weight="700" fill="#fff" stroke="rgba(0,0,0,.6)" stroke-width="2.5" paint-order="stroke">N ↑</text>
    <text x="143" y="143" font-size="10" text-anchor="end" fill="#fff" stroke="rgba(0,0,0,.6)" stroke-width="2.5" paint-order="stroke">${fmtDist(2 * t.R)}</text></svg>`;
}
// Perfil de elevación; con pts (puntos del trazo) es interactivo: al pasar el dedo o el cursor marca el punto en el mapa
const PROF = new Map(); let profSeq = 0;
function profileSVG(vals, total, a = "", b = "", pts = null) {
  const W = 400, H = 110, pl = 40, pr = 6, pt = 10, pb = 20;
  const mn = Math.min(...vals), mx = Math.max(...vals), span = Math.max(mx - mn, 10), lo = mn - span * 0.1, hi = mx + span * 0.1;
  const x = i => pl + i * (W - pl - pr) / (vals.length - 1), y = v => pt + (1 - (v - lo) / (hi - lo)) * (H - pt - pb);
  const line = vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  let key = "";
  if (pts) { key = String(++profSeq); PROF.set(key, { vals, pts, total, x, y, pl, pr, W, H, pt, pb }); if (PROF.size > 12) PROF.delete(PROF.keys().next().value); }
  return `<svg class="prof${pts ? " live" : ""}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Perfil de elevación de ${esc(a)} a ${esc(b)}"${pts ? ` data-prof="${key}"` : ""}>
    <line x1="${pl}" x2="${W - pr}" y1="${y(mx)}" y2="${y(mx)}" stroke="var(--line)"/><line x1="${pl}" x2="${W - pr}" y1="${y(mn)}" y2="${y(mn)}" stroke="var(--line)"/>
    <path d="${line}L${x(vals.length - 1).toFixed(1)},${H - pb}L${pl},${H - pb}Z" fill="var(--c-naturaleza)" opacity=".2"/>
    <path d="${line}" fill="none" stroke="var(--c-naturaleza)" stroke-width="2"/>
    <text x="${pl - 4}" y="${y(mx) + 4}" font-size="10" text-anchor="end" fill="var(--muted)">${fmtNum(Math.round(mx))} m</text>
    <text x="${pl - 4}" y="${y(mn) + 4}" font-size="10" text-anchor="end" fill="var(--muted)">${fmtNum(Math.round(mn))} m</text>
    <text x="${pl}" y="${H - 5}" font-size="10" fill="var(--muted)">${esc(a)}</text>
    <text x="${W - pr}" y="${H - 5}" font-size="10" text-anchor="end" fill="var(--muted)">${esc(b)} · ${fmtDist(total)}</text>
    ${pts ? `<g class="cur" visibility="hidden"><line y1="${pt}" y2="${H - pb}" stroke="var(--ink)" stroke-dasharray="3 3"/><circle r="4" fill="var(--gold)" stroke="#fff" stroke-width="1.5"/><rect class="lbl-bg" y="${pt}" height="16" rx="4" fill="var(--ink)"/><text class="lbl" y="${pt + 12}" font-size="10.5" fill="var(--sheet)"></text></g>` : ""}</svg>`;
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
    const we = t.pWE || { vals: row }, sn = t.pSN || { vals: col };
    top = `<div class="terr"><div>${terrainSVG(t, true)}<div class="terr-hover" id="terrHover">Pasa el cursor o el dedo sobre el relieve</div></div><div><p class="tclass">${cls}</p><p class="src" style="margin:0">${cdesc}</p>
      <div class="facts" style="grid-template-columns:repeat(2,minmax(0,1fr));margin-top:10px">
        <div class="fact"><small>Altitud</small><b>${fmtNum(Math.round(t.e0))} m</b></div>
        <div class="fact"><small>Pendiente aquí</small><b>${t.slope.toFixed(0)}°${t.slope >= 2 ? ` ↘ ${rumbo(t.aspect)}` : ""}</b></div>
        <div class="fact"><small>Desnivel</small><b>${fmtNum(Math.round(t.relief))} m</b></div>
        <div class="fact"><small>Pendiente media</small><b>${t.mean.toFixed(0)}°</b></div></div></div></div>
      <ul class="tnote">${notes.map(n => `<li>${esc(n)}</li>`).join("")}</ul>
      <div class="terr-acts"><button class="btn" data-act="view3d"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m2 20 7-12 4 6 3-4 6 10z"/></svg>Ver en 3D</button><button class="btn" data-act="slopes" aria-pressed="${map.hasLayer(slopeLayer)}">Mapa de pendientes</button></div>
      <div class="sub">Perfil oeste → este</div>${profileSVG(we.vals, 2 * t.R, "O", "E", we.pts)}
      <div class="sub">Perfil sur → norte</div>${profileSVG(sn.vals, 2 * t.R, "S", "N", sn.pts)}
      <p class="src">Cuadro de ${fmtDist(2 * t.R)} de lado. Relieve: ${esc(t.src || "")}. La pendiente “aquí” usa puntos a 90 m; la flecha indica hacia dónde baja la ladera. Recorre los perfiles para ver cada punto en el mapa. Cambia el radio en “Entorno” para analizar un área mayor.</p>`;
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
  el.innerHTML = `<h3>Reconocimiento del terreno <small>${t && t.src === DEM_SRC ? "SRTM 30 m" : t ? "Copernicus 90 m" : "Relieve"} · OSM</small></h3>${top}${ground}`;
}

// ---------- Recorrer el relieve con el cursor o el dedo ----------
let hoverDot = null;
function showHoverDot(lat, lon) {
  if (hoverDot) hoverDot.setLatLng([lat, lon]);
  else hoverDot = L.circleMarker([lat, lon], { radius: 7, color: "#fff", weight: 2, fillColor: cssVar("--gold"), fillOpacity: 1, interactive: false }).addTo(map);
  if (!map.getBounds().pad(-0.05).contains([lat, lon])) map.panTo([lat, lon], { animate: true, duration: 0.3 });
}
function hideHoverDot() { if (hoverDot) { map.removeLayer(hoverDot); hoverDot = null; } }
function svgPoint(svg, e) { const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); }
function onProfileMove(svg, e) {
  const P = PROF.get(svg.dataset.prof); if (!P) return;
  const sp = svgPoint(svg, e), n = P.vals.length, f = Math.max(0, Math.min(1, (sp.x - P.pl) / (P.W - P.pl - P.pr))), k = f * (n - 1), i = Math.min(n - 2, Math.floor(k)), d = k - i;
  const v = P.vals[i] + (P.vals[i + 1] - P.vals[i]) * d, a = P.pts[i], b = P.pts[i + 1];
  const lat = a.lat + (b.lat - a.lat) * d, lon = (a.lon ?? a.lng) + ((b.lon ?? b.lng) - (a.lon ?? a.lng)) * d;
  const g = svg.querySelector(".cur"), X = P.x(k), Y = P.y(v), txt = `${fmtDist(P.total * f)} · ${fmtNum(Math.round(v))} m`;
  g.setAttribute("visibility", "visible");
  g.querySelector("line").setAttribute("x1", X); g.querySelector("line").setAttribute("x2", X);
  g.querySelector("circle").setAttribute("cx", X); g.querySelector("circle").setAttribute("cy", Y);
  const w = txt.length * 5.6 + 10, lx = Math.min(P.W - P.pr - w, Math.max(P.pl, X - w / 2));
  g.querySelector(".lbl-bg").setAttribute("x", lx); g.querySelector(".lbl-bg").setAttribute("width", w);
  const t = g.querySelector(".lbl"); t.setAttribute("x", lx + 5); t.textContent = txt;
  showHoverDot(lat, lon);
}
function onTerrMove(svg, e) {
  const t = S.terrain; if (!t || !S.point) return;
  const sp = svgPoint(svg, e), fx = Math.max(0, Math.min(1, sp.x / 150)), fy = Math.max(0, Math.min(1, sp.y / 150));
  const p = offset(S.point, t.R - 2 * t.R * fy, -t.R + 2 * t.R * fx), v = terrAt(t, fx, fy), d = dist(S.point, p);
  const lab = $("#terrHover"); if (lab) lab.textContent = `${fmtNum(Math.round(v))} m · ${d < 15 ? "en el punto" : `${fmtDist(d)} al ${rumbo(bearing(S.point, p))}`} · ${v >= t.e0 ? "+" : "−"}${fmtNum(Math.abs(Math.round(v - t.e0)))} m`;
  showHoverDot(p.lat, p.lon);
}
document.addEventListener("pointermove", e => {
  const pr = e.target.closest && e.target.closest("svg.prof.live"); if (pr) return onProfileMove(pr, e);
  const tm = e.target.closest && e.target.closest("svg[data-terr]"); if (tm) return onTerrMove(tm, e);
});
document.addEventListener("pointerout", e => {
  const s = e.target.closest && e.target.closest("svg.prof.live, svg[data-terr]"); if (!s || s.contains(e.relatedTarget)) return;
  const g = s.querySelector(".cur"); if (g) g.setAttribute("visibility", "hidden");
  if (s.dataset.terr) { const lab = $("#terrHover"); if (lab) lab.textContent = "Pasa el cursor o el dedo sobre el relieve"; }
  hideHoverDot();
});
