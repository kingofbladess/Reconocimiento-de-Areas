// Reporte operativo del área: reúne lo consultado del punto (terreno, clima, accesos, infraestructura, riesgos)
// en un documento imprimible para apoyar la toma de decisiones. Todo se calcula en el navegador con fuentes abiertas.
"use strict";

// Colores fijos de papel (el reporte siempre se ve claro, también al imprimir o descargar)
const REP_COLORS = { puente: "#c2410c", agua: "#1d6fd1", naturaleza: "#2f8a3c", estructura: "#6b4fa3", interes: "#b7791f", servicio: "#c22f4f" };
const REP_LEVEL = [null, { t: "BAJO", c: "#2f8a3c" }, { t: "MODERADO", c: "#b7791f" }, { t: "ALTO", c: "#c22f4f" }];
const REP_CSS = `
.rep { --c-naturaleza: #2f8a3c; --line: #d3dedb; --muted: #56706b; font: 14px/1.5 "Source Sans 3", "Segoe UI", system-ui, sans-serif; color: #15201e; }
.rep h1 { font: 700 22px/1.2 "Sora", "Trebuchet MS", sans-serif; margin: 6px 0 2px; letter-spacing: -.01em; }
.rep h2 { font: 700 15px "Sora", "Trebuchet MS", sans-serif; margin: 22px 0 8px; padding-bottom: 4px; border-bottom: 2px solid #15201e; text-transform: uppercase; letter-spacing: .04em; break-after: avoid; }
.rep h3 { font: 600 13px "Sora", sans-serif; margin: 12px 0 4px; text-transform: uppercase; letter-spacing: .05em; color: #56706b; }
.rep p { margin: 4px 0; }
.rep .cls { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; font: 600 11px "IBM Plex Mono", Consolas, monospace; letter-spacing: .08em; text-transform: uppercase; border: 1.5px solid #15201e; padding: 5px 8px; }
.rep .meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 4px 16px; margin: 10px 0 0; font-size: 13px; }
.rep .meta b, .rep .mono { font-family: "IBM Plex Mono", Consolas, monospace; font-weight: 500; }
.rep table { width: 100%; border-collapse: collapse; margin: 6px 0; font-size: 13px; break-inside: auto; }
.rep th, .rep td { text-align: left; padding: 5px 6px; border-bottom: 1px solid #d3dedb; vertical-align: top; }
.rep th { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #56706b; font-weight: 600; }
.rep td.n { text-align: right; font-family: "IBM Plex Mono", Consolas, monospace; white-space: nowrap; }
.rep tr { break-inside: avoid; }
.rep ul { margin: 4px 0; padding-left: 18px; }
.rep li { margin: 3px 0; }
.rep .lvl { display: inline-block; min-width: 76px; text-align: center; padding: 1px 8px; border-radius: 4px; color: #fff; font: 700 11px "IBM Plex Mono", Consolas, monospace; letter-spacing: .06em; }
.rep .box { border: 1px solid #d3dedb; border-radius: 6px; padding: 10px 12px; margin: 8px 0; break-inside: avoid; }
.rep .global { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.rep .two { display: grid; grid-template-columns: 220px 1fr; gap: 16px; align-items: start; break-inside: avoid; }
.rep .two svg { width: 100%; height: auto; display: block; border-radius: 6px; }
.rep .prof { width: 100%; height: 110px; display: block; }
.rep .sketch { width: 100%; max-width: 440px; height: auto; display: block; margin: 0 auto; }
.rep .legend { display: flex; flex-wrap: wrap; gap: 4px 14px; justify-content: center; font-size: 12px; color: #56706b; margin-top: 4px; }
.rep .legend i { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 5px; vertical-align: -1px; }
.rep .note { font-size: 12px; color: #56706b; }
.rep .keep { break-inside: avoid; }
.rep .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 28px; font-size: 12px; color: #56706b; }
.rep .sign div { border-top: 1px solid #15201e; padding-top: 4px; }
@media (max-width: 600px) { .rep .two { grid-template-columns: 1fr; } .rep .two svg { max-width: 240px; } }
@media print { .rep h2 { break-after: avoid; } .rep .box, .rep .two { break-inside: avoid; } }
`;
document.head.insertAdjacentHTML("beforeend", `<style id="repCss">${REP_CSS}</style>`);

