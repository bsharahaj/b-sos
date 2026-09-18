import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const sharedDir = fileURLToPath(new URL('../shared', import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@shared': sharedDir },
  },
  server: {
    port: 5173,
    host: true, // expose on the LAN so the app can be tested from a phone
    // Vite only serves files inside the project root by default; /shared lives one level up.
    fs: { allow: ['.', sharedDir] },
  },
});
