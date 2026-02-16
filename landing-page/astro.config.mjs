// @ts-nocheck
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'astro/config';

import react from '@astrojs/react';

// https://astro.build/config
export default defineConfig({
  vite: {
      plugins: [tailwindcss()],
      server: {
        watch: {
          usePolling: true,
          interval: 1000,
        },
      },
	},

  integrations: [react()],
});