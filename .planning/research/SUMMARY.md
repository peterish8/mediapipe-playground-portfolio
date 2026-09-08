# Project Research Summary

**Project:** MediaPipe Playground
**Domain:** Client-side, zero-server, multi-page WASM/WebGPU creative-AI showcase site (5 independent MediaPipe Tasks demos + hub)
**Researched:** 2026-07-27
**Confidence:** HIGH

## Executive Summary

MediaPipe Playground is a portfolio-grade showcase, not a production SaaS: a Vite multi-page app where five standalone demo pages each load a real MediaPipe Task (four vision tasks — hand, gesture, face, segmentation — plus one GenAI LLM task) entirely client-side, and each hands the visitor a real downloadable artifact. Experts building this class of site (Google's own `mediapipe-samples-web`, TensorFlow.js demos hub, Chrome Experiments) converge on the same shape: real page navigations instead of an SPA router (so the browser's own page-lifecycle frees WASM/camera resources between demos), self-hosted WASM runtimes rather than CDN-loaded ones, a `requestAnimationFrame`-driven detection loop with a monotonic timestamp counter, and one consistent "permission → loading → ready → error" state machine reused across every demo rather than five bespoke UIs.

The single most important correction from research to PROJECT.md's original assumptions: the blanket "WebGPU optional, WASM/XNNPACK fallback everywhere" constraint is true for the four `tasks-vision` demos but **false** for the GenAI chat demo — `LlmInference` hard-requires WebGPU with no CPU path at all, and the official docs now carry a maintenance-only banner recommending migration to LiteRT-LM. This means the chat demo needs its own capability-check logic and its own re-verification step at the start of its phase, not a shared "unsupported browser" message reused from the vision demos. Equally important architecturally: because five demos share nearly identical failure modes (permission handling, model-download progress, backend/capability badging, recording/download, WASM lifecycle cleanup), the biggest risk to the roadmap is building each demo's plumbing bespoke and drifting — research strongly recommends a dedicated Shared Infrastructure phase before any demo work begins, after which the five demo phases become mutually independent and parallelizable.

The main execution risks are all concentrated in a handful of well-documented, avoidable pitfalls: `Date.now()` instead of `performance.now()`/a monotonic counter for `detectForVideo` timestamps (causes an unrecoverable crash requiring task-instance recreation); never calling `.close()` on task instances (WASM heap leaks invisible to normal JS memory tooling); a hardcoded `MediaRecorder` `mimeType` that throws on Safari; wrong stop/teardown ordering that truncates recordings; and the `ImageSegmenter` mask-readback cost (~80-100ms) blowing the frame budget in Green Screen specifically. All five are known, documented, and preventable with shared helpers built once — none require novel R&D, they require discipline in the Shared Infrastructure phase.

## Key Findings

### Recommended Stack

