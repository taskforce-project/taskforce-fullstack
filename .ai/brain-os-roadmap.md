# Roadmap — Brain OS (couche de connaissance native TaskForce)

> **Statut** : Phase 0 en cours · **Branche** : `feat/dashboard` · **Maj** : 2026-06-27
> Document maître de la feature « Brain OS ». Source de vérité produit → `../taskforce-docs`.

## 0. Vision en une phrase

**TaskForce est le GUI ; Brain OS est le moteur de mémoire.** Chaque décision, avancement,
obstacle et artefact d'un workspace est stocké dans un **graphe de connaissance** interrogeable
par l'humain *et* par l'IA. L'IA répond, décide et **réécrit dans le graphe** (write-back) — le
cerveau grandit tout seul.

## 1. Décisions d'architecture (tranchées)

| Question | Décision | Raison |
| --- | --- | --- |
| 1 brain = quoi ? | **1 par workspace** (= 1 entreprise/produit) | Le dev invité hérite du cerveau de l'entreprise, pas du cerveau perso du fondateur. 2 entreprises = 2 workspaces = 2 brains. |
| Couche ou graphe parallèle ? | **Graphe parallèle** (`knowledge_nodes`) qui peut *pointer* vers issues/projets via `ref_type`/`ref_id` | Beaucoup de connaissances (ADR, SOP, runbook, finding) n'ont aucun équivalent dans le PM. Le graphe visuel diffère tout le temps → autonomie nécessaire. |
| Stockage contenu | **PostgreSQL** : metadata typée + `content TEXT` (markdown) ; offload MinIO si > 20 KB (`content_url`) | Pas de NoSQL. PG = vector store + graph store + doc store. |
| Vectors | **pgvector `vector(384)`** (`all-MiniLM-L6-v2`, déjà configuré), index **HNSW** cosine | 4× plus léger qu'OpenAI 1536, suffisant intra-workspace. |
| Édition | **Humain ET IA** écrivent dans le même graphe | Un ADR écrit à la main vaut un généré. |
| Permissions v1 | **Tout le monde voit tout** (pas de confidentiel au début). Rôles = filtrage d'affichage plus tard. | Démarrer simple ; les agents C-level (CEO/CTO/CFO…) viendront avec la **marketplace** (Phase 5). |
| Onboarding | **Templates experts** (SaaS / Ecom / Marketplace / Agentic) **+ Blank brain** (16 domaines vides) | Architecture haut niveau dès le départ, ou table rase. |
| Groq absent | **Dégradation gracieuse** (déjà en place : `AssistantService.fallbackAnswer`) | Jamais de 500 si la clé manque. |

### Structure d'un brain (16 domaines, inspirés du vault Obsidian Brain OS)

```
01-projet   02-produit   03-architecture   04-engineering   05-api
06-infra    07-securite  08-operations     09-audits        10-runbooks
11-pca-pra  12-decisions 13-roadmap        14-design        15-utilisateur
16-historique-actions    (20-archive)
```

Types de nodes : `ADR · DECISION · RUNBOOK · SOP · FINDING · CHANGELOG · DOC · SPEC · NOTE · README · TEMPLATE · ACTION_OODA`.

## 2. Modèle de données

### Phase 0 (relationnel pur — V51, zéro risque de boot)

```
brain_workspaces (id, workspace_id UNIQUE, template_type, version_label, audit…)

knowledge_nodes  (id, uuid, workspace_id, brain_id, type, domain, title,
                  content TEXT, content_url, status, version_label,
                  ref_type, ref_id, metadata JSONB, audit…)

knowledge_edges  (id, workspace_id, from_node_id, to_node_id, relation_type,
                  weight, UNIQUE(from,to,relation))
```

### Phase 1 (vector — V52)

```
ALTER TABLE knowledge_nodes ADD COLUMN embedding vector(384);
CREATE INDEX … USING hnsw (embedding vector_cosine_ops);
```

> On **sépare** volontairement le relationnel (V51) du vector (V52) : si pgvector/HNSW posait
> problème, le boot du backend n'est jamais bloqué. Phase 0 reste démontrable sans IA.

### Relations (`relation_type`)

`RELATES_TO · SUPERSEDES · CAUSED_BY · DECISION_OF · DEPENDS_ON · IMPLEMENTS · REFERENCES`

## 3. Le moteur IA

### Routing fast / deep

```
Message → IntentClassifier (Groq llama-3.1-8b, ~50ms)
  ├── factual / simple   → FAST  : retrieval brain → Groq 8b
  └── decision/strategy  → DEEP  : retrieval brain → Claude Opus 4.8 + tool calling + write-back
```

### Pipeline de retrieval

1. embedding du query (`all-MiniLM-L6-v2`)
2. top-k nodes (pgvector cosine, filtre `domain` optionnel)
3. **graph expansion** (voisins via `knowledge_edges`)
4. ranking (recency + type + similarité)
5. compression si contexte > 8K tokens

### A\* — context-walk sous budget de tokens (enhancement Phase 1/2, optionnel)

