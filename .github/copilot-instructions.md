# 🤖 Instructions IA - Projet Taskforce

> **Configuration pour assistants IA (Claude, GitHub Copilot, etc.)**  
> À lire AVANT toute intervention sur le projet

---

## 🎯 Règles Générales

### ⚠️ IMPÉRATIF - Ne JAMAIS faire sans demander

1. **NE JAMAIS lancer de commandes** sans confirmation explicite de l'utilisateur
2. **NE JAMAIS utiliser `Start-Sleep` ou attentes** - l'utilisateur sait quand les services sont prêts
3. **NE JAMAIS créer de fichiers markdown de résumé** sauf demande explicite
4. **TOUJOURS vérifier avant d'agir** - l'utilisateur demande de vérifier ≠ lancer

### 💬 Communication

- **Réponses courtes et directes** - l'utilisateur est développeur, pas besoin d'explications infantilisantes
- **Pas de phrases de politesse excessives** - rester professionnel mais concis
- **Ne pas répéter ce que l'utilisateur vient de dire** - il le sait déjà
- **Pas d'emojis excessifs** - maximum 2-3 par message
- **Utiliser le français** - sauf demande explicite pour l'anglais
- **Les propositions sont les bienvenues, elles doivent être claires et précises** - éviter les ambiguïtés

### 🔍 Workflow de travail

1. **Demande de vérification** → LIRE les fichiers concernés, RÉSUMER les incohérences trouvées
2. **Demande de correction** → CORRIGER directement avec les outils appropriés
3. **Doute sur l'intention** → DEMANDER confirmation avant d'agir

---

## 📁 Structure du Projet

### Monorepo Organisation

```
taskforce-fullstack/
├── backend/tf-api/          # Spring Boot API (Java 21)
├── frontend/                # Next.js 16 (TypeScript)
├── landing-page/            # Astro (site vitrine)
├── keycloak/                # Configuration Keycloak
├── scripts/                 # Scripts de déploiement
├── .env.dev                 # Variables d'environnement DEV (Docker)
└── docker-compose.dev.yml   # Orchestration Docker DEV
```

### Environnements

- **DEV** : `docker-compose.dev.yml`, `.env.dev`, `application-dev.yml`, `realm-dev/`
- **PROD** : `docker-compose.prod.yml`, `.env.prod`, `application-prod.yml`, `realm-prod/`

⚠️ **Cohérence OBLIGATOIRE** : Tout changement doit être vérifié dans TOUS les fichiers de l'environnement concerné

---

## 🔀 Git Workflow & Commits

### Branches Principales

- **`main`** : Production stable (`v1.0.0`)
- **`dev`** : Développement avec Release Candidates (`v1.0.0-rc1`)

### Branches de Travail

| Type | Nomenclature | Depuis |
|------|--------------|--------|
| Feature | `feature/nom-feature` | `dev` |
| Fix | `fix/nom-bug` | `dev` |
| Hotfix | `hotfix/nom-fix` | `main` |

### Conventions de Commits (OBLIGATOIRE)

**Format** : `<type>(<scope>): <description>`

#### Types de Commits

| Type | Usage | Exemple |
|------|-------|---------|
| `feat` | Nouvelle fonctionnalité | `feat(auth): add 3-step registration flow` |
| `fix` | Correction de bug | `fix(api): correct port configuration from 8081 to 8080` |
| `refactor` | Refactoring sans changement fonctionnel | `refactor(auth): split registration into 3 services` |
| `docs` | Documentation uniquement | `docs(readme): update setup instructions` |
| `style` | Formatage, indentation | `style(backend): fix code formatting` |
| `test` | Ajout/modification de tests | `test(auth): add unit tests for selectPlan` |
| `chore` | Tâches de maintenance | `chore(deps): update Spring Boot to 3.4.2` |
| `ci` | CI/CD | `ci(docker): optimize backend image build` |
| `perf` | Optimisation performance | `perf(db): add index on otp_verification.email` |
| `build` | Modifications de build | `build(frontend): update webpack config` |
| `config` | Modifications de configuration | `config(keycloak): update realm settings for dev` |

#### Scopes Recommandés

