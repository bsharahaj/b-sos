import { useContext } from 'react';
import { AlertsContext } from '../store/AlertsContext.jsx';

export function useAlerts() {
  const context = useContext(AlertsContext);
  if (!context) throw new Error('useAlerts must be used inside <AlertsProvider>.');
  return context;
}
