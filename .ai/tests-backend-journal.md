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
| B-T3 | `AuthorizationService` : requireMember/requireRole/requireManager (403) | unit | ✅ **11/11 vert** |
| B-T4 | Socle `AbstractIntegrationTest` (Postgres réel + Flyway) + smoke `IntegrationSocleTest` | infra | ✅ **3/3 vert** |
| B-T5 | Intégration métier : `IssueRepository` (SQL réel) ✅ **4/4** + `IssueService` CRUD ✅ **7/7** + `WorkspaceService` (plan limits, delete cascade) ✅ **6/6** | intég | ✅ **17/17 vert** |
| B-T6 | Controllers (`@WebMvcTest` : `/api`, `ApiResponse<T>`, `@Valid`→400, 401/403/404) — `RedistributionController` + `IssueController` | slice | ✅ **10/10 vert** |
| B-T7 | Notification/Analytics/Cycle + non-régression bugs connus | unit | 🔲 |

## Problèmes rencontrés

- **BT-P1 (bloquant, corrigé)** : le module test **ne compilait plus** — `JwtServiceTest` appelait `JwtService.refreshAccessToken(String, UserRepresentation)`, **méthode supprimée** (le refresh/rotation vit désormais dans `AuthService`). Bloc mort `RefreshAccessTokenTests` (4 tests) retiré → module test compile. ⇒ finding QA (les tests existants avaient bité en silence, jamais lancés en CI bloquante — recoupe le besoin CI CERT-C26).
- **BT-P2 (mien, corrigé)** : `List.of(objectArray)` à **un seul** argument se « spread » en `List<Object>` (piège varargs) → forcé `List.<Object[]>of(...)` pour les lignes `countOpenIssuesGroupedByAssignee`.
- **BT-P6 (recette `@WebMvcTest` Boot 4, B-T6)** : slice web déplacée → artefact **`spring-boot-webmvc-test`** (`org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest`). Recette : `@WebMvcTest(Ctrl.class)` + `@Import({SecurityConfig, JwtIdentityResolver})` (charge la vraie sécu HS512) + principal via `SecurityMockMvcRequestPostProcessors.jwt().jwt(b -> b.claim("email", …))` (le décodeur n'est pas invoqué) ; **mocker les repos de `WorkspaceAccessInterceptor`** (`WorkspaceRepository`/`WorkspaceMemberRepository`) sinon `WebMvcConfig` ne se construit pas — non stubbés → `findBySlug` vide → intercepteur **fail-open**. Testé : 200 (enveloppe `ApiResponse`), 401 (sans JWT), 403 (`ForbiddenException`→`GlobalExceptionHandler`), 400 (`@Valid` `@NotEmpty`).
- **BT-P7 (2 bugs de test préexistants débloqués)** :
  1. **`application-test.yml` malformé** : **2 blocs `stripe:` dupliqués** → `DuplicateKeyException` du parseur YAML strict de Boot 4 → **tout `@SpringBootTest`/`@WebMvcTest` en profil `test` échouait au context-load** (explique le `TfApiApplicationTests` `@Disabled`). Fusionné en un bloc.
  2. **`AuthServiceTest` périmé** : `AuthService` a gagné 4 dépendances (`WorkspaceService`, `WorkspaceInvitationService`, `AuditService`, `RefreshTokenRepository`) jamais ajoutées au test → `@InjectMocks` les laissait `null` → **5 NPE** (login/verifyOtp), invisibles tant que le module test ne compilait pas (cf. BT-P1). Mocks ajoutés → **suite unit+web = 147 verts** (1 skip = `TfApiApplicationTests` `@Disabled`).
- **BT-P4 (infra B-T4, plusieurs obstacles)** :
  1. **Boot 4.0.0 a re-modularisé** les slices/auto-configs de test → nouveaux packages : `@DataJpaTest` = `org.springframework.boot.data.jpa.test.autoconfigure` (artefact **`spring-boot-data-jpa-test`** à ajouter), `AutoConfigureTestDatabase` = `…jdbc.test.autoconfigure`, `FlywayAutoConfiguration` = `…flyway.autoconfigure`, `JdbcTemplateAutoConfiguration` = `…jdbc.autoconfigure`.
  2. **Testcontainers KO depuis un conteneur** : le docker-java embarqué (TC 1.20.x) est incompatible avec le proxy Docker Desktop 29 (`BadRequestException 400` à la négociation d'API), `DOCKER_API_VERSION`/`DOCKER_HOST` n'y changent rien. → **pivot** : Postgres `pgvector/pgvector:pg16` lancé en **sibling** sur un réseau Docker partagé, conteneur Maven sur le même réseau (datasource via `SPRING_DATASOURCE_URL` → `tf-it-pg:5432`). Orchestré par **`scripts/it.ps1`**. Équivalent fonctionnel (vrai PG + vrai Flyway) ; rebrancher `@Testcontainers` quand les tests tourneront sur un JDK hôte.
  3. **Flyway ne tournait pas avant Hibernate** (0 table, `validate` échoue « missing table [attachments] ») : `FlywayAutoConfiguration` importée via `@Import` = traitée comme simple `@Configuration` → le post-processor `EntityManagerFactory depends-on Flyway` n'est pas câblé. Fix : **`@ImportAutoConfiguration`** (passe par la machinerie d'auto-config → ordering correct). ⇒ **56 migrations appliquées, `ddl-auto=validate` PASSE : aucune dérive entité↔schéma** (bon signal QA au passage).
  - _Warning bénin_ : surefire logue « going to kill self fork JVM » (JVM lente à sortir après `System.exit(0)`, ~pool non fermé) → BUILD SUCCESS quand même.
- **BT-P3 (technique B-T2)** : `SmartAssignService` utilise un **vrai `ObjectMapper`** (parse Groq + `toJson`) → instancié **à la main** (`new SmartAssignService(...)` avec `ObjectMapper` réel + mocks) au lieu de `@InjectMocks` (qui aurait injecté un `ObjectMapper` mocké renvoyant `null`). Le `JdbcTemplate` mocké : ses **4 sous-requêtes** (skills / capacity+seniority / assignment_events / usual-complexity) différenciées par un fragment SQL (`contains(...)`) ; le `RowMapper` n'étant jamais exécuté par le mock, on renvoie directement la « ligne » (ex. texte JSON des skills). **Limite** : `ProfileExtras`/`HistoryStats` sont des **records privés** → non constructibles depuis le test → capacité/séniorité/historique restent à leurs **défauts** en unitaire (loadFactor 4, resolvedRate 0). Ces signaux (capacité → dispo, séniorité, historique) seront couverts en **intégration** (B-T4/B-T5, Testcontainers + Flyway + seed).
- **Env** : pas de JDK/mvn local → tests via conteneur `maven:3.9-eclipse-temurin-21` + volume `tf-m2`. 1er run **en ligne** (télécharge surefire/jacoco), puis `-o` offline OK. Surefire résume les `@Nested` comme « Tests run: 0 » dans le `.txt` (artefact) → **vérifier le XML** (`<testcase>` + 0 `<failure>/<error>`).

## Coverage courant

- B-T1 : `RedistributionServiceTest` **13/13** (0 failure/error).
- B-T2 : `SmartAssignServiceTest` **18/18** (0 failure/error) — 5 preview (ranking labels, dispo/charge, exclusion terminées/annulées + inactifs, no-candidate), 2 fallback (Groq down → java-fallback ; score sémantique Groq), 3 growth (bonus stretch OK / garde-fous URGENT + mode off), 3 recommend (persistance `assignment_events` + `ai_runs`, IDOR projet/issue), 2 autz (workspace introuvable, non-membre), 3 bulk/redistribution (skip issue étrangère, entrée vide, `rankForRedistribution` sans `assignment_events`). Vérifié via le résumé surefire par `@Nested` (le total racine affiche « 0 », artefact connu).
- B-T3 : `AuthorizationServiceTest` **11/11** (0 failure/error) — requireMember (membre / non-membre → `ForbiddenException`), requireRole (rôle autorisé / refusé « Permission insuffisante » / non-membre court-circuité / varargs vide), requireManager (`@ParameterizedTest` OWNER+ADMIN acceptés, MEMBER refusé), isMember (true/false sans exception).
- B-T4 : `IntegrationSocleTest` **3/3** (Flyway 56 migrations OK, extension `vector` présente, requête repository sur schéma réel, `ddl-auto=validate` OK). Lancer via **`.\scripts\it.ps1`** (1er run en ligne pour `spring-boot-data-jpa-test`, puis `-Offline`).
- B-T5 (tranche 1) : `IssueRepositoryIntegrationTest` **4/4** — `findByWorkspaceSlugAndAssigneeId` (n'expose que l'assigné du bon workspace, tri seq DESC) + `countOpenIssuesGroupedByAssignee` (exclut COMPLETED/CANCELLED, regroupe par assigné, vide si tout terminé). ⇒ **valide en vrai SQL** les 2 requêtes que B-T1/B-T2 ne pouvaient que mocker. Fixtures persistées via repositories (timestamps OK grâce à `@CreationTimestamp` sur `User` et au `@PrePersist` de `AuditableEntity` → pas besoin de `@EnableJpaAuditing` dans le slice).
- B-T5 (tranche 2) : `IssueServiceIntegrationTest` **7/7** — service chargé dans le slice `@DataJpaTest` via `@Import(IssueService.class)`, repos réels, `SimpMessagingTemplate` + `NotificationService` en **`@MockitoBean`** (Boot 4). Couvre le vrai chemin de persistance : createIssue (séquence atomique 1→2, statut défaut « Todo », position 0, notif assigné + publish `/topic/projects.`), sans-assigné (pas de notif mais publish), IDOR statut hors-projet → 404, non-membre → `BusinessException` ; updateIssue (statut→Done + réassignation persistés + 2e publish, issue inconnue → 404).
- B-T5 (tranche 3) : `WorkspaceServiceIntegrationTest` **6/6** — createNewWorkspace (workspace + membre OWNER + `seedBrain`), **limite FREE** (2 max → 3e = `IllegalStateException`), PRO au-delà de la limite FREE, `getUsage` (plan/usage/limites 5 & 2), `deleteWorkspace` **cascade DB** (members) + audit, non-owner → `IllegalStateException`. ⚠️ piège testé : pour vérifier la cascade dans une seule tx, il faut `em.flush()+em.clear()` **avant** le delete (sinon le `WorkspaceMember` reste managé et pointe vers un workspace supprimé → `TransientPropertyValueException`).
- **B-T5 complet : 17/17** (4 repo + 7 IssueService + 6 WorkspaceService). Lancer l'intégration : `.\scripts\it.ps1 -Test "IntegrationSocleTest,IssueRepositoryIntegrationTest,IssueServiceIntegrationTest,WorkspaceServiceIntegrationTest" [-Offline]`.
- B-T6 : `RedistributionControllerWebMvcTest` **5/5** (200/401/403/400) + `IssueControllerWebMvcTest` **5/5** (201/400/401/200/404) = **10/10**. Recette réutilisable rodée sur 2 controllers.
- **Suite unit + web (hors intégration) : 152 tests verts** (1 skip). `docker run … mvn -o test -Dtest=!*Integration*`. Suite **intégration** (Postgres) : 20 verts via `.\scripts\it.ps1`.
- Coverage global à mesurer (JaCoCo) — les 2 suites tournent séparément (profils/DB différents) → agréger. Reste B-T7 (Notification/Analytics/Cycle) + éventuels controllers supplémentaires.

## Convention d'arborescence (confirmée 30/06)

Le dossier `src/test/java/.../` **mirror** `src/main/java/.../` : chaque `*Test.java` vit dans le **même package** que la classe testée (`core/service/SmartAssignServiceTest` ↔ `core/service/SmartAssignService`), ce qui donne aussi accès au package-private. Seules exceptions volontaires (support de test, pas des packages applicatifs) : `config/TestConfig.java` et `util/TestDataBuilder.java`.
