import "../styles.css";
import { LlmInference } from "@mediapipe/tasks-genai";
import { CHAT_MODELS } from "../shared/constants.js";
import { checkGenAiCapability } from "../shared/backend-badge.js";
import { createErrorBoundary, classifyRuntimeError } from "../shared/error-boundary.js";
import { formatBytes } from "../shared/format.js";
import { fetchModelAsset, getGenAiFileset } from "../shared/task-loader.js";
import { bindPageTeardown, registerDisposer, registerTask } from "../shared/task-lifecycle.js";

bindPageTeardown();
const $ = (selector) => document.querySelector(selector);
const errorBoundary = createErrorBoundary($("#error-panel"));
let selected = "small";
let engine;
let modelAsset;
let generationToken = 0;
let ready = false;

for (const [key, model] of Object.entries(CHAT_MODELS)) {
  const button = document.createElement("button");
  button.className = "model-option";
  button.setAttribute("aria-pressed", String(key === selected));
  button.innerHTML = `<strong>${model.label}</strong><span>${model.size}</span><small>${model.note}</small>`;
  button.onclick = () => {
    selected = key;
    document.querySelectorAll(".model-option").forEach((item) => item.setAttribute("aria-pressed", String(item === button)));
  };
  $("#model-grid").append(button);
}

async function initialize() {
  errorBoundary.hide();
  $("#initialize-button").disabled = true;
  $("#loading-panel").classList.remove("hidden");
  const model = CHAT_MODELS[selected];
  try {
    engine?.close?.();
    modelAsset?.revoke?.();
    modelAsset = await fetchModelAsset(model.url, {
      cacheName: "mediapipe-playground-llm-v1",
      onProgress: ({ loaded, total, percent, fromCache }) => {
        $("#progress-fill").style.width = `${percent}%`;
        $("#progress-percent").textContent = total ? `${Math.round(percent)}%` : formatBytes(loaded);
        $("#progress-label").textContent = fromCache ? "Loaded from browser cache" : `${formatBytes(loaded)} / ${total ? formatBytes(total) : "unknown"}`;
      },
    });
    registerDisposer(modelAsset.revoke);
    const fileset = await getGenAiFileset();
    engine = registerTask(await LlmInference.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: modelAsset.url },
      maxTokens: 768,
      topK: 40,
      temperature: 0.8,
      randomSeed: 101,
    }));
    ready = true;
    $("#prompt").disabled = false;
    $("#generate-button").disabled = false;
    $("#response").textContent = "Model ready. Ask a question.";
    $("#initialize-button").textContent = "Reinitialize model";
  } catch (error) {
    ready = false;
    errorBoundary.show(classifyRuntimeError(error), { title: "Model initialization failed", onRetry: initialize });
  } finally {
    $("#loading-panel").classList.add("hidden");
    $("#initialize-button").disabled = false;
  }
}

async function generate() {
  const prompt = $("#prompt").value.trim();
  if (!ready || !engine || !prompt) return;
  const token = ++generationToken;
  const startedAt = performance.now();
  let firstChunk = true;
  $("#response").textContent = "";
  $("#generate-button").disabled = true;
  $("#cancel-button").hidden = false;
  $("#ttft-badge").classList.add("hidden");

  try {
    const callback = (partial, done) => {
      if (token !== generationToken) return;
      if (firstChunk && partial) {
        firstChunk = false;
        $("#ttft-badge").textContent = `TTFT: ${Math.round(performance.now() - startedAt)}ms`;
        $("#ttft-badge").classList.remove("hidden");
      }
      if (partial) $("#response").textContent += partial;
      if (done) finishGeneration(token);
    };
    const result = engine.generateResponse(prompt, callback);
    if (result instanceof Promise) await result;
    finishGeneration(token);
  } catch (error) {
    if (token === generationToken) errorBoundary.show(error, { title: "Generation failed" });
    finishGeneration(token);
  }
}

function finishGeneration(token) {
  if (token !== generationToken) return;
  $("#generate-button").disabled = !ready;
  $("#cancel-button").hidden = true;
}

function cancel() {
  generationToken++;
  $("#cancel-button").hidden = true;
  $("#generate-button").disabled = true;
  $("#response").textContent += "\n\n[Generation cancelled. Reinitialize from the browser cache to continue.]";
  try { engine?.close?.(); } catch {}
  engine = undefined;
  ready = false;
  $("#prompt").disabled = true;
  $("#initialize-button").textContent = "Reinitialize cached model";
}

$("#initialize-button").onclick = initialize;
$("#generate-button").onclick = generate;
$("#cancel-button").onclick = cancel;
$("#prompt").addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") generate();
});

const capability = await checkGenAiCapability();
$("#capability-panel").classList.add("hidden");
if (!capability.supported) {
  $("#backend-badge").textContent = "WebGPU unavailable";
  $("#backend-badge").className = "badge danger";
  errorBoundary.show(new Error(capability.reason), { title: "WebGPU required" });
} else {
  $("#backend-badge").textContent = "⚡ WebGPU required";
  $("#backend-badge").className = "badge success";
  $("#chat-demo").classList.remove("hidden");
}
