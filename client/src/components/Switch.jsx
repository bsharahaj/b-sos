import { useId } from 'react';

// On/off control. The whole row is one 48px+ button (role="switch"), and the state is also written
// out as text ("On"/"Off") so colour and knob position are never the only signal.
export default function Switch({ checked, onChange, label, description, disabled = false }) {
  const labelId = useId();
  const descriptionId = useId();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelId}
      aria-describedby={description ? descriptionId : undefined}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex min-h-12 w-full items-center gap-4 rounded-xl text-start focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary disabled:opacity-60"
    >
      <span className="flex-1">
        <span id={labelId} className="block text-base font-semibold text-ink">
          {label}
        </span>
        {description && (
          <span id={descriptionId} className="block text-sm text-ink-muted">
            {description}
          </span>
        )}
      </span>

      <span className="flex shrink-0 items-center gap-2">
        <span className="text-sm font-medium text-ink-muted" aria-hidden="true">
          {checked ? 'On' : 'Off'}
        </span>
        <span
          aria-hidden="true"
          className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors duration-150 ${checked ? 'bg-primary' : 'bg-line-strong'}`}
        >
          <span
            className={`absolute size-6 rounded-full bg-white shadow transition-[inset-inline-start] duration-150 motion-reduce:transition-none ${
              checked ? 'start-7' : 'start-1'
            }`}
          />
        </span>
      </span>
    </button>
  );
}
