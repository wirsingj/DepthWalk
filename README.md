# Depthwalk

A playable, single-level Magic Eye city exploration game. Built with Three.js, Vite, procedural geometry, and a real single-image autostereogram renderer. No external assets, runtime services, accounts, or network requests beyond serving the app.

The city is also the test scene for engine-independent **DepthWalk CPU and WebGPU filters**. Scalar depth is required; scene color is optional. DepthWalk generates the dot texture, estimated normals, edge emphasis and stereo matching, using either supplied colors or its own geometry palette. See [the integration interface](docs/INTEGRATION.md) for both APIs. The game prefers WebGPU and retains CPU workers as a compatibility fallback.

## Launch

Use Node.js 22.13+ (22.x), 20.19+ (20.x), or 24+. From this folder:

```sh
npm install
npm run dev
```

Open **http://localhost:5173** in a desktop browser. Chrome or Edge with hardware acceleration is recommended for mouse capture. The Vite console shows the actual address if port 5173 is occupied. Do not open `index.html` directly: ES modules and workers need an HTTP server.

Development and preview bind to this computer's loopback interface by default.
For an intentional LAN demo, explicitly pass `--host 0.0.0.0` to Vite.

For the production version:

```sh
npm run build
npm run preview
```

Open the address printed by Vite (normally http://localhost:4173). The generated `dist/` directory can be served by any static HTTP host.

## Play

The initial scene is stationary. Relax your eyes as if looking beyond the display; merge the two white dots into a third, centered dot. Wait for the depth to settle, then select **Enter the hidden city**. This is a parallel-view stereogram, not a cross-eye image.

| Control | Action |
| --- | --- |
| W / S | Walk forward / backward |
| A / D | Strafe left / right |
| Shift + movement | Sprint |
| Left / right arrows | Turn without capturing the mouse; Q also turns left |
| R | Cycle Magic Eye / Colored 3D / Depth map, retaining mouse capture |
| E | Cycle pattern style, retaining mouse capture |
| F3 / Analyze stereo | Pause and reconstruct depth from the finished stereo pixels |
| Mouse look button, or click the scene | Explicitly request mouse capture after entering |
| Mouse | Look horizontally and gently up/down while captured |
| Escape | Release capture and clear held movement |
| H | Hide / restore the HUD |
| Fullscreen | Enter / exit fullscreen with a user click |
| Guide | Pause and reopen viewing instructions |

Walk into five distinct beacons: a prism in the plaza, a halo on the east promenade, a spire in the north passage, a portal in the west alley, and a crown in the south gardens. Buildings are solid; streets, sidewalks, and alleys connect the whole district. The completion message lets you keep exploring. Reload to start a new run.

**Magic Eye**, **Colored 3D**, and **Depth map** show the same scene and preserve camera position and orientation. The depth map uses white for near surfaces and black for distant surfaces/sky.

**Demo world** switches between **Original city** and **Block study · simple shapes**
without resetting your position, collected signals or filter settings. Block study
uses flat colors, blocky trees and fewer small details on the same layout. It is
an art-direction experiment, not an accepted banding fix. Compare at the same render
quality first; select **Performance · 50%** separately to try chunkier pixels.
Depth precision is unchanged. `?world=retro` opens Block study; `&quality=0.5` selects
half resolution. Recorded comparisons also provide the demo selector.

## Viewing and performance

- **Y / Center guides:** toggle two central crosses in Magic Eye view. Look through them until three appear. They follow pattern spacing, replace the upper dots while enabled, and remain available with the HUD hidden. Alignment helps acquire depth but does not guarantee scene fusion.

- **Stereo area:** defaults to the full-width city. Optional narrow center windows remain experimental; they bound matching chains but were rejected as the default presentation. Existing window preferences migrate once to full image, preserving other viewing settings. Y provides central alignment without narrowing the scene. Repeated-object artifacts remain unresolved.

- **Pattern style:** Quiet stereo · continuous depth retains the previously fused source-color baseline at 35% support. Viewing preferences persist. Repeated outlines remain unresolved. The neutral replacement was rejected and reverted: making color-spread metrics zero by discarding scene cues was not a successful fix. Paired modes remain experimental.
- **Reduce Quiet shimmer · experimental:** optional, off by default. Keeps texture seeds steadier while recomputing current source colors and exact stereo pairs. Toggle it during the same walk to compare; it does not remove repeated outlines. [Measured tradeoffs](docs/OBSERVER.md#quiet-motion-comparison).

- **Soft paired - experimental:** keeps the continuous carrier and projects 25% source lighting into the visible eye pairs. It reduces noise and restores some surface shading without copying color down full-width chains. Equal class luminance is relaxed; conflicting colors remain a research limitation. Quiet stays the default, and viewing settings now survive reloads.
- **Paired color · experimental:** a separate research mode for repeated colored outlines. It retains the complete depth graph in **linear-light luminance** and projects source hues to both visible eye endpoints, with nearer surfaces winning overlaps. Colors never traverse chains to the screen edges. RGB equality is deliberately relaxed where projected surfaces compete. Shading is flattened and propagated contour accents are disabled. Stereo support adjusts the continuous carrier. **Stable texture during movement** is enabled by default: it smooths the seed texture and reuses previous matching classes one-to-one, preserving current depth without final-image blur. Disable it for a comparison. Quiet stereo remains the default.
- **Dot size:** Fine / 1 CSS pixel by default; Medium / 2 and Large / 3 are also available. All sizes remain stable across display scaling and worker boundaries. Use Native quality for the finest detail; reduced quality enlarges pixels sharply rather than smoothing them.
- **Edge definition:** Bold is the default. Crisp uses a thinner band; Off removes emphasis. **Dark ink · outlined** darkens matched contours, including recessed rims, while retaining Quiet's matching texture contrast. It can make repeated outlines more prominent. No screen-space overlay or depth displacement is applied.
- **Pattern spacing:** 48–180 CSS pixels; default 120. Wider spacing reduces the number of repeats across the full image. Reduce it if merging the dots is difficult. Spacing and alignment dots scale together.
- **Reset viewing settings:** restores the default controls and saved preferences without changing camera position or collected beacons.
- **Depth strength:** 0–50%; default 50%, matching the same preferred setup. Lower values make gentler depth. At zero the pattern repeats uniformly, useful for learning to fuse it.
- **Reverse depth direction:** normally off for looking through the screen; enabling it swaps foreground/background. The former reversed default is retired, and older saved settings reset only direction. New choices persist. F3 and recorded-walk links follow the setting; explicitly reversed historical lab links remain reversed. Human confirmation is pending.
- **Native:** generates at the actual device-pixel resolution, up to 8.3 megapixels (4K). It does not stretch a low-resolution image. DPR/display-scale changes and window resizes recreate the render buffers.
- **Auto · target smooth motion:** the default quality adapts resolution after sustained slow frames and restores it when headroom permits. Choose Native to hold resolution fixed. All modes preserve display-pixel spacing.
- **Balanced / Performance:** explicitly select 75% / 50% of native linear resolution. These modes trade sharpness for speed. Pattern separation is converted from CSS pixels to render pixels, preserving its apparent spacing when render quality changes.
- **Renderer:** Auto prefers WebGPU. Depth rendering, stereo constraints, palette generation and presentation remain on the GPU with no per-frame CPU readback. CPU compatibility can be selected explicitly and activates automatically if GPU initialization fails or the device is lost. The HUD reports the active renderer. WebGPU requires a supported browser/device and a secure context (localhost or HTTPS).
- GPU rendering follows display refresh, with at most two real frames in flight. Visible animation frames prompt outstanding completion callbacks with an empty submission, addressing Firefox's [100 ms idle-poll scheduling issue](https://bugzilla.mozilla.org/show_bug.cgi?id=1870699). The badge exposes backend, resolution and completion latency; completion latency includes browser scheduling and is **not GPU execution time**. No Firefox preference changes are required by this workaround. CPU presentation targets up to 40 fps. QA readbacks reduce speed during checks and stop afterward; benchmark the normal page.
- Use the **−** control to collapse viewing settings or **H** to hide the HUD. Focusing a tuning input stops held movement. There is no head bob, shaking, automatic turning, or decorative motion.

## How the stereogram works

1. A separate Three.js demo adapter renders scalar depth: 16-bit proximity packed into RG bytes, with B=0 and A=255. Optional scene color is a separate image, never hidden inside depth metadata. The GPU demo copies its normal WebGL render into a WebGPU texture; CPU fallback reads a second RGBA buffer. The public CPU filter also accepts linear view-Z, normalized exponential proximity, and conventional/reversed device depth. All formats map to normalized near-depth with `z = exp(-distance / depthRange)`; sky is zero.
2. DepthWalk reconstructs local surface orientation from depth neighbors, avoiding jumps across occlusion boundaries. View-relative orientation selects its color family; distance drives brightness separately. It derives silhouettes and sharp face creases from the same data. Smooth planar depth gradients are rejected as contours. The internal RGBA working buffer holds depth plus these generated color/normal codes; it is not host metadata.
3. Each scene sample produces a centered left/right pixel constraint. For far-plane spacing `P` and depth strength `mu`, separation is `round(2 * P * (1 - mu*z) / (2 - mu*z))`. Closer surfaces have smaller separation, appropriate for parallel viewing. Canonical 16-bit depth and strength rounded to 0.001 make half-pixel rounding and visibility decisions consistent between CPU and GPU.
4. Hidden-surface tests trace both eye rays. A nearer intervening sample suppresses that correspondence, reducing false silhouettes at depth boundaries. Ordered equivalence links resolve intersecting constraints.
5. Deterministic seeds cover the **full image**, with no wrapping at pattern spacing. Pixels freed by occlusion get independent seeds. Quiet stereo fits source RGB within each correspondence class; this can propagate object outlines. Most classes receive very faint variation; a deterministic subset receives stronger marks controlled by Stereo support. Every linked pixel receives identical RGB, with no per-frame randomness or unmatched overlay. The generated and dense-reference palettes retain their eight ordered tones and compressed brightness. A class can span multiple objects, so some horizontal color mixing/repetition remains intrinsic.
6. Visible contour samples increase contrast for their corresponding class. Quiet retains contour boosts from the previously fused baseline. The reference palettes use a stronger eight-tone ramp. Contours never alter depth or introduce unmatched pixels.
7. WebGPU uses parallel geometry reconstruction, atomic union of visible pairs, class gathering and direct GPU presentation. Integer sums keep colors deterministic despite parallel scheduling. The static-city adapter uploads geometry once and updates beacon visibility. CPU fallback uses up to four workers with halo rows, global seeds and complete-frame assembly. Frame versions reject outdated results after settings changes or resize. The static demo reuses CPU depth/color captures while pose, settings and beacon visibility are unchanged, preventing tiny readback quantization changes at rest. An animated host must invalidate captures when its scene changes.

The scene-to-depth-to-pattern approach is discussed in NVIDIA’s [Real-Time Stereograms, GPU Gems chapter 41](https://developer.nvidia.com/gpugems/gpugems/part-vi-beyond-triangles/chapter-41-real-time-stereograms). This implementation uses centered scanline constraints with binocular visibility checks rather than the chapter’s simpler GPU strip-copy method, to improve overlapping edges. The visibility/link construction follows the Thimbleby–Inglis–Witten SIRDS approach.

Paired color isolates the repeating color problem from disparity encoding. A depth-only, deterministic scalar carrier supplies each class's luminance. Source chromaticity projects to each visible eye pair; nearest depth selects each output pixel's owner, with deterministic ties. Hue scales into gamut without changing carrier luminance, then converts back to sRGB. Unowned pixels remain neutral. Conflicting color partners are neutralized instead of showing an unmatched tint. Hue projection is bounded to eye endpoints, and conflict rejection examines one additional pair; there is no scanline-wide color propagation. This limits long color-chain echoes; it does not remove inherent stereo harmonics or establish human fusion. Research has demonstrated stereopsis with differing corresponding colors when adequate luminance contrast remains ([Caltech dissertation](https://thesis.caltech.edu/9699/)); applying that principle to this autostereogram is an experiment, not a guarantee.

## Verification

The [Observer lab](docs/OBSERVER.md) at **http://localhost:5173/tests/observer-lab.html** supports longer research cycles: repeatable walk/turn/stop recordings, CPU or WebGPU profile sweeps, aligned eye-color views, a rotatable recovered relief, per-pixel disparity cost curves, and motion/error timelines. A local source-color intervention measures how far colored repeats propagate. Choose quick or native 1080p inputs, compare eight profiles, inspect weak regions and export the report. The lab and GPU fixtures are included in production builds. For unattended synthetic runs, use `npm run research -- --full --output evidence/my-observer-run.json`.

The observer's analytical controls detect blank images, incorrect depth, mismatched eye colors, regenerated-but-valid stereo noise, stale depth during motion, and remote color copies. The original decoder remains unchanged. Earlier measurements explain why depth accuracy alone was insufficient: in a 640×360 plaza sweep, Paired color recovered 96.0% of disparities within two pixels while 17.9% of matching eye patches disagreed in color. Quiet stereo had only 0.7% color conflict but propagated 53.4% of a local color intervention's affected pixels beyond the generous 1.5-period neighborhood. Those percentages have different denominators; they are diagnostic signals, not measured human discomfort. See [historical observer verification](evidence/observer-verification.json), [the app/tooling audit](docs/AUDIT.md), and [method, thresholds and iteration rules](docs/OBSERVER.md).

Press **F3** or **Analyze stereo** for independent reconstruction. It captures one native frame and pauses rendering while a worker searches its actual dot correlations. The decoder never receives scene depth or source color; a separate comparison step introduces ground truth afterward. Panels show the original render, reconstructed depth/relief, uncertainty, competing depths, alternate-layer candidates and disparity error. Source RGB error and broad-color error measure resemblance separately; neither is a fusion score. Save JSON records captured settings and measurements; **Save captured PNG** exports native pixels without HUD or resizing. Missing reconstruction evidence reads “unmeasured”. Alternate candidates include inherent harmonic repetitions, so a red alternative map alone does not prove visible ghosts. Close with F3 to restore the previous view and pause state without moving the camera.

```sh
npm run check
npm run build
```

The Node test suite covers predicted stereo disparity, exact pixel correspondences, foreground/background separation, edge occlusion, zero-strength repetition, temporal stability, GPU row inversion, resolution scaling, native 1080p generation, seam-free worker batching, movement axes, smooth turns, normalized diagonal speed, collisions, district boundaries, and collision-free routes to all five beacons.

Material regressions additionally check all ten distinct palette families, exact RGB matches across mixed materials, stationary stability, bit-identical worker stripes, classic-style compatibility, and planter collisions. The colored scene uses world-anchored procedural shaders for brick courses, panel joints, metal ribs, window panes, paving grout, asphalt grain, bark and foliage. Ten planted beds have collision volumes; all beacon routes remain open.

Sharpness/echo regressions check contrast retention when mixing materials, absence of competing correlation peaks within the intended depth range, independence of unconstrained seeds at repeated-period offsets, neutral-mode correspondence, and CSS-scaled dot sizes. These tests address weaknesses that a valid-pair matching percentage alone misses.

Contour regressions additionally check foreground-only silhouettes, face corners at continuous depth, rejection of hidden edges, unchanged flat interiors, CSS-scaled widths, stable frames and seam-free worker halos. At Fine / 120 px / 50%, contour contrast increases by at least 25% in the controlled fixture while its strongest correlation remains at the surface's actual stereo depth in all three pattern styles.

For repeatable browser integration tests, run the dev server and open **http://localhost:5173/?verify**. This dev-only page runs checks against the actual WebGL renderer, workers, input event handlers, HUD, collision, collection, and completion. It reports results on screen. Movement cases use synthetic keyboard events and isolated player fixtures; the separate route test verifies continuous paths through the level. The test runner is excluded from production builds.

Earlier sharpness verification at 1920×1080 (84 px spacing, 32% depth):

- 68 GPU surface-depth samples agreed with independent raycast geometry; maximum normalized error was **0.000007**. Nine sky samples were correctly zero.
- **99.99% of 12,425 sampled interior stereo pairs** had exactly matching pixel colors in City materials mode at the predicted depth-dependent separation. Boundaries are excluded from this interior metric; a separate regression checks rejected occluded constraints.
- The GPU returned all ten surface IDs and 205 procedural detail levels. Sampled material IDs matched the raycast geometry. Switching between material and classic patterns changed the image without moving the camera, and switching back reproduced the original frame exactly.
- Live City colors RMS contrast measured **0.513**. In a controlled mixed-material fixture, luminance standard deviation improved from **16.22 to 68.29** on a 0–255 scale. The revised mixed-material contrast matches the uniform-material signal instead of losing about 65% of it.
- An annulus fixture tests 6,285 pairs of unconstrained pixels whose positions differ by multiples of pattern spacing. The old modulo seed lookup forced every such pair to match; the new independent seed field is checked against the chance-match rate instead. See `evidence/stereo-quality-before.json` and `evidence/stereo-quality-after.json` for numerical diagnostics. These measurements are not a claim that all human false fusion is eliminated.
- Stationary rendered frames were identical. All view switches preserved the player pose.
- Movement, Q/E turning, collisions, HUD toggling, guide pause, five walk-in collections, and the completion message passed browser integration tests.
- Actual browser UI interactions verified fullscreen entry/exit, resizing through 1280×720, 1920×1080 and 2560×1440, and quality/spacing/depth controls.

The earlier contour update (before removing host normals) passed 37 numerical/unit tests and 18 browser integration checks at 1920×1080 with Fine dots, 120 px spacing, 50% depth and Bold edges. Its results are retained in `evidence/contour-browser-checks.json`.

The depth-only API tests additionally cover depth linearization, reversed Z, orthographic and infinite-far projection, row origins, ignored host color/normal bytes, geometry reconstruction without labels, smooth-floor rejection, deterministic rendering, input validation and full-frame/worker equivalence at multiple quality settings. Browser verification checks that the live demo supplies only scalar depth and that a standalone call to the public filter reproduces every worker-rendered pixel.

The earlier shaded CPU update passed 52 unit tests and 20 browser checks; its results remain in `evidence/shaded-depth-browser-checks.json`. Current GPU verification additionally compares every live constraint root with the independent CPU solver, checks exact pixel matches within classes, and tests renderer switching. The `tests/gpu-checks.html` development route exercises flat depths, overlaps, curved depth maps, all pattern styles, display scaling and zero depth strength directly on WebGPU. It also checks stationary stability and GPU validation errors.

The GPU/banding update passed **54 unit tests, 22 GPU gameplay checks and five GPU fixture checks**. At native 1080p, all 2,073,600 GPU constraint roots agreed with the independent CPU solver, 99.46% of RGB values were identical, and mean channel difference was 0.002/255. Every pixel in each GPU class matched its root exactly. A controlled near-slab fixture limits tint-only vertical brightness variation to 18.1/255, below its 20-level regression limit. See `evidence/gpu-verification.json` for revision, environment, settings and both backend reports. Actual resizing also exercised native 3840×2160 rendering at an observed 84 fps.

The earlier natural-palette update passed **55 unit tests, 22 gameplay checks on each backend, five GPU fixtures and the production build**. It adds a regression proving that changing one class's hue cannot tint unrelated classes on the same row, and checks consistent green on both sides of inclined shapes. All 2,073,600 live GPU constraint roots still matched the CPU reference; 99.94% of RGB values matched exactly, with mean channel difference 0.001/255. The tint-only near-slab brightness span was 18.54/255 (limit 20). See `evidence/natural-palette-verification.json` for the scoped results. These checks do not establish semantic material recognition or human fusion comfort.

The earlier scene-color/reconstruction update passed **68 unit tests, 24 gameplay checks per backend, seven GPU fixtures and the production build**. GPU gameplay ran at 1920×1522; CPU gameplay at 1920×1080. All 2,922,240 live GPU roots matched the CPU solver, with 100.00% exact RGB; the optional color image matched every sampled channel of the actual normal render. Independent reconstruction of the 1080p initial scene placed 97.7% of sampled disparities within two pixels of intended depth (98.6% in smooth interiors, mean error 0.37 pixels). The normal GPU page sampled 173 completed frames/s at native 1080p on the test machine; this is an observation, not a performance guarantee. See [the scoped report](evidence/scene-reconstruction-verification.json). The user confirmed external Firefox improved from 10 fps to 58–60 fps after reloading with the scheduling workaround; this is human-reported validation, alongside the delayed-completion simulation.

Shading regressions cover distinct distance brightness, geometry-derived color families, dark-blue sky, ordered opaque tone ramps, all final pixel links across overlapping shapes, independent exposed seeds, stationary stability and contrast-preserving contours at near/far depths. Controlled planes at distances 60, 30, 14 and 4 had mean luminance 66.6, 82.4, 105.1 and 130.6 respectively. Their intended stereo correlation was exactly 1, with all competing tested peaks below 0.034. See `evidence/shaded-depth-quality.json`. These are signal measurements, not proof of human viewing comfort.

The earlier Quiet stereo update passed **74 unit tests, 26 gameplay checks per backend, eight GPU fixtures and the production build**. Both gameplay runs used 1280×720. Quiet mode preserves exact class colors, matches the CPU source-color fit, and restores identical pixels after changing support. The added GPU fixture checks six settings combinations, stationary equality and overlaps; worst mean channel difference from the CPU was 0.00005/255. The live F3 capture recovered 95.6% of sampled disparities within two pixels, with 53.3% classified as reliable. See [its scoped report](evidence/quiet-stereo-verification.json), including source fingerprint, test scope and a normal-page GPU performance sample.

Open **http://localhost:5173/tests/surface-lab.html** for the repeatable source-color experiment. It compares the plaza and a close beacon using the dense reference, Quiet stereo, Paired color and the rejected sparse variant. At 65% support, Quiet stereo reduced raw RGB error by 42–46% and broad-color error by 38–42% relative to the dense reference; 94.8–95.3% of decoded samples remained within two pixels of intended disparity. Reliable-match coverage fell from 87–88% to 36–51%, exposing weaker evidence on quieter surfaces. Broad-color error uses a 25×9-pixel box average at the lab's 1000×562 resolution; it measures resemblance, not perceived banding. [Full comparison and human feedback](evidence/surface-research-comparison.json). The user confirmed Quiet stereo fuses and rejected sparse Surface stereo despite its better color-error scores. The decoder and confidence thresholds are unchanged.

The paired-color revision passes **81 unit tests, 27 gameplay checks per backend, ten GPU fixtures and the production build**. GPU and CPU gameplay used 1280×720. The ring fixture aligned all 16,576 visible foreground color pairs, with zero recoloring beyond projected eye silhouettes; maximum paired linear-light luminance difference was 0.00413 on a 0–1 scale after 8-bit quantization. Three GPU settings combinations matched the CPU with mean RGB error below 0.00001/255. Moving-depth fixtures showed 30.4% (CPU) and 33.1% (GPU) lower frame-difference RMS with texture stability enabled; the CPU fixture retained 99.96% of overall carrier contrast. Every frame retained current depth correspondences, and stopped frames were identical. Movement easing now settles to exactly zero below imperceptible velocity thresholds, preventing lingering depth changes after key release. These fixture metrics do not establish human motion comfort. See [the scoped report](evidence/paired-color-verification.json) and [city reconstruction comparison](evidence/paired-color-city-comparison.json). Human comfort remains a separate acceptance test.

### Remaining limits

The paired-color experiment suppresses propagated hues at the cost of original lighting and luminance texture. Its broad RGB error is worse than Quiet stereo despite keeping hues spatially local. The unchanged image-only decoder recovered 96.3–97.0% of sampled disparities within two pixels in the two city fixtures; this is signal evidence, not confirmation that viewers fuse the projected colors. Ring/diamond regressions separately test foreground hue alignment and zero color spill beyond projected eye silhouettes and bounded linear-luminance mismatch after 8-bit display quantization. The GPU fixture page labels both previews. The first unprojected Local color attempt was rejected by the user: depth was fragile and hues appeared doubled over it. The user reported colored depth from the paired revision, but fragile fusion, transparent-looking color artifacts and severe motion static. The latest revision adds carrier smoothing/reuse and rejects incompatible color partners; its perceptual outcome still needs evaluation.

Quiet stereo retains complete matching but deliberately reduces texture. Its decoder confidence is lower on quiet surfaces, and horizontal color repetition is reduced rather than eliminated. The sparse **Surface stereo** experiment looked closer to the source in image metrics but failed the user's fusion test: doubled artwork and rectangles of noise remained. It is excluded from the game selector and retained only for research. Earlier Quiet fusion feedback was limited to that viewer/setup; see [current human assessment](docs/SOT.md#evidence-and-limits) before treating it as acceptance.

The user has confirmed mouse look works in their browser. The automated embedded test host declined Pointer Lock, so automated results cover arrow controls, Escape movement clearing and R/E's absence of release calls rather than a captured-mouse session. Capture targets the persistent document body so view changes do not hide the captured element. Firefox performance improvement is user-confirmed; broader hardware/browser performance remains unmeasured.

Human stereo fusion cannot be established by an automated pixel check; viewing comfort depends on the person and display. Correct correspondences and occlusion tests do not eliminate every inherent SIRDS ambiguity. Thin geometry, steep edges and whole-pixel disparity changes can still produce echoes or pattern movement while walking. The texture stays stable while stationary. CPU fallback is considerably slower than the GPU path; quality remains adjustable. Progress is held in memory for one session.

Depth-only colors describe geometry and view-relative orientation, not semantic categories such as tree versus brick. Small features missing from depth cannot be reconstructed. GPU input currently accepts RG16 proximity and symmetric perspective cameras; the CPU accepts more encodings and orthographic projection. GPU normal estimation may cause tiny color differences from the CPU, while stereo classes still match. Native engine plugins, animated-scene adapters, jittered/off-center projections and automatic hooking into other games remain future work.

A single-image stereogram cannot reproduce the normal view's arbitrary surface coloring exactly: pixels are shared between multiple eye correspondences. See the [original SIRDS paper](https://harold.thimbleby.net/sirds/ieee3d.pdf) for color constraints and transitive false fusion. Judge the effect in the live canvas at Native quality, ideally fullscreen. Browser preview screenshots returned by the testing tool are JPEG-compressed and do not preserve exact stereo pixels; they are visual records, not fusion test images.

## Files

- `src/main.js` — rendering, worker scheduling, controls, UI, collection.
- `src/depthwalk.js` — reusable public filter, engine-independent settings and output.
- `src/gpu/depthwalk-gpu.js` / `stereogram.wgsl` — GPU filter, exact visibility/union solver and presentation.
- `src/gpu/city-renderer.js` / `src/adapters/three-webgpu-depth.js` — GPU demo scheduling and static geometry/depth adapter.
- `src/depth-frame.js` — depth formats, reconstruction and generated geometry colors.
- `src/adapters/three-depth.js` — scalar-depth capture for the Three.js demo.
- `src/stereogram.js` — pure stereogram algorithm and deterministic pattern.
- `src/surface-stereo.js` — source-color fitting, Quiet stereo and the rejected sparse research variant.
- `src/chroma-stereo.js` — experimental eye-projected chromaticity with a complete stereo luminance carrier.
- `src/debug/` — independent reconstruction, source-image comparison and the F3 inspector.
- `src/pattern.js` — independent full-image seeds, geometry palettes and distance-shaded contrast ramps.
- `src/contours.js` — foreground silhouettes and sharp face corners from depth/normals.
- `src/stereo.worker.js` — scanline encoding worker.
- `src/city.js` — procedural demo scene and normal-view materials.
- `src/surfaces.js` — surface IDs and shared world-space procedural texture shader.
- `src/game.js` — collision, movement, beacon locations and collection.
- `tests/` — numerical/unit tests and dev-only browser verification.
- `docs/INTEGRATION.md` — engine input contract, examples and current adapter limits.
