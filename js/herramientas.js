// Avisos, medición de distancias y perfil del terreno
"use strict";

// ---------- Herramientas ----------
function toast(msg) { const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 3200); }
$("#btnVE").addEventListener("click", () => map.flyToBounds(areaBounds, { duration: 0.8 }));
let measuring = false, mPts = [], mLine = null, profTimer = 0;
const mDots = L.layerGroup().addTo(map);
const vIcon = L.divIcon({ className: "", html: '<div class="mvert"></div>', iconSize: [14, 14], iconAnchor: [7, 7] });
// Vértices arrastrables: se corrige el trazo moviéndolos; un toque sobre uno lo elimina
function drawMeasure() {
  mDots.clearLayers();
  mPts.forEach((ll, i) => L.marker(ll, { icon: vIcon, draggable: true, keyboard: false, title: "Arrastra para mover · toca para quitar" })
    .on("drag", e => { mPts[i] = e.target.getLatLng(); mLine.setLatLngs(mPts); updMeasure(false); })
    .on("dragend", () => updMeasure(true))
    .on("click", e => { L.DomEvent.stop(e); mPts.splice(i, 1); drawMeasure(); updMeasure(true); })
    .addTo(mDots));
  if (mPts.length && !mLine) mLine = L.polyline(mPts, { color: cssVar("--gold"), weight: 3, dashArray: "4 6", interactive: false }).addTo(map);
  if (mLine) { if (mPts.length) mLine.setLatLngs(mPts); else { map.removeLayer(mLine); mLine = null; } }
}
function updMeasure(profile) {
  let total = 0; for (let i = 1; i < mPts.length; i++) total += mPts[i - 1].distanceTo(mPts[i]);
  $("#measureVal").textContent = fmtDist(total);
  $("#measureUndo").disabled = !mPts.length;
  clearTimeout(profTimer);
  if (!profile) return;
  if (mPts.length < 2) { $("#profileBox").innerHTML = ""; return; }
  profTimer = setTimeout(measureProfile, 250); // el perfil se actualiza solo al agregar o mover puntos
}
function addMeasure(ll) { mPts.push(ll); drawMeasure(); updMeasure(true); }
function clearMeasure() { mPts = []; drawMeasure(); updMeasure(true); }
function setMeasuring(on) {
  measuring = on; $("#btnMeasure").setAttribute("aria-pressed", on); $("#measureBox").hidden = !on;
  map.getContainer().classList.toggle("measuring", on);
  on ? map.doubleClickZoom.disable() : map.doubleClickZoom.enable();
  if (!on) clearMeasure();
}
$("#btnMeasure").addEventListener("click", () => setMeasuring(!measuring));
$("#measureClear").addEventListener("click", e => { e.stopPropagation(); clearMeasure(); });
$("#measureUndo").addEventListener("click", e => { e.stopPropagation(); mPts.pop(); drawMeasure(); updMeasure(true); });
$("#measureClose").addEventListener("click", e => { e.stopPropagation(); setMeasuring(false); });
// Perfil del terreno a lo largo del trazo: 120 muestras repartidas por distancia
async function measureProfile() {
  const box = $("#profileBox"), ver = mPts.map(p => p.lat + "," + p.lng).join(";");
  if (!box.innerHTML) box.innerHTML = `<div class="loading">Calculando perfil…</div>`;
  const seg = []; let total = 0;
  for (let i = 1; i < mPts.length; i++) { const d = mPts[i - 1].distanceTo(mPts[i]); seg.push(d); total += d; }
  const N = 120, pts = [];
  for (let k = 0; k < N; k++) {
    let s = total * k / (N - 1), i = 0;
    while (i < seg.length - 1 && s > seg[i]) { s -= seg[i]; i++; }
    const f = seg[i] ? Math.min(1, s / seg[i]) : 0, a = mPts[i], b = mPts[i + 1];
    pts.push({ lat: a.lat + (b.lat - a.lat) * f, lon: a.lng + (b.lng - a.lng) * f });
  }
  try {
    const v = await elevations(pts), dx = total / (N - 1);
    if (ver !== mPts.map(p => p.lat + "," + p.lng).join(";")) return; // el trazo cambió mientras se calculaba
    let up = 0, down = 0, maxS = 0;
    for (let k = 1; k < N; k++) { const dz = v[k] - v[k - 1]; if (dz > 0) up += dz; else down -= dz; maxS = Math.max(maxS, Math.abs(Math.atan(dz / dx)) / rad); }
    box.innerHTML = profileSVG(v, total, "Inicio", "Fin", pts)
      + `<div class="src">Sube ${fmtNum(Math.round(up))} m · baja ${fmtNum(Math.round(down))} m · entre ${fmtNum(Math.round(Math.min(...v)))} y ${fmtNum(Math.round(Math.max(...v)))} m · pendiente máx. ${maxS.toFixed(0)}° · ${transit(maxS)}</div>`;
  } catch (err) { box.innerHTML = `<div class="err">${esc(err.message)}</div>`; }
}

