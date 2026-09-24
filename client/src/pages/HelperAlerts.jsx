import { Link } from 'react-router-dom';
import { useAlerts } from '../hooks/useAlerts.js';
import { useAuth } from '../hooks/useAuth.js';
import AlertCard from '../components/AlertCard.jsx';

export default function HelperAlerts() {
  const { alerts, dismiss } = useAlerts();
  const { helperProfile } = useAuth();
  const available = Boolean(helperProfile?.isAvailable);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <header className="flex flex-col gap-3">
        <Link
          to="/"
          className="-ms-2 inline-flex min-h-11 items-center gap-1 self-start rounded-lg px-2 font-semibold text-primary hover:text-primary-hover focus-visible:outline-3 focus-visible:outline-primary"
        >
          <svg className="size-5 rtl:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
          Home
        </Link>
        <h1 className="text-[1.75rem] font-medium leading-tight text-ink">SOS alerts</h1>
        <p className="text-ink-muted">
          {available ? 'People nearby who asked for help with one of your skills.' : "You're not available right now, so no new alerts will arrive."}
          {!available && (
            <>
              {' '}
              <Link to="/profile" className="font-semibold text-primary underline underline-offset-4">
                Change in profile
              </Link>
            </>
          )}
        </p>
      </header>

      {alerts.length === 0 ? (
        <div className="glass flex flex-col items-center gap-2 rounded-3xl p-8 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-primary" aria-hidden="true">
            <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0" />
            </svg>
          </span>
          <p className="text-base font-medium text-ink">No open alerts</p>
          <p className="text-sm text-ink-muted">When someone near you sends an SOS, it appears here and as a banner on any screen.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {alerts.map((alert) => (
            <AlertCard key={alert.sosId} alert={alert} onDismiss={dismiss} />
          ))}
        </ul>
      )}
    </main>
  );
}
