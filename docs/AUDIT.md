---
role: audit
purpose: Current engineering findings, prioritized work and scoped verification.
not-here: Product authority, duplicated research history or perceptual acceptance.
durability: Replace resolved tasks with capabilities; retain actionable risks.
update-when: Findings, task status or verification scope changes.
read-with: SOT.md; ARCHITECTURE.md; MAINTAINER_GUIDE.md.
---

# Project audit

Scope: `codex/v0.6` based on `0e7cc09fccd86dd4568f7bd2956823a65ebaf4e5`;
2026-11-01 seam-synthesis audit of sampling, continuity, boundary limits and motion.
Checkout initially clean; offline experiments adjusted, game/defaults unchanged. [State](SOT.md) owns human direction;
[research](STEREO-CONSTRAINTS.md#motion-carrier) owns perceptual evidence.

## Assessment

The project has a usable research foundation, but movement comfort prevents
product acceptance. The portable depth filters, independent reconstruction,
CPU/GPU correspondence checks and conservative defaults serve the videogame goal.
Good single-frame reconstruction does not establish comfortable gameplay.
The recorded tiny-step experiment replaces about 99% of pixels even when no
disparity classes change. Source color and edge styling remain secondary until
stable, correctly ordered depth survives movement.

## Findings

| Priority | Area | Evidence and consequence |
| --- | --- | --- |
| P1 | Product alignment | Whole-image carrier replacement dominates tiny-step flicker; half contrast helps but fails human comfort. Do not promote another cosmetic adjustment as a motion fix. |
| P1 | Motion transitions | [Seam constraints](STEREO-CONSTRAINTS.md#seam-constraints-and-boundary-controls) remove field discontinuities but change global texture coefficients as geometry moves. Value/slope and independent-seed treatments fail matched contrast/detail or motion screening; none is promoted. Earlier seed transport retains its burst limitation. |
| P1 | Fractional validation | Value-only matching removes false accepts in the declared primary/holdout samples. Stronger slope matching misdecodes a thin foreground as background on fresh geometry; independent seeds retain a false occlusion accept. The observer and 1/16-pixel tolerance remain fixed. Missing boundary estimates and general integer guards remain explicit. |
| Fixed | Boundary limits | A fully offscreen post no longer changes the unconstrained image seed; original twelve baseline images remain byte-identical. Projected-width fading makes vanishing-post corrections tend to zero while preserving continuous pairs. Large-dimension residual calculation avoids argument-list overflow. These are research-module fixes, not gameplay acceptance. |
| P1 | Viewing geometry | [Presentation](../src/main.js) preserves CSS spacing across render scaling, but does not measure physical screen scale, eye separation or viewing distance. Settings-matched replay is not physical calibration. Record geometry before human A/B; calibration cannot repair synthesis failures. [Model and limits](STEREO-CONSTRAINTS.md#lenticular-comparison-and-research-frontier). |
| P2 | Literature scope | The full Stereogram Arcade thesis and Steer's algorithms are reviewed. Slope dithering is underspecified; supersampled links offer a concrete spatial comparator. Neither validates moving comfort. Earlier dither failure and Steer's thin-object visibility limitation require explicit controls. Echo and object-color full methods remain retrieval tasks. [Review](STEREO-CONSTRAINTS.md#stereogram-arcade-and-sampling-references). |
| Fixed | Research validity | Shared browser/Node bounds match prior synthetic evidence. Counterexamples prevent concentration or translated matches being treated as standalone artifact verdicts. Worst-transition reconstruction and local flow now accompany averages. |
| Fixed | Input contract | CPU/GPU projection validation rejects coercible strings, booleans and objects before output writes. Adjacent projection quantities retain numerical bounds and the documented infinite-far exception. |
| Fixed | CPU lifecycle | Validated stripe replies and 15-second deadlines prevent silent worker failures from leaving frames permanently busy. Shared ownership settles requests and terminates failed work. |
| Verified | Failure coverage | Actual GPU device destruction now exercises continued CPU presentation; a terminated CPU worker reaches visible reload guidance within its deadline. |
| Fixed | Performance | Unchanged foundation output is held. Input, settings and capture wake rendering; GPU completion polling continues. Legacy convergence is unchanged. |
| P2 | Architecture | `main.js` combines controls, scheduling, capture and worker ownership; compressed functions make lifecycle review difficult. Extract tested ownership boundaries when fixing them, not through a wholesale rewrite. |
| Fixed | YAIML | README verification history is replaced by scoped evidence links; current checks, past observations and open acceptance remain distinct. The stale test port is removed. |
| P2 | Security | The earlier lockfile audit reported zero known advisories; advisories were not rechecked on 2026-10-30. Earlier DOM/input review and loopback exposure findings remain historical, not a current penetration test or deployment review. |
| P2 | Portability | Current GPU input is canonical proximity from static, symmetric-perspective geometry. Other engines, animated geometry and a hardware floor remain unvalidated. |
| Fixed | Startup | Gameplay prepares one reference-identical carrier in a worker and shares owned copies across CPU stripes or GPU. Explicit CPU selection avoids GPU initialization. Obsolete work, deadlines, retry, backend/world switches and failure recovery have focused coverage. Standalone synchronous APIs retain their fallback. |
| Fixed | Recovery | Foundations bounds requests, retains workers on persisted suspension, and reconciles controls restored after Back with frame dimensions, scene and links. Narrow gameplay windows pause synthesis without killing either backend. |

## Current safeguards

`StereoWorkerClient` validates returned ownership, dimensions, revision and timing
before assembly. Its shared transport handles IDs, crashes, deserialization,
timeouts and teardown. Gameplay and diagnostic callers share that transport.
The frame-demand helper records admitted work; busy admission cannot suppress a
retry, and a return to an earlier pose still renders. Both have focused regression
coverage. Portable motion/scheduling/preparation modules are covered by engine/DOM import rules.

The research audit rechecked construction, static pink-noise and dynamic-video
methods, and added lifetime, motion-perception and interaction studies to the
[literature account](STEREO-CONSTRAINTS.md#motion-carrier). Stereo pairs, static
single-image results and gameplay acceptance remain distinct. No reviewed paper
establishes an optimal game carrier. The continuous-carrier experiment preserves
depth and lowers average flicker but retains bursts and unvalidated motion; it
remains offline. Concentration alone is not an artifact verdict. Default rendering
and accepted band reduction are unchanged.

## Remaining to-do list

Work in priority order. After each change inspect the affected diff and run its
focused checks, then recheck combined behavior. Promote a renderer only with both
numerical evidence and human acceptance.

Alternate-frame/perceptual encodings are an additional authorized research path,
not a replacement priority or accepted renderer. [Temporal hypotheses](STEREO-CONSTRAINTS.md#temporal-encoding-hypotheses)
define complementary modulation and constraint scheduling. Before prototyping,
state changed invariants, temporal observer controls, presentation timing and
human gates; existing single-frame acceptance cannot certify these proposals.

- [ ] **P1 — Remaining observer/geometry prerequisites:** local fractional decoding
  and negative controls are implemented. Preserve its declared thresholds and
  boundary abstentions during candidate trials; thin surfaces and disocclusion
  still need coverage. Record physical screen scale, viewing distance and optional
  eye separation before human comparisons. Existing integer metrics remain guards.
- [ ] **P1 — Fractional boundary sampling:** investigate seed functions with local
  spatial support instead of global coefficient corrections. Value matching improves
  static decoding but fails joint motion/texture screening; derivative constraints
  can erase thin-depth evidence. Preserve original geometry, fixed observer thresholds,
  support-aware birth/death handling and missing coverage. Continuous field equality
  does not certify displayed depth or relax runtime pixel equality.
  Include the [thesis-derived comparisons](STEREO-CONSTRAINTS.md#stereogram-arcade-and-sampling-references):
  ramps and thin posts, specified slope dithering and supersampled links with
  spatial integration. Keep independent original-geometry targets and matched
  output resolution/contrast; do not reintroduce the rejected dither by name alone.
- [ ] **P1 — Candidate coverage:** a numerical survivor must pass actual tiny-step,
  sustained turn/approach, disocclusion, pause/resume and exact-rest checks. The
  seed-transport trial retains bursts; fractional synthesis covers only two planes
  and one post, with unresolved sampling and motion failures. Neither is ready for
  promotion. Preserve the band-reduction baseline.
- [ ] **P1 — Human gate:** only after numerical gates pass, compare the candidate
  while walking and turning. Require solid correctly ordered depth, correct motion
  direction/approach, successful object interaction, no recurring traveling bands
  and materially calmer static before changing defaults.
- [ ] **P2 — Texture, then source appearance:** after motion acceptance, compare
  attractive structured carriers at matched depth/contrast, then compatible
  color/edges with independent locality and fusion checks. Retrieve Tsuda's
  original color method before adopting thresholds attributed to it by the thesis.
- [ ] **P2 — Integration readiness:** choose an external engine and hardware
  floor; validate animated depth input and deployment requirements there.
- [ ] **P2 — Maintainability:** extract host responsibilities when modifying them;
  avoid a cosmetic rewrite of the solver.
- [ ] **P2 — Performance coverage:** check Auto quality during intermittent mouse
  movement and on the chosen hardware floor; idle samples are deliberately excluded.

## Verification scope

**Current, 2026-11-01:** the offline seam experiments pass `npm run check`:
lint, 249/249 tests and build on Windows/Node 22.22.3.
[Seam evidence](../evidence/fractional-seam-verification.json) fingerprints sources
based on `0e7cc09`: seven treatments, 696 primary samples each, four motion routes,
and 360 fresh-seed/geometry samples for each of four selected treatments. Original
observer thresholds remain fixed; no candidate passes joint screening. Boundary
and maximum-dimension checks cover the retained fixes. No browser suite was rerun;
gameplay is unchanged. [Detailed findings](STEREO-CONSTRAINTS.md#seam-constraints-and-boundary-controls).

The earlier [edge evidence](../evidence/fractional-edge-verification.json), based on
`3e19b34`, retains its 238-test scope and continuous/rounded/8x-link comparison.

The earlier [observer calibration](../evidence/fractional-observer-verification.json),
based on `bf59d7d`, passed 230 tests/build and its 84 plane/696 two-eye samples.
That scope does not certify the new single-image edge patterns or human perception.

**Earlier revival check, 2026-10-30:** [Revival verification](../evidence/revival-audit-verification.json)
records `npm run check`: lint, 222/222 tests and build passed on Windows,
Node 22.22.3/npm 10.2.3, runtime source at `bf59d7d`. In the in-app browser,
22/22 GPU fixtures and 41/41 gameplay checks passed at 1280×720, DPR 1,
quality 1, initially WebGPU (including renderer switching and F3 native export).
The 384×12 fractional-plane control reproduced 25.14494 → 2.45983 byte RMS
at a 1/16-pixel rounding-boundary step with contrast near 26.15.
This does not test fractional occlusions, human perception, real capture/fullscreen,
external Firefox or performance. Separate CPU-start, startup and fault-injection
suites were not rerun. Dependency advisories were not refreshed.

The following evidence retains its original revision/environment:

[Motion iteration evidence](../evidence/motion-iteration-verification.json) records
222 passing tests, lint/build and the new browser/offline studies. Four tiny-step
captures and 288 prescribed city transitions were measured at 1280×720; held output
and exact current pairs passed. This is not real-time performance or human acceptance.
Production code/defaults are unchanged; established gameplay/GPU lifecycle suites
were not rerun for research-only edits.

[Startup audit evidence](../evidence/startup-audit-verification.json) records source
fingerprints and its earlier environment. Lint, 214 unit tests, build, 22 actual GPU fixtures,
41 gameplay checks per backend, seven startup checks per initial backend and six
runtime checks pass. Preparation presents exact reference pixels; timed 960×540
preparation kept UI callbacks and guide input responsive. Navigation-to-first-accepted
completion measured 656/736 ms for GPU/CPU in separate development runs with QA
readback, not production startup, scanout latency or a backend comparison.

[Research audit evidence](../evidence/research-audit-verification.json) retains its
199-test revision and zero-advisory lockfile audit; dependencies are unchanged.
Projection rejection tests execute the real JavaScript API with recorded commands;
fixtures separately exercise hardware. Human comfort is unverified.

[Prior engineering evidence](../evidence/project-audit-verification.json) retains
its 187-test revision and idle-work measurement. At 1280×720 on that test machine,
stationary foundation work falls from approximately 239 completed
frames/s to no additional frames after settling. This is avoided work, not a
moving-FPS or power-consumption claim.

The automated viewport bottoms out at 240 pixels, so the narrower-than-spacing
guard is source-reviewed, not browser-exercised. Foundations treatment, size,
motion and Back navigation pass; a persisted BFCache hit is not established. Firefox and human
comfort are not newly verified. This security review covers dependency advisories,
input/DOM paths and development exposure, not penetration testing or GPU-driver settings.
[Earlier audit](../evidence/audit-verification.json) and
[foundation evidence](../evidence/foundation-verification.json) retain their
original revisions and environments; this document does not revalidate them.
No numerical check substitutes for human fusion or comfort acceptance.
