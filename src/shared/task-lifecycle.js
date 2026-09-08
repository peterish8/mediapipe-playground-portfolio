const tasks = new Set();
const streams = new Set();
const disposers = new Set();
let bound = false;

export function registerTask(task) {
  tasks.add(task);
  return task;
}

export function registerStream(stream) {
  streams.add(stream);
  return stream;
}

export function registerDisposer(disposer) {
  disposers.add(disposer);
  return disposer;
}

export function unregisterStream(stream) {
  streams.delete(stream);
}

export function teardownAll() {
  for (const disposer of disposers) {
    try { disposer(); } catch (error) { console.warn("Disposer failed", error); }
  }
  disposers.clear();

  for (const task of tasks) {
    try { task.close?.(); } catch (error) { console.warn("Task close failed", error); }
  }
  tasks.clear();

  for (const stream of streams) {
    for (const track of stream.getTracks()) track.stop();
  }
  streams.clear();
}

export function bindPageTeardown() {
  if (bound) return;
  bound = true;
  window.addEventListener("pagehide", teardownAll, { capture: true });
  window.addEventListener("beforeunload", teardownAll, { capture: true });
}
