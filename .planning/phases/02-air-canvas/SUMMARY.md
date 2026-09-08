# Phase 2 Summary — Air Canvas

Implemented in `881d1d6`.

Uses MediaPipe `HandLandmarker` in VIDEO mode. Landmark 4→8 distance controls pen-down state, landmark 8 controls the mirrored cursor, strokes persist across pen lifts, and users can select colors, clear only the art layer, and download a PNG.

Hardware QA: tune the pinch threshold across lighting, hand distance, and different cameras.
