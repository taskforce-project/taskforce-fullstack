# Review UI/UX — cluster Auth / Connexion (05/08)

> Revue visuelle menée par le user, écran par écran, en commençant par la connexion / inscription.
> Pane de dev instable → correctifs par lecture/édition du code ; le user review en live après restart front.

## Items relevés (10)
| # | Item | Statut |
|---|---|---|
| 1 | **Logo** — inverser en blanc en dark mode | ✅ **Fait** — `auth/layout.tsx` : `dark:invert` (logo = « F » noir plein sur transparent) |
| 2 | **Favicon** — dimension ≠ celle du site | 🔲 aligner sur le logo du site |
| 3 | **Cartes de prix** — refaire « comme sur Claude » (toggle mensuel/annuel, icône, prix, features ✓) | 🔲 `register/plan` + `onboarding/plan` ; garder le dialog Enterprise accessible |
| 4 | **Stripe** — fonctionne ? | ✅ **Info** : prouvé bout-en-bout le 24/07 (MAJ 16). Rien à faire |
| 5 | **Feedback Enterprise** — existe ? | ✅ **Info** : `enterprise-contact-dialog.tsx` → `POST /api/sales/inquiry` → base `EnterpriseInquiry` + mail sales. Vérifier accessibilité depuis les cartes |
| 6 | **OTP** — page pas alignée (« bancale ») | 🔲 refonte alignement + spinner |
| 7 | **Boutons de chargement** — spinner + texte partout (pas juste le texte) | 🔲 sweep auth d'abord |
| 8 | **Onboarding** — hors charte, « on a quitté TaskForce » | ✅ **Fait** — refonte « dans l'app » (`OnboardingShell` : mini-sidebar logo haut + checklist des étapes + compte bas, canevas + footer ancré) |
| 9 | **« IA »** — ne pas appeler ça « IA » | ✅ **Fait (onboarding)** : « Compétences suggérées », « laisse TaskForce te suggérer ». Ouvert : vrai nom produit ? sweep global (`Ask AI`, `Usage IA`, `Intelligence`) |
| 10 | **Tokens onboarding** — ~600 tokens décomptés du quota FREE, en silence | ✅ **Fait** — `AiMeter.complimentary()` : la suggestion passe le gate mais n'est plus décomptée (courtoisie de pré-activation) |

## Ordre d'exécution
1. **Auth forms** : loaders dans les boutons (7) + alignement/refonte OTP (6).
2. **Cartes de prix** (3) façon Claude, sur les 2 pages, dialog Enterprise conservé.
3. **Favicon** (2).
4. **Onboarding** : refonte « dans l'app » (8) + fix tokens (10) + nom de la suggestion (9).

