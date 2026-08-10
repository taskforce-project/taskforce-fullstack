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

## Reste
- **Généraliser le bouton « dashed »** en composant partagé (`AddTile`) si le user valide.
- **2 Favicon** (aligner sur le logo du site).
- **7 (suite)** sweep loaders sur les autres boutons.
- **Nommage global** : trancher Cortex vs « IA / Ask AI » sur toute l'app.
- **Gate pré-commit** : `it.ps1 -Test ALL` (suite complète) avant tout commit — non lancé (pas de commit demandé).
