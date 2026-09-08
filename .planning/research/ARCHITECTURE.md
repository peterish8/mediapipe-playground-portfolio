# Architecture Research

**Domain:** Client-side, zero-server, WASM/ML-heavy creative-coding showcase (multi-page Vite site, 5 independent MediaPipe Tasks demos)
**Researched:** 2026-07-27
**Confidence:** HIGH (MediaPipe task lifecycle, MediaRecorder/canvas APIs, Vite multi-page config — all confirmed against official docs) / MEDIUM (shared-module folder conventions — synthesized best practice, no single canonical "vanilla JS MPA" standard exists)

## Standard Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                         PAGE SHELL (one per demo)                        │
│  hub/index.html   chat/index.html   gesture-synth/index.html  ...        │
│  Each = its own Vite entry: <html> + <script type="module" src=main.js>  │
├──────────────────────────────┬───────────────────────────────────────────┤
│      PER-DEMO ENTRY JS        │   (chat/main.js, air-canvas/main.js, ...) │
│  Owns: page-specific UI wiring, canvas draw logic, detection→visual      │
│  mapping, instrument/filter switching, demo-specific state               │
├───────────────────────────────────────────────────────────────────────────┤
│                    SHARED INFRASTRUCTURE (src/shared/)                    │
│  ┌──────────┐ ┌─────────────┐ ┌───────────┐ ┌──────────┐ ┌─────────────┐ │
│  │ camera.js│ │task-loader.js│ │recorder.js│ │backend.js│ │ ui/status.js│ │
│  │ getUserMe│ │FilesetResolv.│ │MediaRecord│ │WebGPU/CPU│ │error boundary│
│  │dia + perm│ │+ createFrom  │ │er + tee + │ │ delegate │ │loading badge │
│  │ lifecycle│ │Options + %   │ │ blob dl   │ │ detect   │ │permission UI │
│  └────┬─────┘ └──────┬──────┘ └─────┬─────┘ └────┬─────┘ └──────┬──────┘ │
├───────┴──────────────┴──────────────┴────────────┴──────────────┴────────┤
│                   MEDIAPIPE TASK RUNTIME (loaded per-page)                │
│  WASM (vision_wasm / genai_wasm) + .task model file (Cache API-cached)   │
│  HandLandmarker | GestureRecognizer | FaceLandmarker | ImageSegmenter |  │
│  LlmInference — exactly ONE task type instantiated per page load        │
├───────────────────────────────────────────────────────────────────────────┤
│                          BROWSER PLATFORM APIS                            │
│  getUserMedia · <video>/<canvas> · MediaRecorder · canvas.captureStream  │
│  · Web Audio (Tone.js taps in here) · Cache API · WebGPU/WASM · rAF      │
└──────────────────────────────────────────────────────────────────────────┘
```

This is a **multi-page app (MPA)**, not an SPA: each demo is a real navigation (`<a href="/gesture-synth/">`), so each page load gets a fresh JS realm. That single fact does most of the architectural heavy lifting for you — you never need cross-page task cleanup, cross-page camera-stream sharing, or a client-side router. The only thing that must be shared is *source code* (via ES module imports Vite bundles per-entry), not *runtime state*.

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| `shared/camera.js` | Acquire camera/mic via `getUserMedia`, expose a single `startCamera(constraints)` → `{stream, video}` promise, centralize permission-denied / no-device / insecure-context error classification, expose `stopCamera()` that stops all tracks | One exported async function + one teardown function; no classes needed. Returns the raw `MediaStream` and a `<video>` element with `srcObject` set and `playsinline`/`muted`/`autoplay` wired, resolved only once `loadeddata` fires so first `detectForVideo` call has real dimensions |
| `shared/task-loader.js` | Wrap `FilesetResolver.forVisionTasks()` / `forGenAiTasks()` + the relevant `XxxLandmarker.createFromOptions()` / `LlmInference.createFromOptions()` call; report download/init progress; cache model bytes via Cache API so repeat visits skip the multi-hundred-MB fetch | Two thin exports (`loadVisionTask(TaskClass, opts, onProgress)`, `loadGenAiTask(opts, onProgress)`) sharing one internal `fetchWithProgress(url, cacheName)` helper that reads from `caches.open()` first, falls back to `fetch()` + streams into cache. Vision fileset and GenAI fileset are **different WASM bundles** — never share a resolver instance between them |
| Detection loop (pattern, instantiated per-demo) | Drive `requestAnimationFrame`, guard against re-processing an unchanged video frame, call `detectForVideo`/`segmentForVideo` with a monotonic timestamp, hand the result to the demo's draw function | Not a shared *module* — a shared *pattern* copy-pasted (or factored into a tiny `runDetectionLoop({video, detect, onResult})` helper in `shared/`) because each demo's per-frame work (draw hand skeleton vs. composite a segmentation mask vs. trigger a synth note) is bespoke |
| Canvas overlay renderer | Draw the live video frame + task output (landmarks, mask, blendshape-driven filter) onto a `<canvas>` positioned over the `<video>` | Per-demo code; only truly shared piece is a `shared/canvas-utils.js` with generic helpers (`resizeCanvasToVideo`, `mirrorContext` for the natural "selfie" flip, `clearAndDrawVideoFrame`) |
| `shared/recorder.js` | Wrap `MediaRecorder` over a `canvas.captureStream()` (video demos) or a mixed `MediaStreamAudioDestinationNode` (synth demo), collect chunks, produce a downloadable blob + `<a download>` trigger | One `createRecorder(stream, {mimeType}) → {start, stop(): Promise<Blob>}` used identically by Air Canvas (PNG is different — see below), Magic Mirror, Green Screen, and Gesture Synth |
| Snapshot/PNG export | For Air Canvas (finished drawing) and Magic Mirror (snapshot mode) — not a video recording, just `canvas.toBlob()` / `toDataURL()` → download link | Small shared `shared/download.js` helper: `downloadBlob(blob, filename)` used by both the recorder's video output and the plain-canvas PNG path |
| `shared/backend.js` | Detect WebGPU availability (`navigator.gpu`), decide `delegate: "GPU"` vs `"CPU"` for `baseOptions`, expose a badge string ("Running on GPU" / "Running on CPU (WASM/XNNPACK)") | `navigator.gpu ? "GPU" : "CPU"` feature-detect; note MediaPipe's GPU delegate can silently fall back to CPU internally, so the badge should reflect *requested* delegate, not a guarantee — pair with a perf-based sanity check if precision matters later |
| `shared/ui/status.js` (error boundary + progress UI) | One consistent state machine per page: `idle → requesting-permission → loading-model (with % ) → ready → running → error`; renders permission-denied, unsupported-browser, model-fetch-failed, out-of-memory states with retry affordances | Small DOM-manipulation module (no framework) exposing `setState(state, detail)`; each demo's `main.js` calls it at each lifecycle transition instead of hand-rolling status text per page |
| Hub page (`index.html` at root) | Landing page linking to the 5 demo pages as cards | Static Vite entry, no MediaPipe/camera code at all — keeps the hub instant-loading |

## Recommended Project Structure

```
client-ai/
├── index.html                    # Hub/landing page (lists all 5 demos)
├── chat/
│   └── index.html                # Demo 1 entry HTML
├── gesture-synth/
│   └── index.html                # Demo 2 entry HTML
├── air-canvas/
│   └── index.html                # Demo 3 entry HTML
├── magic-mirror/
│   └── index.html                # Demo 4 entry HTML
├── green-screen/
│   └── index.html                # Demo 5 entry HTML
├── src/
│   ├── shared/                   # Code shared across ALL pages
│   │   ├── camera.js              # getUserMedia + permission lifecycle
│   │   ├── task-loader.js         # FilesetResolver + createFromOptions + progress + Cache API
│   │   ├── recorder.js            # MediaRecorder wrapper (video/audio → blob)
│   │   ├── download.js            # blob/dataURL → <a download> trigger
│   │   ├── backend.js             # WebGPU/CPU delegate detection + badge text
│   │   ├── canvas-utils.js        # resize-to-video, mirror flip, clear+draw helpers
│   │   ├── detection-loop.js      # generic rAF + lastVideoTime-guard runner
│   │   └── ui/
│   │       ├── status.js          # state machine: loading/error/ready/running
│   │       ├── progress-bar.js    # model download % UI (shared DOM component)
│   │       └── error-boundary.js  # permission-denied / unsupported / OOM panels
│   ├── hub/
│   │   └── main.js                # Hub page script (renders 5 cards, no MediaPipe)
│   ├── chat/
│   │   └── main.js                # Demo 1: LlmInference wiring, streaming UI
│   ├── gesture-synth/
│   │   ├── main.js                # Demo 2: GestureRecognizer + detection loop + Tone.js wiring
│   │   └── synth-voices.js        # Demo-specific: instrument voice definitions
│   ├── air-canvas/
│   │   └── main.js                # Demo 3: HandLandmarker + pinch-to-draw logic
│   ├── magic-mirror/
│   │   ├── main.js                # Demo 4: FaceLandmarker + filter switching
│   │   └── filters/                # Demo-specific: procedural canvas filter drawers
│   │       ├── glasses.js
│   │       └── hat.js
│   └── green-screen/
│       ├── main.js                # Demo 5: ImageSegmenter + compositing
│       └── backgrounds.js         # Demo-specific: virtual background definitions
├── public/
│   ├── wasm/                      # OPTIONAL: self-hosted copy of vision/genai WASM bundles
│   │   ├── vision/                #   (mirrors official samples repo's copy-wasm.js pattern —
│   │   └── genai/                 #    avoids depending on jsdelivr CDN uptime at demo time)
│   └── favicon.svg
├── vite.config.js
├── package.json
└── tailwind.config.js
```

### Structure Rationale

- **Root-level per-demo folders with their own `index.html`:** Vite's multi-page mode requires each HTML entry to physically exist; putting `chat/index.html`, `air-canvas/index.html`, etc. at predictable URL-shaped paths means the built site's URLs (`/chat/`, `/air-canvas/`) fall out for free with zero routing code.
- **`src/shared/`:** Every module here is imported by ≥2 demo pages. Because this is an MPA, Vite/Rollup performs its own per-entry chunk splitting — code in `shared/` that's actually used by multiple entries gets automatically split into a shared chunk during build; you don't have to engineer that yourself.
- **`src/<demo>/main.js` colocated with demo-only helper files:** Keeps camera/task/recorder concerns (shared) visibly separate from "what does this specific demo do with the detection result" (not shared, and shouldn't be — the gesture-to-synth-note mapping has nothing in common with face-blendshape-to-filter mapping).
- **`public/wasm/` optional self-hosting:** The official `mediapipe-samples-web` repo ships a `copy-wasm.js` build step specifically to vendor the WASM bundle locally instead of trusting a CDN at runtime — worth adopting given the "zero server, but also zero flaky external dependency at demo time" goal. Model `.task`/`.tflite` files themselves are **not** vendored (multi-hundred-MB, fetched from Google/HF at runtime per the Constraints) — only the small WASM runtime is a candidate for local hosting. If self-hosting is deferred, `task-loader.js` should default to the jsdelivr CDN paths already verified in PROJECT.md.
- **No `src/components/` or framework-style component tree:** There is no shared component system (explicit constraint: vanilla JS, no framework). "Shared UI" here means small, framework-free DOM-mutation functions (`ui/status.js` etc.), not reusable render components — keep them tiny and imperative, not trying to reinvent React.

## Architectural Patterns

### Pattern 1: rAF-Gated Detection Loop with Frame-Skip Guard

**What:** A `requestAnimationFrame` loop that only calls `detectForVideo`/`segmentForVideo` when the video has actually advanced to a new frame, tracked via a `lastVideoTime` sentinel — this is the official Google-recommended pattern.
**When to use:** All 4 vision demos (HandLandmarker, GestureRecognizer, FaceLandmarker, ImageSegmenter) — every one of them processes a live `<video>` element in `runningMode: "VIDEO"`.
**Trade-offs:** Prevents wasted inference on a frame the model already processed (webcams often deliver frames slower than display refresh, so without the guard you'd run the model 2-3x on the identical pixels). The cost is one extra property read per rAF tick — negligible. Caveat: `video.currentTime` granularity is coarse enough that it's a reasonable "did the frame change" proxy, but the **value passed to `detectForVideo`/`segmentForVideo` itself must be a separate, strictly monotonically increasing millisecond timestamp** (`performance.now()`), not `video.currentTime` — conflating the two is a common bug source (the API throws/warns if timestamps ever go backward or repeat).

**Example:**
```javascript
// shared/detection-loop.js
export function runDetectionLoop({ video, detect, onResult, isActive }) {
  let lastVideoTime = -1;
  let rafId;

  function tick() {
    if (!isActive()) return; // caller-controlled stop condition
    if (video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      const timestampMs = performance.now(); // monotonic, NOT video.currentTime
      const result = detect(video, timestampMs); // detectForVideo / segmentForVideo
      onResult(result);
    }
    rafId = requestAnimationFrame(tick);
  }

  rafId = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(rafId); // stop handle
}
```

### Pattern 2: Explicit Lifecycle Teardown (camera + task + loop)

**What:** A single `stop()`/cleanup function per demo page that, in order: cancels the rAF handle, calls `.close()` on the MediaPipe task instance (releases WASM heap memory), and stops every `MediaStreamTrack` on the camera stream (turns off the camera light).
**When to use:** Every vision demo, triggered on: explicit "stop"/"switch filter" UI action, and on `pagehide`/`beforeunload` as a safety net. Because this is an MPA, a real navigation away already frees everything (fresh JS realm on next page) — but within a single page (e.g., switching Magic Mirror filters, or Green Screen backgrounds) you must not leak a second camera stream or a second live task instance if the user toggles something that reinitializes.
**Trade-offs:** Costs a few lines of boilerplate per demo; omitting it causes the camera "recording" indicator to stay lit after a user thinks they've stopped, and repeated task creation without `.close()` leaks WASM linear memory until the tab is closed.

**Example:**
```javascript
let stopLoop, task, stream;