- **Backend** : `api`, `auth`, `user`, `subscription`, `db`, `security`
- **Frontend** : `ui`, `auth`, `dashboard`, `components`, `api-client`
- **Infra** : `docker`, `keycloak`, `postgres`, `nginx`
- **Global** : `config`, `env`, `deps`

#### Exemples de Commits Valides

```bash
# Nouvelle fonctionnalité
git commit -m "feat(auth): implement 3-step registration with plan selection"

# Correction de bug
git commit -m "fix(docker): correct backend port from 8081 to 8080"

# Refactoring
git commit -m "refactor(auth): extract plan storage to OtpVerification table"

# Configuration
git commit -m "chore(config): add planType column to otp_verification"

# Documentation
git commit -m "docs(api): document /select-plan endpoint"
```

#### ❌ Exemples à Éviter

```bash
# Trop vague
git commit -m "fix stuff"
git commit -m "update"

# Pas de type
git commit -m "corrected the port"

# Type incorrect
git commit -m "feat: fix bug"  # fix ≠ feat
```

---

## 🏷️ Pull Requests & Labels

### Labels Obligatoires (UN SEUL)

Chaque PR **DOIT** avoir exactement **UN** label de version :

- `release:major` - Breaking changes (`v1.0.0` → `v2.0.0`)
- `release:minor` - Nouvelles features (`v1.0.0` → `v1.1.0`)
- `release:patch` - Bug fixes (`v1.0.0` → `v1.0.1`)

### Labels Optionnels

**Type** :
- `type:feature`, `type:bugfix`, `type:refactor`, `type:test`, `type:ci/cd`

**Composants** :
- `backend`, `frontend`, `database`, `infra`

**Priorité** :
- `priority:critical`, `priority:high`, `priority:medium`, `priority:low`

### Titre de PR

Suivre les mêmes conventions que les commits :

```
feat(auth): implement 3-step registration flow
fix(docker): correct API URL for frontend container
refactor(auth): extract plan selection logic
```

---

## 🏗️ Architecture & Conventions

### Backend (Spring Boot)

- **Port** : `8080`
- **Context Path** : `/api`
- **Profile DEV** : `application-dev.yml`
- **Base de données** : PostgreSQL 18
- **Auth** : Keycloak avec OAuth2/OIDC
- **Migrations** : Flyway (`V1__`, `V2__`, etc.)

#### Structure des Packages

```
com.taskforce.tf_api/
├── shared/          # Config globale, exceptions, DTOs communs, sécurité
├── core/            # Fonctionnalités de base (OBLIGATOIRE)
│   ├── api/         # Controllers REST
│   ├── domain/      # Entités JPA
│   ├── service/     # Logique métier
│   ├── repository/  # Accès DB (Spring Data)
│   └── dto/         # request/ et response/
└── modules/         # Modules optionnels (chat, analytics, ged)
    └── [module]/    # Même structure que core
```

#### Conventions Java

- **Packages** : `com.taskforce.tf_api.<module>.<type>`
- **DTOs** : `*Request.java`, `*Response.java` dans packages séparés
- **Services** : Logique métier, injection par constructeur (`@RequiredArgsConstructor`)
- **Controllers** : REST API, validation `@Valid`, retourner `ResponseEntity<ApiResponse<T>>`
- **Entities** : Étendre `AuditableEntity.java` pour auditing automatique
- **Repositories** : Interfaces Spring Data JPA

#### Architecture Professionnelle

⚠️ **JAMAIS de champs optionnels "par flemme"** - Si un champ n'est pas disponible à une étape, créer des endpoints séparés et du stockage temporaire approprié

**Exemple** : Inscription en 3 étapes
```
POST /auth/register       → Step 1: Crée compte Keycloak + OTP
POST /auth/select-plan    → Step 2: Stocke plan dans otp_verification
POST /auth/verify-otp     → Step 3: Récupère plan + crée user en DB
```

### Frontend (Next.js)

- **Port** : `3000`
- **Framework** : Next.js 16 (App Router)
- **UI** : Shadcn/UI + Tailwind CSS 4
- **API Client** : Axios avec intercepteurs JWT
- **State Management** : Zustand (client) + React Query (serveur)

#### Structure Frontend

