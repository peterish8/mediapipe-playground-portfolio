# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-07-27)

**Core value:** Every one of the 5 showcases must load a real MediaPipe model in-browser and produce a working, recordable/downloadable result from the user's own camera/mic/keyboard input — with zero server round-trips.
**Current focus:** Phase 1 — Shared Infrastructure

## Current Position

Phase: 1 of 6 (Shared Infrastructure)
Plan: 0 of TBD in current phase
Status: Ready to plan
Last activity: 2026-07-27 — ROADMAP.md and STATE.md created from requirements + research; 44/44 v1 requirements mapped across 6 phases

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**
- Total plans completed: 0
- Average duration: N/A
- Total execution time: 0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**
- Last 5 plans: N/A
- Trend: N/A

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Roadmap: Shared Infrastructure sequenced first (Phase 1) — highest-leverage single decision per research, fixes 5 known pitfall classes once instead of five times downstream
- Roadmap: Phases 2-6 (the five showcases) are architecturally independent once Phase 1 lands; sequenced 2→6 by ascending risk (Air Canvas → Gesture Synth → Magic Mirror → Green Screen → AI Chat), not by hard dependency
- Roadmap: AI Chat placed last (Phase 6) due to its isolated GenAI runtime, hard WebGPU-only requirement (no WASM fallback), and an explicit re-verification requirement at phase start (MediaPipe GenAI's maintenance-only status may have shifted)

### Pending Todos

None yet.

### Blockers/Concerns

- Hosting target undecided (GitHub Pages vs Netlify/Vercel/Cloudflare Pages) — affects whether COOP/COEP headers (and the faster SharedArrayBuffer WASM variant) are available; needs a decision during Phase 1 (see PROJECT.md Constraints)
- Phase 6 (AI Chat) must re-verify MediaPipe GenAI's API lifecycle status and litert-community HF model-tier availability at phase start, not trust planning-time research (docs showed a maintenance-only banner recommending LiteRT-LM migration as of this research session)
- Phase 5 (Green Screen Studio) needs a build-time performance spike for ImageSegmenter's throttled mask-readback pattern before committing to a target frame rate in UI copy, plus explicit iOS Safari QA for the known GPU-delegate mask-correctness issue
- Phase 3 (Gesture Synth Instrument) audio+audio mixing (Tone.js + mic into one MediaRecorder-compatible stream) is a novel integration point — worth a small implementation spike before full build-out

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| v2 Showcases | SHOW-01 Sign Language Speller, SHOW-02 Pose Dance Mirror/Rep Counter | Deferred to v2 | Requirements definition |
| v2 Polish | POLISH-01 shareable deep links, POLISH-02 real sampled-instrument audio, POLISH-03 mobile-responsive touch controls | Deferred to v2 | Requirements definition |

## Session Continuity

Last session: 2026-07-27
Stopped at: ROADMAP.md and STATE.md created; REQUIREMENTS.md traceability updated with finalized phase mappings
Resume file: None
