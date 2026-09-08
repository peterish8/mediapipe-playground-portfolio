# Implementation Status

**Updated:** 2026-07-27
**Branch:** `main`
**State:** Gesture Synth V2 source implementation complete, merged, and CI-verified; physical-browser musical QA pending.

## What Landed

The v1 roadmap was executed in dependency order: shared infrastructure first, followed by one atomic commit per showcase. The repository contains a Vite multi-page application with all five MediaPipe demos, shared runtime/error/recording infrastructure, automated source checks, unit tests, and production-host headers.

| Phase | Implementation state | Commit |
|---|---|---|
| 1. Shared Infrastructure | Complete | `b4febb2` |
| 2. Air Canvas | Complete | `881d1d6` |
| 3. Gesture Synth Instrument | Complete | `a44a7c0` |
| 4. Magic Mirror Face Filters | Complete | `f41dced` |
| 5. Green Screen Studio | Complete | `cce80a5` |
| 6. AI Chat | Complete | `732f116` |
| Build-safety cleanup | Complete | `d000e49` |
| README/status documentation | Complete | `34feb46` |
| Tone real-time audio-context type fix | Complete | `071be25` |
| Gesture Synth V2 design and plan | Complete | `c8ea0d6`, `1b47f18` |
| Gesture performance unit-test contract | Complete | `4c3d3a5` |
| Pure hand-control engine | Complete | `f8aee6c` |
| Expressive Tone.js audio engine | Complete | `fe89332` |
| Two-hand coordinator and HUD | Complete | `4a43f98`, `7c828c7`, `827f77a` |
| V2 documentation | Complete | `837fca3` |

## Gesture Synth V2 Behaviour

- MediaPipe handedness provides stable Sound Hand and Expression Hand roles.
- The performer can swap hand roles without restarting the camera.
- Sound Hand pinch uses hysteresis to gate notes, while vertical motion selects scale-quantised pitches with boundary hysteresis.
- Victory, Thumb Up, Open Palm, and Closed Fist select Synth, Violin-style, Pad, and Bass after a 700 ms dwell.
- Expression Hand height, horizontal position, openness, and palm tilt continuously control cutoff, space, intensity, and vibrato through smoothed values.
- Expression fist freezes parameters; fast vertical sweeps trigger cooldown-protected riser/drop accents.
- Tone.js routing now includes gain, low-pass filtering, vibrato, feedback delay, reverb, compression, limiting, speakers, and the existing recording destination.
- Microphone mixing, recording, preview, retake, download, and teardown remain integrated.

## Verification Performed

- The pure performance-control test suite contains eight passing Node tests.
- GitHub Actions CI run #14 installed the real dependency set and completed successfully on pull request #2.
- Final pull-request CI run #17 also completed successfully on the exact merged source tree.
- `npm run verify` passed: TypeScript `checkJs`, all Node tests, MediaPipe WASM copying, and the complete Vite production build.
- Pull request #2 was rebased and merged into `main` at `a08e2c8`.

## Verification Still Requiring Real Hardware

The execution environment does not provide a browser with camera, microphone, GPU/WebGPU, or real musical monitoring. Therefore the following must be run on a normal laptop before calling the interaction fully tuned:

1. Camera permission allowed, denied, missing-device, and camera-in-use paths.
2. Vision task GPU delegate and CPU/WASM fallback behavior.
3. Air Canvas pinch threshold and drawing stability.
4. Gesture Synth handedness labels with mirrored camera preview and both Sound Hand settings.
5. Gesture Synth pinch thresholds, note hysteresis, preset dwell, hand-loss grace, and accidental-switch resistance.
6. Bass, Violin-style, Pad, and Synth gain balance; cutoff/reverb/vibrato feel; riser/drop threshold tuning; mic mix; recording playback.
7. Magic Mirror tracking alignment, snapshot, and recorded video playback.
8. Green Screen mask quality/frame rate and uploaded-background compositing.
9. Chat model access, large download/cache behavior, WebGPU initialization, streaming, TTFT, and cancellation.
10. Open every downloaded artifact and confirm it is non-zero and seekable.

Do not mark `.planning/REQUIREMENTS.md` or the V2 musical feel as validated solely from source inspection. Complete the physical-browser pass first.