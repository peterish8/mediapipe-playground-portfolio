export async function detectVisionBackend() {
  if (!("gpu" in navigator)) return { backend: "WASM", label: "🧮 WASM CPU fallback", tone: "warning" };
  try {
    const adapter = await /** @type {any} */ (navigator).gpu.requestAdapter();
    if (adapter) return { backend: "WebGPU", label: "⚡ WebGPU accelerated", tone: "success" };
  } catch {}
  return { backend: "WASM", label: "🧮 WASM CPU fallback", tone: "warning" };
}

export async function checkGenAiCapability() {
  if (!("gpu" in navigator)) {
    return { supported: false, reason: "WebGPU is required for this demo, but this browser does not expose it." };
  }
  try {
    const adapter = await /** @type {any} */ (navigator).gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) return { supported: false, reason: "No WebGPU adapter is available. Try current Chrome or Edge with hardware acceleration enabled." };
    const storageLimit = adapter.limits?.maxStorageBufferBindingSize ?? 0;
    if (storageLimit && storageLimit < 128 * 1024 * 1024) {
      return { supported: false, reason: "This GPU exposes too little storage-buffer capacity for browser LLM inference." };
    }
    return { supported: true, adapter };
  } catch (error) {
    return { supported: false, reason: error instanceof Error ? error.message : "WebGPU initialization failed." };
  }
}

export function renderBackendBadge(element, result) {
  element.textContent = result.label;
  element.className = `badge ${result.tone}`;
}
