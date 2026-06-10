---
applyTo: "frontend/**"
---
# Instructions Copilot — Frontend (Next.js)

Avant toute modification frontend, consulter le **Brain OS** (repo frère) :
`taskforce-docs/technique/Architecture.md`, `API.md`, `Modules.md`, `Problemes_Connus.md`.
Version compacte locale : `.ai/`.

## Règles spécifiques frontend

- **Routes API centralisées** dans `lib/config/api-routes.ts` : tout chemin doit y être déclaré (avec
  `/api`) puis consommé via un service `lib/api/*-service.ts`. 4 groupes manquent actuellement
  (`MESSAGE_ROUTES`, `INTEGRATION_ROUTES`, `ATTACHMENT_ROUTES`, `ROADMAP_ROUTES`) → erreurs runtime (PC-002).
  Les ajouter avant d'utiliser leurs services.
- Import du client HTTP : `import { apiClient } from "@/lib/api/client"` (export **nommé**). Ne pas
  importer `./api-client` (inexistant — bug PC-003 dans `profile-service.ts`).
- Lire les réponses via `response.data.data` (enveloppe `ApiResponse<T>` côté backend).
- État : un store **Zustand** par domaine (`lib/store/*.ts`) appelant un service ; pas de fetch direct
  depuis les composants.
- TypeScript strict : pas de `any`. Traductions dans `constants_fr.ts` + `constants_en.ts`.
- Temps réel : passer par `lib/hooks/use-stomp.ts` (STOMP/SockJS).
- Ne pas réintroduire de données mock (cf. `components/messages/data.ts`, à terme à retirer).
