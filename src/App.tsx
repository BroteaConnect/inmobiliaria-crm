import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { isLoggedIn, logout } from './lib/pb';
import { features } from './features/registry';
import Login from './crm/Login';
import Kanban from './crm/Kanban';
import Propiedades from './crm/Propiedades';
import Importar from './crm/Importar';

function Nav({ onLogout }: { onLogout: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => { setMenuOpen(false); }, [pathname]);

  const cerrar = () => setMenuOpen(false);

  return (
    <nav className="topnav">
      <strong className="marca">CRM Inmobiliaria</strong>
      <button
        type="button"
        className="menu-btn"
        aria-label="Menú"
        aria-expanded={menuOpen}
        aria-controls="nav-links"
        onClick={() => setMenuOpen((o) => !o)}
      >
        <span /><span /><span />
      </button>
      <div id="nav-links" className={`links${menuOpen ? ' abierto' : ''}`}>
        <NavLink to="/" end onClick={cerrar}>Leads</NavLink>
        <NavLink to="/propiedades" onClick={cerrar}>Propiedades</NavLink>
        <NavLink to="/importar" onClick={cerrar}>Importar</NavLink>
        {features.map((f) => (
          <NavLink key={f.path} to={f.path} onClick={cerrar}>{f.label}</NavLink>
        ))}
        <a className="externo" href="https://inmobiliaria.brotea.dev" target="_blank"
          rel="noreferrer" onClick={cerrar}>Ver web pública ↗</a>
        <button type="button" className="salir" onClick={onLogout}>Salir</button>
      </div>
    </nav>
  );
}

export default function App() {
  const [logged, setLogged] = useState(isLoggedIn());

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
