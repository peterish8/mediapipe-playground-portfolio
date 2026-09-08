import { HAND_CONNECTIONS } from "./constants.js";

export function fitCanvasToVideo(canvas, video) {
  if (!video.videoWidth || !video.videoHeight) return false;
  if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
  }
  return true;
}

export function drawMirroredVideo(context, video, width, height) {
  context.save();
  context.translate(width, 0);
  context.scale(-1, 1);
  context.drawImage(video, 0, 0, width, height);
  context.restore();
}

export function point(landmark, width, height) {
  return { x: (1 - landmark.x) * width, y: landmark.y * height };
}

export function drawHandSkeleton(context, landmarks, width, height, color = "#6ee7b7") {
  context.save();
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = Math.max(2, width / 500);
  context.globalAlpha = 0.9;
  for (const [from, to] of HAND_CONNECTIONS) {
    const a = point(landmarks[from], width, height);
    const b = point(landmarks[to], width, height);
    context.beginPath();
    context.moveTo(a.x, a.y);
    context.lineTo(b.x, b.y);
    context.stroke();
  }
  for (const landmark of landmarks) {
    const p = point(landmark, width, height);
    context.beginPath();
    context.arc(p.x, p.y, Math.max(2.5, width / 270), 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}