const REP_KEYS = ["info", "weather", "terrain", "ground", "feats", "quakes", "wiki", "photos"];
const REP = { html: "", name: "" };
async function waitForData(id, maxMs = 30000) {
  const t0 = Date.now();
  while (REP_KEYS.some(k => S.busy[k]) && Date.now() - t0 < maxMs && id === reqId) await sleep(400);
}
async function openReport() {
  if (!S.point) return;
  const id = reqId;
  $("#report").hidden = false;
  $("#reportBody").innerHTML = `<div class="loading">Reuniendo la información del área… (terreno, clima, accesos, infraestructura y riesgos)</div>`;
  await waitForData(id);
  if (id !== reqId || $("#report").hidden) return;
  REP.html = buildReport();
  $("#reportBody").innerHTML = REP.html;
  $("#report .report-scroll").scrollTop = 0;
}
$("#repClose").addEventListener("click", () => { $("#report").hidden = true; });
$("#repPrint").addEventListener("click", () => { if (REP.html) window.print(); });
$("#repDownload").addEventListener("click", () => {
  if (!REP.html) return;
  const doc = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(REP.name)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700&family=Source+Sans+3:wght@400;600&family=IBM+Plex+Mono:wght@500;600&display=swap">
<style>body{margin:0;background:#fff}.wrap{max-width:900px;margin:0 auto;padding:28px 24px}${REP_CSS}</style></head><body><div class="wrap">${REP.html}</div></body></html>`;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([doc], { type: "text/html" }));
  a.download = `${REP.name.replace(/[^\wáéíóúñü -]+/gi, "").replace(/\s+/g, "-").toLowerCase()}.html`;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
});

// ---------- Cálculos ----------
const MESES = ["ENE", "FEB", "MAR", "ABR", "MAY", "JUN", "JUL", "AGO", "SEP", "OCT", "NOV", "DIC"];
function dtg(date = new Date()) { // grupo fecha-hora, hora de Venezuela (UTC-4, zona Q)
  const d = new Date(date.getTime() - 4 * 3600e3), p = n => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}Q ${MESES[d.getUTCMonth()]} ${String(d.getUTCFullYear()).slice(2)}`;
}
const nearestFeat = pred => S.feats.find(pred) || null; // S.feats ya viene ordenado por distancia
const where = f => `${fmtDist(f.d)} al ${rumbo(bearing(S.point, f))}`;
const lvlTag = n => n ? `<span class="lvl" style="background:${REP_LEVEL[n].c}">${REP_LEVEL[n].t}</span>` : `<span class="lvl" style="background:#8a9a97">SIN DATO</span>`;

function assessRisks() {
  const t = S.terrain, w = S.weather, g = S.ground, r = [];
  const water = nearestFeat(f => f.cat === "agua");
  if (t) {
    const n = t.steep > 0.35 || t.mean > 20 ? 3 : t.steep > 0.15 || t.mean > 10 ? 2 : 1;
    r.push({ k: "Deslizamientos y derrumbes", n, t: `Pendiente media ${t.mean.toFixed(0)}°; ${Math.round(t.steep * 100)} % del área supera 15°.` });
    const rain3 = w ? Math.max(...w.daily.precipitation_sum.slice(0, 3).map(v => v || 0)) : 0;
    const low = t.below <= 0.35, near = water && water.d < 600;
    const nf = t.water > 0.6 ? 2 : low && near ? (rain3 >= 20 ? 3 : 2) : water && water.d < 300 ? 2 : 1;
    r.push({ k: "Inundación", n: nf, t: water ? `${water.name || water.type} a ${where(water)}; el punto está ${low ? "en zona baja" : t.below >= 0.85 ? "en zona alta" : "a media altura"} respecto al entorno.` : `Sin cuerpos de agua mapeados en ${fmtDist(S.radius)}; punto ${low ? "en zona baja" : "no deprimido"}.` });
  } else r.push({ k: "Deslizamientos e inundación", n: 0, t: "Sin datos de elevación." });
  if (w) {
    const d = w.daily, pp = Math.max(...d.precipitation_probability_max.slice(0, 3).map(v => v || 0)), storm = d.weather_code.slice(0, 3).some(c => c >= 95);
    const gust = w.current.wind_gusts_10m, vis = w.current.visibility;
    const n = storm || pp >= 80 || gust >= 70 ? 3 : pp >= 50 || gust >= 45 || (vis != null && vis < 2000) ? 2 : 1;
    r.push({ k: "Meteorología (72 h)", n, t: `Prob. de lluvia máx. ${pp} %${storm ? ", tormentas eléctricas previstas" : ""}; ráfagas ${Math.round(gust)} km/h${vis != null ? `; visibilidad ${vis >= 1000 ? (vis / 1000).toFixed(0) + " km" : Math.round(vis) + " m"}` : ""}.` });
  } else r.push({ k: "Meteorología (72 h)", n: 0, t: "Sin datos meteorológicos." });
  if (!S.errs.quakes) {
    const strong = S.quakes.filter(q => q.d < 150), max = strong.reduce((a, q) => !a || q.mag > a.mag ? q : a, null);
    const n = strong.some(q => q.mag >= 5.5) ? 3 : strong.some(q => q.mag >= 4.5) ? 2 : 1;
    r.push({ k: "Actividad sísmica", n, t: max ? `${strong.length} sismos M2.5+ en 150 km el último año; mayor M${max.mag.toFixed(1)} a ${fmtDist(max.d)}.` : `Sin sismos M2.5+ en 150 km durante el último año (${S.quakes.length} en 300 km).` });
  } else r.push({ k: "Actividad sísmica", n: 0, t: "Sin datos de USGS." });
  if (g) {
    const n = !g.roads.length ? 3 : g.near.d > 1000 ? 2 : 1;
    r.push({ k: "Acceso terrestre", n, t: g.roads.length ? `Vía más cercana: ${HW_ES[g.near.t.highway] || "vía"} a ${fmtDist(g.near.d)}${g.main === g.near ? "" : g.main ? `; carretera a ${fmtDist(g.main.d)}` : "; sin carretera principal en 3 km"}.` : "Sin vías mapeadas en 3 km." });
  } else r.push({ k: "Acceso terrestre", n: 0, t: "Sin datos de vías." });
  if (S.air && S.air.us_aqi != null) { const a = S.air.us_aqi; r.push({ k: "Calidad del aire", n: a > 150 ? 3 : a > 100 ? 2 : 1, t: `Índice AQI ${a} (${aqiInfo(a)[0].toLowerCase()}); PM2.5 ${S.air.pm2_5} µg/m³.` }); }
  return r;
}

function recommendations(risks) {
  const t = S.terrain, w = S.weather, g = S.ground, rec = [];
  if (g && g.roads.length) {
    const m = g.main || g.near, nm = m.t.name || m.t.ref;
    rec.push(`Aproximación terrestre por ${HW_ES[m.t.highway] || "vía"}${nm ? ` ${nm}` : ""}, a ${fmtDist(m.d)} al ${rumbo(bearing(S.point, m))} del punto.${g.dirt && g.dirt !== m ? ` Alternativa: ${HW_ES[g.dirt.t.highway].toLowerCase()} a ${fmtDist(g.dirt.d)}.` : ""}`);
  } else if (g) rec.push("Sin vías mapeadas en 3 km: planificar aproximación aérea, fluvial o a pie y confirmar en campo.");
  const bridges = S.feats.filter(f => f.cat === "puente");
  if (bridges.length) {
    const kg = bridges.filter(b => b.tags.maxweight).map(b => `${b.name || "puente"} (${b.tags.maxweight} t)`);
    rec.push(`${bridges.length} puente${bridges.length > 1 ? "s" : ""} en ${fmtDist(S.radius)}; el más cercano a ${where(bridges[0])}. ${kg.length ? `Capacidad registrada: ${kg.join(", ")}.` : "No hay capacidad de carga registrada: verificar antes de cruzar con vehículos pesados."}`);
  }
  if (t) {
    if (t.slope >= 15) rec.push(`Pendiente fuerte en el punto (${t.slope.toFixed(0)}°): ${transit(t.slope).toLowerCase()}.`);
    if (t.below >= 0.85) rec.push("Posición dominante sobre el entorno: apta para observación y enlace de comunicaciones.");
    if (t.below <= 0.15) rec.push("Punto en zona baja: evitar instalaciones o campamentos aquí en temporada de lluvias; buscar terreno más alto cercano.");
    if (t.steep > 0.2) rec.push("Evitar laderas de más de 15° durante y después de lluvias fuertes (riesgo de deslizamiento).");
  }
  if (w) {
    const d = w.daily, dry = d.time.map((day, i) => ({ day, pp: d.precipitation_probability_max[i] ?? 0, code: d.weather_code[i] })).filter(x => x.pp < 30 && x.code < 80);
    const fmtDay = s => new Date(s + "T12:00").toLocaleDateString("es-VE", { weekday: "short", day: "numeric", month: "short" });
    rec.push(dry.length ? `Ventanas de menor probabilidad de lluvia (< 30 %): ${dry.slice(0, 4).map(x => fmtDay(x.day)).join(", ")}.` : "Sin días secos en el pronóstico de 7 días: prever lluvia en todas las actividades.");
    const sr = d.sunrise[0], ss = d.sunset[0];
    if (sr && ss) { const h = (Date.parse(ss) - Date.parse(sr)) / 36e5; rec.push(`Luz diurna: amanecer ${sr.slice(11, 16)}, atardecer ${ss.slice(11, 16)} (${h.toFixed(1)} h de luz).`); }
  }
  const health = nearestFeat(f => ["hospital", "clinic"].includes(f.tags.amenity));
  const air = nearestFeat(f => f.tags.aeroway);
  rec.push(health ? `Atención médica más cercana: ${health.name || health.type} a ${where(health)}.` : `Sin centros de salud mapeados en ${fmtDist(S.radius)}: definir ruta de evacuación médica${air ? ` (${air.type.toLowerCase()} ${air.name || ""} a ${where(air)})` : ""}.`);
  if (risks.some(r => r.k === "Actividad sísmica" && r.n >= 2)) rec.push("Zona con actividad sísmica relevante: verificar estado de estructuras antes de usarlas.");
  const gaps = risks.filter(r => r.n === 0).map(r => r.k.toLowerCase());
  if (gaps.length) rec.push(`Completar con reconocimiento en campo: no se obtuvieron datos de ${gaps.join(", ")}.`);
  rec.push("Validar en el terreno: la información proviene de fuentes abiertas y puede estar desactualizada o incompleta.");
  return rec;
}

// Croquis esquemático del área: punto al centro, círculo del radio y elementos de OSM a escala
function sketchSVG() {
  const R = S.radius, P = S.point, W = 440, C = W / 2, k = (C - 18) / R;
  const kx = 111320 * Math.cos(P.lat * rad), ky = 110570;
  const xy = p => [C + (p.lon - P.lon) * kx * k, C - (p.lat - P.lat) * ky * k];
  const path = line => line.map((p, i) => { const [x, y] = xy(p); return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`; }).join("");
  let roads = "", lines = "", dots = "";
  for (const r of (S.ground && S.ground.roads) || []) if (r.geom && r.geom.length > 1)
    roads += `<path d="${path(r.geom)}" fill="none" stroke="${/^(motorway|trunk|primary|secondary|tertiary)$/.test(r.t.highway) ? "#5b5b5b" : "#a8a8a8"}" stroke-width="${/^(motorway|trunk|primary)$/.test(r.t.highway) ? 3.5 : 1.6}" ${/^(track|path|footway)$/.test(r.t.highway) ? 'stroke-dasharray="4 3"' : ""}/>`;
  for (const f of S.feats) {
    const col = REP_COLORS[f.cat];
    for (const l of f.lines) if (l.length > 1) lines += `<path d="${path(l)}" fill="${f.closed && f.cat !== "puente" && !f.tags.waterway ? col + "22" : "none"}" stroke="${col}" stroke-width="${f.cat === "puente" ? 4 : f.tags.waterway === "river" ? 3 : 1.4}"/>`;
    const [x, y] = xy(f); dots += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.6" fill="${col}" stroke="#fff" stroke-width="1.2"/>`;
  }
  const bar = R / 2, bx = 16, by = W - 16;
  return `<svg class="sketch" viewBox="0 0 ${W} ${W}" role="img" aria-label="Croquis del área">
    <defs><clipPath id="repClip"><circle cx="${C}" cy="${C}" r="${C - 18}"/></clipPath></defs>
    <rect width="${W}" height="${W}" fill="#f6f8f7"/>
    <circle cx="${C}" cy="${C}" r="${C - 18}" fill="#fff" stroke="#15201e" stroke-width="1.2" stroke-dasharray="5 4"/>
    <circle cx="${C}" cy="${C}" r="${(C - 18) / 2}" fill="none" stroke="#c9d3d0" stroke-dasharray="2 4"/>
    <g clip-path="url(#repClip)">${roads}${lines}${dots}</g>
    <circle cx="${C}" cy="${C}" r="7" fill="#d99a06" stroke="#15201e" stroke-width="2"/>
    <path d="M${W - 26},14 l7,18 l-7,-5 l-7,5z" fill="#15201e"/><text x="${W - 26}" y="46" font-size="12" font-weight="700" text-anchor="middle" fill="#15201e">N</text>
    <line x1="${bx}" x2="${bx + bar * k}" y1="${by}" y2="${by}" stroke="#15201e" stroke-width="3"/>
    <text x="${bx}" y="${by - 6}" font-size="11" fill="#15201e">${fmtDist(bar)}</text>
    <text x="${C + (C - 18) / 2 + 3}" y="${C - 3}" font-size="10" fill="#8a9a97">${fmtDist(R / 2)}</text></svg>`;
}

