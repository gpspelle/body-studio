// Tattoo & pose: a panel at the left edge (a sheet at the bottom on a phone).
// The body gets a skeleton once (rig.py, GET /api/rig); its splats are skinned with Spark's dual
// quaternion skinning. Dots on the joints can be dragged, within each joint's range of motion.
// A tattoo image is laid on the skin itself (pose.js SkinSurface), skinned with the same
// weights and blend as the splats, and drawn after them as ink: it darkens the skin under it,
// and whatever is in front of it hides it. Splats don't write depth (moved splats are sorted
// late, so their soft edges would punch holes), so the skin's depth comes from a stand-in: a
// dot per opaque splat, skinned on the GPU with the same blend, drawn only into the depth
// buffer. Design and sources: docs/tattoo.md.
import * as THREE from "three";
import { SplatSkinning } from "@sparkjsdev/spark";
import { Skeleton, SkinSurface, SkinWeights, SurfaceMap, dualQuats, skinPoint, v3 } from "/static/pose.js";

const $ = (id) => document.getElementById(id);
const t = window.t;
const app = window.bodyApp;
const V = app.viewer;

// a dot on joint X turns the joint that moves it (its parent)
const HANDLES = { chest: "spine", neck: "chest", head: "neck", head_end: "head" };
for (const s of ["l", "r"]) {
  Object.assign(HANDLES, { ["shoulder_" + s]: "clavicle_" + s, ["elbow_" + s]: "shoulder_" + s, ["wrist_" + s]: "elbow_" + s,
                           ["hand_end_" + s]: "wrist_" + s, ["knee_" + s]: "hip_" + s, ["ankle_" + s]: "knee_" + s,
                           ["toe_end_" + s]: "ankle_" + s });
}
// poses in the joints' own terms (degrees from the anatomical position); anything not named
// keeps the scan's pose
const both = (j, a) => ({ [j + "_l"]: a, [j + "_r"]: a });
const PRESETS = {
  rest: {},
  armsUp: { ...both("shoulder", { flex: 0, side: 165, twist: 0 }), ...both("elbow", { flex: 8, twist: 0 }) },
  flex: { ...both("shoulder", { flex: 0, side: 90, twist: -90 }), ...both("elbow", { flex: 115, twist: 0 }),
          ...both("wrist", { flex: 20, side: 0 }) },
  walk: { shoulder_l: { flex: -22, side: 8 }, shoulder_r: { flex: 24, side: 8 }, elbow_l: { flex: 12 }, elbow_r: { flex: 35 },
          hip_l: { flex: 24, side: 2 }, knee_l: { flex: 8 }, hip_r: { flex: -12, side: 2 }, knee_r: { flex: 28 },
          ankle_r: { flex: -12 }, chest: { flex: 0, side: 0, twist: -6 } },
  sit: { ...both("hip", { flex: 88, side: 6, twist: 0 }), ...both("knee", { flex: 88 }), ...both("ankle", { flex: 0 }),
         ...both("shoulder", { flex: 22, side: 10, twist: 0 }), ...both("elbow", { flex: 75, twist: 40 }), spine: { flex: 8 } },
};
const HIT_PX = matchMedia("(pointer: coarse)").matches ? 26 : 16;

let S = null;            // the body being posed: rig, skeleton, weights, splats, tattoos…
let loading = null;      // body file whose rig is on its way
let pending = null;      // a tattoo image waiting for a tap on the body
let drag = null;

// ---------------------------------------------------------------- panel
const isPhone = () => innerWidth <= 600;
function setOpen(open) {
  $("studio").hidden = !open;
  $("studioBtn").setAttribute("aria-expanded", String(open));
  document.body.classList.toggle("with-studio", open);
  if (open) {
    V.controls.autoRotate = false;
    if (isPhone() && !$("progress").hidden) $("closeProgress").click();
    dispatchEvent(new CustomEvent("panelopen", { detail: "studio" }));
    load();
  }
  if (S) { S.handles.visible = open; S.lines.visible = open; for (const tt of S.tattoos) tt.outline.visible = open && tt === S.selected; }
  app.reframe();
}
$("studioBtn").onclick = () => setOpen($("studio").hidden);
$("closeStudio").onclick = () => setOpen(false);
addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("studio").hidden) setOpen(false); });
addEventListener("panelopen", (e) => { if (e.detail !== "studio" && isPhone() && !$("studio").hidden) setOpen(false); });
$("progressBtn").addEventListener("click", () => { if (isPhone() && !$("progress").hidden) setOpen(false); });

function status(text) { $("studioStatus").textContent = text || ""; }

