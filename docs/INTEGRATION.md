# DepthWalk filter interface

DepthWalk is a depth-to-autostereogram filter with portable CPU and WebGPU implementations. The city is its interactive test scene. Neither filter imports Three.js, scene objects or materials. The CPU core also has no DOM/browser dependencies; the GPU core uses WebGPU. Both generate their own colors, texture, estimated surface normals, contours and stereo constraints.

The engine supplies scalar depth, dimensions and depth convention. For accurate geometry styling, supply camera projection metadata too. Host colors are optional; material IDs, normal buffers and object labels are not required. Depth-only rendering remains the API default.

## Minimal use

Depth samples must use numeric typed arrays, not BigInt. The exported `decodeDepth`
helper requires a full-size Float32Array or Float64Array when supplying output;
invalid output is rejected before any samples are written.

```js
import {DepthWalkFilter} from './src/depthwalk.js';

const filter = new DepthWalkFilter(); // Keep one instance; it reuses buffers.

function renderDepth(depth, width, height) {
  const result = filter.render({
    depth,                      // Float32Array(width * height)
    width, height,
    format: 'view-z',            // Positive axial camera distance, in engine units
    origin: 'top-left',
    verticalFov: 62,             // Degrees; use the host camera's actual FOV
  }, {
    pixelRatio: 1,               // Actual output pixels per CSS/display pixel
    spacing: 120,               // CSS/display pixels
    depthStrength: 0.5,
    invertDepth: false,          // Display direction, independent of device reverse-Z.
    dotSize: 1,                  // CSS/display pixels
    edges: 2,                   // 0 off, 1 crisp, 2 bold, 3 dark ink
    depthRange: 22,              // Engine units; fixed across frames
    pattern: 'geometry',        // 'geometry', 'quiet', 'scene', 'classic', or 'mono'
  });

  // Optional browser presentation; no drawing or resizing occurs in the core.
  context.putImageData(new ImageData(result.rgba, width, height), 0, 0);
}
```

Output has the input dimensions and top-left origin. `pixels` is a Uint32Array and `rgba` is a Uint8ClampedArray view of the same buffer (little-endian RGBA). The default output is reused by the next render, so copy it if retaining a frame. An optional third argument to `render` supplies a reusable output Uint32Array. The input is never modified.

The example core call is synchronous. Run it in Web Workers as the city's compatibility renderer does, or use the GPU interface below. The host owns camera movement, depth acquisition, scheduling and presentation.

### Foundation CPU research API

`FoundationFilter` from `src/foundation-stereo.js` is the v0.6 depth-only path,
also used by the city's CPU fallback. `DepthWalkFilter` retains its legacy patterns;
`DepthWalkGPU` additionally accepts all three `foundation-*` styles.

```js
import {FoundationFilter} from './src/foundation-stereo.js';
const reference = new FoundationFilter();
const result = reference.render({
  width, height, depth, format: 'proximity', origin: 'top-left',
}, {carrier: 'pink', spacing: 96, strength: .333, seed: 173});
```

