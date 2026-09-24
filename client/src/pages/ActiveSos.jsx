import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { STATUSES } from '@shared/constants.js';
import { acceptSos, cancelSos, declineSos, getSos } from '../api/sos.js';
import { useAuth } from '../hooks/useAuth.js';
import { useAlerts } from '../hooks/useAlerts.js';
import { useSocketEvent } from '../hooks/useSocket.js';
import EmergencyBar from '../components/EmergencyBar.jsx';
import { SOS_TYPE_DETAILS, SosTypeIcon } from '../components/SosTypePicker.jsx';
import { formatDistance, formatRating } from '../components/AlertCard.jsx';
import LocationMap from '../components/LocationMap.jsx';
import FormAlert from '../components/FormAlert.jsx';
import Button from '../components/Button.jsx';

const STATUS_TEXT = {
  [STATUSES.OPEN]: { title: 'Your SOS is sent', body: 'Waiting for a nearby helper to accept. Keep your phone with you.' },
  [STATUSES.ACCEPTED]: { title: 'A helper accepted', body: 'Your helper is getting ready to come to you.' },
  [STATUSES.EN_ROUTE]: { title: 'Help is on the way', body: 'Your helper is coming to you.' },
  [STATUSES.ARRIVED]: { title: 'Your helper has arrived', body: 'Your helper is at your location.' },
  [STATUSES.RESOLVED]: { title: 'Resolved', body: 'This SOS is closed. We hope you are okay.' },
  [STATUSES.CANCELLED]: { title: 'Cancelled', body: 'This SOS was cancelled. You can send a new one any time.' },
};

// Mirrors the server: the requester may cancel while OPEN or ACCEPTED.
const REQUESTER_CANCELLABLE = [STATUSES.OPEN, STATUSES.ACCEPTED];
const HELPER_ACTIVE = [STATUSES.ACCEPTED, STATUSES.EN_ROUTE, STATUSES.ARRIVED];

const CANCEL_REASONS = ['Got help another way', 'Sent by mistake', 'No longer needed'];

const BackHome = () => (
  <Link
    to="/"
    className="-ms-2 inline-flex min-h-11 items-center gap-1 self-start rounded-lg px-2 font-semibold text-primary hover:text-primary-hover focus-visible:outline-3 focus-visible:outline-primary"
  >
    <svg className="size-5 rtl:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m15 18-6-6 6-6" />
    </svg>
    Home
  </Link>
);

const PrimaryLink = ({ to, children }) => (
  <Link
    to={to}
    className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-primary px-5 font-semibold text-on-primary shadow-glow-primary hover:bg-primary-hover focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary"
  >
    {children}
  </Link>
);

// Shows one SOS to whoever opens it: the requester, the assigned helper, or an alerted helper.
// Live: `sos:status` and `sos:accepted` (socket) refresh the record so both sides see changes at once.
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

  // Any status change to this SOS: re-read it (the view depends on who we are and what changed).
  const onStatus = useCallback(
    (event) => {
      if (event.sosId === id) load();
    },
    [id, load],
  );
  useSocketEvent('sos:status', onStatus);
  useSocketEvent('sos:accepted', onStatus);

  return (
    <>
      <EmergencyBar />
      <main className="mx-auto flex w-full max-w-md flex-col gap-5 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4">
        <BackHome />

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
  if (sos.requester.id === user.id) return <RequesterView sos={sos} onChange={onChange} />;
  if (sos.helper?.id === user.id) return <AssignedHelperView sos={sos} />;
  return <AlertedHelperView sos={sos} onChange={onChange} />;
}

// ---------- shared bits ----------

function PersonCard({ label, person, trailing }) {
  return (
    <div className="flex items-center gap-3">
      <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-surface-strong text-lg font-semibold text-ink" aria-hidden="true">
        {person.photoUrl ? <img src={person.photoUrl} alt="" className="size-12 rounded-full object-cover" /> : person.name.charAt(0).toUpperCase()}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-ink-muted">{label}</p>
        <p className="flex flex-wrap items-center gap-x-2 text-base font-semibold text-ink">
          <span className="truncate">{person.name}</span>
          {person.verified && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-xs font-medium text-primary">
              <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m5 12.5 4.5 4.5L19 7.5" />
              </svg>
              Verified
            </span>
          )}
        </p>
        <p className="text-sm text-ink-muted">{formatRating(person.ratingAvg)}</p>
      </div>
      {trailing}
    </div>
  );
}

