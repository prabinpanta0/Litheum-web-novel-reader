import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * DiscreteSlider
 *
 * A stepped slider with an "elastic" feel: values snap to the nearest step
 * while dragging, and the knob stretches softly when the pointer pushes past
 * either end, then springs back to rest on release. Keyboard accessible.
 */
interface DiscreteSliderProps {
  minimum: number;
  maximum: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
  'aria-label'?: string;
  pageStep?: number;
}

export default function DiscreteSlider({
  minimum,
  maximum,
  step,
  value,
  onChange,
  'aria-label': ariaLabel,
  pageStep,
}: DiscreteSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [overshoot, setOvershoot] = useState(0);
  const [popping, setPopping] = useState(false);

  const steps = Math.round((maximum - minimum) / step);
  const index = clamp(Math.round((value - minimum) / step), 0, steps);
  const valuePct = (index / steps) * 100;

  const stepFromPointer = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const ratio = (clientX - rect.left) / rect.width;
      setOvershoot(
        Math.min(
          0.5,
          Math.max(0, ratio < 0 ? -ratio : ratio > 1 ? ratio - 1 : 0)
        )
      );
      const idx = clamp(Math.round(clamp(ratio, 0, 1) * steps), 0, steps);
      onChange(minimum + idx * step);
    },
    [minimum, step, steps, onChange]
  );

  const beginDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    setDragging(true);
    stepFromPointer(e.clientX);
  };

  const moveDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    stepFromPointer(e.clientX);
  };

  const endDrag = () => {
    if (!dragging) return;
    setDragging(false);
    setOvershoot(0);
    setPopping(true);
  };

  useEffect(() => {
    if (!popping) return;
    const t = window.setTimeout(() => setPopping(false), 420);
    return () => window.clearTimeout(t);
  }, [popping]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    let next = value;
    const big = pageStep ?? (maximum - minimum) / 4;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') next = value + step;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown')
      next = value - step;
    else if (e.key === 'PageUp') next = value + big;
    else if (e.key === 'PageDown') next = value - big;
    else if (e.key === 'Home') next = minimum;
    else if (e.key === 'End') next = maximum;
    else return;
    e.preventDefault();
    onChange(clamp(next, minimum, maximum));
  };

  return (
    <div
      className={`discrete-slider${dragging ? ' is-dragging' : ''}`}
      role="slider"
      tabIndex={0}
      aria-label={ariaLabel}
      aria-valuemin={minimum}
      aria-valuemax={maximum}
      aria-valuenow={value}
      aria-valuetext={`${value}`}
      onKeyDown={onKeyDown}
    >
      <div
        className="discrete-track"
        ref={trackRef}
        onPointerDown={beginDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <div className="discrete-fill" style={{ width: `${valuePct}%` }} />
        {Array.from({ length: steps + 1 }, (_, i) => (
          <span
            key={i}
            className={`discrete-tick${i <= index ? ' is-on' : ''}`}
            style={{ left: `${(i / steps) * 100}%` }}
          />
        ))}
        <div className="discrete-knob-pos" style={{ left: `${valuePct}%` }}>
          <span
            className={`discrete-knob${popping ? ' is-popping' : ''}`}
            style={{ '--stretch': overshoot } as React.CSSProperties}
          />
        </div>
      </div>
    </div>
  );
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}
