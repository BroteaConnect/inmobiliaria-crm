import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Same client-env convention as the astro stack: only PUBLIC_* vars are
  // inlined into the bundle, so shared feature code reads one prefix.
  envPrefix: 'PUBLIC_',
});
