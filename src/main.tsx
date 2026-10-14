import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './index.css';

// Copy settings saved under the earlier "gitler_" names once, before any component reads them.
try {
  for (const key of Object.keys(localStorage)) {
    if (!key.startsWith('gitler_')) continue;
    const next = 'gitmate_' + key.slice('gitler_'.length);
    if (localStorage.getItem(next) === null) localStorage.setItem(next, localStorage.getItem(key) as string);
    localStorage.removeItem(key);
  }
} catch {}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
