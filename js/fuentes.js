// Wikipedia/Wikidata, fotos de Commons, clima y calidad del aire
"use strict";

// ---------- Información del lugar (Wikidata + Wikipedia) ----------
// Si Wikidata o Wikipedia fallan, se muestra el error con "Reintentar" en vez de decir que no hay artículo.
async function loadInfo(id) {
  S.busy.info = true; S.errs.info = null; renderHead();
  let info = null, lastErr = null;
  const qid = S.place && S.place.extratags && S.place.extratags.wikidata;
  if (qid) { try { info = await fromWikidata(qid); } catch (e) { lastErr = e; } }
  if (!info && id === reqId) {
    const ad = adminOf(S.place), queries = [];
    if (S.custom) queries.push(S.custom.name);
    if (S.title) queries.push(S.title);
    if (S.place && S.place.name) queries.push(`${S.place.name} ${ad.estado}`);
    const pais = S.place && S.place.address && S.place.address.country_code === "gy" ? "Guyana" : "Venezuela";
    if (ad.localidad) queries.push(`${ad.localidad} ${ad.estado} ${pais}`);
    if (ad.municipio) queries.push(`${ad.municipio} ${ad.estado} ${pais}`);
    // en Guyana casi no hay artículos en español: si no aparece nada, se busca en la Wikipedia en inglés y se traduce
    const langs = pais === "Guyana" ? ["es", "en"] : ["es"];
    search: for (const lang of langs) for (const q of queries) {
      try { info = await fromWikiSearch(q, lang); } catch (e) { lastErr = e; break search; }
      if (info || id !== reqId) break search;
    }
  }
  if (id !== reqId) return;
  S.info = info; S.errs.info = !info && lastErr ? lastErr.message : null;
  S.busy.info = false; renderHead(); renderNav();
  loadPlaceSocial(id);
}
async function fromWikidata(qid) {
  const d = await getJSON(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&origin=*&ids=${qid}&props=claims|sitelinks|descriptions|labels&languages=es|en&sitefilter=eswiki|enwiki`);
  const e = d.entities && d.entities[qid]; if (!e) return null;
  const cl = e.claims || {};
  const pick = p => { const arr = (cl[p] || []).filter(c => c.mainsnak && c.mainsnak.datavalue); const pref = arr.find(c => c.rank === "preferred"); return (pref || arr[arr.length - 1] || {}).mainsnak?.datavalue?.value; };
  const qty = p => { const v = pick(p); return v && v.amount ? +v.amount : null; };
  const facts = [];
  const pop = qty("P1082"); if (pop) facts.push(["Población", fmtNum(Math.round(pop)) + " hab."]);
  const ele = qty("P2044"); if (ele) facts.push(["Altitud", fmtNum(Math.round(ele)) + " m"]);
  const area = qty("P2046"); if (area) facts.push(["Superficie", fmtNum(+area.toFixed(1)) + " km²"]);
  const len = qty("P2043"); if (len) facts.push(["Longitud", fmtNum(+len.toFixed(1)) + " m"]);
  const hgt = qty("P2048"); if (hgt) facts.push(["Altura", fmtNum(+hgt.toFixed(1)) + " m"]);
  const inc = pick("P571"); if (inc && inc.time) facts.push(["Fundación / inicio", inc.time.replace(/^\+/, "").slice(0, 4)]);
  const web = pick("P856");
  const img = pick("P18");
  let summary = null;
  const sl = e.sitelinks || {}, lang = sl.eswiki ? "es" : sl.enwiki ? "en" : null, title = lang && sl[lang + "wiki"].title;
  if (title) summary = await wikiSummary(title, lang).catch(() => null);
  return {
    title: esName((e.labels.es || e.labels.en || {}).value) || (summary && summary.title),
    description: e.descriptions.es ? e.descriptions.es.value : await toEs((e.descriptions.en || {}).value || ""),
    extract: summary ? summary.extract : "",
    url: summary ? summary.url : `https://www.wikidata.org/wiki/${qid}`,
    image: img ? commonsFile(img, 900) : summary && summary.image,
    imageTitle: img ? "File:" + img : null,
    qid, social: socialFromClaims(cl), facts, web, source: title ? (lang === "en" ? "Wikipedia en inglés (traducida) y Wikidata" : "Wikipedia y Wikidata") : "Wikidata",
  };
}
// La búsqueda por nombre puede traer un homónimo de otro país (p. ej. "El Dorado" → un distrito de Perú):
// se acepta solo un artículo situado cerca del punto o que mencione el país o el estado.
async function fromWikiSearch(q, lang = "es") {
  const d = await getJSON(`https://${lang}.wikipedia.org/w/api.php?format=json&origin=*&action=query&list=search&srlimit=3&srsearch=${encodeURIComponent(q)}`);
  const ad = adminOf(S.place), near = new RegExp(["Venezuela", "Guyana", "Guayana", ad.estado].filter(Boolean).map(w => w.replace(/^Estado\s+/i, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "i");
  for (const hit of (d.query && d.query.search) || []) {
    const s = await wikiSummary(hit.title, lang);
    if (!s || !s.extract) continue;
    if (s.coords ? dist(S.point, s.coords) > 80000 : !near.test(`${s.description} ${s.extract}`)) continue;
    return { title: s.title, description: s.description, extract: s.extract, url: s.url, image: s.image, qid: s.qid, facts: [], source: lang === "en" ? "Wikipedia en inglés, traducida (zona)" : "Wikipedia (zona)" };
  }
  return null;
}
// Resumen de un artículo; el de la Wikipedia en inglés se entrega traducido
async function wikiSummary(title, lang = "es") {
  const s = await getJSON(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`);
  const [description, extract] = lang === "en" ? await Promise.all([toEs(s.description || ""), toEs(s.extract || "")]) : [s.description || "", s.extract || ""];
  return { title: lang === "en" ? esName(s.title) : s.title, description, extract, url: s.content_urls && s.content_urls.desktop.page, image: s.originalimage ? (s.thumbnail || s.originalimage).source.replace(/\/\d+px-/, "/900px-") : null,
    qid: s.wikibase_item || null, coords: s.coordinates && s.coordinates.lat != null ? { lat: s.coordinates.lat, lon: s.coordinates.lon } : null };
}
const commonsFile = (name, w) => `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(name.replace(/^File:/, ""))}?width=${w}`;

// ---------- Fotos (Wikimedia Commons) ----------
// Dos consultas a la vez: las 50 fotos tomadas más cerca del punto y las 50 subidas más recientemente en la zona,
// para que las de este año aparezcan aunque haya muchas fotos antiguas más cerca.
const THIS_YEAR = new Date().getFullYear();
const PHOTO_PROPS = "prop=imageinfo|coordinates&iiprop=url|extmetadata|mime|timestamp&iiurlwidth=640&iiextmetadatafilter=Artist|LicenseShortName|ImageDescription|DateTimeOriginal|ObjectName&iiextmetadatalanguage=es&colimit=100";
const PHOTO_SORT_KEY = "rv-fotos-orden";
let photoSort = (() => { try { return localStorage.getItem(PHOTO_SORT_KEY) || "recientes"; } catch (_) { return "recientes"; } })();
// "recientes": primero las de este año, luego las de los dos anteriores y después el resto; en cada grupo, las más cercanas.
// "cercanas": solo por distancia al punto.
function sortPhotos() {
  const age = p => p.year == null ? 9 : p.year >= THIS_YEAR ? 0 : p.year >= THIS_YEAR - 2 ? 1 : 2;
  const byDist = (a, b) => (a.d ?? 1e9) - (b.d ?? 1e9);
  S.photos.sort(photoSort === "cercanas" ? byDist : (a, b) => age(a) - age(b) || byDist(a, b));
}
function setPhotoSort(v) { photoSort = v; try { localStorage.setItem(PHOTO_SORT_KEY, v); } catch (_) {} sortPhotos(); renderPhotos(); }
async function loadPhotos(id) {
  S.busy.photos = true; renderPhotos();
  const r = Math.min(10000, Math.max(2000, S.radius * 2)), { lat, lon } = S.point;
  try {
    const near = getJSON(`${COMMONS}action=query&generator=geosearch&ggsnamespace=6&ggscoord=${lat}|${lon}&ggsradius=${r}&ggslimit=50&${PHOTO_PROPS}`);
    const recent = getJSON(`${COMMONS}action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(`filetype:bitmap nearcoord:${r / 1000}km,${lat},${lon}`)}&gsrsort=create_timestamp_desc&gsrlimit=50&${PHOTO_PROPS}`).catch(() => null);
    const [d1, d2] = await Promise.all([near, recent]);
    if (id !== reqId) return;
    const pages = new Map();
    for (const d of [d1, d2]) for (const p of Object.values((d && d.query && d.query.pages) || {})) if (!pages.has(p.title)) pages.set(p.title, p);
    S.photos = [...pages.values()].filter(p => p.imageinfo && /^image\/(jpeg|png|webp)/.test(p.imageinfo[0].mime)).map(p => {
      const ii = p.imageinfo[0], m = ii.extmetadata || {}, c = p.coordinates && p.coordinates[0];
      // Fecha de la toma (EXIF); si no la trae, la de subida a Commons
      const taken = stripHtml(m.DateTimeOriginal && m.DateTimeOriginal.value), ty = (taken.match(/\b(19|20)\d\d\b/) || [])[0];
      const up = ii.timestamp ? ii.timestamp.slice(0, 10) : "";
      return {
        title: p.title, thumb: ii.thumburl || ii.url, page: ii.descriptionurl,
        name: stripHtml(m.ObjectName && m.ObjectName.value) || p.title.replace(/^File:/, "").replace(/\.[a-z]+$/i, "").replace(/_/g, " "),
        desc: stripHtml(m.ImageDescription && m.ImageDescription.value).slice(0, 300),
        author: stripHtml(m.Artist && m.Artist.value) || "Autor desconocido",
        license: (m.LicenseShortName && m.LicenseShortName.value) || "",
        date: ty ? taken.slice(0, 10) : "", up,
        year: ty ? +ty : up ? +up.slice(0, 4) : null,
        d: c ? dist(S.point, { lat: c.lat, lon: c.lon }) : null,
      };
    }).filter(p => p.d == null || p.d <= r * 1.05);
    sortPhotos();
  } catch (e) { if (id === reqId) S.errs.photos = e.message; }
  if (id === reqId) { S.busy.photos = false; renderPhotos(); renderHead(); renderNav(); }
  if (id === reqId && S.photos.length) translatePhotos(id);
}

// ---------- Imagen satelital del mapa (Esri World Imagery) ----------
// Fecha de captura, detalle y satélite de la imagen que se ve en la capa Satélite en este punto
const SAT_ES = { WV01: "WorldView-1", WV02: "WorldView-2", WV03: "WorldView-3", WV04: "WorldView-4", GE01: "GeoEye-1", QB02: "QuickBird", IK01: "IKONOS", PHR: "Pléiades", SPOT: "SPOT", Aerial: "Foto aérea" };
async function loadSat(id) {
  const { lat, lon } = S.point, e = 0.0005;
  try {
    const d = await getJSON(`https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/identify?geometry=${lon},${lat}&geometryType=esriGeometryPoint&sr=4326&layers=all:4&tolerance=0&mapExtent=${lon - e},${lat - e},${lon + e},${lat + e}&imageDisplay=100,100,96&returnGeometry=false&f=json`, {}, 15000, 1);
    if (id !== reqId) return;
    const best = ((d && d.results) || []).map(r => r.attributes || {})
      .map(a => ({ date: /^\d{8}$/.test(a["DATE (YYYYMMDD)"]) ? a["DATE (YYYYMMDD)"] : null, res: parseFloat(a["RESOLUTION (M)"]), acc: parseFloat(a["ACCURACY (M)"]), sat: a.DESCRIPTION, src: a.SOURCE }))
      .filter(a => a.res > 0).sort((a, b) => a.res - b.res)[0];
    S.sat = best ? { ...best, sat: SAT_ES[best.sat] || (best.sat && best.sat !== "Null" ? best.sat : "") } : null;
  } catch (_) { if (id === reqId) S.sat = null; }
  if (id === reqId) { renderPhotos(); scheduleRecon(); }
}
const satDate = s => s && s.date ? new Date(+s.date.slice(0, 4), +s.date.slice(4, 6) - 1, +s.date.slice(6, 8)).toLocaleDateString("es-VE", { day: "numeric", month: "short", year: "numeric" }) : "";
function satLine(s) {
  if (!s) return "";
  const res = s.res < 1 ? `${String(s.res).replace(".", ",")} m` : `${fmtNum(s.res)} m`;
  return `${s.date ? satDate(s) : "sin fecha"} · detalle ${res}${s.sat ? ` · ${esc(s.sat)}` : ""}${s.src && s.src !== "Null" ? ` (${esc(s.src)})` : ""}`;
}
// Títulos y descripciones de Commons suelen estar en inglés: se traducen en segundo plano y se vuelve a dibujar
async function translatePhotos(id) {
  const ph = S.photos, top = ph.slice(0, 24);
  const [names, descs] = await Promise.all([toEsMany(ph.map(p => p.name), true), toEsMany(top.map(p => p.desc), true)]);
  if (id !== reqId || ph !== S.photos) return;
  ph.forEach((p, i) => { p.name = names[i]; if (i < top.length) p.desc = descs[i]; });
  renderPhotos();
}

// ---------- Wikipedia cercano ----------
async function loadWiki(id) {
  S.busy.wiki = true; renderWiki();
  try {
    const d = await getJSON(`${WIKI}action=query&generator=geosearch&ggscoord=${S.point.lat}|${S.point.lon}&ggsradius=10000&ggslimit=20&prop=coordinates|pageimages|extracts|description&piprop=thumbnail&pithumbsize=240&pilimit=20&exintro=1&explaintext=1&exsentences=2&exlimit=20&colimit=20`);
    if (id !== reqId) return;
    S.wiki = Object.values((d.query && d.query.pages) || {}).filter(p => p.coordinates).map(p => {
      const c = p.coordinates[0];
      return { title: p.title, desc: p.description || "", extract: p.extract || "", thumb: p.thumbnail && p.thumbnail.source, lat: c.lat, lon: c.lon, d: dist(S.point, c), url: `https://es.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, "_"))}` };
    }).sort((a, b) => a.d - b.d);
    for (const w of S.wiki) L.marker([w.lat, w.lon], { icon: wIcon }).bindPopup(`<b>${esc(w.title)}</b><br>${esc(w.desc)}<br><a href="${w.url}" target="_blank" rel="noopener">Leer en Wikipedia</a>`).addTo(wikiLayer);
  } catch (e) { if (id === reqId) S.errs.wiki = e.message; }
  if (id === reqId) { S.busy.wiki = false; renderWiki(); renderHead(); renderNav(); }
}

