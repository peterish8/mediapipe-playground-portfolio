# TODO — MediaPipe Playground

Master execution checklist for an AI (or human) executor to build this project end to end. This is the entry point; the authoritative detail lives in `.planning/` and `docs/` — this file just sequences the work and calls out the gotchas that matter most.

**Read before starting any phase:**
- `.planning/PROJECT.md` — context, constraints, key decisions
- `.planning/REQUIREMENTS.md` — the 44 testable requirements (source of truth for "done")
- `.planning/ROADMAP.md` — the 6 phases, their success criteria, and dependencies
- `.planning/research/SUMMARY.md` (+ `STACK.md`, `ARCHITECTURE.md`, `PITFALLS.md`, `FEATURES.md`) — why things are built the way they're built
- `docs/PRD.md`, `docs/UI-SPEC.md`, `docs/FLOW.md` — product/design spec

**How to execute each phase (GSD workflow, already configured — mode: yolo, granularity: coarse):**
```
/gsd:plan-phase <N>      # produces PLAN.md for phase N inside .planning/phases/<NN-name>/
/gsd:execute-phase <N>   # executes the plan, commits atomically
```
Each phase folder already exists with its own `resources/` subfolder (for phase-specific reference material gathered during planning/execution) — see `.planning/phases/`.

**Execution order:** Phase 1 is a hard prerequisite for everything else. Phases 2-6 are mutually independent once Phase 1 lands (config has `parallelization: true`) — they can be planned/built in parallel, or sequentially in the risk-ordered sequence below.

---

## Phase 1 — Shared Infrastructure (blocks all other phases)

Folder: `.planning/phases/01-shared-infrastructure/`
Requirements: PLAT-01 through PLAT-09