Core stack is Vite (multi-page, native `rollupOptions.input`), `@mediapipe/tasks-vision` (Hand/Gesture/Face/Segmenter — one package, four demos), `@mediapipe/tasks-genai` (LlmInference — independently versioned from tasks-vision, don't assume parity), Tone.js (synth engine + audio mixing), and Tailwind v4 via `@tailwindcss/vite`. The decisive stack correction from the original PROJECT.md ground truth: **self-host the MediaPipe WASM bundles via a `copy-wasm.js` build script** (copying `node_modules/@mediapipe/*/wasm` into `public/wasm/` and pointing `FilesetResolver` at the local path) rather than loading them from jsDelivr CDN at runtime. This is not a minor alternative — it's what Google's own current official samples repo does, it's required to reliably engage the threaded/SIMD WASM variant (needs `crossOriginIsolated`), and it removes a third-party CDN uptime dependency from a "zero-server, self-contained" project. Supporting choices: `fix-webm-duration` (Chromium's `MediaRecorder` reliably omits duration metadata — not a hypothetical edge case), manual `fetch()` + `ReadableStream` + Cache API for LLM model download progress/caching (no library exposes this), and `vite-plugin-pwa` for the small vision-model assets only (never route the multi-hundred-MB-to-multi-GB LLM downloads through Workbox runtime caching — it has no progress callback).

**Core technologies:**
- Vite ^8.1.5 — multi-page build tool — native multi-entry HTML support, matches Google's own reference repo's pinned major version
- @mediapipe/tasks-vision ^0.10.35 — HandLandmarker/GestureRecognizer/FaceLandmarker/ImageSegmenter — one package covers 4 of 5 demos, verified current
- @mediapipe/tasks-genai ^0.10.29 — LlmInference — separate WASM bundle and separate FilesetResolver from tasks-vision; never share a resolver instance
- Tone.js ^15.1.22 — synth voices/effects/audio routing — abstracts Web Audio graph wiring, built-in `createMediaStreamDestination()` for mixing synth+mic
- Tailwind CSS v4 (`@tailwindcss/vite`) — utility CSS via proper PostCSS/Vite-native build, satisfies "no CDN play-script" constraint

**Critical build-time requirements** (must be in `vite.config.js` from day one): `worker: { format: 'es' }` (MediaPipe's WASM loader spins up a worker; default output format conflicts), `optimizeDeps.exclude: ['@mediapipe/tasks-vision', '@mediapipe/tasks-genai']` (esbuild pre-bundling breaks wasm/worker file paths in dev), and a `copy-wasm.js` script wired to `predev`/`prebuild` npm hooks.

### Expected Features

The five demo-specific core loops are already locked in PROJECT.md. The research contribution is identifying that four cross-cutting concerns are shared by all five demos and must be built once, plus a firm set of anti-features to actively avoid.

**Must have (table stakes):**
- Explicit "enable camera/mic" gate before requesting permission (never fire `getUserMedia` unexplained on load)
- Distinct error states for denied / no-device / dismissed / unsupported (not one generic error)
- Byte-based model download progress indicator (percent, not a spinner) — no library provides this natively, must be hand-built
- Backend/delegate badge (WebGPU vs WASM/CPU) — but must reflect actual runtime outcome, not just the requested delegate (see Pitfalls)
- Graceful unsupported-browser screen, feature-detected at load, not a crash
- Out-of-memory / model-load-failure recovery path (`device.lost`, WASM heap OOM)
- Recording workflow: countdown → recording indicator/timer → stop → preview → download/retake (never silent auto-download)
- On-screen gesture legend and live tracking-confidence feedback (binary/traffic-light, not raw numeric confidence)
- Hub page with one card per demo; model-size tier picker for chat (locked in PROJECT.md)

**Should have (competitive differentiators):**
- "100% on-device, nothing uploaded" trust badge — cheap, high-credibility given the project's actual architecture
- One unified "Result" screen shape (preview + download + retry) reused across all 5 demos rather than 5 different download UIs
- Gesture-driven instrument/filter switching as the primary interaction (dropdown as an accessibility fallback, not the main path)
- Sing-along mixed mic+synth recording (already locked; flagged as needing its own careful phase attention for audio mixing/gain staging)

**Defer (v2+):**
- Countdown-before-recording can ship after the base recorder flow is proven (still P1 per the reconciliation note below — see Roadmap Implications)
- In-memory (non-persisted) session gallery of multiple takes
- `?debug=1`-gated developer settings panel (confidence thresholds, resolution) — explicitly an anti-feature for a portfolio site
- Any cross-session persistence — explicitly out of scope per PROJECT.md

**Anti-features to actively avoid:** chasing full cross-browser/polyfill support (this is a "wow on Chrome/Edge desktop, degrade gracefully elsewhere" site, not a universal-support site), exposing raw model tunables or numeric confidence scores, calibration steps (MediaPipe models are zero-shot by design), and per-demo bespoke UI chrome for shared failure modes.

### Architecture Approach

This is an MPA where each demo is a real page navigation — the single architectural decision that eliminates an entire category of cross-page cleanup problems for free (browser reclaims WASM heap and camera streams automatically on navigation). The only thing shared across pages is source code (via `src/shared/` ES modules that Vite/Rollup automatically splits into shared chunks), never runtime state. Two runtime families exist in parallel and must not be conflated: the vision FilesetResolver (`forVisionTasks`) and the GenAI FilesetResolver (`forGenAiTasks`) are different WASM bundles with different capability floors.

**Major components:**
1. `shared/camera.js` — getUserMedia + permission lifecycle, single `startCamera()`/`stopCamera()` pair
2. `shared/task-loader.js` — wraps both FilesetResolver paths + `createFromOptions`, manual byte-progress fetch, Cache API — vision and GenAI paths kept structurally separate, never sharing a resolver instance
3. `shared/detection-loop.js` — generic rAF runner with frame-skip guard + monotonic `performance.now()` timestamp counter, used identically by all 4 vision demos
4. `shared/recorder.js` + `shared/download.js` — `pickSupportedMimeType()` cascade, correct stop→flush→teardown→download→revoke ordering, blob/dataURL download trigger
5. `shared/backend.js` + `shared/ui/status.js` — capability/backend badge and one "idle → permission → loading → ready → running → error" state machine reused across all 5 pages, with a distinct stricter check for GenAI

### Critical Pitfalls

1. **GenAI `LlmInference` has no CPU/WASM fallback (hard-requires WebGPU)** — a shared "WebGPU optional, else WASM" capability-check utility built for the vision demos will be actively wrong for chat. Build `checkGenAiCapability()` as a distinct, stricter gate (`navigator.gpu` + successful `requestAdapter()` + adequate `maxStorageBufferBindingSize`) that blocks *before* the multi-hundred-MB download starts, not after.
2. **`Date.now()` (or any non-monotonic timestamp) passed to `detectForVideo`/`segmentForVideo`** — causes an unrecoverable "timestamp mismatch" error with no soft reset; only fix is destroying and recreating the task instance. Prevent with one shared `performance.now()`-based counter, reset to 0 on every task-instance recreation.
3. **Never calling `.close()` on task instances / `MPMask` results** — WASM heap leaks invisible to normal JS DevTools memory tooling; surfaces only after realistic repeated hub→demo→hub navigation, not first-load testing. Build a mandatory close-on-teardown lifecycle helper plus a `pagehide` safety net.
4. **Hardcoded `MediaRecorder` mimeType** — throws synchronously on Safari versions without WebM support, breaking the "download something real" core value on that browser. Build one shared `pickSupportedMimeType()` cascade with a no-options fallback.
5. **Wrong stop/cleanup ordering (tracks stopped before recorder, or Blob assembled before `onstop` fires)** — produces truncated/corrupted recordings intermittently. Codify the correct order (`recorder.stop()` → wait for `onstop` → stop tracks → assemble Blob → download → delayed `revokeObjectURL`) in one shared `recordAndDownload()` helper.
6. **`ImageSegmenter.getAsFloat32Array()` costing ~80-100ms per call** — 2.5-6x a 30fps frame budget on its own; caps Green Screen at 10-12fps if called naively every frame. Must be throttled/interpolated from the start of that demo's phase, not optimized after the fact.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Shared Infrastructure
**Rationale:** All five demos share nearly identical failure modes (permission, model loading, recording/download, backend badge, WASM lifecycle) and two of the research reports (STACK, ARCHITECTURE) independently converge on the same component boundaries. Building this first — rather than extracting it after the first one-off demo — is the single highest-leverage roadmap decision: every pitfall rated "Shared Infrastructure phase" in PITFALLS.md (timestamp monotonicity, task-instance leaks, mimeType cascade, recording stop-order, Vite WASM/CORS config) gets fixed once here instead of five times downstream.
**Delivers:** Vite MPA scaffold (hub `index.html` + 5 demo entry folders), `vite.config.js` with `worker:{format:'es'}` + `optimizeDeps.exclude` for both `@mediapipe` packages, `copy-wasm.js` self-hosting the vision + GenAI WASM bundles into `public/wasm/` (verified via a full `build && preview` cycle, not just `npm run dev`), and the shared module set: camera/mic helper, dual FilesetResolver-based task loader (vision + GenAI paths structurally separate, never sharing a resolver instance), `recordAndDownload()` (correct stop/teardown order + `pickSupportedMimeType()` + `fix-webm-duration`), backend/capability badge (with the GenAI-specific stricter capability check as a distinct function, not a variant of the vision check), video-timestamp-counter helper (`performance.now()`, reset per task-instance), and the task-instance lifecycle/`.close()` helper with a `pagehide` safety net.
**Addresses:** Shared Permission Gate, Shared Model-Loading progress overlay, Shared Backend indicator, Shared Error Boundary, Shared Recorder+Preview+Download flow, Hub/landing page (all rated P1 in FEATURES.md)
**Avoids:** Pitfalls 3, 4, 7, 8, 12 (timestamp monotonicity, task-instance/MPMask leaks, mimeType cascade, recording stop-order corruption, Vite WASM dev-vs-build/CORS divergence) — all explicitly mapped to this phase in PITFALLS.md

### Phase 2: Air Canvas (Pinch-to-Draw)
**Rationale:** Simplest of the five vision demos — HandLandmarker only, no audio mixing, no recording (PNG snapshot export instead of `MediaRecorder`), no segmentation-cost budget concerns. Building this first validates the entire shared-infrastructure pattern end-to-end (camera gate → task loader → detection loop → canvas overlay → download) on the lowest-risk demo before compounding complexity elsewhere.
**Delivers:** Working pinch-gesture drawing demo with color switching and PNG download; first real-world exercise of `shared/camera.js`, `task-loader.js`, `detection-loop.js`, and `shared/download.js`.
**Uses:** `@mediapipe/tasks-vision` HandLandmarker, `shared/canvas-utils.js` (mirror flip, resize-to-video)
**Implements:** rAF-Gated Detection Loop pattern, on-screen gesture legend, live tracking-confidence feedback

### Phase 3: Gesture Synth Instrument
**Rationale:** Moderate risk — adds GestureRecognizer (same task family as Air Canvas's HandLandmarker, low incremental vision risk) but introduces the project's only audio-mixing complexity: Tone.js voice management, gesture-debounced instrument switching, and merging synth output + mic into one recorded file via `createMediaStreamDestination()`. This demo owns pitfalls that are genuinely unique to it (audio+audio stream mixing, `Tone.start()` user-gesture requirement, click/glitch prevention on rapid gesture-driven voice switching) and should not block the simpler vision demos.
**Delivers:** Gesture-controlled synth with switchable instrument voices, mic sing-along, and a downloaded mixed audio recording using the shared `recordAndDownload()` flow (video+mic pattern from Shared Infra; audio+audio mixing logic is demo-specific).
**Uses:** Tone.js, GestureRecognizer, shared recorder/download helpers
**Implements:** Countdown → recording indicator/timer → stop → preview → download/retake recording workflow (first phase to exercise the full recording UX, not just a snapshot)

### Phase 4: Magic Mirror (Face Filters)
**Rationale:** Similar moderate risk tier to Gesture Synth but a different vision task (FaceLandmarker, 478 landmarks + 52 blendshapes) with procedural canvas-drawn filters (no image assets, per constraint) and optional short video recording. No audio-mixing complexity, so it's a slightly gentler build than Gesture Synth despite being grouped at the same risk tier.
**Delivers:** Real-time AR face filter overlay with switchable filters, snapshot and short-recording download, using the same recording workflow established in Phase 3.
**Uses:** FaceLandmarker + blendshapes, shared recorder/download/canvas-overlay helpers
**Implements:** Gesture- or UI-driven filter switching (differentiator from FEATURES.md), live tracking-confidence feedback

### Phase 5: Green Screen Studio
**Rationale:** Highest-risk of the four vision demos — ImageSegmenter's mask readback (`getAsFloat32Array()`) costs ~80-100ms per call, 2.5-6x a 30fps frame budget, and is the one demo where a naive per-frame implementation will visibly cap FPS at 10-12 and look broken rather than "creative and real-time." It also has documented cross-platform correctness risk (iOS Safari GPU delegate producing wrong segmentation masks silently). Sequencing this last among the vision demos means the throttled-readback pattern and backend-badge "actual vs requested delegate" distinction are built with the most shared-infrastructure maturity already in place.
**Delivers:** Live background replacement/blur with recorded video download, throttled mask readback (every 2nd/3rd frame with interpolation) tuned to a realistic target frame rate communicated honestly in the UI.
**Uses:** ImageSegmenter, shared recorder/download/canvas-overlay helpers
**Implements:** Backend/delegate indicator reflecting actual (not just requested) delegate outcome — first phase where this distinction is load-bearing, per Pitfall 5

### Phase 6: AI Chat (MediaPipe GenAI LLM)
**Rationale:** Architecturally the outlier — a different runtime family entirely (GenAI FilesetResolver, not vision), no camera/mic, no `detectForVideo` loop, and the only demo with a hard WebGPU requirement and no CPU fallback. It also needs its own re-verification step at phase start (see Research Flags) because the underlying API's lifecycle status (maintenance-only banner, recommended migration to LiteRT-LM) can have shifted since planning-time research. Building this last means the shared infrastructure has been proven across 4 demos first, and any GenAI-specific capability-check logic can be added as a clean extension rather than a mid-stream retrofit.
**Delivers:** Streaming local-LLM chat with small/medium/large model-size tier picker, byte-based download progress + Cache API caching, and a GenAI-specific capability gate that blocks *before* download starts on non-WebGPU browsers with an explicit "requires WebGPU-capable Chromium browser" message (not the generic vision-demo "unsupported browser" message).
**Uses:** `@mediapipe/tasks-genai` LlmInference, manual fetch/stream/Cache API pattern (same as proven in the project's earlier LiteRT-LM prototype)
**Implements:** `checkGenAiCapability()` as a structurally separate function from the vision demos' capability check; LLM adapter module (`llmEngine.js`) with a narrow interface so a future swap to LiteRT-LM is a contained change

### Phase Ordering Rationale

- **Shared Infrastructure must precede all demo work** — this is the strongest, most repeated signal across all four research reports (FEATURES.md explicitly names it "the strongest signal for the roadmap"; PITFALLS.md maps the majority of critical pitfalls to this phase; ARCHITECTURE.md and STACK.md both specify the same component boundaries independently).
- **Once Shared Infrastructure exists, Phases 2-5 (the four vision demos) have no cross-demo dependencies and can be planned/built in parallel** if desired — the suggested Air Canvas → Gesture Synth/Magic Mirror → Green Screen sequencing above reflects *risk-based build order*, not a hard dependency chain. A team or timeline that wants to parallelize after Phase 1 can do so safely.
- **Chat (Phase 6) is architecturally isolated from the four vision demos** (different WASM bundle, different capability floor, no camera loop) and can technically also run in parallel with the vision demos once Shared Infrastructure lands — it's sequenced last here primarily because of its re-verification requirement (Research Flag below) and its stricter, distinct capability-gate logic, not because it structurally depends on the other four.
- **Green Screen is deliberately the last vision demo** because it carries the tightest per-frame performance budget and the only documented cross-platform correctness bug (iOS Safari GPU delegate) among the four vision tasks — sequencing it after the pattern is proven on three simpler demos reduces the chance of conflating a shared-infra bug with a segmentation-specific one during debugging.
- **This order directly avoids the single biggest architectural risk named in PITFALLS.md and FEATURES.md**: building 5 demos' plumbing bespoke and only discovering the shared-shape after the fact (Anti-Pattern in ARCHITECTURE.md; explicit anti-feature "uniform, from-scratch UI chrome custom-built per demo" in FEATURES.md).

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 6 (AI Chat):** Must re-verify at phase start (not trust planning-time research) — the official `LlmInference` docs currently show a maintenance-only banner recommending migration to LiteRT-LM, and model file extensions/paths on the `litert-community` HF org may have shifted (`.litertlm` vs. `.task`). Also verify each candidate model tier is publicly/anonymously fetchable (not gated) before committing to the UI, since a gated HF repo has no server-side workaround in a zero-backend app.
- **Phase 5 (Green Screen Studio):** Needs a build-time performance spike to measure actual achieved FPS with the throttled-readback pattern before committing to a specific target frame rate in the UI copy, and needs explicit iOS Safari QA for the known GPU-delegate-produces-wrong-masks issue.
- **Phase 3 (Gesture Synth Instrument):** The audio+audio mixing (Tone.js + mic into one MediaRecorder-compatible stream) is a genuinely novel integration point not covered by the other four demos' patterns — worth a small implementation spike before full build-out.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Shared Infrastructure):** All component boundaries and known pitfalls are already fully documented across STACK.md, ARCHITECTURE.md, and PITFALLS.md with HIGH-confidence official sources (Google's own reference repo, MDN, Chrome DevRel) — implementation-ready without further research.
- **Phase 2 (Air Canvas):** HandLandmarker + pinch-to-draw is the best-documented, lowest-risk vision pattern in the research (official Google guide + community air-canvas prior art both converge).
- **Phase 4 (Magic Mirror):** FaceLandmarker + procedural canvas filters follows the same well-documented detection-loop pattern as Air Canvas with no novel integration risk.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Core Vite/MediaPipe config verified directly against Google's own current official samples repo, live npm registry, and a GitHub issue thread confirming no stable WASM-bundling API exists (self-hosting is the accepted workaround). Tailwind v4/Vite 8 versions are MEDIUM (fast-moving, community-sourced) but do not affect architectural decisions. |
| Features | MEDIUM-HIGH | Cross-verified across Google's own MediaPipe samples site, TensorFlow.js demos hub, Chrome Experiments, and MDN/Chrome DevRel docs on the relevant browser APIs; the gesture-UX research draws partly on a peer-reviewed ACM survey plus one low-star community air-canvas repo used only for corroboration, not as a primary source. |
| Architecture | HIGH (core patterns) / MEDIUM (folder conventions) | MediaPipe task lifecycle, MediaRecorder/canvas APIs, and Vite multi-page config are all confirmed against official docs and Google's own reference repo. The specific `src/shared/` folder layout is synthesized best practice — no single canonical "vanilla JS MPA" standard exists, so exact file boundaries may shift slightly during implementation without invalidating the underlying component responsibilities. |
| Pitfalls | HIGH | Verified directly against official Google AI Edge docs (including a live-scraped maintenance-only banner dated 2026-06-12), MDN, WebKit's own blog, and numerous primary-source GitHub issues on the `google-ai-edge/mediapipe` repo. Cross-browser codec/support specifics are MEDIUM (community-sourced but converge consistently with official sources). |

**Overall confidence:** HIGH

### Gaps to Address

- **GenAI API lifecycle status is a moving target:** the maintenance-only banner and LiteRT-LM recommendation were current as of this research session but could change again before the Chat demo phase begins — re-check both `developers.google.com/edge/mediapipe/solutions/genai/llm_inference/web_js` and the LiteRT-LM JS docs at that phase's start, not just once during initial planning. Handle via the adapter-module isolation pattern (`llmEngine.js`) already recommended so a swap stays localized.
- **GPU delegate "actual vs. requested" has no first-class API to query:** there is no synchronous "delegate confirmed" callback exposed by MediaPipe's web runtime in all cases; the recommended heuristic (comparing measured frame times against known GPU/CPU benchmarks) is an approximation, not a guarantee. Treat the backend badge as best-effort and revisit if a more reliable signal ships upstream.
- **Exact `src/shared/` file boundaries are a synthesized recommendation, not a single canonical standard** — expect minor refactoring of module boundaries during Phase 1 implementation as real usage patterns across the 5 demos clarify what's truly shared vs. demo-specific.
- **HF model repo gating status can change over time** ("public today" is not a permanent guarantee) — the recommended mitigation (verify via unauthenticated fetch at implementation time, not just by browsing the HF web UI) should be repeated as a smoke test whenever the Chat demo phase begins, and again if the site is revisited later.

## Sources

### Primary (HIGH confidence)
- `github.com/google-ai-edge/mediapipe-samples-web` — package.json, vite.config.ts, copy-wasm.js, src/ folder structure (Google's own current official reference implementation)
- `developers.google.com/edge/mediapipe/solutions/genai/llm_inference/web_js` (last updated 2026-06-12) — maintenance-only banner, WebGPU-mandatory requirement, `.litertlm` file naming
- `developers.google.com/edge/mediapipe/solutions/vision/{hand_landmarker,face_landmarker,gesture_recognizer,image_segmenter}/web_js` — official task API guides
- `developers.google.com/edge/api/mediapipe/js/tasks-vision` — `MPMask.close()` requirement
- `google-ai-edge/mediapipe` GitHub issues #5961, #5743, #6169, #6193, #5626, #6142, #6296, #4711, #4491, #5562 — primary-source bug reports confirming timestamp monotonicity, task lifecycle, GPU delegate, and mask-readback-cost behaviors
- npm registry live version checks (vite, @mediapipe/tasks-vision, @mediapipe/tasks-genai, tone, tailwindcss, vite-plugin-pwa, fix-webm-duration, coi-serviceworker)
- MDN — `MediaDevices.getUserMedia()`, `MediaRecorder`, `MediaStream_Recording_API`, `GPUOutOfMemoryError`
- `vite.dev/guide/build`, `vite.dev/guide/assets` — official Vite multi-page and static asset handling docs
- `web.dev/articles/cross-origin-isolation-guide`, `web.dev/articles/coop-coep` — COOP/COEP requirements
- WebKit blog — Safari 18.4 WebM/Ogg MediaRecorder support
- Chrome Developers blog — `captureStream()` from canvas/video/audio elements; WebGPU troubleshooting guide
- Hugging Face docs — gated models mechanism
- Project's own `.planning/PROJECT.md` — verified API surfaces treated as ground truth (with corrections noted above)

### Secondary (MEDIUM confidence)
- Tailwind CSS v4 migration articles (digitalapplied.com, eastondev.com, dev.to) — cross-referenced against each other and live npm versions
- `toji.dev` WebGPU Device Loss best practices (Chrome team member community reference)
- addpipe.com getUserMedia error documentation, cross-checked against MDN
- sitepoint.com / maddevs.io — in-browser LLM download-progress UX conventions (WebLLM/MLC `initProgressCallback` pattern)
- Tone.js GitHub issues #341, #443 — AudioContext user-gesture requirement
- Stack Overflow — canvas+mic MediaStream track-merging pattern (verified against MDN `MediaStream.addTrack()`)

### Tertiary (LOW confidence)
- `AppajiDheeraj/Air-Canvas` community repo (Python/OpenCV, 2 stars) — used only to corroborate the gesture-legend convention, not as a primary architectural source
- WebKit Bugzilla #215884 — iOS Safari PWA camera-permission-revocation community reports

---
*Research completed: 2026-07-27*
*Ready for roadmap: yes*
