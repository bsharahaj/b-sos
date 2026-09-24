import { Link, useLocation } from 'react-router-dom';
import { useAlerts } from '../hooks/useAlerts.js';
import { SOS_TYPE_DETAILS, SosTypeIcon } from './SosTypePicker.jsx';
import { formatDistance } from './AlertCard.jsx';

// Slides in at the top of any signed-in screen when a new SOS alert arrives. Stays until viewed or dismissed:
// under stress a banner that vanishes on its own is worse than one you have to swipe away.
export default function AlertBanner() {
  const { latest, acknowledgeLatest } = useAlerts();
  const location = useLocation();

  if (!latest || location.pathname === `/sos/${latest.sosId}`) return null;
  const { label } = SOS_TYPE_DETAILS[latest.type];

  return (
    <div role="alert" className="fixed inset-x-0 top-0 z-[1100] px-3 pt-[max(0.5rem,env(safe-area-inset-top))]">
      <div className="mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-sos/40 bg-canvas-raised/95 p-3 shadow-[0_18px_40px_-16px_rgba(220,38,38,0.6)] backdrop-blur-md motion-safe:animate-[slide-down_250ms_ease-out]">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-sos/15 text-sos">
          <SosTypeIcon type={latest.type} className="size-6" />
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="text-sm font-semibold text-ink">Someone nearby needs help</p>
          <p className="truncate text-sm text-ink-muted">
            {label} · {formatDistance(latest.distanceM)}
          </p>
        </div>
        <Link
          to={`/sos/${latest.sosId}`}
          onClick={acknowledgeLatest}
          className="min-h-11 shrink-0 rounded-xl bg-primary px-4 text-sm font-semibold leading-[2.75rem] text-on-primary hover:bg-primary-hover focus-visible:outline-3 focus-visible:outline-primary"
        >
          View
        </Link>
        <button
          type="button"
          onClick={acknowledgeLatest}
          aria-label="Dismiss"
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-ink-muted hover:text-ink focus-visible:outline-3 focus-visible:outline-primary"
        >
          <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
