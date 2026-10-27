// Redes sociales del lugar: cuentas oficiales (Wikidata y OpenStreetMap), cuentas de lugares cercanos y búsquedas listas en cada red
"use strict";

// ---------- Redes conocidas ----------
// wd: propiedades de Wikidata con la cuenta; osm: etiquetas de OpenStreetMap; url: enlace a partir del usuario
const NETS = {
  facebook: { label: "Facebook", ic: "f", col: "#1877f2", wd: ["P2013"], osm: ["contact:facebook", "facebook"], url: h => `https://www.facebook.com/${h}` },
  instagram: { label: "Instagram", ic: "IG", col: "#d6249f", wd: ["P2003"], osm: ["contact:instagram", "instagram"], url: h => `https://www.instagram.com/${h}/` },
  tiktok: { label: "TikTok", ic: "TT", col: "#111", wd: ["P7085"], osm: ["contact:tiktok", "tiktok"], url: h => `https://www.tiktok.com/@${h}` },
  x: { label: "X (Twitter)", ic: "X", col: "#111", wd: ["P2002"], osm: ["contact:twitter", "twitter", "contact:x"], url: h => `https://x.com/${h}` },
  youtube: { label: "YouTube", ic: "▶", col: "#e00", wd: ["P2397", "P11245"], osm: ["contact:youtube", "youtube"], url: (h, p) => p === "P2397" ? `https://www.youtube.com/channel/${h}` : `https://www.youtube.com/@${h}` },
  threads: { label: "Threads", ic: "@", col: "#111", wd: ["P11892"], osm: ["contact:threads"], url: h => `https://www.threads.net/@${h}` },
  telegram: { label: "Telegram", ic: "TG", col: "#229ed9", wd: ["P3789"], osm: ["contact:telegram", "telegram"], url: h => `https://t.me/${h}` },
  whatsapp: { label: "WhatsApp", ic: "WA", col: "#25d366", wd: [], osm: ["contact:whatsapp", "whatsapp"], url: h => `https://wa.me/${h.replace(/\D/g, "")}` },
  linkedin: { label: "LinkedIn", ic: "in", col: "#0a66c2", wd: ["P4264"], osm: ["contact:linkedin", "linkedin"], url: h => `https://www.linkedin.com/company/${h}` },
  flickr: { label: "Flickr", ic: "••", col: "#ff0084", wd: ["P3267"], osm: ["contact:flickr"], url: h => `https://www.flickr.com/photos/${h}` },
  mastodon: { label: "Mastodon", ic: "M", col: "#6364ff", wd: ["P4033"], osm: ["contact:mastodon"], url: h => { const [u, host] = h.replace(/^@/, "").split("@"); return host ? `https://${host}/@${u}` : null; } },
  web: { label: "Sitio web", ic: "www", col: "#495057", wd: ["P856"], osm: ["contact:website", "website", "url"], url: h => /^https?:/i.test(h) ? h : `https://${h}` },
};
const WD_NET = {}; for (const [k, n] of Object.entries(NETS)) for (const p of n.wd) WD_NET[p] = k;
const SOCIAL_KEY_RE = "^(contact:)?(facebook|instagram|tiktok|twitter|x|youtube|threads|telegram|whatsapp|linkedin|flickr|mastodon)$";

