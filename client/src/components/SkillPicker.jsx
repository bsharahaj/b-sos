import { useId } from 'react';
import { SKILLS } from '@shared/constants.js';

const SKILL_DETAILS = {
  [SKILLS.MEDICAL]: { label: 'Medical', description: 'First aid, CPR, nursing or other medical training.' },
  [SKILLS.MECHANIC]: { label: 'Mechanic', description: 'Flat tyres, jump starts, breakdowns.' },
  [SKILLS.DRIVER]: { label: 'Driver', description: 'Can give someone a lift or a tow.' },
  [SKILLS.GENERAL]: { label: 'General help', description: 'Staying with someone, calling for help, a helping hand.' },
};

// A group of large checkbox cards. Real <input type="checkbox"> elements keep it keyboard- and
// screen-reader-friendly; the card styling and tick mark show the state without relying on colour.
export default function SkillPicker({ value, onChange, legend, error }) {
  const errorId = useId();

  const toggle = (skill) => {
    onChange(value.includes(skill) ? value.filter((s) => s !== skill) : [...value, skill]);
  };

  return (
    <fieldset aria-describedby={error ? errorId : undefined}>
      <legend className="mb-2 text-sm font-medium text-ink">{legend}</legend>

      <div className="flex flex-col gap-2">
        {Object.values(SKILLS).map((skill) => {
          const checked = value.includes(skill);
          const { label, description } = SKILL_DETAILS[skill];
          return (
            <label
              key={skill}
              className={`flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors has-focus-visible:outline-3 has-focus-visible:outline-offset-2 has-focus-visible:outline-primary ${
                checked ? 'border-primary bg-primary-soft' : 'border-line-strong bg-surface hover:bg-canvas'
              }`}
            >
              <input type="checkbox" className="sr-only" checked={checked} onChange={() => toggle(skill)} />
              <span
                aria-hidden="true"
                className={`mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-md border-2 ${
                  checked ? 'border-primary bg-primary text-white' : 'border-line-strong bg-surface'
                }`}
              >
                {checked && (
                  <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="m5 12.5 4.5 4.5L19 7.5" />
                  </svg>
                )}
              </span>
              <span>
                <span className="block text-base font-semibold text-ink">{label}</span>
                <span className="block text-sm text-ink-muted">{description}</span>
              </span>
            </label>
          );
        })}
      </div>

      {error && (
        <p id={errorId} className="mt-2 text-sm text-error">
          {error}
        </p>
      )}
    </fieldset>
  );
}