```
frontend/
├── app/                 # Next.js App Router
│   ├── auth/           # Pages d'authentification
│   └── (protected)/    # Pages authentifiées
├── components/
│   └── ui/             # Composants Shadcn/UI
├── lib/
│   ├── api/            # Services API (Axios)
│   ├── store/          # Zustand stores
│   ├── utils/          # Utilitaires (validation, etc.)
│   ├── constants_en.ts # Traductions anglaises
│   └── constants_fr.ts # Traductions françaises
└── hooks/              # Custom React hooks
```

#### Conventions TypeScript

- **Pas de `any`** - Toujours typer correctement
- **Mode strict** : `tsconfig.json` avec `"strict": true`
- **Interfaces** : `PascalCase` (ex: `AuthResponse`, `UserProfile`)
- **Composants** : PascalCase (ex: `RegisterForm.tsx`)
- **Fonctions utilitaires** : camelCase (ex: `getErrorMessage`)
- **Constantes** : UPPER_SNAKE_CASE pour les vraies constantes

### Docker

#### Services (docker-compose.dev.yml)

| Service | Port Hôte | Port Container | URL |
|---------|-----------|----------------|-----|
| postgres | 5432 | 5432 | `localhost:5432` |
| keycloak | 8180 | 8080 | `http://localhost:8180` |
| backend | 8080 | 8080 | `http://localhost:8080/api` |
| frontend | 3000 | 3000 | `http://localhost:3000` |
| pgadmin | 5050 | 80 | `http://localhost:5050` |

#### Variables d'Environnement

**Règle d'or** : Dans Docker, les services communiquent via **noms de services**, pas `localhost`

```yaml
# Frontend dans Docker
NEXT_PUBLIC_API_URL: http://backend:8080/api  # ✅ Nom du service

# Frontend hors Docker (dev local)
NEXT_PUBLIC_API_URL: http://localhost:8080/api  # ✅ localhost
```

---

## ✅ Qualité de Code & Bonnes Pratiques

### 🔍 Linters & Formatters

#### Frontend (ESLint)

Configuration : `eslint.config.mjs`

```bash
# Lancer ESLint
npm run lint

# Auto-fix des erreurs corrigibles
npm run lint -- --fix
```

**Règles appliquées** :
- Next.js Core Web Vitals
- TypeScript strict
- Hooks Rules (React)

**À respecter** :
- ✅ Pas de `console.log()` en production
- ✅ `useEffect` avec dépendances correctes
- ✅ Pas de `any` TypeScript
- ✅ Imports organisés (React → libs → local)

#### Backend (Maven Plugins)

```bash
# Formater le code (si configuré)
mvn spotless:apply

# Vérifier le code
mvn verify
```

### 📊 TypeScript Strict Mode

Le projet utilise **TypeScript strict** (`tsconfig.json`) :

```json
{
  "compilerOptions": {
    "strict": true,           // Mode strict activé
    "noEmit": true,           // Pas de compilation (Next.js s'en charge)
    "esModuleInterop": true,  // Compatibilité imports
    "skipLibCheck": true      // Skip validation des .d.ts
  }
}
```

**Implications** :
- ✅ `strictNullChecks` : Impossible d'assigner `null` sans le déclarer
- ✅ `strictFunctionTypes` : Vérification stricte des signatures
- ✅ `noImplicitAny` : Interdiction du `any` implicite
- ✅ `noImplicitThis` : `this` doit être explicitement typé

**Exemple correct** :
```typescript
// ❌ Mauvais
function getUser(id) {  // any implicite
  return users.find(u => u.id === id);  // peut retourner undefined
}

// ✅ Bon
function getUser(id: string): User | undefined {
  return users.find(u => u.id === id);
}
```

### 🧪 Tests

#### Tests Backend (JUnit 5 + Mockito)

**Structure** : `src/test/java/com/taskforce/tf_api/`

**Outils** :
- JUnit 5 (`@Test`, `@BeforeEach`)
- Mockito (`@Mock`, `@InjectMocks`)
- Spring Boot Test (`@SpringBootTest`, `@WebMvcTest`)
- AssertJ pour assertions fluides

**Pattern à suivre** (voir `AuthServiceTest.java`) :

