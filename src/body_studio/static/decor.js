// Decor in a room, free of three.js so it can be tested on its own (tests/js/decor.test.mjs, run by
// tests/unit/test_decor_js.py): the starter items (their shapes in decor/*.js: chairs, tables, an
// arch, flowers, candles...), the meshes made from photos (decor.py packs them), and where things go: on the
// floor or on a table, in a row, round a table, what the body can't walk through and where it can
// sit. Everything is in the room map's metres (room.py): x and z along the floor, y up. An item's
// own shape stands on y = 0 over x = z = 0, its front toward +z; `turn` turns it about y (radians,
// three.js's sense: its front then points along [sin turn, cos turn]). Design: docs/decor.md.
import { b64bytes } from "./pose.js";
import { COLOURS, F, FINISHES, finishes } from "./decor/shapes.js";
import { BASICS } from "./decor/basics.js";
import { WEDDING } from "./decor/wedding.js";
import { GARDEN } from "./decor/garden.js";
import { PROPOSALS } from "./decor/proposals.js";
import { EXTRAS } from "./decor/extras.js";
import { HOME } from "./decor/home.js";
import { CUSTOM } from "./decor/custom.js";
import { PALETTES } from "./decor/florals.js";

export { COLOURS, FINISHES, PALETTES };

// ---------------------------------------------------------------- the starters
// Each one (decor/*.js): size, the footprint, for walking and for what stands on it ({r} round, or
// {w, d}); top: the height things put on it stand at; seat: where the body sits on it (its hips,
// facing its front); block: whether the body walks round it; make(colour, knob values) -> its
// shape; knobs, built: what can be changed (knobs() below).
export const STARTERS = { ...BASICS, ...WEDDING, ...GARDEN, ...PROPOSALS, ...EXTRAS, ...HOME, ...CUSTOM };

// the groups the panel shows the starters in, in order
export const GROUPS = ["tables", "flowers", "table", "ceremony", "bar", "lights", "lounge", "garden", "home"];

// A starter's shape in a colour (a name in COLOURS; its own colour if none), changed by `opts`
// (knobs()): its size, what its main colour is made of, its own counts.
export function starterShape(id, colour, opts = null) {
  const def = STARTERS[id];
  if (!def) throw new Error("no such starter " + id);
  const col = colourOf(colour, def.colour), k = knobValues(id, opts);
  // (a colour knob reaches make() as its colour: a rose's, a glass's)
  for (const kn of knobs(id)) if (kn.colour) k[kn.name] = colourOf(k[kn.name], kn.value);
  const s = def.make(col, k);
  // a size its make() doesn't draw to is stretched to (round things stay round)
  const [w0, d0, h0] = dims(def), built = def.built || [];
  const sx = built.includes("w") ? 1 : k.w / w0, sy = built.includes("h") ? 1 : k.h / h0;
  const sz = def.size.r !== undefined ? sx : built.includes("d") ? 1 : k.d / d0;
  if (sx !== 1 || sy !== 1 || sz !== 1) for (let n = 0; n < s.p.length; n += 3) { s.p[n] *= sx; s.p[n + 1] *= sy; s.p[n + 2] *= sz; }
  // what is in its own colour made of something else (a wooden bar in brass, a cloth in satin)
  if (opts && F[opts.finish] !== undefined && opts.finish !== "glow")
    for (let v = 0; v < s.m.length; v++)
      if (!s.g[v] && s.c[3 * v] === col[0] && s.c[3 * v + 1] === col[1] && s.c[3 * v + 2] === col[2]) s.m[v] = F[opts.finish];
  return s;
}

