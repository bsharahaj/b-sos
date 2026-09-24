// B SOS complements emergency services, never replaces them (CLAUDE.md §1), so every SOS screen
// keeps these numbers visible. Sticky + high z-index so it stays above the Leaflet map panes.
export const EMERGENCY_NUMBERS = [
  { label: 'Ambulance', number: '101' },
  { label: 'Police', number: '100' },
];

export default function EmergencyBar() {
  return (
    <div className="sticky top-0 z-[1000] border-b border-line bg-surface/95 px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur">
      <div className="mx-auto flex max-w-md items-center gap-3">
        <p className="flex-1 text-sm font-medium leading-tight text-ink">Life in danger? Call now</p>
        {EMERGENCY_NUMBERS.map(({ label, number }) => (
          <a
            key={number}
            href={`tel:${number}`}
            aria-label={`Call ${label.toLowerCase()}, ${number}`}
            className="flex min-h-11 flex-col items-center justify-center rounded-lg border border-ink px-3 leading-none text-ink hover:bg-canvas focus-visible:outline-3 focus-visible:outline-primary"
          >
            <span className="text-base font-bold">{number}</span>
            <span className="text-xs">{label}</span>
          </a>
        ))}
      </div>
    </div>
  );
}
