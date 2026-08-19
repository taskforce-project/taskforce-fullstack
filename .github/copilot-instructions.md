# 🤖 Instructions IA — TaskForce (lean)

> Contexte **toujours chargé** par Copilot/Claude → gardé court pour le coût en tokens. Le détail vit dans
> le **Brain OS** (repo `taskforce-docs/`), chargé à la demande. SOP complet :
> `taskforce-docs/frameworks/SOP_Developpement.md`.

## 🧠 Source de vérité — LIRE avant d'agir

Le **Brain OS** décrit la **réalité du code** (pas l'intention) :
- Hub : `taskforce-docs/Brain_OS.md`
- Archi / API / Modules : `taskforce-docs/technique/{Architecture,API,Modules}.md`
- Dette / problèmes : `taskforce-docs/technique/{Dette_Technique,Problemes_Connus}.md`
- **État produit & tâches** : `taskforce-docs/produit/` + `taskforce-docs/technique/Roadmap_Backlog.md`
- Version compacte locale (ce repo) : `.ai/` + `.ai/P0-fix-plan.md`

**Priorité actuelle = PRODUIT** (niveau des outils de référence : Plane/Linear/GitHub), mémoire RNCP ensuite.

## ▶ Démarrage de session

Quand l'utilisateur dit « go » / « prochaine action ? » / « on commence » : **s'orienter d'abord, ne pas coder**.
Lire `taskforce-docs/AGENTS.md` (si le vault est dans le workspace) sinon `taskforce-docs/produit/README.md`
(bloc « ▶ État & prochaine action ») ou `.ai/P0-fix-plan.md`. Calculer la prochaine action (P0/broken d'abord,
produit avant mémoire, respecter `besoin-backend`), puis répondre en 3 lignes : `État` · `Prochaine action (ID)` · `On y va ?`.
Après chaque tâche : mettre à jour le statut dans `produit/` + recalculer le bloc « ▶ Prochaine action » (auto-entretien).

## 🔄 SOP (résumé)

1. **Lire** le Brain OS (hub → fiche du domaine concerné) ; vérifier dans le code (notes datées).
2. **Coder** en respectant les règles d'or ci-dessous.
3. **Tracer** : tâche issue du backlog/produit (ID `TF-…` / `FE-…` / `BE-…`). Besoin back côté front → `[besoin-backend:: BE-xxx]` dans `produit/Frontend.md` + item miroir dans `produit/Backend.md`.
4. **Tester** (couverture ≥ 50 %) + linter avant commit.
5. **Mettre à jour** la fiche produit (`statut`), le Brain OS si l'archi/contrat change, le changelog.

## ⭐ Règles d'or (critiques)

| # | Règle |
| - | ----- |
| 1 | **Tout contrôleur backend porte `/api`** dans `@RequestMapping` — **aucun `context-path` n'est configuré** (sinon 404, cf. PC-001). |
| 2 | Route front = déclarée dans `frontend/lib/config/api-routes.ts`, consommée via un service `frontend/lib/api/*` (cf. PC-002). |
| 3 | Client HTTP : `import { apiClient } from "@/lib/api/client"` (export **nommé** ; pas `./api-client`, cf. PC-003). |
| 4 | Lire les réponses via `response.data.data` (enveloppe `ApiResponse<T>`). |
| 5 | Couches backend : `shared ← core ← modules` (jamais l'inverse). |
| 6 | Changement DB = migration **Flyway** `V{n}__...` (jamais éditer une migration appliquée ; `ddl-auto=validate`). |
| 7 | **TypeScript strict**, pas de `any` ; un **store Zustand** par domaine ; pas de données mock. |
| 8 | Validation `@Valid` (back) / Zod (front) ; secrets via variables d'env, jamais en dur. |
| 9 | Docker : services joints par **nom de service** (`http://backend:8080`), pas `localhost`. |

## ✅ Commits & PR

`type(scope): description` (feat/fix/refactor/docs/test/chore/ci/perf). Branches depuis `dev`
(`feature/*`, `fix/*`). PR = **un** label `release:{major|minor|patch}`.
Détail : `taskforce-docs/developpeur/git-workflow/`.

## 🚫 Ne JAMAIS faire

- Lancer une commande / commit / push **sans confirmation** explicite de l'utilisateur.
- Réintroduire un `context-path`, du `any`, des mocks, des secrets en dur.
- Modifier `application.yml` au lieu de `application-dev.yml` (config dev).
- Éditer une migration Flyway déjà appliquée.

## 💬 Communication

Réponses **courtes, directes, en français**, sans politesse excessive ni emojis superflus. L'utilisateur
est développeur. Propositions claires et précises. Vérifier avant d'agir.

## 📎 Instructions ciblées

Des règles par dossier se chargent automatiquement selon le fichier édité :
`.github/instructions/backend.instructions.md` (`backend/tf-api/**`) et
`.github/instructions/frontend.instructions.md` (`frontend/**`).

---
**Maj :** 09/06/2026 · **v2.0 (lean)** · Détail → `taskforce-docs/` (Brain OS) + `frameworks/SOP_Developpement.md`