// ---------------------------------------------------------------- changing a starter
// Every starter has knobs: its width, depth (not a round one's) and height, what its own colour is
// made of, and the counts its make() takes (def.knobs: { flowers: {min, max, step, value} }: how
// many roses in a bouquet, tiers on a cake stand). The sizes are in metres; one its make() draws
// to (def.built: ["w", "h"]: a bar's legs keep their thickness) is drawn, the others stretch it.
// A placed thing keeps the ones changed in `opts`, so a layout made before them is as it was.
export const MATERIALS = ["cloth", "satin", "wood", "metal", "glass"];
export function dims(def) {
  const sz = def.size;
  return sz.r !== undefined ? [2 * sz.r, 2 * sz.r, def.height] : [sz.w, sz.d, def.height];
}
const cm = (v) => Math.round(v * 100) / 100;
// [{ name, min, max, step, value, size (a length in metres, else a count) }]
export function knobs(id) {
  const def = STARTERS[id];
  if (!def) return [];
  const [w, d, h] = dims(def), out = [];
  // (a size the starter draws itself at (built) goes down to 5 cm: a strip of wall tiles beside a door)
  const size = (name, v) => out.push({ name, value: v, size: true, step: 0.01,
                                       min: (def.built || []).includes(name) ? Math.min(v, 0.05) : Math.min(v, cm(Math.max(0.02, v * 0.4))),
                                       max: Math.max(v, cm(Math.min(12, Math.max(v * 2.5, v + 0.3)))) });
  size("w", w);
  if (def.size.r === undefined) size("d", d);
  // (what hangs is raised by its lift, a cloth on the floor has no height to speak of)
  // (unless it draws its own height: a face of brick or tiles on a wall)
  if ((!def.hangs || (def.built || []).includes("h")) && h >= 0.05) size("h", h);
  for (const [name, k] of Object.entries(def.knobs || {})) out.push({ name, size: !!k.size, step: 1, ...k });
  return out;
}
// A knob can also be a choice (choices: ["round", "square", ...], value one of them: an arch's
// shape, a flower's kind) or a colour (colour: true, value a name in COLOURS or "#rrggbb": the
// roses', the glasses'); a knob may name the part of the panel it is shown in (part: "flowers").
export const isChoice = (k) => Array.isArray(k.choices);
export const okColour = (v) => typeof v === "string" && (!!COLOURS[v] || !!fromHex(v));
// the knobs' values for opts (the starter's own where opts has none, or one out of range)
export function knobValues(id, opts) {
  const out = {};
  for (const k of knobs(id)) {
    const o = opts ? opts[k.name] : undefined;
    if (isChoice(k)) { out[k.name] = k.choices.includes(o) ? o : k.value; continue; }
    if (k.colour) { out[k.name] = okColour(o) ? (fromHex(o) ? toHex(fromHex(o)) : o) : k.value; continue; }
    const v = opts && Number.isFinite(+opts[k.name]) && opts[k.name] !== null ? +opts[k.name] : k.value;
    out[k.name] = Math.min(k.max, Math.max(k.min, k.size ? v : Math.round(v)));
  }
  const def = STARTERS[id];
  if (def && def.size.r !== undefined) out.d = out.w;
  if (def && out.h === undefined) out.h = def.height;
  return out;
}
// opts kept to what differs from the starter's own (null when nothing does)
export function cleanOpts(id, opts) {
  if (!opts) return null;
  const out = {}, v = knobValues(id, opts);
  for (const k of knobs(id)) {
    if (opts[k.name] === undefined) continue;
    if (isChoice(k) || k.colour) { if (v[k.name] !== k.value) out[k.name] = v[k.name]; }
    else if (Math.abs(v[k.name] - k.value) > 1e-6) out[k.name] = v[k.name];
  }
  if (MATERIALS.includes(opts.finish)) out.finish = opts.finish;
  return Object.keys(out).length ? out : null;
}
// a short key for opts, for a shape and its picture made once
export const optsKey = (opts) => (opts ? Object.keys(opts).sort().map((k) => k + "=" + opts[k]).join(",") : "");
// What the page knows of a placed starter p (itemDef), at the size its opts give it: its footprint,
// top and seats move with it.
export function sized(def, p) {
  const o = p && p.opts, st = def && STARTERS[def.id];
  // (where an arch stands on the floor follows its shape: postsFor(knob values))
  if (st && st.postsFor && def.starter && o && (o.w === undefined && o.d === undefined && o.h === undefined))
    return { ...def, posts: st.postsFor(knobValues(def.id, o)) };
  if (!def || !def.starter || !o || (o.w === undefined && o.d === undefined && o.h === undefined)) return def;
  const [w0, d0, h0] = dims(def), v = knobValues(def.id, o);
  const rx = v.w / w0, ry = v.h / h0, rz = def.size.r !== undefined ? rx : v.d / d0;
  const at = (st) => st && { ...st, x: (st.x || 0) * rx, y: st.y * ry, z: (st.z || 0) * rz };
  return {
    ...def, height: def.height * ry, top: def.top === undefined ? undefined : def.top * ry,
    size: def.size.r !== undefined ? { r: def.size.r * rx } : { w: def.size.w * rx, d: def.size.d * rz },
    seat: at(def.seat), seats: def.seats && def.seats.map(at),
    posts: st && st.postsFor ? st.postsFor(v) : def.posts && def.posts.map(([x, z]) => [x * rx, z * rz]),
  };
}

