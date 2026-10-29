// A florist's kit for the starters you build yourself (custom.js): one flower of each kind a
// decorator works with, one sprig of each greenery, and a way to dress a shape with them (how many,
// which kinds, which colours, how much of each) from the knobs a starter shows (floralKnobs). Each
// flower is built facing up at the origin and put in place by facing(), as in shapes.js.
import {
  shape, made, rod, ball, blob, bloom, daisy, calla, orchid, torch, leaf, frond, sprig, facing, tipped, rng,
  LEAF, DARK_LEAF, PALM, MONSTERA, EUCALYPTUS, STEM, SPADIX, CENTRE,
} from "./shapes.js";

export const FLOWERS = ["rose", "peony", "hydrangea", "orchid", "gerbera", "calla", "anthurium", "ginger", "babysbreath", "mixed"];
export const GREENS = ["eucalyptus", "fern", "palm", "monstera", "ivy", "mixed"];

// the colours a colour knob offers first (any other through the picker), by its palette
export const PALETTES = {
  flowers: ["#f7f5ef", "#f0e6cf", "#f2c4c0", "#f09ab0", "#c72e83", "#c41a24", "#6e1424", "#f2735f", "#f7b38a", "#f28524",
            "#f9cc3a", "#c3a3dc", "#7a4a9a", "#8fb3d9"],
  glass: ["#dbe6e6", "#c98a3c", "#6f7173", "#5f8f6a", "#5f86b5", "#e7a7b8", "#b39bd6", "#d4ad5c"],
  frame: ["#d1ab5c", "#f2f1ec", "#212121", "#855c38", "#c8c9cc", "#b8855f"],
  cloth: ["#f7f5ef", "#f0e6cf", "#f2c4c0", "#a9b8a0", "#8fb3d9", "#d9c6a5", "#6e1424", "#212121"],
};

const IVY = [0.2, 0.36, 0.2], FERN = [0.31, 0.5, 0.26];

// One flower of `kind`, b across, at p facing the unit direction d; `spin` turns it about d.
export function flower(s, kind, b, col, p, d, spin = 0) {
  facing(d, p, () => {
    if (kind === "rose") bloom(s, b, 0, 0, 0, col, spin);
    else if (kind === "peony") peony(s, b * 1.25, col, spin);
    else if (kind === "hydrangea") hydrangea(s, b * 1.15, col, spin);
    else if (kind === "orchid") orchid(s, b * 1.5, col);
    else if (kind === "gerbera") daisy(s, b * 1.45, col, col === CENTRE ? DARK_LEAF : CENTRE, 14);
    else if (kind === "calla") calla(s, b * 1.3, col);
    else if (kind === "anthurium") anthurium(s, b * 1.4, col, spin);
    else if (kind === "ginger") torch(s, b * 2.2, col);
    else babys(s, b, col, spin);
  });
}
// a peony: a rose's heart in a broad ruff of loose, cupped petals
function peony(s, b, col, spin) {
  bloom(s, b * 0.8, 0, b * 0.05, 0, col, spin);
  const pale = col.map((v) => v + (1 - v) * 0.18);
  made("satin", () => { for (let k = 0; k < 8; k++) {
    const a = spin + (k / 8) * 2 * Math.PI;
    blob(s, b * 0.26, b * 0.07, b * 0.3, Math.sin(a) * b * 0.42, b * 0.06, Math.cos(a) * b * 0.42, k % 2 ? col : pale, a, 6);
  } });
}
// a hydrangea's head: a dome of small four-petalled florets
function hydrangea(s, b, col, spin) {
  const rnd = rng(Math.round(spin * 1000) + 7), deep = col.map((v) => v * 0.86);
  made("satin", () => { for (let k = 0; k < 22; k++) {
    const a = k * 2.4 + spin, r = Math.sqrt((k + 0.5) / 22), x = Math.sin(a) * r * b * 0.5, z = Math.cos(a) * r * b * 0.5;
    blob(s, b * 0.11, b * 0.05, b * 0.11, x, b * 0.32 * Math.sqrt(1 - r * r * 0.9), z, rnd() < 0.3 ? deep : col, a, 4);
  } });
}
// an anthurium: a glossy heart-shaped spathe and its upright spadix
function anthurium(s, b, col, spin) {
  made("satin", () => {
    blob(s, b * 0.36, b * 0.03, b * 0.42, 0, 0, 0, col, spin, 8);
    rod(s, [0, 0.01, 0], [b * 0.05, b * 0.42, b * 0.06], b * 0.045, SPADIX, 5);
  });
}
// baby's breath: a spray of tiny florets on fine stems
function babys(s, b, col, spin) {
  const rnd = rng(Math.round(spin * 1000) + 3);
  made("satin", () => { for (let k = 0; k < 12; k++) {
    const a = rnd() * 6.3, r = b * 0.5 * Math.sqrt(rnd());
    ball(s, b * (0.06 + 0.04 * rnd()), Math.sin(a) * r, b * 0.3 * rnd(), Math.cos(a) * r, col, 4);
  } });
}