Pour les questions « comment est-on passé de X à l'archi actuelle » : marche guidée dans le graphe.
`f(n) = g(n) + h(n)` où `g(n)` = coût tokens accumulé, `h(n)` = distance sémantique au query.
On étend la frontière (priority queue) en priorisant faible coût + forte pertinence, jusqu'à
épuiser le budget de contexte. Donne une chaîne de raisonnement traçable plutôt qu'un simple top-k.
**Pas dans le cœur** — vector kNN + expansion 1-hop suffit pour le MVP.

## 4. Estimation de stockage (100k users)

```
100 000 users × 5 workspaces × 50 nodes ≈ 25 M nodes
Contenu markdown : 25M × 3KB        ≈  75 GB  (TEXT)
Vectors 384      : 25M × 1.5KB      ≈  37 GB  (pgvector)
Index HNSW       : ~2× vecteurs     ≈  74 GB
Edges + metadata : 25M × 500B       ≈  12 GB
Large files MinIO: ~5% > 20KB       ≈  20 GB
TOTAL                                ≈ 218 GB
```

**Compression / scale à terme (Phase 5)** : `float16` (÷2 vecteurs), partitionnement PG par
`workspace_id` au-delà de ~10M nodes, archivage cold (node inactif > 6 mois → MinIO + drop vecteur).

## 5. Phases

### Phase 0 — Fondation (schema & data layer) · ✅ **fait & vérifié e2e**
- [x] V51 : `brain_workspaces`, `knowledge_nodes`, `knowledge_edges` (relationnel)
- [x] Enums + entités JPA (extends `AuditableEntity`)
- [x] Repositories + DTOs (request/response, enveloppe `ApiResponse`)
- [x] `BrainTemplateService` : templates experts (SAAS/ECOMMERCE/MARKETPLACE/AGENTIC) + Blank (17 READMEs)
- [x] Hook `WorkspaceService` (inscription → BLANK ; création explicite → `brainTemplate`) → auto-seed atomique
- [x] `KnowledgeController` sous `/api/workspaces/{slug}/brain` (CRUD nodes + edges, auth `WorkspaceMember`)
- [x] Compile (BUILD SUCCESS) + Flyway V51 appliquée + `ddl-auto=validate` OK + smoke tests API

> **Vérifié** : login → POST workspace `{brainTemplate:"SAAS"}` → brain auto-seedé (23 nodes), overview
> groupé par domaine ; create node/edge OK ; garde-fous 400 (enum/self-edge) & 409 (doublon) ;
> attribution `createdBy` ; suppression workspace → cascade `knowledge_nodes` = 0.
> **Endpoints** : `GET /brain` · `GET|POST /brain/nodes` · `GET|PATCH|DELETE /brain/nodes/{id}` · `POST|DELETE /brain/edges[/{id}]`.

### Phase 1 — Embedding & retrieval (ai-service FastAPI)
- V52 : colonne `embedding vector(384)` + index HNSW
- Worker RabbitMQ `brain.embed` (consumer → `all-MiniLM-L6-v2` réel, remplace le vecteur hash placeholder)
- `POST /brain/search` (cosine + graph expansion) ; proxy Java `BrainSearchService` + cache
- Write-back engine (`POST /brain/nodes` depuis l'IA, upsert + auto-edges)

### Phase 2 — IA context-aware + router fast/deep
- `IntentClassifier` (Groq 8b)
- Context Builder v2 (retrieval brain + issues liées + décisions 12)
- `AnthropicService` (Claude Opus 4.8, tool calling : `create_node`, `create_task`)
- Chat enrichi : badge Fast/Deep, sources citées, actions cliquables

### Phase 3 — Brain OS UI (frontend Next.js)
- Graph Viewer (`react-flow` ou d3-force), nodes colorés par domaine
- Node editor markdown (tiptap/codemirror), versions, lien ref issue/projet
- Domain navigator (sidebar 01→16) + recherche sémantique live
- Onboarding wizard (choix template, questions business → pré-peuplement)
- **Décision UX** : onglet *dans* le workspace, pas une app séparée (`/brain`)

### Phase 4 — Issues enrichies + human-in-the-loop
- Decision log par issue (obstacles/solutions/liens ADR), node lié auto (`ref_type=ISSUE`)
- « Déjà vu ? » : similarity search à la création d'issue
- HITL : l'IA propose → `pending_approval` → approve/reject/modify
- Code agent optionnel : issue → Claude implémente (conventions lues dans `04-engineering`) → PR draft → review humaine

### Phase 5 — Marketplace (moat)
- Brain Packs (SaaS/Ecom… nodes pré-remplis), templates ADR sectoriels
- Agent Packs C-level (CTO/CPO/CFO/CEO) — pseudo-board OODA
- Pont Obsidian (export/import vault ; TaskForce = source of truth → résout le problème du ZIP à re-télécharger)
- Data management : partitionnement, float16, archivage cold

## 6. Contraintes (règles d'or TaskForce)

- Tout contrôleur porte `/api`. Routes front dans `lib/config/api-routes.ts` → service `lib/api/*`.
- Lecture via `response.data.data`. Couches `shared ← core ← modules`.
- Changement DB = migration Flyway `V{n}__…` (jamais éditer une migration appliquée).
- TS strict, pas de `any`, un store Zustand par domaine, zéro mock.
- Auth au niveau service (`WorkspaceMember`/`ProjectMember`).
- MAJ Brain OS frère (`../taskforce-docs`) + ce fichier selon la DoD.
