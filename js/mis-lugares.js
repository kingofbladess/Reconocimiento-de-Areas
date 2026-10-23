// Mis lugares: guardar puntos con fotos y PDF en el navegador
"use strict";

// ---------- Mis lugares: se guardan en este navegador (IndexedDB) con sus fotos y PDF ----------
const MYCATS = {
  puente: { label: "Puente", color: "--c-puente" }, agua: { label: "Río / cuerpo de agua", color: "--c-agua" },
  naturaleza: { label: "Naturaleza", color: "--c-naturaleza" }, estructura: { label: "Estructura / edificación", color: "--c-estructura" },
  acceso: { label: "Vía / acceso", color: "--c-servicio" }, interes: { label: "Punto de interés", color: "--c-interes" }, otro: { label: "Otro", color: "--accent" },
};
const catOf = p => MYCATS[p.cat] || MYCATS.otro;
const IMG_OK = /^image\/(jpeg|png|webp|gif)$/;
const store = (() => {
  let dbp = null;
  const open = () => dbp || (dbp = new Promise((res, rej) => {
    const r = indexedDB.open("reconocimiento-ve", 1);
    r.onupgradeneeded = () => { r.result.createObjectStore("places", { keyPath: "id" }); r.result.createObjectStore("files", { keyPath: "id" }); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const run = async (name, mode, fn) => { const db = await open(); return new Promise((res, rej) => {
    const tx = db.transaction(name, mode), req = fn(tx.objectStore(name));
    tx.oncomplete = () => res(req.result); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error); }); };
  return { all: n => run(n, "readonly", s => s.getAll()), put: (n, v) => run(n, "readwrite", s => s.put(v)), del: (n, k) => run(n, "readwrite", s => s.delete(k)) };
})();
const MY = { places: [], files: new Map(), urls: new Map(), ok: true, err: "" };
const myFiles = p => ((p && p.files) || []).map(id => MY.files.get(id)).filter(Boolean);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const fmtSize = b => b < 1e6 ? `${Math.max(1, Math.round(b / 1e3))} KB` : `${(b / 1e6).toFixed(1)} MB`;
const fmtDate = ts => new Date(ts).toLocaleDateString("es-VE", { day: "numeric", month: "short", year: "numeric" });
function fileURL(f, thumb) {
  const k = f.id + (thumb && f.thumb ? ":t" : "");
  if (!MY.urls.has(k)) MY.urls.set(k, URL.createObjectURL(thumb && f.thumb ? f.thumb : f.blob));
  return MY.urls.get(k);
}
async function loadMine() {
  try {
    const [pl, fl] = await Promise.all([store.all("places"), store.all("files")]);
    MY.places = pl.sort((a, b) => b.updated - a.updated); MY.files = new Map(fl.map(f => [f.id, f])); MY.ok = true;
  } catch (e) { MY.ok = false; MY.err = (e && e.message) || String(e); }
  drawMine();
}
const myLayer = L.layerGroup().addTo(map);
function drawMine() {
  myLayer.clearLayers();
  for (const p of MY.places) {
    const icon = L.divIcon({ className: "", html: `<div class="mypin" style="background:var(${catOf(p).color});color:#fff">${esc((p.name || "?").trim().charAt(0).toUpperCase())}</div>`, iconSize: [26, 26], iconAnchor: [13, 13] });
    L.marker([p.lat, p.lon], { icon, title: p.name, zIndexOffset: 500 }).on("click", () => openMine(p.id)).addTo(myLayer);
  }
  $("#mineCount").textContent = MY.places.length || "";
}
function openMine(id) {
  const p = MY.places.find(x => x.id === id); if (!p) return;
  if (S.point && dist(S.point, p) < 3 && S.view !== "empty") { S.custom = p; renderSheet(); map.setView([p.lat, p.lon], Math.max(map.getZoom(), 15)); return; }
  selectPoint(p.lat, p.lon, { custom: p, zoom: 16, force: true });
}
async function shrink(file, max, q = 0.85) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height)), c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height); if (bmp.close) bmp.close();
  return new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error("no se pudo procesar la imagen")), "image/jpeg", q));
}
async function makeFileRec(file, placeId) {
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name), isImg = IMG_OK.test(file.type);
  if (!isImg && !isPdf) throw new Error(`${file.name}: solo se admiten fotos JPG, PNG, WebP o GIF y documentos PDF`);
  if (file.size > 40e6) throw new Error(`${file.name}: supera 40 MB`);
  const rec = { id: uid(), placeId, name: file.name, type: isPdf ? "application/pdf" : file.type, created: Date.now() };
  if (isPdf) rec.blob = new Blob([file], { type: "application/pdf" });
  else {
    // fotos grandes se reducen a 2400 px para no llenar el almacenamiento; miniatura de 640 px para la galería
    rec.blob = file.size > 1.5e6 && file.type !== "image/gif" ? await shrink(file, 2400) : file;
    rec.type = rec.blob.type || file.type;
    rec.thumb = await shrink(file, 640, 0.8).catch(() => null);
  }
  rec.size = rec.blob.size;
  return rec;
}

