// A drawn room (the sample venue) seen without the browser, in a second or two: as text from above
// (plan), as text against one wall (elevation), as a list of its fittings, or as a tiny picture
// from where a person stands (view), beside a frame of the walkthrough if one is given. For agents
// working on sample_venue.py / venue_fittings.py: look before paying for a real screenshot.
// Driven by scripts/venue_view.py (which writes the scene: the splats as float32, the fixtures as
// JSON, in the venue's own metres: x along the house, y up, z across; turn 0 faces +z). Tested by
// tests/js/venue_view.test.mjs (tests/unit/test_venue_view_js.py).
import fs from "node:fs";
import zlib from "node:zlib";
import { STARTERS, starterShape, FINISHES } from "../src/body_studio/static/decor.js";

const GLASS = FINISHES.findIndex((f) => f.name === "glass");

// ---------------------------------------------------------------- the scene
// Each fixture's shape where it stands: the starter's triangles turned by `turn` about y (three.js's
// sense: its front then points along [sin turn, cos turn]), stretched by `scale`, moved to `at`.
// -> { item, k, tris: Float32Array (9 per triangle), cols: Float32Array (3 per triangle), glow (1 lit,
// 2 glass: the render leaves glass out, as the page shows through it), lo, hi }
const shapes = new Map();
export function placed(t, k = 0) {
  if (!STARTERS[t.item]) return null;
  const key = t.item + "|" + (t.colour || "") + "|" + JSON.stringify(t.opts || null);
  if (!shapes.has(key)) shapes.set(key, starterShape(t.item, t.colour, t.opts || null));
  const s = shapes.get(key), sc = t.scale || [1, 1, 1], turn = fixtureTurn(t);
  const c = Math.cos(turn), sn = Math.sin(turn), [ax, ay, az] = t.at;
  const n = s.i.length / 3, tris = new Float32Array(9 * n), cols = new Float32Array(3 * n), glow = new Uint8Array(n);
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let f = 0; f < n; f++) {
    let g = 0;
    for (let j = 0; j < 3; j++) {
      const v = s.i[3 * f + j], x = s.p[3 * v] * sc[0], y = s.p[3 * v + 1] * sc[1], z = s.p[3 * v + 2] * sc[2];
      const w = [ax + x * c + z * sn, ay + y, az - x * sn + z * c];
      for (let a = 0; a < 3; a++) { tris[9 * f + 3 * j + a] = w[a]; lo[a] = Math.min(lo[a], w[a]); hi[a] = Math.max(hi[a], w[a]); }
      for (let a = 0; a < 3; a++) cols[3 * f + a] += s.c[3 * v + a] / 3;
      g |= s.g[v] ? 1 : 0;
      if (s.m[v] === GLASS) g |= 2;
    }
    glow[f] = g;
  }
  return { item: t.item, k, tris, cols, glow, lo, hi, t };
}
export function fixtureTurn(t) {
  const f = t.facing;
  return f && (f[0] || f[2]) ? Math.atan2(f[0], f[2]) : t.turn || 0;
}

// splats: 9 floats each (x, y, z, r, g, b, sx, sy, sz)
export function readScene(dir) {
  const buf = fs.readFileSync(dir + "/splats.f32");
  const splats = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  const meta = JSON.parse(fs.readFileSync(dir + "/scene.json", "utf8"));
  return { splats, fixtures: meta.fixtures, palette: meta.palette || {} };
}

