import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * ReaderScrollbar
 *
 * An overlay scrollbar pinned to the far-right edge of the reading pane.
 * The native scrollbar is hidden on the reading column so nothing competes
 * with the text; this track appears briefly while scrolling (or while it is
 * hovered) and fades back out once the reader goes idle.
 */
const HIDE_DELAY = 700;

interface Props {
  scroller: HTMLElement | null;
}

export function ReaderScrollbar({ scroller }: Props) {
  const [thumb, setThumb] = useState({ top: 0, height: 0 });
  const [ready, setReady] = useState(false);
  const [idle, setIdle] = useState(true);
  const hideTimer = useRef<number | null>(null);
  const dragging = useRef(false);
  const raf = useRef<number | null>(null);
  const [hover, setHover] = useState(false);

  useLayoutEffect(() => {
    if (!scroller) return;
    const update = () => {
      const { scrollTop, scrollHeight, clientHeight } = scroller;
      if (scrollHeight <= clientHeight + 1) {
        setReady(false);
        setThumb({ top: 0, height: 0 });
        return;
      }
      const height = Math.max(28, (clientHeight / scrollHeight) * clientHeight);
      const top =
        (scrollTop / (scrollHeight - clientHeight)) * (clientHeight - height);
      setReady(true);
      setThumb({ top, height });
    };

    const onScroll = () => {
      if (raf.current == null) {
        raf.current = requestAnimationFrame(() => {
          raf.current = null;
          update();
        });
      }
      wake();
    };

    const wake = () => {
      setIdle(false);
      if (hideTimer.current != null) window.clearTimeout(hideTimer.current);
      hideTimer.current = window.setTimeout(() => {
        setIdle(true);
      }, HIDE_DELAY);
    };

    const ro = new ResizeObserver(update);
    ro.observe(scroller);
    update();
    scroller.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      ro.disconnect();
      if (raf.current != null) cancelAnimationFrame(raf.current);
      if (hideTimer.current != null) window.clearTimeout(hideTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scroller]);

  const dragStart = (x: number, y: number) => {
    if (!scroller || !ready) return;
    dragging.current = true;
    const prev = scroller.style.scrollBehavior;
    scroller.style.scrollBehavior = 'auto';
    drag(x, y);
    const onMove = (e: PointerEvent) => drag(e.clientX, e.clientY);
    const onUp = () => {
      dragging.current = false;
      if (scroller) scroller.style.scrollBehavior = prev;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const drag = (_x: number, y: number) => {
    if (!scroller || !trackRef.current || !ready) return;
    const track = trackRef.current.getBoundingClientRect();
    const maxScroll = scroller.scrollHeight - scroller.clientHeight;
    const thumbHeight = thumb.height || 28;
    const ratio =
      (y - track.top - thumbHeight / 2) / (track.height - thumbHeight);
    scroller.scrollTop = Math.max(0, Math.min(1, ratio)) * maxScroll;
  };

  const trackRef = useRef<HTMLDivElement>(null);

  useEffect(
    () => () => {
      // Cleanup for stray timers on unmount.
      dragging.current = false;
    },
    []
  );

  const visible = !idle || hover || dragging.current;

  return (
    <div
      ref={trackRef}
      className={`reader-scrollbar ${ready ? 'is-ready' : ''} ${visible ? 'is-visible' : ''}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        dragStart(e.clientX, e.clientY);
      }}
      role="scrollbar"
      aria-controls="reader-content"
      aria-orientation="vertical"
      aria-valuenow={
        scroller
          ? Math.round(
              (scroller.scrollTop /
                (scroller.scrollHeight - scroller.clientHeight)) *
                100
            )
          : 0
      }
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="reader-scroll-thumb"
        style={{ top: thumb.top, height: thumb.height }}
      />
    </div>
  );
}
