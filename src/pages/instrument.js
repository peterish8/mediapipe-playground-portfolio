import "../styles.css";
import { GestureRecognizer } from "@mediapipe/tasks-vision";
import { attachCamera, requestMedia, stopMedia } from "../shared/camera.js";
import { MODEL_URLS } from "../shared/constants.js";
import { fitCanvasToVideo, drawMirroredVideo, drawHandSkeleton, point } from "../shared/canvas-utils.js";
import { createDetectionLoop } from "../shared/detection-loop.js";
import { createErrorBoundary, classifyRuntimeError } from "../shared/error-boundary.js";
import { formatBytes } from "../shared/format.js";
import { detectVisionBackend, renderBackendBadge } from "../shared/backend-badge.js";
import { createMediaRecorder } from "../shared/recorder.js";
import { RecordPreviewFlow } from "../shared/record-preview-download.js";
import { fetchModelAsset, getVisionFileset } from "../shared/task-loader.js";
import { bindPageTeardown, registerDisposer, registerTask } from "../shared/task-lifecycle.js";
import { MonotonicTimestamp } from "../shared/timestamp-counter.js";
import { createPerformanceAudioEngine } from "../instrument/performance-audio.js";
import {
  assignHandRoles,
  createMotionDetector,
  createNoteSelector,
  createPinchGate,
  createSmoother,
  createStableGestureSelector,
  deriveExpression,
  getPinchStrength,
} from "../instrument/performance-controls.js";

bindPageTeardown();
const $ = (selector) => document.querySelector(selector);
const video = /** @type {HTMLVideoElement} */ ($("#video"));
const canvas = /** @type {HTMLCanvasElement} */ ($("#display-canvas"));
const context = canvas.getContext("2d");
const errorBoundary = createErrorBoundary($("#error-panel"));
const timestamp = new MonotonicTimestamp();

const NOTE_SETS = new Map([
  ["synth", ["C3", "D3", "E3", "G3", "A3", "C4", "D4", "E4", "G4", "A4", "C5", "D5"]],
  ["violin", ["G3", "A3", "C4", "D4", "E4", "G4", "A4", "C5", "D5", "E5"]],
  ["pad", ["C3", "D3", "E3", "G3", "A3", "C4", "D4", "E4", "G4", "A4"]],
  ["bass", ["C2", "D2", "E2", "G2", "A2", "C3", "D3", "E3", "G3", "A3"]],
]);
const GESTURE_PRESETS = new Map([
  ["Victory", "synth"],
  ["Thumb_Up", "violin"],
  ["Open_Palm", "pad"],
  ["Closed_Fist", "bass"],
]);

let recognizer;
const audioEngine = createPerformanceAudioEngine({ initialVolume: Number($("#volume")?.value ?? -8) });
let noteSelector = createNoteSelector(NOTE_SETS.get("synth") ?? []);
const pinchGate = createPinchGate();
const presetSelector = createStableGestureSelector({ dwellMs: 700, cooldownMs: 600 });
const motionDetector = createMotionDetector({ threshold: 0.95, cooldownMs: 850, smoothing: 0.38 });
const expressionSmoothers = {
  cutoff: createSmoother(0.2),
  space: createSmoother(0.18),
  intensity: createSmoother(0.22),
  vibrato: createSmoother(0.18),
};
let currentNote;
let currentPreset = "synth";
let soundHand = "Right";
let lastVideoTime = -1;
let lastSoundSeen = -Infinity;
let lastExpressionSeen = -Infinity;
let expressionFrozen = false;
let latestExpression = { cutoff: 1800, space: 0.2, intensity: 0.72, vibrato: 0.08 };
let micStream;
let disconnectMic;

const flow = new RecordPreviewFlow({
  recordButton: $("#record-button"),
  stopButton: $("#stop-button"),
  indicator: $("#recording-indicator"),
  timer: $("#recording-timer"),
  previewBox: $("#preview-box"),
  preview: $("#preview"),
}, { kind: "audio", filename: "gesture-synth-performance.webm" });

function setText(selector, value) {
  const element = $(selector);
  if (element) element.textContent = value;
}

function setMeter(id, value) {
  const meter = document.getElementById(id);
  if (meter) meter.style.setProperty("--meter", `${Math.round(value * 100)}%`);
}

function setPerformanceState(label, tone = "tracking") {
  const status = $("#performance-status");
  if (!status) return;
  status.textContent = label;
  status.dataset.tone = tone;
}

function updateExpressionReadouts(expression) {
  setText("#cutoff-value", `${Math.round(expression.cutoff)} Hz`);
  setText("#space-value", `${Math.round(expression.space * 100)}%`);
  setText("#intensity-value", `${Math.round(expression.intensity * 100)}%`);
  setText("#vibrato-value", `${Math.round(expression.vibrato * 100)}%`);
  setMeter("cutoff-meter", Math.log(expression.cutoff / 250) / Math.log(9000 / 250));
  setMeter("space-meter", expression.space);
  setMeter("intensity-meter", expression.intensity);
  setMeter("vibrato-meter", expression.vibrato);
}

