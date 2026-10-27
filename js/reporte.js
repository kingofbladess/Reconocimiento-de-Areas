// Reporte operativo del área: reúne lo consultado del punto (terreno, clima, accesos, infraestructura, riesgos)
// en un documento imprimible para apoyar la toma de decisiones. Todo se calcula en el navegador con fuentes abiertas.
"use strict";

// Colores fijos de papel (el reporte siempre se ve claro, también al imprimir o descargar)
const REP_COLORS = { puente: "#c2410c", agua: "#1d6fd1", naturaleza: "#2f8a3c", estructura: "#6b4fa3", interes: "#b7791f", servicio: "#c22f4f" };
const REP_LEVEL = [null, { t: "BAJO", c: "#2f8a3c" }, { t: "MODERADO", c: "#b7791f" }, { t: "ALTO", c: "#c22f4f" }];
const REP_CSS = `
.rep, .rep * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.rep { --c-naturaleza: #2f8a3c; --line: #dbe3ee; --muted: #5b6b80; font: 14px/1.5 "Source Sans 3", "Segoe UI", system-ui, sans-serif; color: #0f1c2e; }
.rep h1 { font: 700 22px/1.2 "Sora", "Trebuchet MS", sans-serif; margin: 6px 0 2px; letter-spacing: -.01em; }
.rep h2 { font: 700 15px "Sora", "Trebuchet MS", sans-serif; margin: 22px 0 8px; padding-bottom: 4px; border-bottom: 2px solid #0f1c2e; text-transform: uppercase; letter-spacing: .04em; break-after: avoid; }
.rep h3 { font: 600 13px "Sora", sans-serif; margin: 12px 0 4px; text-transform: uppercase; letter-spacing: .05em; color: #5b6b80; }
.rep p { margin: 4px 0; }
.rep .cls { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; font: 600 11px "IBM Plex Mono", Consolas, monospace; letter-spacing: .08em; text-transform: uppercase; border: 1.5px solid #0f1c2e; padding: 5px 8px; }
.rep .meta { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 4px 16px; margin: 10px 0 0; font-size: 13px; }
.rep .meta b, .rep .mono { font-family: "IBM Plex Mono", Consolas, monospace; font-weight: 500; }
.rep table { width: 100%; border-collapse: collapse; margin: 6px 0; font-size: 13px; break-inside: auto; }
.rep th, .rep td { text-align: left; padding: 5px 6px; border-bottom: 1px solid #dbe3ee; vertical-align: top; }
.rep th { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #5b6b80; font-weight: 600; }
.rep td.n { text-align: right; font-family: "IBM Plex Mono", Consolas, monospace; white-space: nowrap; }
.rep tr { break-inside: avoid; }
.rep ul { margin: 4px 0; padding-left: 18px; }
.rep li { margin: 3px 0; }
.rep .lvl { display: inline-block; min-width: 76px; text-align: center; padding: 1px 8px; border-radius: 4px; color: #fff; font: 700 11px "IBM Plex Mono", Consolas, monospace; letter-spacing: .06em; }
.rep .box { border: 1px solid #dbe3ee; border-radius: 6px; padding: 10px 12px; margin: 8px 0; break-inside: avoid; }
.rep .global { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.rep .two { display: grid; grid-template-columns: 220px 1fr; gap: 16px; align-items: start; break-inside: avoid; }
.rep .two svg { width: 100%; height: auto; display: block; border-radius: 6px; }
.rep .prof { width: 100%; height: 110px; display: block; }
.rep .sketch { width: 100%; max-width: 440px; height: auto; display: block; margin: 0 auto; }
.rep .legend { display: flex; flex-wrap: wrap; gap: 4px 14px; justify-content: center; font-size: 12px; color: #5b6b80; margin-top: 4px; }
.rep .legend i { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 5px; vertical-align: -1px; }
.rep .note { font-size: 12px; color: #5b6b80; }
.rep .keep { break-inside: avoid; }
.rep .sign { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 28px; font-size: 12px; color: #5b6b80; }
.rep .sign div { border-top: 1px solid #0f1c2e; padding-top: 4px; }
@media (max-width: 600px) { .rep .two { grid-template-columns: 1fr; } .rep .two svg { max-width: 240px; } }
@media print { .rep h2 { break-after: avoid; } .rep .box, .rep .two { break-inside: avoid; } }
`;
document.head.insertAdjacentHTML("beforeend", `<style id="repCss">${REP_CSS}</style>`);

const REP_KEYS = ["info", "weather", "terrain", "ground", "feats", "wiki", "photos"];
const REP = { html: "", name: "", mode: "breve" }; // breve: dos hojas con apreciación; detallado: reporte completo
async function waitForData(id, maxMs = 30000) {
  const t0 = Date.now();
  while (REP_KEYS.some(k => S.busy[k]) && Date.now() - t0 < maxMs && id === reqId) await sleep(400);
}
async function openReport() {
  if (!S.point) return;
  const id = reqId;
  $("#report").hidden = false;
  $("#reportBody").innerHTML = `<div class="loading">Reuniendo la información del área… (terreno, clima, accesos, infraestructura y riesgos)</div>`;
  // Si los alrededores de OSM fallaron (límite de Overpass), se reintenta una vez mientras se arma el mapa base
  const retry = ["feats", "ground"].filter(k => S.errs[k] && !S.busy[k]);
  retry.forEach(k => RETRY[k](id));
  await Promise.all([waitForData(id), sketchBase(id)]);
  if (id !== reqId || $("#report").hidden) return;
  renderReport();
  if (retry.some(k => S.busy[k])) { // el reintento tardó más: se actualiza el reporte cuando llegue
    await waitForData(id, 90000);
    if (id === reqId && !$("#report").hidden) { const sc = $("#report .report-scroll"), top = sc.scrollTop; renderReport(); sc.scrollTop = top; }
  }
}

