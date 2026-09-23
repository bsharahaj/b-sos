import { Link } from 'react-router-dom';
import { SOS_TYPES } from '@shared/constants.js';
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
      <section aria-labelledby="types-heading">
        <h2 id="types-heading" className="font-semibold">SOS types</h2>
        <ul className="list-inside list-disc text-gray-700">
          {Object.values(SOS_TYPES).map((type) => (
            <li key={type}>{type}</li>
          ))}
        </ul>
      </section>
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