function drawRoleLabel(hand, label, color) {
  if (!context || !hand?.[0]) return;
  const anchor = point(hand[0], canvas.width, canvas.height);
  context.save();
  context.font = `700 ${Math.max(12, canvas.width / 55)}px ui-monospace, monospace`;
  context.textBaseline = "bottom";
  const width = context.measureText(label).width + 18;
  const x = Math.max(8, Math.min(canvas.width - width - 8, anchor.x - width / 2));
  const y = Math.max(30, anchor.y - 16);
  context.fillStyle = "rgba(5,5,5,.78)";
  context.fillRect(x, y - 26, width, 28);
  context.fillStyle = color;
  context.fillText(label, x + 9, y - 5);
  context.restore();
}

function selectPreset(preset) {
  const notes = NOTE_SETS.get(preset);
  if (!notes || preset === currentPreset) return;
  currentPreset = preset;
  noteSelector = createNoteSelector(notes);
  audioEngine.setPreset(preset);
  setText("#instrument-name", audioEngine.presetName);
  setPerformanceState(`${audioEngine.presetName} selected`, "accent");
}

function manualExpression() {
  return {
    cutoff: Number($("#filter")?.value ?? 1800),
    space: Number($("#reverb")?.value ?? 0.2),
    intensity: latestExpression.intensity,
    vibrato: latestExpression.vibrato,
  };
}

async function startAudio() {
  try {
    await audioEngine.start();
    audioEngine.setPreset(currentPreset);
    const stream = audioEngine.getRecordingStream();
    if (stream) flow.setRecorder(createMediaRecorder(stream, { kind: "audio" }));
    $("#record-button").disabled = !stream;
    $("#audio-button").textContent = "Audio ready — pinch to play";
    $("#audio-button").disabled = true;
    setPerformanceState("Audio ready", "success");
  } catch (error) {
    errorBoundary.show(error);
  }
}

async function toggleMic() {
  try {
    if ($("#mic-toggle").checked) {
      if (!audioEngine.isStarted) await startAudio();
      micStream = await requestMedia({ audio: { echoCancellation: true }, video: false }, "Microphone");
      disconnectMic = audioEngine.connectExternalStream(micStream);
    } else {
      disconnectMic?.();
      disconnectMic = undefined;
      stopMedia(micStream);
      micStream = undefined;
    }
  } catch (error) {
    $("#mic-toggle").checked = false;
    errorBoundary.show(error);
  }
}

$("#download-recording").onclick = () => flow.download();
$("#retake").onclick = () => flow.reset();
$("#record-button").onclick = () => flow.start();
$("#stop-button").onclick = () => flow.stop().catch((error) => errorBoundary.show(error));
$("#audio-button").onclick = startAudio;
$("#mic-toggle").onchange = toggleMic;
$("#volume").oninput = () => audioEngine.setMasterVolume(Number($("#volume").value));
$("#filter").oninput = () => {
  if (performance.now() - lastExpressionSeen > 450) {
    latestExpression = manualExpression();
    audioEngine.setExpression(latestExpression);
    updateExpressionReadouts(latestExpression);
  }
};
$("#reverb").oninput = $("#filter").oninput;
$("#sound-hand").onchange = () => {
  soundHand = $("#sound-hand").value;
  pinchGate.reset();
  noteSelector.reset();
  presetSelector.reset();
  motionDetector.reset();
  audioEngine.release();
  currentNote = undefined;
  setText("#sound-role", soundHand);
  setText("#expression-role", soundHand === "Right" ? "Left" : "Right");
};
$("#swap-hands").onclick = () => {
  $("#sound-hand").value = soundHand === "Right" ? "Left" : "Right";
  $("#sound-hand").dispatchEvent(new Event("change"));
};

