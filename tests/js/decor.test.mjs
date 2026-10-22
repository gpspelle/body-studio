// Decor in a room (src/body_studio/static/decor.js): the starters' shapes, meshes made from photos as
// decor.py packs them, and where things go. Run by tests/unit/test_decor_js.py, which passes the
// starters decor.py lists (STARTERS) and a packed mesh with its unpacked numbers (MESH, MESH_REF).
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { COLOURS, GROUPS, STARTERS, around, blocker, covers, dropY, freeSpot, itemDef, mapMatrix, row, seats, setTable, starterShape, unpack, wrap } from "../../src/body_studio/static/decor.js";
import { Placement, RoomMap } from "../../src/body_studio/static/room.js";

const env = (k) => process.env[k] && JSON.parse(fs.readFileSync(process.env[k], "utf8"));
const PY = env("STARTERS") || [];
const defs = (id) => itemDef({ id });
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
