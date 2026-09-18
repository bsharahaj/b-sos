import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-4">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <Link to="/" className="text-red-600 underline">
        Back to home
      </Link>
    </main>
  );
}
