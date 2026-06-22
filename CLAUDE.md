# Instructions IA — TaskForce

> Chargé automatiquement par Claude Code à chaque session. Gardé court pour limiter les tokens.
> Le détail vit dans le **Brain OS** (`taskforce-docs/`) et la version compacte locale (`.ai/`).

## Source de vérité — LIRE avant d'agir

Le **Brain OS** est un **repo frère éditable** : `C:\taskforce-project\taskforce-docs` (= `../taskforce-docs`, hors du workspace mais bien accessible — **l'éditer fait partie de la Definition of Done**). Il décrit la **réalité du code** (pas l'intention) :

- Hub : `../taskforce-docs/Brain_OS.md` · **Contrat d'agent + DoD** : `../taskforce-docs/AGENTS.md` §2
- Archi / Modules : `../taskforce-docs/v1/03-architecture/{Architecture,Modules}.md` · API : `../taskforce-docs/v1/05-api/API.md`
- Problèmes connus : `../taskforce-docs/v1/09-audits/Problemes_Connus.md`
- État produit & fiches domaine : `../taskforce-docs/v1/02-produit/{README,Frontend,Backend,IA,Infra,Landing}.md`
- Backlog / roadmap : `../taskforce-docs/v1/13-roadmap/Roadmap_Backlog.md`
- **Version compacte locale (ce repo)** : `.ai/` + `.ai/roadmap.md` (roadmap maître) + `.ai/P0-fix-plan.md`

Avant toute modification, lire la fiche du domaine concerné dans `.ai/` **et** la fiche `../taskforce-docs/v1/02-produit/*` correspondante.

## Démarrage de session

Quand l'utilisateur dit « go » / « prochaine action ? » / « on commence » : **s'orienter d'abord, ne pas coder**.
Lire `.ai/P0-fix-plan.md` ou `taskforce-docs/produit/README.md`. Calculer la prochaine action (P0/broken d'abord, produit avant mémoire), puis répondre en 3 lignes : `État` · `Prochaine action (ID)` · `On y va ?`.

## SOP (résumé)

1. **Lire** le Brain OS (hub → fiche du domaine concerné) ; vérifier dans le code.
2. **Coder** en respectant les règles d'or ci-dessous.
3. **Tracer** : tâche issue du backlog (ID `TF-…` / `FE-…` / `BE-…` / `PROD-…`). Besoin back côté front → `[besoin-backend:: BE-xxx]` dans `v1/02-produit/Frontend.md` + item miroir dans `v1/02-produit/Backend.md`.
4. **Tester** (couverture ≥ 50 %) + linter avant commit.
5. **Mettre à jour le Brain OS frère** (`../taskforce-docs`) selon la DoD `AGENTS.md` §2 : fiche produit `v1/02-produit/*` (`[statut::]`), Architecture/API si le contrat change, bloc « ▶ Prochaine action », changelog. **+ MAJ `.ai/roadmap.md`** (statut de l'item).

## Règles d'or

| # | Règle |
| - | ----- |
| 1 | **Tout contrôleur backend porte `/api`** dans `@RequestMapping` — aucun `context-path` n'est configuré (sinon 404, cf. PC-001). |
| 2 | Route front = déclarée dans `frontend/lib/config/api-routes.ts`, consommée via un service `frontend/lib/api/*` (cf. PC-002). |
| 3 | Client HTTP : `import { apiClient } from "@/lib/api/client"` (export **nommé** ; pas `./api-client`, cf. PC-003). |
| 4 | Lire les réponses via `response.data.data` (enveloppe `ApiResponse<T>`). |
| 5 | Couches backend : `shared ← core ← modules` (jamais l'inverse). |
| 6 | Changement DB = migration **Flyway** `V{n}__...` (jamais éditer une migration appliquée ; `ddl-auto=validate`). |
| 7 | **TypeScript strict**, pas de `any` ; un **store Zustand** par domaine ; pas de données mock. |
| 8 | Validation `@Valid` (back) / Zod (front) ; secrets via variables d'env, jamais en dur. |
| 9 | Docker : services joints par **nom de service** (`http://backend:8080`), pas `localhost`. |

## Règles backend (Spring Boot) — `backend/tf-api/**`

- Préfixe `/api` OBLIGATOIRE dans chaque `@RequestMapping`.
- Architecture en couches : `shared ← core ← modules`. Jamais de dépendance inverse.
- Tout changement DB = nouvelle migration Flyway `V{n}__description.sql`.
- Controllers : `@Valid` sur les DTOs, retour `ResponseEntity<ApiResponse<T>>`.
- Autorisation au niveau service : vérifier `WorkspaceMember`/`ProjectMember` + rôles.
- Entités : étendre `AuditableEntity`. Injection par constructeur (`@RequiredArgsConstructor`).
- Modifier `application-dev.yml` (pas `application.yml`) pour la config DEV.

## Règles frontend (Next.js) — `frontend/**`

- Routes API centralisées dans `lib/config/api-routes.ts` (avec `/api`), consommées via `lib/api/*-service.ts`.
- Import client HTTP : `import { apiClient } from "@/lib/api/client"` (export nommé).
- Lire les réponses via `response.data.data` (enveloppe `ApiResponse<T>`).
- État : un store Zustand par domaine (`lib/store/*.ts`) ; pas de fetch direct depuis les composants.
- TypeScript strict : pas de `any`. Traductions dans `constants_fr.ts` + `constants_en.ts`.
- Temps réel : passer par `lib/hooks/use-stomp.ts` (STOMP/SockJS).
- Ne pas réintroduire de données mock.

## Commits & PR

`type(scope): description` (feat/fix/refactor/docs/test/chore/ci/perf). Branches depuis `dev` (`feature/*`, `fix/*`). PR = **un** label `release:{major|minor|patch}`.

## Ne JAMAIS faire

- Lancer une commande / commit / push **sans confirmation** explicite de l'utilisateur.
- Réintroduire un `context-path`, du `any`, des mocks, des secrets en dur.
- Modifier `application.yml` au lieu de `application-dev.yml`.
- Éditer une migration Flyway déjà appliquée.

## Communication

Réponses **courtes, directes, en français**. L'utilisateur est développeur. Vérifier avant d'agir.

---
**Maj :** 11/06/2026 · **v1.0** · Détail → `taskforce-docs/` (Brain OS) + `.ai/`
