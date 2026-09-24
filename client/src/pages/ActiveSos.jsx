import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { STATUSES } from '@shared/constants.js';
import { cancelSos, getSos } from '../api/sos.js';
import { useAuth } from '../hooks/useAuth.js';
import { useAlerts } from '../hooks/useAlerts.js';
import EmergencyBar from '../components/EmergencyBar.jsx';
import { SOS_TYPE_DETAILS, SosTypeIcon } from '../components/SosTypePicker.jsx';
import { formatDistance, formatRating } from '../components/AlertCard.jsx';
import LocationMap from '../components/LocationMap.jsx';
import FormAlert from '../components/FormAlert.jsx';
import Button from '../components/Button.jsx';

const STATUS_TEXT = {
  [STATUSES.OPEN]: { title: 'Your SOS is sent', body: 'Waiting for a nearby helper to accept. Keep your phone with you.' },
  [STATUSES.ACCEPTED]: { title: 'A helper accepted', body: 'A helper has accepted your SOS.' },
  [STATUSES.EN_ROUTE]: { title: 'Help is on the way', body: 'Your helper is coming to you.' },
  [STATUSES.ARRIVED]: { title: 'Your helper has arrived', body: 'Your helper is at your location.' },
  [STATUSES.RESOLVED]: { title: 'Resolved', body: 'This SOS is closed. We hope you are okay.' },
  [STATUSES.CANCELLED]: { title: 'Cancelled', body: 'This SOS was cancelled. You can send a new one any time.' },
};

// Mirrors the server: the requester may cancel while OPEN or ACCEPTED.
const REQUESTER_CANCELLABLE = [STATUSES.OPEN, STATUSES.ACCEPTED];

const CANCEL_REASONS = ['Got help another way', 'Sent by mistake', 'No longer needed'];

// Shows one SOS. Live updates (helper accepted, helper position) arrive with the real-time step.
export default function ActiveSos() {
  const { id } = useParams();
  const [sos, setSos] = useState(null);
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    setLoadError('');
    try {
      setSos((await getSos(id)).sos);
    } catch (err) {
      setLoadError(err.message);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <EmergencyBar />
      <main className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4">
        <Link
          to="/"
          className="-ms-2 inline-flex min-h-11 items-center gap-1 self-start rounded-lg px-2 font-semibold text-primary hover:text-primary-hover focus-visible:outline-3 focus-visible:outline-primary"
        >
          <svg className="size-5 rtl:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
          Home
        </Link>

        {loadError && (
          <>
            <FormAlert>{loadError}</FormAlert>
            <Button variant="secondary" onClick={load}>
              Try again
            </Button>
          </>
        )}
        {!sos && !loadError && <p role="status" className="text-ink-muted">Loading your SOS…</p>}
        {sos && <SosDetails sos={sos} onChange={setSos} />}
      </main>
    </>
  );
}

function SosDetails({ sos, onChange }) {
  const { user } = useAuth();
  const isRequester = sos.requester.id === user.id;
  return isRequester ? <RequesterView sos={sos} onChange={onChange} /> : <HelperView sos={sos} />;
}

