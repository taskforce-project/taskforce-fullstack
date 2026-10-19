// @ts-nocheck
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, fontProviders } from 'astro/config';

import react from '@astrojs/react';

// Domaine de prod dérivé de PUBLIC_BASE_DOMAIN ; défaut = domaine réel (URL canoniques, OpenGraph, sitemap).
const BASE_DOMAIN = (process.env.PUBLIC_BASE_DOMAIN || 'taskforce-project.fr')
  .replace(/^https?:\/\//, '')
  .replace(/\/+$/, '');

/**
 * Anciennes URL du site web (avant l'app desktop, octobre 2026) vers leur équivalent. En sortie statique, Astro
 * écrit une page de redirection (meta refresh + canonical) pour chacune : les liens et le référencement existants
 * ne tombent pas sur une 404. Les fiches de connecteurs générées (`/product/integrations/<clé>`) ne sont pas
 * listables ici : elles finissent sur la 404, qui renvoie vers l'accueil.
 */
const OLD_URLS = {
  '/product': '/features',
  '/product/agents': '/agents',
  '/product/orchestration': '/agents',
  '/product/approvals': '/agents',
  '/product/brain-os': '/features#memory',
  '/product/analytics': '/features#measure',
  '/product/collaboration': '/features',
  '/product/smart-assign': '/features',
  '/product/integrations': '/features#connect',
  '/product/integrations/github': '/features#connect',
  '/product/integrations/plane': '/features#connect',
  '/product/integrations/slack': '/features#connect',
  '/pricing': '/download',
  '/waitlist': '/download',
  '/book-a-demo': '/download',
  '/enterprise': '/security',
  '/trust': '/security',
  '/legal/security': '/security',
  '/legal/ai-transparency': '/security',
  '/roadmap': '/download#whats-new',
  '/changelog': '/download#whats-new',
  '/status': '/',
  '/blog': '/',
  '/learn': '/',
  '/company/about': '/',
  '/company/contact': '/legal/notice',
  '/company/media': '/',
  '/docs': 'https://docs.taskforce-project.fr',
  '/legal/accessibility': '/legal/notice',
  '/legal/cookies': '/legal/privacy',
  '/legal/dpa': '/legal/privacy',
  '/legal/subprocessors': '/legal/privacy',
  '/legal/subscription': '/legal/terms',
  '/labs': '/',
  '/labs/agent-roles': '/',
  '/labs/learning-from-reviews': '/',
  '/labs/model-choice': '/',
  '/labs/run-memory': '/',
  '/solutions': '/',
  '/solutions/engineering': '/',
  '/solutions/product': '/',
  '/solutions/operations': '/',
  '/solutions/marketing': '/',
  '/solutions/client-services': '/',
  '/use-cases': '/',
  '/use-cases/architecture-decision': '/',
  '/use-cases/backlog-grooming': '/',
  '/use-cases/code-review': '/',
  '/use-cases/documentation': '/',
  '/use-cases/incident-postmortem': '/',
  '/use-cases/onboarding': '/',
  '/use-cases/product-spec': '/',
  '/use-cases/qa-testing': '/',
  '/use-cases/release-notes': '/',
  '/use-cases/sprint-planning': '/',
  '/vs': '/',
  '/vs/claude-code-alone': '/agents',
  '/vs/copilot': '/agents',
  '/vs/cursor': '/',
  '/vs/devin': '/',
  '/vs/jira': '/',
  '/vs/linear': '/',
  '/vs/notion': '/',
  '/vs/shortcut': '/',
};

// https://astro.build/config
export default defineConfig({
  site: `https://${BASE_DOMAIN}`,
  redirects: OLD_URLS,
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
