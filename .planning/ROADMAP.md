# Roadmap: MediaPipe Playground

## Overview

The journey builds one shared foundation, then five independent showcase demos on top of it. Phase 1 (Shared Infrastructure) delivers the hub page and the cross-cutting plumbing every demo needs — camera/mic permission handling, model-loading progress, backend/capability badges, the recording→download flow, and MediaPipe task-instance lifecycle cleanup — fixing the project's highest-leverage pitfalls (timestamp monotonicity, task-instance leaks, mimeType cascades, recording stop-order corruption) once instead of five times. Once Phase 1 lands, Phases 2-6 are architecturally independent showcases that can be built or reviewed in any order (each is its own MediaPipe Task, its own page, its own model runtime) — they are sequenced 2→6 here by ascending implementation risk per research: Air Canvas (simplest, validates the shared pattern end-to-end) → Gesture Synth Instrument (adds audio mixing) → Magic Mirror Face Filters (new vision task, no audio) → Green Screen Studio (tightest per-frame performance budget) → AI Chat (architecturally isolated GenAI runtime, hard WebGPU requirement, needs a start-of-phase re-verification step). The project is complete when all 5 showcases are live on the hub, each loading a real MediaPipe model in-browser and producing a genuine downloadable artifact with zero server round-trips.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Shared Infrastructure** - Hub page + cross-cutting camera/model-loading/backend-badge/recording/cleanup plumbing every demo depends on
- [ ] **Phase 2: Air Canvas** - Pinch-to-draw in the air with live hand tracking, downloadable as PNG
- [ ] **Phase 3: Gesture Synth Instrument** - Gesture-controlled synth with mic sing-along, downloadable as a mixed audio recording
- [ ] **Phase 4: Magic Mirror Face Filters** - Real-time AR face filters, downloadable as snapshot or video
- [ ] **Phase 5: Green Screen Studio** - Real-time background replacement/blur, downloadable as video
- [ ] **Phase 6: AI Chat** - Fully local streaming LLM chat with model-size tiers and WebGPU capability gate

## Phase Details

### Phase 1: Shared Infrastructure
**Goal**: A visitor can land on a hub page, see all 5 showcases, and every demo built afterward inherits working permission handling, model-loading feedback, backend/capability badging, recording/download, and clean teardown — so no demo phase has to invent this plumbing from scratch.
**Depends on**: Nothing (first phase)
**Requirements**: PLAT-01, PLAT-02, PLAT-03, PLAT-04, PLAT-05, PLAT-06, PLAT-07, PLAT-08, PLAT-09
**Success Criteria** (what must be TRUE):
  1. User can land on the hub page and see all 5 showcases as distinct cards (name, one-line description, launch link), and navigating to any one is a full separate page load — only one demo's ML runtime is ever active at a time
  2. Every camera/mic-based demo explains why access is needed before the browser permission prompt appears, and shows a specific, actionable error message if permission is denied or no device is present
  3. Every demo shows a loading state with a progress indicator while its model downloads/initializes, and a visible hardware backend indicator (WebGPU vs WASM/CPU fallback, or an explicit "WebGPU required" gate for the Chat demo)
  4. If a model fails to download or the browser runs out of memory, the user sees a specific error message explaining what happened — never a blank page or unhandled crash
  5. Leaving any demo page cleanly stops camera/mic streams and releases MediaPipe task instances (no dangling camera indicator or leak across repeated visits), and every recording/download action saves a genuine local file with zero server upload
**Plans**: TBD
**UI hint**: yes

### Phase 2: Air Canvas
**Goal**: A visitor can draw in the air with a pinch gesture, tracked live via webcam, and keep the result as a downloaded PNG.
**Depends on**: Phase 1
**Requirements**: CANVAS-01, CANVAS-02, CANVAS-03, CANVAS-04, CANVAS-05
**Success Criteria** (what must be TRUE):
  1. User can draw a continuous line in the air by pinching thumb and index finger together and moving their hand, tracked live via webcam
  2. Releasing the pinch stops drawing (lifts the "pen") without erasing existing strokes
  3. User can change the drawing color via an on-screen swatch or gesture
  4. User can clear the entire canvas with one explicit action
  5. User can download the current drawing as a PNG image file
**Plans**: TBD
**UI hint**: yes

