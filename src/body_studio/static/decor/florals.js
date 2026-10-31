// A florist's kit for the starters you build yourself (custom.js): one flower of each kind a
// decorator works with, one sprig of each greenery, and a way to dress a shape with them (how many,
// which kinds, which colours, how much of each) from the knobs a starter shows (floralKnobs). Each
// flower is built facing up at the origin and put in place by facing(), as in shapes.js.
import {
  shape, made, rod, ball, blob, bloom, daisy, calla, orchid, torch, pompom, plume, leaf, frond, sprig, facing, tipped, rng,
  LEAF, DARK_LEAF, PALM, MONSTERA, EUCALYPTUS, STEM, SPADIX, CENTRE, PAMPAS,
} from "./shapes.js";

export const FLOWERS = ["rose", "peony", "hydrangea", "orchid", "gerbera", "calla", "anthurium", "ginger", "babysbreath",
                        "ranunculus", "lisianthus", "dahlia", "protea", "anemone", "carnation", "tulip", "sunflower",
                        "delphinium", "strelitzia", "chrysanthemum", "waxflower", "mixed"];
export const GREENS = ["eucalyptus", "fern", "palm", "monstera", "ivy", "ruscus", "olive", "pittosporum", "asparagus",
                       "pampas", "magnolia", "salal", "mixed"];
