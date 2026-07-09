# Roadmap — Brain OS (couche de connaissance native TaskForce)

> **⏸ STAND-BY (décision 2026-06-30)** : socle **fonctionnellement complet**, on l'arrête là pour la V1.
> Reste avant gel : **tests + revue sécu** du périmètre Brain OS (mutualisés avec le chantier Tests global de l'app).
> Tout le reste (Phases 4/5, tiptap, async, marketplace, env-gated LLM) est parti en **backlog** : `.ai/backlog-post-v1.md` §1.
> Priorité désormais = clôture V1 de l'app (voir `.ai/roadmap.md`).
>
> **Statut** : Phases 0→3 **faites** · deep-path agentique **code-complet** (génération env-gated LLM) · **Branche** : `feat/dashboard` · **Maj** : 2026-06-29
>
> **Synthèse** : le Brain OS est un produit complet et utilisable — graphe neural (tags + wikilinks),
> éditeur riche (callouts/titres/couleurs/images MinIO/code, toolbar sticky), explorateur Obsidian
> 2-panneaux animé, recherche sémantique, noyau caché (AGENTS), seed `TASKFORCE` pré-rempli, et un
> **agent** (routing, tools, write-back, sources RAG) prêt à s'allumer dès qu'une clé LLM est fournie.
> **Reste env-gated** : sémantique transformer (`fastembed`, réseau) ; génération + tool-calling (clé Groq/Anthropic).
> **Reste à faire** : tests (couverture) + sécurité (revue) — phase soutenance.
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

### Migrations Flyway (récap)

`V51` tables (brain/nodes/edges) · `V52` `embedding vector(384)` + HNSW · `V53` index partiel
`idx_knodes_missing_embedding` (backfill sans scan) · `V54` reset embeddings (algo changé) ·
`V55` colonne `knowledge_edges.auto` (arêtes wikilink re-synchronisables).
Tags et flag `system` vivent dans `metadata` JSONB (pas de colonne).

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

### Phase 1 — Embedding & retrieval · ✅ **fait & vérifié e2e** (plomberie ; modèle réel = réseau requis)
- [x] V52 : colonne `embedding vector(384)` + index HNSW cosine
- [x] ai-service `/v1/embeddings` réel via **fastembed** (`all-MiniLM-L6-v2`, 384d) **avec repli déterministe** si modèle absent
- [x] Java `EmbeddingClient` (best-effort) + **embed-on-write** (create/update) + **backfill** des nodes seedés
- [x] `POST /brain/search` (pgvector cosine, filtre domaine) → hits classés + score ; UI barre de recherche
- [ ] *(reporté)* graph expansion 1-hop dans le search ; worker RabbitMQ async ; write-back IA

> **⚠️ Contrainte réseau de ce poste** : le proxy/firewall corrompt les gros téléchargements pip
> (même cause que le 403 Groq) → `fastembed`+ONNX **non installable ici**. Le code est prêt : il tourne
> sur un **vecteur de repli déterministe 384d** (plomberie 100 % fonctionnelle, ranking non-sémantique).
> Sur un réseau propre : décommenter `fastembed` dans `ai-service/requirements.txt` + rebuild → qualité
> sémantique réelle, **zéro changement de code**.
> **Vérifié** : V52 appliquée, `/v1/embeddings` renvoie 384d, search backfill 17/17 nodes + résultats scorés.

### Phase 2 — Deep-path agentique · ✅ **structure complète** (génération env-gated LLM)
- [x] **RAG réel** : retrieval top-5 Brain OS (pgvector) → sources citées, avec ou sans LLM
- [x] **`AgentService`** (`core.service.agent`) : routing fast/deep (heuristique), étapes, **boucle de tool-calling** (`GroqService.rawChat` + `tools`, max 5 itér), repli gracieux (sources réelles)
- [x] **Outils** : `search_brain` (read) · `create_note` (**write-back**, suit AGENTS) · registre extensible (`AgentToolRegistry`)
- [x] **Réponse structurée** `AssistantAnswer` (answer/reasoning/mode/sources/steps/toolCalls) → `AssistantController`
- [x] **Panneau agentique** (`components/agent/agent-chat.tsx`, « Ask AI ») rend le kit (Steps/Reasoning/Tool/Sources/FeedbackBar/ThinkingBar)
- [ ] *(env-gated clé LLM)* allumage génération + tool-calling + write-back ; `AnthropicService` (à brancher) ; outils `create_issue`/`get_stats`/`web_search`

### Phase 3 — Brain OS UI (frontend Next.js) · ✅ **fait (riche)**
- [x] **Layout Obsidian 2-panneaux** : explorateur (dossiers/domaines repliables = squelette + tags filtrants) **animé** (collapse smooth) | **éditeur central large**
- [x] **Graph Viewer** SVG force-directed **maison** : nodes colorés/dimensionnés par degré, **tags comme nœuds** (notes reliées par tag = réseau neuronal), wikilinks, drag/zoom/pan
- [x] **Moteur de liens** : `#tags` (metadata) + `[[wikilinks]]` → **arêtes auto** (re-sync à l'édition) — l'architecture est liée d'office au seed
- [x] **Éditeur riche maison** (pas tiptap : npm corrompu) : callouts `[!tip/warning/danger]`, titres H1–H4, `==surlignage==`, **images + docs (upload MinIO)** + preview, blocs de code colorés, **toolbar sticky**
- [x] **Noyau** : hub `Brain OS` (visible, lie tout) + `AGENTS` (caché `system`, lu par l'agent = moat) ; toggle « Afficher le noyau »
- [x] **Seed** : gabarit à la création (BLANK/SAAS/…/AGENTIC) **+ `TASKFORCE`** (brain pré-rempli, vraie histoire) **+ endpoint `reseed`**
- [x] recherche sémantique live · empty-state + insights · suppression confirmée · relations read-only · footer scroll-reveal
- [ ] *(futur)* tiptap WYSIWYG inline (réseau propre) ; viewer PDF in-app ; wizard onboarding IA

### Phase 4 — Issues enrichies + human-in-the-loop · 🟢 **lot 1 fait (09/07)**
- [x] **Spec + prompt d'exécution IA** : `POST /api/workspaces/{slug}/projects/{projectId}/issues/{id}/ai/spec` → `IssueAiService.generateSpec` (RAG bge-m3 + LLM local Qwen, repli déterministe) renvoie `IssueSpecDraft{spec, executionPrompt, breakdown, similar, mode}` **sans rien persister**
- [x] **« Déjà vu ? »** : `retrieveRelevant` sur titre+description → notes proches du Brain OS
- [x] **HITL** : l'humain édite le brouillon (onglet « Spec IA », `components/issues/issue-ai-spec.tsx`) → `…/ai/spec/approve` (`ApproveSpecRequest`) **écrit un node `SPEC`** (`domain=ENGINEERING`, `refType=ISSUE`, embeddé) via `KnowledgeService.createNode` — le cerveau grandit. **Vérifié e2e** (node #3078 lié à l'issue WEB-1)
- [ ] *(lot 2)* injecter `breakdown` en **checklist d'issue** ; edge `SPEC —IMPLEMENTS→ issue` ; decision-log par issue
- [ ] *(lot 2, option)* **code agent** : issue → Claude implémente (conventions `04-engineering`) → PR draft → review humaine

### Phase 5 — Marketplace (moat)
- Brain Packs (SaaS/Ecom… nodes pré-remplis), templates ADR sectoriels
- Agent Packs C-level (CTO/CPO/CFO/CEO) — pseudo-board OODA
- Pont Obsidian (export/import vault ; TaskForce = source of truth → résout le problème du ZIP à re-télécharger)
- Data management : partitionnement, float16, archivage cold

## 5bis. Qualité (opérationnel / scalable / maintenable / modulaire)

- **Opérationnel ✅** : recherche réellement pertinente même offline grâce à un **embedding lexical maison** (feature hashing tokens + trigrammes, tf-log, L2) dans `ai-service` — cosinus corrélé au recouvrement lexical (vérifié : sim(security, security-audit)=0.68 vs sim(security, runbook)=−0.04). Drop-in `fastembed` sur réseau propre (même interface 384d). LLM génératif = clé Groq.
- **Scalable 🟡** : index partiel `idx_knodes_missing_embedding` (V53) → backfill sans scan complet ; backfill borné (200/appel) ; `getOverview` plafonné (`OVERVIEW_CAP`) avec `totalNodes` réel ; HNSW pour le vector search. Restent (Phase 5) : embedding async (RabbitMQ), partitionnement, graphe SVG O(n²) → virtualisation.
- **Maintenable 🟡** : conventions respectées ; **tests à faire** (phase tests dédiée).
- **Modulaire ✅** : `KnowledgeService` (CRUD/overview/edges) découpé — `BrainSeedingService` (amorçage), `BrainSearchService` (embeddings/recherche), `BrainAccessGuard` (autorisation, point d'extension rôles), utils `BrainEnums`/`BrainMapper`. Embedding provider swappable (`EmbeddingClient` + `ai-service`).

## 6. Contraintes (règles d'or TaskForce)

- Tout contrôleur porte `/api`. Routes front dans `lib/config/api-routes.ts` → service `lib/api/*`.
- Lecture via `response.data.data`. Couches `shared ← core ← modules`.
- Changement DB = migration Flyway `V{n}__…` (jamais éditer une migration appliquée).
- TS strict, pas de `any`, un store Zustand par domaine, zéro mock.
- Auth au niveau service (`WorkspaceMember`/`ProjectMember`).
- MAJ Brain OS frère (`../taskforce-docs`) + ce fichier selon la DoD.
