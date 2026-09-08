# Two-Hand Performance Mode Design

**Date:** 2026-07-27
**Status:** Approved for implementation

## Goal

Upgrade Gesture Synth from a basic note-and-filter demo into a playable two-hand expressive instrument. One hand selects and plays Bass, Violin-style, Pad, or Synth; the other continuously conducts cutoff, reverb, intensity, vibrato, risers, drops, and effect freezes.

## Interaction Model

### Hand roles

- The default Sound Hand is the user's right hand.
- The other detected hand is the Expression Hand.
- The UI provides a Sound Hand selector and a Swap Hands action.
- Roles are assigned from MediaPipe handedness, never from detection-array order.
- If only one hand is visible, it remains the Sound Hand when its handedness matches the configured role; otherwise it is treated as Expression only and does not unexpectedly play notes.

### Sound Hand

- Vertical index-finger position maps to a pentatonic note range spanning two octaves.
- Thumb-to-index pinch strength gates the note with hysteresis: a deliberate pinch starts the note; opening beyond a separate threshold releases it.
- Pinch strength also controls note velocity/expression.
- A recognised instrument gesture must remain stable for 700 ms before switching:
  - Victory: Synth
  - Thumb Up: Violin-style
  - Open Palm: Pad
  - Closed Fist: Bass
- Instrument switching has a cooldown and does not retrigger the current preset.
- Brief hand-tracking loss uses a short grace period before releasing the note.

### Expression Hand

- Raise/lower the hand: exponentially open/close low-pass cutoff.
- Move right/left: increase/decrease reverb and delay space.
- Open/close thumb-index distance: change musical intensity and output gain.
- Rotate the palm: change vibrato depth.
- Closed Fist: freeze the current expression values until the fist opens.
- Fast upward wrist motion: trigger a cinematic riser.
- Fast downward wrist motion: trigger a drop/release accent.
- Motion events use smoothing, velocity thresholds, and cooldowns to avoid accidental repeats.

## Audio Design

The Tone.js chain is:

`preset voice -> expression gain -> low-pass filter -> vibrato -> feedback delay -> reverb -> compressor -> limiter -> master -> speakers + recorder`

Four presets are deliberately limited and polished:

- **Synth:** fast saw-based lead with clear filter sweeps.
- **Violin-style:** FM-based sustained lead with slower attack and expressive vibrato.
- **Pad:** slow, wide sustained tone with long release and greater space.
- **Bass:** low-register monophonic tone with strong low-pass character.

All continuously controlled parameters use short ramps to prevent zipper noise and clicks. Riser/drop overrides are temporary; the engine stores the latest live hand values and smoothly returns to them after the accent.

## Stability Rules

- Exponential smoothing is applied to landmark-derived controls.
- Note mapping uses hysteresis so boundary jitter does not rapidly alternate notes.
- Pinch note gating uses separate on/off thresholds.
- Hand roles are stable by handedness and configurable by the performer.
- Instrument gestures require dwell time.
- Dynamic motion gestures require minimum velocity, travel, and cooldown.
- Missing Sound Hand releases gracefully rather than cutting instantly.

## UI

- Keep the camera-first layout and recording controls.
- Replace the old static legend with a performance guide for both hands.
- Show live readouts for instrument, note, cutoff, space, intensity, and vibrato.
- Show role labels near each tracked hand on the canvas.
- Show a short status chip for `Riser`, `Drop`, `Expression frozen`, or `Tracking`.
- Retain manual sliders as fallback controls before two-hand tracking or for accessibility.

## Error Handling

- Audio still starts only from a user click.
- Camera, microphone, model-loading, and backend errors continue through the existing error boundary.
- Losing one hand never changes the instrument or assigns the remaining hand to the wrong role.
- Audio nodes, streams, the recogniser, and the detection loop are disposed on teardown.

## Testing

Unit tests cover pure behaviour:

- handedness-based role assignment;
- smoothing and range mapping;
- pinch-gate hysteresis;
- stable instrument gesture dwell;
- note hysteresis;
- expression parameter bounds;
- riser/drop velocity detection and cooldown.

Repository verification remains `npm run verify`, which runs TypeScript checkJs, Node tests, MediaPipe WASM copying, and the Vite production build. Physical camera/audio musical feel remains a real-device QA item.