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
| B-T1 | `RedistributionService` (neuf, PROD-1.12) : plan sûr (movable/URGENT/seuil), pickTarget (pas de sur-charge), apply (IDOR skip, audit), authz manager | unit (Mockito) | ✅ **13/13 vert** |
| B-T2 | `SmartAssignService` : scoring/ranking, fallback sans Groq, growth guards, availability/workload | unit | ✅ **18/18 vert** |
| B-T3 | `AuthorizationService` : requireMember/requireRole/requireManager (403) | unit | 🔲 |
| B-T4 | Socle `AbstractIntegrationTest` (Testcontainers pg + Flyway) | infra | 🔲 |
| B-T5 | `IssueService` (CRUD, labels, assignee, realtime publish mocké) + `WorkspaceService` | unit/intég | 🔲 |
| B-T6 | Controllers critiques (`@WebMvcTest` : `/api`, `ApiResponse<T>`, `@Valid`→400, 401/403) | slice | 🔲 |
| B-T7 | Notification/Analytics/Cycle + non-régression bugs connus | unit | 🔲 |

## Problèmes rencontrés

- **BT-P1 (bloquant, corrigé)** : le module test **ne compilait plus** — `JwtServiceTest` appelait `JwtService.refreshAccessToken(String, UserRepresentation)`, **méthode supprimée** (le refresh/rotation vit désormais dans `AuthService`). Bloc mort `RefreshAccessTokenTests` (4 tests) retiré → module test compile. ⇒ finding QA (les tests existants avaient bité en silence, jamais lancés en CI bloquante — recoupe le besoin CI CERT-C26).
- **BT-P2 (mien, corrigé)** : `List.of(objectArray)` à **un seul** argument se « spread » en `List<Object>` (piège varargs) → forcé `List.<Object[]>of(...)` pour les lignes `countOpenIssuesGroupedByAssignee`.
- **BT-P3 (technique B-T2)** : `SmartAssignService` utilise un **vrai `ObjectMapper`** (parse Groq + `toJson`) → instancié **à la main** (`new SmartAssignService(...)` avec `ObjectMapper` réel + mocks) au lieu de `@InjectMocks` (qui aurait injecté un `ObjectMapper` mocké renvoyant `null`). Le `JdbcTemplate` mocké : ses **4 sous-requêtes** (skills / capacity+seniority / assignment_events / usual-complexity) différenciées par un fragment SQL (`contains(...)`) ; le `RowMapper` n'étant jamais exécuté par le mock, on renvoie directement la « ligne » (ex. texte JSON des skills). **Limite** : `ProfileExtras`/`HistoryStats` sont des **records privés** → non constructibles depuis le test → capacité/séniorité/historique restent à leurs **défauts** en unitaire (loadFactor 4, resolvedRate 0). Ces signaux (capacité → dispo, séniorité, historique) seront couverts en **intégration** (B-T4/B-T5, Testcontainers + Flyway + seed).
- **Env** : pas de JDK/mvn local → tests via conteneur `maven:3.9-eclipse-temurin-21` + volume `tf-m2`. 1er run **en ligne** (télécharge surefire/jacoco), puis `-o` offline OK. Surefire résume les `@Nested` comme « Tests run: 0 » dans le `.txt` (artefact) → **vérifier le XML** (`<testcase>` + 0 `<failure>/<error>`).

## Coverage courant

- B-T1 : `RedistributionServiceTest` **13/13** (0 failure/error).
- B-T2 : `SmartAssignServiceTest` **18/18** (0 failure/error) — 5 preview (ranking labels, dispo/charge, exclusion terminées/annulées + inactifs, no-candidate), 2 fallback (Groq down → java-fallback ; score sémantique Groq), 3 growth (bonus stretch OK / garde-fous URGENT + mode off), 3 recommend (persistance `assignment_events` + `ai_runs`, IDOR projet/issue), 2 autz (workspace introuvable, non-membre), 3 bulk/redistribution (skip issue étrangère, entrée vide, `rankForRedistribution` sans `assignment_events`). Vérifié via le résumé surefire par `@Nested` (le total racine affiche « 0 », artefact connu).
- Coverage global à mesurer après B-T3 (`mvn test`, rapport `target/site/jacoco/index.html`).
