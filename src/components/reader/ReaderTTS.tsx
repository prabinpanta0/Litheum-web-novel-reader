import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Play, Pause, Square, ChevronUp, ChevronDown } from 'lucide-react';
import { chunkText, speechSupported, type Paragraph } from './tts';
import { aiSynthesize, setAiProgress, AI_VOICES } from '@/tts/ai-tts';
import type { ReaderSettings as Settings } from '@/store/db';

export interface ReaderTTSProps {
  paragraphs: Paragraph[];
  /** Called with the index of the paragraph currently being spoken. */
  onActive?: (index: number | null) => void;
  /** Compact control-bar styling vs. a floating bubble. */
  variant?: 'bar' | 'bubble';
  /**
   * Persisted read-aloud preferences. Rate and pitch apply to every
   * utterance; voiceURI selects an exact system voice when set, and
   * ttsAiVoice selects the on-device voice.
   */
  settings?: Pick<
    Settings,
    'ttsRate' | 'ttsPitch' | 'ttsVoiceURI' | 'ttsEngine' | 'ttsAiVoice'
  >;
  /** Persist a read-aloud preference (rate / pitch / voice / engine). */
  onSettings?: (
    patch: Partial<
      Pick<
        Settings,
        'ttsRate' | 'ttsPitch' | 'ttsVoiceURI' | 'ttsEngine' | 'ttsAiVoice'
      >
    >
  ) => void;
}

type Phase = 'idle' | 'playing' | 'paused';

/**
 * Read-aloud control with two engines:
 *
 * 1. `web` — the browser Web Speech API. Instant, zero download, whatever
 *    voices the OS/browser provide (fails on machines with no voices).
 * 2. `ai` — Supertonic-TTS synthesized on-device via transformers.js.
 *    Downloaded once (~265MB) behind a Settings option, then fully local and
 *    independent of installed system voices.
 *
 * Either engine drives the same chrome: play / pause / stop, a rate control
 * and live status.
 */
export function ReaderTTS({
  paragraphs,
  onActive,
  variant = 'bar',
  settings,
  onSettings,
}: ReaderTTSProps) {
  const supported = useMemo(speechSupported, []);

  if (!supported && settings?.ttsEngine !== 'ai') {
    return (
      <div className="reader-tts reader-tts-unsupported">
        <span>Read aloud is not supported in this browser.</span>
      </div>
    );
  }

  const common = {
    paragraphs,
    onActive,
    variant,
    rate: settings?.ttsRate ?? 1,
    voice: settings?.ttsAiVoice ?? 'F1',
    onRate: (v: number) => onSettings?.({ ttsRate: v }),
    onVoice: (v: string) => onSettings?.({ ttsAiVoice: v }),
  };

  if (settings?.ttsEngine === 'ai') {
    return <AiEngine {...common} />;
  }
  return <WebEngine {...common} settings={settings} onSettings={onSettings} />;
}

interface EngineProps {
  paragraphs: Paragraph[];
  onActive?: (index: number | null) => void;
  variant: 'bar' | 'bubble';
  rate: number;
  voice: string;
  onRate(v: number): void;
  onVoice(v: string): void;
}

interface WebEngineProps extends EngineProps {
  settings?: Pick<
    Settings,
    'ttsRate' | 'ttsPitch' | 'ttsVoiceURI' | 'ttsEngine' | 'ttsAiVoice'
  >;
  onSettings?: ReaderTTSProps['onSettings'];
}