async function start() {
  ({ stream, video } = await startCamera({ video: true }));
  task = await loadVisionTask(HandLandmarker, { runningMode: "VIDEO", numHands: 2 });
  stopLoop = runDetectionLoop({ video, detect: (v, t) => task.detectForVideo(v, t), onResult: draw, isActive: () => running });
}

function stop() {
  running = false;
  stopLoop?.();
  task?.close();          // releases MediaPipe WASM task
  stream?.getTracks().forEach(t => t.stop()); // releases camera hardware
}

window.addEventListener("pagehide", stop); // safety net for back/forward-cache & navigation
```

### Pattern 3: MediaRecorder Tee via `captureStream()` (video) / `createMediaStreamDestination()` (audio)

**What:** Record the on-screen canvas result (Air Canvas final PNG excluded — that's a plain snapshot, not a recording) by turning the `<canvas>` into a `MediaStream` via `canvas.captureStream(fps)`, or for the audio-producing Gesture Synth demo, tapping Tone.js's master output plus the raw mic `MediaStreamAudioSourceNode` into one `MediaStreamAudioDestinationNode`, then handing either stream to a single shared `MediaRecorder` wrapper.
**When to use:** Green Screen Studio (video), Magic Mirror (snapshot + optional short recording), Gesture Synth (audio-only recording mixed from synth + mic).
**Trade-offs:** `canvas.captureStream()` only emits new frames when the canvas is actually redrawn between them (some browsers require a continuous draw loop even for "idle" frames, or the recording appears to freeze) — since all 4 vision demos already have a rAF draw loop running for the live overlay, this is naturally satisfied and needs no extra hack. `MediaRecorder`'s default `mimeType` is browser-dependent (`video/webm` on Chrome/Firefox); pin an explicit supported `mimeType` and feature-detect with `MediaRecorder.isTypeSupported()` before construction.

**Example:**
```javascript
// shared/recorder.js
export function createRecorder(stream, mimeType = "video/webm;codecs=vp9") {
  const chunks = [];
  const type = MediaRecorder.isTypeSupported(mimeType) ? mimeType : "video/webm";
  const recorder = new MediaRecorder(stream, { mimeType: type });
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);

  return {
    start: () => recorder.start(),
    stop: () => new Promise((resolve) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type }));
      recorder.stop();
    }),
  };
}
```

## Data Flow

### Video-Frame Processing Loop (all 4 vision demos)

```
getUserMedia()
    ↓ (MediaStream)