// Convierte un usuario o un enlace en un enlace seguro (solo http/https)
function socialLink(net, value, prop) {
  const v = String(value || "").trim(); if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  if (/^(www\.|[a-z0-9-]+\.(com|net|org|me)\/)/i.test(v)) return "https://" + v;
  const u = NETS[net].url(net === "whatsapp" || net === "web" || net === "mastodon" ? v : v.replace(/^@/, "").split(/[/?#\s]/)[0], prop);
  return u && /^https?:\/\//i.test(u) ? u : null;
}
const handleOf = (net, url) => net === "youtube" && /\/channel\//.test(url) ? "Canal de YouTube" : net === "facebook" && /\/\d{9,}\/?$/.test(url) ? "Página de Facebook" : net === "web" ? url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "") : net === "whatsapp" ? "+" + url.replace(/\D/g, "") : decodeURIComponent((url.replace(/\/+$/, "").match(/[^/]+$/) || [""])[0]).replace(/^@?/, "@");
function addAcc(list, net, value, src, prop) {
  const url = socialLink(net, value, prop); if (!url) return;
  const k = url.toLowerCase().replace(/^https?:\/\/(www\.)?/, "").replace(/\/+$/, "");
  const prev = list.find(a => a.k === k);
  if (prev) { if (!prev.src.includes(src)) prev.src.push(src); return; }
  list.push({ net, url, k, handle: handleOf(net, url), src: [src] });
}
function socialFromClaims(cl) {
  const out = [];
  for (const [p, net] of Object.entries(WD_NET)) for (const c of cl[p] || []) if (c.rank !== "deprecated" && c.mainsnak && c.mainsnak.datavalue) addAcc(out, net, c.mainsnak.datavalue.value, "Wikidata", p);
  return out;
}
function socialFromTags(t, out = [], src = "OpenStreetMap") {
  for (const [net, n] of Object.entries(NETS)) for (const key of n.osm) if (t && t[key]) String(t[key]).split(";").forEach(v => addAcc(out, net, v, src));
  return out;
}
const byNet = list => list.sort((a, b) => Object.keys(NETS).indexOf(a.net) - Object.keys(NETS).indexOf(b.net));

// ---------- Cuentas oficiales del lugar ----------
// Si la información vino de una búsqueda en Wikipedia, se piden aparte las cuentas de su elemento de Wikidata
async function loadPlaceSocial(id) {
  const info = S.info; if (!info || !info.qid || info.social) return renderSocial();
  try {
    const d = await getJSON(`https://www.wikidata.org/w/api.php?action=wbgetentities&format=json&origin=*&ids=${info.qid}&props=claims`);
    if (id !== reqId) return;
    const e = d.entities && d.entities[info.qid];
    info.social = e ? socialFromClaims(e.claims || {}) : [];
  } catch (_) { if (id === reqId) info.social = []; }
  if (id === reqId) { renderSocial(); renderNav(); }
}
function placeAccounts() {
  const out = [];
  for (const a of (S.info && S.info.social) || []) addAcc(out, a.net, a.url, "Wikidata");
  if (S.info && S.info.web) addAcc(out, "web", S.info.web, "Wikidata");
  socialFromTags(S.place && S.place.extratags, out);
  return byNet(out);
}

// ---------- Cuentas de lugares cercanos ----------
// OpenStreetMap (comercios, posadas, instituciones con sus redes) y Wikidata (municipios, parques, museos, iglesias…)
const SOCIAL_KM = () => Math.min(10, Math.max(2, S.radius * 2 / 1000));
function socialOverpass(lat, lon, r) {
  return `[out:json][timeout:25];nwr(${bboxAround(lat, lon, r)})[~"${SOCIAL_KEY_RE}"~"."];out tags center 150;`;
}
function socialSparql(lat, lon, km) {
  const props = Object.keys(WD_NET).filter(p => p !== "P856").map(p => `(wdt:${p})`).join(" ");
  return `SELECT ?item ?itemLabel ?itemDescription ?coord ?p ?v WHERE {
  SERVICE wikibase:around { ?item wdt:P625 ?coord. bd:serviceParam wikibase:center "Point(${lon} ${lat})"^^geo:wktLiteral. bd:serviceParam wikibase:radius "${km}". }
  VALUES (?p) { ${props} } ?item ?p ?v.
  SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en". }
} LIMIT 400`;
}
const wktLL = s => { const m = /Point\(([-\d.]+) ([-\d.]+)\)/.exec(s || ""); return m ? { lat: +m[2], lon: +m[1] } : null; };
async function loadSocial(id) {
  S.busy.social = true; S.errs.social = null; renderSocial();
  const { lat, lon } = S.point, km = SOCIAL_KM(), body = "data=" + encodeURIComponent(socialOverpass(lat, lon, km * 1000));
  const osm = (async () => {
    let lastErr = null;
    for (const [i, ep] of OVERPASS.entries()) {
      try { return await getJSON(ep, { method: "POST", body, headers: FORM, key: "overpass\n" + body, stale: i === OVERPASS.length - 1 }, 30000, 1); } catch (e) { lastErr = e; }
    }
    throw lastErr;
  })();
  const wd = getJSON(`https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(socialSparql(lat, lon, km))}`, {}, 30000, 1);
  const [ro, rw] = await Promise.allSettled([osm, wd]);
  if (id !== reqId) return;
  const near = new Map();
  if (ro.status === "fulfilled") {
    esTags(ro.value);
    for (const el of (ro.value && ro.value.elements) || []) {
      const t = el.tags || {}, c = el.type === "node" ? el : el.center; if (!c) continue;
      const accs = socialFromTags(t); if (!accs.length) continue;
      const cat = classify(t);
      near.set("o" + el.type + el.id, { name: t.name || t.brand || t.operator || "", type: socialType(t, cat), lat: c.lat, lon: c.lon, d: dist(S.point, c), accs, src: "OpenStreetMap" });
    }
  }
  if (rw.status === "fulfilled") {
    for (const b of (rw.value && rw.value.results && rw.value.results.bindings) || []) {
      const qid = b.item.value.split("/").pop(), p = b.p.value.split("/").pop(), ll = wktLL(b.coord && b.coord.value); if (!ll) continue;
      if (!near.has(qid)) near.set(qid, { name: esName(b.itemLabel ? b.itemLabel.value : qid), type: b.itemDescription ? b.itemDescription.value : "Wikidata", lat: ll.lat, lon: ll.lon, d: dist(S.point, ll), accs: [], src: "Wikidata", qid });
      addAcc(near.get(qid).accs, WD_NET[p], b.v.value, "Wikidata", p);
    }
  }
  // Un mismo lugar registrado en las dos fuentes (mismo nombre y a menos de 300 m) se junta en una sola fila
  const list = [];
  for (const it of near.values()) {
    const twin = it.name && list.find(o => o.name.toLowerCase() === it.name.toLowerCase() && dist(o, it) < 300);
    if (twin) { it.accs.forEach(a => addAcc(twin.accs, a.net, a.url, it.src)); if (!twin.src.includes(it.src)) twin.src += " y " + it.src; }
    else list.push(it);
  }
  list.forEach(it => byNet(it.accs));
  S.social = list.filter(it => it.accs.length).sort((a, b) => a.d - b.d);
  S.busy.social = false;
  if (ro.status === "rejected" && rw.status === "rejected") S.errs.social = (ro.reason && ro.reason.message) || "No se pudieron consultar las redes de la zona";
  renderSocial(); renderNav();
  // las descripciones de Wikidata que solo existen en inglés se traducen al español
  const wdRows = S.social.filter(it => it.qid);
  if (wdRows.length) {
    const tr = await toEsMany(wdRows.map(it => it.type));
    if (id !== reqId) return;
    wdRows.forEach((it, i) => { it.type = tr[i] || it.type; });
    renderSocial();
  }
}
function socialType(t, cat) {
  const k = t.tourism || t.amenity || t.shop || t.historic || t.leisure || t.office || t.craft || t.club || t.sport || t.healthcare;
  const ES = { hotel: "Hotel", guest_house: "Posada", hostel: "Hostal", apartment: "Apartamentos", restaurant: "Restaurante", cafe: "Café", fast_food: "Comida rápida", bar: "Bar", pub: "Bar",
    bank: "Banco", supermarket: "Supermercado", bakery: "Panadería", clothes: "Tienda de ropa", convenience: "Abasto", hardware: "Ferretería", car_repair: "Taller", beauty: "Peluquería / estética",
    gym: "Gimnasio", fitness_centre: "Gimnasio", company: "Empresa", government: "Oficina de gobierno", ngo: "ONG", travel_agent: "Agencia de viajes", tour_operator: "Operador turístico", dentist: "Odontología",
    doctors: "Consultorio", veterinary: "Veterinaria", nightclub: "Discoteca", ice_cream: "Heladería", marketplace: "Mercado", sports_centre: "Centro deportivo", mall: "Centro comercial",
    library: "Biblioteca", theatre: "Teatro", cinema: "Cine", arts_centre: "Centro cultural", community_centre: "Centro comunitario", college: "Instituto", kindergarten: "Preescolar",
    courthouse: "Tribunal", embassy: "Embajada", post_office: "Correo", stadium: "Estadio", zoo: "Zoológico", gallery: "Galería", information: "Información turística",
    monument: "Monumento", memorial: "Memorial", church: "Iglesia", castle: "Fortaleza", bus_station: "Terminal de pasajeros", car_rental: "Alquiler de vehículos" };
  return ES[k] || (TYPE_ES[k] || (cat ? typeLabel(t, cat) : "Lugar"));
}

// ---------- Búsquedas listas en cada red ----------
// Las redes no dejan leer publicaciones sin cuenta ni clave, así que se abre su buscador con el lugar ya escrito
function socialSearches() {
  const ad = adminOf(S.place), name = (S.name && S.name !== "Punto seleccionado") ? S.name : (ad.localidad || ad.municipio || ad.estado || "");
  if (!name) return [];
  const q = encodeURIComponent(name), tag = name.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/gi, "").toLowerCase();
  const { lat, lon } = S.point, ctx = encodeURIComponent(`"${name}"${ad.estado && ad.estado !== name ? " " + ad.estado : ""}`);
  return [
    ["instagram", `#${tag}`, `https://www.instagram.com/explore/tags/${encodeURIComponent(tag)}/`],
    ["tiktok", "Videos", `https://www.tiktok.com/search?q=${q}`],
    ["youtube", "Videos recientes", `https://www.youtube.com/results?search_query=${q}&sp=CAI%253D`],
    ["facebook", "Páginas y grupos", `https://www.facebook.com/search/top?q=${q}`],
    ["x", "Lo último", `https://x.com/search?q=${q}&f=live`],
    ["threads", "Publicaciones", `https://www.threads.net/search?q=${q}`],
    ["flickr", "Fotos en el mapa", `https://www.flickr.com/map?fLat=${lat.toFixed(5)}&fLon=${lon.toFixed(5)}&zl=15`],
    ["reddit", "Conversaciones", `https://www.reddit.com/search/?q=${q}&sort=new`],
    ["google", "Todas las redes, último año", `https://www.google.com/search?q=${ctx}+(site:instagram.com+OR+site:tiktok.com+OR+site:facebook.com+OR+site:x.com+OR+site:youtube.com)&tbs=qdr:y`],
  ];
}
const EXTRA_NETS = { reddit: { label: "Reddit", ic: "r/", col: "#ff4500" }, google: { label: "Google", ic: "G", col: "#4285f4" } };
const netOf = k => NETS[k] || EXTRA_NETS[k];
const netIc = k => { const n = netOf(k); return `<i class="sic" style="--n:${n.col}">${esc(n.ic)}</i>`; };
const accLink = a => `<a class="sacc" href="${esc(a.url)}" target="_blank" rel="noopener nofollow" title="${esc(NETS[a.net].label)} · ${esc(a.src.join ? a.src.join(" y ") : a.src)}">${netIc(a.net)}<span>${esc(a.handle)}</span></a>`;

// ---------- Sección de la ficha ----------
function socialCount() { return placeAccounts().length + (S.social || []).filter(it => !(S.info && it.qid && it.qid === S.info.qid)).length; }
function renderSocial() {
  const el = $("#s-redes"); if (!el) return;
  const mine = placeAccounts(), near = S.socialShown = (S.social || []).filter(it => !(S.info && it.qid && it.qid === S.info.qid));
  const h = `<h3>Redes sociales <small>Wikidata · OpenStreetMap · ${fmtDist(SOCIAL_KM() * 1000)}</small></h3>`;
  const own = `<div class="sub" style="margin-top:4px">Cuentas oficiales del lugar</div>`
    + (mine.length ? `<div class="saccs">${mine.map(accLink).join("")}</div>`
      : S.busy.info ? `<div class="loading">Buscando cuentas del lugar…</div>`
      : `<p class="src">No hay cuentas oficiales registradas para este punto exacto. Abajo están las de los lugares cercanos y la búsqueda en cada red.</p>`);
  const srch = socialSearches();
  const search = srch.length ? `<div class="sub">Buscar “${esc(S.name && S.name !== "Punto seleccionado" ? S.name : srch[0][1])}” en cada red</div>
    <div class="ssearch">${srch.map(([k, t, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener nofollow">${netIc(k)}<span><b>${esc(netOf(k).label)}</b><small>${esc(t)}</small></span></a>`).join("")}</div>` : "";
  let around;
  if (S.busy.social) around = `<div class="loading">Buscando cuentas de lugares cercanos…</div>`;
  else if (S.errs.social) around = errBox("social", S.errs.social);
  else if (!near.length) around = `<p class="src">Ningún lugar cercano tiene redes registradas en OpenStreetMap ni Wikidata.</p>`;
  else {
    const nets = {}; near.forEach(it => it.accs.forEach(a => nets[a.net] = (nets[a.net] || 0) + 1));
    around = `<p class="src" style="margin:0 0 6px">${near.length} lugar${near.length === 1 ? "" : "es"} con redes: ${Object.entries(nets).map(([k, n]) => `${esc(NETS[k].label)} ${n}`).join(" · ")}</p>`
      + near.slice(0, 60).map((it, i) => `<div class="srow"><button class="sname" data-soc="${i}"><b>${esc(it.name || it.type)}</b><span>${esc(it.name ? it.type : it.src)} · ${fmtDist(it.d)} al ${rumbo(bearing(S.point, it))}</span></button>
        <div class="saccs">${it.accs.map(accLink).join("")}</div></div>`).join("")
      + (near.length > 60 ? `<p class="src">Se muestran los 60 más cercanos de ${near.length}.</p>` : "");
  }
  el.innerHTML = h + own + search + `<div class="sub">Cuentas de lugares cercanos</div>` + around
    + `<p class="src" style="margin-top:8px">Solo se muestran cuentas públicas de lugares e instituciones. Instagram, TikTok, Facebook y X no permiten leer sus publicaciones sin iniciar sesión, por eso los botones abren su buscador con el lugar ya escrito.</p>`;
}
