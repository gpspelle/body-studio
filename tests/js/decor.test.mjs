// Decor in a room (src/body_studio/static/decor.js): the starters' shapes, meshes made from photos as
// decor.py packs them, and where things go. Run by tests/unit/test_decor_js.py, which passes the
// starters decor.py lists (STARTERS) and a packed mesh with its unpacked numbers (MESH, MESH_REF).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { COLOURS, FINISHES, GROUPS, STARTERS, fixtureTurn, bounds as shapeBounds, thumbView, around, blocker, covers, dropY, MAX_LIFT, clampLift, freeSpot, handles, heightOnRay, itemDef, listing, mapMatrix, row, seats, setTable, standY, starterShape, turnToward, unpack, wrap, colourOf, fromHex, fromRgb, hexOf, toHex,
         knobs, knobValues, cleanOpts, optsKey, sized, dims, MATERIALS, movable, fittingItems, fittingChanges, PALETTES, isChoice,
         grabFor, steep, underPointer, landSpot, KNOB_PX, RING_PX } from "../../src/body_studio/static/decor.js";
import { ARCHES, PARTS, archLine, along, coverPick, archPosts, frameOf, fabricRuns } from "../../src/body_studio/static/decor/custom.js";
import { FLOWERS, GREENS } from "../../src/body_studio/static/decor/florals.js";
import { F } from "../../src/body_studio/static/decor/shapes.js";
import { Placement, RoomMap } from "../../src/body_studio/static/room.js";

const env = (k) => process.env[k] && JSON.parse(fs.readFileSync(process.env[k], "utf8"));
const PY = env("STARTERS") || [];
const defs = (id, p = null) => sized(itemDef({ id }), p);
const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

function bounds(p) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let k = 0; k < p.length; k++) { lo[k % 3] = Math.min(lo[k % 3], p[k]); hi[k % 3] = Math.max(hi[k % 3], p[k]); }
  return { lo, hi };
}

test("the page has every starter decor.py lists, as tall as it says", () => {
  assert.ok(PY.length >= 8);
  assert.deepEqual(Object.keys(STARTERS).sort(), PY.map((s) => s.id).sort());
  for (const s of PY) {
    const st = STARTERS[s.id];
    assert.equal(st.height, s.height, s.id);
    assert.equal(st.on, s.on, s.id);
    assert.equal(st.group, s.group, s.id);
    assert.ok(GROUPS.includes(st.group), s.id + ": a group the panel shows");
    const sh = starterShape(s.id);
    assert.equal(sh.p.length, sh.c.length, s.id);
    assert.equal(sh.g.length, sh.p.length / 3, s.id + ": glows or not, per vertex");
    assert.equal(sh.m.length, sh.p.length / 3, s.id + ": made of something, per vertex");
    assert.ok(sh.m.every((m) => Number.isInteger(m) && m >= 0 && m < FINISHES.length), s.id);
    assert.equal(sh.i.length % 3, 0, s.id);
    assert.ok(sh.i.every((i) => i >= 0 && i < sh.p.length / 3), s.id + ": faces in range");
    assert.ok(sh.p.every(Number.isFinite), s.id);
    const b = bounds(sh.p);
    // what hangs (string lights, a chandelier) may start above the floor
    if (st.hangs) assert.ok(b.lo[1] >= -0.005, s.id + " above the floor");
    else near(b.lo[1], 0, 0.005, s.id + " stands on the floor");
    near(b.hi[1], s.height, Math.max(0.006, 0.04 * s.height), s.id + " height");
    // its footprint (for walking round it, for putting things on it) is about its shape's
    const sz = st.size, w = sz.r !== undefined ? 2 * sz.r : sz.w, d = sz.r !== undefined ? 2 * sz.r : sz.d;
    near(b.hi[0] - b.lo[0], w, 0.12 * w + 0.05, s.id + " width");
    near(b.hi[2] - b.lo[2], d, 0.12 * d + 0.08, s.id + " depth");
  }
});

test("a starter comes in the colours, its accents kept", () => {
  const gold = starterShape("chair", "gold"), wood = starterShape("chair", "wood");
  assert.notDeepEqual(gold.c, wood.c);
  assert.ok(wood.c.some((_, k) => k % 3 === 0 && Math.abs(wood.c[k] - COLOURS.wood[0]) < 1e-9));
  const candle = starterShape("candle", "black");
  assert.ok(candle.c.some((x, k) => k % 3 === 0 && x > 0.95), "the wax and the flame stay light");
  assert.deepEqual(starterShape("chair").c, gold.c, "a chair is gold unless asked");
});

test("a mesh made from a photo unpacks to decor.py's numbers", () => {
  const m = env("MESH"), ref = env("MESH_REF");
  const u = unpack(m);
  assert.equal(u.p.length, ref.v.length);
  assert.deepEqual(Array.from(u.i), ref.f);
  for (let k = 0; k < ref.v.length; k++) near(u.p[k], ref.v[k], 1e-5, "position " + k);
  for (let k = 0; k < ref.c.length; k++) near(u.c[k], ref.c[k] / 255, 1e-6, "colour " + k);
  const def = itemDef({ id: "p123abc", height: 2 }, m);
  near(def.size.w, (m.hi[0] - m.lo[0]) * 2, 1e-9, "footprint scales with the height");
  assert.equal(def.block, true);
  assert.equal(itemDef({ id: "p123abc", height: 0.1 }, m).block, false, "something small is walked past");
});

test("things for the top stand on a table, else on what the room has, else the floor", () => {
  const table = { item: "round_table", x: 2, y: 0, z: 1, turn: 0 }, pillar = { item: "pillar", x: -1, y: 0, z: 0, turn: 0 };
  const placed = [table, pillar];
  near(dropY(defs("candle"), placed, defs, 2.3, 1.2), 0.76, 1e-9, "on the table");
  near(dropY(defs("flowers"), placed, defs, -1, 0.05), 1.0, 1e-9, "on the pillar");
  near(dropY(defs("candle"), placed, defs, 0, 3), 0, 1e-9, "on the floor");
  near(dropY(defs("candle"), placed, defs, 0, 3, () => 0.45), 0.45, 1e-9, "on the room's own table");
  near(dropY(defs("chair"), placed, defs, 2, 1), 0, 1e-9, "a chair stays on the floor");
  // what it is dropped on doesn't count itself
  near(dropY(defs("flowers"), placed, defs, -1, 0, () => 0, pillar), 0, 1e-9, "skip");
});