// ---------------------------------------------------------------- loading the rig
async function load() {
  const file = V.file();
  if (!file || (S && S.file === file) || loading === file) return;
  loading = file;
  $("studioBody").hidden = true;
  status(t("studio.finding"));
  try {
    let rig = null;
    for (;;) {
      const r = await fetch("/api/rig?body=" + encodeURIComponent(file));
      if (V.file() !== file) return;
      if (r.status === 202) { await new Promise((ok) => setTimeout(ok, 1000)); continue; }
      const d = await r.json();
      if (!r.ok) { status(t("studio.failed", { advice: t("rig.err." + (d.code || "shape")) })); return; }
      rig = d;
      break;
    }
    const mesh = V.mesh();
    await mesh.initialized;
    if (V.file() !== file) return;
    status(t("studio.preparing"));
    await new Promise((ok) => requestAnimationFrame(() => setTimeout(ok)));   // let the status show
    setup(rig, mesh, file);
    status("");
    $("studioBody").hidden = false;
    await restore();
  } finally {
    if (loading === file) loading = null;
  }
}

function setup(rig, mesh, file) {
  teardown();
  const sk = new Skeleton(rig), weights = new SkinWeights(rig), map = new SurfaceMap(rig);
  const n = mesh.numSplats;
  const centres = new Float32Array(n * 3), bones = new Uint8Array(n * 4), w = new Uint8Array(n * 4);
  const opaque = [], radius = new Float32Array(n);
  mesh.forEachSplat((i, c, sc, _q, opacity) => {
    centres[i * 3] = c.x; centres[i * 3 + 1] = c.y; centres[i * 3 + 2] = c.z;
    radius[i] = Math.cbrt(sc.x * sc.y * sc.z);
    if (opacity >= 0.3) opaque.push(i);
    weights.at(c.x, c.y, c.z, bones, w, i);
  });
  const surface = new SkinSurface(rig, centres, opaque);
  const skinning = new SplatSkinning({ mesh, numSplats: n, numBones: rig.joints.length });
  const vb = new THREE.Vector4(), vw = new THREE.Vector4();
  for (let i = 0; i < n; i++) {
    vb.set(bones[i * 4], bones[i * 4 + 1], bones[i * 4 + 2], bones[i * 4 + 3]);
    vw.set(w[i * 4] / 255, w[i * 4 + 1] / 255, w[i * 4 + 2] / 255, w[i * 4 + 3] / 255);
    skinning.setSplatBones(i, vb, vw);
  }
  skinning.skinTexture.needsUpdate = true;
  const qi = new THREE.Quaternion(), zero = new THREE.Vector3();
  for (let b = 0; b < rig.joints.length; b++) skinning.setRestQuatPos(b, qi, zero);
  mesh.skinning = skinning;
  mesh.updateGenerator();

  const handleJoints = Object.keys(HANDLES).filter((h) => sk.index(h) >= 0);
  const hp = new THREE.BufferGeometry();
  hp.setAttribute("position", new THREE.BufferAttribute(new Float32Array(handleJoints.length * 3), 3));
  hp.setAttribute("color", new THREE.BufferAttribute(new Float32Array(handleJoints.length * 3), 3));
  const handles = new THREE.Points(hp, new THREE.PointsMaterial({
    size: isPhone() ? 16 : 12, sizeAttenuation: false, vertexColors: true, map: dotTexture(),
    transparent: true, alphaTest: 0.4, depthTest: false, depthWrite: false }));
  handles.renderOrder = 20; handles.frustumCulled = false;
  const pairs = sk.parents.map((p, j) => [p, j]).filter(([p]) => p >= 0);
  const lg = new THREE.BufferGeometry();
  lg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pairs.length * 6), 3));
  const lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthTest: false }));
  lines.renderOrder = 19; lines.frustumCulled = false;
  const skin = skinDepth(Uint32Array.from(opaque), centres, radius, bones, w, rig.height, rig.joints.length);
  V.holder.add(lines, handles, skin);

  S = { file, rig, sk, weights, map, surface, mesh, skinning, n, centres, bones, w, opaque: Uint32Array.from(opaque),
        posed: null, posedOk: false, dq: null, skin, handles, handleJoints, lines, pairs, tattoos: [], selected: null,
        joint: null, heightCm: 170, nextId: 1 };
  handles.visible = lines.visible = !$("studio").hidden;
  presetsUI();
  applyPose();
  window.tattooStudio.ready = true;
  // the Clothes section (wardrobe.js) dresses this body with the same weights and pose
  dispatchEvent(new CustomEvent("studioready", { detail: { file, rig, weights, mesh, centres, transforms: sk.transforms() } }));
}

function teardown() {
  if (!S) return;
  for (const tt of S.tattoos) disposeTattoo(tt);
  V.holder.remove(S.handles, S.lines, S.skin);
  S.handles.geometry.dispose(); S.lines.geometry.dispose(); S.skin.geometry.dispose(); S.skin.material.dispose();
  if (S.mesh && S.mesh.skinning === S.skinning) { S.mesh.skinning = null; S.mesh.updateGenerator(); }
  S = null; pending = null; drag = null;
  window.tattooStudio.ready = false;
  dispatchEvent(new Event("studiogone"));
}

