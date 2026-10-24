// The page's own part (index.html loads it first): the viewer (renderer, Spark, the camera's
// orbit, the floor shadow, drawing only when something changed), the body picked from the shelf,
// runs and uploads, the Guide, and window.bodyApp, which every other part builds on.
//
// How the parts talk: each one sets a window global for the others and for tests, and announces
// changes with plain events on window.
//   window.bodyApp       here: bodies, current, show, reframe, redraw, busy, upload, viewer {...},
//                        and what others add (room: wardrobe.js; house: house.js)
//   window.bodyViewer    here, once a body is shown: numSplats, size, file (tests)
//   window.tattooStudio  tattoo.js   window.wardrobe  wardrobe.js   window.house    house.js
//   window.parlour       parlour.js  window.modes     modes.js       window.decor    decorate.js
//   window.i18n, t       i18n.js
// Events (dispatched on window), who sends them and who listens:
//   bodyshown    here: the body's splats are in             -> tattoo.js, house.js, modes.js, progress.js
//   roomsready   here: a room run finished                  -> house.js
//   studioready  tattoo.js: skeleton bound, detail {file, rig, weights, mesh, ...} -> wardrobe.js, house.js
//   studiogone   tattoo.js: the body was put away           -> wardrobe.js, house.js
//   posed        tattoo.js: a new pose, detail transforms (ev.idle: breathing only) -> wardrobe.js
//   heightchange tattoo.js: the person's height             -> house.js (the room to scale)
//   fitready     wardrobe.js: base mesh fitted, detail {file, fit, verts, skin} -> tattoo.js (blinks)
//   skinhidden   wardrobe.js: skin under clothes, detail Set -> tattoo.js (ink hides with it)
//   panelopen    tattoo.js, decorate.js: detail "studio" | "decor" -> the other one steps aside
//   modechange   modes.js: <body data-mode> changed          -> tattoo.js, wardrobe.js
//   roomslisted  house.js: the Room menu knows its rooms     -> modes.js
//   roomchange   house.js: a room put round the body or gone -> house.js, wardrobe.js, decorate.js, parlour.js
//   roomplaced   house.js: the room moved round the body     -> modes.js, parlour.js
//   viewchange   house.js: body / eyes / fly / above         -> (tests)
//   decorready   decorate.js: the Decor panel is set up      -> (tests)
// (check with: grep -n 'dispatchEvent\|addEventListener("' src/body_studio/static/*.js)
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { SparkRenderer, SplatMesh } from "@sparkjsdev/spark";
import { Ground } from "/static/ground.js";
import { Busy } from "/static/busy.js";
import { Drawing } from "/static/draw.js";

const $ = (id) => document.getElementById(id);
const t = window.t;
window.i18n.apply();
fetch("/api/version").then((r) => r.json()).then((v) => ($("version").textContent = "v" + v.version)).catch(() => {});
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch {} },
};

// ---------------------------------------------------------------- scene
const canvas = $("stage");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.01, 1000);
const spark = new SparkRenderer({ renderer });
scene.add(spark);
const holder = new THREE.Group();            // orientation lives here; the splat stays untouched
scene.add(holder);
const ground = new Ground(scene);           // the body's shadow on the floor (ground.js)
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;                  // the body stays in the centre
controls.autoRotate = true;                  // a slow turntable until someone touches it
controls.autoRotateSpeed = 0.8;
controls.minPolarAngle = THREE.MathUtils.degToRad(20);
controls.maxPolarAngle = THREE.MathUtils.degToRad(115);
controls.addEventListener("start", () => (controls.autoRotate = false));

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  redraw();
  if (fit) frame();
});
// before and after each frame is drawn: f(true), f(false) (house.js keeps the camera inside a room)
const frameHooks = [];
// a frame is drawn only when something changed (draw.js): Spark has splats made or sorted to show,
// any input, a part asks (redraw(): a pose; keepDrawing: a walk through a room)
const drawing = new Drawing(), keepDrawing = [];
const redraw = (ms = 0) => drawing.redraw(performance.now(), ms);
spark.onDirty = () => redraw();
for (const type of ["pointerdown", "pointermove", "pointerup", "wheel", "keydown", "keyup"])
  addEventListener(type, () => redraw(300), { capture: true, passive: true });
