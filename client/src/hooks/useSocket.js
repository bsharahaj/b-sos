import { useEffect, useState } from 'react';
import { socket } from '../api/socket.js';

// Live connection status for UI ("Connected" / "Reconnecting…"). The socket itself is connected by AuthProvider.
export function useSocketStatus() {
  const [connected, setConnected] = useState(socket.connected);

  useEffect(() => {
    const on = () => setConnected(true);
    const off = () => setConnected(false);
    socket.on('connect', on);
    socket.on('disconnect', off);
    return () => {
      socket.off('connect', on);
      socket.off('disconnect', off);
    };
  }, []);

  return connected;
}

// Subscribe to one server event for the lifetime of a component.
export function useSocketEvent(event, handler) {
  useEffect(() => {
    socket.on(event, handler);
    return () => socket.off(event, handler);
  }, [event, handler]);
}
