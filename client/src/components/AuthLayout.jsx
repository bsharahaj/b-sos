// Shared frame for Login / Register: brand at the top, one card, a footer line (e.g. "No account? Create one").
// On phones the card fills the width; from sm up it becomes a centred card.
export default function AuthLayout({ title, subtitle, footer, children }) {
  return (
    <main className="flex min-h-dvh flex-col px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))] sm:items-center sm:justify-center">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2.5">
          <BrandMark />
          <span className="text-xl font-bold tracking-tight">B SOS</span>
        </div>

        <h1 className="text-2xl font-semibold text-ink">{title}</h1>
        {subtitle && <p className="mt-1 text-base text-ink-muted">{subtitle}</p>}

        <div className="mt-6 sm:rounded-2xl sm:border sm:border-line sm:bg-surface sm:p-6 sm:shadow-sm">{children}</div>

        {footer && <p className="mt-6 text-center text-base text-ink-muted">{footer}</p>}
      </div>
    </main>
  );
}

// Blue, not red: red is reserved for the SOS action itself.
function BrandMark() {
  return (
    <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-white" aria-hidden="true">
      <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 21s-7-4.35-7-10.5A4.5 4.5 0 0 1 12 7.2a4.5 4.5 0 0 1 7 3.3C19 16.65 12 21 12 21Z" />
        <path d="M12 10.5v5M9.5 13h5" />
      </svg>
    </span>
  );
}
