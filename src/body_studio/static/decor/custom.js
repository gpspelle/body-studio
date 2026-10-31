// Decor starters (../decor.js) you build yourself, as the decorators do: an arch in any shape with
// its flowers where you want them, a floral installation hung overhead, the flowers for a table.
// Each is dressed by florals.js from its knobs: the flowers' kinds, colours and how many, the
// greenery, and for an arch how thickly each part of it is covered.
import { shape, made, vert, quad, rod, cyl, box, ball, bulb, shade, lit, tipped, rng, COLOURS, GLASS, WIRE, WAX, FLAME } from "./shapes.js";
import { floralKnobs, dress, ivy, flower, around } from "./florals.js";

// ---------------------------------------------------------------- an arch's line
export const ARCHES = ["round", "pointed", "square", "circle", "hexagon", "triangle", "halfmoon"];
// the parts of an arch, from its left foot over the top to its right foot (each a fifth of its line)
export const PARTS = ["lfoot", "lside", "crown", "rside", "rfoot"];
// An arch's frame as a line in its own plane (x across, y up, z = 0) w wide and h high, from its
// left foot to its right one: [[x, y], ...]
export function archLine(kind, w, h) {
  const a = w / 2, pts = [], arc = (cx, cy, r, a0, a1, n) => {
    for (let k = 0; k <= n; k++) { const t = a0 + (a1 - a0) * (k / n); pts.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]); }
  };
  if (kind === "square") return [[-a, 0], [-a, h], [a, h], [a, 0]];
  if (kind === "triangle") return [[-a, 0], [0, h], [a, 0]];
  if (kind === "hexagon") return [[-a / 2, 0], [-a, h / 2], [-a / 2, h], [a / 2, h], [a, h / 2], [a / 2, 0]];
  if (kind === "pointed") {
    // two arcs of radius w, each centred on the other side's spring (a gothic arch), on straight legs
    const y0 = Math.max(0, h - 0.866 * w);
    pts.push([-a, 0]);
    arc(a, y0, w, Math.PI, (2 * Math.PI) / 3, 16);
    arc(-a, y0, w, Math.PI / 3, 0, 16);
    pts.push([a, 0]);
    return pts;
  }
  if (kind === "circle" || kind === "halfmoon") {
    // a ring standing on its foot (a moon gate), or the most of one, open at its upper right
    // (on a short stem from the floor when it is less wide than high)
    const r = Math.min(a, h / 2), cy = h - r, a0 = -Math.PI / 2;
    if (cy - r > 0.01) pts.push([0, 0]);
    arc(0, cy, r, a0, kind === "circle" ? a0 - 2 * Math.PI : a0 - 1.62 * Math.PI, 64);
    return pts;
  }
  // round: straight legs and a half circle over them
  const r = Math.min(a, h), y0 = h - r;
  pts.push([-a, 0]);
  arc(0, y0, r, Math.PI, 0, 32);
  pts.push([a, 0]);
  return pts;
}
// the line by its length: at(t) for t in 0..1 -> { p: [x, y], d: its way along, unit }
export function along(line) {
  const len = [0];
  for (let k = 1; k < line.length; k++) len.push(len[k - 1] + Math.hypot(line[k][0] - line[k - 1][0], line[k][1] - line[k - 1][1]));
  const L = len[len.length - 1] || 1;
  return {
    length: L,
    at(t) {
      const u = Math.min(1, Math.max(0, t)) * L;
      let k = 1;
      while (k < line.length - 1 && len[k] < u) k++;
      const a = line[k - 1], b = line[k], seg = len[k] - len[k - 1] || 1, f = (u - len[k - 1]) / seg;
      return { p: [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f], d: [(b[0] - a[0]) / seg, (b[1] - a[1]) / seg] };
    },
  };
}
// Where along an arch's line a flower goes, as its parts' cover asks (k.lfoot..k.rfoot, 0..100),
// moved along the line by k.shift (-100..100, in a hundred of its length: the flowers slid over
// toward its right foot, or its left): a part is chosen by its share of the cover still on the
// line, then a place in it; null when nothing is covered. Round a closed ring (closed) what is
// slid past one end comes round from the other.
export function coverPick(k, r1, r2, closed = false) {
  const s = (+k.shift || 0) / 100, spans = [];
  PARTS.forEach((n, i) => {
    const w = Math.max(0, +k[n] || 0), a = i / PARTS.length + s, b = a + 1 / PARTS.length;
    if (!w) return;
    if (closed) {
      // (a part's span, round the ring: at most two pieces)
      const a0 = a - Math.floor(a), b0 = a0 + 1 / PARTS.length;
      if (b0 <= 1) spans.push([a0, b0, w]);
      else spans.push([a0, 1, w], [0, b0 - 1, w]);
    } else if (Math.min(1, b) > Math.max(0, a)) spans.push([Math.max(0, a), Math.min(1, b), w]);
  });
  const sum = spans.reduce((m, [a, b, w]) => m + (b - a) * w, 0);
  if (!sum) return null;
  let u = r1 * sum, k0 = 0;
  while (k0 < spans.length - 1 && u >= (spans[k0][1] - spans[k0][0]) * spans[k0][2]) { u -= (spans[k0][1] - spans[k0][0]) * spans[k0][2]; k0++; }
  const [a, b] = spans[k0];
  return Math.min(b, a + r2 * (b - a));
}
// where an arch stands on the floor: the ends of its line on the ground (a ring's foot)
export function archPosts(k) {
  const { w, h } = frameOf(k), line = archLine(k.shape, w, h), feet = line.filter(([, y]) => y < 0.05);
  return (feet.length ? feet : [[0, 0]]).map(([x]) => [x, 0]);
}