test("a row of chairs goes to their side, a chair's width and a gap apart", () => {
  const c = { item: "chair", x: 1, y: 0, z: 2, turn: 0 };
  const r = row(defs("chair"), c, 5);
  assert.equal(r.length, 4);
  r.forEach((p, k) => { near(p.x, 1 + (k + 1) * 0.54, 1e-9, "x"); near(p.z, 2, 1e-9, "z"); assert.equal(p.turn, 0); });
  const t = row(defs("chair"), { ...c, turn: Math.PI / 2 }, 3);      // facing +x: the row goes along -z
  near(t[0].x, 1, 1e-9, "turned x"); near(t[0].z, 2 - 0.54, 1e-9, "turned z");
});

test("chairs round a table face it and don't stand in it", () => {
  for (const [id, n] of [["round_table", 8], ["round_table", 10], ["long_table", 8], ["long_table", 10]]) {
    for (const turn of [0, 0.7]) {
      const t = { item: id, x: 3, y: 0, z: -1, turn }, chairs = around(defs(id), t, defs("chair"), n, "wood");
      assert.equal(chairs.length, n, id);
      for (const c of chairs) {
        assert.equal(c.colour, "wood");
        const f = [Math.sin(c.turn), Math.cos(c.turn)], to = [t.x - c.x, t.z - c.z], L = Math.hypot(...to);
        assert.ok((f[0] * to[0] + f[1] * to[1]) / L > 0.5, `${id}: a chair faces the table`);
        // the seat's front edge reaches under the tablecloth's edge, not further
        assert.ok(!covers(defs(id), t, c.x, c.z), `${id}: the chair isn't in the table`);
        assert.ok(covers(defs(id), t, c.x + f[0] * 0.4, c.z + f[1] * 0.4, 0.05), `${id}: but close to it`);
      }
      for (let a = 0; a < n; a++)
        for (let b = a + 1; b < n; b++)
          assert.ok(Math.hypot(chairs[a].x - chairs[b].x, chairs[a].z - chairs[b].z) > 0.42, `${id}: chairs apart`);
    }
  }
});

test("the body walks round chairs and tables, over a runner, through an arch", () => {
  const placed = [{ item: "chair", x: 0, z: 0, turn: 0 }, { item: "runner", x: 3, z: 0, turn: 0 },
                  { item: "arch", x: 6, z: 0, turn: 0 }, { item: "candle", x: 9, z: 0, turn: 0 }];
  const b = blocker(placed, defs);
  assert.ok(b(0, 0) && b(0.2, 0.2));
  assert.ok(!b(0.4, 0));
  assert.ok(!b(3, 2.5), "runner");
  assert.ok(!b(6, 0), "through the arch");
  assert.ok(b(6.8, 0) && b(5.2, 0), "its posts");
  assert.ok(!b(9, 0), "candle");
  assert.equal(blocker([{ item: "runner", x: 0, z: 0 }], defs), null);
});

// an empty 8 x 8 m floor in 5 cm cells, x and z from -4 to 4
function floor() {
  const nx = 160, n = nx * nx, b64 = (v) => Buffer.from(new Uint8Array(n).fill(v)).toString("base64");
  return new RoomMap({ cell: 0.05, nx, nz: nx, x0: -4, z0: -4, walk: b64(1), top: b64(0), tall: b64(0), seats: [], start: [0, 0] });
}

test("in a room, decor stops the walk and its chairs can be sat on", () => {
  const room = floor(), placed = [{ item: "chair", x: 1, y: 0, z: 0, turn: -Math.PI / 2 }];
  room.setDecor(blocker(placed, defs), seats(placed, defs));
  assert.ok(!room.free(1, 0));
  const p = room.move([0, 0], [2, 0]);
  assert.ok(p[0] < 1 - 0.22 - 0.2 + 0.03, "stops before the chair: " + p[0]);
  const s = room.seatNear(0.5, 0);
  assert.ok(s && s.decor, "the chair is a seat");
  near(s.y, 0.45, 1e-9, "seat height");
  near(s.dir[0], -1, 1e-9, "facing the way the chair does");
  assert.equal(s.back, true);
  room.setDecor(null);
  assert.ok(room.free(1, 0));
  assert.equal(room.seatNear(0.5, 0), null);
});

test("the map's matrix is Placement.toBody", () => {
  const rig = { frame: { left: [0.6, 0, -0.8], up: [0, 1, 0], front: [0.8, 0, 0.6], origin: [1, -2, 3] } };
  const P = new Placement(rig, floor(), 1.7, [0.3, 0.9], [0.5, -0.2]);
  const M = mapMatrix(P);
  for (const q of [[0, 0, 0], [1, 2, 3], [-2.5, 0.3, 1.1]]) {
    const b = P.toBody(q), m = [0, 1, 2].map((r) => M[r] * q[0] + M[4 + r] * q[1] + M[8 + r] * q[2] + M[12 + r]);
    for (let r = 0; r < 3; r++) near(m[r], b[r], 1e-9, "toBody");
  }
});

test("something new is put next to what is there, on free floor", () => {
  const placed = [{ item: "round_table", x: 0, y: 0, z: 0, turn: 0 }];
  const [x, z] = freeSpot(defs("round_table"), placed, defs, 0.2, 0);
  assert.ok(Math.hypot(x, z) > 1.5, "off the first table");
  assert.ok(Math.hypot(x, z) < 2.2, "but near it");
  assert.deepEqual(freeSpot(defs("candle"), placed, defs, 0.2, 0), [0.2, 0], "a candle goes on it");
  const [wx] = freeSpot(defs("chair"), [], defs, 0, 0, (px) => px > 1);
  assert.ok(wx > 1, "on free floor");
});

test("turns stay within half a turn either way", () => {
  for (const t of [around(defs("round_table"), { item: "round_table", x: 0, z: 0, turn: 3 }, defs("chair"), 12),
                   around(defs("long_table"), { item: "long_table", x: 0, z: 0, turn: -3 }, defs("chair"), 10)].flat())
    assert.ok(Math.abs(t.turn) <= Math.PI + 1e-9, String(t.turn));
});

test("lights and flames glow, the rest doesn't", () => {
  const glows = (id) => starterShape(id).g.some((g) => g === 1);
  for (const id of ["candle", "lantern", "string_lights", "chandelier", "fairy_curtain", "candelabra", "centrepiece"])
    assert.ok(glows(id), id);
  for (const id of ["chair", "round_table", "bar", "sofa", "cake"]) assert.ok(!glows(id), id);
});

test("every group has things in it, and a bench and a sofa seat more than one", () => {
  for (const g of GROUPS) assert.ok(Object.values(STARTERS).some((s) => s.group === g), g);
  const at = (id) => seats([{ item: id, x: 0, y: 0, z: 0, turn: 0 }], defs);
  assert.equal(at("bench").length, 3);
  assert.equal(at("sofa").length, 2);
  assert.equal(at("chair").length, 1);
  const xs = at("bench").map((s) => s.x);
  assert.ok(Math.max(...xs) - Math.min(...xs) > 0.8, "along the bench");
  assert.equal(at("bar_stool")[0].y, 0.76);
});

