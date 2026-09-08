# AGENTS.md — Guide for AI Coding Agents

This file is for any AI agent working in this repo — Codex, Cursor, a fresh Claude session without the GSD skill set, or anything else. If you're Claude Code with GSD installed, `CLAUDE.md` also applies and takes precedence on workflow mechanics (slash commands, etc.); this file is the tool-agnostic version of the same guidance.

## What this project is

A Vite multi-page website with 5 independent, on-device MediaPipe demos (chat, gesture synth, air canvas, face filters, green screen). Zero server, zero API keys — everything runs in the visitor's browser. Full context: `.planning/PROJECT.md`.

## Before you write any code

1. Read `.planning/PROJECT.md`, `.planning/REQUIREMENTS.md`, and `.planning/ROADMAP.md` — these are the source of truth for scope and sequencing, not this file.
2. Check `TODO.md` for the phase-by-phase checklist and `.planning/phases/<NN-name>/` for phase-specific detail (each phase folder has its own `resources/` subfolder).
3. **Phase 1 (Shared Infrastructure) must exist before any of the 5 demo phases.** Phases 2-6 are mutually independent of each other, but all depend on Phase 1's shared modules (camera, task-loader, recorder, error-boundary, backend badge, lifecycle cleanup).
4. Don't reduce scope, skip requirements, or invent new ones without checking `.planning/REQUIREMENTS.md` — every requirement has an ID (e.g. `CANVAS-03`) referenced across the roadmap and TODO.

## Non-negotiable technical constraints

These came out of verified research (`.planning/research/`) and correct earlier assumptions — don't relitigate them without a real reason:

- **Self-host MediaPipe's WASM files**, don't CDN-load them. Copy `node_modules/@mediapipe/*/wasm` into `public/wasm/` via a build-time script (`copy-wasm.js` pattern), same as Google's own official `mediapipe-samples-web` repo.
- **`@mediapipe/tasks-genai` (`LlmInference`, the Chat demo) has no WASM/CPU fallback.** It hard-requires WebGPU. Don't reuse the vision demos' "WebGPU optional, WASM fallback" badge logic for Chat — it needs its own blocking capability check.
- **Detection loop timestamps must be monotonically increasing.** Use a running counter or `performance.now()` for every `detectForVideo()`/`segmentForVideo()` call — never `Date.now()`, never a value that can repeat or go backwards. Violating this throws an error that requires destroying and recreating the task instance; it does not soft-recover.
- **Close every MediaPipe task instance and stop every camera/mic track on page teardown** (`.close()`, `track.stop()`). This is a shared-infra concern, not per-demo.
- **`MPMask.getAsFloat32Array()` (Green Screen Studio) costs ~80-100ms per call.** Don't call it more often than the frame budget allows — throttle it, don't call it every animation frame.
- **Recordings need `fix-webm-duration`** applied before download — Chromium's `MediaRecorder` output reliably lacks duration metadata, this isn't an edge case.
- **Record → preview → download, never auto-download on stop.** Every recording-capable demo shows a preview (playback) before committing to a download, with a Retake option.
- **`Tone.start()` (Gesture Synth demo) must run on an explicit user gesture**, not automatically — browser policy, not a Tone.js quirk. Show a clear "audio not started" state before that click.
- **Vite config needs `worker: { format: 'es' }`** and `optimizeDeps: { exclude: ['@mediapipe/tasks-vision', '@mediapipe/tasks-genai'] }`, or dev-mode pre-bundling breaks WASM/worker loading.
- **No SPA router.** Multi-page architecture is intentional — one HTML entry point per demo, so only one demo's ML runtime is ever loaded at a time. Don't "simplify" this into a single-page app.
- **No external image assets for AR filters.** Face filter overlays are drawn procedurally with canvas primitives.

Full detail and rationale for all of these: `.planning/research/PITFALLS.md` and `.planning/research/STACK.md`.

## Conventions

- Vanilla JS, no framework — but use `jsconfig.json` + `checkJs` against MediaPipe's shipped `.d.ts` files for type-checking. Don't convert to real `.ts` files without discussing it first (explicit project constraint).
- Tailwind CSS **v4** via `@tailwindcss/vite` (not v3, not `autoprefixer`, not a CDN script tag).
- Dark theme only, emerald accent — see `docs/UI-SPEC.md` §1 for the full design system (colors, components, layout).

## Verifying your work

- A phase isn't done until its success criteria in `.planning/ROADMAP.md` are true **in a real browser**, not just "the code compiles."
- Run the full `npm run build && npm run preview` cycle, not just `npm run dev` — WASM serving has historically diverged between the two for this stack.
- Test both the WebGPU path and the WASM-fallback path for the 4 vision demos where practical; Chat only has the WebGPU path (see above).
- Check off requirements in `.planning/REQUIREMENTS.md` as they're genuinely satisfied, not just attempted.

## If something in research turns out stale

The research docs are dated 2026-07-27. MediaPipe GenAI's API was flagged as moving fast (its docs currently show a maintenance-only banner recommending LiteRT-LM) — re-verify its status before starting Phase 6 (AI Chat) rather than trusting this file or the research docs blindly. If you find something has changed, update the relevant `.planning/` doc rather than silently working around it.
