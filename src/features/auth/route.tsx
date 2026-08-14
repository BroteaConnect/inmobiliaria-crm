import { useEffect, useState } from 'react';
import type { Feature } from '../registry';
import { useI18n } from '../../lib/LocaleContext';
import { completeCallback, AuthError } from '../../lib/auth';

/**
 * `/auth/callback` — where Supabase returns after a magic link or a provider
 * sign-in. Registered like any other feature route, and deliberately NOT
 * wrapped in <AuthGate>: it is the page that produces the session.
 */
function AuthCallback() {
  const { t } = useI18n();
  const [error, setError] = useState('');

  useEffect(() => {
    (async () => {
      try {
        await completeCallback();
        window.location.replace('/');
      } catch (err) {
        setError(err instanceof AuthError && err.status === 403 ? t('auth.denied') : t('auth.error'));
      }
    })();
  }, [t]);

  return <p role={error ? 'alert' : undefined}>{error || t('auth.callback.working')}</p>;
}

export const auth: Feature = {
  path: '/auth/callback',
  labelKey: 'auth.title',
  element: <AuthCallback />,
  hidden: true, // a route, not a place anyone navigates to
};
