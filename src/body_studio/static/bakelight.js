// Baked light: a drawn room's light worked out by following rays on the GPU and kept on every
// corner of its walls, floors, fittings and decor (bake.js has the numbers). How:
//  - the room's meshes as they are drawn (the shell, house.js; the fittings and decor, decorate.js)
//    are put together into one in the world's place, without the glass, and a BVH is built over it
//    (three-mesh-bvh, in pathtracer/), which a shader can follow rays through;
//  - each corner (each side of a wall) is a texel: where it is and which way it faces;
//  - a shader, a pass at a time and a band of rows a frame, casts from each corner a ray toward the
//    sun (a little off it each time, for soft edges), one round about (the sky's light if nothing is
//    hit, else the light where it lands, coloured by what it lands on) and averages them;
//  - read back once, kept as bytes on each mesh (attributes bake and bake2: the back of a wall),
//    which the meshes' materials (copies, made here) show in place of their lamps' light.
// Worked out only when asked (Bake the light): a thing drawn again where it was keeps its light, a
// thing moved or added shows the lamps' light until it is baked again. Design: docs/photo.md ("Baked light").
import * as THREE from "three";
import { MeshBVH, MeshBVHUniformStruct, BVHShaderGLSL, FloatVertexAttributeTexture, CENTER } from "/static/pathtracer/pathtracer.js";
import { BAKE, band, keyOf, layout, pack, progress } from "/static/bake.js";
import { sunWay } from "/static/photo.js";

const app = window.bodyApp;
const status = document.getElementById("bakeStatus"), button = document.getElementById("bakeBtn");
const say = (n) => {
  status.hidden = n === null; button.disabled = n !== null;
  if (n !== null) status.textContent = window.t("bake.working", { n });
};
const V = app.viewer;

let passes = BAKE.passes;
let job = null;             // the bake under way: { stop, ... }
let enabled = true;
const kept = new Map();     // keyOf(mesh) -> { bake, bake2 } (bytes), for the room shown
const state = { baked: 0, passes: 0, at: 0 };   // (tests) meshes lit, passes done, when it ended

// ---------------------------------------------------------------- the meshes
function decorGroup() { return window.decor?.group?.() || null; }
function solid(m) { return m && m.isMeshStandardMaterial && !(m.transparent && m.opacity < 1); }
function visible(o) { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; }
// what is lit: the shell and the decor group's meshes (not the handles, shadow cards or sky dome)
function receivers() {
  const out = [], shell = window.house?.shell?.();
  if (shell) out.push({ mesh: shell, sides: 2 });
  const g = decorGroup();
  if (g) for (const c of g.children) {
    if (!c.isMesh || !visible(c) || c.userData.item === "sky_dome") continue;
    if (![].concat(c.userData.unbaked?.material || c.material).some(solid)) continue;
    out.push({ mesh: c, sides: 1 });
  }
  return out;
}
const original = (mesh) => mesh.userData.unbaked || { geometry: mesh.geometry, material: mesh.material };
function key(mesh) { return keyOf(original(mesh).geometry.uuid, mesh.matrixWorld.elements); }

