// Peticiones a servicios externos con reintentos, mensajes claros y copia guardada para usar sin conexión
"use strict";

// ---------- Copia local de las respuestas (IndexedDB) ----------
// Cada consulta que sale bien (clima, dirección, Wikipedia, OpenStreetMap…) se guarda en el navegador.
// Sin conexión, o si el servicio falla, la ficha se arma con la última copia y se avisa la fecha.
const RESP_MAX = 300, RESP_BYTES = 60e6;
const respDB = (() => {
  let dbp = null;
  // "resp" guarda los datos; "meta" solo fecha y tamaño, para recortar sin leer las respuestas completas
  const open = () => dbp || (dbp = new Promise((ok, fail) => {
    const r = indexedDB.open("reconocimiento-ve-datos", 1);
    r.onupgradeneeded = () => { r.result.createObjectStore("resp", { keyPath: "k" }); r.result.createObjectStore("meta", { keyPath: "k" }).createIndex("t", "t"); };
    r.onsuccess = () => ok(r.result); r.onerror = () => fail(r.error);
  }));
  const tx = async (stores, mode, fn) => { const db = await open(); return new Promise((ok, fail) => {
    const t = db.transaction(stores, mode), out = fn(t);
    t.oncomplete = () => ok(out && out.result); t.onerror = () => fail(t.error); t.onabort = () => fail(t.error); }); };
  let puts = 0;
  async function prune() {
    const all = await tx("meta", "readonly", t => t.objectStore("meta").index("t").getAll()); // de la más antigua a la más reciente
    let bytes = all.reduce((a, r) => a + (r.n || 0), 0), extra = all.length - RESP_MAX, i = 0;
    const drop = [];
    while (i < all.length && (extra-- > 0 || bytes > RESP_BYTES)) { bytes -= all[i].n || 0; drop.push(all[i].k); i++; }
    if (drop.length) await tx(["resp", "meta"], "readwrite", t => drop.forEach(k => { t.objectStore("resp").delete(k); t.objectStore("meta").delete(k); }));
  }
  return {
    get: async k => {
      const [r, m] = await Promise.all([tx("resp", "readonly", t => t.objectStore("resp").get(k)), tx("meta", "readonly", t => t.objectStore("meta").get(k))]).catch(() => []);
      return r && m ? { d: r.d, t: m.t } : null;
    },
    put: (k, d, n) => tx(["resp", "meta"], "readwrite", t => { t.objectStore("resp").put({ k, d }); t.objectStore("meta").put({ k, t: Date.now(), n }); })
      .then(() => { if (++puts % 25 === 0) prune(); }).catch(() => {}),
    stats: () => tx("meta", "readonly", t => t.objectStore("meta").getAll()).then(a => ({ n: a.length, bytes: a.reduce((s, r) => s + (r.n || 0), 0) })).catch(() => ({ n: 0, bytes: 0 })),
    clear: () => tx(["resp", "meta"], "readwrite", t => { t.objectStore("resp").clear(); t.objectStore("meta").clear(); }).catch(() => {}),
  };
})();
// Momento de la copia más antigua usada en la ficha actual (null si todo vino de la red)
const NET = { staleAt: null, onStale: null };
function markStale(t) {
  if (NET.staleAt && NET.staleAt <= t) return;
  NET.staleAt = t; if (NET.onStale) NET.onStale(t);
}

// ---------- Red ----------
// Un fallo de red sin código casi siempre es un límite de consultas (429) que el navegador oculta por CORS:
// se reintenta una vez y el mensaje no culpa a la conexión del usuario.
const netErr = (msg, retry) => Object.assign(new Error(msg), { retry });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const offline = () => navigator.onLine === false;
async function fetchJSON(url, opts, ms) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { ...opts, signal: ctl.signal });
    if (r.status === 429) throw netErr("El servicio está limitando las consultas por exceso de uso. Espera un momento y reintenta.", true);
    if (r.status >= 500) throw netErr(`El servicio está caído o saturado (error ${r.status}). Reintenta en unos minutos.`, true);
    if (!r.ok) throw netErr(`El servicio respondió con error ${r.status}`, false);
    const txt = await r.text(), d = JSON.parse(txt);
    if (d && d.error === true && d.reason) throw netErr(`El servicio rechazó la consulta: ${d.reason}`, false);
    return { d, n: txt.length };
  } catch (e) {
    if (e.name === "AbortError") throw netErr("El servicio tardó demasiado en responder", false);
    if (e instanceof TypeError) throw netErr(offline() ? "Sin conexión a internet." : "El servicio no respondió: puede estar saturado o limitando consultas. Reintenta en unos segundos.", true);
    throw e;
  } finally { clearTimeout(t); }
}
// opts.key: clave de la copia guardada (por defecto la dirección, más el cuerpo en las consultas POST de Overpass).
// opts.stale = false: si falla no usa la copia (para probar antes otro servidor de la lista).
// opts.check(d): valida la respuesta (lanza si no sirve); una respuesta inválida no se guarda ni se usa de copia.
const okData = (check, d) => { try { check(d); return true; } catch (_) { return false; } };
async function getJSON(url, options = {}, ms = 30000, tries = 2) {
  const { key: k, stale = true, check, ...opts } = options, key = k || (opts.body ? `${url}\n${opts.body}` : url);
  if (offline()) { // sin red no se espera a que venzan los tiempos: directo a la copia guardada
    const c = await respDB.get(key);
    if (c && (!check || okData(check, c.d))) { markStale(c.t); return c.d; }
    throw netErr("Sin conexión y sin datos guardados de este punto. Se guardan solos cada vez que abres una ficha con internet.", false);
  }
  for (let a = 1; ; a++) {
    try { const { d, n } = await fetchJSON(url, opts, ms); if (check) check(d); respDB.put(key, d, n); return d; }
    catch (e) {
      if (a < tries && e.retry) { await sleep(1800 * a); continue; }
      const c = stale && await respDB.get(key);
      if (c && (!check || okData(check, c.d))) { markStale(c.t); return c.d; }
      throw e;
    }
  }
}
const errBox = (key, msg, extra = "") => `<div class="err">${esc(msg)}${extra} <button class="copy" data-retry="${key}">Reintentar</button></div>`;
const WIKI = "https://es.wikipedia.org/w/api.php?format=json&origin=*&";
const COMMONS = "https://commons.wikimedia.org/w/api.php?format=json&origin=*&";
