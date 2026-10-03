---
role: architecture
purpose: Components, data flow, ownership boundaries and durable rendering invariants.
not-here: Priorities, run history, command procedures or a complete file inventory.
durability: Retain design constraints; replace descriptions when implementation changes.
budget: Target at most 650 whitespace-delimited words, including this header.
update-when: Interfaces, responsibilities, rendering contracts or architectural decisions change.
read-with: SOT.md; MAINTAINER_GUIDE.md; INTEGRATION.md.
agent-guidance: Distinguish implemented design from human direction and proposals; resolve consequential contradictions against sources.
---

# Architecture

## Host and filter boundary

The host owns scene, camera, gameplay, capture and presentation.
DepthWalk interprets depth/projection metadata and optional aligned scene color,
generating appearance and binocular correspondences. [INTEGRATION.md](INTEGRATION.md) owns formats,
buffer lifetime and examples.

The [CPU filter](../src/depthwalk.js) has no engine/DOM imports; it reuses conversion
buffers. [WebGPU](../src/gpu/depthwalk-gpu.js) uses a host GPUDevice.
Both expose `resetHistory()` without reallocating; full/window transitions discard
inactive history. `invertDepth` reverses matching, preserving physical normals/contours.
Device `reverseZ` requires a boolean.

## Data flow

1. The adapter produces a depth frame at the selected render resolution.
2. [Depth ingestion](../src/depth-frame.js) linearizes the declared encoding,
   estimates orientation from neighboring depths, and generates shape-palette indices
   and internal normal codes.
3. [Contour detection](../src/contours.js) finds foreground silhouettes and face
   creases, rejecting smooth floor gradients. Ink expands physical rims
   to both sides and darkens stereo classes, preserving Quiet texture amplitude.
4. [Stereo encoding](../src/stereogram.js) solves visible-pair classes. Quiet fits
   RGB; history reuses seeds one-to-one.
   Paired projects hues, neutralizes incompatible partners and omits contours.
   Soft paired adds lighting, relaxing luminance equality.
5. Optional `windowPeriods` bounds matching to 2–4 central pattern widths; source
   RGB fills outside. CPU crops input; GPU bounds links/gathering. F3 analyzes
   the region. Exterior CSS blur never filters stereo pixels. Default: full image.

GPU uses atomic unions and deterministic history claims, reusing lists for final
pixels. Canonical depth/strength aligns visibility/rounding with CPU; float
normals may alter reference colors.

## Demo responsibilities

[main.js](../src/main.js) prefers foundation WebGPU, created only when selected.
WebGPU uploads static geometry, updates beacons and overlaps two submissions.
Grain advances after admission; RAF polls completions, including while idle.
Diagnostics are exclusive. Failure selects CPU; WebGL supplies views/color.
[Frame demand](../src/frame-demand.js) holds unchanged foundation output; input,
settings and capture wake it. Idle samples cannot lower adaptive quality.

[Preparation](../src/foundation-preparation.js) computes unchanged reference bytes
once off-thread; owned copies serve GPU/≤4 CPU stripes before admission.
Superseded work is cancelled. [API](INTEGRATION.md#foundation-cpu-research-api) owns deadlines,
retry and cache bounds. CPU [ownership](../src/stereo-worker-client.js) validates replies/versions
with a 15-second deadline. Legacy stripes need halos.
Scene-input caching ignores appearance controls; QA readback stops afterward.
[Diagnostics](OBSERVER.md) reconstruct pixels, export PNGs and restore views.

[FoundationFilter](../src/foundation-stereo.js) serves gameplay/[Foundations](../tests/foundations.html):
canonical proximity, alternating centering, visible pairs. CPU/GPU share carriers
and procedural tones. Grain refreshes ≤60 Hz while moving; B halves class-tone contrast. Gameplay
requires full-image foreground-near output; [API](INTEGRATION.md#foundation-cpu-research-api).

[city.js](../src/city.js): Original/Block study share layout; Block simplifies geometry/materials.
Switching preserves pose/collection/settings, disposes scenery, rebuilds GPU geometry,
resets history. Resolution limits stereo precision despite RG16 input.
[game.js](../src/game.js) owns movement/collision/collection and release damping.

## Invariants and rejected regressions

- Generate a real single-image autostereogram; ordinary perspective and depth views
   are explicit diagnostics.
- Standard modes require identical class RGB. Paired color explicitly relaxes this
  to linear-light luminance; Soft paired relaxes that equality further. Human fusion
  remains separate from numerical acceptance.
- Keep seed identities stable and unaliased at unconstrained pixels. Wrapping at the
  pattern period previously created false matches around occlusions.
- Legacy palettes share eight ordered luminance tones and one seed tone index.
  Quiet stereo shares a class seed and contrast amplitude. Preserve matching contrast
  and keep highlights in gamut; averaging unrelated noise previously weakened fusion.
- Scale display-pixel spacing, dot size and contours into native render pixels.
  Foundation gameplay caps near 2 MP; insufficient width pauses synthesis recoverably.
- Keep depth-range mapping fixed across frames. Per-frame min/max normalization
  would change perceived depth as scene contents change.
- Present complete current frames; no old RGB/depth accumulation, temporal antialiasing
  or interpolated stereo images. [Audit](STEREO-CONSTRAINTS.md#static-implementation-audit).

**Current boundary:** GPU requires canonical RG16 and symmetric perspective;
CPU supports additional encodings/projections. [State](SOT.md) owns integration gaps.
