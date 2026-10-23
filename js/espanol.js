// Todo en español: nombres de OpenStreetMap en inglés (sobre todo en Guyana) y traducción de textos de Wikipedia y Commons
"use strict";

// ---------- Nombres de lugares ----------
// En Guyana OpenStreetMap trae los nombres en inglés ("Essequibo River", "Rest of Region 8").
// Se traducen las palabras genéricas y se deja el nombre propio: "Essequibo River" → "Río Essequibo".
const NAME_RULES = [
  [/^Rest of Region (\d+)$/i, "Resto de la Región $1"],
  [/^Region (\d+)$/i, "Región $1"],
  [/^(.+?) Neighbourhood Democratic Council$/i, "Consejo Vecinal de $1"],
  [/^(.+?) Village District$/i, "Distrito de $1"],
  [/^(.+?) Local Government$/i, "Gobierno Local de $1"],
  [/^(.+?) (?:Municipality|Town Council)$/i, "Municipio de $1"],
  [/^(.+?) River$/i, "Río $1"], [/^River (.+)$/i, "Río $1"],
  [/^(.+?) Over the Creek$/i, "$1 al otro lado del caño"], [/^(.+?) Creek$/i, "Caño $1"],
  [/^(.+?) (?:Falls|Fall)$/i, "Salto $1"],
  [/^(.+?) Rapids$/i, "Raudales de $1"],
  [/^(.+?) Mountains$/i, "Montañas $1"], [/^(.+?) Mountain$/i, "Cerro $1"], [/^Mount (.+)$/i, "Monte $1"],
  [/^(.+?) Hills?$/i, "Colinas $1"],
  [/^(.+?) Island$/i, "Isla $1"], [/^(.+?) Islands$/i, "Islas $1"],
  [/^Lake (.+)$/i, "Lago $1"], [/^(.+?) Lake$/i, "Lago $1"],
  [/^(.+?) Reservoir$/i, "Embalse $1"], [/^(.+?) Swamp$/i, "Pantano $1"],
  [/^(.+?) National Park$/i, "Parque Nacional $1"], [/^(.+?) Park$/i, "Parque $1"],
  [/^(.+?) Bridge$/i, "Puente $1"],
  [/^(.+?) (?:International )?Airport$/i, "Aeropuerto $1"], [/^(.+?) Air ?strip$/i, "Pista de aterrizaje $1"],
  [/^(.+?) (?:Public )?Hospital$/i, "Hospital $1"], [/^(.+?) Health (?:Centre|Center|Post)$/i, "Centro de salud $1"],
  [/^(.+?) Police Station$/i, "Comisaría de policía $1"], [/^(.+?) Fire Station$/i, "Estación de bomberos $1"],
  [/^(.+?) (?:Secondary|Primary|Nursery) School$/i, "Escuela $1"], [/^(.+?) School$/i, "Escuela $1"],
  [/^(.+?) Church$/i, "Iglesia $1"], [/^(.+?) Mosque$/i, "Mezquita $1"], [/^(.+?) Mandir$/i, "Templo hindú $1"],
  [/^(.+?) Market$/i, "Mercado $1"], [/^(.+?) Stelling$/i, "Muelle $1"], [/^(.+?) Wharf$/i, "Muelle $1"],
  [/^(.+?) Street$/i, "Calle $1"], [/^(.+?) Avenue$/i, "Avenida $1"], [/^(.+?) (?:Road|Rd)$/i, "Carretera $1"],
  [/^(.+?) Highway$/i, "Autopista $1"], [/^(.+?) Trail$/i, "Sendero $1"], [/^(.+?) Lane$/i, "Callejón $1"],
  [/^(.+?) Village$/i, "Aldea $1"], [/^(.+?) Settlement$/i, "Asentamiento $1"], [/^(.+?) Mine$/i, "Mina $1"],
];
const WORDS = [[/\bEast\b/g, "Este"], [/\bWest\b/g, "Oeste"], [/\bNorth\b/g, "Norte"], [/\bSouth\b/g, "Sur"], [/\bUpper\b/g, "Alto"], [/\bLower\b/g, "Bajo"], [/\bOver the\b/g, "sobre el"]];
const COUNTRY_ES = { Guyana: "Guyana", Brazil: "Brasil", Suriname: "Surinam", "Trinidad and Tobago": "Trinidad y Tobago" };
function esName(s) {
  if (!s || typeof s !== "string") return s;
  let out = s.trim();
  for (const [re, to] of NAME_RULES) if (re.test(out)) { out = out.replace(re, to); break; }
  for (const [re, to] of WORDS) out = out.replace(re, to);
  return COUNTRY_ES[out] || out;
}
// Resultado de Nominatim (búsqueda o dirección): nombre, partes de la dirección y nombre completo
function esPlace(d) {
  if (!d || typeof d !== "object") return d;
  if (d.name) d.name = esName(d.name);
  if (d.address) for (const k of Object.keys(d.address)) if (!/code|ISO/.test(k)) d.address[k] = esName(d.address[k]);
  if (d.display_name) d.display_name = d.display_name.split(", ").map(esName).join(", ");
  return d;
}
// Etiquetas de OpenStreetMap (Overpass): el nombre en español si existe; si no, el traducido
function esTags(data) {
  for (const el of (data && data.elements) || []) {
    const t = el.tags; if (!t) continue;
    if (t["name:es"]) t.name = t["name:es"]; else if (t.name) t.name = esName(t.name);
  }
  return data;
}