// ---------------------------------------------------------------- colours of your own
// A colour is a name in COLOURS or "#rrggbb" (from the panel's picker, or typed as HEX or RGB).
// One of your own keeps the finish of the starter's own colour (a gold chair painted blue is still
// metal), so it gets its own array, registered once.
const own = new Map();                             // "#rrggbb|default name" -> [r, g, b]
export function colourOf(colour, fallback) {
  if (COLOURS[colour]) return COLOURS[colour];
  const base = COLOURS[fallback] || COLOURS.white, rgb = fromHex(colour);
  if (!rgb) return base;
  const key = colour.toLowerCase() + "|" + fallback;
  if (!own.has(key)) {
    const col = rgb.map((v) => v / 255);
    if (finishes.has(base)) finishes.set(col, finishes.get(base));
    own.set(key, col);
  }
  return own.get(key);
}
// "#c9a46a", "c9a46a" or "#fa0" -> [201, 164, 106] (0..255), else null
export function fromHex(text) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(text ?? "").trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join("") : m[1];
  return [0, 2, 4].map((k) => parseInt(h.slice(k, k + 2), 16));
}
// [201, 164, 106] -> "#c9a46a" (each rounded and kept within 0..255)
export function toHex(rgb) {
  return "#" + rgb.map((v) => Math.max(0, Math.min(255, Math.round(+v || 0))).toString(16).padStart(2, "0")).join("");
}
// "201, 164, 106", "rgb(201 164 106)" or "201;164;106" -> [201, 164, 106], else null
export function fromRgb(text) {
  const n = String(text ?? "").replace(/^\s*rgba?\s*\(|\)\s*$/gi, "").split(/[\s,;]+/).filter(Boolean);
  if (n.length !== 3 || n.some((v) => !/^\d{1,3}$/.test(v) || +v > 255)) return null;
  return n.map(Number);
}
// any colour the panel shows -> "#rrggbb"
export function hexOf(colour, fallback) {
  const rgb = fromHex(colour);
  return rgb ? toHex(rgb) : toHex(colourOf(colour, fallback).map((v) => v * 255));
}

// ---------------------------------------------------------------- meshes made from photos
// decor.py's pack(): positions as int16 over lo..hi, colours as bytes, faces as uint32 (all
// base64), the thing 1 high. -> { p: Float32Array, c: Float32Array (0..1), i: Uint32Array }
export function unpack(m) {
  const vb = b64bytes(m.v), cb = b64bytes(m.c), fb = b64bytes(m.f);
  const q = new Int16Array(vb.buffer, vb.byteOffset, vb.byteLength / 2);
  const p = new Float32Array(q.length);
  for (let k = 0; k < q.length; k++) {
    const a = k % 3, span = (m.hi[a] - m.lo[a]) || 1;
    p[k] = m.lo[a] + (q[k] + 32768) / 65535 * span;
  }
  const c = new Float32Array(cb.length);
  for (let k = 0; k < cb.length; k++) c[k] = cb[k] / 255;
  const i = new Uint32Array(fb.buffer.slice(fb.byteOffset, fb.byteOffset + fb.byteLength));
  return { p, c, i };
}