test("setting the table puts a place in front of each chair, on the table, facing the guest", () => {
  for (const [id, n] of [["round_table", 8], ["long_table", 6], ["square_table", 4]]) {
    for (const turn of [0, 0.7]) {
      const t = { item: id, x: 2, y: 0, z: 1, turn }, def = defs(id);
      const chairs = around(def, t, defs("chair"), n), far = { item: "chair", x: 9, y: 0, z: 9, turn: 0 };
      const placed = [t, ...chairs, far], set = setTable(def, t, placed, defs);
      assert.equal(set.length, n, id + ": one each, none for the far chair");
      for (const [k, s] of set.entries()) {
        assert.equal(s.item, "place_setting");
        near(s.y, def.top, 1e-9, "on the top");
        assert.ok(covers(def, t, s.x, s.z, -0.2), id + ": on the table, in from its edge");
        const c = chairs[k], f = [Math.sin(s.turn), Math.cos(s.turn)], to = [c.x - s.x, c.z - s.z];
        assert.ok((f[0] * to[0] + f[1] * to[1]) / Math.hypot(...to) > 0.95, id + ": facing its chair");
        assert.ok(Math.hypot(...to) < 0.9, id + ": near its chair");
      }
      assert.equal(setTable(def, t, placed.concat(set), defs).length, 0, "set already");
    }
  }
  const bench = { item: "bench", x: 0, y: 0, z: 0.75, turn: Math.PI }, lt = { item: "long_table", x: 0, y: 0, z: 0, turn: 0 };
  assert.equal(setTable(defs("long_table"), lt, [lt, bench], defs).length, 3, "three on a bench");
  assert.deepEqual(setTable(defs("chair"), { item: "chair", x: 0, z: 0 }, [], defs), []);
});

test("the handles sit on the picked thing: a ring round it, a knob where it faces, one over it", () => {
  for (const [id, turn] of [["round_table", 0], ["long_table", 1.1], ["chair", -2]]) {
    const def = defs(id), p = { item: id, x: 2, y: 0.3, z: -1, turn }, h = handles(def, p);
    near(Math.hypot(h.turn[0] - p.x, h.turn[2] - p.z), h.ring.r, 1e-9, id + ": the knob on the ring");
    // outside the thing, so it can be grabbed
    assert.ok(!covers(def, p, h.turn[0], h.turn[2]), id + ": the ring clears it");
    const f = [Math.sin(turn), Math.cos(turn)], to = [h.turn[0] - p.x, h.turn[2] - p.z];
    near((f[0] * to[0] + f[1] * to[1]) / h.ring.r, 1, 1e-9, id + ": the knob where its front faces");
    assert.ok(h.lift[1] > p.y + def.height, id + ": the lift knob over it");
    near(h.lift[0], p.x, 1e-9); near(h.lift[2], p.z, 1e-9);
  }
  // a string of lights is hung 2.8 m up: its knob not out of sight at the ceiling
  assert.ok(handles(defs("chandelier"), { x: 0, z: 0, y: 0 }).lift[1] <= 3.3);
});

test("turning by the ring follows the pointer, in 15 degree steps unless free", () => {
  const p = { x: 1, z: 1, turn: 0 };
  near(turnToward(p, 2, 1), Math.PI / 2, 1e-9, "to its right");
  near(Math.abs(turnToward(p, 1, 0)), Math.PI, 1e-9, "behind");
  near(turnToward(p, 1 + Math.sin(0.3), 1 + Math.cos(0.3)), Math.PI / 12, 1e-9, "snapped");
  near(turnToward(p, 1 + Math.sin(0.3), 1 + Math.cos(0.3), true), 0.3, 1e-9, "free");
  for (let k = 0; k < 40; k++) { const a = turnToward(p, Math.cos(k), Math.sin(k * 1.7)); assert.ok(Math.abs(a) <= Math.PI + 1e-9); }
});

test("raising follows the pointer up the thing's upright line", () => {
  const p = { x: 2, z: 3 };
  // a ray from a camera 4 m away at eye height, aimed at 1.2 m up the line
  const o = [2, 1.6, 7], at = [2, 1.2, 3], d = [at[0] - o[0], at[1] - o[1], at[2] - o[2]];
  near(heightOnRay(p, o, d), 1.2, 1e-9, "where it aims");
  // aimed beside the line, still the height it passes at
  near(heightOnRay(p, [5, 1, 3], [-1, 0.25, 0.5]), 1.6, 1e-9, "closest to the line");
  assert.equal(heightOnRay(p, [2, 5, 3], [0, -1, 0]), null, "straight down the line");
  assert.equal(clampLift(-0.3), 0); assert.equal(clampLift(9), MAX_LIFT); near(clampLift(0.4567), 0.46, 1e-9);
});

test("a raised thing stands its lift over where it would be dropped", () => {
  const t = { item: "round_table", x: 0, y: 0, z: 0, turn: 0 }, c = { item: "candle", x: 0.2, y: 0, z: 0, turn: 0, lift: 0.3 };
  near(standY(defs("candle"), [t, c], defs, c), 0.76 + 0.3, 1e-9, "on the table, raised");
  near(standY(defs("chair"), [t], defs, { item: "chair", x: 5, z: 5, lift: 0.5 }), 0.5, 1e-9, "on the floor, raised");
  near(standY(defs("chair"), [t], defs, { item: "chair", x: 5, z: 5 }), 0, 1e-9);
});

test("the list of what is in the room goes by kind, numbered within a name", () => {
  const placed = [{ item: "candle" }, { item: "chair" }, { item: "round_table" }, { item: "chair" }, { item: "pabc1234" }, { item: "string_lights" }];
  const name = (id) => ({ candle: "Candle", chair: "Chair", round_table: "Round table", string_lights: "String lights" }[id] || "Arch");
  const group = (id) => STARTERS[id]?.group || "mine";
  const rows = listing(placed, name, group);
  assert.deepEqual(rows.map((r) => r.name), ["Chair 1", "Chair 2", "Round table", "Candle", "String lights", "Arch"]);
  assert.deepEqual(rows.map((r) => r.k), [1, 3, 2, 0, 5, 4]);
  assert.deepEqual(listing([], name, group), []);
});

