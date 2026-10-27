// Sin conexión: descargar zonas del mapa (imagen + relieve), ver lo guardado y liberar espacio
"use strict";

// ---------- Zonas descargadas ----------
// Las teselas de una zona van a su propia caché ("zonas-v1"), que el service worker consulta pero nunca recorta.
// No se ofrece el mapa de OpenStreetMap: su política de uso prohíbe la descarga masiva de teselas.
const ZONE_CACHE = "zonas-v1", ZONE_KEY = "rv-zonas", ZONE_MAX = 2500, ZONE_ZMIN = 6, DEM_ZMAX = 14;
const ZONE_BASES = { satelite: "Satélite con nombres", topo: "Relieve topográfico", sombras: "Sombras del relieve" };
const zonesGet = () => { try { return JSON.parse(localStorage.getItem(ZONE_KEY)) || []; } catch (_) { return []; } };
const zonesSet = z => { try { localStorage.setItem(ZONE_KEY, JSON.stringify(z)); } catch (_) {} };
const tileX = (lon, z) => Math.floor((lon + 180) / 360 * 2 ** z);
const tileY = (lat, z) => { const s = Math.sin(lat * rad); return Math.floor((0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 2 ** z); };
// Misma dirección que pide Leaflet (incluido el subdominio a/b/c), para que el service worker la encuentre
function tileURL(layer, x, y, z) { const sd = layer.options.subdomains; return L.Util.template(layer._url, { s: sd[Math.abs(x + y) % sd.length], x, y, z, r: "" }); }
function zoneURLs(zone) {
  const [s, w, n, e] = zone.b, out = new Set();
  const range = (z, add) => { for (let x = tileX(w, z); x <= tileX(e, z); x++) for (let y = tileY(n, z); y <= tileY(s, z); y++) add(x, y); };
  const layers = base[zone.key].getLayers ? base[zone.key].getLayers() : [base[zone.key]];
  for (const l of layers) {
    const native = l.options.maxNativeZoom || l.options.maxZoom;
    for (let z = ZONE_ZMIN; z <= zone.zMax; z++) { const zz = Math.min(z, native); range(zz, (x, y) => out.add(tileURL(l, x, y, zz))); }
  }
  if (zone.dem) for (let z = 8; z <= Math.min(zone.zMax, DEM_ZMAX); z++) range(z, (x, y) => out.add(DEM_URL.replace("{z}", z).replace("{x}", x).replace("{y}", y)));
  return [...out];
}
// Cuenta sin armar las direcciones: se recalcula con cada movimiento del mapa
function zoneCount(zone) {
  const [s, w, n, e] = zone.b, cnt = z => (tileX(e, z) - tileX(w, z) + 1) * (tileY(s, z) - tileY(n, z) + 1);
  const layers = base[zone.key].getLayers ? base[zone.key].getLayers() : [base[zone.key]];
  let total = 0;
  for (const l of layers) {
    const native = l.options.maxNativeZoom || l.options.maxZoom, zs = new Set();
    for (let z = ZONE_ZMIN; z <= zone.zMax; z++) zs.add(Math.min(z, native));
    zs.forEach(z => { total += cnt(z); });
  }
  if (zone.dem) for (let z = 8; z <= Math.min(zone.zMax, DEM_ZMAX); z++) total += cnt(z);
  return total;
}
// Lo que se ve del mapa, sin la parte tapada por la ficha ni el buscador
function visibleBounds() {
  const pad = coverPad(), sz = map.getSize();
  const a = map.containerPointToLatLng([8, isMobile() ? 64 : 8]), b = map.containerPointToLatLng([sz.x - pad.x - 8, sz.y - pad.y - 8]);
  return [Math.max(AREA_BBOX.s, b.lat), Math.max(AREA_BBOX.w, a.lng), Math.min(AREA_BBOX.n, a.lat), Math.min(AREA_BBOX.e, b.lng)].map(v => +v.toFixed(5));
}
const ZOOM_TXT = { 11: "pueblos", 12: "pueblos y vías", 13: "barrios y trochas", 14: "calles", 15: "calles y casas", 16: "edificaciones", 17: "detalle alto", 18: "detalle máximo" };
const fmtMB = b => b >= 1e9 ? `${(b / 1e9).toFixed(1)} GB` : `${Math.max(0.1, b / 1e6).toFixed(1)} MB`;

let zoneRect = null, zoneJob = null;
function showZoneRect() {
  if (S.view !== "offline") { if (zoneRect) { map.removeLayer(zoneRect); zoneRect = null; } return; }
  const [s, w, n, e] = visibleBounds(), ll = [[s, w], [n, e]];
  zoneRect ? zoneRect.setBounds(ll) : (zoneRect = L.rectangle(ll, { color: cssVar("--accent"), weight: 2, dashArray: "6 6", fill: false, interactive: false }).addTo(map));
  renderZoneEstimate();
}
map.on("moveend", () => { if (S.view === "offline" && !zoneJob) showZoneRect(); });

function zoneDraft() {
  const sel = $("#zMax"), key = $("#zLayer"), dem = $("#zDem");
  return { b: visibleBounds(), zMax: sel && sel.value ? +sel.value : Math.min(18, Math.round(map.getZoom()) + 2), key: key ? key.value : (ZONE_BASES[curBaseKey] ? curBaseKey : "satelite"), dem: dem ? dem.checked : true };
}
function renderZoneEstimate() {
  const sel = $("#zMax"); if (!sel) return;
  const d = zoneDraft(), cur = Math.max(10, Math.min(16, Math.round(map.getZoom())));
  const opts = []; let pick = +sel.value || 0;
  for (let z = cur; z <= Math.min(18, cur + 4); z++) {
    const n = zoneCount({ ...d, zMax: z });
    opts.push({ z, n, ok: n <= ZONE_MAX });
  }
  if (!opts.some(o => o.z === pick && o.ok)) pick = (opts.filter(o => o.ok && o.z <= cur + 2).pop() || opts[0]).z; // por defecto: dos niveles más que el actual
  sel.innerHTML = opts.map(o => `<option value="${o.z}" ${o.z === pick ? "selected" : ""} ${o.ok ? "" : "disabled"}>Zoom ${o.z} · ${ZOOM_TXT[o.z] || ""} · ${fmtNum(o.n)} teselas${o.ok ? "" : " (demasiadas)"}</option>`).join("");
  const n = zoneCount({ ...d, zMax: pick }), ok = n <= ZONE_MAX;
  const [s, w, nn, e] = d.b, km = (a, b) => (dist(a, b) / 1000).toFixed(1);
  $("#zEst").innerHTML = ok
    ? `Zona de ${km({ lat: s, lon: w }, { lat: s, lon: e })} × ${km({ lat: s, lon: w }, { lat: nn, lon: w })} km · unas ${fmtNum(n)} teselas, aprox. ${fmtMB(n * 18e3)}.`
    : `<span style="color:var(--warn)">La zona es muy grande (${fmtNum(n)} teselas). Acerca el mapa al área que necesitas.</span>`;
  $("#zGo").disabled = !ok || !!zoneJob;
}

async function downloadZone() {
  const d = zoneDraft(), urls = zoneURLs(d);
  if (!urls.length || urls.length > ZONE_MAX) return;
  if (offline()) { toast("Necesitas conexión para descargar la zona"); return; }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  const ctl = new AbortController(), cache = await caches.open(ZONE_CACHE);
  zoneJob = { ctl, done: 0, fail: 0, bytes: 0, total: urls.length };
  renderZoneEstimate(); drawZoneProgress();
  let i = 0;
  const worker = async () => {
    while (i < urls.length && !ctl.signal.aborted) {
      const u = urls[i++];
      try {
        if (!(await cache.match(u))) {
          const r = await fetch(u + (u.includes("?") ? "&" : "?") + "rvzona=1", { mode: "cors", credentials: "omit", signal: ctl.signal });
          // 404: Esri no tiene imagen a ese nivel; el mapa amplía la del nivel anterior, que sí se guarda
          if (r.status !== 404) {
            if (!r.ok) throw new Error(r.status);
            const blob = await r.blob(); zoneJob.bytes += blob.size;
            await cache.put(u, new Response(blob, { headers: { "Content-Type": r.headers.get("Content-Type") || blob.type || "image/png" } }));
          }
        }
        zoneJob.done++;
      } catch (_) { if (!ctl.signal.aborted) zoneJob.fail++; }
      if ((zoneJob.done + zoneJob.fail) % 10 === 0) drawZoneProgress();
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker)); // 4 descargas a la vez: rápido sin abusar de los servidores
  const job = zoneJob; zoneJob = null;
  if (!ctl.signal.aborted && job.done) {
    const inZone = S.point && S.point.lat >= d.b[0] && S.point.lat <= d.b[2] && S.point.lon >= d.b[1] && S.point.lon <= d.b[3];
    const name = (inZone && S.name) || `Zona ${((d.b[0] + d.b[2]) / 2).toFixed(3)}, ${((d.b[1] + d.b[3]) / 2).toFixed(3)}`;
    zonesSet([{ id: uid(), name, ...d, n: job.done, bytes: job.bytes, t: Date.now() }, ...zonesGet()]);
    toast(job.fail ? `Zona guardada (${job.fail} teselas no se pudieron bajar)` : "Zona guardada para usar sin conexión");
  } else if (ctl.signal.aborted) toast("Descarga cancelada");
  if (S.view === "offline") renderOffline(); else drawZoneProgress();
}
function drawZoneProgress() {
  const el = $("#zProg"); if (!el) return;
  if (!zoneJob) { el.innerHTML = ""; return; }
  const k = (zoneJob.done + zoneJob.fail) / zoneJob.total;
  el.innerHTML = `<div class="bar"><i style="width:${(k * 100).toFixed(1)}%"></i></div>
    <div class="src">${fmtNum(zoneJob.done)} de ${fmtNum(zoneJob.total)} teselas · ${fmtMB(zoneJob.bytes)}${zoneJob.fail ? ` · ${zoneJob.fail} fallidas` : ""} <button class="copy" data-z="cancel">Cancelar</button></div>`;
}
async function deleteZone(id) {
  const all = zonesGet(), z = all.find(x => x.id === id); if (!z) return;
  const rest = all.filter(x => x.id !== id), keep = new Set(rest.flatMap(zoneURLs)); // no se borra lo que otra zona también usa
  const cache = await caches.open(ZONE_CACHE);
  await Promise.all(zoneURLs(z).filter(u => !keep.has(u)).map(u => cache.delete(u)));
  zonesSet(rest); toast("Zona borrada"); renderOffline();
}

// ---------- Panel "Sin conexión" ----------
async function renderOffline() {
  S.view = "offline"; setSheet("half", "Sin conexión");
  const zones = zonesGet(), st = await respDB.stats();
  let quota = "";
  try {
    const e = await navigator.storage.estimate(), p = navigator.storage.persisted ? await navigator.storage.persisted() : false;
    quota = `Usado ${fmtMB(e.usage || 0)} de ${fmtMB(e.quota || 0)} disponibles.${p ? " El navegador no borrará estos datos por falta de espacio." : ""}`;
  } catch (_) {}
  if (S.view !== "offline") return;
  const rows = zones.map(z => `<div class="zrow"><span><b>${esc(z.name)}</b><span>${esc(ZONE_BASES[z.key] || z.key)}${z.dem ? " + relieve" : ""} · zoom ${z.zMax} · ${fmtNum(z.n)} teselas · ${fmtMB(z.bytes)} · ${fmtDate(z.t)}</span></span>
    <span class="zbtns"><button class="copy" data-z="view" data-id="${esc(z.id)}">Ver</button><button class="copy" data-z="del" data-id="${esc(z.id)}">Borrar</button></span></div>`).join("");
  const baseOpt = ZONE_BASES[curBaseKey] ? curBaseKey : "satelite";
  sheetBody.innerHTML = `<div class="empty-sheet" style="padding-bottom:10px"><h2>Sin conexión</h2>
      <p>${offline() ? "<b>Ahora no hay conexión.</b> " : ""}La app abre sin internet. El mapa muestra las zonas que ya viste o descargaste, y cada ficha que abres queda guardada con su clima, terreno, entorno y fotos.</p>
      <div class="actions" style="padding:0"><button class="btn" data-act="closelist">Cerrar</button></div></div>
    <section class="blk" id="z-nueva"><h3>Descargar esta zona <small>el recuadro azul del mapa</small></h3>
      <div class="form">
        <label>Mapa<select id="zLayer">${Object.entries(ZONE_BASES).map(([k, t]) => `<option value="${k}" ${k === baseOpt ? "selected" : ""}>${t}</option>`).join("")}</select></label>
        <label>Detalle máximo<select id="zMax"></select></label>
        <label class="chk"><input type="checkbox" id="zDem" checked> Incluir relieve: altitudes, perfiles, pendientes y vista 3D</label>
        <p class="src" id="zEst" style="margin:0"></p>
        <div><button class="btn primary" id="zGo" data-z="go">Descargar zona</button></div>
        <div id="zProg"></div>
      </div>
      <p class="src" style="margin-top:10px">Mueve o acerca el mapa para cambiar el recuadro. El mapa de calles (OpenStreetMap) no se puede descargar por su política de uso, pero sí guarda lo que ya viste.</p></section>
    <section class="blk"><h3>Zonas guardadas <small>${zones.length}</small></h3>${rows || `<p class="src">Todavía no has descargado zonas.</p>`}</section>
    <section class="blk"><h3>Fichas guardadas</h3><p class="src" style="margin:0 0 8px">${fmtNum(st.n)} consultas guardadas (${fmtMB(st.bytes)}): direcciones, clima, terreno, entorno, fotos y Wikipedia de los puntos que abriste.</p>
      <button class="copy" data-z="clearresp" ${st.n ? "" : "disabled"}>Borrar fichas guardadas</button>
      <p class="src" style="margin-top:10px">Tus lugares, fotos y PDF de <b>Mis lugares</b> siempre están disponibles sin conexión.</p></section>
    <section class="blk"><h3>Almacenamiento</h3><p class="src" style="margin:0">${quota || "Este navegador no informa el espacio disponible."}</p></section>`;
  sheetBody.scrollTop = 0;
  showZoneRect(); drawZoneProgress();
}
$("#btnOffline").addEventListener("click", () => {
  if (S.view !== "offline") return renderOffline();
  if (S.point) { renderSheet(); setSheet("half"); } else renderEmpty();
});
sheetBody.addEventListener("click", async e => {
  const b = e.target.closest("[data-z]"); if (!b) return;
  const k = b.dataset.z;
  if (k === "go") return downloadZone();
  if (k === "cancel") { if (zoneJob) zoneJob.ctl.abort(); return; }
  if (k === "del") return deleteZone(b.dataset.id);
  if (k === "view") { const z = zonesGet().find(x => x.id === b.dataset.id); if (z) fitVisible(L.latLngBounds([[z.b[0], z.b[1]], [z.b[2], z.b[3]]])); return; }
  if (k === "clearresp") { if (confirm("¿Borrar las fichas guardadas? Las zonas del mapa y Mis lugares no se tocan.")) { await respDB.clear(); toast("Fichas guardadas borradas"); renderOffline(); } }
});
sheetBody.addEventListener("change", e => { if (["zLayer", "zMax", "zDem"].includes(e.target.id)) renderZoneEstimate(); });
// Al salir del panel se quita el recuadro
new MutationObserver(() => { if (S.view !== "offline" && zoneRect) { map.removeLayer(zoneRect); zoneRect = null; } }).observe(sheetBody, { childList: true });
