// Take a photo's maths (src/body_studio/static/photo.js). Run by tests/unit/test_photo_js.py.
import { test } from "node:test";
import assert from "node:assert/strict";
import { PHOTO, PIECE, SHORE, byMaterial, finishLook, frameOn, groundAt, keep, noise, photoName, photoSize, pieceName, progress, seascape, skyColour, sunWay, waveNormals } from "../../src/body_studio/static/photo.js";
import { almondTree, broadTree, coconutPalm, shape } from "../../src/body_studio/static/decor/shapes.js";
import { FINISHES } from "../../src/body_studio/static/decor/shapes.js";

test("the photo has the window's shape, its long side PHOTO.long, in even pixels", () => {
  assert.deepEqual(photoSize(1280, 800), [1600, 1000]);
  const [w, h] = photoSize(390, 844);
  assert.equal(h, PHOTO.long);
  assert.equal(w % 2, 0);
  assert.ok(Math.abs(w / h - 390 / 844) < 0.01);
  assert.deepEqual(photoSize(1000, 625, 400), [400, 250]);
  // no window yet: a landscape photo, never NaN
  const [a, b] = photoSize(0, 0);
  assert.ok(a > b && Number.isFinite(b));
});

test("only the room and its decor go in: not the body, its clothes, the handles, shadow cards or the sky dome", () => {
  const room = { mesh: true, visible: true, inRoom: true };
  assert.equal(keep(room), true);
  assert.equal(keep({ ...room, item: "round_table" }), true);
  assert.equal(keep({ ...room, inRoom: false }), false);          // clothes, the body's mesh
  assert.equal(keep({ ...room, visible: false }), false);
  assert.equal(keep({ ...room, splat: true }), false);
  assert.equal(keep({ ...room, handle: true }), false);
  assert.equal(keep({ ...room, shades: true }), false);
  assert.equal(keep({ ...room, item: "sky_dome" }), false);
  assert.equal(keep({ ...room, mesh: false }), false);            // groups, lights
});

test("each decor finish has a look: glass lets light through, bulbs give it", () => {
  for (const f of FINISHES) assert.ok(finishLook(f).kind);
  const glass = finishLook(FINISHES.find((f) => f.name === "glass"));
  assert.equal(glass.kind, "glass");
  assert.equal(glass.transmission, 1);
  assert.ok(glass.ior > 1.3 && glass.ior < 1.7);
  const glow = finishLook(FINISHES.find((f) => f.glow));
  assert.equal(glow.kind, "glow");
  assert.ok(glow.power > 1);
  const brass = finishLook(FINISHES.find((f) => f.name === "metal"));
  assert.deepEqual([brass.kind, brass.metalness], ["solid", 1]);
});

test("progress runs 0 to 100 and is done at the passes asked for", () => {
  assert.deepEqual(progress(0, 400), { done: false, part: 0, percent: 0 });
  assert.equal(progress(200, 400).percent, 50);
  assert.equal(progress(399, 400).done, false);
  assert.equal(progress(400, 400).done, true);
  assert.equal(progress(900, 400).percent, 100);
});

test("the sun turns with the room and comes from above", () => {
  const I = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const w = sunWay([2, 5, 3], I);
  assert.ok(Math.abs(Math.hypot(...w) - 1) < 1e-9);
  assert.ok(w[1] > 0.7);
  // a room turned half round about y (and moved, and scaled): the sun's way turns, length 1
  const H = [-2, 0, 0, 0, 0, 2, 0, 0, 0, 0, -2, 0, 5, 1, 7, 1];
  const v = sunWay([2, 5, 3], H);
  assert.ok(Math.abs(v[0] + w[0]) < 1e-9 && Math.abs(v[1] - w[1]) < 1e-9 && Math.abs(v[2] + w[2]) < 1e-9);
});

test("a photo is saved under the room's name and the time", () => {
  const when = new Date(2026, 9, 30, 9, 5);
  assert.equal(photoName("_sample_venue.ply", when), "venue-2026-10-30-0905.png");
  assert.equal(photoName("My flat (2)", when), "My-flat-2--2026-10-30-0905.png");
  assert.equal(photoName(null, when), "room-2026-10-30-0905.png");
});

test("a piece's photo is quicker than the room's: smaller, fewer passes and bounces", () => {
  assert.ok(PIECE.long < PHOTO.long && PIECE.passes < PHOTO.passes && PIECE.bounces < PHOTO.bounces);
});