renderer.setAnimationLoop((now) => {
  if (!drawing.due(now, controls.update(), keepDrawing.some((f) => f()))) return;
  for (const f of frameHooks) f(true);
  renderer.render(scene, camera);
  for (const f of frameHooks) f(false);
});

// Brush writes the scene's up direction into the PLY header (numbers or a letter).
function upAxisFromPly(bytes) {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, Math.min(bytes.length, 65536)));
  const end = head.indexOf("end_header");
  const m = end > 0 && head.slice(0, end).match(/comment\s+Vertical axis:\s*([^\n\r]+)/);
  if (!m) return null;
  const n = m[1].match(/[-+]?\d*\.?\d+(?:[eE][-+]?\d+)?/g);
  const v = n && n.length === 3 ? new THREE.Vector3(+n[0], +n[1], +n[2])
    : { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) }[m[1].trim().toLowerCase()];
  return v && v.lengthSq() > 1e-8 ? v.normalize() : null;
}

// The body's extent from its opaque splats (5th-95th percentile), in world space.
function measure(mesh) {
  holder.updateMatrixWorld(true);
  const m = holder.matrixWorld, n = mesh.numSplats || 0, stride = Math.max(1, Math.floor(n / 150000));
  const xs = [], ys = [], zs = [], p = new THREE.Vector3();
  mesh.forEachSplat((i, c, _s, _q, opacity) => {
    if (i % stride || opacity < 0.3) return;
    p.copy(c).applyMatrix4(m); xs.push(p.x); ys.push(p.y); zs.push(p.z);
  });
  if (xs.length < 10) {
    const b = mesh.getBoundingBox(true).applyMatrix4(m);
    return { center: b.getCenter(new THREE.Vector3()), size: b.getSize(new THREE.Vector3()) };
  }
  const pct = (a, q) => { a.sort((x, y) => x - y); return a[Math.floor(q * (a.length - 1))]; };
  const lo = new THREE.Vector3(pct(xs, .005), pct(ys, .005), pct(zs, .005));   // keep hands and feet
  const hi = new THREE.Vector3(pct(xs, .995), pct(ys, .995), pct(zs, .995));
  return { center: lo.clone().add(hi).multiplyScalar(.5), size: hi.clone().sub(lo) };
}

// Whole body in view, head to feet, centred between the top bar and the shelf. The width
// allowed for is the body's diagonal, so outstretched arms stay in frame while it turns.
// With the progress panel open, the body stays centred in the space the panel leaves.
const CHROME = 84;                                // px kept clear at the top and at the bottom
function covered() {                              // px the panels take at each side, or at the bottom
  // and the top bar beyond one row (on a phone its buttons wrap to a second row)
  const out = { left: 0, right: 0, bottom: 0, top: Math.max(0, document.querySelector(".bar").getBoundingClientRect().bottom - 64) };
  for (const id of ["progress", "studio", "decor"]) {
    const el = $(id);
    if (el.hidden) continue;
    const r = el.getBoundingClientRect();
    if (innerWidth <= 600) out.bottom = Math.max(out.bottom, innerHeight - r.top);
    else if (r.left < innerWidth / 2) out.left = r.right;
    else out.right = innerWidth - r.left;
  }
  return out;
}
function frame() {
  const { center, size } = fit;
  const cover = covered();
  const w = innerWidth - cover.right - cover.left, h = innerHeight - cover.bottom - cover.top;
  if (cover.right || cover.left || cover.bottom || cover.top)
    camera.setViewOffset(innerWidth, innerHeight, (cover.right - cover.left) / 2, (cover.bottom - cover.top) / 2, innerWidth, innerHeight);
  else camera.clearViewOffset();
  // in a room (house.js): from where the camera sees the room round the body
  if (window.bodyApp.house?.shown() && window.bodyApp.house.view()) return;
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  const free = Math.max(0.3, (h - 2 * CHROME) / innerHeight);   // share of the height the body may use
  const width = Math.hypot(size.x, size.z);
  let dist = 1.08 * Math.max(size.y / 2 / (tanV * free), width / 2 / (tanV * (w / innerHeight) * 0.92)) + width / 2;
  // with the shop around the body (wardrobe.js), far enough back to see most of it too
  const room = window.bodyApp.room?.() || 0;
  if (room) dist = Math.max(dist, room / 2 / (tanV * (w / innerHeight)));
  camera.near = dist / 100; camera.far = dist * 20; camera.updateProjectionMatrix();
  camera.position.set(center.x, center.y + size.y * 0.05, center.z + dist);
  controls.target.copy(center);
  controls.minDistance = dist * 0.35; controls.maxDistance = dist * 2.5;
  controls.update();
}

