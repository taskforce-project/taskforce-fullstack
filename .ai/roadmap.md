# Roadmap maître TaskForce — Certification + V1

**État au 17/06/2026.** La grille RNCP est à **38,9 % de critères au vert** (≈ 60 % en pondéré). L'infrastructure technique est solide (auth, billing, stack Docker, en-têtes sécurité, JaCoCo/Vitest configurés) mais **inerte** sur les critères de certification : les tests couvrent le silo auth/billing et ignorent le cœur métier ; aucun RGPD applicatif (droits des personnes, chiffrement, audit) ; pas de landing publique indexable ; CI fragmentée et non bloquante ; dossier de conception sans UML/MCD réels ; artefacts de pilotage projet absents. Le **Jalon 1 (CERTIF-READY)** vise à faire passer au vert tous les critères Cxx bloquants avant les rendus bloc 2&3 (20/07/2026). Le **Jalon 2 (V1 PRODUIT)** câble les différenciateurs (smart-assign, agents, intégrations) dont le backend est largement déjà écrit.

> Source des items produit détaillés : `.ai/qa.md`. Grille remplie : `taskforce-docs/memoire/Grille_evaluation_TaskForce_REMPLIE_DFS_25-26.xlsx`.

---

## Ordre de priorité (chemin critique)

1. **Tests cœur métier (C18/C25)** — *fondation*. Les seuils JaCoCo (50 %/package) et Vitest (60 % global) sont déjà posés mais **échouent aujourd'hui** car le métier n'est pas testé. Rien ne sert d'industrialiser une CI qui sera rouge d'entrée. → **Tests avant CI.**
2. **RGPD & Sécurité (C11/C24/C21/C16)** — critère **obligatoire** de la grille, fort volume (9 j·h), touche le backend (audit, chiffrement, droits) qui doit être stable avant de figer la CI sécurité. Le socle audit conditionne RBAC et droits des personnes.
3. **CI & Industrialisation (C19/C26)** — *après tests + sécu* : elle **active et rend bloquants** les seuils de tests (jacoco:check, thresholds Vitest) et branche les scans sécurité (OWASP/CodeQL/Trivy) produits par le chantier RGPD.
4. **Conception & Modélisation (C6–C10)** — *documentaire, parallélisable* : dérive UML/MCD du **code réel** (entités JPA, migrations Flyway), à faire après stabilisation du schéma (nouvelles migrations audit/chiffrement).
5. **SEO & Landing (C20)** — *indépendant front*, parallélisable. Seule contrainte : CSP à ajuster pour l'analytics (cohérent avec le cookie-banner RGPD).
6. **Doc Gestion de Projet (C2/C3/C4/C12)** — *pur cadrage*, parallélisable immédiatement, sans dépendance code. À lancer en fond dès J1.

> Parallélisation réelle : **Conception**, **SEO** et **Doc Projet** n'ont aucune dépendance code bloquante → exécutables en fond pendant Tests → RGPD → CI sur le chemin critique.

---

## Jalon 1 — CERTIF-READY

### Chantier A · Tests cœur métier — *C18, C25*

