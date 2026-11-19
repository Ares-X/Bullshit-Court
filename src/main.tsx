import React, { Suspense, lazy } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// The admin console ships as its own lazy chunk so it stays out of the game bundle.
const AdminApp = lazy(() => import('./admin/AdminApp'));
const isAdminRoute = window.location.pathname === '/admin' || window.location.pathname.startsWith('/admin/');

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    {isAdminRoute
      ? <Suspense fallback={<div style={{ minHeight: '100vh', background: '#14161c' }} />}><AdminApp /></Suspense>
      : <App />}
  </React.StrictMode>
);
