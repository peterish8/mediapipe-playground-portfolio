# Pitfalls Research

**Domain:** Client-side, zero-server browser AI showcase (MediaPipe Tasks Vision + Tasks GenAI + Tone.js + MediaRecorder + Vite MPA)
**Researched:** 2026-07-27
**Confidence:** HIGH for MediaPipe/MediaRecorder/Web Audio API mechanics (verified against official Google AI Edge docs, MDN, and MediaPipe GitHub issue tracker); MEDIUM for cross-browser codec support and Vite WASM specifics (verified via multiple community sources); HIGH but urgent for the LLM Inference API lifecycle finding below (verified directly on the official docs page, dated 2026-06-12).

## Critical Pitfalls

### Pitfall 1: MediaPipe GenAI LLM Inference API is now in maintenance-only mode — chat demo built on a sunsetting API

**What goes wrong:**
The project's own history (see PROJECT.md) already pivoted once, from `@litert-lm/core` to `@mediapipe/tasks-genai` `LlmInference`, specifically to get small/medium model tiers. As of this research date, Google's official docs for `LlmInference` on web (`developers.google.com/edge/mediapipe/solutions/genai/llm_inference/web_js`, last updated 2026-06-12) now carry a banner: **"The MediaPipe LLM Inference API is in maintenance-only mode. We recommend migrating your Web projects to LiteRT-LM JavaScript API."** Building the AI Chat demo on `tasks-genai` today means building on an API Google has already told developers to move away from. It still works and still ships small tiers today, but new models, bug fixes, and browser-compat updates are not guaranteed going forward, and Google's own sample repos may migrate out from under any tutorials you follow.

**Why it happens:** The project's ground-truth API notes were captured in an earlier session; API lifecycle status (maintenance-only banners, deprecation notices) changes independently of the API surface itself and isn't visible from reading method signatures alone — you only see it by checking the live docs page, not by testing the code.

**How to avoid:**
- Before writing the LLM Chat demo phase, re-check both `developers.google.com/edge/mediapipe/solutions/genai/llm_inference/web_js` and `developers.google.com/edge/litert-lm/js` for current status. Confirm whether LiteRT-LM JS has since shipped smaller model tiers (this was the original blocker documented in PROJECT.md) — if it now has small/medium tiers, that changes the calculus back toward LiteRT-LM.
- If proceeding with `tasks-genai` anyway (reasonable — it works today and the model-tier problem is solved), isolate all LLM-loading/inference code behind a small adapter module (`llmEngine.js`) with a narrow interface (`load(modelUrl, onProgress)`, `generate(prompt, onToken)`, `dispose()`). This makes a future swap to LiteRT-LM (or a newer MediaPipe successor) a localized change, not a rewrite.
- Note the model file extension has also shifted: current official examples use `.litertlm` files (e.g. `gemma-3n-E4B-it-int4-Web.litertlm`), not the `.task` files referenced in PROJECT.md's ground truth. Verify current filenames/extensions on the `litert-community` HF org at implementation time rather than trusting the extension recorded during planning.

**Warning signs:** Official docs page shows a maintenance/deprecation banner; GitHub issues on `google-ai-edge/mediapipe` about `tasks-genai` stop receiving responses; model files at previously-documented HF paths 404 or get renamed.

**Phase to address:** AI Chat demo phase (verify at phase start, not just during initial project research) — re-verification step, not full re-research, since the API shape itself is confirmed working.

---

### Pitfall 2: LLM Inference API has no CPU/WASM fallback — it hard-requires WebGPU, unlike every other demo in this project

**What goes wrong:**
PROJECT.md's constraints state "WebGPU (optional, with WASM/XNNPACK fallback)" as a blanket rule for all demos. This is true for `tasks-vision` (HandLandmarker, GestureRecognizer, FaceLandmarker, ImageSegmenter all support a CPU/XNNPACK delegate), but it is **not** true for `tasks-genai`'s `LlmInference`. Official docs state plainly: "The LLM Inference API requires a web browser with WebGPU compatibility." There is no documented CPU delegate for this task. Confirmed in practice: Firefox throws `TypeError: navigator.gpu is undefined`; Safari (non-Technology-Preview) throws `navigator.gpu.requestAdapter` is undefined; even Safari Technology Preview (which has WebGPU) has failed with `maxStorageBufferBindingSize` errors too small for the model. A generic "WebGPU unavailable, falling back to CPU" error boundary — reasonable for the 4 vision demos — will be actively wrong and misleading for the chat demo, where there is no CPU path to fall back to.

**Why it happens:** Teams write one shared "check WebGPU, else fall back to WASM" utility and reuse it everywhere because it worked for the vision demos, not realizing the GenAI task has a fundamentally different capability floor.

**How to avoid:**
- Write two distinct capability-check paths: `checkVisionCapability()` (WebGPU optional, WASM/XNNPACK always works) vs `checkGenAiCapability()` (WebGPU mandatory, hard block if absent).
- For the chat demo's error boundary, detect `!navigator.gpu` (or a failed `requestAdapter()`) before attempting model download, and show an explicit "This demo requires a WebGPU-capable browser (recent Chrome, Edge, or Chrome-based browser on desktop; not currently supported in Firefox or Safari)" message — not a generic "unsupported browser" message. This avoids the worst UX outcome: a user waiting through a 250MB–2GB model download only to hit a WebGPU error at inference time.
- Check `navigator.gpu.requestAdapter()` succeeds AND returns a device with adequate `maxStorageBufferBindingSize` (issues have been reported at ~524MB minimum requirement) before starting the download, not after.

**Warning signs:** QA on Firefox/Safari reports "chat demo spinner never resolves" or "chat demo downloads fully then errors" — both are symptoms of missing the WebGPU gate before download.

