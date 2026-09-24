import { useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createSos } from '../api/sos.js';
import { useAuth } from '../hooks/useAuth.js';
import { useGeolocation } from '../hooks/useGeolocation.js';
import EmergencyBar from '../components/EmergencyBar.jsx';
import SosTypePicker, { SOS_TYPE_DETAILS, SosTypeIcon } from '../components/SosTypePicker.jsx';
import LocationMap, { metresForPixels } from '../components/LocationMap.jsx';
import HoldButton from '../components/HoldButton.jsx';
import FormAlert from '../components/FormAlert.jsx';

const APPROXIMATE_ABOVE_M = 100;
const DESCRIPTION_MAX = 500;
// When the user places the pin by hand, report the ground distance of about half a pin's width as the accuracy.
const MANUAL_PIN_PIXELS = 24;

export default function CreateSos() {
  const { user } = useAuth();

  return (
    <>
      <EmergencyBar />
      <main className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4">
        {user.phoneVerified ? <SosFlow /> : <VerifyFirst />}
      </main>
    </>
  );
}

function BackLink({ to, onClick, children }) {
  const className =
    '-ms-2 inline-flex min-h-11 items-center gap-1 self-start rounded-lg px-2 font-semibold text-primary hover:text-primary-hover focus-visible:outline-3 focus-visible:outline-primary';
  const content = (
    <>
      <svg className="size-5 rtl:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="m15 18-6-6 6-6" />
      </svg>
      {children}
    </>
  );
  return to ? (
    <Link to={to} className={className}>
      {content}
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={className}>
      {content}
    </button>
  );
}

function VerifyFirst() {
  return (
    <>
      <BackLink to="/">Home</BackLink>
      <h1 className="text-2xl font-semibold text-ink">Verify your phone first</h1>
      <p className="text-base text-ink-muted">
        To keep B SOS trustworthy, every request comes from a verified phone number. It only takes a minute.
      </p>
      <Link
        to="/verify-phone"
        state={{ from: '/sos/new' }}
        className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-primary px-5 text-base font-semibold text-white hover:bg-primary-hover focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary"
      >
        Verify my phone
      </Link>
      <p className="text-sm text-ink-muted">If someone's life is in danger, don't wait: call 101 or 100 using the buttons at the top.</p>
    </>
  );
}

function SosFlow() {
  const navigate = useNavigate();
  const geo = useGeolocation(); // starts now, so a fix is usually ready by the time a type is picked
  const [type, setType] = useState(null);
  const [pin, setPin] = useState(null);
  const [manualZoom, setManualZoom] = useState(null); // set once the user drags the pin or taps the map
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [activeSosId, setActiveSosId] = useState(null);
  const alertRef = useRef(null);
  const headingRef = useRef(null);
  const descriptionId = useId();

  const placedByHand = manualZoom !== null;

  // Follow the GPS until the user takes over the pin.
  useEffect(() => {
    if (geo.position && !placedByHand) setPin({ lat: geo.position.lat, lng: geo.position.lng });
  }, [geo.position, placedByHand]);

  useEffect(() => {
    if (formError) alertRef.current?.focus();
  }, [formError]);

  useEffect(() => {
    headingRef.current?.focus();
  }, [type]);

  const onPinChange = (latlng, zoom) => {
    setPin(latlng);
    setManualZoom(zoom);
  };

  const send = async () => {
    if (!pin || submitting) return;
    setFormError('');
    setActiveSosId(null);
    setSubmitting(true);

    const accuracyM = placedByHand ? metresForPixels(pin.lat, manualZoom, MANUAL_PIN_PIXELS) : Math.round(geo.position.accuracy);
    const trimmed = description.trim();

    try {
      const { sos } = await createSos({ type, lat: pin.lat, lng: pin.lng, accuracyM, ...(trimmed && { description: trimmed }) });
      navigate(`/sos/${sos.id}`, { replace: true });
    } catch (err) {
      setSubmitting(false);
      if (err.code === 'ACTIVE_SOS_EXISTS') setActiveSosId(err.details.activeSosId ?? null);
      setFormError(err.message);
    }
  };

  if (!type) {
    return (
      <>
        <BackLink to="/">Home</BackLink>
        <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold text-ink focus:outline-none">
          What's happening?
        </h1>
        <SosTypePicker onSelect={setType} />
      </>
    );
  }

  return (
    <>
      <BackLink onClick={() => setType(null)}>Change type</BackLink>
      <div className="flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
          <SosTypeIcon type={type} />
        </span>
        <div>
          <p className="text-sm text-ink-muted">{SOS_TYPE_DETAILS[type].label}</p>
          <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold text-ink focus:outline-none">
            Where are you?
          </h1>
        </div>
      </div>

      <LocationMap
        pin={pin}
        accuracy={!placedByHand && geo.position ? geo.position.accuracy : null}
        followPin={!placedByHand}
        onPinChange={onPinChange}
        className="h-[45dvh] min-h-64 w-full"
      />
      <LocationStatus geo={geo} placedByHand={placedByHand} hasPin={Boolean(pin)} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor={descriptionId} className="text-sm font-medium text-ink">
          Anything helpers should know? (optional)
        </label>
        <textarea
          id={descriptionId}
          rows={3}
          maxLength={DESCRIPTION_MAX}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="e.g. Grey car on the roadside, front tyre flat"
          className="w-full rounded-xl border border-line-strong bg-surface px-4 py-3 text-base text-ink placeholder:text-ink-muted/70 focus:border-primary focus:outline-3 focus:outline-primary/25"
        />
        <p className="text-end text-sm text-ink-muted">
          {description.length}/{DESCRIPTION_MAX}
        </p>
      </div>

      {formError && (
        <div className="flex flex-col gap-2">
          <FormAlert ref={alertRef}>{formError}</FormAlert>
          {activeSosId && (
            <Link to={`/sos/${activeSosId}`} className="font-semibold text-primary underline underline-offset-4 hover:text-primary-hover">
              Open your active SOS
            </Link>
          )}
        </div>
      )}

      <HoldButton onConfirm={send} disabled={!pin} loading={submitting} hint={pin ? 'Press and hold for 1 second to send' : 'Set your location on the map first'}>
        {submitting ? 'Sending…' : 'Send SOS'}
      </HoldButton>
    </>
  );
}