// ---------------------------------------------------------------- the materials that show it
const variants = new Map();
function bakedOf(m) {
  if (!solid(m)) return m;
  if (variants.has(m)) {
    const b = variants.get(m);
    if (b.envMap !== m.envMap) { b.envMap = m.envMap; b.needsUpdate = true; }   // (decorate.js gives the shell its reflections late)
    return b;
  }
  const b = m.clone();
  b.envMap = m.envMap;
  b.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace("#include <common>", "#include <common>\nattribute vec4 bake;\nattribute vec4 bake2;\nvarying vec4 vBake;\nvarying vec4 vBake2;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvBake = bake; vBake2 = bake2;");
    sh.fragmentShader = sh.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying vec4 vBake;\nvarying vec4 vBake2;")
      .replace("#include <aomap_fragment>", `
        vec4 bk = (gl_FrontFacing ? vBake : vBake2) * vec4(vec3(${BAKE.scale.toFixed(1)}), 1.0);
        reflectedLight.directDiffuse *= ${BAKE.lamps.toFixed(2)};
        reflectedLight.indirectDiffuse = diffuseColor.rgb * bk.rgb * ${(1 - BAKE.lamps).toFixed(2)};
        reflectedLight.directSpecular *= bk.a;
        reflectedLight.indirectSpecular *= bk.a;`);
  };
  b.customProgramCacheKey = () => "baked-light";
  b.userData.baked = true;
  variants.set(m, b);
  return b;
}
// a mesh shown with its light (bytes, its corners' count x 4; bake2 the back's, or the same)
function light(mesh, bake, bake2) {
  const o = original(mesh);
  mesh.userData.unbaked = o;
  const g = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(o.geometry.attributes)) g.setAttribute(name, a);
  g.setIndex(o.geometry.index);
  for (const gr of o.geometry.groups) g.addGroup(gr.start, gr.count, gr.materialIndex);
  g.boundingSphere = o.geometry.boundingSphere; g.boundingBox = o.geometry.boundingBox;
  const front = new THREE.BufferAttribute(bake, 4, true);
  g.setAttribute("bake", front);
  g.setAttribute("bake2", bake2 === bake ? front : new THREE.BufferAttribute(bake2, 4, true));
  if (mesh.geometry !== o.geometry) mesh.geometry.dispose();
  mesh.geometry = g;
  mesh.material = Array.isArray(o.material) ? o.material.map(bakedOf) : bakedOf(o.material);
}
function unlight(mesh) {
  const o = mesh.userData.unbaked;
  if (!o) return;
  if (mesh.geometry !== o.geometry) mesh.geometry.dispose();
  mesh.geometry = o.geometry; mesh.material = o.material;
  delete mesh.userData.unbaked;
}
// what was worked out before, on meshes drawn again where they were
function reuse() {
  let n = 0;
  for (const { mesh } of receivers()) {
    if (mesh.userData.unbaked) continue;
    const k = kept.get(key(mesh));
    if (k) { light(mesh, k.bake, k.bake2); n++; }
  }
  if (n) V.redraw();
}

// ---------------------------------------------------------------- the rays
const SHADER = /* glsl */`
precision highp isampler2D;
precision highp usampler2D;
${BVHShaderGLSL.common_functions}
${BVHShaderGLSL.bvh_struct_definitions}
${BVHShaderGLSL.bvh_ray_functions}
uniform BVH bvh;
uniform sampler2D colours, points, normals, last;
uniform vec3 sunWay, sunLight, up, zenith, horizon, ground;
uniform float cone, eps, ambient, bounce, pass, seed;
out vec4 outColour;
uint h;
float rnd() { h ^= h << 13; h ^= h >> 17; h ^= h << 5; return float(h) / 4294967295.0; }
void frame(vec3 n, out vec3 t, out vec3 b) {
  t = normalize(abs(n.y) < 0.99 ? cross(n, vec3(0.0, 1.0, 0.0)) : cross(n, vec3(1.0, 0.0, 0.0)));
  b = cross(n, t);
}
vec3 roundAbout(vec3 n) {
  float u = rnd(), a = 6.2831853 * rnd(), r = sqrt(u);
  vec3 t, b; frame(n, t, b);
  return normalize(t * r * cos(a) + b * r * sin(a) + n * sqrt(1.0 - u));
}
vec3 towardSun() {
  vec3 t, b; frame(sunWay, t, b);
  return normalize(sunWay + cone * (t * (2.0 * rnd() - 1.0) + b * (2.0 * rnd() - 1.0)));
}
vec3 sky(vec3 d) {
  float y = dot(d, up);
  return y > 0.0 ? mix(horizon, zenith, pow(y, 0.6)) : ground;
}
bool blocked(vec3 o, vec3 d) {
  uvec4 fi; vec3 fn, bc; float side, dist;
  return bvhIntersectFirstHit(bvh, o, d, fi, fn, bc, side, dist);
}
void main() {
  ivec2 ij = ivec2(gl_FragCoord.xy);
  vec4 P = texelFetch(points, ij, 0), N = texelFetch(normals, ij, 0), before = texelFetch(last, ij, 0);
  if (N.w == 0.0) { outColour = vec4(0.0); return; }
  h = (uint(ij.x) * 1973u + uint(ij.y) * 9277u + uint(seed) * 26699u) | 1u;
  rnd(); rnd();
  vec3 n = normalize(N.xyz), o = P.xyz + n * eps;
  vec4 r = vec4(vec3(ambient), 0.0);
  float c = dot(n, sunWay);
  if (c > 0.0 && !blocked(o, towardSun())) r.rgb += sunLight * c;
  vec3 d = roundAbout(n);
  uvec4 fi; vec3 fn, bc; float side, dist;
  if (!bvhIntersectFirstHit(bvh, o, d, fi, fn, bc, side, dist)) {
    r.rgb += sky(d); r.a = 1.0;
  } else {
    vec3 hp = o + d * dist, hn = normalize(fn);
    if (dot(hn, d) > 0.0) hn = -hn;
    vec3 albedo = textureSampleBarycoord(colours, bc, fi.xyz).rgb;
    vec3 e = vec3(ambient) + 0.5 * mix(horizon, zenith, 0.5) * max(0.0, dot(hn, up) * 0.5 + 0.5);
    float hc = dot(hn, sunWay);
    if (hc > 0.0 && !blocked(hp + hn * eps, towardSun())) e += sunLight * hc;
    r.rgb += bounce * albedo * e;
  }
  outColour = (before * pass + r) / (pass + 1.0);
}`;