test("each part is made of something: brass is metal, wood is wood, a vase is glass, a cloth is cloth", () => {
  const most = (id, colour) => {
    const m = starterShape(id, colour).m, n = new Map();
    for (const v of m) n.set(v, (n.get(v) || 0) + 1);
    return FINISHES[[...n].sort((a, b) => b[1] - a[1])[0][0]].name;
  };
  assert.equal(most("chair", "gold"), "metal");
  assert.equal(most("cross_back_chair", "wood"), "wood");
  assert.equal(most("round_table", "white"), "cloth");
  const has = (id, name) => starterShape(id).m.includes(FINISHES.findIndex((f) => f.name === name));
  assert.ok(has("candle", "satin") && has("candle", "metal"), "wax on a brass holder");
  assert.ok(has("flowers", "glass"), "the vase");
  assert.ok(has("place_setting", "glass") && has("place_setting", "metal"), "glasses and cutlery");
  assert.ok(has("string_lights", "glow") && !has("chair", "glow"));
  // what glows is made of light
  const s = starterShape("candle"), glow = FINISHES.findIndex((f) => f.glow);
  s.g.forEach((g, k) => assert.equal(g === 1, s.m[k] === glow));
});

test("a thing's picture frames all of it, from its front and a little above", () => {
  for (const id of ["chair", "long_table", "arch", "candle", "dance_floor", "string_lights"]) {
    const b = shapeBounds(starterShape(id).p), v = thumbView(b);
    const to = v.target.map((c, a) => c - v.eye[a]), d = Math.hypot(...to);
    assert.ok(v.eye[2] > b.hi[2] && v.eye[1] > v.target[1] && v.eye[0] > v.target[0], id + ": front, above, a little right");
    // every corner within the view's cone
    for (const x of [b.lo[0], b.hi[0]]) for (const y of [b.lo[1], b.hi[1]]) for (const z of [b.lo[2], b.hi[2]]) {
      const p = [x - v.eye[0], y - v.eye[1], z - v.eye[2]], cos = (p[0] * to[0] + p[1] * to[1] + p[2] * to[2]) / (Math.hypot(...p) * d);
      assert.ok(Math.acos(Math.min(1, cos)) <= (v.fov / 2) * Math.PI / 180 + 1e-9, id + ": the corner in view");
    }
    assert.ok(v.shadow[0] >= b.hi[0] - b.lo[0] && v.shadow[1] >= b.hi[2] - b.lo[2]);
  }
});

test("colours of your own: HEX and RGB in, the starter's finish kept", () => {
  assert.deepEqual(fromHex("#c9a46a"), [201, 164, 106]);
  assert.deepEqual(fromHex("C9A46A"), [201, 164, 106]);
  assert.deepEqual(fromHex(" #fa0 "), [255, 170, 0]);
  for (const bad of ["#c9a46", "#zzzzzz", "", null, "gold", "#1234567"]) assert.equal(fromHex(bad), null, String(bad));
  assert.equal(toHex([201, 164, 106]), "#c9a46a");
  assert.equal(toHex([300, -4, 12.6]), "#ff000d");
  assert.deepEqual(fromRgb("201, 164, 106"), [201, 164, 106]);
  assert.deepEqual(fromRgb("rgb(201 164 106)"), [201, 164, 106]);
  assert.deepEqual(fromRgb("201;164;106"), [201, 164, 106]);
  for (const bad of ["201, 164", "256, 0, 0", "a, b, c", "1, 2, 3, 4"]) assert.equal(fromRgb(bad), null, bad);
  assert.equal(hexOf("#C9A46A", "gold"), "#c9a46a");
  assert.equal(hexOf("gold"), toHex(COLOURS.gold.map((v) => v * 255)));
  assert.equal(hexOf(undefined, "wood"), toHex(COLOURS.wood.map((v) => v * 255)));
  // the colour itself, 0..1, the same array each time; a name or nothing as before
  const blue = colourOf("#2040a0", "gold");
  assert.deepEqual(blue.map((v) => Math.round(v * 255)), [32, 64, 160]);
  assert.equal(colourOf("#2040A0", "gold"), blue);
  assert.equal(colourOf("wood", "gold"), COLOURS.wood);
  assert.equal(colourOf("#nope", "gold"), COLOURS.gold);
  // a gold chair painted blue: the frame is blue and still metal; the cushion as it was
  const gold = starterShape("chair"), painted = starterShape("chair", "#2040a0");
  assert.equal(painted.p.length, gold.p.length);
  const metal = FINISHES.findIndex((f) => f.name === "metal");
  let frame = 0;
  for (let v = 0; v < gold.m.length; v++) {
    if (gold.c[3 * v] !== COLOURS.gold[0] || gold.c[3 * v + 2] !== COLOURS.gold[2]) continue;
    frame++;
    assert.equal(painted.m[v], metal);
    near(painted.c[3 * v + 2], 160 / 255, 1e-6, "blue");
  }
  assert.ok(frame > 50, "the chair has a gold frame");
});

test("the flower shop: many kinds of flowers and ways to show them, each light enough to draw many of", () => {
  // (what hangs from the roof is on the overhead shelf)
  const shop = Object.entries(STARTERS).filter(([, s]) => s.group === "flowers" || s.group === "aerial");
  assert.ok(shop.length >= 15, `${shop.length} in the flower shop`);
  assert.ok(shop.some(([, s]) => s.on === "top") && shop.some(([, s]) => s.on === "floor") && shop.some(([, s]) => s.hangs),
            "on tables, on the floor and hung from the roof");
  for (const [id] of shop) assert.ok(starterShape(id).i.length / 3 < 120000, id + ": few enough triangles");
  // a tropical bank is many colours, whatever colour it leans on
  const c = starterShape("tropical_bank").c, hues = new Set();
  for (let k = 0; k < c.length; k += 3) {
    const [r, g, b] = [c[k], c[k + 1], c[k + 2]], hi = Math.max(r, g, b), lo = Math.min(r, g, b);
    if (hi - lo < 0.3) continue;
    const h = hi === r ? ((g - b) / (hi - lo) + 6) % 6 : hi === g ? (b - r) / (hi - lo) + 2 : (r - g) / (hi - lo) + 4;
    hues.add(Math.floor(h * 2));              // (twelve hues: red, orange, yellow... apart)
  }
  assert.ok(hues.size >= 4, `${hues.size} hues in a tropical bank`);
});