function WebEngine({
  paragraphs,
  onActive,
  variant,
  rate,
  onSettings,
  settings,
}: WebEngineProps) {
  const supported = useMemo(speechSupported, []);
  const [phase, setPhase] = useState<Phase>('idle');
  const [localRate, setLocalRate] = useState(1);
  const [localPitch, setLocalPitch] = useState(1);
  const [localVoice, setLocalVoice] = useState<string | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  // Re-render when the browser finishes discovering voices.
  const [, refreshVoices] = useReducer((x: number) => x + 1, 0);

  const pitch = settings?.ttsPitch ?? localPitch;
  const voiceURI = settings?.ttsVoiceURI ?? localVoice ?? '';

  const paragraphsRef = useRef(paragraphs);
  paragraphsRef.current = paragraphs;
  const onActiveRef = useRef(onActive);
  onActiveRef.current = onActive;
  const rateRef = useRef(rate);
  rateRef.current = rate;
  const pitchRef = useRef(pitch);
  pitchRef.current = pitch;
  const voiceRef = useRef(voiceURI);
  voiceRef.current = voiceURI;
  // Bumped on every stop so late utterance callbacks can't restart a dead queue.
  const playToken = useRef(0);

  const effectiveRate = settings?.ttsRate !== undefined ? rate : localRate;
  const persistRate = (next: number) => {
    const v = Math.min(2, Math.max(0.5, next));
    if (onSettings) onSettings({ ttsRate: v });
    else setLocalRate(v);
  };
  const persistPitch = (next: number) => {
    const v = Math.min(2, Math.max(0.5, next));
    if (onSettings) onSettings({ ttsPitch: v });
    else setLocalPitch(v);
  };
  const persistVoice = (uri: string) => {
    if (onSettings) onSettings({ ttsVoiceURI: uri || undefined });
    else setLocalVoice(uri || null);
  };

  const stopClean = () => {
    playToken.current++;
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* older engines throw on cancel in odd states */
    }
    setPhase('idle');
    setActive(null);
    setWarning(null);
    onActiveRef.current?.(null);
  };

  // Load the (async) voice list; also keep it fresh if it changes.
  useEffect(() => {
    const synth = window.speechSynthesis;
    if (!synth) return;
    synth.getVoices?.();
    synth.addEventListener?.('voiceschanged', refreshVoices);
    return () => synth.removeEventListener?.('voiceschanged', refreshVoices);
  }, []);

  // Cancel whatever is playing if the component unmounts.
  useEffect(() => stopClean, []);

  const pickVoice = (): SpeechSynthesisVoice | undefined => {
    const synth = window.speechSynthesis;
    const voices = synth.getVoices?.() ?? [];
    if (voices.length === 0) return undefined;
    if (voiceRef.current) {
      const chosen = voices.find((v) => v.voiceURI === voiceRef.current);
      if (chosen) return chosen;
    }
    const base = (navigator.language || 'en').split('-')[0].toLowerCase();
    return (
      voices.find((v) => (v.lang ?? '').toLowerCase().startsWith(base)) ??
      voices.find((v) => (v.lang ?? '').toLowerCase().startsWith('en')) ??
      voices[0]
    );
  };

  const speak = () => {
    if (!supported || phase === 'playing') return;
    const synth = window.speechSynthesis;
    const items = paragraphsRef.current;
    if (!synth || typeof SpeechSynthesisUtterance === 'undefined') {
      setWarning('Read aloud is not available in this browser.');
      return;
    }
    // Split long paragraphs into short, speech-safe utterances.
    const queue: { paragraph: number; text: string }[] = [];
    items.forEach((p, i) => {
      if (p.text)
        for (const s of chunkText(p.text))
          queue.push({ paragraph: i, text: s });
    });
    if (queue.length === 0) return;

    const token = ++playToken.current;
    setWarning(null);
    setPhase('playing');
    let cursor = 0;
    let started = false;

    const startTimer = window.setTimeout(() => {
      if (!started && playToken.current === token) {
        synth.cancel();
        setPhase('idle');
        setActive(null);
        onActiveRef.current?.(null);
        setWarning(
          "No speech output was detected — your system may not have a text-to-speech voice installed. Check your OS voice settings (e.g. an 'echo' voice), or enable the on-device AI voice in Settings."
        );
      }
    }, 3000);

    const fire = () => {
      if (playToken.current !== token) return;
      if (cursor >= queue.length) {
        window.clearTimeout(startTimer);
        setPhase('idle');
        setActive(null);
        onActiveRef.current?.(null);
        return;
      }
      const { paragraph, text } = queue[cursor++];
      setActive(paragraph);
      onActiveRef.current?.(paragraph);
      const u = new SpeechSynthesisUtterance(text);
      u.rate = rateRef.current;
      u.pitch = pitchRef.current;
      u.voice = pickVoice() ?? null;
      u.onstart = () => {
        started = true;
        window.clearTimeout(startTimer);
      };
      u.onend = () => {
        if (playToken.current === token) fire();
      };
      u.onerror = (e) => {
        if (playToken.current !== token) return;
        window.clearTimeout(startTimer);
        setPhase('idle');
        setActive(null);
        onActiveRef.current?.(null);
        const name = (e as SpeechSynthesisErrorEvent).error;
        if (name === 'interrupted' || name === 'canceled') {
          setWarning('Read aloud was interrupted — press play to continue.');
        } else {
          const reasons: Record<string, string> = {
            'not-allowed': 'Speech output is blocked in this browser.',
            network: 'The speech service is unavailable right now.',
            'synthesis-failed': 'The speech engine failed this time.',
            'audio-busy': 'Another app is speaking — stop it and try again.',
          };
          setWarning(reasons[name] ?? 'Read aloud could not continue.');
        }
      };
      try {
        synth.speak(u);
        // Chrome sometimes ignores the first utterance without a resume() poke.
        synth.resume?.();
      } catch {
        setPhase('idle');
        setActive(null);
        setWarning('Read aloud could not start.');
      }
    };
    fire();
  };

  const voices =
    typeof window !== 'undefined' && window.speechSynthesis
      ? (window.speechSynthesis.getVoices?.() ?? [])
      : [];

  return (
    <TtsChrome
      variant={variant}
      phase={phase}
      onToggle={() => {
        if (phase === 'playing') {
          window.speechSynthesis.pause();
          setPhase('paused');
        } else if (phase === 'paused') {
          window.speechSynthesis.resume();
          setPhase('playing');
        } else {
          speak();
        }
      }}
      onStop={stopClean}
      rate={effectiveRate}
      onRate={persistRate}
      active={active}
      warning={warning}
      extra={
        <>
          <span className="tts-pitch">
            <button
              onClick={() => persistPitch(pitch - 0.2)}
              aria-label="Lower pitch"
              className="tts-rate-btn"
            >
              <ChevronDown size={14} />
            </button>
            <span className="tts-rate-val">pitch {pitch.toFixed(1)}</span>
            <button
              onClick={() => persistPitch(pitch + 0.2)}
              aria-label="Higher pitch"
              className="tts-rate-btn"
            >
              <ChevronUp size={14} />
            </button>
          </span>
          {voices.length > 0 && (
            <select
              className="tts-voice"
              aria-label="Voice"
              value={voiceURI}
              onChange={(e) => persistVoice(e.target.value)}
            >
              <option value="">Auto ({pickVoice()?.name ?? 'system'})</option>
              {voices.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name} · {v.lang}
                </option>
              ))}
            </select>
          )}
        </>
      }
    />
  );
}

