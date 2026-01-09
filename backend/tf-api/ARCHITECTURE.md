# 🏗️ Architecture Backend - Taskforce API

## 📁 Structure Complète (avec exemples supplémentaire pour bien comprendre la structure)

```
tf-api/
├── src/
│   ├── main/
│   │   ├── java/com/taskforce/tf_api/
│   │   │   ├── TfApiApplication.java          # Point d'entrée
│   │   │   │
│   │   │   ├── shared/                        # PARTAGÉ (utilisé par tout le monde)
│   │   │   │   ├── config/                    # Configurations globales
│   │   │   │   │   ├── SecurityConfig.java    # Spring Security + OAuth2/Keycloak
│   │   │   │   │   ├── KeycloakConfig.java    # Configuration Keycloak
│   │   │   │   │   ├── CorsConfig.java        # CORS
│   │   │   │   │   ├── OpenApiConfig.java     # Swagger/OpenAPI
│   │   │   │   │   ├── JpaConfig.java         # JPA + Auditing
│   │   │   │   │   └── I18nConfig.java        # Internationalisation FR/EN
│   │   │   │   │
│   │   │   │   ├── exception/                 # Gestion erreurs globale
│   │   │   │   │   ├── GlobalExceptionHandler.java
│   │   │   │   │   ├── ResourceNotFoundException.java
│   │   │   │   │   └── BusinessException.java
│   │   │   │   │
│   │   │   │   ├── dto/                       # DTOs communs
│   │   │   │   │   ├── ApiResponse.java       # Wrapper réponses
│   │   │   │   │   ├── ErrorResponse.java     # Réponses d'erreur
│   │   │   │   │   └── PageResponse.java      # Pagination
│   │   │   │   │
│   │   │   │   ├── security/                  # Utilitaires sécurité
│   │   │   │   │   ├── SecurityUtils.java     # Utils JWT/User
│   │   │   │   │   └── CurrentUser.java       # Annotation @CurrentUser
│   │   │   │   │
│   │   │   │   └── audit/                     # Auditing
│   │   │   │       └── AuditableEntity.java   # Classe abstraite (createdAt, updatedAt...)
│   │   │   │
│   │   │   ├── core/                          # BASE de l'ERP (OBLIGATOIRE)
│   │   │   │   ├── api/                       # Controllers REST
│   │   │   │   │   ├── UserController.java
│   │   │   │   │   ├── CompanyController.java
│   │   │   │   │   └── RoleController.java
│   │   │   │   │
│   │   │   │   ├── domain/                    # Entities JPA
│   │   │   │   │   ├── User.java
│   │   │   │   │   ├── Company.java
│   │   │   │   │   └── Role.java
│   │   │   │   │
│   │   │   │   ├── service/                   # Logique métier
│   │   │   │   │   ├── UserService.java
│   │   │   │   │   ├── CompanyService.java
│   │   │   │   │   └── RoleService.java
│   │   │   │   │
│   │   │   │   ├── repository/                # Accès DB
│   │   │   │   │   ├── UserRepository.java
│   │   │   │   │   ├── CompanyRepository.java
│   │   │   │   │   └── RoleRepository.java
│   │   │   │   │
│   │   │   │   └── dto/                       # DTOs du core
│   │   │   │       ├── request/
│   │   │   │       │   ├── CreateUserRequest.java
│   │   │   │       │   └── UpdateUserRequest.java
│   │   │   │       └── response/
│   │   │   │           ├── UserResponse.java
│   │   │   │           └── CompanyResponse.java
│   │   │   │
│   │   │   └── modules/                       # MODULES (optionnels, activables)
│   │   │       │
│   │   │       ├── chat/                      # Module Chat
│   │   │       │   ├── api/
│   │   │       │   │   ├── ChatController.java
│   │   │       │   │   └── MessageController.java
│   │   │       │   │
│   │   │       │   ├── domain/
│   │   │       │   │   ├── Conversation.java
│   │   │       │   │   └── Message.java
│   │   │       │   │
│   │   │       │   ├── service/
│   │   │       │   │   ├── ChatService.java
│   │   │       │   │   └── MessageService.java
│   │   │       │   │
│   │   │       │   ├── repository/
│   │   │       │   │   ├── ConversationRepository.java
│   │   │       │   │   └── MessageRepository.java
│   │   │       │   │
│   │   │       │   └── dto/
│   │   │       │       ├── request/
│   │   │       │       └── response/
│   │   │       │
│   │   │       ├── analytics/                 # Module Analytics
│   │   │       │   ├── api/
│   │   │       │   ├── domain/
│   │   │       │   ├── service/
│   │   │       │   ├── repository/
│   │   │       │   └── dto/
│   │   │       │
│   │   │       └── ged/                       # Module GED (futur)
│   │   │           ├── api/
│   │   │           ├── domain/
│   │   │           ├── service/
│   │   │           ├── repository/
│   │   │           └── dto/
│   │   │
│   │   └── resources/
│   │       ├── application.yml                # Config commune
│   │       ├── application-dev.yml            # Config DEV
│   │       ├── application-prod.yml           # Config PROD
│   │       │
│   │       ├── i18n/                          # Internationalisation
│   │       │   ├── messages.properties        # Fallback
│   │       │   ├── messages_fr.properties     # Français
│   │       │   └── messages_en.properties     # English
│   │       │
│   │       └── db/
│   │           └── migration/                 # Migrations Flyway
│   │               ├── V1__init_schema.sql
│   │               └── V2__add_companies.sql
│   │
│   └── test/
│       └── java/com/taskforce/tf_api/
│           ├── core/
│           │   ├── service/
│           │   └── api/
│           └── modules/
│               ├── chat/
│               └── analytics/
│
├── Dockerfile                                 # Build Docker
├── .dockerignore
├── .env.dev.example                          # Template DEV
├── .env.prod.example                         # Template PROD
└── pom.xml
```

