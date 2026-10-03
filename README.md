# Depthwalk

A playable, single-level Magic Eye city exploration game. Built with Three.js, Vite, procedural geometry, and a real single-image autostereogram renderer. No external assets, runtime services, accounts, or network requests beyond serving the app.

The city is also the test scene for engine-independent **DepthWalk CPU and WebGPU filters**. Scalar depth is required; scene color is optional. DepthWalk generates the dot texture, estimated normals, edge emphasis and stereo matching, using either supplied colors or its own geometry palette. See [the integration interface](docs/INTEGRATION.md) for both APIs. The game starts with the depth-only foundation renderer on WebGPU, with CPU fallback.

## Launch

The game now starts with **Soft grayscale**, the depth-first pink-noise preset.
Everyday controls are world, texture and **Use latest defaults**. Advanced controls
are collapsed. The **v0.6 foundation comparison** is at [Depth first](tests/foundations.html).
Compare black-and-white, white-noise and spectral pink-noise carriers on the same
depth frame, then choose **Play this in the city** to use that renderer with
movement and collectibles. City links also accept `?foundation=binary`,
`?foundation=white` or `?foundation=pink`. These research modes prefer WebGPU,
full-image depth and one-pixel texture, without source tint, added ink, reversal
or frame blending. Initial texture preparation runs in a worker; output is capped near
2 MP. Human feedback reports strong band reduction and retained objects/edges,
with one possible brief diamond band, but rejects harsh TV static. Moving-grain
comfort remains the priority; this audit preserves the current carrier.
Legacy modes remain available under Advanced.

The goal remains a stereogram video game and eventually a reusable layer for
other games, with explicit limits and accepted degradation. Earlier design
suggestions are hypotheses; the first attempt is preserved on branch `v0.5`.

Use Node.js 22.13+ (22.x), 20.19+ (20.x), or 24+. From this folder:

```sh
npm install
npm run dev
```

Open the address printed by Vite. Development uses fixed port **5174** and serves
current source with automatic updates; refreshing always loads current code.
If the port is occupied, startup fails instead of silently choosing another port.
Do not open `index.html` directly: ES modules and workers need an HTTP server.

Development and preview bind to this computer's loopback interface by default.
For an intentional LAN demo, explicitly pass `--host 0.0.0.0` to Vite.

For the production version:

```sh
npm run build
npm run preview
```

Production preview uses fixed port **4173**, serves only the last build, and does
not hot-reload source edits. Keep development on 5174 for daily use. The generated
`dist/` directory can be served by any static HTTP host.

## Play

The initial scene is stationary. Relax your eyes as if looking beyond the display; merge the two white dots into a third, centered dot. Wait for the depth to settle, then select **Enter the hidden city**. This is a parallel-view stereogram, not a cross-eye image.

| Control | Action |
| --- | --- |
| W / S | Walk forward / backward |
| A / D | Strafe left / right |
| Shift + movement | Sprint |
| Left / right arrows | Turn without capturing the mouse; Q also turns left |
| R | Cycle Magic Eye / Colored 3D / Depth map, retaining mouse capture |
| E | Cycle three depth-first textures; all styles only with Advanced open; retain mouse capture |
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

- **T / Center guides:** three translucent white crosses with thin black outlines start visible across the screen center in the UI layer. T toggles only crosses; upper dots stay independent. Both hide with the HUD. Y remains an alias. These sight references follow pattern spacing; fusion is not guaranteed.

