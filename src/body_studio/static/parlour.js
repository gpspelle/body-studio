// The tattoo studio, when the room shown is one (its fixtures say where its bed, chair, flash
// wall and mirror are: the sample studio, sample_studio.py): designs hang on the flash wall, the
// starters and the body's own, and a tap on one picks it to lay on the body (tattoo.js); F by the bed
// or the chair goes where that tattoo is made (lying face up or down, or in the chair with the arm on
// its rest), the clothes over it coming off until the body gets up; the camera's views are the
// room's, the artist's (close over the tattoo) and the mirror's. The maths is flash.js's, the room
// house.js's. Design: docs/tattoo.md.
import * as THREE from "three";
import { q, v3 } from "/static/pose.js";
import { STARTERS, artistView, mirrorView, nearStation, sheetLayout, starterUrl, stationFor } from "/static/flash.js";

const $ = (id) => document.getElementById(id);
const t = window.t;
const app = window.bodyApp;
const V = app.viewer;
const house = () => window.house;
const studio = () => window.tattooStudio;

let fx = null;              // the studio's fixtures (map metres), while one is shown
let group = null;           // the flash sheets (three.js planes, in the body's coordinates)
let sheets = [];            // per sheet: { mesh, src, name, key }
let hung = "";              // what is hung (to hang it again only when that changes)
let lent = null;            // the worn items taken off at the bed or the chair, back on when the body gets up
let view = "room";          // the camera's view: room, artist or mirror
let picked = null;          // the sheet last picked

// ---------------------------------------------------------------- the flash wall
// a sheet of flash: the design on off-white paper with its name under it
function paper(img, name) {
  const c = document.createElement("canvas"), W = 312, H = 400;
  c.width = W; c.height = H;
  const g = c.getContext("2d");
  g.fillStyle = "#f3ede0"; g.fillRect(0, 0, W, H);
  g.strokeStyle = "#cfc4ae"; g.lineWidth = 4; g.strokeRect(10, 10, W - 20, H - 20);
  if (img) {
    const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height, s = Math.min((W - 60) / iw, (H - 110) / ih);
    g.drawImage(img, (W - iw * s) / 2, 30 + (H - 110 - ih * s) / 2, iw * s, ih * s);
  }
  g.fillStyle = "#3a3329"; g.font = "600 26px Georgia, serif"; g.textAlign = "center";
  g.fillText(name, W / 2, H - 34, W - 40);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
const images = new Map();
function image(src) {
  if (src instanceof HTMLCanvasElement) return Promise.resolve(src);
  if (!images.has(src)) images.set(src, new Promise((ok) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ok(null); i.src = src; }));
  return images.get(src);
}

// the designs to hang: the body's tattoos (each image once) first, then the starters
function designs() {
  const own = [], seen = new Set();
  for (const d of studio()?.designs?.() || []) if (!seen.has(d.canvas)) { seen.add(d.canvas); own.push({ src: d.canvas, name: d.name || t("flash.yours"), key: d.name }); }
  return [...own, ...STARTERS.map((id) => ({ src: starterUrl(id), name: t("flash." + id), key: id }))];
}

// a way in the map (x, y, z) -> the body's coordinates
const dirToBody = (P, d) => v3.unit(v3.sub(P.toBody(d), P.toBody([0, 0, 0])));