// Everything as points on its surface, about `step` apart (faces seen edge on from above still
// leave a line): { pos, col, src (-1 a splat, else the fixture's k) }. Only what lies in `box`
// ([x0, x1, y0, y1, z0, z1], or null for all).
export function points(scene, step, box = null, skip = ["sky_dome"]) {
  const pos = [], col = [], src = [];
  const inside = (x, y, z) => !box || (x >= box[0] && x <= box[1] && y >= box[2] && y <= box[3] && z >= box[4] && z <= box[5]);
  const S = scene.splats;
  for (let k = 0; k < S.length; k += 9) {
    if (!inside(S[k], S[k + 1], S[k + 2])) continue;
    pos.push(S[k], S[k + 1], S[k + 2]); col.push(S[k + 3], S[k + 4], S[k + 5]); src.push(-1);
  }
  scene.fixtures.forEach((t, k) => {
    if (skip.includes(t.item)) return;
    const p = placed(t, k);
    if (!p || (box && (p.hi[0] < box[0] || p.lo[0] > box[1] || p.hi[1] < box[2] || p.lo[1] > box[3] || p.hi[2] < box[4] || p.lo[2] > box[5]))) return;
    const T = p.tris;
    for (let f = 0; f < T.length / 9; f++) {
      const o = 9 * f, e1 = [T[o + 3] - T[o], T[o + 4] - T[o + 1], T[o + 5] - T[o + 2]], e2 = [T[o + 6] - T[o], T[o + 7] - T[o + 1], T[o + 8] - T[o + 2]];
      const n = Math.max(1, Math.ceil(Math.max(Math.hypot(...e1), Math.hypot(...e2)) / step));
      for (let a = 0; a <= n; a++) for (let b = 0; a + b <= n; b++) {
        const u = a / n, v = b / n, x = T[o] + u * e1[0] + v * e2[0], y = T[o + 1] + u * e1[1] + v * e2[1], z = T[o + 2] + u * e1[2] + v * e2[2];
        if (!inside(x, y, z)) continue;
        pos.push(x, y, z); col.push(p.cols[3 * f], p.cols[3 * f + 1], p.cols[3 * f + 2]); src.push(k);
      }
    }
  });
  return { pos, col, src };
}

// out[cell] = the mean colour of the points cellOf(p) puts in it (-1: none)
function meanColours(P, out, cellOf) {
  const sum = new Map();
  for (let p = 0; p < P.src.length; p++) {
    const c = cellOf(p);
    if (c < 0) continue;
    const s = sum.get(c) || [0, 0, 0, 0];
    for (let a = 0; a < 3; a++) s[a] += P.col[3 * p + a];
    s[3]++;
    sum.set(c, s);
  }
  for (const [c, s] of sum) out[c] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]];
}

// ---------------------------------------------------------------- text
// Letters for the fixtures' items, the most common first (A-Z; the rest share "?").
export function letters(items) {
  const n = new Map();
  for (const it of items) n.set(it, (n.get(it) || 0) + 1);
  const order = [...n.keys()].sort((a, b) => n.get(b) - n.get(a) || (a < b ? -1 : 1));
  const out = new Map();
  order.forEach((it, j) => out.set(it, j < 26 ? String.fromCharCode(65 + j) : "?"));
  return out;
}

// the nearest of the named colours (palette: { NAME: [r, g, b] }) to c, by plain distance
export function nearest(palette, c) {
  let best = null, d = Infinity;
  for (const [name, v] of Object.entries(palette)) {
    const e = (v[0] - c[0]) ** 2 + (v[1] - c[1]) ** 2 + (v[2] - c[2]) ** 2;
    if (e < d) { d = e; best = name; }
  }
  return best;
}

// A ruler of metres along a row of cells starting at a0, `cell` each (dir -1: counting down).
function ruler(n, a0, cell, dir = 1) {
  const row = Array(n).fill(" ");
  for (let i = 0; i < n; i++) {
    // (a label where the cell holds a whole metre: its left edge on it, or one just past it)
    const a = a0 + dir * i * cell, prev = a0 + dir * (i - 1) * cell;
    const whole = (v) => (dir > 0 ? Math.floor(v + 1e-6) : Math.ceil(v - 1e-6));
    if (i === 0 || whole(a) !== whole(prev)) {
      const lab = String(whole(a));
      if (row.slice(i, i + lab.length + 1).every((ch) => ch === " ")) for (let j = 0; j < lab.length && i + j < n; j++) row[i + j] = lab[j];
    }
  }
  return row.join("");
}

