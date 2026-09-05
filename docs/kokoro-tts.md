# Kokoro on-device read-aloud (TTS engine plugin)

> Status: implemented (engine + Settings install flow + reader playback).
> Written so the work can be resumed or debugged later even if left alone
> for a while.

## Why

The browser's Web Speech API is unreliable (no voices on some systems, blocked
on some browsers). To fix read-aloud without depending on OS/browser voices, we
added an optional AI voice powered by **Kokoro-82M**, running entirely
on-device via Transformers.js / ONNX Runtime WebAssembly.

The user approved the one-time download explicitly and asked for visible
progress ("do show the working"), so the model is *not* bundled in the repo —
it is downloaded on demand from Hugging Face and cached, then everything runs
offline.

## Packages / versions

- `@huggingface/transformers@^4.2.0` (dev + runtime; code-split, so it only
  loads when the AI voice is actually used).
- Model: `onnx-community/Kokoro-82M-v1.0-ONNX`, loaded quantized
  (`quantized: true`, ~85 MB) to keep the download small.
- ORT WASM is fetched from the Transformers.js CDN at runtime on first engine
  load; the weights themselves are cached by Transformers.js in the browser's
  origin storage (OPFS / Cache API), so after the first download the model
  loads offline.

## Files

- `src/tts/kokoro.ts` — engine module.
  - `kokoroSynthesize(text)` → `{ audio: Float32Array, samplingRate }`
    (synthesizes raw PCM; caller plays it).
  - `setKokoroProgress(fn)` — the Settings UI subscribes here to show live
    download/load progress (single-listener global; last subscriber wins).
  - Pipeline is memoized; on failure the promise is cleared so the next call
    retries instead of caching a broken pipeline.
  - Keep the `import('@huggingface/transformers')` dynamic — it must stay
    dynamic so the main bundle doesn't balloon.
- `src/components/reader/ReaderTTS.tsx` — two engines behind one control:
  - `WebEngine` — existing Web Speech path (rate/pitch/voice picker).
  - `AiEngine` — Kokoro path: pipeline-load → per-sentence synthesis → plays
    each `Float32Array` on an `AudioContext` buffer source, chained with
    `onended`; pause = `ctx.suspend()`, resume = `ctx.resume()`, stop = stop
    all sources + close ctx + bump a token so in-flight synthesis is dropped.
    Picks engine from `settings.ttsEngine`.
- `src/components/reader/ReaderSettings.tsx` — "Read-aloud voice" segmented
  control (`System voices` / `Kokoro AI`) + `KokoroInstall` component that
  renders the download-progress bar tied to `setKokoroProgress`.
- `src/store/db.ts` — `ReaderSettings.ttsEngine: 'web' | 'ai'`
  (default `'web'`).

## Flow (first use)

1. Settings → Read-aloud voice → `Kokoro AI`.
2. "Download voice model" → `KokoroInstall` calls `kokoroSynthesize(sample)`
   with a progress listener attached → progress bar + step text live-update as
   Transformers.js reports `progress_callback` events per file.
3. Done → "Voice model ready"; the reader's headphones button now routes
   playback to `AiEngine`.

## Known limitations / next steps (not yet addressed)

- **No voice picker for Kokoro yet.** Web Speech has a voice `<select>`;
  `AiEngine` currently uses the model's default voice. Kokoro's other voices
  (`af_heart`, `am_bella`, …) are selectable via `speaker_embeddings` /
  per-voice ONNX files — wire that when we want variety.
- **Pitch is not applied to AI audio** (only rate via `playbackRate`); Web
  Speech keeps full pitch support.
- **Bundle size**: keeping the Transformers.js import dynamic is mandatory.
  If the build chunk gets too heavy, look at `vite` `manualChunks` for the
  `@huggingface/transformers` chunk and consider serving it lazily.
- **Progress is per-file** (jumps at each completed file); aggregate weighted
  progress across all files would be smoother, and showing an estimated size
  would be nicer than percentage alone.
- **Offline-after-download guarantee**: Transformers.js v4 caches to browser
  storage; verify OPFS caching actually persists across reloads on the deploy
  target. If not, add `env.useBrowserCache` tune-ups or pre-warm on idle.

## Verification notes

- `npx tsc -b` clean, vitest suite green, `npm run build` clean (watch the
  chunk-size warn), smoke URLs on a throwaway Vite port (~5174) all return 200.
- Real TTS audio was **not** verifiable in this environment (headless). Likely
  to be tested by the user on their dev server (5173) after a restart.