# Progress over time: how one person's scans and tape measures are shown

Design note, 2026-10-12. Code: `src/body_studio/history.py`, `static/progress.js`.

## What comparable apps do

| App | Scan to scan | Numbers over time |
|---|---|---|
| ShapeScale ([App Store](https://apps.apple.com/app/id1483088842)) | Heat map painted on the body (where it gained or lost), side-by-side 3D, and a **contour view**: cross-sections of several dates drawn over each other in colour | Compare view: a card per metric, coloured teal / red / grey |
| Styku ([help](https://help.styku.com/how-can-i-show-a-client-their-before-and-after-scans-and-highlight-progress-with-styku/)) | Split screen, **profile overlay**, silhouette, cross-section, a digital tape measure | Trends graph, net change and percent change per measure |
| Fit3D, Prism, Naked | Side by side, before/after exports, colour change maps | Per-measure history charts |
| Happy Scale ([App Store](https://apps.apple.com/app/id532430574)) | – | A smoothed trend through noisy weigh-ins, weekly rate, small goals |

Three ideas repeat: (1) put two dates **on top of each other** rather than only side by side,
(2) a **card per measure** with the change and a neutral colour when it hasn't really changed,
(3) **don't let noise read as progress**: smooth it, or say it is within the noise.

## What Body Studio does (first version)

One panel at the right edge (a sheet at the bottom on a phone), opened with **Progress**. The
body stays in the middle of the space left; nothing else on the page changes.

1. **Body fat headline** from the tape measures (decision 2026-10-12), with a line of every entry.
   One equation for the whole series: whichever covers the most entries, Navy first on a tie.
   Mixing equations would make a formula switch look like a change in the body. The ±4.5 error
   is shown as text, not as a band, because it is the error of the absolute number; the change
   for the same person with the same tape is much smaller.
2. **A row per tape measure** (weight, waist, neck, hips): latest value, change since the first
   entry, a sparkline. Changes smaller than the noise read "about the same" in grey; larger ones
   are in the accent colour, never green/red: losing waist is good for one person and bad for
   another. Noise thresholds (inferred, not measured here): 1 kg body weight (water), 1 cm at
   the waist and hips, 0.5 cm at the neck (tape repeatability), 1 point of body fat (about what
   1 cm of waist does to the equations). Sparklines are at least twice the noise tall, so a
   change within the noise draws as a flat line.
3. **Scans**: the body on screen is added to the person's history with one click, dated by its
   run. It is measured once with the person's height (the same slicing as `body-studio measure`)
   and the result kept. The panel then draws the **circumference at every height** of the body
   on screen over the first scan: Styku's profile overlay and ShapeScale's contour view, in a
   form that works for splats. Two scans don't need to face the same way or share a scale, since
   each is a profile in centimetres by fraction of the person's height. Neck, waist and hip
   levels are marked with their change.

Data: `people/<name>.json` in the data folder (sex, height, tape entries, scans with their
measurements and profile). Splat-studio ignores it, so both apps still open every run. Changing
the height marks the scans to be measured again.

## Next steps

- **Paint the change on the body.** Colour each splat by the profile difference at its height
  (a height-band heat map, ShapeScale's idea without mesh registration). Needs both scans
  aligned only by height, which we already have.
- **Two bodies side by side** at the same real scale (both scaled by height, feet on one floor,
  turning together). Facing direction differs between captures; align by the trunk's principal
  axis at the waist slice.
- **A smoothed trend** (Happy Scale's idea) once there are many entries: an exponential moving
  average for weight and waist, and the weekly rate.
- **Tape-to-scan calibration** per person: the waist offset learned on days with both
  (`docs/body-fat.md`), applied to scans that come without a tape.
