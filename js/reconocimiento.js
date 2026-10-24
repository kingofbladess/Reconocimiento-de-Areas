// Reconocimiento del Área: ubica al usuario por GPS, abre el área a su alrededor y resume todo lo que hay cerca
"use strict";

// ---------- Posición GPS en tiempo real ----------
// El GPS queda activo desde que te ubicas: el punto azul (con flecha de rumbo si te mueves) se actualiza
// en cada lectura y, en modo "seguir", el mapa te mantiene centrado. Si mueves el mapa con el dedo se deja
// de seguir hasta que toques de nuevo el botón de ubicación.
let meMark = null, meCirc = null, meWatch = null, mePos = null, following = false, wakeLock = null;
const meIcon = L.divIcon({ className: "", html: '<div class="me"><i class="me-dir"></i><b></b></div>', iconSize: [22, 22], iconAnchor: [11, 11] });
function drawMe(c) {
  const { latitude: lat, longitude: lon, accuracy: acc, heading, speed } = c;
  mePos = { lat, lon, acc, speed, heading, t: Date.now() };
  if (!meMark) {
    meCirc = L.circle([lat, lon], { radius: acc, color: cssVar("--accent"), weight: 1, fillOpacity: 0.1, interactive: false }).addTo(map);
    meMark = L.marker([lat, lon], { icon: meIcon, zIndexOffset: 2000, keyboard: false }).bindPopup("<b>Estás aquí</b>").addTo(map);
  } else { meCirc.setLatLng([lat, lon]).setRadius(acc); meMark.setLatLng([lat, lon]); }
  const el = meMark.getElement() && meMark.getElement().firstChild;
  if (el) { const moving = heading != null && !isNaN(heading) && speed > 0.5; el.classList.toggle("moving", moving); if (moving) el.style.setProperty("--hdg", heading + "deg"); }
  if (following) map.panTo(visibleCenter([lat, lon], map.getZoom()), { animate: true, duration: 0.5 });
  updateGpsChip();
}
// Centro del mapa que deja tu posición en medio de la parte que no tapa la ficha
function visibleCenter(ll, z) { const pad = coverPad(); return map.unproject(map.project(L.latLng(ll), z).add([pad.x / 2, pad.y / 2]), z); }
function updateGpsChip() {
  const ch = $("#gps"); if (!ch) return;
  ch.hidden = meWatch == null;
  if (!mePos) { $("#gpsTxt").textContent = "Buscando señal GPS…"; return; }
  const v = mePos.speed != null && !isNaN(mePos.speed) ? ` · ${(mePos.speed * 3.6).toFixed(mePos.speed < 2.8 ? 1 : 0)} km/h` : "";
  const h = mePos.heading != null && !isNaN(mePos.heading) && mePos.speed > 0.5 ? ` · rumbo ${Math.round(mePos.heading)}° ${rumbo(mePos.heading)}` : "";
  $("#gpsTxt").textContent = `GPS ±${fmtDist(mePos.acc)}${v}${h}`;
  $("#gpsFollow").setAttribute("aria-pressed", following);
  $("#mbLocate").classList.toggle("on", following);
}
async function keepAwake(on) { // la pantalla no se apaga mientras se sigue la posición
  try { if (on && !wakeLock && navigator.wakeLock) { wakeLock = await navigator.wakeLock.request("screen"); wakeLock.addEventListener("release", () => { wakeLock = null; }); } else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; } } catch (_) {}
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && following) keepAwake(true); });
function setFollow(on) {
  following = on; keepAwake(on);
  if (on && mePos) { const z = Math.max(map.getZoom(), 16); map.setView(visibleCenter([mePos.lat, mePos.lon], z), z); }
  updateGpsChip();
}
map.on("dragstart", () => { if (following) { setFollow(false); toast("Dejaste de seguir tu posición. Toca ◎ para volver a seguirla."); } });
function watchMe(onFirst) {
  if (meWatch != null) { if (onFirst && mePos) onFirst(mePos); return; }
  let first = true;
  meWatch = navigator.geolocation.watchPosition(p => {
    drawMe(p.coords); scheduleRecon();
    if (first) { first = false; if (onFirst) onFirst(mePos); }
  }, err => { if (first) { stopGps(); toast(GEO_ERR[err.code] || "No se pudo obtener tu ubicación"); $("#btnRecon").classList.remove("busy"); } },
  { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
  updateGpsChip();
}
function stopGps() {
  if (meWatch != null) navigator.geolocation.clearWatch(meWatch);
  meWatch = null; setFollow(false);
  if (meMark) { map.removeLayer(meMark); map.removeLayer(meCirc); meMark = meCirc = null; }
  mePos = null; updateGpsChip();
}
// Botón de ubicación del mapa: activa el GPS y sigue tu posición; otro toque deja de seguir
function toggleFollow() {
  if (!navigator.geolocation) { toast("Este navegador no permite conocer tu ubicación"); return; }
  if (following) return setFollow(false);
  following = true;
  watchMe(() => setFollow(true));
  if (!mePos) toast("Buscando tu posición GPS…"); else setFollow(true);
}
$("#gpsFollow").addEventListener("click", () => setFollow(!following));
$("#gpsStop").addEventListener("click", stopGps);
const GEO_ERR = { 1: "Permiso de ubicación denegado. Actívalo en el navegador para usar el reconocimiento.", 2: "El GPS no logra fijar la posición. Sal a cielo abierto y reintenta.", 3: "El GPS tardó demasiado. Reintenta en unos segundos." };
function startRecon() {
  if (!navigator.geolocation) { toast("Este navegador no permite conocer tu ubicación"); return; }
  if (!/^https:|^http:\/\/localhost/.test(location.href)) toast("El GPS necesita la app abierta por https o con el lanzador");
  const btn = $("#btnRecon"); btn.classList.add("busy");
  if (!mePos) toast("Buscando tu posición GPS…");
  watchMe(({ lat, lon }) => {
    btn.classList.remove("busy");
    if (!inArea(lat, lon)) { map.flyTo([lat, lon], 12); toast("Tu ubicación está fuera de Venezuela y Guyana: no se puede reconocer el área"); return; }
    selectPoint(lat, lon, { zoom: 15, recon: true, force: true });
    following = true; updateGpsChip(); keepAwake(true);
  });
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
