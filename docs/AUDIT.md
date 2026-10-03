---
role: audit
purpose: Current engineering findings, prioritized work and scoped verification.
not-here: Product authority, duplicated research history or perceptual acceptance.
durability: Replace resolved tasks with capabilities; retain actionable risks.
update-when: Findings, task status or verification scope changes.
read-with: SOT.md; ARCHITECTURE.md; MAINTAINER_GUIDE.md.
---

# Project audit

Scope: `codex/v0.6`, working changes based on `545de5a`; 2026-10-02 local
audit. Existing edits are preserved. [State](SOT.md) owns human direction;
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
| P1 | Motion transitions | Brightness shifts explain only a small part of static. Exact class transitions can force substantial changes even at optimally chosen tones. Synthetic bounds separate unavoidable change from assignment overhead; gameplay bounds remain unmeasured. [Research](STEREO-CONSTRAINTS.md#motion-carrier). |
| Fixed | Research validity | Temporal diagnostics now distinguish stationary correlation from displacement and report missing/ambiguous evidence. Global and regional brightness checks expose changes hidden by averaging. |
| Fixed | Input contract | CPU/GPU projection validation rejects coercible strings, booleans and objects before output writes. Adjacent projection quantities retain numerical bounds and the documented infinite-far exception. |
| Fixed | CPU lifecycle | Validated stripe replies and 15-second deadlines prevent silent worker failures from leaving frames permanently busy. Shared ownership settles requests and terminates failed work. |
| Verified | Failure coverage | Actual GPU device destruction now exercises continued CPU presentation; a terminated CPU worker reaches visible reload guidance within its deadline. |
| Fixed | Performance | Unchanged foundation output is held. Input, settings and capture wake rendering; GPU completion polling continues. Legacy convergence is unchanged. |
| P2 | Architecture | `main.js` combines controls, scheduling, capture and worker ownership; compressed functions make lifecycle review difficult. Extract tested ownership boundaries when fixing them, not through a wholesale rewrite. |
| Fixed | YAIML | README verification history is replaced by scoped evidence links; current checks, past observations and open acceptance remain distinct. The stale test port is removed. |
| P2 | Security | Lockfile audit reports zero known advisories. Reviewed DOM HTML insertions use constant templates; persisted preferences are constrained. Loopback servers reduce exposure. This is not a penetration test or deployment review. |
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
depth and lowers average flicker but fails the concentration/burst screen; it
remains offline. Default rendering and accepted band reduction are unchanged.

## Remaining to-do list

Work in priority order. After each change inspect the affected diff and run its
focused checks, then recheck combined behavior. Promote a renderer only with both
numerical evidence and human acceptance.

- [ ] **P1 — Motion mechanism:** apply least-change bounds to recorded tiny-step,
  turn and approach frames. Distinguish needless carrier renewal from expensive
  class transitions before another prototype. Compare assignment changes where
  bounds are low; investigate spatial fractional sampling separately where they
  are high. Preserve contrast, displacement and reconstruction checks. Prior
  class-reuse, continuous evolution and row-dithered depth failures remain scoped
  to those mechanisms; no replacement has passed.
- [ ] **P1 — Candidate coverage:** a numerical survivor must pass actual tiny-step,
  sustained turn/approach, disocclusion, pause/resume and exact-rest checks. The
  synthetic candidates remain rejected; a bound calculation is not a replacement
  renderer. Preserve the band-reduction baseline.
- [ ] **P1 — Human gate:** only after numerical gates pass, compare the candidate
  while walking and turning. Require solid correctly ordered depth, correct motion
  direction/approach, successful object interaction, no recurring traveling bands
  and materially calmer static before changing defaults.
- [ ] **P2 — Source appearance:** after motion acceptance, reintroduce source
  color/edges with independent locality and fusion checks.
- [ ] **P2 — Integration readiness:** choose an external engine and hardware
  floor; validate animated depth input and deployment requirements there.
- [ ] **P2 — Maintainability:** extract host responsibilities when modifying them;
  avoid a cosmetic rewrite of the solver.
- [ ] **P2 — Performance coverage:** check Auto quality during intermittent mouse
  movement and on the chosen hardware floor; idle samples are deliberately excluded.

## Verification scope

[Startup audit evidence](../evidence/startup-audit-verification.json) records source
fingerprints and environment. Lint, 214 unit tests, build, 22 actual GPU fixtures,
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
