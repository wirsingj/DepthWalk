---
role: research-paper
purpose: Early pre-release manuscript presenting scoped methods, results and limitations.
not-here: Product authority, release acceptance or a chronological experiment log.
status: early-pre-release
version: 0.1-pre.5
date: 2026-11-01
evidence-through: 2026-11-01
durability: Reconcile affected claims with evidence; preserve historical result scope.
update-when: Research methods, results, interpretations, citations or limitations change.
read-with: SOT.md; STEREO-CONSTRAINTS.md; MAINTAINER_GUIDE.md.
---

# Toward Temporally Stable Autostereograms for Interactive Games

## Separating Texture Renewal, Correspondence Changes, and Perceptual Quality

**Early pre-release 0.1-pre.5 — seam constraints evaluated 1 November 2026**

**Experimental record through 1 November 2026**

**Status:** Preliminary engineering study; no controlled human-observer study or peer review.
This is a manuscript version, not a game release or an accepted rendering algorithm.

## Abstract

Single-image autostereograms can communicate three-dimensional shape on an ordinary display, but maintaining comfortable depth during interactive movement remains challenging. In the DepthWalk prototype, informal feedback identified a tradeoff between objectionable moving bands and harsh, rapidly changing texture. We developed diagnostics that separate texture renewal from changes in stereoscopic pixel correspondence, estimate minimum image changes under exact correspondence constraints, and reconstruct disparity independently from rendered images.

Small prescribed movements produced approximately 67–68 grayscale levels of frame-difference RMS, despite optimistic correspondence-constrained bounds of 0.66–5.78. An offline procedural-seed assignment candidate reduced mean frame differences by approximately 62–83% across four short scene routes, but retained large transition bursts and altered spatial texture statistics. A separate flat-plane experiment reduced a rounding-boundary transition from 25.14 to 2.46 RMS using continuous spatial sampling at matched contrast.

An independent local observer recovers fractional disparity while abstaining on uncertain boundaries. Continuous two-plane synthesis reduces rounding-transition peaks but exposes sampling errors and texture changes on stationary background. Matching seed values at seams improves scoped static reconstruction while worsening motion or contrast. Stronger derivative constraints can misdecode thin foreground on fresh geometry. These limits precede scene integration and perceptual testing; comfortable gameplay is not established.

## 1. Objective and motivation

The intended application is a playable videogame whose three-dimensional scene is perceived through a single-image autostereogram. A longer-term objective is a reusable rendering layer for other games, with explicit restrictions and accepted losses of source appearance.

The practical requirements are:

- Correct foreground–background ordering and reliable depth acquisition.
- Stable, comfortable perception while walking and turning.
- Recognizable shapes, silhouettes, and interaction targets.
- Preservation of source color and lighting where compatible with stereoscopic correspondence.
- Predictable rendering cost and latency.

Earlier iterations emphasized source color and visual detail before establishing a satisfactory moving depth reference. Informal feedback subsequently reported strong repeating bands, followed by substantial improvement in banding when texture was renewed during movement. Harsh television-like static remained.

These observations motivate this study. They are development feedback, not results from a controlled observer experiment.

## 2. Research foundations

