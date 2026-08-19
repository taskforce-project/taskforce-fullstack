# Phase 4 IA — Plan d'execution

## Objectif

Ce document definit l'ordre d'execution de la Phase 4 IA, le perimetre de chaque lot,
les livrables attendus et les validations minimales avant de passer au lot suivant.

Contexte fonctionnel retenu:
- orchestration metier en Java (backend principal)
- service IA interne en Python (FastAPI)
- stockage vectoriel dans PostgreSQL via pgvector
- inference LLM via Groq

## Regles de conduite

1. Ne pas lancer de refonte globale en une fois: livrer par lots.
2. Garder les feature flags pour desactivation granulaire.
3. Prioriser les interfaces stables entre Java et ai-service.
4. Tracer cout, latence et erreurs des le debut des appels IA.
5. Aucun branchement UI final sans endpoint backend reel.

---

## Lot 1 — Socle IA (TODO 4.1 a 4.4)

### Ce qu'on fait

- Basculer PostgreSQL dev vers une image avec pgvector.
- Ajouter l'activation extension vector au bootstrap DB.
- Ajouter le service interne ai-service (FastAPI) dans la stack dev.
- Centraliser la configuration IA (Java + Python):
  - AI_SERVICE_URL
  - GROQ_API_KEY
  - GROQ_MODEL
  - EMBEDDING_MODEL

### Pourquoi

Sans ce lot, aucune persistance d'embeddings ni appel IA interne fiable n'est possible.

### Livrables

- docker-compose.dev.yml mis a jour (Postgres + ai-service)
- scripts/init SQL pour extension vector
- squelette ai-service (health + endpoint test)
- variables d'env documentees

### Validation minimale

- stack dev levee avec postgres + ai-service
- extension vector presente dans la DB
- endpoint health ai-service joignable depuis backend

---

## Lot 2 — Modele de donnees IA (TODO 4.5 a 4.8)

### Ce qu'on fait

- Migrations Flyway pour:
  - ai_documents
  - member_skill_profiles
  - assignment_events
  - ai_insight_snapshots
  - ai_runs

### Pourquoi

Ces tables sont la base de RAG, du scoring historique et de l'observabilite IA.

### Livrables

- migrations SQL versionnees
- index SQL et contraintes minimales
- conventions de retention (si applicable)

### Validation minimale

- migrations passent en dev
- tables et index visibles
- insertion/lecture smoke test sur chaque table

---

## Lot 3 — Smart Assign reel (TODO 4.9 a 4.13)

### Ce qu'on fait

- Implementer moteur de decision Java (regles + garde-fous).
- Implementer scoring semantique dans ai-service Python.
- Ajouter composant ranking historique (v1 simple).
- Exposer endpoint smart-assign cote backend.
- Brancher SmartAssignPanel sur endpoint reel.

### Pourquoi

C'est la premiere fonctionnalite IA a valeur directe dans le produit.

### Livrables

- endpoint backend smart-assign
- client backend -> ai-service
- suppression des mocks frontend Smart Assign

### Validation minimale

- reponse endpoint avec score + explication + alternatives
- fallback propre si ai-service indisponible
- panneau frontend alimente en donnees reelles

---

## Lot 4 — Assistant IA + RAG (TODO 4.14 a 4.18)

### Ce qu'on fait

- Pipeline d'indexation RAG (issues, pages, discussions, analytics).
- Retrieval filtre par workspace/source dans ai-service.
- Endpoint SSE backend assistant/stream.
- Branchement des vues assistant (agents + fab) au runtime reel.

### Pourquoi

Permettre un assistant utile, scope et auditable.

### Livrables

- jobs/indexeurs RAG
- endpoint stream SSE
- UI connectee sans provider mock local

### Validation minimale

- streaming stable
- citations/sources renvoyees
- isolation stricte par workspace

---

## Lot 5 — AI Insights dashboard (TODO 4.19 a 4.21)

### Ce qu'on fait

- Endpoint analytics ai-insights.
- Generation et cache snapshot.
- Remplacement des blocs statiques dashboard.

### Pourquoi

Transformer le dashboard IA de demo en fonctionnalite exploitable.

### Livrables

- endpoint insights
- mecanisme snapshot/cache
- UI dashboard branchee sur backend

### Validation minimale

- dashboard charge des donnees reelles
- coherence avec metriques backend
- mode degrade propre en cas d'erreur IA

---

## Lot 6 — Qualite, securite, exploitation (TODO 4.22 a 4.25)

### Ce qu'on fait

- Instrumenter prompts/couts/latence/fallback/score final.
- Ajouter feature flags IA.
- Ajouter quotas et timeouts.
- Ajouter fixtures datasets de demo/test IA.

### Pourquoi

Eviter un systeme IA opaque et ingouvernable en exploitation.

### Livrables

- journalisation ai_runs exploitable
- feature flags documentes
- garde-fous runtime actifs
- jeux de donnees de test reproductibles

### Validation minimale

- traces lisibles pour chaque run IA
- desactivation granulaire testee
- test d'epuisement quota et timeout passe

---

## Definition of Done globale Phase 4

La Phase 4 est consideree terminee quand:

1. Tous les items 4.1 a 4.25 du TODO sont en statut termine.
2. Smart Assign, Assistant et Insights fonctionnent sans mocks frontend.
3. Les logs ai_runs couvrent au minimum cout/latence/fallback.
4. Les feature flags permettent de couper chaque bloc IA independamment.
5. Les tests minimaux backend/frontend de la phase sont verts.

---

## Sequence recommandee de demarrage

1. Demarrer Lot 1 immediatement.
2. Enchainer Lot 2 sans pause (migrations).
3. Livrer Smart Assign (Lot 3) avant Assistant (Lot 4).
4. Brancher Insights (Lot 5) uniquement apres RAG stable.
5. Finaliser exploitation (Lot 6) avant cloture de phase.
