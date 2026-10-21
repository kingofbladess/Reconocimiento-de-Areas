// Formatos de coordenadas (GMS, UTM) y geometría
"use strict";

// ---------- Formatos y geometría ----------
function toDMS(v, pos, neg) {
  const h = v >= 0 ? pos : neg; v = Math.abs(v);
  let d = Math.floor(v), m = Math.floor((v - d) * 60), s = ((v - d) * 60 - m) * 60;
  if (s >= 59.995) { s = 0; m++; } if (m >= 60) { m = 0; d++; }
  return `${d}°${String(m).padStart(2, "0")}'${s.toFixed(2).padStart(5, "0")}"${h}`;
}
function toUTM(lat, lon) {
  const a = 6378137, f = 1 / 298.257223563, k0 = 0.9996, e2 = f * (2 - f), ep2 = e2 / (1 - e2);
  const zone = Math.floor((lon + 180) / 6) + 1, lon0 = (zone - 1) * 6 - 180 + 3;
  const p = lat * rad, l = (lon - lon0) * rad;
  const N = a / Math.sqrt(1 - e2 * Math.sin(p) ** 2), T = Math.tan(p) ** 2, C = ep2 * Math.cos(p) ** 2, A = Math.cos(p) * l;
  const M = a * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * p - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * p)
    + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * p) - (35 * e2 ** 3 / 3072) * Math.sin(6 * p));
  const x = k0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T * T + 72 * C - 58 * ep2) * A ** 5 / 120) + 500000;
  let y = k0 * (M + N * Math.tan(p) * (A * A / 2 + (5 - T + 9 * C + 4 * C * C) * A ** 4 / 24 + (61 - 58 * T + T * T + 600 * C - 330 * ep2) * A ** 6 / 720));
  if (lat < 0) y += 10000000;
  return `${zone}${"CDEFGHJKLMNPQRSTUVWXX"[Math.floor((lat + 80) / 8)]} ${Math.round(x)} E ${Math.round(y)} N`;
}
function parseCoords(str) {
  const s = str.trim().replace(/,/g, " ").replace(/\s+/g, " ");
  const dec = s.match(/^(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)$/);
  if (dec) { const lat = +dec[1], lon = +dec[2]; return Math.abs(lat) <= 90 && Math.abs(lon) <= 180 ? { lat, lon } : null; }
  const re = /(\d+(?:\.\d+)?)\s*[°º d]\s*(?:(\d+(?:\.\d+)?)\s*['’′m]?\s*)?(?:(\d+(?:\.\d+)?)\s*(?:["”″]|''|s)?\s*)?([NSEOW])/gi;
  const parts = [...str.matchAll(re)];
  if (parts.length === 2) {
    const val = m => (+m[1] + (+m[2] || 0) / 60 + (+m[3] || 0) / 3600) * (/[SOW]/i.test(m[4]) ? -1 : 1);
    let [a, b] = parts; if (/[EOW]/i.test(a[4])) [a, b] = [b, a];
    return { lat: val(a), lon: val(b) };
  }
  return null;
}
function dist(a, b) {
  const R = 6371008.8, dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function bearing(a, b) {
  const y = Math.sin((b.lon - a.lon) * rad) * Math.cos(b.lat * rad);
  const x = Math.cos(a.lat * rad) * Math.sin(b.lat * rad) - Math.sin(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos((b.lon - a.lon) * rad);
  return (Math.atan2(y, x) / rad + 360) % 360;
}
const rumbo = deg => ["N", "NE", "E", "SE", "S", "SO", "O", "NO"][Math.round(deg / 45) % 8];
const fmtDist = m => m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
const fmtNum = n => Number(n).toLocaleString("es-VE");
