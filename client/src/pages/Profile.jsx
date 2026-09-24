import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { getMe, updateHelperProfile, updateMe } from '../api/me.js';
import { useAuth } from '../hooks/useAuth.js';
import TextField from '../components/TextField.jsx';
import Button from '../components/Button.jsx';
import FormAlert from '../components/FormAlert.jsx';
import Switch from '../components/Switch.jsx';
import SkillPicker from '../components/SkillPicker.jsx';

export default function Profile() {
  const [data, setData] = useState(null); // { user, helperProfile }
  const [loadError, setLoadError] = useState('');

  const load = useCallback(async () => {
    setLoadError('');
    try {
      setData(await getMe());
    } catch (err) {
      setLoadError(err.message);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-6 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <header className="flex flex-col gap-3">
        <Link
          to="/"
          className="-ms-2 inline-flex min-h-11 items-center gap-1 self-start rounded-lg px-2 font-semibold text-primary hover:text-primary-hover focus-visible:outline-3 focus-visible:outline-primary"
        >
          <svg className="size-5 rtl:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
          Home
        </Link>
        <h1 className="text-[1.75rem] font-medium text-ink">Your profile</h1>
      </header>

      {loadError && (
        <div className="flex flex-col gap-3">
          <FormAlert>{loadError}</FormAlert>
          <Button variant="secondary" onClick={load}>
            Try again
          </Button>
        </div>
      )}

      {!data && !loadError && <p role="status" className="text-ink-muted">Loading your profile…</p>}

      {data && (
        <>
          <DetailsSection user={data.user} />
          <HelperSection helperProfile={data.helperProfile} />
        </>
      )}
    </main>
  );
}

function Section({ title, description, children }) {
  const headingId = `${title.replace(/\s+/g, '-').toLowerCase()}-heading`;
  return (
    <section aria-labelledby={headingId} className="glass rounded-3xl p-4 sm:p-6">
      <h2 id={headingId} className="text-lg font-semibold text-ink">
        {title}
      </h2>
      {description && <p className="mt-1 text-sm text-ink-muted">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function SavedNote({ children }) {
  return (
    <p role="status" className="flex items-center gap-2 text-sm font-medium text-success">
      <svg className="size-5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="m8 12.5 2.5 2.5L16 9.5" />
      </svg>
      {children}
    </p>
  );
}

// ---------- Your details ----------

function DetailsSection({ user }) {
  const { updateUser } = useAuth();
  const [name, setName] = useState(user.name);
  const [savedName, setSavedName] = useState(user.name);
  const [nameError, setNameError] = useState('');
  const [formError, setFormError] = useState('');
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const nameRef = useRef(null);

  const unchanged = name.trim() === savedName;

  const onSubmit = async (event) => {
    event.preventDefault();
    setFormError('');
    setSaved(false);

    const trimmed = name.trim();
    if (trimmed.length < 2 || trimmed.length > 80) {
      setNameError('Your name should be 2 to 80 characters.');
      nameRef.current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const { user: updated } = await updateMe({ name: trimmed });
      updateUser(updated);
      setName(updated.name);
      setSavedName(updated.name);
      setSaved(true);
    } catch (err) {
      if (err.fieldErrors.name) setNameError(err.fieldErrors.name);
      else setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Section title="Your details">
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5">
        {formError && <FormAlert>{formError}</FormAlert>}

        <TextField
          ref={nameRef}
          label="Name"
          name="name"
          autoComplete="name"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setNameError('');
            setSaved(false);
          }}
          error={nameError}
        />

        <dl className="flex flex-col gap-4">
          <div>
            <dt className="text-sm font-medium text-ink">Email</dt>
            <dd className="mt-0.5 break-all text-base text-ink-muted">{user.email}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-ink">Phone</dt>
            <dd className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-base">
              {user.phone ? (
                <span dir="ltr" className="text-ink-muted">
                  {user.phone}
                </span>
              ) : (
                <span className="text-ink-muted">Not added</span>
              )}
              {user.phoneVerified ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-success-soft px-2.5 py-0.5 text-sm font-medium text-success">
                  <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m5 12.5 4.5 4.5L19 7.5" />
                  </svg>
                  Verified
                </span>
              ) : (
                <Link to="/verify-phone" state={{ from: '/profile' }} className="font-semibold text-primary underline underline-offset-4 hover:text-primary-hover">
                  Verify phone
                </Link>
              )}
            </dd>
          </div>
        </dl>

        <Button type="submit" loading={submitting} disabled={unchanged}>
          {submitting ? 'Saving…' : 'Save details'}
        </Button>
        {saved && <SavedNote>Your details are saved.</SavedNote>}
      </form>
    </Section>
  );
}

// ---------- Helping others ----------

function HelperSection({ helperProfile }) {
  const initial = { skills: helperProfile?.skills ?? [], isAvailable: helperProfile?.isAvailable ?? false };
  const [skills, setSkills] = useState(initial.skills);
  const [isAvailable, setIsAvailable] = useState(initial.isAvailable);
  const [savedState, setSavedState] = useState(initial);
  const [skillsError, setSkillsError] = useState('');
  const [formError, setFormError] = useState('');
  const [saved, setSaved] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const unchanged =
    isAvailable === savedState.isAvailable &&
    skills.length === savedState.skills.length &&
    skills.every((skill) => savedState.skills.includes(skill));

  const clearFeedback = () => {
    setSkillsError('');
    setFormError('');
    setSaved(false);
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    clearFeedback();

    if (isAvailable && skills.length === 0) {
      setSkillsError('Choose at least one skill so we know which requests to send you.');
      return;
    }

    setSubmitting(true);
    try {
      const { helperProfile: updated } = await updateHelperProfile({ skills, isAvailable });
      setSkills(updated.skills);
      setIsAvailable(updated.isAvailable);
      setSavedState({ skills: updated.skills, isAvailable: updated.isAvailable });
      setSaved(true);
    } catch (err) {
      if (err.code === 'SKILLS_REQUIRED') setSkillsError(err.message);
      else setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Section
      title="Helping others"
      description="When you're available, people nearby who need help with one of your skills can send you an alert."
    >
      <form noValidate onSubmit={onSubmit} className="flex flex-col gap-5">
        {formError && <FormAlert>{formError}</FormAlert>}

        <Switch
          label="I'm available to help"
          description={isAvailable ? 'You can get alerts for SOS requests near you.' : "You won't get any SOS alerts."}
          checked={isAvailable}
          onChange={(next) => {
            setIsAvailable(next);
            clearFeedback();
          }}
        />

        <SkillPicker
          legend="What can you help with?"
          value={skills}
          onChange={(next) => {
            setSkills(next);
            clearFeedback();
          }}
          error={skillsError}
        />

        <Button type="submit" loading={submitting} disabled={unchanged}>
          {submitting ? 'Saving…' : 'Save helper settings'}
        </Button>
        {saved && <SavedNote>{isAvailable ? "Saved. You're available to help." : 'Saved.'}</SavedNote>}
      </form>
    </Section>
  );
}
