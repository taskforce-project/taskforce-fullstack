# AGENTS.md - AI Coding Assistant Guide

## Project Overview
Spring Boot 4 REST API for Taskforce ERP with modular architecture. Uses Java 21+, PostgreSQL, Keycloak (OAuth2/OIDC), and Stripe. Built on 3-tier architecture: `shared/` → `core/` → `modules/`.

## Critical Architecture Principles

**Dependency Flow (NEVER VIOLATE):**
```
shared/ ← core/ ← modules/
```
- `shared/`: Framework-level utilities (security, exceptions, DTOs). Zero business dependencies.
- `core/`: Base ERP entities (User, Company, Role). Uses `shared/` only. NEVER import from `modules/`.
- `modules/`: Optional features (chat, ged, taskforceHorizon). Can use both `shared/` and `core/`.

**Package Structure (Strict Convention):**
```
module_name/
├── api/         # @RestController endpoints
├── domain/      # @Entity JPA entities (extend AuditableEntity)
├── service/     # @Service business logic (@Transactional)
├── repository/  # JpaRepository interfaces
└── dto/         # request/ and response/ DTOs
```

## Development Workflow

**Environment Setup:**
```powershell
# 1. Copy .env template (REQUIRED before first run)
copy .env.dev.example .env.dev

# 2. Run application (loads .env.dev automatically)
mvn spring-boot:run

# 3. Access Swagger UI
# http://localhost:8081/api/swagger-ui.html
```

**Testing & Quality:**
```powershell
mvn test                    # Run all tests
mvn clean test jacoco:report # Coverage report in target/site/jacoco/index.html
```

**Profile Switching:**
- Dev: `SPRING_PROFILE=dev` in `.env.dev` (default)
- Prod: `SPRING_PROFILE=prod` in `.env.prod`
- Profiles load corresponding `application-{profile}.yml`

## Code Patterns (Project-Specific)

**1. Response Wrapping (MANDATORY):**
All endpoints return `ApiResponse<T>` from `shared/dto/`:
```java
return ResponseEntity.ok(ApiResponse.success("Message", data));
return ResponseEntity.badRequest().body(ApiResponse.error("Error message"));
```

**2. Entity Auditing (ALWAYS EXTEND):**
All entities extend `AuditableEntity` (shared/audit/):
```java
@Entity
public class MyEntity extends AuditableEntity {
    // Auto-populates: createdAt, updatedAt, createdBy, updatedBy
}
```

**3. Exception Handling (Use Custom Exceptions):**
- `ResourceNotFoundException` → 404
- `BusinessException(errorCode, message)` → 400
- `GlobalExceptionHandler` captures all, standardizes responses

**4. Controller Rules (Keep Minimal):**
- Controllers delegate EVERYTHING to services (1-liner methods)
- Use `@Valid` for automatic DTO validation
- Use `@PreAuthorize` for security (when Keycloak enabled)
- Example: See `AuthController.java` for pattern

**5. i18n Messages:**
- Backend: `i18n/messages_{locale}.properties`
- Use `Accept-Language: fr|en` header
- Error messages internationalized via MessageSource

## Database Migrations (Flyway)

**Versioning Scheme:** `V{N}__{description}.sql`
```sql
-- Example: V8__add_invoice_module.sql
CREATE TABLE invoices (...);
CREATE INDEX idx_invoices_user_id ON invoices(user_id);
```

**Key Rules:**
- NEVER modify existing migrations
- Always add new migration with incremented version
- Migrations run automatically on startup
- See `/src/main/resources/db/migration/` for examples

## Security & Authentication

**Keycloak Toggle:**
- `keycloak.enabled=false` → Permits all (dev mode)
- `keycloak.enabled=true` → Full OAuth2/JWT validation (default)
- Config in `SecurityConfig.java` with `@ConditionalOnProperty`

**Public Endpoints:** `/api/auth/**`, `/api/stripe/**`, `/actuator/**`, `/swagger-ui/**`

**Protected Endpoints:** Everything else requires valid JWT from Keycloak

## External Integrations

**1. Keycloak (User Management):**
- Admin client in `core/service/KeycloakService.java`
- Users created in Keycloak via `keycloak.realm-url`
- JWT tokens validated via `spring.security.oauth2.resourceserver.jwt.issuer-uri`

**2. Stripe (Subscriptions):**
- Webhook handler: `StripeWebhookController.java`
- Plans: FREE, PRO, ENTERPRISE
- Stripe events trigger user plan updates

**3. Email (OTP & Notifications):**
- JavaMailSender in `EmailService.java`
- SMTP config in `application-{profile}.yml`
- Templates: `/resources/templates/email/`

## Key Files Reference

- **Entry Point:** `TfApiApplication.java` (loads `.env.{profile}` via Dotenv)
- **Security:** `shared/security/SecurityConfig.java` (dual OAuth2/non-OAuth config)
- **Error Handling:** `shared/exception/GlobalExceptionHandler.java`
- **Base Entity:** `shared/audit/AuditableEntity.java`
- **Response Wrapper:** `shared/dto/ApiResponse.java`
- **Auth Flow:** `core/api/AuthController.java` (3-step: register → select-plan → verify-otp)
- **API Contract:** `API_SPECIFICATION.md` (frontend-backend agreement)

## Common Pitfalls

1. **DON'T** return JPA entities from controllers (use DTOs)
2. **DON'T** put business logic in controllers (use services)
3. **DON'T** make `core/` depend on `modules/` (violates architecture)
4. **DON'T** modify existing Flyway migrations (create new ones)
5. **DO** use `@Transactional` on service write methods
6. **DO** map entities to DTOs in services before returning
7. **DO** extend `AuditableEntity` for all domain entities
8. **DO** wrap all responses in `ApiResponse<T>`

## Quick Reference Commands

```powershell
# Build & skip tests
mvn clean package -DskipTests

# Run specific test
mvn test -Dtest=AuthServiceTest

# Docker build
docker build -t taskforce-api:latest .

# Check config (custom script)
.\check-config.bat
```

---
**Last Updated:** Based on codebase analysis 2026-03

