export function createErrorBoundary(element) {
  const title = element.querySelector("[data-error-title]");
  const detail = element.querySelector("[data-error-detail]");
  const retry = element.querySelector("[data-error-retry]");

  return {
    show(error, options = {}) {
      title.textContent = options.title ?? "Something went wrong";
      detail.textContent = error instanceof Error ? error.message : String(error);
      retry.hidden = typeof options.onRetry !== "function";
      retry.onclick = options.onRetry ?? null;
      element.classList.remove("hidden");
    },
    hide() {
      element.classList.add("hidden");
      retry.onclick = null;
    },
  };
}

export function classifyRuntimeError(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (/memory|allocation|out of memory/i.test(message)) {
    return new Error("The model could not fit in available memory. Close other tabs or choose a smaller model.");
  }
  if (/cors|fetch|network|http/i.test(message)) {
    return new Error(`The model could not be downloaded. ${message}`);
  }
  return error instanceof Error ? error : new Error(message);
}
