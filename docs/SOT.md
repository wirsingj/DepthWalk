---
role: sot
purpose: Current identity, capabilities, human direction, risks and consequential evidence.
not-here: Durable architecture, command reference, chronological work history.
durability: Replace stale state; preserve active direction and unresolved uncertainty.
budget: Target at most 650 whitespace-delimited words, including this header.
update-when: Direction, capabilities, priorities, risks or verification scope changes.
read-with: ARCHITECTURE.md; MAINTAINER_GUIDE.md.
agent-guidance: Verify claims against named evidence; preserve human intent and conflicts without treating memory as permission.
---

# State of DepthWalk

## Identity and human direction

**Reaffirmed human direction, 2026-10-02:** The goal is always a stereogram for a
video game: this game first, eventually a reusable layer for other games, with
explicit limits and accepted degradation. Strong, correctly ordered, stable depth
comes before source-color fidelity. Research must advance playable usability.
An eventual paper is an aspiration: preserve citations and reproducibility, not assumed novelty.

The first attempt failed human acceptance and is preserved on `v0.5` at `2a1278b`;
development continues on `codex/v0.6`. Earlier human suggestions about art style,
color, ink, spacing and strength are hypotheses. Preserve observations and failures;
reconsider mechanisms against papers and outcomes. Color and edges remain possible
extensions, never reasons to weaken fusion.

Demo scope remains one level and five beacons, without accounts, multiplayer,
combat or services. Preserve restrained movement, ground collisions, stationary
startup, explicit mouse capture, Escape release and pose-preserving views.

## Implemented capability

Defaults use depth-first pink/WebGPU, foreground-near ordering and shared worker
preparation. Grain refreshes during movement. World/texture choices precede
collapsed Advanced; saved tuning follows defaults, and reset preserves position.
Legacy comparisons remain. **Compare moving grain** tests half contrast with unchanged depth/timing.
See [preset policy](STEREO-CONSTRAINTS.md#v06-foundation-implementation),
[API](INTEGRATION.md) and [comparison evidence](OBSERVER.md#quiet-motion-comparison).

[Observer lab](OBSERVER.md) provides calibrated A/B/C replay, original-color references,
native PNG export, asset-free fixtures and rejection gates. F3 restores views;
tuning focus stops movement.
Controls: [README](../README.md#play).

[Foundations](../tests/foundations.html) compares binary, white and spectral pink
textures on held frames, with optional motion and source/depth views. The same
depth-only algorithm runs on GPU with CPU fallback. Scene color, ink,
reversal and image history cannot alter these modes. Moving-grain comfort remains unresolved.
[Mechanism and limits](STEREO-CONSTRAINTS.md#v06-foundation-implementation).

## Evidence and limits

**Verified, 2026-10-02:** [Audit](AUDIT.md): unit/build/lint, GPU fixtures, gameplay
and failure checks passed. Preparation preserves reference pixels while leaving the UI responsive.
Windows, Node 22.22.3, npm 10.2.3; `codex/v0.6` changes based on `545de5a`.
[Earlier foundation](../evidence/foundation-verification.json),
[depth](../evidence/depth-order-verification.json), [contour](../evidence/contour-verification.json)
and [ink](OBSERVER.md#ink-contours) checks remain historical. Projected-lighting and row-dithered-depth
candidates regressed and were removed. Metrics do not establish comfort.

**Human-reported, 2026-09-26:** Synthesis regressed across several modes; foreground
trees look cut into background. The harness remains valuable; clarity/color ambition
remains. Earlier [Quiet fusion](../README.md#remaining-limits) is not acceptance.
External Firefox previously improved to 58–60 fps after the scheduling fix
(human report, not an automated benchmark). QA readbacks stop after checks. Reconstruction measures image evidence,
not human comfort; alternate matches can be inherent harmonic repetitions.
Mouse look is human-confirmed; the embedded host declined Pointer Lock.
**Correction:** Reversed settings encoded foreground behind background while looking
through the screen. Defaults/legacy preferences now preserve source ordering;
explicit reversal remains diagnostic. Overall release acceptance remains open.

## Active gaps and priorities

Preserve optional depth-only input and stereo readability. GPU input currently requires
canonical RG16 proximity and symmetric perspective projection. Its city adapter
handles static geometry and beacon visibility; general animated adapters and native
engine plugins remain future work. Off-center/jittered projections and lens
distortion are unsupported. Depth cannot identify semantic materials or recover
absent geometry. Legacy color bands and harsh moving grain remain unresolved.

**Human-reported, 2026-10-02:** Depth holds; harsh moving static persists despite
half contrast. One possible brief diamond band qualifies the earlier band-free report.
Keyboard release now settles within 180 ms in tested simulations.
**Next:** Measure unavoidable transition change in gameplay before another grain mechanism.
Continuous-carrier trials retained depth but failed motion screening. [Research, measurements and limits](STEREO-CONSTRAINTS.md#motion-carrier).
[Audit and work queue](AUDIT.md). Foundation output stays near 2 MP; no image blending.

**Unknown:** First external engine target, supported hardware floor,
deployment/release destination, repository visibility and reviewer ownership.
`private: true` in the package manifest does not establish repository privacy.
