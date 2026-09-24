import { Link } from 'react-router-dom';
import Logo from '../components/Logo.jsx';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 p-6">
      <Logo />
      <div>
        <h1 className="text-[1.75rem] font-medium text-ink">Page not found</h1>
        <p className="mt-2 text-ink-muted">That link doesn't go anywhere. Let's get you back to safety.</p>
      </div>
      <Link
        to="/"
        className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-primary px-5 font-semibold text-on-primary hover:bg-primary-hover focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        Back to home
      </Link>
    </main>
  );
}