test("every starter can be made wider, deeper, taller: its shape and its footprint follow", () => {
  for (const id of Object.keys(STARTERS)) {
    const ks = knobs(id), names = ks.map((k) => k.name), st = STARTERS[id];
    assert.ok(names.includes("w"), id + " has a width");
    assert.equal(names.includes("d"), st.size.r === undefined, id + ": a depth unless round");
    for (const k of ks) assert.ok(isChoice(k) ? k.choices.includes(k.value) : k.colour ? !!(COLOURS[k.value] || fromHex(k.value)) : k.min <= k.value && k.value <= k.max, `${id} ${k.name} in its range`);
    // the starter's own values change nothing
    assert.deepEqual(starterShape(id, null, cleanOpts(id, knobValues(id, null))).p, starterShape(id).p, id);
    for (const f of [0.6, 1.7]) {
      const opts = {};
      for (const k of ks) if (k.size && ["w", "d", "h"].includes(k.name)) opts[k.name] = Math.min(k.max, Math.max(k.min, k.value * f));
      const p = { item: id, x: 0, z: 0, turn: 0, opts }, d = defs(id, p), b = bounds(starterShape(id, null, opts).p);
      const [w, dd, h] = dims(d), [w0, d0, h0] = dims(defs(id)), [bw, bd] = [b.hi[0] - b.lo[0], b.hi[2] - b.lo[2]];
      const b0 = bounds(starterShape(id).p);
      // as wide (deep, tall) as asked, as much as the starter itself is as wide as it says
      // (what you dress with flowers keeps its flowers' own size: its line is tested below)
      if (names.includes("bloomsize")) continue;
      near(bw / (b0.hi[0] - b0.lo[0]), w / w0, 0.06 * w / w0 + 0.03, `${id} x${f} width`);
      near(bd / (b0.hi[2] - b0.lo[2]), dd / d0, 0.06 * dd / d0 + 0.03, `${id} x${f} depth`);
      if (opts.h !== undefined) near(b.hi[1], h, Math.max(0.01, 0.05 * h), `${id} x${f} height`);
      if (st.top !== undefined) near(d.top, st.top * h / h0, 1e-9, id + " top");
    }
  }
});

test("a bar keeps its legs and rail as it grows: drawn to size, not stretched", () => {
  const thin = (s) => { let n = 0; for (let k = 0; k < s.c.length; k += 3) if (s.c[k] === COLOURS.gold[0] && s.c[k + 1] === COLOURS.gold[1]) n++; return n; };
  const wide = starterShape("modular_bar", null, { w: 4 }), plain = starterShape("modular_bar");
  near(bounds(wide.p).hi[0] - bounds(wide.p).lo[0], 4, 0.01, "4 m wide");
  assert.ok(wide.i.length > plain.i.length * 1.6, "more modules, not wider ones");
  const b = bounds(starterShape("bar", null, { h: 0.9, slab: 0.1 }).p);
  near(b.hi[1], 0.9, 0.001, "a lower bar");
  assert.ok(thin(starterShape("bar", null, { w: 4.8 })) > thin(starterShape("bar")), "a longer foot rail with more posts");
  // a taller dessert tray: a longer stem, the same plate
  const tray = (h) => bounds(starterShape("dessert_tray", null, { h }).p);
  near(tray(0.5).hi[1], 0.5, 0.002, "a tall tray"); near(tray(0.5).hi[0] - tray(0.5).lo[0], tray(0.3).hi[0] - tray(0.3).lo[0], 1e-6, "its plate");
});

test("the counts: more flowers in a bouquet, more tiers on a cake, kept within their range", () => {
  const tris = (id, o) => starterShape(id, null, o).i.length;
  assert.ok(tris("flowers", { flowers: 60 }) > tris("flowers") * 1.5, "a fuller vase");
  assert.ok(tris("bridal_bouquet", { flowers: 50 }) > tris("bridal_bouquet") * 1.5, "a fuller bouquet");
  assert.ok(tris("cake", { tiers: 5 }) > tris("cake"), "five tiers");
  assert.ok(tris("tiered_stand", { tiers: 4 }) > tris("tiered_stand"), "four plates");
  assert.equal(knobValues("flowers", { flowers: 9999 }).flowers, 80, "at most 80 roses");
  assert.equal(knobValues("flowers", { flowers: 12.4 }).flowers, 12, "whole flowers");
  assert.equal(knobValues("round_table", { w: 2 }).d, 2, "a round table stays round");
  assert.ok(Object.values(STARTERS).filter((s) => s.knobs).length >= 20, "many starters have counts");
});

test("knobs left as they were are not kept; a changed seat and table top move with the size", () => {
  assert.equal(cleanOpts("chair", { w: knobValues("chair").w, finish: "nope" }), null);
  assert.deepEqual(cleanOpts("chair", { h: 1.2, finish: "metal", junk: 3 }), { h: 1.2, finish: "metal" });
  assert.equal(optsKey({ h: 1.2, finish: "metal" }), optsKey({ finish: "metal", h: 1.2 }));
  const chair = defs("chair", { opts: { h: 1.8 } });
  near(chair.seat.y, STARTERS.chair.seat.y * 2, 1e-9, "a seat twice as high");
  const p = { item: "long_table", x: 0, z: 0, turn: 0, opts: { w: 3.6 } };
  assert.ok(covers(defs("long_table", p), p, 1.6, 0), "a longer table covers further");
  assert.ok(!covers(defs("long_table"), { ...p, opts: undefined }, 1.6, 0));
  // flowers dropped on a raised table stand on its new top
  const tall = { item: "round_table", x: 0, y: 0, z: 0, turn: 0, opts: { h: 1.1 } };
  near(dropY(defs("flowers"), [tall], defs, 0, 0), 1.1, 1e-9, "on the taller table");
});

test("what a starter's colour is made of can be changed, its accents kept", () => {
  for (const f of MATERIALS) {
    const s = starterShape("bar", null, { finish: f }), plain = starterShape("bar");
    let own = 0, kept = 0;
    for (let v = 0; v < s.m.length; v++) {
      const wood = plain.c[3 * v] === COLOURS.wood[0] && plain.c[3 * v + 1] === COLOURS.wood[1];
      if (wood) { own++; assert.equal(s.m[v], FINISHES.findIndex((x) => x.name === f), f); }
      else if (s.m[v] === plain.m[v]) kept++;
    }
    assert.ok(own > 0 && kept === s.m.length - own, f + ": only the wood changes");
  }
  const glow = starterShape("candle", null, { finish: "metal" });
  assert.ok(glow.g.some((g, v) => g && glow.m[v] === FINISHES.findIndex((x) => x.glow)), "a flame still glows");
});