test("a piece is framed from where the camera looks at it, as far as fits it in the photo", () => {
  const near = (a, b) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);
  // looking from 10 m in front: the camera comes in on the same line
  const e = frameOn([0, 1, 10], [0, 1, 0], 1, 60, 1, 1);
  assert.ok(near(e, [0, 1, 2]));              // 1 / sin(30°) = 2
  // a tall photo is narrower across: further back
  const tall = frameOn([0, 1, 10], [0, 1, 0], 1, 60, 0.5, 1);
  assert.ok(tall[2] > 2 && tall[0] === 0);
  // from above and to the side: the same way round, the same distance
  const s = frameOn([3, 4, 0], [0, 0, 0], 1, 60, 1, 1);
  assert.ok(Math.abs(Math.hypot(...s) - 2) < 1e-9 && Math.abs(s[1] / s[0] - 4 / 3) < 1e-9);
  // the margin moves it back; standing in the piece: from the front, a little above
  assert.ok(frameOn([0, 1, 10], [0, 1, 0], 1, 60, 1, 1.2)[2] > 2);
  const inside = frameOn([0, 0, 0], [0, 0, 0], 1, 60);
  assert.ok(inside[2] > 0 && inside[1] > 0 && inside.every(Number.isFinite));
  // a tiny piece still gets a camera that isn't in it
  assert.ok(frameOn([0, 0, 5], [0, 0, 0], 0, 60)[2] > 0);
});

test("a piece stands on its own floor; one that hangs gets the room's", () => {
  assert.equal(groundAt(0.75, 0), 0.75);        // flowers on a table
  assert.equal(groundAt(0, 0), 0);
  assert.equal(groundAt(2.6, 0), 0);            // an overhead cloud of flowers
  assert.equal(groundAt(3.2, 1), 1);
});

test("a piece's photo is named after the room and the piece", () => {
  const when = new Date(2026, 9, 31, 12, 5);
  assert.equal(pieceName("workspace/_sample_venue/run_1/venue.room.json", "custom_arch", when).endsWith("-custom-arch-2026-10-31-1205.png"), true);
  assert.equal(pieceName(null, "floral_cloud", when), "room-floral-cloud-2026-10-31-1205.png");
});

test("a mesh of many materials goes in as one piece per material, each with only its own corners", () => {
  // two triangles of material 0 sharing an edge, one of material 2, one of 0 again further on
  const index = [0, 1, 2, 2, 1, 3, 4, 5, 6, 3, 1, 7];
  const parts = byMaterial(index, [{ start: 0, count: 6, materialIndex: 0 }, { start: 6, count: 3, materialIndex: 2 }, { start: 9, count: 3, materialIndex: 0 }], 8);
  assert.deepEqual(parts.map((p) => p.material), [0, 2]);
  const [a, b] = parts;
  assert.deepEqual([...a.verts], [0, 1, 2, 3, 7]);
  // its triangles the same corners as before, numbered in its own
  assert.deepEqual([...a.index].map((k) => a.verts[k]), [0, 1, 2, 2, 1, 3, 3, 1, 7]);
  assert.deepEqual([...b.verts], [4, 5, 6]);
  assert.deepEqual([...b.index], [0, 1, 2]);
  // no groups (one material), and unindexed geometry
  assert.deepEqual(byMaterial(index, [], 8).map((p) => [p.material, p.index.length]), [[0, 12]]);
  const flat = byMaterial(null, [{ start: 0, count: 3, materialIndex: 1 }, { start: 3, count: 3, materialIndex: 0 }], 6);
  assert.deepEqual(flat.map((p) => [p.material, [...p.verts]]), [[1, [0, 1, 2]], [0, [3, 4, 5]]]);
  // (a group running past the end is cut there)
  assert.equal(byMaterial([0, 1, 2], [{ start: 0, count: 9, materialIndex: 0 }], 3)[0].index.length, 3);
});

test("the sky: deep blue overhead, hazy at the horizon, brightest round the sun, never NaN", () => {
  const sun = [0.48, 0.6, 0.64];
  const blue = (c) => c[2] - c[0];
  // (no clouds: how the blue changes with height alone)
  const was = SKY_CLOUDS(0);
  const up = skyColour([0, 1, 0], sun), low = skyColour([0.6, 0.05, -0.8].map((v, _, a) => v / Math.hypot(...a)), sun);
  assert.ok(blue(up) > blue(low), "bluer overhead than at the horizon");
  assert.ok(low[0] > up[0], "paler at the horizon");
  const atSun = skyColour(sun, sun), away = skyColour([-sun[0], sun[1], -sun[2]], sun);
  assert.ok(atSun[0] > 1 && atSun[0] > 3 * away[0], "the sun's glow");
  SKY_CLOUDS(was);
  // some clouds somewhere, whiter than the sky round them, and every colour finite
  let white = 0;
  for (let k = 0; k < 2000; k++) {
    const a = k * 2.399, y = 0.05 + 0.9 * ((k * 0.618) % 1), h = Math.sqrt(1 - y * y), c = skyColour([h * Math.cos(a), y, h * Math.sin(a)], sun);
    assert.ok(c.every(Number.isFinite) && c.every((v) => v >= 0));
    if (c[0] > 0.8 && Math.abs(c[0] - c[2]) < 0.15) white++;
  }
  assert.ok(white > 50 && white < 1500, `clouds cover part of the sky (${white} of 2000)`);
  assert.ok(skyColour([0, -1, 0], sun).every((v) => v < 0.5), "below the horizon: dim");
});