async function hang() {
  const P = house().placement();
  if (!fx || !fx.flash || !P) return;
  const list = designs(), key = list.map((d) => (typeof d.src === "string" ? d.src : "own") + d.name).join("|") + "|" + P.k + "|" + window.i18n.lang;
  if (key === hung && group) return;
  hung = key;
  unhang();
  group = new THREE.Group();
  group.name = "flash";
  const at = sheetLayout(fx.flash, list.length);
  const n = dirToBody(P, fx.flash.normal), up = dirToBody(P, [0, 1, 0]);
  let right = dirToBody(P, fx.flash.right);
  if (v3.dot(v3.cross(right, up), n) < 0) right = v3.scale(right, -1);     // (a mirrored room: the pictures read the right way)
  const basis = new THREE.Matrix4().makeBasis(new THREE.Vector3(...right), new THREE.Vector3(...up), new THREE.Vector3(...n));
  sheets = list.map((d, i) => {
    const s = at[i];
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, toneMapped: false });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(s.w * P.k, s.h * P.k), mat);
    mesh.quaternion.setFromRotationMatrix(basis);
    mesh.position.set(...P.toBody(s.centre));
    mesh.renderOrder = 2;
    group.add(mesh);
    const sheet = { mesh, src: d.src, name: d.name, key: d.key };
    image(d.src).then((img) => { if (sheets.includes(sheet)) { mat.map = paper(img, d.name); mat.needsUpdate = true; } });
    return sheet;
  });
  V.holder.add(group);
  mark();
}
function unhang() {
  if (!group) return;
  V.holder.remove(group);
  for (const s of sheets) { s.mesh.geometry.dispose(); s.mesh.material.map?.dispose(); s.mesh.material.dispose(); }
  group = null; sheets = [];
}
// the sheet picked stands out a little from the wall
function mark() {
  for (const s of sheets) s.mesh.scale.setScalar(picked && s.key === picked ? 1.08 : 1);
}

// a tap (not a drag) on a sheet picks its design: the next tap on the body lays it there
let down = null;
const ray = new THREE.Raycaster();
function sheetAt(x, y) {
  if (!group) return null;
  const r = V.canvas.getBoundingClientRect();
  ray.setFromCamera(new THREE.Vector2((x - r.left) / r.width * 2 - 1, -((y - r.top) / r.height) * 2 + 1), V.camera);
  const hit = ray.intersectObjects(sheets.map((s) => s.mesh), false)[0];
  if (!hit) return null;
  const body = studio()?.bodyDistance?.(x, y);
  if (body !== null && body !== undefined && body < hit.distance) return null;      // the body is in front of it
  return sheets.find((s) => s.mesh === hit.object);
}
addEventListener("pointerdown", (e) => {
  if (view === "mirror") setView("room", false);
  down = fx && e.target === V.canvas && e.button === 0 ? [e.clientX, e.clientY] : null;
}, { capture: true });
addEventListener("pointerup", (e) => {
  if (!down) return;
  const moved = Math.hypot(e.clientX - down[0], e.clientY - down[1]);
  down = null;
  if (moved < 6) pickAt(e.clientX, e.clientY);
});
async function pickAt(x, y) {
  const s = sheetAt(x, y);
  if (!s) return false;
  picked = s.key; mark();
  return studio().design(s.src, s.name);
}

// ---------------------------------------------------------------- F: the bed and the chair
// Where the tattoo worked on is made (flash.js stationFor), when the body is by that piece of
// furniture; by the other one (or with no tattoo yet), just lying on the bed face up or sitting in
// the chair.
function wanted(at) {
  if (!fx) return null;
  const near = nearStation(fx, at);
  if (!near.length) return null;
  const s = studio(), i = s.current(), spot = i >= 0 ? s.spot(i) : null, f = s.frame();
  let st = spot ? stationFor(spot, f.front, f.left) : null;
  const furniture = (x) => (x.kind === "lie" ? "bed" : "chair");
  if (!st || !near.includes(furniture(st))) st = near[0] === "bed" ? { kind: "lie", face: "up", raise: null } : { kind: "chair", arm: null };
  if (st.kind === "lie" && !fx.bed) return null;
  if (st.kind === "chair" && !fx.chair) return null;
  return { st, i: spot ? i : -1, spot };
}
function hintFor(st) {
  if (st.kind === "lie") return t(st.raise ? "studio.lieArm" : st.face === "down" ? "studio.lieDown" : "studio.lieUp");
  return t(st.arm ? "studio.chairArm" : "studio.chair");
}
function go(w) {
  const s = studio(), walker = s.walker(), P = house().placement();
  if (!walker || !P) return false;
  const k = P.k, { st, i, spot } = w;
  let target;
  if (st.kind === "lie") {
    const b = fx.bed;
    target = { kind: "lie", at: P.toBody(b.at), head: P.wayToBody([b.head[0], b.head[2]]), face: st.face, raise: st.raise };
  } else {
    const c = fx.chair, rest = st.arm && (fx.rests || []).find((r) => r.side === st.arm);
    target = { kind: "sit", at: P.toBody(c.at), facing: P.wayToBody([c.facing[0], c.facing[2]]), height: c.height * k, back: true,
               recline: c.recline || 0, arm: rest ? { side: st.arm, at: P.toBody(rest.at), face: { bone: spot.bone, normal: spot.normal } } : null };
  }
  if (!walker.restAt(target)) return false;
  // the clothes over the tattoo come off (and go back on when the body gets up)
  const ww = window.wardrobe;
  if (ww && i >= 0) {
    const ids = ww.covering(s.skinUnder(i));
    if (ids.length) { ww.lend(ids); lent = (lent || []).concat(ids); }
  }
  s.wake();
  return true;
}
function station(at) {
  const w = wanted(at);
  return w ? { hint: hintFor(w.st), go: () => go(w), station: w.st } : null;
}
function giveBack() {
  if (!lent) return;
  const ids = lent;
  lent = null;
  window.wardrobe?.giveBack(ids);
}

