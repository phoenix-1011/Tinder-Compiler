import { useCallback, useRef, useState } from "react";

interface SplitterProps {
  /** Drag axis. "vertical" is a vertical bar that resizes a horizontal width. */
  orientation: "vertical" | "horizontal";
  /** Current size in pixels. */
  value: number;
  /** Called continuously during drag. */
  onChange(next: number): void;
  /** When true, drag delta is added; when false, subtracted. Useful for
   *  resizing a panel from its top edge (the panel grows as the cursor moves up). */
  invert?: boolean;
}

/**
 * Overlay-style splitter. The outer element occupies zero space in the
 * parent grid/flex layout, so the two panels it separates sit flush against
 * each other — no visible seam, no parent-colored gap. The actual hit area
 * + visible feedback live in a child element absolutely positioned over the
 * seam (6px wide/tall, centered), which captures pointer events and tints
 * accent on hover/drag.
 */
export function Splitter({ orientation, value, onChange, invert = false }: SplitterProps) {
  const [dragging, setDragging] = useState(false);
  const startRef = useRef<{ pointer: number; value: number } | null>(null);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      (event.target as HTMLElement).setPointerCapture(event.pointerId);
      setDragging(true);
      startRef.current = {
        pointer: orientation === "vertical" ? event.clientX : event.clientY,
        value
      };
    },
    [orientation, value]
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const start = startRef.current;
      if (!start) return;
      const cur = orientation === "vertical" ? event.clientX : event.clientY;
      const delta = cur - start.pointer;
      const next = invert ? start.value - delta : start.value + delta;
      onChange(next);
    },
    [orientation, invert, onChange]
  );

  const onPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    (event.target as HTMLElement).releasePointerCapture(event.pointerId);
    setDragging(false);
    startRef.current = null;
  }, []);

  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={`splitter splitter-${orientation}${dragging ? " is-dragging" : ""}`}
    >
      <div
        className={`splitter-hit splitter-hit-${orientation}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      />
    </div>
  );
}
