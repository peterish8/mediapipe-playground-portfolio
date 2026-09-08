# Feature Research

**Domain:** Browser-based, zero-server creative-coding / computer-vision + on-device AI showcase site (multi-demo portfolio, not a single production app)
**Researched:** 2026-07-27
**Confidence:** MEDIUM-HIGH (patterns cross-verified across Google's own official MediaPipe samples site, TensorFlow.js demos hub, Chrome Experiments/Experiments with Google, MDN/Chrome DevRel docs on getUserMedia/MediaRecorder/WebGPU, and multiple independent air-canvas/gesture-app implementations. LOW-confidence items are flagged inline.)

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = the showcase feels broken or amateurish, not just "simple."

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Explicit "enable camera/mic" gate before requesting permission | Every reputable webcam demo (MDN's own MediaRecorder examples, addpipe.com demo) shows a "click to start" affordance rather than firing `getUserMedia()` on page load. Browsers only show the permission dialog once per origin decision, so an unexplained pop-up on load reads as spammy and burns the user's one shot at a clean prompt. | LOW | Single shared component: a "Start Camera" button/card that explains *why* (e.g. "This demo needs your webcam to track your hands — nothing leaves your device") before the native prompt fires. |
| Distinct error states for denied vs. no-device vs. dismissed vs. unsupported | Real-world `getUserMedia()` errors are inconsistent across browsers (`NotAllowedError`, `NotFoundError`, `NotReadableError`, Chrome-only `PermissionDismissedError`/`TrackStartError`) — MDN and addpipe.com both document this fragmentation. A generic "something went wrong" fails users who could self-recover (e.g. re-enable in Chrome's site settings) vs. those who genuinely have no webcam. | MEDIUM | Needs a small error-classification layer that maps raw DOMException names to ~4 user-facing categories: permission denied (with "how to re-enable" link to `chrome://settings/content` equivalent instructions), no device found, device in use by another app, browser/context unsupported (e.g. non-HTTPS). |
| Model download progress indicator (bytes/percent, not just a spinner) | Every demo in this project downloads a multi-hundred-MB-to-multi-GB model on first visit. Google's own official samples site shows literal "Loading Model... 100%" text; WebLLM/MLC's `initProgressCallback` pattern (industry standard for in-browser LLM loading) reports a 0–1 float progress specifically so the page can render a percent or bar. Users abandon silent multi-second-to-multi-minute waits without feedback. | MEDIUM | MediaPipe GenAI's `LlmInference` has no built-in download-progress callback (confirmed in PROJECT.md) — must manually `fetch()` with a `ReadableStream` reader and track `received/total` bytes, same pattern already proven in this project's LiteRT-LM prototype. Vision tasks' `.task`/`.tflite` files are smaller (10s of MB) but still benefit from the same bar. |
| Backend/delegate indicator (GPU vs CPU / WebGPU vs WASM) | Google's own official MediaPipe samples site literally exposes a "Delegate: GPU/CPU" toggle and displays raw backend errors when GPU init fails. Performance differs by 5-10x between WebGPU and WASM CPU fallback for these models, so a user seeing a laggy demo needs to know *why* (their browser/GPU fell back) rather than assuming the whole showcase is broken. | LOW | A small persistent badge ("Running on: WebGPU" / "Running on: CPU (WASM)") set once at model init; no need for a live toggle like the official samples site since this is a showcase, not a debugging tool (see Anti-Features). |
| Graceful "unsupported browser" screen (feature-detected, not crash) | WebGPU is not universally available (notably weaker/absent on some Linux configs, older Safari) and `MediaRecorder`/`getUserMedia` support varies. Chrome DevRel's own WebGPU troubleshooting guide and multiple GitHub issue threads confirm adapter-null / disabled-flag failures are common and must be caught before they surface as a raw `TypeError: Cannot read properties of undefined`. | LOW-MEDIUM | Feature-detect `navigator.gpu`, `MediaRecorder`, `getUserMedia` at page load (not mid-interaction) and show one clear "this demo needs Chrome/Edge 113+ on a WebGPU-capable device; it will still run on CPU but may be slow" message with a link back to the hub. Because all 5 demos share the same failure mode, build this once. |
| Out-of-memory / model-load-failure recovery path | WebGPU has a real `GPUOutOfMemoryError` type and a `device.lost` promise (Chrome DevRel's own "WebGPU Device Loss best practices" doc is the canonical reference); WASM heap OOM is also a known failure mode for large model downloads on memory-constrained devices. A silent hang or crashed tab after a multi-hundred-MB download is the single worst experience this site can produce. | MEDIUM | Wrap model creation in try/catch, listen for `device.lost`, and on failure show "this model needs more memory than your device/browser has available — try the smaller model" (chat demo) or "try closing other tabs" (vision demos) rather than a blank screen. |
| Recording start/stop control with a visible "recording" state | Universal convention across every screen/webcam recorder (Loom, browser MediaRecorder demos on MDN, addpipe.com) — a red dot / pulsing indicator and elapsed-time counter so the user knows capture is live. Users who don't realize they're recording either ruin the take or miss it entirely. | LOW | Shared `useMediaRecorder`-style helper: start/stop button, elapsed mm:ss timer, red recording badge. Needed by 3 of 5 demos (synth, face filters, green screen). |
| Preview-before-download step | Standard pattern in every webcam-capture tool reviewed (photo booth software, MDN's Web Dictaphone example) — after `mediaRecorder.onstop`, the blob is shown in an `<audio>`/`<video>` player with a "Download" button, not auto-downloaded. Users need to confirm the take is good (they were in frame, gesture worked, audio synced) before committing to a save, and auto-download without preview is a common source of "why do I have 10 garbage files" complaints. | LOW | `URL.createObjectURL(blob)` into a preview element + explicit download link; add a "Retake" button next to "Download" so a bad take doesn't require a page reload. |
| Countdown before recording starts (for demos where framing matters) | Standard in photo-booth software and any single-take capture UX (referenced in booth-software search results: countdown synced to camera prep, "3-2-1" convention). Gives users time to get their hand/face in frame after clicking record, since these are single-take experiences with no re-record-mid-session pattern. | LOW | 3-second visual countdown overlay before `mediaRecorder.start()`; most valuable for Magic Mirror (face framing) and Green Screen (getting in position) — less critical for the synth demo where playing IS the take. |
| On-screen gesture legend / cheat-sheet | Confirmed as effectively universal in gesture-app literature (CACM's "Vision-Based Hand-Gesture Applications" review calls "user adaptability and feedback" and "learnability" top-tier requirements) and in every hand-gesture demo repo reviewed (Air-Canvas's own README ships a gesture-to-action table). Gesture vocabularies are invisible affordances — unlike a button, nothing on screen tells the user "index finger up = draw" unless the app tells them. | LOW-MEDIUM | A persistent (or dismissible) legend panel: icon/label per recognized gesture and what it does. Needed by Gesture Synth (which gesture = which instrument) and Air Canvas (pinch = draw, other gesture = tool select) at minimum. |
| Live hand/face detection confidence feedback | Same CACM review: "feedback indicating the correctness of the gesture performed is necessary for successful interaction," and MediaPipe's own gesture recognizer demo screenshot shows a live confidence percentage next to the recognized label. Without this, users can't tell whether a missed gesture is their fault (bad framing/lighting) or the demo's (model not loaded, wrong hand angle). | LOW-MEDIUM | Simplest form: an on-canvas skeleton/landmark overlay drawn every frame (already need the landmark points for the demo logic, so overlay is nearly free) plus a small "tracking: hand detected / no hand detected" status text. Do not need to expose the raw numeric confidence score to the end user — a binary/traffic-light state is enough (see Anti-Features). |
| Hub/landing page with one card per demo | Every multi-demo showcase reviewed structures this identically: Google's own `mediapipe-samples-web` site uses a left-nav list of tasks; TensorFlow.js's official `/js/demos` page and Chrome Experiments/`experiments.withgoogle.com` both use a card grid (thumbnail + 1-line description + "Explore/Launch" CTA) linking out to each standalone demo. This is the de facto pattern for "one property, many independent experiences." | LOW | 5 cards, each with: name, 1-line hook ("Draw in thin air"), which MediaPipe task it showcases, and a launch link to that demo's own page (per PROJECT.md's MPA architecture — this matches Google's own structure, not coincidence). |
| Clear model-size tiers presented as a real choice, not hidden default | Specific to this project's chat demo: PROJECT.md establishes small/medium/large tiers as a locked requirement. Comparable pattern: WebLLM/MLC engine selection UIs and Hugging Face model cards always surface size/quant tradeoffs (params, approx. download size, "fast but less capable" vs. "slower but better") before commit, because a multi-GB download is a real cost to the user that should be an informed choice, not a surprise. | LOW | Simple picker (radio/segmented control) showing size in MB/GB and a one-line capability tradeoff per tier, shown *before* the download starts, not after. |

### Differentiators (Competitive Advantage)

Not required for the site to feel complete, but what makes *this* showcase memorable rather than a generic tech demo.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| "Proof of local inference" micro-detail (e.g. offline badge / airplane-mode-safe indicator) | The Core Value in PROJECT.md is literally "no server round-trips" — making this *visible* (e.g. a small "100% on-device, nothing uploaded" badge that's technically true and could be demonstrated by disconnecting Wi-Fi mid-demo after model load) is a differentiator no typical cloud-AI demo can honestly claim. Most AI demo sites (including many "on-device" marketing pages) still phone home for something. | LOW | Purely a trust/marketing UI element once the technical guarantee already exists — cheap to add, high credibility payoff for a portfolio piece. |
| Instant shareable output as the payoff, framed consistently across all 5 demos | PROJECT.md's Core Value already requires every demo end in a downloadable file — the differentiator is treating this as a *unified* "you leave with proof" narrative (consistent end-of-demo screen: "Here's what you made — download it") rather than 5 differently-shaped download buttons. Competing showcases (TF.js demos hub) link to 5 completely differently-designed standalone apps with no shared payoff moment. | LOW-MEDIUM | A shared "Result" component/screen used identically across all 5 demos (preview + download + "try again" + "back to hub") turns 5 disconnected experiments into one cohesive product. |
| Multiple switchable instrument voices / filters / backgrounds discoverable via gesture itself, not just a dropdown | PROJECT.md locks in "switch instrument voices via gesture" (synth) and "switch between filters" (face filters) — leaning into gesture-driven switching (vs. a plain UI dropdown) is what makes these feel like "an instrument you play" rather than "a settings panel with a webcam attached." This is the single biggest lever for making the demos feel like creative tools instead of tech demos. | MEDIUM | Already scoped by PROJECT.md; the research finding here is *prioritize the gesture-driven switch over a UI dropdown fallback* — offer the dropdown too (accessibility/discoverability net), but the gesture path should be the one demoed/hyped. |
| Sing-along recording that mixes mic + synth into one file | Genuinely uncommon combination — most browser hand-tracking "theremins" (referenced in PROJECT.md's prior art) only ever output the instrument audio, not a mixed vocal+instrument take. Tone.js's `createMediaStreamDestination()` + mixing with `MediaStreamAudioSourceNode` (already verified feasible in PROJECT.md) is what turns this from "a theremin" into "a mini home-recording booth." | MEDIUM-HIGH | Already locked in PROJECT.md scope; flagging it here because it's the demo most likely to need dedicated phase research (audio mixing/sync, gain staging, echo/monitoring feedback loop risk). |
| Session gallery within a single visit (not persisted) | Letting a user do 2-3 takes in one session and pick their favorite before downloading (in-memory only, cleared on refresh) raises perceived polish without violating the "no server storage" constraint — it's purely client-side state. Differentiates from one-shot demo tools that force a full page reload to retry. | LOW-MEDIUM | Must be explicit that this is *not* persistence (no localStorage of media blobs — large binary blobs in localStorage/IndexedDB add real complexity for a showcase's expected win) — just multiple in-page attempts, most recent N thumbnails, pick one to download. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good for this kind of demo site but create problems disproportionate to their value.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|------------------|-------------|
| Supporting every browser/device via extensive polyfills and fallback chains | "Wider reach = more impressive showcase" instinct | WebGPU, `MediaRecorder`, `getUserMedia`, and multi-hundred-MB WASM model loads are inherently unavailable or painfully slow on older/low-end/Safari-on-iOS-quirky environments. Chasing full support multiplies error-handling surface area across 5 demos and each fallback path (e.g. software WASM LLM inference on a phone) will perform so badly it undermines the showcase's "wow" goal rather than serving it. This is exactly the "chase every configuration" trap — most polish work should go into a small number of well-supported environments (recent Chrome/Edge desktop) failing *gracefully and helpfully* elsewhere. | Feature-detect once at hub level, state supported browsers plainly (e.g. "best experienced in Chrome/Edge on desktop"), and make the unsupported-browser message itself a point of craft (clear, on-brand, with a link to what the demo would show) rather than trying to make every path actually work. |
| A full settings/configuration panel per demo (confidence thresholds, model quantization, resolution, FPS caps, etc.) | MediaPipe's own official samples site exposes exactly this (min_hand_detection_confidence, max results, score threshold, GPU/CPU delegate) because it's a *developer-facing API tester*. It's tempting to mirror that credibility. | This project's site is a portfolio/showcase for end visitors, not a developer tool — exposing raw model tunables adds cognitive load, invites users into a broken state (crank a threshold to 0 and get garbage output, blame the demo), and each exposed setting is another support/QA burden across 5 demos for zero showcase value. | Pick one sensible default per demo, tuned once during development, and hide the knobs. If a "for developers" mode is ever wanted, put it behind a single low-visibility affordance (e.g. `?debug=1` query param), not a visible panel. |
| Persisting recordings/galleries across sessions or accounts | Feels like an obvious "nice to have" once you have downloadable output — "why not let me come back and see my old drawings?" | Explicitly Out of Scope in PROJECT.md ("no user accounts, saved galleries, or cloud storage... everything downloads locally, nothing is persisted server-side") — and even a client-only version (IndexedDB storing video/audio blobs) adds real storage-quota-management, migration, and privacy-messaging complexity for a feature that isn't part of the Core Value. | The download *is* the persistence layer — the user's own filesystem. Don't rebuild that client-side. |
| A live numeric confidence score / raw model output readout for end users | Feels transparent/technical/trustworthy, and it's literally what MediaPipe's own official sample UI shows (e.g. "63% confidence" on a thumbs-up gesture, per Google's own gesture_recognizer docs screenshot) | Raw confidence numbers are meaningful to developers evaluating a model, not to a first-time visitor trying to draw in the air — it reads as noisy/technical clutter and doesn't help the user correct their gesture (a 0.42 score gives no actionable instruction). It also invites nitpicking ("only 63%?!") that undermines the showcase's polish. | Convert confidence into a binary/traffic-light UI state ("tracking" / "move your hand into frame") or a simple visual (landmark skeleton opacity fades if confidence drops) — informative without being a spec sheet. |
| A calibration/training step before each demo (e.g. "hold your hand still for 3 seconds to calibrate") | Common in serious gesture-control research systems (the CACM review notes "self-calibration" as a requirement for spatially versatile systems) and feels rigorous | MediaPipe's HandLandmarker/GestureRecognizer/FaceLandmarker models are pre-trained, general-purpose, and explicitly designed to work zero-shot on arbitrary hands/faces without per-user calibration — adding a fake calibration step would slow down the "try it in under a minute" promise from PROJECT.md's Core Value for no actual accuracy benefit, since there's nothing for the app to calibrate against. | Skip calibration; instead invest that UX budget in the on-screen gesture legend and live tracking-confidence feedback (both already table stakes above), which solve the same "will this work for me" anxiety without the time cost. |
| Auto-downloading the file the instant recording stops | Seems like fewer clicks = better UX | Removes the user's ability to review/reject a bad take (wrong framing, gesture didn't register, audio out of sync) before it lands in their Downloads folder — every reviewed webcam-recording pattern (MDN's own Web Dictaphone demo, professional photo booth software) inserts a preview step precisely because takes fail often in these interaction models. | Preview-then-download (already listed as table stakes) — one extra click in exchange for far fewer "that download is garbage" outcomes. |
| Uniform, from-scratch UI chrome custom-built per demo | Instinct to make each of the 5 demos feel like its own bespoke product | Because all 5 demos share the exact same failure modes (permission, model loading, backend indicator, unsupported browser, recording/download), building bespoke UI per demo means fixing the same bug 5 times and drifting visual/interaction consistency — directly contradicts this research's "shared-infrastructure phase" premise. | Build one shared component library (permission gate, loading/progress overlay, backend badge, error boundary, recorder+preview+download flow) used identically across all 5 demo pages, themed only by each demo's accent color/copy. |

## Feature Dependencies

```
[Hub/Landing Page]
    └──links-to──> [5 independent demo pages] (MPA per PROJECT.md constraints)

[Shared Permission Gate component]
    └──required-by──> [Gesture Synth, Air Canvas, Magic Mirror, Green Screen]  (camera)
    └──required-by──> [Gesture Synth]  (mic, additionally)
    (Chat demo does not need camera/mic — model-loading boundary only)

[Shared Model-Loading/Progress overlay]
    └──required-by──> [ALL 5 demos]
    └──requires──> [Manual byte-progress fetch wrapper] (no native progress callback in @mediapipe/tasks-genai or tasks-vision, per PROJECT.md)

[Shared Backend/Delegate indicator (WebGPU vs WASM)]
    └──required-by──> [ALL 5 demos]
    └──enhances──> [Shared Model-Loading overlay] (shown once model init resolves)

[Shared Error Boundary (permission denied / unsupported browser / OOM / model-download failure)]
    └──required-by──> [ALL 5 demos]
    └──requires──> [Browser feature-detection at hub level] (navigator.gpu, MediaRecorder, getUserMedia presence checks)

[Shared Recorder + Preview + Download flow]
    └──required-by──> [Gesture Synth, Magic Mirror, Green Screen] (video/audio capture)
    └──enhances──> [Air Canvas] (simpler PNG-export variant, no MediaRecorder needed)
    └──requires──> [Shared Permission Gate] (must have granted camera/mic first)

[Countdown-before-recording]
    └──enhances──> [Shared Recorder flow] (optional per-demo toggle; most valuable for Magic Mirror, Green Screen)

[On-screen gesture legend]
    └──required-by──> [Gesture Synth, Air Canvas]
    └──enhances──> [Magic Mirror] (filter-switch gesture, if gesture-driven per Differentiators)

[Live tracking-confidence feedback (landmark overlay / traffic-light state)]
    └──required-by──> [Gesture Synth, Air Canvas, Magic Mirror, Green Screen] (all 4 vision demos)
    └──requires──> [HandLandmarker/FaceLandmarker/GestureRecognizer landmark output] (already part of core detection loop — nearly free to surface)
    └──conflicts-with──> [Raw numeric confidence readout] (anti-feature — use simplified state instead)

[Model-size tier picker]
    └──required-by──> [Chat demo only]
    └──enhances──> [Shared Model-Loading overlay] (tier choice happens before progress bar starts)

[Calibration step] ──conflicts-with──> [PROJECT.md Core Value: "try it in under a minute"]
[Per-demo bespoke UI chrome] ──conflicts-with──> [Shared component strategy above — 5x maintenance cost for same failure modes]
```

### Dependency Notes

- **All 5 demos require the Shared Permission Gate, Model-Loading overlay, Backend indicator, and Error Boundary:** these four are the direct answer to this research task's core question — they are cross-cutting, identical in shape across every demo, and must exist *before* any individual demo's phase begins. This is the strongest signal for the roadmap: a dedicated "shared infrastructure" phase should precede or run alongside the first demo build, not be retrofitted after 5 one-off implementations diverge.
- **Manual byte-progress tracking requires a fetch-stream wrapper, not a library callback:** confirmed in PROJECT.md that neither `@mediapipe/tasks-genai` nor `@mediapipe/tasks-vision` expose native download-progress callbacks, and this project's own earlier LiteRT-LM prototype already proved the `fetch()` + `ReadableStream` + Cache API pattern works — reuse that proven code path rather than re-deriving it.
- **Recorder+Preview+Download flow requires Permission Gate to have already succeeded:** recording cannot start without a live `MediaStream`, so the shared recorder component should assume/require a granted-permission state as a precondition, keeping the two components cleanly separable.
- **Live tracking-confidence feedback is nearly free because it reuses data the demo logic already needs:** `HandLandmarker`/`FaceLandmarker`/`GestureRecognizer` output landmark points every frame regardless of whether they're displayed — surfacing them as an overlay costs a canvas-draw call, not new inference work. This should be built alongside each demo's core detection loop, not as an afterthought.
- **Gesture legend enhances, but Air Canvas/Gesture Synth cannot ship without it:** unlike a landmark overlay (nice-to-have polish), the legend is the *only* way an end user discovers the gesture vocabulary exists at all — MediaPipe's built-in gesture set (`Closed_Fist`, `Open_Palm`, `Pointing_Up`, `Thumb_Down`, `Thumb_Up`, `Victory`, `ILoveYou`) is not self-explanatory as an interaction model.
- **Calibration and per-demo bespoke UI both directly conflict with stated project goals** (Core Value's "under a minute" promise; and the practical reality that identical failure modes across 5 demos make a shared component strategy the only sane path) — these are flagged as anti-features specifically because the natural instinct while building each demo individually would be to add them.

## MVP Definition

### Launch With (v1)

Minimum viable product per demo — matches PROJECT.md's Active Requirements, which are already locked. This section maps them into build-order-relevant groups rather than re-litigating scope.

- [ ] Shared Permission Gate (camera/mic explain-then-request pattern) — every demo but chat needs it; must exist before demo-specific work starts
- [ ] Shared Model-Loading progress overlay with byte-based progress — every demo needs it; the single most technically involved shared piece (manual fetch/stream tracking)
- [ ] Shared Backend indicator (WebGPU/WASM) — cheap once model init resolves, but must be wired into the loading overlay from day one
- [ ] Shared Error Boundary (4 categories: permission denied, unsupported browser, model-download failure, out-of-memory/device-lost) — this is the single largest cross-demo risk surface named in PROJECT.md's own Active Requirements; must ship with the first demo, not bolted on later
- [ ] Shared Recorder+Preview+Download flow (start/stop, elapsed timer, preview before commit) — needed by 3 of 5 demos
- [ ] Hub/landing page with 5 demo cards — trivial complexity, but blocks nothing and should exist early so demos have somewhere to link back to
- [ ] Per-demo core loop (LLM streaming chat / gesture-to-synth mapping / pinch-to-draw / face filter overlay / segmentation-based background replace) — as already locked in PROJECT.md
- [ ] On-screen gesture legend (Gesture Synth, Air Canvas) — without it the core interaction is undiscoverable
- [ ] Live tracking-confidence feedback (landmark overlay, all 4 vision demos) — near-zero marginal cost given the detection loop already produces this data
- [ ] Model-size tier picker (chat demo only) — already locked in PROJECT.md, sequence it before the loading overlay in that demo's flow

### Add After Validation (v1.x)

- [ ] Countdown-before-recording — clear UX win, but not launch-blocking; add once the base recorder flow is proven, prioritize for Magic Mirror/Green Screen first
- [ ] "Proof of local inference" trust badge — pure polish/marketing layer, add once functional demos exist
- [ ] Session gallery (in-memory multi-take picker) — meaningfully improves perceived polish for the recording-based demos, but adds state-management complexity better tackled after the core single-take flow is solid

### Future Consideration (v2+)

- [ ] `?debug=1`-gated developer settings panel (confidence thresholds, resolution, etc.) — explicitly deferred per Anti-Features; only worth building if this project ever needs to become a developer-facing tool rather than a portfolio showcase
- [ ] Any form of cross-session persistence — explicitly out of scope per PROJECT.md and not worth revisiting unless the project's zero-server premise itself changes

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Shared Permission Gate | HIGH | LOW | P1 |
| Shared Model-Loading progress overlay (byte-based) | HIGH | MEDIUM | P1 |
| Shared Backend/Delegate indicator | MEDIUM | LOW | P1 |
| Shared Error Boundary (4 categories) | HIGH | MEDIUM | P1 |
| Shared Recorder+Preview+Download flow | HIGH | MEDIUM | P1 |
| Hub/landing page with demo cards | HIGH | LOW | P1 |
| On-screen gesture legend | HIGH | LOW-MEDIUM | P1 |
| Live tracking-confidence feedback (landmark overlay) | MEDIUM-HIGH | LOW | P1 |
| Model-size tier picker (chat) | MEDIUM | LOW | P1 |
| Countdown-before-recording | MEDIUM | LOW | P2 |
| "Proof of local inference" trust badge | LOW-MEDIUM | LOW | P2 |
| Session gallery (in-memory multi-take) | MEDIUM | MEDIUM | P2 |
| Gesture-driven filter/voice switching (vs. dropdown only) | MEDIUM-HIGH | MEDIUM | P2 |
| Sing-along mic+synth mixed recording | HIGH (differentiator) | MEDIUM-HIGH | P1 (already locked scope, but flag for deeper phase research) |
| Developer settings panel (`?debug=1`) | LOW | MEDIUM | P3 |
| Cross-session persistence | LOW (out of scope) | HIGH | P3 (do not build) |

**Priority key:**
- P1: Must have for launch
- P2: Should have, add when possible
- P3: Nice to have, future consideration (or explicitly deferred/rejected)

## Competitor Feature Analysis

| Feature | Google's official `mediapipe-samples-web` | TensorFlow.js `/js/demos` hub | Chrome Experiments / `experiments.withgoogle.com` | Our Approach |
|---------|---------------------------------------------|-------------------------------|----------------------------------------------------|--------------|
| Hub structure | Single SPA with left-nav list of tasks, each a live tunable playground | Marketing page: card grid linking OUT to fully separate standalone apps/domains | Card grid ("Launch Experiment" per card), curated by theme/year | Card grid on our own hub page linking to our own per-demo pages within one MPA (matches PROJECT.md's stated architecture, sits between the SPA-playground and fully-external-links models) |
| Model loading UX | Literal "Loading Model... 100%" progress text per task | Delegates entirely to each linked-out demo's own UX (inconsistent across demos) | Delegates to each experiment's own UX (inconsistent) | One shared, consistent progress overlay + backend badge across all 5 demos — improves on all 3 references by not fragmenting the loading experience per demo |
| Settings/tunables exposed | Yes — confidence thresholds, max results, GPU/CPU delegate toggle (developer-tool framing) | N/A (hub only) | Rare; most experiments are locked-experience art pieces, not tunable tools | Deliberately do NOT expose tunables (anti-feature) — closer to Chrome Experiments' "locked experience" framing than MediaPipe's dev-tool framing, since our audience is showcase visitors, not API testers |
| Error handling | Shows raw internal error text/stack traces on GPU failure (developer-tool framing, not polished for end users) | N/A (hub only) | Not surfaced in research (curated experiences presumably pre-vetted per browser) | Translate raw errors into ~4 user-facing categories with recovery guidance — explicitly better than MediaPipe's own reference implementation here, since our audience needs graceful messaging, not a stack trace |
| Recording/download payoff | N/A (most tasks are preview-only, no download) | Inconsistent per linked demo (some have no output artifact at all, e.g. MNIST training visualizations) | Rare — most experiments are experiential, not "make something to keep" | This is our core differentiator per PROJECT.md's Core Value — none of the 3 references treat "leave with a downloaded file" as a first-class, consistent payoff across every demo |

## Sources

- Google AI Edge official docs: [Face landmark detection guide](https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker), [Hand landmarks detection guide](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker), [Gesture recognition task guide](https://developers.google.com/edge/mediapipe/solutions/vision/gesture_recognizer) — HIGH confidence, official
- [google-ai-edge/mediapipe-samples-web](https://github.com/google-ai-edge/mediapipe-samples-web) live demo scraped directly (`google-ai-edge.github.io/mediapipe-samples-web`) — HIGH confidence, official reference implementation; confirms "Loading Model...100%" text, GPU/CPU delegate toggle, raw error surfacing, webcam-disabled iconography
- [TensorFlow.js demos hub](https://www.tensorflow.org/js/demos) scraped directly — HIGH confidence, official; confirms card-grid-linking-to-standalone-apps hub pattern
- [Experiments with Google](https://www.experiments.withgoogle.com/) / [Chrome Experiments collection](https://experiments.withgoogle.com/collection/chrome) — MEDIUM-HIGH confidence, official Google showcase; confirms card-grid + "Launch Experiment" convention
- MDN: [MediaDevices.getUserMedia()](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia), [MediaRecorder](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder) — HIGH confidence, official spec docs, including the Web Dictaphone preview-before-download example
- [addpipe.com — Common getUserMedia() Errors](https://blog.addpipe.com/common-getusermedia-errors/) — MEDIUM confidence, third-party but detailed cross-browser error-name documentation, cross-checked against MDN and Stack Overflow discussion of the same errors
- [Chrome for Developers — WebGPU Troubleshooting tips and fixes](https://developer.chrome.com/docs/web-platform/webgpu/troubleshooting-tips) and [toji.dev — WebGPU Device Loss best practices](https://toji.dev/webgpu-best-practices/device-loss.html) — HIGH/MEDIUM-HIGH confidence (Chrome DevRel official + a well-known WebGPU community reference by a Chrome team member); confirms `device.lost` promise pattern
- [MDN — GPUOutOfMemoryError](https://developer.mozilla.org/en-US/docs/Web/API/GPUOutOfMemoryError) — HIGH confidence, official spec
- [sitepoint.com — The Complete Guide to Local-First AI: WebGPU, Wasm, and Chrome's Built-in Model](https://www.sitepoint.com/local-first-ai-webgpu-chrome-guide/) and [maddevs.io — Running AI Models Locally in the Browser](https://maddevs.io/writeups/running-ai-models-locally-in-the-browser/) — MEDIUM confidence, third-party technical write-ups; confirms `initProgressCallback`-style download-progress-bar convention as industry standard for in-browser model loading (WebLLM/MLC, Transformers.js)
- [CACM — Vision-Based Hand-Gesture Applications](https://cacm.acm.org/research/vision-based-hand-gesture-applications/) — MEDIUM-HIGH confidence, peer-reviewed ACM research survey; source for "feedback/learnability/come-as-you-are/low-mental-load" gesture-UX requirements and the "Midas Touch" unintentional-gesture problem
- [AppajiDheeraj/Air-Canvas](https://github.com/AppajiDheeraj/Air-Canvas) — LOW-MEDIUM confidence (single small community project, Python/OpenCV not web, only 2 stars) but directly on-genre; used only to corroborate the gesture-legend-table convention and undo/clear/eraser feature set already independently supported by other sources
- Project's own `.planning/PROJECT.md` — ground truth for locked scope, verified API surfaces, and explicit constraints/out-of-scope items

---
*Feature research for: browser-based, zero-server MediaPipe/creative-coding multi-demo showcase*
*Researched: 2026-07-27*
