# Audit de livrabilité pré-soutenance (PFR / RNCP 38606) — 16/08/2026

> Topo consolidé : regard critique « est-ce livrable ? » + couverture de la grille PFR + état des
> features démo (paiement Stripe, bascule IA Groq, sécurité, tests/couverture). Sources : 3 audits
> ciblés (grille PFR, Stripe, sécurité/couverture) + vérifs live.

## 0. Verdict global (honnête)

**La démo est solide et l'app fonctionne** ; le dossier Blocs 2-3 est bien couvert et chiffré au-dessus
des seuils. **Ce n'est PAS « fini-fini »** : il reste des trous certification (C11/E9 RGPD externe, Bloc 4
non déployé), 3 risques P0 côté prod, un **bug paiement Business** à corriger, et de l'hygiène (secrets à
roter, CI cassée). **Livrable pour la soutenance (28-29/09, Blocs 2-3)** : oui, moyennant les actions ci-dessous.
**Livrable pour la certification complète** : non encore (Bloc 4 + C11 dépendent d'éléments externes/école).

> **▶ MAJ 17/08/2026 — chantiers A (couverture honnête) + B (portes CI bloquantes) livrés.**
> - **Front (C18)** : gate Vitest **85,19 → 90,03 %** (exclusion généré/déco/barrels + tests `client-logger`
>   0→100 % et `turnstile-widget`) — **821 tests**.
> - **Back (C25)** : **+22 slices `@WebMvcTest`** (15 contrôleurs qui étaient à ~0 %, en 2 lots) ;
>   `it.ps1 -Verify` = **874 tests**, gate JaCoCo **72,99 → 74,11 %**, « All coverage checks have been met ».
> - **CI (C26 / PC-028) — RÉSOLU** : `backend-tests.yml` → `mvn verify` (gate JaCoCo **bloquant**) + nouveau
>   `security-scan.yml` (Trivy + Semgrep, gate CRITICAL/ERROR + hebdo) + **`zap-dast.yml`** (ZAP DAST planifié).
>   **C26 passe de 🟡 à ✅** (portes CI).
> - **Durcissement prod P0 ✅** : PC-024 (profil `prod` fail-safe), PC-025 (pgvector partout), PC-026 (seeds hors prod), PC-027 (CORS depuis
>   l'env) — vérifiés par la chaîne de migration **sans seeds**. **Montée CVE HIGH** : spring 7.0.8 / netty 4.2.16 /
>   micrometer 1.16.6 / data-commons 4.0.6 / next 16.2.11 / **keycloak 26.0.6** + `apk upgrade`. Toutes les CVE HIGH corrigeables fermées.
> - Reste **action user** : roter secrets `.env.dev` ; `stripe listen` + démo Business. Détail : `.ai/roadmap.md` (bloc 17/08).

⚠️ **Localisation docs** : le Brain OS est à `C:\Taskforce\taskforce-docs\` (le chemin du `CLAUDE.md`
`C:\taskforce-project\...` est PÉRIMÉ). La grille officielle : `taskforce-docs\memoire\Grille_evaluation_TaskForce_REMPLIE_DFS_25-26.xlsx`
(Blocs 1-3 / C1-C26) ; matrice maître : `taskforce-docs\v1\16-memoire-rncp\README.md`.

## 1. Couverture de la grille PFR (32 compétences, 4 blocs)

Soutenance notée = **Bloc 2 (front, C13-C20)** puis **Bloc 3 (back, C21-C26)**. Bloc 1 (conception) et
Bloc 4 (déploiement) + C11/E9 sont évalués ailleurs (dossier + mise en situation de maintenance séparée).

| Bloc | État | Détail |
| --- | --- | --- |
| **B1 Conception (C1-C12)** | ✅ sauf C11 | Dossier conception, UML, MCD/MLD, C4, veille OK. **C11/E9 RGPD ⬜ NON ACQUISE** = audit d'un site marchand EXTERNE fourni par l'école, **pas encore communiqué** (l'audit fait sur TaskForce prouve la capacité mais ne remplace pas le livrable). |
| **B2 Front (C13-C20)** | ✅ | Couverture front **90,03 %** (821 tests), SEO **92 %** accueil / **100 %** autres (seuil 70 %), a11y, industrialisation. Réserve : maquettes rétro-documentées ; éco-conception (C16) à détailler. |
| **B3 Back (C21-C26)** | ✅ | Persistance/sécu, paiement Stripe (C23), API sécurisée, couverture back **74,11 %** (périmètre gate, `it.ps1 -Verify`, 874 tests ; seuil 50 %). **C26 ✅ (17/08)** : gate JaCoCo **bloquant en CI** (`mvn verify`) + scans SAST/SCA + DAST en CI (`security-scan.yml`, `zap-dast.yml`). Éco-conception (C22) à compléter. |
| **B4 Déploiement (C27-C32)** | 🟡/⬜ | Doc + CI/CD + supervision OK. **C28/E23 ⬜ rien déployé** (aucun domaine/DNS/**TLS**). C29-C30 🟡 (`docker-compose.prod.yml` prêt mais jamais exécuté en prod). |

**Trous certification** : C11/E9 (dépend de l'école), C28-C30 (Bloc 4 non déployé — relève de la mise en
situation séparée, hors soutenance notée des 28-29/09). **Réserve à assumer à l'oral** : stack back
Java/Spring alors que le CDC imposait PHP(Symfony)/Node → argumentaire « techno adaptée » (C22 + distance
critique C2), 30 s à préparer.

## 2. Paiement Stripe (mode test) — ⚠️ 1 bug + 2 prérequis démo

**Ce qui marche** : vraies **clés de test** dans `.env.dev` racine (`sk_test_…`, `whsec_…`, price ids).
Flux réel = **upgrade in-app** (login → page Facturation → « Passer à Business » → Checkout Stripe hébergé
→ webhook `checkout.session.completed` → activation plan). Endpoints : `BillingController.checkout`,
`StripeWebhookController`, `StripeWebhookService`.

**BUG price_id — CORRIGÉ (16/08) ✅** : les DEUX variables `.env.dev` pointaient sur le price Business
(`price_1TubPf…`, 19 €). Le vrai price **Basic existait déjà** (`price_1TubPA…`, 10 €, produit TASKFORCE_BASIC)
mais n'était référencé nulle part → mapping ambigu → le webhook rétrogradait Business→Basic. **Fix =
config** : `STRIPE_PRICE_ID_BASIC=price_1TubPA…` (le vrai Basic). **Vérifié LIVE via l'API** (accès test
confirmé, `livemode:false`) : `POST /api/billing/checkout` → **BASIC = price_1TubPA 10 €** (metadata BASIC),
**BUSINESS = price_1TubPf 19 €** (metadata BUSINESS). **+ garde-fou code** : `getPlanForPriceId` renvoie
`null` si un price-id est ambigu (double filet). *(Aparté : l'UI `pricing-data.ts` affiche Business à 29 € alors
que le price Stripe est 19 € — à aligner si voulu. Et le montant total = sièges × prix : démo plus lisible sur
un compte FRAIS = 1 siège = 19 €.)*

**Prérequis démo** :
1. Lancer via `docker-compose.dev.yml` (charge `.env.dev` racine).
2. **Stripe CLI** : `stripe listen --forward-to localhost:8080/api/webhooks/stripe`, copier le `whsec_`
   affiché dans `STRIPE_WEBHOOK_SECRET` et redémarrer le backend (sinon le webhook n'arrive jamais →
   plan jamais activé ; le repli `verify-session` est inerte). Astuce : `--events checkout.session.completed`
   pour éviter la rétrogradation le temps de corriger le price_id.
3. Créer un compte PENDANT la démo (le seed admin a `cus_seed_admin` → « Gérer facturation » échoue).
4. Carte test **4242 4242 4242 4242**, date future, CVC quelconque.

**Note flux** : signup → plan a été retiré (inscription = FREE, upgrade in-app). Donc « créer un compte en
Business » = créer le compte (FREE) puis l'upgrader vers Business. C'est un choix design assumé.

## 3. Bascule IA Groq (VM) — ✅ implémentée, ⚠️ clé à fournir

**Fait (code)** : détection AUTO du provider. Si `GROQ_API_KEY` est renseignée → le **chat**
(smart-assign, Cortex, orchestration/agents) bascule sur **Groq** (API hébergée OpenAI-compatible, zéro
compute local → déployable sur VM 4 Go). Sinon → **Ollama local** (dev). Les **embeddings restent sur
Ollama** (Groq n'en fournit pas). Fichiers : `ai-service/app/config.py` (`use_groq`),
`ai-service/app/services/ollama_gateway.py` (URL/auth/`/no_think` conditionnels), `health.py` (expose
`chat_provider`), `docker-compose.dev.yml` + `.env.dev`/`.env.example` (`GROQ_MODEL`, `GROQ_MODEL_FAST`).

**⚠️ La clé de `.env.dev` (`gsk_34jI…`) est MORTE** : test direct = **403 « Access denied »** sur
`llama-3.1-8b-instant` ET `llama-3.3-70b-versatile` (morte ou IP sandbox bloquée). → j'ai **vidé
`GROQ_API_KEY` en dev** (dev reste sur Ollama, qui marche). **Pour utiliser Groq** : récupérer une clé de
test gratuite sur console.groq.com, la mettre dans `GROQ_API_KEY` (`.env.dev` ou l'env de la VM), recréer
l'ai-service. Vérifier `GET /health` → `chat_provider: "groq"`. **À TESTER avec une vraie clé** (je n'ai
pas pu le valider de bout en bout faute de clé joignable).

**Vérifié (dev, no-op)** après rebuild ai-service : `GET /health` → `chat_provider: ollama` (clé vide),
smart-assign WEB-5 → **Aïcha 66 %** OK (3,2 s). La bascule ne casse donc RIEN tant qu'aucune clé n'est mise ;
elle s'active uniquement quand une clé valide est fournie.

## 4. Sécurité

**Solide (couche applicative, testé)** : chaîne Spring Security STATELESS, **JWT RS256 via JWKS Keycloak**
(+ validation issuer), headers **CSP/HSTS/X-Frame-Options/Permissions-Policy** (testés), **rate limiting**
bucket4j par profil, **RBAC au niveau service** (`AuthorizationService`, `ProjectVisibilityGuard` — IDOR
corrigés PC-021/034), **RGPD** (export + anonymisation + suppression identité Keycloak, chiffrement PII au
repos), **76 `@Valid`** sur 27 fichiers. Durcissement deps (overrides Trivy). Outillage `scripts/security-scan.ps1`
(Trivy + Semgrep + ZAP).

**⚠️ 3 risques P0 (prod, `Problemes_Connus.md`)** — ne bloquent pas la démo locale, mais à trancher pour
le dossier/déploiement :
- **PC-027 CORS en dur** : `CorsConfig.java` ignore `cors.allowed-origins` → en prod, origines bloquées.
- **PC-024 prod démarre en profil `dev`** : Dockerfile `SPRING_PROFILES_ACTIVE=dev` + compose prod passe
  `SPRING_PROFILE` (mauvais nom) → JWT HS512 maison, `flyway clean` armé, mot de passe DB par défaut.
- **PC-026 seeds dev en prod** : `V17__seed_dev_users.sql` injecte des comptes à **mots de passe en clair**
  (`Admin@2024`…) dans toute base migrée.

**⚠️ Secrets à ROTER avant de remettre le dossier** : `.env.dev` contient de vraies credentials tierces en
clair (clé Groq, **2 secrets OAuth GitHub**, Turnstile, Stripe test, mot de passe DB). Bonne nouvelle : les
`.env.*` sont **gitignore et absents de l'historique git** (vérifié) → exposition limitée aux fichiers
locaux. Mais roter la clé Groq + les secrets GitHub par principe.

**Écart règle d'or #8** : Zod déclaré mais **inutilisé** côté front (validation front ad-hoc) ; la vraie
barrière = `@Valid` serveur. À mentionner honnêtement (ou brancher Zod sur 1-2 formulaires clés).

## 5. Tests & couverture

- **Front** : ✅ ~**92 %** lignes (périmètre logique `lib`/`hooks`/`components/auth` ; pages `app/**` +
  `components/ui` délégués aux E2E Playwright), **781 tests / 63 fichiers, 0 échec** (`vitest run`).
- **Back** : ✅ ~**78 % `-Full`** (670 tests) / **~75 % sur le périmètre du gate** — MAIS **seulement quand
  lancé via `.\scripts\it.ps1 -Test ALL` ou `-Full`** (Postgres pgvector sibling).
- **⚠️ CI & rapport disque cassés** : `backend-tests.yml` fait `mvnw clean test` **sans service Postgres**
  → tests d'intégration en erreur → rapport JaCoCo sur disque **~4 %** (faux) et « Backend Tests » rouge
  en CI. **Le gate JaCoCo (70 %) ne s'exécute jamais en CI** (lié à `verify`, jamais appelé) — PC-028.
  Seuil Vitest `global` inerte (glob invalide) ; seuils par chemin OK.
- **Régénérer le vrai chiffre** : `.\scripts\it.ps1 -Full` → `target/site/jacoco-full/index.html`.
- **Cohérence chiffres** : plusieurs valeurs ont coexisté ; s'en tenir à la réconciliation du 23/07
  (front **89-92 %**, back **~75-78 %**) et annoncer le **périmètre** au jury.

## 5bis. RGPD & sécurité SUR TaskForce (décision user 16/08 — le cas RGPD = TaskForce, pas un site externe)

Inventaire (sous-agent) : socle solide (registre traitements, audit RGPD E9, procédure droits/`GdprService`+tests,
chiffrement AES-256-GCM, PSSI, STRIDE, SSDLC, cahier de recettes/matrice). **3 docs manquants PRODUITS (16/08)**
dans `taskforce-docs/v1/07-securite/` :
- **`Procedure_Violation_Donnees.md`** (Art. 33/34 : détection→qualif→risque→notif CNIL 72 h/personnes, registre, modèles).
- **`DPIA_Analyse_Prealable.md`** (Art. 35 : screening 9 critères EDPB → mini-AIPD ciblée Smart Assign, humain-dans-la-boucle → risque acceptable).
- **`Rapport_Securite.md`** (rapport consolidé : contrôles par domaine + preuves/tests + risques résiduels + outillage scan).

**Réconciliation + finitions — FAIT (16/08)** : ④ sous-traitants **tranchés = Ollama local par défaut, Groq (USA)
optionnel si `GROQ_API_KEY`** (DPA+CCT/DPF) → aligné dans `Registre_Traitements_RGPD.md`, `Audit_RGPD_Conformite.md`,
`legal/subprocessors.astro` + `ai-transparency.astro` + `trust.astro` + `enterprise.astro` (Anthropic/OpenAI retirés,
non câblés) ; **Turnstile/Cloudflare ajouté au registre** (sous-traitant conditionnel, reçoit l'IP) ; **STRIDE**
D3/TF-SEC-011 marqué résolu ; **PSSI** documente Turnstile ; **lien mort `cookie-banner.tsx`** → `${site}/legal/privacy`.

**Scan sécu + rapports — FAIT (16/08, chiffres réels)** :
- **Scan** (`security-reports/2026-08-16_18-54-07/` + `…_18-49-21/`) : Trivy images **0 CRITICAL / 25 HIGH (toutes avec
  correctif) / 61 MEDIUM**, **0 secret**, Semgrep **695 WARNING / 0 ERROR** (91 % = liens http en HTML + tags CI ;
  1 `spring-sqli` = faux positif vérifié), ZAP **0 HIGH / 4 MEDIUM**. → intégré dans **`Rapport_Securite.md` §5**.
- **Rapport de tests** : nouveau **`v1/08-operations/Rapport_Tests.md`** — **back 852 tests 0 échec, 72,99 % lignes
  (périmètre gate, > seuil 70/50 %)** ; **front 781 tests 0 échec, 84,53 % lignes**. Artefacts jacoco-full/ + coverage/.

**Reste (action user)** : identité éditeur dans `legal/*.astro` (placeholders, gardés pour la démo) ; DPA Groq **quand** clé prod.
**Liens légaux + Zod — FAIT (16/08)** :
- **Liens « morts » = FAUX POSITIF des agents** : `app/privacy-policy/page.tsx` et `app/legal-notices/page.tsx`
  EXISTENT et répondent **200**. Les liens de app-footer/register/payment/settings sont **valides** (non touchés).
  L'agent avait **cassé le cookie-banner** (redirigé vers la landing cross-origin) → **reverté** vers `/privacy-policy` interne.
- **Zod couvert** : `lib/validation/auth-schemas.test.ts` (12 tests) → tsc/eslint clean, front 64 fichiers de test.
- **NB gate front (exit 1)** : PAS dû au Zod (mon hypothèse était fausse) → gaps **préexistants** `lib/api/auth-service.ts`
  (81,69 %) + `lib/contexts/**` (branches 71,87 %). À re-couvrir si on veut le gate vert (hors périmètre Zod).

**Gate front — VERT (16/08)** : `auth-service.ts` 81,69→**98,69 %** (+12 tests), `auth-context.tsx` 89,32→**95,14 %**
(branches →85,29 %, +3 tests). Front **807 tests, 0 échec, exit 0**. Rapport_Tests.md à jour.
**Reste (mineur, moi si voulu)** : puces marketing « OpenAI/Anthropic » (Hero, PricingSection) = décision produit ;
rejouer Trivy `fs` (misconfig, rapport vide).

## 6. Actions prioritaires AVANT soutenance (checklist)

**Démo (bloquant)**
- [ ] Stripe : créer un **price Business distinct** (test) + `STRIPE_PRICE_ID_BUSINESS` → sinon Business→Basic.
- [ ] Stripe : lancer `stripe listen` + aligner `whsec_` avant la démo paiement.
- [ ] (Si démo IA sur VM) mettre une **clé Groq valide** + vérifier `chat_provider: groq` ; sinon garder Ollama.
- [ ] Re-régénérer le seed démo si base réinitialisée (`.\scripts\db.ps1 seed`).

**Dossier / certification**
- [ ] Relancer les vrais tests (`it.ps1 -Full`) et **figer les chiffres** de couverture cités au jury.
- [ ] Réclamer à l'école le **cas RGPD externe (C11/E9)**.
- [ ] Roter clé Groq + secrets GitHub des `.env.dev`.
- [ ] Élaguer le support (32 slides pour 20 min = trop dense) + finaliser script démo.

**Prod (si Bloc 4 déployé — sinon assumer non déployé)**
- [ ] PC-024/026/027 : profil prod, seeds hors prod, CORS piloté par env. PC-028 : brancher gate JaCoCo + scans en CI.

---
**Maj** : 16/08/2026 — audit consolidé (3 sous-agents + vérifs live). Détail Stripe/sécu/couverture : voir
`Problemes_Connus.md`, `tests-backend-journal.md`, `tests-frontend-journal.md`, `soutenance-brief.md`.
