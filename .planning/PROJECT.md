# MediaPipe Playground

## What This Is

A single Vite website ("MediaPipe Playground") that hosts five self-contained, creative, on-device AI demos, each showcasing a different Google MediaPipe capability. Every demo runs 100% client-side in the browser — no backend, no API keys, no telemetry — and every demo ends in something the user can keep: a downloaded recording, image, or audio file. It exists to let a visitor try real on-device AI/CV in under a minute and walk away with proof (a file) that it worked.

## Core Value

Every one of the 5 showcases must load a real MediaPipe model in-browser and produce a working, recordable/downloadable result from the user's own camera/mic/keyboard input — with zero server round-trips. If a demo can't do that, it isn't done.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] User can land on a hub page and see all 5 showcases as distinct cards, each launching to its own page
- [ ] User can chat with a fully local LLM (MediaPipe GenAI `LlmInference`), picking between small/medium/large model downloads, and see the answer stream in token-by-token
- [ ] User can play a gesture-controlled synthesizer with their hands (MediaPipe GestureRecognizer + Tone.js), switch between multiple instrument voices via gesture, sing along on mic, and download the mixed recording
- [ ] User can draw in the air with a pinch gesture (MediaPipe HandLandmarker), change colors, and download the finished drawing as a PNG
- [ ] User can see real-time AR face filters overlaid on their own webcam feed (MediaPipe FaceLandmarker), switch between filters, and download a snapshot or short recording
- [ ] User can replace or blur their background live with no physical green screen (MediaPipe ImageSegmenter), and download the recorded video
- [ ] Every demo has visible hardware/model status (loading progress, WebGPU/WASM backend indicator) and a graceful error boundary (camera/mic permission denied, model download failure, out-of-memory, browser incompatibility)

### Out of Scope

- Server-side inference or any API-key-gated cloud AI — the entire premise is on-device/zero-server; violates Core Value
- User accounts, saved galleries, or cloud storage of recordings — everything downloads locally, nothing is persisted server-side
- Mobile native apps — web-only for v1
- Real sampled-instrument audio (e.g. actual violin recordings) for the synth demo — approximated via tuned synth patches instead; sourcing/licensing real sample libraries is out of scope for v1
- Sign Language Speller and Pose Dance/Rep Counter showcases — considered as alternates during scoping, deliberately not selected for the initial 5

## Context

**Origin of this project:** Started as a single-page "ask a question, get a streamed local LLM answer" demo built against Google's early-preview **LiteRT-LM** (`@litert-lm/core`) web API. That prototype (root `index.html` + `app.js`, now superseded) was verified working end-to-end in a real headless browser, including a genuine multi-GB model download from Hugging Face streaming correctly with progress reporting. During that work we confirmed `@litert-lm/core` is real but still early-preview — it only ships 2 model sizes (E2B ~2GB, E4B ~3GB) in the web-ready `.litertlm` format, no small/fast option exists yet for that specific API.

**Why the pivot to MediaPipe GenAI:** The user wanted genuinely small/medium download tiers to try the demo quickly. Google's older-but-still-fully-supported **MediaPipe GenAI** (`@mediapipe/tasks-genai`, `LlmInference`) ships real small (270M, ~250-300MB) and medium (1B, ~700MB-1GB) quantized `.task` web models, alongside the same large E2B/E4B tiers. Both libraries are equally "on-device, zero-server" — the difference is architectural, not a privacy/local-vs-cloud tradeoff: MediaPipe GenAI is a generic multi-task framework (originally built for vision/audio tasks) with LLM support added as one more task; LiteRT-LM is purpose-built from scratch only for running conversational models. MediaPipe GenAI has the model size variety we need today, so the chat demo is being rebuilt on it.

**Why it grew into 5 demos:** Once the user saw "hands as an instrument, record and download" as an idea, the natural framing became a showcase site — one site, multiple MediaPipe capabilities, each demo proving a different Task API (LLM, hand landmarks, gesture classification, face landmarks, image segmentation) with a genuine creative hook, not a dry technical demo.