// The plan: the floor from above, x across (left to right) and z down the page, `cell` metres a
// character. What stands through the cut (1.0-1.7 m up) is a wall: "#" a splat wall, a capital the
// fixture's letter; below it, the top of what is lower: a small letter for a fixture, ":" for splats;
// "." bare floor; " " nothing. by "colour": each cell the letter of the nearest named colour of the
// highest thing under `top` instead.
export function plan(scene, { box, cell = 0.25, top = 2.3, by = "what" }) {
  const [x0, x1, z0, z1] = box, nx = Math.max(1, Math.round((x1 - x0) / cell)), nz = Math.max(1, Math.round((z1 - z0) / cell));
  const P = points(scene, cell / 2, [x0, x1, -0.5, top, z0, z1]);
  const N = nx * nz, cut = new Int32Array(N).fill(-2), topY = new Float32Array(N).fill(-Infinity), topSrc = new Int32Array(N).fill(-2);
  const floor = new Uint8Array(N), topCol = new Array(N);
  for (let p = 0; p < P.src.length; p++) {
    const x = P.pos[3 * p], y = P.pos[3 * p + 1], z = P.pos[3 * p + 2];
    const i = Math.min(nx - 1, Math.floor((x - x0) / cell)), j = Math.min(nz - 1, Math.floor((z - z0) / cell));
    if (i < 0 || j < 0) continue;
    const c = j * nx + i, s = P.src[p];
    if (y < 0.12) floor[c] = 1;
    if (y >= 1.0 && y <= 1.7 && (cut[c] === -2 || s >= 0)) cut[c] = s;   // (a fixture on a splat wall shows)
    if (y > topY[c]) { topY[c] = y; topSrc[c] = s; }
  }
  // (each cell's colour: the mean of what is within 5 cm of its top, so one speckled splat doesn't decide)
  if (by === "colour") meanColours(P, topCol, (p) => {
    const i = Math.min(nx - 1, Math.floor((P.pos[3 * p] - x0) / cell)), j = Math.min(nz - 1, Math.floor((P.pos[3 * p + 2] - z0) / cell));
    return i < 0 || j < 0 || P.pos[3 * p + 1] < topY[j * nx + i] - 0.05 ? -1 : j * nx + i;
  });
  const used = [];
  for (let c = 0; c < N; c++) {
    const s = cut[c] >= 0 ? cut[c] : topSrc[c] >= 0 && topY[c] > 0.12 ? topSrc[c] : -1;
    if (s >= 0) used.push(scene.fixtures[s].item);
  }
  const L = letters(used), names = new Map();
  const colourChar = (c) => {
    const name = nearest(scene.palette, c);
    if (!names.has(name)) names.set(name, names.size < 26 ? String.fromCharCode(97 + names.size) : "?");
    return names.get(name);
  };
  const rows = [];
  for (let j = 0; j < nz; j++) {
    let r = "";
    for (let i = 0; i < nx; i++) {
      const c = j * nx + i;
      if (by === "colour") { r += topCol[c] ? colourChar(topCol[c]) : " "; continue; }
      if (cut[c] === -1) r += "#";
      else if (cut[c] >= 0) r += L.get(scene.fixtures[cut[c]].item);
      else if (topSrc[c] >= 0 && topY[c] > 0.12) r += L.get(scene.fixtures[topSrc[c]].item).toLowerCase();
      else if (topSrc[c] === -1 && topY[c] > 0.12) r += ":";
      else if (floor[c] || topY[c] > -Infinity) r += ".";
      else r += " ";
    }
    rows.push(r);
  }
  const zl = (j) => (j % Math.round(1 / cell) === 0 ? (z0 + j * cell).toFixed(1).padStart(6) : "      ");
  const out = [`plan x ${x0}..${x1} (across), z ${z0}..${z1} (down), ${cell} m a character; walls cut at 1.0-1.7 m`,
    "       " + ruler(nx, x0, cell), ...rows.map((r, j) => zl(j) + " " + r)];
  out.push(legend(by, L, names));
  return out.join("\n");
}