Inputs are canonical near=1/far=0 `proximity` floats or `packed-proximity-rg16`
RGBA bytes. Origins, full-height stripe offsets and crop rows follow the existing
frame contract. Other encodings require host conversion; scene RGB is ignored.
Width/full-height must each be at most 2048 and their product at most 2,097,152.
`spacing` is an integer in output pixels, at least 8 and smaller than width;
`strength` is 0–0.5, rounded to thousandths for matching. `seed` is uint32.
Carriers are `binary`, `white` and `pink`; no contour, reversal, color, history,
dot-size or window options exist. Results contain top-left `pixels`, `width` and
`height`. Output is reused; optionally supply a matching Uint32Array as argument
three. Standalone calls synchronously cache a full-frame carrier unless prepared
samples are installed. [Construction and evidence](STEREO-CONSTRAINTS.md#v06-foundation-implementation).

`installPreparedCarrier({width, height, carrier, seed, yOffset, rows, tones})` copies
validated Uint8Array samples. CPU slices retain full-frame dimensions and global
row coordinates; they must cover the requested output rows. GPU installation
requires the entire current frame (`yOffset: 0`, `rows: height`). Both retain owned
copies, so transferring or mutating the supplied array afterward is safe. Metadata
must match the rendered carrier/seed; CPU falls back to synchronous construction
when installed samples do not cover the request. GPU installation invalidates the
uploaded key, including same-key replacement. Callers supply reference-compatible
samples; byte validation does not certify their spectrum or perceptual quality.

The game uses [FoundationPreparation](../src/foundation-preparation.js): one worker
generates the unchanged full-frame reference, then owned slices serve CPU workers
and an owned copy serves GPU. One pending job and one retained carrier bound memory;
new specifications cancel obsolete work. Each attempt has a 15-second deadline,
with one fresh-worker retry. Failure shows reload guidance. Preparation precedes
frame admission and grain advancement. Explicit CPU selection does not initialize
WebGPU; choosing Auto/GPU later does. Standalone filter APIs remain synchronous.

For WebGPU, use `pattern: 'foundation-pink'`, `'foundation-white'` or
`'foundation-binary'` with the GPU interface below. Set `spacing: 96` and
`depthStrength: .33` for the game's starting values; the API retains its legacy
defaults. `foundationSeed` defaults to 173. Foundation dimensions share the CPU
bounds; spacing scales by `pixelRatio` before integer rounding. Legacy color,
contours, window, reversal, dot-size and history settings cannot alter these modes.
The filter caches at most three reference carriers and uploads on carrier/seed/size
changes. Per-frame depth, matching and presentation stay on GPU, without readback
or image accumulation. Matching alternates odd-separation centering by row and
agrees with CPU output for the same canonical input. Auto selects WebGPU
with CPU fallback; adapter limitations below still apply.

Both foundation APIs accept uint32 `noiseFrame` (default `0`). Zero retains the
cached reference; positive values generate an independent procedural carrier with
the same visible pairs. Keep the identifier unchanged to freeze texture; change
it for a new moving frame. GPU/CPU grayscale rounding may differ by one level;
each backend preserves exact class equality. No previous image is sampled.
Full-frame coordinates preserve CPU worker seams. The game advances at most 60 Hz
on camera/visibility changes; GPU settings are evaluated after queue admission.
The carrier holds when stopped. Other hosts must include animated geometry in
their refresh policy. Optional `carrierContrast` is finite, in [0.5, 1], default 1;
class tones scale around gray 128 before rounding. Comparison B uses 0.5.
F3 exports `noiseFrame`, `motionCadence`, `carrierContrast` and `grainTrial`.
See [motion mechanism and tradeoff](STEREO-CONSTRAINTS.md#motion-carrier).

### Bounded central stereo

`windowPeriods: 0 | 2 | 3 | 4` defaults to `0` (full image) in both filters.
The demo also defaults to full-image. Nonzero values require aligned scene
color: the center contains stereo, and the surrounding pixels reproduce the source
RGB exactly. Width is `periods * round(spacing * pixelRatio)`, capped to the image.
These are pattern widths, not counts of complete duplicated scene frames.

Both endpoints must lie inside the window. Color classes and visibility are solved
within that domain; this is not a crop of a full-image stereogram. CPU workers crop
columns before synthesis; GPU passes restrict links and color gathering. Output
size and camera pose remain unchanged. F3 analyzes only the central domain.
This screen-centered window is not gaze-tracked. It bounds repeated outlines,
but does not eliminate repetition inside or guarantee comfortable fusion.
The demo adds a dimmed, 40px-blurred peripheral surround with an exterior-only
24px transition. This presentation layer never filters pixels inside the stereo
domain. Colored/depth views disable it. Raw filter output retains original outer
RGB; diagnostic evidence concerns the central stereo, not the CSS surround.

### Optional scene color

Pass `frame.color` as a `Uint8Array` or `Uint8ClampedArray` of display/sRGB RGBA8 pixels, with exactly `width * height * 4` elements and the same origin, dimensions and halo rows as depth. Alpha is ignored. Select `pattern: 'quiet'`, `'scene'` or experimental `'chroma'` to use it. The research-only `'surface'` variant also accepts color. Other patterns ignore colors; omitting color with any of these four gives the exact generated-geometry fallback. Inputs are never modified. The demo defaults to the separate pink foundation renderer; this legacy API still defaults to geometry.

`pattern: 'chroma'` is the optional **Paired color experiment**, also accepting this color input and `surfaceDetail`. Without color it gives the exact geometry fallback. It retains all visible depth constraints, but matches **linear Rec.709 luminance** instead of RGB. Convert sRGB source bytes to linear RGB, remove source luminance to obtain chromaticity, project it onto both visible eye endpoints, and scale it onto the class's deterministic scalar carrier. Each pixel selects the nearest source; equal-depth ties choose the rightmost sample deterministically. Unowned pixels are neutral. If an owner's other eye endpoint has an incompatible chromaticity, that conflicting tint is neutralized too. This comparison is bounded to one additional pair. Uniform gamut scaling preserves luminance before final sRGB quantization. Source shading and contour emphasis are omitted deliberately (`edges` has no visual effect with a color input). This prevents transitive hue/brightness copies; it may introduce chromatic rivalry. Treat it as research until human fusion is verified. It preserves projected hues, not the original render's full textures or lighting. The preceding unprojected variant produced doubled hues in human testing and has been replaced.

Quiet stereo retains the complete visible correspondence graph and fits source RGB
within each class, with low-density matching marks and contour emphasis.
`surfaceDetail` controls mark density/contrast (0–1; default 0.35) without removing
constraints. Every linked pixel remains identical on CPU/GPU. Earlier fusion
reports do not establish current acceptance: the first attempt was rejected.
Removing scene cues is not a source-color banding fix; v0.6 uses depth-only
references to recover fusion before attempting color preservation again.

The older `'scene'` mode gathers colors from visible source constraints and converts them to eight sharp dot tones. Brightness is compressed and partly shared across a scanline; chroma remains local to a class. Both modes preserve source hue/material cues but cannot reproduce arbitrary artwork exactly or eliminate inherent alternate fusion layers.

`edges: 3` selects optional dark ink on CPU/GPU. Physical silhouette/crease masks
expand to both sides, keeping recessed rims visible after depth reversal. Ink
darkens whole correspondence classes, preserving exact RGB pairs. Quiet retains
its texture amplitude; class contour coverage controls darkening. Other standard
styles darken emphasized classes to 55% RGB. Paired color still ignores contours.
Use `requiredHalo(pixelRatio, 3)` for CPU stripes: ink needs a second contour radius.
This style can emphasize repeated outlines and darkens source colors; it is not
an anti-banding or source-fidelity fix. Foundation gameplay omits ink.

`pattern: 'surface'` is a **rejected sparse research experiment**, retained for reproducibility in `tests/surface-lab.html`, outside the game selector. It restricts exact color constraints to selected patches/features/contours and uses a faint dense noise carrier. The user reported doubled artwork and noise rectangles rather than fusion. Good source-color metrics or partial decoder recovery do not validate that mode; use Quiet stereo for the supported continuous signal.

`temporalStability: true` enables carrier history for `quiet`, `chroma` and
`chroma-soft` on CPU/GPU (API default false). Each new class proposes the previous
class supported by a strict majority of its members; deterministic claims allow
one winner per old class. Quiet reuses only the seed hash, recomputing RGB and
contours from current inputs: exact class RGB remains intact, with no historical
color/depth blending. Its first frame matches ordinary Quiet. Paired modes also
smooth seeds with variance normalization. History resets on layout, spacing,
strength, dot size, support or pattern changes; Quiet additionally resets on
depth-range/edge changes. Output is path-dependent during motion and fixed when
stopped. Call `filter.resetHistory()` on CPU/GPU before rendering a camera cut,
teleport or different input stream. It clears temporal reuse, including CPU window
history, without reallocating buffers; the next frame matches fresh history.
Full-image/window transitions also discard inactive Quiet and paired-color history.
The demo's separate **Reduce Quiet shimmer · experimental** checkbox
defaults off; carrier history is also off in the new starting preset. Human acceptance remains pending.

`chroma-soft` experimentally blends 25% projected source lighting into Paired color.
It retains the graph but relaxes equal class luminance; test recovered depth, not exact
brightness equality. Unowned/conflicting pixels blend toward neutral gray. Both CPU
and GPU implement this without extra passes or an unshifted source-image overlay.
Color disagreement can increase; synthetic improvements do not establish human fusion.

## GPU interface

```js
import {DepthWalkGPU} from './src/gpu/depthwalk-gpu.js';

const filter = await DepthWalkGPU.create(device, canvasFormat);
filter.resize(width, height, depthTexture.createView());

// The host first renders its depth texture into the same command encoder.
filter.encode(encoder, canvasContext.getCurrentTexture().createView(), {
  pixelRatio: devicePixelRatio, spacing: 120, depthStrength: 0.5,
  dotSize: 1, edges: 2, pattern: 'geometry', verticalFov: 62, depthRange: 22,
});
device.queue.submit([encoder.finish()]);
```

Supply a **top-down `rgba8unorm` texture on the same GPUDevice** with `TEXTURE_BINDING` usage. Pack `round(exp(-viewZ / depthRange) * 65535)` into R (high byte) and G (low byte), divided by 255. B/A are ignored. Clear background RG to zero. This first GPU interface accepts canonical RG16 proximity and symmetric perspective projection only; other encodings and orthographic cameras need conversion or the broader CPU interface above. `depthRange` must match the host's encoding. There is no GPU-to-CPU readback or per-frame depth upload in the normal path.

For optional scene colors, pass a fourth argument: `filter.resize(width, height, depthView, colorView)`, then select `pattern: 'quiet'` or `'scene'`. Supply a matching top-down `rgba8unorm` color texture with `TEXTURE_BINDING`, containing display/sRGB bytes. Do not use an `-srgb` texture view, which would decode them into linear values. Keep depth and color aligned to the same camera/frame. Without a color view, both modes fall back to generated geometry colors.

Call `resize` when dimensions or the source texture change. The output format must match `canvasFormat`; defaults use `navigator.gpu.getPreferredCanvasFormat()`. `encode` writes one settings block, so submit each frame before encoding another with different settings. Limit in-flight frames to prevent an input-lagging queue. Dimensions are capped at 8.3 MP and 8192 per axis; spacing is capped at 8192 render pixels. Call `destroy()` when finished. `readDiagnostics()` maps GPU buffers explicitly for verification and is unsuitable for normal rendering. `readPixels()` returns only native top-down RGBA pixels, mapping fewer buffers for observer comparisons. Both release staging buffers even when mapping fails; neither belongs in an interactive frame loop. Finish readback before resizing or encoding another diagnostic frame. The host owns the supplied device; filter destruction does not destroy it.

The pipeline reconstructs geometry, solves visible pairs with monotonic atomic unions, gathers class colors/contours, then shades and presents directly on the GPU. Deterministic integer sums prevent scheduling-dependent color shimmer. CPU/GPU visibility uses canonical 16-bit depth and strength rounded to 0.001, including exact half-pixel decisions. GPU normal reconstruction can differ slightly numerically from the CPU; standard-mode eye pairs remain identical.

For `chroma`, supply the same color texture and select that pattern in `encode`. The link pass atomically selects source-color owners. A history pass resolves deterministic reuse claims; colorization then writes every output pixel at matched class luminance. It reuses the class-list buffer after shading. Historical roots and tones stay on the GPU, within existing storage bindings. Diagnostics return those final local RGB pixels and the unchanged full graph. Do not assert RGB equality in this experimental mode: verify decoded luminance disparity and linear-light pair error, allowing final 8-bit quantization. Other modes keep their existing exact RGB contract. No CPU readback is added to interactive rendering.

The demo's `ThreeWebGPUDepth` adapter uploads static city geometry once and draws live beacon visibility. It is not a general Three.js animation renderer. A different engine should render its own depth texture and keep its scene/camera ownership. The demo uses its WebGL renderer for normal/depth views and copies the normal canvas to the GPU color texture in source-color modes, without JavaScript pixel readback. CPU source-color modes read a separate RGBA image. GPU creation failure or device loss selects CPU fallback visibly in the HUD.

The demo bounds normal work to two outstanding frames and makes diagnostic readbacks exclusive. Its visible RAF loop submits an empty command buffer while completions are pending to avoid Firefox's [100 ms completion-poll delay](https://bugzilla.mozilla.org/show_bug.cgi?id=1870699). Do not serialize every normal frame behind `onSubmittedWorkDone()` without accounting for browser completion delivery. Completion latency includes browser/queue delay and is not a GPU timestamp measurement.

## Depth formats

| `format` | Samples | Required conventions |
| --- | --- | --- |
| `view-z` (default) | One distance per pixel | Positive view-space Z distance, not Euclidean/radial distance; `Infinity` is background. |
| `device-depth` | One value in [0, 1] per pixel | Supply `near`, `far`, `projection` (`perspective` or `orthographic`), and boolean `reverseZ` if applicable; string/numeric flags are rejected. Clear depth is 1 conventionally or 0 for reversed Z. Perspective supports `far: Infinity`. |
| `proximity` | One value in [0, 1] per pixel | `exp(-viewZ / frame.depthRange)`; zero is background. Source `depthRange` defaults to 22. This is an explicit exponential encoding, not arbitrary grayscale or min/max normalization. |
| `packed-proximity-rg16` | Four Uint8 bytes per pixel | RG = a big-endian 16-bit proximity value. B/A are ignored. This is the Three.js demo adapter's readback format. |

Scalar buffers may use Float32Array or Float64Array. `origin` is `top-left` by default; use `bottom-left` for WebGL readback. Missing/invalid scalar samples become background. A conventional OpenGL depth-texture sample is already [0, 1]; if supplying NDC Z in [-1, 1], remap it first. Logarithmic or engine-specific depth encodings need conversion to one of these formats.

Example for reversed perspective depth:

```js
filter.render({
  depth: engineDepthSamples, width, height,
  format: 'device-depth', origin: 'bottom-left',
  near: 0.1, far: 1000, reverseZ: true,
  projection: 'perspective', verticalFov: cameraFovDegrees,
});
```

`verticalFov` defaults to 62 degrees; supplied values must be finite numbers strictly between 0 and 179. Orthographic inputs use `projection: 'orthographic'` and `orthographicHeight` (visible vertical span in engine units; default 2). Current reconstruction assumes a symmetric, square-pixel projection. Off-center/jittered projection matrices and lens distortion need an adapter; general inverse-projection input is not implemented yet.

`settings.depthRange` controls how engine units map into stereogram depth. Keep it constant while moving. DepthWalk does not normalize each frame by its current minimum/maximum, which would cause the perceived depth to pump.

`invertDepth: true` reverses canonical proximity (`q → 65535 − q`) for stereo
visibility and synthesis on CPU/GPU. Physical normal codes, geometry palette families
and contours use original depth; inversion must not invent floor creases.
Near/far relief, including background,
reverses; changing direction resets carrier history. Host depth and camera pose
stay intact. This is separate from input `reverseZ`, which decodes device depth.
API, demo and lab default to false: foreground uses smaller separation than background
for looking through the screen. The former reversed demo default is retired;
legacy preferences reset direction while retaining other settings. New explicit
reversal choices persist. F3 records/evaluates the selected relief. Human confirmation
of the corrected view remains pending.

## Pipeline and ownership

1. **Host adapter:** capture and describe depth at the chosen output resolution.
2. **DepthWalk:** linearize depth; estimate local surface orientation using neighboring depth samples; choose its geometry palette; detect silhouettes and face creases.
3. **DepthWalk:** solve visible binocular correspondences. Standard modes assign identical class RGB; Quiet stereo fits class colors and generated palettes shade distance. Experimental Paired color assigns class luminance and separately projects source chromaticity to visible eye endpoints. Keep independent dot seeds stable.
4. **Host:** present the resulting image and draw its readable HUD separately.

The depth adapter is `src/adapters/three-depth.js`; its blue/alpha bytes are constant. The separate optional color path uses the city's actual materials and lighting. Material changes affect scene-color mode, while depth-only modes remain independent.

The default geometry palette uses dusk blue for background, paving stone for horizontal tops, coordinated concrete/masonry tones for upright faces, and greens for both rising and descending facets. Nearby geometry is brighter; distant geometry is darker. Each class retains its own hue mixture. Only the brightness descriptor blends 25% class proximity with 75% scanline proximity; there is no row-wide hue carrier. Newly exposed roots use nearby geometry hue and shared brightness. This limits dark occlusion ribbons without spreading an object's tint to unrelated classes across the whole row. The 256-step shade ramp preserves eight ordered dot tones and the contour contrast boost. All hues in a class share the same tone index, so blending colors cannot average away the dot signal. Classic and neutral styles retain their fixed brightness.

Generated hues describe view-relative orientation, not semantic identity. Depth alone cannot reliably distinguish a tree from a similarly shaped roof, or a beacon from other facets. It cannot distinguish coplanar road/paving materials or reproduce engine artwork. Shared stereo classes also cause some horizontal color blending/repetition. Fine/coincident details absent from the depth image cannot be recovered. Colors may change with the viewed orientation; they are deterministic for an unchanged frame.

## Worker stripes

`requiredHalo(pixelRatio, edges)` returns the neighboring row count needed for depth-derived normals and contour detection. Include those source rows around each output stripe, then set these additional frame fields:

- `fullHeight`: complete image height, for projection reconstruction.
- `yOffset`: topmost supplied input row's global top-down coordinate.
- `cropTop`, `cropBottom`: halo rows to omit from the output.

The result's height excludes those crop rows. Seed coordinates still use the full image, and halo rows prevent normal/edge seams. See `src/stereo.worker.js` and its caller in `src/main.js` for a buffer-reusing implementation. The API tests check byte-identical full-frame and striped output at multiple qualities.

## Current boundary

The CPU and WebGPU filters are working browser implementations. Unity/Unreal/ReShade plugins and a universal game injector are not delivered. They still require engine-specific depth access and presentation hooks; the GPU contract supplies a reusable boundary rather than installing those integrations.
