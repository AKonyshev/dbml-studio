import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type JSX,
} from "react";

const MIN_PERCENT = 15;
const MAX_PERCENT = 70;
const DEFAULT_PERCENT = 35;
const KEYBOARD_STEP_PERCENT = 5;

const clampPercent = (percent: number): number =>
  Math.min(MAX_PERCENT, Math.max(MIN_PERCENT, percent));

interface SplitLayoutProps {
  left: ReactNode;
  right: ReactNode;
}

const SplitLayout = ({ left, right }: SplitLayoutProps): JSX.Element => {
  const [leftPercent, setLeftPercent] = useState(DEFAULT_PERCENT);
  // Held so a component unmounted mid-drag can still take its listeners off the
  // window; `onUp` would otherwise be the only thing that ever removes them.
  const endDragRef = useRef<(() => void) | null>(null);

  const startDrag = useCallback(() => {
    const onMove = (event: MouseEvent): void => {
      // Clamped so neither pane can be dragged away entirely: a zero-width
      // editor cannot be typed in, and a zero-width diagram cannot be read.
      setLeftPercent(clampPercent((event.clientX / window.innerWidth) * 100));
    };

    const onUp = (): void => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      document.body.classList.remove("select-none");
      endDragRef.current = null;
    };

    // Dragging across a textarea would otherwise select its text.
    document.body.classList.add("select-none");
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    endDragRef.current = onUp;
  }, []);

  useEffect(
    () => () => {
      endDragRef.current?.();
    },
    [],
  );

  return (
    <div className="flex h-full w-full">
      <div style={{ width: `${leftPercent}%` }} className="h-full min-w-0">
        {left}
      </div>
      {/* A separator that only answers the mouse is a separator half the
          readers cannot move, so it takes focus and the arrow keys too. */}
      <div
        role="separator"
        tabIndex={0}
        aria-orientation="vertical"
        aria-label="Resize editor"
        aria-valuenow={Math.round(leftPercent)}
        aria-valuemin={MIN_PERCENT}
        aria-valuemax={MAX_PERCENT}
        onMouseDown={startDrag}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft") {
            setLeftPercent((current) =>
              clampPercent(current - KEYBOARD_STEP_PERCENT),
            );
          } else if (event.key === "ArrowRight") {
            setLeftPercent((current) =>
              clampPercent(current + KEYBOARD_STEP_PERCENT),
            );
          } else {
            return;
          }
          event.preventDefault();
        }}
        className="w-px shrink-0 cursor-col-resize bg-subtle transition-colors hover:w-1 hover:bg-accent focus:w-1 focus:bg-accent focus:outline-none"
      />
      <div className="h-full min-w-0 flex-1">{right}</div>
    </div>
  );
};

export default SplitLayout;
