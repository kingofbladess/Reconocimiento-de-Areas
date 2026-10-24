// Reconocimiento del Área: ubica al usuario por GPS, abre el área a su alrededor y resume todo lo que hay cerca
"use strict";

// ---------- Posición GPS ----------
// Punto azul con su círculo de precisión; mientras el reconocimiento está activo se sigue al usuario
// y se avisa si se alejó del punto analizado.
let meDot = null, meWatch = null, mePos = null;
function drawMe(lat, lon, acc) {
  mePos = { lat, lon, acc };
  if (meDot) { meDot.getLayers()[0].setLatLng([lat, lon]).setRadius(acc); meDot.getLayers()[1].setLatLng([lat, lon]); return; }
  meDot = L.layerGroup([L.circle([lat, lon], { radius: acc, color: cssVar("--accent"), weight: 1, fillOpacity: 0.1, interactive: false }),
    L.circleMarker([lat, lon], { radius: 8, color: "#fff", weight: 3, fillColor: cssVar("--accent"), fillOpacity: 1 }).bindPopup("<b>Estás aquí</b>")]).addTo(map);
}
function watchMe() {
  if (meWatch != null) return;
  meWatch = navigator.geolocation.watchPosition(p => {
    if (!S.recon) { navigator.geolocation.clearWatch(meWatch); meWatch = null; return; }
    drawMe(p.coords.latitude, p.coords.longitude, p.coords.accuracy);
    scheduleRecon();
  }, () => {}, { enableHighAccuracy: true, maximumAge: 10000 });
}
const GEO_ERR = { 1: "Permiso de ubicación denegado. Actívalo en el navegador para usar el reconocimiento.", 2: "El GPS no logra fijar la posición. Sal a cielo abierto y reintenta.", 3: "El GPS tardó demasiado. Reintenta en unos segundos." };
function startRecon() {
  if (!navigator.geolocation) { toast("Este navegador no permite conocer tu ubicación"); return; }
  if (!/^https:|^http:\/\/localhost/.test(location.href)) toast("El GPS necesita la app abierta por https o con el lanzador");
  const btn = $("#btnRecon"); btn.classList.add("busy");
  toast("Buscando tu posición GPS…");
  navigator.geolocation.getCurrentPosition(p => {
    btn.classList.remove("busy");
    const { latitude: lat, longitude: lon, accuracy } = p.coords;
    drawMe(lat, lon, accuracy);
    if (!inArea(lat, lon)) { map.flyTo([lat, lon], 12); toast("Tu ubicación está fuera de Venezuela y Guyana: no se puede reconocer el área"); return; }
    selectPoint(lat, lon, { zoom: 15, recon: true, force: true });
    watchMe();
  }, err => { btn.classList.remove("busy"); toast(GEO_ERR[err.code] || "No se pudo obtener tu ubicación"); },
  { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 });
}
$("#btnRecon").addEventListener("click", startRecon);

