import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import HelperPresence from './HelperPresence.jsx';
import AlertBanner from './AlertBanner.jsx';

// Wrap routes that need a signed-in user. Remembers where the user was going so Login can send them back.
// HelperPresence lives here so an available helper shares their location on every signed-in screen.
export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <SessionLoading />;
  if (status === 'anonymous') return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  return (
    <>
      <HelperPresence />
      <AlertBanner />
      <Outlet />
    </>
  );
}

// Wrap Login/Register so a signed-in user who opens them goes straight to the app.
export function GuestOnly() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <SessionLoading />;
  if (status === 'authenticated') return <Navigate to={location.state?.from ?? '/'} replace />;
  return <Outlet />;
}

function SessionLoading() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div role="status" className="flex items-center gap-3 text-ink-muted">
        <svg className="size-5 animate-spin motion-reduce:animate-none" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
          <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
        <span>Loading…</span>
      </div>
    </main>
  );
}
