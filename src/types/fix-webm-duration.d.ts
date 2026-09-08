declare module "fix-webm-duration" {
  export default function fixWebmDuration(
    blob: Blob,
    duration: number,
    callback: (fixedBlob: Blob) => void
  ): void;
}