// ---------- Documento ----------
function buildReport() {
  const P = S.point, ad = adminOf(S.place), now = new Date(), t = S.terrain, w = S.weather, g = S.ground, info = S.info, my = S.custom;
  const name = (my && my.name) || S.title || (S.place && (S.place.name || (S.place.display_name || "").split(",")[0])) || "Punto seleccionado";
  const num = `RO-${now.toISOString().slice(0, 10).replace(/-/g, "")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  REP.name = `Reporte ${name} ${now.toISOString().slice(0, 10)}`;
  const risks = assessRisks(), rec = recommendations(risks);
  const scored = risks.filter(r => r.n), highs = scored.filter(r => r.n === 3).length, mods = scored.filter(r => r.n === 2).length;
  const global = highs ? 3 : mods >= 2 ? 2 : mods ? 2 : scored.length ? 1 : 0;
  const dms = `${toDMS(P.lat, "N", "S")} ${toDMS(P.lon, "E", "O")}`;
  const sec = (n, title) => `<h2>${n}. ${title}</h2>`;
  const sinDato = (k, why) => `<p class="note">Sin datos${why ? `: ${esc(why)}` : ""}.</p>`;

  // 1. Resumen
  const tc = t ? terrainClass(t) : null;
  const summary = [
    tc && `Terreno: <b>${tc[0].toLowerCase()}</b>, altitud ${fmtNum(Math.round(t.e0))} m, pendiente en el punto ${t.slope.toFixed(0)}°. ${esc(transit(t.slope))}.`,
    w && `Tiempo actual: ${esc(wmo(w.current.weather_code)[0].toLowerCase())}, ${Math.round(w.current.temperature_2m)} °C, viento ${Math.round(w.current.wind_speed_10m)} km/h del ${rumbo(w.current.wind_direction_10m)}.`,
    g && (g.roads.length ? `Acceso: ${esc((HW_ES[g.near.t.highway] || "vía").toLowerCase())} a ${fmtDist(g.near.d)}${g.main && g.main !== g.near ? `, carretera a ${fmtDist(g.main.d)}` : ""}.` : "Acceso: sin vías mapeadas en 3 km."),
    `Elementos en ${fmtDist(S.radius)}: ${["puente", "agua", "estructura", "servicio"].map(c => `${S.feats.filter(f => f.cat === c).length} ${{ puente: "puentes", agua: "ríos/cuerpos de agua", estructura: "estructuras", servicio: "servicios" }[c]}`).join(", ")}.`,
    ...risks.filter(r => r.n >= 2).map(r => `Riesgo ${REP_LEVEL[r.n].t.toLowerCase()}: ${esc(r.k.toLowerCase())}.`),
  ].filter(Boolean);

  // 3. Terreno
  let terr = sinDato("terreno", S.errs.terrain);
  if (t) {
    const C = (GRID - 1) / 2, row = t.g.slice(C * GRID, C * GRID + GRID), col = t.g.filter((_, i) => i % GRID === C).reverse();
    terr = `<div class="two">${terrainSVG(t)}<div><p><b>${esc(tc[0])}</b>. ${esc(tc[1])}</p><table>
      <tr><td>Altitud del punto</td><td class="n">${fmtNum(Math.round(t.e0))} m</td></tr>
      <tr><td>Altitud mín. / máx. del área</td><td class="n">${fmtNum(Math.round(t.mn))} / ${fmtNum(Math.round(t.mx))} m</td></tr>
      <tr><td>Desnivel</td><td class="n">${fmtNum(Math.round(t.relief))} m</td></tr>
      <tr><td>Pendiente en el punto</td><td class="n">${t.slope.toFixed(0)}°${t.slope >= 2 ? ` hacia ${rumbo(t.aspect)}` : ""}</td></tr>
      <tr><td>Pendiente media / área > 15°</td><td class="n">${t.mean.toFixed(0)}° / ${Math.round(t.steep * 100)} %</td></tr>
      <tr><td>Posición relativa</td><td>${t.below >= 0.85 ? "Dominante (zona alta)" : t.below <= 0.15 ? "Deprimida (zona baja)" : "Intermedia"}</td></tr>
      <tr><td>Transitabilidad en el punto</td><td>${esc(transit(t.slope))}</td></tr></table></div></div>
      <div class="keep"><h3>Perfil oeste → este</h3>${profileSVG(row, 2 * t.R, "O", "E")}</div><div class="keep"><h3>Perfil sur → norte</h3>${profileSVG(col, 2 * t.R, "S", "N")}</div>
      <p class="note">Modelo de elevación Copernicus 90 m. Cuadro de ${fmtDist(2 * t.R)} de lado; colores del mapa: verde bajo, marrón alto.</p>`;
  }
  let cover = "";
  if (g) {
    const seen = new Set();
    for (const a of g.areas) for (const k of ["boundary", "leisure", "landuse", "natural"]) { const lab = COVER_ES[a[k]]; if (lab) seen.add(a.name && /^(boundary|leisure)$/.test(k) ? `${lab}: ${a.name}` : lab); }
    cover = seen.size ? [...seen].map(esc).join(" · ") : "Sin áreas mapeadas que contengan el punto.";
  }

  // 4. Meteorología
  let met = sinDato("clima", S.errs.weather);
  if (w) {
    const c = w.current, d = w.daily, vis = c.visibility != null ? (c.visibility >= 1000 ? `${(c.visibility / 1000).toFixed(1)} km` : `${Math.round(c.visibility)} m`) : "—";
    const fmtDay = (s, i) => i === 0 ? "Hoy" : i === 1 ? "Mañana" : new Date(s + "T12:00").toLocaleDateString("es-VE", { weekday: "short", day: "numeric" });
    met = `<table><tr><th>Condición actual</th><th></th><th>Calidad del aire</th><th></th></tr>
      <tr><td>Estado</td><td>${esc(wmo(c.weather_code)[0])}</td><td>Índice AQI</td><td class="n">${S.air ? `${S.air.us_aqi} (${esc(aqiInfo(S.air.us_aqi)[0])})` : "—"}</td></tr>
      <tr><td>Temperatura / sensación</td><td class="n">${Math.round(c.temperature_2m)} / ${Math.round(c.apparent_temperature)} °C</td><td>PM2.5</td><td class="n">${S.air ? S.air.pm2_5 + " µg/m³" : "—"}</td></tr>
      <tr><td>Viento / ráfagas</td><td class="n">${Math.round(c.wind_speed_10m)} / ${Math.round(c.wind_gusts_10m)} km/h ${rumbo(c.wind_direction_10m)}</td><td>Índice UV máx.</td><td class="n">${d.uv_index_max[0] ?? "—"}</td></tr>
      <tr><td>Humedad / nubosidad</td><td class="n">${c.relative_humidity_2m} % / ${c.cloud_cover} %</td><td>Amanecer / atardecer</td><td class="n">${(d.sunrise[0] || "").slice(11, 16)} / ${(d.sunset[0] || "").slice(11, 16)}</td></tr>
      <tr><td>Visibilidad</td><td class="n">${vis}</td><td>Presión</td><td class="n">${Math.round(c.pressure_msl)} hPa</td></tr></table>
      <h3>Pronóstico</h3><table><tr><th>Día</th><th>Condición</th><th>Lluvia</th><th>Precip.</th><th>Mín / máx</th></tr>
      ${d.time.map((s, i) => `<tr><td>${fmtDay(s, i)}</td><td>${esc(wmo(d.weather_code[i])[0])}</td><td class="n">${d.precipitation_probability_max[i] ?? 0} %</td><td class="n">${d.precipitation_sum[i] ?? 0} mm</td><td class="n">${Math.round(d.temperature_2m_min[i])} / ${Math.round(d.temperature_2m_max[i])} °C</td></tr>`).join("")}</table>`;
  }

  // 5. Movilidad
  let mov = sinDato("vías", S.errs.ground);
  if (g) {
    const rows = [["Vía más cercana", g.near], ["Carretera principal", g.main], ["Trocha / sendero", g.dirt]].filter(([, r], i, a) => r && !a.slice(0, i).some(([, q]) => q === r));
    const surf = r => SURF_ES[r.t.surface] || "—";
    mov = rows.length ? `<table><tr><th>Acceso</th><th>Tipo</th><th>Nombre / ref.</th><th>Superficie</th><th>Distancia</th></tr>${rows.map(([l, r]) => `<tr><td>${l}</td><td>${esc(HW_ES[r.t.highway] || r.t.highway)}</td><td>${esc(r.t.name || r.t.ref || "—")}</td><td>${esc(surf(r))}</td><td class="n">${fmtDist(r.d)} ${rumbo(bearing(P, r))}</td></tr>`).join("")}</table>`
      : `<p>Sin vías mapeadas en 3 km. El acceso probable es aéreo, fluvial o a pie.</p>`;
  }
  const bridges = S.feats.filter(f => f.cat === "puente");
  const bridgesHtml = bridges.length ? `<table><tr><th>Puente</th><th>Tipo</th><th>Datos</th><th>Distancia</th><th>Coordenadas</th></tr>${bridges.slice(0, 20).map(b => `<tr><td>${esc(b.name || "Sin nombre")}</td><td>${esc(b.type)}</td><td>${esc([b.tags.maxweight && `máx. ${b.tags.maxweight} t`, b.tags.width && `ancho ${b.tags.width} m`, b.tags.layer && `nivel ${b.tags.layer}`].filter(Boolean).join(", ") || "—")}</td><td class="n">${where(b)}</td><td class="n">${b.lat.toFixed(5)}, ${b.lon.toFixed(5)}</td></tr>`).join("")}</table>`
    : `<p class="note">${S.errs.feats ? `Sin datos de OSM: ${esc(S.errs.feats)}.` : `No hay puentes mapeados en ${fmtDist(S.radius)}.`}</p>`;

  // 6. Infraestructura y servicios
  const KEY = [["Salud", f => ["hospital", "clinic", "pharmacy"].includes(f.tags.amenity)], ["Seguridad", f => ["police", "fire_station"].includes(f.tags.amenity)],
    ["Combustible", f => f.tags.amenity === "fuel"], ["Aeródromo / helipuerto", f => f.tags.aeroway], ["Comunicaciones", f => /^(communications_tower|antenna|mast|tower)$/.test(f.tags.man_made)],
    ["Energía", f => f.tags.power], ["Agua (represas, tanques)", f => /^(dam|water_tower|storage_tank)$/.test(f.tags.man_made) || /^(dam|weir)$/.test(f.tags.waterway)],
    ["Educación / refugio", f => ["school", "university"].includes(f.tags.amenity)], ["Gobierno", f => f.tags.amenity === "townhall"]];
  const infra = S.errs.feats ? sinDato("infraestructura", S.errs.feats) : `<table><tr><th>Categoría</th><th>Más cercano</th><th>Distancia</th><th>Total en radio</th></tr>${KEY.map(([lab, pred]) => {
    const all = S.feats.filter(pred), f = all[0];
    return `<tr><td>${lab}</td><td>${f ? esc(f.name || f.type) : "—"}</td><td class="n">${f ? where(f) : "—"}</td><td class="n">${all.length}</td></tr>`; }).join("")}</table>`;
  const hydro = S.feats.filter(f => f.cat === "agua");
  const hydroHtml = hydro.length ? `<ul>${hydro.slice(0, 10).map(f => `<li><b>${esc(f.name || f.type)}</b> (${esc(f.type.toLowerCase())}) a ${where(f)}</li>`).join("")}</ul>` : `<p class="note">${S.errs.feats ? "Sin datos de OSM." : `Sin ríos ni cuerpos de agua mapeados en ${fmtDist(S.radius)}.`}</p>`;

  // 8. Sismos
  const qs = S.quakes.slice().sort((a, b) => b.mag - a.mag).slice(0, 5);
  const quakesHtml = S.errs.quakes ? sinDato("sismos", S.errs.quakes) : qs.length ? `<table><tr><th>Magnitud</th><th>Lugar</th><th>Fecha</th><th>Prof.</th><th>Distancia</th></tr>${qs.map(q => `<tr><td class="n">M${q.mag.toFixed(1)}</td><td>${esc(placeEs(q.place))}</td><td>${new Date(q.time).toLocaleDateString("es-VE", { dateStyle: "medium" })}</td><td class="n">${Math.round(q.depth)} km</td><td class="n">${fmtDist(q.d)}</td></tr>`).join("")}</table>` : `<p>Sin sismos M2.5+ en 300 km durante el último año.</p>`;

  // 9. Referencias
  const refs = S.wiki.slice(0, 6);
  const own = my ? `<div class="box"><h3 style="margin-top:0">Información propia: ${esc(my.name)}</h3>${my.desc ? `<p>${esc(my.desc)}</p>` : ""}${my.notes ? `<p style="white-space:pre-wrap"><b>Notas de reconocimiento:</b> ${esc(my.notes)}</p>` : ""}<p class="note">${my.files.length} archivo(s) adjunto(s) en la app · actualizado ${fmtDate(my.updated)}</p></div>` : "";

  // 11. Fuentes
  const status = (k, label) => `<tr><td>${label}</td><td>${S.errs[k] ? `<span style="color:#c22f4f">No disponible</span> — ${esc(S.errs[k])}` : "Consultado"}</td></tr>`;

  return `<article class="rep">
    <div class="cls"><span>Uso interno · Fuentes abiertas</span><span>${num}</span></div>
    <p class="note" style="margin-top:12px">REPORTE OPERATIVO DE ÁREA</p>
    <h1>${esc(name)}</h1>
    <p>${esc([ad.localidad, ad.municipio, ad.estado].filter(Boolean).join(" · ") || (S.place && S.place.display_name) || "")}</p>
    <div class="meta">
      <div>Grupo fecha-hora: <b>${dtg(now)}</b></div><div>Radio de análisis: <b>${fmtDist(S.radius)}</b></div>
      <div>Decimal: <b>${P.lat.toFixed(6)}, ${P.lon.toFixed(6)}</b></div><div>GMS: <b>${dms}</b></div>
      <div>UTM: <b>${toUTM(P.lat, P.lon)}</b></div><div>Altitud: <b>${t ? fmtNum(Math.round(t.e0)) + " m" : w && w.elevation != null ? fmtNum(Math.round(w.elevation)) + " m" : "—"}</b></div>
    </div>

    ${sec(1, "Resumen ejecutivo")}
    <div class="box global"><span>Nivel de riesgo general:</span>${lvlTag(global)}<span class="note">${highs} alto(s), ${mods} moderado(s) de ${scored.length} factores evaluados</span></div>
    <ul>${summary.map(s => `<li>${s}</li>`).join("")}</ul>

    ${sec(2, "Situación geográfica")}
    ${info ? `<p><b>${esc(info.title)}</b>${info.description ? ` — ${esc(info.description)}` : ""}</p>${info.extract ? `<p>${esc(info.extract)}</p>` : ""}${info.facts.length ? `<p class="note">${info.facts.map(([k, v]) => `${esc(k)}: ${esc(v)}`).join(" · ")}</p>` : ""}` : `<p class="note">${S.errs.info ? "No se pudo consultar Wikipedia/Wikidata." : "Sin artículo de referencia para este punto."}</p>`}
    ${cover ? `<p><b>Cobertura y uso del suelo:</b> ${cover}</p>` : ""}
    <div class="keep"><h3>Croquis del área (${fmtDist(S.radius)})</h3>${sketchSVG()}
    <div class="legend">${Object.entries(CATS).map(([k, c]) => `<span><i style="background:${REP_COLORS[k]}"></i>${c.label}</span>`).join("")}<span><i style="background:#5b5b5b;border-radius:0;height:3px"></i>Vías</span><span><i style="background:#d99a06"></i>Punto</span></div></div>

    ${sec(3, "Análisis del terreno")}${terr}
    ${sec(4, "Condiciones meteorológicas")}${met}
    ${sec(5, "Movilidad y accesos")}${mov}<h3>Puentes en el área</h3>${bridgesHtml}
    ${sec(6, "Infraestructura y servicios")}${infra}<h3>Hidrografía</h3>${hydroHtml}
    ${sec(7, "Evaluación de riesgos")}<table><tr><th>Factor</th><th>Nivel</th><th>Fundamento</th></tr>${risks.map(r => `<tr><td>${esc(r.k)}</td><td>${lvlTag(r.n)}</td><td>${esc(r.t)}</td></tr>`).join("")}</table>
    <h3>Sismos de mayor magnitud (300 km, último año)</h3>${quakesHtml}
    ${sec(8, "Puntos de referencia")}${own}${refs.length ? `<ul>${refs.map(r => `<li><b>${esc(r.title)}</b> a ${fmtDist(r.d)} al ${rumbo(bearing(P, r))}${r.desc ? ` — ${esc(r.desc)}` : ""}</li>`).join("")}</ul>` : `<p class="note">${S.errs.wiki ? "No se pudo consultar Wikipedia." : "Sin lugares documentados en 10 km."}</p>`}
    ${sec(9, "Conclusiones y recomendaciones")}<ol>${rec.map(r => `<li>${esc(r)}</li>`).join("")}</ol>
    ${sec(10, "Fuentes y limitaciones")}<table>${status("terrain", "Elevación (Open‑Meteo / Copernicus 90 m)")}${status("weather", "Meteorología (Open‑Meteo)")}${status("ground", "Uso del suelo y vías (OpenStreetMap)")}${status("feats", "Elementos del entorno (OpenStreetMap)")}${status("quakes", "Sismos (USGS)")}${status("info", "Información del lugar (Wikipedia / Wikidata)")}${status("wiki", "Lugares cercanos (Wikipedia)")}</table>
    <p class="note">Reporte generado automáticamente a partir de fuentes abiertas el ${now.toLocaleString("es-VE", { dateStyle: "long", timeStyle: "short" })}. Los datos de OpenStreetMap y Wikipedia pueden estar incompletos o desactualizados y el modelo de elevación tiene resolución de 90 m: verificar en el terreno antes de tomar decisiones.</p>
    <div class="sign"><div>Elaborado por</div><div>Revisado / aprobado por</div></div>
  </article>`;
}
