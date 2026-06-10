---
applyTo: "backend/tf-api/**"
---
# Instructions Copilot — Backend (Spring Boot)

Avant toute modification backend, consulter le **Brain OS** (repo frère) :
`taskforce-docs/technique/Architecture.md`, `API.md`, `Modules.md`, `Problemes_Connus.md`.
Version compacte locale : `.ai/`.

## Règles spécifiques backend

- **Préfixe `/api` OBLIGATOIRE** dans chaque `@RequestMapping` : il n'y a **pas** de `context-path`
  configuré. 5 contrôleurs l'omettent (Cycle/Team/Page/Discussion/Channel) → 404 (cf. PC-001). Ne pas
  reproduire ce pattern ; aligner tout nouveau contrôleur sur `/api/...`.
- Architecture en couches : `shared ← core ← modules`. Jamais de dépendance inverse.
- Tout changement de schéma DB = nouvelle migration Flyway `V{n}__description.sql` (jamais d'édition
  d'une migration appliquée ; `ddl-auto=validate`).
- Controllers : `@Valid` sur les DTOs, retour `ResponseEntity<ApiResponse<T>>` (enveloppe
  `{success,data,message,statusCode}`).
- Autorisation au niveau service : vérifier `WorkspaceMember`/`ProjectMember` + rôles.
- Entités : étendre `AuditableEntity`. Injection par constructeur (`@RequiredArgsConstructor`).
- Modifier `application-dev.yml` (pas `application.yml`) pour la config DEV.