function LocationStatus({ geo, placedByHand, hasPin }) {
  const { position, error, searching, retry } = geo;

  if (placedByHand) {
    return <StatusNote tone="neutral">Pin placed by you. Drag it or tap the map to adjust.</StatusNote>;
  }

  if (error && !hasPin) {
    const message =
      error === 'denied'
        ? "Location access is off for B SOS. Tap the map where you are, or allow location in your browser's settings and try again."
        : "We couldn't find your location. Tap the map where you are, or try again.";
    return (
      <StatusNote tone="warning" action={<RetryButton onClick={retry} />}>
        {message}
      </StatusNote>
    );
  }

  if (!position) {
    return <StatusNote tone="neutral">{searching ? 'Finding your location…' : 'Tap the map where you are.'}</StatusNote>;
  }

  const metres = Math.round(position.accuracy);
  if (metres > APPROXIMATE_ABOVE_M) {
    return (
      <StatusNote tone="warning">
        Your location is approximate (about {metres} m). Drag the pin or tap the map to show exactly where you are.
      </StatusNote>
    );
  }
  return (
    <StatusNote tone="success">
      Location found, accurate to about {metres} m{searching ? ' (still improving)' : ''}. Drag the pin if it's not quite right.
    </StatusNote>
  );
}

function RetryButton({ onClick }) {
  return (
    <button type="button" onClick={onClick} className="min-h-11 shrink-0 rounded-lg px-3 font-semibold underline underline-offset-4">
      Try again
    </button>
  );
}

const TONES = {
  neutral: { className: 'bg-canvas text-ink-muted border-line', icon: 'M12 21s-6-5.2-6-10a6 6 0 1 1 12 0c0 4.8-6 10-6 10Z M12 13a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z' },
  warning: { className: 'bg-warning-soft text-warning border-warning/30', icon: 'M12 9v4M12 17h.01M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z' },
  success: { className: 'bg-success-soft text-success border-success/30', icon: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M8 12.5l2.5 2.5L16 9.5' },
};

function StatusNote({ tone, action, children }) {
  const { className, icon } = TONES[tone];
  return (
    <div role="status" className={`flex items-start gap-3 rounded-xl border p-3 text-sm ${className}`}>
      <svg className="mt-0.5 size-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={icon} />
      </svg>
      <p className="flex-1">{children}</p>
      {action}
    </div>
  );
}
