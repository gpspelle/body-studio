// Decor starters (../decor.js): the first ones, chairs, tables, an arch, a pillar, a runner, flowers, a candle, a lantern.
import {
  COLOURS, LEAF, FLAME, WAX, GLASS, shape, lit, box, cyl, rod,
  ball, bloom, facing, bunch, drape, other, cloth, at,
} from "./shapes.js";

// ---------------------------------------------------------------- the starters
// size: the footprint, for walking and for what stands on it ({r} round, or {w, d}); top: the
// height things put on it stand at; seat: where the body sits on it (its hips, facing its front);
// block: whether the body walks round it (a runner, a candle are walked over or past).
export const BASICS = {
  chair: {
    group: "tables", height: 0.9, on: "floor", colour: "gold", size: { w: 0.44, d: 0.46 }, block: true, seat: { y: 0.45, z: -0.02, back: true },
    make(col) {
      const s = shape(), cushion = col === COLOURS.white ? COLOURS.ivory : COLOURS.white;
      for (const [x, z] of [[-0.19, 0.19], [0.19, 0.19], [-0.19, -0.2], [0.19, -0.2]]) rod(s, [x, 0, z], [x, 0.43, z], 0.014, col);
      box(s, 0.42, 0.03, 0.42, 0, 0.42, 0, col);
      box(s, 0.4, 0.04, 0.4, 0, 0.45, 0.005, cushion);
      for (const x of [-0.19, 0.19]) rod(s, [x, 0.43, -0.2], [x * 0.92, 0.9, -0.23], 0.014, col);
      for (const y of [0.6, 0.7, 0.8, 0.89]) rod(s, [-0.18, y, -0.21 - (y - 0.45) * 0.06], [0.18, y, -0.21 - (y - 0.45) * 0.06], 0.01, col);
      for (const y of [0.15, 0.3]) rod(s, [-0.18, y, 0.18], [0.18, y, 0.18], 0.008, col);
      return s;
    },
  },
  round_table: {
    group: "tables", height: 0.76, on: "floor", colour: "white", size: { r: 0.78 }, block: true, top: 0.76,
    make(col) { const s = shape(); drape(s, 0.76, 0.76, col); return s; },
  },
  long_table: {
    group: "tables", height: 0.76, on: "floor", colour: "white", size: { w: 1.84, d: 0.84 }, block: true, top: 0.76,
    make(col) { const s = shape(); cloth(s, 1.84, 0.84, 0.76, col); return s; },
  },
  arch: {
    group: "ceremony", height: 2.36, on: "floor", colour: "white", size: { w: 1.9, d: 0.4 }, block: "posts",
    posts: [[-0.8, 0], [0.8, 0]],
    make(col) {
      const s = shape(), bloom = col === COLOURS.white ? COLOURS.blush : COLOURS.white;
      for (const x of [-0.8, 0.8]) { rod(s, [x, 0, 0], [x, 1.5, 0], 0.035, col); box(s, 0.2, 0.04, 0.2, x, 0, 0, col); }
      let prev = null;
      for (let k = 0; k <= 24; k++) {
        const a = Math.PI * (1 - k / 24), p = [0.8 * Math.cos(a), 1.5 + 0.8 * Math.sin(a), 0];
        if (prev) rod(s, prev, p, 0.035, col);
        prev = p;
      }
      // flowers over one shoulder of the arch and at the foot of the other post
      for (let k = 0; k < 9; k++) {
        const a = Math.PI * (0.55 + 0.05 * k);
        bunch(s, 10, 0.14, 0.8 * Math.cos(a), 1.5 + 0.8 * Math.sin(a), 0.03, k % 2 ? bloom : COLOURS.white, 7 + k);
      }
      bunch(s, 16, 0.18, 0.8, 0.15, 0.05, bloom, 3);
      return s;
    },
  },
  pillar: {
    group: "ceremony", height: 1.0, on: "floor", colour: "white", size: { r: 0.18 }, block: true, top: 1.0,
    make(col) { const s = shape(); box(s, 0.32, 0.06, 0.32, 0, 0, 0, col); cyl(s, 0.12, 0.12, 0.88, 0, 0.06, 0, col, 24); box(s, 0.3, 0.06, 0.3, 0, 0.94, 0, col); return s; },
  },
  runner: {
    group: "ceremony", height: 0.01, on: "floor", colour: "ivory", size: { w: 0.9, d: 6 }, block: false,
    make(col) { const s = shape(); box(s, 0.9, 0.006, 6, 0, 0, 0, col); return s; },
  },
  flowers: {
    group: "table", height: 0.45, on: "top", colour: "blush", size: { r: 0.15 }, block: false,
    make(col) {
      const s = shape();
      cyl(s, 0.05, 0.07, 0.18, 0, 0, 0, GLASS, 20);
      for (let k = 0; k < 5; k++) rod(s, [0, 0.12, 0], [0.08 * Math.sin(k * 1.3), 0.3, 0.08 * Math.cos(k * 1.3)], 0.005, LEAF, 5);
      bunch(s, 30, 0.14, 0, 0.365, 0, col, 11);
      return s;
    },
  },
  candle: {
    group: "table", height: 0.3, on: "top", colour: "gold", size: { r: 0.05 }, block: false,
    make(col) { const s = shape(); cyl(s, 0.05, 0.035, 0.03, 0, 0, 0, col, 20); cyl(s, 0.022, 0.022, 0.24, 0, 0.03, 0, WAX, 16); lit(() => ball(s, 0.012, 0, 0.285, 0, FLAME, 8)); return s; },
  },
  lantern: {
    group: "lights", height: 0.5, on: "floor", colour: "black", size: { r: 0.13 }, block: false,
    make(col) {
      const s = shape();
      box(s, 0.22, 0.03, 0.22, 0, 0, 0, col); box(s, 0.22, 0.03, 0.22, 0, 0.4, 0, col);
      for (const [x, z] of [[-0.1, -0.1], [0.1, -0.1], [0.1, 0.1], [-0.1, 0.1]]) rod(s, [x, 0.03, z], [x, 0.4, z], 0.008, col, 6);
      cyl(s, 0.08, 0.02, 0.07, 0, 0.43, 0, col, 16);
      rod(s, [0, 0.5, 0], [0, 0.47, 0], 0.02, col, 8);
      cyl(s, 0.03, 0.03, 0.12, 0, 0.03, 0, WAX, 12); lit(() => ball(s, 0.012, 0, 0.165, 0, FLAME, 8));
      return s;
    },
  },
};
