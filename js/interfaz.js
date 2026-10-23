// Interfaz adaptable: ficha deslizable en el teléfono, buscador compacto, menú de capas, secciones plegables y aviso sin conexión
"use strict";

// ---------- Ficha deslizable (teléfono) ----------
// Tres alturas: "peek" (solo el título, el mapa queda libre), "half" (media pantalla) y "full" (casi toda).
// Se cambia tocando o arrastrando la barra superior; en "half" basta deslizar el contenido hacia arriba para ampliarla.
const sheetEl = $("#sheet"), MQ_MOBILE = matchMedia("(max-width: 860px)");
const isMobile = () => MQ_MOBILE.matches;
const SNAPS = ["peek", "half", "full"];
const snapPx = s => { const H = innerHeight; return s === "peek" ? 58 : s === "half" ? Math.round(H * 0.44) : H - 64; };
let snap = "peek", peekText = "";
function setPeek(t) { peekText = t || ""; $("#peek").textContent = snap === "peek" ? peekText : ""; }
function setSheet(s, title) {
  snap = s; if (title !== undefined) peekText = title;
  sheetEl.dataset.snap = s;
  $("#peek").textContent = s === "peek" ? peekText : "";
  layoutSheet();
}
function layoutSheet() {
  const h = isMobile() ? snapPx(snap) : 0;
  sheetEl.style.height = isMobile() ? h + "px" : "";
  // los controles de Leaflet (escala, créditos) y la caja de medición se apoyan sobre la ficha
  document.documentElement.style.setProperty("--sheet-h", h + "px");
}
MQ_MOBILE.addEventListener("change", layoutSheet);
addEventListener("resize", () => { clearTimeout(layoutSheet.t); layoutSheet.t = setTimeout(layoutSheet, 120); });

// Arrastre de la barra
(() => {
  const grab = $("#grab"); let y0 = 0, h0 = 0, moved = false, t0 = 0, dragging = false;
  grab.addEventListener("pointerdown", e => {
    if (!isMobile()) return;
    dragging = true; moved = false; y0 = e.clientY; h0 = sheetEl.getBoundingClientRect().height; t0 = performance.now();
    grab.setPointerCapture(e.pointerId); sheetEl.classList.add("dragging");
  });
  grab.addEventListener("pointermove", e => {
    if (!dragging) return;
    const dy = e.clientY - y0; if (Math.abs(dy) > 6) moved = true;
    sheetEl.style.height = Math.max(58, Math.min(innerHeight - 64, h0 - dy)) + "px";
  });
  const end = e => {
    if (!dragging) return; dragging = false; sheetEl.classList.remove("dragging");
    if (!moved) return setSheet(snap === "peek" ? "half" : snap === "half" ? "peek" : "half");
    const h = sheetEl.getBoundingClientRect().height, v = (y0 - e.clientY) / Math.max(1, performance.now() - t0); // px/ms, + hacia arriba
    let best = SNAPS.reduce((a, s) => Math.abs(snapPx(s) - h) < Math.abs(snapPx(a) - h) ? s : a, "peek");
    if (Math.abs(v) > 0.6) { const i = SNAPS.indexOf(snap) + (v > 0 ? 1 : -1); best = SNAPS[Math.max(0, Math.min(2, i))]; } // gesto rápido: un paso
    setSheet(best);
  };
  grab.addEventListener("pointerup", end); grab.addEventListener("pointercancel", end);
  // Desde el teclado o un lector de pantalla
  grab.addEventListener("click", e => { if (e.detail === 0) setSheet(snap === "peek" ? "half" : "peek"); });
  // Deslizar el contenido: hacia arriba en "half" amplía; hacia abajo con el contenido al inicio la baja un paso
  let sy = null, top0 = 0;
  sheetBody.addEventListener("touchstart", e => { sy = e.touches[0].clientY; top0 = sheetBody.scrollTop; }, { passive: true });
  sheetBody.addEventListener("touchmove", e => {
    if (sy == null || !isMobile()) return;
    const dy = e.touches[0].clientY - sy;
    if (snap === "half" && dy < -24) { setSheet("full"); sy = null; }
    else if (snap === "peek" && dy < -24) { setSheet("half"); sy = null; }
    else if (top0 <= 0 && sheetBody.scrollTop <= 0 && dy > 70) { setSheet(snap === "full" ? "half" : "peek"); sy = null; }
  }, { passive: true });
  sheetBody.addEventListener("touchend", () => { sy = null; }, { passive: true });
})();

