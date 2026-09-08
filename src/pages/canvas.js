import "../styles.css";
import { HandLandmarker } from "@mediapipe/tasks-vision";
import { attachCamera } from "../shared/camera.js";
import { MODEL_URLS } from "../shared/constants.js";
import { fitCanvasToVideo, drawMirroredVideo, drawHandSkeleton, point } from "../shared/canvas-utils.js";
import { createDetectionLoop } from "../shared/detection-loop.js";
import { downloadCanvas, showToast } from "../shared/download.js";
import { createErrorBoundary, classifyRuntimeError } from "../shared/error-boundary.js";
import { formatBytes } from "../shared/format.js";
import { detectVisionBackend, renderBackendBadge } from "../shared/backend-badge.js";
import { fetchModelAsset, getVisionFileset } from "../shared/task-loader.js";
import { bindPageTeardown, registerDisposer, registerTask } from "../shared/task-lifecycle.js";
import { MonotonicTimestamp } from "../shared/timestamp-counter.js";

bindPageTeardown();

const $ = (selector) => document.querySelector(selector);
const video = /** @type {HTMLVideoElement} */ ($("#video"));
const canvas = /** @type {HTMLCanvasElement} */ ($("#display-canvas"));
const context = canvas.getContext("2d");
const art = document.createElement("canvas");
const artContext = art.getContext("2d");
const errorBoundary = createErrorBoundary($("#error-panel"));
const timestamp = new MonotonicTimestamp();
const colors = ["#f5f5f5", "#34d399", "#60a5fa", "#f472b6", "#fbbf24", "#f87171"];
let landmarker;
let lastVideoTime = -1;
let previous;
let activeColor = colors[1];

for (const color of colors) {
  const button = document.createElement("button");
  button.className = "swatch";
  button.style.background = color;
  button.setAttribute("aria-label", `Use ${color}`);
  button.setAttribute("aria-pressed", String(color === activeColor));
  button.onclick = () => {
    activeColor = color;
    document.querySelectorAll(".swatch").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
  };
  $("#swatches").append(button);
}

const loop = createDetectionLoop(() => {
  if (!landmarker || video.readyState < 2 || !context || !artContext) return;
  if (!fitCanvasToVideo(canvas, video)) return;
  if (art.width !== canvas.width || art.height !== canvas.height) {
    const snapshot = document.createElement("canvas");
    snapshot.width = art.width; snapshot.height = art.height;
    snapshot.getContext("2d")?.drawImage(art, 0, 0);
    art.width = canvas.width; art.height = canvas.height;
    artContext.drawImage(snapshot, 0, 0, art.width, art.height);
  }
  drawMirroredVideo(context, video, canvas.width, canvas.height);
  context.drawImage(art, 0, 0);
  if (video.currentTime === lastVideoTime) return;
  lastVideoTime = video.currentTime;

  const result = landmarker.detectForVideo(video, timestamp.next());
  const landmarks = result.landmarks?.[0];
  if (!landmarks) {
    $("#tracking-state").textContent = "Lost";
    $("#pinch-state").textContent = "✋ Hovering";
    previous = undefined;
    return;
  }
  $("#viewport-placeholder").classList.add("hidden");
  $("#tracking-state").textContent = "Locked";
  drawHandSkeleton(context, landmarks, canvas.width, canvas.height);
  const thumb = landmarks[4];
  const index = landmarks[8];
  const pinchDistance = Math.hypot(thumb.x - index.x, thumb.y - index.y, (thumb.z ?? 0) - (index.z ?? 0));
  const current = point(index, art.width, art.height);
  const pinched = pinchDistance < 0.055;
  $("#pinch-state").textContent = pinched ? "✏️ Drawing" : "✋ Hovering";

  context.beginPath();
  context.arc(current.x, current.y, Math.max(7, canvas.width / 110), 0, Math.PI * 2);
  context.fillStyle = pinched ? activeColor : "rgba(255,255,255,.7)";
  context.fill();

  if (pinched && previous) {
    artContext.strokeStyle = activeColor;
    artContext.lineWidth = Math.max(5, art.width / 180);
    artContext.lineCap = "round";
    artContext.lineJoin = "round";
    artContext.beginPath();
    artContext.moveTo(previous.x, previous.y);
    artContext.lineTo(current.x, current.y);
    artContext.stroke();
  }
  previous = pinched ? current : undefined;
});

async function start() {
  errorBoundary.hide();
  $("#permission-panel").classList.add("hidden");
  $("#loading-panel").classList.remove("hidden");
  try {
    await attachCamera(video);
    const backend = await detectVisionBackend();
    renderBackendBadge($("#backend-badge"), backend);
    const asset = await fetchModelAsset(MODEL_URLS.hand, {
      onProgress: ({ loaded, total, percent, fromCache }) => {
        $("#progress-fill").style.width = `${percent}%`;
        $("#progress-percent").textContent = total ? `${Math.round(percent)}%` : formatBytes(loaded);
        $("#progress-label").textContent = fromCache ? "Loaded from browser cache" : `${formatBytes(loaded)} / ${total ? formatBytes(total) : "unknown"}`;
      },
    });
    registerDisposer(asset.revoke);
    const fileset = await getVisionFileset();
    landmarker = registerTask(await HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: asset.url, delegate: backend.backend === "WebGPU" ? "GPU" : "CPU" },
      runningMode: "VIDEO",
      numHands: 1,
      minHandDetectionConfidence: 0.55,
      minTrackingConfidence: 0.5,
    }));
    $("#loading-panel").classList.add("hidden");
    $("#demo").classList.remove("hidden");
    loop.start();
  } catch (error) {
    $("#loading-panel").classList.add("hidden");
    errorBoundary.show(classifyRuntimeError(error), { onRetry: start });
  }
}

$("#start-button").addEventListener("click", start);
$("#clear-button").addEventListener("click", () => {
  artContext?.clearRect(0, 0, art.width, art.height);
  showToast("Canvas cleared.");
});
$("#download-button").addEventListener("click", () => {
  downloadCanvas(art, `air-canvas-${new Date().toISOString().slice(0,10)}.png`);
  showToast("PNG download started.");
});
registerDisposer(() => loop.stop());