function AiEngine({
  paragraphs,
  onActive,
  variant,
  rate,
  voice,
  onRate,
  onVoice,
}: EngineProps) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [active, setActive] = useState<number | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [loading, setLoading] = useState<{
    step: string;
    percent: number;
  } | null>(null);

  const paragraphsRef = useRef(paragraphs);
  paragraphsRef.current = paragraphs;
  const onActiveRef = useRef(onActive);
  onActiveRef.current = onActive;
  const rateRef = useRef(rate);
  rateRef.current = rate;
  const voiceRef = useRef(voice);
  voiceRef.current = voice;
  const token = useRef(0);
  const ctxRef = useRef<AudioContext | null>(null);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());

  const stop = () => {
    token.current++;
    for (const src of sourcesRef.current) {
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
    }
    sourcesRef.current.clear();
    if (ctxRef.current && ctxRef.current.state !== 'closed') {
      void ctxRef.current.close().catch(() => undefined);
    }
    ctxRef.current = null;
    setPhase('idle');
    setActive(null);
    setWarning(null);
    setLoading(null);
    onActiveRef.current?.(null);
  };

  // Reflect engine progress into the bubble, and clean up on unmount.
  useEffect(() => {
    setAiProgress((p) => setLoading(p));
    return () => {
      setAiProgress(null);
      token.current++;
    };
  }, []);

  const pause = () => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    void ctx.suspend().then(() => setPhase('paused'));
  };
  const resume = () => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    void ctx.resume().then(() => setPhase('playing'));
  };

  const speak = async () => {
    if (phase === 'playing' || phase === 'paused') return;
    token.current++;
    const myToken = token.current;
    // Create/resume the audio context inside the click gesture.
    if (!ctxRef.current) ctxRef.current = new AudioContext();
    const ctx = ctxRef.current;
    if (ctx.state === 'suspended') await ctx.resume().catch(() => undefined);
    setPhase('playing');
    setWarning(null);
    setLoading(null);

    const q: { paragraph: number; text: string }[] = [];
    paragraphsRef.current.forEach((p, i) => {
      if (p.text)
        for (const s of chunkText(p.text)) q.push({ paragraph: i, text: s });
    });
    if (q.length === 0) {
      setPhase('idle');
      return;
    }

    // Synthesis is the slow part (diffusion), so while one chunk plays we
    // prefetch its successor — the gap between paragraphs is then just the
    // buffer hand-off, not a fresh model run. Highlighting follows real
    // playback (each buffer's onended), keeping the read text in sync.
    const makeBuffer = async (item: { text: string }) => {
      const { audio, samplingRate } = await aiSynthesize(item.text, {
        voice: voiceRef.current,
        speed: rateRef.current,
        steps: 5,
      });
      const buffer = ctx.createBuffer(1, audio.length, samplingRate);
      const ch = new Float32Array(audio.length);
      ch.set(audio);
      buffer.copyToChannel(ch, 0);
      return buffer;
    };

    try {
      // Build the first buffer synchronously so playback starts immediately.
      let current: AudioBuffer | null = await makeBuffer(q[0]);
      // Prefetch the next chunk in the background while the current one plays.
      let nextBuf: AudioBuffer | null =
        q.length > 1 ? await makeBuffer(q[1]).catch(() => null) : null;

      for (let i = 0; i < q.length; i++) {
        if (token.current !== myToken) return;
        // If the active chunk couldn't be synthesized, abort.
        if (!current) throw new Error('AI voice failed to generate audio.');
        setActive(q[i].paragraph);
        onActiveRef.current?.(q[i].paragraph);
        const src = ctx.createBufferSource();
        src.buffer = current;
        // Pace already applied via the model's `speed` option at synthesis.
        src.playbackRate.value = 1;
        sourcesRef.current.add(src);
        // Start prefetching the chunk after next while current plays.
        const prefetch: Promise<AudioBuffer | null> =
          i + 2 < q.length
            ? makeBuffer(q[i + 2]).catch(() => null)
            : (Promise.resolve(null) as Promise<AudioBuffer | null>);
        await new Promise<void>((resolve) => {
          src.onended = () => {
            sourcesRef.current.delete(src);
            resolve();
          };
          src.connect(ctx.destination);
          src.start();
        });
        if (token.current !== myToken) return;
        // Advance: the previously prefetched buffer becomes current.
        current = nextBuf;
        nextBuf = await prefetch;
      }
    } catch (err) {
      if (token.current !== myToken) return;
      setWarning(
        err instanceof Error && err.message
          ? `AI voice: ${err.message}`
          : 'AI voice could not generate audio.'
      );
      setLoading(null);
    } finally {
      if (token.current === myToken) {
        setPhase('idle');
        setActive(null);
        onActiveRef.current?.(null);
      }
    }
  };

  const loadingNow = loading && loading.percent < 100 ? loading : null;

  return (
    <TtsChrome
      variant={variant}
      phase={phase}
      onToggle={() => {
        if (phase === 'playing') pause();
        else if (phase === 'paused') void resume();
        else void speak();
      }}
      onStop={stop}
      rate={rate}
      onRate={onRate}
      active={active}
      warning={warning}
      extra={
        <>
          {loadingNow && (
            <span className="tts-warning tts-loading">
              Supertonic {loadingNow.step} · {loadingNow.percent}%
            </span>
          )}
          {!loadingNow && (
            <select
              className="tts-voice"
              aria-label="AI voice"
              value={voice}
              onChange={(e) => onVoice(e.target.value)}
            >
              {AI_VOICES.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.label}
                </option>
              ))}
            </select>
          )}
        </>
      }
    />
  );
}