function legend(by, L, names) {
  if (by === "colour") return "colours: " + [...names].map(([n, ch]) => `${ch}=${n}`).join(" ");
  return "# splat wall  : low splats  . floor  CAPITAL through the cut, small below it:\n" +
    [...L].map(([it, ch]) => `  ${ch} ${it}`).join("\n");
}

// The elevation: what a person standing on one side of the plane `axis` = `at` sees of it, straight
// on (no perspective), `cell` metres a character, from the floor to `up`; things up to `depth` in
// front of it (and 0.35 m behind, its own thickness) count, the nearest drawn. from: "-" stands at
// the lower side looking toward +axis, "+" the other. by: "what" ("#" splats, the fixture's
// letter), "colour" (nearest named colour) or "depth" (0-9: tenths of `depth` from the plane).
export function elevation(scene, { axis = "z", at, from = "-", range, cell = 0.1, up = 3.2, depth = 1.0, by = "what" }) {
  const look = from === "-" ? 1 : -1;                  // which way the eyes look along the axis
  const ai = axis === "x" ? 0 : 2, hi = axis === "x" ? 2 : 0;
  // (looking +z, the right hand is -x; looking -z, +x; looking +x, +z; looking -x, -z)
  const right = axis === "z" ? -look : look;
  const [a0, a1] = range, n = Math.max(1, Math.round((a1 - a0) / cell)), m = Math.max(1, Math.round(up / cell));
  const near = look > 0 ? at - depth : at - 0.35, far = look > 0 ? at + 0.35 : at + depth;
  const box = axis === "z" ? [a0, a1, -0.2, up, near, far] : [near, far, -0.2, up, a0, a1];
  const P = points(scene, cell / 2, box);
  const N = n * m, best = new Float32Array(N).fill(Infinity), src = new Int32Array(N).fill(-2), col = new Array(N);
  for (let p = 0; p < P.src.length; p++) {
    const h = P.pos[3 * p + hi], y = P.pos[3 * p + 1], a = P.pos[3 * p + ai];
    const u = right > 0 ? (h - a0) / cell : (a1 - h) / cell;
    const i = Math.min(n - 1, Math.floor(u)), j = Math.min(m - 1, Math.floor((up - y) / cell));
    if (i < 0 || j < 0) continue;
    // (smaller: nearer the eye; the floor in front only where nothing else is)
    const d = look * a + (y < 0.03 ? 100 : 0), c = j * n + i;
    if (d < best[c]) { best[c] = d; src[c] = P.src[p]; }
  }
  if (by === "colour") meanColours(P, col, (p) => {
    const h = P.pos[3 * p + hi], y = P.pos[3 * p + 1], a = P.pos[3 * p + ai];
    const i = Math.min(n - 1, Math.floor(right > 0 ? (h - a0) / cell : (a1 - h) / cell)), j = Math.min(m - 1, Math.floor((up - y) / cell));
    return i < 0 || j < 0 || look * a + (y < 0.03 ? 100 : 0) > best[j * n + i] + 0.05 ? -1 : j * n + i;
  });
  const used = [];
  for (let c = 0; c < N; c++) if (src[c] >= 0) used.push(scene.fixtures[src[c]].item);
  const L = letters(used), names = new Map();
  const rows = [];
  for (let j = 0; j < m; j++) {
    let r = "";
    for (let i = 0; i < n; i++) {
      const c = j * n + i;
      if (src[c] === -2) { r += " "; continue; }
      if (by === "colour") {
        const name = nearest(scene.palette, col[c]);
        if (!names.has(name)) names.set(name, names.size < 26 ? String.fromCharCode(97 + names.size) : "?");
        r += names.get(name);
      } else if (by === "depth") r += String(Math.max(0, Math.min(9, Math.floor((look * at - (best[c] % 100)) / depth * 10))));
      else r += src[c] === -1 ? "#" : L.get(scene.fixtures[src[c]].item);
    }
    rows.push(r.replace(/\s+$/, ""));
  }
  const yl = (j) => (j % Math.round(1 / cell) === 0 ? (up - j * cell).toFixed(1).padStart(5) : "     ");
  const name = `${axis} = ${at}`, way = `${look > 0 ? "+" : "-"}${axis}`;
  const out = [`elevation of ${name}, looking ${way} (stood at ${from === "-" ? "lower" : "higher"} ${axis}); ` +
    `${axis === "z" ? "x" : "z"} ${right > 0 ? a0 + " (left) .. " + a1 : a1 + " (left) .. " + a0} (right), ${cell} m a character`,
    "      " + ruler(n, right > 0 ? a0 : a1, cell, right), ...rows.map((r, j) => yl(j) + " " + r)];
  if (by === "depth") out.push(`digits: tenths of ${depth} m in front of the plane (0 on it)`);
  else out.push(by === "colour" ? "colours: " + [...names].map(([nm, ch]) => `${ch}=${nm}`).join(" ")
    : "# splats, letters fixtures:\n" + [...L].map(([it, ch]) => `  ${ch} ${it}`).join("\n"));
  return out.join("\n");
}

