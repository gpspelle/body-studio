// Take a photo (the button by a room's views): the view as it is now, path traced on the GPU
// (three-gpu-pathtracer, in pathtracer/) in a window of its own over the page, then kept as a PNG.
// What goes in, its materials and its light are photo.js's; this part copies the room's meshes as
// they are drawn into a scene of their own, with materials the path tracer understands, and runs
// it a pass at a time between frames so the page stays responsive. Design: docs/photo.md.
import * as THREE from "three";
import { WebGLPathTracer, GradientEquirectTexture } from "/static/pathtracer/pathtracer.js";
import { PHOTO, finishLook, keep, photoName, photoSize, progress, sunWay } from "/static/photo.js";

const $ = (id) => document.getElementById(id);
const t = window.t;
const app = window.bodyApp;
const V = app.viewer;
const box = $("photo"), shot = $("photoCanvas");

let run = null;             // { tracer, renderer, scene, stop } while a photo is being made

// ---------------------------------------------------------------- what goes in
function describe(o) {
  let visible = true, inRoom = false, shades = false;
  for (let p = o; p; p = p.parent) {
    if (!p.visible) visible = false;
    if (p.userData.room) inRoom = true;
    if (p.userData.shades) shades = true;
  }
  const mats = [].concat(o.material || []);
  const handle = mats.some((m) => m.depthTest === false || (m.transparent && m.opacity === 0));
  return { mesh: !!o.isMesh, visible, inRoom, shades, handle, splat: !!o.isSplatMesh || o.constructor?.name === "SplatMesh", item: o.userData.item };
}

// a material as the path tracer wants it (made once per material seen)
const looks = new Map();
function lookOf(m) {
  if (looks.has(m)) return looks.get(m);
  let out;
  if (m.isMeshBasicMaterial && m.vertexColors && m.toneMapped === false) {
    const g = finishLook({ glow: true });                 // (the decor's glowing finish: decorlook.js)
    out = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: new THREE.Color(...g.emissive), emissiveIntensity: g.power, side: m.side });
  } else if (m.isMeshStandardMaterial) {
    out = new THREE.MeshPhysicalMaterial({
      color: m.color, map: m.map, normalMap: m.normalMap, normalScale: m.normalScale, roughnessMap: m.roughnessMap,
      roughness: m.roughness, metalness: m.metalness, vertexColors: m.vertexColors, side: m.side,
    });
    if (m.transparent && m.opacity < 1) {
      const g = finishLook({ clear: m.opacity });         // (its glass)
      Object.assign(out, { roughness: g.roughness, metalness: g.metalness, transmission: g.transmission, ior: g.ior });
    }
  } else {
    out = null;
  }
  looks.set(m, out);
  return out;
}

// every geometry with three colours a corner (white if it had none): the path tracer merges them
// all into one, and colours of 3 and 4 numbers mixed come out wrong
const coloured = new WeakMap();
function withColour(g) {
  const c = g.getAttribute("color");
  if (c && c.itemSize === 3) return g;
  if (!coloured.has(g)) {
    const out = g.clone(), n = g.getAttribute("position").count, rgb = new Float32Array(3 * n).fill(1);
    if (c) for (let i = 0; i < n; i++) { rgb[3 * i] = c.getX(i); rgb[3 * i + 1] = c.getY(i); rgb[3 * i + 2] = c.getZ(i); }
    out.setAttribute("color", new THREE.BufferAttribute(rgb, 3));
    coloured.set(g, out);
  }
  return coloured.get(g);
}

function photoScene() {
  const scene = new THREE.Scene();
  V.scene.updateMatrixWorld(true);
  let decor = null;
  V.scene.traverse((o) => {
    if (o.userData.room && o.isGroup && o.children.some((c) => c.isDirectionalLight)) decor = o;
    if (!keep(describe(o))) return;
    const mats = [].concat(o.material).map(lookOf);
    if (mats.every((m) => !m)) return;
    const copy = new THREE.Mesh(withColour(o.geometry), Array.isArray(o.material) ? mats.map((m) => m || lookOf(o.material[0])) : mats[0]);
    copy.matrixAutoUpdate = false;
    copy.matrix.copy(o.matrixWorld);
    copy.matrixWorld.copy(o.matrixWorld);
    scene.add(copy);
  });
  // the sky: blue overhead, paler at the horizon, the ground below (its light, and what glass shows)
  const sky = new GradientEquirectTexture();
  sky.topColor.setRGB(...PHOTO.zenith); sky.bottomColor.setRGB(...PHOTO.ground);
  sky.exponent = 2; sky.update();
  scene.environment = sky; scene.background = sky; scene.environmentIntensity = PHOTO.sky;
  // the sun, from where the decor's is
  const sun = new THREE.DirectionalLight(new THREE.Color(...PHOTO.sunColour), PHOTO.sun);
  const local = decor ? decor.children.find((c) => c.isDirectionalLight).position.toArray() : [2, 5, 3];
  const way = sunWay(local, decor ? decor.matrixWorld.elements : new THREE.Matrix4().elements);
  sun.position.set(...way).multiplyScalar(100);
  sun.target.position.set(0, 0, 0);
  scene.add(sun, sun.target);
  return scene;
}

