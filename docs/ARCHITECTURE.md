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

[main.js](../src/main.js) normally prefers WebGPU. Its adapter uploads static geometry
and updates beacon visibility. Two submissions overlap; RAF empty submissions
service Firefox completions. Diagnostics are exclusive. Completion latency includes
scheduling. Failure selects CPU; WebGL supplies views/color. Quality can adapt or stay fixed.

CPU assembles complete frames from ≤4 [workers](../src/stereo.worker.js); legacy
filters need halos. Pose/visibility caching stabilizes inputs; versions reject stale
output. Quality respects CPU/refresh ceilings; QA readback stops after checks.
[Diagnostics](OBSERVER.md) reconstruct pixels before truth comparison, expose missing
evidence, export native PNGs and restore prior views; relief renders on demand.

[FoundationFilter](../src/foundation-stereo.js) serves gameplay and
[Foundations](../tests/foundations.html): canonical proximity, alternating
row centering, exact visible pairs and cached binary/white/pink carriers. Full-frame
seed coordinates keep worker stripes identical. It omits source tint, contours and
history. Game selection forces CPU, full image and foreground-near direction;
limits follow [Integration](INTEGRATION.md#foundation-cpu-research-api).

[city.js](../src/city.js): Original/Block study share layout; Block simplifies geometry/materials.
Switching preserves pose/collection/settings, disposes scenery, rebuilds GPU geometry,
resets history. Resolution limits stereo precision despite RG16 input.
[game.js](../src/game.js) owns movement/collision/collection.

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
- Express spacing, dot size and contour width in display pixels and scale them into
  render pixels. Native output is generated at its chosen dimensions, currently
  capped at 8.3 MP, or 2 MP for foundation gameplay.
- Keep depth-range mapping fixed across frames. Per-frame min/max normalization
  would change perceived depth as scene contents change.
- Present complete current frames; no old RGB/depth accumulation, temporal antialiasing
  or interpolated stereo images. [Audit](STEREO-CONSTRAINTS.md#static-implementation-audit).

**Current boundary:** GPU requires canonical RG16 and symmetric perspective;
CPU supports additional encodings/projections. [State](SOT.md) owns integration gaps.