// The fixtures in box [x0, x1, z0, z1] (by where they stand), one a line: their index in
// fixtures(), item, where, turn in degrees, opts and colour, and the box they fill.
export function listing(scene, { box }) {
  const f = (v) => (Math.round(v * 100) / 100).toString();
  const out = [];
  scene.fixtures.forEach((t, k) => {
    const [x, y, z] = t.at;
    if (box && (x < box[0] || x > box[1] || z < box[2] || z > box[3])) return;
    const p = placed(t, k);
    const deg = Math.round((fixtureTurn(t) * 180) / Math.PI);
    const fill = p ? ` fills x ${f(p.lo[0])}..${f(p.hi[0])} y ${f(p.lo[1])}..${f(p.hi[1])} z ${f(p.lo[2])}..${f(p.hi[2])}` : " (not a starter)";
    out.push(`${String(k).padStart(3)} ${t.item} at (${t.at.map(f).join(", ")}) turn ${deg}${t.opts ? " " + JSON.stringify(t.opts) : ""}` +
      `${t.colour ? " " + t.colour : ""}${t.scale ? " scale " + t.scale.join("x") : ""}${fill}`);
  });
  return out.join("\n");
}

// ---------------------------------------------------------------- a tiny picture
// The camera as compare.js keeps a fly view: at [x, z] (the venue's metres), look (0: along +x,
// +pi/2 turns left, toward -z), pitch (up), eye (m up), fov (vertical, degrees).
export function camera(v, w, h) {
  const look = v.look || 0, pitch = v.pitch || 0;
  const f = [Math.cos(look) * Math.cos(pitch), Math.sin(pitch), -Math.sin(look) * Math.cos(pitch)];
  const r = [Math.sin(look), 0, Math.cos(look)];        // (forward x up)
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const eye = [v.at[0], v.eye ?? 1.6, v.at[1]], focal = h / 2 / Math.tan(((v.fov || 100) * Math.PI) / 360);
  return { eye, f, r, u, focal, w, h };
}
// a point in the camera's frame: [right, up, ahead]
const toCam = (C, p) => {
  const d = [p[0] - C.eye[0], p[1] - C.eye[1], p[2] - C.eye[2]];
  return [d[0] * C.r[0] + d[1] * C.r[1] + d[2] * C.r[2], d[0] * C.u[0] + d[1] * C.u[1] + d[2] * C.u[2], d[0] * C.f[0] + d[1] * C.f[1] + d[2] * C.f[2]];
};
export const project = (C, q) => [C.w / 2 + (q[0] / q[2]) * C.focal, C.h / 2 - (q[1] / q[2]) * C.focal, q[2]];