Tyler and Clarke described autostereogram construction through depth-dependent repetition. Their discussion of grayscale sampling also suggests representing fractional repetition shifts rather than restricting depth changes to whole dots. This supports investigating spatial sampling, but does not establish a comfortable game renderer. [*The Autostereogram*, 1990](https://christophertyler.org/CWTyler/TylerPDFs/TylerClarkeAutosterSPIE1979.pdf).

Thimbleby, Inglis, and Witten provide a reference construction based on symmetric correspondences, visibility testing, and groups of pixels constrained to share a value. Their treatment also identifies unwanted echoes and restrictions on arbitrary coloring. These constraints make stereogram generation different from applying an ordinary color filter to a scene. [*Displaying 3D Images: Algorithms for Single Image Random Dot Stereograms*, 1994](https://harold.thimbleby.net/sirds/ieee3d.pdf).

Yankelevsky and colleagues found advantages for pink-noise patterns in depth acquisition and detail detection under their static experimental conditions. This motivates pink noise as a reference texture; it does not establish its superiority during interactive movement or at sharp occlusions. [*Depth Perception in Autostereograms: 1/f-Noise is Best*, 2015 preprint](https://arxiv.org/abs/1506.05036).

Allison and Howard found stronger perceived changing depth with dynamic than persistent textures in binocular stereograms, discussing conflict between stereoscopic and monocular cues. Their experiment used separate eye images rather than single-image gameplay. It cautions against assuming that greater temporal persistence necessarily improves perception. [*Stereopsis with Persisting and Dynamic Textures*, 2000](https://www.eecs.yorku.ca/~rallison/papers/Allison-Stereopsis_with_persisting.pdf).

Petz, Goldlücke, and Magnor demonstrated hardware-accelerated interactive autostereograms using texture projection. Fractional texture sampling improved depth resolution, with spatial filtering introducing blur. Their work establishes relevant implementation precedent, while leaving our gameplay-comfort question open. [*Hardware-accelerated Autostereogram Rendering for Interactive 3D Visualization*, 2003](https://cvai.cit.tum.de/_media/spezial/bib/pgm03_has.pdf).

Byunn-Rieder's 2025 bachelor's thesis, [*Stereogram Arcade*](https://dash.harvard.edu/items/cfa6ac03-d6d4-4dcd-837e-7168a6ddf021), describes parallel row computation and slope-aware depth dithering before correspondence construction (pp. 15–18). Full-text review found a static visual comparison but no reproducible dither specification, measured hardware benchmark or controlled motion study. Its reference [4], [Steer's technical account](http://www.techmind.org/stereo/stech.html), supplies a distinct spatial method: construct correspondences at higher horizontal resolution, then integrate samples into display pixels. Its visibility shortcut has a documented thin-object limitation. These methods motivate controlled comparisons; neither establishes our moving-game objective. [Detailed comparison and prior dither failure](STEREO-CONSTRAINTS.md#stereogram-arcade-and-sampling-references).

Zou et al.'s [*NeuralMagicEye*, section 4.6](https://arxiv.org/html/2012.15692) reports network-optimized images that machines decoded but humans did not perceive in depth. A separate human acceptance gate remains essential.

## 3. Methods

### 3.1 Reference renderer

The current depth-first reference uses symmetric visible correspondences and exact pixel equality within each resulting correspondence class. The viewing convention is parallel, or looking through the display, with foreground objects encoded as nearer.

The application uses WebGPU by default with a CPU reference and fallback. Application-level rendering does not accumulate previous rendered images, blend successive depth maps, or interpolate stereogram frames.

The moving reference renews procedural texture at up to 60 Hz and holds it at rest. Experiments below examine alternatives without changing this production default.

### 3.2 Measurement

Frame change is measured as:

$$
E(A,B)=\sqrt{\frac{1}{N}\sum_{i=1}^{N}(B_i-A_i)^2}.
$$

Values are grayscale display codes on a 0–255 scale, not calibrated linear-light luminance. Contrast is measured as the population standard deviation of these codes.

An image-only decoder estimates disparity before the expected scene disparity is supplied for comparison. Reported reconstruction accuracy means the percentage of sampled estimates within two image pixels of the expected disparity. The general decoder searches integer disparities within configured bounds and compares rounded targets; it cannot establish subpixel accuracy. The separate flat-plane decoder below searches fractional periods but does not resolve occluded scenes. Neither measures human fusion or comfort.

Section 4.6 separately calibrates a local fractional observer; section 4.7 applies its unchanged thresholds to a single-image edge experiment. Neither rescores the historical renderer experiments. [Method, fixed thresholds and limitations](STEREO-CONSTRAINTS.md#local-fractional-observer).

### 3.3 Separating mechanisms

Counterfactual renders compare:

1. Previous depth with previous texture.
2. Updated depth with previous texture.
3. Updated depth with renewed texture.

This separates correspondence changes from texture renewal. Difference-energy accounting retains their signed interaction term.

We also compute a least-change diagnostic: the smallest possible image change compatible with the new exact correspondence classes. A stricter variant preserves global mean and contrast.

These are optimistic, real-valued bounds. They omit display gamut, quantization, texture spectrum, competing matches, and perceptual requirements. The projection used to calculate a bound is not a proposed frame-blending renderer.

### 3.4 Scene captures

Actual-scene experiments use the original city at 1280 × 720, procedural seed 173, spacing 96, and strength 0.33.

Tiny-step captures apply one prescribed forward-input tick at either 240 or 60 simulation ticks per second. These are controlled small movements, not a measurement of the smallest possible human keypress.

Longer captures cover four routes: turning and approaching from spawn, and turning and approaching near the first collectible. Each contains 72 transitions, equivalent to 1.2 seconds at the nominal simulation rate.

Capture is sequential. These experiments are not timed gameplay or performance benchmarks.

## 4. Results

### 4.1 Tiny movement can trigger disproportionately large image changes

Across four tiny-step cases, actual output changes were 67.35–67.98 RMS. Correspondence-constrained bounds preserving global mean and contrast were only 0.66–5.78 RMS.

The prescribed forward distances were approximately 0.000610 and 0.009063 game units. An unchanged-state control produced no image change.

The gap indicates substantial scope to reduce image changes in these cases. It does not establish that the lower bounds correspond to visually acceptable images. [Tiny-step evidence](../evidence/tiny-step-bound-verification.json).

### 4.2 Brightness correction alone is insufficient

At the examined fixed-depth texture transition with the largest brightness change, the global mean explained 5.93% of difference energy. Means from a 3 × 3 regional partition explained 7.32%.

Mathematically removing regional mean changes still left 66.58 RMS.

Most change in this case therefore remained beyond coarse brightness fluctuation. Independently correcting regions would also risk violating stereoscopic correspondences; the subtraction was diagnostic only. [Mechanism evidence](../evidence/foundation-mechanism-verification.json).

### 4.3 Procedural-seed assignment lowers averages but retains bursts

An offline candidate assigns previous procedural texture identities to new correspondence classes using greedy, one-to-one overlap matching. It retains procedural coordinates and epochs rather than averaging previous rendered pixels.

| Route | Independent texture: mean RMS | Assignment candidate: mean RMS | Candidate peak RMS |
|---|---:|---:|---:|
| Spawn turn | 67.53 | 23.72 | 25.27 |
| Spawn approach | 67.55 | 11.27 | 32.01 |
| Collectible turn | 67.52 | 25.74 | 26.73 |
| Collectible approach | 67.53 | 21.86 | 52.71 |

Mean frame change decreased by approximately 62–83%. Current correspondence pairs remained exact, and selected worst-frame reconstruction samples retained at least 97.65% accuracy within two disparity pixels.

However, near-collectible approach still produced a 52.71 RMS burst. Contrast remained near 47.34–47.82, while neighboring-pixel differences increased from roughly 53 to 63. Preserving contrast therefore did not preserve the original texture’s spatial structure.

The candidate remains offline and unvalidated by human observers. [City assignment evidence](../evidence/game-motion-assignment-verification.json).

### 4.4 Some discrete correspondence transitions impose substantial costs

A synthetic flat-plane transition required at least 43.33 RMS under the exact-class, fixed-global-contrast constraint. A tested occluding-edge turn required only 5.33 RMS; unchanged classes required zero.

This variation matters. Better texture assignment can reduce avoidable renewal, but cannot eliminate every transition cost within the tested discrete representation.

These bounds do not establish a universal limitation of autostereograms. They apply to the particular old image and new correspondence constraints. [Mechanism study](../tests/foundation-mechanism-research.js) and [evidence](../evidence/foundation-mechanism-verification.json).

### 4.5 Continuous spatial sampling reduces a controlled rounding discontinuity

A separate flat-plane experiment compares continuous and rounded repetition periods using the same finite Fourier texture, amplitude, anchor, and analytical pixel-area integration.

Across a 1/16-pixel step at a rounding boundary:

| Sampling method | Frame-difference RMS |
|---|---:|
| Rounded repetition period | 25.14 |
| Continuous repetition period | 2.46 |

Both conditions retained contrast near 26.15, without clipping or repeated filtering. An independent image-only decoder recovered sampled periods within 1/32 pixel in its declared search range.

This is an engineering control, not a reproduction of a published algorithm or a working scene renderer. Its contrast differs from the gameplay experiments, so the absolute values must not be compared directly.

Coherent texture expansion and contraction remained. Occlusions, disocclusions, and human comfort were not tested. [Fractional sampling evidence](../evidence/fractional-phase-verification.json).

### 4.6 Local observer calibration separates accuracy from missing coverage

On 30 October 2026, an image-only patch observer recovered all 84 periodic single-image controls within 0.02125 pixels. Blank, weak, unrelated and ambiguous harmonic controls were rejected. A deliberately wrong disparity remained decodable but failed separate ground-truth comparison, preventing a target-informed decoder from manufacturing success.

Separately ray-rendered eye images tested wide, translated and thin foreground posts and off-grid depths. Of 696 samples, 375 were accepted, with maximum error 0.01875 pixels and no false accepted matches at the declared 1/16-pixel tolerance. All 189 interior samples passed; all 81 occluded samples were rejected. Six newly visible samples and the thin foreground remained unmeasured.

These results calibrate sparse image evidence, not a single-image occlusion renderer. Abstention must remain visible when judging subsequent candidates. Blur also retained correct disparity while lowering measured texture gradients, so depth recovery alone cannot certify appearance. [Calibration evidence](../evidence/fractional-observer-verification.json).

### 4.7 Continuous edge synthesis reduces rounding jumps but leaves sampling and motion failures

An offline two-plane renderer traces visible correspondences in continuous screen coordinates and analytically integrates the original finite Fourier field once per pixel. Visibility cuts split integration intervals; left-occluded background starts a separate seed phase. Rounded geometry and 8x nearest-subpixel links provide matched-field controls, scored against original geometry. No previous image, texture renewal or per-frame contrast normalization is used. These are research controls, not a comparison against gameplay.

Across three seeds and four scenes, 371 of 696 continuous-image estimates are accepted; 370 meet the fixed 1/16-pixel tolerance. One thin-post background estimate errs by 0.09375 pixels. All 81 occluded samples are rejected; thin foreground and six newly visible samples remain unmeasured. All 4,524 sampled continuous-field correspondences agree within 3.1e-12 grayscale levels, distinguishing field construction from displayed-image evidence. The error persists without byte rounding and varies with interpolation support; this implicates sampling/observer behavior without establishing a unique cause. Primary thresholds remain unchanged.

Across three seeds, near-depth rounding-crossing peaks fall from 10.45–11.40 to 0.81–0.96 RMS; far-depth crossing peaks fall from 20.14–20.81 to 1.71–1.75. Continuous output retains contrast of 25.68–26.57 and horizontal-gradient RMS of 14.86–16.34. Out-and-back translation/depth routes reproduce exact rest, return and reversal. However, moving silhouettes still cause 1.98–2.69 RMS changes on stationary background away from their projections. Worst-frame reconstruction accepts 738/1,392 estimates, with the same one error.

The candidate remains offline. Reduced rounding jumps do not resolve propagated texture motion, displayed sampling, missing boundary coverage or human comfort. [Method, audit and limitations](STEREO-CONSTRAINTS.md#fractional-edge-synthesis); [reproducible evidence](../evidence/fractional-edge-verification.json).

### 4.8 Seam continuity improves static reconstruction without satisfying joint acceptance

An engineering extension projects finite Fourier seed coefficients onto value-continuity constraints, optionally matching derivatives or separating the two seed regions. The continuous correspondence geometry and image-only observer remain unchanged. No old frames, output normalization or clipping are used; coefficient adjustment can reduce signal energy and change texture globally.

Across the same 696 primary samples, value continuity yields 395 correct accepts without wrong accepts; slope continuity yields 406, and independent seeds 405. Six-harmonic and shared-phase controls instead increase wrong accepts to four and nine. Every treatment fails joint screening: depth alone is insufficient when motion, contrast or detail regresses.

Fresh seeds and off-grid geometry provide 360 samples per selected treatment. Value-only matching yields 246 correct accepts and zero wrong accepts. Slope matching yields 270 correct and four wrong, including thin foreground decoded as background. Independent seeds with support fading yield 272 correct and one false occlusion match. Missing estimates remain unmeasured, not successful. Screening criteria were specified before holdout; the original observer and 1/16-pixel tolerance were not retuned.

Two boundary corrections remain useful independently of promotion. Fading the coefficient correction below one projected pixel removes a finite global change as a post vanishes. Treating out-of-image partners as unconstrained seeds removes 15.24 RMS recoloring from a fully offscreen post while preserving the original twelve baseline images byte-for-byte. [Method, thresholds, evidence and limitations](STEREO-CONSTRAINTS.md#seam-constraints-and-boundary-controls).

## 5. Interpretation and limitations

The findings distinguish three problems: unnecessary texture renewal, abrupt changes imposed by a discrete correspondence representation, and perceptual discomfort that numerical image metrics cannot settle.

Lower frame-difference RMS is useful evidence, but insufficient as an acceptance criterion. A quiet image can lose depth contrast, accumulate blur, retain incorrect matches, or concentrate its remaining changes into conspicuous strips.

Likewise, concentrated changes and coherent texture motion are not automatically artifacts. Control cases showed that legitimate moving boundaries can produce high concentration measurements. Identical image motion can represent intended surface motion or unwanted pattern drift; interpretation requires scene context. [Diagnostic counterexamples](../tests/foundation-motion-quality.test.js).

The present evidence is limited to short routes, restricted seeds and settings, synthetic controls, and selected reconstruction samples. There is no controlled observer study, calibrated viewing setup, sustained gameplay assessment, or demonstrated integration with another game engine.

Source-color fidelity and edge enhancement remain objectives rather than established results. They require evaluation alongside correspondence integrity and competing-match behavior.

## 6. Next experiments

The immediate next experiment should investigate seed bases with local spatial support and explicit birth/death behavior, reducing geometry-driven global coefficient changes. Preserve original depth and fresh-geometry checks: smooth seams alone do not establish correct thin-surface or disocclusion evidence. Record viewing geometry before human comparisons. Avoid interpolating depth across silhouettes; the historical two-pixel accuracy measure alone cannot validate this extension.

Candidates that survive this test should be evaluated across additional seeds, depth ranges, motion speeds, and longer routes. Measurements should include transition peaks, spatial texture changes, reconstruction errors, and exact behavior after stopping.

A subsequent controlled observer study should measure depth acquisition, sustained fusion, perceived depth ordering, moving-band visibility, texture discomfort, and navigation performance. Acceptance must depend on human perception as well as numerical checks.

Source color and edge treatment can then be introduced incrementally against an accepted depth reference.

A separate [temporal-encoding research path](STEREO-CONSTRAINTS.md#temporal-encoding-hypotheses) considers complementary modulation and time-shared constraints. These unimplemented hypotheses may depart from per-frame equality and require dedicated temporal controls and human evaluation; the present experiments do not validate them.

## 7. Reproducibility and evidence status

The renderer experiments in sections 4.1–4.5 were produced from research changes based on commit `4e3b5d87b9dbff434e287e1a6d4f36d926f67f11`. Those changes and their evidence are committed in `d8eb75b84c58fb6f62367fb40ea424ec973e8d6e`. The earlier base commit alone does not contain the complete research state; evidence records retain their original working-tree provenance and source fingerprints. Section 4.6 comes from the later observer addition based on `bf59d7d26810a0fb64f68daef1969b409bc4a6eb`, identified by source hashes in its calibration evidence.

Section 4.7 is based on `3e19b347f7ca686f3a88a298f3e187ff566c55f6`; its evidence fingerprints the working edge implementation and unchanged observer. Historical sections retain their original verification scopes; no browser or human study was repeated for the offline edge experiment.

Section 4.8 is based on `0e7cc09fccd86dd4568f7bd2956823a65ebaf4e5`; [seam evidence](../evidence/fractional-seam-verification.json) fingerprints the final working sources and separates primary sweeps, holdout geometry and boundary controls.

Principal evidence files are:

- [Tiny-step bounds](../evidence/tiny-step-bound-verification.json).
- [City motion and assignment](../evidence/game-motion-assignment-verification.json).
- [Synthetic assignment controls](../evidence/foundation-assignment-verification.json).
- [Fractional sampling control](../evidence/fractional-phase-verification.json).
- [Fractional edge synthesis](../evidence/fractional-edge-verification.json).
- [Combined verification and source fingerprints](../evidence/motion-iteration-verification.json).

Historical renderer, observer and edge additions retain their 222-, 230- and 238-test scopes. The seam addition passes 249 tests, lint and build; no candidate passes joint research screening. These are software checks, not perceptual validation. [Current audit](AUDIT.md#verification-scope) distinguishes these runs and earlier browser checks; original evidence dates remain intact.

## 8. Conclusion

The current evidence supports reducing unnecessary texture renewal while investigating continuous spatial representations for abrupt correspondence transitions.

Procedural-seed assignment reduces average frame changes but retains bursts. Continuous sampling reduces rounding discontinuities; seam matching improves some static reconstruction while global texture changes, contrast loss and thin-surface errors remain unresolved.

A comfortable real-time game autostereogram remains an open project objective. The contribution at this stage is a reproducible diagnostic approach and a set of measured constraints that narrow the next experiments.
