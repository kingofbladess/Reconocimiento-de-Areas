// Clics, formularios y archivos dentro de la ficha
"use strict";

// ---------- Interacción con la ficha ----------
const RETRY = { weather: id => { loadWeather(id); loadAir(id); }, photos: loadPhotos, wiki: loadWiki, feats: loadFeatures, quakes: loadQuakes, info: loadInfo, terrain: loadTerrain, ground: loadGround };
function closeSheet() {
  S.point = null; S.custom = null; if (pointMarker) { map.removeLayer(pointMarker); pointMarker = null; } if (radiusCircle) { map.removeLayer(radiusCircle); radiusCircle = null; }
  featLayer.clearLayers(); wikiLayer.clearLayers(); quakeLayer.clearLayers(); reqId++; renderEmpty();
}
sheetBody.addEventListener("click", async e => {
  const cp = e.target.closest("[data-copy]");
  if (cp) {
    try { await navigator.clipboard.writeText(cp.dataset.copy); toast("Copiado: " + cp.dataset.copy); }
    catch (_) { const r = document.createRange(); r.selectNodeContents(cp.previousElementSibling); const s = getSelection(); s.removeAllRanges(); s.addRange(r); toast("Texto seleccionado. Cópialo con Ctrl+C"); }
    return;
  }
  if (e.target.closest("#closeSheet")) return closeSheet();
  const fold = e.target.closest('section.blk[id^="s-"] > h3');
  if (fold && !e.target.closest("a, button, select, input")) return toggleFold(fold.parentElement);
  const rt = e.target.closest("[data-retry]");
  if (rt && S.point) { const k = rt.dataset.retry; S.errs[k] = null; return RETRY[k](reqId); }
  const act = e.target.closest("[data-act]");
  if (act) {
    const a = act.dataset.act;
    if (a === "analyze") return openReport();
    if (a === "view3d") return open3D();
    if (a === "slopes") { const on = !map.hasLayer(slopeLayer); setSlopes(on); act.setAttribute("aria-pressed", on); if (on && map.getZoom() < 13 && radiusCircle) map.fitBounds(radiusCircle.getBounds(), { padding: [30, 30] }); return; }
    if (a === "save") return renderForm(null);
    if (a === "edit") return renderForm(S.custom);
    if (a === "addfiles") { const fi = $("#fileHere"); if (fi) { sheetBody.scrollTo({ top: $("#s-archivos").offsetTop - 44 }); fi.click(); } return; }
    if (a === "share") { try { await navigator.clipboard.writeText(location.href); toast("Enlace copiado"); } catch (_) { toast(location.href); } return; }
    if (a === "cancel") { draft = null; return S.point ? renderSheet() : renderMineList(); }
    if (a === "delete") return deletePlace(draft.pl);
    if (a === "new") { pickNew = true; toast("Toca en el mapa el punto del nuevo lugar"); setSheet("peek"); return; }
    if (a === "export") return exportMine();
    if (a === "import") return $("#importFile").click();
    if (a === "closelist") return S.point ? renderSheet() : renderEmpty();
  }
  const mine = e.target.closest("[data-mine]");
  if (mine) return openMine(mine.dataset.mine);
  const rm = e.target.closest("[data-rmfile]");
  if (rm && draft) { const id = rm.dataset.rmfile; const k = draft.files.findIndex(f => f.id === id); if (k >= 0) draft.files.splice(k, 1); else draft.removed.add(id); return renderFlist(); }
  const drop = e.target.closest(".drop");
  if (drop) return $(drop.id === "drop" ? "#fileIn" : "#fileHere").click();
  const vw = e.target.closest("[data-view]");
  if (vw) { const [g, i] = vw.dataset.view.split(":"); return openViewer(g, +i); }
  const al = e.target.closest("[data-album]");
  if (al) return openAlbum(al.dataset.album);
  const nav = e.target.closest(".nav a");
  if (nav) { e.preventDefault(); const t = $(nav.getAttribute("href")); if (t) { unfold(t); if (isMobile()) setSheet("full"); sheetBody.scrollTo({ top: t.offsetTop - 44 }); } return; }
  const chip = e.target.closest(".chip");
  if (chip) { const k = chip.dataset.cat; S.hiddenCats.has(k) ? S.hiddenCats.delete(k) : S.hiddenCats.add(k); drawFeatures(); renderFeats(); return; }
  const ft = e.target.closest("[data-feat]");
  if (ft) { const f = S.feats.find(x => x.id === ft.dataset.feat); if (f) flyOpen([f.lat, f.lon], f.marker); return; }
  const wk = e.target.closest("[data-wiki]");
  if (wk) { const w = S.wiki[+wk.dataset.wiki]; let m = null; wikiLayer.eachLayer(l => { const p = l.getLatLng(); if (p.lat === w.lat && p.lng === w.lon) m = l; }); flyOpen([w.lat, w.lon], m, 16); return; }
  const qk = e.target.closest("[data-quake]");
  if (qk) {
    const q = S.quakes[+qk.dataset.quake]; quakeLayer.clearLayers();
    const m = L.circleMarker([q.lat, q.lon], { radius: 6 + q.mag * 2, color: magColor(q.mag), weight: 2, fillOpacity: 0.35 })
      .bindPopup(`<b>M${q.mag.toFixed(1)}</b> · ${esc(placeEs(q.place))}<br>${new Date(q.time).toLocaleString("es-VE")}<br>${Math.round(q.depth)} km de profundidad<br><a href="${esc(q.url)}" target="_blank" rel="noopener">Detalle en USGS</a>`).addTo(quakeLayer);
    map.flyToBounds(L.latLngBounds([[S.point.lat, S.point.lon], [q.lat, q.lon]]).pad(0.3), { duration: 0.7, maxZoom: 9 }); setTimeout(() => m.openPopup(), 750); return;
  }
});
sheetBody.addEventListener("keydown", e => { const d = e.target.closest(".drop"); if (d && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); d.click(); } });
sheetBody.addEventListener("change", e => {
  if (e.target.id === "radius") { S.radius = +e.target.value; drawRadius(); loadFeatures(reqId); loadPhotos(reqId); loadTerrain(reqId); map.fitBounds(radiusCircle.getBounds(), { padding: [30, 30] }); }
  if (e.target.id === "fileIn" || e.target.id === "fileHere") { handleFiles(e.target.id === "fileIn" ? "drop" : "here", [...e.target.files]); e.target.value = ""; }
});
sheetBody.addEventListener("submit", e => { if (e.target.id === "placeForm") { e.preventDefault(); savePlace(e.target); } });
function handleFiles(zone, files) {
  if (!files.length) return;
  if (zone === "drop" && draft) addDraftFiles(files); else if (S.custom) addFilesToPlace(S.custom, files);
}
sheetBody.addEventListener("dragover", e => { const d = e.target.closest(".drop"); if (d) { e.preventDefault(); d.classList.add("over"); } });
sheetBody.addEventListener("dragleave", e => { const d = e.target.closest(".drop"); if (d) d.classList.remove("over"); });
sheetBody.addEventListener("drop", e => { const d = e.target.closest(".drop"); if (!d) return; e.preventDefault(); d.classList.remove("over"); handleFiles(d.id === "drop" ? "drop" : "here", [...e.dataTransfer.files]); });
// un archivo soltado fuera de la zona no debe hacer que el navegador abandone la app
["dragover", "drop"].forEach(t => document.addEventListener(t, e => { if (!e.defaultPrevented) e.preventDefault(); }));
$("#importFile").addEventListener("change", e => { const f = e.target.files[0]; if (f) importMine(f); e.target.value = ""; });
$("#btnMine").addEventListener("click", renderMineList);
function flyOpen(ll, marker, z = 17) {
  if (isMobile()) setSheet("peek"); // en el teléfono la ficha se baja para ver el elemento en el mapa
  focusVisible(ll, Math.max(map.getZoom(), z), true);
  if (marker) setTimeout(() => marker.openPopup(), 650);
}
