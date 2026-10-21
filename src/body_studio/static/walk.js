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
// arm swings against the leg on its side. The pelvis turns about 5 degrees each way, the left hip
// forward as the left heel strikes, and the chest turns against it; the weight shifts over the
// foot on the floor: both legs lean 2.5 degrees toward it (the left hip in, the right out), so with
// that foot planted the pelvis moves over it (sway, for the left side: + toward the left).
export function gait(p) {
  const c = Math.cos(TAU * p);
  return {
    hip: 10 + 20 * c,
    knee: 4 + 12 * bump(p, 0.12, 0.06) + 56 * bump(p, 0.72, 0.1),
    ankle: 2 + 9 * bump(p, 0.4, 0.1) - 18 * bump(p, 0.62, 0.06),
    shoulder: -16 * c,
    elbow: 18 - 10 * c,
    pelvis: -5 * c,
    chest: 10 * c,
    sway: 2.5 * Math.sin(TAU * p),
  };
}
export const HIP_RANGE = [-10, 30];
// how much the left foot is on the floor at phase p: from its heel strike (0) to its toe off (0.6)
export const stance = (p) => {
  const e = 0.03, rise = Math.min(1, Math.max(0, (p < 0.5 ? p : p - 1) / e + 0.5)), fall = Math.min(1, Math.max(0, (0.6 - p) / e + 0.5));
  return p < 0.8 ? Math.min(rise, fall) + 1e-6 : rise + 1e-6;
};

// Q / E raise the left / right arm, Z / C the left / right knee (the body's own left and right),
// as a game's emote keys do; pressed again, it comes down. Angles in the joints' own degrees.
export const LIMBS = ["arm_l", "arm_r", "knee_l", "knee_r"];
const RAISED = {
  arm: { shoulder: { flex: 0, side: 165, twist: 0 }, elbow: { flex: 8 } },
  knee: { hip: { flex: 95, side: 2, twist: 0 }, knee: { flex: 100, twist: 0 }, ankle: { flex: -10 } },
};             // what gait() swings the hip between