// ---------------------------------------------------------------- the camera's views
function setView(v, apply = true) {
  view = v;
  V.canvas.style.transform = v === "mirror" ? "scaleX(-1)" : "";
  for (const b of $("studioViews").querySelectorAll("button")) b.classList.toggle("on", b.dataset.view === v);
  if (!apply) return;
  const s = studio(), P = house().placement(), w = s.walker();
  if (!P || !w) return;
  const sk = w.sk, k = P.k, f = s.frame();
  const world = (p) => V.holder.localToWorld(new THREE.Vector3(...p));
  V.holder.updateMatrixWorld();
  if (v === "room") { house().view(); return; }
  let eye, target;
  if (v === "artist") {
    const i = s.current(), spot = i >= 0 ? s.spot(i) : null;
    const centre = spot ? spot.centre : sk.P[sk.index("chest")], normal = spot ? spot.facing : q.rot(sk.W[sk.index("chest")], f.front);
    ({ eye, target } = artistView(centre, normal, f.up, 0.55 * k));
  } else {
    const chest = P.toMap(sk.P[sk.index("chest")] || sk.P[0]);
    const m = mirrorView(fx.mirror, chest);
    eye = P.toBody(m.eye); target = P.toBody(m.target);
  }
  V.controls.target.copy(world(target));
  V.camera.position.copy(world(eye));
  V.controls.update();
}
$("studioViews").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-view]");
  if (b) setView(b.dataset.view);
});

// ---------------------------------------------------------------- in and out of the studio
function enter() {
  const f = house().fixtures();
  fx = f && f.flash ? f : null;
  document.body.classList.toggle("in-studio", !!fx);
  $("studioViews").hidden = !fx;
  house().station(fx ? station : null);
  if (fx) hang(); else { unhang(); hung = ""; giveBack(); setView("room", false); }
}
addEventListener("roomchange", enter);
addEventListener("roomplaced", () => { if (fx) { hung = ""; hang(); } });
// the body's own designs join the wall as tattoos are added or renamed; the clothes go back on
// once the body is up again
setInterval(() => { if (fx && !document.hidden) hang(); }, 1000);
V.frameHooks.push((before) => {
  if (!before || !lent) return;
  const w = studio()?.walker?.();
  if (!w || !w.rest) giveBack();
});

// ---------------------------------------------------------------- for tests and scripts
window.parlour = {
  shown: () => !!fx,
  sheets: () => sheets.map((s) => ({ key: s.key, name: s.name, ready: !!s.mesh.material.map })),
  // where sheet i is on the screen (page pixels), or null when it can't be tapped there
  sheetOnScreen: (i) => {
    const s = sheets[i];
    if (!s) return null;
    V.holder.updateMatrixWorld();
    const p = s.mesh.getWorldPosition(new THREE.Vector3()).project(V.camera), r = V.canvas.getBoundingClientRect();
    if (p.z > 1) return null;
    const x = r.left + (p.x + 1) / 2 * r.width, y = r.top + (1 - p.y) / 2 * r.height;
    return sheetAt(x, y) === s ? { x, y } : null;
  },
  pick: (i) => { const s = sheets[i]; if (!s) return false; picked = s.key; mark(); return studio().design(s.src, s.name); },
  picked: () => picked,
  station: () => { const at = house().where(); const w = at && wanted(at); return w ? w.st : null; },
  lent: () => lent || [],
  view: (v) => { if (v) setView(v); return view; },
};
