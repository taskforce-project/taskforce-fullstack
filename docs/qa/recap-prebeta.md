# Récap pré-bêta — QA, durcissement sécurité & outillage (P1)

> Synthèse du sprint de préparation à la **bêta fermée** (prod partagée), 27/08/2026.
> Indexe **trouvé → corrigé → déployé** pour QA-46→50, le durcissement sécurité et P1a-c.
> Traces détaillées : `.ai/roadmap.md` (tags `[QA-46]` … `[P1c]`). Ce fichier = la vue « au clair » (aussi pour le dossier RNCP, E9/C11 sécurité + RGPD).

## 1. Contexte

Bêta fermée de TaskForce sur la **prod partagée** (VM1 backend, VM2 frontend), ~10-15 testeurs, vague **10 → 24 sept 2026**. Le repo étant **public**, l'audit sécurité a été traité en priorité (toute faille est publiquement auditable). Périmètre décidé avec le porteur : **corriger tout** (critique + moyen + reste). Audit initial mené par 5 sous-agents en lecture seule sur la prod.

## 2. Synthèse

| Lot | Sujet | Sévérité max | Statut |
|---|---|---|---|
| QA-46 | Blocage quota IA + quotas par plan + UI Smart Assign | — (produit) | ✅ déployé 27/08 |
| QA-47 | Smart-assign 500 au plafond + affichage ≤ 100 % + avatars + popover + billing | Haute (500 prod) | ✅ déployé 27/08 |
| QA-48 | Stripe prod en mode TEST + plumbing des price-ids | — (facturation) | ✅ déployé 27/08 |
| QA-49 | Durcissement sécu lot 1 (H1/H2 + M3/M5/M7 + L12) | **Critique** (cross-tenant) | ✅ déployé 27/08 |
| QA-50 | Durcissement sécu lot 2 (M4 + L8 ; vérif M6/L10) | Moyenne | ✅ déployé 27/08 |
| P1a | Cohorte bêta (`V80` `beta_cohort`/`beta_context`) | — | ✅ déployé 27/08 |
| P1b | Export projet serveur (JSON/CSV) | — | ✅ déployé 27/08 |
| P1c | Runbook métriques bêta (SQL) | — | ✅ déployé 27/08 |

## 3. Durcissement sécurité (QA-49 + QA-50) — cœur du dossier

### Vulnérabilités identifiées et corrigées

| Réf | Type | Impact | Correctif | Statut |
|---|---|---|---|---|
| **H1** | IDOR cross-tenant sur les liens GitHub d'issue | **Critique** | `scopedIssue(slug, id)` (404 hors workspace) + `assertCanWrite`/`assertCanView` ; `user` requis sur get/delete | ✅ |
| **H2** | Fuite temps réel cross-tenant (abonnements WebSocket) | **Critique** | `RealtimeAuthorizationService` : autorisation **par canal** (visibilité projet / appartenance workspace) | ✅ |
| **M3** | Lecture de sous-ressources d'issues de projets privés | Moyenne | `assertCanView` ajouté aux 6 sous-lectures (`listComments`/`listActivity`/…) | ✅ |
| **M4** | Clé-capacité des fichiers Brain brute-forçable (32 bits) | Moyenne | Token **UUID complet (122 bits)** → URL réellement inguessable | ✅ |
| **M5** | Bypass du rate-limit via `X-Forwarded-For` spoofé | Moyenne | `CF-Connecting-IP` (non spoofable) → `X-Real-IP` → **dernier** hop XFF | ✅ |
| **M7** | Prise de contrôle par e-mail (OAuth sans `email_verified`) | Moyenne | Refus si `email_verified` explicitement `false` (+ durcissement realm KC) | ✅ |
| **L8** | Oracle d'énumération de comptes via l'avatar | Basse | 404 vide uniforme des deux côtés | ✅ |
| **L12** | Fuite de messages d'exception en prod | Basse | `include-message: always` → `never` | ✅ |

### Config vérifiée en prod (aucun code)
- **M6** — anti-bot signup : `TF_TURNSTILE_SECRET_KEY` + `TF_HUMAN_CHALLENGE_SECRET` posés → actif.
- **L10** — CORS : allowlist stricte `https://app.taskforce-project.fr`.

### Accepté (risque faible, documenté)
- **L9** — actuator : mitigé par nginx (404 hors `/health`) + scrape Prometheus interne nécessaire.
- **L11** — interceptor fail-open : observation de conception.

### Scans DAST (OWASP ZAP)
Scans manuels les 04/07, 16/08 et 27/08/2026. Résultats du dernier scan (27/08, prod) :

