// Visor a pantalla completa de fotos y PDF
"use strict";

// ---------- Visor de fotos y PDF ----------
function viewItems(g) {
  if (g === "m") return myFiles(S.custom).map(f => ({ pdf: f.type === "application/pdf", src: fileURL(f), thumb: f.thumb ? fileURL(f, true) : f.type.startsWith("image/") ? fileURL(f) : null,
    title: f.name, open: fileURL(f), meta: `<b>${esc(f.name)}</b><br>${fmtSize(f.size)} · agregado el ${fmtDate(f.created)} · archivo propio` }));
  return S.photos.map(p => ({ src: commonsFile(p.title, 1600), thumb: p.thumb, title: p.name, open: p.page,
    cap: `${p.d != null ? `<b>${fmtDist(p.d)}</b>` : ""}${esc(p.name)}`,
    meta: `<b>${esc(p.name)}</b>${p.desc && p.desc !== p.name ? `<br>${esc(p.desc)}` : ""}<br>${esc(p.author)}${p.license ? ` · ${esc(p.license)}` : ""}${p.date ? ` · ${esc(p.date)}` : ""}${p.d != null ? ` · a ${fmtDist(p.d)} del punto` : ""} · <a href="${esc(p.page)}" target="_blank" rel="noopener">Ver en Commons</a>` }));
}
const lb = { items: [], i: 0 };
function openViewer(g, i) {
  lb.items = viewItems(g); if (!lb.items.length) return;
  $("#lbStrip").innerHTML = lb.items.length > 1 ? lb.items.map((it, k) => `<button data-k="${k}" aria-label="${esc(it.title)}">${it.thumb ? `<img src="${esc(it.thumb)}" alt="" loading="lazy">` : "PDF"}</button>`).join("") : "";
  $("#lightbox").hidden = false; showLb(i);
}
function showLb(i) {
  const n = lb.items.length; lb.i = (i + n) % n;
  const it = lb.items[lb.i], st = $("#lbStage");
  st.querySelectorAll("img, iframe").forEach(x => x.remove());
  st.prepend(it.pdf ? Object.assign(document.createElement("iframe"), { src: it.src, title: it.title }) : Object.assign(document.createElement("img"), { src: it.src, alt: it.title }));
  $("#lbCount").textContent = `${lb.i + 1} / ${n}`; $("#lbTitle").textContent = it.title; $("#lbOpen").href = it.open; $("#lbMeta").innerHTML = it.meta;
  $("#lbPrev").hidden = $("#lbNext").hidden = n < 2;
  $("#lbStrip").querySelectorAll("button").forEach((b, k) => b.setAttribute("aria-current", k === lb.i));
  const cur = $("#lbStrip").children[lb.i]; if (cur) cur.scrollIntoView({ block: "nearest", inline: "center" });
}
function closeViewer() { $("#lightbox").hidden = true; $("#lbStage").querySelectorAll("img, iframe").forEach(x => x.remove()); }
function openAlbum(g) {
  const items = viewItems(g);
  $("#albumTitle").textContent = `${g === "m" ? "Mis archivos" : "Fotos de Wikimedia Commons"} · ${items.length}`;
  $("#albumGrid").innerHTML = items.map((it, i) => tile(g, i, it)).join("");
  $("#album").hidden = false;
}
$("#albumGrid").addEventListener("click", e => { const v = e.target.closest("[data-view]"); if (v) { const [g, i] = v.dataset.view.split(":"); openViewer(g, +i); } });
$("#albumClose").onclick = () => { $("#album").hidden = true; };
$("#lbClose").onclick = closeViewer;
$("#lbPrev").onclick = () => showLb(lb.i - 1);
$("#lbNext").onclick = () => showLb(lb.i + 1);
$("#lbStrip").addEventListener("click", e => { const b = e.target.closest("button[data-k]"); if (b) showLb(+b.dataset.k); });
$("#lightbox").addEventListener("click", e => { if (e.target.id === "lbStage") closeViewer(); });
document.addEventListener("keydown", e => {
  const open = !$("#lightbox").hidden;
  if (e.key === "Escape") { resultsEl.hidden = true; if (open) closeViewer(); else $("#album").hidden = true; }
  if (open && e.key === "ArrowLeft") showLb(lb.i - 1);
  if (open && e.key === "ArrowRight") showLb(lb.i + 1);
});
