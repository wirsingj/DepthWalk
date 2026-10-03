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

## Working locally

Use Node 22.13+ (22.x), 20.19+ (20.x), or 24+.
[package.json](../package.json) defines commands; the lockfile pins dependencies.
From repository root, `npm install` if needed:

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Vite; open the address printed in the terminal. |
| `npm run check` | Run ESLint, regressions and production build. |
| `npm run build` | Create the production `dist/` output. |
| `npm run preview` | Serve the built output for local inspection. |

ES modules and workers need HTTP serving; opening `index.html` directly is not the
launch procedure. Development/preview bind loopback; explicitly select another host
for LAN. No deployment script or release workflow is defined.
Do not treat a successful build as deployment. See [README](../README.md#launch).

## Verification and diagnosis

Filter changes need disparity, pixel matching, contrast, competing correlations,
hue locality, occlusion, stability, scaling and seam checks. Gameplay changes need
movement, collision and reachability checks.

Append `?verify` for [gameplay checks](../tests/browser-checks.js) on the selected
backend; use `?verify&renderer=cpu` for compatibility coverage.
`tests/gpu-checks.html` (also built for production) checks GPU correspondence, visibility, stability and
control scaling against the CPU. Capture outcomes, viewport, settings, revision
and environment. QA readback stops after gameplay checks; measure frame rate
afterward or on the normal page. Manually check fullscreen, resize and captured-mouse
release where Pointer Lock is permitted; key clearing does not prove capture.
Review human stereo perception separately from numerical correctness.

F3 inspects reconstruction and source-color error. Save JSON settings/metrics,
PNG native pixels. Escape cancels and restores view/focus.
[Observer lab](OBSERVER.md) compares motion, color conflicts, ink and propagation.
Use isolated objects before city A/B; C shows original colors, arrows step.
`node tests/fusion-research.js` checks CPU prototypes on three fixed scenes. Keep
controls/thresholds fixed; inspect worst frames and stationary captures.
Human rejection overrides metrics; harmonics cannot establish ghosts.

For low FPS, read the persistent backend badge. WebGPU completion latency includes
browser scheduling; Firefox's 100 ms idle poll can mimic slow GPU work. Keep bounded
submissions and the RAF completion workaround covered; see [README](../README.md#viewing-and-performance).

Follow [State](SOT.md) priorities; identify each change's product gap.
Distinguish performance optimization from perceptual progress. Keep experiments
outside defaults until numerical gates and human fusion checks pass.
Minimize tokens: reuse context, target reads, omit repeated logs;
report changes, evidence and blockers briefly. Evidence is historical;
documentation edits need inexpensive checks.

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

## YAIML maintenance

[Root AGENTS.md](../AGENTS.md) owns the shared maintenance guidance; this section
provides local procedures, not a recursive instruction include. [yaiml.yml](../yaiml.yml)
indexes the roles. Keep state, architecture and procedures in their indexed homes;
link detailed README/API material instead of copying it.

For a convention refresh, compare against a supplied or authorized workspace-local
reference; request one if absent. Preserve the discovery layout and unknown fields.
For compression, prune obsolete/repeated claims within the affected scope first,
preserving decisions, conflicts and governed records. Count complete documents
before/after against their headers and report growth or unresolved overages outside
memory. Do not add archives or runtime tooling for YAIML.

Concurrent writers need separate workspaces or coordinated file ownership;
re-reading is not a lock. Re-read changed files before edits. Reconcile memory with
the actual integration target and independent contributions, including clean merges.

The root instruction route is connected for Codex root/subdirectory discovery under
[official loading rules](https://learn.chatgpt.com/docs/agent-configuration/agents-md).
No other tool entry points were found. Fresh-session loading was not observed;
external overrides/settings remain outside this repository audit. New instruction
routes must explicitly direct agents to read and follow the shared root guidance.
