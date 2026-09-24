import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { sendPhoneCode, verifyPhoneCode } from '../api/auth.js';
import { useAuth } from '../hooks/useAuth.js';
import AuthLayout from '../components/AuthLayout.jsx';
import TextField from '../components/TextField.jsx';
import PhoneField, { PHONE_FORMAT_MESSAGE, isValidPhone, normalisePhone } from '../components/PhoneField.jsx';
import Button from '../components/Button.jsx';
import FormAlert from '../components/FormAlert.jsx';

const CODE_PATTERN = /^\d{6}$/;

// These mean the current code can no longer be used; the user needs a new one.
const DEAD_CODE_ERRORS = ['CODE_EXPIRED', 'NO_ACTIVE_CODE', 'TOO_MANY_ATTEMPTS'];

// Seconds left until `until` (a timestamp), ticking once per second.
function useSecondsUntil(until) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!until || until <= Date.now()) return undefined;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [until]);

  return until ? Math.max(0, Math.ceil((until - now) / 1000)) : 0;
}

// Two steps on one page: 'phone' (send a code) -> 'code' (type it in) -> 'done'.
export default function VerifyPhone() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, updateUser } = useAuth();
  const nextPath = location.state?.from ?? '/';

  const [step, setStep] = useState(user.phoneVerified ? 'done' : 'phone');
  const [phone, setPhone] = useState(user.phone ?? '');
  const [sentTo, setSentTo] = useState('');
  const [code, setCode] = useState('');
  const [fieldError, setFieldError] = useState('');
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resendAt, setResendAt] = useState(0);
  const resendIn = useSecondsUntil(resendAt);

  const phoneRef = useRef(null);
  const codeRef = useRef(null);
  const alertRef = useRef(null);

  useEffect(() => {
    if (formError) alertRef.current?.focus();
  }, [formError]);

  useEffect(() => {
    if (step === 'code') codeRef.current?.focus();
  }, [step]);

  const clearMessages = () => {
    setFieldError('');
    setFormError('');
    setNotice('');
  };

  const requestCode = async (targetPhone) => {
    clearMessages();
    setSubmitting(true);
    try {
      const { sentTo: to, resendAfterSec } = await sendPhoneCode(targetPhone);
      setSentTo(to);
      setResendAt(Date.now() + resendAfterSec * 1000);
      setCode('');
      setStep('code');
    } catch (err) {
      if (err.code === 'CODE_RECENTLY_SENT') {
        // A code sent moments ago is still valid, so let the user type it in.
        setSentTo(targetPhone);
        setResendAt(Date.now() + (err.details.retryAfterSec ?? 60) * 1000);
        setNotice('We sent you a code a moment ago. Enter it below.');
        setStep('code');
      } else if (step === 'phone' && (err.code === 'PHONE_TAKEN' || err.fieldErrors.phone)) {
        setFieldError(err.fieldErrors.phone ?? err.message);
        phoneRef.current?.focus();
      } else {
        setFormError(err.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const onSendCode = (event) => {
    event.preventDefault();
    if (!isValidPhone(phone)) {
      clearMessages();
      setFieldError(phone.trim() ? PHONE_FORMAT_MESSAGE : 'Enter your phone number.');
      phoneRef.current?.focus();
      return;
    }
    requestCode(normalisePhone(phone));
  };

  const onVerify = async (event) => {
    event.preventDefault();
    clearMessages();
    if (!CODE_PATTERN.test(code)) {
      setFieldError('Enter the 6-digit code from the text message.');
      codeRef.current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const { user: verified } = await verifyPhoneCode(sentTo, code);
      updateUser(verified);
      setStep('done');
    } catch (err) {
      if (err.code === 'INVALID_CODE') {
        const left = err.details.attemptsLeft;
        setFieldError(left === undefined ? err.message : `${err.message} ${left} ${left === 1 ? 'try' : 'tries'} left.`);
        codeRef.current?.select();
      } else {
        if (DEAD_CODE_ERRORS.includes(err.code)) setCode('');
        setFormError(err.message);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const changeNumber = () => {
    clearMessages();
    setCode('');
    setStep('phone');
  };

  if (step === 'done') {
    return (
      <AuthLayout title="Phone verified">
        <div className="flex flex-col gap-6">
          <div role="status" className="flex items-start gap-3 rounded-2xl border border-success/30 bg-success-soft p-4 text-success">
            <CheckIcon />
            <p className="text-base">
              <span className="font-semibold">You're all set.</span>{' '}
              <span dir="ltr">{user.phone}</span> is verified, so you can send an SOS when you need help.
            </p>
          </div>
          <Button onClick={() => navigate(nextPath, { replace: true })}>Continue</Button>
        </div>
      </AuthLayout>
    );
  }

  const skipLink = (
    <Link to={nextPath} replace className="font-semibold text-primary underline underline-offset-4 hover:text-primary-hover">
      Skip for now
    </Link>
  );

  if (step === 'phone') {
    return (
      <AuthLayout
        title="Verify your phone"
        subtitle="We'll text you a 6-digit code. A verified phone is needed to send an SOS, so helpers know requests are real."
        footer={skipLink}
      >
        <form noValidate onSubmit={onSendCode} className="flex flex-col gap-5">
          {formError && <FormAlert ref={alertRef}>{formError}</FormAlert>}

          <PhoneField
            ref={phoneRef}
            label="Phone number"
            name="phone"
            value={phone}
            onChange={(event) => {
              setPhone(event.target.value);
              setFieldError('');
            }}
            error={fieldError}
          />

          <Button type="submit" loading={submitting}>
            {submitting ? 'Sending code…' : 'Send code'}
          </Button>
        </form>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Enter the code"
      subtitle={
        <>
          We sent a 6-digit code to <span dir="ltr" className="font-semibold text-ink">{sentTo}</span>. It's valid for 10 minutes.
        </>
      }
      footer={skipLink}
    >
      <form noValidate onSubmit={onVerify} className="flex flex-col gap-5">
        {formError && <FormAlert ref={alertRef}>{formError}</FormAlert>}
        {notice && (
          <p role="status" className="rounded-2xl border border-primary/30 bg-primary-soft p-4 text-sm text-primary">
            {notice}
          </p>
        )}

        <TextField
          ref={codeRef}
          label="Verification code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          // No maxLength: it would cut "123 456" to "123 45" before the digits are cleaned below.
          dir="ltr"
          inputClassName="text-center text-2xl! font-semibold tracking-[0.5em]"
          value={code}
          onChange={(event) => {
            setCode(event.target.value.replace(/\D/g, '').slice(0, 6));
            setFieldError('');
          }}
          error={fieldError}
        />

        <Button type="submit" loading={submitting}>
          {submitting ? 'Checking…' : 'Verify'}
        </Button>

        <div className="flex flex-col gap-3">
          <Button variant="secondary" disabled={resendIn > 0 || submitting} onClick={() => requestCode(sentTo)}>
            {resendIn > 0 ? `Resend code in ${resendIn} s` : 'Resend code'}
          </Button>
          <button
            type="button"
            onClick={changeNumber}
            className="min-h-11 text-base font-semibold text-primary underline underline-offset-4 hover:text-primary-hover"
          >
            Use a different number
          </button>
        </div>
      </form>
    </AuthLayout>
  );
}

function CheckIcon() {
  return (
    <svg className="mt-0.5 size-6 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12.5 2.5 2.5L16 9.5" />
    </svg>
  );
}
