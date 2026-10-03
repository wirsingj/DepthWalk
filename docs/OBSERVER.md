# Observer lab

This instrument supports autonomous rendering research. It can expose incompatible
eye colors, competing correspondences, weak regions, motion instability and remote
color propagation. It cannot establish subjective fusion, eye comfort, or a
physiologically accurate prediction of a particular viewer. The [current human
assessment](SOT.md#evidence-and-limits) overrides numerical improvements; current synthesis
has not earned acceptance.

## Run and inspect

**Demo world** selects Original city or Block study for the same city camera routes.
Game comparison links carry this selection. Reports record `world` and `sceneGeometry`;
isolated/synthetic fixtures ignore it. Compare equal resolution/settings first:
reduced geometry does not establish faster stereo synthesis or human fusion.

**Block-study comparison, 2026-10-02:** [Verification](../evidence/block-study-verification.json)
covers CPU close-up replay, 640×360, spacing 120, strength .5, Quiet support .55,
dark ink and 1px dots. Original→Block: triangles 7100→1756; meshes 396→121;
remote spread 29.10%→26.76%, depth accuracy 90.48%→90.59%, motion RMS
.05971→.06317, source error 42.57→40.30. Repeated silhouettes remain visible;
the matching-dot prototype still fails depth/conflict/motion gates. Neither is accepted.
Both backends pass 36 gameplay checks, including switching without losing state.

For a focused comparison, choose **Quiet motion · before / after**: baseline,
seed history and the unchanged flat-source negative control. CPU synthetic replay:
`node tests/quiet-motion-research.js`.
The game's recorded-walk link presets this sweep with spacing, depth strength,
support, edge style, dot size and direction. It uses the lab's camera and native
resolution. Other sweeps retain their labeled profiles. After capture, **View before /
after** opens native-size stereo: A/B switches the same frame, Space toggles slow
replay, arrows step, and Escape returns to diagnostics. Scrubbing pauses; replay
stops at the final hold. C shows the same-frame original color reference without
stereo or alignment dots. A/B restores optional dots one pattern period apart.
**Save displayed PNG** exports the selected native image. Switching needs no recapture.
Direct entry and links without explicit direction use original relief. Explicit
`direction=reversed` links still reproduce historical experiments. **Depth direction**
reaches the renderer as `invertDepth`, retaining physical
geometry for contours. Evaluation alone receives reversed ground truth. JSON records
the direction; source hashes distinguish older inverted-input contour behavior.
F3 JSON also records captured edge style, dot size, render scale, depth range and
camera FOV. These describe the captured frame; no hardcoded build label identifies
the checkout. Record source fingerprints with consequential verification results.
**Save captured PNG** exports F3's native stereo pixels without HUD or resizing;
an optional bounded-window capture exports only that window. It becomes available
as soon as capture finishes, independently of reconstruction.

Use **Isolated diamond** or **Isolated ring** for cheap object/occlusion checks,
then **First collectible · close-up banding** and existing city routes. These generated depth
fixtures require no new map assets. **Multiscale contrast · rejected, CPU** compares
one fixed candidate with Quiet, the rejected single-scale reference and flat-source
negative control. `node tests/multiscale-research.js` reproduces the CPU experiment;
[results and rejection](STEREO-CONSTRAINTS.md#contrast-hypothesis-not-a-proven-solution).
Failed **Fixed acceptance gates** are visible in the table and A/B replay. JSON
`decisions` records every measured value, limit and outcome; exploratory Pareto
membership does not establish acceptance. Gate policies live in
`src/debug/candidate-gates.js`; missing measurements fail. Relative checks do not
replace absolute observer floors or human fusion review.

Malformed image comparisons are rejected before scoring: native pixel counts,
RGBA byte counts and row origin must agree. Missing optional scene color remains
unmeasured rather than receiving a similarity score. F3 reconstruction fractions
and disparity errors with no supporting samples are `null`/“unmeasured”, not zero.

Start `npm run dev` and open `/tests/observer-lab.html`, or use the link in F3 or
the GPU fixture page. The lab and GPU fixture page are also production build entries.
Choose a city route, near-beacon overlap, isolated object or synthetic layers;
select a sweep on WebGPU or CPU. Every profile receives
the same captured inputs. Ten frames include held poses, movement and a final hold.
City captures sample a restrained walk/turn at a nominal 15 Hz; wall-clock benchmark
speed is unrelated to that cadence. The synthetic fixture shifts its diamond by
three pixels per moving step. Changing renderer settings does not move the game.

Select a result row and scrub or play its frames. Click a stereo image point to
inspect fine/broad disparity cost curves and competing minima. The two aligned eye
patch images expose chromatic disagreement. The relief reconstructs only inferred
depth and colors: it connects confident neighbors with similar depths, leaves gaps,
and can be orbited. It is a relative-depth visualization, not a recovered scene mesh
or a literal simulation of what eyes experience. Displayed thumbnails are scaled;
all analysis reads native pixels.

Native stereo preview retention is capped at 128 MiB across profiles. Large sweeps
retain evenly spaced frames, including the first and last; every frame still
contributes to metrics. The UI and exported `preview.frameIndices` disclose sampling.
For example, eight 1080p profiles retain two of ten frames each (126.6 MiB), versus
632.8 MiB when retaining all frames. Inputs, maps and filter workspaces are additional.
Choose 640×360 to retain the entire sequence for eight profiles. CPU encoding and
image analysis run in a cancellable worker; CLI comparisons stream metrics without
retaining all output images. Relief renders only when its frame, size or view changes.

The stereo probe is keyboard accessible: Tab to its canvas, use arrows for single
pixels, Shift for ten pixels, and Home to center. Scrubbing pauses playback. F3 is
a modal dialog that releases mouse capture, pauses movement and restores focus on
close; Escape also closes it. Closing or retrying cancels pending diagnostic work.

The remote-color map is a separate intervention: a small central source patch turns
magenta while geometry stays fixed. Yellow/green means nearby output changed;
red means chromaticity changed farther than 1.5 pattern periods from the edited
source region. This envelope includes the two eye projections and one partner check.
The metric measures propagation sensitivity, not a count of perceived ghosts.

F3 retains the original decoder and now adds observer findings and aligned eye
patches to its single-frame report. Longer motion sweeps run in the separate lab.
Cancel terminates analysis, releases its device and permits another run. Export
records settings, per-frame results, thresholds and the tradeoff frontier.
Malformed worker replies fail promptly instead of leaving analysis waiting.

For unattended CPU comparisons:

```sh
npm run research -- --full --output evidence/my-observer-run.json
```

The command uses deterministic synthetic inputs without a browser. The reusable
`runBenchmark(frames, profiles, options)` API accepts aligned packed RG16 depth and
sRGB RGBA, explicit origin, spacing, strength and phase (`move` or `hold`). Supply
`render(frame, settings, reset)` to evaluate another renderer; return native
top-down Uint32 RGBA pixels. `reset` begins a fresh profile or color intervention.
An optional async analyzer and progress/cancellation callbacks support browser
workers. Hold frames must have identical source captures to test stationary drift.

## First-collectible banding

**Human priority, 2026-09-26:** The collectible spreads kaleidoscopic bands over the
full screen. The older near-beacon route starts farther away and off-center, missing
this close-up. `?scene=close` selects a centered approach beginning two world units
in front of the first prism; ten frames include motion and exact repeated holds.
It visually reproduces the reported diamond bands, not the user's exact captured pose.

**Color smoothing · rejected, CPU** retains two rejected smoothing controls.
[Mechanism and rejection evidence](STEREO-CONSTRAINTS.md#color-base-smoothing-rejected).
Use this close-up alongside held-out scenes; numerical depth recovery is insufficient
when the visible image still fails. No candidate has earned human acceptance.

**Preview anti-banding prototype** below the game's pattern selector opens
`?preview=rank`: automatic close-up comparison at P120, 50% depth, original direction,
1280×720 when the full preview fits, otherwise 640×360. It opens B, **Local color · exact matching dots**;
A shows Quiet and C the original. An explicit valid `scene` is honored.
The failed continuous-contrast variant remains CLI research, outside this preview.
This CPU prototype is not a live pattern. The earlier preview did not fuse,
human-reported; [current mechanisms and limits](STEREO-CONSTRAINTS.md#local-dot-color-research).
Run `node tests/fusion-research.js` for diamond, ring and layered fixtures. Research
requires complete native RG16/RGBA8 frames; canonical depth drives contours and color
ownership consistently. History honors resets/calibration; new seeds cannot duplicate
retained class identities. Rejection gates and human review remain mandatory.

## Independent measurement boundary

`src/debug/observer.js` imports no encoder, equivalence links, engine, geometry or
source-color image. It searches the final image using linear Rec.709 luminance:

- Normalized cross-correlation on 7×3 and 15×5 native-pixel neighborhoods.
- Distinct minima within the calibrated range; additional minima out to 2.25 periods.
- Searches anchored at the left and right endpoints to check correspondence consistency.
- Patch chromaticity differences after separating overall brightness.
- Connected regions with insufficient consistent evidence.

Ground-truth depth enters `evaluateObserver` afterward. Accuracy is separated for
boundaries and smooth interiors, including error quantiles and sample counts. Flat
or unmeasurable regions remain missing, never assigned a favorable depth. Sequence
analysis reports correspondence loss, raw screen-space luminance change, exact
stationary drift, and changes in disparity error after subtracting intended changes.
This last metric is an Eulerian screen-sample comparison, not optical flow or a
motion-compensated perceptual flicker model. It cannot infer binocular comfort.

Engineering thresholds are versioned as `observer-1`:

| Indicator | Threshold |
| --- | --- |
| Supported sample | confidence > .35, anchored disagreement ≤ 1 px, cross-scale difference ≤ 2 px |
| Eye-color conflict | normalized linear RGB chromaticity L1/2 > .075; warning above 12% of matching patches |
| Weak support | less than 55% of eligible interior samples |
| Inconsistent / cross-scale matches | more than 15% / 18% |
| Wrong depth | fewer than 90% of decoded samples within 2 px |
| Unstable depth | disparity-error change above 2 px RMS per sampled transition |
| Stationary drift | any changed pixels between consecutive identical hold inputs |
| Remote color spread | chromaticity change > .025 beyond 1.5 periods; warning above 15% of affected pixels |

These thresholds are heuristics, not fitted to a comfort dataset. Border exclusions
and valid/eligible denominators stay visible. Harmonic alternatives are reported
separately; neither harmonics nor other matching peaks alone prove perceived layers.
The Pareto frontier uses accuracy, support, color conflict, disparity jitter, screen
change, broad RGB error and color spread. It excludes known rejected/negative controls
and requires accuracy ≥ 90%, support ≥ 40%, and zero stationary drift. It is a list
of tradeoffs, not an automatic recommendation or release approval.

## Rejected neutral isolation and appearance synthesis

**Human rejection:** Removing Quiet's source colors and contour accents produced
“just pixels,” despite roughly 92% decoder recovery and zero color-spread scores.
The old neutral reports remain evidence of an insufficient acceptance pipeline,
not evidence of a working fix. Quiet's previously fused source-color baseline is
restored; its repeated outlines remain unresolved. Do not optimize away scene
content to make the spill metric zero. Recolor invariance is not a product success.

The lab's **Appearance synthesis · 10 profiles, CPU** sweep implements a new
research process: start with source RGB plus a matched carrier, then minimize source
error plus soft visible-pair disagreement using bounded Jacobi iterations. It does
not collapse all colors into a transitive class. The objective is separate from the
unchanged observer. Compare three constraint weights, projected targets, selective ownership and local contrast against Quiet and the neutral
ablation (marked human-rejected, excluded from the eligible frontier).

Run `node tests/appearance-research.js` for the synthetic sequence. The initial
weight-0.5 experiment reduced remote color spread from 29% to 7% and broad source
error from 22.4 to 11.1, at approximately 92% recovered depth, but raised eye-color
conflict from 2.7% to 26%. These are engineering tradeoffs, not fusion acceptance.
See `evidence/appearance-research.json`. The solver is research-only, CPU-based,
and not a novel-algorithm claim or a real-time implementation yet.

On held-out near-beacon frames (640×360/P120), weight 0.5 falls below the unchanged
90% accuracy gate (89.9%) and reaches 30.3% eye-color conflict. Weight 2 retains
91.9% depth and reduces source error from 26.8 to 18.4, but remote spread stays
43.6% versus Quiet's 43.8%. Uniformly softening constraints therefore does not solve
the banding/color/fusion combination. Keep it as a research baseline, not a game
default. Subsequent selective ownership tests also failed; see
[Theory-driven ownership tests](#theory-driven-ownership-tests).
See `evidence/appearance-near.json`. The neutral ablation reproduces the rejected
strategy using gray source pixels; it is not an exact replay of the user's image.

## Iteration discipline

**Declared direction:** Research the synthesis algorithm itself, including still
images, with real-time execution as the eventual target. The current Soft paired
blend is an incremental baseline, not a claimed novel solution. A proposed next
experiment starts from source appearance and optimizes structured matching features,
penalizing competing disparities and binocular color conflict. Keep its optimization
loss separate from the frozen observer, and assess held-out shapes and city poses.
The initial soft-constraint solver above now tests this direction. Prior work includes
[naturalistic stereo matching](https://pmc.ncbi.nlm.nih.gov/articles/PMC3397313/)
and [image-only autostereogram reconstruction](https://arxiv.org/abs/2012.15692);
neither establishes novelty or human fusion for our proposals.

Projected source lighting with a sparser smoothed carrier was rejected in the
ten-cycle review: synthetic depth accuracy fell from 93.3% (Quiet at 35%) to 85.4%,
with higher motion change and color conflict. Source resemblance alone cannot
justify promoting a weaker stereo signal.
Splitting Quiet classes into groups of four also failed: color propagation fell,
but depth accuracy dropped to 80.8%. It is not shipped as a viewing mode.

Preserve useful findings from unsuccessful combinations: sparse projection localized
color, and bounded classes reduced spread, although neither retained adequate depth.
A smaller 25% projected-lighting blend retains the complete carrier graph. The CPU
synthetic sweep measured 95.2% accuracy, 86.8% support, and 17.7% less screen-luminance
motion change than Paired at 35%. Color conflict increased; this is a tradeoff,
not human acceptance. See `evidence/smooth-candidate-sweep.json`. The 75% blend failed
the existing accuracy/support gates. Earlier Quiet feedback does not establish a
currently accepted baseline; see [human assessment](SOT.md#evidence-and-limits).

GPU city and near-beacon sequences at 640×360/P120 retain approximately 94% depth
accuracy with Soft paired. Against Paired at equal 35% support, motion change fell
13–17% and broad source-color error 12–15%; eye-color conflict rose to 22–25%.
Remote recoloring spread was zero in that probe, not proof that all bands vanished.
Reports: `evidence/ten-cycle-city.json`, `evidence/ten-cycle-near.json`.

1. Run `npm run check` before trusting the observer. Analytical repeat patterns, blank
   images, mismatched hues, wrong disparity, fresh valid noise each frame, stale
   depth and remote color copies deliberately challenge the instrument.
2. Keep the original decoder, negative controls, hypotheses and thresholds fixed
   during renderer experiments. Do not tune the observer to make a candidate win.
3. Run identical recordings and parameters for each candidate. Inspect worst frames,
   boundary errors and unsupported-region coordinates, not only sequence averages.
4. Reject regressions in correspondence, coverage or stationary stability before
   optimizing resemblance. A flat original has excellent RGB error and no stereo.
5. Record source fingerprint, inputs, backend, settings and outcomes. Retain human
   counterexamples; computer metrics do not overrule them. Ask for perceptual input
   when an unresolved tradeoff remains, not after every mechanical experiment.

The disparity evaluation structure follows established [Middlebury evaluation
practice](https://vision.middlebury.edu/stereo/eval3/MiddEval3-newFeatures.html).
Multiple confidence checks are motivated by [Mostegel et al., CVPR 2016](https://www.cv-foundation.org/openaccess/content_cvpr_2016/papers/Mostegel_Using_Self-Contradiction_to_CVPR_2016_paper.pdf).
This implementation is a small diagnostic system; it does not reproduce those
research systems or claim learned/physiological confidence calibration.

## Quiet motion comparison

Quiet seed history addresses movement shimmer, not repeated-object bands. Source
colors and contours are recomputed; no previous RGB or depth is blended. The game
offers an opt-in checkbox, off by default; human comparison remains pending.

[CPU synthetic evidence](../evidence/quiet-motion-research.json), 2026-09-26:
640×256/P96 and 1920×360/P120, ten frames each, 35% support. Motion luminance RMS
fell about 13%; all preregistered gates passed. These are two sizes of one scene.
[GPU city](../evidence/quiet-motion-city-gpu.json), 640×360/P120: 8.8% less motion
change, missing the 10% reduction target; accuracy 91.1→91.8%, support 54.1→52.2%.
[Near beacon](../evidence/quiet-motion-near-gpu.json), 1280×720/P120: 12.0% less
motion change; accuracy 96.1→96.2%, support 68.9→68.7%. Both used ten frames,
WebGPU/NVIDIA Ampere; stationary drift was zero. Color locality stayed unchanged.
These are screen-space changes including real motion, not perceptual flicker or
interactive FPS measurements. City results do not justify default promotion.
[GPU fixtures](../evidence/quiet-motion-gpu-fixtures.json) verify exact Quiet RGB
pairs, CPU agreement, setting resets and stationary output.
[Verification scope and source hashes](../evidence/quiet-motion-verification.json)
include gameplay and native A/B interaction checks.

## Ink contours

**Dark ink · before / after** compares Quiet, `edges: 3` and the flat-source negative
control. Ink expands physical contours across rims before projecting them through
the complete stereo graph. Both relief directions retain visible edges and exact
RGB pairs. Quiet darkens class means while keeping texture amplitude; multiplying
the entire noisy output weakened supported area. This is an optional style, not a
new default or an anti-banding fix. It can emphasize repeated outlines.

[GPU city replay](../evidence/ink-city-replay.json), 2026-09-26, 1280×720/P120,
35% support, reversed relief, ten frames per profile: depth accuracy 94.51→94.28%,
supported area 55.79→53.38%, eye-color conflict 0.81→0.75%, motion RMS
0.03910→0.03860; stationary drift zero. Broad source-color error rises 25.24→28.78
because of darkening; remote color spread is unchanged. Human fusion/style
acceptance remains pending. [Verification](../evidence/ink-verification.json)
records 136 tests, 18 GPU fixtures and 32 gameplay checks per backend.

The earlier Soft-paired projected-ink prototype remains rejected: reversed relief
occluded its physical foreground contour, changing zero isolated-diamond pixels.
`node tests/ink-research.js` reproduces that separate mechanism; see
[evidence](../evidence/ink-research.json). Passing unchanged output is not progress.

Two additional candidates were removed after regression checks. [Projected source
lighting](../evidence/texture-city.json) eliminated remote hue spread but increased
city eye-color conflict from 0.81% to 22.44% and motion RMS from 0.0391 to 0.0638.
[Row-dithered fractional depth](../evidence/anti-banding-city.json) reduced city depth
accuracy from 94.51% to 90.00% and supported area from 55.79% to 45.50%. Neither
changes the product renderer. These reports describe discarded implementations,
not current-code reruns or evidence that all fractional methods fail.

## Theory-driven ownership tests

[Constraint model and derivation](STEREO-CONSTRAINTS.md) separates exact RGB feasibility
from perceptual fusion. Reports now include `constraintAnalysis`: class span, conflicting
endpoint demands, and the least-squares **raw RGB** error floor. This is not the
broad-color error metric and does not prove impossibility of other stereo methods.

The first near-beacon frame places 80.6% of pixels in classes wider than three
pattern periods; 39.3% of demanded endpoints receive source colors differing by
more than 16 byte levels. Projected targets reduced near-beacon remote spill from
43.8% to 24.0%, retaining 91.5% decoded accuracy, but synthetic spill worsened
(29.0% to 46.4%). Selective weights reduced near-beacon spill to 0.13%, yet accuracy
fell to 87.2% and eye-color conflict rose to 27.9%. Neither candidate replaces the
game baseline. Evidence: `evidence/ownership-synthetic.json` and
`evidence/ownership-near.json`. Local contrast constraints now test the derived alternative: a finite-difference
matching objective leaves constant patch means free. Synthetic spread fell to
8.3% with 93.0% decoded accuracy, but eye-color conflict remained 20.5%.
See `evidence/contrast-synthetic.json`. Observer thresholds are unchanged.

The contrast hypothesis failed held-out near-beacon acceptance: remote spill fell
from 43.8% to 5.6%, but decoded accuracy fell from 92.1% to 86.9%, eye-color conflict
rose to 33.6%, and motion change increased. Thus freeing constant patch means does
reduce propagation as predicted, but matching one local derivative is insufficient
for reliable depth across this scene. Keep it in the lab, not the game selector.
See `evidence/contrast-near.json`; source scope is recorded in
`evidence/constraint-investigation.json`.
