// The GPU step of flesh.js: a Spark object modifier that runs after SplatSkinning on every splat
// of a mesh (the body, a tattoo's ink, an item of clothing). The maths is flesh.js's, in GLSL.
// Per splat it reads six layers of data (made at rest, see Flesh.layers) and the mesh's own
// skinning textures (for the rotation the skinning gave the splat); per frame it takes the posed
// capsules, the channels' levels and the sliders.
import * as THREE from "three";
import { dyno } from "@sparkjsdev/spark";
import { MAX_CAPSULES, MAX_TWISTS, NUM_CHANNELS, PARTS, SHADE, COLLIDE, FOLD, STRETCH, SHADE_CHANNEL, foldNeighbours } from "/static/flesh.js";

const GLOBALS = `
vec3 fleshRot(vec4 q, vec3 v) {
  vec3 t = 2.0 * cross(q.xyz, v);
  return v + q.w * t + cross(q.xyz, t);
}
vec3 fleshBone(sampler2D bones, int b, vec3 p) {
  vec4 q = texelFetch(bones, ivec2(0, b), 0), d = texelFetch(bones, ivec2(1, b), 0);
  vec3 t = 2.0 * vec3(-d.w * q.x + d.x * q.w - d.y * q.z + d.z * q.y,
                      -d.w * q.y + d.x * q.z + d.y * q.w - d.z * q.x,
                      -d.w * q.z - d.x * q.y + d.y * q.x + d.z * q.w);
  return fleshRot(q, p) + t;
}
vec4 fleshQMul(vec4 a, vec4 b) {
  return vec4(a.w * b.xyz + b.w * a.xyz + cross(a.xyz, b.xyz), a.w * b.w - dot(a.xyz, b.xyz));
}
vec4 fleshSeg(vec3 p, vec3 a, vec3 b) {
  vec3 e = b - a, d = p - a;
  float t = clamp(dot(d, e) / max(dot(e, e), 1e-12), 0.0, 1.0);
  vec3 o = d - e * t;
  return vec4(o, length(o));
}
`;

