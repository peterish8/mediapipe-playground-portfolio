import { downloadBlob, showToast } from "./download.js";
import { formatDuration } from "./format.js";

export class RecordPreviewFlow {
  #recording;
  #timer;
  #startedAt = 0;
  #blob;
  #url;

  constructor(elements, options = {}) {
    this.elements = elements;
    this.kind = options.kind ?? "video";
    this.filename = options.filename ?? `mediapipe-playground.webm`;
  }

  setRecorder(recording) {
    this.#recording = recording;
  }

  start() {
    if (!this.#recording) throw new Error("Recorder is not ready.");
    this.reset();
    this.#recording.start();
    this.#startedAt = performance.now();
    this.elements.indicator?.classList.add("active");
    this.elements.recordButton.hidden = true;
    this.elements.stopButton.hidden = false;
    this.#timer = window.setInterval(() => {
      if (this.elements.timer) this.elements.timer.textContent = formatDuration(performance.now() - this.#startedAt);
    }, 250);
  }

  async stop() {
    if (!this.#recording) return;
    clearInterval(this.#timer);
    this.elements.indicator?.classList.remove("active");
    this.elements.stopButton.disabled = true;
    this.#blob = await this.#recording.stop();
    this.#url = URL.createObjectURL(this.#blob);
    this.elements.preview.src = this.#url;
    this.elements.previewBox.classList.add("visible");
    this.elements.stopButton.hidden = true;
    this.elements.stopButton.disabled = false;
  }

  download() {
    if (!this.#blob) return;
    downloadBlob(this.#blob, this.filename);
    showToast("Download started — nothing was uploaded.");
  }

  reset() {
    clearInterval(this.#timer);
    if (this.#url) URL.revokeObjectURL(this.#url);
    this.#url = undefined;
    this.#blob = undefined;
    this.elements.preview.removeAttribute("src");
    this.elements.preview.load?.();
    this.elements.previewBox.classList.remove("visible");
    this.elements.recordButton.hidden = false;
    this.elements.stopButton.hidden = true;
    this.elements.indicator?.classList.remove("active");
    if (this.elements.timer) this.elements.timer.textContent = "00:00";
  }
}