// sizes in the person's heights (H) and seconds: 1.2 m/s for someone 1.75 m tall, a jump of 35 cm;
// view: how long (s) the camera takes to catch up with where the feet have carried the body
export const WALK = { speed: 0.7, accel: 6, turn: 7, gravity: 9.81 / 1.75, jump: 0.2, crouch: 0.22, land: 0.24, view: 0.6 };

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
    this.view = [0, 0, 0];                      // what the camera follows: pos without the surge of each step
    this.heading = 0;                           // radians about up, from the way the scan faces
    this.speed = 0;                             // in H per second
    this.phase = 0;
    this.walking = 0;                           // how much of the walk cycle is shown, 0..1
    this.jump = null;                           // { t, flight, drop } while jumping
    this.base = null;                           // the pose from the panel, while the walker moves the body
    this.relax = 0;                             // how far arms held out as in the scan have come down, 0..1
    this.relaxing = [];                         // the sides whose arms are as in the scan
    // arms and knees raised with a key: whether each is up, and how far it is up now (0..1)
    this.limbs = Object.fromEntries(LIMBS.map((n) => [n, { on: false, v: 0 }]));
    // in a room (room.js, the page's house.js): (from, to) -> where the body may go instead of to,
    // both places of the body (pos); null: the floor goes on for ever
    this.bound = null;
    this.rest = null;                           // sitting or leaning (restAt), while it lasts
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

  // where each foot touches the floor, with the body at its root (no place): its heel and toe
  // (footPoints) and how much it stands on the toe, k (0: on the heel), the lower of the two
  _contacts() {
    return ["l", "r"].map((s) => {
      const [a, t] = this.footPoints(s);
      if (!a) return { a: [0, 0, 0], t: [0, 0, 0], k: 0 };
      if (!t) return { a: a.slice(), t: a.slice(), k: 0 };
      const up = this.up, ha = v3.dot(a, up), ht = v3.dot(t, up), k = 1 / (1 + Math.exp((ht - ha) / (0.0015 * this.H)));
      return { a: a.slice(), t: t.slice(), k };
    });
  }

  // The camera's point (view) goes on at the walk's even pace (vel: the speed the walk is set to
  // go, along the way the body faces) and is drawn to where the feet have carried the body (pos) over o.view seconds. The feet carry it
  // in surges, fast as one leg pushes off and slow as the other takes the weight, and a camera
  // that followed them shook back and forth with every step.
  _follow(dt, vel) {
    const from = this.view;
    let to = v3.add(from, v3.scale(vel, dt));
    if (this.bound) to = this.bound(from, to);
    this.view = v3.add(to, v3.scale(v3.sub(this.pos, to), dt > 0 ? 1 - Math.exp(-dt / this.o.view) : 0));
    if (!this._behind()) this.view = this.pos.slice();
  }

  // the heel (the floor under the ankle at rest, carried by the ankle) and the tip of the toes of
  // foot s, where the skeleton is now: the two points a foot rolls over in a step
  footPoints(s) {
    const sk = this.sk, a = sk.index("ankle_" + s), t = sk.index("toe_end_" + s);
    if (a < 0) return [null, null];
    this.heelOff ??= {};
    this.heelOff[s] ??= v3.scale(this.up, this.ground - v3.dot(sk.rest[a], this.up));
    return [v3.add(sk.P[a], q.rot(sk.W[a], this.heelOff[s])), t >= 0 ? sk.P[t] : null];
  }

  get active() { return !!this.base; }
  // whether the next frames still change the body (walking, jumping, an arm or knee on its way)
  get busy() {
    return this.speed > 1e-4 || this.walking > 1e-3 || !!this.jump || this._easing() || (!!this.rest && !this.rest.still) || this._behind();
  }
  _easing() {
    return LIMBS.some((n) => Math.abs(this.limbs[n].v - +this.limbs[n].on) > 1e-3) ||
      (!!this.base && this.relaxing.length > 0 && this.relax < 0.999);
  }
  // whether the camera's point is still on its way to the body
  _behind() { return v3.len(v3.sub(this.view, this.pos)) > 1e-3 * this.H; }
  _limbsUp() { return LIMBS.some((n) => this.limbs[n].on || this.limbs[n].v > 1e-3); }

  // raise an arm or a knee, or lower it if it is up; one knee at a time (the body stands on the
  // other). Returns whether it is now up.
  toggle(name) {
    const l = this.limbs[name];
    if (!l) return false;
    l.on = !l.on;
    if (l.on && name.startsWith("knee")) this.limbs[name === "knee_l" ? "knee_r" : "knee_l"].on = false;
    return l.on;
  }
  raised() { return LIMBS.filter((n) => this.limbs[n].on); }

  // the arms held out as in the scan, brought down beside the body by f (0..1), on pose A
  _relaxed(A, f) {
    for (const s of this.relaxing) {
      const sh = A[this.sk.index("shoulder_" + s)], el = A[this.sk.index("elbow_" + s)];
      for (const [k, v] of [["flex", 0], ["side", this.armSide], ["twist", 0]]) sh[k] += (v - sh[k]) * f;
      if (el) el.flex += (10 - el.flex) * f;
    }
    return A;
  }

  // angles a for joint j within its range; a joint the walker left as the panel had it stays exactly so
  _limit(j, a) {
    const b = this.base[j];
    if (!a) return null;
    if (b && a.flex === b.flex && a.side === b.side && a.twist === b.twist) return { ...b };
    return this.sk.clamp(j, a);
  }

  // the pose the walker leaves: the panel's, with arms that were as in the scan now down
  _leave() {
    const A = this._relaxed(this.base.map((a) => (a ? { ...a } : null)), 1);
    this.sk.angles = A.map((a, j) => this._limit(j, a));
    this.base = null; this.relax = 0; this.relaxing = []; this.lastFeet = null;
    for (const n of LIMBS) this.limbs[n] = { on: false, v: 0 };
  }
  get airborne() { return !!(this.jump && this.jump.flight !== null && this.jump.t >= this.o.crouch && this.jump.t < this.o.crouch + this.jump.flight); }

  // the way the body faces now
  facing() { return q.rot(q.axisAngle(this.up, this.heading), this.front); }

  // the pose set in the panel: the one shown when the walker stops
  basePose() {
    if (!this.base) return this.sk.pose();
    const now = this.sk.angles;
    this.sk.angles = this._relaxed(this.base.map((a) => (a ? { ...a } : null)), 1);
    const p = this.sk.pose();
    this.sk.angles = now;
    return p;
  }

  // stop at once (no steps to finish, no landing, arms and knees down): the panel's pose again,
  // where the body is now. Whether it was moving the body.
  settle() {
    const was = !!this.base;
    if (this.rest) { this.pos = this.rest.from.slice(); this.heading = this.rest.fromHeading; this.rest = null; }
    this.speed = 0; this.walking = 0; this.jump = null; this.view = this.pos.slice();
    if (this.base) this._leave();
    this.sk.place = { q: this.sk.place.q, t: this.pos.slice() };
    this.sk.solve();
    return was;
  }

  // back where the body was scanned, facing the same way, in the panel's pose
  home() {
    this.pos = [0, 0, 0]; this.view = [0, 0, 0]; this.heading = 0; this.speed = 0; this.jump = null; this.walking = 0; this.rest = null;
    if (this.base) this._leave();
    this.sk.place = { q: q.id(), t: [0, 0, 0] };
    this.sk.solve();
  }

  // One frame: move is the way to walk (on the floor, in the body's coordinates, length up to 1;
  // null or zero to stop), jump starts a jump. Returns whether the body moved.
  update(dt, { move = null, jump = false } = {}) {
    dt = Math.min(Math.max(dt, 0), 0.1);
    if (this.rest) return this._resting(dt, !!(move && v3.len(move) > 1e-3) || jump);
    const o = this.o, up = this.up, from = this.pos.slice();
    let m = move ? v3.sub(move, v3.scale(up, v3.dot(move, up))) : [0, 0, 0];
    const want = Math.min(1, v3.len(m));
    if (jump && !this.jump) {
      const v0 = Math.sqrt(2 * o.gravity * o.jump);
      this.jump = { t: 0, flight: 2 * v0 / o.gravity, v0, drop: null };
    }
    if (want > 1e-3) { this.limbs.knee_l.on = false; this.limbs.knee_r.on = false; }   // knees come down to walk
    const quiet = !want && !this.jump && this.speed < 1e-4 && this.walking < 1e-4 && !this._easing();
    if (quiet && (!this.base ? !this._limbsUp() : this._limbsUp())) {   // nothing changes, but the camera's point
      if (!this._behind()) return false;                                // may still be on its way to the body
      this._follow(dt, [0, 0, 0]);
      return true;
    }
    if (!this.base) {
      this.base = this.sk.angles.map((a) => (a ? { ...a } : null));
      // arms still held out as in the scan come down beside the body, and stay down
      this.relaxing = ["l", "r"].filter((s) => {
        const j = this.sk.index("shoulder_" + s), a = this.base[j], r = this.sk.restAngles[j];
        return a && r && Math.abs(a.flex - r.flex) < 0.5 && Math.abs(a.side - r.side) < 0.5 && r.side > this.armSide + 5;
      });
      this.relax = 0;
    }
    this.relax = ease(this.relax, 1, 6, dt);
    if (this.relax > 0.995) this.relax = 1;
    for (const n of LIMBS) { const l = this.limbs[n]; l.v = ease(l.v, +l.on, 9, dt); if (Math.abs(l.v - +l.on) < 1e-3) l.v = +l.on; }

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
    // in the air the body flies on; on the floor it is carried by the foot on the floor (below)
    if (!grounded) this.pos = v3.add(this.pos, v3.scale(facing, v * this.H * dt));
    if (grounded) this.phase = (this.phase + v * this.H / this.stride * dt) % 1;
    this.walking = ease(this.walking, smooth(this.speed / (0.25 * o.speed)), 10, dt);

    // the joint angles: the panel's pose, the walk cycle over it, the jump over both
    const sk = this.sk, A = this._relaxed(this.base.map((a) => (a ? { ...a } : null)), this.relax);
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
      const g = gait(this.phase), pace = Math.min(1, this.speed / o.speed);
      set("chest", "twist", g.chest * pace);
      set("pelvis", "twist", g.pelvis * pace);
      set("spine", "flex", 3 * pace);
      // the weight over the foot on the floor: both legs lean toward it
      for (const [s, k] of [["l", -1], ["r", 1]]) { const j = sk.index("hip_" + s); if (j >= 0 && A[j]) A[j].side += k * g.sway * w * pace; }
    }
    // an arm or a knee raised with its key, over the walk
    for (const n of LIMBS) {
      const v = smooth(this.limbs[n].v), [part, s] = n.split("_");
      if (v < 1e-4) continue;
      for (const [joint, angles] of Object.entries(RAISED[part]))
        for (const [key, value] of Object.entries(angles)) set(joint + "_" + s, key, value, v);
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
    A.forEach((a, j) => { sk.angles[j] = this._limit(j, a); });

    // On the floor the foot that carries the body stays where it is: the body moves by as much as
    // that foot moved back under it (the toe, once the heel is up), and a foot that slides is a
    // foot that isn't carrying it. So the walk's speed comes from the legs: small steps as they
    // start and stop move it little, and a turn on the spot pivots it over its feet.
    sk.place = { q: q.id(), t: [0, 0, 0] };
    sk.solve();
    const feet = this._contacts();
    // (a jump from standing crouches and lands on the spot: both feet stay where they are)
    if (!this.airborne && this.lastFeet && this.walking > 1e-4 && !(this.jump && this.walking < 0.05)) {
      // how far each foot moved: its heel and toe, weighed as it stands now (a foot rolling from
      // heel to toe in one frame moves its point of contact, not the body: the camera saw that
      // as a jolt back at every heel strike)
      const H = this.H, at = (f) => v3.add(v3.scale(f.t, f.k), v3.scale(f.a, 1 - f.k));
      const d = feet.map((f, i) => { const l = this.lastFeet[i]; return v3.add(v3.scale(v3.sub(f.t, l.t), f.k), v3.scale(v3.sub(f.a, l.a), 1 - f.k)); });
      // which foot is on the floor: by the walk cycle (each foot stands for 60% of it, both at once
      // just after each heel strikes); when standing (the cycle faded out) the lower one
      const sl = this.walking > 0.05 ? stance(this.phase) / (stance(this.phase) + stance((this.phase + 0.5) % 1))
        : 1 / (1 + Math.exp((v3.dot(at(feet[0]), up) - v3.dot(at(feet[1]), up)) / (0.004 * H)));
      let step = v3.add(v3.scale(d[0], sl), v3.scale(d[1], 1 - sl));
      step = v3.sub(step, v3.scale(up, v3.dot(step, up)));
      // while the walk blends in or out the feet come together from the scan's wider stance (or go
      // back to it): that sideways part isn't a step, only the sway of a walk under way is
      const side = this.side;
      step = v3.sub(step, v3.scale(side, v3.dot(step, side) * (1 - smooth((this.walking - 0.9) / 0.1))));
      this.pos = v3.sub(this.pos, q.rot(q.axisAngle(up, this.heading), step));
    }
    this.lastFeet = feet;
    // walls and furniture in the way (in a room): the body goes along them instead
    if (this.bound) this.pos = this.bound(from, this.pos);
    this._follow(dt, v3.scale(facing, v * this.H * (grounded ? this.walking : 1)));
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

    // stopped, landed, arms and knees down: the panel's pose again (arms that were held out as in
    // the scan stay down); the body stays where it walked to
    if (!want && !this.jump && this.speed < 1e-3 && this.walking < 1e-3 && !this._limbsUp() && !this._easing()) {
      this.speed = 0; this.walking = 0;
      this._leave();
      sk.place = { q: sk.place.q, t: this.pos.slice() };
      sk.solve();
    }
    return true;
  }

  // ---------------------------------------------------------------- sitting and leaning
  // Sit down or lean on a wall: target = { kind: "sit", at, facing, height, back } (at: where the
  // hips go, on the seat; facing: the way to face, along the floor; height: the seat's, over the
  // floor; back: whether there is one to lean back on) or { kind: "lean", at, facing } (at: a point
  // on the wall's face; facing: out of the wall). All in the body's coordinates and units. The body
  // turns and steps there as it sits down or leans; moving or jumping gets it up again. Whether it
  // can (not in the air).
  restAt(target) {
    if (this.airborne) return false;
    if (this.rest) this.settle();
    if (!this.base) this.base = this.sk.angles.map((a) => (a ? { ...a } : null));
    this.speed = 0; this.walking = 0; this.jump = null; this.lastFeet = null;
    for (const n of LIMBS) this.limbs[n].on = false;
    const f = v3.unit(v3.sub(target.facing, v3.scale(this.up, v3.dot(target.facing, this.up))));
    const heading = Math.atan2(v3.dot(f, this.side), v3.dot(f, this.front));
    const pose = target.kind === "sit" ? this._sitPose(target.height, target.back) : leanPose();
    const tilt = target.kind === "lean" ? REST.leanTilt * RAD : target.back ? REST.sitBack * RAD : 0;
    const turn = q.mul(q.axisAngle(v3.cross(this.up, f), -tilt), q.axisAngle(this.up, heading));
    // where the hips go: on the seat, or as near the wall as the back lets them
    const sk = this.sk, keep = sk.angles, place = sk.place, pel = sk.index("pelvis");
    sk.angles = this._posed(pose, 1);
    sk.place = { q: turn, t: [0, 0, 0] };
    sk.solve();
    let hips = target.at;
    if (target.kind === "lean") {
      let back = 0;
      for (const [name, depth] of Object.entries(REST.back)) {
        const j = sk.index(name);
        if (j >= 0) back = Math.max(back, v3.dot(v3.sub(sk.P[j], sk.P[pel]), v3.scale(f, -1)) + depth * this.H);
      }
      hips = v3.add(target.at, v3.scale(f, back + 0.004 * this.H));
    }
    const flat = (v) => v3.sub(v, v3.scale(this.up, v3.dot(v, this.up)));
    sk.angles = keep; sk.place = place; sk.solve();
    this.rest = { kind: target.kind, pose, tilt, on: true, v: 0, still: false,
                  hipUp: target.kind === "sit" ? target.height + REST.hipOverSeat * this.H : null,
                  from: this.pos.slice(), fromHeading: this.heading, heading,
                  to: flat(v3.sub(hips, sk.rest[pel])) };
    return true;
  }
  get resting() { return this.rest && this.rest.on ? this.rest.kind : null; }
  // get up (from sitting or leaning): back where the body stood before
  standUp() { if (this.rest) { this.rest.on = false; this.rest.still = false; } }

  // the pose for sitting on a seat `height` over the floor (body units): the hips and knees bent
  // so the thighs lie on the seat with the feet on the floor; hands on the thighs
  _sitPose(height, back) {
    const sk = this.sk, keep = sk.angles, place = sk.place, pel = sk.index("pelvis");
    const knees = ["knee_l", "knee_r"].map((n) => sk.index(n)).filter((j) => j >= 0);
    const hips = ["hip_l", "hip_r"].map((n) => sk.index(n)).filter((j) => j >= 0);
    // the hip joint is about 9 cm above what it sits on (for someone 1.75 m tall), and the thighs
    // lie along the seat: the knees no lower than the hips (else they go through the seat's front)
    // and not much higher (a low seat brings the knees up, but then the hips bend more). The feet
    // reach for the floor, toes pointed if they must; on a seat too high for the legs they hang
    // (the hips are put on the seat, not the feet on the floor), never through the floor.
    const want = height + REST.hipOverSeat * this.H;
    let best = null, bd = Infinity;
    for (let hip = 60; hip <= 120; hip += 5)
      for (let knee = 30; knee <= 130; knee += 5)
        for (const ankle of [null, -30, -15, 15, 30]) {
          const pose = sitPose(hip, knee, back, ankle);
          sk.angles = this._posed(pose, 1);
          sk.place = { q: q.id(), t: [0, 0, 0] };
          sk.solve();
          const foot = Math.min(...this.feet.map((j) => v3.dot(sk.P[j], this.up)));
          const hipUp = v3.dot(sk.P[pel], this.up) - foot;
          const kneeUp = knees.length ? Math.min(...knees.map((j) => v3.dot(sk.P[j], this.up))) - foot : 0;
          const thighUp = hips.length && knees.length ? Math.max(...hips.map((j) => v3.dot(sk.P[j], this.up))) - foot : kneeUp;
          const sag = Math.max(0, thighUp - kneeUp - 0.01 * this.H), lift = Math.max(0, kneeUp - thighUp - 0.06 * this.H);
          const gap = want - hipUp;                // > 0: the feet hang that far off the floor
          const d = (gap < 0 ? -5 * gap : 0.6 * gap) + 2 * sag + 0.5 * lift +
                    0.002 * this.H * (Math.abs(hip - 90) / 5 + (ankle === null ? 0 : Math.abs(ankle) / 15));
          if (d < bd) { bd = d; best = pose; }
        }
    sk.angles = keep; sk.place = place; sk.solve();
    return best;
  }

  // the panel's pose with `pose` ({joint: angles}) over it, by f (0..1)
  _posed(pose, f) {
    const A = this._relaxed(this.base.map((a) => (a ? { ...a } : null)), f);
    for (const [name, angles] of Object.entries(pose)) {
      const j = this.sk.index(name);
      if (j < 0 || !A[j]) continue;
      for (const [k, v] of Object.entries(angles)) A[j][k] += (v - A[j][k]) * f;
    }
    return A.map((a, j) => (a ? this.sk.clamp(j, a) : null));
  }

  _resting(dt, moving) {
    const R = this.rest, sk = this.sk, up = this.up;
    if (moving && R.on) this.standUp();
    if (R.still && R.on) return false;
    R.v = ease(R.v, R.on ? 1 : 0, REST.rate, dt);
    if (Math.abs(R.v - (R.on ? 1 : 0)) < 2e-3) R.v = R.on ? 1 : 0;
    // the body turns and steps over first, then goes down (or comes up, then steps back)
    const go = smooth(Math.min(1, R.v / 0.6)), down = smooth(Math.max(0, (R.v - 0.25) / 0.75));
    let d = ((R.heading - R.fromHeading + 3 * Math.PI) % TAU) - Math.PI;
    this.heading = R.fromHeading + d * go;
    const was = this.pos;
    this.pos = v3.add(R.from, v3.scale(v3.sub(R.to, R.from), go));
    this._follow(dt, dt > 0 ? v3.scale(v3.sub(this.pos, was), 1 / dt) : [0, 0, 0]);
    sk.angles = this._posed(R.pose, down);
    // (tilted back as it goes down: on the wall, or on the seat's back)
    const tilted = q.mul(q.axisAngle(v3.cross(up, q.rot(q.axisAngle(up, R.heading), this.front)), -R.tilt * down),
                         q.axisAngle(up, this.heading));
    sk.place = { q: tilted, t: this.pos };
    sk.solve();
    let drop = this.feet.length ? this.ground - Math.min(...this.feet.map((j) => v3.dot(sk.P[j], up))) : 0;
    if (R.hipUp !== null) {                      // sitting: the hips go on the seat (feet may hang)
      const onSeat = this.ground + R.hipUp - v3.dot(sk.P[sk.index("pelvis")], up);
      drop += (Math.max(onSeat, drop) - drop) * down;
    }
    sk.place = { q: tilted, t: v3.add(this.pos, v3.scale(up, drop)) };
    sk.solve();
    if (R.on && R.v === 1) { R.still = true; this.view = this.pos.slice(); }
    if (!R.on && R.v === 0) {                    // up again: the panel's pose, where it stood
      this.rest = null;
      this.pos = R.from.slice(); this.view = this.pos.slice(); this.heading = R.fromHeading;
      this._leave();
      sk.place = { q: q.axisAngle(up, this.heading), t: this.pos.slice() };
      sk.solve();
    }
    return true;
  }
}

