import { forwardRef, useState } from 'react';
import TextField from './TextField.jsx';

const PasswordField = forwardRef(function PasswordField(props, ref) {
  const [visible, setVisible] = useState(false);

  const toggle = (
    <button
      type="button"
      onClick={() => setVisible((v) => !v)}
      aria-label={visible ? 'Hide password' : 'Show password'}
      aria-pressed={visible}
      className="flex size-11 items-center justify-center rounded-lg text-ink-muted hover:text-ink focus-visible:outline-3 focus-visible:outline-primary"
    >
      {visible ? <EyeOffIcon /> : <EyeIcon />}
    </button>
  );

  return <TextField ref={ref} type={visible ? 'text' : 'password'} trailing={toggle} {...props} />;
});

export default PasswordField;

function EyeIcon() {
  return (
    <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg className="size-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10.7 5.1A10.4 10.4 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-2.2 3.1M6.6 6.6A17.6 17.6 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="m2 2 20 20" />
    </svg>
  );
}
