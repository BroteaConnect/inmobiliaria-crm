import { useEffect, useState, type ReactNode } from 'react';
import { useI18n } from '../../lib/LocaleContext';
import {
  AuthError,
  completeMfa,
  isConfigured,
  MfaRequiredError,
  restore,
  sendMagicLink,
  signInWithPassword,
  signInWithProvider,
  type BroteaUser,
} from '../../lib/auth';

/**
 * Wrap whatever must not be seen by strangers:
 *
 *   <AuthGate><Crm /></AuthGate>
 *   <AuthGate role="admin"><Settings /></AuthGate>
 *
 * `role` is a UI convenience, never the protection: what actually stops a
 * request is the PocketBase rule on the collection. A gate that only hides
 * buttons is theatre, and the API is the thing being protected.
 */
export function AuthGate({ children, role }: { children: ReactNode; role?: BroteaUser['role'] }) {
  const { t } = useI18n();
  const [user, setUser] = useState<BroteaUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  // The factor waiting for a code. Without this step, the first person in this
  // app to enrol a second factor is the first person locked out of it: the
  // bridge refuses an `aal1` session from an identity that has one, and the
  // identity is fleet-wide — enrolling from any other app is enough.
  const [factorId, setFactorId] = useState('');

  useEffect(() => {
    (async () => {
      if (isConfigured()) setUser(await restore());
      setChecking(false);
    })();
  }, []);

  const explain = (err: unknown) => {
    if (err instanceof AuthError && err.status === 403) return t('auth.denied');
    if (err instanceof AuthError && err.status === 503) return t('auth.offline');
    return t('auth.error');
  };

  if (checking) return <p>{t('auth.working')}</p>;
  if (user && (!role || user.role === role)) return <>{children}</>;
  if (user) return <p role="alert">{t('auth.denied')}</p>;

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    setMsg('');
    setBusy(true);
    try {
      setUser(await signInWithPassword(String(data.get('email')), String(data.get('password'))));
    } catch (err) {
      // The password was right. Anything that reads like a credential error
      // here sends somebody to reset a password that was fine.
      if (err instanceof MfaRequiredError) setFactorId(err.factorId);
      else setMsg(explain(err));
    } finally {
      setBusy(false);
    }
  };

  const onCode = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get('code') || '');
    setMsg('');
    setBusy(true);
    try {
      setUser(await completeMfa(factorId, code));
    } catch {
      // A wrong code is not a wrong password: stay on this step.
      setMsg(t('auth.mfa.error'));
    } finally {
      setBusy(false);
    }
  };

  const onMagicLink = async (e: React.MouseEvent<HTMLButtonElement>) => {
    const form = e.currentTarget.form;
    const email = form ? String(new FormData(form).get('email')) : '';
    if (!email) return;
    setMsg('');
    try {
      await sendMagicLink(email);
      setMsg(t('auth.magic.sent'));
    } catch (err) {
      setMsg(explain(err));
    }
  };

  if (factorId) {
    return (
      <section className="brotea-auth">
        <h2>{t('auth.mfa.title')}</h2>
        <p>{t('auth.mfa.hint')}</p>
        <form onSubmit={onCode}>
          <label>
            {t('auth.mfa.code')}
            <input
              type="text" name="code" required autoFocus
              inputMode="numeric" autoComplete="one-time-code"
              pattern="[0-9]*" maxLength={8}
            />
          </label>
          <button type="submit" disabled={busy}>{t('auth.mfa.submit')}</button>
          {msg && <p role="alert">{msg}</p>}
        </form>
      </section>
    );
  }

  return (
    <section className="brotea-auth">
      <h2>{t('auth.title')}</h2>
      <p>{t('auth.signin')}</p>
      <button type="button" onClick={() => { signInWithProvider('google').catch(() => setMsg(t('auth.error'))); }}>
        {t('auth.google')}
      </button>
      <p>{t('auth.or')}</p>
      <form onSubmit={onSubmit}>
        <label>
          {t('auth.email')}
          <input type="email" name="email" required autoComplete="username" />
        </label>
        <label>
          {t('auth.password')}
          <input type="password" name="password" autoComplete="current-password" />
        </label>
        <button type="submit" disabled={busy}>{t('auth.signin.submit')}</button>
        <button type="button" onClick={onMagicLink}>{t('auth.magic.submit')}</button>
        {msg && <p role="alert">{msg}</p>}
      </form>
    </section>
  );
}
