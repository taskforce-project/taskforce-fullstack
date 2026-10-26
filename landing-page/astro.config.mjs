// @ts-nocheck
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, fontProviders } from 'astro/config';

import react from '@astrojs/react';

// Domaine de prod dérivé de PUBLIC_BASE_DOMAIN ; défaut = domaine réel (URL canoniques, OpenGraph, sitemap).
const BASE_DOMAIN = (process.env.PUBLIC_BASE_DOMAIN || 'taskforce-project.fr')
  .replace(/^https?:\/\//, '')
  .replace(/\/+$/, '');

// https://astro.build/config
export default defineConfig({
  site: `https://${BASE_DOMAIN}`,
  // Pas de `redirects` ici : les anciennes adresses du site sont des redirections HTTP 308 de vercel.json, que Vercel
  // applique avant les pages. Une page de redirection d'Astro (meta refresh, noindex) n'en est pas une pour Google.

  // Geist et Geist Mono (Vercel, licence SIL Open Font), polices de la direction artistique 2026. Téléchargées au
  // build et servies par le site lui-même : aucune requête vers Google à la visite.
  fonts: [
    {
      provider: fontProviders.google(),
      name: 'Geist',
      cssVariable: '--font-geist',
      weights: ['300 700'],
      styles: ['normal'],
      subsets: ['latin'],
      fallbacks: ['ui-sans-serif', 'system-ui', 'sans-serif'],
    },
    {
      provider: fontProviders.google(),
      name: 'Geist Mono',
      cssVariable: '--font-geist-mono',
      weights: ['400 600'],
      styles: ['normal'],
      subsets: ['latin'],
      fallbacks: ['ui-monospace', 'monospace'],
    },
  ],
  vite: {
    plugins: [tailwindcss()],
    // Dédup React : évite toute double instance de React dans les îlots.
    resolve: {
      dedupe: ['react', 'react-dom'],
    },
    server: {
      // Docker sous Windows : les événements de fichiers ne traversent pas le montage, on interroge.
      watch: {
        usePolling: true,
        interval: 1000,
      },
    },
    // En dev, motion n'est découvert qu'au premier chargement d'un îlot : sans le pré-empaqueter au démarrage, ce
    // chargement peut renvoyer 504 « Outdated Optimize Dep » (vu dans Docker).
    optimizeDeps: {
      include: ['motion/react'],
    },
  },

  integrations: [react()],
});