```java
@ExtendWith(MockitoExtension.class)
public class AuthServiceTest {
    
    @Mock
    private KeycloakService keycloakService;
    
    @Mock
    private UserRepository userRepository;
    
    @InjectMocks
    private AuthService authService;
    
    @BeforeEach
    void setUp() {
        // Setup commun
    }
    
    @Test
    void testRegister_ShouldCreateUser_WhenValidRequest() {
        // Given (Arrange)
        RegisterRequest request = new RegisterRequest(...);
        when(userRepository.existsByEmail(any())).thenReturn(false);
        
        // When (Act)
        RegisterResponse response = authService.register(request);
        
        // Then (Assert)
        assertThat(response).isNotNull();
        verify(userRepository).save(any());
    }
}
```

**Commandes** :

```bash
# Lancer tous les tests
./mvnw test

# Lancer un test spécifique
./mvnw test -Dtest=AuthServiceTest

# Avec couverture JaCoCo
./mvnw clean test jacoco:report
# Rapport dans: target/site/jacoco/index.html
```

**Types de tests** :

| Annotation | Usage | Exemples |
|------------|-------|----------|
| `@SpringBootTest` | Tests d'intégration complets | Test du contexte Spring |
| `@WebMvcTest` | Tests controllers uniquement | Mock service layer |
| `@DataJpaTest` | Tests repositories JPA | Test requêtes DB |
| `@MockitoExtension` | Tests unitaires avec mocks | Tests services |

#### Tests Frontend

**Structure** : À côté des composants (`*.test.tsx`)

**Outils recommandés** :
- Jest ou Vitest
- React Testing Library
- MSW (Mock Service Worker) pour les API

**Pattern recommandé** :

```typescript
import { render, screen } from '@testing-library/react';
import { LoginForm } from './LoginForm';

describe('LoginForm', () => {
  it('should render email and password fields', () => {
    render(<LoginForm />);
    
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
  });
  
  it('should show error on invalid email', async () => {
    // Test validation
  });
});
```

### 📈 Couverture de Code (JaCoCo)

**Configuration** : `pom.xml` avec plugin JaCoCo

**Objectifs de couverture** :
- Minimum : 70% pour les services
- Minimum : 60% pour les controllers
- Optionnel pour les DTOs/Entities

**Générer le rapport** :

```bash
mvn clean test jacoco:report
```

**Consulter** : Ouvrir `backend/tf-api/target/site/jacoco/index.html`

### 🔒 Sécurité & Validation

#### Frontend

- ✅ **Sanitize inputs** : Utiliser `sanitizeInput()` de `lib/utils/validation.ts`
- ✅ **Validation côté client** : React Hook Form + Zod
- ✅ **XSS Prevention** : DOMPurify (via `isomorphic-dompurify`)
- ✅ **CSRF** : Tokens dans headers Axios
- ✅ **Secrets** : Variables d'env (`NEXT_PUBLIC_*` pour client-side seulement)

#### Backend

- ✅ **Validation** : `@Valid` sur DTOs, annotations JSR-303
- ✅ **SQL Injection** : Utiliser JPA/JPQL, pas de SQL brut
- ✅ **Authentication** : Keycloak OAuth2 sur tous les endpoints
- ✅ **Authorization** : `@PreAuthorize` ou `SecurityConfig`
- ✅ **Secrets** : Variables d'env, jamais en dur dans le code

---

## ✅ Checklist de Vérification

Avant toute modification, vérifier la **cohérence** dans :

### Pour un changement de configuration DEV

- [ ] `.env.dev` (variables Docker)
- [ ] `frontend/.env.local` (dev local hors Docker)
- [ ] `docker-compose.dev.yml` (services + ports + env override)
- [ ] `backend/tf-api/src/main/resources/application-dev.yml`
- [ ] `keycloak/realms/dev/taskforce-dev-realm.json`

### Pour un changement de code Backend

- [ ] DTO créés/modifiés (`*Request.java`, `*Response.java`)
- [ ] Service métier (`*Service.java`)
- [ ] Controller REST (`*Controller.java`)
- [ ] Repository si nécessaire (`*Repository.java`)
- [ ] Migration Flyway si changement DB (`V{n}__description.sql`)
- [ ] **Tests unitaires** (au moins les services critiques)
- [ ] Lancer tests : `./mvnw test`

