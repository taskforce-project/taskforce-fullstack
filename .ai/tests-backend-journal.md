# Journal — Tests BACKEND (C25, cible ≥60 % lignes)

> Suivi du chantier tests backend. Ordre : **critiques d'abord** (métier + sécu), unitaires → intégration (Testcontainers) → controllers/slices. Gate JaCoCo **PACKAGE LINE ≥ 0.50** (on vise **0.60**). Maj au fil de l'eau.

## Conventions (rappel, cf. `roadmap.md` §Tests)

- JUnit 5 + Mockito (`@ExtendWith(MockitoExtension.class)`, `@Mock`, `@InjectMocks`) + AssertJ (`assertThat`, `assertThatThrownBy`).
- `@DisplayName` FR, `@Nested` par comportement, nommage `should_… / given_…_when_…_then_…`.
- Par unité : **nominal + limites + négatifs/erreur + idempotence + autorisation (401/403)**, données variées (chiffres, lettres, chaînes, nulls, listes), assertions vrai **et** faux.
- Réutiliser `util/TestDataBuilder`. Testcontainers Postgres (pgvector) pour l'intégration réelle.

## État de départ (30/06)

- Existant (unitaires, mocks) : `AuthServiceTest`, `EmailServiceTest`, `JwtServiceTest`, `KeycloakServiceTest`, `KeycloakAuthServiceTest`, `OtpServiceTest`, `StripeServiceTest` + `TfApiApplicationTests` + `TestConfig` + `TestDataBuilder`.
- Manque : tout le **métier** (Issue, Project, Workspace, Cycle, Notification, Analytics), le **Smart Assign**, la **Redistribution** (PROD-1.12, neuf), l'**autorisation** (AuthorizationService), les **controllers**, et le socle **Testcontainers**.

## Plan (lots)

| Lot | Cible | Type | Statut |
| - | --- | --- | :--: |
| B-T1 | `RedistributionService` (neuf, PROD-1.12) : plan sûr (movable/URGENT/seuil), pickTarget (pas de sur-charge), apply (IDOR skip, audit), authz manager | unit (Mockito) | 🔲 |
| B-T2 | `SmartAssignService` : scoring/ranking, fallback sans Groq, growth guards, availability/workload | unit | 🔲 |
| B-T3 | `AuthorizationService` : requireMember/requireRole/requireManager (403) | unit | 🔲 |
| B-T4 | Socle `AbstractIntegrationTest` (Testcontainers pg + Flyway) | infra | 🔲 |
| B-T5 | `IssueService` (CRUD, labels, assignee, realtime publish mocké) + `WorkspaceService` | unit/intég | 🔲 |
| B-T6 | Controllers critiques (`@WebMvcTest` : `/api`, `ApiResponse<T>`, `@Valid`→400, 401/403) | slice | 🔲 |
| B-T7 | Notification/Analytics/Cycle + non-régression bugs connus | unit | 🔲 |

## Problèmes rencontrés

_(rien encore)_

## Coverage courant

_(à mesurer après B-T1 : `mvn -o test` puis rapport JaCoCo `target/site/jacoco/index.html`)_
