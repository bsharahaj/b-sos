import { STATUSES } from '@shared/constants.js';

const STEPS = [
  { status: STATUSES.OPEN, label: 'Sent' },
  { status: STATUSES.ACCEPTED, label: 'Accepted' },
  { status: STATUSES.EN_ROUTE, label: 'On the way' },
  { status: STATUSES.ARRIVED, label: 'Arrived' },
  { status: STATUSES.RESOLVED, label: 'Resolved' },
];

// Horizontal progress of an SOS. Done steps are filled, the current one pulses, later ones are dim.
// Colour is never the only signal: done steps carry a tick, the current one a dot, and text is always shown.
export default function StatusTimeline({ status }) {
  if (status === STATUSES.CANCELLED) return null;
  const currentIndex = STEPS.findIndex((s) => s.status === status);

  return (
    <ol className="flex items-start justify-between gap-1" aria-label="Progress">
      {STEPS.map((step, index) => {
        const done = index < currentIndex;
        const current = index === currentIndex;
        return (
          <li key={step.status} className="flex flex-1 flex-col items-center gap-1.5 text-center" aria-current={current ? 'step' : undefined}>
            <span className="flex w-full items-center">
              <span className={`h-0.5 flex-1 ${index === 0 ? 'opacity-0' : done || current ? 'bg-primary' : 'bg-line-strong'}`} aria-hidden="true" />
              <span
                className={`flex size-6 shrink-0 items-center justify-center rounded-full border-2 ${
                  done ? 'border-primary bg-primary text-on-primary' : current ? 'border-primary bg-canvas' : 'border-line-strong bg-canvas'
                }`}
                aria-hidden="true"
              >
                {done && (
                  <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m5 12.5 4.5 4.5L19 7.5" />
                  </svg>
                )}
                {current && <span className="size-2.5 rounded-full bg-primary motion-safe:animate-pulse" />}
              </span>
              <span className={`h-0.5 flex-1 ${index === STEPS.length - 1 ? 'opacity-0' : done ? 'bg-primary' : 'bg-line-strong'}`} aria-hidden="true" />
            </span>
            <span className={`text-xs leading-tight ${current ? 'font-semibold text-ink' : done ? 'text-ink-muted' : 'text-ink-muted/60'}`}>
              {step.label}
              {current && <span className="sr-only"> (current)</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
