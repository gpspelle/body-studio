// Take a photo (the button by a room's views): the view as it is now, path traced on the GPU
// (three-gpu-pathtracer, in pathtracer/) in a window of its own over the page, then kept as a PNG.
// What goes in, its materials and its light are photo.js's; this part copies the room's meshes as
// they are drawn into a scene of their own, with materials the path tracer understands, and runs
// it a pass at a time between frames so the page stays responsive. Photo of this piece (Decorate)
// is the same with only the piece picked, on a plain floor, framed to fill it. Design: docs/photo.md.
import * as THREE from "three";
import { WebGLPathTracer, GradientEquirectTexture } from "/static/pathtracer/pathtracer.js";
import { finishMaps } from "/static/shell.js";
import { PHOTO, PIECE, SHORE, byMaterial, finishLook, frameOn, groundAt, keep, photoName, photoSize, pieceName, progress, seascape, skyColour, sunWay, waveNormals } from "/static/photo.js";

const $ = (id) => document.getElementById(id);
const t = window.t;
const app = window.bodyApp;
const V = app.viewer;
const box = $("photo"), shot = $("photoCanvas");

let run = null;             // { tracer, renderer, scene, stop } while a photo is being made
let piece = null;           // { k, item } when the photo is of one piece

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

// a geometry as one geometry per material (byMaterial in photo.js), each with three colours a
// corner; made once per geometry for a photo, let go when its window closes
const split = new Map();
function parts(g) {
  if (split.has(g)) return split.get(g);
  const whole = withColour(g), out = [];
  const list = byMaterial(g.index ? g.index.array : null, g.groups, g.getAttribute("position").count);
  if (list.length === 1) out.push({ material: list[0].material, geometry: whole });
  else for (const p of list) {
    const part = new THREE.BufferGeometry();
    for (const name of ["position", "normal", "color", "uv"]) {
      const a = whole.getAttribute(name);
      if (!a) continue;
      const n = a.itemSize, dst = new Float32Array(p.verts.length * n);
      for (let i = 0; i < p.verts.length; i++) for (let c = 0; c < n; c++) dst[i * n + c] = a.getComponent(p.verts[i], c);
      part.setAttribute(name, new THREE.BufferAttribute(dst, n));
    }
    part.setIndex(new THREE.BufferAttribute(p.index, 1));
    out.push({ material: p.material, geometry: part });
  }
  split.set(g, out);
  return out;
}

function photoScene() {
  const scene = new THREE.Scene();
  V.scene.updateMatrixWorld(true);
  let decor = null;
  V.scene.traverse((o) => {
    if (o.userData.room && o.isGroup && o.children.some((c) => c.isDirectionalLight)) decor = o;
    if (!keep(describe(o))) return;
    if (piece && o.userData.index !== piece.k) return;
    const mats = [].concat(o.material).map(lookOf);
    if (mats.every((m) => !m)) return;
    // (a mesh per material: the path tracer gives a whole mesh one)
    for (const part of parts(o.geometry)) {
      const look = mats[part.material] || mats[0];
      if (!look) continue;
      const copy = new THREE.Mesh(part.geometry, look);
      copy.matrixAutoUpdate = false;
      copy.matrix.copy(o.matrixWorld);
      copy.matrixWorld.copy(o.matrixWorld);
      scene.add(copy);
    }
  });
  // the sun, from where the decor's is
  const local = decor ? decor.children.find((c) => c.isDirectionalLight).position.toArray() : [2, 5, 3];
  const way = sunWay(local, decor ? decor.matrixWorld.elements : new THREE.Matrix4().elements);
  // the sky: deep blue overhead, hazy at the horizon, a glow round the sun, a few clouds (its
  // light, and what glass and the sea show)
  const sky = new GradientEquirectTexture(piece ? 256 : 1024);     // (a piece is on a backdrop: its sky only lights it)
  const dir = new THREE.Vector3();
  sky.generationCallback = (sph, uv, size, colour) => { dir.setFromSpherical(sph); colour.setRGB(...skyColour(dir.toArray(), way)); };
  sky.update();
  scene.environment = sky; scene.background = sky; scene.environmentIntensity = PHOTO.sky;
  if (piece) pieceStudio(scene, decor);
  else if (decor && window.house?.fixtures()?.sea) shore(scene, window.house.fixtures().sea, decor.matrixWorld);
  const sun = new THREE.DirectionalLight(new THREE.Color(...PHOTO.sunColour), PHOTO.sun);
  sun.position.set(...way).multiplyScalar(100);
  sun.target.position.set(0, 0, 0);
  scene.add(sun, sun.target);
  return scene;
}

