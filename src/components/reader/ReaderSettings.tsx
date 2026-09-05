import { useEffect, useRef, useState } from 'react';
import { useApp } from '@/store/AppProvider';
import type { ReaderSettings as Settings } from '@/store/db';
import { TextIcon } from '../icons';
import { AlignLeft, AlignCenter, AlignRight } from 'lucide-react';
import DiscreteSlider from '../controls/DiscreteSlider';
import {
  aiSynthesize,
  setAiProgress,
  AI_VOICES,
  type AiStatus,
} from '@/tts/ai-tts';

interface ReaderSettingsPanelProps {
  open: boolean;
  onClose(): void;
  onJumpChapter(): void;
}

export const THEME_OPTIONS: {
  key: Settings['theme'];
  label: string;
  swatch: string[];
}[] = [
  { key: 'paper', label: 'Paper', swatch: ['#fdfbf7', '#24211c'] },
  { key: 'sepia', label: 'Sepia', swatch: ['#f4ecd8', '#3a3327'] },
  { key: 'dark', label: 'Dark', swatch: ['#181512', '#d8d2c6'] },
  { key: 'oled', label: 'OLED', swatch: ['#000000', '#cbc6ba'] },
  { key: 'custom', label: 'Custom', swatch: ['#f4ecd8', '#3a3327'] },
];

export const CUSTOM_THEME_DEFAULTS = {
  bg: '#f4ecd8',
  text: '#3a3327',
};

const WIDTH_OPTIONS: { key: Settings['width']; label: string }[] = [
  { key: 'narrow', label: 'Narrow' },
  { key: 'comfortable', label: 'Comfortable' },
  { key: 'wide', label: 'Wide' },
];

const FONT_OPTIONS: { key: Settings['font']; label: string }[] = [
  { key: 'serif', label: 'Serif' },
  { key: 'sans', label: 'Sans' },
  { key: 'book', label: 'Book' },
  { key: 'georgia', label: 'Georgia' },
  { key: 'mono', label: 'Mono' },
];

const ALIGN_OPTIONS: {
  key: Settings['textAlign'];
  label: string;
  icon: typeof AlignLeft;
}[] = [
  { key: 'left', label: 'Left', icon: AlignLeft },
  { key: 'center', label: 'Center', icon: AlignCenter },
  { key: 'right', label: 'Right', icon: AlignRight },
];

export const COLUMN_DEFAULTS: Record<Settings['width'], number> = {
  narrow: 34,
  comfortable: 40,
  wide: 47,
};

