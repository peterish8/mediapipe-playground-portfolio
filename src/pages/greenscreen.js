import "../styles.css";
import { ImageSegmenter } from "@mediapipe/tasks-vision";
import { attachCamera, requestMedia } from "../shared/camera.js";
import { MODEL_URLS } from "../shared/constants.js";
import { fitCanvasToVideo, drawMirroredVideo } from "../shared/canvas-utils.js";
import { createDetectionLoop } from "../shared/detection-loop.js";
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
const sourceCanvas = document.createElement("canvas");
const sourceContext = sourceCanvas.getContext("2d");
const foregroundCanvas = document.createElement("canvas");
const foregroundContext = foregroundCanvas.getContext("2d");
const maskCanvas = document.createElement("canvas");
const maskContext = maskCanvas.getContext("2d");
const errorBoundary = createErrorBoundary($("#error-panel"));
const timestamp = new MonotonicTimestamp();
const modes = ["Blur", "Solid", "Gradient", "Upload"];
let mode = "Blur";
let uploadedImage;
let segmenter;
let busy = false;
let latestMask;
let latestMaskWidth = 0;
let latestMaskHeight = 0;
let lastInference = 0;
let maskFrames = 0;
let metricStarted = performance.now();

for (const name of modes) {
  const button = document.createElement("button");
  button.className = "tab";
  button.textContent = name;
  button.setAttribute("aria-pressed", String(name === mode));
  button.onclick = () => {
    mode = name;
    $("#mode-readout").textContent = name;
    $("#solid-control").classList.toggle("hidden", name !== "Solid");
    $("#upload-control").classList.toggle("hidden", name !== "Upload");
    document.querySelectorAll("#mode-tabs .tab").forEach((tab) => tab.setAttribute("aria-pressed", String(tab === button)));
  };
  $("#mode-tabs").append(button);
}

$("#upload-image").onchange = async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  uploadedImage = await createImageBitmap(file);
};

function drawBackground(width, height) {
  if (!context) return;
  if (mode === "Blur") {
    context.save();
    context.filter = "blur(18px) saturate(.9)";
    context.drawImage(sourceCanvas, -24, -24, width + 48, height + 48);
    context.restore();
  } else if (mode === "Solid") {
    context.fillStyle = $("#solid-color").value;
    context.fillRect(0, 0, width, height);
  } else if (mode === "Gradient") {
    const gradient = context.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#064e3b"); gradient.addColorStop(.52, "#1d4ed8"); gradient.addColorStop(1, "#581c87");
    context.fillStyle = gradient; context.fillRect(0, 0, width, height);
  } else if (uploadedImage) {
    const scale = Math.max(width / uploadedImage.width, height / uploadedImage.height);
    const w = uploadedImage.width * scale, h = uploadedImage.height * scale;
    context.drawImage(uploadedImage, (width-w)/2, (height-h)/2, w, h);
  } else {
    context.fillStyle = "#111827"; context.fillRect(0, 0, width, height);
  }
}

function renderComposite() {
  if (!context || !sourceContext || !foregroundContext || !maskContext) return;
  if (!fitCanvasToVideo(canvas, video)) return;
  for (const item of [sourceCanvas, foregroundCanvas]) {
    item.width = canvas.width; item.height = canvas.height;
  }
  drawMirroredVideo(sourceContext, video, canvas.width, canvas.height);
  context.clearRect(0, 0, canvas.width, canvas.height);
  drawBackground(canvas.width, canvas.height);
  if (!latestMask) {
    context.drawImage(sourceCanvas, 0, 0);
    return;
  }

  maskCanvas.width = latestMaskWidth;
  maskCanvas.height = latestMaskHeight;
  const image = maskContext.createImageData(latestMaskWidth, latestMaskHeight);
  for (let index = 0; index < latestMask.length; index++) {
    const alpha = Math.max(0, Math.min(255, latestMask[index] * 255));
    const offset = index * 4;
    image.data[offset] = 255; image.data[offset + 1] = 255; image.data[offset + 2] = 255; image.data[offset + 3] = alpha;
  }
  maskContext.putImageData(image, 0, 0);
  foregroundContext.clearRect(0, 0, canvas.width, canvas.height);
  foregroundContext.globalCompositeOperation = "source-over";
  foregroundContext.drawImage(sourceCanvas, 0, 0);
  foregroundContext.globalCompositeOperation = "destination-in";
  foregroundContext.drawImage(maskCanvas, 0, 0, canvas.width, canvas.height);
  foregroundContext.globalCompositeOperation = "source-over";
  context.drawImage(foregroundCanvas, 0, 0);
}