test("a room's own furniture turns to the way it faces, else by its turn", () => {
  near(fixtureTurn({ facing: [0, 0, 1] }), 0, 1e-9, "front toward +z");
  near(fixtureTurn({ facing: [-1, 0, 0] }), -Math.PI / 2, 1e-9, "toward -x");
  near(fixtureTurn({ facing: [0, 0, -1], turn: 1 }), Math.PI, 1e-9, "the way it faces wins");
  near(fixtureTurn({ turn: 0.7 }), 0.7, 1e-9, "the venue's, by its turn");
  near(fixtureTurn({}), 0, 1e-9);
  // the home's pieces stand where the sample rooms' furniture was: the tattoo chair's seat and arm
  // rests at the studio's heights (sample_studio.CHAIR, REST_TOP)
  near(STARTERS.tattoo_chair.seat.y, 0.5, 1e-9);
  const s = starterShape("tattoo_chair"), b = bounds(s.p);
  near(b.lo[1], 0, 1e-6, "on the floor");
  assert.ok(STARTERS.linen_sofa.seats.every((q) => q.y === 0.45), "the sofa's seat height");
});

test("the room's own fittings, moved by hand, come back as what changed", () => {
  const trees = [
    { item: "round_mirror", at: [1, 1.2, 2], turn: Math.PI / 2 },
    { item: "glass_roof", at: [0, 0, 0], scale: [2, 1, 1] },                 // stretched along its row: stays
    { item: "chair", at: [3, 0, 3], facing: [1, 0, 0], colour: "#754a2b" },
    { item: "bench", at: [5, 0, 5], turn: 0, opts: { w: 2 } },
    { item: "no_such_thing", at: [9, 0, 9] },
    { item: "sky_dome", at: [0, -30, 0] },                                  // the sky: stays
  ];
  assert.deepEqual(trees.map(movable), [true, false, true, true, false, false]);
  const items = fittingItems(trees);
  assert.deepEqual(items.map((p) => p.was.k), [0, 2, 3]);
  assert.ok(Math.abs(items[1].turn - Math.PI / 2) < 1e-9);                 // (facing +x)
  assert.equal(items[1].colour, "#754a2b");
  assert.deepEqual(fittingChanges(items, trees), []);                       // nothing changed yet
  items[0].x += 0.5;                                                         // the mirror moved along its wall
  items[2].opts = { w: 3 };                                                  // the bench made longer
  items.splice(1, 1);                                                        // the chair isn't there
  items.push({ item: "chair", x: 7, y: 0, z: 7, turn: 0 });                  // one is where nothing was
  const c = fittingChanges(items, trees);
  assert.deepEqual(c.map((x) => [x.change, x.item, x.k]), [["moved", "round_mirror", 0], ["moved", "bench", 3], ["added", "chair", undefined], ["removed", "chair", 2]]);
  assert.deepEqual(c[0].now.at, [1.5, 1.2, 2]);
  assert.deepEqual(c[0].was.at, [1, 1.2, 2]);
  assert.deepEqual(c[1].opts, { w: 3 });
  assert.ok(Math.abs(c[3].was.turn - Math.PI / 2) < 1e-9);
});

// ---------------------------------------------------------------- what you build yourself
const share = (sh, f) => { let n = 0; for (let v = 0; v < sh.p.length / 3; v++) if (f(sh.p[3 * v], sh.p[3 * v + 1], sh.p[3 * v + 2])) n++; return n / (sh.p.length / 3); };

test("an arch's line, in every shape, from the floor to its height and within its width", () => {
  for (const kind of ARCHES) {
    const line = archLine(kind, 2.2, 2.6), xs = line.map((p) => p[0]), ys = line.map((p) => p[1]);
    near(Math.min(...ys), 0, 0.03, kind + " stands on the floor");
    near(Math.max(...ys), 2.6, 0.03, kind + " is as high as asked");
    assert.ok(Math.max(...xs) <= 1.1 + 1e-9 && Math.min(...xs) >= -1.1 - 1e-9, kind + " within its width");
    const path = along(line);
    assert.ok(path.length > 2, kind);
    for (const t of [0, 0.3, 0.77, 1]) near(Math.hypot(...path.at(t).d), 1, 1e-6, kind + ": a unit way along");
  }
  // an arch through which the body walks stands on two feet; a ring on its foot
  // (its frame inside the flowers round it, so the whole arch is as wide as asked)
  const k = { w: 2.4, h: 2.4, d: 0.4 }, fw = frameOf(k).w;
  assert.ok(fw < 2.4 && fw > 1.8);
  assert.deepEqual(archPosts({ ...k, shape: "round" }), [[-fw / 2, 0], [fw / 2, 0]]);
  assert.deepEqual(archPosts({ ...k, shape: "hexagon" }), [[-fw / 4, 0], [fw / 4, 0]]);
  assert.equal(archPosts({ ...k, shape: "circle" }).length, 1);
  const hex = defs("custom_arch", { opts: { shape: "hexagon" } }), wide = defs("custom_arch", { opts: { shape: "hexagon", w: 3 } });
  near(hex.posts[1][0], frameOf({ w: 2.2, h: 2.6, d: 0.9 }).w / 4, 1e-9, "the hexagon's feet");
  near(wide.posts[1][0] - hex.posts[1][0], 0.8 / 4, 1e-9, "wider, its feet further apart");
});

test("the flowers go where each part of an arch is covered, as thickly as asked", () => {
  const none = Object.fromEntries(PARTS.map((n) => [n, 0]));
  assert.equal(coverPick(none, 0.5, 0.5), null);
  for (let k = 0; k < 50; k++) {
    const t = coverPick({ ...none, crown: 100 }, k / 50, (k * 7 % 50) / 50);
    assert.ok(t >= 0.4 && t < 0.6, "only on the top: " + t);
  }
  // (twice the cover, twice the flowers there)
  let left = 0;
  for (let k = 0; k < 1000; k++) if (coverPick({ ...none, lside: 100, rside: 50 }, (k + 0.5) / 1000, 0.5) < 0.5) left++;
  near(left / 1000, 2 / 3, 0.01, "the left side's share");
  // an arch covered on its right only has its flowers there
  const bare = { greens: 0, trails: 0, feet: "none", ...none };
  const right = starterShape("custom_arch", null, { ...bare, rside: 100, rfoot: 100 });
  assert.ok(share(right, (x) => x > 0.3) > 0.8, "on its right");
  const lots = starterShape("custom_arch", null, { ...bare, rside: 100, rfoot: 100, flowers: 300 });
  assert.ok(lots.p.length > right.p.length * 1.4, "more flowers, more of them");
  // (whatever hangs from it, the frame stands on the floor: its legs to y = 0)
  const legs = starterShape("custom_arch", null, { ...none, lside: 100, crown: 100, green: "ivy", greens: 200, feet: "none" });
  const post = defs("custom_arch").posts[1][0];
  let foot = Infinity;
  for (let v = 0; v < legs.p.length; v += 3) if (Math.abs(legs.p[v] - post) < 0.03) foot = Math.min(foot, legs.p[v + 1]);
  near(foot, 0, 0.005, "its right leg on the floor");
  const leafless = starterShape("custom_arch", null, { ...bare, flowers: 0 });
  assert.ok(leafless.p.length < right.p.length / 20, "no flowers, no greenery: the bare frame");
});

