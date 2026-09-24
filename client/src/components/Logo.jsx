// Brand mark: a beacon — a point with signal arcs — on a teal gradient tile. Same drawing as public/favicon.svg.
export function LogoMark({ className = 'size-9' }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="bsos-logo-gradient" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#5eead4" />
          <stop offset="1" stopColor="#0d9488" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill="url(#bsos-logo-gradient)" />
      <circle cx="32" cy="34" r="6" fill="#06201d" />
      <path d="M20.7 45.3a16 16 0 0 1 0-22.6M43.3 22.7a16 16 0 0 1 0 22.6" fill="none" stroke="#06201d" strokeWidth="4" strokeLinecap="round" />
      <path d="M13.6 52.4a26 26 0 0 1 0-36.8M50.4 15.6a26 26 0 0 1 0 36.8" fill="none" stroke="#06201d" strokeOpacity=".45" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

// Mark + wordmark. The wordmark keeps normal case and no letter-spacing so it sits well next to Arabic later.
export default function Logo({ markClassName = 'size-9', textClassName = 'text-xl' }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark className={markClassName} />
      <span className={`font-semibold text-ink ${textClassName}`}>
        B <span className="text-primary">SOS</span>
      </span>
    </span>
  );
}
