# PRD — MediaPipe Playground

**Status:** Draft for review
**Last updated:** 2026-07-27
**Owner:** peterish8

## 1. Summary

MediaPipe Playground is a single website hosting five creative, on-device AI demos. Each demo uses a different Google MediaPipe capability (LLM chat, hand tracking, gesture recognition, face tracking, image segmentation) entirely inside the visitor's browser — no server, no API keys, no account, no data collection. Every demo ends with the visitor keeping something real: a downloaded audio recording, image, or video file.

## 2. Problem / Motivation

"On-device AI" is usually invisible to non-technical people — it's a checkbox in settings, not something you *feel*. This project makes it tangible: point your camera at yourself, wave your hands, and watch a real neural network respond in real time, with proof (a downloadable file) that nothing was uploaded anywhere. It doubles as a personal showcase of what's possible with MediaPipe's Task APIs across five very different modalities (text, hands, gesture, face, body segmentation) on one cohesive site.

## 3. Goals

- Prove, tangibly, that meaningful AI/CV inference can run entirely client-side with acceptable performance
- Cover the breadth of MediaPipe's Task APIs (LLM, hand landmarks, gesture classification, face landmarks, image segmentation) across 5 distinct, memorable demos
- Every demo produces a downloadable artifact — nothing about the experience is "just watch and it disappears"
- Visitors with no technical background can use every demo without reading instructions beyond what's on-screen

## 4. Non-Goals

- Not a production SaaS product — no accounts, no persistence, no analytics/telemetry
- Not trying to outperform native apps on mobile — desktop/laptop browsers with a webcam are the primary target
- Not shipping perfectly realistic instrument audio (violin, etc.) — synth approximations are an accepted tradeoff for v1
- Not supporting every browser/OS combination — graceful, clear failure for unsupported environments is acceptable; silent failure is not

## 5. Target User

Someone who lands on the site from a link (portfolio, social share, GitHub README) with no prior context, using a normal laptop with a webcam and microphone, on a modern Chromium-based browser (WebGPU support desired but not required — WASM fallback must work). No account, no onboarding beyond in-page prompts.

## 6. Product Scope — The 5 Showcases

### 6.1 On-Device AI Chat
Ask any question, get a streamed answer from an LLM running entirely in-browser. Visitor picks a model size (small/medium/large) up front so they can trade download time for answer quality. See `.planning/REQUIREMENTS.md` → CHAT-01 through CHAT-07 for the exact behavioral contract.

### 6.2 Gesture Synth Instrument
Play a real synthesizer with your hands, no keyboard or MIDI controller. One hand's height picks the pitch (snapped to a musical scale so it's never "wrong"), the other controls expression (volume/filter). A recognized hand gesture (peace sign, thumbs up, etc.) swaps between multiple instrument voices — a plain synth, a bowed-string-style patch, a pad, a bass, a plucked/bell voice. Visitor can sing or talk over the mic while playing, and download the mixed recording as a song. See SYNTH-01 through SYNTH-09.

### 6.3 Air Canvas
Draw in mid-air. Pinch thumb and index finger together to "put the pen down," move your hand to draw, release to lift the pen. Switch colors, clear the canvas, download the finished piece as a PNG. See CANVAS-01 through CANVAS-05.

### 6.4 Magic Mirror Face Filters
Real-time AR filters tracked to your face — glasses, a top hat, a mustache, dog ears/nose, drawn live with code (no external sticker images). Switch filters instantly, snapshot a still, or record and download a short clip. See FILT-01 through FILT-05.

### 6.5 Green Screen Studio
Replace or blur your background with no physical green screen — just the camera and an on-device segmentation model. Choose blur, a solid color, a gradient, or upload your own backdrop image. Record and download the composited video. See GREEN-01 through GREEN-04.

## 7. Cross-Cutting Product Requirements

These apply to the hub page and all 5 demos identically — see `.planning/REQUIREMENTS.md` → PLAT-01 through PLAT-09 for the full checklist:

- A hub/landing page presenting all 5 demos as cards; each opens as its own page
- Clear camera/mic permission requests with an explanation before the browser prompt
- Specific, human-readable error states for: permission denied, no device found, model download failure, out-of-memory, unsupported browser
- Visible loading progress for any model download, and a visible indicator of which hardware backend (WebGPU vs WASM) is active
- Clean teardown of camera/mic/model resources when leaving a demo
- Every "keep this" action is a genuine local file download, never a server upload

## 8. Success Criteria

A build is "done" for v1 when, for every one of the 5 demos:
1. A first-time visitor with no instructions beyond on-page text can get from "click the demo card" to "download a real result" without getting stuck
2. The demo works with either WebGPU or WASM fallback (verified in a real browser, not just "should work")
3. Killing camera/mic permission or losing network mid-load produces a specific, readable error, not a blank page or console-only crash

## 9. Risks / Open Questions

- **Model file sizes**: the chat demo's large tier is 2-3GB; first-time load time is a real UX cost. Mitigated by offering small (~250-300MB) and medium (~700MB-1GB) tiers and by caching via the Cache API so it's a one-time cost per browser profile.
- **WebGPU availability varies by OS/browser/driver**: WASM/XNNPACK fallback must be genuinely functional, not an afterthought — this was already validated for the chat demo's predecessor prototype in a real (GPU-less, sandboxed) browser.
- **Audio realism for the synth demo**: "Violin" and other acoustic-style voices are tuned synthesizer patches, not sampled recordings — this is disclosed in-product (label reads "Violin-style", not "Violin") rather than overclaiming.
- **Browser codec support for MediaRecorder** across the 3 recording-capable demos (Synth, Face Filters, Green Screen) needs verification during implementation — webm is the safe default, exact mimeType support is a research/pitfalls item.

## 10. References

- `.planning/PROJECT.md` — full project context, decisions, and constraints
- `.planning/REQUIREMENTS.md` — the authoritative, testable requirement list (source of truth; this PRD summarizes it)
- `.planning/research/` — domain research (stack, features, architecture, pitfalls)
- `docs/UI-SPEC.md` — visual design system and per-page layout spec
- `docs/FLOW.md` — sitemap and user journey through the site