addEventListener("bodyshown", () => {
  if (S && S.file !== V.file()) { teardown(); $("studioBody").hidden = true; }
  if (!$("studio").hidden) load();
});

function dotTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d");
  g.beginPath(); g.arc(32, 32, 26, 0, 2 * Math.PI);
  g.fillStyle = "#fff"; g.fill();
  g.lineWidth = 8; g.strokeStyle = "rgba(0,0,0,0.55)"; g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// The skin's depth, for hiding ink behind the body: a round dot per opaque splat, its size the
// splat's, moved by the same dual quaternion blend as Spark's (pose.js skinPoint).
const SKIN_VERTEX = `
uniform vec4 dq[2 * BONES];
uniform float pixels;
uniform float push;
attribute vec4 skinBones;
attribute vec4 skinWeights;
attribute float size;
void main() {
  vec4 r = vec4(0.0), d = vec4(0.0);
  for (int i = 0; i < 4; i++) {
    float w = skinWeights[i];
    if (w <= 0.0) continue;
    int b = int(skinBones[i] + 0.5);
    vec4 rb = dq[2 * b], db = dq[2 * b + 1];
    if (i > 0 && dot(r, rb) < 0.0) w = -w;
    r += w * rb; d += w * db;
  }
  float n = length(r);
  r /= n; d /= n;
  vec3 t = 2.0 * (r.w * d.xyz - d.w * r.xyz + cross(r.xyz, d.xyz));
  vec3 p = position + 2.0 * cross(r.xyz, cross(r.xyz, position) + r.w * position) + t;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  // a dot is a flat disc facing the eye at its splat's depth: where the skin turns away (the flanks,
  // under the arms) its near edge would stand in front of ink lying on the skin. Pushed back a
  // little, it hides only what something else (an arm, the other side of the body) covers.
  vec4 back = vec4(mv.xyz * (1.0 + push / length(mv.xyz)), 1.0);
  gl_Position = projectionMatrix * back;
  gl_PointSize = max(1.0, size * projectionMatrix[1][1] * pixels / -mv.z);
}`;
const SKIN_FRAGMENT = `
void main() {
  if (length(gl_PointCoord - 0.5) > 0.5) discard;
  gl_FragColor = vec4(0.0);
}`;
function skinDepth(opaque, centres, radius, bones, w, height, numBones) {
  const n = opaque.length;
  const pos = new Float32Array(n * 3), b = new Float32Array(n * 4), wt = new Float32Array(n * 4), size = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const i = opaque[k];
    pos.set(centres.subarray(i * 3, i * 3 + 3), k * 3);
    for (let m = 0; m < 4; m++) { b[k * 4 + m] = bones[i * 4 + m]; wt[k * 4 + m] = w[i * 4 + m] / 255; }
    size[k] = Math.min(0.012 * height, Math.max(0.004 * height, 3 * radius[i]));   // a diameter
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("skinBones", new THREE.BufferAttribute(b, 4));
  geo.setAttribute("skinWeights", new THREE.BufferAttribute(wt, 4));
  geo.setAttribute("size", new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { dq: { value: Array.from({ length: 2 * numBones }, () => new THREE.Vector4(0, 0, 0, 1)) }, pixels: { value: 400 }, push: { value: 0.012 * height } },
    defines: { BONES: numBones }, vertexShader: SKIN_VERTEX, fragmentShader: SKIN_FRAGMENT,
    colorWrite: false, depthWrite: true, depthTest: true, transparent: true,
  });
  const pts = new THREE.Points(geo, mat);
  pts.renderOrder = 4;                       // after the splats, before the ink
  pts.frustumCulled = false;
  pts.visible = false;                       // only while there is ink to hide
  pts.onBeforeRender = (renderer) => { mat.uniforms.pixels.value = renderer.getDrawingBufferSize(new THREE.Vector2()).y / 2; };
  return pts;
}

// ---------------------------------------------------------------- pose
const ACCENT = new THREE.Color(0x2f5bd3), WHITE = new THREE.Color(0xffffff);
function applyPose() {
  const { sk, skinning } = S;
  sk.solve();
  const tr = sk.transforms();
  const qv = new THREE.Quaternion(), tv = new THREE.Vector3();
  tr.forEach(({ q, t: tt }, b) => skinning.setBoneQuatPos(b, qv.set(q[0], q[1], q[2], q[3]), tv.set(tt[0], tt[1], tt[2])));
  skinning.updateBones();
  dispatchEvent(new CustomEvent("posed", { detail: tr }));
  S.dq = dualQuats(tr);
  S.posedOk = false;
  S.skin.material.uniforms.dq.value.forEach((v, k) => v.fromArray(S.dq, k * 4));
  S.skin.visible = S.tattoos.length > 0;
  const hp = S.handles.geometry.attributes.position, hc = S.handles.geometry.attributes.color;
  S.handleJoints.forEach((h, i) => {
    hp.setXYZ(i, ...sk.P[sk.index(h)]);
    const c = HANDLES[h] === S.joint ? ACCENT : WHITE;
    hc.setXYZ(i, c.r, c.g, c.b);
  });
  hp.needsUpdate = hc.needsUpdate = true;
  const lp = S.lines.geometry.attributes.position;
  S.pairs.forEach(([p, j], i) => { lp.setXYZ(2 * i, ...sk.P[p]); lp.setXYZ(2 * i + 1, ...sk.P[j]); });
  lp.needsUpdate = true;
  for (const tt of S.tattoos) skinTattoo(tt);
  save();
}

