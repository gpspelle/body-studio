// A drawn room's flat surfaces as smooth sheets (sample_room.py write_shell): walls, floors,
// ceilings and the lawn, drawn as meshes in place of their splats, which up close are soft blobs a
// few centimetres across. Free of three.js, so it can be tested on its own (tests/js/shell.test.mjs);
// house.js makes the mesh.
//
// The file: "BSSH", version, count, then per sheet its corner o and sides du, dv (9 float32, in the
// splat file's coordinates), na, nb (uint32) and na x nb cells as RGBA bytes, row by row (alpha 0:
// no cell). Each cell becomes a quad; a vertex takes the mean colour of the cells round it, so the
// colours blend from cell to cell as the splats' did, and edges stay sharp.

export const SHELL = {
  // a little light from above and one side, as the decor has (a wall facing it lighter): the
  // shading is a fraction of the colour, by how the sheet faces `light` (in the room's metres, y up)
  light: [0.45, 0.8, 0.35], ambient: 0.8,
};

export function parseShell(buffer) {
  const dv = new DataView(buffer instanceof ArrayBuffer ? buffer : buffer.buffer, buffer.byteOffset || 0, buffer.byteLength);
  const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (magic !== "BSSH") throw new Error("not a shell");
  const n = dv.getUint32(8, true), sheets = [];
  let at = 12;
  for (let s = 0; s < n; s++) {
    const f = [];
    for (let i = 0; i < 9; i++) f.push(dv.getFloat32(at + 4 * i, true));
    const na = dv.getUint32(at + 36, true), nb = dv.getUint32(at + 40, true);
    at += 44;
    const cells = new Uint8Array(dv.buffer, dv.byteOffset + at, na * nb * 4);
    at += na * nb * 4;
    sheets.push({ o: f.slice(0, 3), du: f.slice(3, 6), dv: f.slice(6, 9), na, nb, cells });
  }
  return sheets;
}

// sRGB (the splats' colours) to linear, as three.js wants vertex colours
const linear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

// The sheets as triangles: { position, color (linear), index } typed arrays. `up` is the file's way
// up (sample rooms are y-down: [0, -1, 0]). `lit`: drawn with lights (as the decor is), so no
// shading is put in the colours.
export function shellGeometry(sheets, up = [0, -1, 0], lit = false) {
  let nv = 0, nt = 0;
  for (const s of sheets) {
    nv += (s.na + 1) * (s.nb + 1);
    for (let c = 0; c < s.na * s.nb; c++) if (s.cells[4 * c + 3]) nt += 2;
  }
  const position = new Float32Array(3 * nv), color = new Float32Array(3 * nv), index = new Uint32Array(3 * nt);
  const L = unit(SHELL.light), U = unit(up);
  let v0 = 0, t = 0;
  for (const s of sheets) {
    const { o, du, dv, na, nb, cells } = s;
    // how it faces the light: its normal in the room's metres (the file's up turned to y)
    const n = unit(cross(du, dv)), facing = Math.abs(L[0] * n[0] + L[1] * dot(n, U) + L[2] * n[2]);
    const shade = lit ? 1 : SHELL.ambient + (1 - SHELL.ambient) * facing;
    for (let k = 0; k <= nb; k++)
      for (let i = 0; i <= na; i++) {
        const v = v0 + k * (na + 1) + i, u = i / na, w = k / nb;
        for (let j = 0; j < 3; j++) position[3 * v + j] = o[j] + u * du[j] + w * dv[j];
        // the mean of the (up to four) cells that meet here
        let r = 0, g = 0, b = 0, m = 0;
        for (const [ci, ck] of [[i - 1, k - 1], [i, k - 1], [i - 1, k], [i, k]]) {
          if (ci < 0 || ck < 0 || ci >= na || ck >= nb) continue;
          const c = 4 * (ck * na + ci);
          if (!cells[c + 3]) continue;
          r += cells[c]; g += cells[c + 1]; b += cells[c + 2]; m++;
        }
        if (m) {
          color[3 * v] = linear(r / m / 255) * shade;
          color[3 * v + 1] = linear(g / m / 255) * shade;
          color[3 * v + 2] = linear(b / m / 255) * shade;
        }
      }
    for (let k = 0; k < nb; k++)
      for (let i = 0; i < na; i++) {
        if (!cells[4 * (k * na + i) + 3]) continue;
        const a = v0 + k * (na + 1) + i, b = a + 1, c = a + na + 1, d = c + 1;
        index.set([a, b, d, a, d, c], t);
        t += 6;
      }
    v0 += (na + 1) * (nb + 1);
  }
  return { position, color, index };
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const n = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / n, a[1] / n, a[2] / n]; };
