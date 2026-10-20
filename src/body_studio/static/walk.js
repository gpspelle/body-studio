// Walking and jumping: W A S D (or the arrows) walk the body across the floor, Space jumps. Free of
// three.js like pose.js, so it can be tested on its own (tests/js/walk.test.mjs). The Walker moves
// the skeleton: joint angles for a walk cycle or a jump, blended over the pose set in the panel,
// and the whole body's place (Skeleton.place). Everything skinned with the body's weights (the
// body, clothes, hair, shoes, tattoos) follows the bones, so it all moves together.
import { q, v3 } from "./pose.js";

const TAU = 2 * Math.PI;
// a bump of height 1 at phase c, about w wide, on a cycle (the phase wraps at 1)
const bump = (p, c, w) => { const d = ((p - c + 1.5) % 1) - 0.5; return Math.exp(-0.5 * (d / w) ** 2); };
const smooth = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
const ease = (x, target, rate, dt) => x + (target - x) * (1 - Math.exp(-rate * dt));

// One walk cycle for the left side at phase p (0: the left heel strikes; the right side is half a
// cycle on), in the joints' own degrees. Sagittal angles of normal gait, simplified (Perry &
// Burnfield, Gait Analysis, 2010): the hip from 30 forward to 10 back, the knee bent 15 as the
// heel takes the weight and 60 in the swing, the ankle up before push-off and down at toe-off; the
// arm swings against the leg on its side, the chest turns against the pelvis.
export function gait(p) {
  const c = Math.cos(TAU * p);
  return {
    hip: 10 + 20 * c,
    knee: 4 + 12 * bump(p, 0.12, 0.06) + 56 * bump(p, 0.72, 0.1),
    ankle: 2 + 9 * bump(p, 0.4, 0.1) - 18 * bump(p, 0.62, 0.06),
    shoulder: -16 * c,
    elbow: 18 - 10 * c,
    chest: 6 * c,
  };
}
export const HIP_RANGE = [-10, 30];             // what gait() swings the hip between

// sizes in the person's heights (H) and seconds: 1.2 m/s for someone 1.75 m tall, a jump of 35 cm
export const WALK = { speed: 0.7, accel: 6, turn: 7, gravity: 9.81 / 1.75, jump: 0.2, crouch: 0.22, land: 0.24 };

export class Walker {
  // sk: the Skeleton; rig: its rig (frame, height)
  constructor(sk, rig, opts = {}) {
    this.sk = sk;
    this.o = { ...WALK, ...opts };
    this.H = rig.height;
    const fr = rig.frame;
    this.up = v3.unit(fr.up);
    this.front = v3.unit(fr.front);
    this.side = v3.cross(this.up, this.front);  // where the front turns to for a positive heading
    this.feet = ["ankle_l", "ankle_r", "toe_end_l", "toe_end_r"].map((n) => sk.index(n)).filter((j) => j >= 0);
    this.ground = Math.min(...this.feet.map((j) => v3.dot(sk.rest[j], this.up)));
    // a cycle's length: two steps, each as far as the foot travels under the hip
    const hip = sk.index("hip_l"), ankle = sk.index("ankle_l");
    const leg = hip >= 0 && ankle >= 0 ? v3.len(v3.sub(sk.rest[ankle], sk.rest[hip])) : 0.45 * this.H;
    this.stride = 2 * leg * (Math.sin(HIP_RANGE[1] * Math.PI / 180) - Math.sin(HIP_RANGE[0] * Math.PI / 180));
    this.armSide = this._armSide();
    this.pos = [0, 0, 0];                       // on the floor, from where the body was scanned
    this.heading = 0;                           // radians about up, from the way the scan faces
    this.speed = 0;                             // in H per second
    this.phase = 0;
    this.walking = 0;                           // how much of the walk cycle is shown, 0..1
    this.jump = null;                           // { t, flight, drop } while jumping
    this.base = null;                           // the pose from the panel, while the walker moves the body
  }

