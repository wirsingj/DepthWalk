# App and tooling audit

Scope: game host, CPU/GPU boundaries, diagnostic workers, Observer Lab, development
commands and viewing workflow. This audit fixes engineering issues; it does not
accept the current stereo appearance. Repeated outlines, competing colors and
motion comfort remain open research problems.

The subsequent [ten-cycle review](../evidence/ten-cycle-review.json) covers input
validation, worker failures, restored Quiet preferences, rejected experiments and
Soft paired GPU integration. That historical run passed lint, 105 unit tests, production
build, 12 GPU fixtures, and 27 gameplay checks per backend. Two 100-frame GPU city
comparisons quantify improvements and remaining color conflict; see [Observer](OBSERVER.md).
This does not claim human fusion acceptance or completion of the novel synthesis goal.
Current verification belongs in [State](SOT.md); editing this audit does not rerun
its historical checks.

## Fixed findings

| Area | Finding and change |
| --- | --- |
| Color-spread analysis | Each changed pixel searched every edited pixel in its row and allocated temporary color arrays. Two directional distance passes now give the same result in linear time, without those allocations. |
| Preview memory | An eight-profile 1080p run retained 632.8 MiB of stereo images alone. A 128 MiB native-preview budget retains evenly spaced frames while every frame still contributes metrics. The UI/report disclose retained source indices. Inputs, diagnostic maps and GPU workspaces are additional. |
| Main-thread responsiveness | CPU lab encoding now runs in a worker. Temporal comparison streams adjacent outputs, avoiding two extra full-frame luminance allocations per transition. Repeated hold captures reuse their input buffers. |
| Idle GPU work | The reconstructed relief renders on frame, orbit or size changes; it no longer draws every animation frame while idle. The color-spread map is repainted only when the selected profile changes. |
| Readback cost/lifetime | Pixel-only GPU readback maps 50% fewer bytes for dense modes and 75% fewer for Paired, with identical pixels. Staging buffers are destroyed in `finally`; failed GPU initialization/frame submission releases owned resources and queue tokens. |
| Worker lifecycle | Diagnostic requests have IDs, cancellation, timeouts and error settlement. Retrying or closing analysis terminates old work; stale messages cannot complete a newer request. CPU renderer failure terminates its worker pool instead of admitting overlapping partial frames. |
| Viewing workflow | F3 uses a native modal dialog, releases mouse capture, pauses movement, confines keyboard focus and restores focus on close. Escape closes analysis. Reports reset before new work; failed/cancelled runs cannot present old JSON as current. |
| Control usability | Viewing controls scroll within shorter windows. Native A/B now supports frame stepping, alignment dots and a final hold instead of an abrupt loop. Fixed candidate gates expose failures independently of the exploratory frontier. Scrubbing or hiding the page pauses playback. |
| History lifecycle | CPU/GPU expose camera-cut resets without buffer reallocation. Diagnostic profiles reset history while retaining their workspaces. |
| Auto quality | Recovery previously required over 57 fps, which the deliberately capped CPU loop cannot deliver. The controller now uses its actual RAF/CPU ceiling, including 30 fps at 60 Hz and 40 fps at 120 Hz. Native/fixed quality stays fixed. |
| Validation | Invalid observer grids, excessive spacing and changing benchmark calibration fail early. Unaligned RGBA byte views work. Very short windows cannot dispatch zero-height stripes; GPU dimensions respect the axis cap. A color-spread warning cannot coexist with a “no flags” result. |
| Maintenance | ESLint checks unused values, invalid references and other recommended rules, plus the portable filter's engine/DOM boundary. `.editorconfig` records basic whitespace conventions. `npm run check` runs lint, tests and build. Development/preview default to loopback. |

No stereo matching equations, palettes, visual defaults or acceptance thresholds
were tuned during this audit. The legacy decoder is unchanged. Observer 1.1 updates
validation, processing/lifecycle and flag composition; the eight synthetic profiles'
depth accuracy, observer summaries, temporal metrics and color-spread summaries are
identical to the saved observer baseline.

## Verification

See [machine-readable audit evidence](../evidence/audit-verification.json) for source
fingerprint, environment, individual reports and scope. The final check passed
**101 tests, lint and production build**. Dependency audit reported **zero known
advisories** for the resolved lockfile.

- Gameplay: **27/27 checks on both CPU and WebGPU**, at 1280×720.
- GPU fixtures: **11/11**, including native pixel-only readback equivalence,
  occlusion, current-depth correspondence, CPU parity and stationary stability.
- Observer: full CPU synthetic comparison, a 40-frame CPU browser run, and an
  80-frame native 1920×1080 WebGPU run. The full native run retained 126.6 MiB of
  stereo previews rather than 632.8 MiB. Negative controls remain present.
- UI: cancel/restart, sampled-frame labels, selection/playback/scrubbing, keyboard
  probes, idle draw count, F3 capture/retry/close/reopen, Tab focus and Escape return.
  Fullscreen entered at 2560×1440 and returned to 1280×720 without changing pose.
- Isolated 1080p color-spread stress fixture: **1,020–2,290 ms before**, **21–34 ms
  after**, four samples per revision, identical output summary. These are local
  diagnostic timings, not a game FPS benchmark or a cross-device speed guarantee.

The embedded browser declined Pointer Lock. The user previously confirmed mouse
look externally; this audit does not supply fresh captured-mouse coverage. Worker
crashes, cancellation and timeout behavior have simulated regression coverage;
physical device-loss/OOM recovery was source-reviewed, not fault-injected. Current
Firefox performance remains the user's earlier 58–60 fps observation, not a fresh
automated Firefox measurement. Human fusion and comfort are still unmeasured by
the engineering observer.

## Maintaining the improvements

Run `npm run check` before accepting changes. Use the lower-resolution lab setting
when inspecting every recorded frame; large sweeps intentionally sample previews.
Keep the negative controls and thresholds fixed while changing renderers. Preserve
the bounded queue and Firefox completion workaround. Capture interactive performance
on the normal game page, without diagnostic readback.

The Node floor matches the installed [ESLint requirements](https://eslint.org/docs/latest/use/getting-started):
20.19+ in 20.x, 22.13+ in 22.x, or 24+. Existing compact source formatting remains
in much of the prototype; this audit avoids a repository-wide reformat.