function presetsUI() {
  $("presets").replaceChildren(...Object.keys(PRESETS).map((name) => {
    const b = document.createElement("button");
    b.textContent = t("pose.p." + name);
    b.onclick = () => { S.sk.setPose(PRESETS[name]); applyPose(); jointUI(); };
    return b;
  }));
}

function selectJoint(name) {
  S.joint = name;
  applyPose();
  jointUI();
}

function jointUI() {
  const j = S && S.joint ? S.sk.index(S.joint) : -1;
  $("jointEdit").hidden = j < 0;
  if (j < 0) return;
  const d = S.sk.defs[j], a = S.sk.angles[j];
  $("jointName").textContent = t("joint." + S.joint);
  const rows = [];
  ["flex", "side", "twist"].forEach((key, k) => {
    const label = d.labels[k];
    const [lo, hi] = d[key];
    if (!label || hi - lo < 1 || (key === "side" && d.hinge)) return;
    const row = document.createElement("label");
    const name = document.createElement("span"), input = document.createElement("input"), out = document.createElement("output");
    name.textContent = t("dof." + label);
    Object.assign(input, { type: "range", min: Math.floor(lo), max: Math.ceil(hi), step: 1, value: a[key] });
    input.dataset.key = key;
    out.textContent = Math.round(a[key]) + "°";
    input.oninput = () => {
      S.sk.set(j, { [key]: +input.value });
      out.textContent = Math.round(S.sk.angles[j][key]) + "°";
      applyPose();
    };
    row.append(name, input, out);
    rows.push(row);
  });
  $("jointSliders").replaceChildren(...rows);
}
function refreshJointSliders() {
  if (!S || !S.joint) return;
  const a = S.sk.angles[S.sk.index(S.joint)];
  for (const input of $("jointSliders").querySelectorAll("input")) {
    input.value = a[input.dataset.key];
    input.nextElementSibling.textContent = Math.round(a[input.dataset.key]) + "°";
  }
}
$("jointReset").onclick = () => {
  const j = S.sk.index(S.joint);
  S.sk.set(j, { ...S.sk.restAngles[j] });
  applyPose(); refreshJointSliders();
};
$("poseReset").onclick = () => { S.sk.reset(); applyPose(); refreshJointSliders(); };

// ---------------------------------------------------------------- picking
const ray = new THREE.Raycaster();
function pointerRay(e) {
  const r = V.canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, V.camera);
  const inv = V.holder.matrixWorld.clone().invert();
  const o = ray.ray.origin.clone().applyMatrix4(inv);
  const d = ray.ray.direction.clone().transformDirection(inv);
  return { o: [o.x, o.y, o.z], d: [d.x, d.y, d.z], world: ray.ray };
}

function nearestHandle(e) {
  const r = V.canvas.getBoundingClientRect();
  const p = new THREE.Vector3();
  let best = null, bd = HIT_PX;
  S.handleJoints.forEach((h) => {
    p.set(...S.sk.P[S.sk.index(h)]).applyMatrix4(V.holder.matrixWorld).project(V.camera);
    if (p.z > 1) return;
    const x = (p.x + 1) / 2 * r.width + r.left, y = (1 - p.y) / 2 * r.height + r.top;
    const d = Math.hypot(x - e.clientX, y - e.clientY);
    if (d < bd) { bd = d; best = h; }
  });
  return best;
}

// the splat under the pointer, in the current pose: its index, and where it is now and at rest
function hitBody(e) {
  const { o, d } = pointerRay(e);
  if (!S.posedOk) {
    const n = S.opaque.length;
    if (!S.posed) S.posed = new Float32Array(n * 3);
    const out = [0, 0, 0], p = [0, 0, 0];
    for (let k = 0; k < n; k++) {
      const i = S.opaque[k];
      p[0] = S.centres[i * 3]; p[1] = S.centres[i * 3 + 1]; p[2] = S.centres[i * 3 + 2];
      skinPoint(p, S.bones, S.w, S.dq, out, i);
      S.posed[k * 3] = out[0]; S.posed[k * 3 + 1] = out[1]; S.posed[k * 3 + 2] = out[2];
    }
    S.posedOk = true;
  }
  const r2 = (0.008 * S.rig.height) ** 2, P = S.posed;
  let best = -1, bt = Infinity;
  for (let k = 0; k < S.opaque.length; k++) {
    const x = P[k * 3] - o[0], y = P[k * 3 + 1] - o[1], z = P[k * 3 + 2] - o[2];
    const along = x * d[0] + y * d[1] + z * d[2];
    if (along <= 0 || along >= bt) continue;
    if (x * x + y * y + z * z - along * along < r2) { bt = along; best = k; }
  }
  if (best < 0) return null;
  const i = S.opaque[best];
  return { index: i, rest: [S.centres[i * 3], S.centres[i * 3 + 1], S.centres[i * 3 + 2]],
           posed: [P[best * 3], P[best * 3 + 1], P[best * 3 + 2]] };
}