<video srcObject=stream, autoplay, muted, playsinline>
    ↓ (video reaches 'loadeddata', has real width/height)
requestAnimationFrame loop starts
    ↓
[frame-skip guard: video.currentTime !== lastVideoTime?] --no--> requestAnimationFrame again
    ↓ yes
timestampMs = performance.now()
    ↓
task.detectForVideo(video, timestampMs)   // or .segmentForVideo(video, timestampMs, callback)
    ↓ (landmarks / gestures / blendshapes / confidenceMask)
demo-specific draw function
    ↓
canvas.getContext('2d') — clear, draw mirrored video frame, overlay result
    ↓ (canvas now visually current)
[canvas.captureStream() feeding MediaRecorder, if recording is active]
    ↓
requestAnimationFrame(loop again)
```

Direction is strictly one-way per tick: camera → video element → detector → canvas → (optional) recorder. Nothing flows backward except the frame-skip guard reading `video.currentTime`. `ImageSegmenter.segmentForVideo` differs slightly by taking a result **callback** rather than returning synchronously — the callback still fires within the same rAF tick under normal conditions, so the draw call belongs inside that callback, not after the `segmentForVideo` call returns (per PROJECT.md, mask readback via `getAsFloat32Array()` costs ~80-100ms — this is the one demo where the "did we finish before the next rAF tick" budget is tightest; consider allowing the guard to also skip a **new** detect call while a previous one's callback hasn't fired yet, to avoid overlapping segmentations queuing up).

### Model/Task Loading Flow (all 5 demos)

```
User lands on demo page
    ↓
