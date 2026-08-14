import { useEffect, useState } from 'react';
import { login } from '../lib/pb';
import { AuthError, isConfigured, restore, sendMagicLink, signInWithProvider } from '../lib/auth';
import { useI18n } from '../lib/LocaleContext';
import LanguageSwitcher from '../components/LanguageSwitcher';

/**
 * Entrada del CRM. Desde la migración a SSO hay dos caminos y no son
 * intercambiables:
 *
 *  - El normal: la cuenta de Brotea (Google o enlace por correo). El rol vive
 *    arriba, así que quitarle el acceso a alguien se nota aquí en la siguiente
 *    carga de página.
 *  - El de emergencia: correo y contraseña CONTRA POCKETBASE, sin pasar por el
 *    proveedor de identidad. Es la única puerta que sigue abierta si el
 *    proveedor se cae, y por eso solo aparece cuando hace falta.
 */
export default function Login({ onOk }: { onOk: () => void }) {
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [emergencia, setEmergencia] = useState(false);
  const [ocupado, setOcupado] = useState(true);
  // El selector va también aquí: quien no habla español tiene que poder
  // cambiar de idioma ANTES de entrar.
  const { locale, setLocale, locales, t } = useI18n();

  // Una sesión de Brotea viva entra sola: nadie debería teclear nada para
  // volver a un CRM que ya tenía abierto hace diez minutos.
  useEffect(() => {
    (async () => {
      if (isConfigured() && (await restore())) onOk();
      else setOcupado(false);
    })();
  }, [onOk]);

  const explicar = (err: unknown) => {
    if (err instanceof AuthError && err.status === 403) return t('auth.denied');
    if (err instanceof AuthError && err.status === 503) {
      setEmergencia(true); // el proveedor no responde: aquí sí toca enseñarla
      return t('auth.offline');
    }
    return t('auth.error');
  };

  const conGoogle = () => {
    signInWithProvider('google').catch((err) => setError(explicar(err)));
  };

  const conEnlace = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(''); setAviso('');
    try {
      await sendMagicLink(String(new FormData(e.currentTarget).get('email')));
      setAviso(t('auth.magic.sent'));
    } catch (err) { setError(explicar(err)); }
  };

  const deEmergencia = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError('');
    try {
      await login(String(fd.get('email')), String(fd.get('password')));
      onOk();
    } catch {
      setError(t('login.error'));
    }
  };

  if (ocupado) return <div className="login"><p>{t('auth.working')}</p></div>;

  return (
    <div className="login">
      <form onSubmit={conEnlace}>
        <h1>{t('app.brand')}</h1>
        <p>{t('auth.signin')}</p>
        <button className="primario" type="button" onClick={conGoogle}>{t('auth.google')}</button>
        <p className="separador">{t('auth.or')}</p>
        <label>{t('login.email')} <input name="email" type="email" required autoComplete="username" /></label>
        <button className="primario" type="submit">{t('auth.magic.submit')}</button>
        {aviso && <p role="status" className="aviso">{aviso}</p>}
        <p role="alert" className="error">{error}</p>
        {!emergencia && (
          <button type="button" className="enlace" onClick={() => setEmergencia(true)}>
            {t('auth.breakglass')}
          </button>
        )}
        <LanguageSwitcher locale={locale} locales={locales} onChange={setLocale} label={t('nav.language')} />
      </form>

      {emergencia && (
        <form onSubmit={deEmergencia} className="emergencia">
          <h2>{t('auth.breakglass')}</h2>
          <p>{t('auth.breakglass.hint')}</p>
          <label>{t('login.email')} <input name="email" type="email" required autoComplete="username" /></label>
          <label>{t('login.password')} <input name="password" type="password" required autoComplete="one-time-code" /></label>
          <button className="primario" type="submit">{t('login.submit')}</button>
        </form>
      )}
    </div>
  );
}
