import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { STATUSES } from '@shared/constants.js';
import { getSos } from '../api/sos.js';
import EmergencyBar from '../components/EmergencyBar.jsx';
import { SOS_TYPE_DETAILS, SosTypeIcon } from '../components/SosTypePicker.jsx';
import LocationMap from '../components/LocationMap.jsx';
import FormAlert from '../components/FormAlert.jsx';
import Button from '../components/Button.jsx';

const STATUS_TEXT = {
  [STATUSES.OPEN]: { title: 'Your SOS is sent', body: 'Waiting for a nearby helper to accept. Keep your phone with you.' },
  [STATUSES.ACCEPTED]: { title: 'A helper accepted', body: 'A helper has accepted your SOS.' },
  [STATUSES.EN_ROUTE]: { title: 'Help is on the way', body: 'Your helper is coming to you.' },
  [STATUSES.ARRIVED]: { title: 'Your helper has arrived', body: 'Your helper is at your location.' },
  [STATUSES.RESOLVED]: { title: 'Resolved', body: 'This SOS is closed. We hope you are okay.' },
  [STATUSES.CANCELLED]: { title: 'Cancelled', body: 'This SOS was cancelled.' },
};

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
        {sos && <SosDetails sos={sos} />}
      </main>
    </>
  );
}

function SosDetails({ sos }) {
  const { title, body } = STATUS_TEXT[sos.status];
  const isOpen = sos.status === STATUSES.OPEN;
  const { location } = sos;

  return (
    <>
      <section role="status" className="flex items-start gap-4 rounded-2xl border border-primary/30 bg-primary-soft p-4">
        <span className="relative mt-1 flex size-4 shrink-0" aria-hidden="true">
          {isOpen && <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-40 [animation-duration:2s] motion-reduce:hidden" />}
          <span className="relative inline-flex size-4 rounded-full bg-primary" />
        </span>
        <div>
          <h1 className="text-xl font-semibold text-ink">{title}</h1>
          <p className="mt-1 text-base text-ink-muted">{body}</p>
        </div>
      </section>

      <dl className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-4">
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
    </>
  );
}
