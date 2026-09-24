import { SOS_TYPES } from '@shared/constants.js';

const ICON_PATHS = {
  [SOS_TYPES.MEDICAL]: ['M12 21s-7-4.35-7-10.5A4.5 4.5 0 0 1 12 7.2a4.5 4.5 0 0 1 7 3.3C19 16.65 12 21 12 21Z', 'M12 10.5v5M9.5 13h5'],
  [SOS_TYPES.VEHICLE]: ['M5 17h14v-5l-2-5H7l-2 5v5Z', 'M5 12h14', 'M7.5 17v2M16.5 17v2', 'M8 14.5h.01M16 14.5h.01'],
  [SOS_TYPES.TRANSPORT]: ['M12 21s-6-5.2-6-10a6 6 0 1 1 12 0c0 4.8-6 10-6 10Z', 'M12 13a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z'],
  [SOS_TYPES.SAFETY]: ['M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6l-7-3Z', 'M12 8v4.5M12 15.5h.01'],
  [SOS_TYPES.OTHER]: ['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.3M12 17h.01'],
};

// Shown on the picker and reused on the active-SOS screen.
export const SOS_TYPE_DETAILS = {
  [SOS_TYPES.MEDICAL]: { label: 'Medical', hint: 'Injury or sudden illness' },
  [SOS_TYPES.VEHICLE]: { label: 'Vehicle trouble', hint: 'Accident, flat tyre, breakdown' },
  [SOS_TYPES.TRANSPORT]: { label: 'Need a ride', hint: "Stranded and can't get home" },
  [SOS_TYPES.SAFETY]: { label: 'Feeling unsafe', hint: 'Followed, threatened or scared' },
  [SOS_TYPES.OTHER]: { label: 'Something else', hint: 'Any other help you need' },
};

export function SosTypeIcon({ type, className = 'size-7' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {ICON_PATHS[type].map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

// Large tiles, two per row on phones; one tap picks the type. Tiles use neutral colours: red stays reserved
// for the send action itself.
export default function SosTypePicker({ onSelect }) {
  return (
    <ul className="grid grid-cols-2 gap-3">
      {Object.values(SOS_TYPES).map((type) => {
        const { label, hint } = SOS_TYPE_DETAILS[type];
        return (
          <li key={type} className={type === SOS_TYPES.OTHER ? 'col-span-2' : undefined}>
            <button
              type="button"
              onClick={() => onSelect(type)}
              className="flex h-full min-h-32 w-full flex-col items-start gap-2 rounded-2xl border border-line-strong bg-surface p-4 text-start transition-colors hover:border-primary hover:bg-primary-soft focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary"
            >
              <span className="flex size-11 items-center justify-center rounded-xl bg-primary-soft text-primary">
                <SosTypeIcon type={type} />
              </span>
              <span className="text-base font-semibold text-ink">{label}</span>
              <span className="text-sm leading-snug text-ink-muted">{hint}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