// Sitting and leaning: degrees and fractions of the height. Leaning on a wall, the body stands
// a foot or so out from it, tilted back 8 degrees, the back on the wall, a knee a little bent.
export const REST = { rate: 3, hipOverSeat: 0.05, sitBack: 6, leanTilt: 8,
                      back: { chest: 0.075, spine: 0.07, pelvis: 0.085 } };
function sitPose(hip, knee, back, ankle = null) {
  const both = (j, a) => ({ [j + "_l"]: a, [j + "_r"]: a });
  const pose = { ...both("hip", { flex: hip, side: 5, twist: 0 }), ...both("knee", { flex: knee, twist: 0 }),
                 ...both("ankle", { flex: ankle ?? Math.max(-15, Math.min(15, knee - hip)), side: 0 }),
                 ...both("shoulder", { flex: 12, side: 12, twist: 0 }), ...both("elbow", { flex: 48 }),
                 spine: { flex: back ? -4 : 6, side: 0, twist: 0 }, chest: { flex: back ? -2 : 3, side: 0, twist: 0 } };
  return pose;
}
function leanPose() {
  return { hip_l: { flex: 4, side: 3, twist: 0 }, hip_r: { flex: 4, side: 3, twist: 0 },
           knee_l: { flex: 8, twist: 0 }, knee_r: { flex: 14, twist: 0 },
           shoulder_l: { flex: -4, side: 8, twist: 0 }, shoulder_r: { flex: -4, side: 8, twist: 0 },
           elbow_l: { flex: 12 }, elbow_r: { flex: 12 }, neck: { flex: 4, side: 0, twist: 0 } };
}