const loop = createDetectionLoop(() => {
  if (!recognizer || video.readyState < 2 || !context) return;
  if (!fitCanvasToVideo(canvas, video)) return;
  drawMirroredVideo(context, video, canvas.width, canvas.height);
  if (video.currentTime === lastVideoTime) return;
  lastVideoTime = video.currentTime;
  const now = performance.now();
  const result = recognizer.recognizeForVideo(video, timestamp.next());
  const hands = result.landmarks ?? [];
  const handednesses = result.handednesses ?? [];
  const roles = assignHandRoles(hands, handednesses, soundHand);

  if (!hands.length) {
    $("#viewport-placeholder").classList.remove("hidden");
    setPerformanceState("Show both hands", "waiting");
  } else {
    $("#viewport-placeholder").classList.add("hidden");
  }

  if (roles.sound) {
    lastSoundSeen = now;
    drawHandSkeleton(context, roles.sound.landmarks, canvas.width, canvas.height, "#6ee7b7");
    drawRoleLabel(roles.sound.landmarks, `SOUND · ${audioEngine.presetName}`, "#6ee7b7");
    const fingertip = roles.sound.landmarks[8];
    const note = fingertip ? noteSelector.update(fingertip.y) : undefined;
    const pinchStrength = getPinchStrength(roles.sound.landmarks);
    const gateActive = pinchGate.update(pinchStrength);
    setText("#note-name", note ?? "—");
    setText("#pinch-value", gateActive ? `Playing · ${Math.round(pinchStrength * 100)}%` : `Open · ${Math.round(pinchStrength * 100)}%`);

    if (audioEngine.isStarted && note) {
      if (gateActive && !currentNote) {
        audioEngine.attack(note, Math.max(0.25, pinchStrength));
        currentNote = note;
      } else if (gateActive && note !== currentNote) {
        audioEngine.setNote(note);
        currentNote = note;
      } else if (!gateActive && currentNote) {
        audioEngine.release();
        currentNote = undefined;
      }
    }

    const gesture = result.gestures?.[roles.sound.index]?.[0]?.categoryName ?? "None";
    const stableGesture = presetSelector.update(gesture, now);
    const preset = stableGesture ? GESTURE_PRESETS.get(stableGesture) : undefined;
    if (preset) selectPreset(preset);
  } else if (now - lastSoundSeen > 260) {
    if (currentNote) audioEngine.release();
    currentNote = undefined;
    pinchGate.reset();
    noteSelector.reset();
    presetSelector.update("None", now);
    setText("#note-name", "—");
    setText("#pinch-value", "Waiting for sound hand");
  }

  if (roles.expression) {
    lastExpressionSeen = now;
    drawHandSkeleton(context, roles.expression.landmarks, canvas.width, canvas.height, "#60a5fa");
    drawRoleLabel(roles.expression.landmarks, "EXPRESSION", "#93c5fd");
    const expressionGesture = result.gestures?.[roles.expression.index]?.[0]?.categoryName ?? "None";
    const shouldFreeze = expressionGesture === "Closed_Fist";
    if (shouldFreeze !== expressionFrozen) {
      expressionFrozen = shouldFreeze;
      setPerformanceState(shouldFreeze ? "Expression frozen" : "Expression live", shouldFreeze ? "frozen" : "tracking");
    }

    const raw = deriveExpression(roles.expression.landmarks);
    const smoothed = {
      cutoff: expressionSmoothers.cutoff.update(raw.cutoff),
      space: expressionSmoothers.space.update(raw.space),
      intensity: expressionSmoothers.intensity.update(raw.intensity),
      vibrato: expressionSmoothers.vibrato.update(raw.vibrato),
    };
    if (!expressionFrozen) {
      latestExpression = smoothed;
      audioEngine.setExpression(latestExpression);
      updateExpressionReadouts(latestExpression);
      $("#filter").value = String(Math.round(latestExpression.cutoff));
      $("#reverb").value = String(latestExpression.space.toFixed(2));
      const motion = motionDetector.update(roles.expression.landmarks[0]?.y ?? 0.5, now);
      if (motion.event === "riser") {
        audioEngine.triggerRiser();
        setPerformanceState("Riser ↑", "accent");
      } else if (motion.event === "drop") {
        audioEngine.triggerDrop();
        setPerformanceState("Drop ↓", "accent");
      } else if (now - lastSoundSeen < 260) {
        setPerformanceState("Two-hand control live", "success");
      }
    }
  } else {
    expressionFrozen = false;
    motionDetector.reset();
    if (now - lastExpressionSeen > 450) setPerformanceState("Add expression hand", "waiting");
  }
});

async function start() {
  errorBoundary.hide();
  $("#permission-panel").classList.add("hidden");
  $("#loading-panel").classList.remove("hidden");
  try {
    await attachCamera(video);
    const backend = await detectVisionBackend();
    renderBackendBadge($("#backend-badge"), backend);
    const asset = await fetchModelAsset(MODEL_URLS.gesture, {
      onProgress: ({ loaded, total, percent, fromCache }) => {
        $("#progress-fill").style.width = `${percent}%`;
        $("#progress-percent").textContent = total ? `${Math.round(percent)}%` : formatBytes(loaded);
        $("#progress-label").textContent = fromCache ? "Loaded from browser cache" : `${formatBytes(loaded)} / ${total ? formatBytes(total) : "unknown"}`;
      },
    });
    registerDisposer(asset.revoke);
    recognizer = registerTask(await GestureRecognizer.createFromOptions(await getVisionFileset(), {
      baseOptions: { modelAssetPath: asset.url, delegate: backend.backend === "WebGPU" ? "GPU" : "CPU" },
      runningMode: "VIDEO",
      numHands: 2,
    }));
    $("#loading-panel").classList.add("hidden");
    $("#demo").classList.remove("hidden");
    updateExpressionReadouts(latestExpression);
    loop.start();
  } catch (error) {
    $("#loading-panel").classList.add("hidden");
    errorBoundary.show(classifyRuntimeError(error), { onRetry: start });
  }
}

$("#start-button").onclick = start;
registerDisposer(() => {
  loop.stop();
  disconnectMic?.();
  stopMedia(micStream);
  audioEngine.dispose();
});