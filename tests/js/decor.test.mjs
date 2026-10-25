// Decor in a room (src/body_studio/static/decor.js): the starters' shapes, meshes made from photos as
// decor.py packs them, and where things go. Run by tests/unit/test_decor_js.py, which passes the
// starters decor.py lists (STARTERS) and a packed mesh with its unpacked numbers (MESH, MESH_REF).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { COLOURS, FINISHES, GROUPS, STARTERS, bounds as shapeBounds, thumbView, around, blocker, covers, dropY, MAX_LIFT, clampLift, freeSpot, handles, heightOnRay, itemDef, listing, mapMatrix, row, seats, setTable, standY, starterShape, turnToward, unpack, wrap, colourOf, fromHex, fromRgb, hexOf, toHex,
         knobs, knobValues, cleanOpts, optsKey, sized, dims, MATERIALS } from "../../src/body_studio/static/decor.js";
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
  const shop = Object.entries(STARTERS).filter(([, s]) => s.group === "flowers");
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
    for (const k of ks) assert.ok(k.min <= k.value && k.value <= k.max, `${id} ${k.name} in its range`);
    // the starter's own values change nothing
    assert.deepEqual(starterShape(id, null, cleanOpts(id, knobValues(id, null))).p, starterShape(id).p, id);
    for (const f of [0.6, 1.7]) {
      const opts = {};
      for (const k of ks) if (k.size && ["w", "d", "h"].includes(k.name)) opts[k.name] = Math.min(k.max, Math.max(k.min, k.value * f));
      const p = { item: id, x: 0, z: 0, turn: 0, opts }, d = defs(id, p), b = bounds(starterShape(id, null, opts).p);
      const [w, dd, h] = dims(d), [w0, d0, h0] = dims(defs(id)), [bw, bd] = [b.hi[0] - b.lo[0], b.hi[2] - b.lo[2]];
      const b0 = bounds(starterShape(id).p);
      // as wide (deep, tall) as asked, as much as the starter itself is as wide as it says
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