export class Flesh {
  // mesh: a SplatMesh with its SplatSkinning (skinning); n: its splats; H: the person's height;
  // kind: { shade, collide, stretch, swing, fold } (which effects this mesh takes; every mesh takes
  // the twist along the limbs)
  constructor(mesh, skinning, n, H, kind) {
    this.mesh = mesh; this.skinning = skinning; this.n = n;
    const { width, height, depth } = skinning.skinTexture.image;
    this.layers = [];
    this.textures = [];
    for (let k = 0; k < 6; k++) {
      const a = new Float32Array(width * height * depth * 4);
      for (let i = 0; i < n; i++) a[i * 4 + 3] = -1;            // no part, no channel, no bones
      if (k === 1) for (let i = 0; i < n; i++) a[i * 4 + 3] = 0;   // nothing near at rest
      if (k === 5) for (let i = 0; i < n; i++) { a[i * 4 + 1] = -1; a[i * 4 + 3] = 0; }   // no twist, no fold
      const t = new THREE.DataArrayTexture(a, width, height, depth);
      t.format = THREE.RGBAFormat; t.type = THREE.FloatType; t.internalFormat = "RGBA32F"; t.needsUpdate = true;
      this.layers.push(a); this.textures.push(t);
    }
    const U = (key, type, value, count) => new dyno.DynoUniform({ key, type, value, ...(count && { count }) });
    this.caps = new Float32Array(MAX_CAPSULES * 8);
    this.chans = new Float32Array(NUM_CHANNELS);
    this.twists = new Float32Array(MAX_TWISTS * 8);
    this.u = {
      d: this.textures.map((t, k) => U("fleshD" + k, "sampler2DArray", t)),
      skin: U("fleshSkin", "usampler2DArray", skinning.skinTexture),
      bones: U("fleshBones", "sampler2D", skinning.boneTexture),
      caps: U("fleshCaps", "vec4", this.caps, MAX_CAPSULES * 2),
      nCaps: U("fleshNCaps", "int", 0),
      chans: U("fleshChans", "float", this.chans, NUM_CHANNELS),
      // x, y: weight and muscle sliders; z: the height; w: unused
      shape: U("fleshShape", "vec4", new THREE.Vector4(0, 0, H, 0)),
      // x: contact shading, y: push out of the body, z: grow where stretched, w: swing (layer 4's x)
      flags: U("fleshFlags", "vec4", new THREE.Vector4(+!!kind.shade, +!!kind.collide, +!!kind.stretch, +!!kind.swing)),
      // x: skin folds at bent joints (the parts each part folds against: neigh, bitmasks)
      flags2: U("fleshFlags2", "vec4", new THREE.Vector4(+!!kind.fold, 0, 0, 0)),
      neigh: U("fleshNeigh", "float", Float32Array.from(foldNeighbours()), PARTS.length),
      // per limb (flesh.js twistState): (pivot, radians), (axis, 0)
      twists: U("fleshTwists", "vec4", this.twists, MAX_TWISTS * 2),
      // the swing for this mesh (flesh.js Swing), in the mesh's coordinates: xyz, the offset; w,
      // the turn (radians) about swingUp through swingAt (its anchor)
      swing: U("fleshSwing", "vec4", new THREE.Vector4()),
      swingAt: U("fleshSwingAt", "vec4", new THREE.Vector4()),
      swingUp: U("fleshSwingUp", "vec4", new THREE.Vector4(0, 1, 0, 0)),
    };
    const u = this.u;
    mesh.objectModifier = dyno.dynoBlock({ gsplat: dyno.Gsplat }, { gsplat: dyno.Gsplat }, ({ gsplat }) => {
      const d = dyno.dyno({
        inTypes: { gsplat: dyno.Gsplat, d0: "sampler2DArray", d1: "sampler2DArray", d2: "sampler2DArray", d3: "sampler2DArray",
                   d4: "sampler2DArray", d5: "sampler2DArray", skin: "usampler2DArray", bones: "sampler2D", caps: "vec4", nCaps: "int", chans: "float",
                   shape: "vec4", flags: "vec4", flags2: "vec4", neigh: "float", twists: "vec4", swing: "vec4", swingAt: "vec4", swingUp: "vec4" },
        outTypes: { gsplat: dyno.Gsplat },
        inputs: { gsplat, d0: u.d[0], d1: u.d[1], d2: u.d[2], d3: u.d[3], d4: u.d[4], d5: u.d[5], skin: u.skin, bones: u.bones,
                  caps: u.caps, nCaps: u.nCaps, chans: u.chans, shape: u.shape, flags: u.flags, flags2: u.flags2, neigh: u.neigh,
                  twists: u.twists, swing: u.swing, swingAt: u.swingAt, swingUp: u.swingUp },
        globals: () => [GLOBALS],
        statements: ({ inputs: I, outputs: O }) => statements(I, O),
      });
      return { gsplat: d.outputs.gsplat };
    });
    mesh.updateGenerator();
  }

  // after changing this.layers
  upload() { for (const t of this.textures) t.needsUpdate = true; this.mesh.updateVersion?.(); }

  // per frame: posed capsules (posedCapsules) and how many, channel levels, sliders, the limbs'
  // twists (twistState)
  set({ caps, nCaps, chans, shape, swing, twists }) {
    if (caps) { this.caps.set(caps); this.u.nCaps.value = nCaps; }
    if (chans) this.chans.set(chans);
    if (twists) this.twists.set(twists);
    if (shape) { this.u.shape.value.x = shape[0]; this.u.shape.value.y = shape[1]; }
    if (swing?.o) {                     // (the body and the ink are given both, and take neither)
      const { o, at, up } = swing;
      this.u.swing.value.set(o[0], o[1], o[2], o[3] || 0);
      if (at) this.u.swingAt.value.set(at[0], at[1], at[2], 0);
      if (up) this.u.swingUp.value.set(up[0], up[1], up[2], 0);
    }
    this.mesh.updateVersion?.();
  }

  dispose() { for (const t of this.textures) t.dispose(); if (this.mesh.objectModifier) { this.mesh.objectModifier = null; this.mesh.updateGenerator(); } }
}

const f = (x) => (Number.isInteger(x) ? x.toFixed(1) : String(x));