**Phase to address:** AI Chat demo phase, in the error-boundary/capability-check work specifically (do not reuse the vision demos' shared capability-check utility unmodified).

---

### Pitfall 3: Using `Date.now()` (or frame index) instead of a monotonic elapsed-time counter for `detectForVideo()`/`segmentForVideo()` timestamps

**What goes wrong:**
All four `tasks-vision` VIDEO-mode APIs require the `timestamp_ms` argument to be **strictly monotonically increasing** between calls. Passing `Date.now()` seems intuitive but breaks in two common scenarios: (1) if the tab is backgrounded and `requestAnimationFrame` throttles/pauses, the gap between consecutive `Date.now()` calls can be huge but is still technically increasing so this alone won't throw — the real trap is (2) restarting or recreating the task/video across a re-render or hot-reload where a *new* `detectForVideo` call arrives with a timestamp *smaller* than the previous instance's last-seen timestamp (e.g., video seeked back, or two overlapping detection loops running against the same task instance). MediaPipe's C++ backend throws and **does not recover**: "mediapipe throws the same error with the same timestamp when given new frames. It also offers no method to reset the timestamp" (confirmed via `google-ai-edge/mediapipe` issue #5743). Once a task instance hits this state, the only fix is to destroy and recreate the task instance — there is no soft reset.

**Why it happens:** `Date.now()` "looks like" a timestamp and MediaPipe's own Java/Android samples sometimes use wall-clock time, so developers assume it's the recommended pattern; the actual requirement (monotonic relative to the *task instance's own call history*, not wall-clock accuracy) is easy to violate when a demo has play/pause/restart controls, multiple camera sources, or gets re-initialized on navigation without discarding the old instance's timestamp state.

**How to avoid:**
- Use `performance.now()` (relative to page origin, guaranteed monotonic within a page lifetime) as shown in Google's own sample code, not `Date.now()`.
- Maintain a single incrementing counter per task instance as a defensive fallback: `let lastTs = -1; const ts = Math.max(performance.now(), lastTs + 1); lastTs = ts;` — this guarantees monotonicity even across throttling or clock weirdness.
- Never reuse a timestamp counter across a task instance recreation. When a demo restarts the camera or recreates the `HandLandmarker`/`FaceLandmarker`/`ImageSegmenter`, reset the counter to 0 for the new instance — do not carry state from the old instance forward.
- Never run two concurrent `detectForVideo` loops (e.g., a `requestAnimationFrame` loop and a `setInterval` loop) against the same task instance — this is the most common way to violate monotonicity with real device timestamps.

**Warning signs:** Console errors like "Packet timestamp mismatch" or "input timestamp must be monotonically increasing" appearing intermittently, especially after clicking a demo's "restart camera" or "switch mode" button; a demo that works fine on first load but breaks after any in-page reset action.

**Phase to address:** Shared Infrastructure phase — build one `createVideoTimestampCounter()` helper used by all four vision demos, so the fix is written once and can't regress per-demo.

---

### Pitfall 4: Not calling `.close()` on MediaPipe task instances and `MPMask` results when navigating away or switching modes — accumulating WASM heap leaks

**What goes wrong:**
`HandLandmarker`, `GestureRecognizer`, `FaceLandmarker`, `ImageSegmenter`, and `LlmInference` instances all hold WASM-side (C++) memory that is **not** garbage-collected by the JS engine. The official docs are explicit: "it is important to invoke `close()` on the `MPMask` instance" to free clone/type-conversion resources, and this applies to the parent task instances too. In this project's MPA architecture, each demo page loads and tears down its own task instance — but if a user navigates hub → demo → hub → same demo repeatedly (very likely, since the hub page is the entry point for browsing 5 showcases), and the page doesn't explicitly `.close()` the previous task instance before creating a new one (or before `beforeunload`), each visit leaks the full WASM allocation for that task. Confirmed via multiple `google-ai-edge/mediapipe` issues describing multi-minute memory growth and eventual tab crash from repeated task creation without disposal.

**Why it happens:** JS developers are conditioned to expect garbage collection to handle cleanup; MediaPipe's WASM memory is invisible to `chrome://memory` JS heap snapshots in the way normal objects are, so leaks are easy to miss in casual testing (which typically loads each demo once) and only surface after the repeated-navigation pattern real users exhibit.

**How to avoid:**
- Every demo's teardown path (page unload, "back to hub" navigation, or in-page "switch demo mode" action) must call `.close()` on the task instance and on any retained `MPMask`/result objects before dropping references.
- Because this is an MPA (not an SPA), navigating to a different HTML page fully unloads the JS context and reclaims WASM memory automatically — so the leak risk is specifically about *within a single page*: re-initializing the task (e.g., user toggles a setting that requires `createFromOptions` again, like switching `numHands` or delegate) without closing the prior instance first.
- Add a single `window.addEventListener('pagehide', () => taskInstance?.close())` per demo page as a safety net, in addition to explicit close-on-teardown logic in any in-page re-init path.

**Warning signs:** Browser tab memory (Chrome Task Manager, not DevTools JS heap) grows unboundedly across repeated in-page re-initializations; demo becomes sluggish or crashes only after extended interactive use, not on first load.

**Phase to address:** Shared Infrastructure phase — establish a `useMediaPipeTask()`-style lifecycle helper with mandatory close-on-teardown, applied consistently across all 4 vision demo phases + the chat demo phase.

---

### Pitfall 5: GPU delegate silently falls back to CPU, or produces wrong results, without surfacing this to the user

**What goes wrong:**
Requesting `delegate: "GPU"` in `baseOptions` does not guarantee GPU execution. Confirmed patterns from MediaPipe's issue tracker: (a) some platforms log "Created XNNPACK delegate for CPU" even when GPU was requested, silently downgrading performance with no error thrown (issue #4711); (b) on iOS Safari specifically, the GPU delegate for `ImageSegmenter` has produced **incorrect segmentation categories** rather than failing loudly (issue #6142) — a silent-wrong-answer failure mode, which is worse than a crash; (c) on some GPU/WebGL format combinations, the segmentation postprocessor rejects available formats and the task **aborts** instead of gracefully falling back (issue #6296). For this project's "visible hardware/model status (WebGPU/WASM backend indicator)" requirement (explicit in PROJECT.md), naively trusting the requested delegate value for that indicator will show "GPU" when the runtime silently downgraded to CPU, or show a working indicator while segmentation output is subtly wrong.

**Why it happens:** The GPU delegate request is best-effort in MediaPipe's web runtime; there's no synchronous "delegate confirmed" callback exposed at the JS API level in all cases, so developers assume the delegate they requested is the delegate that's running.

**How to avoid:**
- Do not derive the "backend indicator" UI purely from the `delegate` option you passed in — that only reflects the request, not the actual runtime outcome.
- Where possible, cross-check actual performance against expected GPU vs. CPU frame times (e.g., if `HandLandmarker` on "GPU" delegate is running at CPU-tier latency, flag it) as a heuristic, since there's no first-class "which delegate actually ran" API.
- Treat iOS Safari as a known-risky platform for `ImageSegmenter` GPU delegate specifically — consider defaulting to CPU delegate on iOS Safari for the Green Screen demo until Apple/Google resolve the incorrect-mask issue, rather than requesting GPU and hoping.
- Wrap task creation in a try/catch that specifically handles GPU-delegate creation failures by retrying with `delegate: "CPU"` and surfacing which one actually succeeded to the status UI.

**Warning signs:** Green Screen demo's mask edges look wrong (misclassified background/foreground) specifically on iOS Safari during QA; frame rate on "GPU" indicator is suspiciously close to known CPU-tier benchmarks.

**Phase to address:** Green Screen Studio phase primarily (ImageSegmenter is the confirmed-affected task); the shared status-indicator component (Shared Infrastructure phase) should be designed to reflect actual/verified delegate, not requested delegate, from the start.

---

### Pitfall 6: Treating `MPMask.getAsFloat32Array()`'s ~80–100ms cost as free, blowing the frame budget for the Green Screen demo

**What goes wrong:**
The project's own ground-truth notes already flag this cost (confirmed independently via GitHub issue #4491, where a user reported segmentation updating only every 4-5 seconds specifically because of naive per-frame `getAsFloat32Array()` calls). At 30fps, the frame budget is ~33ms; at 60fps it's ~16ms. An 80-100ms synchronous readback is 2.5-6x the entire frame budget on its own, before any compositing/canvas drawing work. Calling `getAsFloat32Array()` (or building any per-pixel JS-side loop over it) every single frame inside the `segmentForVideo` callback will cap the demo well under 10fps and can make the UI feel broken rather than "creative and real-time."

**Why it happens:** The vision demos' own samples call `.getAsFloat32Array()` directly inside the result callback because it's the most obvious way to read mask data, without profiling; the cost is invisible until you measure actual frames-per-second, since the callback still "works," it's just slow.

**How to avoid:**
- Where possible, keep segmentation compositing on the GPU/canvas side using the mask as a WebGL texture or via `ImageBitmap`/`OffscreenCanvas` paths rather than reading every pixel back into a JS Float32Array for CPU-side blending.
- If a Float32Array readback is unavoidable, throttle it explicitly — e.g., run full segmentation + readback at a lower rate (every 2nd or 3rd frame) and interpolate/hold the previous mask for skipped frames, rather than blocking every `requestAnimationFrame` tick on it.
- Budget and measure: log actual achieved FPS during development against the theoretical max given the ~90ms readback tax, and set the demo's target frame rate expectation (e.g., "10-15fps background replacement," not "60fps") accordingly in the UI copy/status indicator rather than over-promising smoothness.

**Warning signs:** Green Screen demo visibly stutters or the background mask noticeably lags the person's movement; measured FPS caps out around 10-12fps regardless of hardware.

**Phase to address:** Green Screen Studio phase — this is the single demo where this pitfall applies; build the throttled-readback pattern into that phase's core loop from the start rather than optimizing after the fact.

---

### Pitfall 7: `MediaRecorder` mimeType/codec choice that silently fails or produces broken files on a subset of browsers

**What goes wrong:**
`MediaRecorder`'s supported `mimeType`/codec combinations differ meaningfully across engines: Chromium (Chrome/Edge) defaults to `video/webm` with VP8/VP9 + Opus and does not support MP4 recording pre-Safari-alignment; Safari (pre-18.4) only supported `audio/mp4`/`video/mp4` with AAC/H.264 and had **no WebM support at all**; Safari 18.4+ added WebM/Ogg support. Passing an unsupported `mimeType` string to the `MediaRecorder` constructor **throws synchronously** (not a graceful no-op), and — separately — `MediaRecorder.isTypeSupported()` has been unreliable on iOS in the past (returning `true` for a type that then fails at `.start()`). Since every one of this project's 5 demos ends in "download a recording," a hardcoded `'video/webm;codecs=vp9,opus'` (reasonable-looking default) will throw a construction error on any Safari version that doesn't support it, breaking the "download something real" core value on that browser with no fallback.

**Why it happens:** Most MediaRecorder tutorials are written and tested against Chrome only, where `video/webm` "just works," and the codec-support divergence across browsers isn't visible until cross-browser QA.

**How to avoid:**
- Build a single shared `pickSupportedMimeType(candidates)` helper (Shared Infrastructure phase) that tries an ordered candidate list through `MediaRecorder.isTypeSupported()` and falls back to constructing `MediaRecorder` with no `mimeType` option at all if nothing matches (letting the browser choose its own default) rather than throwing.
- Order candidates by preference but always include an audio-only and video+audio variant: e.g. `['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4;codecs=avc1.42000a,opus', 'video/mp4']` for video demos, and `['audio/webm;codecs=opus', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4']` for the Gesture Synth's audio-only mix.
- Wrap the `new MediaRecorder(stream, options)` call itself in try/catch even after `isTypeSupported()` passes, specifically because of iOS's historical unreliability there, and fall back to constructing with no options as a last resort.
- Always read back `mediaRecorder.mimeType` after construction (the browser may normalize what you requested) and use that actual value both for the `Blob` type and for choosing the downloaded file's extension — don't assume the extension matches what you asked for.

**Warning signs:** "Download" button produces a 0-byte or unplayable file specifically on Safari during cross-browser QA; console shows a `MediaRecorder` constructor exception before recording even starts.

**Phase to address:** Shared Infrastructure phase (the `pickSupportedMimeType` + recorder-creation helper is reused by all 5 demos' download flows).

---

### Pitfall 8: Wrong stop/cleanup order producing truncated or corrupted recordings

**What goes wrong:**
`MediaRecorder`'s `dataavailable` event does not necessarily fire with complete data until `.stop()` triggers a final flush, and the container's header/footer metadata is written across the recording lifecycle, not just at `.start()`. Common ordering bugs: (1) stopping the underlying `MediaStream`'s tracks (`track.stop()`) *before* calling `mediaRecorder.stop()`, which can truncate the final chunk or produce a recording missing its closing metadata; (2) assembling the downloadable `Blob` from `chunks` inside `onstop` before all `dataavailable` events for that recording have actually landed (if code races ahead of the event, e.g. building the Blob from a `chunks` array that hasn't received its final push yet); (3) revoking the object URL (`URL.revokeObjectURL`) before the download/link click has actually completed, invalidating the download mid-flight, especially on Firefox. Confirmed via multiple real-world reports of `ondataavailable` behaving inconsistently around stop/sleep transitions (e.g., Chromium issue reporting `ondataavailable` firing extra times with an oversized final chunk after system sleep).

**How to avoid:**
- Correct order: call `mediaRecorder.stop()` first → wait for the `onstop` event → *then* stop the underlying tracks (`stream.getTracks().forEach(t => t.stop())`) → *then* assemble the `Blob` from the accumulated `chunks` array (which is guaranteed complete once `onstop` has fired, since the spec fires a final `dataavailable` before `stop`) → *then* create the object URL and trigger download → only call `URL.revokeObjectURL()` after a delay (e.g., in the download link's own `click` handler completion, or via a short `setTimeout`), not immediately after `download.click()`.
- Never stop tracks before calling `mediaRecorder.stop()` — this is the single most common corruption cause across all sources reviewed.
- Set `mediaRecorder.ondataavailable` to always push to the `chunks` array unconditionally (checking `e.data.size > 0` before pushing to avoid empty chunks), and only build/download the final Blob inside `onstop`, never speculatively before it.

**Warning signs:** Downloaded video/audio file plays for a shorter duration than the actual recording, or is unplayable/reports as corrupted by the media player; issue appears intermittently rather than every time (a strong signal of an event-ordering race rather than a codec problem).

**Phase to address:** Shared Infrastructure phase — build one `recordAndDownload()` helper encapsulating the correct stop→flush→teardown→download→revoke sequence, used by Gesture Synth, Air Canvas, Magic Mirror, and Green Screen (all 4 non-chat demos that record/download media).

---

### Pitfall 9: Mixing multiple MediaStreams (Tone.js synth output + mic, or canvas video + mic audio) into one recording incorrectly

**What goes wrong:**
`canvas.captureStream()` produces a **video-only** stream with no audio track. The Gesture Synth demo needs to combine (a) the synth's audio output and (b) the user's own mic (for singing along) into a single recorded file; other demos need to combine canvas video with mic audio. The common mistake is assuming `MediaRecorder` can take two separate `MediaStream` objects — it cannot; it takes exactly one `MediaStream`, and multiple audio/video sources must be merged into that single stream's track list *before* constructing the recorder. A second common mistake specific to mixing multiple **audio** sources (synth + mic) is trying to record the mic's `MediaStreamAudioSourceNode` output directly without first merging it with the synth bus through a shared `AudioContext.createMediaStreamDestination()` node — recording only one or the other, or getting silence, because the two audio sources were never actually connected into the same destination graph.

**How to avoid:**
- For synth + mic mixing (Gesture Synth demo): create one `MediaStreamAudioDestinationNode` via `Tone.context.createMediaStreamDestination()` (or `Tone.context.rawContext.createMediaStreamDestination()` depending on Tone version), route the synth's master output *and* a `MediaStreamAudioSourceNode` built from the mic's `getUserMedia` stream both into that same destination node, then use `destination.stream` (which now carries the mixed audio) as the sole input to `MediaRecorder`.
- For canvas video + mic audio (Air Canvas, Magic Mirror, Green Screen if audio narration is ever wanted): build a single combined `MediaStream` via `new MediaStream([...canvasStream.getVideoTracks(), ...micStream.getAudioTracks()])` or `canvasStream.addTrack(micStream.getAudioTracks()[0])`, and pass that combined stream — not either original stream — to `MediaRecorder`.
- Never pass the canvas stream and mic stream as two separate arguments or attempt two simultaneous `MediaRecorder` instances expecting them to sync — there is no such API, and running two recorders creates two separate files with no guaranteed sync.

**Warning signs:** Recorded file has video but no audio (or vice versa); recording works for video-only demos but audio is silent specifically in the Gesture Synth demo where two audio sources need merging.

**Phase to address:** Gesture Synth Instrument phase (the audio+audio mixing case is unique to this demo); the video+mic combined-stream pattern belongs in the Shared Infrastructure phase's `recordAndDownload()` helper since Air Canvas/Magic Mirror/Green Screen share the same canvas+mic shape if any of them add audio.

---

### Pitfall 10: `AudioContext`/Tone.js silently failing to start without a user gesture — the "no sound" bug

**What goes wrong:**
All modern browsers block `AudioContext` from entering the `running` state until a user gesture (click, tap, keydown) occurs on the page — this is a browser autoplay policy, not a Tone.js bug, but Tone.js surfaces it as a console warning ("The AudioContext was not allowed to start. It must be resumed (or created) after a user gesture") and, critically, **fails silently from the user's perspective** — no sound plays and no visible error appears in the UI. For the Gesture Synth demo specifically, if `Tone.start()` is called during module initialization (page load) rather than inside a click/tap handler, the entire demo will appear "broken" (gestures detected, visuals respond, but zero audio) with no indication to the user why.

**Why it happens:** Developers call `Tone.start()` (or rely on Tone's auto-init) at the top of their setup code alongside camera/model initialization, treating audio setup like any other async initialization step, not realizing it has a hard browser-level gesture requirement that camera/model loading doesn't share.

**How to avoid:**
- Gate `Tone.start()` (and the underlying `Tone.context.resume()`) behind the same explicit "Start Demo" / "Enable Camera & Audio" button this project already needs for `getUserMedia` permission requests — one user click satisfies both the camera-permission-prompt requirement and the AudioContext-gesture requirement simultaneously. Do not attempt to start audio automatically on page load or on gesture-recognition events (a detected hand gesture is not a "user gesture" in the browser API sense — it doesn't count).
- After calling `Tone.start()`, explicitly check `Tone.context.state === 'running'` before enabling gesture-to-sound mapping in the UI, and show a visible "tap to enable audio" affordance if it's still `suspended`.
- Test specifically by loading the demo and *not* clicking anywhere except triggering a hand gesture — confirm silence is caught by an explicit check, not just assumed fixed because it worked during manual testing (which always involves clicking something first).

**Warning signs:** QA reports "gestures work but there's no sound" intermittently, especially on fresh page loads or in automated/scripted testing that doesn't simulate a real click.

**Phase to address:** Gesture Synth Instrument phase — tie `Tone.start()` directly to the demo's existing "enable camera" gesture/button rather than treating it as a separate audio-specific step.

---

### Pitfall 11: Audio clicks/glitches when rapidly switching Tone.js instrument voices via gesture events

**What goes wrong:**
Gesture recognition fires on every video frame (potentially 15-30+ times/second) and a naive implementation that creates a new `Tone.Synth`/`PolySynth` instance (or calls `.triggerAttack()`/`.triggerRelease()`) every time a gesture category is detected — rather than once per gesture *change* — will (a) spam audible clicks/pops from repeated attack/release cycles on the same note, and (b) leak `Tone.Synth` instances if old ones aren't `.dispose()`d before creating new ones, compounding with Pitfall 4's memory concerns on the audio side. Separately, switching the active instrument mid-note (e.g., a `PluckSynth` playing when the gesture changes to select an `FMSynth`) without releasing the currently-sounding note first produces an audible glitch/discontinuity.

**Why it happens:** Gesture recognizer output is naturally a per-frame stream, not a discrete per-event stream, so code that reacts to "gesture === X" on every frame where it happens to be true (rather than only on the transition into that state) triggers audio far more often than intended.

**How to avoid:**
- Debounce/edge-detect gesture state: only call `triggerAttack`/instrument-switch logic when the recognized gesture *changes* from the previous frame's gesture (`if (gesture !== lastGesture) { ...; lastGesture = gesture; }`), never on every frame the gesture happens to still be true.
- Pre-instantiate all instrument voices once at demo setup (not per-gesture-event), and switch which one is "active" by routing/gain rather than constructing/disposing `Tone.Synth` instances on every switch. If disposal is unavoidable for memory reasons, call `.releaseAll()` or `.triggerRelease()` on the outgoing synth *before* `.dispose()`, and use a short (10-30ms) fade/ramp rather than an instant cutoff to avoid a click.
- Use Tone.js's own scheduling (`Tone.now()` + small lookahead) for attack/release timing rather than triggering notes synchronously inside the `requestAnimationFrame`/gesture-callback tick, which reduces timing jitter perceived as glitchiness.

**Warning signs:** Audible clicking/popping sound on every detected gesture frame rather than a clean note trigger; sound briefly "stutters" or double-triggers when holding a single gesture steady.

**Phase to address:** Gesture Synth Instrument phase.

---

### Pitfall 12: Vite serving/building WASM incorrectly for MediaPipe/Tone.js dependencies across dev vs. build, and CORS on cross-origin CDN model/wasm fetches

**What goes wrong:**
Two distinct Vite-specific failure modes are common with WASM-heavy packages like `@mediapipe/tasks-vision`/`@mediapipe/tasks-genai`: (1) Vite's default asset handling can behave differently in dev server mode vs. production build for `.wasm` files depending on how the library loads them (`fetch()` of a relative path vs. bundler-resolved import) — a wasm file that resolves correctly via Vite's dev server (which proxies arbitrary paths) can 404 in the built `dist/` output if it wasn't copied into `dist/` because it was never referenced through an import Vite's static-asset pipeline recognizes, per Vite's own asset-handling docs (unrecognized asset types need an explicit `?url` import or `assetsInclude` config, or must live in `public/` and be referenced by absolute path). (2) MediaPipe's own recommended pattern loads its WASM fileset from a CDN (jsDelivr) via `FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm")` — this works cross-origin because jsDelivr sends permissive CORS headers, but if this project instead vendors the wasm files locally (consistent with the "zero server, self-contained" philosophy) and serves them from its own static host without configuring the correct `Content-Type: application/wasm` MIME type, `WebAssembly.instantiateStreaming()` fails and silently falls back to the slower `compile+instantiate` path (or fails outright on stricter setups).

**How to avoid:**
- For any locally-vendored `.wasm`/model asset, place it in Vite's `public/` directory and reference it by root-relative absolute path (e.g., `/wasm/vision_wasm_internal.wasm`) rather than relying on Vite's module-resolution/import pipeline to discover it — files in `public/` are copied to `dist/` verbatim with no processing, sidestepping the "unrecognized asset type" problem entirely.
- If sourcing wasm/model files from CDN (jsDelivr for wasm bundles, storage.googleapis.com/HuggingFace for `.task`/model files) rather than vendoring, verify each CDN host actually sends `Access-Control-Allow-Origin` headers permissive enough for `fetch()`/`instantiateStreaming()` to succeed before relying on it in production — test this per-host, don't assume all CDNs behave the same as jsDelivr.
- If self-hosting wasm files, confirm the production static host (whatever serves the built Vite output) is configured to serve `.wasm` with `Content-Type: application/wasm` — many generic static hosts default `.wasm` to `application/octet-stream`, which breaks `instantiateStreaming()` (though most engines fall back gracefully to `instantiate()`, this is a silent performance regression worth catching explicitly, not just tolerating).
- Since this is a multi-page (MPA) Vite app, confirm each demo's HTML entry point independently resolves its own copy of the shared wasm assets correctly — test the *built* `dist/` output for every page, not just the dev server, since dev-vs-build asset resolution divergence is the single most common Vite+WASM complaint found in community reports.

**Warning signs:** Demo works in `npm run dev` but a specific demo page 404s on a `.wasm` file (or the whole task fails to initialize) after `npm run build && npm run preview`; console shows `WebAssembly.instantiateStreaming` errors specifically mentioning MIME type mismatch.

**Phase to address:** Shared Infrastructure phase — verify the wasm/model-serving strategy (vendored via `public/` vs. CDN-loaded) against a full production build+preview cycle before any demo phase begins, since every demo phase inherits this decision.

---

### Pitfall 13: LLM model download UX — no progress feedback, no caching, and gated-model failures with no server to work around them

**What goes wrong:**
Three distinct but related failures for the AI Chat demo's 250MB-2GB download: (1) MediaPipe's `LlmInference` API has no documented native download-progress callback (confirmed in PROJECT.md's own ground-truth notes) — a demo that hands a raw HF URL straight to `modelAssetPath` gives the user an indeterminate spinner for what could be minutes on a slow connection, with no way to know if it's working or hung. (2) Without explicit caching via the Cache API (or IndexedDB) keyed by model URL/version, every repeat visit — even the same day — re-downloads the full model, which is both a poor experience and a bandwidth cost multiplier for anyone showing this demo to others. (3) Some Hugging Face model repos are **gated** (require an authenticated, logged-in HF account with explicit access-request approval) — this project has zero backend, so there is no way to attach an HF auth token server-side; a gated repo will return an HTTP 401/403 directly to the browser's `fetch()` with no recovery path available to an anonymous client-side app.

**How to avoid:**
- Fetch the model as a stream manually (`fetch(url)` → `response.body.getReader()`) rather than handing the URL directly to `modelAssetPath`, tracking bytes-received against `Content-Length` (when the CDN provides it) to drive a real percentage progress bar — this is the same pattern PROJECT.md's own notes confirm was already proven working in the LiteRT-LM prototype, so reuse that exact approach rather than re-deriving it.
- Cache the fully-downloaded model bytes using the Cache API (`caches.open('mediapipe-models').then(c => c.put(modelUrl, response))`) keyed by the exact model URL (which typically encodes version), and check the cache first on every load before issuing a network request — this converts "download every visit" into "download once, then instant load," which matters enormously for a showcase site where a visitor may return or a presenter may reload during a live demo.
- Before selecting which HF-hosted models to ship for the small/medium/large tiers, explicitly verify each chosen repo (on the `litert-community` org, per PROJECT.md) is **public**, not gated — check this by attempting an unauthenticated fetch of the model file during planning/spike work, not just by browsing the HF web UI (which may show file listings even for gated repos to a logged-in browser session, misleadingly suggesting anonymous access will work).
- Surface a clear, distinct error state for "model download failed due to access restrictions" vs. generic network failure, in case a previously-public model repo becomes gated later (repos can change gating status) — this can't be fixed client-side, so the error message should say so plainly (e.g., "this model is no longer publicly downloadable — try a different size tier") rather than retrying indefinitely.

**Warning signs:** Users report the chat demo "hangs" on first load with no visible progress; repeat visits from the same browser still show a multi-minute wait (caching not working); a previously-tested model URL starts returning 401/403 (gating changed upstream).

**Phase to address:** AI Chat demo phase — the streaming-fetch-with-progress and Cache-API-backed caching should be built together as this phase's first milestone, since the demo's core value ("try it in under a minute") is unachievable without caching for any repeat use.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|-----------------|------------------|
| Hardcode a single `mimeType` for `MediaRecorder` instead of building the `pickSupportedMimeType()` cascade | Faster to ship one demo | Silent recorder-construction failures on Safari/older browsers, breaking the "download something real" core value cross-browser | Never — this is shared infra used by 4 of 5 demos |
| Call `getAsFloat32Array()` every frame in `ImageSegmenter` without throttling | Simpler code, works fine in a quick local test | Demo caps at ~10fps and looks broken/laggy to real users, discovered late if only profiled casually | Only acceptable as an explicit first-pass prototype, must be fixed before phase completion |
| Use `Date.now()` for `detectForVideo`/`segmentForVideo` timestamps | Looks correct, passes a quick smoke test | Unrecoverable "timestamp mismatch" crashes after any in-page restart/reset action, requiring full page reload to recover | Never |
| Skip Cache-API model caching for the LLM demo in an MVP pass | Ships the chat demo faster | Every demo run (including your own dev iteration and any live demo/screen-share) re-downloads hundreds of MB to GBs | Only acceptable for a throwaway local spike, never for anything shown to a real user |
| Reuse the "WebGPU optional, WASM fallback" capability-check utility unmodified for the LLM chat demo | Consistent code across all 5 demos | Chat demo silently attempts a multi-hundred-MB download on Firefox/Safari before failing at inference time with no CPU fallback available | Never — the two capability profiles are genuinely different |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|--------------|------------------|--------------------|
| Hugging Face model CDN (`litert-community` org) | Assuming all listed models are anonymously fetchable because they're visible in the HF web UI | Explicitly test an unauthenticated `fetch()` against each candidate model file before committing to it in the roadmap; treat gated status as a hard blocker with no server-side workaround available |
| jsDelivr CDN for MediaPipe WASM bundles | Assuming any CDN will behave identically re: CORS/MIME headers | Verify `Access-Control-Allow-Origin` and `Content-Type: application/wasm` explicitly for whichever host (CDN or self-hosted `public/`) actually serves the wasm in production |
| Tone.js `AudioContext` + native `getUserMedia` mic stream | Treating audio-context startup and camera/mic permission as two separate, independently-timed init steps | Gate both behind the same single "Start Demo" user-gesture click so one interaction satisfies both browser requirements at once |
| `canvas.captureStream()` + mic `getUserMedia` stream | Passing two separate `MediaStream` objects to `MediaRecorder` (not supported) | Merge tracks into one `MediaStream` via `addTrack()`/`new MediaStream([...tracks])` before constructing the recorder |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|-----------|------------|-----------------|
| Per-frame `MPMask.getAsFloat32Array()` readback in Green Screen demo | FPS caps at 10-12 regardless of hardware; visible lag between person and mask | Throttle full readback to every 2nd/3rd frame; prefer GPU/canvas-texture compositing where feasible | Immediately, on any hardware — this is a fixed ~80-100ms tax per call, not a scale issue |
| Creating new `Tone.Synth` instances per gesture-detection frame | Audio glitches/clicks; memory grows during a single session | Pre-instantiate voices once; switch active voice by routing, not re-construction | Within seconds of continuous gesture-based interaction |
| Not closing MediaPipe task instances on in-page re-init | Tab memory (not JS heap) grows unboundedly across repeated re-initializations within one page | Mandatory `.close()` before any re-`createFromOptions()` call; `pagehide` listener as backstop | After several repeated re-initializations in one session; worse on lower-RAM devices |
| Two concurrent `detectForVideo` loops against one task instance | Intermittent "timestamp mismatch" crash | Single owned `requestAnimationFrame` loop per task instance, no parallel timers | As soon as any dual-loop pattern exists (e.g., debug overlay + main loop) |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Embedding any Hugging Face auth token client-side to work around a gated model repo | Token exposed to anyone viewing page source/network tab; violates the project's own zero-server, zero-credential premise | Never use gated models for a purely-client-side, credential-free app; verify public/anonymous access before selecting a model |
| Requesting camera/mic permission without clear context (no explanation before the browser prompt) | Users reflexively deny, especially on mobile, since the demo hasn't yet earned trust | Show an explanit in-page "why we need this" UI element immediately before triggering the native permission prompt, not a bare unexplained browser dialog on page load |
| Recording audio/video and offering "download" without clarifying nothing is uploaded anywhere | User distrust, especially for a face/camera demo — reasonable to assume recordings might be sent somewhere | State explicitly in the UI (not just docs) that recordings stay local and are never uploaded, consistent with the project's actual zero-server architecture |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-------------------|
| Indeterminate spinner for a 250MB-2GB model download with no percentage/byte count | User assumes the demo is broken/hung and abandons before it finishes | Manual streaming fetch with a real percentage progress bar, plus a rough time estimate if `Content-Length` is available |
| No caching — full model re-download on every visit | Repeat visitors (or the same user demoing the site twice) face the same multi-minute wait every time | Cache API keyed by model URL; check cache before any network fetch |
| Generic "browser unsupported" message for both the vision demos (WASM fallback exists) and the chat demo (WebGPU mandatory, no fallback) | Users on Firefox/Safari get a misleading "try updating your browser" message for chat when no update will fix it (WebGPU isn't shipped there yet) | Demo-specific error messaging: vision demos say "reduced performance without WebGPU," chat demo says "requires a WebGPU-capable Chromium browser" |
| Silent "no sound" in Gesture Synth when `Tone.start()` never ran on a real gesture | User assumes the whole demo is broken, not just audio | Explicit "tap to enable audio" affordance tied to the same click that requests camera permission; visible confirmation once `Tone.context.state === 'running'` |
| Camera/mic permission denied with no recovery guidance | User stuck on a broken-looking demo with no idea how to fix it | Explicit error state with browser-specific instructions to re-enable permission (e.g., "click the camera icon in your address bar") |

## "Looks Done But Isn't" Checklist

- [ ] **Model download progress:** Often shows a generic spinner — verify an actual percentage/byte-count UI is wired to real `fetch()` stream progress, not a fake animated spinner.
- [ ] **Model caching:** Often missing entirely in a first pass — verify a second page load (same session and a fresh browser profile) does *not* re-trigger a full network download.
- [ ] **Recording download on Safari:** Often only tested on Chrome — verify the actual `mimeType` picked, the resulting file plays back correctly, and the file extension matches the real container (not always `.webm`).
- [ ] **Task instance cleanup:** Often missing — verify repeated in-page re-initialization (toggling a setting that recreates the task) doesn't grow tab memory unboundedly across 10+ cycles.
- [ ] **GPU/WebGPU status indicator:** Often reflects the requested delegate, not the actual one — verify it changes correctly when forced onto a CPU-only device/browser, not just displaying whatever was requested.
- [ ] **Gesture Synth audio+mic mix:** Often only one source is actually audible in the final recording — verify the downloaded file contains both the synth output and the user's mic input, not just one.
- [ ] **Timestamp monotonicity across resets:** Often works on first load, breaks after any in-page "restart camera"/"switch mode" action — verify by explicitly clicking such controls during QA, not just testing a fresh page load.
- [ ] **HTTPS/localhost exemption:** Often only tested on `localhost`, where `getUserMedia` and WebGPU work regardless of TLS — verify the actual production deploy target serves over HTTPS, since `getUserMedia` and (typically) WebGPU require a secure context outside localhost.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|----------------|------------------|
| Timestamp-mismatch crash mid-demo | LOW | Destroy the current task instance (`.close()`), recreate via `createFromOptions()`, reset the timestamp counter to 0; cannot be soft-reset in place |
| Corrupted/truncated recording discovered post-launch | MEDIUM | Audit and fix the stop→flush→teardown ordering in the shared `recordAndDownload()` helper once; propagates the fix to all consuming demos immediately since it's centralized |
| Chat demo built entirely on `tasks-genai` and Google fully sunsets it | HIGH | Because the LLM engine logic is isolated behind a narrow adapter interface (per Pitfall 1's prevention), swapping the adapter's internals to LiteRT-LM JS (or successor) is a contained rewrite of one module, not the whole demo |
| Gated model repo discovered after being wired into the UI | MEDIUM | Swap to a confirmed-public alternative tier from the same `litert-community`/HF ecosystem; requires re-verifying the new model's size/quality tradeoff but not an architecture change |
| Discovering iOS Safari GPU delegate produces wrong segmentation masks post-launch | LOW | Add a platform check (`iOS Safari` UA/feature sniff) that forces `delegate: "CPU"` for `ImageSegmenter` specifically on that platform, leaving other platforms/demos untouched |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|--------------------|-----------------|
| LLM Inference API maintenance-mode status | AI Chat demo phase | Re-check official docs banner at phase start; confirm adapter-module isolation exists in the implementation |
| LLM Inference requires WebGPU, no CPU fallback | AI Chat demo phase | Explicit `navigator.gpu` capability gate before download starts, tested on Firefox and non-Preview Safari |
| Timestamp monotonicity (`Date.now()` vs. counter) | Shared Infrastructure phase | Shared `createVideoTimestampCounter()` helper exists and is used by all 4 vision demos; QA clicks "restart" controls without crash |
| Task instance / `MPMask` memory leaks | Shared Infrastructure phase | Lifecycle helper with mandatory `.close()`; 10x repeated in-page re-init doesn't grow tab memory materially |
| GPU delegate silent fallback/wrong results | Green Screen Studio phase (ImageSegmenter); status indicator built in Shared Infrastructure | iOS Safari QA pass specifically checks mask correctness, not just that a mask renders |
| `getAsFloat32Array()` ~90ms frame-budget cost | Green Screen Studio phase | Measured FPS logged during dev; throttled-readback pattern implemented, not per-frame |
| MediaRecorder mimeType/codec cross-browser support | Shared Infrastructure phase | `pickSupportedMimeType()` helper tested on Chrome, Firefox, and Safari (both pre- and post-18.4 if feasible) before any demo phase ships |
| MediaRecorder stop/cleanup ordering | Shared Infrastructure phase | `recordAndDownload()` helper enforces stop→flush→teardown→download→revoke order; downloaded files verified playable end-to-end |
| Mixing multiple MediaStreams (mic+synth, canvas+mic) | Gesture Synth Instrument phase (audio+audio); Shared Infrastructure (video+mic pattern) | Downloaded recording verified to contain both intended audio sources audibly, not just one |
| `AudioContext`/Tone.js gesture requirement ("no sound" bug) | Gesture Synth Instrument phase | `Tone.context.state === 'running'` checked and surfaced in UI; tested by loading demo and only triggering gestures, no extra clicks |
| Audio glitches switching instruments rapidly | Gesture Synth Instrument phase | Gesture edge-detection (change-only triggering) implemented; instruments pre-instantiated, not created per-event |
| Vite WASM serving dev-vs-build divergence, CDN CORS | Shared Infrastructure phase | Full `npm run build && npm run preview` cycle tested for every demo page, not just `npm run dev` |
| Model download UX (no progress, no caching, gated models) | AI Chat demo phase | Real percentage progress bar wired to streaming fetch; second-visit load time confirmed near-instant via Cache API; chosen model repos confirmed publicly/anonymously fetchable |

## Sources

- Google AI Edge — LLM Inference guide for Web (`developers.google.com/edge/mediapipe/solutions/genai/llm_inference/web_js`, last updated 2026-06-12) — HIGH confidence, official docs, directly scraped this session; confirms maintenance-only status, WebGPU requirement, and current `.litertlm` file naming
- Google AI Edge — Image segmentation guide for web (`developers.google.com/edge/mediapipe/solutions/vision/image_segmenter/web_js`) — HIGH confidence, official docs
- `tasks-vision` package reference (`developers.google.com/edge/api/mediapipe/js/tasks-vision`) — HIGH confidence, confirms `MPMask.close()` requirement
- `google-ai-edge/mediapipe` GitHub issues #5743 (timestamp mismatch unrecoverable), #6169 (detectForVideo timestamp semantics), #6193 (GPU delegate memory leak), #5626 (extensive memory usage), #6142 (iOS Safari GPU delegate wrong segmentation categories), #6296 (GPU segmentation postprocessor abort), #4711 ("GPU" requested, XNNPACK/CPU delegate created silently), #4491 (`getAsFloat32Array()` per-frame causing multi-second update lag), #5562 (LLM Inference WebGPU requirement failures on Firefox/Safari) — MEDIUM-HIGH confidence, primary-source bug reports on the official repo
- MDN — `MediaRecorder.mimeType`, `MediaRecorder: dataavailable event` — HIGH confidence, official browser API reference
- WebKit blog — "MediaRecorder API" and "WebKit Features in Safari 18.4" (WebM/Ogg support added) — HIGH confidence, official browser vendor source
- Chrome Developers blog — "Capture a MediaStream from a canvas, video or audio element" — HIGH confidence, official source
- testmuai.com — MediaRecorder browser support/codec compatibility writeup with citations to MDN/WebKit/caniuse — MEDIUM confidence, third-party synthesis, cross-checked against MDN/WebKit primary sources
- Stack Overflow — "MediaStream Capture Canvas and Audio Simultaneously" (canvas+mic track-merging pattern) — MEDIUM confidence, verified against MDN `MediaStream.addTrack()` semantics
- Tone.js GitHub issues #341, #443 ("AudioContext was not allowed to start") — MEDIUM-HIGH confidence, primary-source issue reports on the official Tone.js repo
- WebKit Bugzilla #215884 and community reports — iOS Safari PWA/installed-app camera permission revocation on navigation — MEDIUM confidence, multiple independent community reports converging on the same behavior
- Vite discussion #13737 and Vite official docs "Static Asset Handling" (`vite.dev/guide/assets`) — MEDIUM-HIGH confidence for the general pattern (wasm-adjacent static assets not auto-copied unless in `public/` or explicitly imported), official docs for the `public/`-folder behavior specifically
- Hugging Face docs — "Gated models" (`huggingface.co/docs/hub/en/models-gated`) and community discussion on gated-repo 401/403 errors — HIGH confidence for the gating mechanism itself (official docs), MEDIUM for browser-specific CORS behavior on gated repos (community-sourced)

---
*Pitfalls research for: Client-side browser AI showcase (MediaPipe Tasks Vision/GenAI + Tone.js + MediaRecorder + Vite MPA)*
*Researched: 2026-07-27*