// What the page knows of an item, starter or made: { id, height, on, size, top, seat, block }.
// A made item's footprint is its mesh's (lo, hi, scaled to its height); it blocks the walk when
// it is taller than a step.
export function itemDef(item, mesh = null) {
  const st = STARTERS[item.id];
  if (st) return { id: item.id, starter: true, height: st.height, on: st.on, size: st.size, top: st.top, seat: st.seat,
                   seats: st.seats, block: st.block, posts: st.postsFor ? st.postsFor(knobValues(item.id, null)) : st.posts, colour: st.colour, group: st.group };
  const h = item.height || 1;
  const size = mesh ? { w: (mesh.hi[0] - mesh.lo[0]) * h, d: (mesh.hi[2] - mesh.lo[2]) * h } : { r: 0.25 * h };
  return { id: item.id, starter: false, height: h, on: item.on || "floor", size, block: h > 0.25 };
}

// ---------------------------------------------------------------- where things go
// a room's own thing (its fixtures, room.py's map): its turn, from the way its front faces (the
// sample living room's and studio's furniture: a direction turns with the map's frame, which a
// turn would not) or as given (the venue's)
export function fixtureTurn(t) {
  const f = t.facing;
  return f && (f[0] || f[2]) ? Math.atan2(f[0], f[2]) : t.turn || 0;
}
// ---------------------------------------------------------------- the room's fittings, moved by hand
// A room's own things (its fixtures) as placed things in a layout of their own, so they are dragged,
// turned, taken away and added to as the decor is; each remembers which fixture it was and where
// (was: { k, at, turn }). Those stretched along their row (scale: planted walls, the glass roof) and
// the sky's dome (set below the ground) stay as they are.
export const movable = (t) => !!STARTERS[t.item] && !t.scale && t.at[1] > -1;
export function fittingItems(trees) {
  const out = [];
  (trees || []).forEach((t, k) => {
    if (!movable(t)) return;
    const turn = fixtureTurn(t), p = { item: t.item, x: t.at[0], y: t.at[1], z: t.at[2], turn, was: { k, at: [...t.at], turn } };
    if (t.colour != null) p.colour = t.colour;
    if (t.opts) p.opts = { ...t.opts };
    out.push(p);
  });
  return out;
}
// what was changed, for the room's own file to catch up: [{ change: "moved", item, k, was, now,
// colour, opts }], "added" (no k, was) and "removed" (no now); places in the map's metres, to the mm
export function fittingChanges(placed, trees) {
  const out = [], kept = new Set(), mm = (v) => Math.round(v * 1000) / 1000;
  const look = (p) => ({ ...(p.colour != null ? { colour: p.colour } : {}), ...(p.opts ? { opts: { ...p.opts } } : {}) });
  for (const p of placed) {
    const now = { at: [mm(p.x), mm(p.y || 0), mm(p.z)], turn: mm(wrap(p.turn || 0)) };
    if (!p.was) { out.push({ change: "added", item: p.item, now, ...look(p) }); continue; }
    kept.add(p.was.k);
    const t = (trees || [])[p.was.k] || {}, a = p.was.at;
    const moved = Math.hypot(now.at[0] - a[0], now.at[1] - a[1], now.at[2] - a[2]) > 0.005 || Math.abs(wrap(now.turn - p.was.turn)) > 0.005;
    const restyled = String(p.colour ?? "") !== String(t.colour ?? "") || optsKey(p.opts) !== optsKey(t.opts);
    if (moved || restyled) out.push({ change: "moved", item: p.item, k: p.was.k, was: { at: [...a], turn: p.was.turn }, now, ...look(p) });
  }
  (trees || []).forEach((t, k) => { if (movable(t) && !kept.has(k)) out.push({ change: "removed", item: t.item, k, was: { at: [...t.at], turn: fixtureTurn(t) } }); });
  return out;
}

