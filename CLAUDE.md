<!-- GSD:project-start source:PROJECT.md -->
## Project

**MediaPipe Playground**

A single Vite website ("MediaPipe Playground") that hosts five self-contained, creative, on-device AI demos, each showcasing a different Google MediaPipe capability. Every demo runs 100% client-side in the browser — no backend, no API keys, no telemetry — and every demo ends in something the user can keep: a downloaded recording, image, or audio file. It exists to let a visitor try real on-device AI/CV in under a minute and walk away with proof (a file) that it worked.

**Core Value:** Every one of the 5 showcases must load a real MediaPipe model in-browser and produce a working, recordable/downloadable result from the user's own camera/mic/keyboard input — with zero server round-trips. If a demo can't do that, it isn't done.

### Constraints

- **Tech stack**: Vite, vanilla JS (no framework — but use `jsconfig.json` + `checkJs` against MediaPipe's shipped `.d.ts` files for type-checking without converting to real `.ts`, per stack research), Tailwind **v4** via `@tailwindcss/vite` (not v3/autoprefixer, not the CDN play-script used in the earlier prototype) — user explicitly asked for "a proper vite website"
- **Architecture**: Multi-page app (one HTML entry point per demo) rather than an SPA — each demo loads its own heavy WASM/ML runtime; keeping them as separate pages avoids loading all 5 model runtimes at once and mirrors how Google's own official samples repo is structured
- **Zero server**: no backend of any kind; model files are fetched directly from their public CDN/HF URLs at runtime and cached client-side (Cache API), same pattern proven in the LiteRT-LM prototype
- **Self-host MediaPipe WASM, don't CDN-load it**: research corrected the original ground truth — Google's own current `mediapipe-samples-web` repo copies `node_modules/@mediapipe/*/wasm` into `public/wasm/` via a `copy-wasm.js` prebuild script and serves it same-origin. Vite config also needs `worker: { format: 'es' }` and `optimizeDeps: { exclude: ['@mediapipe/tasks-vision', '@mediapipe/tasks-genai'] }` to avoid dev-mode esbuild pre-bundling breaking wasm/worker loading
- **MediaPipe GenAI (`LlmInference`) has NO WASM/CPU fallback** — unlike the 4 vision demos, it hard-requires WebGPU with no documented delegate alternative. The Chat demo needs its own stricter capability-check path (block/explain clearly if WebGPU is unavailable) rather than reusing the vision demos' "WebGPU optional, WASM fallback" badge logic
- **No external asset files for AR content**: face filter overlays (glasses, hats, etc.) must be drawn procedurally with canvas primitives, not sourced image/PNG stickers — avoids asset licensing and keeps the repo self-contained
- **Browser APIs relied on**: `getUserMedia` (camera+mic), `MediaRecorder` (+ `fix-webm-duration` — Chromium's webm output reliably lacks duration metadata, near-mandatory small dependency for all 3 recording demos), `canvas.captureStream()`, Web Audio API, Cache API, WebGPU (optional w/ WASM/XNNPACK fallback for the 4 vision demos; **mandatory, no fallback**, for the Chat demo) — every demo needs a real permission/error boundary for when these are denied or unsupported
- **Detection loop timestamps**: `detectForVideo()`/`segmentForVideo()` require a monotonically-increasing timestamp per task instance — must use a running counter or `performance.now()`, never `Date.now()` or a value that can repeat/go backwards; violating this throws an unrecoverable error requiring the task instance to be destroyed and recreated
- **Hosting target undecided**: GitHub Pages cannot set custom response headers, so COOP/COEP (and the faster SharedArrayBuffer-based WASM variant) aren't available there without a client-side polyfill (`coi-serviceworker`); Netlify/Vercel/Cloudflare Pages support headers natively. Needs a decision before/during the shared-infrastructure phase
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Recommended Stack
### Core Technologies
| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Vite | ^8.1.5 | Build tool / multi-page bundler / dev server | Native multi-entry-point HTML support (`build.rollupOptions.input`), fast esbuild/rolldown-based dev server, zero-config static asset handling. This is the same major version (`^8.1.0`) that Google's own `google-ai-edge/mediapipe-samples-web` repo currently pins as of its last update (within the last 2 weeks). |
| @mediapipe/tasks-vision | ^0.10.35 | HandLandmarker, GestureRecognizer, FaceLandmarker, ImageSegmenter | Verified current npm latest (checked live registry). This is the single package covering 4 of your 5 demos. Confirmed real, actively maintained (google-ai-edge org, weekly-ish commits). |
| @mediapipe/tasks-genai | ^0.10.29 | LlmInference (on-device chat) | Verified current npm latest. Note it trails `tasks-vision` by a few patch releases — they are versioned/released independently even though both live in the same MediaPipe monorepo, so don't assume version parity across the two packages. |
| Tone.js | ^15.1.22 | Synth engine, effects, audio routing/mixing for the Gesture Synth demo | Verified current npm latest. Standard choice for Web Audio synthesis in vanilla JS — abstracts away raw `AudioContext` node-graph wiring, ships built-in synth voice types (`Synth`, `AMSynth`, `FMSynth`, `MonoSynth`, `PolySynth`, `PluckSynth`, `MetalSynth`) that map directly to your gesture→instrument-voice requirement. |
| Tailwind CSS | ^4.3.3 | Utility CSS | v4 is a ground-up rewrite (Rust/Lightning CSS engine, ~5x faster than v3's PostCSS pipeline). Confirmed current major/stable via npm. Built-in vendor-prefixing means `autoprefixer` is no longer needed as a separate dependency. |
### Supporting Libraries
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| @tailwindcss/vite | ^4.3.3 | Tailwind v4's official Vite-native plugin | Primary integration path — add to `plugins: []` in `vite.config.js`, `@import "tailwindcss"` in one CSS file. Zero PostCSS config file needed. This is what Tailwind's own docs recommend for Vite projects in 2026. |
| @tailwindcss/postcss | ^4.3.3 | Tailwind v4 via a conventional `postcss.config.js` pipeline | Use **instead of** `@tailwindcss/vite` only if you need to chain other PostCSS plugins (e.g. `postcss-import`, custom nesting/logical-property transforms) alongside Tailwind, or want one shared `postcss.config.js` that behaves identically across all 6 HTML entry points without touching `vite.config.js` plugins. Functionally identical output to `@tailwindcss/vite` — same engine, different invocation point. This satisfies your "proper PostCSS build, not CDN" constraint either way. |
| vite-plugin-pwa | ^1.3.0 | Service worker generation, offline app-shell caching, PWA manifest | Use `strategies: 'generateSW'` (the default) to precache your own built HTML/CSS/JS (the "app shell") so the hub + 5 demo pages work offline after first visit, and to add `runtimeCaching` (Workbox `CacheFirst`) entries for the **small, fixed-URL, rarely-changing** MediaPipe model files (`hand_landmarker.task`, `face_landmarker.task`, `gesture_recognizer.task`, `selfie_segmenter.tflite` — all under ~10MB from `storage.googleapis.com/mediapipe-models/...`). **Do NOT** route the LLM chat models (250MB–3GB from Hugging Face) through Workbox `runtimeCaching` — see Pitfalls below. |
| fix-webm-duration | ^1.0.6 | Patches missing duration metadata on MediaRecorder-produced `.webm` blobs | Apply to every video/audio blob before offering it for download. Chromium's `MediaRecorder` (all 3 recording demos — Gesture Synth, Magic Mirror, Green Screen — use `MediaRecorder`) writes webm without a duration header when recording is stopped mid-stream, which makes the file show `Infinity` duration and fail to seek in most players until "fixed." This is a well-documented Chromium behavior (Bugzilla/Chromium bug threads), not a hypothetical edge case — it will reproduce on every single recording you make. Tiny (no dependencies), synchronous append, no re-encoding. |
| coi-serviceworker | ^0.1.7 | Client-side polyfill for Cross-Origin-Opener-Policy / Cross-Origin-Embedder-Policy headers | **Only needed if you deploy to a static host that cannot set custom HTTP response headers** (GitHub Pages is the classic case). If you deploy to Netlify, Vercel, or Cloudflare Pages instead, set the two headers natively via that host's headers config file and skip this library entirely (see Pitfalls). |
### Development Tools
| Tool | Purpose | Notes |
|------|---------|-------|
| TypeScript, in `checkJs` mode (not full `.ts` conversion) | Static type-checking for the WebRTC/WASM/MediaPipe API surface, while keeping source files as `.js` | Add a `jsconfig.json` (or `tsconfig.json` with `allowJs: true, checkJs: true, noEmit: true`) and run `tsc --noEmit` in CI/pre-commit. `@mediapipe/tasks-vision` and `@mediapipe/tasks-genai` both ship `.d.ts` type declarations, so you get full autocomplete/type-checking on `FilesetResolver`, `HandLandmarker`, `LlmInference`, etc. for free without adding a `.ts` build step or violating the "vanilla JS, no framework" constraint. See "TypeScript vs vanilla JS" under Alternatives Considered for the full reasoning — Google's own official samples repo (`mediapipe-samples-web`) has fully converted to real `.ts` files with `tsc && vite build`, which is worth knowing even though this project is deliberately not following that path. |
| ESLint + `eslint-plugin-html` | Lint vanilla JS across multiple HTML entry points, including inline `<script>` blocks if any | Matches the linting setup Google's own samples repo uses. |
| Prettier | Formatting for `.js`, `.html`, `.css` | Same tooling choice as the official samples repo. |
| `copy-wasm.js`-style npm script (custom Node script, not a Vite plugin) | Copies `node_modules/@mediapipe/tasks-vision/wasm/*` and `node_modules/@mediapipe/tasks-genai/wasm/*` into `public/wasm/` before `dev` and `build` | This is the exact pattern Google's own `mediapipe-samples-web` repo uses today (`predev`/`prebuild` npm lifecycle hooks calling a ~20-line `fs.copyFileSync` script). They previously used `vite-plugin-static-copy` for this and **removed it** (commit: "Remove Vite-Static-Copy") in favor of the plain script — take that as a signal that the plugin added more indirection than value for this specific need. |
## Installation
# Core
# Styling
# (or, if you want a conventional postcss.config.js instead:)
# npm install -D tailwindcss @tailwindcss/postcss
# PWA / offline caching (app shell + small model/wasm assets only)
# Recording correctness
# Type-checking vanilla JS (no .ts conversion)
# Only if deploying to GitHub Pages (or another host with no custom-header support)
# Lint/format (optional but matches official samples repo conventions)
## Alternatives Considered
| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|--------------------------|
| CDN-hosted MediaPipe wasm at runtime (`FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision/wasm")`), as originally assumed in project ground truth | **Self-host the wasm files** by copying `node_modules/@mediapipe/*/wasm` into `public/wasm/` at build time and pointing `FilesetResolver` at the local `/wasm` path | **This is actually the recommended path, not just an alternative.** Google's own current official samples repo does this, not CDN-loading, and pairs it with COOP/COEP headers on the dev/preview server for cross-origin isolation (see Pitfalls). Self-hosting removes a third-party runtime dependency (jsDelivr uptime/latency), makes the wasm cacheable alongside your own app shell via `vite-plugin-pwa`, and is required if you want the SIMD+threaded wasm variant to actually engage (that variant needs `crossOriginIsolated`, which a cross-origin CDN script can complicate depending on CORS headers on the CDN response). CDN-loading remains simpler to set up if you don't care about offline support or squeezing out threaded wasm performance — mention this to the user as the tradeoff if they want to skip the copy-script build step. |
| TypeScript in `checkJs` mode over plain `.js` files | Full `.ts` conversion (rename everything, add real type annotations) | If the team decides to revisit the "vanilla JS, no framework" constraint. Full TS is what Google's own samples repo does, and it buys real compile-time safety on `MediaRecorder`, `MediaStream`, `ImageSegmenter` mask readback, etc. — all APIs with notoriously loose/optional-heavy TS lib definitions where mistakes are easy. Given the constraint is explicit and already decided, `checkJs` is the better fit here: same `.js` files, same "no framework" spirit, ~80% of the type-safety benefit (catches wrong-property-name and null/undefined mistakes against MediaPipe's own `.d.ts` files) for a fraction of the migration cost. |
| `vite-plugin-pwa` `generateSW` strategy + a **hand-rolled `fetch()` + `ReadableStream` reader + Cache API** flow (in page-context JS, not inside the service worker) for the LLM chat model downloads | `injectManifest` strategy with custom Workbox routes for model downloads | Only if you need the model download/cache logic to keep running when the tab isn't focused, or want it centralized inside the service worker for reuse across pages. For a single chat page with a visible progress bar tied to user-initiated download clicks, page-context `fetch()` + `Cache.put()` is simpler, gives you real byte-level progress events (Workbox `CacheFirst`/`NetworkFirst` runtime caching does not expose download progress), and matches the pattern already proven in this project's earlier LiteRT-LM prototype. |
| Native `MediaRecorder` + `canvas.captureStream()` for all 3 recording demos | RecordRTC (or similar wrapper libraries) | Only if you need to support older/non-Chromium browsers with inconsistent native `MediaRecorder` codec support, or need advanced features like automatic transcoding to non-webm containers. Since every demo here already depends on WebGPU/modern WASM SIMD support (Chromium-family browsers being the realistic target), native `MediaRecorder` is sufficient and avoids ~150KB+ of extra dependency surface for functionality the browser already provides natively. |
| `fix-webm-duration` | `webm-duration-fix` (a separate, newer fork built on `ts-ebml`) | If a single recording could exceed 2GB (unlikely for these demo lengths) — the `ts-ebml`-based fork explicitly advertises support for files larger than 2GB and lower memory usage during the fix; `fix-webm-duration` is simpler/older but sufficient for typical short demo-length clips. |
## What NOT to Use
| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Tailwind CSS v3 + separate `postcss.config.js` with `tailwindcss` + `autoprefixer` packages | This is the pre-2026 pattern. v4 replaced the standalone PostCSS plugin architecture; installing `tailwindcss@3` today means missing the ~5x build speed improvement and the new CSS-first `@theme` configuration model, and eventually needing a migration anyway. | Tailwind v4 via `@tailwindcss/vite` or `@tailwindcss/postcss` (see above) |
| Any SPA router (even a "tiny" one) to unify the 5 demo pages under one `index.html` | Directly contradicts the already-decided multi-page architecture. Loading all 5 pages' JS/WASM into one document risks 5 concurrent MediaPipe wasm runtimes + a giant LLM model competing for memory/GPU, which is the exact problem the multi-page decision exists to avoid. | Vite's native multi-page build (`rollupOptions.input` with one entry per HTML file) |
| `vite-plugin-static-copy` for copying the MediaPipe wasm assets | Not wrong, but demonstrably more indirection than needed — Google's own samples repo tried this and removed it in favor of a ~20-line plain Node script run via `predev`/`prebuild` npm hooks. | A small custom `copy-wasm.js` script (see Development Tools table) |
| Routing the multi-hundred-MB-to-multi-GB LLM `.task` model downloads through `vite-plugin-pwa`'s Workbox `runtimeCaching` | Workbox's `CacheFirst`/`NetworkFirst`/`StaleWhileRevalidate` handlers do not expose per-chunk download progress callbacks, and very large `NetworkFirst`/`CacheFirst` responses can hit Workbox's default cacheable-response size assumptions awkwardly. You will not be able to build the "loading progress" UI requirement this way. | Manual `fetch()` with a `ReadableStream` reader (tracking `Content-Length` vs. bytes read) + `caches.open(name).then(c => c.put(request, response))`, run directly in page JS — same pattern already proven in this project's LiteRT-LM prototype |
| Deploying to GitHub Pages and assuming COOP/COEP headers "just work" | GitHub Pages does not support custom HTTP response headers at all. Without COOP/COEP (`Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp`), the page is not cross-origin-isolated, `SharedArrayBuffer` is unavailable, and MediaPipe's wasm runtime silently falls back to a slower non-threaded build. | Either deploy to Netlify/Vercel/Cloudflare Pages (all support a headers config file — `netlify.toml`, `vercel.json`, or a `_headers` file respectively) and set the two headers there, or add `coi-serviceworker` as a client-side polyfill if GitHub Pages is a hard requirement |
| RecordRTC as a default choice "just in case" | Adds a fairly large, loosely-typed dependency for functionality (`MediaRecorder` + `canvas.captureStream`) that's already native and sufficient for a Chromium-targeted WebGPU demo site | Native `MediaRecorder` + `canvas.captureStream()` (see Alternatives above) |
## Stack Patterns by Variant
- Add `coi-serviceworker` (registered at the very top of each HTML entry's `<head>`, before any MediaPipe import)
- Because GitHub Pages cannot set COOP/COEP response headers natively, and without them `crossOriginIsolated` is `false`, disabling `SharedArrayBuffer` and forcing MediaPipe's wasm onto its slower non-threaded fallback path
- Set `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` via that platform's native headers file/config
- Because this is cleaner (no extra JS dependency, no service-worker-registration race condition on first load) and these platforms all support arbitrary response headers on static output
- Use `@tailwindcss/postcss` in a shared `postcss.config.js` instead of `@tailwindcss/vite`
- Because Vite auto-detects and runs `postcss.config.js` against all CSS regardless of which HTML entry imports it, giving one consistent pipeline across all 6 pages (hub + 5 demos) without per-page plugin wiring in `vite.config.js`
## Version Compatibility
| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| vite@^8.1.5 | @tailwindcss/vite@^4.3.3 | Confirmed together in current Tailwind v4 + Vite official guidance; no known incompatibilities. |
| vite@^8.1.5 | vite-plugin-pwa@^1.3.0 | vite-plugin-pwa 1.x is the actively maintained major version tracking current Vite majors; verify against the plugin's own peerDependencies range at install time since PWA plugin majors have historically been tied fairly tightly to Vite majors. |
| @mediapipe/tasks-vision@^0.10.35 | @mediapipe/tasks-genai@^0.10.29 | Independently versioned within the same MediaPipe monorepo — do not assume they bump together; pin both explicitly and re-check both when upgrading either. |
| @mediapipe/tasks-vision / @mediapipe/tasks-genai (wasm workers) | `vite.config.js` → `worker: { format: 'es' }` | MediaPipe's wasm loader spins up a Web Worker; Vite's default worker output format (`iife` in some configurations) can conflict with how the MediaPipe worker bundle expects to be loaded. Google's own samples repo explicitly sets `worker: { format: 'es' }`. Also add `optimizeDeps: { exclude: ['@mediapipe/tasks-vision', '@mediapipe/tasks-genai'] }` — otherwise Vite's dev-time esbuild pre-bundling step can rewrite the wasm/worker file paths and break loading in `npm run dev` (this exact failure mode is why the official repo carries that config). |
| Tailwind v4 | PostCSS `autoprefixer` | Not needed — Tailwind v4's Lightning-CSS-based engine handles vendor prefixing internally. Including `autoprefixer` alongside v4 is harmless but redundant. |
## Sources
- npm registry (`npm view <pkg> version`, live check, 2026-07-27) — vite 8.1.5, @mediapipe/tasks-vision 0.10.35, @mediapipe/tasks-genai 0.10.29, tone 15.1.22, tailwindcss 4.3.3, @tailwindcss/vite 4.3.3, @tailwindcss/postcss 4.3.3, vite-plugin-pwa 1.3.0, fix-webm-duration 1.0.6, webm-duration-fix 1.0.4, coi-serviceworker 0.1.7, typescript 7.0.2 — HIGH confidence (live registry query)
- `github.com/google-ai-edge/mediapipe-samples-web` — `package.json`, `vite.config.ts`, `copy-wasm.js` read directly (repo actively updated, last commit within the prior week of research date) — HIGH confidence, this is Google's own current official reference implementation for exactly this bundler/library combination
- `github.com/google-ai-edge/mediapipe/issues/5961` — "Provide a stable method of bundling the WASM vision binary" (Google engineer discussion, confirms no official stable bundling API exists yet, self-hosting via copy is the accepted workaround) — HIGH confidence
- `vite.dev/guide/build` (official Vite docs) — Multi-Page App entry-point configuration — HIGH confidence
- `web.dev/articles/cross-origin-isolation-guide`, `web.dev/articles/coop-coep`, `blog.tomayac.com` (Google web.dev team member) — COOP/COEP requirements and GitHub Pages limitations — HIGH confidence
- `npmjs.com/package/fix-webm-duration`, Chromium/Bugzilla bug threads on webm duration metadata — MEDIUM-HIGH confidence (well-documented long-standing browser behavior, not speculative)
- Tailwind CSS v4 migration articles (digitalapplied.com, eastondev.com, dev.to) cross-referenced against each other and against npm's live version — MEDIUM confidence (community/blog sources, but converge consistently and align with the officially-shipped package versions)
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