let mesh = null, fit = null, current = null, meshFile = null;

// One loading screen, the logo turning, until the body can really be used (busy.js): from the page
// opening, the body loading here, then its skeleton and its pose and tattoos (tattoo.js), the
// clothes fitted and what was worn put back on, the shop around it (wardrobe.js), a room
// (house.js), each a step through bodyApp.busy. A step starts before the one it follows ends,
// so the screen stays up across them; it fades out when the last one is done.
const busy = new Busy(({ shown, waiting, text, slow }) => {
  $("busyText").textContent = text;
  $("busySlow").textContent = slow;
  $("busy").hidden = !shown;
  $("busy").classList.toggle("leaving", shown && !waiting);
  document.body.classList.toggle("is-busy", waiting);
});
busy.set("start", t("load.starting"), { now: true });         // (shown from the first paint)

async function show(body) {
  if (current === body.file) return;
  current = body.file;
  store.set("body:last", body.file);
  for (const b of document.querySelectorAll(".shelf button")) b.classList.toggle("on", b.dataset.file === body.file);
  $("empty").hidden = true; $("loading").hidden = true;
  busy.set("body", t("load.loading", { name: body.name.replace(/_/g, " ") }), { slow: t("load.slowBody") });
  const res = await fetch("/files/" + body.file.split("/").map(encodeURIComponent).join("/"));
  if (!res.ok) { busy.set("body", null); $("loading").hidden = false; $("loadingText").textContent = t("load.failed", { name: body.name }); return; }
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (current !== body.file) return;           // another body was picked meanwhile
  if (mesh) { holder.remove(mesh); mesh.dispose?.(); }
  const up = upAxisFromPly(bytes);
  holder.quaternion.copy(up ? new THREE.Quaternion().setFromUnitVectors(up, new THREE.Vector3(0, 1, 0))
                            : new THREE.Quaternion(1, 0, 0, 0));   // COLMAP data is usually y-down
  mesh = new SplatMesh({ fileBytes: bytes, fileName: body.file });
  meshFile = body.file;
  holder.add(mesh);
  await mesh.initialized;
  fit = measure(mesh);
  ground.place(fit.center, fit.center.y - fit.size.y / 2, fit.size.y, fit.size.x, fit.size.z);
  frame();
  controls.autoRotate = true;
  window.bodyViewer = { numSplats: () => mesh.numSplats || 0, size: () => fit.size.toArray(), file: () => current };
  $("studioBtn").hidden = false;
  dispatchEvent(new Event("bodyshown"));       // (what follows starts its steps meanwhile)
  busy.set("body", null);
}

// ---------------------------------------------------------------- library and runs
let shown = "", bodyList = [];
async function refreshBodies() {
  const bodies = bodyList = await (await fetch("/api/bodies")).json();
  const key = bodies.map((b) => b.file).join("|");
  if (key !== shown) {
    shown = key;
    $("shelf").replaceChildren(...bodies.map((b) => {
      const el = document.createElement("button");
      el.textContent = b.name.replace(/_/g, " ");
      el.dataset.file = b.file;
      el.classList.toggle("on", b.file === current);
      el.onclick = () => show(b);
      return el;
    }));
  }
  $("empty").hidden = bodies.length > 0 || !!mesh;
  if (!mesh && bodies.length) show(bodies.find((b) => b.file === store.get("body:last")) || bodies[0]);
  busy.set("start", null);
  return bodies;
}

