import { SOS_TYPES } from '@shared/constants.js';

// Placeholder until the Home feature is built; the list proves /shared is wired into the client.
export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-4">
      <h1 className="text-3xl font-bold text-red-600">B SOS</h1>
      <p className="text-gray-700">Community emergency response. Scaffold is running.</p>
      <section aria-labelledby="types-heading">
        <h2 id="types-heading" className="font-semibold">SOS types</h2>
        <ul className="list-inside list-disc text-gray-700">
          {Object.values(SOS_TYPES).map((type) => (
            <li key={type}>{type}</li>
          ))}
        </ul>
      </section>
    </main>
  );
}
