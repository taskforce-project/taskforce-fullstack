# Taskforce — Backlog actif

> Dernière mise à jour : 2026-05-31  
> Ce fichier ne garde que le reste à faire. Les phases terminées à 100% sont sorties du backlog courant.

---

## Résumé

| Bloc | Statut | Notes |
| --- | --- | --- |
| Phases 1, 2, 2.5, 3 | ✅ Terminé | Retirées du backlog actif |
| Correctifs transverses | 🔄 À traiter | Sécurité chat, scope GED, avatars |
| Phase 4 — IA | ⏳ Priorité haute | Spec figée dans `docs/phase4-ia-architecture.md` |
| QA manuelle | ⏳ Après Phase 4 | Parcours critiques |
| Tests automatisés | ⏳ À compléter | Backend + frontend + E2E |

---

## Correctifs transverses avant QA finale

| # | Tâche | Statut | Notes |
| --- | --- | --- | --- |
| X.1 | Verrouiller les subscriptions STOMP par appartenance au canal | ⏳ | L'auth CONNECT existe, pas le contrôle d'accès sur SUBSCRIBE |
| X.2 | Vérifier le scope `workspace / project / issue` dans les endpoints attachments | ⏳ | Empêcher l'accès par simple `issueId` ou `attachmentId` |
| X.3 | Fiabiliser les avatars Minio en multi-origin | ⏳ | URL relative backend à rendre robuste côté frontend |
| X.4 | Repasser le chat temps réel en revue côté sécurité et fallback | ⏳ | RabbitMQ relay, broker in-memory, erreurs WS |
| X.5 | QA ciblée GED / avatar / chat avant fermeture du lot | ⏳ | Vérification manuelle avant E2E |

---

## Phase 4 — Implémentation IA

> Choix définitif : orchestration métier en Java, service IA interne en Python, stockage vectoriel dans PostgreSQL via pgvector, inférence LLM via Groq.

### 4A — Infra IA

| # | Tâche | Statut | Notes |
| --- | --- | --- | --- |
| 4.1 | Basculer PostgreSQL dev vers une image avec extension pgvector | ⏳ | `pgvector/pgvector:pg18` ou image custom équivalente |
| 4.2 | Ajouter `CREATE EXTENSION IF NOT EXISTS vector` au bootstrap DB | ⏳ | Init SQL + documentation d'env |
| 4.3 | Créer le service interne `ai-service` (FastAPI) dans le compose dev | ⏳ | Service non exposé publiquement |
| 4.4 | Ajouter la config IA (`AI_SERVICE_URL`, `GROQ_*`, `EMBEDDING_MODEL`) | ⏳ | Backend Java + Python |

### 4B — Modèle de données IA

| # | Tâche | Statut | Notes |
| --- | --- | --- | --- |
| 4.5 | Migration `ai_documents` + embeddings pgvector | ⏳ | Chunks RAG multi-sources |
| 4.6 | Migration `member_skill_profiles` + embedding de profil | ⏳ | Compétences et contexte membre |
| 4.7 | Migration `assignment_events` + feedback d'assignation | ⏳ | Historique pour ranking |
| 4.8 | Migration `ai_insight_snapshots` + `ai_runs` | ⏳ | Audit, coût, cache, observabilité |

### 4C — Smart Assign

| # | Tâche | Statut | Notes |
| --- | --- | --- | --- |
| 4.9 | Implémenter le moteur de décision Java (règles, workload, garde-fous) | ⏳ | Score final décidé côté Spring Boot |
| 4.10 | Implémenter le scoring sémantique Python (embeddings + cosine) | ⏳ | `sentence-transformers` + pgvector |
| 4.11 | Ajouter le ranking historique ML dans `ai-service` | ⏳ | V1: LightGBM/XGBoost ou MLP léger |
| 4.12 | Exposer `POST /api/workspaces/{slug}/projects/{projectId}/issues/{issueId}/smart-assign` | ⏳ | Réponse avec score, explication, alternatives |
| 4.13 | Remplacer le mock de `SmartAssignPanel` par l'endpoint réel | ⏳ | Supprimer `TEAM_PROFILES` et `setTimeout` |

