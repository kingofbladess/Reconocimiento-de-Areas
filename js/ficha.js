// Dibujo de la ficha lateral y sus secciones
"use strict";

// ---------- Render de la ficha ----------
const sheetBody = $("#sheetScroll");
function renderEmpty() {
  S.view = "empty";
  sheetBody.innerHTML = `<div class="hero small"><div class="shade"></div><div class="cap"><h2>Explora Venezuela</h2><p>Venezuela y Guyana, del Caribe a la Gran Sabana y el Esequibo.</p></div></div>
    <div class="empty-sheet"><h2>¿Cómo se usa?</h2><p>Elige un punto en Venezuela o Guyana y verás su ficha completa.</p>
    <ol><li>Busca por nombre o pega coordenadas, por ejemplo <b>10.5061, -66.9146</b>.</li><li>O toca un lugar destacado, o cualquier punto del mapa.</li><li>Revisa terreno, clima, fotos, historia, puentes, ríos y todo lo que hay alrededor.</li>
    <li>Guarda tus propios lugares con fotos y PDF desde <b>Mis lugares</b>.</li>
    <li>Antes de salir a campo, descarga la zona con <b>Sin conexión</b> para tener mapa, relieve y fichas sin señal.</li></ol></div>`;
  setSheet("peek", "Explora Venezuela · ver cómo se usa");
}
function renderSheet() {
  S.view = "point";
  sheetBody.innerHTML = `
    <div id="head"></div>
    <nav class="nav" id="nav"></nav>
    <section class="blk" id="s-archivos" hidden></section>
    <section class="blk" id="s-coords"></section>
    <section class="blk" id="s-terreno"></section>
    <section class="blk" id="s-clima"></section>
    <section class="blk" id="s-fotos"></section>
    <section class="blk" id="s-redes"></section>
    <section class="blk" id="s-cerca"></section>
    <section class="blk" id="s-entorno"></section>`;
  sheetBody.scrollTop = 0;
  applyFolds();
  renderHead(); renderNav(); renderFiles(); renderCoords(); renderTerrain(); renderWeather(); renderPhotos(); renderSocial(); renderWiki(); renderFeats();
}
function renderNav() {
  const n = v => v ? `<span class="n">${v}</span>` : "";
  const el = $("#nav"); if (!el) return;
  el.innerHTML = (S.custom ? `<a href="#s-archivos">Mis archivos${n(S.custom.files.length)}</a>` : "")
    + `<a href="#s-coords">Coordenadas</a><a href="#s-terreno">Terreno</a><a href="#s-clima">Clima</a><a href="#s-fotos">Fotos${n(S.photos.length)}</a><a href="#s-redes">Redes${n(socialCount())}</a><a href="#s-cerca">Cerca${n(S.wiki.length)}</a><a href="#s-entorno">Entorno${n(S.feats.length)}</a>`;
}
function renderHead() {
  scheduleRecon();
  const el = $("#head"); if (!el) return;
  const p = S.place, ad = adminOf(p), info = S.info, my = S.custom;
  const name = (my && my.name) || S.title || (p && (p.name || (p.display_name || "").split(",")[0])) || "Punto seleccionado";
  S.name = name; setPeek(name);
  const line = [ad.sector, ad.localidad, ad.municipio, ad.estado].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(" · ");
  const myImg = my && myFiles(my).find(f => f.type.startsWith("image/"));
  let img = null, credit = "";
  if (myImg) { img = fileURL(myImg); credit = `<span class="credit">Foto propia</span>`; }
  else if (info && info.image) { img = info.image; credit = `<a class="credit" href="${esc(info.url)}" target="_blank" rel="noopener">${esc(info.source)}</a>`; }
  else if (S.photos[0]) { img = S.photos[0].thumb.replace(/\/\d+px-/, "/900px-"); credit = `<a class="credit" href="${esc(S.photos[0].page)}" target="_blank" rel="noopener">Foto: ${esc(S.photos[0].author)}</a>`; }
  else if (S.wiki[0] && S.wiki[0].thumb) img = S.wiki[0].thumb;
  const wiki = S.busy.info ? `<div class="loading">Buscando información del lugar…</div>`
    : info ? `${info.description ? `<p class="src" style="margin:0 0 6px">${esc(info.description)}</p>` : ""}<p class="summary">${esc(info.extract || "Sin resumen disponible.")}</p>
      ${info.facts.length ? `<div class="facts">${info.facts.map(([k, v]) => `<div class="fact"><small>${esc(k)}</small><b>${esc(v)}</b></div>`).join("")}</div>` : ""}
      <p class="src" style="margin-top:10px">Fuente: <a href="${esc(info.url)}" target="_blank" rel="noopener">${esc(info.title)}</a> en ${esc(info.source)}${info.web ? ` · <a href="${esc(info.web)}" target="_blank" rel="noopener">sitio oficial</a>` : ""}</p>`
    : S.errs.info ? `<p class="summary" style="color:var(--muted)">No se pudo consultar Wikipedia ni Wikidata para este lugar.</p>${errBox("info", S.errs.info)}`
    : my ? "" : `<p class="summary" style="color:var(--muted)">No hay un artículo de Wikipedia sobre este punto exacto. Revisa “Cerca” para ver lugares documentados en los alrededores.</p>`;
  const about = my ? `<p class="src" style="margin:0 0 6px">${esc(catOf(my).label)} · guardado por ti · actualizado el ${fmtDate(my.updated)}</p>
      ${my.desc ? `<p class="summary">${esc(my.desc)}</p>` : ""}${my.notes ? `<div class="sub">Notas de reconocimiento</div><p class="notes">${esc(my.notes)}</p>` : ""}
      ${wiki ? `<div class="sub">Según Wikipedia</div>${wiki}` : ""}` : wiki;
  const acts = `<button class="btn go" data-act="analyze" title="Reporte operativo del área con toda la información reunida"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>Analizar</button>`
    + `<button class="btn" data-act="view3d" title="Ver el terreno en 3D (tecla 3)"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m2 20 7-12 4 6 3-4 6 10z"/></svg>3D</button>`
    + (my ? `<button class="btn" data-act="edit">Editar lugar</button><button class="btn" data-act="addfiles">Subir fotos o PDF</button>`
      : `<button class="btn" data-act="save">Guardar como mi lugar</button>`);
  el.innerHTML = `
    <div class="hero">${img ? `<img src="${esc(img)}" alt="${esc(name)}" onerror="this.remove()">` : ""}<div class="shade"></div>${credit}
      <button class="close" id="closeSheet" aria-label="Cerrar ficha">✕</button>
      <div class="cap"><h2>${my ? "★ " : ""}${esc(name)}</h2><p>${esc(line || (p ? p.display_name : "Buscando dirección…"))}</p></div></div>
    ${NET.staleAt ? `<div class="stale">Sin conexión: datos guardados el ${new Date(NET.staleAt).toLocaleString("es-VE", { dateStyle: "medium", timeStyle: "short" })} (pueden no estar al día)</div>` : ""}
    <div class="actions">${acts}<button class="btn" data-act="share">Copiar enlace</button></div>
    ${S.recon ? `<section class="blk recon" id="s-recon"></section>` : ""}
    <section class="blk" id="s-resumen"><h3>${my ? "Mi lugar" : "Sobre este lugar"}</h3>${about}</section>`;
  renderSocial(); // el nombre del lugar y sus cuentas pueden haber cambiado
}
function fmtOffset(s) { const sg = s < 0 ? "-" : "+"; s = Math.abs(s); return `${sg}${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor(s % 3600 / 60)).padStart(2, "0")}`; }
function renderCoords() {
  const el = $("#s-coords"); if (!el) return;
  const { lat, lon } = S.point, ad = adminOf(S.place);
  const dec = `${lat.toFixed(6)}, ${lon.toFixed(6)}`, dms = `${toDMS(lat, "N", "S")} ${toDMS(lon, "E", "O")}`, utm = toUTM(lat, lon);
  const ev = S.weather && S.weather.elevation != null ? S.weather.elevation : S.terrain ? S.terrain.e0 : null;
  const elev = ev != null ? `${fmtNum(Math.round(ev))} m s. n. m.` : S.errs.weather && S.errs.terrain ? "Sin dato" : "…";
  el.innerHTML = `<h3>Ubicación exacta <small>WGS84</small></h3><dl>
    <div class="kv"><dt>Decimal</dt><dd>${dec}</dd><button class="copy" data-copy="${dec}">Copiar</button></div>
    <div class="kv"><dt>GMS</dt><dd>${dms}</dd><button class="copy" data-copy="${esc(dms)}">Copiar</button></div>
    <div class="kv"><dt>UTM</dt><dd>${utm}</dd><button class="copy" data-copy="${utm}">Copiar</button></div>
    <div class="kv"><dt>Altitud</dt><dd>${elev}</dd><span></span></div>
    <div class="kv"><dt>Estado</dt><dd>${esc(ad.estado || "—")}</dd><span></span></div>
    <div class="kv"><dt>Municipio</dt><dd>${esc(ad.municipio || "—")}</dd><span></span></div>
    ${ad.localidad ? `<div class="kv"><dt>Localidad</dt><dd>${esc(ad.localidad)}</dd><span></span></div>` : ""}
    ${S.place && S.place.address && S.place.address.road ? `<div class="kv"><dt>Vía</dt><dd>${esc(S.place.address.road)}</dd><span></span></div>` : ""}
    <div class="kv"><dt>Hora local</dt><dd>${S.weather && S.weather.utc_offset_seconds != null ? `UTC${fmtOffset(S.weather.utc_offset_seconds)}` : "UTC-04:00"}</dd><span></span></div></dl>
    <div class="links">
      <a href="https://www.google.com/maps/search/?api=1&query=${lat},${lon}" target="_blank" rel="noopener">Google Maps</a>
      <a href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lon}" target="_blank" rel="noopener">Street View</a>
      <a href="https://earth.google.com/web/@${lat},${lon},500a,1500d,35y,0h,45t,0r" target="_blank" rel="noopener">Google Earth 3D</a>
      <a href="https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}" target="_blank" rel="noopener">OpenStreetMap</a>
    </div><p class="src" style="margin-top:10px">Arrastra el marcador amarillo para ajustar el punto.</p>`;
}
function renderWeather() {
  scheduleRecon();
  const el = $("#s-clima"); if (!el) return;
  if (S.errs.weather) { el.innerHTML = `<h3>Meteorología</h3>${errBox("weather", S.errs.weather)}`; return; }
  const w = S.weather;
  if (!w) { el.innerHTML = `<h3>Meteorología</h3><div class="loading">Consultando el clima…</div>`; return; }
  if (!w.current || !w.daily || !w.hourly) { el.innerHTML = `<h3>Meteorología</h3>${errBox("weather", "Open‑Meteo respondió sin datos para este punto.")}`; return; }
  const c = w.current, u = w.current_units, [desc, ico] = wmo(c.weather_code), d = w.daily;
  const vis = c.visibility != null ? (c.visibility >= 1000 ? `${(c.visibility / 1000).toFixed(1)} km` : `${Math.round(c.visibility)} m`) : "—";
  const hm = s => s ? s.slice(11, 16) : "—";
  const dayName = (s, i) => i === 0 ? "Hoy" : i === 1 ? "Mañana" : new Date(s + "T12:00").toLocaleDateString("es", { weekday: "short", day: "numeric" });
  const [aqTxt, aqCol] = aqiInfo(S.air && S.air.us_aqi);
  el.innerHTML = `<h3>Meteorología <small>Open‑Meteo · ${esc(hm(c.time))} local</small></h3>
    <div class="wx-now"><div class="wx-temp">${Math.round(c.temperature_2m)}°</div>
      <div><div class="wx-icon">${ico}</div><div class="wx-desc">${esc(desc)}</div><div class="wx-sub">Sensación ${Math.round(c.apparent_temperature)}° · ${c.is_day ? "de día" : "de noche"}</div></div></div>
    <div class="facts">
      <div class="fact"><small>Viento</small><b>${Math.round(c.wind_speed_10m)} ${esc(u.wind_speed_10m)} ${rumbo(c.wind_direction_10m)}</b></div>
      <div class="fact"><small>Ráfagas</small><b>${Math.round(c.wind_gusts_10m)} ${esc(u.wind_gusts_10m)}</b></div>
      <div class="fact"><small>Humedad</small><b>${c.relative_humidity_2m}%</b></div>
      <div class="fact"><small>Nubosidad</small><b>${c.cloud_cover}%</b></div>
      <div class="fact"><small>Presión</small><b>${Math.round(c.pressure_msl)} hPa</b></div>
      <div class="fact"><small>Visibilidad</small><b>${vis}</b></div>
      <div class="fact"><small>Lluvia ahora</small><b>${c.precipitation} mm</b></div>
      <div class="fact"><small>Índice UV</small><b>${d.uv_index_max[0] ?? "—"}</b></div>
      <div class="fact"><small>Amanecer</small><b>${hm(d.sunrise[0])}</b></div>
      <div class="fact"><small>Atardecer</small><b>${hm(d.sunset[0])}</b></div>
      <div class="fact"><small>Calidad del aire</small><b>${S.air ? `${S.air.us_aqi} <span class="pill" style="background:${aqCol}">${aqTxt}</span>` : "…"}</b></div>
      <div class="fact"><small>PM2.5</small><b>${S.air ? S.air.pm2_5 + " µg/m³" : "…"}</b></div>
    </div>
    ${sparkline(w)}
    <div class="sub">Pronóstico 7 días</div>
    ${d.time.map((t, i) => { const [dd, di] = wmo(d.weather_code[i]); return `<div class="day" title="${esc(dd)}"><span>${dayName(t, i)}</span><span>${di}</span><span class="p">${d.precipitation_probability_max[i] ?? 0}% · ${d.precipitation_sum[i] ?? 0} mm</span><span class="t">${Math.round(d.temperature_2m_min[i])}° / ${Math.round(d.temperature_2m_max[i])}°</span></div>`; }).join("")}`;
}
function sparkline(w) {
  const h = w.hourly, now = w.current.time.slice(0, 13);
  let st = h.time.findIndex(t => t.slice(0, 13) === now); if (st < 0) st = 0;
  const temps = h.temperature_2m.slice(st, st + 25), pp = h.precipitation_probability.slice(st, st + 25), times = h.time.slice(st, st + 25);
  if (temps.length < 2) return "";
  const W = 400, H = 90, pl = 26, pr = 6, pt = 10, pb = 18;
  const mn = Math.floor(Math.min(...temps)), mx = Math.ceil(Math.max(...temps)), span = Math.max(mx - mn, 1);
  const x = i => pl + i * (W - pl - pr) / (temps.length - 1), y = v => pt + (1 - (v - mn) / span) * (H - pt - pb);
  const line = temps.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const bw = (W - pl - pr) / temps.length, ih = H - pt - pb;
  const bars = pp.map((p, i) => p ? `<rect x="${(x(i) - bw / 2 + 1).toFixed(1)}" y="${(H - pb - p / 100 * ih).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${(p / 100 * ih).toFixed(1)}" fill="var(--c-agua)" opacity=".25"/>` : "").join("");
  const ticks = times.map((t, i) => i % 6 === 0 ? `<text x="${x(i).toFixed(1)}" y="${H - 4}" text-anchor="middle" font-size="10" fill="var(--muted)">${t.slice(11, 16)}</text>` : "").join("");
  return `<div class="sub">Próximas 24 horas</div><svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Temperatura y probabilidad de lluvia de las próximas 24 horas">
    <line x1="${pl}" x2="${W - pr}" y1="${y(mx)}" y2="${y(mx)}" stroke="var(--line)"/><line x1="${pl}" x2="${W - pr}" y1="${H - pb}" y2="${H - pb}" stroke="var(--line)"/>
    <text x="2" y="${y(mx) + 4}" font-size="10" fill="var(--muted)">${mx}°</text><text x="2" y="${H - pb}" font-size="10" fill="var(--muted)">${mn}°</text>
    ${bars}<path d="${line}L${x(temps.length - 1).toFixed(1)},${H - pb}L${pl},${H - pb}Z" fill="var(--accent)" opacity=".12"/><path d="${line}" fill="none" stroke="var(--accent)" stroke-width="2"/>
    <circle cx="${x(0)}" cy="${y(temps[0])}" r="3.5" fill="var(--accent)"/>${ticks}</svg>
    <p class="src">Línea: temperatura. Barras azules: probabilidad de lluvia.</p>`;
}
// Mosaico de la galería: la primera foto ocupa todo el ancho (16:9), el resto va en dos columnas 4:3
const tile = (g, i, it) => it.pdf
  ? `<button class="ph doc" data-view="${g}:${i}" title="${esc(it.title)}"><span class="ic">PDF</span><span class="pc">${esc(it.title)}</span></button>`
  : `<button class="ph" data-view="${g}:${i}" title="${esc(it.title)}"><img loading="lazy" src="${esc(it.thumb || it.src)}" alt="${esc(it.title)}"><span class="pc">${it.cap || esc(it.title)}</span></button>`;