// a turn kept within -pi..pi
export const wrap = (a) => a - 2 * Math.PI * Math.round(a / (2 * Math.PI));
const rot = (turn, x, z) => [x * Math.cos(turn) + z * Math.sin(turn), -x * Math.sin(turn) + z * Math.cos(turn)];
const unrot = (turn, x, z) => [x * Math.cos(turn) - z * Math.sin(turn), x * Math.sin(turn) + z * Math.cos(turn)];

// whether the floor point (x, z) is on a placed item p (its footprint, grown by pad)
export function covers(def, p, x, z, pad = 0) {
  const [lx, lz] = unrot(p.turn || 0, x - p.x, z - p.z);
  const sz = def.size;
  if (sz.r !== undefined) return lx * lx + lz * lz <= (sz.r + pad) ** 2;
  return Math.abs(lx) <= sz.w / 2 + pad && Math.abs(lz) <= sz.d / 2 + pad;
}

// The height an item dropped at (x, z) stands at: on the floor (0), or for a thing that goes on
// top (flowers, a candle), on the highest placed table or pillar there, else on what the scan has
// there (roomTop(x, z): a table in the room, in metres, or 0).
export function dropY(def, placed, defs, x, z, roomTop = () => 0, skip = null) {
  if (def.on !== "top") return 0;
  let y = Math.max(0, roomTop(x, z) || 0);
  for (const p of placed) {
    const d = defs(p.item, p);
    if (p === skip || !d || d.top === undefined) continue;
    if (covers(d, p, x, z)) y = Math.max(y, (p.y || 0) + d.top);
  }
  return y;
}

// n - 1 more like p, side by side to its right (its own x), `gap` metres apart
export function row(def, p, n, gap = 0.1) {
  const w = (def.size.r !== undefined ? 2 * def.size.r : def.size.w) + gap, out = [];
  const [dx, dz] = rot(p.turn || 0, 1, 0);
  for (let k = 1; k < n; k++) out.push({ ...p, x: p.x + dx * w * k, z: p.z + dz * w * k });
  return out;
}

// n chairs round a table p, facing it: on a circle round a round one, along both long sides of a
// long one (and its ends when there are more than fit along them)
export function around(tableDef, p, chairDef, n, colour = null) {
  const out = [], back = chairDef.size.d / 2 + 0.08, add = (lx, lz, face) => {
    const [x, z] = rot(p.turn || 0, lx, lz);
    const c = { item: chairDef.id, x: p.x + x, y: 0, z: p.z + z, turn: wrap(face + (p.turn || 0)) };
    if (colour) c.colour = colour;
    out.push(c);
  };
  const sz = tableDef.size;
  if (sz.r !== undefined) {
    const R = sz.r + back - 0.12;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * 2 * Math.PI;
      add(R * Math.sin(a), R * Math.cos(a), a + Math.PI);       // its front toward the middle
    }
    return out;
  }
  const along = Math.max(1, Math.floor(sz.w / (chairDef.size.w + 0.12)));
  const ends = Math.min(2, Math.max(0, n - 2 * along)), sides = n - ends;
  for (let k = 0; k < sides; k++) {
    const side = k % 2 ? -1 : 1, j = Math.floor(k / 2), m = Math.ceil(sides / 2);
    const lx = (j - (m - 1) / 2) * (sz.w / Math.max(m, 1));
    add(lx, side * (sz.d / 2 + back - 0.12), side > 0 ? Math.PI : 0);
  }
  for (let k = 0; k < ends; k++) {
    const side = k ? -1 : 1;
    add(side * (sz.w / 2 + back - 0.12), 0, side > 0 ? -Math.PI / 2 : Math.PI / 2);
  }
  return out;
}

