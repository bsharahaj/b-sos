import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import Logo from '../components/Logo.jsx';
import { EMERGENCY_NUMBERS } from '../components/EmergencyBar.jsx';

function greeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function Home() {
  const { user, logout } = useAuth();
  const firstName = user.name.trim().split(/\s+/)[0];

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <header className="flex items-center justify-between">
        <Logo />
        <Link
          to="/profile"
          aria-label="Your profile"
          className="glass flex size-11 items-center justify-center rounded-full text-base font-semibold text-ink hover:bg-surface-strong focus-visible:outline-3 focus-visible:outline-primary"
        >
          {firstName.charAt(0).toUpperCase()}
        </Link>
      </header>

      <section className="mt-8">
        <p className="text-sm text-ink-muted">
          {greeting()}, {firstName}
        </p>
        <h1 className="mt-1 text-[1.75rem] font-medium leading-tight text-ink">
          {user.phoneVerified ? (
            <>
              You're covered.
              <br />
              Help is one tap away.
            </>
          ) : (
            <>
              Almost ready.
              <br />
              One step to go.
            </>
          )}
        </h1>
      </section>

      {user.phoneVerified ? (
        <div className="glass mt-5 flex items-center gap-3 rounded-2xl px-4 py-3 text-sm text-ink-muted">
          <span className="relative flex size-3 shrink-0" aria-hidden="true">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-40 [animation-duration:2.5s] motion-reduce:hidden" />
            <span className="relative inline-flex size-3 rounded-full bg-primary" />
          </span>
          <span>
            <span className="font-medium text-ink">Phone verified.</span> You can send an SOS any time.
          </span>
        </div>
      ) : (
        <Link
          to="/verify-phone"
          className="mt-5 flex items-center gap-3 rounded-2xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning hover:bg-warning/15 focus-visible:outline-3 focus-visible:outline-warning"
        >
          <svg className="size-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="7" y="2" width="10" height="20" rx="2" />
            <path d="M11 18h2" />
          </svg>
          <span className="flex-1">
            <span className="font-medium">Verify your phone</span> so you can send an SOS when it matters.
          </span>
          <svg className="size-5 shrink-0 rtl:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m9 6 6 6-6 6" />
          </svg>
        </Link>
      )}

      <div className="flex flex-1 flex-col items-center justify-center gap-5 py-10">
        <Link
          to="/sos/new"
          aria-label="SOS, ask for help"
          className="relative flex size-48 items-center justify-center rounded-full text-[2.75rem] font-semibold tracking-wider text-white shadow-glow-sos transition-transform duration-150 hover:scale-[1.02] focus-visible:outline-4 focus-visible:outline-offset-8 focus-visible:outline-primary motion-reduce:transition-none"
          style={{ background: 'radial-gradient(circle at 50% 32%, #f87171 0%, #dc2626 55%, #b91c1c 100%)' }}
        >
          <span aria-hidden="true" className="absolute -inset-11 rounded-full border border-sos/25" />
          <span aria-hidden="true" className="absolute inset-0 rounded-full shadow-[inset_0_-10px_24px_rgba(0,0,0,0.28)]" />
          SOS
        </Link>
        <p className="text-base text-ink-muted">Tap to ask for help nearby</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link
          to="/profile"
          className="glass flex min-h-24 flex-col justify-between rounded-2xl p-4 hover:bg-surface-strong focus-visible:outline-3 focus-visible:outline-primary"
        >
          <span className="text-sm text-ink-muted">Helping others</span>
          <span className="text-base font-semibold text-primary">Helper settings</span>
        </Link>
        <div className="glass flex min-h-24 flex-col justify-between rounded-2xl p-4">
          <span className="text-sm text-ink-muted">Emergency</span>
          <span className="flex flex-wrap gap-x-3 text-base font-semibold text-ink">
            {EMERGENCY_NUMBERS.map(({ label, number }) => (
              <a key={number} href={`tel:${number}`} aria-label={`Call ${label.toLowerCase()}, ${number}`} className="underline-offset-4 hover:underline">
                {number}
              </a>
            ))}
          </span>
        </div>
      </div>

      <button
        type="button"
        onClick={logout}
        className="mt-6 min-h-11 self-center text-sm font-medium text-ink-muted underline-offset-4 hover:text-ink hover:underline focus-visible:outline-3 focus-visible:outline-primary"
      >
        Log out
      </button>
    </main>
  );
}