---

## 🎯 Rôle de chaque dossier

### `shared/` - Code partagé

| Dossier      | Contenu                                                        | Utilisé par    |
| ------------ | -------------------------------------------------------------- | -------------- |
| `config/`    | Configurations Spring (Security, Keycloak, CORS, JPA, i18n...) | Tout           |
| `exception/` | Gestion globale des erreurs                                    | Tout           |
| `dto/`       | DTOs réutilisables (ApiResponse, PageResponse...)              | Tout           |
| `security/`  | Utilitaires sécurité (SecurityUtils, @CurrentUser...)          | Core + Modules |
| `audit/`     | AuditableEntity (createdAt, updatedAt, createdBy...)           | Core + Modules |

### `core/` - Base de l'ERP

| Dossier         | Contenu                              |
| --------------- | ------------------------------------ |
| `api/`          | Controllers REST (`@RestController`) |
| `domain/`       | Entities JPA (`@Entity`)             |
| `service/`      | Logique métier (`@Service`)          |
| `repository/`   | Spring Data JPA (`JpaRepository`)    |
| `dto/request/`  | DTOs de requête (Create, Update...)  |
| `dto/response/` | DTOs de réponse                      |

**Entities Core :**

- `User` - Utilisateurs
- `Company` - Entreprises
- `Role` - Rôles/Permissions

### `modules/` - Modules optionnels

Chaque module suit **la même structure que Core** :

```
module_name/
├── api/         # Controllers
├── domain/      # Entities
├── service/     # Services
├── repository/  # Repositories
└── dto/         # DTOs
```

**Modules prévus :**

- `chat/` - Messagerie interne
- `analytics/` - Tableaux de bord
- `ged/` - Gestion documentaire

---

## 🔄 Dépendances entre couches

```
shared ← core ← modules
```

- **shared** : Ne dépend de rien
- **core** : Utilise `shared` uniquement
- **modules** : Utilisent `shared` + `core`

**Règle d'or :** `core` ne doit JAMAIS dépendre d'un `module` !

---

## 📝 Exemple de flux complet

### Requête : `GET /api/users/1`

```
1. UserController (core/api/)
   ↓
2. UserService (core/service/)
   ↓
3. UserRepository (core/repository/)
   ↓
4. User Entity (core/domain/)
   ↓
5. UserResponse (core/dto/response/)
   ↓
6. ApiResponse<UserResponse> (shared/dto/)
```

---

## 🌍 Internationalisation (i18n)

### Backend

- Fichiers : `i18n/messages_fr.properties` et `messages_en.properties`
- Usage : Messages d'erreur, validations, emails
- Header : `Accept-Language: fr` ou `en`

### Frontend (à venir)

- Fichiers : `fr.json`, `en.json`
- Usage : Labels, textes UI
- Librairie : `react-i18next` ou `vue-i18n`

---

## 🚀 Guide : Créer un nouveau module

### Étape 1 : Créer la structure de dossiers

```bash
modules/
└── mon_module/              # Nom du module (ex: invoicing, crm, tasks...)
    ├── api/                 # Controllers REST
    ├── domain/              # Entities JPA
    ├── service/             # Services métier
    ├── repository/          # Repositories Spring Data
    └── dto/                 # Data Transfer Objects
        ├── request/         # DTOs pour les requêtes
        └── response/        # DTOs pour les réponses
```

### Étape 2 : Créer les Entities (domain/)

**Exemple : `Invoice.java`**

```java
package ...;
import ...;

@Entity
@Table(name = "invoices")
@Getter @Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Invoice extends AuditableEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    continue;
}
```

**Points clés :**

