# Journal — Doc Fern (manuel utilisateur + référence API)

Chantier « Documentation » (roadmap §4 item 8). Doc **produit** (guides) + **référence API** dans Fern
(`fern/`), publiée sur `docs.taskforce-project.fr`. Objectif : manuel utilisateur complet, calqué sur
la structure d'un Linear, **collé à la réalité du code** (rien d'inventé ; Lab assumé).

## Sommaire validé (28 pages / 7 sections, `fern/docs.yml`)

1. **Découvrir** — Bienvenue · Concepts clés · Premiers pas · Onboarding & profil · Tour de l'interface
2. **Organiser le travail** — Espaces & projets · Issues & tableaux · Cycles · Roadmap · Pages
3. **Mon quotidien** — Tableau de bord · Boîte de réception (Signaux) · Mon travail (Ma file) · Accepter/refuser une assignation
4. **Collaborer** — Membres & rôles · Inviter son équipe · Équipes · Notifications & préférences
5. **L'IA — Cortex** — Vue d'ensemble · Assistant · Workflows · Génération de spec · Smart Assign · Mémoire (Brain OS · Lab)
6. **Piloter & intégrer** — Analytics (Intelligence · Lab) · Intégrations
7. **Compte & offres** — Profil & sécurité · Offres, facturation & IA

Puis **tab Référence API** (chantier 2 : OpenAPI + guides bonnes pratiques/auth/conventions).

## Décisions

- **Vocabulaire = labels FR réels de l'app** (Opérations/Tâches/Sprints/Signaux/Ma file/Feuille de
  route/Intelligence), glosés une fois. Table de correspondance dans `concepts-cles.md`.
- **Lab assumé** : Intelligence + Brain OS présentés « en finition », pas comme finis.
- **Screenshots** : repères `{/* SCREENSHOT: id … */}` dans les pages + manifeste
  `fern/assets/screenshots/README.md`. Capture par le user (FR, données réelles ; onboarding = compte
  de test). Câblage `<Frame>` une fois les PNG fournis.

## Avancement

- ✅ `docs.yml` restructuré (28 pages / 7 sections).
- ✅ **Lot 1 — Découvrir** (5 pages) : index, concepts-cles, premiers-pas (réécrits) ;
  onboarding-et-profil, tour-interface (nouveaux). Repères screenshots posés. Commit `643a104f`.
- ✅ **Lot 2 — Organiser le travail** (5 pages) : espaces-et-projets, issues-et-tableaux, cycles
  (réécrits) ; roadmap, pages (nouveaux). Roadmap/Pages/Sprints **vérifiés fonctionnels** dans le
  code (RoadmapGantt, page-store CRUD, cycle-store DRAFT/ACTIVE/COMPLETED). Propriétés de tâche
  tirées de `issue-service.ts` (statuts custom, types, relations, sous-tâches, story points).
- ✅ **Lot 3 — Mon quotidien** (4 pages, nouvelles) : tableau-de-bord (cartes du card-registry),
  inbox/Signaux (4 filtres + types + temps réel), mon-travail/Ma file, assignations (flux
  accept/refus QA-30). Types de notif tirés de `notification-service.ts` (6 événements réglables).
- ✅ **Lot 4 — Collaborer** (4 pages) : membres-et-roles (modèle 3 niveaux : espace OWNER/ADMIN/MEMBER,
  opération LEAD/MEMBER/VIEWER, équipe LEAD/MEMBER), inviter-son-equipe (statuts + acceptation
  explicite) — réécrits ; equipes (groupes workspace), notifications (6 événements × 2 canaux) —
  nouveaux. Rôles/portées vérifiés dans workspace/project/team-service.
- ✅ **Lot 5 — L'IA (Cortex)** (6 pages) : ia-vue-ensemble, ia-assistant, ia-workflows,
  ia-generation-spec (nouveaux) ; smart-assign, memoire/Brain OS (réécrits). Vérifié dans le code :
  AiMeter (métrage tokens, complimentary), workflow-dock (jobs QUEUED→…→DONE, human-in-the-loop),
  ai/spec + approve, SmartAssignCandidate (semantic/historical/workload/availability), Brain OS =
  knowledge graph fonctionnel mais **Lab**.
- ✅ **Lot 6 — Piloter & intégrer** (2 pages, réécrits) : analytics/Intelligence (vélocité, débit,
  burndown, charge/capacité, graphes IA — marqué Lab), integrations (GitHub + Slack connectables,
  credentials chiffrés, OWNER/ADMIN). Vérifié : analytics-service, integrations-catalog (gate connect
  github/slack).
- ✅ **Lot 7 — Compte & offres** (2 pages) : profil-et-securite (Paramètres : profil, apparence +
  accessibilité, sécurité Keycloak reset/2FA, confidentialité RGPD) — nouveau ; offres-et-ia
  (Free/Basic/Business/Enterprise, self-service Basic/Business via Stripe, IA incluse métrée tokens,
  murs = scale, per-seat) — réécrit. Prix/quotas NON hardcodés (renvoi à l'app).
- ✅ **Manuel utilisateur COMPLET — 28/28 pages.**
- 🔲 Câblage des 25 screenshots (fournis par le user, cf. manifeste).
- 🔲 **Référence API (chantier 2)** : régénérer `fern/openapi/openapi.json` depuis le backend
  (`fern/scripts/generate-openapi.ps1`) + guides bonnes pratiques / auth / conventions.