// A place setting in front of each seat at a table p (the chairs, benches round it): from the seat
// along the way it faces, to just inside the table's edge, its front toward the guest, on the
// table's top. Seats far from the table, and spots that already have a setting, are left out.
export function setTable(tableDef, p, placed, defs, setting = "place_setting") {
  if (tableDef.top === undefined) return [];
  const out = [], y = (p.y || 0) + tableDef.top, inset = 0.22;
  const taken = (x, z) => placed.concat(out).some((q) => q.item === setting && Math.hypot(q.x - x, q.z - z) < 0.2);
  for (const q of placed) {
    const d = defs(q.item, q);
    if (q === p || !d || d.on === "top") continue;
    const t = q.turn || 0, dir = [Math.sin(t), Math.cos(t)];
    for (const st of d.seats || (d.seat ? [d.seat] : [])) {
      const [sx, sz] = rot(t, st.x || 0, st.z || 0);
      for (let k = 1; k <= 24; k++) {
        const x = q.x + sx + dir[0] * 0.05 * k, z = q.z + sz + dir[1] * 0.05 * k;
        if (!covers(tableDef, p, x, z, -inset)) continue;
        if (!taken(x, z)) out.push({ item: setting, x, y, z, turn: wrap(t + Math.PI) });
        break;
      }
    }
  }
  return out;
}

// Whether the body (its middle; room.js keeps it ROOM.radius from what blocks) can't stand at
// (x, z) for the placed items: chairs, tables and pillars are walked round; an arch only at its
// posts, so the body walks through it.
export function blocker(placed, defs) {
  const solid = [];
  for (const p of placed) {
    const d = defs(p.item, p);
    if (!d || !d.block) continue;
    if (d.block === "posts") for (const [px, pz] of d.posts) {
      const [x, z] = rot(p.turn || 0, px, pz);
      solid.push({ def: { size: { r: 0.08 } }, p: { x: p.x + x, z: p.z + z, turn: 0 } });
    }
    else solid.push({ def: d, p });
  }
  if (!solid.length) return null;
  return (x, z) => solid.some((s) => covers(s.def, s.p, x, z));
}

// the places to sit on the placed items, as room.py's seats: where the hips go, the seat's height,
// the way the body faces, whether it has a back
export function seats(placed, defs) {
  const out = [];
  for (const p of placed) {
    const d = defs(p.item, p);
    if (!d) continue;
    const t = p.turn || 0;
    for (const st of d.seats || (d.seat ? [d.seat] : [])) {
      const [x, z] = rot(t, st.x || 0, st.z || 0);
      out.push({ x: p.x + x, y: (p.y || 0) + st.y, z: p.z + z, dir: [Math.sin(t), Math.cos(t)], back: st.back, decor: true });
    }
  }
  return out;
}

// The matrix that puts the map's metres in the body's coordinates (room.js Placement.toBody, which
// is linear): column by column, for three.js Matrix4.fromArray.
export function mapMatrix(P) {
  const o = P.toBody([0, 0, 0]), out = new Array(16).fill(0);
  [[1, 0, 0], [0, 1, 0], [0, 0, 1]].forEach((e, col) => {
    const b = P.toBody(e);
    for (let r = 0; r < 3; r++) out[col * 4 + r] = b[r] - o[r];
  });
  for (let r = 0; r < 3; r++) out[12 + r] = o[r];
  out[15] = 1;
  return out;
}

// a free spot for something new, near (x, z): off what is already placed there, on free floor
export function freeSpot(def, placed, defs, x, z, floorFree = () => true) {
  if (def.on === "top") return [x, z];
  const r = def.size.r !== undefined ? def.size.r : Math.hypot(def.size.w, def.size.d) / 2;
  const ok = (px, pz) => floorFree(px, pz) && !placed.some((p) => { const d = defs(p.item, p); return d && d.block && covers(d, p, px, pz, r); });
  if (ok(x, z)) return [x, z];
  for (let ring = 1; ring <= 30; ring++)
    for (let k = 0; k < 8 * ring; k++) {
      const a = (k / (8 * ring)) * 2 * Math.PI, px = x + 0.1 * ring * Math.cos(a), pz = z + 0.1 * ring * Math.sin(a);
      if (ok(px, pz)) return [px, pz];
    }
  return [x, z];
}

// ---------------------------------------------------------------- handles on the picked thing
// Like the body's joints: grab a handle on the thing itself. A ring on the floor round it turns
// it (its knob shows the way its front faces), a knob over it raises and lowers it, and the thing
// itself moves along the floor. `lift` is how far it is raised above where it would stand.
const STEP_TURN = Math.PI / 12, STEP_LIFT = 0.01;
export const MAX_LIFT = 5;

