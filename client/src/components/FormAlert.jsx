import { forwardRef } from 'react';

// Form-level error shown above the fields. Focusable so the page can move focus to it after a failed submit.
const FormAlert = forwardRef(function FormAlert({ children }, ref) {
  return (
    <div
      ref={ref}
      role="alert"
      tabIndex={-1}
      className="flex items-start gap-3 rounded-2xl border border-error/30 bg-error-soft p-4 text-sm text-error focus:outline-none"
    >
      <svg className="mt-0.5 size-5 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path
          fillRule="evenodd"
          d="M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0Zm-8-5a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 10 5Zm0 10a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
          clipRule="evenodd"
        />
      </svg>
      <p>{children}</p>
    </div>
  );
});

export default FormAlert;