// the corners as texels, and the room put together for the BVH, in the world's place
function gather(list) {
  let n = 0;
  for (const r of list) n += r.sides * original(r.mesh).geometry.attributes.position.count;
  const L = layout(n), points = new Float32Array(4 * L.width * L.height), normals = new Float32Array(4 * L.width * L.height);
  const spans = [], nm = new THREE.Matrix3(), p = new THREE.Vector3(), q = new THREE.Vector3();
  let at = 0;
  for (const r of list) {
    const g = original(r.mesh).geometry, pos = g.attributes.position, nor = g.attributes.normal;
    if (!nor) g.computeVertexNormals();
    const nr = g.attributes.normal, M = r.mesh.matrixWorld;
    nm.getNormalMatrix(M);
    spans.push({ mesh: r.mesh, at, count: pos.count, sides: r.sides });
    for (let s = 0; s < r.sides; s++) {
      const sign = s ? -1 : 1;
      for (let i = 0; i < pos.count; i++, at++) {
        p.fromBufferAttribute(pos, i).applyMatrix4(M);
        q.fromBufferAttribute(nr, i).applyMatrix3(nm).normalize().multiplyScalar(sign);
        points.set([p.x, p.y, p.z, 1], 4 * at);
        if (Number.isFinite(q.x)) normals.set([q.x, q.y, q.z, 1], 4 * at);
      }
    }
  }
  // the occluders: every triangle of what is lit but the glass
  let tris = 0;
  const parts = [];
  for (const r of list) {
    const g = original(r.mesh).geometry, mats = [].concat(original(r.mesh).material);
    const idx = g.index ? g.index.array : null, count = idx ? idx.length : g.attributes.position.count;
    const groups = g.groups.length ? g.groups : [{ start: 0, count, materialIndex: 0 }];
    const keep = groups.filter((gr) => solid(mats[gr.materialIndex] ?? mats[0]));
    parts.push({ g, idx, keep, M: r.mesh.matrixWorld });
    for (const gr of keep) tris += gr.count / 3;
  }
  const verts = parts.reduce((a, x) => a + x.g.attributes.position.count, 0);
  const pos = new Float32Array(3 * verts), col = new Float32Array(3 * verts), index = new Uint32Array(3 * tris);
  let v0 = 0, k = 0;
  for (const { g, idx, keep, M } of parts) {
    const P = g.attributes.position, C = g.attributes.color;
    for (let i = 0; i < P.count; i++) {
      p.fromBufferAttribute(P, i).applyMatrix4(M);
      pos.set([p.x, p.y, p.z], 3 * (v0 + i));
      if (C) col.set([C.getX(i), C.getY(i), C.getZ(i)], 3 * (v0 + i));
      else col.fill(0.7, 3 * (v0 + i), 3 * (v0 + i) + 3);
    }
    for (const gr of keep) for (let j = gr.start; j < gr.start + gr.count; j++) index[k++] = v0 + (idx ? idx[j] : j);
    v0 += P.count;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  return { L, points, normals, spans, geo, colours: new THREE.BufferAttribute(col, 3), tris };
}

function bake() {
  stop();
  if (!enabled) return;
  const list = receivers();
  if (!list.length) return;
  V.scene.updateMatrixWorld(true);
  const room = gather(list);
  if (!room.tris) return;
  const bvh = new MeshBVH(room.geo, { strategy: CENTER });
  const S = new MeshBVHUniformStruct(); S.updateFrom(bvh);
  const colours = new FloatVertexAttributeTexture(); colours.updateFrom(room.colours);
  const tex = (a) => { const t = new THREE.DataTexture(a, room.L.width, room.L.height, THREE.RGBAFormat, THREE.FloatType); t.needsUpdate = true; return t; };
  const points = tex(room.points), normals = tex(room.normals);
  const target = () => new THREE.WebGLRenderTarget(room.L.width, room.L.height, { type: THREE.FloatType, format: THREE.RGBAFormat,
    minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false, generateMipmaps: false });
  let a = target(), b = target();
  // the sun and up, in the world: the decor's sun turned with the room
  const g = decorGroup(), dm = g ? g.matrixWorld.elements : new THREE.Matrix4().elements;
  const sunLocal = g?.children.find((c) => c.isDirectionalLight)?.position.toArray() || [2, 5, 3];
  const box = new THREE.Box3().setFromBufferAttribute(room.geo.attributes.position);
  const size = box.getSize(new THREE.Vector3()).length();
  const mat = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: "void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }",
    fragmentShader: SHADER,
    uniforms: {
      bvh: { value: S }, colours: { value: colours }, points: { value: points }, normals: { value: normals }, last: { value: null },
      sunWay: { value: new THREE.Vector3(...sunWay(sunLocal, dm)) }, up: { value: new THREE.Vector3(...sunWay([0, 1, 0], dm)) },
      sunLight: { value: new THREE.Vector3(...BAKE.sunColour).multiplyScalar(BAKE.sun) },
      zenith: { value: new THREE.Vector3(...BAKE.zenith) }, horizon: { value: new THREE.Vector3(...BAKE.horizon) },
      ground: { value: new THREE.Vector3(...BAKE.ground) },
      cone: { value: BAKE.cone }, eps: { value: Math.max(1e-4, size * 2e-5) }, ambient: { value: BAKE.ambient },
      bounce: { value: BAKE.bounce }, pass: { value: 0 }, seed: { value: 0 },
    },
    depthTest: false, depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  const scene = new THREE.Scene(); scene.add(quad);
  const cam = new THREE.Camera();
  let pass = 0, k = 0, stopped = false;
  const free = () => {
    S.dispose(); colours.dispose(); points.dispose(); normals.dispose(); a.dispose(); b.dispose();
    mat.dispose(); quad.geometry.dispose(); room.geo.dispose(); bvh.geometry?.dispose?.();
  };
  job = { stop: () => { stopped = true; free(); } };
  state.passes = 0;
  const step = async () => {
    if (stopped) return;
    const R = V.renderer, [y0, y1] = band(k, room.L.height);
    mat.uniforms.last.value = a.texture; mat.uniforms.pass.value = pass; mat.uniforms.seed.value = pass + 1;
    b.scissor.set(0, y0, room.L.width, y1 - y0); b.scissorTest = true;
    const was = R.getRenderTarget(), clear = R.autoClear;
    R.autoClear = false;
    R.setRenderTarget(b);
    R.render(scene, cam);
    R.setRenderTarget(was);
    R.autoClear = clear;
    say(progress(pass, k + 1, passes));
    if (++k < BAKE.band) return requestAnimationFrame(step);
    k = 0; pass++; state.passes = pass;
    [a, b] = [b, a];
    if (pass < passes) return requestAnimationFrame(step);
    // done: read back once, each mesh its corners' light
    const out = new Float32Array(4 * room.L.width * room.L.height);
    if (R.readRenderTargetPixelsAsync) await R.readRenderTargetPixelsAsync(a, 0, 0, room.L.width, room.L.height, out);
    else R.readRenderTargetPixels(a, 0, 0, room.L.width, room.L.height, out);
    if (stopped) return;
    kept.clear();
    for (const s of room.spans) {
      if (!s.mesh.parent) continue;
      const front = pack(out, s.at, s.count), back = s.sides > 1 ? pack(out, s.at + s.count, s.count) : front;
      kept.set(key(s.mesh), { bake: front, bake2: back });
      light(s.mesh, front, back);
    }
    state.baked = room.spans.length; state.at = performance.now();
    say(null);
    job = null; free();
    V.redraw();
  };
  requestAnimationFrame(step);
}
function stop() { if (job) { job.stop(); job = null; } say(null); }

// only a drawn room (a filmed room's splats keep the light they were filmed in)
addEventListener("roomchange", () => { stop(); kept.clear(); state.baked = 0; button.hidden = !window.house?.shell?.(); });
addEventListener("decorchange", () => { if (enabled) reuse(); });
addEventListener("roomplaced", () => { if (enabled) reuse(); });
button.onclick = () => { if (!job) bake(); };

window.bakelight = {
  state: () => ({ ...state, working: !!job }),
  // (tests: fewer passes; off shows the lamps' light again)
  passes: (n) => { if (n) passes = n; return passes; },
  enable: (on) => {
    enabled = !!on;
    if (!enabled) { stop(); for (const { mesh } of receivers()) unlight(mesh); } else reuse();
    V.redraw();
  },
  bake,
};
