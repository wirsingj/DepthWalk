---
role: maintainer-guide
purpose: Setup, checks, diagnostics, change-sensitive areas and local memory maintenance.
not-here: Product direction, durable architecture, complete history or duplicated API detail.
durability: Keep executable procedures current; remove obsolete operational advice.
budget: Target at most 750 whitespace-delimited words, including this header.
update-when: Commands, verification routes, recovery needs or instruction entry points change.
read-with: SOT.md; ARCHITECTURE.md; INTEGRATION.md.
agent-guidance: Check scripts before executing; report unrun procedures and preserve evidence scope and human authority.
---

# Maintainer guide

On 2026-10-17, Windows/Node 22.22.3 passed `npm run check` (lint, regressions, build). This does not revalidate human stereo perception, GPU browser behavior or deployment.

## Working locally

Use Node 22.13+ (22.x), 20.19+ (20.x), or 24+.
[package.json](../package.json) defines commands; the lockfile pins dependencies.
From repository root, `npm install` if needed:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Serve current source on fixed port 5174; hot reload. |
| `npm run check` | Run ESLint, regressions and production build. |
| `npm run build` | Create the production `dist/` output. |
| `npm run preview` | Serve last build on fixed port 4173; no hot reload. |

ES modules/workers require HTTP. Both servers bind loopback and reject occupied
ports. Preview requires rebuilding. No deployment workflow is defined.
[Launch](../README.md#launch).

## Verification and diagnosis

Filter changes need disparity, pixel matching, contrast, competing correlations,
hue locality, occlusion, stability, scaling and seam checks. Gameplay changes need
movement, collision and reachability checks.

Use `?verify` for [gameplay checks](../tests/browser-checks.js); add `&renderer=cpu`
for compatibility. `?verify=tiny-step&quality=1` measures small steps;
`?verify=motion-mechanism&quality=1` measures prescribed city transitions and assignment.
`tests/gpu-checks.html` checks GPU correspondence, visibility,
stability and scaling against CPU. `?verify=runtime&quality=1` checks idle/wake-up
and GPU/worker recovery. `?verify=startup&quality=1` checks preparation and recovery;
also test with `&renderer=cpu`. Both inject faults: use a separate tab.
Record outcomes, viewport, settings, revision
and environment. QA readback stops afterward; measure performance on normal gameplay.
Manually check fullscreen, resize and captured-mouse
release where Pointer Lock is permitted; key clearing does not prove capture.
Review human stereo perception separately from numerical correctness.

F3 inspects reconstruction and source-color error. Save JSON settings/metrics,
PNG native pixels. Escape cancels and restores view/focus.
[Observer lab](OBSERVER.md) compares motion, color conflicts, ink and propagation.
Use isolated objects before city A/B; C shows original colors, arrows step.
`node tests/fusion-research.js` checks CPU prototypes on three fixed scenes. Keep
controls/thresholds fixed; inspect worst frames and stationary captures.
Human rejection overrides metrics; harmonics cannot establish ghosts.
Offline: `node tests/foundation-{luminance,temporal,mechanism,assignment}-research.js`
(run each expanded filename), and `node tests/fractional-phase-research.js`.
These measure mechanisms, not comfort.

For low FPS, read the persistent backend badge. WebGPU completion latency includes
browser scheduling; Firefox's 100 ms idle poll can mimic slow GPU work. Keep bounded
submissions and the RAF completion workaround covered; see [README](../README.md#viewing-and-performance).

Follow [State](SOT.md); distinguish performance from perceptual progress.
Research audit–fix–audit: read [the paper](RESEARCH-PAPER.md) before changes; after checks,
reconcile changed claims, citations and limitations. Preserve evidence dates/revisions,
pre-release status and unchanged sections. Promotion requires numerical and human checks.

## Change-sensitive boundaries and recovery

Review CPU modules, `gpu/stereogram.wgsl`, adapters and scheduling together when
depth conventions or buffers change. Consult [the API contract](INTEGRATION.md)
before changing output reuse, halos, GPU formats or device lifetime. Keep generated
`dist/` and vendor `node_modules/` out of source edits. Reload after a lost graphics
context or worker startup error, as the UI directs; rebuilding generated output
does not justify resetting source or uncommitted work.

No repository-specific branch protection, reviewer, sharing or retention policy was
found at initialization. Preserve independent changes and obtain missing authority
before consequential integration/publication decisions. Do not infer permission
from a memory label or `private: true`. Leave licensing unchanged.

## YAIML Maintenance

Read and follow [Using YAIML](../.yaiml/YAIML_GUIDE.md) and the [skill catalog](../.yaiml/skills/INDEX.md) for ordinary context/maintenance and requested workflows, including Git actions. Preserve local facts, authority, budgets, privacy, retention and discovery layout.

Source: [YAIML](https://github.com/wirsingj/YAIML), published revision `89c883d9a66dffc3b8671d975f7fa6c46535d676`. The 27-resource bundle SHA-256 is `3958b3c802cef951147d316c41a48e0aa7ad6c2aa72c84954c3cac003c169e07` (sorted package-relative paths, NUL, Git blob bytes; CRLF/LF differences verified). The pre-upgrade baseline was unavailable; local guidance remains preserved.

The [notice](../.yaiml/YAIML_NOTICE.md) covers copied resources, permits commercial/client use with credit and preserves earlier grants; the application license is unchanged. Refresh from the recorded or an authorized newer source. No startup polling or automatic backlog work. Resource/link/native-entry and ShepAIrd discovery checks passed on 2026-10-17. Fresh-session activation remains untested here; current checks are recorded in this guide. Repeat reconciliation must leave healthy files unchanged.

Root instructions apply in subdirectories; future host routes must read/follow that shared owner. External overrides/settings and fresh-session loading remain unverified. Do not add archives or runtime tooling for YAIML.