export function ReaderSettingsPanel({
  open,
  onClose,
  onJumpChapter,
}: ReaderSettingsPanelProps) {
  const { settings } = useApp();

  if (!settings) return null;

  return (
    <>
      <div
        className={`reader-dim ${open ? 'is-open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={`settings-panel ${open ? 'is-open' : ''}`}
        aria-hidden={!open}
      >
        <div className="settings-head">
          <span className="settings-title">Reading settings</span>
          <button
            className="icon-btn"
            onClick={onClose}
            aria-label="Close settings"
          >
            <span className="x-glyph">×</span>
          </button>
        </div>

        <ReaderSettingsControls showTTS={false} />

        <button
          className="btn btn-ghost jump-chapter-btn"
          onClick={onJumpChapter}
        >
          Jump to chapter
        </button>
      </aside>
    </>
  );
}

/**
 * The shared reader preference controls. Used both by the in-reader overlay
 * and the website Settings page so preferences are editable in one place.
 */
export function ReaderSettingsControls({
  showTTS = true,
}: { showTTS?: boolean } = {}) {
  const { settings, updateSettings } = useApp();

  if (!settings) return null;

  return (
    <div className="settings-grid">
      <SettingRow label="Theme">
        <div className="swatch-row">
          {THEME_OPTIONS.map((t) => {
            const swatch =
              t.key === 'custom'
                ? [
                    settings.customBg ?? CUSTOM_THEME_DEFAULTS.bg,
                    settings.customText ?? CUSTOM_THEME_DEFAULTS.text,
                  ]
                : t.swatch;
            return (
              <button
                key={t.key}
                className={`swatch ${settings.theme === t.key ? 'is-active' : ''}`}
                onClick={() => updateSettings({ theme: t.key })}
                title={t.label}
                aria-label={`${t.label} theme`}
                aria-pressed={settings.theme === t.key}
              >
                <span className="swatch-bg" style={{ background: swatch[0] }}>
                  <span className="swatch-aa" style={{ color: swatch[1] }}>
                    Aa
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </SettingRow>

      {settings.theme === 'custom' ? (
        <>
          <SettingRow label="Background">
            <input
              type="color"
              className="color-input"
              value={settings.customBg ?? CUSTOM_THEME_DEFAULTS.bg}
              onChange={(e) =>
                updateSettings({
                  customBg: e.target.value,
                  theme: 'custom',
                })
              }
              aria-label="Reader background color"
            />
          </SettingRow>

          <SettingRow
            label={`Text · ${settings.customText ?? CUSTOM_THEME_DEFAULTS.text}`}
          >
            <input
              type="color"
              className="color-input"
              value={settings.customText ?? CUSTOM_THEME_DEFAULTS.text}
              onChange={(e) =>
                updateSettings({
                  customText: e.target.value,
                  theme: 'custom',
                })
              }
              aria-label="Reader text color"
            />
          </SettingRow>

          <button
            className="btn btn-quiet reset-palette-btn"
            onClick={() =>
              updateSettings({
                theme: 'sepia',
                customBg: undefined,
                customText: undefined,
              })
            }
          >
            Reset palette
          </button>
        </>
      ) : null}

      <SettingRow label="Font">
        <div className="segmented">
          {FONT_OPTIONS.map((f) => (
            <button
              key={f.key}
              className={`seg-btn ${settings.font === f.key ? 'is-active' : ''}`}
              onClick={() => updateSettings({ font: f.key })}
            >
              <span className={`seg-font seg-font-${f.key}`}>
                <TextIcon size={14} /> {f.label}
              </span>
            </button>
          ))}
        </div>
      </SettingRow>

      <SettingRow label={`Text size · ${settings.fontSize}px`}>
        <DiscreteSlider
          minimum={14}
          maximum={26}
          step={1}
          value={settings.fontSize}
          onChange={(fontSize) => updateSettings({ fontSize })}
          aria-label="Text size"
        />
      </SettingRow>

      <SettingRow label={`Line height · ${settings.lineHeight.toFixed(2)}`}>
        <DiscreteSlider
          minimum={1.4}
          maximum={2.1}
          step={0.05}
          value={settings.lineHeight}
          onChange={(lineHeight) => updateSettings({ lineHeight })}
          aria-label="Line height"
        />
      </SettingRow>

      <SettingRow label="Reading width">
        <div className="segmented">
          {WIDTH_OPTIONS.map((w) => (
            <button
              key={w.key}
              className={`seg-btn ${settings.width === w.key ? 'is-active' : ''}`}
              onClick={() => updateSettings({ width: w.key })}
            >
              {w.label}
            </button>
          ))}
        </div>
      </SettingRow>

      <SettingRow label="Text alignment">
        <div className="segmented">
          {ALIGN_OPTIONS.map((a) => (
            <button
              key={a.key}
              className={`seg-btn ${settings.textAlign === a.key ? 'is-active' : ''}`}
              onClick={() => updateSettings({ textAlign: a.key })}
              aria-label={`Align ${a.label}`}
              aria-pressed={settings.textAlign === a.key}
            >
              <a.icon size={15} />
              <span className="seg-align-label">{a.label}</span>
            </button>
          ))}
        </div>
      </SettingRow>

      <SettingRow label="Copy text">
        <button
          className="switch"
          role="switch"
          aria-checked={settings.copyText}
          aria-label="Allow copying text in the reader"
          onClick={() => updateSettings({ copyText: !settings.copyText })}
        />
      </SettingRow>

      <SettingRow label="Bionic reading">
        <button
          className="switch"
          role="switch"
          aria-checked={settings.bionicReading}
          aria-label="Bold the leading letters of each word"
          onClick={() =>
            updateSettings({ bionicReading: !settings.bionicReading })
          }
        />
      </SettingRow>

      {showTTS && (
        <>
          <SettingRow label="Read-aloud voice">
            <div className="segmented">
              <button
                className={`seg-btn ${settings.ttsEngine !== 'ai' ? 'is-active' : ''}`}
                onClick={() => updateSettings({ ttsEngine: 'web' })}
              >
                System voices
              </button>
              <button
                className={`seg-btn ${settings.ttsEngine === 'ai' ? 'is-active' : ''}`}
                onClick={() => updateSettings({ ttsEngine: 'ai' })}
              >
                On-device AI
              </button>
            </div>
            <div className="setting-hint">
              The on-device AI voice runs a local model — no reliance on the
              browser's built-in speech, and works fully offline after one
              download.
            </div>
          </SettingRow>

          {settings.ttsEngine === 'ai' ? (
            <AiInstall voice={settings.ttsAiVoice} />
          ) : null}
        </>
      )}
    </div>
  );
}

const AI_SAMPLE = `The rain in Spain falls mainly on the plain. Read aloud is now powered by an on-device model running entirely on this device.`;

function SettingRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="setting-row">
      <span className="setting-label">{label}</span>
      {children}
    </div>
  );
}

/**
 * Downloads (once), loads, and warms the on-device voice pipeline. Progress is
 * surfaced live through the shared engine progress channel while the Settings
 * page (or the reader drawer) is open.
 */
function AiInstall({ voice }: { voice: string }) {
  const { updateSettings } = useApp();
  const [status, setStatus] = useState<AiStatus>({ state: 'idle' });
  const busy = useRef(false);

  useEffect(() => {
    setAiProgress((p) => setStatus({ state: 'installing', progress: p }));
    return () => {
      setAiProgress(null);
      busy.current = false;
    };
  }, []);

  const install = async () => {
    if (busy.current) return;
    busy.current = true;
    setStatus({
      state: 'installing',
      progress: { step: 'starting', percent: 0 },
    });
    try {
      await aiSynthesize(AI_SAMPLE, { voice, speed: 1, steps: 5 });
      setStatus({ state: 'ready' });
    } catch (err) {
      const message =
        err instanceof Error && err.message
          ? err.message
          : 'Could not download the voice model. Check your connection and try again.';
      setStatus({ state: 'error', message });
    } finally {
      busy.current = false;
    }
  };

  const progress = status.state === 'installing' ? status.progress : undefined;

  return (
    <div className="tts-install">
      {status.state === 'idle' && (
        <>
          <p className="tts-install-note">
            Download the audio model once (~265&nbsp;MB). After that, read-aloud
            runs fully offline and independent of your system voices.
          </p>
          <div className="tts-install-actions">
            <button
              className="btn btn-ghost"
              onClick={() => void install()}
              disabled={busy.current}
            >
              Download AI voice model
            </button>
          </div>
        </>
      )}

      {status.state === 'installing' && (
        <>
          <div
            className="tts-install-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress?.percent ?? 0}
          >
            <div
              className="tts-install-bar"
              style={{ width: `${progress?.percent ?? 0}%` }}
            />
          </div>
          <div className="tts-install-step">
            AI voice {progress?.step ?? 'starting…'} · {progress?.percent ?? 0}%
          </div>
        </>
      )}

      {status.state === 'ready' && (
        <>
          <p className="tts-install-ready">
            Voice model ready — read-aloud now works offline. Press the
            headphones in the reader to try it.
          </p>
          <div className="tts-install-actions">
            <button className="btn btn-ghost" onClick={() => void install()}>
              Re-download
            </button>
          </div>
        </>
      )}

      {status.state === 'error' && (
        <>
          <p className="tts-install-error">{status.message}</p>
          <div className="tts-install-actions">
            <button
              className="btn btn-ghost"
              onClick={() => void install()}
              disabled={busy.current}
            >
              Try again
            </button>
          </div>
        </>
      )}

      <SettingRow label="AI voice">
        <select
          className="tts-voice"
          aria-label="AI voice"
          value={voice}
          disabled={busy.current}
          onChange={(e) => updateSettings({ ttsAiVoice: e.target.value })}
        >
          {AI_VOICES.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </select>
      </SettingRow>
    </div>
  );
}