const NEAR = 0.05, LIGHT = (() => { const l = [0.35, 1, 0.25], n = Math.hypot(...l); return l.map((v) => v / n); })();
// The room drawn from v at w x h: the fixtures' triangles (clipped at the near plane), lit a little
// from above so their faces read, and the splats as small squares, nearest wins. -> RGB bytes
export function render(scene, v, w, h, sky = [0.78, 0.84, 0.9]) {
  const C = camera(v, w, h), zb = new Float32Array(w * h).fill(Infinity), rgb = new Uint8Array(w * h * 3);
  for (let k = 0; k < w * h; k++) for (let a = 0; a < 3; a++) rgb[3 * k + a] = Math.round(sky[a] * 255);
  const put = (x, y, z, c) => {
    const k = y * w + x;
    if (z < zb[k]) { zb[k] = z; rgb[3 * k] = c[0]; rgb[3 * k + 1] = c[1]; rgb[3 * k + 2] = c[2]; }
  };
  const byte = (c, s = 1) => c.map((v) => Math.max(0, Math.min(255, Math.round(v * s * 255))));
  scene.fixtures.forEach((t, k) => {
    if (t.item === "sky_dome") return;
    const p = placed(t, k);
    if (!p) return;
    const T = p.tris;
    for (let f = 0; f < T.length / 9; f++) {
      if (p.glow[f] & 2) continue;
      const o = 9 * f, a = [T[o], T[o + 1], T[o + 2]], b = [T[o + 3], T[o + 4], T[o + 5]], c = [T[o + 6], T[o + 7], T[o + 8]];
      const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const nn = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]], len = Math.hypot(...nn) || 1;
      const lit = p.glow[f] & 1 ? 1.1 : 0.62 + 0.38 * Math.abs((nn[0] * LIGHT[0] + nn[1] * LIGHT[1] + nn[2] * LIGHT[2]) / len);
      const col = byte([p.cols[3 * f], p.cols[3 * f + 1], p.cols[3 * f + 2]], lit);
      for (const tri of clip([toCam(C, a), toCam(C, b), toCam(C, c)])) raster(tri.map((q) => project(C, q)), w, h, (x, y, z) => put(x, y, z, col));
    }
  });
  const S = scene.splats;
  for (let k = 0; k < S.length; k += 9) {
    const q = toCam(C, [S[k], S[k + 1], S[k + 2]]);
    if (q[2] < NEAR) continue;
    const [px, py] = project(C, q), r = Math.max(0.5, (1.2 * Math.max(S[k + 6], S[k + 7], S[k + 8]) * C.focal) / q[2]);
    if (px + r < 0 || py + r < 0 || px - r > w || py - r > h) continue;
    const col = byte([S[k + 3], S[k + 4], S[k + 5]]);
    for (let y = Math.max(0, Math.floor(py - r)); y <= Math.min(h - 1, Math.floor(py + r)); y++)
      for (let x = Math.max(0, Math.floor(px - r)); x <= Math.min(w - 1, Math.floor(px + r)); x++) put(x, y, q[2], col);
  }
  return rgb;
}

// a triangle in the camera's frame cut where it passes behind the near plane: 0, 1 or 2 triangles
export function clip(tri) {
  const out = [];
  for (let k = 0; k < 3; k++) {
    const p = tri[k], q = tri[(k + 1) % 3], pin = p[2] >= NEAR, qin = q[2] >= NEAR;
    if (pin) out.push(p);
    if (pin !== qin) { const s = (NEAR - p[2]) / (q[2] - p[2]); out.push(p.map((v, a) => v + s * (q[a] - v))); }
  }
  if (out.length < 3) return [];
  return out.length === 3 ? [out] : [[out[0], out[1], out[2]], [out[0], out[2], out[3]]];
}