let draft = null; // formulario abierto: { pl, files: [nuevos], removed: Set }
function renderForm(pl) {
  S.view = "form"; setSheet("full", "Agregar a mis lugares");
  const p = S.place, base = pl || { name: S.title || (p && p.name) || "", cat: "otro", desc: "", notes: "", lat: S.point.lat, lon: S.point.lon };
  draft = { pl, files: [], removed: new Set() };
  sheetBody.innerHTML = `<div class="empty-sheet" style="padding-bottom:6px"><h2>${pl ? "Editar lugar" : "Agregar a mis lugares"}</h2>
    <p>Se guarda en este navegador junto con sus fotos y PDF. Para pasarlo a otro equipo usa “Exportar” en Mis lugares.</p></div>
    <form class="form blk" id="placeForm" style="border:0;padding-top:0">
      <label>Nombre<input name="name" required maxlength="120" value="${esc(base.name)}" placeholder="Ej.: Puente sobre el río Caroní"></label>
      <label>Categoría<select name="cat">${Object.entries(MYCATS).map(([k, c]) => `<option value="${k}" ${k === base.cat ? "selected" : ""}>${c.label}</option>`).join("")}</select></label>
      <div class="two"><label>Latitud<input name="lat" inputmode="decimal" value="${(+base.lat).toFixed(6)}"></label><label>Longitud<input name="lon" inputmode="decimal" value="${(+base.lon).toFixed(6)}"></label></div>
      <label>Descripción<textarea name="desc" maxlength="4000" placeholder="Qué es, para qué sirve, cómo se llega">${esc(base.desc)}</textarea></label>
      <label>Notas de reconocimiento<textarea name="notes" maxlength="8000" placeholder="Estado, accesos, riesgos, fecha de la visita, observaciones">${esc(base.notes)}</textarea></label>
      <div><div class="sub" style="margin-top:0">Fotos y documentos PDF</div>
        <div class="drop" id="drop" tabindex="0" role="button"><b>Elige archivos</b> o arrástralos aquí<br><small>Fotos JPG, PNG o WebP y PDF · hasta 40 MB cada uno</small></div>
        <input type="file" id="fileIn" multiple accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,.pdf" hidden>
        <div class="flist" id="flist" style="margin-top:10px"></div></div>
      <div class="actions" style="padding:4px 0 0"><button class="btn primary" type="submit">Guardar</button><button class="btn" type="button" data-act="cancel">Cancelar</button>
        ${pl ? `<button class="btn danger" type="button" data-act="delete" style="margin-left:auto">Eliminar lugar</button>` : ""}</div>
    </form>`;
  sheetBody.scrollTop = 0; renderFlist();
}
function renderFlist() {
  const el = $("#flist"); if (!el || !draft) return;
  const all = [...myFiles(draft.pl).filter(f => !draft.removed.has(f.id)).map(f => [f, false]), ...draft.files.map(f => [f, true])];
  el.innerHTML = all.length ? all.map(([f, nuevo]) => { const img = f.type.startsWith("image/");
    return `<div class="fitem"><span class="th" style="${img ? `background-image:url('${fileURL(f, true)}')` : ""}">${img ? "" : "PDF"}</span>
      <span>${esc(f.name)}<br><small class="src">${fmtSize(f.size)}${nuevo ? " · nuevo" : ""}</small></span><button class="copy" type="button" data-rmfile="${esc(f.id)}">Quitar</button></div>`; }).join("")
    : `<p class="src" style="margin:0">Todavía no hay archivos.</p>`;
}
async function addDraftFiles(list) {
  const errs = []; toast("Procesando archivos…");
  for (const f of list) { try { draft.files.push(await makeFileRec(f, null)); } catch (e) { errs.push(e.message); } }
  renderFlist(); if (errs.length) toast(errs.join(" · "));
}
async function savePlace(form) {
  const fd = new FormData(form), num = k => parseFloat(String(fd.get(k)).replace(",", "."));
  const lat = num("lat"), lon = num("lon");
  if (!isFinite(lat) || !isFinite(lon) || !inVenezuela(lat, lon)) { toast("Las coordenadas deben estar dentro de Venezuela."); return; }
  const now = Date.now(), old = draft.pl;
  const pl = { ...(old || { id: uid(), created: now }), name: String(fd.get("name")).trim() || "Sin nombre", cat: String(fd.get("cat")),
    desc: String(fd.get("desc")).trim(), notes: String(fd.get("notes")).trim(), lat, lon, updated: now };
  pl.files = ((old && old.files) || []).filter(id => !draft.removed.has(id)).concat(draft.files.map(f => f.id));
  try {
    for (const f of draft.files) { f.placeId = pl.id; await store.put("files", f); MY.files.set(f.id, f); }
    for (const id of draft.removed) { await store.del("files", id); MY.files.delete(id); }
    await store.put("places", pl);
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  } catch (e) { toast(`No se pudo guardar (${(e && e.message) || e}). Puede que el navegador no tenga espacio.`); return; }
  MY.places = [pl, ...MY.places.filter(x => x.id !== pl.id)];
  drawMine(); draft = null; toast("Lugar guardado");
  openMine(pl.id);
}
async function deletePlace(pl) {
  if (!confirm(`¿Eliminar “${pl.name}” y sus ${pl.files.length} archivos? No se puede deshacer.`)) return;
  try {
    for (const id of pl.files) { await store.del("files", id); MY.files.delete(id); }
    await store.del("places", pl.id);
  } catch (e) { toast("No se pudo eliminar: " + ((e && e.message) || e)); return; }
  MY.places = MY.places.filter(x => x.id !== pl.id); drawMine(); draft = null;
  S.custom = null; toast("Lugar eliminado"); S.point ? renderSheet() : renderMineList();
}
async function addFilesToPlace(pl, list) {
  const errs = []; let n = 0; toast("Guardando archivos…");
  for (const f of list) {
    try { const rec = await makeFileRec(f, pl.id); await store.put("files", rec); MY.files.set(rec.id, rec); pl.files.push(rec.id); n++; }
    catch (e) { errs.push(e.message); }
  }
  pl.updated = Date.now();
  try { await store.put("places", pl); } catch (e) { errs.push(e.message); }
  drawMine(); renderHead(); renderNav(); renderFiles();
  toast(errs.length ? errs.join(" · ") : `${n} archivo${n === 1 ? "" : "s"} guardado${n === 1 ? "" : "s"}`);
}
function renderMineList() {
  S.view = "list"; setSheet("half", "Mis lugares");
  const rows = MY.places.map(p => { const im = myFiles(p).find(f => f.type.startsWith("image/")), n = p.files.length;
    return `<button class="mrow" data-mine="${esc(p.id)}"><span class="th" style="${im ? `background-image:url('${fileURL(im, true)}')` : ""}"></span>
      <span><b>${esc(p.name)}</b><span>${esc(catOf(p).label)} · ${n} archivo${n === 1 ? "" : "s"} · ${fmtDate(p.updated)}</span></span>
      <span class="src" style="font-family:var(--f-mono)">${p.lat.toFixed(3)}<br>${p.lon.toFixed(3)}</span></button>`; }).join("");
  sheetBody.innerHTML = `<div class="empty-sheet" style="padding-bottom:12px"><h2>Mis lugares</h2><p>Lugares que agregaste, con sus fotos, PDF y notas. Se guardan en este navegador.</p>
    <div class="actions" style="padding:0"><button class="btn primary" data-act="new">Agregar lugar</button><button class="btn" data-act="export" ${MY.places.length ? "" : "disabled"}>Exportar</button>
      <button class="btn" data-act="import">Importar</button><button class="btn" data-act="closelist" style="margin-left:auto">Cerrar</button></div></div>
    <section class="blk" style="padding-top:0">${!MY.ok ? `<div class="err">Este navegador no permite guardar datos en esta página (${esc(MY.err)}).</div>`
      : rows || `<p class="src">Aún no tienes lugares. Toca “Agregar lugar” y luego el punto en el mapa, o abre la ficha de cualquier punto y usa “Guardar como mi lugar”.</p>`}</section>`;
  sheetBody.scrollTop = 0;
}
const toDataURL = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(b); });
function fromDataURL(u, type) {
  const bin = atob(String(u).split(",")[1] || ""), arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type });
}
async function exportMine() {
  toast("Preparando el respaldo…");
  const files = [];
  for (const p of MY.places) for (const f of myFiles(p))
    files.push({ id: f.id, placeId: p.id, name: f.name, type: f.type, size: f.size, created: f.created, data: await toDataURL(f.blob), thumb: f.thumb ? await toDataURL(f.thumb) : null });
  const out = new Blob([JSON.stringify({ app: "reconocimiento-venezuela", version: 1, exported: new Date().toISOString(), places: MY.places, files })], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(out); a.download = `mis-lugares-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
async function importMine(file) {
  try {
    const d = JSON.parse(await file.text());
    if (!d || !Array.isArray(d.places)) throw new Error("el archivo no es un respaldo de Mis lugares");
    for (const f of d.files || []) {
      const type = IMG_OK.test(f.type) ? f.type : "application/pdf"; // solo fotos o PDF, nunca HTML ni SVG
      const rec = { id: String(f.id), placeId: String(f.placeId), name: String(f.name || "archivo"), type, created: +f.created || Date.now(),
        blob: fromDataURL(f.data, type), thumb: f.thumb && type !== "application/pdf" ? fromDataURL(f.thumb, "image/jpeg") : null };
      rec.size = rec.blob.size; await store.put("files", rec);
    }
    let n = 0;
    for (const p of d.places) {
      if (!isFinite(+p.lat) || !isFinite(+p.lon)) continue;
      await store.put("places", { id: String(p.id), name: String(p.name || "Sin nombre"), cat: MYCATS[p.cat] ? p.cat : "otro", desc: String(p.desc || ""), notes: String(p.notes || ""),
        lat: +p.lat, lon: +p.lon, created: +p.created || Date.now(), updated: +p.updated || Date.now(), files: (p.files || []).map(String) });
      n++;
    }
    await loadMine(); renderMineList(); toast(`Importados ${n} lugar${n === 1 ? "" : "es"}`);
  } catch (e) { toast("No se pudo importar: " + ((e && e.message) || e)); }
}
