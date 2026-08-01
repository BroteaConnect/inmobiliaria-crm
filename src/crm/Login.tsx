import { useState } from 'react';
import { login } from '../lib/pb';
import { useI18n } from '../lib/LocaleContext';
import LanguageSwitcher from '../components/LanguageSwitcher';

export default function Login({ onOk }: { onOk: () => void }) {
  const [error, setError] = useState('');
  // El selector va también aquí: quien no habla español tiene que poder
  // cambiar de idioma ANTES de entrar.
  const { locale, setLocale, locales, t } = useI18n();

  const entrar = async (e: React.FormEvent<HTMLFormElement>) => {
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

  return (
    <div className="login">
      <form onSubmit={entrar}>
        <h1>{t('app.brand')}</h1>
        <label>{t('login.email')} <input name="email" type="email" required autoComplete="username" /></label>
        <label>{t('login.password')} <input name="password" type="password" required autoComplete="current-password" /></label>
        <button className="primario" type="submit">{t('login.submit')}</button>
        <p role="alert" className="error">{error}</p>
        <LanguageSwitcher locale={locale} locales={locales} onChange={setLocale} label={t('nav.language')} />
      </form>
    </div>
  );
}
