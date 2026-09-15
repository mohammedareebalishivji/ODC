import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import { AuthProvider } from './state';
import { I18nProvider } from './i18n';
import { ThemeProvider } from './theme';
import { Toasts } from './ui';
import './index.css';
// Component primitives in ui.jsx (.btn/.card/.pill) are defined here. The
// import was dropped during the Tailwind migration, which left them unstyled.
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ThemeProvider>
        <I18nProvider>
          <AuthProvider>
            <App />
            <Toasts />
          </AuthProvider>
        </I18nProvider>
      </ThemeProvider>
    </HashRouter>
  </React.StrictMode>
);
