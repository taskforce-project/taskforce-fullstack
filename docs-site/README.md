# TaskForce Docs

Site de documentation TaskForce (Astro **Starlight**) : **guides produit** (utilisateur) **et** **référence
API** (OpenAPI), au même endroit et aux couleurs de la marque. Destiné à **docs.taskforce-project.fr**.

## Développement

```bash
cd docs-site
npm install
npm run dev        # http://localhost:4321
npm run build      # génère dist/ (statique)
```

> ⚠️ Non encore validé en CI : lancer `npm install && npm run build` une fois pour figer les versions
> (Astro / Starlight / starlight-openapi). Si une incompatibilité de version apparaît, ajuster
> `package.json` — le contenu et la config, eux, sont stables.

## Générer la spec API (`openapi.json`)

La référence API est rendue depuis `public/openapi.json`. Le fichier versionné est un **placeholder** ;
en CI/prod on écrit la VRAIE spec générée par le backend (springdoc) **avant** `npm run build` :

```bash
# backend démarré (dev/CI), springdoc actif :
curl -s http://localhost:8080/v3/api-docs -o docs-site/public/openapi.json
```

(ou via `springdoc-openapi-maven-plugin` en phase `integration-test` pour l'écrire sans backend en ligne).

## Déploiement — Cloudflare Pages (recommandé)

1. Cloudflare Dashboard → **Pages** → *Connect to Git* → repo `taskforce-fullstack`.
2. **Build command** : `cd docs-site && npm install && npm run build` · **Output** : `docs-site/dist`.
3. **Custom domain** : `docs.taskforce-project.fr` → Cloudflare crée le CNAME automatiquement.

Alternative (VM/nginx) : servir `docs-site/dist` en statique derrière le reverse-proxy existant.

## Personnalisation

- **Thème / couleurs** : `src/styles/taskforce.css` (accent bleu `#2563eb`, la couleur de marque).
- **Menu** : `astro.config.mjs` → `sidebar`.
- **Contenu produit** : `src/content/docs/**` (Markdown / MDX). Peut être alimenté depuis le Brain OS
  (`taskforce-docs/`) pour les guides plus fournis.
- **Référence API** : automatique via `starlight-openapi` à partir de la spec.