// ---------- Traducción automática de textos (inglés → español) ----------
// Wikipedia en inglés y las descripciones de Commons. Primero el traductor de Google; si no responde, MyMemory.
// Cada traducción queda guardada (también sin conexión) gracias a getJSON.
const EN_WORDS = /\b(the|of|and|is|was|with|from|which|located|river|village|town|near|this|in the|on the|photo|view)\b/gi;
const ES_WORDS = /\b(el|la|los|las|del|que|y|es|en el|en la|con|una|un|por|río|ciudad)\b/gi;
function looksEnglish(s) {
  if (!s || s.length < 12) return false;
  const en = (s.match(EN_WORDS) || []).length, es = (s.match(ES_WORDS) || []).length;
  return en >= 2 && en > es;
}
// Google detecta el idioma: si el texto ya está en español se deja tal cual
async function translateChunk(q) {
  try {
    const d = await getJSON(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=es&dt=t&q=${encodeURIComponent(q)}`, {}, 12000, 1);
    if (d && d[2] === "es") return q;
    const t = (d && d[0] || []).map(x => x[0]).join("");
    if (t) return t;
  } catch (_) { /* respaldo */ }
  if (!looksEnglish(q)) return q; // MyMemory no detecta el idioma: solo se le envía lo que claramente está en inglés
  const d = await getJSON(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=en|es`, {}, 12000, 1);
  const t = d && d.responseData && d.responseData.translatedText;
  if (!t || /MYMEMORY WARNING|QUOTA/i.test(t)) throw new Error("sin traducción");
  return t;
}
// Divide en trozos de menos de 450 caracteres sin cortar oraciones (MyMemory no acepta textos largos)
function chunks(s) {
  const parts = s.match(/[^.!?\n]+[.!?]*\s*|\n/g) || [s], out = [];
  let cur = "";
  for (const p of parts) { if ((cur + p).length > 450 && cur) { out.push(cur); cur = ""; } cur += p; }
  if (cur) out.push(cur);
  return out;
}
// Devuelve el texto en español; si no se puede traducir, el original
async function toEs(s) {
  if (!looksEnglish(s)) return s;
  try { return (await Promise.all(chunks(s).map(translateChunk))).join("").trim() || s; } catch (_) { return s; }
}
// Varios textos cortos en una sola consulta (por ejemplo, los títulos de las fotos).
// all: también los que no parecen inglés a simple vista (títulos cortos como "Golden dart-poison frog")
async function toEsMany(list, all = false) {
  const idx = list.map((s, i) => s && (all ? s.length > 3 : looksEnglish(s)) ? i : -1).filter(i => i >= 0);
  if (!idx.length) return list;
  const out = list.slice();
  try {
    let batch = [];
    const flush = async () => {
      if (!batch.length) return;
      const tr = (await translateChunk(batch.map(i => list[i].replace(/\n/g, " ")).join("\n"))).split("\n");
      if (tr.length === batch.length) batch.forEach((i, k) => { out[i] = tr[k].trim() || list[i]; });
      batch = [];
    };
    for (const i of idx) { if (batch.reduce((a, j) => a + list[j].length + 1, 0) + list[i].length > 440) await flush(); batch.push(i); }
    await flush();
  } catch (_) { /* quedan en el idioma original */ }
  return out;
}