// Foto que no carga: en vez del texto alternativo, una tarjeta gris con "Foto no disponible"
document.addEventListener("error", e => {
  const im = e.target, ph = im.parentNode;
  if (im.tagName === "IMG" && ph && ph.classList && ph.classList.contains("ph")) { ph.classList.add("broken"); im.remove(); }
}, true);
function renderPhotos() {
  const el = $("#s-fotos"); if (!el) return;
  const r = Math.min(10000, Math.max(2000, S.radius * 2));
  const nNew = S.photos.filter(p => p.year >= THIS_YEAR).length;
  const h = `<h3>Fotos del lugar <small>Wikimedia Commons · ${fmtDist(r)}${nNew ? ` · ${nNew} de ${THIS_YEAR}` : ""}</small></h3>`;
  // Fecha y detalle de la imagen satelital que muestra la capa Satélite en este punto
  const sat = S.sat ? `<p class="sat">Imagen satelital del punto: <b>${satLine(S.sat)}</b>${S.sat.date && +S.sat.date.slice(0, 4) < THIS_YEAR - 1 ? ` <span class="src">· es la más reciente de alta resolución disponible gratis aquí</span>` : ""}</p>` : "";
  if (S.busy.photos) { el.innerHTML = h + sat + `<div class="loading">Buscando fotos…</div>`; return; }
  if (S.errs.photos) { el.innerHTML = h + sat + errBox("photos", S.errs.photos); return; }
  if (!S.photos.length) { el.innerHTML = h + sat + `<p class="src">Nadie ha subido fotos geolocalizadas en esta zona todavía. Prueba un radio mayor en “Entorno”, abre Street View desde Coordenadas o sube las tuyas con “Guardar como mi lugar”.</p>`; return; }
  const items = viewItems("c"), show = items.slice(0, 7);
  const seg = `<div class="psort" role="group" aria-label="Orden de las fotos">${[["recientes", `Recientes primero`], ["cercanas", "Más cercanas"]].map(([k, t]) => `<button data-photosort="${k}" aria-pressed="${photoSort === k}">${t}</button>`).join("")}</div>`;
  el.innerHTML = h + sat + seg + `<div class="gallery">${show.map((it, i) => tile("c", i, it)).join("")}</div>`
    + (items.length > show.length ? `<button class="btn more" data-album="c">Ver las ${items.length} fotos</button>` : "")
    + `<p class="src" style="margin-top:8px">${nNew ? `Las marcadas con <b class="yr">${THIS_YEAR}</b> son de este año. ` : `No hay fotos de ${THIS_YEAR} subidas en esta zona; se muestran primero las más recientes. `}Toca una foto para verla en grande con su fecha, autor y licencia.</p>`;
}
function renderFiles() {
  const el = $("#s-archivos"); if (!el) return;
  el.hidden = !S.custom; if (!S.custom) return;
  const items = viewItems("m"), show = items.slice(0, 7);
  el.innerHTML = `<h3>Mis fotos y documentos <small>${items.length} archivo${items.length === 1 ? "" : "s"}</small></h3>`
    + (items.length ? `<div class="gallery">${show.map((it, i) => tile("m", i, it)).join("")}</div>` : `<p class="src">Aún no hay archivos en este lugar.</p>`)
    + (items.length > show.length ? `<button class="btn more" data-album="m">Ver los ${items.length} archivos</button>` : "")
    + `<div class="drop" id="dropHere" tabindex="0" role="button" style="margin-top:10px"><b>Subir fotos o PDF</b> o arrástralos aquí</div>
      <input type="file" id="fileHere" multiple accept="image/jpeg,image/png,image/webp,image/gif,application/pdf,.pdf" hidden>`;
}
function renderWiki() {
  scheduleRecon();
  const el = $("#s-cerca"); if (!el) return;
  const h = `<h3>Lugares documentados cerca <small>Wikipedia · 10 km</small></h3>`;
  if (S.busy.wiki) { el.innerHTML = h + `<div class="loading">Buscando artículos…</div>`; return; }
  if (S.errs.wiki) { el.innerHTML = h + errBox("wiki", S.errs.wiki); return; }
  if (!S.wiki.length) { el.innerHTML = h + `<p class="src">No hay artículos de Wikipedia geolocalizados en 10 km.</p>`; return; }
  el.innerHTML = h + S.wiki.map((w, i) => `<button class="wcard" data-wiki="${i}"><span class="th" style="${w.thumb ? `background-image:url('${esc(w.thumb)}')` : ""}"></span>
    <span><b>${esc(w.title)}</b><span class="d">${fmtDist(w.d)} al ${rumbo(bearing(S.point, w))}</span>${w.desc ? ` <span class="src">· ${esc(w.desc)}</span>` : ""}<p>${esc(w.extract)}</p></span></button>`).join("")
    + `<p class="src">Toca un lugar para verlo en el mapa; el enlace al artículo está en su globo.</p>`;
}
function renderFeats() {
  scheduleRecon();
  const el = $("#s-entorno"); if (!el) return;
  const radios = [250, 500, 1000, 2000, 5000];
  const h = `<h3>Entorno <small>OpenStreetMap</small></h3><div class="ctrl-row"><label for="radius">Radio de análisis</label>
    <select id="radius">${radios.map(r => `<option value="${r}" ${r === S.radius ? "selected" : ""}>${fmtDist(r)}</option>`).join("")}</select></div>`;
  if (S.busy.feats) { el.innerHTML = h + `<div class="loading">Buscando puentes, ríos, estructuras y naturaleza en ${fmtDist(S.radius)}…</div>`; return; }
  if (S.errs.feats) { el.innerHTML = h + errBox("feats", S.errs.feats, S.radius > 1000 ? " Prueba también con un radio menor." : ""); return; }
  const counts = {}; S.feats.forEach(f => counts[f.cat] = (counts[f.cat] || 0) + 1);
  const chips = Object.entries(CATS).map(([k, c]) => `<button class="chip" data-cat="${k}" aria-pressed="${!S.hiddenCats.has(k)}" style="--c:var(${c.color})"><i></i>${c.label} <span class="n">${counts[k] || 0}</span></button>`).join("");
  const vis = S.feats.filter(f => !S.hiddenCats.has(f.cat));
  const bld = S.buildings != null ? `<p class="src" style="margin:0 0 6px">${fmtNum(S.buildings)} edificaciones mapeadas en ${fmtDist(S.radius)} (se listan las que tienen nombre).</p>` : "";
  el.innerHTML = h + bld + `<div class="chips">${chips}</div>` + (vis.length ? vis.slice(0, 250).map(f => `
    <button class="row" data-feat="${esc(f.id)}" style="--c:var(${CATS[f.cat].color})"><span class="bar"></span>
      <span><b>${esc(f.name || f.type)}</b><span>${esc(f.name ? f.type : CATS[f.cat].label)}${f.parts > 1 ? ` · ${f.parts} tramos` : ""}</span></span>
      <span class="d">${fmtDist(f.d)}<br><span>${rumbo(bearing(S.point, f))}</span></span></button>`).join("")
    : `<p class="src">No hay elementos de estas categorías registrados en el radio elegido. Prueba uno mayor.</p>`);
}
