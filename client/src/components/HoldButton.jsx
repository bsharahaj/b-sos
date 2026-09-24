import { useEffect, useRef, useState } from 'react';

// Press-and-hold to confirm, so an SOS isn't sent by an accidental tap. A bar fills while holding;
// letting go early cancels. Keyboard and screen-reader activation (a click with no pointer press,
// event.detail === 0) confirms straight away, since those can't "hold".
export default function HoldButton({ onConfirm, holdMs = 1000, disabled = false, loading = false, children, hint }) {
  const [holding, setHolding] = useState(false);
  const timer = useRef(null);

  const cancel = () => {
    clearTimeout(timer.current);
    setHolding(false);
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  const start = (event) => {
    if (disabled || loading || event.button !== 0) return;
    setHolding(true);
    timer.current = setTimeout(() => {
      setHolding(false);
      onConfirm();
    }, holdMs);
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        onPointerDown={start}
        onPointerUp={cancel}
        onPointerLeave={cancel}
        onPointerCancel={cancel}
        onContextMenu={(event) => event.preventDefault()}
        onClick={(event) => {
          if (event.detail === 0 && !disabled && !loading) onConfirm();
        }}
        className="relative isolate min-h-16 w-full touch-none select-none overflow-hidden rounded-2xl bg-sos px-6 text-lg font-bold text-white shadow-sm transition-colors hover:bg-sos-hover focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span
          aria-hidden="true"
          className="absolute inset-0 -z-10 origin-left bg-black/25 ease-linear rtl:origin-right"
          style={{
            transform: holding ? 'scaleX(1)' : 'scaleX(0)',
            transitionProperty: 'transform',
            transitionDuration: holding ? `${holdMs}ms` : '150ms',
          }}
        />
        {children}
      </button>
      {hint && <p className="text-sm text-ink-muted">{holding ? 'Keep holding…' : hint}</p>}
    </div>
  );
}
