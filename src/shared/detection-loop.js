export function createDetectionLoop(step) {
  let frame = 0;
  let running = false;

  const tick = async () => {
    if (!running) return;
    try { await step(); } catch (error) { console.error("Detection frame failed", error); }
    if (running) frame = requestAnimationFrame(tick);
  };

  return {
    start() {
      if (running) return;
      running = true;
      frame = requestAnimationFrame(tick);
    },
    stop() {
      running = false;
      cancelAnimationFrame(frame);
    },
  };
}