// the small flowers a florist fills the gaps between the big ones with
export const FILLERS = ["none", "babysbreath", "waxflower", "chrysanthemum", "delphinium"];

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
    else if (kind === "ranunculus") ranunculus(s, b, col, spin);
    else if (kind === "lisianthus") lisianthus(s, b * 1.1, col, spin);
    else if (kind === "dahlia") dahlia(s, b * 1.4, col, spin);
    else if (kind === "protea") protea(s, b * 1.5, col, spin);
    else if (kind === "anemone") anemone(s, b * 1.15, col, spin);
    else if (kind === "carnation") carnation(s, b * 0.95, col, spin);
    else if (kind === "tulip") tulip(s, b, col, spin);
    else if (kind === "sunflower") daisy(s, b * 1.7, col, SUNDISC, 22);
    else if (kind === "delphinium") delphinium(s, b, col, spin);
    else if (kind === "strelitzia") strelitzia(s, b * 2.1, col, spin);
    else if (kind === "chrysanthemum") pompom(s, b * 0.9, col);
    else if (kind === "waxflower") waxflower(s, b, col, spin);
    else babys(s, b, col, spin);
  });
}
const SUNDISC = [0.27, 0.17, 0.08], BLACKEYE = [0.08, 0.07, 0.1], CREAM = [0.93, 0.89, 0.76], BEAK = [0.3, 0.36, 0.33], TONGUE = [0.24, 0.3, 0.7];
const shadeOf = (col, f) => (f < 0 ? col.map((v) => v * (1 + f)) : col.map((v) => v + (1 - v) * f));
// a ranunculus: a tight ball of thin papery petals in rings, the inner ones deeper
function ranunculus(s, b, col, spin) {
  made("satin", () => {
    ball(s, b * 0.16, 0, b * 0.3, 0, shadeOf(col, -0.3), 6);
    for (let j = 0; j < 4; j++) {
      const n = 6 + 2 * j, r = b * (0.12 + 0.11 * j), y = b * (0.3 - 0.07 * j), c = j === 3 ? col : shadeOf(col, -0.24 + 0.08 * j);
      for (let k = 0; k < n; k++) {
        const a = spin + (k + j * 0.5) * (2 * Math.PI / n);
        blob(s, b * 0.15, b * 0.09, b * 0.08, Math.sin(a) * r, y, Math.cos(a) * r, c, a + Math.PI / 2, 6);
      }
    }
  });
}
// a lisianthus: an open cup of five broad, overlapping petals round a pale green heart
function lisianthus(s, b, col, spin) {
  made("satin", () => {
    ball(s, b * 0.09, 0, b * 0.1, 0, [0.75, 0.82, 0.6], 6);
    for (let k = 0; k < 5; k++) {
      const a = spin + k * (2 * Math.PI / 5);
      blob(s, b * 0.27, b * 0.17, b * 0.3, Math.sin(a) * b * 0.27, b * 0.14, Math.cos(a) * b * 0.27, k % 2 ? col : shadeOf(col, 0.12), a, 6);
    }
  });
}
// a dahlia: rows of pointed petals, each row shorter and more upright, round a tight centre
function dahlia(s, b, col, spin) {
  made("satin", () => {
    for (let j = 0; j < 3; j++) {
      const n = 12 - 2 * j, R = b * (0.42 - 0.12 * j), c = j === 0 ? col : shadeOf(col, j === 2 ? -0.18 : -0.06);
      for (let k = 0; k < n; k++) {
        const a = spin + (k + j * 0.5) * (2 * Math.PI / n);
        blob(s, b * 0.07, b * 0.03, b * (0.2 - 0.04 * j), Math.sin(a) * R, b * 0.05 * j, Math.cos(a) * R, c, a, 6);
      }
    }
    blob(s, b * 0.12, b * 0.08, b * 0.12, 0, b * 0.1, 0, shadeOf(col, -0.3), 0, 6);
  });
}
// a king protea: a cup of upright pointed bracts round a fuzzy cream dome
function protea(s, b, col, spin) {
  made("satin", () => {
    for (let j = 0; j < 2; j++) for (let k = 0; k < 10; k++) {
      const a = spin + (k + j * 0.5) * (2 * Math.PI / 10), R = b * (0.42 + 0.08 * j);
      blob(s, b * 0.08, b * (0.3 - 0.06 * j), b * 0.045, Math.sin(a) * R, b * (0.28 - 0.08 * j), Math.cos(a) * R, j ? shadeOf(col, -0.15) : col, a, 6);
    }
  });
  made("cloth", () => blob(s, b * 0.36, b * 0.22, b * 0.36, 0, b * 0.2, 0, CREAM, 0, 8));
}
// an anemone: six broad petals round a black centre
function anemone(s, b, col, spin) {
  made("satin", () => {
    for (let k = 0; k < 6; k++) {
      const a = spin + k * (Math.PI / 3);
      blob(s, b * 0.22, b * 0.03, b * 0.26, Math.sin(a) * b * 0.3, 0, Math.cos(a) * b * 0.3, col, a, 6);
    }
    ball(s, b * 0.12, 0, b * 0.03, 0, BLACKEYE, 6);
  });
}
// a carnation: a ruffled ball
function carnation(s, b, col, spin) {
  const rnd = rng(Math.round(spin * 1000) + 11);
  made("cloth", () => {
    blob(s, b * 0.4, b * 0.26, b * 0.4, 0, b * 0.12, 0, shadeOf(col, -0.1), 0, 8);
    for (let k = 0; k < 16; k++) {
      const a = k * 2.4 + spin, r = b * 0.36 * Math.sqrt((k + 0.5) / 16);
      blob(s, b * 0.12, b * 0.05, b * 0.08, Math.sin(a) * r, b * (0.32 - 0.25 * r / b), Math.cos(a) * r, rnd() < 0.5 ? col : shadeOf(col, 0.15), a, 5);
    }
  });
}
// a tulip: six cupped petals standing closed
function tulip(s, b, col, spin) {
  made("satin", () => { for (let k = 0; k < 6; k++) {
    const a = spin + k * (Math.PI / 3), r = b * (k % 2 ? 0.15 : 0.11);
    blob(s, b * 0.17, b * 0.42, b * 0.1, Math.sin(a) * r, b * 0.4, Math.cos(a) * r, k % 2 ? col : shadeOf(col, -0.1), a + Math.PI / 2, 6);
  } });
}
// a delphinium: a tall spike of small florets, opening toward its foot
function delphinium(s, b, col, spin) {
  rod(s, [0, 0, 0], [0, b * 3, 0], b * 0.03, STEM, 4);
  made("satin", () => { for (let j = 0; j < 10; j++) {
    const y = b * 0.3 * j, R = b * 0.28 * (1 - j / 12);
    for (let k = 0; k < 3; k++) {
      const a = spin + j * 1.1 + k * (2 * Math.PI / 3);
      blob(s, b * 0.12 * (1 - j / 16), b * 0.04, b * 0.12 * (1 - j / 16), Math.sin(a) * R, y, Math.cos(a) * R, j > 7 ? shadeOf(col, -0.2) : col, a, 5);
    }
  } });
}
// a bird of paradise: a long grey-green beak with upright crests in its colour and a blue tongue
function strelitzia(s, b, col, spin) {
  made("satin", () => {
    blob(s, b * 0.09, b * 0.08, b * 0.42, Math.sin(spin) * b * 0.1, 0, Math.cos(spin) * b * 0.1, BEAK, spin, 6);
    for (let k = 0; k < 3; k++) {
      const lean = (k - 1) * 0.12;
      blob(s, b * 0.06, b * 0.3, b * 0.09, Math.sin(spin + lean) * b * 0.15, b * 0.26, Math.cos(spin + lean) * b * 0.15, k === 1 ? shadeOf(col, 0.1) : col, spin + lean, 5);
    }
    blob(s, b * 0.03, b * 0.18, b * 0.05, Math.sin(spin) * b * 0.25, b * 0.16, Math.cos(spin) * b * 0.25, TONGUE, spin, 5);
  });
}
// waxflower: little sprays of five-petalled stars with darker hearts
function waxflower(s, b, col, spin) {
  const rnd = rng(Math.round(spin * 1000) + 13);
  for (let k = 0; k < 5; k++) {
    const a = rnd() * 6.3, r = b * 0.4 * Math.sqrt(rnd());
    made("satin", () => { for (let j = 0; j < 5; j++) {
      const q = j * (2 * Math.PI / 5), x = Math.sin(a) * r, z = Math.cos(a) * r, y = b * 0.25 * rnd();
      blob(s, b * 0.05, b * 0.012, b * 0.07, x + Math.sin(q) * b * 0.07, y, z + Math.cos(q) * b * 0.07, col, q, 4);
    } });
  }
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
  else if (kind === "ruscus") stemmed(s, p, d, len, seed, 9, (q, l, r) => blob(s, l * 0.025, 0.002, l * 0.09, q[0], q[1], q[2], RUSCUS, r, 5));
  else if (kind === "olive") stemmed(s, p, d, len, seed, 12, (q, l, r) => blob(s, l * 0.02, 0.002, l * 0.08, q[0], q[1], q[2], OLIVE, r, 5));
  else if (kind === "pittosporum") stemmed(s, p, d, len * 0.8, seed, 6, (q, l, r) => {
    for (let k = 0; k < 4; k++) blob(s, l * 0.05, 0.003, l * 0.07, q[0] + Math.sin(r + k * 1.6) * l * 0.05, q[1], q[2] + Math.cos(r + k * 1.6) * l * 0.05, PITTO, r + k * 1.6, 5);
  });
  else if (kind === "asparagus") stemmed(s, p, d, len, seed, 12, (q, l, r) => {
    for (let k = 0; k < 3; k++) blob(s, l * 0.045, 0.004, l * 0.02, q[0], q[1] + 0.004 * k, q[2], PLUMOSUS, r + k, 4);
  });
  else if (kind === "pampas") plume(s, len * 1.3, len * 0.1, p, PAMPAS, seed, Math.atan2(d[0], d[2]), Math.acos(Math.max(-1, Math.min(1, d[1]))));
  else if (kind === "magnolia") { leaf(s, p, d, len * 0.5, 0.32, MAGNOLIA); leaf(s, p, tipped(a + 0.7, Math.acos(Math.max(-1, Math.min(1, d[1]))) + 0.3), len * 0.45, 0.32, MAGNOLIA_BACK); }
  else if (kind === "salal") stemmed(s, p, d, len * 0.8, seed, 5, (q, l, r) => blob(s, l * 0.1, 0.003, l * 0.13, q[0], q[1], q[2], SALAL, r, 6));
  else ivy(s, p, len, seed);
}
const RUSCUS = [0.2, 0.4, 0.18], OLIVE = [0.52, 0.58, 0.46], PITTO = [0.18, 0.35, 0.17], PLUMOSUS = [0.38, 0.58, 0.29];
const MAGNOLIA = [0.13, 0.27, 0.13], MAGNOLIA_BACK = [0.47, 0.32, 0.19], SALAL = [0.28, 0.45, 0.22];
// a stem from p toward d, len long, with n leaves (leafAt(point, len, turn)) along it, either side
function stemmed(s, p, d, len, seed, n, leafAt) {
  const rnd = rng(seed), a = Math.atan2(d[0], d[2]);
  rod(s, p, [p[0] + d[0] * len, p[1] + d[1] * len, p[2] + d[2] * len], 0.0025, STEM, 4);
  for (let k = 1; k <= n; k++) {
    const t = k / (n + 0.5), side = k % 2 ? 1 : -1, o = 0.02 + 0.01 * rnd();
    const q = [p[0] + d[0] * len * t + Math.cos(a) * side * o, p[1] + d[1] * len * t, p[2] + d[2] * len * t - Math.sin(a) * side * o];
    leafAt(q, len, a + side * 0.6 + (rnd() - 0.5) * 0.4);
  }
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
// colour, the accent kind, its colour and its share, the flowers' size, the small filler flowers
// between them; how the colours and sizes are mixed; how much greenery and which.
export const BLENDS = ["shades", "blend", "ombre", "one"];
export function floralKnobs(v = {}) {
  const own = { flowers: 160, flower: "rose", tint: "#f7f5ef", accent: "hydrangea", accenttint: "#f2c4c0", share: 30, bloomsize: 0.08,
                greens: 90, green: "eucalyptus", filler: "babysbreath", blend: "shades", vary: 40, sizes: 50, ...v };
  return {
    flowers: { min: 0, max: 400, value: own.flowers, part: "flowers" },
    flower: { choices: FLOWERS, value: own.flower, part: "flowers" },
    tint: { colour: true, palette: "flowers", value: own.tint, part: "flowers" },
    accent: { choices: FLOWERS, value: own.accent, part: "flowers" },
    accenttint: { colour: true, palette: "flowers", value: own.accenttint, part: "flowers" },
    share: { min: 0, max: 100, step: 5, value: own.share, unit: "%", part: "flowers" },
    bloomsize: { min: 0.04, max: 0.16, step: 0.005, value: own.bloomsize, size: true, part: "flowers" },
    filler: { choices: FILLERS, value: own.filler, part: "flowers" },
    fillers: { min: 0, max: 300, value: own.fillers ?? Math.round(own.flowers * 0.3), part: "flowers" },
    blend: { choices: BLENDS, value: own.blend, part: "mix" },
    vary: { min: 0, max: 100, step: 5, value: own.vary, unit: "%", part: "mix" },
    sizes: { min: 0, max: 100, step: 5, value: own.sizes, unit: "%", part: "mix" },
    greens: { min: 0, max: 300, value: own.greens, part: "greenery" },
    green: { choices: GREENS, value: own.green, part: "greenery" },
  };
}
// the kind of the k-th flower of a "mixed" choice (the ones a florist mixes)
const MIX = ["rose", "hydrangea", "peony", "ranunculus", "babysbreath", "rose", "lisianthus", "orchid", "dahlia"];
const kindOf = (kind, k) => (kind === "mixed" ? MIX[k % MIX.length] : kind);
const greenOf = (kind, k) => (kind === "mixed" ? GREENS[k % (GREENS.length - 1)] : kind);

// ---------------------------------------------------------------- mixing colours and sizes
// As a florist does: no flower quite the colour of the next (shades of it), the same kind and colour
// gathered in drifts that flow through the piece rather than dotted evenly, and sizes spread round
// the one asked (full-blown heads among smaller buds), whole drifts a little bigger or smaller.
// A drift: a smooth value 0..1 over the piece (a few metres' worth of waves), its own for each seed.
export function drift(p, seed) {
  const r = rng(seed * 7 + 5), w = () => [(r() - 0.5) * 18, (r() - 0.5) * 18, (r() - 0.5) * 18, r() * 6.3];
  const A = w(), B = w(), C = w(), f = (q) => Math.sin(q[0] * p[0] + q[1] * p[1] + q[2] * p[2] + q[3]);
  return Math.min(1, Math.max(0, 0.5 + (f(A) + f(B) + f(C)) / 4));
}
// [r, g, b] (0..1) <-> [h, s, l] (each 0..1)
export function toHsl([r, g, b]) {
  const hi = Math.max(r, g, b), lo = Math.min(r, g, b), l = (hi + lo) / 2, d = hi - lo;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = hi === r ? ((g - b) / d + 6) % 6 : hi === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, Math.min(1, s), l];
}
export function fromHsl([h, s, l]) {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h * 6) % 2) - 1)), m = l - c / 2, k = Math.floor(((h % 1) + 1) % 1 * 6);
  const [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][k];
  return [r + m, g + m, b + m];
}
const clamp01 = (v) => Math.min(1, Math.max(0, v));
const lerp = (a, b, f) => a.map((v, i) => v + (b[i] - v) * f);
// A flower's colour: `base` (its kind's colour), shaded as k.blend asks: "shades" lighter and darker
// of it, "blend" the main colour and the accent's and those between them, "ombre" from one to the
// other across the piece (x01: where it is across, 0..1), "one" just it. k.vary (0..100) says how
// far a flower may stray; d a drift value (neighbours alike), r1..r3 its own chance.
export function mixColour(k, base, accent, d, x01, r1, r2, r3) {
  const v = (k.vary ?? 40) / 100;
  if (k.blend === "one" || !v) return base;
  let c = base, amp = 1;
  if (!accent && k.blend === "blend") { c = lerp(base, k.accenttint, clamp01(d + (r1 - 0.5) * 0.35) * 0.85); amp = 0.6; }
  if (!accent && k.blend === "ombre") { c = lerp(base, k.accenttint, clamp01(x01 + (r1 - 0.5) * 0.25)); amp = 0.5; }
  const [h, s, l] = toHsl(c);
  // (white stays near white: a cream, an ivory, a blush-white; a deep colour goes lighter and darker)
  const dl = ((d - 0.5) * 0.36 + (r2 - 0.5) * 0.12) * v * amp * (l > 0.9 ? 0.4 : 1);
  return fromHsl([h + (r3 - 0.5) * 0.04 * v * amp, clamp01(s + (r1 - 0.5) * 0.2 * v * amp), clamp01(l + dl)]);
}
// A flower's size by its own: around 1, spread by k.sizes (0..100: none to wide, as a log-normal
// round 1), whole drifts bigger or smaller; r1, r2 its own chance, d a drift value.
export function mixSize(k, d, r1, r2) {
  const v = (k.sizes ?? 50) / 100;
  // (Box-Muller: a bell round 0)
  const g = Math.sqrt(-2 * Math.log(Math.max(1e-9, r1))) * Math.cos(2 * Math.PI * r2);
  return Math.min(1.9, Math.max(0.5, (0.92 + 0.16 * r2) * Math.exp(g * 0.28 * v) * (1 + 0.5 * v * (d - 0.5))));
}

