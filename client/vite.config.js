import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
  // HTTPS is required: mobile browsers only expose DeviceMotion/DeviceOrientation
  // (the accelerometer/gyroscope APIs) on a secure context.
  plugins: [react(), basicSsl()],
  server: {
    host: true, // expose on LAN so the phone can reach it
    port: 5173,
    proxy: {
      // Proxy Socket.IO to the plain-HTTP signaling server so the browser only
      // ever talks to one HTTPS origin (avoids needing a second cert-trust step).
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