### 4D — Assistant IA & RAG

| # | Tâche | Statut | Notes |
| --- | --- | --- | --- |
| 4.14 | Construire le pipeline d'indexation RAG (issues, pages, discussions, analytics) | ⏳ | Pas de messages chat en V1 |
| 4.15 | Ajouter le retrieval Python filtré par workspace et source | ⏳ | `top-k` vectoriel + filtres metadata |
| 4.16 | Exposer `POST /api/workspaces/{slug}/assistant/stream` en SSE | ⏳ | Streaming frontend via backend Java |
| 4.17 | Connecter `agents/page.tsx` au streaming backend réel | ⏳ | Remplacer l'adapter local mock |
| 4.18 | Connecter `assistant-fab.tsx` au même backend IA | ⏳ | Un seul runtime réel |

### 4E — AI Insights

| # | Tâche | Statut | Notes |
| --- | --- | --- | --- |
| 4.19 | Exposer `GET /api/workspaces/{slug}/analytics/ai-insights` | ⏳ | KPIs + blocages + résumé |
| 4.20 | Générer et mettre en cache les insights par snapshot | ⏳ | On-demand puis pré-calcul |
| 4.21 | Brancher dashboard sur les insights réels | ⏳ | Remplacer `AI_INSIGHTS`, `EXCEPTIONS`, `AGENTS` statiques |

### 4F — Qualité & exploitation

| # | Tâche | Statut | Notes |
| --- | --- | --- | --- |
| 4.22 | Journaliser prompts, coûts, latence, fallback, score final | ⏳ | `ai_runs` + logs applicatifs |
| 4.23 | Ajouter feature flags IA (`enabled`, `smartAssign`, `assistant`, `insights`) | ⏳ | Désactivation granulaire |
| 4.24 | Ajouter garde-fous de quota et timeout | ⏳ | Groq, ai-service, vector search |
| 4.25 | Ajouter dataset de seed / fixtures pour tests IA | ⏳ | Démo locale reproductible |

---

## QA manuelle

| # | Scénario | Statut | Notes |
| --- | --- | --- | --- |
| QA.1 | Smart Assign sur issue backend / frontend / ops / no-label | ⏳ | Vérifier ranking, fallback et alternatives |
| QA.2 | Assistant IA sur workspace réel | ⏳ | Streaming, citations, filtres de scope |
| QA.3 | AI Insights dashboard | ⏳ | Cohérence avec les analytics réelles |
| QA.4 | Chat temps réel après durcissement sécurité | ⏳ | SUBSCRIBE, SEND, reconnect |
| QA.5 | Upload pièce jointe + suppression + téléchargement | ⏳ | Scope, Minio, droits |
| QA.6 | Avatar utilisateur uploadé et affiché partout | ⏳ | Frontend, sidebar, settings |

---

## Tests automatisés

| # | Tâche | Statut | Notes |
| --- | --- | --- | --- |
| T.1 | Tests unitaires moteur Smart Assign Java | ⏳ | Pondérations, hard rules, fallback |
| T.2 | Tests Python `ai-service` (embeddings, retrieval, ranking) | ⏳ | FastAPI + pytest |
| T.3 | Tests controllers IA backend | ⏳ | Smart Assign, Assistant SSE, Insights |
| T.4 | Tests frontend `SmartAssignPanel` et assistant runtime | ⏳ | Vitest + RTL |
| T.5 | Tests intégration pgvector / migrations | ⏳ | DB dev avec extension vector |
| T.6 | E2E Playwright sur parcours IA critiques | ⏳ | Smart Assign, assistant, insights |

---

## Ordre d'exécution recommandé

1. Corriger X.1 à X.3.
2. Livrer 4.1 à 4.8 pour poser le socle IA.
3. Implémenter Smart Assign 4.9 à 4.13.
4. Implémenter Assistant et RAG 4.14 à 4.18.
5. Implémenter AI Insights 4.19 à 4.21.
6. Fermer qualité, QA et tests automatiques.