// ---------------------------------------------------------------- making it
// (tests and scripts: a smaller photo, fewer passes)
let passes = PHOTO.passes;
function open(opts = {}) {
  if (run || !window.house?.shell()) return;
  passes = opts.passes || PHOTO.passes;
  const [w, h] = photoSize(innerWidth, innerHeight, opts.long);
  box.hidden = false;
  $("photoSave").disabled = $("photoMakeReal").disabled = true;
  say("photo.setting");
  shot.width = w; shot.height = h;
  box.style.setProperty("--aspect", String(w / h));
  // (after the panel shows: the copy and the BVH take a moment for a big room)
  requestAnimationFrame(() => setTimeout(() => start(w, h), 30));
}
function start(w, h) {
  const renderer = new THREE.WebGLRenderer({ canvas: shot, antialias: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.setSize(w, h, false);
  renderer.toneMapping = THREE.NeutralToneMapping;     // (as the live view)
  renderer.toneMappingExposure = PHOTO.exposure;
  const scene = photoScene();
  const camera = V.camera.clone();
  camera.aspect = w / h; camera.updateProjectionMatrix();
  camera.matrixWorld.copy(V.camera.matrixWorld); camera.matrixAutoUpdate = false;
  const tracer = new WebGLPathTracer(renderer);
  Object.assign(tracer, { bounces: PHOTO.bounces, minSamples: 1, renderDelay: 0, fadeDuration: 0, filterGlossyFactor: 0.5, dynamicLowRes: true });
  tracer.tiles.set(2, 2);
  tracer.setScene(scene, camera);
  let stopped = false;
  run = { tracer, renderer, scene, stop: () => (stopped = true) };
  const step = () => {
    if (stopped) return;
    tracer.renderSample();
    const p = progress(tracer.samples, passes);
    if (p.done) {
      say("photo.done");
      $("photoSave").disabled = $("photoMakeReal").disabled = false;
      box.dataset.done = "1";
      return;
    }
    say("photo.making", { n: p.percent });
    requestAnimationFrame(step);
  };
  delete box.dataset.done;
  requestAnimationFrame(step);
}
function close() {
  if (run) {
    run.stop();
    run.tracer.dispose();
    run.renderer.dispose();
    run = null;
  }
  for (const m of looks.values()) m?.dispose();
  looks.clear();
  box.hidden = true;
  delete box.dataset.done;
  real = null;
  showReal(null);
}
function save() {
  const a = document.createElement("a");
  a.download = photoName(window.house?.file());
  a.href = shot.toDataURL("image/png");
  a.click();
}
const say = (k, params) => ($("photoStatus").textContent = t(k, params));

// ---------------------------------------------------------------- made into a photograph
// The path-traced photo sent to the server, made into a photograph there by the image model on
// this Mac (photoreal.py, in the background, a minute or so); shown beside it once made.
let real = null;            // the photo being made real: its id, while the window is open
async function makeReal() {
  $("photoMakeReal").disabled = true;
  say("photo.realWorking");
  const blob = await new Promise((done) => shot.toBlob(done, "image/png"));
  let st;
  try {
    const r = await fetch("/api/photoreal", { method: "POST", body: blob });
    st = await r.json();
    if (!r.ok) throw new Error(st.error || r.statusText);
  } catch (e) {
    say("photo.realFailed", { error: e.message });
    $("photoMakeReal").disabled = false;
    return;
  }
  const id = (real = st.id);
  while (real === id) {
    if (st.status === "ready") { showReal(id); say("photo.realDone"); return; }
    if (st.status === "failed") { say("photo.realFailed", { error: st.error }); $("photoMakeReal").disabled = false; return; }
    await new Promise((done) => setTimeout(done, 2000));
    try { st = await (await fetch("/api/photoreal/" + id)).json(); } catch { /* (the next try) */ }
  }
}
function showReal(id) {
  box.classList.toggle("pair", !!id);
  $("photoRealFig").hidden = !id;
  box.querySelector("figcaption[data-i18n='photo.traced']").hidden = !id;
  if (!id) { $("photoReal").removeAttribute("src"); return; }
  $("photoReal").src = `/api/photoreal/${id}/real.png`;
  $("photoRealSave").href = $("photoReal").src;
  $("photoRealSave").download = photoName(window.house?.file()).replace(/\.png$/, "-ai.png");
}

$("photoBtn").onclick = () => open();
$("photoClose").onclick = close;
$("photoSave").onclick = save;
$("photoMakeReal").onclick = makeReal;
addEventListener("keydown", (e) => { if (e.key === "Escape" && !box.hidden) close(); });
// only a drawn room (its shell and decor are meshes): a filmed room's splats can't be path traced
addEventListener("roomchange", () => {
  const drawn = !!window.house?.shell();
  $("photoBtn").hidden = !drawn;
  if (!drawn) close();
});

window.darkroom = {
  open, close,
  samples: () => (run ? run.tracer.samples : 0),
  done: () => box.dataset.done === "1",
  real: () => !$("photoRealFig").hidden && $("photoReal").complete && $("photoReal").naturalWidth > 0,
  // what went into the photo's scene: meshes, triangles (tests)
  scene: () => {
    if (!run) return null;
    let meshes = 0, tris = 0;
    run.scene.traverse((o) => { if (o.isMesh) { meshes++; tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; } });
    return { meshes, tris };
  },
};
