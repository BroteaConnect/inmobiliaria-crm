import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { isLoggedIn, logout } from './lib/pb';
import { LocaleProvider, useI18n } from './lib/LocaleContext';
import LanguageSwitcher from './components/LanguageSwitcher';
import { features } from './features/registry';
import Login from './crm/Login';
import { completeCallback, AuthError } from './lib/auth';
import Kanban from './crm/Kanban';
import Propiedades from './crm/Propiedades';
import Importar from './crm/Importar';

function Nav({ onLogout }: { onLogout: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  const { locale, setLocale, locales, t } = useI18n();

  useEffect(() => { setMenuOpen(false); }, [pathname]);

  const cerrar = () => setMenuOpen(false);

  return (
    <nav className="topnav">
      <strong className="marca">{t('app.brand')}</strong>
      <button
        type="button"
        className="menu-btn"
        aria-label={t('nav.menu')}
        aria-expanded={menuOpen}
        aria-controls="nav-links"
        onClick={() => setMenuOpen((o) => !o)}
      >
        <span /><span /><span />
      </button>
      <div id="nav-links" className={`links${menuOpen ? ' abierto' : ''}`}>
        <NavLink to="/" end onClick={cerrar}>{t('nav.leads')}</NavLink>
        <NavLink to="/propiedades" onClick={cerrar}>{t('nav.propiedades')}</NavLink>
        <NavLink to="/importar" onClick={cerrar}>{t('nav.importar')}</NavLink>
        {features.filter((f) => !f.hidden).map((f) => (
          <NavLink key={f.path} to={f.path} onClick={cerrar}>{t(f.labelKey)}</NavLink>
        ))}
        <a className="externo" href="https://inmobiliaria.brotea.dev" target="_blank"
          rel="noreferrer" onClick={cerrar}>{t('nav.web')}</a>
        <LanguageSwitcher locale={locale} locales={locales} onChange={setLocale} label={t('nav.language')} />
        <button type="button" className="salir" onClick={onLogout}>{t('nav.salir')}</button>
      </div>
    </nav>
  );
}

/**
 * La vuelta del proveedor de identidad aterriza en /auth/callback, y en esta
 * app el router SOLO existe después de entrar — así que sin esto el usuario
 * volvería de Google a la pantalla de acceso, con el código en la URL y sin
 * nadie que lo canjee. Se resuelve antes de cualquier otra decisión.
 */
function Callback() {
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
  return <div className="login"><p role={error ? 'alert' : undefined}>{error || t('auth.callback.working')}</p></div>;
}

function Shell() {
  const [logged, setLogged] = useState(isLoggedIn());

  if (window.location.pathname.replace(/\/$/, '').endsWith('/auth/callback')) return <Callback />;
  if (!logged) return <Login onOk={() => setLogged(true)} />;

  return (
    <BrowserRouter>
      <Nav onLogout={() => { logout(); setLogged(false); }} />
      <main className="contenido">
        <Routes>
          <Route path="/" element={<Kanban />} />
          <Route path="/propiedades" element={<Propiedades />} />
          <Route path="/importar" element={<Importar />} />
          {features.map((f) => (
            <Route key={f.path} path={f.path} element={f.element} />
          ))}
        </Routes>
      </main>
    </BrowserRouter>
  );
}

// Un solo idioma para toda la SPA; cualquier componente lo lee con useI18n().
export default function App() {
  return (
    <LocaleProvider>
      <Shell />
    </LocaleProvider>
  );
}
