import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "happy-dom",
    setupFiles: ["./vitest.setup.ts"],
    // 15 s : les tests d'intégration (RTL + userEvent) sont plus lents sous la charge de la suite
    // parallèle (706 tests) que le défaut 5 s → évite les timeouts flaky sans masquer un vrai hang.
    testTimeout: 15000,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      // Rapport émis même si des tests échouent (feedback CI + visibilité locale).
      reportOnFailure: true,
      exclude: [
        "node_modules/",
        ".next/",
        "out/",
        "build/",
        "coverage/",
        "**/*.d.ts",
        "**/*.config.*",
        "**/mockData/**",
        "**/types/**",
        "**/__tests__/**",
        "**/*.test.*",
        "**/*.spec.*",
        "**/constants_*.ts", // Translation files
        "lib/i18n/**",        // Traductions (données, pas de logique)
        "lib/constants/**",   // Données statiques
        "lib/mocks/**",       // Fixtures de dev
        "**/*.generated.ts",  // Fichiers générés (ex. brand-logos.generated.ts via `npm run logos`) - data
        "**/index.ts",        // Barrels de ré-exports (aucune logique ; types compile-time)
        "components/auth/floating-paths.tsx", // Fond SVG animé décoratif (présentation pure, aucune logique)
      ],
      // Périmètre coverage = LOGIQUE testable en unitaire (décision 01/07).
      // Les pages `app/**` et les composants de présentation / primitives shadcn (`components/ui`)
      // sont couverts par les tests E2E Playwright, pas par le coverage unitaire.
      include: [
        "lib/**/*.{ts,tsx}",
        "hooks/**/*.{ts,tsx}",
        "components/auth/**/*.{ts,tsx}",
      ],
      // Objectifs de couverture
      thresholds: {
        // Global sur le périmètre LOGIQUE (lib/hooks/components-auth). Actuel ~83 % lignes.
        // Cible 70 % avec marge ; les pages/UI sont couvertes par E2E (hors coverage unitaire).
        global: {
          lines: 70,
          functions: 80,
          branches: 75,
          statements: 70,
        },
        // Services API - CRITIQUE
        'lib/api/auth-service.ts': {
          lines: 90,
          functions: 95,
          branches: 75,
          statements: 90,
        },
        'lib/api/client.ts': {
          lines: 35,
          functions: 48,
          branches: 35,
          statements: 35,
        },
        'lib/api/stripe-service.ts': {
          lines: 78,
          functions: 70,
          branches: 85,
          statements: 78,
        },
        // Composants métier auth (funcs plus bas : beaucoup de handlers UI non tous exercés)
        'components/auth/**/*.tsx': {
          lines: 78,
          functions: 65,
          branches: 77,
          statements: 78,
        },
        // Context & State Management
        'lib/contexts/**/*.tsx': {
          lines: 90,
          functions: 90,
          branches: 80,
          statements: 90,
        },
        'lib/store/**/*.ts': {
          lines: 90,
          functions: 90,
          branches: 80,
          statements: 90,
        },
        // Utils & Validation (seuils alignés sur l'actuel - reste des fns utilitaires non couvertes)
        'lib/utils/**/*.ts': {
          lines: 72,
          functions: 85,
          branches: 85,
          statements: 72,
        },
        'lib/auth/**/*.ts': {
          lines: 90,
          functions: 80,
          branches: 69,
          statements: 90,
        },
      },
    },
    include: ["**/*.{test,spec}.{ts,tsx}"],
    // e2e/ = specs Playwright (@playwright/test) → hors du run vitest unitaire.
    exclude: ["node_modules", ".next", "out", "build", "**/e2e/**"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});