// The far beach, the sea and the island (drawn in faint splats in the live view, which the path
// tracer can't use) as surfaces: the dry sand with the room's sand's grain, the wet sand, the foam,
// the sea rippled so it shows the sky in glints, the island hazy across the channel
function shore(scene, sea, frame) {
  const look = {
    sand: () => { const m = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 1, metalness: 0 }); grain(m, "sand"); return m; },
    wet: () => new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.32, metalness: 0 }),
    foam: () => new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 }),
    sea: () => {
      const m = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.03, metalness: 0, ior: 1.33 });
      m.normalMap = tiles(waveNormals(256, 0.9), 256, 9);
      m.normalScale.set(0.5, 0.5);
      return m;
    },
    island: () => new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 1, metalness: 0 }),
  };
  for (const p of seascape(sea)) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(p.position, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(p.uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(p.colour, 3));
    g.setIndex(p.index);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, look[p.name]());
    m.userData.own = true;                       // (let go when the photo's window closes)
    m.matrixAutoUpdate = false;
    m.matrix.copy(frame); m.matrixWorld.copy(frame);
    scene.add(m);
  }
}
// a small square map that tiles every `metres` (uv in metres)
function tiles(data, size, metres) {
  const t = new THREE.DataTexture(data, size, size);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(1 / metres, 1 / metres);
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.needsUpdate = true;
  return t;
}
// a finish's grain (shell.js: colour, bumps and shine), as the room's own floor has it
function grain(m, finish) {
  const f = finishMaps(finish);
  Object.assign(m, { map: tiles(f.color, f.size, f.metres), normalMap: tiles(f.normal, f.size, f.metres), roughnessMap: tiles(f.rough, f.size, f.metres) });
  m.color.setScalar(1 / f.mean);
}