// What a helper who was alerted sees: who needs what, roughly where, and how far. The exact point is
// only revealed after accepting (CLAUDE.md §4 privacy), which arrives with the accept step.
function HelperView({ sos }) {
  const { alerts } = useAlerts();
  const alert = alerts.find((a) => a.sosId === sos.id);
  const { label, hint } = SOS_TYPE_DETAILS[sos.type];
  const isOpen = sos.status === STATUSES.OPEN;
  const { location, requester } = sos;

  return (
    <>
      <section className="flex items-start gap-4 rounded-3xl border border-sos/30 bg-sos/10 p-4 backdrop-blur">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-sos/15 text-sos">
          <SosTypeIcon type={sos.type} />
        </span>
        <div>
          <h1 className="text-xl font-semibold text-ink">{isOpen ? 'Someone nearby needs help' : 'This request is no longer open'}</h1>
          <p className="mt-1 text-base text-ink-muted">
            {label} · {hint}
          </p>
        </div>
      </section>

      <dl className="glass flex flex-col gap-4 rounded-3xl p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <dt className="text-sm text-ink-muted">Requester</dt>
            <dd className="text-base font-semibold text-ink">{requester.name}</dd>
          </div>
          <dd className="text-sm text-ink-muted">{formatRating(requester.ratingAvg)}</dd>
        </div>
        <div>
          <dt className="text-sm text-ink-muted">Distance</dt>
          <dd className="text-base font-semibold text-primary">{formatDistance(alert?.distanceM)}</dd>
        </div>
        <div>
          <dt className="text-sm text-ink-muted">Sent</dt>
          <dd className="text-base text-ink">
            <time dateTime={sos.createdAt}>{new Date(sos.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
          </dd>
        </div>
        {sos.description && (
          <div>
            <dt className="text-sm text-ink-muted">Their note</dt>
            <dd className="whitespace-pre-line text-base text-ink">{sos.description}</dd>
          </div>
        )}
      </dl>

      {location?.lat !== undefined && (
        <div className="flex flex-col gap-2">
          <LocationMap
            pin={{ lat: location.lat, lng: location.lng }}
            accuracy={location.precision === 'APPROXIMATE' ? location.radiusM : location.accuracyM ?? null}
            interactive={false}
            className="h-56 w-full"
          />
          {location.precision === 'APPROXIMATE' && (
            <p className="text-sm text-ink-muted">Approximate area. The exact location is shared with the helper who accepts.</p>
          )}
        </div>
      )}
    </>
  );
}

function RequesterView({ sos, onChange }) {
  const { title, body } = STATUS_TEXT[sos.status];
  const isOpen = sos.status === STATUSES.OPEN;
  const { location } = sos;
  const canCancel = REQUESTER_CANCELLABLE.includes(sos.status);

  return (
    <>
      <section role="status" className="flex items-start gap-4 rounded-3xl border border-primary/30 bg-primary-soft p-4 backdrop-blur">
        <span className="relative mt-1 flex size-4 shrink-0" aria-hidden="true">
          {isOpen && <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-40 [animation-duration:2s] motion-reduce:hidden" />}
          <span className="relative inline-flex size-4 rounded-full bg-primary" />
        </span>
        <div>
          <h1 className="text-xl font-semibold text-ink">{title}</h1>
          <p className="mt-1 text-base text-ink-muted">{body}</p>
        </div>
      </section>

      <dl className="glass flex flex-col gap-4 rounded-3xl p-4">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <SosTypeIcon type={sos.type} className="size-6" />
          </span>
          <div>
            <dt className="text-sm text-ink-muted">Type</dt>
            <dd className="text-base font-semibold text-ink">{SOS_TYPE_DETAILS[sos.type].label}</dd>
          </div>
        </div>
        <div>
          <dt className="text-sm text-ink-muted">Sent</dt>
          <dd className="text-base text-ink">
            <time dateTime={sos.createdAt}>{new Date(sos.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>
          </dd>
        </div>
        {sos.description && (
          <div>
            <dt className="text-sm text-ink-muted">Your note</dt>
            <dd className="whitespace-pre-line text-base text-ink">{sos.description}</dd>
          </div>
        )}
      </dl>

      {location?.lat !== undefined && (
        <LocationMap
          pin={{ lat: location.lat, lng: location.lng }}
          accuracy={location.accuracyM ?? null}
          interactive={false}
          className="h-56 w-full"
        />
      )}

      {canCancel && <CancelPanel sosId={sos.id} onCancelled={(cancelled) => onChange(cancelled)} />}

      {sos.status === STATUSES.CANCELLED && (
        <Link
          to="/"
          className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-primary px-5 font-semibold text-on-primary shadow-glow-primary hover:bg-primary-hover focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          Back to home
        </Link>
      )}
    </>
  );
}

// Two-step cancel: a quiet link first, then a panel with quick reasons and a clear confirm button.
// Cancel is deliberately not red: red means SOS in this app.
function CancelPanel({ sosId, onCancelled }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const panelRef = useRef(null);

  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  const confirm = async () => {
    setError('');
    setSubmitting(true);
    try {
      const { sos } = await cancelSos(sosId, reason || undefined);
      onCancelled(sos);
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="min-h-11 self-center text-sm font-medium text-ink-muted underline-offset-4 hover:text-ink hover:underline focus-visible:outline-3 focus-visible:outline-primary"
      >
        I don't need help anymore
      </button>
    );
  }

  return (
    <section
      ref={panelRef}
      tabIndex={-1}
      aria-labelledby="cancel-heading"
      className="glass flex flex-col gap-4 rounded-3xl p-4 focus:outline-none"
    >
      <div>
        <h2 id="cancel-heading" className="text-lg font-medium text-ink">
          Cancel this SOS?
        </h2>
        <p className="mt-1 text-sm text-ink-muted">Helpers will stop being alerted. Tell us why, if you like.</p>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Reason">
        {CANCEL_REASONS.map((option) => {
          const selected = reason === option;
          return (
            <button
              key={option}
              type="button"
              aria-pressed={selected}
              onClick={() => setReason(selected ? '' : option)}
              className={`min-h-11 rounded-full border px-4 text-sm font-medium transition-colors focus-visible:outline-3 focus-visible:outline-primary ${
                selected ? 'border-primary bg-primary-soft text-primary' : 'border-line-strong text-ink hover:bg-surface-strong'
              }`}
            >
              {option}
            </button>
          );
        })}
      </div>

      {error && <FormAlert>{error}</FormAlert>}

      <div className="flex flex-col gap-2">
        <Button onClick={confirm} loading={submitting}>
          {submitting ? 'Cancelling…' : 'Yes, cancel my SOS'}
        </Button>
        <Button variant="secondary" onClick={() => setOpen(false)} disabled={submitting}>
          Keep it open
        </Button>
      </div>
    </section>
  );
}
