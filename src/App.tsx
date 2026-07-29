import { useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom';
import { isLoggedIn, logout } from './lib/pb';
import { features } from './features/registry';
import Login from './crm/Login';
import Kanban from './crm/Kanban';
import Propiedades from './crm/Propiedades';
import Importar from './crm/Importar';

const navStyle = {
  display: 'flex',
  gap: 'var(--space-4)',
  padding: 'var(--space-4)',
  borderBottom: '1px solid var(--border)',
  background: 'var(--surface)',
  alignItems: 'center',
} as const;
const mainStyle = {
  maxWidth: '1200px',
  margin: '0 auto',
  padding: 'var(--space-5) var(--space-4)',
} as const;

export default function App() {
  const [logged, setLogged] = useState(isLoggedIn());

  if (!logged) return <Login onOk={() => setLogged(true)} />;

  return (
    <BrowserRouter>
      <nav style={navStyle}>
        <strong style={{ fontFamily: 'var(--font-display)' }}>CRM Inmobiliaria</strong>
        <NavLink to="/">Leads</NavLink>
        <NavLink to="/propiedades">Propiedades</NavLink>
        <NavLink to="/importar">Importar</NavLink>
        {features.map((f) => (
          <NavLink key={f.path} to={f.path}>{f.label}</NavLink>
        ))}
        <a href="https://inmobiliaria.brotea.dev" target="_blank" rel="noreferrer"
          style={{ marginLeft: 'auto', fontSize: '.85rem' }}>Ver web pública ↗</a>
        <button onClick={() => { logout(); setLogged(false); }}
          style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                   color: 'var(--muted)', padding: '4px 12px', font: 'inherit', cursor: 'pointer' }}>
          Salir
        </button>
      </nav>
      <main style={mainStyle}>
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