// the frame's own width and height, inside the flowers round it (so the whole arch is as wide and
// as high as asked), and how far the flowers stand round it
export function frameOf(k) {
  const r = Math.max(0.08, k.d * 0.25), pad = r + 0.12;
  return { w: Math.max(0.3, k.w - 2 * pad), h: Math.max(0.3, k.h - pad), r };
}

// a mound of flowers and greenery at (x, 0, z), r across: an arch's foot, a low centrepiece
function mound(s, k, x, z, r, h, seed, flowers, greens, len = 0.3) {
  dress(s, { ...k, flowers, greens }, (rnd) => {
    const a = rnd() * 2 * Math.PI, q = Math.sqrt(rnd()), up = Math.sqrt(Math.max(0, 1 - q * q));
    return [[x + Math.sin(a) * q * r, Math.max(0.07, up * h), z + Math.cos(a) * q * r * 0.8], tipped(a, 0.2 + Math.min(1.1 * q, 1.2))];
  }, seed, len);
}

// An arch's frame, made of what the panel's "Made of" asks (k.finish): a metal tube (as made), a
// square-cut wooden frame, clear acrylic, a frame wrapped in fabric, or painted (satin); k.thick
// thick (its radius). Its colour is the arch's own, or, left at the starter's, the material's own:
// wood brown, acrylic clear, fabric ivory.
const FRAME_FINISH = { wood: "wood", glass: "glass", cloth: "cloth", satin: "satin", metal: "metal" };
export function frameColour(col, k) {
  if (k.colourset) return col;
  return k.finish === "wood" ? COLOURS.wood : k.finish === "glass" ? GLASS : k.finish === "cloth" ? COLOURS.ivory : col;
}
function frame(s, line, col, k) {
  const r = k.thick || 0.02, c = frameColour(col, k), f = FRAME_FINISH[k.finish] || "metal";
  made(f, () => {
    for (let n = 1; n < line.length; n++) {
      const a = [line[n - 1][0], line[n - 1][1], 0], b = [line[n][0], line[n][1], 0];
      // (wood is cut square; fabric wraps it a little fuller, in soft turns)
      if (f === "wood") rod(s, a, b, r * 1.2, c, 4);
      else if (f === "cloth") rod(s, a, b, r * 1.35, c, 10);
      else rod(s, a, b, r, c, f === "glass" ? 6 : 8);
    }
  });
  // fabric: a sash knotted at the top, its tails falling
  if (f === "cloth") {
    // (at the middle of its top)
    let top = 0;
    for (let n = 1; n < line.length; n++) if (line[n][1] > line[top][1] + 1e-6 || (Math.abs(line[n][1] - line[top][1]) < 1e-6 && Math.abs(line[n][0]) < Math.abs(line[top][0]))) top = n;
    const [x, y] = line[top];
    made("cloth", () => {
      for (const side of [-1, 1]) band(s, [x, y, r], [x + side * 0.25, Math.max(0.1, y - 1.1), r + 0.04], 0.16, 0, 1, c, [0, 0, 1]);
      ball(s, r * 1.8 + 0.03, x, y, r, c, 10);
    });
  }
}

