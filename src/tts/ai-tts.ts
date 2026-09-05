/**
 * On-device AI voice engine: Supertonic-TTS via transformers.js / ONNX Runtime.
 *
 * This is the "plugin" the Settings page can turn on. The model (~265MB, plus
 * a small per-voice embedding ~50KB) is downloaded once — progress is
 * surfaced through `setAiProgress` — then cached by transformers.js in the
 * browser's origin storage, so read-aloud works fully offline afterwards.
 *
 * The heavy import is dynamic (code-split) so the main app bundle never pays
 * for the runtime until someone actually enables the AI voice.
 */

export interface AiProgress {
  /** Short human step label (e.g. "downloading model.onnx" / "ready"). */
  step: string;
  /** 0–100 download/load progress. */
  percent: number;
}

export type AiStatus =
  | { state: 'idle' }
  | { state: 'installing'; progress: AiProgress }
  | { state: 'ready' }
  | { state: 'error'; message: string };

export interface AiSample {
  audio: Float32Array;
  /** Native sample rate of the generated audio (Supertonic: 44100). */
  samplingRate: number;
}

/** The spoken voices Supertonic ships with (50KB embeddings each). */
export const AI_VOICES = [
  { id: 'F1', label: 'Female · voice 1' },
  { id: 'F2', label: 'Female · voice 2' },
  { id: 'F3', label: 'Female · voice 3' },
  { id: 'F4', label: 'Female · voice 4' },
  { id: 'F5', label: 'Female · voice 5' },
  { id: 'M1', label: 'Male · voice 1' },
  { id: 'M2', label: 'Male · voice 2' },
  { id: 'M3', label: 'Male · voice 3' },
  { id: 'M4', label: 'Male · voice 4' },
  { id: 'M5', label: 'Male · voice 5' },
] as const;

export type AiVoiceId = (typeof AI_VOICES)[number]['id'];

export const AI_SAMPLE_RATE = 44100;

const MODEL_ID = 'onnx-community/Supertonic-TTS-ONNX';
const VOICE_URL = (voice: string) =>
  `https://huggingface.co/${MODEL_ID}/resolve/main/voices/${voice}.bin`;

let progressFn: ((p: AiProgress) => void) | null = null;

/** Hook the engine's progress so UI can mirror it live (one listener). */
export function setAiProgress(fn: ((p: AiProgress) => void) | null) {
  progressFn = fn;
}

type SynthesizeFn = (
  text: string,
  opts: {
    speaker_embeddings: string;
    speed: number;
    num_inference_steps: number;
  }
) => Promise<{ audio: Float32Array; sampling_rate: number }>;

let synthesizerPromise: Promise<SynthesizeFn> | null = null;

async function getSynthesizer(): Promise<SynthesizeFn> {
  if (synthesizerPromise) return synthesizerPromise;
  synthesizerPromise = (async () => {
    try {
      progressFn?.({ step: 'loading engine', percent: 1 });
      const transformers = await import('@huggingface/transformers');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const synth: unknown = await (transformers as any).pipeline(
        'text-to-speech',
        MODEL_ID,
        {
          quantized: false,
          progress_callback: (e: {
            status?: string;
            progress?: number;
            file?: string;
          }) => {
            if (e.status === 'progress' && typeof e.progress === 'number') {
              progressFn?.({
                step: `downloading ${e.file ?? 'model'}`,
                percent: Math.round(e.progress),
              });
            } else if (e.status === 'ready' || e.status === 'done') {
              progressFn?.({ step: 'ready', percent: 100 });
            }
          },
        }
      );
      return synth as SynthesizeFn;
    } catch (err) {
      // Allow a fresh try next round instead of caching a broken pipeline.
      synthesizerPromise = null;
      throw err;
    }
  })();
  return synthesizerPromise;
}

/**
 * Synthesize speech for `text` with the chosen Supertonic voice, returning raw
 * PCM samples at `AI_SAMPLE_RATE` Hz. `speed` 0.8–1.2 maps to pacing (1 is
 * normal); `steps` controls the diffusion quality (fewer = faster, 5 is a good
 * default). Throws with a human-readable message if the engine can't load.
 */
export async function aiSynthesize(
  text: string,
  options?: { voice?: string; speed?: number; steps?: number }
): Promise<AiSample> {
  const voice = options?.voice ?? 'F1';
  const speed = options?.speed ?? 1;
  const steps = options?.steps ?? 5;
  progressFn?.({ step: 'synthesizing', percent: 100 });
  const synth = await getSynthesizer();
  const out = await synth(text, {
    speaker_embeddings: VOICE_URL(voice),
    speed,
    num_inference_steps: steps,
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw: any = Array.isArray(out) ? out[0] : out;
  // `raw` is a RawAudio — expose `.data` (accumulated Float32Array) and its
  // sample rate; fall back to the tensor-shaped fields if present.
  const audio = Array.isArray(raw.audio)
    ? mergeChannels(raw.audio)
    : (raw.audio ?? raw.data ?? raw);
  return {
    audio: audio as Float32Array,
    samplingRate: raw.sampling_rate ?? AI_SAMPLE_RATE,
  };
}

function mergeChannels(channels: Float32Array[]): Float32Array {
  // Supertonic is mono; if a multi-channel form ever appears, concatenate.
  const total = channels.reduce((n, c) => n + c.length, 0);
  const merged = new Float32Array(total);
  let offset = 0;
  for (const c of channels) {
    merged.set(c, offset);
    offset += c.length;
  }
  return merged;
}
