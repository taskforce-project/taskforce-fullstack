# ===============================
# DOCKERFILE NEXT.JS - MULTI-STAGE
# Compatible DEV et PROD
# ===============================

# ================================
# Stage 1: Dependencies
# ================================
FROM node:20-alpine AS deps

WORKDIR /app

# Copier package files pour cache des dépendances
COPY package.json package-lock.json* ./

# Installer les dépendances
RUN npm ci

# ================================
# Stage 2: Builder
# ================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copier les dépendances depuis deps
COPY --from=deps /app/node_modules ./node_modules

# Copier le code source
COPY . .

# Variables d'environnement de build
ENV NEXT_TELEMETRY_DISABLED=1

# ── Origines publiques, figées au BUILD ──────────────────────────────────────
# Next.js remplace les `process.env.NEXT_PUBLIC_*` par leur valeur littérale pendant `next build` :
# elles finissent dans le bundle envoyé au navigateur. Les poser à l'exécution (`environment:` du
# compose) n'a donc AUCUN effet sur le code client — l'application déployée retomberait sur les
# valeurs par défaut `localhost` de `next.config.ts`, injoignables depuis le poste d'un utilisateur.
# Elles doivent être passées en `build.args`. Consommées par : next.config.ts (CSP `connect-src` /
# `img-src`), lib/config/api-routes.ts et lib/api/client.ts.
ARG NEXT_PUBLIC_API_URL=http://localhost:8080
ARG NEXT_PUBLIC_API_URL_SSR=http://backend:8080
ARG NEXT_PUBLIC_STORAGE_URL=http://localhost:9000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL_SSR=$NEXT_PUBLIC_API_URL_SSR
ENV NEXT_PUBLIC_STORAGE_URL=$NEXT_PUBLIC_STORAGE_URL

# Build de l'application Next.js
RUN npm run build

# ================================
# Stage 3: Runner (Production)
# ================================
FROM node:20-alpine AS runner

WORKDIR /app

# Variables d'environnement
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Créer un utilisateur non-root pour la sécurité
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copier les fichiers nécessaires
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Utiliser l'utilisateur non-root
USER nextjs

# Exposer le port
EXPOSE 3000

# Variables d'environnement par défaut
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})" || exit 1

# Commande de démarrage
CMD ["node", "server.js"]