// A length of fabric from a to b ([x, y, z]), wide across (along `across`, a unit way in x-z),
// dipping `dip` below the line between them in `scallops` swags (0: straight), gathered narrow at
// its ends and where it is caught up, in soft folds along it.
export function band(s, a, b, wide, dip, scallops, col, across) {
  const U = Math.max(12, 16 * Math.max(1, scallops)), V = 8, pts = [];
  for (let i = 0; i <= U; i++) for (let j = 0; j <= V; j++) {
    const t = i / U, v = j / V - 0.5, hump = scallops ? Math.abs(Math.sin(Math.PI * scallops * t)) : Math.sin(Math.PI * t);
    const open = 0.3 + 0.7 * hump, fold = 0.03 * Math.sin(v * Math.PI * 6) * (0.3 + hump);
    const x = a[0] + (b[0] - a[0]) * t + across[0] * v * wide * open, z = a[2] + (b[2] - a[2]) * t + across[2] * v * wide * open;
    const y = a[1] + (b[1] - a[1]) * t - (scallops ? dip * hump : 0) + fold - 0.06 * v * v;
    pts.push(vert(s, x, y, z, col));
  }
  for (let i = 0; i < U; i++) for (let j = 0; j < V; j++)
    quad(s, pts[i * (V + 1) + j], pts[i * (V + 1) + j + 1], pts[(i + 1) * (V + 1) + j + 1], pts[(i + 1) * (V + 1) + j]);
}

// Where the lengths of an overhead of fabric run, w by d under a roof at `top`, as its style asks:
// swags across it side by side, a canopy (the same, edge to edge), a tent (from its middle out to
// its edge all round) or waves (swags caught up every metre or so). Each { a, b, wide, scallops,
// across }; and the points where they are gathered (for posies, the tent's crown).
export function fabricRuns(style, w, d, n, top) {
  const runs = [], gathers = [];
  if (style === "radial") {
    for (let j = 0; j < n; j++) {
      const q = (j / n) * 2 * Math.PI, e = [Math.cos(q) * w / 2, top, Math.sin(q) * d / 2];
      runs.push({ a: [0, top - 0.05, 0], b: e, wide: Math.min(1.2, (Math.PI * Math.max(w, d)) / n), scallops: 1, across: [-Math.sin(q), 0, Math.cos(q)] });
      gathers.push(e);
    }
    gathers.push([0, top - 0.05, 0]);
    return { runs, gathers };
  }
  const gap = d / n, wide = style === "canopy" ? gap * 1.05 : gap * 0.6;
  const scallops = style === "waves" ? Math.max(2, Math.round(w / 1.3)) : 1;
  for (let j = 0; j < n; j++) {
    const z = -d / 2 + gap * (j + 0.5);
    runs.push({ a: [-w / 2, top, z], b: [w / 2, top, z], wide, scallops, across: [0, 0, 1] });
    for (let c = 0; c <= scallops; c++) gathers.push([-w / 2 + (w * c) / scallops, top, z]);
  }
  return { runs, gathers };
}

