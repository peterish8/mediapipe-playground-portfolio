# Two-Hand Performance Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a stable, expressive two-hand Gesture Synth where one hand plays a selected preset and the other conducts effects, risers, drops, and freezes.

**Architecture:** Extract deterministic hand-role, smoothing, gating, note, and motion logic into a pure module with Node tests. Put Tone.js routing and preset lifecycle in a focused audio-engine module. Keep `src/pages/instrument.js` as the camera/UI coordinator and update the HTML/CSS for role selection, live meters, and on-canvas feedback.

**Tech Stack:** JavaScript with TypeScript checkJs, MediaPipe GestureRecognizer 0.10.35, Tone.js 15.1.22, Vite 8, Node test runner.

## Global Constraints

- All camera inference and audio synthesis remain entirely in the browser.
- Audio starts only after an explicit user gesture.
- The default Sound Hand is Right and roles come from MediaPipe handedness, not array order.
- Instrument gestures require 700 ms dwell.
- Pinch and note transitions use hysteresis.
- Dynamic riser/drop events use velocity thresholds and cooldown.
- Existing microphone mixing, recording, preview, download, teardown, and error handling must remain functional.
- `npm run verify` must pass before merge.

---

### Task 1: Pure performance-control engine

**Files:**
- Create: `src/instrument/performance-controls.js`
- Create: `tests/instrument-performance.test.js`

**Interfaces:**
- Produces: `clamp`, `createSmoother`, `assignHandRoles`, `createPinchGate`, `createStableGestureSelector`, `createNoteSelector`, `createMotionDetector`, `deriveExpression`, `getPinchStrength`, and `getPalmTilt`.
- Consumes: MediaPipe landmark arrays and handedness category objects only; no DOM or Tone.js.

- [ ] **Step 1: Write failing unit tests**

Cover role assignment independent of array order, pinch on/off hysteresis, 700 ms gesture dwell, note boundary hysteresis, expression output ranges, and riser/drop cooldown.

- [ ] **Step 2: Run tests and confirm failure**

Run: `npm test -- --test-name-pattern="instrument performance"`
Expected: FAIL because `src/instrument/performance-controls.js` does not exist.

- [ ] **Step 3: Implement deterministic control helpers**

Use normalised landmark coordinates, finite-value guards, exponential smoothing, separate gate thresholds, and monotonic timestamps. Return plain values so behaviour is independently testable.

- [ ] **Step 4: Run tests and checkJs**

Run: `npm run test && npm run check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/instrument/performance-controls.js tests/instrument-performance.test.js
git commit -m "feat: add gesture performance control engine"
```

### Task 2: Expressive Tone.js audio engine

**Files:**
- Create: `src/instrument/performance-audio.js`
- Modify: `src/pages/instrument.js`

**Interfaces:**
- Consumes: expression objects `{ cutoff, space, intensity, vibrato }`, note names, and preset IDs.
- Produces: `createPerformanceAudioEngine({ initialVolume })` with `start`, `setPreset`, `attack`, `setNote`, `release`, `setExpression`, `triggerRiser`, `triggerDrop`, `setMasterVolume`, `getRecordingStream`, and `dispose`.

- [ ] **Step 1: Add audio-engine import and compile-time usage in the page coordinator**

Replace direct synth/filter/reverb/master ownership with one engine variable so checkJs fails until the engine exists.

- [ ] **Step 2: Run checkJs and confirm failure**

Run: `npm run check`
Expected: FAIL because the module/interface does not exist.

- [ ] **Step 3: Implement preset and effect routing**

Create Synth, Violin-style, Pad, and Bass presets. Route through expression gain, low-pass filter, vibrato, feedback delay, reverb, compressor, limiter, and master. Connect master to both Tone destination and a native MediaStreamDestination. Use short `rampTo` transitions and temporary accent overrides.

- [ ] **Step 4: Run checkJs and tests**

Run: `npm run check && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/instrument/performance-audio.js src/pages/instrument.js
git commit -m "feat: add expressive gesture synth audio engine"
```

### Task 3: Two-hand coordinator and live controls

**Files:**
- Modify: `src/pages/instrument.js`
- Modify: `instrument/index.html`

**Interfaces:**
- Consumes: Task 1 control helpers and Task 2 audio-engine API.
- Produces: stable Sound/Expression hand behaviour, role swapping, readouts, and recording integration.

- [ ] **Step 1: Add required UI element references**

Add Sound Hand selection, Swap Hands, live effect readouts, performance state, and revised guide markup. Wire references in `instrument.js` so missing IDs are caught during review/build.

- [ ] **Step 2: Implement role-stable frame processing**

Use handedness arrays to assign roles. Feed Sound Hand landmarks through note and pinch state. Feed Expression Hand landmarks through smoothed expression derivation and motion detection. Never fall back to array order.

- [ ] **Step 3: Implement intentional preset switching**

Read the gesture associated with the Sound Hand index and pass it through the stable selector. Map only Victory, Thumb Up, Open Palm, and Closed Fist to presets.

- [ ] **Step 4: Implement expression freeze, accents, and loss grace**

Freeze values while the Expression Hand forms Closed Fist. Trigger riser/drop events from wrist velocity. Release the note only after a short missing-hand grace period.

- [ ] **Step 5: Retain fallback and recording behaviour**

Manual sliders update the audio engine when expression tracking is unavailable. Use the engine recording stream with the existing RecordPreviewFlow. Preserve microphone mixing into the recording destination.

- [ ] **Step 6: Run tests and checkJs**

Run: `npm run check && npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/pages/instrument.js instrument/index.html
git commit -m "feat: orchestrate two-hand performance controls"
```

### Task 4: Performance HUD styling and documentation

**Files:**
- Modify: `src/styles.css`
- Modify: `README.md`
- Modify: `.planning/IMPLEMENTATION.md`

**Interfaces:**
- Consumes: markup/classes from Task 3.
- Produces: responsive control meters, role cards, status chip styling, and documented V2 behaviour/QA.

- [ ] **Step 1: Add responsive performance UI styles**

Style hand-role controls, live meters, status states, compact instructions, and mobile stacking without changing the rest of the playground theme.

- [ ] **Step 2: Document the feature and hardware QA**

Update README with two-hand mappings. Add a V2 entry to `.planning/IMPLEMENTATION.md` and explicitly retain real-device checks for handedness, audio feel, camera loss, and motion-trigger tuning.

- [ ] **Step 3: Run full verification**

Run: `npm run verify`
Expected: TypeScript checkJs, all Node tests, WASM copy, and Vite production build pass.

- [ ] **Step 4: Commit**

```bash
git add src/styles.css README.md .planning/IMPLEMENTATION.md
git commit -m "docs: finish two-hand performance mode"
```

### Task 5: Pull request and CI verification

**Files:**
- No source changes unless CI identifies a concrete defect.

- [ ] **Step 1: Push `agent/two-hand-performance-mode` and open a draft PR to `main`**

The PR body must explain interaction changes, architecture, tests, and remaining physical-hardware QA.

- [ ] **Step 2: Inspect GitHub Actions**

Confirm dependency installation and `npm run verify` pass on the PR head.

- [ ] **Step 3: Fix any CI-only issue with a focused commit**

Rerun CI and do not merge until green.

- [ ] **Step 4: Mark ready and merge with rebase**

Preserve the task-level commits on `main` and report the final main SHA.