  // the arms swing nearer the body than the A-pose holds them, but not into it: the smallest
  // sideways angle at which they swing clear of the trunk
  _armSide() {
    const sk = this.sk, keep = sk.angles.map((a) => (a ? { ...a } : null));
    const rest = Math.min(...["shoulder_l", "shoulder_r"].map((n) => sk.restAngles[sk.index(n)]?.side ?? 10));
    let side = Math.min(10, rest);
    if (sk.body) {
      const limit = Math.max(sk.body.depth(sk.solve()), sk.body.tol);
      for (; side < rest; side += 2) {
        let ok = true;
        for (const flex of [-18, 18]) {
          for (const s of ["l", "r"]) { const j = sk.index("shoulder_" + s); sk.angles[j] = sk.clamp(j, { flex, side, twist: 0 }); }
          if (sk.body.depth(sk.solve()) > limit) ok = false;
        }
        if (ok) break;
      }
      sk.angles = keep; sk.solve();
    }
    return side;
  }

  get active() { return !!this.base; }
  get airborne() { return !!(this.jump && this.jump.flight !== null && this.jump.t >= this.o.crouch && this.jump.t < this.o.crouch + this.jump.flight); }

  // the way the body faces now
  facing() { return q.rot(q.axisAngle(this.up, this.heading), this.front); }

  // the pose set in the panel: the one shown when the walker stops
  basePose() {
    if (!this.base) return this.sk.pose();
    const now = this.sk.angles;
    this.sk.angles = this.base;
    const p = this.sk.pose();
    this.sk.angles = now;
    return p;
  }

  // stop at once (no steps to finish, no landing): the panel's pose again, where the body is now.
  // Whether it was moving the body.
  settle() {
    const was = !!this.base;
    this.speed = 0; this.walking = 0; this.jump = null;
    if (this.base) { this.sk.angles = this.base; this.base = null; }
    this.sk.place = { q: this.sk.place.q, t: this.pos.slice() };
    this.sk.solve();
    return was;
  }

  // back where the body was scanned, facing the same way, in the panel's pose
  home() {
    this.pos = [0, 0, 0]; this.heading = 0; this.speed = 0; this.jump = null; this.walking = 0;
    if (this.base) { this.sk.angles = this.base; this.base = null; }
    this.sk.place = { q: q.id(), t: [0, 0, 0] };
    this.sk.solve();
  }

