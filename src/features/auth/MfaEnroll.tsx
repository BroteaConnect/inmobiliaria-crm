import { useCallback, useEffect, useState } from 'react';
import { useI18n } from '../../lib/LocaleContext';
import {
  currentUser,
  enrollTotp,
  listFactors,
  signOutAndAnnounce,
  unenrollFactor,
  verifyTotp,
} from '../../lib/auth';

/**
 * Enrol, check and remove the second factor of the identity that is signed in.
 *
 * The obligation is enforced by the PocketBase bridge; until this existed there
 * was no way to comply with it, so `BROTEA_REQUIRE_MFA_FROM` could only ever
 * lock people out. A policy whose subjects cannot obey it is not a policy.
 *
 * It also carries the sign-out, because the react half of this brick never had
 * one anywhere: `signOut()` existed in the library and no component called it.
 */
export function MfaEnroll() {
  const { t } = useI18n();
  const [state, setState] = useState<'loading' | 'none' | 'enrolling' | 'enrolled'>('loading');
  const [factorId, setFactorId] = useState('');
  const [started, setStarted] = useState<{ secret: string; qr: string } | null>(null);
  const [msg, setMsg] = useState('');

  const refresh = useCallback(async () => {
    try {
      const verified = (await listFactors()).filter((f) => f.status === 'verified');
      setFactorId(verified[0]?.id ?? '');
      setState(verified.length ? 'enrolled' : 'none');
    } catch {
      // Never claim "no factor" when we could not ask: that reads as an
      // invitation to enrol a second one.
      setMsg(t('auth.mfa.error'));
      setState('loading');
    }
  }, [t]);

  useEffect(() => { void refresh(); }, [refresh]);

  const onStart = async () => {
    setMsg('');
    try {
      const f = await enrollTotp(document.title || 'Brotea');
      setFactorId(f.id);
      setStarted({ secret: f.secret, qr: f.qr });
      setState('enrolling');
    } catch {
      setMsg(t('auth.mfa.error'));
    }
  };

  const onConfirm = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get('code') || '');
    setMsg('');
    try {
      // The verify response is an aal2 session and `verifyTotp` stores it.
      // Finishing enrolment while holding the old aal1 token would leave this
      // browser signed in to an identity the bridge now refuses.
      await verifyTotp(factorId, code);
      setStarted(null);
      await refresh();
    } catch {
      setMsg(t('auth.mfa.error'));
    }
  };

  const onRemove = async () => {
    setMsg('');
    try {
      await unenrollFactor(factorId);
      setMsg(t('auth.mfa.removed'));
      await refresh();
    } catch {
      setMsg(t('auth.mfa.error'));
    }
  };

  return (
    <section className="brotea-security">
      <h2>{t('auth.security.title')}</h2>
      <p>{t('auth.security.lead')}</p>
      <p>
        {currentUser()?.email}{' '}
        <button type="button" onClick={() => signOutAndAnnounce()}>{t('auth.signout')}</button>
      </p>

      {state === 'loading' && <p>{t('auth.working')}</p>}

      {state === 'none' && (
        <>
          <p>{t('auth.mfa.none')}</p>
          <button type="button" onClick={onStart}>{t('auth.mfa.enroll')}</button>
        </>
      )}

      {state === 'enrolling' && started && (
        <>
          <p>{t('auth.mfa.scan')}</p>
          <img src={started.qr} alt={t('auth.mfa.qr.alt')} width={180} height={180} />
          <p>{t('auth.mfa.secret')} <code>{started.secret}</code></p>
          <form onSubmit={onConfirm}>
            <label>
              {t('auth.mfa.code')}
              <input
                type="text" name="code" required autoFocus
                inputMode="numeric" autoComplete="one-time-code"
                pattern="[0-9]*" maxLength={8}
              />
            </label>
            <button type="submit">{t('auth.mfa.submit')}</button>
          </form>
        </>
      )}

      {state === 'enrolled' && (
        <>
          <p>{t('auth.mfa.enrolled')}</p>
          <button type="button" onClick={onRemove}>{t('auth.mfa.remove')}</button>
        </>
      )}

      {msg && <p role="alert">{msg}</p>}
    </section>
  );
}