// ---------------------------------------------------------------- standing about
// What a person does without thinking: breathes (about 14 breaths a minute, the chest rising and
// the shoulders a little with each), sways a little over the feet, blinks every few seconds, and
// turns the head to whoever is looking (the camera), within what a neck turns without the body:
// 40 degrees to the side, 15 up or down, eased, and back to straight ahead when the camera is
// behind. While walking: breathing only, a little quicker, and the head straight. All of it goes
// on top of the pose (Skeleton.extra), never into it, so nothing is kept of it.
export const LIFE = { breaths: 14 / 60, look: { yaw: 40, pitch: 15, rate: 2.5 }, blink: [2, 6], blinkTime: 0.16 };

export class Life {
  constructor(sk, rig, rand = Math.random) {
    this.sk = sk; this.rand = rand;
    this.up = v3.unit(rig.frame.up); this.front = v3.unit(rig.frame.front); this.left = v3.unit(rig.frame.left);
    this.t = 0; this.breathT = 0; this.yaw = 0; this.pitch = 0; this.still = 1;
    this.nextBlink = LIFE.blink[0] + rand() * (LIFE.blink[1] - LIFE.blink[0]); this.blinkT = -1;
  }

  // one frame: dt seconds; eye, where the camera is (the body's coordinates; null: don't look);
  // walking, how much the walk shows (0..1). Returns { extra, breath (0..1), blink (0..1: how
  // shut the eyes are) }; extra is for Skeleton.extra.
  update(dt, { eye = null, walking = 0 } = {}) {
    dt = Math.min(Math.max(dt, 0), 0.1);
    this.t += dt;
    this.still = ease(this.still, walking > 0.05 ? 0 : 1, 3, dt);
    this.breathT += dt * LIFE.breaths * (1 + 0.5 * (1 - this.still));
    const breath = 0.5 - 0.5 * Math.cos(TAU * this.breathT), st = this.still;
    // the head to the camera, measured in the chest's frame
    let yaw = 0, pitch = 0;
    const sk = this.sk, chest = sk.index("chest"), head = sk.index("head");
    if (eye && chest >= 0 && head >= 0 && st > 0.5) {
      const W = sk.W[chest], f = q.rot(W, this.front), l = q.rot(W, this.left), u = q.rot(W, this.up);
      const d = v3.unit(v3.sub(eye, sk.P[head]));
      const a = Math.atan2(v3.dot(d, l), v3.dot(d, f)) / RAD;
      if (Math.abs(a) < 100) {
        yaw = Math.max(-LIFE.look.yaw, Math.min(LIFE.look.yaw, a));
        pitch = Math.max(-LIFE.look.pitch, Math.min(LIFE.look.pitch, Math.asin(Math.max(-1, Math.min(1, v3.dot(d, u)))) / RAD));
      }
    }
    this.yaw = ease(this.yaw, yaw * st, LIFE.look.rate, dt);
    this.pitch = ease(this.pitch, pitch * st, LIFE.look.rate, dt);
    // a blink: shut in 60 ms, open in 100
    let blink = 0;
    if (this.blinkT < 0 && this.t >= this.nextBlink) this.blinkT = 0;
    if (this.blinkT >= 0) {
      this.blinkT += dt;
      const s = this.blinkT, down = 0.06;
      blink = s < down ? s / down : Math.max(0, 1 - (s - down) / (LIFE.blinkTime - down));
      if (s >= LIFE.blinkTime) {
        this.blinkT = -1;
        this.nextBlink = this.t + LIFE.blink[0] + this.rand() * (LIFE.blink[1] - LIFE.blink[0]);
      }
    }
    const sway = st * Math.sin(TAU * this.t / 8.3), drift = st * Math.sin(TAU * this.t / 12.7 + 1.3);
    const extra = {};
    const add = (name, a) => { const j = sk.index(name); if (j >= 0 && sk.angles[j]) extra[j] = a; };
    add("pelvis", { flex: 0, side: 0.5 * sway, twist: 0.6 * drift });
    add("spine", { flex: 0, side: -0.4 * sway, twist: -0.3 * drift });
    add("chest", { flex: -0.8 * breath, side: 0, twist: 0 });
    for (const s of ["l", "r"]) add("clavicle_" + s, { flex: 1.5 * breath, side: 0, twist: 0 });
    // a neck turns the head 40% of the way and the head the rest; the head nods
    add("neck", { flex: -0.4 * this.pitch + 0.6 * breath, side: 0, twist: 0.4 * this.yaw - 0.3 * drift });
    add("head", { flex: -0.6 * this.pitch, side: 0, twist: 0.6 * this.yaw });
    return { extra, breath, blink };
  }
}
const RAD = Math.PI / 180;