- [ ] Vite project scaffold: multi-page config (one HTML entry per demo + hub), `worker: { format: 'es' }`, `optimizeDeps: { exclude: ['@mediapipe/tasks-vision', '@mediapipe/tasks-genai'] }`
- [ ] `copy-wasm.js` prebuild script — self-host MediaPipe WASM from `node_modules/@mediapipe/*/wasm` into `public/wasm/`, do NOT CDN-load it (research correction — see STACK.md)
- [ ] Tailwind v4 via `@tailwindcss/vite` (not v3/autoprefixer, not the CDN play-script)
- [ ] Decide + configure hosting target (affects whether `coi-serviceworker` is needed for COOP/COEP — GitHub Pages can't set custom headers; Netlify/Vercel/Cloudflare Pages can) — **flag this decision back to the user if not already made**
- [ ] `shared/camera.js` — `getUserMedia` wrapper with permission-priming UI hook and specific error classification (denied vs no-device vs unsupported)
- [ ] `shared/task-loader.js` — dual path: `FilesetResolver.forVisionTasks()` for the 4 vision demos, `FilesetResolver.forGenAiTasks()` for Chat — **never share a resolver instance between the two families**
- [ ] `shared/backend-badge.js` — WebGPU/WASM detection for the 4 vision demos; a stricter WebGPU-only capability gate for Chat (no fallback exists there — see PLAT-06/CHAT-08)
- [ ] `shared/timestamp-counter.js` — monotonically-increasing counter (or `performance.now()`) for every `detectForVideo()`/`segmentForVideo()` call. **Never use `Date.now()` or let it repeat/go backwards** — this throws an unrecoverable error requiring the task instance to be destroyed and recreated
- [ ] `shared/task-lifecycle.js` — ensures every MediaPipe task instance gets `.close()`'d and every camera/mic track gets `.stop()`'d on page teardown (PLAT-08)
- [ ] `shared/recorder.js` — `pickSupportedMimeType()` (webm codec support varies by browser — verify what actually works, don't assume), `MediaRecorder` wrapper, integrate `fix-webm-duration` (Chromium's webm output reliably lacks duration metadata)
- [ ] `shared/record-preview-download.js` — implements the Record → indicator/timer → Stop → **preview (playback before committing)** → Download/Retake flow (research found silent auto-download on stop is an anti-pattern)
- [ ] `shared/error-boundary.js` — one reusable error panel component/pattern for: permission denied, no device, model download failure (network/CORS/404), out-of-memory, unsupported browser
- [ ] Hub page (`index.html`): 5 showcase cards (name, one-liner, MediaPipe capability tag, launch link) per `docs/UI-SPEC.md` §2.1
- [ ] Verify: full `npm run build && npm run preview` cycle works, not just `npm run dev` (WASM serving has historically diverged between the two — PITFALLS.md)

**Definition of done:** all 5 success criteria in `.planning/ROADMAP.md` Phase 1 are true, verified in a real browser (not just code review).

---

## Phase 2 — Air Canvas (build this one first among the demos — simplest, validates the whole pattern)

Folder: `.planning/phases/02-air-canvas/`
Requirements: CANVAS-01 through CANVAS-05

- [ ] `HandLandmarker` via shared task-loader, `runningMode: "VIDEO"`
- [ ] Pinch detection: thumb tip (landmark 4) to index tip (landmark 8) distance below a threshold = "pen down"
- [ ] Draw continuous line on canvas overlay while pinched; lift pen on release without erasing prior strokes
- [ ] Color swatch row (click to select)
- [ ] Clear button (wipes canvas only, not camera/tracking state)
- [ ] Download button → PNG via `canvas.toDataURL()`
- [ ] Visual pinch-state indicator ("✏️ Drawing" vs "✋ Hovering") per UI-SPEC §2.5

**Definition of done:** all 5 success criteria in ROADMAP.md Phase 2 are true.

---

## Phase 3 — Gesture Synth Instrument

Folder: `.planning/phases/03-gesture-synth-instrument/`
Requirements: SYNTH-01 through SYNTH-09

- [ ] `GestureRecognizer` via shared task-loader (gives both hand landmarks AND built-in gesture classification in one task)
- [ ] Pitch mapping: one hand's Y position → note, quantized to a musical scale (e.g. pentatonic) — never raw unquantized frequency
- [ ] Expression mapping: other hand's Y (or same-hand second axis) → volume or filter cutoff
- [ ] Tone.js instrument voices (4+): Synth, Violin-style (label it "Violin-style", not "Violin" — it's a tuned patch, not a sample, per Out of Scope), Pad, Bass, Pluck/Bell
- [ ] Gesture → instrument switch on **gesture edge detection** (transition into a gesture), not per-frame re-triggering
- [ ] On-screen gesture legend showing which gesture maps to which instrument (UI-SPEC §2.4 — addresses discoverability, a confirmed table-stakes finding from FEATURES.md)
- [ ] Explicit "Start Audio" gate button — `Tone.start()` must run on a real user gesture (browser policy, not optional), with a clear "audio not started yet" state beforehand (SYNTH-09)
- [ ] Mic enable toggle (separate getUserMedia audio-only stream)
- [ ] Manual control sliders: master volume, filter cutoff, one time-based effect (reverb or delay) — SYNTH-08
- [ ] Mix synth output + mic input into one MediaStream (`Tone.context.createMediaStreamDestination()` + mic source node) for `shared/recorder.js`
- [ ] Record → preview (audio playback) → Download as audio file, or Retake

**Definition of done:** all 5 success criteria in ROADMAP.md Phase 3 are true.

---

## Phase 4 — Magic Mirror Face Filters

Folder: `.planning/phases/04-magic-mirror-face-filters/`
Requirements: FILT-01 through FILT-05

- [ ] `FaceLandmarker` via shared task-loader, `outputFaceBlendshapes: true`, `runningMode: "VIDEO"`
- [ ] 3+ filters drawn procedurally with canvas primitives (no image assets) — e.g. glasses (arcs positioned at eye landmarks), top hat (path positioned above forehead landmarks), mustache (curve at upper-lip landmarks), dog nose/ears
- [ ] Filter switcher (buttons/thumbnails) — must not reload the page or drop the camera stream
- [ ] Snapshot button → instant PNG download (no preview step needed for stills)
- [ ] Record/Stop → preview (video playback) → Download/Retake, using `canvas.captureStream()` + mic audio through `shared/recorder.js`

**Definition of done:** all 5 success criteria in ROADMAP.md Phase 4 are true.

---

## Phase 5 — Green Screen Studio (tightest per-frame performance budget — build carefully)

Folder: `.planning/phases/05-green-screen-studio/`
Requirements: GREEN-01 through GREEN-04

- [ ] `ImageSegmenter` via shared task-loader, `outputConfidenceMasks: true`, selfie segmenter model
- [ ] **Throttle `MPMask.getAsFloat32Array()` calls** — this readback costs ~80-100ms per call (confirmed in PITFALLS.md); do not call it more often than the frame budget allows, or segmentation will visibly lag
- [ ] Composite: draw video frame, use the confidence mask as alpha to blend in the chosen background (blur of the original frame / solid color / gradient / user-uploaded image)
- [ ] Background mode selector: Blur, Solid Color (color picker), Gradient (presets), Upload Image (file input)
- [ ] Record/Stop of the **composited** canvas output (not raw camera) → preview → Download/Retake video
- [ ] QA specifically on the actual per-frame rate achieved (not just "it renders") given the readback cost, and note any iOS Safari GPU-delegate quirks encountered (PITFALLS.md flagged this as a risk area)

**Definition of done:** all 4 success criteria in ROADMAP.md Phase 5 are true.

---

## Phase 6 — AI Chat (build last — isolated runtime family, needs a fresh API check)

Folder: `.planning/phases/06-ai-chat/`
Requirements: CHAT-01 through CHAT-08

- [ ] **Before writing any code**, re-verify MediaPipe GenAI's (`@mediapipe/tasks-genai` / `LlmInference`) current status — research found its docs currently show a maintenance-only banner recommending LiteRT-LM migration, and this ecosystem moves fast. Confirm the API shape/model formats haven't changed, and check whether LiteRT-LM has since shipped smaller model tiers (which would reopen that original choice — see PROJECT.md Key Decisions)
- [ ] Explicit WebGPU capability check on page load — **block with a clear message if unavailable, no WASM fallback exists for this demo** (CHAT-08). This must NOT reuse the vision demos' badge component as-is.
- [ ] Model tier picker: small (~250-300MB), medium (~700MB-1GB), large (~2-3GB) — verify current file format (`.task` vs `.litertlm`) and exact URLs against the live `litert-community` Hugging Face org at implementation time (don't trust stale URLs from planning)
- [ ] Verify anonymous fetch works for each tier (check for HF gating) before committing to the UI flow — spike-test this first
- [ ] Explicit "Initialize" button → manual `fetch()` + `ReadableStream` + progress tracking + Cache API storage (same proven pattern as the earlier LiteRT-LM prototype — do not rely on `vite-plugin-pwa`'s Workbox caching for these large files, per STACK.md)
- [ ] `LlmInference.createFromOptions()` with the cached model blob/path
- [ ] Prompt textarea + Generate button, `generateResponse(prompt, (partial, done) => {...})` streaming into the UI incrementally
- [ ] Time-to-first-token badge
- [ ] Cancel button for in-progress generation
- [ ] Confirm Cache API means a second visit skips the download entirely

**Definition of done:** all 5 success criteria in ROADMAP.md Phase 6 are true.

---

## Final Definition of Done (whole project)

- [ ] All 6 phases' success criteria verified true in a real browser (WebGPU path AND WASM-fallback path for the 4 vision demos; WebGPU-only path confirmed blocking correctly for Chat)
- [ ] Every one of the 44 requirements in `.planning/REQUIREMENTS.md` checked off
- [ ] Hub page links to all 5 live demos, each a clean full-page navigation
- [ ] Every demo tested for the full record/download (or draw/download) path at least once, downloaded file opened and confirmed valid (not corrupted/zero-byte)
- [ ] Camera/mic permission-denied and no-device paths tested for at least one demo (pattern is shared, doesn't need re-testing 5x)
- [ ] `npm run build && npm run preview` verified working, not just `npm run dev`
- [ ] Repo pushed to `https://github.com/peterish8/client-ai.git`