### Phase 3: Gesture Synth Instrument
**Goal**: A visitor can play an expressive, gesture-controlled synthesizer with their hands, sing along on mic, and keep the result as a downloaded mixed audio recording.
**Depends on**: Phase 1
**Requirements**: SYNTH-01, SYNTH-02, SYNTH-03, SYNTH-04, SYNTH-05, SYNTH-06, SYNTH-07, SYNTH-08, SYNTH-09
**Success Criteria** (what must be TRUE):
  1. User's hand position controls pitch mapped to a musical scale (not raw unquantized frequency), and a second hand or axis controls volume or filter cutoff for expressive control
  2. User can switch between at least 4 distinct instrument voices using a recognized hand gesture (no keyboard/mouse needed), with the current instrument name and currently-played note visibly displayed
  3. User can enable their microphone to sing or speak alongside the instrument
  4. User can start and stop a recording that mixes the instrument audio and mic input into a single track, then download it as a standard audio file
  5. User has manual controls for at least master volume, a filter parameter, and one time-based effect (reverb/delay), and audio only starts after an explicit user gesture (e.g. clicking "Start") with a clear "not started yet" indication beforehand
**Plans**: TBD

### Phase 4: Magic Mirror Face Filters
**Goal**: A visitor can see real-time AR face filters overlaid on their own webcam feed and keep the result as a downloaded snapshot or recording.
**Depends on**: Phase 1
**Requirements**: FILT-01, FILT-02, FILT-03, FILT-04, FILT-05
**Success Criteria** (what must be TRUE):
  1. User sees at least 3 selectable AR filters (e.g. glasses, top hat, mustache, dog nose/ears) rendered live, tracked to their face position/orientation via webcam
  2. Filters are drawn entirely with canvas primitives, not external image assets
  3. User can switch between filters without reloading the page or losing camera access
  4. User can take a snapshot of the current filtered view and download it as a PNG
  5. User can start/stop a video recording of the filtered view (with audio) and download it as a video file
**Plans**: TBD
**UI hint**: yes

### Phase 5: Green Screen Studio
**Goal**: A visitor can replace or blur their background live with no physical green screen and keep the result as a downloaded recorded video.
**Depends on**: Phase 1
**Requirements**: GREEN-01, GREEN-02, GREEN-03, GREEN-04
**Success Criteria** (what must be TRUE):
  1. User's background is separated from their body in real time via webcam with no physical green screen required
  2. User can choose from at least: background blur, a solid color, and a preset gradient
  3. User can upload their own image to use as the replacement background
  4. User can start/stop a recording of the composited (background-replaced) view and download it as a video file
**Plans**: TBD

### Phase 6: AI Chat
**Goal**: A visitor can chat with a fully local LLM, choosing a model-size tier, and watch the answer stream in token-by-token — never leaving the browser.
**Depends on**: Phase 1
**Requirements**: CHAT-01, CHAT-02, CHAT-03, CHAT-04, CHAT-05, CHAT-06, CHAT-07, CHAT-08
**Success Criteria** (what must be TRUE):
  1. Before any model picker is shown, the page checks for WebGPU support and blocks with a clear "WebGPU required, not available in this browser" message if it's missing — no way to proceed without it, since this demo has no WASM/CPU fallback path
  2. User can pick between at least 3 model size tiers (small ~250-300MB, medium ~700MB-1GB, large ~2-3GB) and click an explicit "Initialize" action that downloads the selected model with a visible progress bar (percent + bytes transferred)
  3. Once initialized, the model is cached (Cache API) so revisiting the page does not re-download it
  4. User can type a question, submit it, and see the response stream into the UI token-by-token/chunk-by-chunk with a time-to-first-token indicator shown after asking
  5. User can cancel an in-progress generation
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phase 1 must complete first. Phases 2-6 are mutually independent once Phase 1 lands (no cross-demo dependencies) — the order below (2 → 3 → 4 → 5 → 6) reflects ascending implementation risk per research, not a hard dependency chain. They may be planned/built in parallel or in any order if preferred.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Shared Infrastructure | 0/TBD | Not started | - |
| 2. Air Canvas | 0/TBD | Not started | - |
| 3. Gesture Synth Instrument | 0/TBD | Not started | - |
| 4. Magic Mirror Face Filters | 0/TBD | Not started | - |
| 5. Green Screen Studio | 0/TBD | Not started | - |
| 6. AI Chat | 0/TBD | Not started | - |
