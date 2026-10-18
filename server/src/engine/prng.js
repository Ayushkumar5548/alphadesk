'use strict';
// Deterministic PRNG utilities: mulberry32 + FNV-1a string hashing.

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash32(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Deterministic RNG seeded from arbitrary string parts.
function rngFor(...parts) {
  return mulberry32(hash32(parts.join('|')));
}

function rr(rng, lo, hi) {
  return lo + (hi - lo) * rng();
}

function rint(rng, lo, hi) {
  return Math.floor(lo + (hi - lo + 1) * rng());
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function round(v, dp = 2) {
  const m = Math.pow(10, dp);
  return Math.round(v * m) / m;
}

function logUniform(rng, lo, hi) {
  return Math.exp(rr(rng, Math.log(lo), Math.log(hi)));
}

// ---- date helpers (all month keys are "YYYY-MM", days "YYYY-MM-DD") ----

function ymIndex(ym) {
  const [y, m] = ym.split('-').map(Number);
  return (y - 2000) * 12 + (m - 1);
}

function indexToYm(idx) {
  const y = Math.floor(idx / 12) + 2000;
  const m = (idx % 12) + 1;
  return `${y}-${String(m).padStart(2, '0')}`;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function fmtDate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function todayYm() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

// First day of month as "YYYY-MM-01".
function ymFirstDay(ym) {
  return `${ym}-01`;
}

module.exports = {
  mulberry32, hash32, rngFor, rr, rint, clamp, round, logUniform,
  ymIndex, indexToYm, fmtDate, todayYm, ymFirstDay, pad2,
};