  // One frame: move is the way to walk (on the floor, in the body's coordinates, length up to 1;
  // null or zero to stop), jump starts a jump. Returns whether the body moved.
  update(dt, { move = null, jump = false } = {}) {
    dt = Math.min(Math.max(dt, 0), 0.1);
    const o = this.o, up = this.up;
    let m = move ? v3.sub(move, v3.scale(up, v3.dot(move, up))) : [0, 0, 0];
    const want = Math.min(1, v3.len(m));
    if (jump && !this.jump) {
      const v0 = Math.sqrt(2 * o.gravity * o.jump);
      this.jump = { t: 0, flight: 2 * v0 / o.gravity, v0, drop: null };
    }
    if (!this.base && !want && !this.jump && this.speed < 1e-4) return false;
    if (!this.base) this.base = this.sk.angles.map((a) => (a ? { ...a } : null));

    // turn toward the way to go, the short way round, and walk the way the body faces
    if (want > 1e-3) {
      m = v3.unit(m);
      const target = Math.atan2(v3.dot(m, this.side), v3.dot(m, this.front));
      let d = ((target - this.heading + 3 * Math.PI) % TAU) - Math.PI;
      const turn = d * (1 - Math.exp(-o.turn * dt));
      this.heading += turn;
    }
    const grounded = !this.airborne;
    if (grounded) this.speed = ease(this.speed, want * o.speed, o.accel, dt);
    // turning on the spot comes before walking off: little speed while facing away
    const facing = this.facing();
    const along = want > 1e-3 ? Math.max(0, v3.dot(facing, v3.unit(m))) : 1;
    const v = this.speed * (0.35 + 0.65 * along);
    this.pos = v3.add(this.pos, v3.scale(facing, v * this.H * dt));
    if (grounded) this.phase = (this.phase + v * this.H / this.stride * dt) % 1;
    this.walking = ease(this.walking, smooth(this.speed / (0.25 * o.speed)), 10, dt);

    // the joint angles: the panel's pose, the walk cycle over it, the jump over both
    const sk = this.sk, A = this.base.map((a) => (a ? { ...a } : null));
    const w = this.walking;
    const set = (name, key, value, mix = w) => {
      const j = sk.index(name);
      if (j < 0 || !A[j]) return;
      A[j][key] = A[j][key] + (value - A[j][key]) * mix;
    };
    if (w > 1e-4) {
      for (const [s, p] of [["l", this.phase], ["r", (this.phase + 0.5) % 1]]) {
        const g = gait(p);
        set("hip_" + s, "flex", g.hip); set("hip_" + s, "side", 2); set("hip_" + s, "twist", 0);
        set("knee_" + s, "flex", g.knee); set("knee_" + s, "twist", 0);
        set("ankle_" + s, "flex", g.ankle); set("ankle_" + s, "side", 0);
        set("shoulder_" + s, "flex", g.shoulder); set("shoulder_" + s, "side", this.armSide); set("shoulder_" + s, "twist", 0);
        set("elbow_" + s, "flex", g.elbow);
      }
      set("chest", "twist", gait(this.phase).chest * Math.min(1, this.speed / o.speed));
      set("spine", "flex", 3 * Math.min(1, this.speed / o.speed));
    }
    let lift = 0, k = 0, tuck = 0, reach = 0;
    if (this.jump) {
      const J = this.jump;
      J.t += dt;
      const end = o.crouch + J.flight + o.land;
      if (J.t < o.crouch) { k = Math.sin(Math.PI * J.t / o.crouch); reach = -k; }   // down, then up
      else if (J.t < o.crouch + J.flight) {
        const t = J.t - o.crouch, f = t / J.flight;
        lift = (J.v0 * t - 0.5 * o.gravity * t * t) * this.H;
        tuck = Math.sin(Math.PI * f); reach = Math.sin(Math.PI * Math.min(1, 1.6 * f));
      } else if (J.t < end) k = 0.8 * Math.sin(Math.PI * (J.t - o.crouch - J.flight) / o.land);
      else this.jump = null;
      const add = (name, key, d) => { const j = sk.index(name); if (j >= 0 && A[j]) A[j][key] += d; };
      for (const s of ["l", "r"]) {
        add("hip_" + s, "flex", 40 * k + 25 * tuck);
        add("knee_" + s, "flex", 75 * k + 45 * tuck);
        add("ankle_" + s, "flex", 22 * k - 20 * tuck);
        add("shoulder_" + s, "flex", 45 * reach);
        add("elbow_" + s, "flex", 15 * Math.abs(reach));
      }
      add("spine", "flex", 18 * k);
    }
    A.forEach((a, j) => { if (a) sk.angles[j] = sk.clamp(j, a); });

    // the lowest foot stays on the floor (the body bobs and crouches with the legs), except in the
    // air, where the body rises and falls as anything thrown does
    sk.place = { q: q.axisAngle(up, this.heading), t: this.pos };
    sk.solve();
    let drop = this.ground - Math.min(...this.feet.map((j) => v3.dot(sk.P[j], up)));
    if (this.airborne) { if (this.jump.drop === null) this.jump.drop = drop; drop = this.jump.drop; }
    else if (this.jump) this.jump.drop = null;
    const ground = this.feet.length ? drop : 0;
    sk.place = { q: sk.place.q, t: v3.add(this.pos, v3.scale(up, ground + lift)) };
    sk.solve();

    // stopped and landed: the panel's pose again, exactly; the body stays where it walked to
    if (!want && !this.jump && this.speed < 1e-3 && this.walking < 1e-3) {
      this.speed = 0; this.walking = 0;
      sk.angles = this.base; this.base = null;
      sk.place = { q: sk.place.q, t: this.pos.slice() };
      sk.solve();
    }
    return true;
  }
}
