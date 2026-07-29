import { useState } from 'react';
import { login } from '../lib/pb';

export default function Login({ onOk }: { onOk: () => void }) {
  const [error, setError] = useState('');

  const entrar = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError('');
    try {
      await login(String(fd.get('email')), String(fd.get('password')));
      onOk();
    } catch {
      setError('Email o contraseña incorrectos.');
    }
  };

  return (
    <div className="login">
      <form onSubmit={entrar}>
        <h1>CRM Inmobiliaria</h1>
        <label>Email <input name="email" type="email" required autoComplete="username" /></label>
        <label>Contraseña <input name="password" type="password" required autoComplete="current-password" /></label>
        <button className="primario" type="submit">Entrar</button>
        <p role="alert" className="error">{error}</p>
      </form>
    </div>
  );
}
