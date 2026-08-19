import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Artefacts générés (rapports de tests, couverture) : jamais édités à la main.
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    // Bibliothèque tierce vendorisée (axe-core 4.11.1, Deque Systems) : 560 Ko minifiés,
    // chargés tels quels par Playwright pour l'audit d'accessibilité. Ce n'est pas notre
    // code, on ne le corrige pas — on l'exclut de l'analyse.
    "e2e/axe.min.js",
  ]),
  {
    rules: {
      // `set-state-in-effect` (react-hooks v6, outillage React Compiler) signale tout `setState`
      // synchrone dans le corps d'un effet, car il provoque un rendu en cascade. C'est une règle de
      // performance, pas de correction : le comportement observé reste juste.
      //
      // Les 20 occurrences restantes se répartissent en deux familles, toutes deux légitimes en
      // l'état :
      //
      //  - Chargement de données (17) : `setLoading(true)` juste avant un appel réseau, dans les
      //    cartes du dashboard, les pages projet et `issue-sheet`. Le motif est correct mais
      //    dupliqué. La bonne réponse est de l'extraire dans un hook `useAsyncData` partagé, ce qui
      //    supprimerait aussi une centaine de lignes redondantes. Chantier planifié, hors périmètre
      //    de clôture (cf. `.ai/roadmap.md` §4.B) : toucher 17 points d'appel maintenant ferait
      //    courir un risque sans contrepartie.
      //
      //  - Lecture après hydratation (3) : `localStorage` et le drapeau `mounted` dans
      //    `cookie-banner` et les deux layouts. Ces valeurs n'existent pas au rendu serveur ; l'effet
      //    est ici la seule voie possible, il n'y a rien à corriger.
      //
      // En avertissement, la règle reste visible sur toute nouvelle occurrence sans bloquer.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  {
    // Fichiers de test et harnais de mocks uniquement.
    //
    // La règle d'or « TypeScript strict, pas de `any` » vise le code applicatif : elle y reste
    // intégralement appliquée. Dans les tests, `as any` sert exclusivement à construire des
    // *fixtures partielles* — un objet minimal (`{ id: 1, title: 'A' }`) qui tient lieu d'entité
    // complète, parce que le test ne porte que sur les champs cités. Les alternatives sont pires :
    // écrire des fixtures exhaustives les rend fragiles à chaque évolution du domaine, et
    // `as unknown as Issue` est la même échappatoire en plus verbeux.
    //
    // Même logique pour les mocks de globales navigateur (`vitest.setup.ts`) et les corps de
    // requête MSW (`lib/mocks/server.ts`), que le typage amont livre en `unknown`.
    files: [
      "**/*.test.ts",
      "**/*.test.tsx",
      "vitest.setup.ts",
      "lib/mocks/**",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
]);

export default eslintConfig;
