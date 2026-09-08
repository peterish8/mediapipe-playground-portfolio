import "../styles.css";
import { FaceLandmarker } from "@mediapipe/tasks-vision";
import { attachCamera, requestMedia } from "../shared/camera.js";
import { MODEL_URLS } from "../shared/constants.js";
import { fitCanvasToVideo, drawMirroredVideo, point } from "../shared/canvas-utils.js";
import { createDetectionLoop } from "../shared/detection-loop.js";
import { downloadCanvas, showToast } from "../shared/download.js";
import { createErrorBoundary, classifyRuntimeError } from "../shared/error-boundary.js";
import { formatBytes } from "../shared/format.js";
import { detectVisionBackend, renderBackendBadge } from "../shared/backend-badge.js";
import { createMediaRecorder } from "../shared/recorder.js";
import { RecordPreviewFlow } from "../shared/record-preview-download.js";
import { fetchModelAsset, getVisionFileset } from "../shared/task-loader.js";
import { bindPageTeardown, registerDisposer, registerTask, registerStream } from "../shared/task-lifecycle.js";
import { MonotonicTimestamp } from "../shared/timestamp-counter.js";

bindPageTeardown();
const $ = (selector) => document.querySelector(selector);
const video = /** @type {HTMLVideoElement} */ ($("#video"));
const canvas = /** @type {HTMLCanvasElement} */ ($("#display-canvas"));
const context = canvas.getContext("2d");
const errorBoundary = createErrorBoundary($("#error-panel"));
const timestamp = new MonotonicTimestamp();
const filters = ["Glasses", "Top Hat", "Mustache", "Dog"];
let currentFilter = filters[0];
let landmarker;
let lastVideoTime = -1;

for (const name of filters) {
  const button = document.createElement("button");
  button.className = "tab";
  button.textContent = name;
  button.setAttribute("aria-pressed", String(name === currentFilter));
  button.onclick = () => {
    currentFilter = name;
    document.querySelectorAll("#filter-tabs .tab").forEach((tab) => tab.setAttribute("aria-pressed", String(tab === button)));
  };
  $("#filter-tabs").append(button);
}

function drawFilter(landmarks) {
  if (!context) return;
  const width = canvas.width, height = canvas.height;
  const leftEye = point(landmarks[33], width, height);
  const rightEye = point(landmarks[263], width, height);
  const nose = point(landmarks[1], width, height);
  const upperLip = point(landmarks[13], width, height);
  const forehead = point(landmarks[10], width, height);
  const leftSide = point(landmarks[234], width, height);
  const rightSide = point(landmarks[454], width, height);
  const faceWidth = Math.max(70, Math.abs(rightSide.x - leftSide.x));

  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  if (currentFilter === "Glasses") {
    const radius = faceWidth * .18;
    context.strokeStyle = "#0a0a0a";
    context.fillStyle = "rgba(52,211,153,.18)";
    context.lineWidth = Math.max(5, faceWidth * .035);
    for (const eye of [leftEye, rightEye]) {
      context.beginPath(); context.ellipse(eye.x, eye.y, radius, radius * .7, 0, 0, Math.PI * 2); context.fill(); context.stroke();
    }
    context.beginPath(); context.moveTo(leftEye.x + radius, leftEye.y); context.lineTo(rightEye.x - radius, rightEye.y); context.stroke();
  } else if (currentFilter === "Top Hat") {
    context.fillStyle = "#111827"; context.strokeStyle = "#6ee7b7"; context.lineWidth = 4;
    const w = faceWidth * .72, h = faceWidth * .55;
    context.fillRect(forehead.x - w/2, forehead.y - h, w, h);
    context.strokeRect(forehead.x - w/2, forehead.y - h, w, h);
    context.fillStyle = "#34d399"; context.fillRect(forehead.x - w*.62, forehead.y - 10, w*1.24, 16);
  } else if (currentFilter === "Mustache") {
    context.fillStyle = "#171717";
    const w = faceWidth * .36, h = faceWidth * .12;
    context.beginPath();
    context.moveTo(upperLip.x, upperLip.y);
    context.bezierCurveTo(upperLip.x-w*.35, upperLip.y-h, upperLip.x-w, upperLip.y+h*.2, upperLip.x-w*.92, upperLip.y+h);
    context.bezierCurveTo(upperLip.x-w*.3, upperLip.y+h*.65, upperLip.x-w*.1, upperLip.y+h*.3, upperLip.x, upperLip.y+h*.1);
    context.bezierCurveTo(upperLip.x+w*.1, upperLip.y+h*.3, upperLip.x+w*.3, upperLip.y+h*.65, upperLip.x+w*.92, upperLip.y+h);
    context.bezierCurveTo(upperLip.x+w, upperLip.y+h*.2, upperLip.x+w*.35, upperLip.y-h, upperLip.x, upperLip.y);
    context.fill();
  } else {
    context.fillStyle = "#a16207"; context.strokeStyle = "#451a03"; context.lineWidth = 3;
    context.beginPath(); context.arc(nose.x, nose.y + faceWidth*.08, faceWidth*.08, 0, Math.PI*2); context.fill(); context.stroke();
    const earY = forehead.y - faceWidth*.15;
    for (const side of [-1,1]) {
      context.beginPath();
      context.moveTo(forehead.x + side*faceWidth*.22, earY + faceWidth*.14);
      context.lineTo(forehead.x + side*faceWidth*.42, earY - faceWidth*.28);
      context.lineTo(forehead.x + side*faceWidth*.08, earY - faceWidth*.12);
      context.closePath(); context.fill(); context.stroke();
    }
  }
  context.restore();
}

