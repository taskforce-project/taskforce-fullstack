# Supervision & alertes — TaskForce (RNCP E26)

> **Sondes + alertes + journalisation** = compétence C32 / livrable E26. La journalisation (E25) est
> traitée à part (audit `AuditLog` + logs applicatifs + erreurs client `POST /api/logs/client`). Ce
> document couvre la **supervision** (métriques/sondes) et les **règles d'alerte**.

## 1. Sondes en place

| Sonde | Source | Détail |
| --- | --- | --- |
| **Santé** | `GET /actuator/health` | liveness/readiness (DB, MinIO, Keycloak, RabbitMQ) |
| **Métriques** | `GET /actuator/prometheus` | Micrometer : HTTP (latence/statuts), JVM (heap/GC), Hikari (pool DB), système (CPU) |
| **Traces / logs / métriques** | **OpenTelemetry → SigNoz** (agent Java, `docker-compose.tools.yml`) | traces distribuées, corrélation logs↔traces (opt-in : profil observability + `OTEL_SDK_DISABLED=false`) |
| **Infra conteneurs** | Docker healthchecks | `depends_on: condition: service_healthy` |

## 2. Règles d'alerte

Définies dans [`prometheus-rules.yml`](./prometheus-rules.yml) (format Prometheus, standard & portable).

| Alerte | Condition | Sévérité |
| --- | --- | :--: |
| **BackendDown** | `up == 0` 2 min | 🔴 critical |
| **HealthDown** | health ≠ 200 3 min | 🔴 critical |
| **HighServerErrorRate** | 5xx > 5 % du trafic 5 min | 🟠 warning |
| **HighLatencyP95** | p95 > 1 s 5 min | 🟠 warning |
| **HighJvmHeap** | heap > 90 % 5 min | 🟠 warning |
| **DbConnectionPoolSaturated** | Hikari pending > 0 3 min | 🟠 warning |
| **HighCpuUsage** | CPU > 90 % 5 min | 🟠 warning |
| **RateLimitSpike** | pic de 429 (brute-force) | 🟠 warning |
| **AuthFailureSpike** | pic de 401 `/login` (credential stuffing) | 🟠 warning |

## 3. Application

### Option A — SigNoz (stack en place)
1. Lever la stack : `docker compose -f docker-compose.tools.yml up -d` (SigNoz UI → http://localhost:3301).
2. Activer l'export OTEL du backend : `OTEL_SDK_DISABLED=false` dans `.env.dev`, rebuild backend.
3. SigNoz ingère `/actuator/prometheus` via le receiver `prometheus` de l'otel-collector.
4. Créer les alertes **dans l'UI SigNoz** (Alerts → New) en reprenant les conditions du tableau ci-dessus,
   et brancher un **canal de notification** (Slack / email / webhook).

### Option B — Prometheus + Alertmanager (portable)
1. `rule_files: [ observability/alerts/prometheus-rules.yml ]` dans `prometheus.yml`.
2. Scrape job `taskforce-backend` → `backend:8080/actuator/prometheus`.
3. Router les alertes via **Alertmanager** vers le canal choisi.

## 4. Prérequis métrique (p95)
L'alerte `HighLatencyP95` nécessite l'histogramme Micrometer :
```yaml
management.metrics.distribution.percentiles-histogram.http.server.requests: true
```
(les autres alertes fonctionnent avec les métriques par défaut).

## 5. Notifications
Canaux recommandés (à configurer selon l'hébergement) : **email** (équipe) pour warning,
**Slack/webhook** temps réel pour critical. Le RTO/RPO du [PS/PCA-PRA](../../taskforce-docs/v1/11-pca-pra/PS_PCA_PRA.md)
guide les délais de réaction.
