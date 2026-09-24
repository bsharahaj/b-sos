import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import Button from '../components/Button.jsx';

// Placeholder until the Home feature is built; the list proves /shared is wired into the client.
export default function Home() {
  const { user, logout } = useAuth();

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-4">
      <h1 className="text-3xl font-bold text-red-600">B SOS</h1>
      <p className="text-gray-700">Signed in as {user.name}. Scaffold is running.</p>
      {!user.phoneVerified && (
        <div className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-soft p-4 text-warning">
          <svg className="mt-0.5 size-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="7" y="2" width="10" height="20" rx="2" />
            <path d="M11 18h2" />
          </svg>
          <p>
            Verify your phone before you need to send an SOS.{' '}
            <Link to="/verify-phone" className="font-semibold underline underline-offset-4">
              Verify now
            </Link>
          </p>
        </div>
      )}
      <div className="flex flex-col items-center gap-3 py-6">
        <Link
          to="/sos/new"
          aria-label="SOS, ask for help"
          className="flex size-44 items-center justify-center rounded-full bg-sos text-4xl font-bold tracking-wide text-white shadow-lg ring-8 ring-sos/15 hover:bg-sos-hover focus-visible:outline-4 focus-visible:outline-offset-4 focus-visible:outline-ink"
        >
          SOS
        </Link>
        <p className="text-base text-ink-muted">Tap to ask for help nearby</p>
      </div>
      <Link
        to="/profile"
        className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-primary px-5 text-base font-semibold text-white hover:bg-primary-hover focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        Your profile & helper settings
      </Link>
      <Button variant="secondary" onClick={logout}>
        Log out
      </Button>
    </main>
  );
}
