// Modelo de elevación en el navegador: teselas Terrarium (AWS Terrain Tiles, sin clave), altitud al instante y capa de pendientes
"use strict";

// ---------- Modelo de elevación (DEM) ----------
// Cada píxel de una tesela Terrarium codifica la altitud: (R·256 + G + B/256) − 32768 m.
// En Venezuela el dato es SRTM de ~30 m; el mar trae batimetría, que se recorta a 0 para el análisis en tierra.
const DEM_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
const DEM_Z = 12; // ~38 m por píxel en Venezuela: suficiente para puntos, perfiles y cuadros de análisis
const DEM_SRC = "SRTM 30 m (AWS Terrain Tiles)";
const demCache = new Map(), DEM_MAX = 80;
function demTile(z, x, y) {
  const k = `${z}/${x}/${y}`;
  if (demCache.has(k)) { const v = demCache.get(k); demCache.delete(k); demCache.set(k, v); return v; }
  const p = new Promise((ok, fail) => {
    const img = new Image(); img.crossOrigin = "anonymous";
    img.onload = () => {
      const c = document.createElement("canvas"); c.width = c.height = 256;
      const cx = c.getContext("2d", { willReadFrequently: true }); cx.drawImage(img, 0, 0);
      const d = cx.getImageData(0, 0, 256, 256).data, out = new Float32Array(65536);
      for (let i = 0; i < 65536; i++) out[i] = d[i * 4] * 256 + d[i * 4 + 1] + d[i * 4 + 2] / 256 - 32768;
      ok(out);
    };
    img.onerror = () => { demCache.delete(k); fail(new Error("No se pudo cargar el modelo de elevación")); };
    img.src = DEM_URL.replace("{z}", z).replace("{x}", x).replace("{y}", y);
  });
  demCache.set(k, p);
  if (demCache.size > DEM_MAX) demCache.delete(demCache.keys().next().value);
  return p;
}
// Posición en píxeles globales de la proyección web Mercator
function demPx(lat, lon, z) {
  const n = 256 * 2 ** z, s = Math.sin(lat * rad);
  return { x: (lon + 180) / 360 * n, y: (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n };
}
async function elevAt(lat, lon, z = DEM_Z) {
  const p = demPx(lat, lon, z), x0 = Math.floor(p.x - 0.5), y0 = Math.floor(p.y - 0.5), fx = p.x - 0.5 - x0, fy = p.y - 0.5 - y0;
  const px = async (X, Y) => { const t = await demTile(z, X >> 8, Y >> 8); return t[(Y & 255) * 256 + (X & 255)]; };
  const [a, b, c, d] = await Promise.all([px(x0, y0), px(x0 + 1, y0), px(x0, y0 + 1), px(x0 + 1, y0 + 1)]);
  return Math.max(0, a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy);
}
const demElevations = pts => Promise.all(pts.map(p => elevAt(p.lat, p.lon)));

// ---------- Altitud bajo el cursor ----------
let hoverTimer = 0, hoverLL = null;
function hoverElevation(ll, cb) {
  hoverLL = ll; clearTimeout(hoverTimer);
  hoverTimer = setTimeout(() => { const q = hoverLL; elevAt(q.lat, q.lng).then(v => { if (q === hoverLL) cb(v); }).catch(() => {}); }, 60);
}

// ---------- Capa de pendientes ----------
// Colorea cada píxel según su inclinación: lectura inmediata de por dónde se puede transitar.
const SLOPE_STOPS = [[5, null, "< 5° llano"], [15, [250, 204, 21], "5–15° moderada"], [30, [249, 115, 22], "15–30° fuerte"], [45, [220, 38, 38], "30–45° muy fuerte"], [91, [127, 29, 29], "> 45° escarpada"]];
const SlopeLayer = L.GridLayer.extend({
  createTile(co, done) {
    const c = document.createElement("canvas"); c.width = c.height = 256;
    demTile(co.z, co.x, co.y).then(h => {
      const cx = c.getContext("2d"), img = cx.createImageData(256, 256), d = img.data;
      const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * (co.y + 0.5) / 2 ** co.z))) / rad;
      const m = 40075016.7 * Math.cos(lat * rad) / (256 * 2 ** co.z); // metros por píxel
      const at = (x, y) => h[Math.min(255, Math.max(0, y)) * 256 + Math.min(255, Math.max(0, x))];
      for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
        const gx = (at(x + 1, y) - at(x - 1, y)) / (2 * m), gy = (at(x, y + 1) - at(x, y - 1)) / (2 * m);
        const s = Math.atan(Math.hypot(gx, gy)) / rad, i = (y * 256 + x) * 4;
        if (at(x, y) <= 0 && s < 1) continue; // mar
        const st = SLOPE_STOPS.find(t => s < t[0]);
        if (!st[1]) { d[i] = 34; d[i + 1] = 197; d[i + 2] = 94; d[i + 3] = 40; continue; }
        d[i] = st[1][0]; d[i + 1] = st[1][1]; d[i + 2] = st[1][2]; d[i + 3] = 150;
      }
      cx.putImageData(img, 0, 0); done(null, c);
    }).catch(e => done(e, c));
    return c;
  },
});
const slopeLayer = new SlopeLayer({ minZoom: 9, maxNativeZoom: 14, minNativeZoom: 9, zIndex: 350, opacity: 0.85, attribution: "Pendientes: AWS Terrain Tiles (SRTM)" });
function setSlopes(on) {
  $("#btnSlope").setAttribute("aria-pressed", on); $("#slopeLegend").hidden = !on;
  if (on) { slopeLayer.addTo(map); if (map.getZoom() < 9) toast("Acerca el mapa para ver las pendientes"); }
  else map.removeLayer(slopeLayer);
}
$("#slopeLegend").innerHTML = "<b>Pendiente</b>" + SLOPE_STOPS.map(([, c, t]) => `<span><i style="background:${c ? `rgb(${c})` : "rgba(34,197,94,.35)"}"></i>${t}</span>`).join("");
$("#btnSlope").addEventListener("click", () => setSlopes($("#btnSlope").getAttribute("aria-pressed") !== "true"));