- ✅ Hériter de `AuditableEntity` (createdAt, updatedAt...)
- ✅ Utiliser Lombok pour réduire le boilerplate
- ✅ Peut référencer des entities du `core/` (User, Company...)
- ❌ Ne JAMAIS référencer un autre module

### Étape 3 : Créer les Repositories (repository/)

**Exemple : `InvoiceRepository.java`**

```java
package ...;
import ...;

@Repository
public interface InvoiceRepository extends JpaRepository<Invoice, Long> {

    continue;
}
```

### Étape 4 : Créer les DTOs (dto/)

**Request :** `CreateInvoiceRequest.java`

```java
package ...;

import ...;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class CreateInvoiceRequest {

    continue;
}
```

**Response :** `InvoiceResponse.java`

```java
package ...;

import ...;

@Data
@Builder
public class InvoiceResponse {

    private Long id;
    continue;
}
```

### Étape 5 : Créer les Services (service/)

**Exemple : `InvoiceService.java`**

```java
package ...;

import ...;

@Service
@RequiredArgsConstructor
@Transactional
public class InvoiceService {

    continue;
}
```

**Bonnes pratiques :**

- ✅ Toute la logique métier dans le Service
- ✅ Gérer les exceptions (ResourceNotFoundException, BusinessException...)
- ✅ Mapper Entity → DTO (ne jamais retourner l'Entity directement)
- ✅ Utiliser `@Transactional` pour les opérations d'écriture

### Étape 6 : Créer les Controllers (api/)

**Exemple : `InvoiceController.java`**

```java
package ...;

import ...;

@RestController
@RequestMapping("/api/invoices")
@RequiredArgsConstructor
public class InvoiceController {

    private final InvoiceService invoiceService;

    continue;
}
```

**Règles d'or pour les Controllers :**

- ✅ **Minimaliste** : 1 ligne par méthode si possible
- ✅ Déléguer TOUT au Service
- ✅ Utiliser `@Valid` pour la validation automatique
- ✅ Retourner `ApiResponse<T>` pour uniformiser
- ✅ Utiliser `@PreAuthorize` pour la sécurité
- ❌ Pas de logique métier dans le Controller

### Étape 7 : Créer les migrations Flyway

**Fichier : `src/main/resources/db/migration/V5_create_invoices_table.sql`**

```sql
-- Table des factures
CREATE TABLE invoices (
    id BIGSERIAL PRIMARY KEY,
    continue;
);

CREATE INDEX ...;
```

**Convention de nommage :**

- `V{numéro}_{description}.sql` (ex: `V5_create_invoices_table.sql`)
- Numéros séquentiels (V1, V2, V3...)

### Étape 8 : Tester le module

**Test unitaire du Service :**

```java
package ...;

import ...;

@SpringBootTest
@Transactional
class InvoiceServiceTest {

    @Autowired
    private InvoiceService invoiceService;

    continue;
}
```

---

## 📋 Checklist : Nouveau module

Avant de considérer un module comme terminé :

- [ ] Structure de dossiers créée (`api/`, `domain/`, `service/`, `repository/`, `dto/`)
- [ ] Entities créées avec `@Entity` et héritage de `AuditableEntity`
- [ ] Repositories créés avec `JpaRepository`
- [ ] DTOs Request/Response créés avec validation (`@Valid`)
- [ ] Service créé avec `@Transactional` et gestion des exceptions
- [ ] Controller créé (minimal, délègue au Service)
- [ ] Migration Flyway créée et testée
- [ ] Tests unitaires écrits (Service)
- [ ] Tests d'intégration écrits (Controller)
- [ ] Documentation Swagger ajoutée (`@Operation`, `@Tag`)
- [ ] Testé via Swagger UI

---

## ⚠️ Règles importantes

### ✅ Ce qu'un module PEUT faire :

- Utiliser `shared/*` (config, exceptions, DTOs globaux...)
- Utiliser `core/*` (User, Company, Role...)
- Définir ses propres routes (`/api/mon-module/*`)
- Avoir sa propre logique métier

### ❌ Ce qu'un module NE PEUT PAS faire :

- Dépendre d'un autre module
- Modifier `core/` ou `shared/`
- Utiliser des entities d'autres modules
- Contourner la sécurité

---

## 🎯 Exemple de modules possibles

| Module      | Description          | Entities principales  |
| ----------- | -------------------- | --------------------- |
| `invoicing` | Facturation          | Invoice, InvoiceLine  |
| `crm`       | Gestion clients      | Contact, Opportunity  |
| `**tasks**` | Gestion de tâches    | Task, TaskComment     |
| `chat`      | Messagerie           | Conversation, Message |
| `ged`       | Gestion documentaire | Document, Folder      |
| `analytics` | Tableaux de bord     | Dashboard, Widget     |
