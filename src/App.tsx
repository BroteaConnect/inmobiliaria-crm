import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { isLoggedIn, logout } from './lib/pb';
import { LocaleProvider, useI18n } from './lib/LocaleContext';
import { SettingsProvider, useSettings } from './lib/SettingsContext';
import { moduleEnabled } from './lib/settings';
import LanguageSwitcher from './components/LanguageSwitcher';
import { features } from './features/registry';
import { TabBar } from './components/kit';
import Login from './crm/Login';
import { completeCallback, AuthError } from './lib/auth';
import Kanban from './crm/Kanban';
import Propiedades from './crm/Propiedades';
import Importar from './crm/Importar';
import Ajustes from './crm/Ajustes';
import Today from './features/today/Today';
import Informes from './features/informes/Informes';

function Nav({ onLogout }: { onLogout: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  const { locale, setLocale, locales, t } = useI18n();
  const { settings } = useSettings();

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
      <TabBar
        moreOpen={menuOpen}
        more={() => setMenuOpen((o) => !o)}
        moreLabel={t('nav.mas')}
        items={[
          moduleEnabled(settings, 'modules.today') && { to: '/hoy', label: t('nav.hoy'), icon: '◔' },
          moduleEnabled(settings, 'modules.leads') && { to: '/', label: t('nav.leads'), icon: '☰', end: true },
          moduleEnabled(settings, 'modules.properties') && { to: '/propiedades', label: t('nav.propiedades'), icon: '⌂' },
        ].filter(Boolean) as { to: string; label: string; icon: string; end?: boolean }[]}
      />
      <div id="nav-links" className={`links${menuOpen ? ' abierto' : ''}`}>
        {moduleEnabled(settings, 'modules.today')
          && <NavLink to="/hoy" onClick={cerrar}>{t('nav.hoy')}</NavLink>}
        {moduleEnabled(settings, 'modules.leads')
          && <NavLink to="/" end onClick={cerrar}>{t('nav.leads')}</NavLink>}
        {moduleEnabled(settings, 'modules.properties')
          && <NavLink to="/propiedades" onClick={cerrar}>{t('nav.propiedades')}</NavLink>}
        {moduleEnabled(settings, 'modules.imports')
          && <NavLink to="/importar" onClick={cerrar}>{t('nav.importar')}</NavLink>}
        {moduleEnabled(settings, 'modules.reports')
          && <NavLink to="/informes" onClick={cerrar}>{t('nav.informes')}</NavLink>}
        <NavLink to="/ajustes" onClick={cerrar}>{t('nav.ajustes')}</NavLink>
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

/** Renders its children only while the module is switched on. */
function Gate({ module, children }: { module: string; children: React.ReactNode }) {
  const { settings, ready } = useSettings();
  const { t } = useI18n();
  // Nothing is refused before the settings have loaded: the cache paints first
  // and the server may still disagree, and a screen that flashes "not available"
  // on every reload is worse than one that waits a beat.
  if (!ready || moduleEnabled(settings, module)) return <>{children}</>;
  return <p className="aviso" role="status">{t('ajustes.moduloApagado')}</p>;
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
          {/* A module that is off loses its nav entry AND its route: hiding the
              link while the URL still works is a door with the sign taken down.
              Ajustes is never gated — it is where a module is turned back on. */}
          <Route path="/hoy" element={<Gate module="modules.today"><Today /></Gate>} />
          <Route path="/" element={<Gate module="modules.leads"><Kanban /></Gate>} />
          <Route path="/propiedades" element={<Gate module="modules.properties"><Propiedades /></Gate>} />
          <Route path="/importar" element={<Gate module="modules.imports"><Importar /></Gate>} />
          <Route path="/informes" element={<Gate module="modules.reports"><Informes /></Gate>} />
          <Route path="/ajustes" element={<Ajustes />} />
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
      <SettingsProvider>
        <Shell />
      </SettingsProvider>
    </LocaleProvider>
  );
}