const loop = createDetectionLoop(() => {
  if (!segmenter || video.readyState < 2) return;
  renderComposite();
  const now = performance.now();
  if (busy || now - lastInference < 105) return;
  busy = true;
  lastInference = now;
  segmenter.segmentForVideo(video, timestamp.next(), (result) => {
    try {
      const mask = result.confidenceMasks?.[0];
      if (mask) {
        latestMask = new Float32Array(mask.getAsFloat32Array());
        latestMaskWidth = mask.width;
        latestMaskHeight = mask.height;
        mask.close?.();
        $("#viewport-placeholder").classList.add("hidden");
        maskFrames++;
        const elapsed = performance.now() - metricStarted;
        if (elapsed > 1000) {
          const fps = Math.round((maskFrames * 1000) / elapsed);
          $("#fps-readout").textContent = `${fps} fps`;
          $("#fps-badge").textContent = `${fps} mask fps`;
          $("#fps-badge").classList.remove("hidden");
          maskFrames = 0; metricStarted = performance.now();
        }
      }
      result.close?.();
    } finally { busy = false; }
  });
});

const flow = new RecordPreviewFlow({
  recordButton: $("#record-button"), stopButton: $("#stop-button"),
  indicator: $("#recording-indicator"), timer: $("#recording-timer"),
  previewBox: $("#preview-box"), preview: $("#preview"),
}, { kind: "video", filename: "green-screen-studio.webm" });

async function prepareRecording() {
  const output = canvas.captureStream(30);
  try {
    const audio = await requestMedia({ audio: true, video: false }, "Microphone");
    audio.getAudioTracks().forEach((track) => output.addTrack(track));
  } catch {}
  registerStream(output);
  flow.setRecorder(createMediaRecorder(output, { kind: "video" }));
  flow.start();
}
$("#record-button").onclick = () => prepareRecording().catch((error) => errorBoundary.show(error));
$("#stop-button").onclick = () => flow.stop().catch((error) => errorBoundary.show(error));
$("#download-recording").onclick = () => flow.download();
$("#retake").onclick = () => flow.reset();

async function start() {
  errorBoundary.hide();
  $("#permission-panel").classList.add("hidden");
  $("#loading-panel").classList.remove("hidden");
  try {
    await attachCamera(video);
    const backend = await detectVisionBackend();
    renderBackendBadge($("#backend-badge"), backend);
    const asset = await fetchModelAsset(MODEL_URLS.segmenter, {
      onProgress: ({ loaded, total, percent, fromCache }) => {
        $("#progress-fill").style.width = `${percent}%`;
        $("#progress-percent").textContent = total ? `${Math.round(percent)}%` : formatBytes(loaded);
        $("#progress-label").textContent = fromCache ? "Loaded from browser cache" : `${formatBytes(loaded)} / ${total ? formatBytes(total) : "unknown"}`;
      },
    });
    registerDisposer(asset.revoke);
    segmenter = registerTask(await ImageSegmenter.createFromOptions(await getVisionFileset(), {
      baseOptions: { modelAssetPath: asset.url, delegate: backend.backend === "WebGPU" ? "GPU" : "CPU" },
      runningMode: "VIDEO",
      outputConfidenceMasks: true,
      outputCategoryMask: false,
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
registerDisposer(() => { loop.stop(); uploadedImage?.close?.(); });