| Cible | High | Medium | Low | Info |
|---|---|---|---|---|
| Backend API (VM1) | 0 | 0 | 0 | 1 |
| Frontend (VM2) | 0 | 4 | 4 | 4 |

**Aucune vulnérabilité High ni côté backend ni côté frontend.** Les alertes Medium/Low du frontend (probablement en-têtes de sécurité / CSP, à qualifier) restent à traiter — voir §6. Les **rapports complets sont conservés hors du repo** (public) : on n'y publie ni endpoints ni paires requête/réponse ; seule la config `zap.yaml` est versionnée.

### Tests
Suite backend `it.ps1 -Test ALL` verte à chaque lot (jusqu'à **934 tests**). Tests ajoutés notamment : `StompAuthInterceptorTest` (autorisation par canal), `GitHubIntegrationServiceIntegrationTest` (H1 cross-tenant → 404), `RateLimitFilterTest` (dernier hop + `CF-Connecting-IP`).

## 4. Quotas IA & fiabilité (QA-46 + QA-47)

**QA-46 — le quota IA ne bloquait pas (en apparence).** Le gate `AiUsageService.assertWithinQuota` (→ **409**) était correct et appelé, mais 3 trous :
1. le small-talk (`AgentService.runConversational`) n'était **pas** gated → correctif : gate ajouté ;
2. le front aplatissait le 409 en erreur générique → correctif : `getErrorStatus()` → carte d'info + **CTA « Upgrade »** ;
3. smart-assign déjà OK (repli Java, dégradation gracieuse).
Plafonds : FREE 100k / BASIC 500k / BUSINESS 2M / ENTERPRISE ∞ (mesurés par **tokens** ; le tier modèle par feature module déjà le coût, aucune pondération nécessaire).

**QA-47 — smart-assign renvoyait un 500 au plafond.** `UnexpectedRollbackException` : `assertWithinQuota` (`@Transactional(readOnly)`) marquait la transaction partagée *rollback-only* → le repli Java s'exécutait mais le **commit final** cassait en 500. Correctif : `@Transactional(noRollbackFor = IllegalStateException.class)`. Aussi : **affichage borné à 100 %** (le dépassement réel reste en DB pour le calcul de coût), avatars dans le filtre « Assigné », popover Cortex porté sur `<body>` (plus rogné par le sheet), message billing clair sur 409.

## 5. Facturation (QA-48) & outillage bêta (P1)

- **QA-48 — Stripe.** Toutes les variables Stripe de `.env.prod` étaient **vides** → checkout impossible. Clés **TEST** copiées `.env.dev` → `.env.prod` (canal SSH chiffré). Vrai blocage : `docker-compose.prod.yml` ne passait pas les `STRIPE_PRICE_ID_*` au conteneur (`--env-file` ne sert qu'à l'interpolation) → ajout au service `backend`. Validé : 2 sessions checkout test (BASIC + BUSINESS, `cs_test_…`).
- **P1a — cohorte.** `V80` ajoute `beta_cohort` / `beta_context` sur `users` (tag manuel par testeur depuis l'intake).
- **P1b — export projet.** `GET /api/workspaces/{slug}/projects/{id}/export?format=json|csv` (`ProjectExportService`, réutilise `IssueService`) + bouton front → export **complet** (issues + descriptions + commentaires + activité).
- **P1c — métriques.** Runbook `ops/analytics/beta-funnel.sql` (11 requêtes : population, funnel n + %, par contexte/cohorte, fiche par testeur, rétention J0/J7, Smart Assign, chat IA, fiabilité `ai_runs`, conso vs plafond, feedback, conversion), validé end-to-end contre la prod.

## 6. Reste à traiter

**Hors code (porteur) :**
- Webhook Stripe test (`STRIPE_WEBHOOK_SECRET` vide → le plan ne se sync pas auto après paiement).
- Realm Keycloak : `email_verified` + first-broker-login linking (durcissement M7 complet).
- Tag `beta_cohort` / `beta_context` par testeur (via l'intake).

**Sécurité à qualifier :**
- Alertes ZAP frontend (**4 Medium / 4 Low**) — qualifier puis traiter (probables en-têtes de sécurité / CSP).

## 7. Références
- Traces détaillées : `.ai/roadmap.md` (`[QA-46]` … `[P1c]`).
- Runbook métriques : `ops/analytics/beta-funnel.sql`.
- Playbook bêta (séquence / intake / emails) : artifact `bd6b8b62-ad2d-4710-a077-dcf737c7937f`.
- Audit de préparation : artifact `07ab1ed4-e1bd-4726-818c-9f37934703ca`.
- Déploiement : P1c via PR #175 → #176 (main `319b710d`) ; QA-46→50 + P1a-b déployés dev → main le 27/08.
