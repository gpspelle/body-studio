// The venue seen as text and as a tiny picture (scripts/venue_view.mjs), on small scenes made here:
// where a fixture stands and faces, the plan's and the elevation's letters and sides, the camera's
// way of looking, clipping and filling triangles, and the PNG it writes. Run by
// tests/unit/test_venue_view_js.py.
import { test } from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import { placed, letters, nearest, plan, elevation, listing, camera, project, clip, raster, render, png, beside, below, points } from "../../scripts/venue_view.mjs";

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

// a straight row of grey splats making a wall along x at z, 0..3 m up
function wall(z, x0, x1, colour = [0.5, 0.5, 0.5]) {
  const out = [];
  for (let x = x0; x <= x1 + 1e-9; x += 0.05) for (let y = 0; y <= 3; y += 0.05) out.push(x, y, z, ...colour, 0.03, 0.03, 0.01);
  return out;
}
function floor(x0, x1, z0, z1, colour = [0.4, 0.4, 0.4]) {
  const out = [];
  for (let x = x0; x <= x1; x += 0.1) for (let z = z0; z <= z1; z += 0.1) out.push(x, 0, z, ...colour, 0.06, 0.005, 0.06);
  return out;
}
const scene = (splats, fixtures = [], palette = { GREY: [0.5, 0.5, 0.5], RED: [0.9, 0.1, 0.1], FLOOR: [0.4, 0.4, 0.4] }) =>
  ({ splats: Float32Array.from(splats), fixtures, palette });

test("a fixture stands where it is put and turns as three.js turns it", () => {
  const p = placed({ item: "brick_pier", at: [2, 0, 3] });
  near((p.lo[0] + p.hi[0]) / 2, 2, 0.01, "x middle");
  near((p.lo[2] + p.hi[2]) / 2, 3, 0.01, "z middle");
  near(p.hi[1], 3.4, 0.01, "as tall as the starter");
  // a brick face (back at z = 0, facing +z) turned a quarter faces +x: thin along x, long along z
  const w = placed({ item: "brick_wall", at: [0, 0, 0], turn: Math.PI / 2, opts: { w: 3 } });
  assert.ok(w.hi[0] - w.lo[0] < 0.1, "thin across");
  near(w.hi[2] - w.lo[2], 3, 0.05, "3 m along z");
  assert.ok(w.lo[0] >= -0.01, "it stands out on the +x side");
  const s = placed({ item: "brick_pier", at: [0, 0, 0], scale: [2, 1, 1] });
  near(s.hi[0] - s.lo[0], 0.8, 0.02, "stretched by scale");
  assert.equal(placed({ item: "no_such_thing", at: [0, 0, 0] }), null);
});

test("letters go to the most common items first; colours to the nearest name", () => {
  const L = letters(["b", "a", "b", "c", "b", "a"]);
  assert.deepEqual([...L], [["b", "A"], ["a", "B"], ["c", "C"]]);
  assert.equal(nearest({ W: [1, 1, 1], K: [0, 0, 0] }, [0.8, 0.7, 0.9]), "W");
});

