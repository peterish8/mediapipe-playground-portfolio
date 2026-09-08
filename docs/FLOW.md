# Website Flow — MediaPipe Playground

**Status:** Draft for review
**Last updated:** 2026-07-27

## 1. Sitemap

Multi-page architecture (per PROJECT.md's Architecture constraint) — every node below is a separate HTML entry point, full page navigation between them, no client-side router.

```
/                              Hub / Landing page
├── /chat/                     On-Device AI Chat
├── /instrument/                Gesture Synth Instrument
├── /canvas/                    Air Canvas
├── /filters/                   Magic Mirror Face Filters
└── /greenscreen/                Green Screen Studio
```

Every demo page links back to `/` via a persistent "← Playground" header link (see UI-SPEC.md §2.2).

## 2. Universal Page Flow (applies to all 4 camera-based demos)

```
┌─────────────────┐
│   Hub page       │
│  (click a card)  │
└────────┬─────────┘
         │ full page navigation
         ▼
┌──────────────────────────┐
│  Demo page loads          │
│  Permission priming panel │◄──────────────┐
│  shown, model NOT loaded  │                │
│  yet, camera NOT on yet   │                │
└────────┬───────────────────┘              │
         │ user clicks "Enable camera        │
         │  and start" (explicit opt-in)     │
         ▼                                   │
┌──────────────────────────┐                │
│ getUserMedia() prompt      │                │
└────────┬─────────┬────────┘                │
         │ allow    │ deny/error              │
         ▼          └──────────────►┌─────────┴──────────┐
┌──────────────────────────┐        │ Error boundary panel │
│ Model download + init     │        │ (PLAT-04): specific, │
│ progress bar shown         │        │ actionable message,  │
│ (PLAT-05, PLAT-06)         │        │ "Try again" retries   │
└────────┬───────────────────┘        └───────────────────────┘
         │ success           │ network/CORS/OOM failure
         ▼                   ▼
┌──────────────────────────┐  (PLAT-07 error boundary, same
│  Live detection loop       │   panel pattern, "Try again")
│  running — user interacts  │
│  with the demo              │
└────────┬───────────────────┘
         │ user triggers a "keep this" action
         ▼
┌──────────────────────────┐
│  Local download (PLAT-09)  │
│  PNG / webm-video / audio  │
│  file saved to disk         │
└────────┬───────────────────┘
         │ user clicks back-link, or closes tab
         ▼
┌──────────────────────────┐
│  Camera/mic stream stopped, │
│  MediaPipe task instances    │
│  closed (PLAT-08)            │
└──────────────────────────┘
```

The **AI Chat** demo follows the same shape minus the camera/mic steps — "Enable camera and start" is replaced by "pick a model tier → Initialize", and the interaction loop is type-a-question / read-a-streamed-answer instead of a live video loop.

## 3. Per-Demo Interaction Loops

### 3.1 AI Chat
```
WebGPU capability check (blocking — no WASM fallback exists for this demo)
   → [if unsupported] "WebGPU required" message, dead end
   → [if supported] pick model tier (small/medium/large)
   → Initialize (download + cache, progress bar)
   → [ready] type question → Generate
   → answer streams in token-by-token, TTFT badge appears
   → (optional) Stop mid-generation
   → ask another question, or navigate away
```

### 3.2 Gesture Synth Instrument
```
Enable camera → hand tracking begins, skeleton overlay visible
   → "Start Audio" gate click (unlocks AudioContext)
   → move hand vertically → pitch changes (scale-quantized)
   → move other hand → volume/filter changes
   → make a recognized gesture → instrument voice switches
   → (optional) enable mic → sing/talk alongside
   → Record → perform → Stop
   → preview the recording (playback) → Download, or Retake (discard + re-arm Record)
```

### 3.3 Air Canvas
```
Enable camera → fingertip tracking begins, tracked dot visible
   → pinch thumb+index → "pen down", move hand → line drawn
   → release pinch → "pen up", move without drawing
   → click color swatch → subsequent strokes use new color
   → (optional) Clear → canvas wiped
   → Download PNG
```

### 3.4 Magic Mirror Face Filters
```
Enable camera → face tracking begins
   → default filter shown live, tracked to face
   → click a different filter → swaps instantly, tracking uninterrupted
   → Snapshot → PNG downloads immediately (no preview step)
   → or: Record → perform → Stop → preview clip → Download, or Retake
```

### 3.5 Green Screen Studio
```
Enable camera → segmentation begins, composited output shown live
   → pick background mode: Blur | Solid Color | Gradient | Upload Image
   → (if Upload Image) file picker → chosen image becomes live backdrop
   → Record → perform → Stop → preview composited clip → Download, or Retake
```

## 4. Error & Edge-Case Flows

- **Permission denied at the browser prompt** → error boundary panel, message specific to "camera access was denied," with a "Try again" action that re-triggers the permission request (not a full page reload)
- **No camera/mic device present** → error boundary panel distinguishing this from a permission denial (different root cause, different fix for the user)
- **Model download fails (network/CORS/404)** → error boundary panel naming the likely cause per PLAT-07, "Try again" re-attempts the download
- **Out of memory during model load** → error boundary panel suggesting closing other tabs / trying a smaller model tier (Chat demo only, where tiers exist)
- **Browser lacks WebGPU** → not an error — WASM/XNNPACK fallback badge shown instead, demo proceeds normally at reduced performance
- **Navigating away mid-recording** → recording is stopped and discarded (no partial-file download); this is acceptable per Out of Scope (no draft/resume persistence)

## 5. Navigation Rules

- Back-link on every demo page always returns to `/` (hub), never to browser-history-dependent behavior
- No deep-linking into a specific demo *state* (e.g. a specific filter pre-selected) in v1 — see PRD.md §4 Non-Goals and REQUIREMENTS.md POLISH-01 (deferred to v2)
- Each demo page is a dead end other than the hub back-link — no cross-links between demos (e.g. Chat doesn't link to Canvas) to keep each page's cognitive load minimal