// A piece on its own: a wide matte floor under it (the room's floor if it hangs) and a pale
// backdrop behind (the sky still lights it); where the camera goes to fill the photo with it
function pieceStudio(scene, decor) {
  const box = new THREE.Box3();
  for (const c of scene.children) if (c.isMesh) box.expandByObject(c);
  if (box.isEmpty()) return;
  const floorY = decor ? decor.getWorldPosition(new THREE.Vector3()).y : 0;
  const y = groundAt(box.min.y, floorY), r = box.getBoundingSphere(new THREE.Sphere()).radius;
  const floor = new THREE.Mesh(withColour(new THREE.CircleGeometry(Math.max(20, r * 30), 48)),
    new THREE.MeshPhysicalMaterial({ color: new THREE.Color(...PIECE.floor), roughness: 0.9, metalness: 0 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.set((box.min.x + box.max.x) / 2, y - 0.002, (box.min.z + box.max.z) / 2);
  floor.updateMatrixWorld(true);
  scene.add(floor);
  const back = new GradientEquirectTexture();
  back.topColor.setRGB(...PIECE.backdrop); back.bottomColor.setRGB(...PIECE.backdrop); back.update();
  scene.background = back;
  piece.box = box;
}
function pieceCamera(camera, w, h) {
  const s = piece.box.getBoundingSphere(new THREE.Sphere());
  const eye = frameOn(V.camera.position.toArray(), s.center.toArray(), s.radius, camera.fov, w / h);
  camera.matrixAutoUpdate = true;
  camera.position.set(...eye);
  camera.up.set(0, 1, 0);
  camera.lookAt(s.center);
  camera.near = Math.max(0.01, s.radius / 100); camera.far = 1000;
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}

// ---------------------------------------------------------------- making it
// (tests and scripts: a smaller photo, fewer passes)
let passes = PHOTO.passes;
// opts.piece: the index of a placed piece of decor, for a photo of it alone
function open(opts = {}) {
  if (run || !window.house?.shell()) return;
  const k = opts.piece, p = k != null ? window.decor?.placed()[k] : null;
  piece = p ? { k, item: p.item } : null;
  const L = piece ? PIECE : PHOTO;
  passes = opts.passes || L.passes;
  const [w, h] = photoSize(innerWidth, innerHeight, opts.long || L.long);
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
  const t0 = performance.now();
  const scene = photoScene();
  const camera = V.camera.clone();
  camera.aspect = w / h; camera.updateProjectionMatrix();
  camera.matrixWorld.copy(V.camera.matrixWorld); camera.matrixAutoUpdate = false;
  if (piece?.box) pieceCamera(camera, w, h);
  const tracer = new WebGLPathTracer(renderer);
  Object.assign(tracer, { bounces: (piece ? PIECE : PHOTO).bounces, minSamples: 1, renderDelay: 0, fadeDuration: 0, filterGlossyFactor: 0.5, dynamicLowRes: true });
  tracer.tiles.set(2, 2);
  tracer.setScene(scene, camera);
  let stopped = false;
  run = { tracer, renderer, scene, stop: () => (stopped = true), times: { setup: performance.now() - t0, first: 0, all: 0 } };
  const step = () => {
    if (stopped) return;
    tracer.renderSample();
    if (!run.times.first) run.times.first = performance.now() - t0;
    const p = progress(tracer.samples, passes);
    if (p.done) {
      run.times.all = performance.now() - t0;
      say(piece ? "photo.pieceDone" : "photo.done");
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
    // (what the photo made for itself: the shore's surfaces and maps, the sky)
    run.scene.traverse((o) => { if (o.userData.own) { o.geometry.dispose(); for (const k of ["map", "normalMap", "roughnessMap"]) o.material[k]?.dispose(); o.material.dispose(); } });
    run.scene.background?.dispose();
    run.tracer.dispose();
    run.renderer.dispose();
    run = null;
  }
  for (const m of looks.values()) m?.dispose();
  looks.clear();
  for (const [g, list] of split) for (const p of list) if (p.geometry !== g && p.geometry !== coloured.get(g)) p.geometry.dispose();
  split.clear();
  box.hidden = true;
  delete box.dataset.done;
  piece = null;
  real = null;
  showReal(null);
}
function save() {
  const a = document.createElement("a");
  a.download = fileName();
  a.href = shot.toDataURL("image/png");
  a.click();
}
const fileName = () => (piece ? pieceName(window.house?.file(), piece.item) : photoName(window.house?.file()));
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
    const r = await fetch("/api/photoreal" + (piece ? "?piece=1" : ""), { method: "POST", body: blob });
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
  $("photoRealSave").download = fileName().replace(/\.png$/, "-ai.png");
}

$("photoBtn").onclick = () => open();
$("decorPhoto").onclick = () => { const k = window.decor?.selected(); if (k >= 0) open({ piece: k }); };
$("photoClose").onclick = close;
$("photoSave").onclick = save;
$("photoMakeReal").onclick = makeReal;
addEventListener("keydown", (e) => { if (e.key === "Escape" && !box.hidden) close(); });
// only a drawn room (its shell and decor are meshes): a filmed room's splats can't be path traced
addEventListener("roomchange", () => {
  const drawn = !!window.house?.shell();
  $("photoBtn").hidden = $("decorPhoto").hidden = !drawn;
  if (!drawn) close();
});

window.darkroom = {
  open, close,
  samples: () => (run ? run.tracer.samples : 0),
  // how long it took, ms: to set up (the copy and the light's search tree), to the first pass, to done
  times: () => (run ? { ...run.times } : null),
  piece: () => (piece ? piece.item : null),
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
