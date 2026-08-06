import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import { FeedbackProvider } from './components/FeedbackContext';
import { AuthProvider } from './contexts/AuthContext';
import { ligarCapturaGlobal } from './lib/telemetria';
import './index.css';

// Antes de montar: um throw durante a montagem dos provedores também conta.
ligarCapturaGlobal();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <FeedbackProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </FeedbackProvider>
  </StrictMode>,
);