| # | Tâche | Effort | Critère d'acceptation |
|---|-------|--------|------------------------|
| A0 | Plan de tests aligné specs (matrice CDC→TC-xx→fichier) → `taskforce-docs/memoire/Plan_de_tests.md` | 0,25 | Aucune exigence CDC cœur sans ligne ; chaque test porte un id `TC-xx` |
| A1 | Back : socle Testcontainers Postgres (`AbstractIntegrationTest`, `application-test.yml`, externes `@MockBean`) | 0,5 | `mvn test` démarre le conteneur, Flyway applique V1..V38 sans erreur |
| A2 | Back : tests services métier (SmartAssign, Issue+labels, Project/Workspace nom dupliqué, Cycle enum, Notification, Analytics) | 1,25 | ≥1 nominal + ≥1 cas erreur/autz par service ; 3 bugs known-issues en non-régression rouge→vert |
| A3 | Back : tests controllers (`/api`, `ApiResponse<T>`, `@Valid` 400) + atteindre seuil JaCoCo (excludes justifiés) | 0,5 | `mvn verify` passe `jacoco:check` ≥0,50/package non exclu |
| A4 | Front : recalibrer scope coverage, retirer doublon `jsdom` | 0,25 | `npm run test:coverage` sans échec de seuil ; include/exclude reflètent le périmètre réel |
| A5 | Front : tests stores + services métier (project/issue/workspace/team, mock `apiClient`, `response.data.data`) | 0,5 | Chaque store/service visé : nominal + cas erreur ; seuils par-fichier respectés |
| A6 | Rapports exploitables (LCOV/HTML/JaCoCo archivés pour mémoire) | 0,25 | Couverture lignes ≥50 % (cible 70 %) front **et** back, captures insérables |

**Sous-total : 3,5 j·h** → **C18 ✅ · C25 ✅** (+ renfort C19/C26).

### Chantier B · RGPD & Sécurité — *C11, C24, C21, C16*

| # | Tâche | Effort | Critère d'acceptation |
|---|-------|--------|------------------------|
| B1 | Journal d'audit sécurité (`AuditLog` + `V39__audit_log.sql` + hooks login/rôle/suppression) | 1,0 | Connexion + changement rôle + suppression → 1 ligne `audit_log` chacune (test vert) |
| B2 | RBAC granulaire centralisé (`AuthorizationService`, combler Analytics/Issue/Project/Cycle) — *dépend B1* | 1,5 | MEMBER → 403, ADMIN/OWNER → OK ; aucun endpoint authentifié sans contrôle d'appartenance |
| B3 | Chiffrement au repos (`EncryptedStringConverter` AES-GCM, `@Convert` sur PII/tokens, `V40__`) | 1,5 | Token inséré illisible en base, relu en clair par l'app ; round-trip vert |
| B4 | Droits des personnes (`GdprService` export/suppression OTP/anonymisation, `/api/gdpr`) — *dépend B1,B2* | 2,0 | `GET /api/gdpr/export` JSON complet ; suppression OTP → anonymisation + audit |
| B5 | Front : consentement granulaire + page droits + privacy enrichie (FR/EN) — *dépend B4* | 1,5 | Accept/refus par catégorie + ré-ouverture ; export/suppression depuis settings ; privacy = bases légales/durées/sous-traitants |
| B6 | Audit deps automatisé (OWASP back, `npm audit` front, workflow) — *parallélisable* | 0,5 | CVE High volontaire fait échouer le job ; rapport HTML généré |
| B7 | Durcissement prod (JWT secret sans fallback, TLS actif nginx, sslmode=require) — *parallélisable* | 0,5 | Démarrage sans `jwt.secret` → échec explicite ; `curl -I` → HSTS+CSP une fois, TLS 1.3 |

