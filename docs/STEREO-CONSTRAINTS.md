# Banding: model, predictions and limits

## Foundations and recovery direction

**Human direction, 2026-10-02:** The original monochrome effect felt better than
current noisy, vertically repeating modes. Study established work before further
adjustment loops. Pure, convincing depth takes precedence over source color;
edges and motion must preserve fusion. A monochrome reference is necessary, but
does not itself solve source-color banding. No new rendering experiment is implied.

### Literature and scope

- [Julesz, 1960](https://onlinelibrary.wiley.com/doi/abs/10.1002/j.1538-7305.1960.tb03954.x),
  *Binocular Depth Perception of Computer-Generated Patterns*: random-dot stereo
  pairs establish depth without monocular object outlines. Abstract reviewed;
  this is not a single-image construction algorithm.
- [Tyler and Clarke, 1990](https://christophertyler.org/CWTyler/TylerPDFs/TylerClarkeAutosterSPIE1979.pdf),
  *The Autostereogram*: depth-dependent horizontal repetition supports complex
  shapes. Display sampling constrains depth detail; spatial grayscale interpolation
  can encode fractional shifts. This does not justify blending successive frames
  or revive our rejected fractional-depth implementation. Relevant full-text sections reviewed.
- [Thimbleby, Inglis and Witten, 1994](https://harold.thimbleby.net/sirds/ieee3d.pdf),
  *Displaying 3D Images*: symmetric correspondence, visibility rejection and
  equality classes establish a reference construction. Correct links alone do not
  exclude unwanted echoes. Greater disparity is not automatically easier to fuse;
  output size and viewing geometry matter. Arbitrary object coloring is excluded
  by this construction. Geometry, algorithm, echoes and grayscale sections reviewed.
- [Yankelevsky et al., 2015 preprint / 2016 journal](https://arxiv.org/abs/1506.05036),
  *Depth Perception in Autostereograms: 1/f-Noise is Best*: pink noise combined
  faster coarse-depth acquisition with fine-detail detection. Full preprint reviewed.
  Scope: static grayscale stimuli, 15 capable viewers, seven in the fine-limit
  experiment; smoothed depth boundaries. It does not validate moving, colored,
  sharply occluded game scenes. Fine-limit findings were preliminary.
- [Simmons and Kingdom, 2002](https://mvr.mcgill.ca/Fred/Papers/Simmons%26Kingdom_2002.pdf),
  *Interactions between chromatic- and luminance-contrast-sensitive stereopsis
  mechanisms*: conflicting chromatic contrast can disrupt luminance stereopsis.
  Methods/results/discussion reviewed; two expert observers and Gabor stimuli,
  not autostereogram gameplay. Equal computed luminance is therefore insufficient
  evidence that mismatched eye colors are safe.
- [Magic Eye's production description](https://www.magiceye.com/how-magic-eye-images-work/)
  separately authors the hidden model and visible repeating pattern for an output
  size. It does not disclose proprietary construction or establish which method
  produced the user's childhood books.

### Static implementation audit

2026-10-02, Windows/Node 22.22.3, uncommitted `main`, no HEAD: source inspection
only; no new render, benchmark or perceptual validation.

[CPU presentation](../src/main.js) assembles complete worker frames and rejects
stale versions. [GPU presentation](../src/gpu/depthwalk-gpu.js) writes opaque current
pixels without blending; overlapping submissions are not mixed images. No application
TAA, motion blur or frame interpolation was found. History retains pattern identity
in [Quiet](../src/surface-stereo.js) and [paired modes](../src/chroma-stereo.js),
not previous rendered color/depth. Soft paired mixes current-frame source lighting;
that is a correspondence tradeoff, not temporal blending. External display processing
was not inspected.

Quiet averages source RGB over entire correspondence classes. Its default support
selects approximately 14.5% of class hashes for strong texture; others receive only
five intensity units of amplitude. This is code-derived selection probability, not
measured pixel coverage. Repeated source-color structure and weak matching contrast
are plausible contributors, not a proven complete diagnosis.

[Neutral dots](../src/pattern.js) uses eight grayscale tones and optional contours;
it is not a verified restoration of the original binary renderer. That historical
artifact is unidentified. RG16 input also does not guarantee fine output depth:
integer separations at P120/strength .5 allow 41 levels across the full canonical
range; half-resolution P60 allows 21. Actual scene occupancy can be smaller.

### Proposed extensions, not accepted fixes

1. Recover an independently checked monochrome reference: visible-pair geometry,
   correct foreground ordering, strong matching texture, fixed display calibration;
   exclude source RGB, contour tint and history from this reference. Existing
   geometry resembles the published construction; conformance is not yet established.
2. Design a spatial 1/f carrier before correspondence assignment, preserving exact
   matches and independent disocclusions. Verify its resulting texture structure;
   filtering seeds alone may not preserve the intended spectrum after mapping.
   This differs from the rejected solver below, which relaxed final matches.
3. Preserve texture contrast before adding compatible scene color. A scene-derived
   palette is a limited first step, not preservation of object paint. Local color
   must address conflicting class demands instead of hiding them with averages;
   retain neutral matching texture where compatibility is unavailable. This remains
   a hypothesis, not a new name for rejected paired-color variants.
4. Keep low-poly world design independent of stereo sampling quality. Require
   aligned current-frame inputs and complete outputs; no temporal image accumulation.
   Admit edge emphasis only when fusion survives it. Maximum strength is not the goal.

Separate necessary carrier repetition, false-depth echoes, source-color/contour
replicas and integer-depth terracing. One banding score cannot identify all four.
Existing metrics cannot certify human fusion. No coefficient sweep, new mode or
default promotion follows from this literature review.

## What is established

For a depth sample, the renderer derives visible screen endpoints L and R.
Exact-color stereograms require I[L] = I[R]. These equalities form a graph.
Transitivity forces every pixel in a connected component to share RGB.

Given desired screen-space RGB T, the closest exact solution is the mean within
each component. Its unavoidable squared error is:

`E_min = sum_components sum_pixels ||T[pixel] - mean(T[component])||²`.

This is a lower bound before adding any texture. It applies to this exact RGB
model and this target, not to all possible human stereopsis. A three-pixel chain
with desired gray levels [0, 255, 0] must become [85, 85, 85]. A different averaging
rule cannot preserve the central bright feature while keeping both equalities.

The original SIRDS construction explicitly excludes arbitrary coloring of depicted
objects. [Thimbleby, Inglis and Witten, 1994](https://researchcommons.waikato.ac.nz/entities/publication/0deacc2b-e333-4e6d-9d19-a5ad8d28598f).

## Why the attempted fixes behave as observed

- Quiet places source means and edge contrast on those components. Broad features
  therefore repeat along them. Correct correspondence alone does not prevent this.
- Neutral Quiet erased the color demands, making spill zero trivially. Human
  rejection disproves treating that metric as sufficient acceptance.
- The appearance solver minimizes `||I-T||² + lambda ||D I||²`, where D is the
  visible-pair difference operator. Its unconstrained solution is
  `(Id + lambda DᵀD)^-1 T`: diffusion along the graph. Large lambda approaches
  component means; small lambda preserves appearance but leaves pair disagreement.
- Nearest-surface projection changes T, not the conflict. One screen pixel can
  serve different surfaces in its left-eye and right-eye roles. Assigning it to
  the nearest surface in both roles is a compromise, not an occlusion proof.
- Selective weights reduce cross-boundary diffusion but still sacrifice matching
  evidence there. The experiment must measure both losses, not only color locality.

## Contrast hypothesis, not a proven solution

Constrain local feature shape/contrast instead of absolute RGB
everywhere: conceptually `||I-T||² + sum_s lambda_s ||D B_s I||²`, where B extracts
local contrast. The first implemented test uses a horizontal finite difference as B. Constant
patch means are provably unpenalized; the analytic regression checks this.
Held-out city tests reject this single-scale version: reducing spread also reduced
decoded depth and increased color conflict. Its DC freedom works algebraically, but
does not establish adequate perceptual matching.
Bounded projected-gradient iterations minimize the stated convex quadratic without
changing the observer. The fixed multiscale extension now compares horizontal and
vertical differences at offsets of one and four pixels along compatible visible depth pairs.
[CPU evidence](../evidence/multiscale-research.json), 2026-09-26, Windows/Node 22.22.3:
ten frames each of an isolated diamond and layered shapes, 640×360/P120. Both fail
the fixed conflict, motion, locality and source-color gates. Diamond conflict rises
2.7→20.3%; motion RMS rises 17.6%; remote spread only falls 37.5→34.3%, missing
the halving target. Depth/support and stationary gates pass. Layered shapes also
retain depth but show negligible locality improvement. Approximately 0.54–0.57
seconds per candidate render is research timing, not real-time performance.
No GPU implementation or default promotion follows; city validation was not run
after these early failures. Do not repeat coefficient sweeps without a changed,
falsifiable mechanism. Preserve a visible matching signal and address competing
disparities; simply overlaying the source image already failed.

Correlation-based stereo models motivate testing contrast structure, but do not
validate this synthesis proposal. [Read and Cumming, 2019](https://pmc.ncbi.nlm.nih.gov/articles/PMC6690401/).

Falsification checks: independently recovered depth at boundaries and interiors,
alternate peaks, source fidelity, eye-color conflict, motion stability, and held-out
poses. Human rejection overrides numerical success. No universal impossibility,
novelty, or human-fusion claim follows from this model.

`constraintAnalysis` in lab reports quantifies exact RGB error bounds, component
span and conflicting source-color demands. It is geometric analysis, not a comfort
score. [Observer methodology and current evidence](OBSERVER.md).

## Bounded color transport: rejected candidate

The causal test in `tests/banding-research.js` isolates one operation: replace
full-component RGB means with staggered groups of at most four samples, spanning
at most three pattern periods. Keep the complete depth graph, the same scalar
carrier seeds, noise amplitude, depth calibration and observer. No viewport crop,
blur, changed spacing or new random frames. The unbounded control reproduces Quiet
with contours disabled byte-for-byte; a constant-color test verifies that group
partitioning alone leaves the dense carrier unchanged.

Prediction: shortening color transport should reduce remote object-color copies,
but will sacrifice RGB agreement across group boundaries. The unchanged latent
carrier is insufficient proof that the final colored image supports the same depth.

Promotion gates were fixed before execution: halve remote-color fraction; lose at
most one percentage point of depth accuracy; retain 90% of supported area; increase
color conflict by no more than two points; increase motion luminance RMS by at most
5%; zero stationary drift. These are engineering rejection gates, not validated
human comfort thresholds. A failure stops promotion and GPU implementation.

[Recorded evidence](../evidence/bounded-color-research.json) includes source hashes,
all frame metrics and decisions at 640 and 1920 pixels wide, ten frames each.
These are two sizes of the same synthetic scene, not independent city validation.
At 1920 pixels, the control's largest class spans 1913 pixels. The candidate bounds
color groups to 348 pixels and retains roughly 75% of exact group-color pairs.
Remote-color fraction falls from 68.8% to 16.4%, but depth accuracy falls from
94.4% to 91.0%, supported area decreases, color conflicts triple and motion RMS
increases 21%. Both sizes fail depth, support, conflict and motion gates.

Removing contour emphasis alone leaves color spread unchanged in these fixtures.
The [native-pixel comparison](../evidence/bounded-color-comparison.png) still shows
local repeated silhouettes in the candidate. Neither hiding the remote copies nor
retaining the latent noise graph resolves the final-image binocular conflict.
The candidate stays in research code; it is not a game style or accepted fix.

## Color-base smoothing: rejected

The close-up in [Observer](OBSERVER.md#first-collectible-banding) exposes severe
repeated diamonds despite 95.2% recovered depth. `src/debug/color-base.js` tests two
fixed radius-eight, two-pass horizontal smoothers at native scale: class projection
between passes, or source-only prefiltering. Both retain the ordinary Quiet carrier,
depth, contours and seed history. These are CPU research controls, not live styles.

[Close-up evidence](../evidence/color-base-close.json), 2026-09-26, 1280×720/P120,
50% depth, original direction, 55% support, Bold edges and one-pixel dots:

| Measurement | Quiet | Class smoothing | Source prefilter |
| --- | ---: | ---: | ---: |
| Recovered depth within two pixels | 95.23% | 95.25% | 95.00% |
| Remote color fraction | 59.98% | 62.04% | 59.55% |
| Broad source-color error | 40.34 | 42.21 | 40.35 |
| Motion luminance RMS | .0631 | .0545 | .0620 |

Both miss the fixed locality gate; class smoothing also fails source fidelity.
Visual inspection finds softened diamonds, not removed bands. The isolated diamond
also fails locality ([report](../evidence/color-base-isolated.json)). Zero stationary
drift and retained decoded depth do not rescue either candidate. Source fingerprints,
environment and verification scope: [manifest](../evidence/color-base-verification.json).

## Local dot color: research

`src/debug/rank-color.js` keeps source color local and shares random thresholds
across stereo classes. Physical contours darken projected eye samples. Overlap
history retains seeds one-to-one, never old color/depth. Fresh seeds now avoid
identities already retained elsewhere; historical results predate that correction.
Human feedback on the earlier overlap preview: closer appearance, but no fusion.

**Exact matching dots** reserves half the classes for opaque matching dots; the
rest carry local source color and ink. **Continuous contrast** instead modulates
every pixel around its local source color using a shared signed signal. It preserves
more source appearance but relaxes final RGB equality. Neither is accepted.

[Current close-up](../evidence/fusion-close.json), 2026-09-26, CPU, 1280×720/P120,
50% depth, original direction, 55% support, ink, one-pixel dots; ten frames/profile:

| Measurement | Quiet | Matching dots | Continuous contrast |
| --- | ---: | ---: | ---: |
| Recovered depth within two pixels | 95.29% | 93.63% | 94.51% |
| Supported area | 79.91% | 86.12% | 85.98% |
| Remote color fraction | 59.98% | 0% | 0% |
| Eye-color conflict | 1.41% | 3.37% | 24.52% |
| Broad source-color error | 42.58 | 34.85 | 29.36 |
| Motion luminance RMS | .0633 | .1673 | .1065 |

Matching dots fail depth/motion; contrast fails conflict/motion. Both retain stationary
output and local color influence. Zero remote response does not prove perceptually
absent bands; local doubled silhouettes remain. [Diamond](../evidence/fusion-isolated.json),
[ring](../evidence/fusion-ring.json) and [layers](../evidence/fusion-layered.json) also reject
both candidates. Independent ring probes retain the background hole and local dark
ink without erasing matching dots. No live/default/GPU promotion or human-fusion claim.
The [640×360 preview](../evidence/fusion-close-preview.json) fails depth/conflict/motion.
Continuous contrast remains CLI research; no further coefficient sweep is justified
by these results. Human direction prioritizes useful output over additional variants.

[Earlier ranks](../evidence/rank-color-close.json) failed depth/conflict/motion.
[Four-level quantization](../evidence/rank-color-isolated.json) collapsed support;
local hue neutralization increased conflict. These remain research references.
[Verification, performance comparison and source fingerprints](../evidence/fusion-ten-verification.json)
record the current checkout; older reports remain scoped to their earlier runs.
