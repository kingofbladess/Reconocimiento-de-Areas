// Utilidades, límites del área (Venezuela y Guyana), lugares destacados y estado global
"use strict";

const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const stripHtml = s => { const d = document.createElement("div"); d.innerHTML = s || ""; return (d.textContent || "").trim(); };
const rad = Math.PI / 180;
const cssVar = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

// ---------- Área de trabajo: Venezuela y Guyana ----------
const AREA_BBOX = { s: 0.6, w: -73.45, n: 12.25, e: -56.3 };
const AREA_CC = ["ve", "gy"]; // códigos de país que acepta la búsqueda
const inBBox = (lat, lon) => lat >= AREA_BBOX.s && lat <= AREA_BBOX.n && lon >= AREA_BBOX.w && lon <= AREA_BBOX.e;
let areaShape = null; // GeoJSON MultiPolygon de Venezuela + Guyana (datos/)
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
  ["Kaieteur (Guyana)", 5.1748, -59.4808, 14],
  ["Georgetown (Guyana)", 6.8013, -58.1551, 14],
];

// ---------- Estado ----------
const S = {
  point: null, place: null, search: null,
  radius: 1000, hiddenCats: new Set(),
  weather: null, air: null, info: null, sat: null, photos: [], wiki: [], feats: [], terrain: null, ground: null,
  custom: null, busy: {}, errs: {},
};