// ---------- Clima y calidad del aire (Open‑Meteo) ----------
const WMO = {
  0: ["Despejado", "☀️"], 1: ["Mayormente despejado", "🌤️"], 2: ["Parcialmente nublado", "⛅"], 3: ["Nublado", "☁️"], 45: ["Niebla", "🌫️"], 48: ["Niebla con escarcha", "🌫️"],
  51: ["Llovizna débil", "🌦️"], 53: ["Llovizna", "🌦️"], 55: ["Llovizna intensa", "🌧️"], 56: ["Llovizna helada", "🌧️"], 57: ["Llovizna helada", "🌧️"],
  61: ["Lluvia débil", "🌧️"], 63: ["Lluvia", "🌧️"], 65: ["Lluvia fuerte", "🌧️"], 66: ["Lluvia helada", "🌧️"], 67: ["Lluvia helada", "🌧️"],
  71: ["Nevada débil", "🌨️"], 73: ["Nevada", "🌨️"], 75: ["Nevada fuerte", "❄️"], 77: ["Granos de nieve", "🌨️"],
  80: ["Chubascos débiles", "🌦️"], 81: ["Chubascos", "🌧️"], 82: ["Chubascos violentos", "⛈️"], 85: ["Chubascos de nieve", "🌨️"], 86: ["Chubascos de nieve", "❄️"],
  95: ["Tormenta eléctrica", "⛈️"], 96: ["Tormenta con granizo", "⛈️"], 99: ["Tormenta con granizo fuerte", "⛈️"],
};
const wmo = c => WMO[c] || ["Sin dato", "❔"];
async function loadWeather(id) {
  S.busy.weather = true; renderWeather();
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${S.point.lat}&longitude=${S.point.lon}&timezone=auto&forecast_days=7`
    + "&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m,wind_direction_10m,wind_gusts_10m,visibility"
    + "&hourly=temperature_2m,precipitation_probability&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,sunrise,sunset,uv_index_max";
  try {
    const d = await getJSON(url); if (id !== reqId) return;
    if (!d.current || !d.daily || !d.hourly) throw new Error("Open‑Meteo respondió sin datos para este punto.");
    S.weather = d;
  }
  catch (e) { if (id === reqId) S.errs.weather = e.message; }
  if (id === reqId) { S.busy.weather = false; renderWeather(); renderCoords(); }
}
async function loadAir(id) {
  try {
    const d = await getJSON(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${S.point.lat}&longitude=${S.point.lon}&current=us_aqi,pm2_5,pm10,dust&timezone=auto`);
    if (id !== reqId) return; S.air = d.current; renderWeather();
  } catch (_) {}
}
function aqiInfo(v) {
  if (v == null) return ["Sin dato", "#9aa"];
  if (v <= 50) return ["Buena", "#5cc06a"]; if (v <= 100) return ["Moderada", "#f2d14b"];
  if (v <= 150) return ["Dañina para sensibles", "#f39b4b"]; if (v <= 200) return ["Dañina", "#f06262"];
  return ["Muy dañina", "#b06ad6"];
}
