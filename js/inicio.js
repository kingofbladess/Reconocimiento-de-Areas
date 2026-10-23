// Arranque de la app
"use strict";

// ---------- Inicio ----------
renderEmpty();
layoutSheet();
const fromHash = () => {
  const p = parseCoords(decodeURIComponent(location.hash.slice(1)));
  if (p && inArea(p.lat, p.lon) && !(S.point && dist(S.point, p) < 1)) selectPoint(p.lat, p.lon, { zoom: 15 });
};
Promise.all([loadCountry(), loadMine()]).then(fromHash);
addEventListener("hashchange", fromHash); // un enlace #lat,lon abierto con la app ya en pantalla

// Modo app: el service worker solo funciona servida por http(s) (con los lanzadores o publicada en internet),
// no al abrir index.html con doble clic; en ese caso la app funciona igual pero sin instalación ni modo sin conexión.
if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
  navigator.serviceWorker.register("sw.js", { updateViaCache: "none" }).then(reg => {
    // la app instalada puede quedar abierta días: al volver a ella se busca una versión nueva
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && !offline()) reg.update().catch(() => {}); });
  }).catch(() => {});
  let hadSW = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (hadSW) toast("App actualizada: los cambios se verán al volver a abrirla"); hadSW = true; });
}
let installPrompt = null;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installPrompt = e; $("#btnInstall").hidden = false; });
$("#btnInstall").addEventListener("click", async () => {
  if (!installPrompt) return;
  installPrompt.prompt(); await installPrompt.userChoice.catch(() => {});
  installPrompt = null; $("#btnInstall").hidden = true;
});
window.addEventListener("appinstalled", () => { $("#btnInstall").hidden = true; toast("App instalada"); });
