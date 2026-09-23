import { forwardRef, useId } from 'react';

// Label above, hint below, error replaces the hint. `trailing` renders inside the input's end edge
// (end = right in LTR, left in RTL), e.g. the show/hide password button.
const TextField = forwardRef(function TextField({ label, hint, error, trailing, id, className = '', ...inputProps }, ref) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label htmlFor={inputId} className="text-sm font-medium text-ink">
        {label}
      </label>

      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          // text-base (16px) stops iOS Safari zooming in on focus.
          className={`min-h-12 w-full rounded-xl border bg-surface px-4 text-base text-ink placeholder:text-ink-muted/70 transition-colors focus:outline-3 focus:outline-offset-0 ${
            error ? 'border-error focus:outline-error/25' : 'border-line-strong focus:border-primary focus:outline-primary/25'
          } ${trailing ? 'pe-12' : ''}`}
          {...inputProps}
        />
        {trailing && <div className="absolute inset-y-0 end-0 flex items-center pe-1">{trailing}</div>}
      </div>

      {error ? (
        <p id={errorId} className="flex items-start gap-1.5 text-sm text-error">
          <ErrorIcon />
          <span>{error}</span>
        </p>
      ) : (
        hint && (
          <p id={hintId} className="text-sm text-ink-muted">
            {hint}
          </p>
        )
      )}
    </div>
  );
});

export default TextField;

function ErrorIcon() {
  return (
    <svg className="mt-0.5 size-4 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
        clipRule="evenodd"
      />
    </svg>
  );
}
