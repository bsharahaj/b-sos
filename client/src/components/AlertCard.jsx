import { Link } from 'react-router-dom';
import { SOS_TYPE_DETAILS, SosTypeIcon } from './SosTypePicker.jsx';

export function formatDistance(metres) {
  if (metres === null || metres === undefined) return 'Distance unknown';
  if (metres < 1000) return `${Math.max(50, Math.round(metres / 50) * 50)} m away`;
  return `${(metres / 1000).toFixed(1)} km away`;
}

export function formatRating(avg) {
  return avg ? `${avg.toFixed(1)} ★` : 'New user';
}

function minutesAgo(iso) {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins === 0) return 'Just now';
  return mins === 1 ? '1 min ago' : `${mins} min ago`;
}

// One incoming SOS alert. The whole card is the link; dismiss is a separate small button.
export default function AlertCard({ alert, onDismiss }) {
  const { label, hint } = SOS_TYPE_DETAILS[alert.type];
  return (
    <li className="glass relative flex items-start gap-3 rounded-3xl p-4">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-sos/15 text-sos">
        <SosTypeIcon type={alert.type} />
      </span>
      <div className="min-w-0 flex-1">
        <Link to={`/sos/${alert.sosId}`} className="block after:absolute after:inset-0 after:rounded-3xl focus-visible:outline-none focus-visible:after:outline-3 focus-visible:after:outline-primary">
          <span className="block text-base font-semibold text-ink">{label}</span>
          <span className="block text-sm text-ink-muted">{hint}</span>
        </Link>
        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-ink-muted">
          <span className="font-medium text-primary">{formatDistance(alert.distanceM)}</span>
          <span>{formatRating(alert.requesterRating)}</span>
          <span>{minutesAgo(alert.createdAt)}</span>
        </p>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={() => onDismiss(alert.sosId)}
          aria-label="Dismiss this alert"
          className="relative z-10 flex size-11 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-surface-strong hover:text-ink focus-visible:outline-3 focus-visible:outline-primary"
        >
          <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="m6 6 12 12M18 6 6 18" />
          </svg>
        </button>
      )}
    </li>
  );
}