// a tattoo's place: the point of the body (at rest) it is centred on, and the bone whose axis its
// top follows (the trunk's or a leg's when the bone is part of one, so it doesn't tilt from one
// vertebra to the next)
function anchorAt(rest) {
  const b = new Uint8Array(4), w = new Uint8Array(4);
  S.weights.at(rest[0], rest[1], rest[2], b, w);
  let bone = S.sk.names[b[0]];
  const region = (S.rig.regions || {})[bone];
  if (region && S.map.maps[region]) bone = region;
  if (!S.map.maps[bone]) bone = Object.keys(S.map.maps).find((k) => S.map.maps[k]);
  return { bone, at: [rest[0], rest[1], rest[2]] };
}

// the way the image's top points: along the bone, toward the head
function upOf(bone) {
  const m = S.map.maps[bone];
  return v3.scale(m.axis, v3.dot(m.axis, S.rig.frame.up) >= 0 ? 1 : -1);
}

function onDown(e) {
  if (!S || $("studio").hidden || e.target !== V.canvas || e.button > 0) return;
  let hit = null;
  if (pending) {
    hit = hitBody(e);
    if (!hit) return;
    const tt = addTattoo(pending, anchorAt(hit.rest));
    pending = null;
    select(tt);
    drag = { kind: "tattoo", tattoo: tt };
  } else {
    const h = nearestHandle(e);
    if (h) {
      selectJoint(HANDLES[h]);
      drag = { kind: "joint", handle: h, pivot: HANDLES[h] };
    } else {
      hit = hitBody(e);
      const tt = hit && tattooAt(hit.rest);
      if (!tt) return;                      // the camera turns as usual
      select(tt);
      drag = { kind: "tattoo", tattoo: tt };
    }
  }
  e.stopImmediatePropagation(); e.preventDefault();
  V.controls.enabled = false;
  V.canvas.setPointerCapture?.(e.pointerId);
}

function onMove(e) {
  if (!drag) return;
  e.stopImmediatePropagation();
  if (drag.kind === "joint") {
    const sk = S.sk, j = sk.index(drag.handle), pivot = sk.index(drag.pivot);
    const handle = new THREE.Vector3(...sk.P[j]).applyMatrix4(V.holder.matrixWorld);
    const normal = V.camera.getWorldDirection(new THREE.Vector3());
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, handle);
    const { world } = pointerRay(e);
    const target = world.intersectPlane(plane, new THREE.Vector3());
    if (!target) return;
    target.applyMatrix4(V.holder.matrixWorld.clone().invert());
    sk.aim(pivot, v3.sub([target.x, target.y, target.z], sk.P[pivot]));
    applyPose();
    refreshJointSliders();
  } else {
    const hit = hitBody(e);
    if (!hit) return;
    // laid again once a frame at most, wherever the pointer is by then
    const first = !drag.to;
    drag.to = hit.rest;
    if (first) {
      const d = drag;
      requestAnimationFrame(() => {
        if (!S || !S.tattoos.includes(d.tattoo)) return;
        Object.assign(d.tattoo, anchorAt(d.to));
        d.to = null;
        wrapTattoo(d.tattoo);
        save();
      });
    }
  }
}

function onUp() {
  if (!drag) return;
  drag = null;
  V.controls.enabled = true;
}
addEventListener("pointerdown", onDown, { capture: true });
addEventListener("pointermove", onMove, { capture: true });
addEventListener("pointerup", onUp, { capture: true });
addEventListener("pointercancel", onUp, { capture: true });

// ---------------------------------------------------------------- tattoos
// ink on skin that clothes cover isn't drawn, point by point (the clothes are splats, which don't
// hide it)
function underClothes() {
  if (S) S.tattoos.forEach(clothe);
}
function clothe(tt) {
  const a = tt.mesh.geometry.attributes.clothed;
  a.array.set(window.wardrobe ? window.wardrobe.under(tt.restPos) : new Uint8Array(a.count));
  a.needsUpdate = true;
}
addEventListener("wearchange", underClothes);

const unitsPerCm = () => S.rig.height / S.heightCm;

