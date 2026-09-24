import Logo from './Logo.jsx';

// Shared frame for Login / Register / Verify phone: logo at the top, one frosted card, a footer line.
// On phones the card fills the width; from sm up it becomes a centred card.
export default function AuthLayout({ title, subtitle, footer, children }) {
  return (
    <main className="flex min-h-dvh flex-col px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))] sm:items-center sm:justify-center">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-8">
          <Logo />
        </div>

        <h1 className="text-[1.75rem] font-medium leading-tight text-ink">{title}</h1>
        {subtitle && <p className="mt-2 text-base text-ink-muted">{subtitle}</p>}

        <div className="mt-6 sm:glass sm:rounded-3xl sm:p-6">{children}</div>

        {footer && <p className="mt-6 text-center text-base text-ink-muted">{footer}</p>}
      </div>
    </main>
  );
}
