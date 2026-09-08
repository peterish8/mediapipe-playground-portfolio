import { FilesetResolver as VisionFilesetResolver } from "@mediapipe/tasks-vision";
import { FilesetResolver as GenAiFilesetResolver } from "@mediapipe/tasks-genai";

let visionFilesetPromise;
let genAiFilesetPromise;

export function getVisionFileset() {
  visionFilesetPromise ??= VisionFilesetResolver.forVisionTasks("/wasm/vision");
  return visionFilesetPromise;
}

export function getGenAiFileset() {
  genAiFilesetPromise ??= GenAiFilesetResolver.forGenAiTasks("/wasm/genai");
  return genAiFilesetPromise;
}

export async function fetchModelAsset(url, options = {}) {
  const cacheName = options.cacheName ?? "mediapipe-playground-models-v1";
  const cache = "caches" in window ? await caches.open(cacheName) : null;
  const cached = cache ? await cache.match(url) : undefined;
  if (cached) {
    const blob = await cached.blob();
    options.onProgress?.({ loaded: blob.size, total: blob.size, percent: 100, fromCache: true });
    const objectUrl = URL.createObjectURL(blob);
    return { url: objectUrl, blob, fromCache: true, revoke: () => URL.revokeObjectURL(objectUrl) };
  }

  let response;
  try {
    response = await fetch(url, { signal: options.signal, mode: "cors" });
  } catch (error) {
    throw new Error(`Model download could not start. Check your connection and the model host's CORS policy. ${error instanceof Error ? error.message : ""}`);
  }
  if (!response.ok) {
    const gate = response.status === 401 || response.status === 403
      ? " This model may require accepting its license on Hugging Face before download."
      : "";
    throw new Error(`Model download failed with HTTP ${response.status}.${gate}`);
  }

  const total = Number(response.headers.get("content-length")) || 0;
  const reader = response.body?.getReader();
  if (!reader) {
    const blob = await response.blob();
    await cache?.put(url, new Response(blob, { headers: { "Content-Type": blob.type || "application/octet-stream" } }));
    const objectUrl = URL.createObjectURL(blob);
    options.onProgress?.({ loaded: blob.size, total: blob.size, percent: 100, fromCache: false });
    return { url: objectUrl, blob, fromCache: false, revoke: () => URL.revokeObjectURL(objectUrl) };
  }

  const chunks = [];
  let loaded = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    options.onProgress?.({
      loaded,
      total,
      percent: total ? Math.min(100, (loaded / total) * 100) : 0,
      fromCache: false,
    });
  }
  const blob = new Blob(chunks, { type: response.headers.get("content-type") || "application/octet-stream" });
  await cache?.put(url, new Response(blob, { headers: { "Content-Type": blob.type } }));
  const objectUrl = URL.createObjectURL(blob);
  options.onProgress?.({ loaded: blob.size, total: total || blob.size, percent: 100, fromCache: false });
  return { url: objectUrl, blob, fromCache: false, revoke: () => URL.revokeObjectURL(objectUrl) };
}