// ---------- Menú del mapa: clic derecho o mantener presionado ----------
const ctx = $("#ctx");
const ctxOpen = () => !ctx.hidden;
function closeCtx() { ctx.hidden = true; }
function openCtx(ll, x, y) {
  const c = `${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)}`, inside = inArea(ll.lat, ll.lng);
  ctx.innerHTML = `<div class="ctx-head"><b>${c}</b><span id="ctxAlt">Altitud…</span></div>
    ${inside ? `<button data-c="open">Ver ficha de este punto</button><button data-c="3d">Ver aquí en 3D</button>` : `<div class="ctx-note">Fuera de Venezuela y Guyana</div>`}
    <button data-c="measure">${measuring ? "Agregar punto al trazo" : "Medir desde aquí"}</button>
    <button data-c="copy">Copiar coordenadas</button><button data-c="center">Centrar aquí</button>`;
  ctx.ll = ll; ctx.hidden = false;
  const r = ctx.getBoundingClientRect(), W = innerWidth, H = innerHeight;
  ctx.style.left = Math.max(8, Math.min(x, W - r.width - 8)) + "px"; ctx.style.top = Math.max(8, Math.min(y, H - r.height - 8)) + "px";
  elevAt(ll.lat, ll.lng).then(v => { const a = $("#ctxAlt"); if (a && ctx.ll === ll) a.textContent = `${fmtNum(Math.round(v))} m s. n. m.`; })
    .catch(() => { const a = $("#ctxAlt"); if (a) a.textContent = ""; });
}
ctx.addEventListener("click", async e => {
  const b = e.target.closest("button[data-c]"); if (!b) return;
  const ll = ctx.ll, k = b.dataset.c; closeCtx();
  if (k === "open") selectPoint(ll.lat, ll.lng);
  if (k === "3d") open3D({ lat: ll.lat, lon: ll.lng });
  if (k === "measure") { if (!measuring) setMeasuring(true); addMeasure(ll); }
  if (k === "center") map.panTo(ll);
  if (k === "copy") { const c = `${ll.lat.toFixed(6)}, ${ll.lng.toFixed(6)}`; try { await navigator.clipboard.writeText(c); toast("Copiado: " + c); } catch (_) { toast(c); } }
});
map.on("contextmenu", e => { clearTimeout(clickTimer); openCtx(e.latlng, e.originalEvent.clientX, e.originalEvent.clientY); });
// Mantener presionado en pantallas táctiles (iOS no envía "contextmenu")
let lpTimer = 0, lpStart = null, lpFired = false;
map.getContainer().addEventListener("touchstart", e => {
  if (e.touches.length !== 1) { clearTimeout(lpTimer); return; }
  const t = e.touches[0]; lpStart = [t.clientX, t.clientY]; lpFired = false; clearTimeout(lpTimer);
  lpTimer = setTimeout(() => {
    lpFired = true;
    const r = map.getContainer().getBoundingClientRect();
    openCtx(map.containerPointToLatLng([lpStart[0] - r.left, lpStart[1] - r.top]), lpStart[0], lpStart[1]);
    if (navigator.vibrate) navigator.vibrate(15);
  }, 550);
}, { passive: true });
map.getContainer().addEventListener("touchmove", e => { const t = e.touches[0]; if (!lpStart || Math.hypot(t.clientX - lpStart[0], t.clientY - lpStart[1]) > 10) clearTimeout(lpTimer); }, { passive: true });
map.getContainer().addEventListener("touchend", e => { clearTimeout(lpTimer); if (lpFired) { e.preventDefault(); lpFired = false; } }); // sin toque extra que cierre el menú
document.addEventListener("pointerdown", e => { if (ctxOpen() && !ctx.contains(e.target)) closeCtx(); });
map.on("movestart", closeCtx);

// ---------- Mi ubicación ----------
// El botón de ubicación del mapa sigue tu posición GPS en tiempo real (js/reconocimiento.js)
$("#mbLocate").addEventListener("click", e => { e.preventDefault(); toggleFollow(); });
$("#mb3d").addEventListener("click", e => { e.preventDefault(); open3D(); });

// ---------- Atajos de teclado ----------
document.addEventListener("keydown", e => {
  if (e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
  if (e.key === "Escape") { if (ctxOpen()) return closeCtx(); if (is3D()) return close3D(); if (measuring) return setMeasuring(false); }
  if (!$("#report").hidden || !$("#lightbox").hidden) return;
  if (e.key === "3") return is3D() ? close3D() : open3D();
  if (is3D()) return;
  if (e.key === "m" || e.key === "M") return setMeasuring(!measuring);
  if (e.key === "p" || e.key === "P") return setSlopes($("#btnSlope").getAttribute("aria-pressed") !== "true");
  if (e.key === "/") { e.preventDefault(); $("#q").focus(); }
});
