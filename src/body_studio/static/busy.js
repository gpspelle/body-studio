// What the page is still doing before the body can be used (loading it, finding its skeleton,
// getting it ready to move), shown as one spinner over the body with a line saying what. Free of
// the page so it can be tested on its own (tests/js/busy.test.mjs, run by tests/unit/test_busy_js.py).
// As loading indicators usually go: nothing for a step that is over in a moment (no flash), once
// shown kept long enough to read (no flicker), and after a while a word on why it takes long.
// Design: docs/loading.md.

export const SHOW_AFTER = 400;   // ms before a step shows the spinner
export const KEEP_FOR = 600;     // ms the spinner stays once shown, at the least
export const SLOW_AFTER = 8000;  // ms before the line on why it takes long

// render({shown, text, slow}): called whenever what to show changes. `now`, `later` and `cancel`
// are the clock and timers (performance.now, setTimeout and clearTimeout on the page).
export class Busy {
  constructor(render, { now = () => performance.now(), later = (f, ms) => setTimeout(f, ms), cancel = (id) => clearTimeout(id) } = {}) {
    Object.assign(this, { render, now, later, cancel });
    this.steps = new Map();       // key -> {text, slow, since}, in the order they began
    this.shownAt = null;
    this.timer = null;
    this.last = "";
    this.lastText = "";           // (still said while the spinner stays its last moment)
  }

  // `text`: what the step is doing (null: it is done); `slow`: why it may take long; `now`: show
  // at once (before a step that holds the page, when a timer couldn't fire to show it)
  set(key, text, { slow = "", now = false } = {}) {
    if (text == null) this.steps.delete(key);
    else this.steps.set(key, { text, slow, since: this.steps.get(key)?.since ?? this.now() });
    if (now && text != null && this.shownAt === null) this.shownAt = this.now();
    this.update();
  }

  get busy() { return this.steps.size > 0; }

  // what to show at this moment, and when it next changes by itself
  state() {
    const t = this.now(), step = [...this.steps.values()].pop();
    if (step) {
      const first = Math.min(...[...this.steps.values()].map((s) => s.since));
      if (this.shownAt === null && t - first >= SHOW_AFTER) this.shownAt = t;
      if (this.shownAt === null) return { shown: false, text: "", slow: "", next: first + SHOW_AFTER - t };
      const slow = step.slow && t - step.since >= SLOW_AFTER;
      return { shown: true, text: step.text, slow: slow ? step.slow : "", next: step.slow && !slow ? step.since + SLOW_AFTER - t : null };
    }
    if (this.shownAt !== null && t - this.shownAt < KEEP_FOR) return { shown: true, text: this.lastText, slow: "", next: this.shownAt + KEEP_FOR - t };
    this.shownAt = null;
    return { shown: false, text: "", slow: "", next: null };
  }

  update() {
    if (this.timer !== null) { this.cancel(this.timer); this.timer = null; }
    const s = this.state();
    if (s.shown && s.text) this.lastText = s.text;
    if (s.next !== null) this.timer = this.later(() => { this.timer = null; this.update(); }, Math.max(0, s.next));
    const key = JSON.stringify([s.shown, s.text, s.slow]);
    if (key === this.last) return;
    this.last = key;
    this.render({ shown: s.shown, text: s.text, slow: s.slow });
  }
}
