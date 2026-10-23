// How decor looks (decorate.js draws it): materials by what each part is made of (decor.js
// FINISHES: linen, china, wood, brass, glass, a flame), lit by a soft studio light reflected in
// them, a soft shadow under each thing, and the pictures of the starters for the panel, rendered
// the same way, like a shop's product shots. Design: docs/decor.md ("Look and feel").
// (three by its URL rather than "three": the same module, and it loads in the worker that makes
// the pictures, decorpics.js, where there is no import map.)
import * as THREE from "/vendor/three/three.module.min.js";
import { FINISHES, thumbView } from "/static/decor.js";

// ---------------------------------------------------------------- the light
// A room of soft boxes, as a photographer's studio: a big warm one overhead, two at the sides,
// a dim floor; turned into the reflections every material gets (PMREM). Made once.
let env = null;
export function studio(renderer) { return (env ||= studioFor(renderer)); }
function studioFor(renderer) {
  const scene = new THREE.Scene(), box = new THREE.BoxGeometry(1, 1, 1);
  const room = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: 0x8c8780, side: THREE.BackSide }));
  room.scale.set(14, 7, 14); room.position.y = 3;
  scene.add(room);
  const panel = (w, h, d, x, y, z, c) => {
    const m = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: c }));
    m.scale.set(w, h, d); m.position.set(x, y, z); scene.add(m);
  };
  panel(5, 0.1, 3, 0, 6.3, 0, 0xfff3e2);            // the big one overhead, warm
  panel(0.1, 3, 4, -6.8, 3, 0, 0xc9cfd6);           // a cool one at the left
  panel(0.1, 2.4, 3, 6.8, 2.6, 1, 0xf2e6d6);        // a warm one at the right
  panel(4, 2, 0.1, 0, 2.5, 6.8, 0xe6e2dc);          // a soft fill from the front
  panel(14, 0.05, 14, 0, -0.45, 0, 0x5a554f);       // the floor, darker
  const pm = new THREE.PMREMGenerator(renderer), out = pm.fromScene(scene, 0.04).texture;
  pm.dispose();
  return out;
}

// ---------------------------------------------------------------- materials
// One material per finish, in the order of FINISHES (geometry groups pick them); `soft` is for
// the pictures, which have no room light round them.
export function materials(renderer, own = false) {
  const e = own ? studioFor(renderer) : studio(renderer);
  return FINISHES.map((f) => {
    if (f.glow) return new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, toneMapped: false });
    const m = new THREE.MeshStandardMaterial({
      vertexColors: true, side: THREE.DoubleSide, roughness: f.rough, metalness: f.metal, envMap: e,
      envMapIntensity: f.metal ? 1.3 : 1.15,
    });
    if (f.clear) Object.assign(m, { transparent: true, opacity: f.clear, depthWrite: false });
    return m;
  });
}

// A shape (decor.js) as a geometry, its triangles in groups by finish (a triangle takes its first
// corner's), so one mesh draws the linen, the brass and the glass of a thing together.
export function geometry(s) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(s.p instanceof Float32Array ? s.p : new Float32Array(s.p), 3));
  g.setAttribute("color", new THREE.BufferAttribute(s.c instanceof Float32Array ? s.c : new Float32Array(s.c), 3));
  const tris = s.i instanceof Uint32Array ? s.i : new Uint32Array(s.i), n = FINISHES.length;
  const kind = (k) => {
    const v = tris[k];
    if (s.g && s.g[v] && s.g[tris[k + 1]] && s.g[tris[k + 2]]) return n - 1;
    return s.m ? Math.min(n - 1, s.m[v] || 0) : 0;
  };
  const counts = new Array(n).fill(0);
  for (let k = 0; k < tris.length; k += 3) counts[kind(k)] += 3;
  const start = [], idx = new Uint32Array(tris.length);
  let at = 0;
  for (let f = 0; f < n; f++) { start.push(at); at += counts[f]; }
  const fill = start.slice();
  for (let k = 0; k < tris.length; k += 3) { const f = kind(k); idx.set(tris.subarray(k, k + 3), fill[f]); fill[f] += 3; }
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  for (let f = 0; f < n; f++) if (counts[f]) g.addGroup(start[f], counts[f], f);
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- shadows
// A soft round shadow, darkest under the middle, as a contact shadow in a product photo.
let shadeTex = null;
export function shadow() {
  if (!shadeTex) {
    const c = typeof document === "undefined" ? new OffscreenCanvas(128, 128) : document.createElement("canvas");
    c.width = c.height = 128;
    const x = c.getContext("2d"), gr = x.createRadialGradient(64, 64, 4, 64, 64, 64);
    gr.addColorStop(0, "rgba(0,0,0,0.55)"); gr.addColorStop(0.45, "rgba(0,0,0,0.3)"); gr.addColorStop(1, "rgba(0,0,0,0)");
    x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
    shadeTex = new THREE.CanvasTexture(c);
  }
  return new THREE.MeshBasicMaterial({ map: shadeTex, transparent: true, depthWrite: false, opacity: 0.6, toneMapped: false });
}

// ---------------------------------------------------------------- pictures for the panel
// A starter photographed on its own, three-quarters from the front and a little above, lit by
// the studio, on a transparent ground with its shadow (size x size CSS pixels, drawn at twice
// that). It has its own small renderer (and so its own light and materials), apart from the
// page's, which Spark keeps busy; in decorpics.js it runs in a worker on an OffscreenCanvas, so
// the page never waits for it. Returns the canvas holding the picture.
let cam = null;
function camera(canvas) {
  if (cam) return cam;
  canvas ||= document.createElement("canvas");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setClearColor(0x000000, 0);
  cam = { renderer, mats: materials(renderer, true) };
  return cam;
}
export function picture(geom, bounds, size = 120, canvas = null) {
  const { renderer, mats } = camera(canvas), px = size * 2;
  if (renderer.domElement.width !== px) renderer.setSize(px, px, false);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8178, 1.1));
  const sun = new THREE.DirectionalLight(0xfff4e5, 1.9);
  sun.position.set(2, 5, 4); scene.add(sun);
  scene.add(new THREE.Mesh(geom, mats));
  const v = thumbView(bounds);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shadow());
  ground.rotation.x = -Math.PI / 2; ground.position.set(v.target[0], bounds.lo[1] + 0.002, v.target[2]);
  ground.scale.set(v.shadow[0], v.shadow[1], 1);
  scene.add(ground);
  const c = new THREE.PerspectiveCamera(v.fov, 1, 0.01, 100);
  c.position.set(...v.eye); c.lookAt(...v.target);
  renderer.clear();
  renderer.render(scene, c);
  ground.geometry.dispose(); ground.material.dispose();
  return renderer.domElement;
}
