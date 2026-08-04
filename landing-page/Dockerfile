# ===============================
# DOCKERFILE ASTRO - LANDING PAGE
# Multi-stage pour optimisation
# ===============================

# ================================
# Stage 1: Dependencies
# ================================
FROM node:20-alpine AS deps

WORKDIR /app

# Copier package files (+ .npmrc = legacy-peer-deps, sinon npm ci casse sur le peer vite@8)
COPY package.json package-lock.json* .npmrc ./

# Installer les dépendances
RUN npm ci

# ================================
# Stage 2: Builder
# ================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copier les dépendances
COPY --from=deps /app/node_modules ./node_modules

# Copier le code source
COPY . .

# Mesure d'audience (CERT-C20). Astro inline les variables `PUBLIC_*` au moment du build : elles
# doivent donc être des ARG et non des variables d'exécution, le site étant généré statiquement.
# Vides par défaut, auquel cas aucun script de mesure n'est injecté dans les pages.
ARG PUBLIC_UMAMI_SRC=
ARG PUBLIC_UMAMI_WEBSITE_ID=
ENV PUBLIC_UMAMI_SRC=$PUBLIC_UMAMI_SRC
ENV PUBLIC_UMAMI_WEBSITE_ID=$PUBLIC_UMAMI_WEBSITE_ID

# Build Astro
RUN npm run build

# ================================
# Stage 3: Runner
# ================================
FROM node:20-alpine AS runner

WORKDIR /app

# Installer serve pour servir les fichiers statiques
RUN npm install -g serve

# Copier les fichiers buildés
COPY --from=builder /app/dist ./dist

# Exposer le port
EXPOSE 4321

# Variables d'environnement
ENV PORT=4321
ENV HOST=0.0.0.0

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:4321 || exit 1

# Démarrer avec serve. PAS de `-s` (mode SPA) : le site est MULTI-PAGES (Astro SSG) → `-s` réécrit
# toutes les sous-pages vers index.html (bug : /product/* renvoyait la home). Sans `-s`, serve rend
# bien /product/orchestration/index.html, /product/brain-os/index.html, etc. + un vrai 404.
CMD ["serve", "dist", "-l", "4321"]
