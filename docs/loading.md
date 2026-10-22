# Loading: the screen until the body can be used

After the page opens, or a body is picked, there are several steps before it can really be used:
the splat file is downloaded, its skeleton is found (`GET /api/rig`, once per body, then read from
`<body>.rig.json`) and the splats are bound to it (`setup` in `static/tattoo.js`, which holds the
page for a moment), its pose and tattoos are put back, the clothes are fitted (`GET /api/fit`) and
what was worn is put back on, the shop is set out around it, and a remembered room is loaded
around it. Before, the body turned on screen during all of this while posing, walking and clothes
didn't answer yet, and the panel and the shop filled in bit by bit: it looked broken. A first
try put a small spinner over the body only until its skeleton was bound, which still left the
panel and the shop loading after it went. Now one loading screen covers the page until every
step is done.

![The loading screen while the skeleton is found](images/loading-desktop.png)

## What the usual guidance says

- **By how long it takes** (Nielsen's response-time limits): under about 1 s, no indicator, since
  the user keeps their flow; from about 1 to 10 s, an indefinite indicator like a spinner; past
  about 10 s, a percent-done bar or at least a word on what is happening and why it is long.
  ([NN/g, progress indicators](https://www.nngroup.com/articles/progress-indicators/),
  [UX Tigers](https://www.uxtigers.com/post/progress-indicators))
- **Don't flash it**: wait a moment before showing a spinner (a few hundred ms), and once shown,
  keep it long enough to be seen, so a quick step neither flashes nor flickers.
  ([spin-delay](https://npmjs.com/package/spin-delay),
  [Firefox Acorn loading indicators](https://acorn.firefox.com/latest/foundations/global-patterns/loading-indicators-SKyqf3Lj))
- **Say what is loading, where it is loading**: the indicator sits on the thing that isn't ready
  yet, with a short label, rather than somewhere else on the page.
  ([Adobe XD essentials](https://blog.adobe.com/en/publish/2016/09/06/xd-essentials-best-practices-for-animated-progress-indicators))
- **One indicator**, not one per step: steps one after another read as one wait.
- **Accessible**: a `role="status"` live region for screen readers, and slower motion for people
  who asked for reduced motion.

## What the page does

`static/busy.js` (tested by `tests/js/busy.test.mjs`) keeps the steps under way and decides what
shows; `index.html` draws it, and each part adds its steps through `bodyApp.busy(key, text)`.
Each step starts before the one it follows ends (the event that starts the next one is sent
first), so the screen stays up from the first to the last.

| Step | Where | Said |
|---|---|---|
| The page opening | index.html | Opening… |
| The splat file downloading | index.html | Loading Mia… |
| Finding the skeleton (`/api/rig`) | tattoo.js | Finding the skeleton… This happens once per body. |
| Binding the splats to it, the pose and tattoos back | tattoo.js | Getting the body ready to move… |
| The shop set out (meshes and textures) | wardrobe.js | Setting out the clothes around the body… |
| Fitting the clothes (`/api/fit`), then what was worn | wardrobe.js | Fitting the clothes to this body…, Putting on T-shirt and jeans… |
| A remembered room | house.js | Getting the body ready…, Finding the floor…, Loading the room… |

- **The look**: the page's own background, the logo (the figure of the tab icon) turning on a
  turntable as the body does, with a soft shadow under it, the name, and one line on what is
  happening. It eases at each turn so it reads as calm, not frantic. It fades in and out.
- Shown from the first paint when the page opens; for a step later on (picking another body), only
  after **0.4 s**. Kept at least **0.6 s** once shown, then faded out over 0.35 s. The binding step
  holds the page, so it shows the screen at once (a timer couldn't fire to show it meanwhile).
- After **8 s** on one step, a second line says why ("Still working. It's only this slow the first
  time."). There is no percentage: none of these steps can tell how far along it is.
- The logo turns by a CSS animation of `transform`, which the browser runs off the main thread, so
  it keeps turning while the page binds the splats. With reduced motion it fades in and out
  instead of turning. The cursor shows progress meanwhile; clicks pass through the screen (there
  is nothing to click by mistake that matters, and tests can drive the page under it).
- Only while there is work under way: with the Try on panel closed (as on a phone at first) and no
  room, the skeleton and the clothes aren't fetched, so once the body is loaded it is ready.
- Choosing another body model for the clothes (Anny) later, from the panel, is not covered: it is
  asked for there, and the panel says how long it takes.
