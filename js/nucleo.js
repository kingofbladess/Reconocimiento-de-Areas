// Utilidades, límites de Venezuela, lugares destacados y estado global
"use strict";

const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const stripHtml = s => { const d = document.createElement("div"); d.innerHTML = s || ""; return (d.textContent || "").trim(); };
const rad = Math.PI / 180;
const cssVar = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

// ---------- Venezuela ----------
const VE_BBOX = { s: 0.6, w: -73.45, n: 12.25, e: -59.75 };
const inBBox = (lat, lon) => lat >= VE_BBOX.s && lat <= VE_BBOX.n && lon >= VE_BBOX.w && lon <= VE_BBOX.e;
let veShape = null; // GeoJSON (Multi)Polygon del país, cargado de Nominatim
const FEATURED = [
  // Coordenadas verificadas con OpenStreetMap (Nominatim), 2026-10-21
  ["Salto Ángel", 5.9688, -62.5361, 14],
  ["Monte Roraima", 5.2019, -60.7376, 13],
  ["Los Roques", 11.9536, -66.6786, 13],
  ["Pico Bolívar", 8.5411, -71.0483, 14],
  ["Puente sobre el Lago", 10.5747, -71.5726, 14],
  ["Puente Angostura", 8.1443, -63.5981, 15],
  ["Médanos de Coro", 11.4384, -69.6578, 13],
  ["Caracas", 10.5061, -66.9146, 15],
  ["Morrocoy", 10.8667, -68.2833, 13],
  ["Mochima", 10.3500, -64.3500, 13],
];

// ---------- Estado ----------
const S = {
  point: null, place: null, search: null,
  radius: 1000, hiddenCats: new Set(),
  weather: null, air: null, info: null, photos: [], wiki: [], feats: [], quakes: [], terrain: null, ground: null,
  custom: null, busy: {}, errs: {},
};
