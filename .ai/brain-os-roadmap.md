# Roadmap — Brain OS (couche de connaissance native TaskForce)

> **⏸ STAND-BY (décision 2026-06-30, rouvert ponctuellement le 16/07)** : socle **fonctionnellement
> complet**, on l'arrête là pour la V1. Seule exception rouverte depuis : la **Phase 4bis** (ingestion
> automatique), parce que le graphe ne se remplissait de **rien** de ce qui se passe dans les projets.
> **Brain OS refermé après ce lot.**
> Reste avant gel : **tests + revue sécu** du périmètre Brain OS (mutualisés avec le chantier Tests global de l'app).
> Tout le reste (Phases 4/5, tiptap, async, marketplace, env-gated LLM) est parti en **backlog** : `.ai/backlog-post-v1.md` §1.
> Priorité désormais = clôture V1 de l'app (voir `.ai/roadmap.md`).
>
> **Statut** : Phases 0→3 **faites** · Phase 4 lots 1/2a/2b **faits** · **Phase 4bis (ingestion auto) faite**
> · **Phase 4ter (régions par projet) faite** · **RAG réparé (16/07 — il n'avait jamais marché, cf. §RAG)**
> · deep-path agentique **code-complet** · **Branche** : `chore/v1-closure` · **Maj** : 2026-07-16
>
> **⚠️ Le RAG était décoratif jusqu'au 16/07.** Toute la Phase 1 (« embedding & retrieval ») était marquée
> « faite & vérifiée e2e », et elle l'était — *isolément*. Mais en usage réel, la recherche vectorielle
> mourait à chaque fois qu'elle était appelée depuis un chemin en `@Transactional(readOnly = true)` :
> le backfill d'embeddings tente un `UPDATE` dans la tx en lecture seule, Postgres avorte **toute** la
> transaction, et le `SELECT … <=> …` suivant échoue en `25P02`. Les **19 nodes du seed n'ont jamais pu
> s'indexer**. Correctif : `BrainEmbeddingWriter` (`REQUIRES_NEW`, une tx par vecteur) → 78/78 indexés.
> **Leçon transférable** : une vérif « e2e » qui appelle le service *directement* ne reproduit pas le
> contexte transactionnel de l'appelant réel. C'est ce trou-là qui a laissé passer le bug.
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

> **Où en est réellement le « tout seul » ?** Jusqu'au 16/07/2026 c'était la vision, pas le code :
> **aucun** chemin d'écriture ne partait de l'activité projet (mesuré : 267 issues, 0 node lié).
> Depuis la **Phase 4bis**, la clôture d'un cycle et les issues terminées alimentent le graphe sans
> intervention humaine. Les autres chemins (spec approuvée, `create_note`, édition) restent
> **déclenchés par un humain**, et les issues hors cycle / commentaires / PR ne sont pas ingérés.

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
- [x] **lot 2a (09/07)** : `breakdown` → **checklist réelle de l'issue** à l'approbation (`ApproveSpecRequest.addChecklist` → `IssueService.addChecklistItem`) ; **« déjà vu » scoré** (`BrainSearchService.retrieveRelevantScored`, % cosinus) — vérifié e2e (spec #3079 + 4 items, déjà-vu WEB-1 41%)
- [x] **lot 2b — l'IA remplit l'issue (09/07)** : `applyToIssue=true` → `IssueService.updateIssue` écrit **description = la spec** + **type**, **labels**, **storyPoints**, **priorité** (IA, type/labels restreints à ceux du projet). `autoAssign=true` → **assigné via smart-assign (Qwen)**. Le LLM génère tout ; front resync (`onApplied`→`fetchIssue`). ⚠️ timeout LLM front → 200s (`AI_TIMEOUT_MS`). Vérifié e2e (WEB-4 : type=Bug + assigné Sarah Chen)
- [x] **smart-assign → Qwen (09/07)** : `SmartAssignService` appelait `GroqService` en dur (bloqué → fallback Java permanent) → swap **`LlmClient`** (AI Gateway → Qwen), tier `fast`. `fallbackUsed=false`, raison LLM réelle. Signaux gardés (skills/workload/historique/growth)
- [ ] *(lot 2b)* **bridge GitHub** : approuver une spec → PR draft (branche + spec en body) ou issue GitHub via l'intégration existante — « management côté GitHub »
- [ ] *(far, option)* **code agent autonome** : issue → implémente → PR (nécessite API payante ou modèle local costaud ; le flux $0 = humain copie le prompt dans Claude Code)

### Phase 4bis — Ingestion automatique de l'activité projet · 🟢 **fait (16/07)**

> **Le constat qui a déclenché ce lot** : le graphe ne se nourrissait **que** du seed, de la main de
> l'humain et de deux actions explicites (spec approuvée, outil `create_note`). Mesuré en base :
> 267 issues, 137 commentaires… et **0 node avec `ref_type` non nul**. Aucun `@EventListener` ne
> touchait le brain. La phrase §0 « le cerveau grandit tout seul » décrivait la vision, pas le code.

- [x] **Contrat d'écriture = celui d'un agent** (`AGENTS.md` §2) porté dans le produit : faits issus
      **du SQL**, LLM cantonné à la **rédaction** (il ne reçoit que les faits) ; **upsert** par
      `refType/refId` (une fiche par cycle, jamais un node par événement) ; **grain = le lot** (le
      cycle) ; **format Obsidian** (`#tags` + `[[wikilinks]]` → `BrainLinkService` tisse les arêtes).
- [x] **Zéro nouvel enum, zéro nouvelle table** : `NodeType.ACTION_OODA`, `NodeDomain.HISTORIQUE` et
      `NodeRefType.CYCLE` existaient déjà **sans aucun écrivain**. On remplit un trou laissé exprès.
- [x] **Points d'accroche déjà écrits** : `CycleService:121` (transition → `COMPLETED`, garde « une
      seule fois » qui servait déjà au push Slack) et `IssueService:411` (`completedAt == null`).
      → `CycleCompletedEvent` / `IssueCompletedEvent` (identifiants seuls).
- [x] **`BrainIngestionListener`** : `@TransactionalEventListener(AFTER_COMMIT)` + `@Async` + try/catch.
      AFTER_COMMIT = un échec d'ingestion ne peut pas annuler la clôture d'un cycle ; `@Async` = la
      requête HTTP ne paie pas les ~200 s du LLM.
- [x] **`BrainIngestionService`** : `collectCycleFacts` (tx courte) → `synthesize` (**hors tx**) →
      `writeCycleNode` (tx courte). Un `@Transactional` englobant l'appel LLM immobiliserait une
      connexion du pool pendant toute la génération.
- [x] **Qwen tier `fast` via `LlmClient` → `AiMeter`** = **7ᵉ chemin IA** métré (sinon on rouvrait le
      trou de quota fermé par TF-AI-CONSUMPTION-WF). Repli déterministe sur LLM absent / quota 409 /
      timeout / réponse vide → **le node est écrit dans tous les cas**, en faits seuls.
- [x] **V69 + verrou pessimiste** — *bug trouvé par le scénario, invisible en test unitaire* :
      l'upsert est un check-then-act ; 4 issues terminées coup sur coup → 4 listeners `@Async` lisent
      « aucun node » avant tout commit → **4 doublons en 240 ms**. Correctif : `findByIdForUpdate`
      (verrou sur la ligne du cycle, faits relus sous verrou) + index partiel `uq_knodes_cycle_ref`
      (l'invariant vit dans le schéma, pas seulement dans l'appelant).
- [x] **Scénario `scripts/scenario/play.mjs`** : joue un projet via la **vraie API REST** (un SQL ne
      traverse pas Spring → aucun événement → c'est *pourquoi* le seed laisse le brain vide). Vérifie
      l'idempotence et la présence des rétros. **Vérifié e2e** : `Rétro — Sprint 1 · Fondations (PORT)`
      = 4/5 livrées, 80 %, 13/21 pts, synthèse Qwen sans fait inventé, arête auto vers
      `[[16 · Historique des actions]]`, embeddé. 30 tests unitaires (`BrainIngestionServiceTest`).
- [ ] **Hors périmètre assumé** : issues **hors cycle** (259 des 267 du seed), **commentaires**, **PR**
      → aucune ingestion. Le grain reste le lot ; l'événement isolé n'écrit rien.
- [ ] *(futur)* rétro **de projet** (agrégat multi-cycles) ; `ACTION_OODA` sur clôture de projet.

### Phase 4ter — Régions par projet dans le graphe · 🟢 **fait (16/07)**

> **Constat de départ** : le « camembert par projet » était **déjà entièrement codé**
> (`brain-graph.tsx` — quartiers teintés + anneau de pourtour) mais **à sec** : il ne se déclenche que
> si `node.refType === "PROJECT" && depth === 1`, or **aucun node** n'a jamais porté `refType=PROJECT`
> et **aucun** n'a de `parentNodeId` (mesuré : 0/21). D'où la roue plate observée.

- [x] **Décision : régions (blobs) plutôt que parts de tarte.** La part de tarte découle du
      `parentNodeId` → un node a **un** parent, donc **une** part : une note transverse y est
      *impossible par construction*, pas seulement moche. La région est un **ensemble** : une note
      peut être dans deux, les enveloppes se chevauchent, et **l'intersection est l'information**.
- [x] **Donnée** : `metadata.projects = [ids]` — une **liste**, pas un `projectId`. Zéro migration
      (le JSONB sert déjà aux tags). Écrit par l'ingestion (cycle → projet), `approveSpec`
      (issue → projet), et exposé aux `Create/UpdateKnowledgeNodeRequest`.
- [x] **Layout déterministe** (aucune simulation, fidèle au parti pris du composant), en deux idées :
      **(1)** `Brain OS` + la connaissance hors projet forment la **cellule « Base commune », au centre** —
      c'est la ressource native sur laquelle tout se construit, donc les projets viennent s'y **coller** ;
      **(2)** les cellules projet se posent en couronne **collée** au noyau, packées par leur **largeur
      angulaire** (`asin(r / anneau)`), pas réparties sur 360°. Amas par **ensemble exact de projets** ;
      une note transverse se pose **au milieu du segment** entre les cellules concernées → recouvrement
      en lentille.
      ⚠️ **Deux versions ratées avant celle-ci, à ne pas refaire** : répartir les projets sur 360° les
      met dos à dos dès qu'il n'y en a que deux, et leur note commune finit à 90° des deux (ou pile sur
      le noyau si on prend le barycentre) → enveloppes en **bâtons illisibles**. Retour user, sans appel :
      « ultra moche, on arrive pas à voir quel projet ».
- [x] **Camembert par domaine À L'INTÉRIEUR d'une cellule** (demande user) : chaque domaine (Projet,
      Produit, Architecture, Sécurité, Runbooks…) prend un secteur proportionnel à son nombre de notes,
      et ses notes s'y rangent. Traits de séparation **découpés dans la forme organique** (`clip`) →
      ils épousent le contour. Libellés de domaine **au zoom seulement** : à l'échelle « vue globale »,
      17 libellés empilés dans la base ne diraient plus rien. Aucune donnée nouvelle : `node.domain`
      existait déjà. Sans ce 2ᵉ niveau, une cellule dit « ces notes sont au projet WEB » mais pas
      « voici la partie archi de WEB » — or c'est ça qu'on veut lire.
- [x] **Rendu « eau » = metaballs** (`metaballContour`, état actuel du code). Chaque cellule évalue un
      **champ scalaire** : `influence(ses nœuds) − PRESSURE × influence(les nœuds des AUTRES cellules)`
      (`PRESSURE = 0.62`, `BLOB_R = 46`). Le contour est trouvé par **marche radiale** depuis le centre
      (`CONTOUR_RAYS = 144`, `MARCH_STEP = 5`) là où le champ franchit son seuil, puis lissé.
      **C'est le terme de pression qui fait l'eau** : une cellule voisine *repousse* le contour, donc
      deux amas proches s'aplatissent l'un contre l'autre et se pincent réellement. Alpha faible → les
      teintes s'additionnent aux recouvrements, l'intersection ressort d'elle-même. Contour calculé
      **une fois par layout**, pas par frame (sinon 144 rayons × N cellules × 60 fps).
      ⚠️ **Garde-fous non négociables**, appris en live : `if (center <= 1) return circle(radius*0.55)`
      — sans lui, une cellule dominée par la pression voisine a un champ négatif partout et son contour
      **explose en éventail** (vu sur `MOB`, écrasée par `PORT`) ; `t` borné à [0,1] ; `hit ?? bound`.
- [x] **Code couleur par projet** (retour user : « MOB, PORT c'est naze… un code couleur pour savoir
      qui est quel projet »). Palette `PROJECT_HUE` → une teinte stable par projet (`hueOf`), reprise
      par le remplissage, le contour **et une légende à pastilles**. Le graphe se lit sans avoir à
      déchiffrer des identifiants de 3 lettres.
      ⚠️ **Deux rendus abandonnés avant** — ne pas y revenir en croyant simplifier : **(1)** enveloppe
      convexe adoucie (2 nœuds → capsule) : une région de 2 notes éloignées avalait la moitié du
      graphe ; **(2)** **union des disques** (« étoile de 96 rayons ») : trop ronde et surtout **inerte**
      — les cellules ne réagissaient pas les unes aux autres, donc ça ne faisait pas « de l'eau ».
- [x] **🐞 `zoomToFit` avec une durée d'animation ne fait RIEN**, silencieusement, sans erreur. Le
      `getGraphBbox()` était pourtant déjà juste, et le même appel rejoué en console avec une durée
      **0** cadrait parfaitement : l'animation se fait écraser avant d'aboutir. Correctif : durée 0 +
      quelques tentatives (les projets arrivent du store après le 1er rendu, et les positions étant
      fixes le moteur ne redémarre pas → `onEngineStop` ne se rejoue jamais).
- [x] **Vérifié en live** : régions `WEB` et `PORT`, note `ADR — Jeton d'accès partagé` en
      `projects: [65, 70]` → les deux enveloppes s'étirent vers elle et se rejoignent.
- [ ] **⚠️ Limite connue — une petite cellule à côté d'une grosse retombe en disque.** Avec le seed
      3 mois, `MOB` (5 notes) est voisine de `PORT` (36 notes) : la pression de `PORT` rend le champ de
      `MOB` négatif jusqu'en son centre, le garde-fou `center <= 1` se déclenche et `MOB` s'affiche en
      **cercle terne** au lieu d'une forme organique. Ce n'est pas un plantage (le garde-fou fait son
      travail) mais le rendu ment sur la nature de la cellule. Piste : normaliser la pression par la
      **taille relative** des cellules, ou plafonner la contribution d'une voisine. **Non corrigé.**
- [x] **Scénario à 2 projets** (`scripts/scenario/play.mjs`) : **PORT** *gros* (28 issues, 4 cycles —
      3 clôturés + 1 actif, 6 notes sur 6 domaines) et **MOB** *petit* (6 issues, 1 cycle, 2 notes),
      + 2 notes **transverses**. Vérifié en live : 4 rétros `generated` par Qwen (86 / 75 / 86 / 83 %
      de complétion) + 1 relevé vivant ; **PORT = 12 notes sur 8 domaines**, **MOB = 5 sur 4** → les
      camemberts internes ont de quoi se remplir. Reprise sur **429** ajoutée dans le client du script :
      il enchaîne ~200 requêtes et déclenchait le `RateLimitFilter` — le serveur demande de ralentir,
      on patiente au lieu d'échouer.
- [ ] **Reste** : *sélecteur de projet dans l'éditeur* — aujourd'hui seuls l'ingestion, `approveSpec`
      et l'API posent `metadata.projects` ; un humain ne peut pas rattacher une note à la main depuis
      l'UI.

> **Comportement connu — nodes orphelins.** Supprimer un projet (donc ses cycles) **ne supprime pas**
> les rétros correspondantes : `refId` n'est pas une FK. Constaté en rejouant le scénario (`--reset`) :
> 2 nodes pointent vers des cycles disparus. C'est **cohérent avec la décision §1** (« graphe
> **parallèle** qui *peut* pointer vers issues/projets ») — une rétro reste une connaissance valide
> même si le sprint est effacé, et la supprimer serait perdre de la mémoire. Seule la suppression du
> **workspace** cascade (vérifié en Phase 0). À trancher si ça gêne : purge à la suppression de projet,
> ou marquage `status=ARCHIVED` du node. Pas de piège pour la démo : `db.ps1 seed` DROP le workspace
> entier, donc un `seed` → `play.mjs` repart toujours propre.

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
