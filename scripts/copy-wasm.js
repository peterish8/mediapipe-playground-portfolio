import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const targets = [
  ["@mediapipe/tasks-vision/wasm", "public/wasm/vision"],
  ["@mediapipe/tasks-genai/wasm", "public/wasm/genai"],
];

for (const [source, destination] of targets) {
  const sourcePath = resolve(root, "node_modules", source);
  const destinationPath = resolve(root, destination);
  await rm(destinationPath, { recursive: true, force: true });
  await mkdir(destinationPath, { recursive: true });
  await cp(sourcePath, destinationPath, { recursive: true });
  console.log(`Copied ${source} -> ${destination}`);
}