### Pour un changement de code Frontend

- [ ] Types TypeScript (interfaces)
- [ ] Service API (`lib/api/*-service.ts`)
- [ ] Composant UI (`components/**/*.tsx`)
- [ ] Validation Zod si formulaire (`lib/validations/`)
- [ ] Traductions (constants_en + constants_fr)
- [ ] Lancer linter : `npm run lint`

---

## 🚫 Anti-Patterns à Éviter

### ❌ Ne JAMAIS faire

1. **Champs optionnels par simplicité** - Découper en endpoints séparés
2. **Hardcoder des valeurs** - Utiliser variables d'environnement
3. **Mélanger `localhost` et noms de services Docker** - Vérifier le contexte
4. **Ignorer les migrations Flyway** - Toujours créer une migration pour les changements DB
5. **Commit avec message vague** - Respecter les conventions
6. **Modifier application.yml au lieu de application-dev.yml** - Attention à l'environnement
7. **Créer des PR sans label `release:*`** - PR sera bloquée
8. **Utiliser `any` en TypeScript** - Toujours typer explicitement
9. **Oublier les tests** - Au moins les fonctionnalités critiques
10. **Ne pas lancer le linter avant commit** - Evite les erreurs en CI

### ✅ Bonnes Pratiques

1. **Lire d'abord, agir ensuite** - Comprendre le contexte avant de modifier
2. **Vérifier la cohérence multi-fichiers** - Un changement peut impacter plusieurs configs
3. **Typage strict** - TypeScript + Java avec types explicites
4. **Architecture par couches** - Controller → Service → Repository
5. **Nommage explicite** - `selectPlan()` plutôt que `step2()`
6. **Tests si possible** - Au moins les endpoints/services critiques
7. **Code review** - Relire son code avant PR
8. **Commits atomiques** - Un commit = une fonctionnalité/fix
9. **Documentation du code** - JavaDoc pour public APIs, JSDoc pour fonctions complexes
10. **Validation côté client ET serveur** - Ne jamais faire confiance au client

---

## 🛠️ Commandes Utiles

### Développement

```powershell
# Démarrer l'environnement
.\dev-docker.ps1

# Arrêter l'environnement
.\stop-dev.ps1

# Voir les logs
docker logs taskforce-backend-dev -f
```

### Backend

```bash
# Tests
./mvnw test

# Test spécifique
./mvnw test -Dtest=AuthServiceTest

# Build
./mvnw clean install

# Couverture de code
./mvnw clean test jacoco:report

# Lancer localement (hors Docker)
./mvnw spring-boot:run
```

### Frontend

```bash
# Dev
npm run dev

# Build
npm run build

# Lint
npm run lint

# Lint + fix
npm run lint -- --fix

# Tests (si configurés)
npm test
```

---

## 📖 Documentation de Référence

- **Git Workflow** : `taskforce-docs/developpeur/git-workflow/`
- **Architecture Backend** : `backend/tf-api/ARCHITECTURE.md`
- **Architecture Globale** : `taskforce-docs/technique/Architecture.md`
- **API Spec** : `backend/tf-api/API_SPECIFICATION.md`
- **Setup Dev** : `taskforce-docs/developpeur/quickstart/`
- **Quickstart** : `QUICKSTART.md`

---

## 🎯 Résumé - À Retenir

1. ✅ **Vérifier avant d'agir** - Lire les fichiers concernés
2. ✅ **Cohérence multi-fichiers** - Vérifier tous les fichiers de l'environnement
3. ✅ **Conventions de commits strictes** - `type(scope): description`
4. ✅ **Architecture professionnelle** - Pas de raccourcis "par flemme"
5. ✅ **Docker networking** - Services = noms, localhost = hôte
6. ✅ **TypeScript strict** - Pas de `any`, tout typer
7. ✅ **Tests obligatoires** - Au moins pour le code critique
8. ✅ **Linter avant commit** - `npm run lint` / `mvn verify`
9. ❌ **Ne JAMAIS lancer sans demander** - L'utilisateur décide quand exécuter
10. ❌ **Ne JAMAIS utiliser Start-Sleep** - Inutile et contre-productif

---

**Dernière mise à jour** : 2026-02-14  
**Version** : 1.1.0
