// A drawn room's surfaces as smooth sheets (src/body_studio/static/shell.js), read from a shell
// that sample_room.py wrote. Run by tests/unit/test_shell_js.py, which gives the file in SHELL_FILE.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SHELL, parseShell, shellGeometry } from "../../src/body_studio/static/shell.js";

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