ui/status.js → state: "requesting-permission" (vision demos) / "loading-model" (chat demo, no camera)
    ↓
camera.js: getUserMedia() ──error──> ui/error-boundary.js: "permission denied" panel (STOP)
    ↓ success
task-loader.js: check Cache API for model bytes
    ↓ cache miss                          ↓ cache hit
fetch(modelUrl) with progress events      skip fetch, load from cache
    ↓                                     ↓
ui/progress-bar.js updates % ─────────────┘
    ↓
FilesetResolver.forVisionTasks()/forGenAiTasks() (WASM init)
    ↓
XxxTask.createFromOptions({ baseOptions: { modelAssetPath, delegate } })
    ↓
ui/status.js → state: "ready" → demo enables its "start" UI → detection loop (see above) begins
```

### Key Data Flows

1. **Camera-to-canvas (real-time, per-tick):** `getUserMedia` → `<video>` → rAF-gated `detectForVideo`/`segmentForVideo` → canvas draw. This is the dominant, continuously-running flow for HandLandmarker/GestureRecognizer/FaceLandmarker/ImageSegmenter demos, described in full above.
2. **Model acquisition (one-time per session, cached thereafter):** CDN/HF URL → `fetch` with progress → Cache API store → `FilesetResolver`/`createFromOptions`. Runs once per page load; subsequent visits to the same demo (same browser, same origin) hit cache and skip the network fetch entirely.
3. **Recording-to-download (user-triggered, terminal):** live canvas/audio stream → `MediaRecorder` chunk collection → `Blob` on `stop()` → `URL.createObjectURL` → synthetic `<a download>` click → browser save dialog/auto-download. One-shot, not continuous.
4. **Gesture-to-audio (Gesture Synth only, additional to flow #1):** `GestureRecognizer` result → gesture-to-Tone.js-parameter mapping (per-demo logic) → `Tone.js` synth voice trigger → Web Audio graph → speakers, and in parallel → `Tone.context.createMediaStreamDestination()` mixed with mic input → recorder flow #3.

## Scaling Considerations

This is a static showcase site with no backend and no concurrent-user contention in the traditional sense — "scale" here means model-download bandwidth and per-session browser resource limits, not request throughput.

| Scale | Architecture Adjustments |
|-------|--------------------------|
| Single demo, first visit | Full fetch of WASM + `.task`/`.tflite` model (250MB-3GB depending on demo/tier); progress bar is not optional UX, it's required — a multi-hundred-MB blocking fetch with no feedback reads as "broken" |
| Single demo, repeat visit | Cache API serves WASM + model from disk cache; `task-loader.js` should check-then-skip network entirely rather than re-validating with a conditional request, since these assets are immutable by version/URL |
| User navigates between multiple demos in one session | Each page navigation is a full reload (MPA by design) — browser evicts the previous page's WASM heap and camera stream automatically; no explicit cross-page cleanup needed, this is the main payoff of choosing MPA over SPA for this project |

### Scaling Priorities

1. **First bottleneck: model download size/time.** Mitigate with visible progress (`ui/progress-bar.js`), Cache API persistence, and offering size-tiered choices where the API supports it (already planned for the chat demo's small/medium/large tiers).
2. **Second bottleneck: WASM/GPU memory pressure from running one heavy task per page.** Mitigated structurally by MPA — never load two Task instances (e.g. HandLandmarker + FaceLandmarker) in the same page/JS realm. If a later milestone ever wants a combined demo, budget for it explicitly; it's out of scope for this architecture.

## Anti-Patterns

### Anti-Pattern 1: Building This as an SPA with Lazy-Loaded Route Chunks

**What people do:** Use a client-side router (even a tiny hash-router) and `import()` each demo's module lazily, keeping everything in one `index.html`/one JS realm, reasoning "it's basically the same as multi-page but with nicer transitions."
**Why it's wrong:** Defeats the entire reason MPA was chosen (per PROJECT.md Constraints): a previous demo's MediaPipe task/camera stream can leak into the next unless you perfectly replicate manual cleanup that a real page navigation gives you for free. It also risks bundler chunk-graph mistakes where two tasks' WASM glue code end up in a shared chunk and both get fetched even though only one demo is visited.
**Do this instead:** Real `<a href>` navigations between separate `index.html` entries, exactly as planned. Let the browser's own page-lifecycle do the cleanup work.

### Anti-Pattern 2: Driving the Detection Loop with `setInterval` Instead of `requestAnimationFrame`

**What people do:** `setInterval(() => detectForVideo(...), 33)` to "target 30fps."
**Why it's wrong:** Runs detection even when the tab is backgrounded or the video hasn't produced a new frame, wasting battery/CPU and — worse — can pile up overlapping calls if a single `detectForVideo` call takes longer than the interval period, since `setInterval` doesn't wait for the previous callback to finish.
**Do this instead:** `requestAnimationFrame` (auto-throttles/pauses in background tabs) combined with the `lastVideoTime` frame-skip guard from Pattern 1.

### Anti-Pattern 3: Never Calling `.close()` on a MediaPipe Task Instance

**What people do:** Create a new `HandLandmarker`/`FaceLandmarker` instance every time a demo-internal setting changes (e.g. switching `numHands` or a filter that needs different task options) without closing the previous one.
**Why it's wrong:** Each task instance holds its own WASM linear memory allocation; repeated creation without `.close()` on the old instance leaks memory for the lifetime of the tab, eventually causing slowdowns or an out-of-memory crash — especially relevant for FaceLandmarker (478 landmarks + 52 blendshapes/frame) and ImageSegmenter (full-frame float32 mask buffers).
**Do this instead:** Treat "change a setting that requires new task options" as a controlled teardown+recreate: call `.close()` on the old task, await the new `createFromOptions()`, then resume the loop (Pattern 2).

### Anti-Pattern 4: Passing `video.currentTime` Directly as the `detectForVideo` Timestamp

**What people do:** Reuse the same `video.currentTime` value both for the frame-skip guard *and* as the millisecond timestamp argument to `detectForVideo`/`segmentForVideo`.
**Why it's wrong:** `video.currentTime` is in seconds (not ms), doesn't necessarily strictly increase in the way the API expects across all browsers/codecs, and if a demo ever seeks/loops video it can go backward — the API requires monotonically increasing timestamps and will error or behave unpredictably otherwise.
**Do this instead:** Use `video.currentTime` purely as a cheap "did the frame change" sentinel; always pass `performance.now()` (or an incrementing counter) as the actual timestamp argument.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| `cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm` (or self-hosted `public/wasm/vision/`) | `FilesetResolver.forVisionTasks(wasmPath)` | Shared by HandLandmarker, GestureRecognizer, FaceLandmarker, ImageSegmenter — one resolver per page, called once at load |
| `cdn.jsdelivr.net/npm/@mediapipe/tasks-genai/wasm` (or self-hosted `public/wasm/genai/`) | `FilesetResolver.forGenAiTasks(wasmPath)` | Separate WASM bundle from vision tasks — chat demo only |
| `storage.googleapis.com/mediapipe-models/...` | Direct `fetch()` via `task-loader.js`, streamed into Cache API | hand_landmarker, face_landmarker, gesture_recognizer `.task`; selfie_segmenter `.tflite` — all confirmed URLs in PROJECT.md |
| Hugging Face `litert-community` org | Direct `fetch()` (multi-GB for large tier), same Cache API caching path | Chat demo model tiers; no documented native download-progress callback from `LlmInference` itself — progress must be tracked manually at the `fetch()` level before handing a blob URL to `modelAssetPath` |
| Tone.js (npm package, bundled) | Local import, not a network integration at runtime (bundled by Vite) | Only touches the audio graph; taps into `recorder.js` via `createMediaStreamDestination()` |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| Demo `main.js` ↔ `shared/camera.js` | Direct async function calls (`await startCamera()`, `stopCamera()`) | No events/pub-sub needed — one caller, one callee, per page |
| Demo `main.js` ↔ `shared/task-loader.js` | Direct async function call + `onProgress` callback param | Progress reporting via callback, not a custom event system — keeps it simple for a single-consumer-per-page module |
| Demo `main.js` ↔ `shared/detection-loop.js` | Function call passing `{video, detect, onResult, isActive}`; returns a `stop` handle | The `detect` and `onResult` callbacks are where all per-demo logic lives — the loop runner itself stays 100% generic across all 4 vision demos |
| Demo `main.js` ↔ `shared/recorder.js` | Direct calls: `createRecorder(stream)`, `.start()`, `.stop()` → `Promise<Blob>` | Demo owns deciding *what* stream to pass (canvas capture vs. mixed audio) — recorder module doesn't know or care which demo it's serving |
| Demo `main.js` ↔ `shared/ui/status.js` | Direct calls: `setState("loading-model", {percent})` etc. | One shared state-machine vocabulary across all 5 demos keeps the "hardware/model status + error boundary" requirement consistent without a framework |

## Sources

- Official MediaPipe Hand Landmarker Web guide (`detectForVideo` / `lastVideoTime` pattern, `.task` model setup) — https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js (HIGH confidence, official docs, verified current)
- `google-ai-edge/mediapipe-samples-web` official repo structure (`src/tasks/`, `src/workers/`, `src/components/`, `copy-wasm.js` build step) — https://github.com/google-ai-edge/mediapipe-samples-web (HIGH confidence — this is Google's own reference implementation)
- MediaPipe `.close()` task lifecycle / cleanup-on-unmount pattern — https://stackoverflow.com/questions/78083842/how-do-correctly-close-predictions-of-the-mediapipe-hand-landmark-model-for-web and Google AI Edge Python API reference documenting `close()`/context-manager semantics that mirror the JS API — https://ai.google.dev/edge/api/mediapipe/python/mp/tasks/vision/ObjectDetector (MEDIUM-HIGH — JS `.close()` behavior confirmed via community usage + official Python API parity docs)
- MDN MediaStream Recording API (`MediaRecorder`, `canvas.captureStream()`, chunked blob download pattern) — https://developer.mozilla.org/en-US/docs/Web/API/MediaStream_Recording_API (HIGH confidence, official MDN)
- Chrome Developers blog on `captureStream()` from canvas/video/audio elements — https://developer.chrome.com/blog/capture-stream (HIGH confidence, official Chrome docs)
- Vite multi-page app configuration via `build.rollupOptions.input` — https://stackoverflow.com/questions/77498366/how-do-i-setup-a-multi-page-app-using-vite and Vite official static asset handling guide (`public/` vs. imported assets) — https://vite.dev/guide/assets (HIGH confidence, official Vite docs + widely-confirmed community pattern)
- MediaPipe `delegate: "GPU"/"CPU"` behavior and caveats (GPU delegate may still show CPU-path logs; best verified via performance, not log text) — https://github.com/google-ai-edge/mediapipe/issues/4711 (MEDIUM confidence — GitHub issue thread with maintainer response, not formal docs)
- PROJECT.md verified API shapes for `@mediapipe/tasks-vision`, `@mediapipe/tasks-genai`, and Tone.js (treated as ground truth per task instructions, not re-derived)

---
*Architecture research for: Client-side, zero-server, WASM/ML-heavy multi-demo creative-coding showcase (Vite MPA, vanilla JS)*
*Researched: 2026-07-27*
