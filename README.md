# MediaPipe Playground

Five creative, on-device AI demos in one multi-page Vite website. Every showcase runs in the visitor's browser with Google MediaPipe—no application backend, API key, account, telemetry, or server upload—and every demo produces something the visitor can keep.

> **Status:** v1 and the Gesture Synth V2 source are complete and CI-verified. Final hardware QA still requires a real Chromium browser with camera, microphone, and WebGPU access; the expressive musical controls also need real-device feel tuning.

## The 5 Showcases

| Demo | What it does | Downloadable result |
|---|---|---|
| **On-Device AI Chat** | Loads a local Gemma model through MediaPipe `LlmInference`, caches it, and streams responses with time-to-first-token reporting. | Generated text can be copied locally |
| **Gesture Synth Instrument** | Uses a stable Sound Hand to select/play Bass, Violin-style, Pad, or Synth while the Expression Hand conducts cutoff, reverb, intensity, vibrato, risers, drops, and effect freeze. | Mixed WebM audio recording |
| **Air Canvas** | Uses thumb/index pinch detection to draw in mid-air with selectable colors. | PNG artwork |
| **Magic Mirror** | Tracks the face and draws four procedural AR filters with canvas primitives. | PNG snapshot or WebM video |
| **Green Screen Studio** | Segments the person locally and composites blur, solid, gradient, or uploaded-image backgrounds. | WebM composited video |

## Gesture Synth Performance Mode

The instrument uses MediaPipe handedness rather than detection order, so each hand keeps a predictable role. The default Sound Hand is Right and can be swapped from the interface.

### Sound Hand

- Pinch thumb and index finger to gate a note; separate on/off thresholds prevent chatter.
- Move vertically through a scale-quantised note range with note-boundary hysteresis.
- Hold a preset gesture for 700 ms to switch intentionally:
  - Victory → Synth
  - Thumb Up → Violin-style
  - Open Palm → Pad
  - Closed Fist → Bass

### Expression Hand

- Raise/lower → low-pass cutoff and brightness.
- Move sideways → delay/reverb space.
- Open/close → intensity and gain.
- Tilt the palm → vibrato depth.
- Closed Fist → freeze the current expression.
- Fast upward/downward sweeps → riser/drop accents with cooldown protection.

The Tone.js signal path is `preset → expression gain → filter → vibrato → feedback delay → reverb → compressor → limiter → master`. All continuous parameters use short ramps, and the existing microphone mix, recording, preview, retake, and download flow remains available.

## Architecture

This is intentionally a **multi-page application**, not an SPA. Each demo has a separate HTML entry point, so navigating away allows the browser to reclaim its camera streams, WASM heap, and model runtime instead of keeping all five ML tasks alive together.

```text
/
├── chat/          MediaPipe GenAI / LlmInference
├── instrument/    GestureRecognizer + Tone.js
├── canvas/        HandLandmarker
├── filters/       FaceLandmarker
└── greenscreen/   ImageSegmenter
```

Shared modules in `src/shared/` provide:

- camera and microphone permission handling with specific error classification
- separate Vision and GenAI `FilesetResolver` paths
- byte-level model download progress and Cache API storage
- WebGPU/WASM capability badges and a blocking WebGPU gate for Chat
- monotonic timestamps for every video inference call
- MediaPipe task and media-track cleanup on page teardown
- MIME-type negotiation, WebM duration repair, recording preview, retake, and download
- canvas helpers, local downloads, error boundaries, and detection-loop lifecycle

Gesture Synth additionally separates deterministic landmark/control logic in `src/instrument/performance-controls.js` from Tone.js routing in `src/instrument/performance-audio.js`.

MediaPipe WASM files are copied from `node_modules` into `public/wasm/` before development and production builds; no runtime WASM CDN is used.

## Tech Stack

- Vite 8 multi-page build
- Vanilla JavaScript with TypeScript `checkJs`
- Tailwind CSS 4 through `@tailwindcss/vite`
- `@mediapipe/tasks-vision` and `@mediapipe/tasks-genai`
- Tone.js
- `fix-webm-duration`
- Cache API, WebGPU, Web Audio, Canvas, `MediaRecorder`, and `getUserMedia`

## Run Locally

Requirements: Node.js 22+ and a current Chromium-based browser.

```bash
npm install
npm run dev
```

Production verification:

```bash
npm run verify
npm run preview
```

`npm run verify` performs JavaScript type checking, unit tests, WASM copying, and a complete Vite production build.

## Browser and Model Notes

- The four vision demos can request a GPU delegate when WebGPU is available and otherwise use MediaPipe's CPU/WASM path.
- The Chat demo is stricter: MediaPipe `LlmInference` requires WebGPU and blocks before downloading a model when no adapter is available.
- The small and medium Gemma repositories are license-gated on Hugging Face. A 401/403 means the model license/access requirement must be handled before the browser can fetch that file. The UI reports this explicitly instead of failing silently.
- Model files can be hundreds of megabytes or several gigabytes. They are cached locally after a successful first download.
- Vercel headers are included for cross-origin isolation. A host that cannot set COOP/COEP headers may run a slower WASM path.

## Project Documentation

- [`docs/PRD.md`](docs/PRD.md) — product goals and scope
- [`docs/UI-SPEC.md`](docs/UI-SPEC.md) — visual and interaction system
- [`docs/FLOW.md`](docs/FLOW.md) — sitemap and user journeys
- [`.planning/PROJECT.md`](.planning/PROJECT.md) — constraints and decisions
- [`.planning/REQUIREMENTS.md`](.planning/REQUIREMENTS.md) — 44 v1 requirements
- [`.planning/ROADMAP.md`](.planning/ROADMAP.md) — six implementation phases
- [`docs/superpowers/specs/2026-07-27-two-hand-performance-mode-design.md`](docs/superpowers/specs/2026-07-27-two-hand-performance-mode-design.md) — approved expressive-instrument design
- [`docs/superpowers/plans/2026-07-27-two-hand-performance-mode.md`](docs/superpowers/plans/2026-07-27-two-hand-performance-mode.md) — implementation and verification plan
- [`TODO.md`](TODO.md) — execution and physical-browser QA checklist

## Privacy

Camera frames, microphone audio, prompts, model inference, and generated artifacts remain in the browser. The application has no account system, analytics endpoint, storage backend, or upload path.