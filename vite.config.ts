import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { courtPlatformPlugin } from './server/courtHttp';
import { courtBridgePlugin } from './server/courtBridge.mjs';

export default defineConfig({
  plugins: [react(), courtBridgePlugin(), courtPlatformPlugin()],
  server: {
    port: 3000,
    open: true
  }
});
