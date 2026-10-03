# Banding: model, predictions and limits

## Foundations and recovery direction

**Human direction, 2026-10-02:** The original monochrome effect felt better than
current noisy, vertically repeating modes. Literature now informs the authorized
v0.6 implementation. The enduring goal is a playable stereogram game and eventually
a reusable game filter with explicit limits and accepted degradation. Earlier
human implementation ideas are revisable hypotheses, not sources of technical
truth. Pure depth takes precedence over source appearance; observations of failed
fusion remain evidence. A monochrome reference does not solve source-color banding.

### Literature and scope

- [Julesz, 1960](https://onlinelibrary.wiley.com/doi/abs/10.1002/j.1538-7305.1960.tb03954.x),
  *Binocular Depth Perception of Computer-Generated Patterns*: random-dot stereo
  pairs establish depth without monocular object outlines. Abstract reviewed;
  this is not a single-image construction algorithm.
- [Tyler and Clarke, 1990](https://christophertyler.org/CWTyler/TylerPDFs/TylerClarkeAutosterSPIE1979.pdf),
  *The Autostereogram*: depth-dependent horizontal repetition supports complex
  shapes. Page 187 proposes fractional repetition phase using grayscale samples of
  high-resolution noise. This is spatial sampling, not successive-frame blending;
  the paper does not validate moving gameplay. Our rejected row-dithered depth
  candidate is a different mechanism. Relevant full-text sections reviewed.
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

2026-10-02, Windows/Node 22.22.3; first-attempt source now preserved at `v0.5` /
`2a1278b`: static inspection only, not a render or perceptual validation.

[CPU presentation](../src/main.js) assembles complete worker frames and rejects
stale versions. [GPU presentation](../src/gpu/depthwalk-gpu.js) writes opaque current
pixels without blending; overlapping submissions are not mixed images. No application
TAA, motion blur or frame interpolation was found. History retains pattern identity
in [Quiet](../src/surface-stereo.js) and [paired modes](../src/chroma-stereo.js),
not previous rendered color/depth. Soft paired mixes current-frame source lighting;
that is a correspondence tradeoff, not temporal blending.

**Driver audit, 2026-10-02:** Windows, RTX 3090, driver 616.64, checkout `545de5a`.
NVIDIA app global settings show Image Scaling, FXAA, transparency AA, MFAA,
Smooth Motion and Dynamic Vibrance off; DLSS overrides use application settings.
[Image Scaling off also disables its sharpening](https://www.nvidia.com/content/Control-Panel-Help/vLatest/en-us/mergedProjects/3D%20Settings/Manage_3D_Settings_%28reference%29.htm).
RTX Video Super Resolution is off; Video HDR is disabled. DSR 2×/33% is configured,
but displays report native/recommended 1920×1080 and 2560×1440 resolutions.
Read-only NVAPI queries for global and running Codex/Firefox/WebView2 profiles
returned setting-not-found for queried AA/upscaling/DLSS controls; these do not
independently prove effective per-program settings. No driver settings changed.
Current application inspection retains nearest depth sampling, disabled WebGL AA
and unblended frame presentation. Browser zoom, compositor resampling and monitor
processing remain unverified; this audit neither proves fusion nor excuses synthesis
defects.

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

### v0.6 foundation implementation

[FoundationFilter](../src/foundation-stereo.js) now supplies a depth-only reference
and white/pink texture controls, reused by [the comparison](../tests/foundations.html)
and the playable city on WebGPU or CPU workers. Both use the same visible-pair graph and
foreground-near mapping. Odd-separation centering alternates by absolute row as
in TIW figure 3; existing renderer calls retain their original centering. The
historical original renderer remains unidentified, not retrospectively restored.

**Human direction, 2026-10-02:** Defaults must track paper findings and subsequent
implementation changes; ordinary use must not require random slider tuning. The
game now starts with pink texture, spacing 96 CSS pixels, strength .33, full image,
foreground near and no ink/history. Pink follows the cited static acquisition
results; spacing/strength are engineering starting values, not paper-derived optima
or validated gameplay settings. World and three texture choices remain visible;
Advanced holds legacy modes and fine tuning. E cycles only foundation textures
unless Advanced is open. [Preferences](../src/preferences.js) fingerprint starting
values: changed defaults retire previous tuning; same-preset adjustments persist.
Use latest defaults restores controls without changing pose/signals. Explicit
foundation URLs still select their named carrier. Future changes must update this
starting preset when appropriate; the mechanism prevents older saves hiding it.

[Carrier generation](../src/foundation-texture.js) uses deterministic Gaussian noise
and a two-dimensional Fourier amplitude weight of `1/sqrt(f)` for pink `1/f`
power. White/pink inputs share mean 128 and RMS 48 before byte clipping. Binary
uses black/white extremes and therefore is not contrast-matched. Static reference
textures are cached by full-frame dimensions and seed. Assign
one texture sample per unconstrained class; never wrap seed coordinates at the
stereo period or blur finished pixels. Correlated neighboring pink samples are
intentional; distinct disocclusions are not forced into a shared seed identity.

[Tests](../tests/foundation.test.js) cover an independent floating-point ray/union
oracle, exact visible pairs, foreground ordering, absent color influence, held-frame
restoration, origin/stripe agreement, an independent DFT power-exponent check and
retained broad texture on a flat encoded surface. This is bounded numerical
coverage; the spectrum after arbitrary occlusion mapping, fusion, motion comfort,
and moving-game fusion remain unconfirmed. [GPU checks](../tests/gpu-checks.js)
compare all three carriers, roots, visibility and final presentation against the
reference. Motion/hold/revisit sequences verify current-depth output, identical
stationary frames and no image history; these do not prove perceptual stability.

The comparison starts still with synthetic depth shapes; Original city and Block
study close-ups use the existing capture adapter. Treatment changes hold the same
scene frame. A direct link opens the selected carrier in gameplay. The game
defaults to WebGPU with CPU fallback, caps foundation output near 2 MP and disables
ignored color/ink/dot-size/reversal controls. Gameplay prepares identical cached
carrier bytes in a shared worker; per-frame depth/matching/presentation stay on GPU. API bounds
and accepted formats live in [Integration](INTEGRATION.md#foundation-cpu-research-api).

### Motion carrier

**Human observation, 2026-10-02:** The moving carrier initially removed reported
bands while retaining objects/edges. The 25%-softer comparison received a qualified
positive response: depth remains, harsh TV static dominates movement and reportedly
lingers 1–2 seconds after stopping; one possible brief band appeared on the diamond.
Half contrast subsequently helped but remained too harsh; it was not promoted.
The possible band qualifies the earlier report. Comfort and broader acceptance remain open.

[Tyler, 2014](https://www.scholarpedia.org/article/Autostereogram), dynamic
autostereograms section, describes independent patterns per frame to remove
correlated texture motion that can compete with depth. This supports a different
mechanism from the rejected depth dithering and color transport: keep current
visibility/disparity, replace only the carrier. It predicts reduced coherent
travel, with local moving grain as the tradeoff; it does not promise static-looking
motion or eliminate integer depth terracing.

[Papadimitriou et al., *Psychophysics of Autostereogram Videos*](https://homepages.inf.ed.ac.uk/rbf/PAPERS/rdsvideos.pdf)
(author-hosted manuscript, reviewed) tested single-image videos: 640×480, 50 fps,
fresh fields, simple objects; 26 observers for contrast/repetition, 13 for blur/color.
Fusion survived fresh fields and reduced contrast. This supports testing, not
optimal refresh, comfort or transferable thresholds for our pink texture/displays.
Conflicting blur-radius ranges also preclude importing a universal blur setting.

[Allison and Howard, 2000](https://www.eecs.yorku.ca/~rallison/papers/Allison-Stereopsis_with_persisting.pdf)
(full paper reviewed) tested eight observers with binocular pairs, 33.5 Hz motion
frames and 3.8-second movements. Renewed texture increased perceived peak depth.
A five-observer follow-up manipulated perspective/disparity agreement: persistent
texture favored conflicting perspective cues; concordant cues worked with either
texture. This supports testing the motion implied by texture, not assuming all
temporal correlation is harmful. It does not establish SIRDS comfort.

[Kane, Guan and Banks, 2014](https://pmc.ncbi.nlm.nih.gov/articles/PMC3898296/)
(methods reviewed) used fresh dots every 5 ms on 200 Hz CRTs, four observers and
stereoscopic pairs. Disparity-modulation limits concern changing depth, not grain
refresh. This supports separate timing tests, not high-refresh gameplay comfort.

[Palmisano, Allison and Howard, 2006](https://www.eecs.yorku.ca/~rallison/papers/Allison-%20Effect%20of%20decorrelation%20on%203d.pdf)
(methods/results reviewed) compared persistent dots with 80/26 ms lifetimes in
binocular pairs. The dynamic experiment used three experienced observers, a 75 Hz
display and stationary depth for 1.6 seconds. Renewal improved tolerance to
interocular decorrelation; 26 ms did not significantly outperform 80 ms, possibly
because of a ceiling. Maximal renewal is therefore not established as necessary.
These conditions do not validate slower full-field flashes or asynchronous SIRDS
renewal; either is a separate engineering hypothesis.

[Tseng et al., 2006](https://pmc.ncbi.nlm.nih.gov/articles/PMC1595457/)
(methods/results reviewed) separated motion direction, spatial recognition and
speed judgments in three observers viewing binocular random-dot gratings.
Depth-defined motion could appear stopped while the structure remained visible.
Their approximately 4–6 Hz result describes passing depth-pattern cycles, not
recommended grain refresh. Acceptance must include correct approach/recession and
motion direction, alongside fusion and harshness; reconstruction alone misses this.

[Delamare et al., 2019](https://hci.cs.umanitoba.ca/assets/publication_files/autostereo-final.pdf),
*Interacting with Autostereograms* (methods/results/limitations reviewed), tested
36 participants across six sessions on a 464×824, approximately 25 fps smartphone
application. Twenty-one could not clearly see the depth-press animation, which
regenerated random colors. This supports checking interaction during changing
depth, beyond static recognition. Their whole-screen color feedback was not source
color reconstruction; exposure did not constitute a full dynamicity study.

**Research boundary:** The reviewed papers establish constructions, static texture
tradeoffs and some dynamic tasks. None establishes a comfortable arbitrary-game
carrier. The 1994 paper's qualitative shimmering advice is not a refresh optimum;
the static pink-noise study does not validate our procedural temporal spectrum.
[GPU Gems, chapter 41](https://developer.nvidia.com/gpugems/gpugems/part-vi-beyond-triangles/chapter-41-real-time-stereograms)
is an engineering strip-feedback implementation with z-buffer animation, not a
perceptual validation of our equality-class solver or driver processing.

[Motion sampling](../src/foundation-motion.js) hashes coordinates and a uint32
frame identifier. Binary uses full contrast; grayscale approximates Gaussian
noise; pink combines normalized spatial octaves, with an independently tested
approximate 1/f power slope. This differs from the static FFT reference. Each
current class still receives one value, preserving every pair without mixing
past pixels. CPU and GPU share the construction; GPU generates tones directly.

The game defaults to **Reduce moving bands** under Advanced. It advances the
carrier at most 60 Hz while camera/visibility changes, freezes at an exact pose, and
starts with the static reference. The rate is an engineering bound, not a
paper-derived optimum. Turning it off restores the static comparison. General
hosts must supply their own animation/frame identifiers; the demo has static
geometry. [API](INTEGRATION.md#foundation-cpu-research-api).

**Cadence finding:** Simulated 60 fps ±0.12 ms jitter yields 30 grain updates/s.
Per-submitted-frame refresh preserved depth; the user reported **no meaningful
difference**. It remains a unit-test comparison, not the default. GPU grain advances
after queue admission; submission counts are not measured display timing.

**Compare moving grain:** A · Current; B · Half contrast (0.5 around gray 128).
Timing, texture field, visibility and depth remain unchanged. `?motion-compare=contrast`
opens B; `baseline` opens A. URL-scoped; reset restores A. Switching preserves pose
and frame identity. Human feedback keeps B optional; stop reducing contrast.

**Tiny-step finding:** [Coupled diagnostic](../tests/tiny-step-check.js) measures
pixel changes and independent depth reconstruction, varying depth/grain separately.
[Four game cases](../evidence/tiny-step-verification.json), Block study at 1280×720,
use one simulated 60/240 Hz input tick, not an absolute human minimum. At spawn,
the smaller step changes no stereo classes yet replaces 99.43% of pixels;
holding grain produces identical output. Near the diamond, held grain changes
0.24% versus 99.33%. Half contrast reduces amplitude without restoring correlation.
Depth remains approximately 98–99% within two disparity pixels: good per-frame
reconstruction can hide severe temporal discontinuity. Judge both jointly;
micro-step success cannot replace longer-motion band checks or human review.

**Release fix:** At 30/60/144/240 Hz, keyboard damping prolonged pose changes by
611–700 ms (18–40 fields). Faster damping/cutoffs settle in 142–167 ms (4–9 fields),
preserving acceleration and exact rest. Simulations cover sprint/walk/turning;
CPU/GPU gameplay confirms settling by 300 ms. This addresses part of the tail,
not moving harshness. Mouse input has no equivalent damping.

The earlier 25% reduction lowered contrast-weighted decoder confidence, initially
causing its withdrawal. [Fixture/settings/results](../evidence/foundation-verification.json)
remain reproducible. That proxy cannot establish perceptual failure: paper contrast
tolerance justified human review, which found improvement but insufficient comfort.
Guard baseline signal quality; distinguish depth accuracy, contrast-weighted confidence,
grain discomfort and fusion.

**Rejected reuse hypothesis:** [Reproducible CPU study](../tests/foundation-reuse-research.js)
retains a class's texture epoch only when its complete pixel membership is unchanged;
no old RGB is mixed. This is an engineering extension, not a published result.
Three 384×128 synthetic routes retain exact current pairs and lower average flicker,
but turn/approach concentrate updates into strips (column energy variation
1.15/2.09 versus 0.12); a flat approach has ten quiet transitions then one large
refresh (68/255 RMS). These proxies expose a regression risk, not observed human
banding. Keep it offline. Reduced average flicker alone is insufficient.

**Encoded brightness finding:** [Diagnostic](../tests/foundation-luminance-research.js)
and [results](../evidence/foundation-luminance-verification.json) cover 60 procedural
pink fields at 640×360, fixed flat/two-depth scenes, spacing 96 and strength .33.
Frame 51→52 changes whole-image mean by 16.84/15.21 and the largest 3×3 region
mean by 24.40/24.16 grayscale code values. Pointwise variance normalization does
not constrain the mean after a narrow population of class roots is repeated.
The old raw-field check did not establish freedom from global flashing; its name
now states its limited scope. Regional changes can also cancel in a global mean.
These measurements are not linear-light brightness or comfort thresholds.

**Mechanism isolation:** [Counterfactual study](../tests/foundation-mechanism-research.js)
and [results](../evidence/foundation-mechanism-verification.json) separate changing
depth at held grain from renewing grain at current depth, retaining the signed
interaction term. At the fixed-depth brightness peak, whole-image and 3×3 regional
means explain only 5.93% and 7.32% of difference energy; removing those regional
means mathematically still leaves 66.58/255 RMS. That diagnostic subtraction is
not a renderer: independent region corrections can break stereo pairs. A tiny
depth step with unchanged classes contributes zero held-grain change. Conversely,
the first flat-plane disparity transition in the specified approach changes 86%
of root labels and produces 56.45 RMS even with grain held. Label changes are not
a lower bound on changed pixels.

The same study computes optimistic least-change bounds for the actual old image
under the new exact equality classes. Preserving global mean and standard deviation
requires at least 43.33/255 RMS at that flat transition, versus 5.33 for the two-pixel
occluding-edge turn and zero for unchanged classes. Allowing contrast loss lowers
the flat bound to 38.61 RMS but retains only 30.35% of horizontal variance. These
real-valued bounds omit byte limits, spectrum and competing matches; preserving
each row's moments adds a stricter constraint, reported separately. They are not
renderers or comfort thresholds. Brightness correction alone cannot address the
dominant change, and better class assignment cannot eliminate every transition.
Apply these bounds to recorded gameplay before selecting another mechanism.

**Fractional-method distinction:** the [removed row-dithered trial](OBSERVER.md#ink-contours)
failed city checks. Its implementation is absent from current source and the
available branch snapshots, so its exact rounding schedule is unverified. That
failure does not reject all fractional spatial reconstruction. Tyler and Clarke's
proposal remains untested here; TIW's grayscale palette still uses integer separation.
Neither paper establishes a comfortable moving solution for this game.

**Rejected continuous-carrier hypothesis:** [Offline study](../tests/foundation-temporal-research.js)
and [results](../evidence/foundation-temporal-verification.json) compare independent,
persistent and continuously evolving procedural fields over four/eight samples.
Only source tones evolve; current pairs remain exact, with no rendered-image or
depth history. Four synthetic 384×128 routes contain 48 samples each; these are
short CPU sequences, not timed display or sustained gameplay tests. Mean output
contrast stays near 47–48 grayscale levels. On the unchanged-graph control,
eight-sample evolution lowers mean frame RMS from 67.71 to 9.49. However, turn
column-energy variation peaks at 2.72 versus .19; a flat approach still bursts
to 55.47 RMS when 82.81% of class roots change. Translated-match evidence reaches
96% of sampled patches on another flat-approach transition. Sampled reconstruction
remains approximately 94–100% within two disparity pixels. Rejected for promotion:
average flicker hides concentrated changes and large transition bursts, despite
intact depth. This exposes artifact risk, not newly observed human banding.

[Checks](../tests/foundation-motion.test.js) preserve pairs, contrast, spectrum and
worker seams. The legacy correlation peak includes zero displacement: stationary
texture scores one, so it cannot label travel. Additive [temporal diagnostics](../tests/foundation-motion-quality.js)
separate zero-shift evidence, translated improvement, ambiguous peaks, direction,
flicker and column concentration. Fixed, independent, translated, expanding and
contracting controls verify their scope. Missing evidence is null; integer search
limits and engineering thresholds remain explicit. Human fusion, direction judgment,
interaction success and comfort remain separate acceptance requirements.

### Remaining extension hypotheses

1. Preserve accepted band reduction while improving moving-grain comfort and fusion.
   Isolate class reassignment from carrier renewal and encoded brightness pumping.
   Exact-class reuse and simple continuous carrier evolution are rejected above;
   lowering average flicker alone is insufficient. Spatially distributed renewal
   is untested and must confront the same flat-plane transition. Display/viewer
   calibration and complex occlusions still need validation. No contrast or timing
   optimum is established for this game.
2. Evaluate whether the pink carrier helps acquisition without sacrificing detail
   after depth mapping. This differs from the rejected solver below, which relaxed
   final matches. Spectral agreement alone is not a promotion criterion.
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
Existing metrics cannot certify human fusion. These implementations are controlled
research paths; no default promotion follows from numerical checks.

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