**APIs verified this session (treat as ground truth for planning, not to be re-researched):**
- `@mediapipe/tasks-genai`: `FilesetResolver.forGenAiTasks(wasmCdnPath)`, `LlmInference.createFromOptions(fileset, {baseOptions:{modelAssetPath}, maxTokens, topK, temperature, randomSeed})`, `llmInference.generateResponse(prompt, (partial, done) => {...})` streaming callback. No documented native cancel or download-progress callback — model bytes must be fetched/progress-tracked manually (same pattern proven in the LiteRT-LM prototype) and handed to `modelAssetPath` as a local blob URL or cached path.
- `@mediapipe/tasks-vision`: `FilesetResolver.forVisionTasks(wasmCdnPath)`. `HandLandmarker.createFromOptions(vision, {baseOptions:{modelAssetPath}, numHands, runningMode:"VIDEO"})` → `.detectForVideo(video, ts)` → `{landmarks, worldLandmarks, handedness}` (21 points/hand, normalized 0-1 x/y). `GestureRecognizer` — same shape plus `gestures: [{categoryName, score}]` with built-in categories `["None","Closed_Fist","Open_Palm","Pointing_Up","Thumb_Down","Thumb_Up","Victory","ILoveYou"]`. `FaceLandmarker.createFromOptions(vision, {outputFaceBlendshapes:true, runningMode:"VIDEO"})` → `.detectForVideo()` → `{faceLandmarks}` (478 points/face) `+ faceBlendshapes` (52 expression coefficients). `ImageSegmenter.createFromOptions(vision, {modelAssetPath, outputConfidenceMasks:true, runningMode:"VIDEO"})` → `.segmentForVideo(video, ts, cb)` → `result.confidenceMasks[0].getAsFloat32Array()` gives per-pixel person-probability 0..1 (readback costs ~80-100ms, budget for it).
- Official model asset URLs (storage.googleapis.com/mediapipe-models/...): hand_landmarker, face_landmarker, gesture_recognizer `.task` files (float16/1), and `image_segmenter/selfie_segmenter` `.tflite`. Chat models come from the `litert-community` Hugging Face org's `-web.task` files at 3 size tiers.
- Tone.js (`tone` on npm) for the synth engine: `Tone.start()` (must run on user gesture), synth voices (`Synth`, `AMSynth`, `FMSynth`, `MonoSynth`, `PolySynth`, `PluckSynth`, `MetalSynth`), effects (`Filter`, `Reverb`, `FeedbackDelay`), and `Tone.context.createMediaStreamDestination()` to tap the master bus into a `MediaStream` for `MediaRecorder`, mixed with the mic's own `MediaStreamAudioSourceNode`.