// ---------- Mapa: centrar en la parte que no tapa la ficha ----------
function coverPad() {
  if (isMobile()) return { x: 0, y: snapPx(snap) };
  return { x: sheetEl.offsetWidth ? sheetEl.offsetWidth + 24 : 0, y: 0 };
}
// Centra el punto en el área visible. Sin cambio de zoom solo mueve el mapa si el punto quedó tapado o en el borde.
function focusVisible(ll, z, fly) {
  ll = L.latLng(ll); const pad = coverPad(), size = map.getSize();
  if (z === map.getZoom() && !fly) {
    const p = map.latLngToContainerPoint(ll), m = 40;
    if (p.x > m && p.y > m + 60 && p.x < size.x - pad.x - m && p.y < size.y - pad.y - m) return;
  }
  const c = map.unproject(map.project(ll, z).add([pad.x / 2, pad.y / 2]), z);
  fly ? map.flyTo(c, z, { duration: 0.6 }) : map.setView(c, z);
}
function fitVisible(bounds, maxZoom) {
  const pad = coverPad();
  map.fitBounds(bounds, { paddingTopLeft: [16, isMobile() ? 70 : 16], paddingBottomRight: [pad.x + 16, pad.y + 16], maxZoom });
}

// ---------- Buscador compacto ----------
// En el teléfono solo se ve la barra de búsqueda; los lugares destacados aparecen al tocarla.
const finderEl = $("#finder");
function openFinder() { finderEl.classList.add("open"); }
function closeFinder() { finderEl.classList.remove("open"); }
document.addEventListener("pointerdown", e => { if (!finderEl.contains(e.target)) closeFinder(); });

// ---------- Menú de capas y herramientas ----------
const toolsEl = $("#tools");
$("#btnLayers").addEventListener("click", () => {
  const open = !toolsEl.classList.contains("layers-open");
  toolsEl.classList.toggle("layers-open", open); $("#btnLayers").setAttribute("aria-expanded", open);
});
$("#layers").addEventListener("click", e => { if (e.target.closest("button[data-layer]")) { toolsEl.classList.remove("layers-open"); $("#btnLayers").setAttribute("aria-expanded", false); } });
document.addEventListener("pointerdown", e => { if (!toolsEl.contains(e.target)) { toolsEl.classList.remove("layers-open"); $("#btnLayers").setAttribute("aria-expanded", false); } });

// ---------- Secciones plegables de la ficha ----------
// Tocar el título de una sección la pliega o despliega; se recuerda en este navegador.
const FOLD_KEY = "rv-plegadas";
const folds = (() => {
  try { const v = JSON.parse(localStorage.getItem(FOLD_KEY)); if (Array.isArray(v)) return new Set(v); } catch (_) {}
  return new Set(isMobile() ? ["s-cerca", "s-sismos"] : []); // en el teléfono empiezan plegadas las menos usadas
})();
const saveFolds = () => { try { localStorage.setItem(FOLD_KEY, JSON.stringify([...folds])); } catch (_) {} };
function applyFolds() { sheetBody.querySelectorAll("section.blk[id]").forEach(s => s.classList.toggle("fold", folds.has(s.id))); }
function toggleFold(sec) { const on = !sec.classList.contains("fold"); sec.classList.toggle("fold", on); on ? folds.add(sec.id) : folds.delete(sec.id); saveFolds(); }
function unfold(sec) { if (sec.classList.contains("fold")) toggleFold(sec); }

// ---------- Aviso sin conexión ----------
function updateNet() {
  $("#net").hidden = !offline();
  document.documentElement.classList.toggle("is-offline", offline());
}
addEventListener("online", () => { updateNet(); toast("Conexión recuperada"); });
addEventListener("offline", () => { updateNet(); toast("Sin conexión: la app sigue funcionando con lo que ya guardaste"); });
updateNet();
let staleTimer = 0;
NET.onStale = () => { clearTimeout(staleTimer); staleTimer = setTimeout(() => { if (S.view === "point") renderHead(); }, 150); };