// An image as ink: pictures drawn on white (most tattoo designs) turn their white transparent,
// and the picture is cropped to what is drawn.
async function inkImage(file) {
  const url = typeof file === "string" ? file : URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale));
    const c = document.createElement("canvas");
    c.width = w; c.height = h;
    const g = c.getContext("2d");
    g.drawImage(img, 0, 0, w, h);
    const data = g.getImageData(0, 0, w, h), px = data.data;
    let opaque = true;
    for (let i = 3; i < px.length; i += 4) if (px[i] < 250) { opaque = false; break; }
    if (opaque) {
      for (let i = 0; i < px.length; i += 4) {
        const r = px[i] / 255, gg = px[i + 1] / 255, b = px[i + 2] / 255;
        const a = Math.min(1, Math.max(0, (1 - Math.min(r, gg, b) - 0.04) / 0.9));   // white -> clear
        const ink = (v) => (a > 0.01 ? Math.min(1, Math.max(0, (v - (1 - a)) / a)) : 0);
        px[i] = ink(r) * 255; px[i + 1] = ink(gg) * 255; px[i + 2] = ink(b) * 255; px[i + 3] = a * 255;
      }
    }
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3] > 12) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    }
    if (x1 < 0) throw new Error("empty");
    g.putImageData(data, 0, 0);
    const out = document.createElement("canvas");
    out.width = x1 - x0 + 1; out.height = y1 - y0 + 1;
    out.getContext("2d").drawImage(c, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
    return out;
  } finally {
    if (typeof file !== "string") URL.revokeObjectURL(url);
  }
}

const INK_VERTEX = `
uniform float bias;
attribute float clothed;
varying vec2 vUv;
varying float vClothed;
void main() {
  vUv = uv;
  vClothed = clothed;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  mv.xyz *= max(0.0, 1.0 - bias / length(mv.xyz));      // a little toward the eye: wins against the skin's own splats
  gl_Position = projectionMatrix * mv;
}`;
const INK_FRAGMENT = `
uniform sampler2D map;
uniform float ink;
varying vec2 vUv;
varying float vClothed;
void main() {
  if (vClothed > 0.5) discard;              // under clothes (the clothes are splats: they don't hide it)
  vec4 c = texture2D(map, vUv);
  float a = c.a * ink;
  if (a < 0.02) discard;
  // ink sits under the skin: it multiplies what is there, and black ink reads as a deep blue-grey
  vec3 pigment = vec3(0.07, 0.08, 0.10) + 0.88 * c.rgb;
  gl_FragColor = vec4(mix(vec3(1.0), pigment, a), 1.0);
}`;

function addTattoo(canvas, anchor, opts = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.ShaderMaterial({
    uniforms: { map: { value: tex }, ink: { value: opts.ink ?? 0.9 }, bias: { value: 0.006 * S.rig.height } },
    vertexShader: INK_VERTEX, fragmentShader: INK_FRAGMENT,
    transparent: true, depthTest: true, depthWrite: false, side: THREE.DoubleSide,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.DstColorFactor, blendDst: THREE.ZeroFactor,
  });
  const geo = new THREE.BufferGeometry();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = 5; mesh.frustumCulled = false;
  const outline = new THREE.LineSegments(new THREE.BufferGeometry(),
    new THREE.LineBasicMaterial({ color: 0x2f5bd3, transparent: true, opacity: 0.7, depthTest: false }));
  outline.renderOrder = 18; outline.frustumCulled = false; outline.visible = false;
  V.holder.add(mesh, outline);
  const tt = { id: S.nextId++, canvas, tex, mesh, outline, ...anchor,
               widthCm: opts.widthCm ?? 10, angle: opts.angle ?? 0, ink: opts.ink ?? 0.9 };
  S.tattoos.push(tt);
  S.skin.visible = true;
  wrapTattoo(tt);
  tattooList();
  save();
  return tt;
}

const NX = 48;
function wrapTattoo(tt) {
  const width = tt.widthCm * unitsPerCm();
  const aspect = tt.canvas.height / tt.canvas.width;
  const ny = Math.max(8, Math.min(96, Math.round(NX * aspect)));
  const g = S.surface.wrap({ at: tt.at, up: upOf(tt.bone), width, height: width * aspect, angle: tt.angle,
                             lift: 0.001 * S.rig.height }, NX, ny);
  const count = NX * ny;
  tt.grid = g;
  tt.restPos = g.positions;
  tt.skinB = new Uint8Array(count * 4); tt.skinW = new Uint8Array(count * 4);
  for (let k = 0; k < count; k++) {
    if (g.valid[k]) S.weights.at(g.positions[k * 3], g.positions[k * 3 + 1], g.positions[k * 3 + 2], tt.skinB, tt.skinW, k);
  }
  const geo = tt.mesh.geometry;
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(count * 3), 3));
  geo.setAttribute("uv", new THREE.BufferAttribute(g.uvs, 2));
  geo.setAttribute("clothed", new THREE.BufferAttribute(new Float32Array(count), 1));
  geo.setIndex(new THREE.BufferAttribute(g.index, 1));
  // the outline: the border of the grid, where it is on the body (no line across a gap)
  const ring = [];
  for (let i = 0; i < NX; i++) ring.push(i);
  for (let j = 1; j < ny; j++) ring.push(j * NX + NX - 1);
  for (let i = NX - 2; i >= 0; i--) ring.push((ny - 1) * NX + i);
  for (let j = ny - 2; j >= 0; j--) ring.push(j * NX);
  tt.ring = [];
  for (let i = 0; i + 1 < ring.length; i++) if (g.valid[ring[i]] && g.valid[ring[i + 1]]) tt.ring.push(ring[i], ring[i + 1]);
  tt.outline.geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(tt.ring.length * 3), 3));
  clothe(tt);
  skinTattoo(tt);
}