test("a built starter's choices and colours: kept when they are ones it has, else its own", () => {
  const v = knobValues("custom_arch", { shape: "spaceship", flower: "peony", tint: "#C41A24", accenttint: "plaid", flowers: 1e6 });
  assert.equal(v.shape, "round");
  assert.equal(v.flower, "peony");
  assert.equal(v.tint, "#c41a24");
  assert.equal(v.accenttint, STARTERS.custom_arch.knobs.accenttint.value);
  assert.equal(v.flowers, 400);
  assert.deepEqual(cleanOpts("custom_arch", { shape: "round", flower: "peony", tint: "#c41a24" }), { flower: "peony", tint: "#c41a24" });
  for (const k of knobs("custom_arch")) if (isChoice(k)) assert.ok(k.choices.includes(k.value), k.name);
  assert.ok(knobs("custom_arch").some((k) => isChoice(k) && k.choices === FLOWERS));
  assert.ok(knobs("floral_cloud").some((k) => isChoice(k) && k.choices === GREENS));
  for (const list of Object.values(PALETTES)) assert.ok(list.every((c) => fromHex(c) && toHex(fromHex(c)) === c));
  // every knob's word and every choice is one decor.py keeps ([a-z], 16 at most)
  for (const id of ["custom_arch", "floral_cloud", "table_flowers", "place_setting"])
    for (const k of knobs(id)) {
      assert.match(k.name, /^[a-z]{1,16}$/, id);
      for (const c of k.choices || []) assert.match(c, /^[a-z]{1,16}$/, id + " " + k.name);
    }
});

test("each shape and kind builds; the colour asked for is the flowers' and the glasses'", () => {
  const has = (sh, hex) => { const c = fromHex(hex).map((v) => v / 255); for (let v = 0; v < sh.c.length; v += 3) if (Math.abs(sh.c[v] - c[0]) + Math.abs(sh.c[v + 1] - c[1]) + Math.abs(sh.c[v + 2] - c[2]) < 0.02) return true; return false; };
  for (const shape of ARCHES) assert.ok(starterShape("custom_arch", null, { shape, flowers: 20, greens: 10 }).i.length > 0, shape);
  for (const flower of FLOWERS) {
    const sh = starterShape("custom_arch", null, { flower, share: 0, flowers: 10, greens: 0, trails: 0, tint: "#7a4a9a", bloomsize: 0.1 });
    assert.ok(sh.i.every((i) => i < sh.p.length / 3), flower);
    assert.ok(has(sh, "#7a4a9a"), flower + " in the colour asked");
  }
  for (const green of GREENS) assert.ok(starterShape("floral_cloud", null, { green, flowers: 0, greens: 10 }).p.every(Number.isFinite), green);
  for (const shape of ["cloud", "ring", "garland", "rain"]) {
    const sh = starterShape("floral_cloud", null, { shape });
    assert.ok(bounds(sh.p).hi[1] <= 2.9 + 1e-6, shape + ": hung from the roof");
  }
  const lit = (sh) => sh.g.filter(Boolean).length;
  assert.ok(lit(starterShape("floral_cloud", null, { bulbs: 0, lamps: 4 })) > lit(starterShape("floral_cloud", null, { bulbs: 0, lamps: 0 })), "woven lamps glow");
  for (const style of ["low", "tall", "garland", "bud", "candles"]) {
    const sh = starterShape("table_flowers", null, { style, vase: "#5f8f6a" });
    assert.ok(bounds(sh.p).lo[1] > -0.05, style + " on the table");
    if (style !== "garland") assert.ok(has(sh, "#5f8f6a"), style + ": its glass in the colour asked");
  }
  // a place setting's glasses in a colour, and as many as asked
  const one = starterShape("place_setting", null, { glasses: 1 }), three = starterShape("place_setting", null, { glasses: 3, glass: "#c98a3c" });
  assert.ok(three.p.length > one.p.length);
  assert.ok(has(three, "#c98a3c") && !has(starterShape("place_setting"), "#c98a3c"));
});

test("an arch's flowers slide along it; round a ring they come round the other side", () => {
  const none = Object.fromEntries(PARTS.map((n) => [n, 0])), top = { ...none, crown: 100 };
  for (let k = 0; k < 50; k++) {
    const r1 = k / 50, r2 = (k * 7 % 50) / 50;
    near(coverPick({ ...top, shift: 0 }, r1, r2), coverPick(top, r1, r2), 1e-12, "no slide, as before");
    const t = coverPick({ ...top, shift: 40 }, r1, r2);
    assert.ok(t >= 0.8 - 1e-9 && t <= 1, "slid to its right foot: " + t);
    const w = coverPick({ ...none, rfoot: 100, shift: 40 }, r1, r2, true);
    assert.ok(w >= 0.2 - 1e-9 && w <= 0.4 + 1e-9, "round a ring: " + w);
  }
  // (slid off the end of an arch, they are gone; half off, the rest stays as thick)
  assert.equal(coverPick({ ...top, shift: 100 }, 0.5, 0.5), null);
  assert.ok(coverPick({ ...none, rfoot: 100, shift: 10 }, 0.99, 0.99) <= 1);
  const bare = { greens: 0, trails: 0, feet: "none", ...none, crown: 100 };
  const left = starterShape("custom_arch", null, { ...bare, shift: -40 }), right = starterShape("custom_arch", null, { ...bare, shift: 40 });
  assert.ok(share(left, (x) => x < -0.3) > 0.8 && share(right, (x) => x > 0.3) > 0.8, "the flowers moved over");
  assert.equal(cleanOpts("custom_arch", { shift: 35 }).shift, 35);
});

test("what an arch is made of is its frame's: wood, acrylic, fabric, as thick as asked", () => {
  const bare = { flowers: 0, greens: 0, trails: 0, feet: "none" };
  const of = (sh, f) => sh.m.filter((m) => m === F[f]).length;
  const metal = starterShape("custom_arch", null, bare);
  assert.ok(of(metal, "metal") > 0, "a brass tube as made");
  for (const f of ["wood", "glass", "cloth", "satin"]) {
    const sh = starterShape("custom_arch", null, { ...bare, finish: f });
    assert.ok(of(sh, f) > of(metal, f), f + ": the frame is made of it");
    assert.equal(of(sh, "metal"), 0, f + ": no metal left");
  }
  // (left at its own colour, wood is wood brown; a colour chosen is kept)
  const wood = starterShape("custom_arch", null, { ...bare, finish: "wood" });
  assert.ok(wood.c.some((v, n) => n % 3 === 0 && v === COLOURS.wood[0] && wood.c[n + 1] === COLOURS.wood[1]), "wood brown");
  const black = starterShape("custom_arch", "black", { ...bare, finish: "wood" });
  assert.ok(!black.c.some((v, n) => n % 3 === 0 && v === COLOURS.wood[0] && black.c[n + 1] === COLOURS.wood[1]), "painted black");
  // (thicker, further round its line)
  const thin = bounds(starterShape("custom_arch", null, { ...bare, thick: 0.01 }).p), thick = bounds(starterShape("custom_arch", null, { ...bare, thick: 0.1 }).p);
  near(thick.hi[2] - thin.hi[2], 0.09, 0.01, "a thicker frame");
  assert.deepEqual(cleanOpts("custom_arch", { finish: "wood" }), { finish: "wood" });
});

