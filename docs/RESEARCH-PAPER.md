---
role: research-paper
purpose: Early pre-release manuscript presenting scoped methods, results and limitations.
not-here: Product authority, release acceptance or a chronological experiment log.
status: early-pre-release
version: 0.1-pre.1
date: 2026-10-10
evidence-through: 2026-10-03
durability: Reconcile affected claims with evidence; preserve historical result scope.
update-when: Research methods, results, interpretations, citations or limitations change.
read-with: SOT.md; STEREO-CONSTRAINTS.md; MAINTAINER_GUIDE.md.
---

# Toward Temporally Stable Autostereograms for Interactive Games

## Separating Texture Renewal, Correspondence Changes, and Perceptual Quality

**Early pre-release 0.1-pre.1 — 10 October 2026**

**Experimental record through 3 October 2026**

**Status:** Preliminary engineering study; no controlled human-observer study or peer review.
This is a manuscript version, not a game release or an accepted rendering algorithm.

## Abstract

Single-image autostereograms can communicate three-dimensional shape on an ordinary display, but maintaining comfortable depth during interactive movement remains challenging. In the DepthWalk prototype, informal feedback identified a tradeoff between objectionable moving bands and harsh, rapidly changing texture. We developed diagnostics that separate texture renewal from changes in stereoscopic pixel correspondence, estimate minimum image changes under exact correspondence constraints, and reconstruct disparity independently from rendered images.

Small prescribed movements produced approximately 67–68 grayscale levels of frame-difference RMS, despite optimistic correspondence-constrained bounds of 0.66–5.78. An offline procedural-seed assignment candidate reduced mean frame differences by approximately 62–83% across four short scene routes, but retained large transition bursts and altered spatial texture statistics. A separate flat-plane experiment reduced a rounding-boundary transition from 25.14 to 2.46 RMS using continuous spatial sampling at matched contrast.

These findings identify mechanisms worth addressing, without establishing comfortable gameplay. The next priority is evaluating continuous sampling at occlusion boundaries, followed by controlled perceptual testing.

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

An image-only decoder estimates disparity before the expected scene disparity is supplied for comparison. Reported reconstruction accuracy means the percentage of sampled estimates within two image pixels of the expected disparity. It does not measure human fusion or comfort.

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

## 5. Interpretation and limitations

The findings distinguish three problems: unnecessary texture renewal, abrupt changes imposed by a discrete correspondence representation, and perceptual discomfort that numerical image metrics cannot settle.

Lower frame-difference RMS is useful evidence, but insufficient as an acceptance criterion. A quiet image can lose depth contrast, accumulate blur, retain incorrect matches, or concentrate its remaining changes into conspicuous strips.

Likewise, concentrated changes and coherent texture motion are not automatically artifacts. Control cases showed that legitimate moving boundaries can produce high concentration measurements. Identical image motion can represent intended surface motion or unwanted pattern drift; interpretation requires scene context. [Diagnostic counterexamples](../tests/foundation-motion-quality.test.js).

The present evidence is limited to short routes, restricted seeds and settings, synthetic controls, and selected reconstruction samples. There is no controlled observer study, calibrated viewing setup, sustained gameplay assessment, or demonstrated integration with another game engine.

Source-color fidelity and edge enhancement remain objectives rather than established results. They require evaluation alongside correspondence integrity and competing-match behavior.

## 6. Next experiments

The immediate next experiment should extend continuous spatial sampling to a foreground–background boundary with explicit visibility from both eyes. It must avoid interpolating depth across silhouettes and test newly revealed surfaces.

Candidates that survive this test should be evaluated across additional seeds, depth ranges, motion speeds, and longer routes. Measurements should include transition peaks, spatial texture changes, reconstruction errors, and exact behavior after stopping.

A subsequent controlled observer study should measure depth acquisition, sustained fusion, perceived depth ordering, moving-band visibility, texture discomfort, and navigation performance. Acceptance must depend on human perception as well as numerical checks.

Source color and edge treatment can then be introduced incrementally against an accepted depth reference.

## 7. Reproducibility and evidence status

The experimental record was produced from research changes based on commit `4e3b5d87b9dbff434e287e1a6d4f36d926f67f11`. Those research changes and their evidence are now committed in `d8eb75b84c58fb6f62367fb40ea424ec973e8d6e`. The earlier base commit alone does not contain the complete research state; evidence records retain their original working-tree provenance and source fingerprints.

Principal evidence files are:

- [Tiny-step bounds](../evidence/tiny-step-bound-verification.json).
- [City motion and assignment](../evidence/game-motion-assignment-verification.json).
- [Synthetic assignment controls](../evidence/foundation-assignment-verification.json).
- [Fractional sampling control](../evidence/fractional-phase-verification.json).
- [Combined verification and source fingerprints](../evidence/motion-iteration-verification.json).

The recorded verification reports 222 passing unit tests, lint, and build checks. These establish software checks within their recorded scope, not perceptual validation. Preparing this manuscript did not rerun the experiments or change their evidence dates.

## 8. Conclusion

The current evidence supports reducing unnecessary texture renewal while investigating continuous spatial representations for abrupt correspondence transitions.

Procedural-seed assignment substantially reduced average frame changes but retained unacceptable risks. Continuous sampling reduced one isolated rounding discontinuity under matched conditions, warranting a visibility-aware extension.

A comfortable real-time game autostereogram remains an open project objective. The contribution at this stage is a reproducible diagnostic approach and a set of measured constraints that narrow the next experiments.
