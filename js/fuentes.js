// Wikipedia/Wikidata, fotos de Commons, clima, calidad del aire y sismos
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
    if (ad.localidad) queries.push(`${ad.localidad} ${ad.estado} Venezuela`);
    if (ad.municipio) queries.push(`${ad.municipio} ${ad.estado} Venezuela`);
    for (const q of queries) {
      try { info = await fromWikiSearch(q); } catch (e) { lastErr = e; break; }
      if (info || id !== reqId) break;
    }
  }
  if (id !== reqId) return;
  S.info = info; S.errs.info = !info && lastErr ? lastErr.message : null;
  S.busy.info = false; renderHead();
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
  const title = e.sitelinks && e.sitelinks.eswiki && e.sitelinks.eswiki.title;
  if (title) summary = await wikiSummary(title).catch(() => null);
  return {
    title: (e.labels.es || e.labels.en || {}).value || (summary && summary.title),
    description: (e.descriptions.es || e.descriptions.en || {}).value || "",
    extract: summary ? summary.extract : "",
    url: summary ? summary.url : `https://www.wikidata.org/wiki/${qid}`,
    image: img ? commonsFile(img, 900) : summary && summary.image,
    imageTitle: img ? "File:" + img : null,
    facts, web, source: title ? "Wikipedia y Wikidata" : "Wikidata",
  };
}
async function fromWikiSearch(q) {
  const d = await getJSON(`${WIKI}action=query&list=search&srlimit=1&srsearch=${encodeURIComponent(q)}`);
  const hit = d.query && d.query.search && d.query.search[0]; if (!hit) return null;
  const s = await wikiSummary(hit.title);
  if (!s || !s.extract) return null;
  return { title: s.title, description: s.description, extract: s.extract, url: s.url, image: s.image, facts: [], source: "Wikipedia (zona)" };
}
async function wikiSummary(title) {
  const s = await getJSON(`https://es.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`);
  return { title: s.title, description: s.description || "", extract: s.extract || "", url: s.content_urls && s.content_urls.desktop.page, image: s.originalimage ? (s.thumbnail || s.originalimage).source.replace(/\/\d+px-/, "/900px-") : null };
}
const commonsFile = (name, w) => `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(name.replace(/^File:/, ""))}?width=${w}`;

// ---------- Fotos (Wikimedia Commons) ----------
async function loadPhotos(id) {
  S.busy.photos = true; renderPhotos();
  const r = Math.min(10000, Math.max(2000, S.radius * 2));
  try {
    const d = await getJSON(`${COMMONS}action=query&generator=geosearch&ggsnamespace=6&ggscoord=${S.point.lat}|${S.point.lon}&ggsradius=${r}&ggslimit=50&prop=imageinfo|coordinates&iiprop=url|extmetadata|mime&iiurlwidth=640&iiextmetadatafilter=Artist|LicenseShortName|ImageDescription|DateTimeOriginal|ObjectName&colimit=50`);
    if (id !== reqId) return;
    const pages = Object.values((d.query && d.query.pages) || {});
    S.photos = pages.filter(p => p.imageinfo && /^image\/(jpeg|png|webp)/.test(p.imageinfo[0].mime)).map(p => {
      const ii = p.imageinfo[0], m = ii.extmetadata || {}, c = p.coordinates && p.coordinates[0];
      return {
        title: p.title, thumb: ii.thumburl || ii.url, page: ii.descriptionurl,
        name: stripHtml(m.ObjectName && m.ObjectName.value) || p.title.replace(/^File:/, "").replace(/\.[a-z]+$/i, "").replace(/_/g, " "),
        desc: stripHtml(m.ImageDescription && m.ImageDescription.value).slice(0, 300),
        author: stripHtml(m.Artist && m.Artist.value) || "Autor desconocido",
        license: (m.LicenseShortName && m.LicenseShortName.value) || "",
        date: stripHtml(m.DateTimeOriginal && m.DateTimeOriginal.value).slice(0, 10),
        d: c ? dist(S.point, { lat: c.lat, lon: c.lon }) : null,
      };
    }).sort((a, b) => (a.d ?? 1e9) - (b.d ?? 1e9));
  } catch (e) { if (id === reqId) S.errs.photos = e.message; }
  if (id === reqId) { S.busy.photos = false; renderPhotos(); renderHead(); renderNav(); }
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

// ---------- Sismos recientes (USGS) ----------
async function loadQuakes(id) {
  S.busy.quakes = true; renderQuakes();
  const start = new Date(Date.now() - 365 * 86400e3).toISOString().slice(0, 10);
  try {
    const d = await getJSON(`https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&latitude=${S.point.lat}&longitude=${S.point.lon}&maxradiuskm=300&starttime=${start}&minmagnitude=2.5&orderby=time&limit=30`);
    if (id !== reqId) return;
    S.quakes = (d.features || []).map(f => ({ mag: f.properties.mag, place: f.properties.place, time: f.properties.time, url: f.properties.url,
      lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], depth: f.geometry.coordinates[2],
      d: dist(S.point, { lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] }) }));
  } catch (e) { if (id === reqId) S.errs.quakes = e.message; }
  if (id === reqId) { S.busy.quakes = false; renderQuakes(); renderNav(); }
}
const magColor = m => m >= 5 ? "#c22f4f" : m >= 4 ? "#e0661f" : m >= 3 ? "#d99a06" : "#4f8f87";
const magInk = m => m >= 3 && m < 4 ? "#1d1500" : "#fff";
// USGS describe los sismos en inglés ("22 km SSE of Güiria, Venezuela")
function placeEs(s) {
  if (!s) return "Sin descripción";
  const m = s.match(/^(\d+(?:\.\d+)?) km ([NSEW]{1,3}) of (.+)$/);
  if (m) return `A ${m[1]} km al ${m[2].replace(/W/g, "O")} de ${m[3]}`;
  return s.replace(/^(near the )?coast of /i, "Costa de ").replace(/^offshore /i, "Frente a la costa de ").replace(/^northern /i, "Norte de ")
    .replace(/^southern /i, "Sur de ").replace(/^eastern /i, "Este de ").replace(/^western /i, "Oeste de ").replace(/ region$/i, " (región)")
    .replace(/Trinidad and Tobago/g, "Trinidad y Tobago").replace(/Brazil/g, "Brasil").replace(/Caribbean Sea/g, "Mar Caribe");
}
