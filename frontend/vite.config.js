import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: { port: 5173 },
  // GitHub Pages serves a project site at <user>.github.io/<repo>/, so asset URLs need that
  // prefix in the demo build. The normal dev/build mode keeps the default root base.
  base: mode === 'demo' ? '/ai-pr-analyzer/' : '/',
}));