// Dress a shape: k.greens pieces of greenery first, then k.flowers flowers over them, each where
// spot(rnd, k) puts it ([p, d] a point and the way it faces, or null to leave it out: a part of an
// arch left bare), then k.fillers small filler flowers among them. About k.share in a hundred of
// the flowers are the accent kind in its colour, gathered in drifts; colours and sizes mixed as
// mixColour and mixSize say.
export function dress(s, k, spot, seed, greenLen = 0.3) {
  const rnd = rng(seed), mix = rng(seed + 101), w = k.w || 1;
  for (let n = 0; n < (k.greens || 0); n++) {
    const at = spot(rnd, n, true);
    if (!at) continue;
    const kind = greenOf(k.green, n);
    // (a strand stops short of the floor)
    if (kind === "ivy") { const len = Math.min(greenLen * (0.8 + 0.8 * rnd()), at[0][1] - 0.03); if (len > 0.05) ivy(s, at[0], len, seed + n); }
    else green(s, kind, at[0], at[1], greenLen * (0.7 + 0.6 * rnd()), seed + n);
  }
  const tint = k.tint || [1, 1, 1], acc = k.accenttint || tint;
  const one = (kind, base, isAccent, size, p, d, spin) => {
    const x01 = clamp01(p[0] / w + 0.5);
    const col = mixColour({ ...k, accenttint: acc }, base, isAccent, drift(p, seed + 3), x01, mix(), mix(), mix());
    flower(s, kind, size * mixSize(k, drift(p, seed + 4), mix(), mix()), col, p, d, spin);
  };
  for (let n = 0; n < (k.flowers || 0); n++) {
    const at = spot(rnd, n, false);
    if (!at) continue;
    // (the accent in drifts: likelier where the drift is high, as often as asked over the piece)
    const r = rnd(), accent = r * 100 < (k.share || 0) * (0.3 + 1.4 * drift(at[0], seed + 2)), kind = kindOf(accent ? k.accent : k.flower, n);
    rnd();
    one(kind, accent ? acc : tint, accent, k.bloomsize || 0.08, at[0], at[1], rnd() * 6.3);
  }
  if (k.filler && k.filler !== "none") for (let n = 0; n < (k.fillers || 0); n++) {
    const at = spot(rnd, n, false);
    if (!at) continue;
    // (baby's breath near white, waxflower a pale accent, the others in the main colours)
    const base = k.filler === "babysbreath" ? shadeOf(tint, 0.8) : k.filler === "waxflower" ? shadeOf(acc, 0.45) : rnd() < 0.5 ? tint : acc;
    one(k.filler, base, true, (k.bloomsize || 0.08) * (k.filler === "chrysanthemum" ? 0.55 : 0.5), at[0], at[1], rnd() * 6.3);
  }
}
// a unit direction out from a line's direction t (in x-y), tipped toward the front (+z) by q
export function around(t, q) {
  const n = [-t[1], t[0], 0], d = [n[0] * Math.cos(q), n[1] * Math.cos(q), Math.sin(q)], L = Math.hypot(...d) || 1;
  return d.map((v) => v / L);
}
export { shape, tipped };
