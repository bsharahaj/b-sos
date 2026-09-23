import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { register } from '../api/auth.js';
import { useAuth } from '../hooks/useAuth.js';
import AuthLayout from '../components/AuthLayout.jsx';
import TextField from '../components/TextField.jsx';
import PasswordField from '../components/PasswordField.jsx';
import Button from '../components/Button.jsx';
import FormAlert from '../components/FormAlert.jsx';

// Mirrors the server's Zod rules (server/src/routes/auth.js) so most mistakes are caught before a round trip.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^\+[1-9]\d{7,14}$/;

// Field order = focus order when several are invalid.
const FIELDS = ['name', 'email', 'phone', 'password'];

function validate({ name, email, phone, password }) {
  const errors = {};
  const trimmedName = name.trim();
  if (trimmedName.length < 2) errors.name = 'Enter your name (at least 2 characters).';
  else if (trimmedName.length > 80) errors.name = 'Keep your name under 80 characters.';

  if (!email.trim()) errors.email = 'Enter your email address.';
  else if (!EMAIL_PATTERN.test(email.trim())) errors.email = 'Enter a valid email address.';

  if (phone.trim() && !PHONE_PATTERN.test(normalisePhone(phone))) {
    errors.phone = 'Use international format, e.g. +972501234567.';
  }

  if (password.length < 8) errors.password = 'Use at least 8 characters.';
  else if (new TextEncoder().encode(password).length > 72) errors.password = 'That password is too long (72 characters max).';

  return errors;
}

// People type spaces and dashes in phone numbers; the server wants plain +digits.
function normalisePhone(phone) {
  return phone.replace(/[\s()-]/g, '');
}

export default function Register() {
  const navigate = useNavigate();
  const { startSession } = useAuth();

  const [values, setValues] = useState({ name: '', email: '', phone: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const refs = { name: useRef(null), email: useRef(null), phone: useRef(null), password: useRef(null) };
  const alertRef = useRef(null);

  useEffect(() => {
    if (formError) alertRef.current?.focus();
  }, [formError]);

  const onChange = (event) => {
    const { name, value } = event.target;
    setValues((prev) => ({ ...prev, [name]: value }));
    if (fieldErrors[name]) setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const showErrors = (errors) => {
    setFieldErrors(errors);
    const firstInvalid = FIELDS.find((field) => errors[field]);
    if (firstInvalid) refs[firstInvalid].current?.focus();
    return Boolean(firstInvalid);
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setFormError('');
    if (showErrors(validate(values))) return;

    setSubmitting(true);
    try {
      const session = await register({
        name: values.name.trim(),
        email: values.email.trim(),
        phone: normalisePhone(values.phone.trim()),
        password: values.password,
      });
      startSession(session);
      navigate('/', { replace: true });
    } catch (err) {
      setSubmitting(false);
      // "Email/phone already used" belongs next to that field, not in the top banner.
      if (err.code === 'EMAIL_TAKEN') return showErrors({ email: err.message });
      if (err.code === 'PHONE_TAKEN') return showErrors({ phone: err.message });
      if (!showErrors(err.fieldErrors ?? {})) setFormError(err.message);
    }
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Ask for help in an emergency, or offer help to people near you."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-primary underline underline-offset-4 hover:text-primary-hover">
            Log in
          </Link>
        </>
      }
    >
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5">
        {formError && <FormAlert ref={alertRef}>{formError}</FormAlert>}

        <TextField
          ref={refs.name}
          label="Full name"
          name="name"
          autoComplete="name"
          value={values.name}
          onChange={onChange}
          error={fieldErrors.name}
        />

        <TextField
          ref={refs.email}
          label="Email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          value={values.email}
          onChange={onChange}
          error={fieldErrors.email}
        />

        <TextField
          ref={refs.phone}
          label="Phone number (optional)"
          name="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+972501234567"
          hint="You'll need to verify a phone number before you can send an SOS."
          value={values.phone}
          onChange={onChange}
          error={fieldErrors.phone}
        />

        <PasswordField
          ref={refs.password}
          label="Password"
          name="password"
          autoComplete="new-password"
          hint="At least 8 characters."
          value={values.password}
          onChange={onChange}
          error={fieldErrors.password}
        />

        <Button type="submit" loading={submitting} className="mt-1">
          {submitting ? 'Creating account…' : 'Create account'}
        </Button>
      </form>
    </AuthLayout>
  );
}
