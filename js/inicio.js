// Arranque de la app
"use strict";

// ---------- Inicio ----------
renderEmpty();
Promise.all([loadCountry(), loadMine()]).then(() => {
  const start = parseCoords(decodeURIComponent(location.hash.slice(1)));
  if (start && inVenezuela(start.lat, start.lon)) selectPoint(start.lat, start.lon, { zoom: 15 });
});

// Modo app: el service worker solo funciona servida por http(s) (con los lanzadores o publicada en internet),
// no al abrir index.html con doble clic; en ese caso la app funciona igual pero sin instalación ni modo sin conexión.
if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
let installPrompt = null;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installPrompt = e; $("#btnInstall").hidden = false; });
$("#btnInstall").addEventListener("click", async () => {
  if (!installPrompt) return;
  installPrompt.prompt(); await installPrompt.userChoice.catch(() => {});
  installPrompt = null; $("#btnInstall").hidden = true;
});
window.addEventListener("appinstalled", () => { $("#btnInstall").hidden = true; toast("App instalada"); });