export const CUSTOM = {
  custom_arch: {
    group: "ceremony", height: 2.6, on: "floor", colour: "gold", size: { w: 2.2, d: 0.9 }, block: "posts", posts: [[-0.755, 0], [0.755, 0]],
    built: ["w", "d", "h"], postsFor: archPosts, heavy: true, finishes: true,
    presets: {
      small: { w: 1.6, d: 0.7, h: 2.2, flowers: 110, greens: 70, fillers: 35 },
      medium: { w: 2.2, d: 0.9, h: 2.6, flowers: 180, greens: 110, fillers: 54 },
      large: { w: 2.8, d: 1.0, h: 3.0, flowers: 260, greens: 160, fillers: 80 },
      grand: { w: 3.6, d: 1.2, h: 3.4, flowers: 360, greens: 220, fillers: 110 },
    },
    knobs: {
      shape: { choices: ARCHES, value: "round", part: "shape" },
      thick: { min: 0.01, max: 0.12, step: 0.005, value: 0.02, size: true, part: "frame" },
      ...floralKnobs({ flowers: 180, greens: 110 }),
      lfoot: { min: 0, max: 100, step: 5, value: 20, unit: "%", part: "cover" },
      lside: { min: 0, max: 100, step: 5, value: 60, unit: "%", part: "cover" },
      crown: { min: 0, max: 100, step: 5, value: 100, unit: "%", part: "cover" },
      rside: { min: 0, max: 100, step: 5, value: 30, unit: "%", part: "cover" },
      rfoot: { min: 0, max: 100, step: 5, value: 0, unit: "%", part: "cover" },
      shift: { min: -100, max: 100, step: 5, value: 0, unit: "%", part: "cover" },
      feet: { choices: ["none", "left", "right", "both"], value: "left", part: "cover" },
      footflowers: { min: 0, max: 200, value: 50, part: "cover" },
      trails: { min: 0, max: 40, value: 6, part: "greenery" },
      traillen: { min: 0.2, max: 2, step: 0.05, value: 0.7, size: true, part: "greenery" },
    },
    make(col, k) {
      // the frame (in its own colour: brass, white, black, wood) along the arch's line, a base under
      // a ring; over it flowers and greenery as thick as each part's cover, strands falling from
      // the top, mounds at its feet
      const s = shape(), { w: fw, h: fh, r } = frameOf(k), line = archLine(k.shape, fw, fh), path = along(line);
      const closed = k.shape === "circle";
      frame(s, line, col, k);
      if (k.shape === "circle" || k.shape === "halfmoon")
        made(FRAME_FINISH[k.finish] || "satin", () => box(s, Math.min(fw, 1.2), 0.05, Math.max(0.3, k.d * 0.6), 0, 0, 0, frameColour(col, k)));
      dress(s, k, (rnd, n, leafy) => {
        const t = coverPick(k, rnd(), rnd(), closed);
        if (t === null) return null;
        // (round the frame, most toward the front; leaves further out)
        const at = path.at(t), q = (rnd() - 0.5) * (rnd() < 0.8 ? 2.2 : 6.3), d = around(at.d, q), o = r * (leafy ? 0.6 + 0.5 * rnd() : Math.sqrt(rnd()));
        const y = at.p[1] + d[1] * o;
        // (near the floor, nothing pointing down into it)
        return [[at.p[0] + d[0] * o, Math.max(0.08, y), d[2] * o], y < 0.3 && d[1] < 0 ? [d[0], 0.2, d[2]].map((v, _, a) => v / Math.hypot(...a)) : d];
      }, 131, 0.55 * r);
      // strands falling from the covered parts high up
      const rnd = rng(137);
      for (let n = 0, tries = 0; n < k.trails && tries < k.trails * 20; tries++) {
        const t = coverPick(k, rnd(), rnd(), closed);
        if (t === null) break;
        const at = path.at(t);
        if (at.p[1] < fh * 0.45) continue;
        ivy(s, [at.p[0], at.p[1] - r * 0.4, (rnd() - 0.3) * r], k.traillen * (0.6 + 0.6 * rnd()), 139 + n);
        n++;
      }
      const feet = archPosts(k);
      const left = Math.min(...feet.map(([x]) => x)), right = Math.max(...feet.map(([x]) => x));
      for (const [side, x] of [["left", left], ["right", right]])
        if (k.feet === side || k.feet === "both") mound(s, k, x, 0.05, 0.2 * fw, 0.25 * fw, side === "left" ? 141 : 143, k.footflowers, Math.round(k.footflowers * 0.7));
      // (the tips of a leaf or a petal at its feet that would go under the floor lie on it)
      for (let n = 1; n < s.p.length; n += 3) if (s.p[n] < 0) s.p[n] = 0;
      return s;
    },
  },
  floral_cloud: {
    group: "aerial", height: 2.9, hangs: true, on: "floor", colour: "black", size: { w: 2.4, d: 1.2 }, block: false, built: ["w", "d"], heavy: true,
    presets: {
      small: { w: 1.2, d: 0.7, flowers: 70, greens: 90, fillers: 20, trails: 12 },
      medium: { w: 2.4, d: 1.2, flowers: 140, greens: 180, fillers: 42, trails: 24 },
      large: { w: 3.6, d: 1.8, flowers: 240, greens: 280, fillers: 70, trails: 36 },
      grand: { w: 5, d: 2.5, flowers: 360, greens: 300, fillers: 100, trails: 50 },
    },
    knobs: {
      shape: { choices: ["cloud", "ring", "garland", "rain"], value: "cloud", part: "shape" },
      drop: { min: 0.1, max: 1.5, step: 0.05, value: 0.4, size: true, part: "shape" },
      mass: { min: 0.1, max: 1.2, step: 0.05, value: 0.36, size: true, part: "shape" },
      ...floralKnobs({ flowers: 140, flower: "orchid", tint: "#f7f5ef", accent: "rose", accenttint: "#f2c4c0", share: 20, greens: 180, green: "mixed" }),
      trails: { min: 0, max: 80, value: 24, part: "greenery" },
      traillen: { min: 0.2, max: 2, step: 0.05, value: 0.6, size: true, part: "greenery" },
      bulbs: { min: 0, max: 60, value: 12, part: "lights" },
      lamps: { min: 0, max: 12, value: 0, part: "lights" },
    },
    make(col, k) {
      // a floral installation hung from the roof (2.9 m) on cords in its own colour, its mass `drop`
      // below them: a cloud of greenery and flowers, a ring of them (a chandelier), a long garland,
      // or a rain of strands; strands of ivy falling from it, filament bulbs and woven lamps under it
      const s = shape(), top = 2.9, y = top - k.drop, w = k.w, d = k.d, rnd = rng(151);
      const R = w / 2, thick = k.mass;
      // a point in (or on) the mass, the way out from it there
      const inMass = (r) => {
        if (k.shape === "ring" || k.shape === "garland") {
          const t = r(), q = r() * 6.3, o = thick * Math.sqrt(r()) * 0.8;
          const c = k.shape === "ring" ? [R * Math.cos(t * 2 * Math.PI), y, R * Math.sin(t * 2 * Math.PI)] : [(t - 0.5) * w, y - 0.12 * Math.sin(Math.PI * t), 0];
          const out = k.shape === "ring" ? [Math.cos(t * 2 * Math.PI), 0, Math.sin(t * 2 * Math.PI)] : [0, 0, 1];
          const dir = [out[0] * Math.cos(q), -Math.abs(Math.sin(q)) * 0.8 + 0.2 * Math.sin(q), out[2] * Math.cos(q) + (k.shape === "garland" ? 0 : 0)];
          const L = Math.hypot(...dir) || 1;
          return [[c[0] + dir[0] / L * o, c[1] + dir[1] / L * o, c[2] + dir[2] / L * o], dir.map((v) => v / L)];
        }
        // a cloud (and the rain's top): the lower half of a flattened egg, w by d, thick deep
        const a = r() * 6.3, q = Math.sqrt(r()), x = Math.cos(a) * q * w / 2, z = Math.sin(a) * q * d / 2;
        const down = (k.shape === "rain" ? 0.3 : 1) * thick * Math.sqrt(Math.max(0, 1 - q * q)) * (0.5 + 0.5 * r());
        return [[x, y - down, z], tipped(a, Math.PI - 0.4 - 1.1 * (1 - q))];
      };
      // the cords up to the roof
      const cords = k.shape === "ring" ? [0, 1, 2, 3].map((n) => [R * Math.cos(n * Math.PI / 2), R * Math.sin(n * Math.PI / 2)])
                  : k.shape === "garland" ? [[-w * 0.45, 0], [0, 0], [w * 0.45, 0]] : [[-w * 0.3, -d * 0.2], [w * 0.3, d * 0.2], [0, 0]];
      for (const [x, z] of cords) rod(s, [x, top, z], [x, y + 0.05, z], 0.003, col, 3);
      if (k.shape === "ring") for (let n = 0; n < 48; n++) {
        const a0 = (n / 48) * 2 * Math.PI, a1 = ((n + 1) / 48) * 2 * Math.PI;
        rod(s, [R * Math.cos(a0), y, R * Math.sin(a0)], [R * Math.cos(a1), y, R * Math.sin(a1)], 0.012, col, 6);
      }
      dress(s, k, (r) => inMass(r), 157, 0.36);
      // strands: ivy from the mass, or for a rain, strands of flowers to its foot
      for (let n = 0; n < k.trails; n++) {
        const [p] = inMass(rnd), len = k.traillen * (0.6 + 0.7 * rnd());
        if (k.shape === "rain") {
          rod(s, [p[0], y, p[2]], [p[0], y - len, p[2]], 0.002, WIRE, 3);
          for (let j = 1, m = Math.max(2, Math.round(len / 0.12)); j <= m; j++)
            flower(s, j % 3 ? k.flower : k.accent, k.bloomsize * 0.7, j % 3 ? k.tint : k.accenttint, [p[0], y - (len * j) / m, p[2]], tipped(rnd() * 6.3, 1.4), rnd() * 6.3);
        } else ivy(s, p, len, 161 + n);
      }
      for (let n = 0; n < k.bulbs; n++) {
        const [p] = inMass(rnd);
        bulb(s, p[0], p[1], p[1] - 0.25 - 0.45 * rnd(), p[2]);
      }
      const kinds = ["bell", "gourd", "egg", "dome", "drum"];
      for (let n = 0; n < k.lamps; n++) {
        const a = n * 2.4, q = k.lamps > 1 ? Math.sqrt((n + 0.5) / k.lamps) : 0;
        const x = Math.cos(a) * q * w * 0.42, z = Math.sin(a) * q * d * 0.42, h = 0.36 + 0.1 * (n % 3);
        shade(s, kinds[n % kinds.length], h, x, y - thick - h - 0.15 * (n % 2), z, y, [0.74, 0.57, 0.37]);
      }
      return s;
    },
  },
  aerial_fabric: {
    group: "aerial", height: 3.0, hangs: true, on: "floor", colour: "white", size: { w: 4, d: 4 }, block: false, built: ["w", "d"], heavy: true,
    presets: {
      small: { w: 2.5, d: 2.5, strips: 4 }, medium: { w: 4, d: 4, strips: 6 }, large: { w: 6, d: 6, strips: 9 }, grand: { w: 8, d: 8, strips: 12 },
    },
    knobs: {
      style: { choices: ["swags", "canopy", "radial", "waves"], value: "swags", part: "shape" },
      strips: { min: 2, max: 24, value: 6, part: "shape" },
      sag: { min: 0.1, max: 1.5, step: 0.05, value: 0.6, size: true, part: "shape" },
      ...floralKnobs({ flowers: 0, greens: 0, flower: "rose", tint: "#f7f5ef", accent: "babysbreath", accenttint: "#f7f5ef", share: 30 }),
      bulbs: { min: 0, max: 60, value: 0, part: "lights" },
    },
    make(col, k) {
      // fabric hung under a roof (3 m), w by d, as the decorators' "tecidos aéreos": lengths of it
      // in the arch's colour on wires, sagging `sag` (swags, a canopy, a tent from the middle, waves
      // caught up along them); posies of flowers where they are gathered; bulbs hung among them
      const s = shape(), top = 3.0, rnd = rng(191), { runs, gathers } = fabricRuns(k.style, k.w, k.d, k.strips, top);
      for (const g of k.style === "radial" ? [] : [-1, 1]) rod(s, [g * k.w / 2, top, -k.d / 2], [g * k.w / 2, top, k.d / 2], 0.006, WIRE, 4);
      made("cloth", () => { for (const run of runs) band(s, run.a, run.b, run.wide, k.style === "waves" ? k.sag / 1.6 : k.sag, run.scallops, col, run.across); });
      // (a tent's middle, caught up on a ring)
      if (k.style === "radial") rod(s, [0, top, 0], [0, top - 0.05, 0], 0.004, WIRE, 4);
      dress(s, k, (r) => {
        const g = gathers[Math.floor(r() * gathers.length)], a = r() * 6.3, q = Math.sqrt(r()) * 0.16, dir = tipped(a, Math.PI * (0.35 + 0.5 * r()));
        return [[g[0] + Math.sin(a) * q, g[1] - 0.08 - 0.06 * r(), g[2] + Math.cos(a) * q], dir];
      }, 193, 0.3);
      for (let n = 0; n < k.bulbs; n++) {
        const x = (rnd() - 0.5) * k.w * 0.9, z = (rnd() - 0.5) * k.d * 0.9;
        bulb(s, x, top, top - k.sag - 0.15 - 0.4 * rnd(), z);
      }
      return s;
    },
  },
  table_flowers: {
    group: "table", height: 0.4, on: "top", colour: "white", size: { w: 0.7, d: 0.5 }, block: false, built: ["w", "d", "h"],
    knobs: {
      style: { choices: ["low", "tall", "garland", "bud", "candles"], value: "low", part: "shape" },
      vase: { colour: true, palette: "glass", value: "#dbe6e6", part: "shape" },
      candles: { min: 0, max: 12, value: 3, part: "shape" },
      ...floralKnobs({ flowers: 26, flower: "rose", tint: "#f2c4c0", accent: "babysbreath", accenttint: "#f7f5ef", share: 30, bloomsize: 0.06, greens: 24 }),
    },
    make(col, k) {
      // the flowers for a table, as you build them: a low mound in a bowl, a ball of them high on a
      // tall glass vase, a garland down its middle, bud vases in a row, or candles in glass among a
      // few; the vases and the candles' holders in the glass's colour
      const s = shape(), w = k.w, d = k.d, h = k.h, rnd = rng(171);
      const glass = (f) => made("glass", f);
      const candle = (x, z, ch) => {
        glass(() => cyl(s, 0.04, 0.045, ch * 0.6, x, 0, z, k.vase, 16));
        made("satin", () => cyl(s, 0.025, 0.025, ch, x, 0, z, WAX, 12));
        lit(() => ball(s, 0.01, x, ch + 0.012, z, FLAME, 8));
      };
      if (k.style === "tall") {
        // (the stand under the arrangement: a slim glass vase 60 cm high)
        glass(() => { cyl(s, 0.09, 0.09, 0.012, 0, 0, 0, k.vase, 20); cyl(s, 0.035, 0.06, 0.6, 0, 0.012, 0, k.vase, 16); });
        dress(s, k, (r) => {
          const a = r() * 6.3, q = r() * Math.PI * 0.75, dir = [Math.sin(q) * Math.sin(a), Math.cos(q), Math.sin(q) * Math.cos(a)];
          return [[dir[0] * w * 0.4, 0.62 + h * 0.4 + dir[1] * h * 0.4, dir[2] * d * 0.6], dir];
        }, 173, 0.25);
        for (let n = 0; n < 6; n++) ivy(s, [Math.sin(n) * w * 0.3, 0.62 + h * 0.2, Math.cos(n) * d * 0.4], 0.3 + 0.2 * rnd(), 175 + n);
      } else if (k.style === "garland") {
        dress(s, k, (r) => {
          const x = (r() - 0.5) * w, a = r() * 6.3;
          return [[x, 0.03 + 0.05 * r(), (r() - 0.5) * d * 0.6], tipped(a, 0.3 + 0.9 * r())];
        }, 177, 0.22);
      } else if (k.style === "bud") {
        const n = Math.max(2, Math.round(w / 0.12));
        for (let j = 0; j < n; j++) {
          const x = (j - (n - 1) / 2) * (w / n), z = (j % 2 ? 0.04 : -0.04) * Math.min(1, d / 0.3), vh = 0.1 + 0.06 * (j % 3);
          glass(() => cyl(s, 0.03, 0.022, vh, x, 0, z, k.vase, 14));
          rod(s, [x, vh * 0.5, z], [x, vh + 0.08, z], 0.003, [0.36, 0.55, 0.28], 4);
          const accent = (j % 3) === 2 && k.share > 0;
          flower(s, accent ? k.accent : k.flower, k.bloomsize, accent ? k.accenttint : k.tint, [x, vh + 0.08, z], tipped(j, 0.4), j);
        }
      } else {
        // low (a bowl) or candles (holders among a looser ring of flowers)
        if (k.style === "low") glass(() => cyl(s, w * 0.22, w * 0.3, Math.min(0.1, h * 0.35), 0, 0, 0, k.vase, 28));
        mound(s, k, 0, 0, Math.min(w, d) * 0.4, (k.style === "low" ? 0.64 : 0.35) * h, 179, k.flowers, k.greens, 0.16);
      }
      const n = k.style === "candles" ? Math.max(1, k.candles) : k.candles;
      for (let j = 0; j < n; j++) {
        const x = n > 1 ? (j / (n - 1) - 0.5) * w * 0.8 : 0, z = (j % 2 ? 1 : -1) * d * 0.22;
        candle(x, k.style === "tall" ? z + d * 0.3 : z, 0.08 + 0.08 * ((j * 7) % 3));
      }
      return s;
    },
  },
};