// every pixel whose centre is inside the projected triangle, with its depth (interpolated as 1/z)
export function raster(t, w, h, fn) {
  const [a, b, c] = t, area = (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]);
  if (Math.abs(area) < 1e-9) return;
  const x0 = Math.max(0, Math.floor(Math.min(a[0], b[0], c[0]))), x1 = Math.min(w - 1, Math.ceil(Math.max(a[0], b[0], c[0])));
  const y0 = Math.max(0, Math.floor(Math.min(a[1], b[1], c[1]))), y1 = Math.min(h - 1, Math.ceil(Math.max(a[1], b[1], c[1])));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const px = x + 0.5, py = y + 0.5;
    const wa = ((b[0] - px) * (c[1] - py) - (c[0] - px) * (b[1] - py)) / area;
    const wb = ((c[0] - px) * (a[1] - py) - (a[0] - px) * (c[1] - py)) / area;
    const wc = 1 - wa - wb;
    if (wa < 0 || wb < 0 || wc < 0) continue;
    fn(x, y, 1 / (wa / a[2] + wb / b[2] + wc / c[2]));
  }
}

// ---------------------------------------------------------------- PNG
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
export function png(rgb, w, h) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; Buffer.from(rgb.buffer, rgb.byteOffset + y * w * 3, w * 3).copy(raw, y * (w * 3 + 1) + 1); }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]), crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
// pictures side by side (each { rgb, w, h }, the same height), `gap` px of white between
export function beside(pics, gap = 4) {
  const h = pics[0].h, w = pics.reduce((s, p) => s + p.w, 0) + gap * (pics.length - 1), rgb = new Uint8Array(w * h * 3).fill(255);
  let x0 = 0;
  for (const p of pics) {
    for (let y = 0; y < h; y++) rgb.set(p.rgb.subarray(y * p.w * 3, (y + 1) * p.w * 3), (y * w + x0) * 3);
    x0 += p.w + gap;
  }
  return { rgb, w, h };
}
// rows of pictures one under another, left-aligned, 12 px of white between
export function below(rows, gap = 12) {
  const w = Math.max(...rows.map((r) => r.w)), h = rows.reduce((s, r) => s + r.h, 0) + gap * (rows.length - 1);
  const rgb = new Uint8Array(w * h * 3).fill(255);
  let y0 = 0;
  for (const r of rows) {
    for (let y = 0; y < r.h; y++) rgb.set(r.rgb.subarray(y * r.w * 3, (y + 1) * r.w * 3), ((y0 + y) * w) * 3);
    y0 += r.h + gap;
  }
  return { rgb, w, h };
}

// ---------------------------------------------------------------- run by venue_view.py
// argv: the scene's folder and a job (JSON): { what: plan|elev|list|view, ... }; text to stdout,
// a picture to job.out.
if (import.meta.url === `file://${process.argv[1]}`) {
  const scene = readScene(process.argv[2]), job = JSON.parse(process.argv[3]);
  if (job.what === "plan") console.log(plan(scene, job));
  else if (job.what === "elev") console.log(elevation(scene, job));
  else if (job.what === "list") console.log(listing(scene, job));
  else if (job.what === "view") {
    // (pairs: [{ view, frame }]: the walkthrough's frame and the render beside it, `cols` pairs a row)
    const pic = (v) => ({ rgb: render(scene, v, job.w, job.h), w: job.w, h: job.h });
    const raw = (f) => ({ rgb: new Uint8Array(fs.readFileSync(f)), w: job.w, h: job.h });
    let p;
    if (job.pairs) {
      const cells = job.pairs.map((q) => beside(q.frame ? [raw(q.frame), pic(q.view)] : [pic(q.view)]));
      const rows = [];
      for (let k = 0; k < cells.length; k += job.cols || 4) rows.push(beside(cells.slice(k, k + (job.cols || 4)), 12));
      p = below(rows);
    } else {
      const pics = (job.views || [job.view]).map(pic);
      if (job.frame) pics.unshift(raw(job.frame));
      p = beside(pics);
    }
    fs.writeFileSync(job.out, png(p.rgb, p.w, p.h));
    console.log(job.out);
  } else throw new Error("what? " + job.what);
}