function skinTattoo(tt) {
  const g = tt.grid, pos = tt.mesh.geometry.attributes.position, out = [0, 0, 0], p = [0, 0, 0];
  for (let k = 0; k < g.valid.length; k++) {
    if (!g.valid[k]) continue;
    p[0] = tt.restPos[k * 3]; p[1] = tt.restPos[k * 3 + 1]; p[2] = tt.restPos[k * 3 + 2];
    skinPoint(p, tt.skinB, tt.skinW, S.dq, out, k);
    pos.setXYZ(k, out[0], out[1], out[2]);
  }
  pos.needsUpdate = true;
  tt.mesh.geometry.computeBoundingSphere();
  const op = tt.outline.geometry.attributes.position;
  tt.ring.forEach((k, i) => op.setXYZ(i, pos.getX(k), pos.getY(k), pos.getZ(k)));
  op.needsUpdate = true;
}

function tattooAt(rest) {
  let best = null, bd = Infinity;
  for (const tt of S.tattoos) {
    const d = v3.len(v3.sub(tt.at, rest));
    const reach = 0.6 * tt.widthCm * unitsPerCm() * Math.max(1, tt.canvas.height / tt.canvas.width);
    if (d < reach && d < bd) { bd = d; best = tt; }
  }
  return best;
}

function select(tt) {
  if (S.selected && S.selected !== tt) S.selected.outline.visible = false;
  S.selected = tt;
  if (tt) tt.outline.visible = !$("studio").hidden;
  tattooList();
}

function disposeTattoo(tt) {
  V.holder.remove(tt.mesh, tt.outline);
  tt.mesh.geometry.dispose(); tt.mesh.material.dispose(); tt.tex.dispose(); tt.outline.geometry.dispose();
}

function tattooList() {
  $("tatList").replaceChildren(...S.tattoos.map((tt, i) => {
    const b = document.createElement("button");
    b.textContent = t("tat.name", { n: i + 1 });
    b.classList.toggle("on", tt === S.selected);
    b.onclick = () => select(tt);
    return b;
  }));
  const tt = S.selected;
  $("tatEdit").hidden = !tt;
  $("tatHint").textContent = pending ? t("tat.place") : tt ? t("tat.drag") : "";
  if (tt) {
    $("tatSize").value = tt.widthCm; $("tatSizeOut").textContent = tt.widthCm.toLocaleString(window.i18n.lang) + " cm";
    $("tatAngle").value = tt.angle; $("tatAngleOut").textContent = Math.round(tt.angle) + "°";
    $("tatInk").value = tt.ink; $("tatInkOut").textContent = Math.round(tt.ink * 100) + "%";
  }
  $("tatHeight").value = S.heightCm;
}

$("tatPick").onchange = async (e) => {
  const f = e.target.files[0];
  e.target.value = "";
  if (!f || !S) return;
  try {
    pending = await inkImage(f);
    select(null);
  } catch {
    $("tatHint").textContent = t("tat.badImage");
  }
};
$("tatSize").oninput = () => { const tt = S.selected; tt.widthCm = +$("tatSize").value; wrapTattoo(tt); tattooList(); save(); };
$("tatAngle").oninput = () => { const tt = S.selected; tt.angle = +$("tatAngle").value; wrapTattoo(tt); tattooList(); save(); };
$("tatInk").oninput = () => { const tt = S.selected; tt.ink = +$("tatInk").value; tt.mesh.material.uniforms.ink.value = tt.ink; tattooList(); save(); };
$("tatRemove").onclick = () => {
  const tt = S.selected;
  S.tattoos.splice(S.tattoos.indexOf(tt), 1);
  S.skin.visible = S.tattoos.length > 0;
  disposeTattoo(tt);
  S.selected = null;
  tattooList(); save();
};
$("tatHeight").onchange = () => {
  const v = +$("tatHeight").value;
  if (!(v >= 80 && v <= 250)) { $("tatHeight").value = S.heightCm; return; }
  S.heightCm = v;
  for (const tt of S.tattoos) wrapTattoo(tt);
  tattooList(); save();
};
addEventListener("langchange", () => { if (S) { presetsUI(); jointUI(); tattooList(); } });