interface ChromeProps {
  variant: 'bar' | 'bubble';
  phase: Phase;
  onToggle(): void;
  onStop(): void;
  rate: number;
  onRate(v: number): void;
  active: number | null;
  warning: string | null;
  extra?: React.ReactNode;
}

function TtsChrome({
  variant,
  phase,
  onToggle,
  onStop,
  rate,
  onRate,
  active,
  warning,
  extra,
}: ChromeProps) {
  return (
    <div className={`reader-tts reader-tts-${variant}`} aria-label="Read aloud">
      <button
        className="tts-btn"
        onClick={onToggle}
        aria-label={playLabel(phase)}
      >
        {phase === 'idle' ? (
          <Play size={18} />
        ) : phase === 'playing' ? (
          <Pause size={18} />
        ) : (
          <Play size={18} />
        )}
      </button>
      <button className="tts-btn" onClick={onStop} aria-label="Stop">
        <Square size={16} />
      </button>
      <span className="tts-rate">
        <button
          onClick={() => onRate(rate - 0.25)}
          aria-label="Slower"
          className="tts-rate-btn"
        >
          <ChevronDown size={14} />
        </button>
        <span className="tts-rate-val">
          {rate.toFixed(2).replace(/\.?0+$/, '')}×
        </span>
        <button
          onClick={() => onRate(rate + 0.25)}
          aria-label="Faster"
          className="tts-rate-btn"
        >
          <ChevronUp size={14} />
        </button>
      </span>
      {extra}
      {active !== null && (
        <span className="tts-status">Paragraph {active + 1}</span>
      )}
      {warning && <span className="tts-warning">{warning}</span>}
    </div>
  );
}

function playLabel(phase: Phase): string {
  if (phase === 'playing') return 'Pause';
  if (phase === 'paused') return 'Resume';
  return 'Play';
}