## Avancement 05/08 — cluster connexion LIVE (front restart)
Vérifs : `tsc` 0 erreur · `plan-form.test.tsx` **28/28** · routes login + register/plan + onboarding/plan → 200.
- **1 Logo** ✅ `dark:invert` (blanc en dark).
- **6 OTP** ✅ centré (boîtes + description) + **spinner** dans « Vérifier ».
- **9 Nom** ✅ **Cortex** (nom maison déjà présent dans l'app) + loader défilant façon Claude : `ThinkingBar` réutilisé (phases custom « Analyse de ton rôle… »). Décision : le loader-mots **remplace** « IA propose ». Sweep global `IA/AI` (dashboard) = à confirmer.
- **3 Cartes de prix** ✅ refonte façon Claude sur **les 2 pages** : icône par palier (Sparkles/Zap/Rocket/Building2), hiérarchie, divider, features ✓ ; dialog Enterprise conservé ; **interaction + libellés testés préservés** (0 test cassé).
- **7 Loaders** 🟧 faits sur OTP + `plan-form` (« Chargement… » + spinner) ; **sweep du reste** des boutons à faire.

## MAJ 05/08 (2) — retours review connexion
- **Nommage (révision)** : décision user affinée → **ne PAS nommer** la fonctionnalité. « Cortex » retiré de l'onboarding : suggestion **automatique = juste le loader défilant** (`ThinkingBar`, sans label), texte neutre « Suggestions ». Features plan : « Cortex » → « IA » (générique). ⚠️ **Cortex reste le nom du moteur PARTOUT ailleurs** (topbar, Settings, billing, `cortex-usage`) → **décision globale à trancher** : garder Cortex ou passer à « IA / Ask AI » générique sur toute l'app.
- **Persistance étapes d'inscription** ✅ : retour arrière ne vide plus les champs. `register-info-form` ré-hydrate prénom/nom/email/mot de passe depuis `sessionStorage` ; `plan-form` ré-sélectionne le plan stocké. NB sécurité : le mot de passe est **déjà** en sessionStorage (transit du multi-étapes, purgé après OTP) — la pré-remplissage ne fait que réutiliser l'existant.
- **Mot de passe oublié** ✅ **vérifié, rien à faire** : flux 2 temps en une route (email → OTP + nouveau mdp), spinners déjà présents ; back `POST /api/auth/forgot-password` + `/reset-password` (DTO validés) + tests unit/intégration.

## MAJ 05/08 (3) — cartes v2 + nommage tranché
- **Nommage : Cortex** (décision user). Restauré dans l'onboarding (« Suggéré par Cortex » + « laisse Cortex te suggérer ») ; le loader défilant reste sans label (automatique). Features plan → « tokens Cortex ». Reste : sweep Cortex sur le dashboard (« Usage IA » → cohérence).
- **Cartes de prix v2** (retour user « pas assez comme Claude + plus gros ») ✅ : refonte **CTA par carte** (l'élément clé de Claude, remplace ring + « Continuer »), **plus grandes** (p-6, prix `text-3xl`, icône `size-11`), mention de facturation sous le prix, en-tête « Tout ce qui est dans X, plus : ». Appliqué à **register/plan ET onboarding/plan** (mêmes cartes). Page inscription élargie (`max-w-6xl`). **Test réécrit pour la nouvelle interaction → 18/18** ; `tsc` 0 ; aucun test d'intégration impacté.

## MAJ 05/08 (4) — sweep Cortex + constat paiement
- **Sweep « Usage IA » → Cortex** ✅ : `card-registry` (« Usage Cortex »), Settings onglet (« Usage Cortex ») + panneau (« Consommation Cortex »). tsc 0, aucun test ne citait « Usage IA ».
- **Flux de paiement (réponse au user)** : les DEUX chemins mènent au **checkout Stripe hébergé** (comme Claude). Classique : info → plan → **OTP (email vérifié, compte créé)** → si payant, back crée la session Stripe (`AuthService.verifyOtpAndCompleteRegistration` → `checkoutSessionUrl`) → redirection Stripe. GitHub : compte déjà créé → `onboarding/plan` → `createCheckoutSession` immédiat. Le paiement est donc **après l'OTP** en classique — d'où la confusion (« où est le paiement »).
- **Config Stripe vérifiée** : `STRIPE_PRICE_ID_BASIC` et `_BUSINESS` sont réels (`price_1Tub…`) → checkout OK. ⚠️ **Les deux pointent sur le même price ID** → Basic et Business factureraient pareil. À corriger côté user (2 prix distincts dans Stripe test). Test live : signup Business → OTP → carte test `4242 4242 4242 4242`.

## MAJ 05/08 (5) — stepper parlant + annonce paiement
- **Stepper d'inscription plus parlant** (retour user) ✅ : libellés **un mot par étape, tous visibles** sous les segments — « Compte / Formule / Vérification » (avant : seul le libellé courant, style « Votre compte »). Étape courante mise en avant par la couleur ; `aria-valuetext` conservé. Test `auth-stepper` réécrit + `register-info` MAJ.
- **Annonce paiement** ✅ : sur la page OTP, si plan payant (BASIC/BUSINESS), bandeau « après vérification, redirigé vers le paiement sécurisé (Stripe) » — répond à « où est le paiement » en classique. `tsc` 0, **95/95 tests auth**.

## MAJ 05/08 (6) — refactor flux plan/paiement façon Linear (décision user)
**Constat** : en inscription classique, le checkout Stripe était bricolé PENDANT la vérification OTP (compte créé en Free d'abord, puis tentative de checkout) → fragile, pas de redirection fiable. Le bandeau « paiement après vérif » était un pansement.
**Décision** (AskUserQuestion) : **Free au signup, upgrade in-app** (modèle Linear / Notion / Slack / Vercel).
- **Signup classique** : `Compte → Vérification` (stepper 2 étapes, plus 3). `register-info` stocke `planType: FREE` et route direct vers `verification`. Bandeau paiement + lien « choix du plan » retirés.
- **Signup GitHub** : `callback` route les nouveaux vers `/onboarding` (plus d'interstitiel plan).
- **Supprimés** : `app/auth/register/plan/`, `components/auth/register/plan/` (plan-form + test), `app/onboarding/plan/`, export `RegisterPlanForm` de `index.ts`.
- **Upgrade** = **Réglages → Facturation** (`billing/page.tsx`, déjà excellent : 4 forfaits, toggle annuel, « Passer à X » / « Gérer » / « Rétrograder », checkout Stripe **authentifié** = fiable). Rien à construire.
- **Pages `/payment/*`** : ne servent plus qu'à l'upgrade in-app (user connecté) → navigation repointée vers l'app (`/`), plus de retour vers `/auth/register/plan` ni `/auth/login`.
- **Vérifs** : `tsc` 0 · **77 tests auth** + **23 tests intégration** verts · `register/plan` → 404 · toutes routes 200.

## MAJ 09/08 (7) — refonte onboarding « dans l'app » + tokens offerts
**Item 8 — refonte « on reste dans l'app »** ✅ : nouveau composant `components/onboarding/onboarding-shell.tsx` qui donne au wizard le châssis Linear. Mini-barre latérale (jetons `--sidebar*`) : **marque en haut** (logo, `dark:invert`, même traitement que l'auth), **checklist verticale des 4 étapes** au milieu (= la progression ; états fait ✓ / courant / à venir ; clic borné à `maxStep` pour revenir en arrière), **compte en bas** (miroir visuel de `NavUser`, non interactif). Le contenu de l'étape occupe un canevas centré (`max-w-2xl`), la navigation (Précédent / Suivant / Terminer) est ancrée dans un footer bordé. Sous `md`, la barre latérale cède à un bandeau (logo + « Étape X/N »). `page.tsx` recâblé sur la coquille : retrait de la carte flottante + barre horizontale + texte « Étape x sur y » ; ajout de `maxStep` (borne des sauts) et du bloc `account`. Thème clair/sombre respecté (déjà via jetons). `tsc` 0 · `eslint` 0 · route `/onboarding` → 200 après restart front. Aperçu statique fidèle livré au user (vue authentifiée impossible côté agent : login/inscription interdits par les règles de sécurité).
**Item 10 — tokens onboarding offerts** ✅ : `AiMeter.complimentary(workspaceId, work)` — **même gate de quota** que `metered` (au plafond, le LLM local n'est pas lancé → repli déterministe) mais **aucun enregistrement** de conso. `SkillSuggestionService` bascule dessus (`meteredSuggest` → `complimentarySuggest`), javadocs corrigées (le chemin n'est plus « comptage tokens » mais « gate sans décompte »). Motif : l'onboarding est une **courtoisie de pré-activation**, il ne doit pas grignoter le quota FREE (100k) avant que la personne se serve de l'outil. Nouveau `AiMeterTest` (3 cas : `metered` compte · `complimentary` gate sans compter · au plafond le gate lève sans appeler le LLM) → **3/3 verts**, backend `BUILD SUCCESS` (440 sources compilées).

## MAJ 09/08 (7b) — onboarding : 2e passe sur retours live (le user a vu l'écran authentifié)
Retours sur le 1er jet : footer désaligné avec la barre profil · logo trop petit · violet délavé (pas les couleurs de l'app) · « reprends le vrai composant sidebar, vide ». Corrections :
- **Vrai `Sidebar` de l'app** (`collapsible="none"`) **vide** : `SidebarHeader` (logo `h-10`, plus gros) + `SidebarContent` vide + `SidebarFooter` (compte). La **checklist des étapes quitte la sidebar** → passe dans une **topbar** côté contenu (le pendant de l'`AppTopbar`), fil horizontal cliquable.
- **Alignement des bordures** : en-tête sidebar & topbar en `h-14`, pied sidebar & footer en `h-16` → les traits se prolongent (et `--border` == `--sidebar-border`). Règle le grief d'alignement, en haut **et** en bas.
- **Couleurs = système de l'app** : footer en `Button` (primaire **bleu**), et accents `--accent-purple` du contenu (séniorité, puces de suggestion, Cortex) → `--primary`. Plus de violet.
- Mobile : sidebar `max-md:hidden`, topbar montre logo + « Étape X/N ». `tsc` 0 · `eslint` 0 · `/onboarding` → 200. ⚠️ Aperçu statique du (7) **périmé** (le user vérifie en live désormais).

## MAJ 09/08 (7c) — onboarding : logo + « trop vide »
Retours live : le mark seul rend mal · la sidebar vide fait trop creux (« un peu vide »). Corrections :
- **Logo** → lockup **marque + « TaskForce »** (`BrandLockup`) : le mark seul était illisible en petit ; le mot ancre la marque.
- **Sidebar remplie par les étapes** — retour des 4 étapes DANS la sidebar, mais via les **vraies primitives** `SidebarGroup`/`SidebarGroupLabel "Configuration"`/`SidebarMenu`/`SidebarMenuButton` (rendu natif : fond actif `sidebar-accent`, survol, `disabled`), pas le stepper custom. Le fil horizontal quitte la topbar → remplacé par un **fil d'Ariane** « Configuration / {étape} » (aligne toujours la bordure du haut).
- **Contenu centré verticalement** (`min-h-full flex justify-center`) → plus de grand vide sous l'étape 1 ; s'étire et défile pour l'étape 2. `tsc` 0 · `eslint` 0 · `/onboarding` → 200.

## MAJ 09/08 (7d) — polish onboarding + bug fil d'Ariane dashboard (retours live)
- **Logo** encore agrandi : mark `h-9` + mot « TaskForce » `text-lg`.
- **Inputs shadcn** : tous les `<input>`/`<textarea>` bruts de l'onboarding (rôle, compétence, capacité, bio, workspace, invitation, projet) → composants `Input`/`Textarea` de l'app (bon focus `ring-ring/50 ring-[3px]`, le user notait un survol/focus différent). Bouton « Ajouter » (invitations) → `Button variant="outline"`.
- **Loader Cortex (étape 2)** validé par le user (« j'adore ») — `ThinkingBar`, on garde.
- **Bug dashboard — fil d'Ariane « Pierre 6db5ea » + 404** : le 1er segment (slug workspace, ex. `pierre-6db5ea` avec suffixe hex d'unicité) passait dans le title-case kebab générique de `segmentLabel` → « Pierre 6db5ea », et liait `/{slug}` (route SANS page → **404**). Corrigé dans `app-topbar.tsx` (`useBreadcrumbs`) : 1er segment → **nom réel du workspace** (via `workspace-store`) + href `/{slug}/dashboard`. **+ filet** `app/(protected)/[workspace]/page.tsx` : redirect serveur `/{slug}` → `/{slug}/dashboard`. Vérifié : `/pierre-6db5ea` → **200** (était 404). `tsc` 0 · `eslint` 0.

## MAJ 09/08 (7e) — tutoriel produit (tour guidé « maison », stylé shadcn)
Demande user : un vrai tour post-onboarding façon « autres apps », coach-marks + nuance marketing. Choix (AskUserQuestion) : **maison, sans dépendance, stylé avec nos jetons shadcn** (pas de driver.js).
- **Store** `lib/store/tour-store.ts` (Zustand + `persist` pour `hasSeen`) : `isActive`/`stepIndex` éphémères, `start`/`setStep`/`close(markSeen)`.
- **Moteur** `components/tour/product-tour.tsx` : overlay + **spotlight** (dim + trou via `box-shadow: … 9999px`, anneau `--primary`) + **popover** positionné (auto dessous/dessus, ou `right` pour la sidebar), `bg-popover`/`Button`, clavier (Échap/flèches), portal `document.body`, focus a11y. Cibles repérées par `data-tour="…"`. 6 étapes : accueil · navigation (sidebar) · créer une opération · Cortex/Ask AI · analytics · **upsell** (ouvre le modal d'upgrade existant via `useUpgradeStore`).
- **Cibles taguées** : `data-tour` sur `Sidebar` (app-sidebar), bouton « Ask AI » (app-topbar), lien « Créer une opération » (quick-columns), section Analytics (dashboard). Monté 1× dans `AppShell`.
- **Déclenchement** : dashboard, 1× si `!hasSeen` (délai 900 ms le temps que la grille se peigne). **Rejeu** depuis Help (bouton « Revoir la visite guidée » → `/{slug}/dashboard?tour=1`, forcé même si déjà vu, URL nettoyée après).
- `tsc` 0 · `eslint` 0 (2 warnings préexistants dans quick-columns, sans lien) · routes dashboard/help/onboarding → 200.

## MAJ 09/08 (7f) — tour : retours live + fix clé fil d'Ariane
- **Bug clé React dupliquée** (`app-topbar`) : mon fix (7d) rendait le href du crumb workspace = celui de « Dashboard » (`/{slug}/dashboard`) → deux `key` identiques (erreur console). Clé passée à `${i}-${href}`.
- **Fin du tour** (retour user) : l'étape upsell a maintenant **Précédent + Terminer + Voir les forfaits** (Terminer ferme sans upgrade ; Voir les forfaits ouvre le modal).
- **Hero (retour « plus gros modal, sympa »)** : les étapes centrées (accueil + upsell) passent en variante **hero** — carte plus large (460 px), grande icône, pitch + **3 points clés** (accueil : Opérations/Cortex/Analytics ; upsell : tokens/assistant/analyses). L'accueil explique à quoi sert l'app. Coach-marks compacts inchangés. `tsc` 0 · `eslint` 0.

## MAJ 09/08 (7g) — tour : CTA forfaits + étape « Repères visuels » (Labs) avec fond du site
- **« Voir les forfaits »** (retour user) : n'ouvre plus un 2e modal → **navigue** vers `/{slug}/billing` (`useRouter`+`useParams`, plus `useUpgradeStore`). Vérifié : billing → 200.
- **Nouvelle étape hero « Repères visuels »** (demande : informer sur icônes/couleurs, ex. Labs) : explique la **fiole violette = Labs** (fonctionnalité avancée en finition — Intelligence, Brain OS), **bleu = action clé**, **cadenas = bientôt**. Support `bg` dans le hero → **bannière de couverture** avec le fond du site (`landing-page/public/labs/hero-wave.jpg` **copié** en `frontend/public/assets/tour/labs-wave.jpg`, pas d'édition de `landing-page/`), en-tête superposé lisible (backdrop). Icône par point colorable (`iconClassName`, fiole en `text-violet-500`). Tour = **7 étapes**. Image servie (200). `tsc` 0 · `eslint` 0.

## MAJ 09/08 (8) — retours dashboard / app-shell (revue live)
- **Bordure sidebar « double »** : la règle globale `[data-sidebar="sidebar"] { border-right }` (globals.css) **doublait** le `border-r` natif du composant shadcn (sur le conteneur parent). Règle globale retirée → un seul trait fin (style Cloudflare).
- **Menu compte (`nav-user`)** : « Passer à Pro » → **« Améliorer mon forfait »** (générique) ; **badge « Free » retiré** de l'item d'upgrade → le **plan s'affiche à côté du profil** (chip près du nom, dans le trigger ET l'en-tête du menu, façon Claude « Pierre · Max »).
- **Largeur des panneaux** : Workflows ouvrait à `400`, Ask AI à `420` (défaut) → décalage au switch. Workflows aligné sur **420**.
- **Settings « façon Claude »** : `SectionCard` passe **card-less** (titre + contenu direct, filet entre sections, plus de boîte encadrée) — s'applique à tous les panneaux d'un coup ; `MiniStat` allégé (sans bordure). **Conso Cortex** : l'upgrade **navigue vers `/{slug}/billing`** (ferme le modal d'abord, plus de 2e popup), CTA « Voir les forfaits » élargi (FREE + BASIC). La fenêtre de contexte reste propre au chat (non dupliquée). Parité conso : le panneau Settings couvre déjà plan/réinit./used-limit-%/prompt-completion-req.
- `tsc` 0 · `eslint` 0 · dashboard + settings → 200.
- **Boutons « dashed » (Créer une opération / New project)** : réponse — ce n'est **pas** un composant shadcn, c'est du style inline (`border border-dashed`) sur ~2 endroits (quick-columns, sidebar). Pas encore généralisé → candidat à un petit composant `AddTile` partagé si on veut l'uniformiser (à confirmer).

## MAJ 09/08 (9) — identité « Labs » alignée sur le site (gradient)
Demande : uniformiser tout le « mode lab » avec le site (icônes en dégradé, Ctrl+K, éventuellement bannière image).
- **Source** : sur le site, l'icône Labs prend un **dégradé sur le TRAIT** (`stroke: url(#lgC)`, palette de l'image **pêche→rose→bleu, sans violet**) ; labels en **texte dégradé** (`labs-gtext`).
- **Porté dans l'app** : nouveau `components/ui/labs-gradient-defs.tsx` (dégradé SVG `#tf-labs-grad` pêche→rose→bleu, monté 1× dans `AppShell`) + classes `globals.css` `.tf-labs-icon` (`stroke: url(#tf-labs-grad)`) et `.tf-labs-gtext` (texte dégradé).
- **Appliqué** : fioles Labs de la **sidebar** (Intelligence, Brain OS) — `text-violet-500` → `tf-labs-icon` ; badge **« Expérimentation »** de la topbar → flask + label en dégradé, pilule neutre (plus de violet, lien feedback neutralisé) ; **Ctrl+K** → nouveau groupe **Labs** (Intelligence `BarChart3` + Brain OS `Brain`, trait en dégradé) ; « Analytics » retiré de Navigation (déplacé dans Labs).
- **Non fait (optionnel, user incertain « jsp »)** : bannière image (`hero-wave`) sur les pages lab, et retrait du fond bleu de la topbar sur les pages lab — à confirmer.
- `tsc` 0 · `eslint` 0 (2 warnings préexistants command-palette) · dashboard + analytics → 200.

## MAJ 09/08 (10) — upgrade = redirection directe vers les plans (fini les pop-ups)
Retour user : cliquer « abonnement / améliorer » ouvrait un **modal** (`UpgradeDialog`) au lieu d'envoyer sur les plans — à **plusieurs endroits**.
- **Fix centralisé** : `UpgradeDialog` (monté 1× dans `AppShell`, seul consommateur de `useUpgradeStore.open`) devient un **pont** — dès `open=true`, il **navigue vers `/{slug}/billing`** et se referme (plus aucun modal rendu). Tous les CTA appelant `openUpgrade()` (menu compte, switcher workspace, conso Cortex `cortex-usage`, membres ×2, analytics `ChartExplorer`) atterrissent donc **directement sur les plans**, sans toucher chaque appelant.
- **Ctrl+K** : « Voir les forfaits » pointait sur `/settings` → corrigé sur **`/billing`**.
- (Rappel : tour d'onboarding + panneau conso Settings naviguaient déjà en direct.) `tsc` 0 · `eslint` 0 · dashboard + billing → 200.

## MAJ 09/08 (11) — fond image Labs + modal Settings élargi + composant `Zone`
- **(A) Fond image Labs** (le user a validé l'option) : le bandeau topbar des pages Labs quitte la teinte bleue pour **l'image du site** (`hero-wave`, classe `lab-banner-bg` = image + voile), et le **canevas** des pages Labs (`/analytics`, `/brain`) prend l'image en **bande haute qui se fond vers `--background`** (`lab-page-bg`, appliquée à `motion.main` dans `AppShell` quand `isLab`). Voile `--lab-veil` **thème-aware** (clair/sombre) pour la lisibilité. Image déjà en `public/assets/tour/labs-wave.jpg`.
- **(B) Modal Settings élargi** : `max-w-4xl` → **`max-w-5xl`** (+ `w-[94vw] h-[84vh]`) — la nav reste `w-56`, le **contenu** gagne la largeur.
- **(C) Composant `Zone`** (`components/ui/zone.tsx`) : conteneur encadré à **variantes** (`danger`/`warning`/`info`/`success`/`neutral`) avec couleurs + en-tête (titre/desc), façon « Danger Zone » GitHub, réutilisable partout. Appliqué aux **zones destructives** des Settings : suppression de compte (Account + Privacy/RGPD) et de workspace → `<Zone variant="danger">`. Contraste voulu avec les sections « card-less » : la boîte revient là où l'action est sensible (CRUD global).
- `tsc` 0 · `eslint` 0 · dashboard/analytics/settings + image → 200. ⚠️ Fond Labs non vérifié en live (auth) — à checker (surtout le voile en sombre) ; valeurs CSS faciles à ajuster.

## MAJ 09/08 (11b) — Labs : recadrage image (bandeau seul + blob) + icônes Ctrl+K
Précisions user : pas de fond sur toute la section (juste le bandeau) · Ctrl+K en icônes noires comme la sidebar · image discrète avec un blob à gauche pour la lisibilité.
- **`lab-page-bg` retiré** (`AppShell` : `motion.main` revient au fond normal ; `isLab`/`cn` retirés) → l'image n'est plus sur la page, **uniquement le bandeau**.
- **`lab-banner-bg` recadré** : `radial-gradient` « blob » couleur `--background` ancré à **gauche** (opaque 0→36 %, puis 62 % de fond à droite) par-dessus l'image → texte du fil d'Ariane lisible, image **discrète** à droite. `--lab-veil` supprimé (plus utilisé).
- **Ctrl+K** : `intelligence` repasse en `Activity` et `brain` en `Brain`, **couleur normale** (plus de `tf-labs-icon`) — comme la sidebar (`BarChart3` retiré des imports).
- (Inchangé, non signalés : la fiole dégradée de la sidebar + le badge « Expérimentation » de la topbar restent en dégradé.) `tsc` 0 · `eslint` 0 · dashboard/analytics → 200.

## MAJ 09/08 (12) — Accessibilité (Réglages → Apparence) : taille texte + dyslexie + daltonisme
Idée user (aussi un critère RNCP) : filtres daltoniens (couleurs officielles), taille du texte, police dyslexie.
- **Store** : `preferences-store` étendu (`dyslexiaFont`, `colorblindMode` + setters appliquant des classes racine ; `partialize` + `onRehydrateStorage` MAJ). `fontSize` existait déjà **mais sans CSS** → CSS ajouté (`html.font-large` 112.5 % / `font-x-large` 125 %, échelle rem).
- **Dyslexie** : `html.a11y-dyslexia #a11y-root` → police lisible (**OpenDyslexic** si installée, repli Comic Sans MS/Verdana/Tahoma) + espacements (lettres/mots/interligne) — les vraies aides ; honnête (pas de font propriétaire embarquée).
- **Daltonisme** : `components/a11y/a11y-filters.tsx` (défs SVG, monté 1× dans `layout`) = 3 filtres **daltonize** (simulation dichromatique réf. Viénot/Brettel → erreur → redistribution). Appliqué au **wrapper `#a11y-root`** (autour de `{children}`), **pas `<body>`** — sinon un `filter` sur un ancêtre casserait le `position:fixed` des portails (cf. mémoire `vaul-drawer-breaks-fixed-position`). Contrepartie assumée : les portails (modals/toasts) ne sont pas colorés-corrigés.
- **UI** : section « Accessibilité » dans `AppearancePanel` (taille = segmenté, dyslexie = `Switch`, daltonisme = `Select` 4 modes).
- **Vérifié LIVE** (JS sur `/auth/login`) : `#a11y-root` + 3 défs présents ; texte 16→18→20px ; dyslexie police+spacings actifs ; `filter: url("#cb-deuteranopia")` appliqué. `tsc` 0 · `eslint` 0 · auth/dashboard/settings → 200.
- ⚠️ **Qualité visuelle** des matrices de daltonisation non jugée (pas de rendu couleur sous les yeux) — mécanisme correct, valeurs standard et **ajustables**.

## MAJ 09/08 (12b) — Labs : bandeau plus visible + vague sur les lignes Ctrl+K
- **Bandeau plus visible** (retour user) : voile du `lab-banner-bg` réduit — droite passe de **62 %** à **40 %** de fond → **~60 % d'image** visible (blob de gauche conservé pour le fil d'Ariane). Vérifié JS.
- **Ctrl+K** : nouvelle classe `.lab-cmd-row` (vague discrète à droite, voile `--popover` fort à gauche) appliquée aux items du groupe **Labs** (Intelligence, Brain OS). Vérifié JS (image résolue).
- **Idée user — intégrations `21st.dev`/`shadcn`** (recommandations de composants pendant une tâche UI/UX) : **NON fait** — c'est un vrai chantier. Le catalogue est **piloté par le back** (`getIntegrationCatalog`, 129 connecteurs), et la valeur (recommandations IA via Cortex) est une feature v2. Ajouter des entrées **non fonctionnelles** = fausse intégration (contraire à la règle « pas de faux », cf. `TF-SETTINGS-FAKE`). Option honnête : entrées **`status:"PLANNED"`** (« Bientôt ») côté back → à confirmer avec le user. Sinon → backlog v2 (rapproché de [[taskforce-v2-pivot]]).
- `tsc` 0 · `eslint` 0 · login → 200.

## MAJ 10/08 (13) — Intégrations : librairies de composants (catégorie « UI & Composants », option 1)
Le user a validé l'option 1 (entrées honnêtes « Bientôt », la vraie reco IA = v2 « si on a le temps »).
- **Back** : nouvelle catégorie `ConnectorCategory.UI_COMPONENTS("UI & Composants")` + helper `planned()` dans `ConnectorCatalog` (statut `PLANNED`, `authType NONE`, 0 champ, capability `["recommend"]`, `docsUrl` = lib). 6 entrées : `shadcn`, `21st-dev` (clé slug ≠ nom `21st.dev`, contrainte `[a-z0-9-]+`), `radix-ui`, `aceternity-ui`, `magic-ui`, `origin-ui`.
- Contraintes de `ConnectorCatalogTest` respectées : capabilities **non vides** (`recommend`), `docsUrl` non-null (sinon test « observe-only » des génériques), slugs, ordre `plane…github…slack`. **27 tests OK**.
- **Front** : `CAP_LABEL.recommend = "Composants"` (chip) ; message `LabBanner` intégrations corrigé (plus de « 129 branchables » en dur → « la plupart… ; UI & composants sur la roadmap »). Le service compte déjà `available` (129) à part de `total` (135) → honnête.
- **Pas de fausse connexion** : `PLANNED` = badge « Bientôt », pas de bouton Connecter, pas de dialog (le front gérait déjà `status==="PLANNED"`).
- Vérifs : `ConnectorCatalogTest` 27/0 (conteneur Maven) · rebuild `backend` BUILD SUCCESS + boot sain (sert des 200, `/health` 401) · front redémarré 200. Fichiers back : `core/enums/ConnectorCategory.java`, `core/service/integration/ConnectorCatalog.java`.
- **v2 (si temps)** : moteur de **recommandation** de composants (Cortex + source composants, ex. MCP shadcn) → rapprocher de [[taskforce-v2-pivot]].

## MAJ 10/08 (14) — Fix double-modal « New project » + vague renforcée + vague sur gros input
- **Bug double-ouverture** (report user) : « New project » naviguait vers `…/projects?new=1` et la page ouvrait le modal **au montage** (`useState(defaultOpen)`). En **dev**, le double-montage React Strict Mode (défaut Next, `reactStrictMode` non désactivé) rejouait l'anim → ouvre/ferme(« changement de page »)/rouvre. **Absent en prod**, mais pattern fragile.
  - **Fix = modal GLOBAL** (pattern `useSettingsStore`/UpgradeDialog) : nouveau `useCreateProjectStore` (`open`/`openCreateProject`/`closeCreateProject`) ; `CreateProjectDialog` réécrit en **contrôlé** (props `open`/`onOpenChange`, plus de `defaultOpen`/trigger/effet ; toast + `router.push` vers le projet au succès) ; nouveau `CreateProjectModal` monté dans `AppShell`. **Plus de navigation → plus de changement de page → plus de clignotement.**
  - Déclencheurs bascule vers `openCreateProject()` **en place** : sidebar (`Link ?new=1`→`SidebarMenuButton onClick`), tuile dashboard (`quick-columns`), Ctrl+K (`new-project`: `go("/projects")`→ouvre+ferme la palette), page projets (header + EmptyState). Toute la mécanique `?new=1`/`autoNew`/`clearNewParam`/`useSearchParams` **supprimée** de `projects/page`.
  - ⚠️ La page `app/(protected)/[workspace]/projects/new/page.tsx` (formulaire plein écran) était **déjà orpheline** (aucun lien) → dead code à supprimer (tâche à part).
- **Vague ×2 (retour user)** : `lab-banner-bg` voile droit 40 %→**28 %** ; `lab-cmd-row` 72 %→**48 %** (révélé plus tôt, 42 %).
- **Vague sur gros input** : ~~classe `lab-input-bg` sur l'`CommandInput`~~ → **RETIRÉE le 10/08** (le user n'en voulait pas sur le champ de recherche : « pourquoi l'input a un bg ?? »). Usage + classe CSS supprimés. « Les gros inputs » du tour précédent visait donc autre chose (barres de recherche de page ?) — à préciser si besoin.
- Vérifs : `tsc` 0 · `eslint` 0 erreur · login/dashboard/projects → 200 · 3 classes wave résolues (JS). ⚠️ Comportement du modal non testé authentifié — à confirmer par le user (ouverture unique et propre depuis les 4 points d'entrée).

## MAJ 10/08 (15) — Fiche détaillée des intégrations (façon Claude) + retrait bg input Ctrl+K
- **Retrait bg input** : le user ne voulait pas de vague sur le champ de recherche du Ctrl+K → `lab-input-bg` (usage + classe CSS) supprimé. (Le reste — modal global, vague ×2 — validé : « sinon c'est bon ».)
- **Fiche détaillée connecteurs** (choix user « Vue détaillée + vrais liens ») : clic sur une carte → **fiche** façon Claude (`ConnectorDetailView` dans `integrations-catalog.tsx`) : en-tête (logo/nom/état + bouton Connecter/Gérer), **capacités expliquées** (`CAP_DESC`), **connexion** (mode d'auth `AUTH_HELP` + `setupHint`), **catégorie**, et **liens RÉELS** (site officiel + doc). `ConnectorCard` devient cliquable (bouton d'action + tooltip déplacés dans la fiche). `Tooltip*` retirés de l'import (plus utilisés).
- **Honnêteté** : AUCUNE liste d'outils / auteur / description longue inventée (contrairement à Claude qui a la vraie donnée MCP). On n'affiche que le vrai : description 1-ligne, capacités, auth, catégorie, liens.
- **Backend** : `ConnectorDescriptor` + `ConnectorView` (DTO) + service enrichis d'un `websiteUrl` (nullable) ; `ConnectorCatalog` porte une map **`WEBSITES`** de ~125 **URLs officielles réelles** (homepages ; génériques VPS/SMTP → null) via helper `website(key)`. Interface front `ConnectorView` MAJ.
- Vérifs : `ConnectorCatalogTest` **27/0** (compile + pas de clé dupliquée dans la map) · rebuild `backend` BUILD SUCCESS + up · `tsc` 0 · `eslint` 0 erreur · front redémarré, settings/login → 200.
- ⚠️ **Non vérifié en session authentifiée** (fiche détail non visible) : le user doit valider le rendu de la fiche + la **justesse des ~125 URLs** (saisies de mémoire, faciles à corriger dans `WEBSITES`).

## MAJ 10/08 (16) — a11y sur toute l'app (body) + recherche réglages + bord « Cloudflare »
- **Daltonisme/dyslexie sur TOUTE l'app** (bug user : « les settings ne s'adaptent pas ») : le filtre était sur `#a11y-root`, mais les modals Radix sont des **portails rendus dans `body`** (hors `#a11y-root`) → non filtrés. **Déplacé sur `body`** (`html.cb-* body`, `html.a11y-dyslexia body`). Wrapper `#a11y-root` **supprimé** (layout). Risque `position:fixed` (cf. [[vaul-drawer-breaks-fixed-position]]) écarté : le body de l'app **ne scrolle pas** (h-svh + scroll interne, vérifié `bodyScrolls:false`) → `body ≈ viewport`, `fixed` reste calé. Vérifié JS : `getComputedStyle(body).filter = url("#cb-deuteranopia")`, police dyslexie sur body, `#a11y-root` absent.
- **Recherche dans les réglages** : `SettingsNav` (partagé modal + page) porte un champ **« Rechercher un réglage… »** en tête qui filtre les sections (liste plate si requête, sinon groupes). L'en-tête « Réglages » du modal est **retiré** (la recherche tient lieu de tête, comme demandé). Import `Settings2` retiré.
- **Bord « Cloudflare »** sur la grande recherche du dashboard (`dashboard-hero`) : `rounded-lg`→**`rounded-xl`**, `py-3`→`py-3.5`, ajout `ring-1 ring-border/60` (halo/double-bord) + `hover:shadow-md hover:ring-primary/20`.
- `tsc` 0 · `eslint` 0 · login 200. ⚠️ Non vérifié authentifié : rendu du filtre dans un modal (pas de casse de position), recherche réglages, bord dashboard.

## MAJ 10/08 (17) — Palette Ctrl+K « à la Cloudflare »
Retour user (capture de la command palette Cloudflare) : restyler notre Ctrl+K.
- **Pied de raccourcis** (signature Cloudflare) : barre en bas (mode commandes) — `↑ ↓ pour naviguer · ↵ pour sélectionner · esc pour fermer` (keycaps).
- **Flèche → sur la ligne active** : `ArrowRight` en fin de ligne, `opacity-0 group-data-[selected=true]:opacity-100` (le `CommandItem` porte `group` ; cmdk pose `data-selected="true"`). Vérifié JS : opacité 1 si sélectionné, 0 sinon.
- **Cadre** : `max-w-lg`→**`max-w-2xl`** + `rounded-xl border shadow-2xl` (plus large, encadré, flottant).
- **Rendu manuel** du côté droit (raccourci + flèche) → `CommandShortcut` retiré (import + usage).
- **NON fait (honnête)** : les « Search tips » / préfixes `ask:` `access:` `aig:` de Cloudflare = commandes à préfixe (routage de recherche), une **vraie feature** qu'on n'a pas. On a déjà « Ask AI » (réel). À proposer en follow-up si voulu, pas à simuler.
- `tsc` 0 · `eslint` 0 · login 200. ⚠️ Palette derrière l'auth → rendu à confirmer par le user.

## MAJ 10/08 (18) — Filtre daltonien RÉELLEMENT corrigé + grande recherche typable
- **Filtre daltonien (bug « ne fonctionne toujours pas »)** : diagnostic **au pixel près** (canvas) → la **chaîne multi-primitives** (`feComposite arithmetic`) de `A11yFilters` était un **no-op** (rouge 200,30,30 → 200,28,28). Ce n'était donc PAS un cache/rebuild. **Fix** : daltonisation précalculée en **UNE matrice** `feColorMatrix` (`M = I + Shift·(I − Sim)`) — le primitive qui marche. Déployé + vérifié : rouge→(200,58,107), vert→(40,134,0) = **distinguables** ; ambre/bleu quasi inchangés. Sur `body` (MAJ 16) → toute l'app, modals inclus. Les 3 matrices dans `a11y-filters.tsx`.
- **Grande recherche du dashboard « typable »** (retour user) : elle était un `<button>` (clic → palette). Devient un **vrai `<input>`** : taper → ouvre la palette Ctrl+K **avec le texte** (aucun caractère perdu) ; clic → ouvre vide ; **`autoFocus`** sur le dashboard (priorité vs la petite recherche de la topbar). ⚠️ autofocus = pop clavier sur mobile, à surveiller.
  - Mécanique : nouveau **`useCommandPaletteStore`** (`open`/`initialQuery`/`openPalette`/`openPaletteWith`/`togglePalette`). `app-topbar` bascule son état local Ctrl+K sur ce store (les 2 déclencheurs topbar → `openPalette`). `CommandPalette` : `CommandInput` **contrôlé** (`value/onValueChange`), sync `initialQuery` à l'ouverture.
- `tsc` 0 · `eslint` 0 erreur · login 200 · filtres déployés vérifiés (canvas). ⚠️ Non vérifié authentifié : recoloration visible dans l'app + comportement de la grande recherche.

## MAJ 10/08 (19) — Accessibilité repensée (fin du filtre daltonien → contraste élevé) + recherche dashboard inline
Le user (argumentaire détaillé) : **un filtre CSS global n'est PAS la bonne approche** daltonisme (déforme le design ; l'info ne doit jamais dépendre de la couleur seule). Direction : tokens sémantiques + contraste (WCAG) + couleur+icône+libellé + mode contraste élevé.
- **Filtre daltonien SUPPRIMÉ** : `A11yFilters` (fichier supprimé) + retrait du layout ; règles CSS `html.cb-* body { filter }` retirées ; `colorblindMode` retiré du `preferences-store` (interface/état/setter/persist/rehydrate) ; le Select « Mode daltonien » retiré des réglages. (En prime, ce filtre était de toute façon un quasi no-op, cf. MAJ 18.)
- **Mode « Contraste élevé »** (l'alternative recommandée) : on **complète** le flag `highContrast` (déjà au store, sans CSS) → `html.high-contrast { … }` surcharge les tokens sémantiques (texte #000 / fond #fff / bordures #000 / muted #1a1a1a / primaire #0b3d91 / danger #b00020). Spécificité `html.classe` (0,1,1) > `.dark` (0,1,0) → l'emporte même en sombre. Toggle « Contraste élevé » dans Réglages → Apparence (remplace le daltonien). Vérifié JS : bascule des tokens OK. Dyslexie + taille texte conservés.
- **Grande recherche dashboard = vraie recherche INLINE** (retour user : « fonctionne pas, ouvre celle du breadcrumb ») : `dashboard-hero` refait — plus de déclenchement de la palette Ctrl+K partagée ; un `<input>` réel filtre en direct les **opérations réelles** (`useProjectStore`) + des raccourcis de navigation, résultats en **dropdown** dessous (clic/Entrée → navigue), `autoFocus`. Aucun modal.
- **Revert du câblage palette** (créé au tour précédent pour l'approche rejetée « dashboard nourrit la palette ») : `command-palette-store` **supprimé** ; `app-topbar` revenu à son `useState` local ; `CommandPalette` : recherche re-décontrôlée.
- `tsc` 0 · `eslint` 0 erreur · login/dashboard/settings → 200 · filtre absent + tokens contraste vérifiés (JS). ⚠️ Non vérifié authentifié : rendu du contraste élevé dans l'app + comportement de la recherche inline.
- **Principe design (à poursuivre)** : « jamais la couleur seule » — `Zone` (icône+libellé), `HealthBadge` (pastille+libellé) le font déjà ; sweep à finir sur tous les états si besoin.

## MAJ 10/08 (20) — Filtres daltoniens RESTAURÉS (en plus du contraste) + palette inline dashboard live
- **Filtres daltoniens restaurés** (le user les veut EN PLUS du contraste) : `A11yFilters` recréé (matrices uniques qui marchent), remonté au layout ; règles `html.cb-* body { filter }` remises ; `colorblindMode` remis au `preferences-store` ; Select « Mode daltonien » remis dans Réglages → Apparence **à côté** du toggle « Contraste élevé » (les deux coexistent). Vérifié JS : défs présentes, `filter` sur body, rouge→(200,58,107)/vert→(40,134,0), et `--foreground`→#000 en contraste. Donc dispo : **taille texte + dyslexie + contraste élevé + mode daltonien**.
- **Recherche dashboard = palette INLINE** (édit du user, désormais **live** après restart — Next ne hot-reload pas sous Docker, d'où « ça marche pas » : c'était juste pas déployé) : `dashboard-hero` = input + dropdown SOUS la barre au focus, **même contenu que Ctrl+K** (navigation + Labs + actions) ; en tapant, filtre + cherche les **opérations réelles**. Le **Ctrl+K sur le dashboard** focus la GRANDE barre (pas le modal) via un listener en **phase capture + `stopImmediatePropagation`** qui court-circuite le listener bubble de la topbar. Logique vérifiée correcte ; `tsc`/`eslint` 0.
- ⚠️ Non vérifié authentifié : rendu de la palette inline + Ctrl+K focus-barre (mais compile + logique OK).
- **Fix alignement (retour user « pas bon le composant »)** : les libellés du dropdown étaient **centrés** — un `<button>` a `text-align:center` par défaut (UA) qui l'emportait sur le `text-left` du conteneur (lui-même sous le `text-center` du hero). Corrigé en ajoutant **`text-left` à `rowClass`** (les lignes du dropdown). Icône + libellé désormais alignés à gauche.
- **Palette inline — navigation clavier + flèche (retour user)** : `dashboard-hero` refait avec une **liste aplatie** `rows[]` (opérations→navigation→Labs→actions) → **↑↓** déplacent `activeIndex`, **Entrée** lance la ligne active, **Échap** ferme. Ligne active surlignée (`bg-muted`) + **`ArrowRight` tout à droite** (visible sur la ligne active, `opacity-0`→`100`). **Hover** = `onMouseEnter` pose `activeIndex` (hover et clavier partagent le surlignage) ; `scrollIntoView({block:"nearest"})` sur la ligne active. Gotcha corrigé : `React.ReactNode`/`React.KeyboardEvent` sans `React` en portée → `type ReactNode` importé + `onKeyDown` inliné (type inféré, pas de shadow du `KeyboardEvent` DOM du listener capture). `tsc`/`eslint` 0 · dashboard 200.

## MAJ 10/08 (21) — Palette inline dashboard : vague sur Labs + barre du bas façon Ctrl+K
- **Bg wave sur Intelligence / Brain OS** du dropdown : classe **`lab-cmd-row`** appliquée aux lignes `section === "Labs"` (même vague que dans le Ctrl+K).
- **Barre en bas** (retour user « fais la mm chose que le petit modal, la barre en bas ») : interprété comme le **pied du Ctrl+K** → ajouté sous les résultats (`↑ ↓ pour naviguer · ↵ pour ouvrir · esc pour fermer`). Dropdown restructuré : conteneur `flex flex-col overflow-hidden`, liste scrollable `flex-1 overflow-y-auto`, pied fixe `border-t` en bas. ⚠️ Le user a dit « barre d'**insight** » — si c'était une barre IA/insight et pas le pied clavier, à réajuster.
- `tsc` 0 · `eslint` 0 · dashboard 200. Non vérifié authentifié (rendu).

## MAJ 10/08 (22) — Anim. refresh visible + page Opérations liste-first (Linear)
- **Refresh « on voit pas que ça reload »** : l'anim (spin) s'arrêtait dès la résolution → invisible si instantané (cache). **Durée minimale ~550 ms** ajoutée :
  - `components/ui/refresh-control.tsx` (partagé → **Signals**/inbox + **Queues**/my-work) : `Promise.all([onRefresh(), delay(550)])`.
  - `components/agent/cortex-usage.tsx` (**quota IA**) : `load(minSpin)` — 550 ms **au clic manuel seulement** (pas à l'ouverture, pour ne pas ralentir le 1ᵉʳ affichage).
- **Page Opérations « fait gamin » → Linear** : 1er pas sûr = **vue LISTE par défaut** (`view` init `"cards"`→`"list"`) + sélecteur réordonné (liste en tête). Les grandes cartes colorées (l'effet « gamin ») ne sont plus le défaut. Redesign Linear plus poussé (groupement par statut, statut en icône subtile, moins de colonnes, palette muette) = étape suivante, à faire avec le user (non vérifiable en aveugle).
- **Intelligence / Brain OS** : reportés (« plus tard », peut-être trop complexes) — à revoir.
- ⚠️ **Incident cache** : pendant les edits, un état intermédiaire cassé a empoisonné `.next` → `/projects` + `/settings` en 404 figé. **Résolu par un restart propre** (fichiers actuels valides, `tsc` 0). Toutes routes → 200. Leçon : après une rafale d'edits JSX, un restart peut être nécessaire même si tsc passe.
- `tsc` 0 · `eslint` 0 · login/dashboard/projects/settings → 200.

## MAJ 10/08 (23) — Bugs avatar + toasts ; recherche Linear settings ; avis + plan (gros dump user)
- **Bug avatar (upload) corrigé** : le client Axios (`lib/api/client.ts`) a un défaut `Content-Type: application/json` ; l'upload forçait `multipart/form-data` **sans boundary** → back ne parse pas. Fix : `headers: { "Content-Type": undefined }` (Axios détecte le FormData et pose le boundary). `settings/page.tsx` ProfilePanel.
- **Bug toasts « on peut pas les fermer » corrigé** : `Toaster` sonner sans `closeButton` → aucun (×). Ajouté `closeButton` (`components/ui/sonner.tsx`) → chaque toast fermable à la main.
- `tsc` 0 · `eslint` 0. ⚠️ Avatar non testé authentifié (upload) — à valider par le user.
- **À FAIRE (dump user, non fait ce tour — advisory dans la réponse)** :
  - **Settings vs Linear** : gaps identifiés (jetons API perso, sessions actives/appareils, comptes liés OAuth, 2FA/passkeys, raccourcis clavier, Members/Teams+Labels côté workspace, Import/Export, Billing/Plan). → à prioriser avec le user.
  - **Account dans le modal** : avis = OK (standard Linear/Vercel) ; si page `/profile` standalone duplique → consolider.
  - **Vue full-page issue** (`/projects/:id/issues/:n`) : avis = garder pour deep-link/URL partageable, mais le sheet doit être complet ; le bouton « Open » depuis le sheet est redondant. Idée user = onglets dans le sheet.
  - **Issue sheet** (`components/sheets/issue-sheet.tsx`) : « c'est le bazar » → refonte UI/UX + **remplacer les composants non-shadcn** (à auditer).
  - **Smart Assign** (`components/smart-assign/smart-assign-panel.tsx`) : à revoir.

## MAJ 10/08 (24) — Issue sheet : passage aux composants shadcn (1er passage)
- **`components/sheets/issue-sheet.tsx`** (~1650 l, très dense — d'où « le bazar ») : **tous les champs de formulaire bruts → shadcn** `Input`/`Textarea` (11 champs : GitHubTab ×6, sous-tâche, checklist, Worklog ×2, zone de commentaire). Style inline dupliqué (`h-8 rounded-md border …`) remplacé par le composant (cohérence + code plus propre). **Gardés volontairement bruts** : l'éditeur de **titre inline** (bordure basse, pas un champ boîte) et le **file input** caché (shadcn n'a pas de file input). Imports `Input`/`Textarea` ajoutés.
- `tsc` 0 · `eslint` 0 erreur (2 warnings `set-state-in-effect` préexistants). ⚠️ Rendu non vérifié authentifié.
- **Reste sur le sheet (advisory, à faire avec l'œil du user)** : le vrai « dé-bazar » = la **mise en page** (sheet très large `max-w-4xl` + 2 colonnes + BEAUCOUP d'onglets : GitHub, Pièces jointes, Sous-tâches, Checklist, Worklog, Activité, Smart Assign, AI Spec). Pistes : regrouper/réduire les onglets, aérer la colonne méta, hiérarchiser. À valider en direction.

## MAJ 11/08 (25) — Issue sheet : passe « dé-bazar » façon Linear (mise en page)
- **Constat en rouvrant le fichier** : il n'y a **plus d'onglets** — le passage en **sections empilées façon Linear/GitHub** était déjà fait (helpers `Section`/`CollapsibleSection`/`MetaRow`, fil d'activité unifié en bas). Le « bazar » restant venait donc de la **densité**, pas des onglets.
- **Sidebar méta → lignes de propriété inline (Linear)** : `MetaRow` passe de « libellé au-dessus / valeur en dessous » à **libellé à gauche (icône + texte, col. ~88px) / valeur à droite**, `items-center min-h-8`, **sans bordure** par ligne. Sidebar ~2× moins haute et scannable. Concerne Priority, Assignee, Labels, Points, Cycle, Due date, Created.
- **Colonne gauche → réduire le « mur de formulaires »** : **Checklist** et **Pièces jointes** passent de `Section` (toujours ouverte) à **`CollapsibleSection`** (repliée, contenu chargé à l'ouverture). **Sous-tâches reste ouverte** (primaire, façon sub-issues Linear). Relations + GitHub + Spec IA déjà repliables. Résultat : par défaut seules Description + Sous-tâches + Activité sont déployées.
- **Bas de sidebar** : « Created » remonte dans la liste de propriétés ; le bloc **Suivi du temps** (worklog, plus lourd) est isolé **sous un `Separator`** en bas.
- **Largeur inchangée** (`sm:max-w-4xl`) — demande explicite du user (« c'est fait pour »).
- `tsc` 0 · `eslint` 0 erreur (2 warnings `set-state-in-effect` préexistants). Déployé (`docker restart taskforce-frontend-dev`, `/auth/login` → 200). ⚠️ **Rendu non vérifié visuellement** : pane navigateur non affiché (screenshot impossible) + classifier bloque le login auto → à valider par l'œil du user.
- **Pistes de suite (advisory)** : badges de **compteur** sur les sections repliées (« Checklist 3 ») + **auto-ouverture si non vide** (nécessite de remonter le count des enfants au parent) ; éventuellement rendre « Suivi du temps » repliable aussi.

## MAJ 11/08 (26) — Issue sheet : retours user (labels, activité, ring, selects shadcn)
- **Verdict user sur (25)** : « nickel en vrai ». 5 correctifs demandés, tous faits sur `components/sheets/issue-sheet.tsx` :
  1. **« Add label » aligné** sur les autres lignes : le trigger `DropdownMenu` passe au look `SelectTrigger` (bordure `border-input`, `min-h-8`, `rounded-md`, `px-3`, `shadow-xs`, chevron `size-4 opacity-50`). Avant : bouton nu sans bordure → dépareillé.
  2. **Fil d'activité → plus récent EN HAUT** (tri desc) + **zone de saisie en tête** (le commentaire posté apparaît juste dessous) + **bouton « Charger plus (N) »** (pagination `ACTIVITY_INITIAL=5`, pas `ACTIVITY_STEP=10`). Avant : ordre chrono asc, saisie tout en bas, tout affiché.
  3. **Focus-ring rogné** dans les sections repliées : `CollapsibleContent` a `overflow-hidden` (animation Radix) qui coupait le ring des inputs → ajout `-mx-1 px-1 pb-1` (réserve interne, contenu non décalé grâce à la marge négative). Corrige toutes les `CollapsibleSection` (Spec IA, Checklist, Pièces jointes, Relations, GitHub).
  4. **Relations : `<select>` natifs → `Select` shadcn** (type + issue cible) avec `SelectValue`/placeholder. Consigne user : **only shadcn components**. Suppression du `selectClass` maison. (Grep confirme : plus aucun `<select>` natif dans le fichier.)
- `tsc` 0 · `eslint` 0 erreur (2 warnings `set-state-in-effect` préexistants). Déployé (`docker restart`, `/auth/login` 200). Rendu non re-vérifié visuellement (pane non affiché).
- **5. Bouton « Open » (page pleine)** : décision user = **retirer le bouton ET supprimer la route**. Fait (voir MAJ 27).

## MAJ 11/08 (27) — Suppression de la page pleine issue (route redondante)
- **Décision user** : la vue page-pleine `/projects/:id/issues/:issueId` fait doublon avec le sheet → **supprimée**. Fichier retiré : `app/(protected)/[workspace]/projects/[id]/issues/[issueId]/page.tsx` (~680 l dupliquant l'UID du sheet).
- **Points d'entrée re-câblés vers le sheet** (aucun lien mort) :
  - `components/sheets/issue-sheet.tsx` : bouton **Open** retiré + fn `openFullPage` + `useRouter`/`router` (devenus inutiles).
  - `app/(protected)/[workspace]/members/[id]/page.tsx` : le `<Link>` de la liste d'issues du membre pointe désormais sur `…/projects/:pid?issue=:id` (ouvre le sheet sur le board) au lieu de `…/issues/:id`.
  - `components/inbox/inbox-view.tsx` : `openSignalFullPage` (bouton ↗) redirige vers `…/projects/:pid?issue=:id` via `parseIssueTarget` (au lieu de `router.push(issueUrl)`), repli `operationUrl`.
  - `my-work` : ouvrait déjà le sheet en place (l.399), RAS. `inbox openSignal` (clic ligne) : déjà sheet via `parseIssueTarget`, RAS.
- **`issueUrl` backend** (`/projects/:id/issues/:id`) reste la convention parsée par `parseIssueTarget` → ouvre le sheet ; plus jamais visité en navigation.
- **Stub de redirection ajouté** (validé user) : `…/projects/[id]/issues/[issueId]/page.tsx` est désormais un **server component minimal** qui `redirect()` vers `…/projects/:id?issue=:issueId`. Donc plus aucun 404, même sur un vieux lien direct / bookmark. (Next renvoie un 200 avec redirection RSC — `NEXT_REDIRECT` + cible dans le corps — pas un 307 ; normal, redirige bien en navigateur.)
- `tsc` 0 · `eslint` 0 erreur (warnings `set-state-in-effect` pré-existants). Déployé, `/auth/login` 200.
- ⚠️ **GOTCHA cache `.next` (coûteux, retenu)** : **modifier l'arbre de routes App Router** (supprimer PUIS recréer le dossier `[issueId]`) sous Docker/**webpack** a **corrompu le manifeste** → `/projects/:id` (le PARENT `[id]`) renvoyait **404** alors que le fichier était intact et `tsc` vert. **Le `docker restart` NE suffit PAS** (il ne purge pas `.next`). Fix : **vider le CONTENU de `.next`** dans le conteneur (`rm -rf .next/* .next/.[!.]*` — le dossier lui-même est un **volume monté** → « Resource busy » si on tente de le supprimer) **puis** restart. À refaire après CHAQUE mutation de l'arbre de routes tant que le dev tourne.

## MAJ 11/08 (28) — Issue sheet : colonne droite élargie/aérée + compteurs de sections
- **Retour user** (screenshot) : « prends plus de place sur la partie droite, tout est écrasé en haut » + « on peut faire la checklist 3 ».
- **Colonne Details élargie + aérée** : `sm:w-72` → **`sm:w-96`** (288→384 px), padding `px-4`→`px-5`, header `mb-1`→`mb-2`. `MetaRow` : `min-h-8 py-0.5` → **`min-h-9 py-1.5`**, libellé `w-[88px]`→`w-[92px]`. → labels/Cycle ne sont plus tronqués, rythme vertical plus respirant. Largeur du **sheet inchangée** (`max-w-4xl`), c'est la colonne interne qui prend plus de place.
- **Compteurs sur les sections repliées** (badge « n » façon Linear, déjà rendu par `SectionHeading`) : **Checklist, Pièces jointes, Relations, GitHub**. Comme les enfants ne montent pas quand la section est repliée (donc ne peuvent pas remonter leur count), on charge les **longueurs au niveau parent à l'ouverture** : nouvel effet qui appelle `listChecklist`/`listRelations`/`listAttachments` (+ `fetchGitHubLinks` si connecté) et stocke `sectionCounts`. GitHub lit `githubLinks[issueId]?.length` du store (live). **Sous-tâches** (section ouverte) : pas de badge (contenu déjà visible → badge redondant + éviterait une incohérence si stale).
- ⚠️ **Limite connue** : le count est chargé **à l'ouverture** du sheet (pas live après ajout/suppression dans un onglet déplié) — se rafraîchit à la réouverture. Léger double-fetch quand on déplie une section (le parent a déjà lu la longueur, l'onglet recharge son détail). Acceptable ; si gênant → remonter le count enfant→parent (`onCount`) + monter les enfants même repliés.
- `tsc` 0 · `eslint` 0 erreur (2 warnings `set-state-in-effect` préexistants). Déployé (restart simple, pas de purge `.next` : aucune modif de routes). Board `/projects/1` 200.

## MAJ 11/08 (29) — Settings : suppression de la page standalone (modal seul) + entrées recâblées
- **Constat** : le modal Settings (`components/settings/settings-modal.tsx`, monté globalement dans `app-shell.tsx:52`) **importe les briques** (`SECTIONS`, `SettingsNav`, `SettingsPanels`, panels) **depuis `settings/page.tsx`** → la page n'est pas un doublon, elle héberge les briques. Impossible de supprimer le fichier sans casser le modal.
- **Choix** (bas risque, pas d'extraction de ~1400 l ni de suppression de route → évite le gotcha cache `.next`) : le **default export `SettingsPage`** devient un **ouvreur de modal**. `/settings` → `openSettings(section)` + `router.replace(dashboard)`. Préserve le deep-link `?section=` et le **retour OAuth** GitHub/Slack (toast + ouverture sur « integrations »). Imports `PageContainer`/`PageHeader` retirés (inutilisés), `useParams` ajouté.
- **Entrées recâblées vers le modal / bonne cible** (seuls points qui pointaient encore vers `/settings`) :
  - `profile/page.tsx` : « Modifier le profil » `<Link href=/settings>` → **`onClick openSettings("profile")`** ; « Voir les forfaits » → **`/{slug}/billing`** (les forfaits vivent sur `/billing`, cf. UsagePanel `router.push(/billing)`, pas dans une section du modal).
  - `projects/[id]/settings/page.tsx` : bouton **« Gérer les intégrations »** `router.push(/settings)` → **`openSettings("integrations")`** (ouvre le modal sur la bonne section, sans quitter la page projet). Import `useSettingsStore` ajouté.
- Entrées déjà OK (modal) : sidebar gear, nav-user, dashboard-hero, cortex-usage.
- `tsc` 0 · `eslint` 0 erreur. Déployé. ⚠️ **Cache `.next` re-purge nécessaire** : `/projects/1/settings` compilait à 200 **puis** 404 par intermittence (instabilité résiduelle des changements de routes plus tôt) → `rm -rf .next/*` + restart → tout stable 200/200. (cf. gotcha MAJ 27.)

## Audit DA (tâche user « teams/pages/cycles pas à la DA ») — CONSTATS, à traiter
- Standard de référence : `PageContainer` + `PageHeader` (`components/layout/page-shell`), listes en **`DataTable`**, états vides = `Empty`/médaillon inbox, chargement = `Skeleton`, couleurs statut/priorité `-500` (pages polies), cartes `shadow-sm`/`hover:shadow-md` **utilitaires**.
- **Plus éloignées** : `cycles/page.tsx` (workspace) — **pas de `PageContainer`/`PageHeader`** (`max-w-6xl`/`gap-8`/header maison), `CycleCard` en grille `<div>` maison (vs `DataTable` de My Queue pour la MÊME entité), couleurs `-400`, état vide maison. Puis `projects/[id]/cycles/page.tsx` (redéfinit un `NewCycleDialog` local alors que `CreateCycleDialog` partagé existe ; cartes maison ; `-400`) et `projects/[id]/cycles/[cycleId]/page.tsx` (barre de progression maison → `Progress` ; loading `Loader2`+texte → `Skeleton` ; dots `-400`).
- **Pages** (`projects/[id]/pages/page.tsx`, `[pageId]/page.tsx`) : loading/empty en **texte brut** → `Skeleton`/`Empty` ; `[box-shadow:var(--shadow-sm)]` → `shadow-sm`.
- **Teams** : `teams/page.tsx` = redirect (OK) ; `projects/[id]/teams` = **double en-tête** (page + `ProjectTeamsSection`) → en retirer un. `project-teams-section.tsx` globalement conforme.
- Transverse (22 occurrences, impact visuel nul mais convention) : `[box-shadow:var(--shadow-sm)]` → utilitaire `shadow-sm`.
- Top impact : (1) `cycles/page.tsx` → `PageContainer`+`PageHeader` ; (2) cycles en `DataTable` partout ; (3) loading/empty → primitives partagées ; (4) dédupliquer `CreateCycleDialog` ; (5) `-400`→`-500`.

## MAJ 11/08 (30) — DA teams/pages/cycles : lot 1 (cartes alignées, décision user)
- **Décision user** : garder des **cartes** pour les cycles (pas de bascule DataTable), mais alignées à la DA.
- **`cycles/page.tsx` (workspace)** — le plus décalé, refait : `<div max-w-6xl mx-auto>` + header maison → **`PageContainer` + `PageHeader`** ; état vide maison → **`Empty`** (compound) ; ajout d'un **skeleton de chargement** (grille de `Skeleton`) ; carte `[box-shadow:var(--shadow-sm)]` + hover bordure → **`shadow-sm hover:shadow-md transition-shadow`**. Cartes conservées.
- **`projects/[id]/teams/page.tsx`** — **double en-tête supprimé** : la page rendait « Équipes » + desc PUIS `ProjectTeamsSection` rend son propre en-tête « Membres & équipes » (section utilisée seulement ici) → en-tête de page retiré. `project-teams-section.tsx` : `[box-shadow:var(--shadow-sm)]` → `shadow-sm` (2×).
- **`projects/[id]/pages/page.tsx`** — chargement texte brut → **`Skeleton`** ; « No pages yet » → **`Empty`** (distinction recherche vide / aucune page + CTA) ; carte `box-shadow` arbitraire → **`shadow-sm hover:shadow-md`**.
- Choix assumé : **couleurs `-400` laissées** (le board de référence les utilise aussi ; passer en `-500` = risque de contraste dark non vérifiable à l'aveugle → à trancher avec l'œil du user si besoin).
- `tsc` 0 · `eslint` 0 erreur. Déployé, routes 200/200.

## MAJ 11/08 (31) — DA teams/pages/cycles : lot 2 (dédup dialogue + primitives partagées)
- **`components/dialogs/create-cycle-dialog.tsx`** — nouveau prop optionnel **`projectId?: number`** : quand fourni, le cycle est **verrouillé sur ce projet** et le sélecteur de projet est masqué. État interne `projectId`→`pickedProjectId` + `effectiveProjectId`. **Rétrocompatible** (prop absente = comportement inchangé, sélecteur affiché — page cycles workspace intacte).
- **`projects/[id]/cycles/page.tsx`** — **`NewCycleDialog` local SUPPRIMÉ** (~75 l, doublon visuel : labels majuscules/calendrier vs DatePicker) → remplacé par `<CreateCycleDialog projectId={projectId} onCreated=…>`. État vide maison → **`Empty`** ; carte `box-shadow` arbitraire → **`shadow-sm hover:shadow-md`**. Imports morts nettoyés (Dialog*/Input/DatePicker/Label/Textarea/Loader2/useState).
- **`projects/[id]/cycles/[cycleId]/page.tsx`** — barre de progression maison (`div bg-gradient`) → **`<Progress>`** ; loading `Loader2`+texte → **`Skeleton`** (en-tête + liste) ; not-found → **`Empty`** ; `[box-shadow:var(--shadow-sm)]` → `shadow-sm` ; `AlertCircle` (inutilisé) retiré.
- **`projects/[id]/pages/[pageId]/page.tsx`** — loading « Loading… » → **`Skeleton`** (barre titre + bloc éditeur) ; « Page not found » → **`Empty`** (avec retour) ; `box-shadow` → `shadow-sm`.
- `tsc` 0 · `eslint` 0 (zéro warning sur le lot). Déployé, routes 200/200 (cycles, cycles/:id, pages, pages/:id). Restart simple (aucune modif de routes).
- **DA teams/pages/cycles : TERMINÉ** (lot 1 + lot 2). Couleurs `-400` laissées volontairement (cohérence board + risque contraste dark), à trancher à l'œil si besoin.

## Reste
- **Issue sheet — compteurs live (option)** : `onCount` enfant→parent + montage des enfants repliés, si la fraîcheur au fil de l'eau est souhaitée.
- **Smart Assign** : revue UI/UX.
- **Settings** : ajouter les sections/champs manquants vs Linear (après priorisation user).
- **Opérations — redesign Linear complet** (si le user valide la direction) : groupement par statut, statut-icône, colonnes resserrées, palette muette.
- **Couleur + icône + libellé** : audit des composants d'état restants (badges de statut) pour ne jamais coder l'info par la couleur seule.
- **Palette Ctrl+K (option)** : commandes à préfixe façon Cloudflare (`ask:`, etc.) — vraie feature de routage, si le user veut.
- **Supprimer** `projects/new/page.tsx` (page orpheline depuis le passage au modal global).
- **Intégrations composants — v2** : moteur de reco IA (la vraie valeur) ; brancher une source (MCP shadcn dispo dans l'env).
- **Fiche connecteur** : le user peut vouloir affiner (ordre des sections, wording) une fois vu en vrai.
- **Généraliser le bouton « dashed »** en composant partagé (`AddTile`) si le user valide.
- **Étendre `Zone`** aux autres zones destructives hors Settings si besoin (au fil des opérations CRUD globales).
- **Accessibilité (option)** : embarquer la vraie police OpenDyslexic (self-host `@font-face`) ; brancher `reducedMotion`/`highContrast` (présents au store, sans UI/CSS).
- **2 Favicon** (aligner sur le logo du site).
- **7 (suite)** sweep loaders sur les autres boutons.
- **Nommage global** : trancher Cortex vs « IA / Ask AI » sur toute l'app.
- **Gate pré-commit** : `it.ps1 -Test ALL` (suite complète) avant tout commit — non lancé (pas de commit demandé).
