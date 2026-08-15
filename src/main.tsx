import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/theme.css';
import './styles/base.css';
// The client's identity layer, AFTER the generated theme so it can override it
// and BEFORE the app's own sheets so they can use its tokens. It carries the
// three priority signals, the single alert red and the channel colour — the
// vocabulary the design needs and the theme has no name for. It existed unused
// for two weeks, which is how the board ended up with three competing reds.
import './styles/identity.css';
import './crm/crm.css';
import './components/kit/kit.css';
import App from './App';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
