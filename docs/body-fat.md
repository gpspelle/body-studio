# Body fat from a Body Studio capture

Research behind `body-studio measure` (experimental), 2026-10-12. Code: `src/body_studio/measure.py`.

## Short answer

Feasible, as an **estimate with a stated error of about ±4–5 percentage points**, the same class
as the tape-measure formulas the US military uses and the phone 3D-scan apps that have been
validated against DXA. The path that fits this repo (stdlib only, splat-studio pipeline unchanged):

1. Ask for the person's **height** (and optionally weight). COLMAP output has no units; height
   is what turns the splat into centimetres.
2. Measure **neck, waist (at the navel) and hip circumferences** by slicing the cleaned,
   person-masked splat horizontally.
3. Feed them to a published **circumference equation** (US Navy, or the 2023 US Army one-site
   equation if weight is given), and show the result with its error band.

Nothing better than ±3–4 points is reachable without a model trained on DXA-paired scans, which
we don't have.

## What the published methods achieve

| Method | Input | Error vs reference | Source |
|---|---|---|---|
| Lab 3D scanner + PCA shape model (Shape Up!) | full-body mesh, regression trained on DXA | R² 0.91–0.94 for fat mass | Wong et al., *Obesity* 2021 ([CDC stacks](https://stacks.cdc.gov/view/cdc/111469)) |
| Amazon Halo (CNN on front/back phone photos) | 2 photos, A-pose | MAE 2.3 points, LoA −4.7 to +6.4 vs DXA (Amazon-funded preprint) | Majmudar et al. ([medRxiv](https://www.medrxiv.org/content/10.1101/2021.06.10.21258595v1.full-text)) |
| Prism Labs phone 3D scan (iPhone, person turns in place) | 3D avatar, proprietary equations | RMSE 4.5 points, MAE ~3.5, LoA ~±8.7 vs DXA; repeatability 0.5–0.7 points | Tinsley et al., *Front. Med.* 2024 ([link](https://frontiersin.org/journals/medicine/articles/10.3389/fmed.2024.1485450/full)) |
| Army one-site equation on circumferences from the Prism phone scan | waist at navel + weight | MAE ~4.0 vs 4-compartment, LoA ~±10, proportional bias | Florez et al., *Br J Nutr* 2024 ([link](https://www.cambridge.org/core/journals/british-journal-of-nutrition/article/body-composition-estimation-from-mobile-phone-threedimensional-imaging-evaluation-of-the-usa-army-onesite-method/D11960D247E6FEFD544C0893BD990FD1)) |
| Navy (Hodgdon) tape equation, tape by hand | height, neck, waist (+ hip for women) | bias −2.6 to +2.3, SD of error 3.7–4.8 vs DXA; overestimates lean, underestimates fatter people | *Front. Physiol.* 2022 ([link](https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2022.868627/full)) |
| Booth vs mobile 3D scanning (Size Stream) | 3D scan | mobile close to booth, better than BIA scales (numbers in PDF only) | Hauser et al., 3DBODY.TECH 2024 ([abstract](https://jrnl.3dbody.tech/abstracts/2024/2409.html)) |

Takeaway: circumference equations on a phone scan land at **MAE ~4 points**; good proprietary
models get to **~2.5–3.5**. Commercial BIA scales are 4.5–6 (Halo paper's table). So a
circumference estimate from Body Studio would be roughly as good as a bathroom scale, and the
honest framing is "an estimate for tracking change over time", not a clinical number.

## The equations (inputs in inches and pounds)

- **Navy, men:** `%BF = 86.010·log10(waist − neck) − 70.041·log10(height) + 36.76`
- **Navy, women:** `%BF = 163.205·log10(waist + hip − neck) − 97.684·log10(height) − 78.387`
- **Army one-site (2023), men:** `%BF = −26.97 − 0.12·weight + 1.99·waist`
- **Army one-site (2023), women:** `%BF = −9.15 − 0.015·weight + 1.27·waist`
  (coefficients as quoted in Florez et al. 2024)

Navy needs no weight, so it works from the capture plus height alone. Army needs a typed weight
but only one circumference, so fewer things can go wrong.

**Sensitivity:** in the Army equation, 1 cm of waist error is ~0.8 points of body fat for men and
~0.5 for women. So the circumference measurement needs to be within ~1–2 cm to keep our error
below the equation's own error. Navy is similarly sensitive to `waist − neck`.

## What this pipeline has to get right

1. **Metric scale.** COLMAP reconstructions are up to an unknown scale. Scaling by typed height
   (top of head to the floor plane splat-studio already finds) is the simplest fix. A 1% height
   error is a 1% error on every circumference (~0.9 cm at the waist). Alternatives (a known
   object in the scene, phone ARKit poses) add steps for little gain.
2. **A clean body surface.** The person masks (plan step 2) matter even more here: any floor,
   wall or fog splat inside a slice inflates the circumference. Use only opaque Gaussian
   centres, then measure each slice by the perimeter of its convex hull (that's what a tape
   does: it bridges the navel and the back hollow). Gaussian splats have soft edges that sit a
   little outside the true skin, so expect a small positive bias; measure it against a tape and
   subtract it.
3. **Finding the levels.** Waist at the navel, hips at the widest point, neck below the larynx.
   From an A-pose capture these can be found by slicing every ~5 mm and using simple rules (hip =
   widest slice in the lower torso, neck = narrowest slice between shoulders and head, waist =
   navel height). Arms must be excluded from torso slices, which is why the A-pose capture
   guide already asks for arms away from the body.
4. **Clothing and stillness.** Loose clothes add centimetres directly. The capture guide would
   need "tight clothing or swimwear" for a body-fat take. Breathing moves the waist by 1–3 cm
   over a 2-minute capture (inferred, not measured here); a relaxed exhale is the standard
   tape protocol and we can't enforce it, which is one more reason to show an error band.

Body **volume** (density → Siri equation, like a Bod Pod) looks tempting but isn't viable: small
volume errors and unknown lung volume swing the result by several points (inferred from the
physics; no source tested this on splats).

## What not to do

- **SMPL / SMPL-X fitting** is the research-standard way to get landmarks and circumferences
  from scans (e.g. non-rigid ICP to SMPL, MAE 2.5–16 mm per measurement,
  [Anthropometric clothing measurements from 3D body scans](https://astro.paperswithcode.com/paper/anthropometric-clothing-measurements-from-3d)).
  But SMPL's licence is non-commercial, it's a separate download, and it needs numpy/torch,
  which breaks the stdlib-only rule. Slicing is enough for three circumferences.
- **Training our own model** (Shape Up!/Halo style) needs hundreds of scans paired with DXA.
  Not available.

## State of the art from video and 3D shape (follow-up, 2026-10-12)

Every "from video" method is really video or photos, then a 3D body, then a model trained on
DXA. The best published results:

| Work | What it does | Body fat % vs DXA | Available? |
|---|---|---|---|
| Fenland / Cambridge, *npj Digit Med* 2024 ([link](https://www.nature.com/articles/s41746-024-01289-0)) | Fits SMPL to the body, then a small neural net on 10 SMPL shape numbers + height, weight, sex. Also tested with 4 smartphone photos | R² 0.82, RMSE 3.3; phone meshes: bias 1.6, LoA −9.2 to +12.5 | No code or weights; data on request |
| Same paper, ablation | Height + weight only, no shape | R² 0.73 | (shows what shape adds: +0.09 R²) |
| Shepherd lab, *npj Digit Med* 2025 ([link](https://www.nature.com/articles/s41746-025-01469-6)) | Mesh autoencoder + Gaussian process on 4,286 lab scans, with height, weight, age appended | R² ≥ 0.86 for all outputs, best published; precision about 2× DXA's | No code or data |
| Prism Labs app, 2024 ([link](https://frontiersin.org/journals/medicine/articles/10.3389/fmed.2024.1485450/full)) | Person turns in front of a phone; proprietary | RMSE 4.5, test-retest 0.5–0.7 | Commercial |
| 3DO-5C, 3DBODY.TECH 2021 ([link](https://proc.3dbody.tech/abstracts/2021/2139bennett.html)) | Mixed: 3D body **volume** + BIA body water + scale weight in a 5-compartment model | RMSE 2.0 kg fat mass vs lab 5C | Method published; needs lab-grade BIA and accurate volume |

What this means for Body Studio:
- The accuracy gap between "trained on DXA" (RMSE ~3.3) and "tape formula" (MAE ~4) is real but
  small, and nobody has released a trained model we could use. Matching them would need our own
  DXA-paired scans.
- **Weight is the most valuable single input**: height and weight alone already explain 73% of the
  variance in the Fenland data. Shape on top adds 9 points.
- The SMPL route stays out for now (non-commercial licence, numpy/torch, and still no trained
  weights).

## Mixing scan and tape measures

Yes, and the tape helps most as a **check and calibration** for the scan, not as a second vote:

1. **Calibration.** A lab scanner read the waist 1.5 cm larger than a tape on 52 people, and the gap
   grew with waist size ([Beckmann 2019, PeerJ](https://pmc.ncbi.nlm.nih.gov/articles/PMC6931388)).
   Splats will have their own offset (soft edges, breathing). With a tape waist from the same day,
   we can (a) flag the capture if scan and tape differ by more than ~2 cm (wrong scale, a bad
   slice, loose waistband), and (b) learn this person's offset and apply it to later captures that
   come without a tape.
2. **What the scan adds that a tape can't.** The same landmark every time (no "where is the navel
   today"), measures that are hard to tape yourself (hips, thigh, arm, chest), and a full
   waist-to-hip profile. Repeatability is where 3D wins: Prism's test-retest is 0.5–0.7 points.
3. **Several equations, one number.** With scan circumferences, height, weight and sex we can run
   Navy, the Army one-site equation and RFM (`64 − 20·height/waist + 12·sex`,
   [Woolcott 2018](https://bioblast.at/index.php/Woolcott_2018_Sci_Rep)) side by side. Their
   errors are correlated (all lean on the waist), so averaging gains little. Show one headline
   (Navy, tape-checked), with the spread across equations as a sanity band.
4. **Later, a true mix.** If the user also has a body-fat bathroom scale (BIA), the 3DO-5C idea
   combines scan volume + BIA water + weight. Consumer scales are much worse than lab BIA, and our
   volume accuracy is untested, so this is a research item, not v1.

Underwear captures are the right call. Two small things to add to the capture guide: a waistband
sitting on the navel compresses the waist slice (wear it lower), and long hair should be tied up
so the neck slice is skin.

## Open-source code (GitHub search, 2026-10-12)

No released model turns a 3D body into body fat with published, usable weights. What exists:

| Repo | What it is | Usable for us? |
|---|---|---|
| [LambertLeong/Pseudo-DXA](https://github.com/LambertLeong/Pseudo-DXA) | Shepherd lab: 3D surface scan to a synthetic DXA image (fat, lean, bone). GPL-3.0 | No: code only, weights "on request", meshes must first be fitted with the commercial Meshcapade API, TensorFlow + CUDA |
| [rishabcv-eng/bodycomp](https://github.com/rishabcv-eng/bodycomp) | Two phone photos + height, weight, age, sex, then gradient boosting trained on 11,701 NHANES DXA scans. Claims 2.82 points MAE vs 3.17 for a tape formula | Not as-is: 0 stars, licence not stated, the 2.82 is measured on NHANES measurements, not on real photos. **Its idea is the useful part** (below) |
| [amhoesk/body-fat-estimation](https://github.com/amhoesk/body-fat-estimation) | Linear regressions on NHANES DXA, coefficients in the README. 5 inputs (weight, height, sex, age, waist): R² 0.89 for fat mass. Apache-2.0 | As a reference; unclear whether the R² is on held-out data, so refit before trusting it |
| [im-ethz/DigitalScale](https://github.com/im-ethz/DigitalScale) | Open on-device model from phone photos ([paper](https://arxiv.org/html/2508.20534v1)). Apache-2.0 | No: predicts BMI only |
| [muelea/shapy](https://www.github.com/muelea/shapy), [DavidBoja/SMPL-Anthropometry](https://git.tdem.in/DavidBoja/SMPL-Anthropometry) | Body measurements from SMPL meshes | No: SMPL licence is non-commercial, needs torch |

**The open path to beat tape formulas: NHANES.** The US NHANES survey publishes, for thousands
of adults, whole-body DXA plus height, weight, age, sex and waist, arm and thigh circumferences
(hip only in 2017–2018). A scan measures all those circumferences. Fitting our own equation on
NHANES (plain least squares, stdlib, coefficients shipped in the repo) and validating it on a
held-out cycle is the realistic way to move from ~4 points toward ~3, which is what bodycomp
reports for that kind of model. This needs no DXA of our own.

## What Body Studio should ask the user

| Input | Needed for | Required? |
|---|---|---|
| Sex | every equation | yes |
| Height (cm) | scale of the splat, Navy, RFM | yes |
| Weight (kg), same day | Army equation, any future trained model | strongly suggested |
| Tape: waist at navel (cm) | calibration and capture check | optional, suggested on the first capture |
| Tape: neck, hips (cm) | extra checks | optional |
| Age | only for a future trained model | not now |

That is four fields plus three optional ones, entered once per capture (sex and height remembered
per person).

## Next steps

Done: `body-studio measure` slices the body (convex hull of the trunk piece per 1 cm slice),
finds neck, waist at 60% of height and hips by stature bands, and prints Navy, Army one-site and
RFM estimates, with an optional tape check.

1. Person masks (plan step 2), so slices carry no floor or room.
2. Check `measure` against a tape on real underwear captures (target: within 2 cm), and tune the
   landmark bands if needed.
3. Fit an NHANES equation (waist, arm, thigh, height, weight, age, sex) and validate on a held-out cycle.
4. An input form on the page (sex, height, weight, optional tape), the error band, and a trend
   line across captures of the same person.
