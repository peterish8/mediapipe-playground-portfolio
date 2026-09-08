import { registerStream, unregisterStream } from "./task-lifecycle.js";

export class MediaPermissionError extends Error {
  constructor(kind, message, cause) {
    super(message, { cause });
    this.name = "MediaPermissionError";
    this.kind = kind;
  }
}

function classify(error, mediaKind) {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return new MediaPermissionError("denied", `${mediaKind} access was denied. Allow it in your browser's site settings, then try again.`, error);
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return new MediaPermissionError("missing-device", `No ${mediaKind.toLowerCase()} device was found. Connect one and try again.`, error);
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return new MediaPermissionError("busy", `Your ${mediaKind.toLowerCase()} is already in use by another app or tab. Close it there and retry.`, error);
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    return new MediaPermissionError("unsupported", "This browser does not support camera or microphone access.", error);
  }
  return new MediaPermissionError("unknown", `Unable to start the ${mediaKind.toLowerCase()}. ${error instanceof Error ? error.message : ""}`, error);
}

export async function requestMedia(constraints, label = "Camera") {
  if (!navigator.mediaDevices?.getUserMedia) throw classify(new Error("getUserMedia unavailable"), label);
  try {
    return registerStream(await navigator.mediaDevices.getUserMedia(constraints));
  } catch (error) {
    throw classify(error, label);
  }
}

export async function attachCamera(video, options = {}) {
  const stream = await requestMedia({
    video: {
      width: { ideal: options.width ?? 1280 },
      height: { ideal: options.height ?? 720 },
      facingMode: options.facingMode ?? "user",
    },
    audio: options.audio ?? false,
  }, "Camera");
  video.srcObject = stream;
  await video.play();
  return stream;
}

export function stopMedia(stream) {
  if (!stream) return;
  for (const track of stream.getTracks()) track.stop();
  unregisterStream(stream);
}
