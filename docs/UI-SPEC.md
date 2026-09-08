# UI Spec — MediaPipe Playground

**Status:** Draft for review
**Last updated:** 2026-07-27

This extends the dark/emerald visual language already established in the earlier chat prototype (root `index.html`, now superseded but visually the reference point) into a full design system for the 5-page site.

## 1. Design System

### 1.1 Color palette

Dark theme only for v1 (matches the existing prototype; no light-mode requirement).

| Token | Value | Usage |
|-------|-------|-------|
| `bg-base` | `neutral-950` (#0a0a0a) | Page background |
| `bg-surface` | `neutral-900/60` | Cards, panels |
| `bg-surface-solid` | `neutral-900` | Code blocks, inputs |
| `border-default` | `neutral-800` | Card/panel borders |
| `border-focus` | `emerald-500` | Focused inputs |
| `text-primary` | `neutral-100` | Body text |
| `text-secondary` | `neutral-400` / `neutral-500` | Labels, captions |
| `text-muted` | `neutral-600` | Placeholder/disabled text |
| `accent` | `emerald-400` / `emerald-500` | Primary actions, active states, "on" indicators |
| `error` | `red-400` / `red-950` bg | Error boundary panels |
| `warning` | `amber-400` / `amber-950` bg | WASM-fallback badge, non-fatal warnings |

### 1.2 Typography

- Body: system sans stack (Tailwind default)
- Badges, status text, technical labels: `font-mono`, `text-[11px]` to `text-xs`, uppercase tracking-widest for section eyebrows
- Headings: semibold, tight tracking (`tracking-tight`)

### 1.3 Recurring components

**Status badge** (top-right corner, fixed, stacked): pill-shaped, `font-mono text-[11px]`, one of:
- Hardware backend: `⚡ WebGPU Accelerated` (emerald) / `🧮 WASM CPU Fallback` (amber)
- Performance metric: e.g. `TTFT: 420ms`, `24 fps`, hidden until a value exists

**Card** (hub page showcase tiles, and general panels): `rounded-2xl border border-neutral-800 bg-neutral-900/60 p-5 sm:p-6`

**Primary button**: solid emerald or solid white/neutral-100 depending on context (emerald = "start/initialize" actions, white = "do the thing" actions like Generate/Record), `rounded-xl`, disabled state at 40-50% opacity

**Secondary/outline button**: `border border-neutral-700`, hover state tints toward the semantic color (red for destructive/stop, emerald for positive)

**Progress bar**: `h-2 rounded-full bg-neutral-800` track, emerald fill, indeterminate shimmer variant when total size is unknown

**Error boundary panel**: `rounded-2xl border border-red-900/60 bg-red-950/40`, bold red title line + monospace detail line + dismiss action. This exact pattern is reused, unmodified, across all 5 demos per PLAT-07.

**Record → preview → download flow**: research (FEATURES.md) confirmed that auto-downloading a recording the instant it stops is a documented anti-pattern — every recording-capable demo (Synth, Face Filters, Green Screen) instead follows: Record → visible recording indicator + timer → Stop → a preview player (audio waveform or video element) showing exactly what was captured → explicit Download button, plus a Retake option that discards the preview and re-arms Record without leaving the page.

**Permission priming panel**: appears before the actual `getUserMedia` browser prompt fires — plain-language one-liner ("This demo uses your camera to track your hands — nothing leaves your browser.") plus the action button that triggers the real prompt. Reused across all 4 camera-based demos per PLAT-03.

### 1.4 Layout grid

- Hub page: centered column, max-width ~5xl, responsive card grid (1 col mobile, 2 col tablet, and up to 3 col desktop for 5 cards)
- Demo pages: two-zone layout — a camera/canvas viewport (dominant, roughly 60-70% width on desktop, full-width on mobile) alongside/below a controls + status column

## 2. Page-by-Page Spec

### 2.1 Hub / Landing Page (`/index.html`)

**Purpose:** first thing every visitor sees. Sells the "zero-server, on-device" premise and routes to one of 5 demos.

**Structure (top to bottom):**
1. Eyebrow: `● 100% local · zero servers` (pulsing dot, matches existing prototype)
2. H1 + one-paragraph explainer of the whole site's premise
3. Grid of 5 showcase cards, each containing:
   - Icon/emoji representing the demo
   - Name (e.g. "Gesture Synth Instrument")
   - One-line description of what you'll walk away with (e.g. "Play an instrument with your hands and download your song")
   - Which MediaPipe capability it demonstrates (small mono tag, e.g. `GestureRecognizer`)
   - "Try it →" link/button that navigates to that demo's page
4. Footer: `no telemetry · no API keys · works offline once cached` (matches existing prototype)

**Card order:** AI Chat, Gesture Synth Instrument, Air Canvas, Magic Mirror Face Filters, Green Screen Studio (matches PROJECT.md's canonical list order).

### 2.2 Shared Demo Page Shell (applies to all 5 demo pages)

Every demo page shares this skeleton, per the Architecture research's shared-infrastructure findings:

1. **Header**: small "← Playground" back-link to hub, demo name, corner status badges (hardware backend, live metric)
2. **Permission priming panel**: shown before camera/mic is requested (skipped for the Chat demo, which needs neither)
3. **Loading/init state**: progress bar + label while the MediaPipe model downloads/compiles — replaces the priming panel once the user opts in
4. **Main viewport**: `<video>` (usually hidden/muted, used as the detection source) + an overlaid `<canvas>` that renders the actual visible output (landmarks, filters, drawing, composited background) — visitors watch the canvas, not the raw camera feed, except where the raw feed *is* the desired look (e.g. Green Screen Studio shows the composited result, not raw video)
5. **Controls column/row**: demo-specific inputs (see 2.3-2.7)
6. **Error boundary panel**: hidden by default, appears in place when PLAT-04/PLAT-07 conditions are hit
7. **Footer**: consistent with hub page

### 2.3 AI Chat page

- No camera/mic priming panel — this demo only needs network + optional mic-free text input
- On page load, an explicit WebGPU capability check runs first (CHAT-08) — if unavailable, a blocking message replaces the rest of the page ("WebGPU required, not available in this browser") since this demo has no WASM fallback, unlike the other 4
- Model tier picker (small/medium/large) shown before the Initialize button, each option showing approximate download size
- Initialize button → progress bar (percent + MB/GB transferred) → ready state
- Prompt textarea + Generate button + Stop button (visible only while generating)
- Streamed response area, rendered as lightweight markdown (headings/lists/code/bold/italic — reuses the existing prototype's dependency-free DOM-based renderer)
- TTFT badge appears after first generation

### 2.4 Gesture Synth Instrument page

- Camera priming panel, then live hand-tracking overlay (skeleton dots/lines) on the video feed
- Current instrument name + current note, large and legible (this is the primary "what's happening" readout)
- On-screen gesture legend (small reference showing which gesture maps to which instrument switch — a table or icon row) — addresses the "user needs a tutorial/legend" pattern common to gesture-control demos
- Manual control panel: master volume, filter cutoff, reverb/delay amount sliders (SYNTH-08)
- Mic enable toggle, Record/Stop button → preview player + Download/Retake (per the record → preview → download pattern above)
- "Start Audio" gate button shown before any sound can play, satisfying the AudioContext user-gesture requirement (SYNTH-09) — this is a distinct explicit step, not folded silently into the camera permission step

### 2.5 Air Canvas page

- Camera priming panel, then live hand-tracking overlay showing the tracked fingertip position even before drawing starts (visual confirmation tracking is working)
- Color swatch row (click to select, or gesture-switch as a stretch option)
- Clear button, Download PNG button
- Small pinch-state indicator (e.g. "✏️ Drawing" vs "✋ Hovering") so the user always knows whether they're currently drawing

### 2.6 Magic Mirror Face Filters page

- Camera priming panel, then live face-tracked overlay
- Filter selector row (thumbnails or labeled buttons: Glasses, Top Hat, Mustache, Dog Ears, etc.)
- Snapshot button (instant PNG download, no preview step needed) and Record/Stop → preview + Download/Retake, both visible simultaneously (two distinct actions, not a mode toggle)

### 2.7 Green Screen Studio page

- Camera priming panel, then live segmented/composited output (this page shows the *result*, not raw camera + overlay, since the whole point is the background is already replaced)
- Background mode selector: Blur, Solid Color (with a color picker), Gradient (preset swatches), Upload Image (file input)
- Record/Stop → preview + Download/Retake video

## 3. Interaction & Feedback Principles

- **Every async action shows its state.** No button click should leave the user wondering if anything happened — loading spinners, progress bars, or immediate visual feedback are mandatory (ties to PLAT-05, PLAT-07).
- **Gesture-controlled demos always show tracking confidence visually** (skeleton overlay, landmark dots) — if the model loses the hand/face, the user should see that immediately rather than wonder why nothing is responding.
- **Recording always has a clear start/stop state** — an unambiguous "recording" indicator (color change, pulsing dot, timer) is visible for the entire duration of any capture.
- **Downloads are never silent** — after clicking Download, a brief confirmation (toast, button state change) confirms the file save was triggered.

## 4. Open Items for Review

- Whether the gesture legend for the Synth demo should be always-visible or collapsible after first use
- Exact icon/emoji choices for the 5 hub cards
- Whether Green Screen's "Upload Image" background should persist across a session (localStorage) or reset each visit — currently assumed to reset (no persistence, per Out of Scope)