// (sets the sky's clouds for a test; gives back what they were)
import { SKY } from "../../src/body_studio/static/photo.js";
function SKY_CLOUDS(v) { const was = SKY.clouds; SKY.clouds = v; return was; }

test("the shore, the sea and the island lie out from where the garden meets the beach", () => {
  const sea = { at: [50, 0, 8], facing: [0.8, 0, -0.6], beach: 8, distance: 130 };
  const parts = seascape(sea);
  assert.deepEqual(parts.map((p) => p.name), ["sand", "wet", "foam", "sea", "island"]);
  const out = (p) => (p[0] - 50) * 0.8 + (p[2] - 8) * -0.6;           // how far out to sea
  const pts = (p) => Array.from({ length: p.position.length / 3 }, (_, k) => p.position.slice(3 * k, 3 * k + 3));
  for (const p of parts) {
    assert.equal(p.position.length / 3, p.uv.length / 2);
    assert.equal(p.position.length, p.colour.length);
    assert.ok(p.index.every((k) => k < p.position.length / 3) && p.index.length % 3 === 0, p.name);
    assert.ok(p.position.every(Number.isFinite), p.name);
  }
  const [sand, wet, , water, island] = parts.map(pts);
  // the dry sand from the garden's edge to the beach's depth, just under the room's own sand
  assert.ok(sand.every((q) => out(q) > -0.01 && out(q) < 8.01 && q[1] < 0 && q[1] > -0.1));
  // the wet sand down to the water's level, the sea flat at it and out past the horizon
  assert.ok(wet.every((q) => out(q) >= 7.99 && out(q) < 12.5));
  assert.ok(water.every((q) => q[1] === SHORE.level));
  assert.ok(Math.max(...water.map(out)) >= SHORE.horizon);
  // the island across the channel, rising out of the sea to 15-30 m
  const peak = Math.max(...island.map((q) => q[1]));
  assert.ok(peak > 15 && peak < 35, `its peaks ${peak}`);
  assert.ok(island.every((q) => out(q) > 110 && out(q) < 175));
  // facing the other way, it all goes the other way
  const back = pts(seascape({ ...sea, facing: [-0.8, 0, 0.6] })[3]);
  assert.ok(back.every((q) => out(q) <= 0));
  assert.equal(noise(1.5, 2.5, 3), noise(1.5, 2.5, 3));
});

test("the sea's ripples: a normal map that tiles, pointing up", () => {
  const n = 32, w = waveNormals(n);
  assert.equal(w.length, 4 * n * n);
  let tilted = 0;
  for (let k = 0; k < n * n; k++) {
    assert.ok(w[4 * k + 2] > 160, "mostly up");
    if (Math.abs(w[4 * k] - 127.5) > 6) tilted++;
  }
  assert.ok(tilted > n * n * 0.3, "rippled");
});

test("trees: their trunks one smooth piece, their crowns leaves (not lumps), no more triangles than before", () => {
  for (const [make, most] of [[(s) => broadTree(s, 5.5, 2.6, 11), 60000], [(s) => almondTree(s, 6.0, 3.0, 23), 60000], [(s) => coconutPalm(s, 8.0, 5), 11000]]) {
    const s = shape();
    make(s);
    assert.ok(s.p.every(Number.isFinite));
    assert.ok(s.i.length / 3 < most, `${s.i.length / 3} triangles`);
    assert.ok(s.i.every((k) => k < s.p.length / 3));
  }
  // a crown of many small leaves: most of a broad tree's triangles are in pairs of four corners
  const s = shape();
  broadTree(s, 5.5, 2.6, 11);
  const high = s.p.filter((_, k) => k % 3 === 1 && s.p[k] > 3.5).length;
  assert.ok(high > 30000, `leaves up in the crown (${high} corners)`);
});