// ---------- Resumen del área ----------
let reconRaf = 0;
function scheduleRecon() { if (!S.recon) return; cancelAnimationFrame(reconRaf); reconRaf = requestAnimationFrame(renderRecon); }
const near = (pred, list = S.feats) => list.filter(pred).sort((a, b) => a.d - b.d)[0];
const whereTo = f => `a ${fmtDist(f.d)} al ${rumbo(bearing(S.point, f))}`;
const busyOr = (k, txt) => S.busy[k] ? "…" : S.errs[k] ? "sin dato" : txt;
function reconRow(icon, label, value, feat) {
  return `<div class="rrow"${feat ? ` data-feat="${esc(feat.id)}" role="button" tabindex="0"` : ""}><span class="ri">${icon}</span><span><b>${label}</b><span>${value}</span></span></div>`;
}
function renderRecon() {
  const el = $("#s-recon"); if (!el || !S.recon || !S.point) return;
  const P = S.point, t = S.terrain, w = S.weather, g = S.ground, F = S.feats, tg = f => f.tags || {};
  // Posición y movimiento desde el análisis
  const moved = mePos ? dist(mePos, P) : 0;
  const head = `<h3>Reconocimiento del Área <small>radio ${fmtDist(S.radius)}${mePos ? ` · GPS ±${fmtDist(mePos.acc)}` : ""}</small></h3>
    ${moved > Math.max(60, S.radius / 4) ? `<div class="stale">Te moviste ${fmtDist(moved)} desde el punto analizado. <button class="copy" data-recon="again">Reconocer aquí</button></div>` : ""}`;
  // Datos clave
  const ev = t ? t.e0 : w && w.elevation;
  const facts = [
    ["Posición", `${P.lat.toFixed(5)}, ${P.lon.toFixed(5)}`],
    ["UTM", toUTM(P.lat, P.lon)],
    ["Altitud", ev != null ? `${fmtNum(Math.round(ev))} m` : busyOr("terrain", "—")],
    ["Terreno", t ? terrainClass(t)[0] : busyOr("terrain", "—")],
    ["Pendiente", t ? `${t.slope.toFixed(0)}° hacia el ${rumbo(t.aspect)}` : busyOr("terrain", "—")],
    ["Clima ahora", w && w.current ? `${Math.round(w.current.temperature_2m)}° · ${wmo(w.current.weather_code)[0]} · viento ${Math.round(w.current.wind_speed_10m)} km/h` : busyOr("weather", "—")],
  ];
  // Lo que hay alrededor
  const rows = [];
  const fb = S.busy.feats, gb = S.busy.ground, wait = `<span class="loading" style="padding:0">buscando…</span>`;
  if (g) {
    const cover = new Set(); for (const a of g.areas) for (const k of ["landuse", "natural", "leisure", "boundary"]) if (COVER_ES[a[k]]) cover.add(COVER_ES[a[k]]);
    if (cover.size) rows.push(reconRow("🌿", "Cobertura del suelo", [...cover].slice(0, 4).join(" · ")));
    const r = g.near, m = g.main;
    rows.push(reconRow("🛣️", "Acceso", r ? `${HW_ES[r.t.highway] || "Vía"}${r.t.name || r.t.ref ? ` ${esc(r.t.name || r.t.ref)}` : ""} ${whereTo(r)}${m && m !== r ? `<br>Vía principal: ${HW_ES[m.t.highway]}${m.t.name || m.t.ref ? ` ${esc(m.t.name || m.t.ref)}` : ""} ${whereTo(m)}` : ""}` : "Sin vías registradas en 3 km"));
  } else rows.push(reconRow("🛣️", "Acceso", gb ? wait : "sin dato"));
  if (fb) rows.push(reconRow("📍", "Entorno", wait));
  else if (!S.errs.feats) {
    const water = near(f => f.cat === "agua"), bridges = F.filter(f => f.cat === "puente");
    rows.push(reconRow("💧", "Agua", water ? `${esc(water.name || water.type)} (${esc(water.type.toLowerCase())}) ${whereTo(water)}` : `Sin ríos ni cuerpos de agua en ${fmtDist(S.radius)}`, water));
    rows.push(reconRow("🌉", "Puentes", bridges.length ? `${bridges.length} · el más cercano: ${esc(bridges[0].name || bridges[0].type)} ${whereTo(bridges[0])}` : "Ninguno en el radio", bridges[0]));
    const svc = [["🏥", "Salud", f => /^(hospital|clinic|pharmacy)$/.test(tg(f).amenity)], ["👮", "Seguridad", f => /^(police|fire_station)$/.test(tg(f).amenity)],
      ["⛽", "Combustible", f => tg(f).amenity === "fuel"], ["🏫", "Educación", f => /^(school|university)$/.test(tg(f).amenity)],
      ["✈️", "Aeródromo / helipuerto", f => !!tg(f).aeroway], ["⚡", "Energía y comunicaciones", f => !!tg(f).power || /tower|mast|antenna/.test(tg(f).man_made || "")]];
    for (const [ic, lab, pred] of svc) { const f = near(pred); if (f) rows.push(reconRow(ic, lab, `${esc(f.name || f.type)} ${whereTo(f)}`, f)); }
    const nat = F.filter(f => f.cat === "naturaleza"), est = F.filter(f => f.cat === "estructura"), hist = F.filter(f => f.cat === "interes");
    if (nat.length) rows.push(reconRow("⛰️", "Naturaleza", `${nat.length} elementos · ${esc(nat.slice(0, 3).map(f => f.name || f.type).join(", "))}`, nat[0]));
    if (est.length) rows.push(reconRow("🏗️", "Estructuras", `${est.length} · ${esc(est.slice(0, 3).map(f => f.name || f.type).join(", "))}`, est[0]));
    if (hist.length) rows.push(reconRow("🏛️", "Lugares de interés", `${hist.length} · ${esc(hist.slice(0, 3).map(f => f.name || f.type).join(", "))}`, hist[0]));
  } else rows.push(reconRow("📍", "Entorno", "No se pudo consultar OpenStreetMap (ver Entorno)"));
  const wk = S.wiki[0];
  if (wk) rows.push(reconRow("📖", "Lugar documentado más cercano", `${esc(wk.title)} ${whereTo(wk)}`));
  // Alertas rápidas
  const alerts = [];
  if (t && t.steep > 0.2) alerts.push("Laderas fuertes en el área: riesgo de deslizamiento con lluvia");
  if (t && t.below <= 0.15 && near(f => f.cat === "agua" && f.d < 500)) alerts.push("Punto bajo cerca de agua: posible inundación");
  if (w && w.daily && w.daily.precipitation_probability_max[0] >= 70) alerts.push(`Lluvia probable hoy (${w.daily.precipitation_probability_max[0]} %)`);
  if (g && !g.near) alerts.push("Sin vías registradas cerca: acceso difícil");
  el.innerHTML = head
    + `<div class="facts">${facts.map(([k, v]) => `<div class="fact"><small>${k}</small><b>${esc(v)}</b></div>`).join("")}</div>`
    + (alerts.length ? `<ul class="ralert">${alerts.map(a => `<li>${esc(a)}</li>`).join("")}</ul>` : "")
    + `<div class="sub">Qué hay alrededor</div><div class="rlist">${rows.join("")}</div>`
    + `<div class="terr-acts"><button class="btn go" data-act="analyze">Reporte completo</button><button class="btn" data-recon="again">Actualizar con mi posición</button></div>`;
}
// Las filas con data-feat las maneja interaccion.js (vuelan al elemento en el mapa)
sheetBody.addEventListener("click", e => { if (e.target.closest("[data-recon]")) startRecon(); });