let watching = null, lastPill = null;
function pill(cls, text) {
  const el = $("job");
  el.hidden = false; el.className = "pill" + (cls ? " " + cls : ""); el.textContent = text;
}
async function refreshJobs() {
  const jobs = await (await fetch("/api/jobs")).json();
  const live = jobs.find((j) => j.status === "running" || j.status === "queued");
  const last = jobs[0];
  if (live) {
    watching = live.id;
    lastPill = () => {
      const name = live.name.replace(/_/g, " ");
      if (live.status === "queued") return pill("busy", t("job.waiting", { name }));
      const left = live.left ? t("job.left", { left: live.left }) : t("job.measuring");
      pill("busy", `${t("job.stage" + (live.stage || 1), { name })} · ${left}`);
    };
    lastPill();
  } else if (last && last.id === watching) {
    watching = null;
    const name = last.name.replace(/_/g, " ");
    lastPill = () => last.status === "done" ? pill("", t("job.ready", { name }))
      : pill("bad", t("job.failed", { name, error: last.advice[0] || last.error || last.status }));
    lastPill();
    if (last.kind === "room") { dispatchEvent(new Event("roomsready")); return; }   // (house.js)
    const bodies = await refreshBodies();
    const made = bodies.find((b) => b.file === last.body);
    if (made) show(made);
  }
}

async function upload(file, kind = "body") {
  lastPill = null;
  pill("busy", t("job.uploading", { name: file.name }));
  const r = await fetch("/api/upload?name=" + encodeURIComponent(file.name) + (kind === "room" ? "&kind=room" : ""),
                        { method: "POST", body: file });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    return pill("bad", t(e.code ? "err." + e.code : "err.upload"));
  }
  refreshJobs();
}

// the Guide: every control on one card (Esc, ✕ or a click outside it closes it)
$("guideBtn").onclick = () => $("guide").showModal();
$("closeGuide").onclick = () => $("guide").close();
$("guide").addEventListener("click", (e) => { if (e.target === $("guide")) $("guide").close(); });

$("pick").onchange = (e) => e.target.files[0] && upload(e.target.files[0]);
let depth = 0;
addEventListener("dragenter", (e) => { e.preventDefault(); depth++; $("drop").hidden = false; });
addEventListener("dragleave", () => { if (--depth <= 0) { depth = 0; $("drop").hidden = true; } });
addEventListener("dragover", (e) => e.preventDefault());
addEventListener("drop", (e) => {
  e.preventDefault(); depth = 0; $("drop").hidden = true;
  const f = e.dataTransfer.files[0];
  if (f) upload(f);
});
addEventListener("keydown", (e) => {
  if (e.target.closest?.("input, textarea, select, [contenteditable]")) return;
  if (e.key === "?" && !$("guide").open) { $("guide").showModal(); return; }
  if (e.key === "r" || e.key === "R") { if (fit) frame(); }      // (Space jumps: tattoo.js)
});

// for the progress panel (progress.js)
window.bodyApp = {
  bodies: () => bodyList,
  current: () => bodyList.find((b) => b.file === current) || null,
  show: (id) => { const b = bodyList.find((x) => x.id === id); if (b) show(b); },
  reframe: () => { if (fit) frame(); },
  redraw,                                    // (something changed in the scene: draw a frame)
  busy: (key, text, opts) => busy.set(key, text, opts),   // (tattoo.js: the skeleton, getting ready to move)
  upload,                                    // (house.js: a room's video)
  // for the tattoo and pose panel (tattoo.js)
  viewer: { scene, spark, holder, ground, camera, controls, renderer, canvas, frameHooks, keepDrawing, redraw, mesh: () => mesh, file: () => current,
            loaded: () => !!mesh && meshFile === current },   // (the body picked may still be on its way)
};
refreshBodies(); refreshJobs();
setInterval(refreshJobs, 2000);