test("the plan: splat walls as #, the floor as dots, a fixture standing through the cut as its capital", () => {
  const sc = scene([...wall(0, 0, 4), ...floor(0, 4, 0, 3)], [{ item: "brick_pier", at: [2, 0, 1.5] }]);
  const text = plan(sc, { box: [0, 4, -0.25, 3], cell: 0.25 });
  const rows = text.split("\n").slice(2, 15).map((r) => r.slice(7));
  assert.match(rows[1], /^#{16}$/, "the wall along z = 0, across the page");
  assert.equal(rows[7][8], "A", "the pier at (2, 1.5): row (1.5 + 0.25) / 0.25, column 2 / 0.25");
  assert.equal(rows[5][2], ".", "the floor");
  assert.match(text, /A brick_pier/);
  const colours = plan(sc, { box: [0, 4, -0.25, 3], cell: 0.25, by: "colour" });
  assert.match(colours, /GREY/);
});

test("the elevation: seen from either side, left and right swap; nearest wins; depth digits", () => {
  // a red splat at x = 1 in front of a grey wall at z = 2 (x 0..4)
  const s = [...wall(2, 0, 4), 1, 1.5, 1.8, 0.9, 0.1, 0.1, 0.05, 0.05, 0.05];
  const sc = scene(s);
  const rowAt = (text, y) => text.split("\n")[2 + Math.round((3.2 - y) / 0.1)].slice(6);
  const front = elevation(sc, { axis: "z", at: 2, from: "-", range: [0, 4], by: "colour" });
  const back = elevation(sc, { axis: "z", at: 2, from: "+", range: [0, 4], by: "colour" });
  // looking +z the right hand is -x: x = 1 is 3 m from the left (x 4 is on the left)
  const red = (t) => (t.match(/(\w)=RED/) || [])[1];
  assert.equal(rowAt(front, 1.5)[30], red(front), "looking +z, x = 1 is 30 cells from the left");
  assert.equal(red(back), undefined, "from behind, the wall hides it");
  assert.match(front, /x 4 \(left\) \.\. 0 \(right\)/);
  assert.match(back, /x 0 \(left\) \.\. 4 \(right\)/);
  const depth = elevation(sc, { axis: "z", at: 2, from: "-", range: [0, 4], by: "depth" });
  assert.equal(rowAt(depth, 1.5)[30], "2", "0.2 m in front of the plane: 2 tenths");
  assert.equal(rowAt(depth, 1.5)[5], "0", "the wall itself");
  const x = elevation(scene(wall(0, 0, 4)), { axis: "x", at: 2, from: "-", range: [-1, 1] });
  assert.match(x, /z -1 \(left\) \.\. 1 \(right\)/, "looking +x, +z is on the right");
});

test("the listing says where each fixture is and what it fills", () => {
  const sc = scene([], [{ item: "brick_pier", at: [2, 0, 1.5] }, { item: "brick_pier", at: [20, 0, 1.5] }]);
  const text = listing(sc, { box: [0, 4, 0, 3] });
  assert.equal(text.split("\n").length, 1);
  assert.match(text, /^ {2}0 brick_pier at \(2, 0, 1\.5\) turn 0 fills x 1\.8\.\.2\.2 y 0\.\.3\.4 z 1\.3\.\.1\.7$/);
});

test("the camera looks as a fly view does: look 0 along +x, a quarter turn left toward -z", () => {
  const C = camera({ at: [0, 0], look: 0, pitch: 0, eye: 1.6, fov: 90 }, 100, 100);
  assert.deepEqual(C.f.map((v) => Math.round(v * 1e6) / 1e6), [1, 0, -0]);
  assert.deepEqual(C.r.map(Math.round), [0, 0, 1], "right hand toward +z");
  const L = camera({ at: [0, 0], look: Math.PI / 2, pitch: 0 }, 100, 100);
  near(L.f[2], -1, 1e-9, "looking -z");
  const [x, y] = project(C, [0, 0, 1]);
  assert.deepEqual([x, y], [50, 50], "straight ahead: the middle");
  near(project(C, [1, 0, 1])[0], 100, 1e-9, "45 degrees right at fov 90: the right edge");
});

test("triangles are cut at the near plane and filled pixel by pixel", () => {
  assert.equal(clip([[0, 0, -1], [1, 0, -1], [0, 1, -1]]).length, 0);
  assert.equal(clip([[0, 0, 1], [1, 0, 1], [0, 1, 1]]).length, 1);
  assert.equal(clip([[0, 0, 1], [1, 0, 1], [0, 1, -1]]).length, 2, "one corner behind: a quad, two triangles");
  for (const t of clip([[0, 0, 1], [1, 0, -1], [0, 1, -1]])) for (const p of t) assert.ok(p[2] >= 0.05 - 1e-9);
  let n = 0;
  raster([[0, 0, 1], [10, 0, 1], [0, 10, 1]], 20, 20, (x, y, z) => { n++; near(z, 1, 1e-9, "depth"); });
  assert.ok(n >= 45 && n <= 55, "about half of 10 x 10: " + n);
});

test("a render: what is ahead in the middle, sky elsewhere; nearer hides farther", () => {
  const sc = scene([3, 1.6, 0, 1, 0, 0, 0.2, 0.2, 0.2, 6, 1.6, 0, 0, 0, 1, 0.5, 0.5, 0.5]);
  const rgb = render(sc, { at: [0, 0], look: 0, pitch: 0, eye: 1.6, fov: 60 }, 40, 40);
  const px = (x, y) => [...rgb.slice((y * 40 + x) * 3, (y * 40 + x) * 3 + 3)];
  assert.deepEqual(px(20, 20), [255, 0, 0], "the near red splat");
  assert.deepEqual(px(0, 0), [199, 214, 230], "sky");
  const fx = scene([], [{ item: "brick_pier", at: [3, 0, 0] }]);
  const r2 = render(fx, { at: [0, 0], look: 0, pitch: 0, eye: 1.6, fov: 60 }, 40, 40);
  assert.notDeepEqual([...r2.slice((20 * 40 + 20) * 3, (20 * 40 + 20) * 3 + 3)], [199, 214, 230], "the pier is drawn");
});

test("the PNG is a real one, and pictures go side by side and in rows", () => {
  const rgb = new Uint8Array(2 * 3 * 3).fill(7);
  const b = png(rgb, 2, 3);
  assert.deepEqual([...b.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(b.readUInt32BE(16), 2);
  assert.equal(b.readUInt32BE(20), 3);
  const idat = b.indexOf("IDAT"), len = b.readUInt32BE(idat - 4);
  const raw = zlib.inflateSync(b.subarray(idat + 4, idat + 4 + len));
  assert.equal(raw.length, 3 * (1 + 2 * 3));
  const p = beside([{ rgb, w: 2, h: 3 }, { rgb, w: 2, h: 3 }]);
  assert.equal(p.w, 8);
  const q = below([p, { rgb, w: 2, h: 3 }]);
  assert.deepEqual([q.w, q.h], [8, 18]);
});

test("points cover a face seen edge on, and keep to the box", () => {
  const sc = scene([0, 0, 0, 1, 1, 1, 0.1, 0.1, 0.1, 9, 0, 0, 1, 1, 1, 0.1, 0.1, 0.1], [{ item: "brick_wall", at: [0, 0, 0], opts: { w: 2 } }]);
  const P = points(sc, 0.1, [-2, 2, -1, 3, -1, 1]);
  assert.equal(P.src.filter((s) => s === -1).length, 1, "the splat outside the box is left out");
  const xs = new Set();
  P.src.forEach((s, k) => { if (s === 0) xs.add(Math.round(P.pos[3 * k] * 10)); });
  assert.ok(xs.size >= 19, "the wall's points run its whole width");
});

// ---------------------------------------------------------------- the real venue (FIXTURES)
// No tree may pass through the garden cover's steel (Gabriel, 2026-11-02): a tree's leaves stay
// above its roof, and where a trunk or limb comes up through the roof it is clear of every rafter,
// purlin and post (glass is left out: a pane would have its hole cut round the trunk).
test("the venue's trees grow clear of the garden cover's steel", { skip: !process.env.FIXTURES }, async () => {
  const fs = await import("node:fs");
  const fixtures = JSON.parse(fs.readFileSync(process.env.FIXTURES, "utf8"));
  const steel = [];                                     // the cover's steel, as points about 5 cm apart
  const roofs = fixtures.map((t, k) => [t, k]).filter(([t]) => t.item === "glass_roof");
  assert.ok(roofs.length >= 4, "the garden has its cover");
  for (const [t, k] of roofs) {
    const p = placed(t, k), T = p.tris;
    for (let f = 0; f < T.length / 9; f++) {
      if (p.glow[f] & 2) continue;
      for (let j = 0; j < 3; j++) steel.push([T[9 * f + 3 * j], T[9 * f + 3 * j + 1], T[9 * f + 3 * j + 2]]);
      steel.push([0, 1, 2].map((a) => (T[9 * f + a] + T[9 * f + 3 + a] + T[9 * f + 6 + a]) / 3));
    }
  }
  const lo = [Infinity, Infinity], hi = [-Infinity, -Infinity];
  for (const [t, k] of roofs) { const p = placed(t, k); lo[0] = Math.min(lo[0], p.lo[0]); lo[1] = Math.min(lo[1], p.lo[2]); hi[0] = Math.max(hi[0], p.hi[0]); hi[1] = Math.max(hi[1], p.hi[2]); }
  // (the roof's height over z, from its steel: the highest steel within 10 cm across)
  const top = new Map();
  for (const q of steel) { const b = Math.round(q[2] * 10); top.set(b, Math.max(top.get(b) ?? -Infinity, q[1])); }
  const roofAt = (z) => top.get(Math.round(z * 10)) ?? 0;
  let checked = 0;
  fixtures.forEach((t, k) => {
    if (!["broad_tree", "beach_almond", "coconut_palm"].includes(t.item)) return;
    const p = placed(t, k), T = p.tris;
    for (let f = 0; f < T.length / 9; f++) {
      const v = [0, 1, 2].map((j) => [T[9 * f + 3 * j], T[9 * f + 3 * j + 1], T[9 * f + 3 * j + 2]]);
      if (!v.every((q) => q[0] > lo[0] && q[0] < hi[0] && q[2] > lo[1] && q[2] < hi[1])) continue;
      const d = v.map((q) => q[1] - roofAt(q[2]));
      const c = p.cols.slice(3 * f, 3 * f + 3), leaf = c[1] > c[0] * 1.15 && c[1] > c[2];
      if (leaf) assert.ok(Math.min(...d) > -0.05 || Math.max(...v.map((q) => q[1])) < 1.0, `${t.item} ${k}: leaves under the cover's roof at ${v[0].map((x) => x.toFixed(2))}`);
      if (!(Math.min(...d) < 0.15 && Math.max(...d) > -0.15)) continue;
      checked++;
      for (const q of v) for (const s of steel) {
        const gap = Math.hypot(q[0] - s[0], q[1] - s[1], q[2] - s[2]);
        assert.ok(gap > 0.12, `${t.item} ${k} meets the cover's steel at (${s.map((x) => x.toFixed(2))})`);
      }
    }
  });
  assert.ok(checked > 0, "the broad tree under the cover comes up through its roof");
});
