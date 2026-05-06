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
 * A 4-pixel hit-target splitter with a 1-pixel visible line. Highlights on
 * hover/drag (VS Code does the same).
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
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    />
  );
}