**Prior art referenced during showcase selection:** existing browser hand-tracking theremins (videotheremin, BigJobby's online theremin), Google's own official `mediapipe-samples-web` repo (gesture recognizer / face landmarker / hand landmarker / image segmenter demos), and the "air canvas" / gesture-drawing genre of creative-coding demos.

**Environment:** Windows 11, Node v24.18.0 / npm 11.16.0 available. No prior git repo in this directory — initialized fresh this session, remote wired to `https://github.com/peterish8/client-ai.git` (empty repo, created by the user, not yet pushed).

## Constraints

- **Tech stack**: Vite, vanilla JS (no framework — but use `jsconfig.json` + `checkJs` against MediaPipe's shipped `.d.ts` files for type-checking without converting to real `.ts`, per stack research), Tailwind **v4** via `@tailwindcss/vite` (not v3/autoprefixer, not the CDN play-script used in the earlier prototype) — user explicitly asked for "a proper vite website"
- **Architecture**: Multi-page app (one HTML entry point per demo) rather than an SPA — each demo loads its own heavy WASM/ML runtime; keeping them as separate pages avoids loading all 5 model runtimes at once and mirrors how Google's own official samples repo is structured
- **Zero server**: no backend of any kind; model files are fetched directly from their public CDN/HF URLs at runtime and cached client-side (Cache API), same pattern proven in the LiteRT-LM prototype
- **Self-host MediaPipe WASM, don't CDN-load it**: research corrected the original ground truth — Google's own current `mediapipe-samples-web` repo copies `node_modules/@mediapipe/*/wasm` into `public/wasm/` via a `copy-wasm.js` prebuild script and serves it same-origin. Vite config also needs `worker: { format: 'es' }` and `optimizeDeps: { exclude: ['@mediapipe/tasks-vision', '@mediapipe/tasks-genai'] }` to avoid dev-mode esbuild pre-bundling breaking wasm/worker loading
- **MediaPipe GenAI (`LlmInference`) has NO WASM/CPU fallback** — unlike the 4 vision demos, it hard-requires WebGPU with no documented delegate alternative. The Chat demo needs its own stricter capability-check path (block/explain clearly if WebGPU is unavailable) rather than reusing the vision demos' "WebGPU optional, WASM fallback" badge logic
- **No external asset files for AR content**: face filter overlays (glasses, hats, etc.) must be drawn procedurally with canvas primitives, not sourced image/PNG stickers — avoids asset licensing and keeps the repo self-contained
- **Browser APIs relied on**: `getUserMedia` (camera+mic), `MediaRecorder` (+ `fix-webm-duration` — Chromium's webm output reliably lacks duration metadata, near-mandatory small dependency for all 3 recording demos), `canvas.captureStream()`, Web Audio API, Cache API, WebGPU (optional w/ WASM/XNNPACK fallback for the 4 vision demos; **mandatory, no fallback**, for the Chat demo) — every demo needs a real permission/error boundary for when these are denied or unsupported
- **Detection loop timestamps**: `detectForVideo()`/`segmentForVideo()` require a monotonically-increasing timestamp per task instance — must use a running counter or `performance.now()`, never `Date.now()` or a value that can repeat/go backwards; violating this throws an unrecoverable error requiring the task instance to be destroyed and recreated
- **Hosting target undecided**: GitHub Pages cannot set custom response headers, so COOP/COEP (and the faster SharedArrayBuffer-based WASM variant) aren't available there without a client-side polyfill (`coi-serviceworker`); Netlify/Vercel/Cloudflare Pages support headers natively. Needs a decision before/during the shared-infrastructure phase

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Pivot chat demo from `@litert-lm/core` (LiteRT-LM) to `@mediapipe/tasks-genai` (MediaPipe GenAI) | LiteRT-LM early-preview only ships 2GB/3GB model tiers; MediaPipe GenAI has real small (~280MB) and medium (~750MB) tiers the user explicitly wants | ✓ Good — confirmed real files exist at litert-community HF org |
| Expand from 1 chat demo to a 5-demo showcase site | User's own idea ("hand as instrument") plus a want to demonstrate breadth of MediaPipe Tasks on one site | — Pending |
| Selected exactly these 5: AI Chat, Gesture Synth Instrument, Air Canvas, Magic Mirror Face Filters, Green Screen Studio | Covers all major MediaPipe task families (LLM, hands, gestures, face, segmentation); each has a genuine "download something real" payoff | ✓ Good — user approved this exact lineup |
| Multi-page Vite app instead of SPA | Avoids loading 5 concurrent WASM/ML runtimes; matches official MediaPipe samples repo structure | — Pending |
| Face filters drawn procedurally on canvas, not image assets | Avoids sourcing/licensing sticker art, keeps repo self-contained | — Pending |
| Violin/other instrument voices are tuned synth patches, not sampled audio | No royalty-free sample source lined up; synth approximation is honest and immediate | — Pending |
| Planning-first workflow via GSD (this document + research + requirements + roadmap + PRD/UI-SPEC/FLOW/TODO docs) before any code | User explicitly wants to review all planning docs before implementation starts | — Pending |
| Git repo initialized fresh, remote set to `github.com/peterish8/client-ai` (not yet pushed) | User created an empty GitHub repo and asked for it to be wired up alongside planning setup | ✓ Good |
| Self-host MediaPipe WASM via `copy-wasm.js` instead of CDN-loading | Google's own current official samples repo does this; pairs with COOP/COEP for the faster SIMD+threaded WASM variant | ✓ Good — corrects earlier CDN assumption from the LiteRT-LM prototype phase |
| Chat demo gets its own stricter WebGPU-only capability check, separate from the vision demos' WASM-fallback badge | `LlmInference` has no documented CPU/WASM delegate at all — confirmed via pitfalls research | ✓ Good — this was previously assumed to follow the same fallback pattern as the vision demos, which was wrong |
| Re-verify MediaPipe GenAI's status at the start of the Chat demo phase, not just trust this session's research | Google's own docs currently show a maintenance-only banner recommending LiteRT-LM migration — the ecosystem here moves fast enough that a second check-in is warranted | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-07-27 after initialization*
