# Phase 5 Summary — Green Screen Studio

Implemented in `cce80a5`.

Uses `ImageSegmenter` confidence masks to composite the person over blur, solid color, gradient, or an uploaded image. Expensive mask readback is throttled to roughly 9–10 updates per second while the render loop continues between updates. The composited canvas—not raw camera video—is recorded and previewed before download.

Hardware QA: measure actual mask FPS, edge quality, memory use, and recording playback on target browsers.