test("overhead: its own shelf, everything on it hung; fabric overhead built your way", () => {
  assert.ok(GROUPS.includes("aerial"));
  const aerial = Object.entries(STARTERS).filter(([, s]) => s.group === "aerial");
  assert.ok(aerial.length >= 20);
  for (const [id, s] of aerial) assert.ok(s.hangs, id + " hangs");
  for (const id of ["floral_cloud", "fabric_ceiling", "string_lights", "chandelier", "aerial_fabric"]) assert.equal(STARTERS[id].group, "aerial", id);
  for (const style of STARTERS.aerial_fabric.knobs.style.choices) {
    const sh = starterShape("aerial_fabric", null, { style, sag: 0.8 }), b = bounds(sh.p);
    assert.ok(b.hi[1] <= 3.0 + 0.05, style + ": under the roof");
    assert.ok(b.lo[1] < 3.0 - 0.5 && b.lo[1] > 3.0 - 0.8 - 0.2, style + ": sags as low as asked: " + b.lo[1]);
    assert.ok(b.hi[0] <= 2.05 && b.lo[0] >= -2.05 && b.hi[2] <= 2.4 && b.lo[2] >= -2.4, style + ": within its size");
    assert.ok(sh.i.every((i) => i < sh.p.length / 3), style);
  }
  // (a tent's lengths run out from its middle all round; swags across it side by side)
  const tent = fabricRuns("radial", 4, 4, 8, 3), swags = fabricRuns("swags", 4, 4, 6, 3), waves = fabricRuns("waves", 4, 4, 6, 3);
  assert.equal(tent.runs.length, 8);
  for (const r of tent.runs) { near(Math.hypot(r.a[0], r.a[2]), 0, 1e-9, "from the middle"); near(Math.hypot(r.b[0], r.b[2]), 2, 1e-9, "to the edge"); }
  assert.ok(waves.runs[0].scallops > swags.runs[0].scallops, "waves caught up along them");
  const more = starterShape("aerial_fabric", null, { strips: 12 }), fewer = starterShape("aerial_fabric", null, { strips: 4 });
  assert.ok(more.p.length > fewer.p.length * 2, "more lengths of fabric");
  const lit = (sh) => sh.g.filter(Boolean).length;
  assert.ok(lit(starterShape("aerial_fabric", null, { bulbs: 20 })) > 0, "bulbs glow");
  const posies = starterShape("aerial_fabric", null, { flowers: 30, tint: "#c41a24" });
  assert.ok(posies.p.length > starterShape("aerial_fabric").p.length, "posies where it is gathered");
  // (made of what is asked, in the colour asked: a sheer voile)
  const voile = starterShape("aerial_fabric", "blush", { finish: "glass" });
  assert.ok(voile.m.some((m) => m === F.glass));
});

test("a press on the thing moves it, though the ring's line crosses it; its knobs are still taken", () => {
  assert.equal(grabFor({ ring: 3, onThing: true }), "move", "on the thing, the ring drawn through it");
  assert.equal(grabFor({ ring: 3 }), "turn", "the ring's line, off the thing");
  assert.equal(grabFor({ ring: RING_PX + 1 }), null, "nothing near: the camera turns");
  assert.equal(grabFor({ lift: KNOB_PX - 1, onThing: true }), "lift", "the lift knob over the thing");
  assert.equal(grabFor({ turn: 5, onThing: true }), "turn", "the turn knob");
  assert.equal(grabFor({ lift: 5, turn: 5 }), "lift", "the lift knob wins");
  // from above the lift knob is over the thing's middle: the press moves it
  assert.equal(grabFor({ lift: 2, onThing: true, steep: true }), "move");
  assert.equal(grabFor({ lift: 2, turn: 10, steep: true }), "turn");
});

test("a view nearly straight down is steep, one across the room isn't", () => {
  assert.ok(steep([0, -1, 0]));
  assert.ok(steep([0.3, -1, 0.2]));
  assert.ok(!steep([1, -0.4, 0]), "from eye height, looking down a little");
  assert.ok(!steep([0.6, -1, 0.6]), "from above, at a slant");
});

test("the pointer on a thing's footprint takes it, the smallest first, at its own height", () => {
  const table = { item: "round_table", x: 0, y: 0, z: 0, turn: 0 }, vase = { item: "candle", x: 0.1, y: 0.76, z: 0, turn: 0 };
  const placed = [table, vase];
  // straight down through (x, z): the same point at every height
  const down = (x, z) => () => [x, z];
  assert.equal(underPointer(placed, defs, down(0.1, 0)), 1, "the candle on the table");
  assert.equal(underPointer(placed, defs, down(-0.5, 0)), 0, "the table");
  assert.equal(underPointer(placed, defs, down(4, 4)), -1, "the floor");
  // a slanting ray meets the table's level and the candle's at different places
  const slant = (y) => [0.1 + (0.76 - y), 0];
  assert.equal(underPointer(placed, defs, slant), 1);
  assert.equal(underPointer(placed, defs, () => null), -1, "the ray misses every level");
});

test("something new lands by the camera when flying, not by the body", () => {
  const def = defs("round_table");
  const body = [0, 0], camera = [12, 3];
  // the floor in view is round the camera, far from the body: there, when the camera is the centre
  const spots = [null, [13, 3.5]];
  assert.deepEqual(landSpot(def, camera, [1, 0], spots), [13, 3.5]);
  assert.notDeepEqual(landSpot(def, body, [1, 0], spots), [13, 3.5], "(by the body, that spot is too far)");
  // no floor in view: a step the way the camera looks
  const [x, z] = landSpot(def, camera, [0, 2], []);
  near(x, 12, 1e-9); assert.ok(z > 3.5 && z < 5);
  // straight down, no way ahead: right under the camera
  assert.deepEqual(landSpot(def, camera, [0, 0], []), [12, 3]);
});