const loop = createDetectionLoop(() => {
  if (!landmarker || video.readyState < 2 || !context) return;
  if (!fitCanvasToVideo(canvas, video)) return;
  drawMirroredVideo(context, video, canvas.width, canvas.height);
  if (video.currentTime === lastVideoTime) return;
  lastVideoTime = video.currentTime;
  const result = landmarker.detectForVideo(video, timestamp.next());
  const landmarks = result.faceLandmarks?.[0];
  if (landmarks) {
    $("#viewport-placeholder").classList.add("hidden");
    drawFilter(landmarks);
  } else {
    $("#viewport-placeholder").classList.remove("hidden");
  }
});

const flow = new RecordPreviewFlow({
  recordButton: $("#record-button"), stopButton: $("#stop-button"),
  indicator: $("#recording-indicator"), timer: $("#recording-timer"),
  previewBox: $("#preview-box"), preview: $("#preview"),
}, { kind: "video", filename: "magic-mirror.webm" });

async function prepareRecording() {
  const canvasStream = canvas.captureStream(30);
  try {
    const audio = await requestMedia({ audio: true, video: false }, "Microphone");
    audio.getAudioTracks().forEach((track) => canvasStream.addTrack(track));
  } catch {
    // Video-only recording remains a valid fallback when microphone permission is declined.
  }
  registerStream(canvasStream);
  flow.setRecorder(createMediaRecorder(canvasStream, { kind: "video" }));
  flow.start();
}

$("#record-button").onclick = () => prepareRecording().catch((error) => errorBoundary.show(error));
$("#stop-button").onclick = () => flow.stop().catch((error) => errorBoundary.show(error));
$("#download-recording").onclick = () => flow.download();
$("#retake").onclick = () => flow.reset();
$("#snapshot-button").onclick = () => {
  downloadCanvas(canvas, `magic-mirror-${new Date().toISOString().slice(0,10)}.png`);
  showToast("Snapshot download started.");
};

async function start() {
  errorBoundary.hide();
  $("#permission-panel").classList.add("hidden");
  $("#loading-panel").classList.remove("hidden");
  try {
    await attachCamera(video);
    const backend = await detectVisionBackend();
    renderBackendBadge($("#backend-badge"), backend);
    const asset = await fetchModelAsset(MODEL_URLS.face, {
      onProgress: ({ loaded, total, percent, fromCache }) => {
        $("#progress-fill").style.width = `${percent}%`;
        $("#progress-percent").textContent = total ? `${Math.round(percent)}%` : formatBytes(loaded);
        $("#progress-label").textContent = fromCache ? "Loaded from browser cache" : `${formatBytes(loaded)} / ${total ? formatBytes(total) : "unknown"}`;
      },
    });
    registerDisposer(asset.revoke);
    landmarker = registerTask(await FaceLandmarker.createFromOptions(await getVisionFileset(), {
      baseOptions: { modelAssetPath: asset.url, delegate: backend.backend === "WebGPU" ? "GPU" : "CPU" },
      runningMode: "VIDEO",
      numFaces: 1,
      outputFaceBlendshapes: true,
    }));
    $("#loading-panel").classList.add("hidden");
    $("#demo").classList.remove("hidden");
    loop.start();
  } catch (error) {
    $("#loading-panel").classList.add("hidden");
    errorBoundary.show(classifyRuntimeError(error), { onRetry: start });
  }
}
$("#start-button").onclick = start;
registerDisposer(() => loop.stop());