- **Starting preset:** depth-first pink noise, 96 CSS-pixel spacing and 33% strength, full image, foreground near, no source tint, ink or frame history. Pink follows [static-viewing research](https://arxiv.org/abs/1506.05036); these spacing/strength values are engineering choices, not paper-derived optima. Gameplay fusion remains unconfirmed.
- **Texture:** Soft grayscale (pink), Black & white (strongest contrast), or Fine grayscale (white noise). All use the same depth correspondence algorithm. Colored 3D still shows source colors.
- **Use latest defaults:** restores the current preset without moving the camera or resetting collectibles. Saved adjustments persist while starting defaults match; changing defaults automatically retires older tuning on reload. Explicit foundation URLs still choose their named texture.
- **Advanced:** holds sliders, legacy styles, renderer selection and lab links. Quiet/paired/source-color styles remain comparisons with unresolved repeated outlines and fusion failures. They are not the starting preset.
- **Reduce moving bands:** on by default for depth-first textures. Refreshes matched grain while moving and freezes when stopped; trades sweeping patterns for fine moving static. Disable under Advanced to compare. [Mechanism and limits](docs/STEREO-CONSTRAINTS.md#motion-carrier).
- **Compare moving grain:** A retains current contrast; B halves it. Walk and turn with each, comparing static, depth and bands. Switching keeps your position. B is an experiment; reset restores A. Releasing movement keys now settles promptly to stop unnecessary grain changes.
- **Dot separation:** 48–180 CSS pixels. Reduce it if the guides will not merge; wider values reduce repeats. **Depth amount:** 0–50%; lower it if depth splits into layers. Zero gives a flat pattern. Neither slider guarantees clearer depth.
- **Legacy-only controls:** stereo windows, dot size, ink and reversal cannot alter foundation output. Quiet support changes matching texture contrast. Quiet/paired history carries seed identity, never old image frames. [History evidence](docs/OBSERVER.md#quiet-motion-comparison).
- **Quality:** Auto adapts resolution; Native holds device resolution subject to the 2 MP foundation / 8.3 MP legacy caps. Balanced and Performance use 75% and 50% linear resolution. Lower resolution enlarges pixels sharply; spacing remains in display pixels.
- **Renderer:** Auto prefers WebGPU for all textures and falls back to CPU on failure. The badge reports the actual backend; completion latency is not GPU execution time.
- **At rest:** unchanged depth-first frames are held; the badge says “Still · grain held.” Movement, settings and analysis resume rendering. A window too narrow for the pattern shows a recoverable prompt.
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

The [Observer lab](docs/OBSERVER.md) at **tests/observer-lab.html** supports longer research cycles: repeatable walk/turn/stop recordings, CPU or WebGPU profile sweeps, aligned eye-color views, a rotatable recovered relief, per-pixel disparity cost curves, and motion/error timelines. A local source-color intervention measures how far colored repeats propagate. Choose quick or native 1080p inputs, compare eight profiles, inspect weak regions and export the report. The lab and GPU fixtures are included in production builds. For unattended synthetic runs, use `npm run research -- --full --output evidence/my-observer-run.json`.

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

For repeatable browser integration tests, run the dev server and open **`/?verify` on the running development server**. This dev-only page runs checks against the actual WebGL renderer, workers, input event handlers, HUD, collision, collection, and completion. It reports results on screen. Movement cases use synthetic keyboard events and isolated player fixtures; the separate route test verifies continuous paths through the level. The test runner is excluded from production builds.

Current findings and the prioritized work list live in [the project audit](docs/AUDIT.md).
Use `/?verify=runtime&quality=1` for idle/wake-up, diagnostic capture and
GPU-loss/CPU-timeout recovery. That dev-only route deliberately destroys its own
GPU device and terminates a worker; use a separate test tab.
The GPU fixture page is **tests/gpu-checks.html**.

Earlier measurements remain scoped to their original revisions and environments:
[sharpness](evidence/stereo-quality-after.json),
[contours](evidence/contour-browser-checks.json),
[shading](evidence/shaded-depth-quality.json),
[GPU](evidence/gpu-verification.json),
[natural palette](evidence/natural-palette-verification.json),
[scene reconstruction](evidence/scene-reconstruction-verification.json),
[Quiet](evidence/quiet-stereo-verification.json),
[source-color comparison](evidence/surface-research-comparison.json),
[paired color](evidence/paired-color-verification.json), and
[foundation](evidence/foundation-verification.json).
They are historical records, not acceptance of current gameplay. The current
motion diagnosis and rejected approaches have one detailed home in
[stereo constraints](docs/STEREO-CONSTRAINTS.md#motion-carrier).

### Remaining limits

The paired-color experiment suppresses propagated hues at the cost of original lighting and luminance texture. Its broad RGB error is worse than Quiet stereo despite keeping hues spatially local. The unchanged image-only decoder recovered 96.3–97.0% of sampled disparities within two pixels in the two city fixtures; this is signal evidence, not confirmation that viewers fuse the projected colors. Ring/diamond regressions separately test foreground hue alignment and zero color spill beyond projected eye silhouettes and bounded linear-luminance mismatch after 8-bit display quantization. The GPU fixture page labels both previews. The first unprojected Local color attempt was rejected by the user: depth was fragile and hues appeared doubled over it. The user reported colored depth from the paired revision, but fragile fusion, transparent-looking color artifacts and severe motion static. These legacy styles remain experiments; the default depth-first path and its unresolved motion comfort take priority.

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
- `src/worker-client.js` / `src/stereo-worker-client.js` — bounded requests and validated stripe ownership.
- `src/frame-demand.js` — host admission tracking for unchanged foundation frames.
- `src/city.js` — procedural demo scene and normal-view materials.
- `src/surfaces.js` — surface IDs and shared world-space procedural texture shader.
- `src/game.js` — collision, movement, beacon locations and collection.
- `tests/` — numerical/unit tests and dev-only browser verification.
- `docs/INTEGRATION.md` — engine input contract, examples and current adapter limits.