function statements(I, O) {
  const g = O.gsplat;
  return [
    `${g} = ${I.gsplat};`,
    `if (isGsplatActive(${g}.flags)) {`,
    `  ivec3 tc = splatTexCoord(${g}.index);`,
    `  vec4 d0 = texelFetch(${I.d0}, tc, 0), d1 = texelFetch(${I.d1}, tc, 0), d2 = texelFetch(${I.d2}, tc, 0),`,
    `       d3 = texelFetch(${I.d3}, tc, 0), d4 = texelFetch(${I.d4}, tc, 0), d5 = texelFetch(${I.d5}, tc, 0);`,
    // the rotation and translation the skinning gave this splat (the same blend as Spark's)
    `  uvec4 sd = texelFetch(${I.skin}, tc, 0);`,
    `  vec4 qb = vec4(0.0), db = vec4(0.0);`,
    `  for (int i = 0; i < 4; i++) {`,
    `    float w = float(sd[i] & 0xffu) / 255.0;`,
    `    if (w <= 0.0) continue;`,
    `    int b = int((sd[i] >> 8u) & 0xffu);`,
    `    vec4 bq = texelFetch(${I.bones}, ivec2(0, b), 0), bd = texelFetch(${I.bones}, ivec2(1, b), 0);`,
    `    if (i > 0 && dot(qb, bq) < 0.0) { bq = -bq; bd = -bd; }`,
    `    qb += w * bq; db += w * bd;`,
    `  }`,
    `  float qn = length(qb);`,
    `  if (qn < 1e-8) { qb = vec4(0.0, 0.0, 0.0, 1.0); db = vec4(0.0); qn = 1.0; }`,
    `  qb /= qn; db /= qn;`,
    `  vec3 tb = 2.0 * vec3(-db.w * qb.x + db.x * qb.w - db.y * qb.z + db.z * qb.y,`,
    `                       -db.w * qb.y + db.x * qb.z + db.y * qb.w - db.z * qb.x,`,
    `                       -db.w * qb.z - db.x * qb.y + db.y * qb.x + db.z * qb.w);`,
    `  vec3 rest = fleshRot(vec4(-qb.xyz, qb.w), ${g}.center - tb);`,
    `  float H = ${I.shape}.z;`,
    // offsets made at rest: sliders, then the two channel slots (or a wrinkle's shading)
    `  vec3 off = d0.xyz * ${I.shape}.x + d1.xyz * ${I.shape}.y;`,
    `  float tone = 1.0;`,
    `  int ca = int(floor(d2.w + 0.5)), cb = int(floor(d3.w + 0.5));`,
    `  if (ca >= 0 && ca < ${NUM_CHANNELS}) off += d2.xyz * ${I.chans}[ca];`,
    `  if (cb >= 0 && cb < ${NUM_CHANNELS}) off += d3.xyz * ${I.chans}[cb];`,
    `  else if (cb >= ${SHADE_CHANNEL} && cb < ${SHADE_CHANNEL + NUM_CHANNELS}) tone *= 1.0 - d3.x * ${I.chans}[cb - ${SHADE_CHANNEL}];`,
    `  ${g}.center += fleshRot(qb, off);`,
    // skin pulled apart between two bones: the splat grows
    `  if (${I.flags}.z > 0.5 && d4.w >= 0.0) {`,
    `    float gl = length(d4.xyz);`,
    `    if (gl > 1e-12) {`,
    `      int code = int(floor(d4.w + 0.5)), b1 = code / 256, b2 = code - 256 * b1;`,
    `      vec3 dd = fleshBone(${I.bones}, b2, rest) - fleshBone(${I.bones}, b1, rest);`,
    `      float lam = length(fleshRot(qb, d4.xyz / gl) + dd * gl);`,
    // across the skin only: the thinnest axis (through the skin) keeps its size
    `      float grow = pow(clamp(lam, 1.0, ${f(STRETCH.max)}), ${f(STRETCH.power)});`,
    `      vec3 sc = ${g}.scales;`,
    `      float thin = min(sc.x, min(sc.y, sc.z));`,
    `      ${g}.scales = vec3(sc.x > thin ? sc.x * grow : sc.x, sc.y > thin ? sc.y * grow : sc.y, sc.z > thin ? sc.z * grow : sc.z);`,
    `    }`,
    `  }`,
    // the limb's twist spread along it: turned about the limb's axis, with its orientation
    `  int lt = int(floor(d5.y + 0.5));`,
    `  if (lt >= 0 && lt < ${MAX_TWISTS} && d5.x != 0.0) {`,
    `    vec4 pv = ${I.twists}[2 * lt], ax = ${I.twists}[2 * lt + 1];`,
    `    float ha = 0.5 * pv.w * d5.x;`,
    `    vec4 qt = vec4(ax.xyz * sin(ha), cos(ha));`,
    `    ${g}.center = pv.xyz + fleshRot(qt, ${g}.center - pv.xyz);`,
    `    ${g}.quaternion = normalize(fleshQMul(qt, ${g}.quaternion));`,
    `  }`,
    `  float part = d0.w;`,
    // loose cloth and hair lag behind (before the push out of the body, which then holds them off it)
    // (turned behind the anchor about its up first, then carried back)
    `  if (${I.flags}.w > 0.5 && d4.x > 0.0) {`,
    `    float ang = ${I.swing}.w * d4.x, cs = cos(ang), sn = sin(ang);`,
    `    vec3 ax = ${I.swingUp}.xyz, r = ${g}.center - ${I.swingAt}.xyz;`,
    `    ${g}.center = ${I.swingAt}.xyz + r * cs + cross(ax, r) * sn + ax * dot(ax, r) * (1.0 - cs) + ${I.swing}.xyz * d4.x;`,
    `  }`,
    // clothes: pushed out of other parts of the body, no deeper than at rest (d4.w)
    `  if (${I.flags}.y > 0.5) {`,
    `    for (int k = 0; k < ${MAX_CAPSULES}; k++) {`,
    `      if (k >= ${I.nCaps}) break;`,
    `      vec4 a = ${I.caps}[2 * k], b = ${I.caps}[2 * k + 1];`,
    `      if (abs(b.w - part) < 0.5) continue;`,
    `      vec4 s = fleshSeg(${g}.center, a.xyz, b.xyz);`,
    `      float extra = a.w + ${f(COLLIDE.margin)} * H - s.w - max(0.0, d4.w);`,
    `      if (extra > 0.0 && s.w > 1e-9) ${g}.center += s.xyz / s.w * extra;`,
    `    }`,
    `  }`,
    // skin at a bent joint: out of the part across the joint, no deeper than at rest (d5.z)
    `  if (${I.flags2}.x > 0.5 && part >= 0.0) {`,
    `    int nb = int(${I.neigh}[int(part)]);`,
    `    for (int k = 0; k < ${MAX_CAPSULES}; k++) {`,
    `      if (k >= ${I.nCaps}) break;`,
    `      vec4 a = ${I.caps}[2 * k], b = ${I.caps}[2 * k + 1];`,
    `      int cp = int(floor(b.w + 0.5));`,
    `      if (cp < 0 || ((nb >> cp) & 1) == 0) continue;`,
    `      vec4 s = fleshSeg(${g}.center, a.xyz, b.xyz);`,
    `      float extra = a.w + ${f(FOLD.margin)} * H - s.w - d5.z;`,
    `      if (extra > 0.0 && s.w > 1e-9) ${g}.center += s.xyz / s.w * extra;`,
    `    }`,
    `  }`,
    // contact shading against how crowded the skin was in the scan (d1.w)
    `  if (${I.flags}.x > 0.5) {`,
    `    float o = 0.0;`,
    `    for (int k = 0; k < ${MAX_CAPSULES}; k++) {`,
    `      if (k >= ${I.nCaps}) break;`,
    `      vec4 a = ${I.caps}[2 * k], b = ${I.caps}[2 * k + 1];`,
    `      if (abs(b.w - part) < 0.5) continue;`,
    `      float dist = fleshSeg(${g}.center, a.xyz, b.xyz).w - a.w;`,
    `      float fo = clamp(1.0 - dist / (${f(SHADE.reach)} * H), 0.0, 1.0);`,
    `      o += fo * fo;`,
    `    }`,
    `    o = min(o, ${f(SHADE.cap)});`,
    `    tone *= clamp(1.0 - ${f(SHADE.depth)} * (o - d1.w), ${f(1 - SHADE.depth)}, ${f(1 + 0.5 * SHADE.depth)});`,
    `  }`,
    `  ${g}.rgba.rgb *= tone;`,
    `}`,
  ];
}