// Mapa base del croquis: teselas de OpenStreetMap (o Esri si fallan) pintadas en un lienzo y guardadas como imagen,
// así el croquis muestra calles, ríos y edificios aunque Overpass no responda, y el reporte descargado las conserva.
const SKETCH_W = 440, SKETCH_PAD = 18;
const SKETCH_TILES = [
  ["https://tile.openstreetmap.org/{z}/{x}/{y}.png", 19, "© OpenStreetMap"],
  ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}", 19, "© Esri, OpenStreetMap"],
  ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", 19, "Imágenes © Esri, Maxar"],
];
function tileImg(url, ms = 8000) {
  return new Promise((ok, no) => {
    const img = new Image(), t = setTimeout(() => { img.src = ""; no(new Error("tiempo agotado")); }, ms);
    img.crossOrigin = "anonymous";
    img.onload = () => { clearTimeout(t); ok(img); }; img.onerror = () => { clearTimeout(t); no(new Error("sin tesela")); };
    img.src = url;
  });
}
async function sketchBase(id) {
  const P = S.point, R = S.radius, key = `${P.lat},${P.lon},${R}`;
  if (REP.base && REP.base.key === key) return;
  REP.base = null;
  const px = 2 * SKETCH_W, mPerPx = R / (SKETCH_W / 2 - SKETCH_PAD) / 2; // lienzo al doble para que se vea nítido al imprimir
  const cosL = Math.cos(P.lat * rad), wx = lon => (lon + 180) / 360, wy = lat => { const s = Math.sin(lat * rad); return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI); };
  for (const [tpl, maxZ, attr] of SKETCH_TILES) {
    const z = Math.max(3, Math.min(maxZ, Math.round(Math.log2(156543.03 * cosL / mPerPx)))), n = 2 ** z;
    const scale = 156543.03 * cosL / n / mPerPx; // píxeles del lienzo por píxel de tesela
    const cx = wx(P.lon) * n * 256, cy = wy(P.lat) * n * 256, half = px / 2 / scale;
    const x0 = Math.floor((cx - half) / 256), x1 = Math.floor((cx + half) / 256), y0 = Math.floor((cy - half) / 256), y1 = Math.floor((cy + half) / 256);
    const jobs = [];
    for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) if (y >= 0 && y < n)
      jobs.push(tileImg(tpl.replace("{z}", z).replace("{x}", ((x % n) + n) % n).replace("{y}", y)).then(img => ({ img, x, y }), () => null));
    const got = (await Promise.all(jobs)).filter(Boolean);
    if (id !== reqId) return;
    if (got.length < jobs.length * 0.6) continue; // demasiados huecos: se prueba el siguiente proveedor
    try {
      const cv = document.createElement("canvas"); cv.width = cv.height = px;
      const g = cv.getContext("2d"); g.fillStyle = "#f3f6fb"; g.fillRect(0, 0, px, px);
      for (const { img, x, y } of got) g.drawImage(img, (x * 256 - cx) * scale + px / 2, (y * 256 - cy) * scale + px / 2, 256 * scale + 0.5, 256 * scale + 0.5);
      REP.base = { key, url: cv.toDataURL("image/jpeg", 0.82), attr };
      return;
    } catch (_) { /* lienzo "contaminado" (tesela sin CORS): se prueba el siguiente */ }
  }
}
function renderReport() {
  REP.html = REP.mode === "breve" ? buildBrief() : buildReport();
  $("#reportBody").innerHTML = REP.html;
  $("#repMode").textContent = REP.mode === "breve" ? "Ver versión detallada" : "Ver versión de 2 hojas";
  $("#report .report-scroll").scrollTop = 0;
}
$("#repMode").addEventListener("click", () => { if (!REP.html) return; REP.mode = REP.mode === "breve" ? "detallado" : "breve"; renderReport(); });
$("#repClose").addEventListener("click", () => { $("#report").hidden = true; });
// Antes de imprimir o guardar en PDF se asegura que el mapa del croquis esté cargado e incrustado
async function ensureSketch() {
  const P = S.point; if (!P) return;
  if (REP.base && REP.base.key === `${P.lat},${P.lon},${S.radius}`) return;
  const id = reqId; await sketchBase(id);
  if (id === reqId && REP.base) renderReport();
}
$("#repPrint").addEventListener("click", async () => { if (!REP.html) return; await ensureSketch(); window.print(); });
$("#repDownload").addEventListener("click", async () => {
  if (!REP.html) return;
  await ensureSketch();
  const doc = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(REP.name)}</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Sora:wght@600;700&family=Source+Sans+3:wght@400;600&family=IBM+Plex+Mono:wght@500;600&display=swap">
<style>body{margin:0;background:#fff}.wrap{max-width:900px;margin:0 auto;padding:28px 24px}@media print{.wrap{padding:0;max-width:none}}${REP_CSS}${BRIEF_CSS}</style></head><body><div class="wrap">${REP.html}</div></body></html>`;
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
const lvlTag = n => n ? `<span class="lvl" style="background:${REP_LEVEL[n].c}">${REP_LEVEL[n].t}</span>` : `<span class="lvl" style="background:#8a98ab">SIN DATO</span>`;

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
  // Fondo: mapa de teselas; sin conexión, el relieve del área; si tampoco hay, papel en blanco
  const b = REP.base && REP.base.key === `${P.lat},${P.lon},${R}` ? REP.base : null, t = S.terrain, r0 = C - 18;
  let bg = "", attr = "";
  if (b) { bg = `<image href="${b.url}" x="0" y="0" width="${W}" height="${W}" preserveAspectRatio="none"/>`; attr = b.attr; }
  else if (t) { const s = 2 * t.R * k; bg = terrainSVG(t).replace(/<circle[^>]*\/>|<text[\s\S]*?<\/text>/g, "").replace("<svg ", `<svg x="${(C - s / 2).toFixed(1)}" y="${(C - s / 2).toFixed(1)}" width="${s.toFixed(1)}" height="${s.toFixed(1)}" `); attr = "Relieve (sin mapa base)"; }
  const fade = bg ? `<path d="M0,0H${W}V${W}H0Z M${C - r0},${C}a${r0},${r0} 0 1,0 ${2 * r0},0a${r0},${r0} 0 1,0 ${-2 * r0},0Z" fill="#fff" fill-opacity=".55" fill-rule="evenodd"/>` : "";
  return `<svg class="sketch" viewBox="0 0 ${W} ${W}" role="img" aria-label="Croquis del área">
    <defs><clipPath id="repClip"><circle cx="${C}" cy="${C}" r="${r0}"/></clipPath></defs>
    <rect width="${W}" height="${W}" fill="#f3f6fb"/>${bg ? `<g>${bg}</g>${fade}` : `<circle cx="${C}" cy="${C}" r="${r0}" fill="#fff"/>`}
    <circle cx="${C}" cy="${C}" r="${r0}" fill="none" stroke="#0f1c2e" stroke-width="1.4" stroke-dasharray="5 4"/>
    <circle cx="${C}" cy="${C}" r="${r0 / 2}" fill="none" stroke="${bg ? "#0f1c2e" : "#cdd6e3"}" stroke-opacity="${bg ? .45 : 1}" stroke-dasharray="2 4"/>
    <g clip-path="url(#repClip)">${roads}${lines}${dots}</g>
    <circle cx="${C}" cy="${C}" r="7" fill="#d99a06" stroke="#0f1c2e" stroke-width="2"/>
    <path d="M${W - 26},14 l7,18 l-7,-5 l-7,5z" fill="#0f1c2e"/><text x="${W - 26}" y="46" font-size="12" font-weight="700" text-anchor="middle" fill="#0f1c2e">N</text>
    <line x1="${bx}" x2="${bx + bar * k}" y1="${by}" y2="${by}" stroke="#0f1c2e" stroke-width="3"/>
    <text x="${bx}" y="${by - 6}" font-size="11" fill="#0f1c2e" stroke="#fff" stroke-width="2.5" paint-order="stroke">${fmtDist(bar)}</text>
    <text x="${C + (C - 18) / 2 + 3}" y="${C - 3}" font-size="10" fill="${bg ? "#0f1c2e" : "#8a98ab"}" stroke="#fff" stroke-width="${bg ? 2.5 : 0}" paint-order="stroke">${fmtDist(R / 2)}</text>
    ${attr ? `<text x="${W - 6}" y="${W - 5}" font-size="9" text-anchor="end" fill="#5b6b80" stroke="#fff" stroke-width="2.5" paint-order="stroke">${esc(attr)}</text>` : ""}</svg>`;
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
      <div class="keep"><h3>Perfil oeste → este</h3>${profileSVG(t.pWE ? t.pWE.vals : row, 2 * t.R, "O", "E")}</div><div class="keep"><h3>Perfil sur → norte</h3>${profileSVG(t.pSN ? t.pSN.vals : col, 2 * t.R, "S", "N")}</div>
      <p class="note">Modelo de elevación ${esc(t.src || "Copernicus 90 m")}. Cuadro de ${fmtDist(2 * t.R)} de lado; colores del mapa: verde bajo, marrón alto.</p>`;
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
    ["Combustible", f => f.tags.amenity === "fuel"], ["Aeródromo / helipuerto", f => f.tags.aeroway], ["Comunicaciones", isComms],
    ["Energía", f => f.tags.power], ["Agua (represas, tanques)", f => /^(dam|water_tower|storage_tank)$/.test(f.tags.man_made) || /^(dam|weir)$/.test(f.tags.waterway)],
    ["Educación / refugio", f => ["school", "university"].includes(f.tags.amenity)], ["Gobierno", f => f.tags.amenity === "townhall"]];
  const infra = S.errs.feats ? sinDato("infraestructura", S.errs.feats) : `<table><tr><th>Categoría</th><th>Más cercano</th><th>Distancia</th><th>Total en radio</th></tr>${KEY.map(([lab, pred]) => {
    const all = S.feats.filter(pred), f = all[0];
    return `<tr><td>${lab}</td><td>${f ? esc(f.name || f.type) : "—"}</td><td class="n">${f ? where(f) : "—"}</td><td class="n">${all.length}</td></tr>`; }).join("")}</table>`;
  const hydro = S.feats.filter(f => f.cat === "agua");
  const hydroHtml = hydro.length ? `<ul>${hydro.slice(0, 10).map(f => `<li><b>${esc(f.name || f.type)}</b> (${esc(f.type.toLowerCase())}) a ${where(f)}</li>`).join("")}</ul>` : `<p class="note">${S.errs.feats ? "Sin datos de OSM." : `Sin ríos ni cuerpos de agua mapeados en ${fmtDist(S.radius)}.`}</p>`;

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
    ${sec(8, "Puntos de referencia")}${own}${refs.length ? `<ul>${refs.map(r => `<li><b>${esc(r.title)}</b> a ${fmtDist(r.d)} al ${rumbo(bearing(P, r))}${r.desc ? ` — ${esc(r.desc)}` : ""}</li>`).join("")}</ul>` : `<p class="note">${S.errs.wiki ? "No se pudo consultar Wikipedia." : "Sin lugares documentados en 10 km."}</p>`}
    ${sec(9, "Conclusiones y recomendaciones")}<ol>${rec.map(r => `<li>${esc(r)}</li>`).join("")}</ol>
    ${sec(10, "Fuentes y limitaciones")}<table>${status("terrain", `Elevación (${t && t.src ? t.src : "SRTM 30 m / Copernicus 90 m"})`)}${status("weather", "Meteorología (Open‑Meteo)")}${status("ground", "Uso del suelo y vías (OpenStreetMap)")}${status("feats", "Elementos del entorno (OpenStreetMap)")}${status("info", "Información del lugar (Wikipedia / Wikidata)")}${status("wiki", "Lugares cercanos (Wikipedia)")}</table>
    <p class="note">Reporte generado automáticamente a partir de fuentes abiertas el ${now.toLocaleString("es-VE", { dateStyle: "long", timeStyle: "short" })}. Los datos de OpenStreetMap y Wikipedia pueden estar incompletos o desactualizados y el modelo de elevación tiene resolución de 90 m: verificar en el terreno antes de tomar decisiones.</p>
    <div class="sign"><div>Elaborado por</div><div>Revisado / aprobado por</div></div>
  </article>`;
}

// ---------- Versión de dos hojas con apreciación argumentada ----------
const BRIEF_CSS = `
@page { size: letter; margin: 12mm 13mm; }
.rep.brief { font-size: 12px; line-height: 1.38; }
.rep.brief h1 { font-size: 19px; margin: 4px 0 0; }
.rep.brief h2 { font-size: 12.5px; margin: 12px 0 5px; padding-bottom: 2px; }
.rep.brief h3 { font-size: 11px; margin: 6px 0 2px; }
.rep.brief table { font-size: 11.5px; margin: 2px 0; }
.rep.brief th, .rep.brief td { padding: 2.5px 5px; }
.rep.brief .meta { font-size: 11.5px; margin-top: 6px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
.rep.brief ul { margin: 2px 0; }
.rep.brief li { margin: 1px 0; }
.rep.brief .box { padding: 6px 10px; margin: 6px 0; }
.rep .cols { display: grid; grid-template-columns: 250px minmax(0, 1fr); gap: 14px; align-items: start; }
.rep .cols2 { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 14px; align-items: start; }
.rep .cols .sketch { max-width: 250px; }
.rep .mini { display: grid; grid-template-columns: 110px minmax(0, 1fr); gap: 8px; align-items: center; margin-top: 6px; }
.rep .mini svg { width: 110px; height: auto; border-radius: 4px; }
.rep .page2 { break-before: page; }
.rep .apr p { margin: 0 0 6px; text-align: justify; }
.rep .apr b.t { text-transform: uppercase; font-size: 11px; letter-spacing: .04em; }
.rep .verdict { border: 2px solid #0f1c2e; border-radius: 6px; padding: 8px 12px; margin-top: 8px; break-inside: avoid; }
.rep .verdict .lvl { font-size: 12px; padding: 2px 10px; }
.rep .sheet-tag { display: none; }
@media screen { .rep .page2 { margin-top: 26px; padding-top: 18px; border-top: 2px dashed #cdd6e3; position: relative; }
  .rep .sheet-tag { display: block; position: absolute; top: -11px; left: 50%; transform: translateX(-50%); background: #fff; padding: 0 10px; font: 600 11px "IBM Plex Mono", monospace; color: #8a98ab; } }
@media (max-width: 600px) { .rep .cols, .rep .cols2, .rep.brief .meta { grid-template-columns: 1fr; } .rep .cols .sketch { max-width: 300px; margin: 0 auto; } }
`;
document.head.insertAdjacentHTML("beforeend", `<style id="repBriefCss">${BRIEF_CSS}</style>`);

const list = a => a.length <= 1 ? (a[0] || "") : `${a.slice(0, -1).join(", ")} y ${a[a.length - 1]}`;

// Apreciación: argumenta en prosa cada factor a partir de los datos mostrados y cierra con una conclusión
const isComms = f => /^(communications_tower|antenna|mast)$/.test(f.tags.man_made) || f.tags["tower:type"] === "communication";

function appreciation(risks, rec) {
  const t = S.terrain, w = S.weather, g = S.ground, out = [];
  const R = fmtDist(S.radius);
  if (t) {
    const [cls] = terrainClass(t), pos = t.below >= 0.85 ? "ocupa una posición dominante sobre su entorno, lo que favorece la observación y las comunicaciones" : t.below <= 0.15 ? "se ubica en una zona deprimida respecto a su entorno, con menor visibilidad y tendencia a acumular agua" : "ocupa una posición intermedia respecto a su entorno";
    const move = t.mean < 3 ? "el desplazamiento motorizado es viable en la mayor parte del área, incluso fuera de vías" : t.mean < 8 ? "el desplazamiento motorizado es viable, aunque conviene ceñirse a vías y trochas existentes" : t.mean < 15 ? "el desplazamiento motorizado queda limitado a las vías existentes y fuera de ellas exige vehículos 4x4 o marcha a pie" : "el desplazamiento fuera de vías se restringe a la marcha a pie, con rendimientos bajos";
    out.push(`<b class="t">Del terreno.</b> El área corresponde a ${cls.toLowerCase()}, con altitudes entre ${fmtNum(Math.round(t.mn))} y ${fmtNum(Math.round(t.mx))} m (desnivel de ${fmtNum(Math.round(t.relief))} m) y pendiente media de ${t.mean.toFixed(0)}°. El punto, a ${fmtNum(Math.round(t.e0))} m, ${pos}. En consecuencia, ${move}.${t.steep > 0.15 ? ` El ${Math.round(t.steep * 100)} % del área supera 15° de pendiente, lo que añade riesgo de deslizamientos en caso de lluvias intensas.` : ""}`);
  } else out.push(`<b class="t">Del terreno.</b> No se obtuvo el modelo de elevación, por lo que la caracterización del relieve debe completarse con cartografía o reconocimiento directo.`);
  if (w) {
    const c = w.current, d = w.daily, pp = Math.max(...d.precipitation_probability_max.slice(0, 3).map(v => v || 0)), acc = d.precipitation_sum.slice(0, 3).reduce((a, v) => a + (v || 0), 0);
    const storm = d.weather_code.slice(0, 3).some(x => x >= 95), dry = d.time.findIndex((_, i) => (d.precipitation_probability_max[i] ?? 0) < 30 && d.weather_code[i] < 80);
    const dayTxt = i => i === 0 ? "hoy" : i === 1 ? "mañana" : new Date(d.time[i] + "T12:00").toLocaleDateString("es-VE", { weekday: "long", day: "numeric" });
    const effect = pp >= 60 || acc >= 15 ? "lo que degradaría la transitabilidad de trochas y terrenos bajos y reduciría la visibilidad" : pp >= 30 ? "con efecto moderado sobre trochas y caminos de tierra" : "sin efectos significativos previstos sobre la movilidad";
    const hl = d.sunrise[0] && d.sunset[0] ? ((Date.parse(d.sunset[0]) - Date.parse(d.sunrise[0])) / 36e5).toFixed(1) : null;
    out.push(`<b class="t">De las condiciones meteorológicas.</b> Actualmente el tiempo es ${wmo(c.weather_code)[0].toLowerCase()}, con ${Math.round(c.temperature_2m)} °C y viento de ${Math.round(c.wind_speed_10m)} km/h del ${rumbo(c.wind_direction_10m)}. Para las próximas 72 horas la probabilidad de lluvia llega a ${pp} % con un acumulado de ${acc.toFixed(0)} mm${storm ? " y posibles tormentas eléctricas" : ""}, ${effect}. ${dry >= 0 ? `La ventana más favorable del pronóstico es ${dayTxt(dry)}.` : "No hay días secos en el pronóstico de siete días."}${hl ? ` Se dispone de ${hl} horas de luz diurna (${d.sunrise[0].slice(11, 16)} a ${d.sunset[0].slice(11, 16)}).` : ""}`);
  } else out.push(`<b class="t">De las condiciones meteorológicas.</b> No se obtuvo el pronóstico; debe consultarse antes de planificar actividades en el área.`);
  const bridges = S.feats.filter(f => f.cat === "puente");
  if (g) {
    let txt = g.roads.length
      ? `El acceso terrestre se apoya en ${(HW_ES[(g.main || g.near).t.highway] || "una vía").toLowerCase()}${(g.main || g.near).t.name || (g.main || g.near).t.ref ? ` ${(g.main || g.near).t.name || (g.main || g.near).t.ref}` : ""}, a ${fmtDist((g.main || g.near).d)} del punto${g.main ? "" : ", sin carreteras principales en 3 km"}${g.dirt && g.dirt !== g.near ? `, con una trocha o sendero a ${fmtDist(g.dirt.d)} como alternativa` : ""}.`
      : "No hay vías mapeadas en 3 km, por lo que el acceso dependería de medios aéreos, fluviales o de la marcha a pie.";
    if (bridges.length) txt += ` Se identifica${bridges.length > 1 ? "n" : ""} ${bridges.length} puente${bridges.length > 1 ? "s" : ""} en ${R}; ${bridges.length > 1 ? `${bridges.some(b => b.tags.maxweight) ? "algunos con capacidad de carga registrada" : "ninguno tiene capacidad de carga registrada"}, por lo que constituyen puntos críticos de la movilidad que deben verificarse` : `${bridges[0].tags.maxweight ? `con capacidad de carga registrada de ${esc(bridges[0].tags.maxweight)} t` : "sin capacidad de carga registrada"}, por lo que constituye un punto crítico de la movilidad que debe verificarse`}.`;
    out.push(`<b class="t">De la movilidad.</b> ${txt}`);
  } else out.push(`<b class="t">De la movilidad.</b> No se obtuvieron datos de vías; el acceso debe confirmarse en el terreno.${bridges.length ? ` Se identifican ${bridges.length} puente(s) en ${R}.` : ""}`);
  const KEYS = [["salud", f => ["hospital", "clinic"].includes(f.tags.amenity)], ["seguridad", f => ["police", "fire_station"].includes(f.tags.amenity)], ["combustible", f => f.tags.amenity === "fuel"], ["aeródromo o helipuerto", f => f.tags.aeroway], ["comunicaciones", isComms]];
  const have = KEYS.map(([k, p]) => [k, S.feats.find(p)]).filter(([, f]) => f), miss = KEYS.filter(([k]) => !have.some(([h]) => h === k)).map(([k]) => k);
  if (!S.errs.feats) out.push(`<b class="t">Del apoyo e infraestructura.</b> ${have.length ? `En un radio de ${R} se dispone de ${list(have.map(([k, f]) => `${k} (${f.name || f.type.toLowerCase()}, a ${fmtDist(f.d)})`))}.` : `No se identifican servicios de apoyo en ${R}.`}${miss.length ? ` No se registran instalaciones de ${list(miss)}, lo que implica dependencia de apoyo externo${miss.includes("salud") ? " y la necesidad de prever la evacuación médica" : ""}.` : ""}`);
  else out.push(`<b class="t">Del apoyo e infraestructura.</b> No se obtuvieron datos de infraestructura del entorno.`);
  const rel = risks.filter(r => r.n >= 2).sort((a, b) => b.n - a.n);
  out.push(`<b class="t">De los riesgos.</b> ${rel.length ? `Los factores más relevantes son ${list(rel.map(r => `${r.k.toLowerCase()} (${REP_LEVEL[r.n].t.toLowerCase()}: ${r.t.replace(/\.$/, "").replace(/^./, c => c.toLowerCase())})`))}.` : "Ninguno de los factores evaluados presenta un nivel superior a bajo."}${risks.some(r => r.n === 0) ? ` No pudieron evaluarse: ${list(risks.filter(r => r.n === 0).map(r => r.k.toLowerCase()))}.` : ""}`);

  // Conclusión: condición del área según riesgos y acceso
  const highs = risks.filter(r => r.n === 3), mods = risks.filter(r => r.n === 2), noAccess = g && !g.roads.length;
  const cond = highs.length >= 2 || (highs.length && noAccess) ? 3 : highs.length || mods.length >= 2 || noAccess ? 2 : 1;
  const COND = { 1: ["FAVORABLES", "#2f8a3c"], 2: ["FAVORABLES CON RESTRICCIONES", "#b7791f"], 3: ["DESFAVORABLES", "#c22f4f"] }[cond];
  const why = [...highs, ...mods].slice(0, 3).map(r => r.k.toLowerCase());
  if (noAccess) why.unshift("la ausencia de accesos terrestres");
  const keyRec = rec.filter(r => !/^Validar en el terreno/.test(r)).slice(0, 3);
  const verdict = `<div class="verdict"><p style="margin:0 0 4px"><b>Conclusión.</b> Con base en lo expuesto, se aprecia que el área presenta condiciones <span class="lvl" style="background:${COND[1]}">${COND[0]}</span> para el desarrollo de actividades${why.length ? `, condicionadas principalmente por ${list(why)}` : ", sin factores limitantes significativos en los datos disponibles"}.</p>
    ${keyRec.length ? `<p style="margin:0">Se recomienda: ${keyRec.map((r, i) => `(${i + 1}) ${r.replace(/\.+$/, "").replace(/^./, c => c.toLowerCase())}`).join("; ")}.</p>` : ""}
    <p class="note" style="margin:4px 0 0">Apreciación elaborada con fuentes abiertas y reglas fijas; debe confirmarse con reconocimiento en el terreno.</p></div>`;
  return { paras: out, verdict };
}

function buildBrief() {
  const P = S.point, ad = adminOf(S.place), now = new Date(), t = S.terrain, w = S.weather, g = S.ground, info = S.info, my = S.custom;
  const name = (my && my.name) || S.title || (S.place && (S.place.name || (S.place.display_name || "").split(",")[0])) || "Punto seleccionado";
  const num = `RO-${now.toISOString().slice(0, 10).replace(/-/g, "")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  REP.name = `Reporte ${name} ${now.toISOString().slice(0, 10)}`;
  const risks = assessRisks(), rec = recommendations(risks), apr = appreciation(risks, rec);
  const scored = risks.filter(r => r.n), highs = scored.filter(r => r.n === 3).length, mods = scored.filter(r => r.n === 2).length;
  const global = highs ? 3 : mods ? 2 : scored.length ? 1 : 0;
  const tc = t ? terrainClass(t) : null;
  const row = (k, v) => `<tr><td>${k}</td><td>${v}</td></tr>`;

  // Hoja 1: identificación, resumen, croquis y datos clave, riesgos
  const desc = info ? `${esc(info.description || info.title)}${info.extract ? `. ${esc(info.extract.split(/(?<=\.)\s/).slice(0, 2).join(" "))}` : ""}` : my && my.desc ? esc(my.desc) : "";
  let cover = "";
  if (g) { const seen = new Set(); for (const a of g.areas) for (const k of ["boundary", "leisure", "landuse", "natural"]) { const lab = COVER_ES[a[k]]; if (lab) seen.add(a.name && /^(boundary|leisure)$/.test(k) ? `${lab}: ${a.name}` : lab); } cover = [...seen].slice(0, 4).join(" · "); }
  const keyRows = [
    t && row("Terreno", `${esc(tc[0])}; pendiente media ${t.mean.toFixed(0)}°, en el punto ${t.slope.toFixed(0)}°${t.slope >= 2 ? ` hacia ${rumbo(t.aspect)}` : ""}`),
    t && row("Altitud", `${fmtNum(Math.round(t.e0))} m (área ${fmtNum(Math.round(t.mn))}–${fmtNum(Math.round(t.mx))} m)`),
    t && row("Transitabilidad", esc(transit(t.slope))),
    cover && row("Suelo", esc(cover)),
    w && row("Tiempo actual", `${esc(wmo(w.current.weather_code)[0])}, ${Math.round(w.current.temperature_2m)} °C, viento ${Math.round(w.current.wind_speed_10m)} km/h ${rumbo(w.current.wind_direction_10m)}`),
    w && row("Lluvia 72 h", `${Math.max(...w.daily.precipitation_probability_max.slice(0, 3).map(v => v || 0))} % · ${w.daily.precipitation_sum.slice(0, 3).reduce((a, v) => a + (v || 0), 0).toFixed(0)} mm`),
    w && row("Luz diurna", `${(w.daily.sunrise[0] || "").slice(11, 16)} – ${(w.daily.sunset[0] || "").slice(11, 16)}`),
    g && row("Acceso", g.roads.length ? `${esc(HW_ES[g.near.t.highway] || "vía")}${g.near.t.name || g.near.t.ref ? ` ${esc(g.near.t.name || g.near.t.ref)}` : ""} a ${fmtDist(g.near.d)} ${rumbo(bearing(P, g.near))}` : "Sin vías en 3 km"),
    row(`Elementos (${fmtDist(S.radius)})`, S.errs.feats ? "Sin datos de OSM (servidor saturado); el croquis muestra el mapa base" : ["puente", "agua", "estructura", "servicio"].map(c => { const n = S.feats.filter(f => f.cat === c).length; return `${n} ${{ puente: "puente", agua: "agua", estructura: "estructura", servicio: "servicio" }[c]}${n !== 1 && c !== "agua" ? "s" : ""}`; }).join(" · ")),
  ].filter(Boolean).join("");

  // Hoja 2: datos de apoyo compactos y apreciación
  const d = w && w.daily, fmtDay = (s, i) => i === 0 ? "Hoy" : i === 1 ? "Mañana" : new Date(s + "T12:00").toLocaleDateString("es-VE", { weekday: "short", day: "numeric" });
  const wx = d ? `<table><tr><th>Día</th><th>Condición</th><th>Lluvia</th><th>Mín/máx</th></tr>${d.time.slice(0, 3).map((s, i) => `<tr><td>${fmtDay(s, i)}</td><td>${esc(wmo(d.weather_code[i])[0])}</td><td class="n">${d.precipitation_probability_max[i] ?? 0} % · ${d.precipitation_sum[i] ?? 0} mm</td><td class="n">${Math.round(d.temperature_2m_min[i])}/${Math.round(d.temperature_2m_max[i])} °C</td></tr>`).join("")}</table>` : `<p class="note">Sin pronóstico.</p>`;
  const acc = g ? [["Vía más cercana", g.near], ["Carretera", g.main], ["Trocha / sendero", g.dirt]].filter(([, r], i, a) => r && !a.slice(0, i).some(([, q]) => q === r)) : [];
  const bridges = S.feats.filter(f => f.cat === "puente").slice(0, 3);
  const mob = `<table><tr><th>Acceso / puente</th><th>Detalle</th><th>Dist.</th></tr>${acc.map(([l, r]) => `<tr><td>${l}</td><td>${esc(HW_ES[r.t.highway] || r.t.highway)}${SURF_ES[r.t.surface] ? `, ${esc(SURF_ES[r.t.surface])}` : ""}</td><td class="n">${fmtDist(r.d)} ${rumbo(bearing(P, r))}</td></tr>`).join("")}${bridges.map(b => `<tr><td>${esc(b.name || "Puente")}</td><td>${esc(b.type)}${b.tags.maxweight ? `, máx. ${esc(b.tags.maxweight)} t` : ""}</td><td class="n">${where(b)}</td></tr>`).join("")}${!acc.length && !bridges.length ? `<tr><td colspan="3" class="note">${g ? "Sin vías ni puentes mapeados." : "Sin datos de vías."}</td></tr>` : ""}</table>`;
  const SUP = [["Salud", f => ["hospital", "clinic", "pharmacy"].includes(f.tags.amenity)], ["Seguridad", f => ["police", "fire_station"].includes(f.tags.amenity)], ["Combustible", f => f.tags.amenity === "fuel"],
    ["Aeródromo / helipuerto", f => f.tags.aeroway], ["Comunicaciones", isComms], ["Agua / hidrografía", f => f.cat === "agua"]];
  const sup = S.errs.feats ? `<p class="note">Sin datos de OSM.</p>` : `<table><tr><th>Apoyo</th><th>Más cercano</th><th>Dist.</th></tr>${SUP.map(([l, p]) => { const f = S.feats.find(p); return `<tr><td>${l}</td><td>${f ? esc(f.name || f.type) : "—"}</td><td class="n">${f ? fmtDist(f.d) : "—"}</td></tr>`; }).join("")}</table>`;

  return `<article class="rep brief">
    <div class="cls"><span>Uso interno · Fuentes abiertas</span><span>${num} · Hoja 1 de 2</span></div>
    <p class="note" style="margin:8px 0 0">REPORTE OPERATIVO DE ÁREA</p>
    <h1>${esc(name)}</h1>
    <p style="margin:0">${esc([ad.localidad, ad.municipio, ad.estado].filter(Boolean).join(" · ") || (S.place && S.place.display_name) || "")}</p>
    <div class="meta">
      <div>GFH: <b>${dtg(now)}</b></div><div>Decimal: <b>${P.lat.toFixed(5)}, ${P.lon.toFixed(5)}</b></div><div>UTM: <b>${toUTM(P.lat, P.lon)}</b></div>
      <div>GMS: <b>${toDMS(P.lat, "N", "S")} ${toDMS(P.lon, "E", "O")}</b></div><div>Radio de análisis: <b>${fmtDist(S.radius)}</b></div><div>Altitud: <b>${t ? fmtNum(Math.round(t.e0)) + " m" : "—"}</b></div>
    </div>
    <h2>1. Situación del área</h2>
    <div class="box global"><span>Nivel de riesgo general:</span>${lvlTag(global)}<span class="note">${highs} alto(s) y ${mods} moderado(s) de ${scored.length} factores</span></div>
    ${desc ? `<p style="margin:2px 0 6px">${desc}</p>` : ""}${my && my.notes ? `<p style="margin:0 0 6px"><b>Notas propias:</b> ${esc(my.notes.slice(0, 300))}${my.notes.length > 300 ? "…" : ""}</p>` : ""}
    <div class="cols"><div>${sketchSVG()}<div class="legend">${Object.entries(CATS).filter(([k]) => S.feats.some(f => f.cat === k)).map(([k, c]) => `<span><i style="background:${REP_COLORS[k]}"></i>${c.label}</span>`).join("")}<span><i style="background:#d99a06"></i>Punto</span></div>
      ${t ? `<div class="mini">${terrainSVG(t)}<span class="note">Relieve en ${fmtDist(2 * t.R)} de lado: verde bajo, marrón alto.</span></div>` : ""}</div>
      <div><h3 style="margin-top:0">Datos clave</h3><table>${keyRows}</table></div></div>
    <h2>2. Evaluación de riesgos</h2>
    <table><tr><th>Factor</th><th>Nivel</th><th>Fundamento</th></tr>${risks.map(r => `<tr><td>${esc(r.k)}</td><td>${lvlTag(r.n)}</td><td>${esc(r.t)}</td></tr>`).join("")}</table>

    <div class="page2"><span class="sheet-tag">HOJA 2</span>
    <div class="cls"><span>Uso interno · Fuentes abiertas</span><span>${num} · Hoja 2 de 2</span></div>
    <h2>3. Datos de apoyo</h2>
    <div class="cols2"><div><h3 style="margin-top:0">Pronóstico 72 h</h3>${wx}<h3>Movilidad</h3>${mob}</div><div><h3 style="margin-top:0">Apoyo e hidrografía (${fmtDist(S.radius)})</h3>${sup}</div></div>
    <h2>4. Apreciación</h2>
    <div class="apr">${apr.paras.map(p => `<p>${p}</p>`).join("")}${apr.verdict}</div>
    <p class="note" style="margin-top:8px">Fuentes: elevación ${esc(t && t.src ? t.src : "SRTM / Copernicus")}, meteorología (Open‑Meteo), OpenStreetMap y Wikipedia/Wikidata. Generado el ${now.toLocaleString("es-VE", { dateStyle: "long", timeStyle: "short" }).replace(/\.$/, "")}.${["terrain", "weather", "ground", "feats"].some(k => S.errs[k]) ? " Algunas fuentes no respondieron; ver factores sin dato." : ""}</p>
    <div class="sign"><div>Elaborado por</div><div>Revisado / aprobado por</div></div></div>
  </article>`;
}