function SentAt({ iso }) {
  return <time dateTime={iso}>{new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time>;
}

function SosMap({ location, note }) {
  if (location?.lat === undefined) return null;
  const approximate = location.precision === 'APPROXIMATE';
  return (
    <div className="flex flex-col gap-2">
      <LocationMap
        pin={{ lat: location.lat, lng: location.lng }}
        accuracy={approximate ? location.radiusM : location.accuracyM ?? null}
        interactive={false}
        className="h-56 w-full"
      />
      {note && <p className="text-sm text-ink-muted">{note}</p>}
    </div>
  );
}

// ---------- alerted helper: decide ----------

function AlertedHelperView({ sos, onChange }) {
  const navigate = useNavigate();
  const { alerts, dismiss } = useAlerts();
  const alert = alerts.find((a) => a.sosId === sos.id);
  const { label, hint } = SOS_TYPE_DETAILS[sos.type];
  const isOpen = sos.status === STATUSES.OPEN;
  const [busy, setBusy] = useState(null); // 'accept' | 'decline'
  const [error, setError] = useState('');
  const [takenBy, setTakenBy] = useState(null);

  const onAccept = async () => {
    setError('');
    setBusy('accept');
    try {
      const { sos: accepted } = await acceptSos(sos.id);
      dismiss(sos.id);
      onChange(accepted); // switches to AssignedHelperView with the exact location
    } catch (err) {
      setBusy(null);
      if (err.code === 'SOS_TAKEN' || err.code === 'SOS_NOT_OPEN') {
        dismiss(sos.id);
        setTakenBy(err.message);
      } else if (err.code === 'HELPER_BUSY' && err.details.activeSosId) {
        navigate(`/sos/${err.details.activeSosId}`);
      } else {
        setError(err.message);
      }
    }
  };

  const onDecline = async () => {
    setError('');
    setBusy('decline');
    try {
      await declineSos(sos.id);
    } catch (err) {
      if (err.code !== 'ALREADY_ANSWERED') {
        setBusy(null);
        setError(err.message);
        return;
      }
    }
    dismiss(sos.id);
    navigate('/alerts', { replace: true });
  };

  return (
    <>
      <section className="flex items-start gap-4 rounded-3xl border border-sos/30 bg-sos/10 p-4 backdrop-blur">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-sos/15 text-sos">
          <SosTypeIcon type={sos.type} />
        </span>
        <div>
          <h1 className="text-xl font-semibold text-ink">{isOpen && !takenBy ? 'Someone nearby needs help' : 'This request is no longer open'}</h1>
          <p className="mt-1 text-base text-ink-muted">
            {label} · {hint}
          </p>
        </div>
      </section>

      <dl className="glass flex flex-col gap-4 rounded-3xl p-4">
        <PersonCard label="Requester" person={sos.requester} />
        <div className="grid grid-cols-2 gap-4">
          <div>
            <dt className="text-sm text-ink-muted">Distance</dt>
            <dd className="text-base font-semibold text-primary">{formatDistance(alert?.distanceM)}</dd>
          </div>
          <div>
            <dt className="text-sm text-ink-muted">Sent</dt>
            <dd className="text-base text-ink">
              <SentAt iso={sos.createdAt} />
            </dd>
          </div>
        </div>
        {sos.description && (
          <div>
            <dt className="text-sm text-ink-muted">Their note</dt>
            <dd className="whitespace-pre-line text-base text-ink">{sos.description}</dd>
          </div>
        )}
      </dl>

      <SosMap location={sos.location} note="Approximate area. The exact location is shared with the helper who accepts." />

      {takenBy ? (
        <>
          <p role="status" className="glass rounded-2xl p-4 text-sm text-ink-muted">
            {takenBy}
          </p>
          <PrimaryLink to="/alerts">Back to alerts</PrimaryLink>
        </>
      ) : (
        isOpen && (
          <div className="flex flex-col gap-3">
            {error && <FormAlert>{error}</FormAlert>}
            <Button onClick={onAccept} loading={busy === 'accept'} disabled={busy === 'decline'} className="min-h-14 text-lg">
              {busy === 'accept' ? 'Accepting…' : 'Accept and help'}
            </Button>
            <Button variant="secondary" onClick={onDecline} loading={busy === 'decline'} disabled={busy === 'accept'}>
              {busy === 'decline' ? 'Declining…' : "I can't help this time"}
            </Button>
            <p className="text-center text-sm text-ink-muted">Accepting shares the exact location with you and tells the requester you're coming.</p>
          </div>
        )
      )}
    </>
  );
}

// ---------- assigned helper: go ----------

function AssignedHelperView({ sos }) {
  const { label } = SOS_TYPE_DETAILS[sos.type];
  const active = HELPER_ACTIVE.includes(sos.status);
  const heading = {
    [STATUSES.ACCEPTED]: "You're helping. Head to the location.",
    [STATUSES.EN_ROUTE]: "You're on the way.",
    [STATUSES.ARRIVED]: "You've arrived.",
    [STATUSES.RESOLVED]: 'Resolved. Thank you for helping.',
    [STATUSES.CANCELLED]: 'This SOS was cancelled.',
  }[sos.status];

  return (
    <>
      <section role="status" className="flex items-start gap-4 rounded-3xl border border-primary/30 bg-primary-soft p-4 backdrop-blur">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl bg-primary/20 text-primary">
          <SosTypeIcon type={sos.type} />
        </span>
        <div>
          <h1 className="text-xl font-semibold text-ink">{heading}</h1>
          <p className="mt-1 text-base text-ink-muted">
            {label}
            {active && ' · The requester can see you accepted.'}
          </p>
        </div>
      </section>

      <dl className="glass flex flex-col gap-4 rounded-3xl p-4">
        <PersonCard label="Requester" person={sos.requester} />
        <div>
          <dt className="text-sm text-ink-muted">Sent</dt>
          <dd className="text-base text-ink">
            <SentAt iso={sos.createdAt} />
          </dd>
        </div>
        {sos.description && (
          <div>
            <dt className="text-sm text-ink-muted">Their note</dt>
            <dd className="whitespace-pre-line text-base text-ink">{sos.description}</dd>
          </div>
        )}
      </dl>

      <SosMap location={sos.location} note={active ? 'Exact location. Only you and the requester can see it while the SOS is active.' : null} />

      {active && (
        <a
          href={`https://www.google.com/maps/dir/?api=1&destination=${sos.location.lat},${sos.location.lng}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex min-h-12 w-full items-center justify-center rounded-2xl bg-primary px-5 font-semibold text-on-primary shadow-glow-primary hover:bg-primary-hover focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-primary"
        >
          Open directions
        </a>
      )}
      {!active && <PrimaryLink to="/">Back to home</PrimaryLink>}
    </>
  );
}

// ---------- requester ----------

function RequesterView({ sos, onChange }) {
  const { title, body } = STATUS_TEXT[sos.status];
  const isOpen = sos.status === STATUSES.OPEN;
  const canCancel = REQUESTER_CANCELLABLE.includes(sos.status);
  const [etaMin, setEtaMin] = useState(null);

  // The accept event carries the ETA, which the REST record doesn't have.
  const onAccepted = useCallback(
    (event) => {
      if (event.sosId === sos.id) setEtaMin(event.etaMin);
    },
    [sos.id],
  );
  useSocketEvent('sos:accepted', onAccepted);

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

      {sos.helper && (
        <div className="glass rounded-3xl p-4">
          <PersonCard
            label="Your helper"
            person={sos.helper}
            trailing={
              etaMin !== null && HELPER_ACTIVE.includes(sos.status) ? (
                <div className="text-end">
                  <p className="text-sm text-ink-muted">About</p>
                  <p className="text-lg font-semibold text-primary">{etaMin} min</p>
                </div>
              ) : null
            }
          />
        </div>
      )}

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
            <SentAt iso={sos.createdAt} />
          </dd>
        </div>
        {sos.description && (
          <div>
            <dt className="text-sm text-ink-muted">Your note</dt>
            <dd className="whitespace-pre-line text-base text-ink">{sos.description}</dd>
          </div>
        )}
      </dl>

      <SosMap location={sos.location} />

      {canCancel && <CancelPanel sosId={sos.id} onCancelled={onChange} />}
      {sos.status === STATUSES.CANCELLED && <PrimaryLink to="/">Back to home</PrimaryLink>}
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
    <section ref={panelRef} tabIndex={-1} aria-labelledby="cancel-heading" className="glass flex flex-col gap-4 rounded-3xl p-4 focus:outline-none">
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