// ---------------------------------------------------------------- kept in this browser
// Pose, height and tattoos (with their images) per body, in IndexedDB. Nothing leaves the computer.
const DB = "body-studio-tattoo";
function idb() {
  return new Promise((ok, fail) => {
    try {
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore("bodies");
      r.onsuccess = () => ok(r.result);
      r.onerror = () => fail(r.error);
    } catch (e) { fail(e); }
  });
}
let saveTimer = null;
function save() {
  if (!S || !S.restored) return;            // (setting up poses the body before what was kept is back)
  const file = S.file;
  const record = { heightCm: S.heightCm, pose: S.sk.pose(),
                   tattoos: S.tattoos.map((tt) => ({ image: tt.canvas.toDataURL("image/png"), bone: tt.bone, at: tt.at,
                                                     widthCm: tt.widthCm, angle: tt.angle, ink: tt.ink })) };
  clearTimeout(saveTimer);
  window.tattooStudio.saving = true;
  saveTimer = setTimeout(async () => {
    try {
      const db = await idb();
      const tx = db.transaction("bodies", "readwrite");
      tx.objectStore("bodies").put(record, file);
      await new Promise((ok) => { tx.oncomplete = tx.onerror = tx.onabort = ok; });
    } catch {}
    window.tattooStudio.saving = false;
  }, 400);
}
async function restore() {
  let rec = null;
  try {
    const db = await idb();
    rec = await new Promise((ok) => {
      const r = db.transaction("bodies").objectStore("bodies").get(S.file);
      r.onsuccess = () => ok(r.result); r.onerror = () => ok(null);
    });
  } catch {}
  if (!S) return;
  if (rec) {
    S.heightCm = rec.heightCm || S.heightCm;
    for (const d of rec.tattoos || []) {
      if (!S.map.maps[d.bone]) continue;
      // saved before tattoos were laid on the skin itself: a place on the bone's surface map
      const at = d.at || (d.t !== undefined && S.map.point(d.bone, d.t, d.theta));
      if (!at) continue;
      try { addTattoo(await inkImage(d.image), { bone: d.bone, at }, d); } catch {}
    }
    S.sk.setPose(rec.pose || {});
  } else {
    const person = await personHeight();
    if (!S) return;
    if (person) S.heightCm = person;
  }
  S.restored = true;
  applyPose();
  tattooList();
}

// the height of a person whose history includes this body, if any
async function personHeight() {
  try {
    const body = app.current();
    for (const p of await (await fetch("/api/people")).json()) {
      const d = await (await fetch("/api/people/" + encodeURIComponent(p.id))).json();
      if ((d.scans || []).some((s) => s.body === body.id)) return d.person?.height_cm || d.height_cm || null;
    }
  } catch {}
  return null;
}

// ---------------------------------------------------------------- for tests and scripts
window.tattooStudio = {
  ready: false,
  saving: false,                            // a change not yet in IndexedDB
  open: () => setOpen(true),
  pose: () => S.sk.pose(),
  setPose: (p) => { S.sk.setPose(p); applyPose(); },
  preset: (name) => { S.sk.setPose(PRESETS[name]); applyPose(); },
  joint: (name) => S.sk.P[S.sk.index(name)].slice(),
  frame: () => S.rig.frame,
  // where splat i is drawn now (the same blend as Spark's shader)
  splat: (i) => skinPoint([S.centres[i * 3], S.centres[i * 3 + 1], S.centres[i * 3 + 2]], S.bones, S.w, S.dq, [0, 0, 0], i),
  splatNear: (name) => {                   // the opaque splat nearest a joint (at rest)
    const p = S.sk.rest[S.sk.index(name)];
    let best = -1, bd = Infinity;
    for (const i of S.opaque) {
      const d = (S.centres[i * 3] - p[0]) ** 2 + (S.centres[i * 3 + 1] - p[1]) ** 2 + (S.centres[i * 3 + 2] - p[2]) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  },
  tattoos: () => S.tattoos.map((tt) => ({ bone: tt.bone, widthCm: tt.widthCm, angle: tt.angle,
                                          points: tt.grid.valid.reduce((s, v) => s + v, 0),
                                          clothed: tt.grid.valid.reduce((s, v, k) => s + (v && tt.mesh.geometry.attributes.clothed.array[k] ? 1 : 0), 0),
                                          centre: Array.from(tt.mesh.geometry.attributes.position.array.slice(
                                            ((tt.grid.ny >> 1) * NX + (NX >> 1)) * 3, ((tt.grid.ny >> 1) * NX + (NX >> 1)) * 3 + 3)) })),
  heightCm: () => S.heightCm,
  screen: (p) => {                          // a point in the body's coordinates, in page pixels
    const r = V.canvas.getBoundingClientRect();
    const v = new THREE.Vector3(...p).applyMatrix4(V.holder.matrixWorld).project(V.camera);
    return [(v.x + 1) / 2 * r.width + r.left, (1 - v.y) / 2 * r.height + r.top];
  },
};
