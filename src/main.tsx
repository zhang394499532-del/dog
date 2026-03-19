import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Suppress benign development errors that clutter the console
if (typeof window !== 'undefined') {
  const isBenignError = (msg: string) => 
    msg.includes('WebSocket') || 
    msg.includes('vite') || 
    msg.includes('websocket') ||
    msg.includes('HMR');

  window.addEventListener('unhandledrejection', (event) => {
    const msg = event.reason?.message || String(event.reason || '');
    if (isBenignError(msg)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);

  window.addEventListener('error', (event) => {
    const msg = event.message || '';
    if (isBenignError(msg)) {
      event.preventDefault();
      event.stopPropagation();
    }
  }, true);

  // Also catch standard errors from Vite HMR
  const originalError = console.error;
  console.error = (...args) => {
    const firstArg = String(args[0] || '');
    if (isBenignError(firstArg)) {
      return;
    }
    originalError.apply(console, args);
  };
  
  const originalWarn = console.warn;
  console.warn = (...args) => {
    const firstArg = String(args[0] || '');
    if (isBenignError(firstArg)) {
      return;
    }
    originalWarn.apply(console, args);
  };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
