import fixWebmDuration from "fix-webm-duration";

const VIDEO_TYPES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];
const AUDIO_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
];

export function pickSupportedMimeType(kind = "video") {
  const candidates = kind === "audio" ? AUDIO_TYPES : VIDEO_TYPES;
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? "";
}

function fixDuration(blob, duration) {
  if (!/webm/i.test(blob.type)) return Promise.resolve(blob);
  return new Promise((resolve) => {
    try {
      fixWebmDuration(blob, duration, (fixed) => resolve(fixed));
    } catch {
      resolve(blob);
    }
  });
}

export function createMediaRecorder(stream, options = {}) {
  const kind = options.kind ?? "video";
  const mimeType = pickSupportedMimeType(kind);
  const chunks = [];
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  let startedAt = 0;

  recorder.addEventListener("dataavailable", (event) => {
    if (event.data.size) chunks.push(event.data);
  });

  return {
    recorder,
    start(timeslice = 1000) {
      chunks.length = 0;
      startedAt = performance.now();
      recorder.start(timeslice);
    },
    async stop() {
      if (recorder.state === "inactive") throw new Error("No recording is active.");
      const stopped = new Promise((resolve) => recorder.addEventListener("stop", resolve, { once: true }));
      recorder.stop();
      await stopped;
      const duration = Math.max(1, performance.now() - startedAt);
      const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || `${kind}/webm` });
      return fixDuration(blob, duration);
    },
  };
}
