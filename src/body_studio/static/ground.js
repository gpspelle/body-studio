// A soft shadow on the floor under the body, so it stands on something instead of floating: a
// plane at the floor's height whose shader adds up soft discs (flesh.js shadowBlobs: discs along
// each part of the body, softer and fainter the higher it is, darkest under the feet). Before the
// skeleton is known it is one soft ellipse the size of the body's footprint. A plain three.js mesh
// drawn before the splats, under them; it writes no depth.
import * as THREE from "three";
import { MAX_CAPSULES, SHADOW, darknessAt, shadowBlobs } from "/static/flesh.js";

const MAX = MAX_CAPSULES * (SHADOW.steps + 1);

const VERT = `
varying vec2 vXZ;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vXZ = w.xz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const FRAG = `
uniform vec4 blobs[${MAX}];
uniform int count;
uniform vec2 stretch;
uniform vec3 colour;
varying vec2 vXZ;
void main() {
  float s = 0.0;
  for (int i = 0; i < ${MAX}; i++) {
    if (i >= count) break;
    vec2 d = (vXZ - blobs[i].xy) / stretch;
    float r = max(blobs[i].z, 1e-5);
    s += blobs[i].w * exp(-2.5 * dot(d, d) / (r * r));
  }
  // overlapping shadows add up, but never past black
  float a = 1.0 - exp(-s);
  if (a < 0.003) discard;
  gl_FragColor = vec4(colour, a);
}`;

export class Ground {
  constructor(scene) {
    this.u = { blobs: { value: Array.from({ length: MAX }, () => new THREE.Vector4()) }, count: { value: 0 },
               stretch: { value: new THREE.Vector2(1, 1) }, colour: { value: new THREE.Color(0x1e1a16) } };
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1),
      new THREE.ShaderMaterial({ uniforms: this.u, vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false }));
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.renderOrder = -10;
    this.mesh.visible = false;
    this.mesh.name = "ground-shadow";
    scene.add(this.mesh);
    this.floor = 0; this.H = 1; this.blobs = [];
  }

  // under a body whose centre is c (x, z), standing on the floor at y, H tall, its footprint
  // w by d: until the skeleton is known, one soft ellipse
  place(c, floor, H, w, d) {
    this.floor = floor; this.H = H;
    this.mesh.position.set(c.x, floor + 0.0005 * H, c.z);
    this.mesh.scale.set(2 * H, 2 * H, 1);
    const r = 0.5 * Math.max(w, d);
    this.stretch = [w / (2 * r), d / (2 * r)];
    this.set([[c.x, c.z, r, 0.5]], this.stretch);
    this.mesh.visible = true;
  }

  // the skeleton's capsules where the pose puts them, in the scene's coordinates (posedCapsules' layout)
  pose(caps, n) {
    const blobs = shadowBlobs(caps, n, this.floor, this.H);
    if (!blobs.length) return;
    let cx = 0, cz = 0;                    // the plane stays under the body as it walks
    for (const b of blobs) { cx += b[0] / blobs.length; cz += b[1] / blobs.length; }
    this.mesh.position.x = cx; this.mesh.position.z = cz;
    this.set(blobs, [1, 1]);
  }

  set(blobs, stretch) {
    this.blobs = blobs; this.stretch = stretch;
    const n = Math.min(blobs.length, MAX);
    for (let i = 0; i < n; i++) this.u.blobs.value[i].set(...blobs[i]);
    this.u.count.value = n;
    this.u.stretch.value.set(...stretch);
  }

  darkness(x, z) { return darknessAt(this.blobs, x, z, this.stretch); }
}