**Sous-total : 9,0 j·h** → **C11 ✅ · C24 ✅ · C21 ✅ · C16 ✅**.
*Ordre : B1 → (B3+B6+B7 //) → B2 → B4 → B5.*

### Chantier C · CI & Industrialisation — *C19, C26* (+ active C18/C25/C20)

| # | Tâche | Effort | Critère d'acceptation |
|---|-------|--------|------------------------|
| C1 | Workflow `ci.yml` agrégé (paths-filter, `workflow_call`, job `ci-success` = check unique requis) | 0,5 | 1 PR → 1 check `ci-success` agrégeant tout ; un job rouge le fait échouer |
| C2 | Rendre lint + seuils bloquants (ESLint sans `continue-on-error`, Node 22 partout, `mvn verify`+jacoco:check, thresholds Vitest) | 0,5 | Lint error ou couverture < seuil fait échouer la CI |
| C3 | Lint/format Java (Spotless en profil `ci`) — *commit `spotless:apply` à part* | 0,5 | `spotless:check` vert sur code formaté, rouge sinon |
| C4 | Qualité SonarQube/SonarCloud (jacoco.xml + lcov, Quality Gate en check PR) | 1,0 | Dashboard Sonar par service alimenté ; Quality Gate bloque si rouge |
| C5 | Sécurité code (OWASP cache NVD, dependency-review, CodeQL java+ts, Trivy images) — *réutilise B6* | 1,0 | CVE critique injectée → job rouge ; CodeQL remonte dans l'onglet Security |
| C6 | Dependabot (maven/npm×2/actions/docker, groupé hebdo) — *parallélisable* | 0,25 | Dependabot ouvre des PR validées par `ci-success` |
| C7 | Builds optimisés (`clean verify`, cache GHA/`.next/cache`, images build sans push sur PR, push GHCR dev/main) — *dépend C5* | 1,0 | Cache hit visible ; images back+front buildées+scannées sans push sur PR |
| C8 | Protection de branche + badges README + PR template | 0,25 | Merge impossible si un gate échoue ; badges à jour |

**Sous-total : 5,0 j·h** (mutualisé avec B6) → **C19 ✅ · C26 ✅** (+ rend réellement bloquants C18/C25, renforce C20).

### Chantier D · Conception & Modélisation — *C6–C10*

| # | Tâche | Effort | Critère d'acceptation |
|---|-------|--------|------------------------|
| D1 | Table de réconciliation domaine↔code (29 entités, 38 migrations, CDC→entité→migration) | 0,5 | Chaque UC01–10 pointe ≥1 entité réelle ; concepts non implémentés marqués backlog |
| D2 | Diagramme de cas d'usage UML (acteurs + include/extend, Mermaid+PNG) — remplace les placeholders CdCF §7 | 1,0 | 100 % UC01–10 + cas secondaires ; chaque acteur présent ; 0 `[Diagramme à intégrer]` |
| D3 | Diagramme de classes (analyse + conception reflet JPA réel) | 1,0 | 29 entités, cardinalités cohérentes avec les `@ManyToOne/@OneToMany` (sondage 5 entités) |
| D4 | MCD / MLD dérivés du schéma Flyway réel (+ règles de gestion, pgvector) | 1,0 | MLD = miroir fidèle des migrations ; règles reliées à contraintes SQL réelles |
| D5 | Wireframes annotés des vues clés (liés UC + route front réelle) — *dépend D2* | 1,5 | Chaque vue note de cadrage : wireframe annoté + route+UC ; UX justifiée |
| D6 | STB consolidé + dossier conception assemblé + Bloc1 coché | 1,0 | C6–C10 cochés avec lien preuve ; dossier navigable ; aucun placeholder résiduel |

**Sous-total : 6,0 j·h** → **C6 ✅ · C7 ✅ · C8 ✅ · C9 ✅ · C10 ✅**.
*Chemin : D1 → D2 → D5 → D6 ; D3/D4 // après D1.*

### Chantier E · SEO & Landing — *C20*

| # | Tâche | Effort | Critère d'acceptation |
|---|-------|--------|------------------------|
| E1 | Groupe `(public)/` + landing `/` server-rendered (sections marketing, i18n, footer légal) | 1,0 | `GET /` non auth → 200 HTML server-rendered ; ≥1 `<h1>` dans le source |
| E2 | Metadata globale + par-page (metadataBase, canonical, robots, lang dynamique, noindex protégé) | 0,5 | Accueil : title/description/canonical ; pages protégées : `noindex` |
| E3 | `robots.ts` + `sitemap.ts` (publiques only) — *dépend E2* | 0,3 | `/robots.txt` + `/sitemap.xml` 200 valides ; aucune URL auth/workspace |
| E4 | Open Graph / Twitter + image OG + manifest/favicons — *dépend E2* | 0,5 | `og:*` + `twitter:card` présents ; image OG 1200×630 valide |
| E5 | JSON-LD (SoftwareApplication/Organization/WebSite) — *dépend E2* | 0,3 | Bloc `ld+json` valide (0 erreur Rich Results) dans le source |
| E6 | Performance landing (`next/image`+`sharp`, lazy-load, server components) — *dépend E1* | 0,7 | Lighthouse mobile SEO ≥90 et Perf ≥90 ; LCP<2,5s, CLS<0,1 |
| E7 | Analytics RGPD-safe (Plausible/Umami, CSP ajustée, consentement) | 0,5 | Pageview remonté ; aucun blocage CSP ; cookies après consentement |
| E8 | Vérif indexabilité bout-en-bout (redirects, noindex, sitemap) | 0,2 | Lighthouse SEO ≥70 (cible ≥90) ; aucune page protégée au sitemap |

**Sous-total : 4,2 j·h** → **C20 ✅** (+ renfort RGPD via analytics sans cookies).

### Chantier F · Doc Gestion de Projet — *C2, C3, C4, C12*

| # | Tâche | Effort | Critère d'acceptation |
|---|-------|--------|------------------------|
| F1 | Index chantier `v1/12-gestion-projet/` + lien Brain_OS | 0,25 | README liste 5 livrables + table C2/C3/C4/C12 ; lien résout |
| F2 | Planning prévisionnel (Gantt Mermaid, jalons DFS, chemin critique, mono-exécutant) | 0,5 | Chaque jalon DFS rattaché ; chemin critique identifié |
| F3 | Budget prévisionnel (infra réelle, tiers, charge j·h×TJM, scénarios) — *dépend F2* | 0,5 | Tableau coûts par poste réel de la stack ; hypothèses explicites |
| F4 | Méthode agile + trame CR + 1 CR exemple — *dépend F2* | 0,75 | Trame opérationnelle référençant board/sprints réels + instanciée 1× |
| F5 | Méthodologie de veille (sources/fréquence/compilation/actualisation + Brain OS) | 0,5 | 4 items C12 couverts ; ≥3 entrées de veille tracées avec impact code |
| F6 | Éco-conception & inclusion (leviers réels repo + RGAA/WCAG) | 0,5 | 2 sections ≥5 leviers chacune rattachés à des éléments réels |
| F7 | Bouclage grille (Bloc1 + xlsx via skill xlsx) — *dépend F2–F6* | 0,25 | Lignes C2/C3/C4/C12 pointent un artefact existant |

**Sous-total : 3,75 j·h** → **C2 ✅ · C3 ✅ · C4 ✅ · C12 ✅**.

---

### Total Jalon 1

**Effort : 3,5 + 9,0 + 5,0 + 6,0 + 4,2 + 3,75 ≈ 31,5 j·h.**
**Critères passés au vert : C2, C3, C4, C6, C7, C8, C9, C10, C11, C12, C16, C18, C19, C20, C21, C24, C25, C26** = **18 critères**.

**Projection grille :** de 38,9 % à **~85 % de critères au vert** ; en pondéré, de ~60 % à **~90–92 %**. Les critères restants relèvent du déroulé de soutenance et de la réalisation produit (Jalon 2), non d'un manque technique bloquant.

---

## Jalon 2 — V1 PRODUIT

> Backend souvent **déjà écrit, non câblé UI** → l'essentiel est front/câblage. DoD de chaque item : tests Vitest/JUnit pour ne pas dégrader la couverture acquise au Jalon 1.

### Priorité HAUTE (différenciateurs + fondations)

| # | Tâche | Effort | Note |
|---|-------|--------|------|
| P0.1 | PageShell unifié (gabarit + audit modals focus-trap) | 1,5 | Débloque l'intégration visuelle du reste |
| P0.2 | Footer Cloudflare-like + suppression bandeaux « operational » | 0,5 | |
| P2.1 | Persister compétences membres (`member_skill_profiles` vivant) | 1,5 | Prérequis qualité smart-assign |
| P1.1 | Smart-assign à la **création** d'issue (endpoint preview dry-run) | 1,0 | Différenciateur cœur |
| P1.2 | Smart-assign **visible** dans l'issue-sheet | 0,5 | |
| P3.1 | Sous-tâches (back prêt, UI manquante) | 0,75 | |
| P3.2 | Liens entre issues / relations (back prêt) | 0,75 | |
| P8.1 | RBAC UI (changer rôle, retirer, inviter par rôle) | 1,0 | |
| P9.1 | Delete workspace + Danger zone (endpoint manquant) | 0,75 | |

**Sous-total HAUTE : 8,25 j·h.**

### Priorité MOYENNE (intégrations + valeur produit)

| # | Tâche | Effort | Note |
|---|-------|--------|------|
| P3.3 | Checklist d'issues (option A back / B markdown) | 1,0 / 0,25 | |
| P9.2 | 500→400 nom workspace dupliqué + limites de plan | 0,5 | |
| P4.1 | Finaliser wrapper GitHub (OAuth + sync PR/commits) | 2,0 | back majoritairement prêt |
| P7.1 | Discussions : réparer pin/lock + centre d'annonces | 0,75 | |
| P7.2 | Messages : connexion Slack bidirectionnelle | 2,0 | back Slack présent |
| P6.1 | Personnalisation projet (icône + couleur + upload) | 0,75 | |

**Sous-total MOYENNE : ~7,75 j·h.**

### Priorité BASSE (construction lourde / nice-to-have)

| # | Tâche | Effort | Note |
|---|-------|--------|------|
| P6.2 | Templates de projet / board | 2,0 | back neuf |
| P5.1 | Configuration des agents (modèle persistant + CRUD + seed Brain OS) | 2,5 | chantier le plus lourd, back neuf |

**Sous-total BASSE : 4,5 j·h.**

**Total Jalon 2 ≈ 20,5 j·h.**

---

## Récapitulatif effort & couverture

| Chantier | Effort (j·h) | Gain grille |
|----------|--------------|-------------|
| **JALON 1 — CERTIF-READY** | | |
| A · Tests cœur métier | 3,5 | C18, C25 |
| B · RGPD & Sécurité | 9,0 | C11, C24, C21, C16 |
| C · CI & Industrialisation | 5,0 | C19, C26 (active C18/C25/C20) |
| D · Conception & Modélisation | 6,0 | C6, C7, C8, C9, C10 |
| E · SEO & Landing | 4,2 | C20 |
| F · Doc Gestion de Projet | 3,75 | C2, C3, C4, C12 |
| **Sous-total Jalon 1** | **31,5** | **18 critères → ~85 % vert / ~90 % pondéré** |
| **JALON 2 — V1 PRODUIT** | | |
| Priorité HAUTE | 8,25 | fondations + différenciateurs |
| Priorité MOYENNE | 7,75 | intégrations tierces |
| Priorité BASSE | 4,5 | différenciateurs soutenance |
| **Sous-total Jalon 2** | **~20,5** | valeur démo / réalisation produit |
| **TOTAL 100 % vert (J1 + J2)** | **~52 j·h** | grille complète + produit V1 |

**Minimum certif (chemin critique seul, RGPD obligatoire) :** Chantiers **A + B + C** = **17,5 j·h** pour sécuriser les critères techniques bloquants (tests, RGPD, industrialisation). En ajoutant **D + E + F** (parallélisables, faible risque) on atteint le Jalon 1 complet à **31,5 j·h** pour ~90 % pondéré.
**Pour 100 % vert + produit V1 démontrable : ~52 j·h.**

---

**Séquence recommandée :** lancer **F + D + E** en fond dès J1 (aucune dépendance code) ; sur le chemin critique enchaîner **A → B → C** ; puis attaquer le Jalon 2 par les fondations (P0.1/P0.2) avant smart-assign/skills.
