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

**Declared, project conversation, 2026-09-25:** Build a filter for any game/engine
supplying depth. Optional scene colors should resemble the source render; retain
generated colors and depth-derived edges as fallback. Demo: one level, five beacons;
no accounts, multiplayer, combat or external services.

Target: real-time Magic Eye that reads as solid, natural 3D while preserving source appearance.
Explore new synthesis, including static experiments; judge progress by usability,
not accumulated tools or modes. Preserve
restrained movement, ground collisions, stationary startup, explicit mouse capture,
Escape release, alignment guidance and pose-preserving diagnostic views.

**Declared preference:** Fine dots, maximum spacing and depth looked better.
Defaults: Fine / 120 display pixels / 50% depth, Bold contours, Auto quality.
**Acceptance priorities, human direction 2026-10-02:**

1. Pure foreground-near depth that visibly pops and holds fusion.
2. Fix screen-wide banding and kaleidoscopic replicas.
3. Essential edges, including dark ink, without weakening fusion.

Source color must preserve fusion. Recover a monochrome reference;
neutralization alone does not solve color preservation. Keep full-width output;
central strips remain human-rejected.

## Implemented capability

Demo/API/lab defaults preserve foreground-near ordering. Full-image Quiet remains
the demo style. Direction controls reach CPU/GPU, F3 and A/B;
legacy reversed preferences are corrected. Opt-in history reduces motion change;
camera-cut resets preserve allocations. Reversal preserves physical normals/contours.
Optional dark ink outlines both relief directions. Spacing extends to 180 pixels;
reset restores viewing defaults without moving the player or resetting beacons.
See [API](INTEGRATION.md) and [comparison evidence](OBSERVER.md#quiet-motion-comparison).

[Observer lab](OBSERVER.md) provides calibrated A/B/C replay, original-color references,
native PNG export, asset-free fixtures and rejection gates. F3 restores views;
tuning focus stops movement.
Controls: [README](../README.md#play).

## Evidence and limits

**Verified, 2026-10-02:** `npm run check` passed lint, 157 tests and build.
Windows, Node 22.22.3, npm 10.2.3; uncommitted `main`, no HEAD commit.
[Earlier depth correction](../evidence/depth-order-verification.json): independent foreground/background
reconstruction and 35/35 gameplay checks per backend. [Prior audit](../evidence/audit-ten-verification.json):
18 GPU fixtures, not rerun for this preference correction.
[Prior contour correction](../evidence/contour-verification.json)
reduced reversed-floor false contours, 5440→640 pixels.
[Ink comparisons](OBSERVER.md#ink-contours) preserve matched RGB and stationary output;
darker source colors remain a tradeoff. Human acceptance is pending.
Projected-lighting and fractional-depth candidates regressed and were removed.
Metrics do not establish comfort.

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

**Next:** [Foundations before adjustment loops](STEREO-CONSTRAINTS.md#foundations-and-recovery-direction).
User prefers original monochrome. Recover reference before color extensions;
prototypes remain rejected. Static audit: no application frame blending; fusion unresolved.

**Unknown:** First external engine target, supported hardware floor,
deployment/release destination, repository visibility and reviewer ownership.
`private: true` in the package manifest does not establish repository privacy.