// where the handles go for a placed p: the ring's radius and height, the turn knob, the lift knob
export function handles(def, p) {
  const sz = def.size, r = (sz.r !== undefined ? sz.r : Math.hypot(sz.w, sz.d) / 2) + 0.12;
  const base = p.y || 0, t = p.turn || 0;
  return {
    ring: { r, y: base + 0.01 },
    turn: [p.x + r * Math.sin(t), base + 0.01, p.z + r * Math.cos(t)],
    lift: [p.x, base + Math.min(def.height, 3) + 0.25, p.z],
  };
}

// the turn that points p's front at the floor point (x, z): in 15° steps, or free
export function turnToward(p, x, z, free = false) {
  const a = Math.atan2(x - p.x, z - p.z);
  return wrap(free ? a : Math.round(a / STEP_TURN) * STEP_TURN);
}

// The height on the upright line through p that a pointer ray (origin o, direction d, in the
// map's metres) passes closest to; null when the ray runs along the line.
export function heightOnRay(p, o, d) {
  const w = [o[0] - p.x, o[1], o[2] - p.z];
  const a = d[0] * d[0] + d[1] * d[1] + d[2] * d[2], denom = a - d[1] * d[1];
  if (denom < 1e-9) return null;
  const dw = d[0] * w[0] + d[1] * w[1] + d[2] * w[2];
  return (a * w[1] - d[1] * dw) / denom;
}

// a lift kept to 0..MAX_LIFT, in centimetres
export const clampLift = (v) => Math.round(Math.min(MAX_LIFT, Math.max(0, v)) / STEP_LIFT) * STEP_LIFT;

// The height p stands at: where it would be dropped (the floor, a table) plus its lift.
export function standY(def, placed, defs, p, roomTop = () => 0) {
  return dropY(def, placed, defs, p.x, p.z, roomTop, p) + (p.lift || 0);
}

// ---------------------------------------------------------------- the list of what is in the room
// One line per placed thing, in kinds (its group, then made from photos), numbered within its name
// when there is more than one: [{ k (its index in placed), name, n, group }]
export function listing(placed, nameOf, groupOf) {
  const count = new Map(), seen = new Map();
  for (const p of placed) count.set(p.item, (count.get(p.item) || 0) + 1);
  const rows = placed.map((p, k) => {
    const n = (seen.get(p.item) || 0) + 1;
    seen.set(p.item, n);
    return { k, item: p.item, name: nameOf(p.item) + (count.get(p.item) > 1 ? " " + n : ""), group: groupOf(p.item) };
  });
  const order = (g) => { const i = GROUPS.indexOf(g); return i < 0 ? GROUPS.length : i; };
  return rows.sort((a, b) => order(a.group) - order(b.group) || a.item.localeCompare(b.item) || a.k - b.k);
}

// ---------------------------------------------------------------- pictures for the panel
// a shape's bounds: { lo: [x, y, z], hi: [x, y, z] }
export function bounds(p) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let k = 0; k < p.length; k++) { lo[k % 3] = Math.min(lo[k % 3], p[k]); hi[k % 3] = Math.max(hi[k % 3], p[k]); }
  return { lo, hi };
}

// Where the camera stands for a thing's picture: three-quarters from its front (+z), a little
// to its right and above, far enough that all of it fits; the shadow's size under it.
export function thumbView(b, fov = 28) {
  const c = [0, 1, 2].map((a) => (b.lo[a] + b.hi[a]) / 2), size = [0, 1, 2].map((a) => b.hi[a] - b.lo[a]);
  const r = Math.max(0.05, Math.hypot(...size) / 2);
  const dir = [0.5, 0.42, 1], n = Math.hypot(...dir), far = (r / Math.sin((fov / 2) * Math.PI / 180)) * 1.02;
  return {
    fov, target: c,
    eye: c.map((v, a) => v + (dir[a] / n) * far),
    shadow: [Math.max(0.1, size[0] * 1.3), Math.max(0.1, size[2] * 1.3)],
  };
}
