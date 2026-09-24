const VARIANTS = {
  primary: 'bg-primary text-on-primary shadow-glow-primary hover:bg-primary-hover disabled:bg-primary/50 disabled:shadow-none',
  secondary: 'glass text-ink hover:bg-surface-strong disabled:opacity-60',
};

// 48px tall, full width on phones. `loading` keeps the label visible so the button doesn't jump in size.
export default function Button({ variant = 'primary', loading = false, disabled, children, className = '', type = 'button', ...props }) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={`inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl px-5 text-base font-semibold transition-colors duration-150 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

function Spinner() {
  return (
    <svg className="size-5 animate-spin motion-reduce:animate-none" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.3" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
