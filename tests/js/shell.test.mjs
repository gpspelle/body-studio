// A drawn room's surfaces as smooth sheets (src/body_studio/static/shell.js), read from a shell
// that sample_room.py wrote. Run by tests/unit/test_shell_js.py, which gives the file in SHELL_FILE.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FINISHES, SHELL, finishMaps, occlusion, parseShell, shellGeometry } from "../../src/body_studio/static/shell.js";

const bytes = readFileSync(process.env.SHELL_FILE);
const sheets = parseShell(bytes);

test("the file's sheets: a floor 2 by 1 m, a wall over it, and a lawn cut on a slant", () => {
  assert.equal(sheets.length, 3);
  const [floor, wall, lawn] = sheets;
  assert.deepEqual([floor.na, floor.nb], [4, 2]);
  assert.deepEqual(floor.o, [0, 0, 0]);
  assert.deepEqual(floor.du, [2, 0, 0]);
  assert.deepEqual(floor.dv, [0, 0, 1]);
  assert.equal(wall.dv[1], 0);
  assert.ok(Math.abs(wall.du[1] + 2.5) < 1e-6, "the wall goes up: y-down, so -2.5");
  const kept = [...Array(lawn.na * lawn.nb).keys()].filter((c) => lawn.cells[4 * c + 3]).length;
  assert.ok(kept > 0 && kept < lawn.na * lawn.nb, "the lawn has the cells past its slanted edge left out");
  assert.throws(() => parseShell(new Uint8Array(16)), /not a shell/);
});

test("as triangles: two to a cell, none where there is no cell, colours blended and shaded", () => {
  const g = shellGeometry(sheets);
  const cells = sheets.reduce((n, s) => n + [...Array(s.na * s.nb).keys()].filter((c) => s.cells[4 * c + 3]).length, 0);
  assert.equal(g.index.length, 6 * cells);
  assert.equal(g.position.length, 3 * sheets.reduce((n, s) => n + (s.na + 1) * (s.nb + 1), 0));
  for (const i of g.index) assert.ok(i < g.position.length / 3);
  // the floor's corner is where the sheet says; a vertex inside it the floor's grey, linear
  assert.deepEqual([...g.position.slice(0, 3)], [0, 0, 0]);
  const grey = Math.pow((Math.round(0.6 * 255) / 255 + 0.055) / 1.055, 2.4);
  const mid = 3 * (1 * 5 + 2);                              // (row 1, column 2 of the 5 x 3 vertices)
  assert.ok(g.color[mid] <= grey + 1e-6 && g.color[mid] >= SHELL.ambient * grey - 1e-6, "shaded, never brighter");
  assert.ok(g.color[mid] === g.color[mid + 1] && g.color[mid] === g.color[mid + 2], "grey");
  // the floor and the wall face the light differently, so they are shaded differently
  const wallAt = 3 * 15;
  assert.notEqual(g.color[mid], g.color[wallAt]);
});

test("each sheet's finish, read from the file: the floor cement, the wall plaster, the lawn none", () => {
  assert.deepEqual(sheets.map((s) => s.finish), ["cement", "plaster", ""]);
  assert.ok(FINISHES.includes("wood_x") && FINISHES[0] === "");
});

test("the triangles grouped by finish, each group one finish, together covering them all", () => {
  const g = shellGeometry(sheets, [0, -1, 0], true);
  assert.deepEqual(g.groups.map((r) => r.finish), ["", "plaster", "cement"]);
  assert.equal(g.groups.reduce((n, r) => n + r.count, 0), g.index.length);
  for (let i = 1; i < g.groups.length; i++) assert.equal(g.groups[i].start, g.groups[i - 1].start + g.groups[i - 1].count);
  // the maps' coordinates are metres: across the 2 m floor its u goes 0 to 2
  assert.ok(Math.abs(g.uv[2 * 4] - 2) < 1e-6, "the floor's far corner is 2 m along");
});

test("corners baked darker: the floor by the wall, on its upper side, never its open middle", () => {
  // the floor is 2 by 1 m with the wall standing on its x = 0 edge (y-down: up is -y)
  const occ = occlusion(sheets);
  const [floor] = sheets, n = [floor.du, floor.dv].reduce((a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]);
  const up = n[1] < 0 ? 0 : 1;                       // (the side facing -y, where the wall is)
  const byWall = occ[0].at(up, 0.02, 0.5), open = occ[0].at(up, 1, 0.5), under = occ[0].at(1 - up, 0.02, 0.5);
  assert.ok(byWall < 0.85, `by the wall ${byWall}`);
  assert.ok(open > byWall + 0.1, `farther out ${open}`);
  assert.ok(under > 0.99, `underneath nothing is near: ${under}`);
  for (const o of occ) for (const s of [0, 1]) for (const u of [0, 0.5, 1]) {
    const v = o.at(s, u, 0.5);
    assert.ok(v >= 1 - SHELL.ao.strength - 1e-6 && v <= 1 + 1e-6);
  }
});

test("the finishes' maps: tile seamlessly, keep the colour's mean near 1 / mean, nothing for none", () => {
  assert.equal(finishMaps(""), null);
  for (const f of FINISHES.slice(1)) {
    const m = finishMaps(f, 64);
    assert.equal(m.color.length, 4 * 64 * 64);
    assert.ok(m.mean > 0.7 && m.mean <= 1, `${f} mean ${m.mean}`);
    assert.ok(m.metres > 0);
    // the normal map points out of the surface everywhere
    for (let i = 0; i < 64 * 64; i++) assert.ok(m.normal[4 * i + 2] > 127, f);
    // its left and right edges meet: no seam where the tile repeats
    let edge = 0, inner = 0;
    for (let y = 0; y < 64; y++) {
      edge += Math.abs(m.color[4 * (y * 64)] - m.color[4 * (y * 64 + 63)]);
      inner += Math.abs(m.color[4 * (y * 64 + 31)] - m.color[4 * (y * 64 + 32)]);
    }
    assert.ok(edge <= 3 * inner + 64 * 2, `${f}: a seam (${edge} vs ${inner})`);
  }
  assert.deepEqual(finishMaps("plaster", 32).color, finishMaps("plaster", 32).color, "the same every time");
});
