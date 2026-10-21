// Avisos, medición de distancias y perfil del terreno
"use strict";

// ---------- Herramientas ----------
function toast(msg) { const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 3200); }
$("#btnVE").addEventListener("click", () => map.flyToBounds(veBounds, { duration: 0.8 }));
let measuring = false, mPts = [], mLine = null;
const mDots = L.layerGroup().addTo(map);
function addMeasure(ll) {
  mPts.push(ll); L.circleMarker(ll, { radius: 4, color: cssVar("--gold"), fillOpacity: 1 }).addTo(mDots);
  if (mLine) mLine.setLatLngs(mPts); else mLine = L.polyline(mPts, { color: cssVar("--gold"), weight: 3, dashArray: "4 6" }).addTo(map);
  let total = 0; for (let i = 1; i < mPts.length; i++) total += mPts[i - 1].distanceTo(mPts[i]);
  $("#measureVal").textContent = fmtDist(total); $("#profileBox").innerHTML = "";
}
function clearMeasure() { mPts = []; mDots.clearLayers(); if (mLine) { map.removeLayer(mLine); mLine = null; } $("#measureVal").textContent = "0 m"; $("#profileBox").innerHTML = ""; }
$("#btnMeasure").addEventListener("click", () => {
  measuring = !measuring; $("#btnMeasure").setAttribute("aria-pressed", measuring); $("#measureBox").hidden = !measuring;
  map.getContainer().style.cursor = measuring ? "crosshair" : ""; if (!measuring) clearMeasure();
});
$("#measureClear").addEventListener("click", e => { e.stopPropagation(); clearMeasure(); });
// Perfil del terreno a lo largo del trazo: 100 muestras repartidas por distancia
$("#measureProfile").addEventListener("click", async e => {
  e.stopPropagation();
  if (mPts.length < 2) { toast("Marca al menos dos puntos en el mapa"); return; }
  const box = $("#profileBox"); box.innerHTML = `<div class="loading">Calculando perfil…</div>`;
  const seg = []; let total = 0;
  for (let i = 1; i < mPts.length; i++) { const d = mPts[i - 1].distanceTo(mPts[i]); seg.push(d); total += d; }
  const N = 100, pts = [];
  for (let k = 0; k < N; k++) {
    let s = total * k / (N - 1), i = 0;
    while (i < seg.length - 1 && s > seg[i]) { s -= seg[i]; i++; }
    const f = seg[i] ? Math.min(1, s / seg[i]) : 0, a = mPts[i], b = mPts[i + 1];
    pts.push({ lat: a.lat + (b.lat - a.lat) * f, lon: a.lng + (b.lng - a.lng) * f });
  }
  try {
    const v = await elevations(pts), dx = total / (N - 1);
    let up = 0, down = 0, maxS = 0;
    for (let k = 1; k < N; k++) { const dz = v[k] - v[k - 1]; if (dz > 0) up += dz; else down -= dz; maxS = Math.max(maxS, Math.abs(Math.atan(dz / dx)) / rad); }
    box.innerHTML = profileSVG(v, total, "Inicio", "Fin")
      + `<div class="src">Sube ${fmtNum(Math.round(up))} m · baja ${fmtNum(Math.round(down))} m · entre ${fmtNum(Math.round(Math.min(...v)))} y ${fmtNum(Math.round(Math.max(...v)))} m · pendiente máx. ${maxS.toFixed(0)}°</div>`;
  } catch (err) { box.innerHTML = `<div class="err">${esc(err.message)}</div>`; }
});
