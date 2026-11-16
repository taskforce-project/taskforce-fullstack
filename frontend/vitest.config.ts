import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { readdirSync } from "node:fs";
import path from "path";

/**
 * Les seuils d'un fichier à lui seul : ceux du périmètre, appliqués à chaque fichier de la vue du workflow (R159, L11), par
 * une entrée dont le motif ne vise que ce fichier. `perFile: true` pour tout le périmètre ferait échouer une trentaine de
 * fichiers plus anciens, hors du lot (des services sans tests, des stores) : ils gardent le total, le workflow non.
 */
const OWN_FILE = { lines: 70, functions: 80, branches: 67, statements: 70 };
function eachFile(dir: string): Record<string, typeof OWN_FILE> {
  return Object.fromEntries(
    readdirSync(path.resolve(__dirname, dir))
      .filter((name) => /\.tsx?$/.test(name) && !/\.(test|spec)\./.test(name))
      .map((name) => [`${dir}/${name}`, OWN_FILE]),
  );
}

/**
 * Les fichiers de la vue du workflow hors de ses deux dossiers (R159, L11) : la carte d'un nœud dans la conversation, les
 * crochets qui lisent et suivent le projet, les stores qu'elle tient. Chacun tient lui aussi les seuils à lui seul.
 */
const WORKFLOW_ELSEWHERE = [
  "components/agent/node-in-chat.tsx",
  "lib/hooks/use-project-live.ts",
  "lib/hooks/use-project-realtime.ts",
  "lib/hooks/use-waiting-live.ts",
  "lib/hooks/use-workflow-data.ts",
  "lib/issue-relations.ts",
  "lib/store/project-store.ts",
  "lib/store/workflow-view-store.ts",
];

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
      ],
      // Périmètre coverage = LOGIQUE testable en unitaire (décision 01/07).
      // Les pages `app/**` et les composants de présentation / primitives shadcn (`components/ui`)
      // sont couverts par les tests E2E Playwright, pas par le coverage unitaire.
      include: [
        "lib/**/*.{ts,tsx}",
        "hooks/**/*.{ts,tsx}",
        "components/auth/**/*.{ts,tsx}",
        // La vue du workflow (séance n°25, W1) : ses composants portent sa logique d'écran (fenêtres, gestes, décision).
        "components/workflow/**/*.{ts,tsx}",
        // Sa carte dans la conversation (R159, L11).
        "components/agent/node-in-chat.tsx",
      ],
      // Objectifs de couverture.
      // Vitest 4 (18/10/2026) compte les branches et les instructions sur l'AST (`??`, `?.`,
      // paramètres par défaut) : à code et tests égaux, les branches des stores passent de 83 % à
      // 59 %. Les seuils touchés ont été recalés juste sous la nouvelle mesure, sans baisse réelle.
      thresholds: {
        // Global sur le périmètre LOGIQUE (lib/hooks/components-auth), les pages/UI étant couvertes
        // par E2E. Au niveau racine : une clé `global` serait lue comme un motif de fichier et ne
        // contrôlerait rien.
        lines: 70,
        functions: 80,
        branches: 67,
        statements: 70,
        // La vue du workflow : chaque fichier tient les seuils à lui seul (voir OWN_FILE).
        ...eachFile("components/workflow"),
        ...eachFile("lib/workflow"),
        ...Object.fromEntries(WORKFLOW_ELSEWHERE.map((file) => [file, OWN_FILE])),
        // Services API - CRITIQUE
        'lib/api/auth-service.ts': {
          lines: 90,
          functions: 95,
          branches: 65,
          statements: 90,
        },
        'lib/api/client.ts': {
          lines: 35,
          functions: 48,
          branches: 35,
          statements: 35,
        },
        // Composants métier auth (funcs plus bas : beaucoup de handlers UI non tous exercés)
        'components/auth/**/*.tsx': {
          lines: 78,
          functions: 65,
          branches: 72,
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
          branches: 58,
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
          statements: 83,
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
