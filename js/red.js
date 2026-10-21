// Peticiones a servicios externos con reintentos y mensajes claros
"use strict";

// ---------- Red ----------
// Un fallo de red sin código casi siempre es un límite de consultas (429) que el navegador oculta por CORS:
// se reintenta una vez y el mensaje no culpa a la conexión del usuario.
const netErr = (msg, retry) => Object.assign(new Error(msg), { retry });
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function fetchJSON(url, opts, ms) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { ...opts, signal: ctl.signal });
    if (r.status === 429) throw netErr("El servicio está limitando las consultas por exceso de uso. Espera un momento y reintenta.", true);
    if (r.status >= 500) throw netErr(`El servicio está caído o saturado (error ${r.status}). Reintenta en unos minutos.`, true);
    if (!r.ok) throw netErr(`El servicio respondió con error ${r.status}`, false);
    const d = await r.json();
    if (d && d.error === true && d.reason) throw netErr(`El servicio rechazó la consulta: ${d.reason}`, false);
    return d;
  } catch (e) {
    if (e.name === "AbortError") throw netErr("El servicio tardó demasiado en responder", false);
    if (e instanceof TypeError) throw netErr(navigator.onLine === false ? "Sin conexión a internet." : "El servicio no respondió: puede estar saturado o limitando consultas. Reintenta en unos segundos.", true);
    throw e;
  } finally { clearTimeout(t); }
}
async function getJSON(url, opts = {}, ms = 30000, tries = 2) {
  for (let a = 1; ; a++) {
    try { return await fetchJSON(url, opts, ms); }
    catch (e) { if (a >= tries || !e.retry) throw e; await sleep(1800 * a); }
  }
}
const errBox = (key, msg, extra = "") => `<div class="err">${esc(msg)}${extra} <button class="copy" data-retry="${key}">Reintentar</button></div>`;
const WIKI = "https://es.wikipedia.org/w/api.php?format=json&origin=*&";
const COMMONS = "https://commons.wikimedia.org/w/api.php?format=json&origin=*&";
