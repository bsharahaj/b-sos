import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { login } from '../api/auth.js';
import { useAuth } from '../hooks/useAuth.js';
import AuthLayout from '../components/AuthLayout.jsx';
import TextField from '../components/TextField.jsx';
import PasswordField from '../components/PasswordField.jsx';
import Button from '../components/Button.jsx';
import FormAlert from '../components/FormAlert.jsx';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate({ email, password }) {
  const errors = {};
  if (!email.trim()) errors.email = 'Enter your email address.';
  else if (!EMAIL_PATTERN.test(email.trim())) errors.email = 'Enter a valid email address.';
  if (!password) errors.password = 'Enter your password.';
  return errors;
}

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { startSession } = useAuth();

  const [values, setValues] = useState({ email: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const refs = { email: useRef(null), password: useRef(null) };
  const alertRef = useRef(null);

  useEffect(() => {
    if (formError) alertRef.current?.focus();
  }, [formError]);

  const onChange = (event) => {
    const { name, value } = event.target;
    setValues((prev) => ({ ...prev, [name]: value }));
    if (fieldErrors[name]) setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    setFormError('');

    const errors = validate(values);
    setFieldErrors(errors);
    const firstInvalid = Object.keys(errors)[0];
    if (firstInvalid) {
      refs[firstInvalid].current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      startSession(await login({ email: values.email.trim(), password: values.password }));
      navigate(location.state?.from ?? '/', { replace: true });
    } catch (err) {
      setFieldErrors(err.fieldErrors ?? {});
      setFormError(err.message);
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Log in"
      subtitle="Welcome back. Log in to ask for help or to help others."
      footer={
        <>
          New to B SOS?{' '}
          <Link to="/register" className="font-semibold text-primary underline underline-offset-4 hover:text-primary-hover">
            Create an account
          </Link>
        </>
      }
    >
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5">
        {formError && <FormAlert ref={alertRef}>{formError}</FormAlert>}

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

        <PasswordField
          ref={refs.password}
          label="Password"
          name="password"
          autoComplete="current-password"
          value={values.password}
          onChange={onChange}
          error={fieldErrors.password}
        />

        <Button type="submit" loading={submitting} className="mt-1">
          {submitting ? 'Logging in…' : 'Log in'}
        </Button>
      </form>
    </AuthLayout>
  );
}
