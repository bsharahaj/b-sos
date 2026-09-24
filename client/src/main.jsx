import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './store/AuthContext.jsx';
import { AlertsProvider } from './store/AlertsContext.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <AlertsProvider>
          <App />
        </AlertsProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
