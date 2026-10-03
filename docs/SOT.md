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

The first attempt failed human acceptance and is preserved on `v0.5` at `2a1278b`;
development continues on `codex/v0.6`. Earlier human suggestions about art style,
color, ink, spacing and strength are hypotheses, not binding design requirements
or technical evidence. Preserve reported observations and measured failures;
reconsider mechanisms against papers and outcomes. Color and edges remain possible
extensions, never reasons to weaken fusion.

Demo scope remains one level and five beacons, without accounts, multiplayer,
combat or services. Preserve restrained movement, ground collisions, stationary
startup, explicit mouse capture, Escape release and pose-preserving views.

## Implemented capability

Demo/API/lab defaults preserve foreground-near ordering. Full-image Quiet remains
the legacy default. Direction controls reach CPU/GPU, F3 and A/B;
legacy reversed preferences are corrected. Opt-in history reduces motion change;
camera-cut resets preserve allocations. Reversal preserves physical normals/contours.
Optional dark ink outlines both relief directions. Spacing extends to 180 pixels;
reset restores viewing defaults without moving the player or resetting beacons.
See [API](INTEGRATION.md) and [comparison evidence](OBSERVER.md#quiet-motion-comparison).

[Observer lab](OBSERVER.md) provides calibrated A/B/C replay, original-color references,
native PNG export, asset-free fixtures and rejection gates. F3 restores views;
tuning focus stops movement.
Controls: [README](../README.md#play).

[Foundations](../tests/foundations.html) compares binary, white and spectral pink
textures on held frames, with optional motion and source/depth views. The same
depth-only CPU algorithm is selectable in the playable city. Scene color, ink,
reversal and image history cannot alter these modes. No default promotion or
human-fusion acceptance is implied. [Mechanism and limits](STEREO-CONSTRAINTS.md#v06-foundation-implementation).

## Evidence and limits

**Verified, 2026-10-02:** [Current checks](../evidence/foundation-verification.json): lint, 165 tests and build passed.
Windows, Node 22.22.3, npm 10.2.3; `codex/v0.6` changes based on `2a1278b`.
[Earlier depth](../evidence/depth-order-verification.json),
[contour](../evidence/contour-verification.json) and [ink](OBSERVER.md#ink-contours)
checks remain historical, not v0.6 acceptance. Projected-lighting and fractional-depth
candidates regressed and were removed. Metrics do not establish comfort.

**Human-reported, 2026-09-26:** Synthesis regressed across several modes; foreground
trees look cut into background. The harness remains valuable; clarity/color ambition
remains. Earlier [Quiet fusion](../README.md#remaining-limits) is not acceptance.
After reloading with the scheduling fix, external Firefox improved
from 10 fps/99 ms completion to 58–60 fps/13–30 ms. This is user confirmation, not an automated
Firefox benchmark. QA readbacks stop after checks. Reconstruction measures image evidence,
not human comfort; alternate matches can be inherent harmonic repetitions.
Mouse look is human-confirmed; the embedded host declined Pointer Lock.
**Correction:** Reversed settings encoded foreground behind background while looking
through the screen. Defaults/legacy preferences now preserve source ordering;
explicit reversal remains diagnostic. Human confirmation remains a release blocker.

## Active gaps and priorities

Preserve optional depth-only input and stereo readability. GPU input currently requires
canonical RG16 proximity and symmetric perspective projection. Its city adapter
handles static geometry and beacon visibility; general animated adapters and native
engine plugins remain future work. Off-center/jittered projections and lens
distortion are unsupported. Depth cannot identify semantic materials or recover
absent geometry. Full-width repeated-object bands and motion shimmer remain unresolved.

**Next:** Establish foundation fusion during gameplay before color extensions or
GPU promotion. Pink texture has numerical coverage, not human acceptance. The
foundation path is CPU-only and bounded to about 2 MP; general engine integration
and performance remain unfinished. No application frame blending was found.

**Unknown:** First external engine target, supported hardware floor,
deployment/release destination, repository visibility and reviewer ownership.
`private: true` in the package manifest does not establish repository privacy.