// One piece of greenery of `kind`, len long, from p toward the unit direction d.
export function green(s, kind, p, d, len, seed) {
  const a = Math.atan2(d[0], d[2]);
  if (kind === "eucalyptus") sprig(s, p, d, len, seed);
  else if (kind === "fern") frond(s, p, a, len * 0.8, FERN);
  else if (kind === "palm") frond(s, p, a, len * 1.1, seed % 2 ? PALM : DARK_LEAF);
  else if (kind === "monstera") leaf(s, p, d, len * 0.75, 0.45, MONSTERA);
  else ivy(s, p, len, seed);
}
// a strand of ivy falling from p, len long: small leaves either side of a thin stem
export function ivy(s, p, len, seed, col = IVY) {
  const rnd = rng(seed), n = Math.max(3, Math.round(len / 0.06));
  let prev = p;
  for (let k = 1; k <= n; k++) {
    const t = k / n, q = [p[0] + 0.04 * Math.sin(t * 5 + seed), p[1] - len * t, p[2] + 0.04 * Math.cos(t * 4 + seed)];
    rod(s, prev, q, 0.002, STEM, 3);
    const side = k % 2 ? 1 : -1, l = 0.035 + 0.015 * rnd();
    blob(s, l * 0.55, 0.003, l * 0.5, q[0] + side * 0.02, q[1], q[2], k % 3 ? col : LEAF, rnd() * 6.3, 5);
    prev = q;
  }
}

// ---------------------------------------------------------------- the knobs and the dressing
// The knobs a floral starter shows, its own values given: how many flowers, the main kind and its
// colour, the accent kind, its colour and its share, the flowers' size; how much greenery and which.
export function floralKnobs(v = {}) {
  const own = { flowers: 160, flower: "rose", tint: "#f7f5ef", accent: "hydrangea", accenttint: "#f2c4c0", share: 30, bloomsize: 0.08,
                greens: 90, green: "eucalyptus", ...v };
  return {
    flowers: { min: 0, max: 400, value: own.flowers, part: "flowers" },
    flower: { choices: FLOWERS, value: own.flower, part: "flowers" },
    tint: { colour: true, palette: "flowers", value: own.tint, part: "flowers" },
    accent: { choices: FLOWERS, value: own.accent, part: "flowers" },
    accenttint: { colour: true, palette: "flowers", value: own.accenttint, part: "flowers" },
    share: { min: 0, max: 100, step: 5, value: own.share, unit: "%", part: "flowers" },
    bloomsize: { min: 0.04, max: 0.16, step: 0.005, value: own.bloomsize, size: true, part: "flowers" },
    greens: { min: 0, max: 300, value: own.greens, part: "greenery" },
    green: { choices: GREENS, value: own.green, part: "greenery" },
  };
}
// the kind of the k-th flower of a "mixed" choice (the ones a florist mixes)
const MIX = ["rose", "hydrangea", "peony", "orchid", "babysbreath", "rose", "gerbera"];
const kindOf = (kind, k) => (kind === "mixed" ? MIX[k % MIX.length] : kind);
const greenOf = (kind, k) => (kind === "mixed" ? GREENS[k % 5] : kind);
// Dress a shape: k.greens pieces of greenery first, then k.flowers flowers over them, each where
// spot(rnd, k) puts it ([p, d] a point and the way it faces, or null to leave it out: a part of an
// arch left bare); k.share in a hundred of the flowers the accent kind in its colour.
export function dress(s, k, spot, seed, greenLen = 0.3) {
  const rnd = rng(seed);
  for (let n = 0; n < (k.greens || 0); n++) {
    const at = spot(rnd, n, true);
    if (!at) continue;
    const kind = greenOf(k.green, n);
    // (a strand stops short of the floor)
    if (kind === "ivy") { const len = Math.min(greenLen * (0.8 + 0.8 * rnd()), at[0][1] - 0.03); if (len > 0.05) ivy(s, at[0], len, seed + n); }
    else green(s, kind, at[0], at[1], greenLen * (0.7 + 0.6 * rnd()), seed + n);
  }
  for (let n = 0; n < (k.flowers || 0); n++) {
    const at = spot(rnd, n, false);
    if (!at) continue;
    const accent = rnd() * 100 < (k.share || 0), kind = kindOf(accent ? k.accent : k.flower, n);
    flower(s, kind, (k.bloomsize || 0.08) * (0.85 + 0.3 * rnd()), accent ? k.accenttint : k.tint, at[0], at[1], rnd() * 6.3);
  }
}
// a unit direction out from a line's direction t (in x-y), tipped toward the front (+z) by q
export function around(t, q) {
  const n = [-t[1], t[0], 0], d = [n[0] * Math.cos(q), n[1] * Math.cos(q), Math.sin(q)], L = Math.hypot(...d) || 1;
  return d.map((v) => v / L);
}
export { shape, tipped };
