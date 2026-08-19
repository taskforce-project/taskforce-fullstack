# Landing — refonte du site (v2)

> Version compacte. Spec complète : `taskforce-docs/v1/14-design/landing-refonte/Plan_Refonte_Site.md`
> Périmètre de travail : **`landing-page/` uniquement** (branche partagée avec un autre agent).

## Cadre (24/07/2026)

Refonte totale du site marketing sur le modèle d'architecture de **relevanceai.com**
(crawl 308 URLs + DOM mesuré), avec la charte TaskForce et notre contenu.

| # | Décision |
|---|---|
| D5 | Refonte totale — les composants marketing actuels sont abandonnés (kit `ui/` shadcn conservé) |
| D6 | Le site vend la **vision** (AI Delivery OS) ; la v1 est la preuve, pas le sujet |
| D7 | Section **`/labs`** publique : la R&D est publiée (contenu tiré de `road_to_v2/`) |
| D8 | Conformité UE dès le lot 0 — RGPD, WCAG 2.2 AA, ePrivacy, LCEN, **AI Act art. 50** |
| D9 | **Zéro faux client** : ni logo, ni témoignage, ni note G2 inventés |

**Arbitrages utilisateur :** police display = **Sora** · hébergement à trancher (Vercel / Render /
Hetzner DE) → la page privacy reste agnostique · infos de publication en placeholder.

## Design system (jetons dans `src/styles/global.css`)

**Le `:root` est une copie de `frontend/app/globals.css`** (palette Cloudflare-flat, light-only).
Aucune couleur inventée pour le marketing : `--background #fbfbfc` · `--card #fff` ·
`--foreground #1d1d1f` · `--muted-foreground #6e6e73` · `--border #e6e6e9` ·
`--primary #2563eb` · `--secondary #f2f2f4` · `--radius 0.625rem` · ombres flat.
Si la palette bouge dans l'app, elle bouge ici.

Les `--site-*` ne sont que des **alias** : `--site-brand → var(--primary)`,
`--site-ai → var(--accent-purple)`, `--site-band → var(--secondary)`…
⚠️ **Le violet n'est QUE le marquage IA / Labs. Jamais un CTA, jamais un hover.**

Conteneur **1240px**. Classes : `text-foreground` `text-muted-foreground` `bg-secondary`
`bg-primary` `border` `font-display` (+ alias `text-ink`, `bg-band`… qui pointent au même endroit).

**`.link-underline`** — soulignage animé de gauche à droite au survol, repris à l'identique du
breadcrumb de la webapp (`frontend/components/ui/breadcrumb.tsx`, QA2-3 : `after:w-0` →
`hover:after:w-full`, 200ms ease-out). Posé sur les liens du footer et de la grille Solutions.
Typo : `.t-h1` `.t-h2` `.t-h3` `.t-eyebrow` `.t-lead` (Sora, tracking −0.03em).
**Boutons pill** (`rounded-full`, h 36/42/48) — mesuré sur relevanceai.com (`radius 9999px`, h 42).

## Fait

- **L0 (partiel)** — jetons + Sora chargée + primitives `.container-site` / échelle typo /
  focus-visible global / `.skip-link` / `prefers-reduced-motion` global.
- `src/components/site/nav.ts` — **toute l'architecture de navigation en données**
  (source unique header + footer + sitemap).
- **Composants atomiques = shadcn uniquement, rien de réécrit à la main.** On *étend* les
  primitives au lieu d'en recréer :
  - `ui/button.tsx` → variante `ink` + tailles `pill-sm` / `pill` / `pill-lg` (`rounded-full`,
    h 36/42/48). La variante `default` était déjà `bg-primary hover:bg-primary/90` = notre CTA.
  - `ui/badge.tsx` → variantes `live` / `beta` / `labs` (le texte porte l'info, jamais la couleur
    seule — WCAG 1.4.1).
  - `ui/sheet.tsx` → prop `showClose` (le bouton par défaut fait 16px → échoue WCAG 2.5.8).
  - Liens stylés en bouton : `buttonVariants({...})` sur le `<a>`, pas de `<Button>` imbriqué.
  - ❌ Supprimés : `site/Button.tsx` et `site/MaturityBadge.tsx` (doublons maison).
- **`src/components/site/SiteHeader.tsx`** — barre 5 entrées + actions, 4 méga-menus :
  cartes (Product / Labs / Resources) et grille de liens (Solutions), + menu mobile (Sheet).
- `ui/sheet.tsx` — ajout du prop `showClose` (le bouton par défaut fait 16px → échoue WCAG 2.5.8).
- `BaseLayout.astro` — Sora + Inter, lien d'évitement, `<main id="main">`.

- **`src/components/site/SiteFooter.tsx`** — 6 colonnes générées depuis `FOOTER_GROUPS`,
  barre basse (© · statut · langue). Statique, aucune hydratation.
- **Purge L0 faite** — 14 pages legacy + ~55 composants supprimés
  (`components/layout/`, `components/magicui/`, `contexts/`, `styles/accessibility.css`,
  tous les `*Page*.tsx`, `hero115`, `feature72`, `logos3`, `process1`, `testimonial4`,
  `ui/{bento-grid,etheral-shadow,iphone,safari,noise-texture,testimonials-columns-1,hover-footer}`,
  12 `sections/*` inutilisées).
  **Il reste `/` et `/pricing`** — toutes les autres URLs sont à recréer (lots L3→L8).

**Vérifié dans Chrome (localhost:4321)** : les 4 panneaux s'ouvrent, badges corrects,
`Échap` ferme, menu mobile complet, footer OK, `/pricing` 200, 0 erreur console/serveur.

⚠️ Seuil du nav desktop : **`min-[900px]`** (et non `lg`) — l'écran de review fait 947px CSS.
Le panneau est centré sur la barre via `.site-nav > div` (CSS) pour ne jamais déborder.

⚠️ `config/constants_{en,fr}.ts` sont **conservés volontairement** : ils ne sont plus importés
par personne, mais ils contiennent toute la copie marketing rédigée (~1000 lignes chacun).
Réservoir de texte pour les lots L2→L8, à supprimer une fois vidés.

## L2 — Home (fait, puis corrigée)

**17 sections, 7 mocks produit, 26 vrais logos de marque.**

### ⚠️ Correction majeure (24/07) — on copiait leur contenu, pas leur architecture

Première version : trois blocs décalquaient Relevance presque mot pour mot
(« All of your agents on one stack » + les libellés « like Zapier », « On one platform, the pieces
make each other better », l'échelle L1→L4 Assisted/Copilot/Autopilot/Self-Driving).
**Remplacés par nos propres arguments** :

| Avant (copié) | Après (à nous) |
|---|---|
| « All of your agents on one stack » + « like Jira / like Notion » | **`Leaks`** — « Delivery context dies in the gaps between tools » : où vit chaque chose aujourd'hui, et ce qui s'y perd |
| « On one platform, the pieces make each other better » | **`WhyOneSystem`** — « What you get from not integrating four tools » |
| Échelle d'autonomie L1→L4 (leur framework) | **`Maturity`** — Shipped / Partial / Research, avec **nos vraies features**. Personne ne publie ça ; c'est la version honnête et c'est un différenciateur. |
| `Steps` — « how it works » en 3 cartes (gamin) | **`Anatomy`** — tableau à 4 colonnes dans le vrai ordre d'exécution : *Checkpoint · Produced by · What lands in your workspace · What you decide*, badge de maturité par étape |

**Ce qu'on reprend d'eux : l'architecture et l'ordre logique**, pas le texte.

### Les rails (la « forme » de la page)

`.container-rail` — deux filets verticaux aux bords du conteneur (1240px) + un séparateur
horizontal **pleine largeur** porté par chaque `<section>` (`border-b`). Filets internes de grille :
`.rail-x` / `.rail-y`. C'est ce qui structure la page façon Vercel ; sans ça tout flotte.
Appliqué au Hero, à toutes les `Section`, et au footer.

### Logos de marque

`site/BrandLogo.tsx` — les SVG viennent de `frontend/public/logos/` (déjà vendorisés par
`npm run logos` côté webapp, source SVGL), **recopiés** dans `landing-page/public/logos/`.
Aucune commande relancée, aucun appel réseau. 17 marques ont deux variantes
(`-light` / `-dark`) : le site étant light-only, on prend toujours `-light`.
Vérifié : **26 logos affichés, 0 cassé**.

| Fichier | Contenu |
|---|---|
| `site/Section.tsx` | `Section` (bande/blanc + rails + rythme) · `SectionHeader` · `MockFrame` · `FeatureSplit` · `LevelBadge` |
| `site/BrandLogo.tsx` | Logos SVGL vendorisés + `logoSrc()` |
| `site/home/Hero.tsx` | H1, promesse, 2 CTA, **onglets persona** qui changent le bandeau KPI **et** la table de runs |
| `site/home/Narrative.tsx` | `LogoWall` (vrais logos) · `Anatomy` (tableau des 7 checkpoints) · `Pipeline` · `Agents` · `Approvals` |
| `site/home/Features.tsx` | `BrainOS` (graphe SVG) · `SmartAssign` (5 signaux notés) · `Models` (local/cloud, coût) · `Analytics` |
| `site/home/Platform.tsx` | `Leaks` (le diagnostic) · `WhyOneSystem` · `Maturity` (Shipped/Partial/Research) |
| `site/home/Proof.tsx` | `Trust` · `Integrations` (vrais logos) · `Labs` · `FinalCta` |

**Ordre de la home** : problème → mécanisme → garantie → composants → conséquence →
honnêteté → preuve. Chaque section répond à la question posée par la précédente.

**Un seul îlot hydraté** : le Hero (`client:load`, les onglets ont besoin de JS).
Les 17 autres sections sont du HTML statique — c'est du contenu, pas de l'interface.

⚠️ **Radix Tabs s'active sur `mousedown`, pas sur `click`.** Un `element.click()` en JS ne
déclenche rien et laisse croire que les onglets sont cassés. Pour tester :
`dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }))`.

Honnêteté : les chiffres du Hero sont étiquetés dans la légende du cadre
(« Interface preview. The figures illustrate a typical run — not a customer benchmark »),
`Agents` / `Models` / `Autonomy` portent le badge Labs, et l'échelle d'autonomie dit
explicitement que le niveau 4 est de la recherche.

## QA du 24/07 — passe 1

**Corrigé globalement**
- Toutes les légendes sous les mocks supprimées (`figcaption` : 0).
- `MockFrame` gagne `bleed` : le cadre descend jusqu'au séparateur (`-mb-px`, `rounded-t-2xl`,
  `border-b-0`) au lieu de flotter. Vérifié : **écart de 0 px** sous le mock du Hero.
- **`.link-underline` recadré** : footer + liens inline uniquement. Retiré des menus du header
  et du menu mobile (c'est de la navigation, pas du texte). Vérifié : 0 dans le header, 43 dans le footer.
- Mur de logos : **2 rangées de 5, nom sous chaque logo**, espacement doublé.
- **Plus aucun « €0.00 »** : un agent gratuit n'est pas crédible. Le KPI coût devient
  « Caught before merge », et la colonne `Cost` de la table devient `Took` (durées réelles d'étape).

**Le composant de référence — `site/illustrations/RunTimeline.tsx`**

Structure reprise du « agent planning » fourni par l'utilisateur : timeline d'étapes repliables,
statut + durée + contenu riche. Adapté aux jetons de l'app et au contenu TaskForce, et surtout
**le run se déroule tout seul**. Contenu par étape : sources récupérées (chips), critères
d'acceptation + **encart « renvoyé une fois »**, arbitrage architecture (proposé / rejeté / raison),
puis le checkpoint qui bloque.

Garde-fous : `IntersectionObserver` (ne tourne que visible) + `prefers-reduced-motion` → état final
figé. C'est le **gabarit des autres illustrations** : une par fichier, animée, avec de l'insight.

## ⚑ Refonte narrative (24/07, soir) — la home devient un **plan-séquence**

> Spec complète : `taskforce-docs/v1/14-design/landing-refonte/Scenario_Home.md`
> (6 questions par scène : message, problème, démonstration, progression, moment « Aha », pourquoi mieux)

**Diagnostic.** Les 9 illustrations ci-dessous sont correctes une par une, mais ensemble elles
échouent : **9 univers séparés** (aucune ne partage un nom, un chiffre ou un artefact avec une
autre) → on ne suit rien. Elles **bouclent toutes** → une boucle n'atterrit jamais, l'état final
qui porte le message passe comme les autres. Jusqu'à **3 cartes animées simultanément** → aucun
point focal. Et ce sont des **schémas** (carte blanche + lignes icône/texte + barre macOS), pas
des écrans : personne ne croit que le produit existe.

**Principe retenu.** La home est **un seul run, filmé en plan-séquence**. Même workspace, mêmes
personnes, mêmes chiffres, du hero au dashboard. Chaque section est un **angle de caméra
différent sur le même run**. Le message du support en haut de page revient à la fin comme un
point identifiable sur la courbe de lead time.

| Brique | Fichier | Rôle |
|---|---|---|
| Décor partagé | `src/lib/story.ts` | Workspace Northwind, projet Customer Portal, **run #147** « Let customers export their invoices », origine = message de Sam (Support, lundi 09:14), casting, 7 checkpoints, chiffres. **Aucune scène ne code en dur un nom ou un chiffre.** |
| Métronome | `src/lib/useScene.ts` | `useScene(beats)` : partition de durées, démarre à l'entrée à l'écran, se joue **une fois**, **se fige sur l'état final**. `useTypewriter` pour la frappe. `prefers-reduced-motion` → état final direct. |
| Châssis | `src/components/site/scene/AppWindow.tsx` | Vrai écran TaskForce (voir encadré ci-dessous). **Remplace la barre macOS de `MockFrame`** — trois pastilles + une URL, c'est le signe le plus sûr qu'on regarde un dessin. |

> ### ⚑ v194 (15/08) — Fix CI Lighthouse : `staticDistDir` pointait la racine
> `Lighthouse Performance` échouait `ENOENT .../dist` : l'action `uses:` tourne depuis la RACINE (le `defaults.working-directory: landing-page` ne s'applique qu'aux `run:`), donc `staticDistDir: "./dist"` cherchait `racine/dist` au lieu de `landing-page/dist`. → `.lighthouserc.json` : `"staticDistDir": "./landing-page/dist"`. Seuil bloquant unique = accessibility ≥ 0.95 (perf/bp/seo en warn).
> **Hors périmètre landing** : `Run Frontend Tests` échoue (tests de l'app `frontend/` — auth/subscription), pas causé par mes changements (je n'ai touché que `landing-page/`) — à traiter côté frontend/autre agent.

> ### ⚑ v193 (15/08) — Fix CI typecheck (`tsc --noEmit`) : l'étape APRÈS le lint échouait
> Le lint vert, le job landing-tests atteint `npm run typecheck` (`tsc --noEmit`) → 8 erreurs pré-existantes (jamais atteintes avant, le lint plantait en premier) :
> - Refs React 19 : hooks `useInViewReduced`/`useSequence`/`useReveal` typés `RefObject<HTMLElement>` → **`RefObject<HTMLElement | null>`** (AgentToolDemos, LiveSchematics, UseCaseDemo, LabsConcepts).
> - `DotField.tsx` : `canvas` possibly null → guard `if (!canvas) return;`.
> - `OrchestrationFlows.tsx` : `pathOptions` inconnu du type RF (mais garde l'angle droit) → `EDGE` cast `as DefaultEdgeOptions`, edge `dg3` cast `as Edge`.
> - `three` sans types → **`@types/three` installé** (un `@ts-nocheck` corrigeait tsc mais eslint le bannit → vraie solution = les types).
> - Vérifié local : **lint 0 / typecheck 0 / build 69 pages**. Commit + push `dev`.

> ### ⚑ v192 (15/08) — Fix CI lint (la PR #85 échouait) : imports inutiles + règle eslint fantôme
> Le check « Run Landing Tests » échouait : **1 erreur** `react-hooks/exhaustive-deps was not found` (règle citée dans un `eslint-disable` de `DotField.tsx` mais plugin non installé) + 39 warnings (surtout `APP_URL` inutilisé après le repoint waitlist).
> - `DotField.tsx` : commentaire `// eslint-disable-next-line react-hooks/exhaustive-deps` retiré (inerte — la règle n'est pas installée) → **0 erreur**.
> - Imports `APP_URL` inutiles supprimés (**25 seuls + Hero/Proof (`../nav`) + 3 multi** ; `SiteHeader` GARDE `APP_URL`, utilisé pour « Sign in ») ; `ArrowRight` (media), `Server` (enterprise) retirés ; `any` → `LucideIcon` (use-cases/index).
> - Vérifié : `npm run lint` **exit 0** (6 warnings pré-existants non bloquants ; script = `eslint .` sans `--max-warnings`), build prod **69 pages** OK. Commit + push sur `dev` → la CI de la PR #85 se relance.

> ### ⚑ v191 (15/08) — Consolidation git : tout sur `dev`, `main` absorbé, branches nettoyées
> User : « on descend sur dev, à la fin il reste juste main/dev + branches bot » → choix : **dev seulement (main via PR)** + **retirer Render**.
> - `dev` ⏩ FF vers `chore/v1-closure` (notre refonte v1 complète, +2400).
> - **Découverte** : `main` portait une AUTRE landing (ancienne v1.0.0, ~129 fichiers, historiques disjoints → conflits `add/add`) + `render.yaml` + bumps dependabot frontend. → **`git merge -s ours origin/main`** : notre arbre gardé tel quel, `main` absorbé dans l'historique → **`dev → main` = fast-forward propre pour la PR**. Compromis : bumps dependabot de `main` superséded (à rouvrir).
> - **`render.yaml` supprimé** (Vercel + VMs, fini Render ; les `.svg` = logos Render pour les icônes d'intégration, gardés). Aucun workflow CI ne déployait sur Render.
> - `dev` poussé (FF depuis origin/dev). Branches supprimées (local + remote) : `feat/dashboard`, `feat/landing-refonte`, `test/v1-hardening`, `dev-config`, `chore/integration`, `chore/v1-closure`. **Restent : `main`, `dev`, `dependabot/*` (16).**
> - Côté user : PR `dev → main` (release v1, FF), Vercel (Root Directory = `taskforce-fullstack/landing-page`), rerun dependabot (47 vulns signalées).

> ### ⚑ v190 (14/08) — Pré-deploy : page `/waitlist` + tous les CTA d'inscription repointés + build prod OK
> User : « rediriger vers une waitlist » (les CTA pointaient vers `app.taskforce.dev`, morts tant que l'app n'est pas déployée).
> - **NOUVEAU `src/pages/waitlist.astro`** : page « Join the waitlist » (PageHero + CTA **mailto** `hello@taskforce.dev`, aucun backend requis sur site statique ; brancher Formspree/Tally plus tard). + perks + lien book-a-demo.
> - **Repoint** : `` `${APP_URL}/auth/register` `` → `"/waitlist"` sur **49 occurrences / 28 fichiers** (perl scripté). 0 `auth/register` restant. Les imports `APP_URL` devenus inutilisés ne cassent pas le build (esbuild les strippe) ; « sign in » (`APP_URL` seul) laissé tel quel.
> - **Build prod vérifié** (`docker exec taskforce-landing-dev npm run build`) : **69 pages statiques en 32 s, « Complete! »** incl. `/waitlist`. Sortie **statique** → OK Vercel / tout hébergeur statique.
> - **Déploiement (non fait par moi)** : pas d'accès au compte Vercel de l'utilisateur → deploy = son action (dashboard : import repo GitHub → **Root Directory = `taskforce-fullstack/landing-page`** → auto-detect Astro). Git : branche `chore/v1-closure` **partagée** + bcp de changements `frontend/` non commités (pas les miens) → **pas de merge dev/main de ma part**. Pour n'amener QUE le dossier : `git checkout dev && git checkout chore/v1-closure -- landing-page/`.

> ### ⚑ v189 (14/08) — Revert de l'habillage « stripes » (user : « j'ai rien dit, enlève »)
> Demande C annulée : `.bg-diagonal` (global.css) + prop `decor` (BorderedGrid) + `decor="diagonal"` (approvals) **supprimés**. **A (no-rail) et B (flèches à angle droit) conservés.** Vérifié : 0 `bg-diagonal` servi, approvals 200 clean.

> ### ⚑ v188 (14/08) — Corrections pré-déploiement : rails, flèches à angle droit, habillage des zones vides
> User (3 corrections avant deploy) : (A) retirer les borders G/D de la section striped ; (B) flèches orchestration à angle droit ; (C) habiller les zones vides (rayures/biais/points), audit tout le site.
> - **A** — `enterprise.astro` §5 (Security & compliance, `bg-striped`) : `container-rail` → `container-rail no-rail` (`border-inline:0`). Vérifié : borders G/D = 0px ici, 0.8px ailleurs (scopé).
> - **B** — `OrchestrationFlows.tsx` : `EDGE.pathOptions.borderRadius` **14 → 0** → arêtes smoothstep à **angle droit** (comme les boucles `tinted`, déjà à 0). Config OK ; les edges React Flow ne se rendent pas dans le pane caché (nodes oui : 21) → à confirmer dans un vrai navigateur.
> - **C** — nouveau **`.bg-diagonal`** (rayures 45°, fondu haut/bas) à côté de `.bg-dots` / `.bg-striped` ; prop **`decor`** ajoutée à `BorderedGrid`. Démo : la section « What you approve » (celle entourée) → `decor="diagonal"`, motif rendu derrière le contenu, habille la zone vide sous les cartes. Vérifié (::before repeating-linear-gradient 45deg + masque + isolate).
> - **Reste (C) — rollout site-wide** : mécanisme prêt (dots/striped/diagonal). Pas encore appliqué partout — c'est exploratoire (« pour voir ce que ça donne ») → OK utilisateur attendu sur look/intensité avant d'auditer & habiller toutes les pages.

> ### ⚑ v187 (14/08) — Labs : chaque insight interne entre en REVEAL staggered (one-shot, plus de boucle)
> User : « les petits composants à l'intérieur, tu peux les faire animer avec un reveal ou autre ? Tous les insights ».
> - **`LabsConcepts` refondu** : `useSequence` passe de BOUCLE à **one-shot staggered** (IntersectionObserver, joue 0→count UNE fois à l'entrée, garde l'état complet). Chaque petit composant (rôle+artefact, porte « human », décision nommée, Run1/Memory/Run2, ligne modèle+raison, tour de calibration) ENTRE en fade+translate à son tour, puis reste — façon Attio. `useInViewReduced` (boucle) supprimé.
> - **2 niveaux de reveal** : la carte illustration (fade, 700ms) puis ses insights internes (stagger, 500ms).
> - Garde-fous : tout visible d'emblée si `prefers-reduced-motion` ou `IntersectionObserver` absent.
> - Vérifié LIVE (1280px) : **19** éléments-insight (`duration-500`) + 4 cartes (`duration-700`) portent les classes reveal, état non-entré correct (`opacity:0 / translate`), overflow-x = 0, 0 erreur d'app. (l'IO ne se déclenche pas dans le pane caché → jouera dans un vrai navigateur.)

> ### ⚑ v186 (14/08) — Labs : fix scrollbar horizontale + reveal-on-enter (façon Attio)
> User : « une scroll bar horizontale s'est ajoutée (je peux décaler à gauche) ; possible + d'insight dans les anims ? sinon façon Attio : quasi-statique + une anim reveal/fade à l'arrivée qui attire l'œil — c'est aussi sympa que d'animer trop ».
> - **Fix scrollbar** : mes 2 patches débordaient (`left-[-4%]` / `right-[-3%]`) → overflow-x → barre horizontale. Ramenés dans les bornes (`left-0` / `right-0`, largeurs ajustées). Vérifié `scrollWidth - clientWidth === 0` à 1280px.
> - **Reveal-on-enter (`LabsConcepts`)** : nouveau hook `useReveal(ref)` (IntersectionObserver, 1 fois, threshold .15) ; chaque illustration entre en **fade + translate-y** à l'arrivée à l'écran, puis sa boucle joue. Garde-fous : visible d'emblée si `prefers-reduced-motion` OU `IntersectionObserver` absent (jamais bloquée invisible).
> - Vérifié LIVE (1280px) : overflow-x = 0, 4 illustrations avec la transition reveal (état non-entré `opacity:0 / translate 16px` correct ; l'IO ne se déclenche pas dans le pane caché — normal, comme toutes les anims IO, jouera dans un vrai navigateur), nav toujours sticky, 6 champs pixel, 0 erreur d'app.
> - **Insight** : pas d'anim en boucle ajoutée (on suit ton point « le reveal vaut mieux que trop animer ») ; les 4 concepts gardent leur insight actuel. Enrichir un concept précis reste dispo sur demande.

> ### ⚑ v185 (14/08) — Labs : taches de pixels DANS les sections (derrière les cards)
> User : « mets-en aussi dans les sections, par ci par là, derrière les cards, pour des effets sympa — pas trop non plus ».
> - **`PixelBleed` — mode `patch`** ajouté : tache libre (masque RADIAL doux) positionnée via `class`, en plus du mode bord. Toujours overlay `z-0`, aucune hauteur de flux.
> - **`labs/index.astro`** : 2 patches semés DERRIÈRE le contenu — subjects (violet `#8E90E0`, mi-section, bas-gauche) et graduated (rose `#EA6A9A`, derrière les cartes, haut-droite). Total = **6 champs pixel** (4 coutures + 2 taches), couleurs/positions variées, dosé « pas trop ».
> - Vérifié LIVE : /labs 200, 6 overlays tous `z-0` (dont 2 radiaux) DERRIÈRE le contenu `z-10`, nav toujours sticky, 6 canvas PixelBlast OK, 0 erreur d'app. ⚠️ 6 contextes WebGL — si ça chauffe, réduire nombre/opacité (réglage simple).

> ### ⚑ v184 (14/08) — Labs : séparations = transitions AMBIANTES (pixel derrière le contenu, sans ajouter d'espace)
> User : « les séparations de section... c'est pas fait pour séparer ; les sections sont collées, le truc vient entre juste pour transitionner SANS ajouter d'espace, et ça peut passer DERRIÈRE les cards, un peu partout ».
> - **NOUVEAU `PixelBleed.astro`** : champ PixelBlast en OVERLAY absolu (`pointer-events-none absolute z-0`, **aucune hauteur de flux**), masqué en fondu vers l'intérieur. À poser en 1er enfant d'une `section relative isolate` dont le contenu est `relative z-10` → le pixel passe DERRIÈRE les cartes (elles le recouvrent, il apparaît autour), les sections restent COLLÉES.
> - **`labs/index.astro`** : les 4 `<PixelBand>` (bandes de 172px qui écartaient/séparaient) **supprimés**. Remplacés par `PixelBleed` derrière le contenu : haut de subjects (coral/gauche), loop (rose/droite), graduated (périwinkle/gauche) + bas de graduated (bleu/centre → fondu vers le CTA gris). Couleurs/alignements variés.
> - **`PixelBand.astro` = orphelin** (plus importé) — laissé (pré-existant) ; à supprimer sur feu vert (idem `LabsShowcase.tsx`).
> - Vérifié LIVE : /labs 200, 4 overlays `z-0` (h 230, op .45 ; 3 top + 1 bottom) DERRIÈRE le contenu `z-10`, nav toujours `sticky top:64px` (isolate/z-10 ne l'ont pas cassée), 4 canvas PixelBlast (pas de régression perf), 0 erreur d'app.

> ### ⚑ v183 (14/08) — Labs : animations riches en INSIGHT + sections dévariées
> User : « ils ont tous la mm structure, faut innover de temps en temps ; plus d'animation, plus d'insight animé — c'est ça le truc ».
> - **`LabsConcepts.tsx` réécrit** — chaque illustration RACONTE l'insight (plusieurs étapes, contenu concret qui bouge) : agent-roles = 3 rôles produisent chacun un artefact reviewé (Spec → API contract → 3 issues) + porte « human ✓ » entre chaque · run-memory = Run 1 pond 3 décisions nommées (Postgres/EU, idempotent, Mongo rejeté) → Memory (compteur) → Run 2 « loads 3 · starts ahead » · model-choice = un modèle par étape AVEC la raison (privacy/strength/cost) · learning-from-reviews = 3 tours, l'édition rétrécit (big → small → accepted). Toujours self-play/fluide, D11 (chip « concept »).
> - **`LabsSubjects.tsx` — compositions VARIÉES** (fini les 4 sections identiques) : **hero** (illustration vedette pleine largeur en haut, puis why + hypothèses en 2 colonnes, hypothèses en LISTE) pour agent-roles & learning-from-reviews ; **split miroir** (why | canvas, hypothèses en GRILLE 3) pour run-memory (illus. à droite) & model-choice (à gauche). Séquence : hero · split-R · split-L · hero.
> - Vérifié LIVE (restart) : /labs 200, contenus riches présents dans le DOM hydraté, shapes = hero/split/split/hero, 4 canvas sujets (+1 boucle), **0 erreur d'app** (seul un warn Vite HMR websocket, bénin en dev Docker).

> ### ⚑ v182 (14/08) — Labs : combler les « gros trous » (densité, inspi railway.com/features)
> User : « j'aime bien, ça fait juste bizarre qu'il y ait de gros trou des fois » + réf. railway.com/features.
> - **Sections sujets restructurées** (`LabsSubjects.tsx`) : au lieu de « texte haut | petite illustration » (→ vide), 3 blocs qui REMPLISSENT : en-tête (nom + maturité + lead) → **why + illustration sur un canvas POINTILLÉ (`flow-canvas`) qui s'étire** (colonnes égales `items-stretch`, `min-h-[240px]` → plus de trou blanc, lecture « spécimen sur paillasse ») → **hypothèses en grille de 3 cartes pleine largeur** (densité). Liens poussés en bas (`mt-auto`).
> - **Carte « Graduated » vedette** (`labs/index.astro`) : suppression du **gros en-tête vide `h-44`** (watermark) → carte de contenu propre, icône colorée boxless (`hueFor` → Brain fuchsia).
> - Inspi Railway retenue : nav d'ancres sticky (déjà là) + une section se REMPLIT d'une grille de cartes compactes, jamais un filet de texte à côté d'un vide.
> - Vérifié LIVE (restart) : /labs 200, **0 erreur console**, 4 canvas `flow-canvas`, 4 grilles `sm:grid-cols-3` avec contenu réel, `h-44` supprimé (0 en class + 0 en CSS), 4 illustrations « concept ».

> ### ⚑ v181 (14/08) — Labs : refonte « experiments » (onglets EN HAUT sticky + ancre + sections empilées)
> User : « j'aime pas les tabs à droite + contenu au milieu ; onglets en haut alignés, contenu dessous, une page ; sections empilées, tabs sticky sous le header, ancre sur la bonne section ; potentiellement des animations ».
> - **NOUVEAU `LabsSubjects.tsx`** (remplace l'usage de `LabsShowcase`) : barre d'onglets **sticky `top-16 z-40`** (sous le header h-16) qui **ancre-scrolle** (`scrollIntoView`) vers **4 sections empilées** (`id=lab-*`, `scroll-mt-[116px]`). **Scroll-spy** (IntersectionObserver `-140px/-55%`) surligne l'onglet actif (soulignage `labs-g5`). Par section : EXP + maturité, lead, why, hypothèses H1–H3 (filets carrés), « Where it stands », liens. Illustration alternée G/D.
> - **NOUVEAU `LabsConcepts.tsx`** : 1 illustration **self-play** par direction, honnête (D11 — chip « concept », jamais un mécanisme livré) : agent-roles = relais de rôles cadrés + revue humaine · run-memory = décision portée Run 1 → Memory → Run 2 · model-choice = un modèle par étape (local/hébergé) · learning-from-reviews = override → signal → jauge de calibration.
> - `labs/index.astro` : intro réécrite (« Four directions we're chasing »), `<LabsSubjects>` posé hors `container-rail` (barre sticky pleine largeur). Conservé : hero image, `PixelBand`, boucle `LabsLoopFlow`, graduated, `PageCta`.
> - **`LabsShowcase.tsx` = orphelin** (plus importé) — laissé en place (fichier pré-existant, pas créé par moi) ; à supprimer sur feu vert.
> - Vérifié LIVE (restart) : /labs + sous-pages 200, **0 erreur console** (îlots hydratés), 4 onglets + 4 sections `lab-*`, nav `position:sticky / top:64px`, soulignage actif, 4 illustrations « concept », `scroll-mt 116px`, DA toujours **0** `rounded-2xl`/`shadow`.

> ### ⚑ v180 (14/08) — Labs : alignement DA ciblé (index + 4 sous-pages + showcase)
> User : « Labs, refactor, reprendre la DA » → choix confirmé : **alignement DA ciblé** (on garde l'identité Labs : image plein cadre, PixelBlast, gradients de trait, boucle React Flow).
> - **CTA** (`labs/index.astro`) : la card flottante `rounded-3xl border shadow-xl` posée sur image → remplacée par le **`<PageCta>` standard** (à plat, cohérent avec tout le site). Fini la carte à ombre.
> - **« Graduated »** : vedette + liste en **carré** (`rounded-2xl` retiré) ; icônes de la liste **sans fond gris**, colorées via `hueFor` (Cpu bleu, ShieldCheck ambre, Sparkles rose).
> - **`LabsShowcase.tsx`** (onglets) : panneau + onglets **carrés** (`rounded-2xl`/`rounded-xl` retirés), `shadow-sm` de l'onglet actif retiré, tuiles hypothèses `bg-secondary/50 rounded-xl` → **`bg-card` carré** (filet, plus de gris).
> - **`LabDetail.astro`** (les 4 sous-pages) : tuiles « exploring » + « where it stands » `rounded-xl` (+ gris) → **carré `bg-card`** (filet).
> - Vérifié LIVE (restart) : 5 routes `/labs*` en 200, **0** `rounded-2xl`/`rounded-xl`/`shadow` en attribut `class`, 3 icônes couleur boxless, 0 boîte grise, 0 overlay.
> - Conservé (identité Labs) : hero image (`LabsBackdrop`), `PixelBand`, la boucle `LabsLoopFlow`.

> ### ⚑ v179 (14/08) — Ressources : FAQ avant le CTA (6 pages) + Learn dévarié
> User : « docs/blog/learn/changelog/roadmap/status → ajouter une FAQ en bas, juste avant le CTA » ; « Learn : voir si on refactor les sections ».
> - **`sections/FaqSection.astro`** (NOUVEAU, réutilisable) — motif repris d'`enterprise.astro` : section pleine + filet 1px, `dl` en 2 colonnes, props `eyebrow/title/items`. Zéro carte flottante/ombre/radius.
> - **FAQ posée JUSTE avant `<PageCta>`** sur : docs, blog, learn, changelog, roadmap, status. Contenu honnête (D11), spécifique à chaque page (pré-lancement assumé : pas d'API livrée, pas d'uptime, pas de notes datées, labels de maturité…).
> - **Learn — sections dévariées** : les 4 PARTS étaient rendus À L'IDENTIQUE (ternaire mort `i%2 ? "bg-card border-b" : "bg-card border-b"`). Refaits en récit numéroté **01–04** sur 2 colonnes **alternées** (rail numéro+eyebrow ↔ prose), fini les 4 blocs centrés identiques.
> - Vérifié LIVE : 6 routes 200, FAQ présente, 0 overlay ; Learn = 4 sections `grid-cols-12`, alternance 2+2 (`lg:col-start-9` / `lg:col-start-6`), numéros 01–04 rendus.
> - **Reste du lot Ressources** : **Labs** (refonte DA « à fond ») — pas encore fait, prochaine étape ciblée.

> ### ⚑ v178 (13/08) — Light-only VERROUILLÉ (`color-scheme: light`) + fix dev-server
> User : « use dark theme » → clarifié : **pas de mode sombre, clair uniquement** (confirmé). Rien de sombre ajouté ; la décision light-only tient.
> - **Incident dev-server** : Astro/Vite « transport invoke timed out … fetchModule `global.css` » → **500 sur toutes les routes** (aggravé par mes restarts en série). Réglé en vidant le cache dev (`node_modules/.vite` + `.astro`) puis restart. Pas un bug de code, pas lié aux îlots.
> - **`global.css`** : ajout de `color-scheme: light` sur `:root`. Sans ça, un visiteur dont l'OS est en sombre voit les contrôles natifs (champs, scrollbars) rendus en sombre = « faux dark » involontaire. Verrouille le light-only. Vérifié : servi 1× dans le CSS compilé (Tailwind v4), routes 200.

> ### ⚑ v177 (13/08) — Cards animées : MÊME taille, alignées (hauteur de démo uniforme)
> User : « faut que les cards soient au même niveau, de même taille si possible ». Vrai : dans les grilles Home, les démos avaient chacune leur hauteur (draft 4 items ≠ graph ≠ pipeline ≠ audit) → cards décalées. La page Agents, elle, aligne déjà car ses démos sont en `h-[132px]` fixe.
> - **`UseCaseDemo.tsx`** — ajout d'un `className?` passé à chaque renderer (`cn(SHELL, className)`) ; **aucun** autre changement de structure (SHELL reste un bloc `overflow-hidden`, contenu ancré en haut, comme la page Agents). Sans `className` → hauteur naturelle inchangée (pages use-case standalone intactes).
> - **`LiveSchematics.tsx › AuditTrailDemo`** — props `className` + **`compact`** (padding `py-1.5`, entrées sur **1 ligne** avec `who` à droite au lieu du « approved by » sur 2 lignes) pour tenir dans le cadre. Non-`compact` (page Approvals) **inchangé**.
> - **Home `Synergy`** (2×2) : les 4 démos en **`h-[172px]`** (`<AuditTrailDemo compact className="h-[172px]">`), Plan `draft` réduit à **3 items** pour ne jamais déborder.
> - **Home `WhatShipsToday`** (2 actes) : les 2 démos en **`h-[172px]`**, acte 1 `draft` réduit à 3 items (3ᵉ item raccourci pour ne pas wrapper en étroit).
> - **Hauteur 172 choisie** = tient le plus grand contenu réel (audit compact 169) sans rogner les courts (graph 134, pipeline 121, board 164) → mesuré au clone à largeur forcée (le pane caché force `vw=0`, les mesures live sont donc trompeuses). 6/6 démos à 172, contenu ≤172, 0 rognage ; standalone (split 202, graph) et Approvals (audit 2 lignes) non régressés ; 0 overlay.
> - **Écueil noté** : un `flex-1 justify-center` en hauteur AUTO rogne ~4px (basis sous-pixel) → abandonné ; le cadre à hauteur fixe + bloc `overflow-hidden` (motif Agents) suffit et ne rogne jamais.

> ### ⚑ v176 (12/08) — Animations DIVERSIFIÉES : des métaphores, plus « que des listes »
> User : « faut diversifier les animations, c'est que des listes ; trouve une animation en rapport avec le titre/description, qui illustre vraiment ». Vrai : draft/recall/check/split = tous « des items qui apparaissent en liste ».
> - **`UseCaseDemo.tsx`** — 3 nouveaux `kind` VISUELLEMENT distincts (data-driven, réutilisables) :
>   - **`graph`** : SVG nœud central + satellites, arêtes qui se **connectent** en séquence → illustre la mémoire / les liens de décision.
>   - **`pipeline`** : étapes horizontales qui **s'allument l'une après l'autre** + statut « Running · X / Run complete » → illustre l'exécution / le run.
>   - **`board`** : mini-**kanban** 3 colonnes, cartes qui se posent → illustre « lire ton board » / la collaboration.
> - **Réassignation par SENS** (l'anim colle au titre) :
>   - Home `Synergy` : Plan=`draft` (doc) · Remember=**`graph`** · Execute=**`pipeline`** · Verify=`AuditTrail` → 4 métaphores distinctes.
>   - Home `WhatShipsToday` : acte 1=`draft` · acte 2=**`board`** (« reads your board »).
>   - Use-cases : architecture-decision=**`graph`**, onboarding=**`graph`**, sprint-planning=**`board`** (les autres : split/pr/check/recall/draft) → **7 kinds** sur 10 pages.
> - Vérifié LIVE (restart) : Home graph+pipeline+board+draft+audit rendus, use-cases arch=graph (svg viewBox) + sprint=board, 0 erreur.
> - **Règle** : une animation doit ILLUSTRER le concept (métaphore : graphe pour des liens, pipeline pour un run, board pour un tableau), pas juste « une liste qui apparaît » répétée partout.

> ### ⚑ v175 (12/08) — Pricing aligné sur la webapp + Home : cards animées (à la place des workflows)
> **Pricing — alignement contenu sur l'app** (user : « aligne ce qu'on a sur la webapp », capture fournie) : `PricingSection.tsx`
> - Tiers : Free / **Basic** (ex-Pro) / Business (**Most popular**, ex-Pro) / Enterprise. Prix en **€** (Basic 10/8, Business 16/13, Free 0, Ent Custom). Features réelles de l'app (250 issues, unlimited uploads, admin roles, guests & private projects, advanced analytics + burndown, AI decisions & workflows [Beta], GitHub integration, SSO/SAML/SCIM, granular admin, GDPR audit, on-premise). **Tokens Cortex AI** par palier (100K/500K/2M/unlimited). Kicker supprimé (type `kicker` retiré).
> - COMPARE (table) réécrit sur les mêmes lignes ; en-tête Pro→Basic ; titre « Everything from a free workspace to a governed enterprise deployment ». FAQ : Pro→Basic, nouvelle Q « What are Cortex AI tokens? », « two ways to run AI » → mention Cortex. Notes → Cortex.
> - ⚠️ Décisions pricing antérieures (Pro, self-host=Enterprise) écrasées par l'app = source de vérité (choix user).
> - Vérifié LIVE : Free/Basic/Business/Enterprise, Business = Most popular, €, Cortex, plus de « Pro », 0 erreur.
> **Home — cards animées façon Agents** (user : « fais la mm chose sur la Home, à la place des workflows ») :
> - `home/WhatShipsToday.astro` : les 2 actes « Live » remplacent `StepChainFlow` par **`UseCaseDemo`** — acte 1 = `draft` (« Spec · issue #142 » + prompt Claude Code → « Approved → Memory ») ; acte 2 = `recall` (« What should we do next? » → P1/P2/P3).
> - `home/Synergy.astro` : les 4 systèmes (Plan/Remember/Execute/Verify), avant cartes texte en `TraitGrid cols=4`, deviennent une **grille 2×2 de cards animées** — Plan=`draft`, Remember=`recall`, Execute=`check`, Verify=**`AuditTrailDemo`** (piste d'audit réutilisée). Le bento DecisionGraph reste dessous.
> - Réutilise la lib de demos existante (UseCaseDemo / LiveSchematics) → cohérence + zéro nouveau composant. Vérifié LIVE : 6 demos rendues, 0 trou, 0 erreur.
> - **Reste** : hubs `/use-cases` `/vs`, pages company. « Et après c'est good » (user) → on approche de la fin.

> ### ⚑ v174 (12/08) — Pricing en UN SEUL BLOC (style app) + `/vs` vérifié (réel, propre)
> **Pricing** — user (capture de l'app) : « vaut mieux quelque chose comme ça : colle en 1 bloc et ça monte crescendo, adapte les boutons ». Les 4 cartes `rounded-2xl` flottantes (gap-5) → **UN SEUL BLOC** : conteneur `overflow-hidden rounded-2xl border` + grille `gap-px bg-border sm:grid-cols-2 lg:grid-cols-4` → colonnes collées séparées par des filets (4 tiers remplissent → 0 trou). `PriceCard`→`PriceColumn` : plus de bordure/radius par carte, fond teinté sur la colonne featured (Pro), badge « Most popular » **inline** (plus de `-top-3` flottant), bouton **pleine largeur** (style pill du site conservé). Contenu/tiers/prix/toggle inchangés (décisions pricing préservées : Free/Pro/Business/Enterprise, self-host=Enterprise). ⚠️ la capture app montre « Basic » + « Cortex tokens » + Business populaire — PAS repris (ce serait une refonte de contenu à décision produit ; on n'a touché QUE la mise en page comme demandé).
> - Vérifié LIVE (restart, île React) : 1 bloc, 4 colonnes, 0 cellule vide, 1 colonne featured teintée, badge inline, plus de carte `rounded-2xl` individuelle, plus de badge flottant, 0 erreur.
> **`/vs`** — user : « fais la comparaison, mais chaque comparaison doit être RÉELLE et le design suit ; pas grave si c'est plutôt similaire ». Constat : `VsCompare` (1 template, 8 pages) est déjà propre + honnête (crédit au concurrent → ce que TaskForce ajoute (traits) → tableau côte à côte tinté TaskForce → « better together »), `comparisons.ts` déjà fair-play (« not its focus », jamais « ✗ »). **Similarité assumée = OK** (pas de variété forcée, contrairement aux use-cases). Seule retouche : kicker du hero = **« Compare · Project tracker / Coding agent »** (cadre honnête par `c.kind`).
> - Vérifié : 4 pages vs (jira/devin/notion/copilot) → grille adds remplie (4/0), tableau OK (le « 1 empty » = coin haut-gauche blanc volontaire, pas un trou gris), 0 erreur.
> - **Reste** : hubs `/use-cases` `/vs` (index), pages company, balayage copy. Domaines majeurs tous faits.

> ### ⚑ v173 (12/08) — Solutions : VARIÉTÉ de mise en page (l'agencement tourne, plus 1 seul gabarit)
> User : « à chaque fois tu mets la même chose sur toutes les pages, varie — des cards, des listes, différencie ». Vrai problème : même avec 5 demos, la STRUCTURE de page était identique sur les 10 use-cases (1 gabarit) → effet copié.
> - **`UseCaseDetail`** : la mise en page **TOURNE** sur 3 variantes selon `USE_CASE_ORDER.indexOf(key) % 3` (contenu identique, agencement différent) :
>   - **v0** (product-spec, code-review, onboarding, sprint-planning) : fond **à points**, steps en **liste numérotée** à gauche, demo à droite.
>   - **v1** (architecture-decision, qa-testing, incident-postmortem) : fond **rayé** (marge haute), steps en **cartes** (traits `lg:grid-cols-4`), demo **pleine largeur** dessous, works-with en **liens inline**.
>   - **v2** (backlog-grooming, documentation, release-notes) : fond **blanc**, demo **à gauche**, steps en **checklist** à droite, « what it is » en **intro 2 colonnes**.
>   Deux pages voisines n'ont jamais la même structure. Vérifié : product-spec=dots/list, architecture=striped/cards, backlog=plain/checklist.
> - **`VerticalDetail`** : 2 variantes selon l'index (`% 2`) — pair (product, marketing) = points + demo à droite + couldApply **liste** ; impair (operations, client-services) = rayures + demo à **gauche** + couldApply en **cartes**. Vérifié.
> - Zéro trou gris (steps-cards 4 → `sm:grid-cols-2 lg:grid-cols-4` remplit ; couldApply-cards 4 → `sm:grid-cols-2` remplit). Pas de restart (`.astro` recompile).
> - **Règle** : un gabarit partagé DOIT faire varier l'agencement (fond/ordre/liste-vs-cards-vs-checklist) selon l'item, sinon N pages identiques = effet copié-collé — même si le contenu diffère.

> ### ⚑ v172 (12/08) — Solutions : 10 use-cases + 4 verticales enrichis + différenciés + animés (via 2 templates)
> User : Solutions = vide + copié-collé + non différenciant ; « c'est le genre de truc qui se démontre facilement, mets des animations comme sur Agents ». Constat : les 10 use-cases partagent **1 template** (`UseCaseDetail`) rendant le MÊME flux React Flow ; les 5 équipes partagent **1 template** (`VerticalDetail`) très mince. Levier = enrichir les 2 templates.
> - **Nouveau `illustrations/UseCaseDemo.tsx`** — 1 composant, **5 formes animées distinctes** pilotées par la donnée : `draft` (l'artefact s'écrit → chip « Approved »), `check` (cases QA qui se cochent en vert), `split` (un spec → issues avec estimations), `recall` (souvenirs Memory qui remontent sur une requête), `pr` (statut PR Open→In review→Approved→Merged, linked to TF-142). Self-play, in-view, reduced-motion, carré/hairline/sans ombre.
> - **`use-cases.ts`** : ajout `USE_CASE_DEMOS` (map par clé, fil rouge cohérent « checkout/payments ») → draft×4 (spec/architecture/documentation/release-notes), split×2 (backlog/sprint), recall×2 (onboarding/postmortem), check (qa), pr (code-review). 5 looks répartis sur 10 pages.
> - **`UseCaseDetail` refait** : hero → « what it is » → **« In a run » = étapes lisibles (`inRun` en liste numérotée) + demo animé propre au cas** (remplace le flux copié) → **« Works with »** (cartes bordées individuelles = 1 ou 2 liens sans trou gris) → « Where it stands » (honnête, bandeau carré). Fini le copié-collé.
> - **`verticals.ts` + `VerticalDetail`** (4 métiers exploratoires) : ajout `VERTICAL_DEMOS` (draft illustratif par métier : Spec onboarding / Runbook vendor / Campaign Q3 / Deliverable audit). Section « The idea » repensée en 2 col (idée + couldApply à gauche, **demo à droite**) + légende **« the shape, not a shipped X workflow »** → HONNÊTETÉ D10 préservée (badge « Exploratory · not proven yet » gardé). Bandeau honnêteté carré.
> - Vérifié LIVE (restart) : code-review PR animé (4 stages + linked TF-142), product-spec/documentation/release-notes draft, backlog/sprint split (estimations), onboarding/postmortem recall, qa check ; 4 verticales = demo + badge Exploratory + légende illustrative ; 0 overlay d'erreur. (`err:true` initial = faux positif de mon regex trop large `Invalid|undefined|is not`.)
> - **Engineering** (`solutions/engineering`, page custom, la plus complète) : laissée telle quelle — « un peu vide mais OK » côté user, moindre priorité.
> - **Reste Solutions** : rien de bloquant. Prochain domaine : **Pricing**, puis balayage global copy (« parfois un peu court »).

> ### ⚑ v171 (12/08) — Revue page-par-page : Approvals · Brain-os · Smart Assign · Collaboration · Analytics (fin Product)
> User : « improve what you see » sur chaque + « ajoute des animations là où ça colle » + Analytics « anime les schémas + ne finis pas sur un workflow, ajoute une section » + « parfois le copy est un peu court ».
> - **Nouveau `illustrations/LiveSchematics.tsx`** (self-play, in-view, reduced-motion, carré/hairline/sans ombre) :
>   - `AuditTrailDemo` → **Approvals** : remplace le `ScreenPlaceholder "Audit trail"` par les approbations qui tombent une à une (who · what · when, chip `write` pour l'action externe). Vérifié : 4 entrées + « approved by ».
>   - `DecisionRecordDemo` → **Brain-os** hero : remplace le gros `ScreenPlaceholder` par une **décision-OBJET** dont les champs se remplissent (Decision/Because/Rejected/Shaped) puis « linked in Memory » (pulse). Distinct des 2 graphes React Flow de la page. Vérifié : 4 champs.
> - **Analytics** : ajout d'une **section de clôture non-workflow** avant le CTA — « The questions it answers, day to day » (6 questions ↔ 6 métriques réelles, liste 2 col remplie, icônes distinctes) → la page ne finit plus sur `AnalyticsLoopFlow`. Les 2 schémas (ask-chart + DeliveryInsights) étaient déjà animés (intacts, carré/sans ombre).
> - **Icônes (alias Lucide, suite)** : `KanbanSquare` = alias → svg `lucide-square-kanban`/displayName `SquareKanban` → repli bleu → collision avec MessageSquare (BLOCKS collab). Ajouté `SquareKanban: HUE.cyan`. (2e alias après `ChartColumn`.) BLOCKS = cyan/sky/blue/amber (4 distinctes).
> - Vérifié LIVE (restart) : les 5 pages 200, 0 erreur ; Approvals AuditTrail rendu + APPROVE distinctes + ic-tiles transparents ; Brain-os DecisionRecord + POINTS 4 distinctes (indigo/violet/teal/slate) ; Analytics closer + QUESTIONS 6 distinctes + DeliveryInsights `border` carré ; Collaboration BLOCKS 4 + LIVE 3 distinctes, ic propres ; Smart Assign (AutoAssign/SmartAssignFlow déjà riches) 0 erreur.
> - **Smart Assign / Collaboration** : déjà des îlots animés (AutoAssign, CollabBoard) → surtout appliqué la règle icônes (glyphe nu, distinctes) ; laissé le reste (solide).
> - **Règle (alias Lucide)** : `BarChart3→ChartColumn`, `KanbanSquare→SquareKanban` retombent en bleu si non mappés. Sur une nouvelle page, vérifier la classe `lucide-*` du svg vs la couleur attendue.
> - **Bilan Product** : hub + 8 sous-pages toutes passées (orchestration, agents, approvals, brain-os, smart-assign, collaboration, analytics, integrations). Prochain domaine : Solutions (engineering/product/operations/marketing/client-services + use-cases/vs) ou Pricing.

> ### ⚑ v170 (12/08) — Revue page-par-page : Orchestration + Agents
> **Orchestration** (`product/orchestration`) :
> - Hero **centré en mobile** (`text-center lg:text-left` + rows `justify-center lg:justify-start`, lead `mx-auto lg:mx-0`) — comme les héros PageHero.
> - **Arêtes en angle droit** : `OrchestrationFlows` `EDGE`+`tinted()` → `pathOptions.borderRadius 14 → 0` (smoothstep à coins nets = angle droit ; « pour rester aligné »). Impacte tous les flux du site (cohérent).
> - Section rayée « The team » : `py-20 lg:py-28` → **`pt-28 pb-20 lg:pt-44 lg:pb-28`** (les rayures ne touchent plus le texte).
> - **Cartes/boîtes** : cartes modèle `rounded-xl` → carrées ; boîtes d'icônes CPO/CTO/COO (`bg-card rounded-lg border ring-1` + couleurs en dur) **supprimées** → glyphe `hueFor` nu.
> **Agents** (`product/agents`) :
> - Boîtes CPO/CTO/COO idem → glyphe `hueFor` nu.
> - **3 mini-demos animées** (nouveau `illustrations/AgentToolDemos.tsx`, sans dépendance) en haut des cartes TOOLS : `MemorySearchDemo` (requête qui se tape → 2 souvenirs), `TakeNotesDemo` (3 lignes qui s'écrivent → « Saved to graph »), `ConnectedToolsDemo` (outils github/slack/linear, actif qui défile, read=done / write=waits for you). Self-play, `IntersectionObserver` (jouées à l'écran), `prefers-reduced-motion` figé. DA : carré, filet, sans ombre. Câblées via `{i===n && <Demo client:visible/>}` (tags statiques → directive client fiable, pas de tag dynamique). ic-tile TOOLS remplacée par glyphe inline coloré.
> **Icônes (global, `site-icons.ts`)** — collisions de sections levées, « même icône = même couleur » conservé : `Boxes → indigo` (PRINCIPLES `Boxes/Server`, RULES `Boxes/SlidersHorizontal`), `Building2 → slate` (TEAM `Building2/CalendarClock` étaient 2 bleus). CPO/CTO/COO = Compass violet · Building2 slate · CalendarClock bleu (3 distinctes).
> - Vérifié LIVE : Agents TEAM 3 distinctes + 3 demos rendues (search/notes/tools, 3 logos) ; Orchestration hero centré, AGENTS 3 distinctes, PRINCIPLES 4 distinctes, `lg:pt-44`, 0 rounded-xl, 0 ring, ic-tiles transparents, 0 erreur. Arêtes angle-droit = œil user (React Flow ne rend pas en pane masqué).

> ### ⚑ v169 (12/08) — Règle icônes appliquée AUX PAGES : glyphe nu (sans fond) + une couleur par icône dans une section
> User : « la règle des icônes est passée où ? des icônes ont un fond, la même couleur ; chaque icône = une couleur, SANS fond » — donc partout, pas juste le menu.
> - **SANS FOND (global, 1 seule règle CSS)** : `global.css` `.ic-tile` = `background: transparent; border: 0` (garde `color: var(--ic)`). Les **~34 usages `.ic-tile ... border bg-card`** sur 23 fichiers deviennent des **glyphes colorés nus** d'un coup, sans éditer chaque page (la taille/centrage du wrapper restent = boîte invisible, alignement préservé).
> - **Menu sans boîte** : `SiteHeader` — carte active non-Labs, carte grisée (désactivée) et `MobileItem` : retiré `bg-card`+`border` → glyphe seul. Labs garde son cadre spécial (image + voile).
> - **UNE COULEUR PAR ICÔNE DANS UNE SECTION** : le vrai manque = `hueFor` colorait par FAMILLE → une section thématique (SECURITY = ambre, ANALYTICS = cyan) répétait la teinte. Cassé les 2 familles les plus denses **globalement** (`site-icons.ts`, +`purple`/`red`) : data → `Gauge teal · TrendingDown orange · Radar sky · CalendarRange sky` ; gouvernance → `Lock rose · KeyRound orange · EyeOff slate · Pencil/PenLine purple · TriangleAlert rose · CalendarCheck emerald`. « Même icône = même couleur » conservé (change partout où l'icône apparaît).
> - Vérifié LIVE (restart) : Analytics 6 icônes **6 couleurs distinctes** + fond absent ; Integrations 7 icônes **7 distinctes** + fond absent ; menu inchangé (Product 8 / Resources 7 distincts).
> - **Reste** : la famille build (bleu, ex. FileText/Terminal/GitBranch) peut encore se répéter dans une section très « code » — à désambiguïser **au cas par cas pendant la revue page-par-page** (pas de shuffle global aveugle : risque de nouveaux clashs + perte de cohérence). Règle actée : sur chaque page, vérifier qu'aucune section ne répète une teinte d'icône.

> ### ⚑ v168 (12/08) — Home : 2 trous gris comblés + règle icônes (début de la revue page-par-page)
> User (revue page par page, commence par Home) : « combler le trou gris à droite en étirant le contenu (1 ligne 1 colonne), autre trou 2e screen, appliquer la règle des icônes même dans les pages ».
> - **`home/WhatShipsToday.astro`** — le « socle Live » (Hosted in the cloud… + chips) était `lg:col-span-2` dans une grille `TraitGrid cols=2` = `sm:grid-cols-2`. Donc **640→1024px : span 1 seule colonne → moitié droite grise**. Fix : **`sm:col-span-2`** (pleine largeur dès que la grille est à 2 col). + cartes ACTS : hex en dur (`ic:"#2563eb"/"#7c3aed"`) → **`hueFor(a.icon)`** (source unique, règle icônes).
> - **`home/Showcase.tsx` `TeamGrid`** — grille `sm:grid-cols-2 lg:grid-cols-3` avec **3** cartes → à `sm` (640–1024) la 4e cellule est **grise**. Fix : **`sm:grid-cols-3`** (3 cartes = 1 rangée pleine à tous les breakpoints ; mobile reste 1 col).
> - Vérifié DOM : socle `sm:col-span-2` (plus de `lg:`), eng = 3 cartes `sm:grid-cols-3`, ic-tiles ACTS #2563eb/#7c3aed, 0 erreur.
> - **Règle (piège col-span)** : une cellule pleine largeur dans une grille `bg-border` doit avoir son `col-span-N` au **même breakpoint** que le passage à N colonnes (`sm:grid-cols-2` → `sm:col-span-2`, pas `lg:`), sinon trou gris dans la plage intermédiaire. Et 3 items → `sm:grid-cols-3` (jamais `sm:grid-cols-2` qui laisse un trou).
> - **Revue page-par-page lancée** : Home ✓. Reste à balayer les autres pages pour les 2 mêmes défauts mécaniques (grilles `bg-border` non remplies + `--ic` en dur au lieu de `hueFor`).

> ### ⚑ v167 (12/08) — Icônes du menu : une couleur PAR icône + glyphe seul coloré (pas de fond teinté)
> User : « dans la sidebar des icônes ont la même couleur que d'autres ; une couleur PAR icône, et juste l'icône, pas le bg ».
> - **Cause 1 (couleurs qui se répètent)** : `hueFor` colorait par FAMILLE sémantique → plusieurs icônes d'un même dropdown partageaient une teinte. → **`site-icons.ts`** : +7 teintes (`indigo/fuchsia/pink/teal/sky/orange/green`) et **réassignation SINGULIÈRE** des icônes de menu pour qu'aucun panneau n'ait deux fois la même. Product(8) : Workflow bleu·Bot violet·ShieldCheck ambre·Brain fuchsia·Sparkles rose·Users vert·BarChart3 cyan·Plug indigo. Resources(7) : BookOpen sky·Newspaper ardoise·GraduationCap émeraude·History orange·Map bleu·FlaskConical (fiole spéciale)·Activity rose. Même icône = même teinte partout (contenu inclus) → cohérence conservée.
> - **Cause 2 (bug caché)** : `BarChart3` est un **alias Lucide** → son `displayName` réel est `ChartColumn` (svg `lucide-chart-column`), absent de la map → **repli bleu silencieux** = la collision. Mappé `ChartColumn: HUE.cyan` (garde `BarChart3` aussi). ⚠️ règle : un alias Lucide non mappé retombe sur le fallback bleu → toujours vérifier le `lucide-*` du svg.
> - **Cause 3 (le fond)** : les icônes de menu étaient dans une tuile `.ic-tile` (fond teinté). → **`SiteHeader.tsx`** desktop `MenuCard` + mobile `MobileItem` : `ic-tile` → **`bg-card` neutre** (glyphe seul coloré via `hueFor`) ; retiré le `--ic` du wrapper + import `CSSProperties` devenu inutile. Interprétation : « pas le bg » = ne pas COLORER le fond (tuile neutre conservée pour l'alignement, pas supprimée).
> - Vérifié LIVE (menu ouvert au DOM, île React → `docker restart`) : Product 8 couleurs distinctes, Resources 7 distinctes, `tintedBg:false` partout, `chart-column` = cyan. Ripple contenu (Plug indigo sur /integrations, etc.) confirmé sans erreur.
> - ⚠️ **Dette** : le miroir `ICON_COLOR` dans `flows/OrchestrationFlows.tsx` (dots des flux) n'a PAS été resynchronisé sur ces nouvelles teintes — hors périmètre « sidebar », à faire si on veut l'alignement flux/menu.

> ### ⚑ v166 (12/08) — Roadmap + Changelog refaits « style Vercel » (variés, honnêtes, sans trou)
> User (review) : « Roadmap comme Vercel, Changelog pareil Vercel ». Contrainte D11 : AUCUNE date inventée (pré-lancement).
> - **`changelog/index`** : ancien = groupes maturité en puces. Refait en **FEED deux colonnes** (méta `area` à gauche · titre+desc à droite), filets `divide-y`, groupé Live/Beta/Planned (dot émeraude/ambre/violet). Pas de dates → note « dated entries begin at GA ». Contenu enrichi (area + desc par capacité). 9 entrées.
> - **`roadmap`** : ancien = 3 cartes bordées Now/Next/Later. Refait en **phases timeline** : chaque colonne = **bord haut coloré** (`border-t-2` émeraude/ambre/violet) + compteur + liste en filets `divide-y`. Remplacé `bg-indigo-400` (hors palette) par violet. Cross-links hero → changelog/roadmap.
> - **Variété assurée entre les 2 pages** : Changelog = feed vertical 2 colonnes ; Roadmap = 3 colonnes phases à bord coloré. Zéro cellule grise (listes `divide-y`, colonnes indépendantes → bas blanc, pas gris). Carrés, chips ronds, hero centré (hérite v165).
> - Vérifié DOM (.astro, recompile à chaud) : changelog 3 groupes + 9 rows + note no-dates + `rounded-2xl` 0 ; roadmap 3 colonnes edges emerald/amber/violet, compteurs 5/3/3, 3 listes divide-y, `rounded-2xl` 0. Pane masqué → DA visuelle = œil user.
> - **Bilan review** : items « gros » de la review du 06/08 tous traités (CTA radius, trous, menu icons, double-dots, link-hover, Enterprise/Plane, Pricing screen-4, Trust, Solutions, menu mobile Attio, /solutions=miroir menu, Analytics toasts, Integrations Claude+hub business, hero centré, Roadmap/Changelog Vercel). Reste volontairement minimal : `VerticalDetail` (gabarit honnête), + skips (docs/learn/status/blog/legal/SEO/i18n).

> ### ⚑ v165 (12/08) — PageHero centré par défaut (règle « rien de démonstratif → centré » + mobile)
> User (review) : « le hero, si y a rien de démonstratif, mettre le contenu centré, + sur mobile ».
> - **`PageHero.astro`** : défaut `align` **`left` → `center`**. Les héros internes n'ont pas de visuel latéral (le `<slot/>` est un visuel EN DESSOUS, une seule page l'utilise = brain-os, déjà `center`). Donc basculer le défaut centre les 24 héros sans visuel d'un coup, mobile inclus (eyebrow/CTA passent `justify-center`). Aucune page à éditer (le seul `align` explicite sur un PageHero = brain-os center ; le `align="left"` de `approvals` était sur un **BorderedGrid**, pas le hero).
> - Vérifié : `/product/agents` `/product/integrations` `/solutions` `/product/brain-os` → tous `mx-auto max-w-3xl text-center`.
> - **Règle** : une future page qui glisse un visuel de hero via `<slot/>` peut repasser `align="left"` ; sinon on laisse le défaut centré.

> ### ⚑ v164 (12/08) — Integrations : catalogue « style Claude sans trou » + hub graph business
> User (review) : « Integrations, un truc style Claude, sans trou » + « le graph est cool, mets des tools business au lieu de full tech ».
> - **`IntegrationCatalogue.tsx`** : la grille passait par la technique traits `gap-px bg-border overflow-hidden rounded-2xl` → **cellules grises** en fin de rangée (= les « trous ») + coins arrondis (pas carré). Refait **façon Claude** : `grid gap-2.5` + **tuiles individuelles carrées bordées** (`bg-card border`, `h-full`) → rangée incomplète = **blanc**, jamais gris ; empty-state dé-`rounded`.
>   - `FEATURED` recalé à **12** (LCM 2·3·4 → remplit 2/3/4 colonnes, zéro rangée bancale) avec **mix business** (Salesforce/Stripe/Shopify/Google-Drive) + ancrages prouvés (github/slack → marqueur Actions) ; tous les logos existent sur disque (vérifié `public/logos/`, sinon repli initiales géré).
> - **`OrchestrationFlows.tsx` `IH_TOOLS`** (hub radial) : `linear/postgres/anthropic` (full tech) → **`salesforce/stripe/shopify`** (CRM/paiement/e-commerce) ; on garde 1 ancrage dev (github) + slack + notion. Positions/handles/arêtes inchangés (le graph validé). Logos business dispo : salesforce, stripe, shopify, slack, notion, zoom, google-drive (⚠️ pas de hubspot/attio/jira/monday/plane sur disque → éviter en featured/hub).
> - Vérifié DOM (2 îles React → `docker restart`) : grille `gap-2.5` sans `bg-border`, tuile `bg-card border`, **12** featured, brands business présents, `rounded-2xl` **0** ; hub monté = [github, salesforce, slack, stripe, notion, shopify], tous logos résolus. Arêtes React Flow non vérifiables (pane masqué) = œil user, mais inchangées.
> - **Règle** : un **catalogue/annuaire** = tuiles carrées bordées + `gap` (jamais la grille `gap-px bg-border`, qui laisse des trous gris dès que le compte ne remplit pas la rangée). La grille traits `bg-border` reste pour les sections de features à compte maîtrisé.

> ### ⚑ v163 (12/08) — Analytics : les 2 « toasts/modal » flottants → panneaux carrés intégrés (DA traits)
> User (review) : « Analytics faudrait refaire les sortes de toast là ou modal ». Deux cartes flottantes cassaient la DA « traits intégrés » (radius + ombre = look toast/modal posé sur le blanc).
> - **`DeliveryInsights.tsx`** (bloc « sent back by checkpoint ») : root `rounded-2xl border shadow-lg` → **`border`** (carré, hairline, **sans ombre**). Contenu/anim inchangés (substance validée) — seul le cadre était faux.
> - **`product\analytics`** mock « Ask in plain English » : `rounded-2xl border shadow-sm` → **`border`** carré + **refait pour se lire comme une surface produit**, pas un toast : (1) barre de **prompt** façon champ de saisie (Sparkles teinté + `CornerDownLeft`), (2) réponse « Rendered from your board » avec **point live `tf-pulse`** émeraude, (3) **garde-fou** en pied (`Info`) montrant concrètement « pas dans tes données → il le dit et suggère autre chose » (illustre le §honnêteté au lieu de le répéter).
> - Vérifié DOM (île React → **`docker restart` obligatoire** avant vérif) : les 2 panneaux = `bg-card overflow-hidden border`, `rounded-2xl` **0**, prompt+rendered+pulse+guardrail présents. Les `shadow-*` restants = uniquement boutons shadcn (`shadow-xs`, baseline site). Pane masqué → DA visuelle = œil user.
> - **Règle** : un mock produit sur le site = panneau **carré + hairline + sans ombre** (jamais radius+shadow facon toast/modal flottant) ; chips/barres ronds OK.

> ### ⚑ v162 (12/08) — Page `/solutions` = miroir du menu (navigabilité : By use case + Compare)
> User : « dans /solutions y a pas tout ce que le menu contient, je peux pas naviguer ». La page n'exposait QUE « By team » ; le menu Solutions a 3 groupes → les use-cases et comparaisons étaient injoignables depuis le hub.
> - **`solutions\index`** : ajout de **2 sections** dérivées des sources uniques (`use-cases.ts`, `comparisons.ts`), zéro chaîne dupliquée.
>   - **By use case** — structure LISTE (distincte des cartes) : index 2 colonnes, style traits (`border-t` + cellules `border-b`, **pas de `bg-border`**) → 10 items = 5/colonne, **zéro cellule grise**. Icône colorée par use-case (`UC_ICON` → `hueFor`) + **chip de maturité rond** (`MATURITY_LABEL` : 4 Beta / 6 Planned) + « See all use cases in detail » (`/use-cases`).
>   - **Compare** — fond `bg-dots` (variété) + **2 sous-grilles de largeurs différentes** : Trackers (4 → `lg:grid-cols-4`, remplit) et Coding agents (2 → `sm:grid-cols-2`, remplit) ; reflète EXACTEMENT les 6 du menu (jira/linear/notion/shortcut + claude-code-alone/devin), mène par `goodAt[0]` (règle fair-play). « See all comparisons » (`/vs`).
> - Variété page respectée : By team (cartes) → By use case (liste) → Compare (2 sous-grilles, dotted) → Why the pattern travels (prose centrée). Chips ronds, conteneurs carrés, teintes sémantiques.
> - Vérifié DOM (pane masqué → pas de screenshot, DA visuelle = œil user) : 4 eyebrows, 10 use-cases (6 Planned/4 Beta), Compare = [Jira,Linear,Notion,Shortcut]+[Claude Code alone,Devin] **0 cellule vide**, les 2 « See all », ic-tile #2563eb (coloré), aucun overlay d'erreur Astro.
> - **Règle** : une page-hub (`/solutions`, `/product`, `/use-cases`, `/vs`) doit **refléter les groupes de son méga-menu** — sinon on ne peut pas naviguer depuis la page.

> ### ⚑ v161 (09/08) — Menu mobile = COPIE FIDÈLE du desktop (groupes + view-all + footer)
> User : « en mobile j'ai pas “All solutions”, et sur Solutions j'ai pas tout — c'est un copier-coller du desktop ». Mon accordéon avait APPAUVRI le contenu (`SOLUTIONS_GROUPS.flatMap(g=>g.links)` → perte des titres de groupe, des « view all » par groupe et du « All solutions »).
> - `MobileAccordion` refait : prend des **`groups` {title?, items, viewAll?}** + un **`footer`**. Product → groupes Platform/Delivery + « Explore the platform ». Solutions → les 3 groupes (By team/By use case/Compare) + « view all » par groupe + « All solutions ». Resources → ses items. `MobileItem` extrait (icône colorée + label + badge/desc, ou label seul).
> - Vérifié DOM (scopé au dialog mobile — ⚠️ le trigger DESKTOP reste dans le DOM même caché en `lg:hidden`, ne pas le confondre) : Solutions mobile = 3 groupes, 25 liens, les 3 « View all » + « All solutions ». Build OK (68).
> - **Rappel process** : pour vérifier un composant responsive au DOM, SCOPER au `[data-slot="sheet-content"]`/dialog (sinon on lit le nav desktop caché).

> ### ⚑ v160 (09/08) — Solutions : hiérarchie proven/exploratoire + traits
> User : « mieux présenter Solutions, les sections se ressemblent ; l'améliorer à fond ».
> - **`solutions/index`** : la grille « By team » (5 cartes flottantes à plat, proven+exploratoires mélangés, compte impair) devient une **hiérarchie** : **Engineering (proven) MIS EN AVANT** (bloc large, tint `bg-primary/[0.03]` + bordure primaire + « Explore engineering ») ; les **4 exploratoires en traits** (`lg:grid-cols-4` → remplissent, 0 trou). Distinction visuelle proven vs exploratoire.
> - **`solutions/engineering`** : « Fits your stack » (4 cartes flottantes) → traits edge-to-edge.
> - `VerticalDetail` (4 pages exploratoires) laissé tel quel (gabarit honnête et volontairement minimal). Comparaisons (vs) déjà variées en v153.
> - Vérifié DOM : bloc featured (bordure/bg primaire), 4 cellules exploratoires. Build OK (68).
> - **Reste** : Analytics (toasts) + Integrations (catalogue « style Claude »), Hero centré (pas de visuel + mobile), Roadmap/Changelog (Vercel).

> ### ⚑ v159 (09/08) — Header mobile façon Attio + Trust (fonds gris, trous, variété)
> - **Header mobile → overlay PLEINE PAGE + accordéon** (façon Attio) : `SiteHeader.tsx`, Sheet `w-full` (plus `sm:max-w-sm`), `MobileGroup` (colonne à plat) remplacé par `MobileAccordion` (Product/Solutions/Resources repliables, chevron, sous-liens à **icônes colorées** via hueFor) + `MobileLink` (Pricing/Enterprise/Trust/Book a demo). État `section` (un ouvert à la fois). Vérifié : overlay 375px, 3 accordéons, Product déplié = 8 sous-liens à icônes.
> - **Trust — 3 corrections** :
>   - **Trous dans les grilles** (screen 2 : LIFECYCLE 7 items en `grid gap-px bg-border` → 1 cellule VIDE grise). ⇒ **règle** : une grille à filets `bg-border` montre du GRIS dans les cellules non remplies. Fix : les grilles à compte IMPAIR (SEC_PRINCIPLES 5, SDLC 7, LIFECYCLE 7) passent en **listes à filets** (`grid gap-x-10 border-t` + cellules `border-b`, pas de `bg-border`) → 0 cellule vide + variété. Les grilles qui REMPLISSENT (AI_GOV 6, AVAILABILITY 4, GLANCE 14) restent en traits.
>   - **Fonds gris** : `bg-secondary/40` des schémas (frontière + flux) → `bg-card` (blanc, distinction via bordures/labels) ; pastilles `TONE.planned/none` `bg-secondary` → `bg-card` ; **hero Trust `band` (gris) retiré** → blanc. Vérifié : hero blanc, seule section non-blanche = la CTA (exception).
>   - **Variété** : mix listes / grilles pleines / 2 schémas / cartes comparatives 2-col / table glance / rythme de points → plus le même pattern partout.
> - Build OK (68). **Reste** : Solutions & comparaisons, Analytics/Integrations, Hero centré, Roadmap/Changelog.

> ### ⚑ v158 (09/08) — Trust : cohérence DA + rythme (le contenu, déjà exhaustif/honnête, gardé)
> User : « Trust à refaire selon ce qu'on veut communiquer ; j'aime le style de graph que t'as mis, réutilise-le pour la démo visuelle (schémas en composants shadcn, hors workflow) ». Le contenu Trust est déjà un vrai portail sécu honnête → je n'ai pas réécrit le fond, j'ai réglé le vrai souci = **répétition/mur de blanc** :
> - **4 grilles de cartes flottantes → traits** edge-to-edge (SEC_PRINCIPLES, AI_GOV, SDLC, AVAILABILITY).
> - **Rythme de fonds** : `bg-dots` sur 4 sections espacées (AI-gov, Data lifecycle, SDLC, Availability) ; les 2 sections à **schéma** (frontière de confiance self-host + flux de données) restent BLANCHES pour les mettre en valeur. 0 double-points.
> - Les 2 **schémas en composants** (le « graph » validé) gardés tels quels — c'est le modèle à réutiliser ailleurs pour la démo visuelle hors-workflow. Les blocs 2-col comparatifs (recorded/hands, protège/responsabilité, current/building) gardés en cartes (pattern distinct voulu). CTA arrondie.
> - Build OK (68). ⚠️ **En attente** : si le user veut changer le MESSAGE (ce qu'on communique), me le préciser — là j'ai fait la cohérence visuelle, pas une réécriture du fond.
> **Suite** : Solutions & comparaisons (améliorer le pattern), Analytics (toasts) + Integrations (catalogue), Hero centré, Roadmap/Changelog (Vercel).

> ### ⚑ v157 (09/08) — Pricing repris sur le style de l'app (screen 4)
> `PricingSection.tsx` : cards de plan **arrondies** (`rounded-2xl` — exception radius pricing/CTA), tier featured en **panneau bleu clair** (`bg-primary/[0.03]` + badge « Most popular »), checks de features en **pastille `CircleCheck` bleu de marque** (au lieu du check émeraude plat). Toggle Monthly/Annual + 4 tiers conservés ; contenu marketing gardé (on adapte le STYLE, pas le contenu app). Vérifié DOM : 4 cards radius 16px, featured teinté, 27 `CircleCheck` `rgb(37,99,235)`. Build OK (68). Prochain : **Trust**.

> ### ⚑ v156 (09/08) — Enterprise : 3 retours post-review + règles pour la suite
> User : « pas mal du tout ». 3 fixes :
> - **Diagramme d'archi overflow** : le fan `EnterpriseStackFlow` (large) débordait dans la demi-colonne du FeatureSplit → section 1 passée en **texte 2-col + diagramme PLEINE LARGEUR** (vérifié : canvas 1158px). ⇒ **règle** : un flow/diagramme large ne va PAS dans une demi-colonne, le mettre pleine largeur.
> - **Specs irréalistes** (4 Go RAM ne fait pas tourner de modèle) → specs **conscientes des modèles** : `2+ vCPU (plateforme)` · `4 GB (TaskForce)` · `16 GB+ (modèles locaux Ollama)` · `GPU (gros modèles)` + note « les besoins réels dépendent des modèles ».
> - **Motif stripe chevauché** par le titre → `padding-top` de la section augmenté (`lg:pt-40` = 160px). ⇒ **règle** : les sections texturées (stripe/points) denses en haut prennent plus de padding-top.
> Build OK (68). Prochain : **Pricing** (style app).

> ### ⚑ v155 (09/08) — Header responsive + Enterprise refait « à fond » (réf. Plane)
> - **Header non responsive** (la « sidebar » = le header, screen 5 : « Get started » tronqué en « Get » au-dessus de 900px) : bascule desktop remontée `min-[900px]` → **`lg` (1024px)**. En dessous = menu hamburger (qui contient tout). Nav + Pricing/Trust + Sign-in n'apparaissent qu'à ≥1024.
> - **Enterprise réécrit** (`enterprise.astro`) d'après plane.so/self-hosted + /solutions/enterprise-teams — casse la suite de grilles quasi identiques :
>   - **2 FeatureSplits alternés** (texte + visuel) : « Run inside your walls » (+ diagramme d'archi `EnterpriseStackFlow` remonté ici) · « A human on every step » (+ **schéma “Decision record”** en COMPOSANTS — pas un workflow : carte bordée, pastille Approved, lignes approved-by/model/audit/scope).
>   - **Bloc environnement + specs concrètes** (2 vCPU · 4 Go · 20 Go · Docker) en bande de chiffres.
>   - Controls (traits denses) · Security **2-col + 3 cartes compliance** (bg-striped) · Adoption **stepper** (bg-dots) · **FAQ** (nouveau bloc, objections acheteur).
>   - **Fondu/supprimé** : grilles « Why Enterprise » (pillars), « Why TaskForce » (→ FAQ), « Deploy your way » (→ specs), section Architecture isolée (→ split 1).
>   - Rythme de fonds varié, 0 double-points, CTA re-arrondie (radius). Vérifié DOM : 2 splits, decision-record, FAQ, specs, 5 nœuds diagramme, 0 double-dots. Build OK (68).
> - **Confirmé** : les schémas de démo HORS workflow se font en **composants** (shadcn/HTML), pas forcément en React Flow (feu vert user). Ordre de la file d'attente validé → **prochain : Pricing** (style de l'app : toggle, checks colorés, « Populaire », cards arrondies).

> ### ⚑ v154 (09/08) — Review site (lot 1 : corrections globales rapides)
> Grosse review user. **Fait ce tour (global, vérifié DOM)** :
> - **CTA re-arrondies** : `PageCta` + `FinalCta` + CTA enterprise → `rounded-3xl` rendu (user : « laisse un radius aux CTA comme avant »). Exception : CTA + (bientôt) pricing gardent un radius ; le reste des conteneurs reste carré.
> - **Double trame de points** : Smart Assign avait une section `bg-dots` CONTENANT un `flow-canvas` (déjà à points) → `bg-dots` retiré de la section. Règle : jamais 2 trames à la fois (blanc + points OU blanc + stripe, pas les deux). Les autres sections `bg-dots` ne contiennent pas de flow-canvas → OK.
> - **Icônes des dropdowns du menu colorées** (`SiteHeader.tsx`) via `hueFor`. ⚠️ piège : le `<a>` shadcn/Radix a `[&_svg:not([class*='text-'])]:text-muted-foreground` qui force le gris → couleur mise **inline sur l'icône** (`style={{color:hueFor(Icon)}}`), l'inline bat le sélecteur. Vérifié : bleu/violet/ambre/ardoise.
> - **Trou vide dans les cards** (`BorderedGrid cols={3}`) : 3 items au palier `sm:grid-cols-2` = 1 cellule VIDE grise → colClass `md:grid-cols-3` (1→3, jamais 2).
> - **Souligné de lien qui court jusqu'au bord de la card** : `link-underline inline-flex` étiré par un parent `flex flex-col` → fix GLOBAL dans `.link-underline` : `width: fit-content` (largeur texte, reste centré si le parent centre, ignoré sur les liens inline). + `PricingSection` : `underline underline-offset-4` → `.link-underline`.
> - Build OK (68).
>
> **File d'attente (gros re-designs, tours suivants)** — réf. à récupérer via WebFetch quand j'y suis :
> - **Enterprise à refaire à fond** (moins de répétition) façon Plane : plane.so/self-hosted + plane.so/solutions/enterprise-teams.
> - **Trust à refaire** selon le message à faire passer ; le style de graph que j'y ai mis est validé → réutiliser des **schémas en composants shadcn** pour la démo visuelle (hors workflow).
> - **Pricing** : reprendre le style du **screen app** (toggle, checks colorés, badge « Populaire », cards arrondies) — adapter au marketing.
> - **Solutions** & **comparaisons (vs)** : améliorer le pattern à fond (sections trop semblables).
> - **Analytics** : refaire les toasts/modal (pas la bonne DA). **Integrations** : le catalogue (pas le hub, qui est validé) « style Claude, sans trou » ; + mettre des outils **business** (pas full-tech) dans le hub.
> - **Hero** : centrer le contenu quand pas de visuel démonstratif à côté + en mobile (sinon 2-col OK).
> - **Roadmap / Changelog** : modèle Vercel (copywriting à documenter).
> - **Sidebar non responsive** : à localiser + corriger.
> **SKIP (plus tard)** : docs, learn, status, blog, placeholders de screens, légal/RGPD/RGAA/WCAG/sitemap/SEO, i18n (full EN pour l'instant). **Rappel** : 1 couleur par icône, mêmes couleurs pour mêmes icônes (`hueFor`).

> ### ⚑ v153 (09/08) — Variété (lot 2) : The run (timeline horizontale) + vs (rythme, 9 pages)
> - **The run** (`home/TheRun.astro`) : utilisait `HeroFlow` (pipeline VERTICAL) = le même que la page orchestration → répétition inter-pages. Remplacé par une **timeline HORIZONTALE** (`StepChainFlow dir="h"` : Outcome → Frame&spec → Approach(highlight) → Plan → Ship), pleine largeur sous le texte, les 3 garanties passées en 3 colonnes. Vérifié DOM : 5 nœuds, layout horizontal.
> - **vs** (`VsCompare.astro`, partagé → 9 pages) : les 2 sections « Credit » et « What TaskForce adds » étaient des LISTES à puces identiques. « adds » passe en **grille à traits 2-col + fond à points** ; « Credit » reste une liste simple ; le **tableau côte-à-côte** (le miroir them/us) reste. → les deux ne se ressemblent plus. Vérifié DOM : 1 liste + 1 grille traits + 1 tableau, 1 section à points, 0 radius.
> - Build OK (68). **Reste** : pages produit (orchestration, agents, analytics, approvals, collaboration, brain-os) — mêmes principes (forme distincte + rythme de sections).

> ### ⚑ v152 (09/08) — Variété (lot 1) : Smart Assign (nouveau graphe) + Enterprise (rythme de sections)
> User : « on y va » (rollout variété). Formes distinctes + fonds/layouts/intérieurs qui varient.
> - **Smart Assign** : chaîne verticale `RoutingFlow` → nouveau **`SmartAssignFlow`** = CONVERGENCE + fan-out (3 signaux Skills/Load/Availability → « Weigh & match » → 3 candidats, le choisi « Best match » en vert). Layout changé : 2-col texte/signaux PUIS graphe **large pleine largeur** (avant : colonne étroite à droite). Vérifié DOM : 7 nœuds, ports OK, carrés.
> - **Enterprise** : le flow était déjà varié (fan) mais **8 sections quasi identiques** (« titre + grille de cartes ») = le « même pattern dans une page ». Corrigé :
>   - **rythme de fonds** : `bg-dots` (Built-for-env, Adoption) + `bg-striped` (Architecture), le reste blanc.
>   - **grilles de cartes flottantes → traits** edge-to-edge, **largeurs variées** (piliers 2-col · env 5-col · why 4-col · deploy 3-col · steps 4-col).
>   - **intérieur varié** : numéros d'étapes Adoption en **gros display** (26px) au lieu du petit mono.
>   - **CTA nettoyée** : `rounded-3xl` + **halo blur** retirés (restaient) → carrée, sans halo. Vérifié DOM : 0 `rounded-2xl/3xl`, 0 `blur-3xl`, 5 grilles traits, 3 sections texturées.
> - Build OK (68). **Reste** : vs (split/miroir), The run (timeline), pages produit (orchestration/agents/analytics/approvals/collaboration/brain-os) — mêmes principes.

> ### ⚑ v151 (09/08) — « Cards carrées » généralisées (y compris les nœuds de flux + les canvas)
> User : « les cards carré c'est parfait, faut le généraliser — même les cards des workflow ». + la variété passera aussi par les fonds de section (stripe/traits/rien), l'intérieur et le layout.
> - **Nœuds de flux carrés** (`OrchestrationFlows.tsx`) : `StepNode`/`MiniNode`/`CtxNode`/`RunStepNode`/`HubNode` — `rounded-lg/xl` retiré. Les puces d'icône internes restent arrondies.
> - **Canvas de flux carrés** : `rounded-xl` retiré des 9 `flow-canvas` (approvals, brain-os, integrations, Hero, WhatShipsToday, TheRun, Synergy, Before/After ×2) + `Panel` carré.
> - **Nouvelle règle DA** : *angles vifs partout (conteneurs), chips ronds* — l'ancienne exception « radius = flux only » tombe (le user préfère tout carré). Feuille de règles §2/§4 à jour. Vérifié DOM : nœuds + canvas = `border-radius 0`. Build OK (68).
> - **Suite (variété)** : rollout formes distinctes + traitements de section variés (bg-dots/bg-striped/rien, traits ou pas, layouts différents) — Enterprise → Smart Assign → vs → The run…

> ### ⚑ v150 (09/08) — Variété des flows : hub radial custom (Integrations) + fix border « The direction »
> User : « toutes les pages se ressemblent trop, pas de variation dans les workflows (ex. integrations pas bonne) ; le but = illustrer l'IDÉE, pas le réel → tu peux faire des flow/graph CUSTOM ; plus d'insight ; ne pas copier le même pattern d'une page à l'autre NI dans une même page. Fais un passage. » + « The direction : enlève le border autour, garde juste les traits entre points ».
> - **Fix `WhereThisGoes`** : `border-y`+`lg:border-l` retirés → il ne reste que `divide-y` (traits entre items). Plus de cadre.
> - **Nouveau type de nœud `HubNode`** (kit) : cœur (TaskForce/Memory, highlight) OU outil connecté (**vrai logo** via `BrandLogo`). Pour des graphes RADIAUX — une FORME différente des chaînes.
> - **`IntegrationsHubFlow`** (remplace la chaîne verticale `IntegrationsFlow` sur `product/integrations`) : hub radial, cœur au centre + 6 outils (github/linear/slack/postgres/notion/claude) qui s'y connectent (arêtes droites, flèches vers le cœur). Illustre « connecter ton stack », pas un pipeline. Légende insight « 129 connectors across 16 categories ». Vérifié DOM : 7 nœuds, 6 logos, 6 ports source + 4 cibles.
> - **Direction actée** : les diagrammes de la landing sont **illustratifs** (pas une repro fidèle du système) → on peut créer des formes custom (hub, matrice, orbite, timeline, split…). Objectif = **une forme distincte par page, jamais deux fois le même pattern dans une page**. Reste à décliner sur les autres pages (chaînes verticales répétées = `Agents/Analytics/Approvals/Routing/EngineeringRun/vChain`). Build OK (68).
> User : « repasse dans toutes les autres pages et applique les mêmes choses » (structure).
> - **Levier composants partagés (moi)** : `Panel` (`.surface`+`rounded-2xl` → `border rounded-xl`), `Bento` (`.surface`+`rounded-2xl` → `border`), `StatBand` (variant panel : `surface`+`decor-tint`+`rounded-3xl`+`decor-dots` → `border rounded-xl`, plus d'ombre/halo), `UseCaseDetail`/`VerticalDetail`/`VsCompare`/`ConnectorDetail` (bandes `bg-secondary` → blanc ; tableau vs sharp ; matrice + capacités connecteur → **traits**). → couvre use-cases/solutions/vs/connecteurs (~25 pages) d'un coup.
> - **Balayage pages (4 sous-agents // , spec conservateur : bande→blanc, retrait `.surface`/`shadow-*`/`rounded-2xl,3xl` sur cartes de contenu ; PAS de re-architecture traits ; laisser ui/illustrations/labs/mocks/chips/pills/CTA)** :
>   trust (8 bandes, 19 radius) · enterprise (4 bandes, 9 radius) · company/about+contact+media · book-a-demo (1 ombre) · docs · status · roadmap · blog · learn · changelog · solutions/index+engineering · use-cases/index · vs/index. **product/*** déjà conforme (rien à changer). Mocks inline (analytics), grosse tuile d'icône (collaboration) et bloc CTA correctement laissés.
> - **Cartes CTA sharp** : `PageCta` + `FinalCta` `rounded-3xl` → angles vifs (radius = flux only ; l'exception CTA ne porte que sur le fond gris). Grille logos Integrations `rounded-2xl` → sharp. Feuille de règles §5 mise à jour.
> - `FeatureBand` variant `tinted` (halo + `rounded-3xl`) = **code mort** (aucune page ne l'utilise) → laissé.
> - Build OK (68). Vérifié rendu (curl) : trust & enterprise = 0 bande grise de contenu, 0 `rounded-2xl/3xl`.
> - **Exclus (volontaire)** : `components/ui/*` (primitives shadcn), `illustrations/*` (mocks produit), `labs/*` (monde propre), mocks d'app (`AppShot`/`MockFrame`/`SpecPanel`/`ScreenPlaceholder`), chips `bg-secondary/60`, pills.
> - **`PricingSection.tsx` fait (suite)** : cartes de prix `rounded-2xl`+ombre+ring → angles vifs, carte « featured » emphasée par **bordure primaire** (`border-primary/50`) ; toggle facturation `shadow-sm` retiré ; colonne Pro `bg-secondary/20` du tableau → blanc ; 2 cartes Hosted/Self-hosted `rounded-2xl` → **traits** (`gap-px`). Vérifié rendu (`/pricing` 200) : contenu tarif = 0 radius/ombre (les résidus = shell header/footer + `ui/`, hors périmètre).

> ### ⚑ v148 (09/08) — Hero home refait : CENTRÉ + épuré (façon Linear/Relevance)
> User (capture, hero entouré) : « trop chargé ; le titre n'est même pas en haut, c'est le texte de droite qui passe au-dessus ; un hero mieux que ça, épuré comme Linear/Relevance ».
> - **Cause** : layout 2-col `lg:items-end` → la colonne droite (paragraphe + 2 boutons + 3 faits) plus haute et alignée en bas → son haut passait AU-DESSUS du H1. Trop d'éléments.
> - **Fix** : `Hero.tsx` passe en **une seule colonne centrée** (`mx-auto max-w-3xl text-center`) : eyebrow → H1 → une promesse courte (`max-w-2xl`, raccourcie) → 2 CTA (`pill-lg`) → logos centrés → le screen produit. **3 faits inline supprimés**. Vérifié DOM : ordre top eyebrow 176 < h1 213 < sub 356 < cta 442 < logos 546, h1 `text-align:center`. Build OK (68).
> - Honnêteté : la promesse décrit les actes réellement livrés (spec/plan/prompt + approbation + mémoire) sans revendiquer le « full governed run » ; la nuance « today / headed » vit déjà en aval (WhatShipsToday, TheRun).

> ### ⚑ v147 (09/08) — Généralisation des couleurs d'icônes à TOUT le site (source unique `hueFor`) + puce Cpu agrandie
> User : « tous les icônes stp (dont la puce “Hosted in the cloud…” aussi grosse que la hauteur du paragraphe) ; puis généralise à toutes les pages (structure, icônes, workflows) ».
> - **Source UNIQUE `src/lib/site-icons.ts`** : `hueFor(icon)` (teinte par `displayName` Lucide, 7 familles) + `HUE`. Miroir du `ICON_COLOR` du kit flux (hex alignés : `cpu`→violet, `scale`→cyan). → colorer n'importe quelle icône de contenu partout sans réécrire les data.
>   - Tuile : `.ic-tile` + `style={`--ic:${hueFor(Icon)}`}` (span natif, chaîne OK). Inline : `style={{ color: hueFor(Icon) }}` (**objet** — une icône Lucide est un composant React qui casse le build avec un `style` chaîne).
> - **Levier composants partagés** : `BentoCell` + `BorderedGrid` colorent via `hueFor` → toute page qui les utilise est couverte d'un coup. `ConnectorDetail` (matrice Connect/Remember/Act) idem.
> - **Balayage pages** (sous-agents parallèles, partition propre) : product ×12 · use-cases index · solutions index+engineering · enterprise · trust (9 inline) · blog · company/about · company/contact · `ConnectorDetail`. Sans icône de contenu (inchangés) : pricing, roadmap, learn, changelog, company/media, vs/* (Check/Minus = marques de tableau), use-cases/solutions détail (Info notice), Labs (identité propre, exclu). Chrome (flèches/chevrons/menu/croix/logos/`Info` légal) et puces `Check` laissés tels quels. Agents CPO/CTO/COO gardés (couleurs par rôle déjà voulues).
> - **Puce Cpu** (`WhatShipsToday`, « Hosted in the cloud… ») : passée `size-4`→`size-10`, violette → **40px pour un paragraphe de 42px** (vérifié DOM, ratio 0.95). Strip `TheRun` (Full audit trail / Self-hosted / Any coding agent / A model per step) : icônes en tuiles colorées.
> - **Bug corrigé** : les sous-agents (et moi) avaient mis `style={`color:…`}` (chaîne) sur des icônes Lucide → build cassé (React exige un objet). 9 occurrences repassées en `style={{ color: … }}`. Build OK (68).
> - Vérifié DOM : product/agents = tuiles cyan/ambre/bleu/violet/ardoise + inline colorés ; home Cpu 40px violet.
> - **RESTE (prochaine passe) — structure** : bandes `bg-secondary` alternées dans les gabarits détail (`UseCaseDetail`/`VerticalDetail`/`VsCompare`/`ConnectorDetail`), cartes `rounded-2xl` (matrice connecteur, tableau vs), `Panel` (`surface` ombre + `rounded-2xl`). Non touché ce tour (changement visuel large, non vérifiable en pane masquée) — à trancher/faire ensuite. Workflows : déjà React Flow partout (v130–v145).

> ### ⚑ v146 (09/08) — Couleurs d'icônes (palette sémantique) + micro-composants + section « The direction » en traits
> User (capture « The direction » validée) : « couleurs sur les icônes dans les workflows + plus d'insight (badge/loader/petit composant) + couleurs
> cohérentes sur les autres icônes + le petit tableau de 3, mieux l'intégrer : plus de lignes, **pas de rounded radius, c'est que pour les workflows** ».
> - **Palette sémantique `ICON_COLOR`** (`OrchestrationFlows.tsx`) : teinte par FAMILLE (bleu=build/spec · violet=IA/pensée · émeraude=livré ·
>   ambre=gouvernance · cyan=data · rose=rejet · ardoise=neutre). Alignée sur les `dot` déjà posés à la main. `StepChainFlow` la lit par défaut
>   (`dot ?? ICON_COLOR[icon]`) → **tous les flux pilotés par props se colorent** (Before/After, What ships, use-cases) sans toucher aux data.
>   `MiniNode` teinte alors la tuile (fond 12 %, filet 26 %) + l'icône. Vérifié DOM : icônes violet/ardoise/bleu/rose, tuiles teintées, highlight=bleu.
> - **Utilitaire `.ic-tile`** (global.css) : même recette que `MiniNode` mais HORS flux, réutilisable en `.astro`/`.tsx` via `style="--ic:#hex"`
>   (fond/filet/icône dérivés d'une seule teinte). Une seule source de vérité pour colorer une icône partout.
> - **Micro-composant `.tf-pulse`** : point « live » pulsé qui reprend `currentColor` → posé sur les badges Live de What ships (émeraude). Loader/badge « sympa », coupé en reduced-motion.
> - **Icônes colorées hors flux** : en-têtes What ships (bleu/violet), groupes Enterprise/Trust (ambre/bleu/cyan), lignes « The direction » (bleu/violet/ardoise).
> - **Section « The direction » (`Proof.tsx` → `WhereThisGoes`) en « traits intégrés »** : la carte `rounded-2xl` devient une liste `border-y divide-y` + **filet vertical** `lg:border-l lg:pl-14` qui la relie à la colonne intro. **Radius retiré (0px vérifié)**. Chaque ligne = tuile d'icône colorée + **numéro mono 01/02/03** + titre + texte.
> - **Nouvelle règle DA** : le rounded radius est **réservé aux canvases de flux** (`flow-canvas rounded-xl`) ; panneaux/cartes de section = **filets, angles vifs**. (Atomes — pills, boutons, tuiles d'icône — gardent leur petit radius.) Gravée dans la feuille de règles §2/§3.
> - Build OK (68). Reste à passer au crible : radius résiduels hors home (`Integrations` grid, `FinalCta` — section exception, à trancher), pages produit/enterprise.

> ### ⚑ v145 (08/08) — BUG racine : les ports de connexion des flux étaient INVISIBLES → corrigé (partout)
> User (5e rejet) : « les ronds de départ des flèches, y a rien de tout ça, je peux pas croire que c'est du React Flow ». **Vrai bug** : le composant
> `Handles` stylait les ports selon un flag `ring` ; or `StepChainFlow`/`vChain` ne mettaient JAMAIS `ring:true` sur leurs handles source → ils
> tombaient sur le style `tf-handle--target` (**1px transparent, opacity 0**) → aucun port visible. Les arêtes partaient d'un point invisible → ça
> passait pour une liste faite main. (Orchestration mettait `ring:true` via son helper `src()` → ports visibles → « ça, c'est React Flow ».)
> - **Fix racine** : `Handles` style désormais par **TYPE** (`h.type === "source"`), pas par un flag oublié. CSS : source = anneau bleu **11px bordure 2px**
>   + halo ; target = point **8px** (était invisible). → tous les flux du site montrent leurs ports.
> - Arêtes plus visibles (`strokeWidth` 1.5→1.75, marker 15→18) + espacement vertical `StepChainFlow` 74→90 (l'arête devient une ligne port→flèche).
>   Hauteurs des cellules Before/After + What ships alignées (×90).
> - Vérifié DOM (onglet home) : **22 ports source (11px, bordure `rgb(37,99,235)`) + 23 ports target (8px)**. (edges=0 = pane non affichée, connu.)
> - Feuille de règles §flux : **ports visibles obligatoires** (source=anneau, target=point) — sinon ça passe pour du fait-main.
> User (4 captures) : « t'utilises aucune lib ». Tranché : 2 des 4 n'étaient VRAIMENT pas React Flow → convertis ; les 2 autres l'étaient déjà
> (prouvé DOM) mais sans le **canvas à points** → elles ressemblaient à du fait-main.
> - **Graphe de décision → React Flow** : nouveau `DecisionGraphFlow` (Requirement → Decision(highlight) → Impacts + Rejected en pointillés).
>   Remplace le `DecisionGraph` SVG maison sur **home (Synergy)** et **brain-os**.
> - **RunTimeline → React Flow** : l'ancienne timeline animée maison (`client:idle`) remplacée par le run en RF (`HeroFlow`) dans **`home/TheRun.astro`**
>   (2-col texte/flow + puces + table des 7 checkpoints). Fini le dernier îlot `client:idle` du home → plus de risque de mismatch d'hydratation.
> - **Before/After + What ships today** : les flux posés sur **`flow-canvas`** (fond pointillé bordé) → se lisent enfin comme des canvas React Flow (comme orchestration).
> - **Home Synergy → `.astro`** (un composant React ne peut pas héberger un îlot `client:only`). `RunTimeline.tsx`/`DecisionGraph.tsx` devenus morts (laissés).
> - Résultat : home = **6 îlots React Flow** (Before/After ×2, What ships ×2, graphe décision, le run), tous `client:only`, + hero = screen d'app.
>   Build OK (68) ; **onglet neuf = 0 log console**. RunTimeline perd son animation (devient le run RF statique) — à confirmer si le user la regrette.
> User : « la CTA prend le bg du footer (pas blanc, c'est l'exception) ; peaufine le reste, workflows + cards ».
> - **CTA = gris du footer** (`bg-secondary`) — la SEULE section non-blanche. Footer = `bg-secondary` → la CTA fond dedans (transition douce).
>   `home/FinalCta` (`bg-card`→`bg-secondary`) ; `PageCta.astro` (déjà `bg-secondary`) → **`surface` (shadow) + halo retirés** → toutes les CTA
>   du site alignées. Exception consignée dans la feuille de règles (§1 + §5).
> - **Polish home** : `WhatShipsToday` migré sur `SectionShell` + `TraitGrid` (comme `BeforeAfter`).
> - **Mismatch d'hydratation `RunTimeline` = FAUX positif bufferisé** : `read_console_messages` ne vide jamais son buffer → l'erreur d'avant le
>   restart réapparaissait à chaque lecture. Vérifié dans un **onglet neuf** (buffer vierge) : **0 log**. Home propre. (Astuce : ouvrir un onglet
>   neuf pour un verdict console fiable, pas juste reload.)
> - Build OK (68) ; pages 200 ; halo PageCta = 0. **RESTE à peaufiner (au fur et à mesure)** : pages non-home encore en DA pré-refonte —
>   surtout `enterprise` (fonds gris + cards flottantes) ; balayer shadows/halos résiduels ailleurs.
> User a validé la feuille de règles (« ok go, on affinera au fur et à mesure »). Finalisation home :
> - **Conformité §1-§3** : Final CTA → halo (dégradé radial) retiré ; `RunTimeline` → shadow de la carte démo retiré + encart « Adaptive »
>   dé-cardé (gris `bg-secondary/40` → filet gauche). Home 100 % blanc, sans halo.
> - **Primitives DA sorties** : `sections/SectionShell.astro` (gabarit section blanc + container-rail + en-tête) et `sections/TraitGrid.astro`
>   (grille à filets edge-to-edge, `cols` 2/3/4). **Adoptées sur `home/BeforeAfter.astro`** (exemple canonique). But : ne plus recopier le gabarit
>   → fin des incohérences. Backlog : migrer les autres sections au fur et à mesure.
> - **Gotcha dev** : après avoir changé `<Section band>`→`<Section>` sur `RunTimeline` (îlot `client:idle`), mismatch d'hydratation
>   (SSR `bg-secondary` vs client `bg-card`) = **SSR du dev-server périmé**. Réglé par `docker restart taskforce-landing-dev` ; vérifié : le HTML
>   SSR a 0 section `bg-secondary`. En build statique le souci n'existe pas. (Note : éditer un îlot `client:idle` peut nécessiter un restart conteneur.)
> - Build OK (68) ; home 200. Feuille de règles = `.ai/landing-design-system.md` (à jour, §9 primitives cochées).
> User (frustré, à juste titre) : « à chaque fois t'oublies ou tu fais différent ». → Créé **`.ai/landing-design-system.md`** : le référentiel
> unique de la landing (7 lois : blanc-only, zéro shadow, zéro halo, traits intégrés, React Flow OBLIGATOIRE pour tout process, honnêteté D11,
> couleurs de marque) + gabarits + **inventaire des composants** + checklist de livraison. À lire avant toute modif ; on édite les règles ICI avant d'appliquer.
> - **Home tout blanc** : bandes grises retirées (`<Section band>` → `<Section>`) sur Problem, Synergy, TeamGrid, RunTimeline.
> - **Fait factuel tranché** : le Before/After **EST** React Flow (DOM : 4 conteneurs `.react-flow`, 19 nœuds) ; mais `rfEdges=0` dans la pane
>   d'automatisation **cachée** (RF met la mesure en pause hors-écran → arêtes non calculées). Chez le user (écran affiché) les flèches rendent
>   (sa capture le montre). ⇒ check visuel des flows = côté user, pas par screenshot. Consigné dans la feuille de règles (§4).
> - Build OK (68) ; home 200. **EN ATTENTE** : que le user valide/amende la feuille de règles (pour la verrouiller), puis finaliser le home
>   strictement dessus ; backlog DA : `SectionShell`/`TraitGrid` (arrêter de copier le gabarit à la main), encart interne de `RunTimeline`.
> User : « en dessous : libs + cards, sur les structures de base à traits » ; « tout d'un coup ». Écart réel à la DA = les **cards flottantes**
> (`rounded-2xl border`). Converties en **grilles à filets edge-to-edge** (`-mx-6 gap-px border-y bg-border`, cellules `bg-card`) :
> - `home/BeforeAfter.astro` + `home/WhatShipsToday.astro` : 2 cellules à filets (fini bg-secondary/40 + le panneau dégradé) ; le socle Live =
>   cellule pleine largeur. Flux RF inchangés dedans.
> - `Showcase.tsx` : **TeamGrid** (cards → grille à filets), **Synergy** (SYSTEMS contenu-rond → edge-to-edge ; bento du `DecisionGraph` dé-cardé).
>   `Section` utilise `container-rail` → le breakout `-mx` marche aussi dans les composants React.
> - `Proof.tsx` : **FinalCta** repassé en blanc (`bg-secondary` → `bg-card`).
> - **Gardés** (déjà à filets / éditoriaux / démos) : `Problem` (liste `border-l`), `Trust` (colonnes `border-t` + AppShot), `WhereThisGoes`
>   (grille à filets en colonne), `BrainTeaser` (bande fine), `RunTimeline` (la démo animée du run).
> - Build OK (68) ; home 200 ; 0 erreur console. **EN ATTENTE** : les **bandes grises** (`<Section band>` sur Problem/Synergy/TeamGrid/RunTimeline)
>   — le home était pensé en alternance blanc/gris ; à trancher avec le user : tout blanc (comme les pages produit) ou garder l'alternance.
> User : « on y va étape par étape, d'abord le home. Un screen de l'app au début, pas un workflow. Ensuite en dessous : libs + cards + structures
> à traits. » → **Revirement assumé** vs v137 (le hero était passé en React Flow). `index.astro` réimporte `home/Hero` (Hero.tsx, `SpecPanel` =
> vraie UI, SSR → LCP). `Hero.astro` (double-card RF) laissé dans le repo, non importé. Build OK (68) ; home 200 ; SpecPanel présent ; 0 `HeroFlow`
> dans le hero. **SUITE (à valider avec le user, section par section)** : les sections SOUS le hero → DA « traits intégrés » + React Flow / cards.
> User (capture Before/After) : ça fait fait-main ; « utilise les mêmes cards que le hero orchestration » (pas besoin de 21st.dev, je les ai
> déjà = `StepNode`), même système de lignes, sur TOUS les flows plats, **pas de shadow**.
> - **Composant partagé enrichi** — `MiniNode` (le nœud de tous les flows plats) rend maintenant une **tuile d'icône teintée + titre + sous-titre**
>   (la DA de la card d'orchestration). La couleur de rôle (`dot`) devient la teinte de la tuile ; fallback `Sparkles` si ni icône ni dot. Donc les
>   ~10 flows en `mini` deviennent des cards riches **d'un coup**, sans changer leur structure (la variété reste : verticaux / boucles / fourches).
> - **Zéro shadow** — `surface` (box-shadow « bordure + élévation ») → `border` sur StepNode/MiniNode/CtxNode/RunStepNode ; `.tf-node:hover`
>   ne met plus d'ombre (juste la bordure) ; `shadow-xl` retiré de la double-card du hero.
> - **Icônes ajoutées** à toutes les données de flow : Agents/Analytics/Approvals/Integrations/Routing/EngineeringRun (vChain), Brain OS &
>   Labs (boucles), ai-transparency (fourche), enterprise (archi). Labs élargi (LB_W 168→186) pour loger la tuile.
> - **Home (props → îlot client:only)** : `StepChainFlow` gagne une **map nom→icône** (`ICON_MAP`) car une `.astro` ne peut pas passer un composant
>   icône (non sérialisable) ; `BeforeAfter.astro` + `WhatShipsToday.astro` passent des noms d'icônes. `UseCaseRunFlow` garde ses nœuds numérotés (dé-shadow).
> - Build OK (68 pages) ; 0 erreur console (agents + home, buffer purgé) ; toutes les pages clés en 200.

> ### ⚑ v137 (07/08) — Home : le HERO passe en React Flow, dans la « double-card » façon orchestration
> User : « sur le hero du home tu utilises pas React Flow, c'est pas possible » + « remets mon template de card : le style double-card
> d'orchestration — une card blanche, une card à points dedans sur laquelle on pose le flow ».
> - **`home/Hero.tsx` (SpecPanel, fausse UI, SSR) → `home/Hero.astro`** : hero en **2 colonnes** (texte gauche | visuel droite), comme orchestration.
> - **Double-card** : card blanche extérieure (`rounded-2xl border shadow-xl`) → card intérieure **à points** (`flow-canvas`) → **`HeroFlow`**
>   (`client:only`, le run d'orchestration réutilisé = « le style de orchestration »). `aspect-ratio` réserve l'espace → pas de CLS.
> - **LCP protégé** : le texte (H1 = élément LCP) reste en **SSR** (markup Astro + `BrandLogo`/lucide statiques) ; seul le flow est client-only.
>   Copie + logos « Built with » 100 % préservés. `index.astro` importe `Hero.astro` (Hero.tsx/SpecPanel/Toast devenus morts, laissés).
> - Build OK (68 pages). Réseau du chargement home **tout en 200** (`/`, `OrchestrationFlows.tsx`, `@xyflow`, les 6 logos, `global.css`).
>   2× 500 en console = **bufferisés** (transitoire labs `PixelField`, le buffer traverse les navigations) ; WebSocket fail = socket HMR (bénin).

> ### ⚑ v136 (07/08) — Labs : image vague REMISE (hero+CTA) + section workflow = blanc à points (correction de v135)
> User : « j'ai plus le bg image, remets-les » (le « pas de bg autre que blanc » de v135 visait le HALO + les gris, PAS l'image identité) ;
> « le bg là où y a les workflow, remets-le en blanc avec les dots dedans » ; « le reste passe derrière ça rendra bien ».
> - **Image vague restaurée** : `LabsBackdrop` remis au hero (champ pixels coral du hero retiré) ; bloc `<img hero-wave.jpg>` + voile blanc remis au CTA.
> - **Section « The system / loop » (le workflow)** : champ PixelBlast violet retiré → **blanc + `flow-canvas`** (canvas à points, comme les flux des
>   pages produit). `PixelField` n'est plus utilisé sur labs → import retiré (composant gardé dans le repo).
> - **Transitions PixelBlast gardées** (les 4 bandes full/right/left/center) = « le reste ». Donc labs = image vague (hero/CTA) + bandes de
>   pixels entre sections + boucle sur points blancs. 4 îlots WebGL.
> - Build OK (68 pages). Réseau du chargement **tout en 200** (`hero-wave.jpg`, `three`, `postprocessing`, `@xyflow`, `PixelBlast.tsx`). Les 2×
>   500 vus en console étaient **bufferisés** (`PixelField is not defined` transitoire pendant l'édition, logs conteneur 16:01 < build 16:02).

> ### ⚑ v135 (07/08) — Labs : zéro halo/fond coloré (BLANC pur) + transitions VARIÉES (ligne/droite/gauche/milieu)
> Retours user : « pas de hallo ou bg autre que blanc » + « les transitions plus variées (droite/gauche, milieu, toute la ligne) ».
> - **Halo supprimé** : `PixelField` → `glow=false` par défaut (le radial `color-mix` derrière les pixels est parti).
> - **Blanc PUR partout** : image vague retirée du **hero** (`LabsBackdrop` débranché → champ pixels coral à droite à la place) et du **CTA** ;
>   bandeau dégradé `labs-g6` de la card « graduated » vedette → blanc (icône filigrane `text-primary/15` + pill bordée). Grep : plus aucun
>   `radial-gradient`/`hero-wave`/`bg-white/`/`labs-g6` sur labs. (`labs-gtext` = texte en dégradé, pas un fond → gardé.)
> - **Transitions variées** : `PixelBand` gagne un `align` (full/left/right/center → masque de position + `edgeFade`). Les 4 bandes :
>   coral **pleine ligne** → rose **droite** → périwinkle **gauche** → bleu **milieu**. Descente du dégradé de la vague conservée.
> - 6 îlots WebGL (hero + 4 bandes + boucle), `autoPauseOffscreen`. Build OK (68 pages) ; 0 erreur console ; 6 servis (18081). Labs only.

> ### ⚑ v134 (07/08) — Labs : PixelBlast en BANDES de transition + plus visible + fonds tous blancs
> Retours user (labs only) : « on voit pas assez », « plus de transition de section avec ça », « pas de bg autre que le blanc ».
> - **Fonds tous blancs** : `bg-secondary` → `bg-card` sur experiments / graduated / CTA (seul reste une pastille d'icône `bg-secondary`, chip UI).
> - **Bandes de transition** `site/PixelBand.astro` (pleine largeur, ~168px, masque vertical qui fond dans le blanc, `edgeFade=0`,
>   opacity 0.9 → BIEN visible) insérées **entre chaque section** ; couleurs = descente du dégradé de la vague : coral `#F0897B` → rose
>   `#EA6A9A` → périwinkle `#8E90E0` → bleu `#63A6E8`. `border-b` retiré des sections au-dessus d'une bande (la bande EST la transition).
> - Champ ambiant derrière la boucle **monté en visibilité** (opacity 0.5→0.75, densité 1) ; champs ambiants coral/coins retirés (les bandes
>   portent l'effet). Total 5 îlots WebGL (4 bandes + 1 boucle), `autoPauseOffscreen` → 1-2 actifs à la fois.
> - Hero + CTA gardent l'**image vague** (identité + source de la palette) — à confirmer si le user veut BLANC pur là aussi.
> - Build OK (68 pages) ; 0 erreur console ; 5 îlots servis (18081). Scope: labs UNIQUEMENT (user: « nan que dans labs »).

> ### ⚑ v133 (07/08) — Labs : PixelBlast (react-bits, WebGL) à la place des points, tenu par les couleurs de la vague
> User : sur labs, `npx shadcn add @react-bits/PixelBlast-JS-CS` au lieu des points ; en habillage (coins, derrière les cards),
> gradient façon `hero-wave.jpg` (idéal = image échantillonnée dans les points, sinon ses couleurs).
> - **Install** : slug user = typo (`-JS-CS` → HTML 404) ; bon slug `-JS-CSS`. Pris **`@react-bits/PixelBlast-TS-TW`** (repo 100 % TS+Tailwind,
>   règle #7). Lancé **dans le conteneur** (`MSYS_NO_PATHCONV=1 docker exec -w /app taskforce-landing-dev npx shadcn@latest add … --yes`) →
>   `src/components/PixelBlast.tsx` (via bind-mount) + `three`+`postprocessing` dans le node_modules du conteneur ET dans `package.json`
>   (bind-mount) → `npm install` côté HÔTE pour que MON `npm run build` résolve. `@react-bits` déjà dans `components.json`.
> - PixelBlast = shader **monochrome** (`uColor`), pas d'échantillonnage d'image → « image dans les points » impossible tel quel. Fait le
>   fallback : couleurs de l'image réparties par zone (coraux haut → violet → bleus bas = le dégradé de la vague).
> - Wrapper **`site/PixelField.astro`** (`pointer-events-none`, `edgeFade`, `autoPauseOffscreen`, `enableRipples=false`, speed douce, glow
>   `color-mix`). Câblé sur labs : « experiments » (coral, masqué en fondu), « system/loop » (violet `#8E90E0` DERRIÈRE le flux — cellule
>   rendue transparente), « graduated » (bleu `#6FA9E6` coin haut-droit + rose `#EC7BA0` coin bas-gauche). `decor labs-pixels` retiré des 2 1res.
> - Build OK (68 pages) ; **0 erreur console** (three/PixelBlast chargent) ; 4 îlots PixelBlast servis (18081). Screenshot impossible (pane non
>   affichée → pas de compositing WebGL) → check visuel user. **RESTE possible** : composant custom qui échantillonne vraiment `hero-wave.jpg`
>   dans les points (« zone random ») ; étendre PixelField au reste du site si voulu.

> ### ⚑ v132 (07/08) — React Flow sur use-cases (×10) + home (What ships today, Before/After) ; RunTimeline gardé
> User : « oui enchaîne » (use-cases + home).
> - Kit : +`RunStepNode` (nœud texte qui **wrap**, hauteur mesurée via `respace`) + `UseCaseRunFlow({steps})` ; +`StepChainFlow({steps,dir,highlight,accentAll})`
>   (chaîne générique pilotée par props, pour les sections home).
> - **use-cases** : le template partagé `UseCaseDetail.astro` « In a run / How it works » (`<ul>` à coches) → **flux vertical RF** depuis `c.inRun`
>   (étape « humaine/approve » auto-détectée et mise en avant). **Couvre les 10 pages** d'un coup. Section passée en `bg-dots`. `Check` retiré.
> - **home** : les composants React SSR → **versions `.astro`** (copie SSR + flux `client:only`), comme les pages produit :
>   · `home/WhatShipsToday.astro` (ex-`Today.tsx`) : les 2 « actes » (chips colorés + flèches = le pattern critiqué) → 2 flux verticaux RF,
>     étape humaine mise en avant. · `home/BeforeAfter.astro` (ex-`Showcase.tsx›BeforeAfter`) : les 2 pipelines numérotés → 2 flux verticaux RF
>     (avant = fuites en sous-texte, après = tout `accentAll`). `index.astro` importe les `.astro` (Today.tsx / Showcase›BeforeAfter devenus morts, laissés).
> - **RunTimeline GARDÉ** (pas converti) : c'est la démo **animée** volontaire (reviews 26–27/07, « la seule fois où on montre le mécanisme ») ;
>   en RF statique elle dupliquerait le `HeroFlow` d'orchestration et perdrait la progression draft→review→approve. Décision qualité, à confirmer.
> - **DecisionGraph** (home ›Synergy) toujours gardé (graphe de connaissances). Build OK (68 pages) ; 4 îlots `StepChainFlow` + `UseCaseRunFlow` servis (18081).

> ### ⚑ v131 (07/08) — React Flow étendu aux pages hors-produit (enterprise, ai-transparency, labs, solutions/engineering)
> User : « enchaîne sur toutes les autres pages ». Carto (sous-agent Explore) des visuels de process **non-RF** hors les 7 pages produit →
> 4 diagrammes/steppers schématiques convertis, en **variant la structure** (DA des traits gardée) :
> - Kit `OrchestrationFlows.tsx` : +`LabsLoopFlow` (boucle horizontale Signal→Memory→…→Decision→↩Memory, dots = maturité) ;
>   +`ProposalPathFlow` (chaîne + **fourche de décision** Approve/Edit/Reject → Next checkpoint, arêtes `tinted`) ;
>   +`EnterpriseStackFlow` (IdP → **TaskForce** (hub highlight) → éventail Connected/Data/Models) ; +`EngineeringRunFlow` (run vertical 5 étapes).
> - **enterprise** : boîtes+flèches `rotate-90` → `EnterpriseStackFlow` (dans la card existante ; page encore en DA pré-refonte, non touchée par ailleurs).
> - **legal/ai-transparency** : « The path of a proposal » (boîtes+chips) → `ProposalPathFlow` (cellule `flow-canvas`). `FLOW` + imports lucide retirés.
> - **labs** : stepper « The loop » (`<ol>` numéroté) → `LabsLoopFlow` (cellule bordée, pas de dots pour ne pas doubler `labs-pixels`). `LOOP`/`DOT` retirés.
> - **solutions/engineering** : run `<ol>` numéroté → **template hero 2-col** (texte | `EngineeringRunFlow` à droite, `bg-dots`). `RUN` retiré.
> - Build OK (68 pages) ; 4 îlots bien injectés (18081). **LAISSÉ** : `DecisionGraph` (graphe de connaissances, pas un workflow — déjà gardé
>   sur brain-os), cascades éditoriales (`Problem`/HANDOFFS), composants **orphelins** (morts, non importés). **EN ATTENTE de feu vert** :
>   (a) **use-cases** (`inRun` = phrases longues, template → 10 pages : rentre mal en nœuds) ; (b) **home** (`RunTimeline`/`BeforeAfter`/
>   `WhatShipsToday` = îlots React, certains animés, page très validée « review 13 » → refonte plus lourde, à confirmer).

> ### ⚑ v130 (06/08) — React Flow branché sur les 2 pages qui n'en avaient PAS (brain-os, smart-assign)
> User : « t'as pas utilisé la lib pour les workflow/process, genre React Flow — faut reprendre le template orchestration ». Diagnostic :
> `orchestration/agents/analytics/approvals/integrations` ont bien RF, mais **brain-os** (boucle « How it fits together » en `<ol>` texte) et
> **smart-assign** (routage en cartes + îlot `AutoAssign` seul) rendaient leur process **sans la lib**.
> - Kit `OrchestrationFlows.tsx` : +`BrainLoopFlow` (boucle **horizontale** Memory→Orchestration→Humans→Agents→Validated→↩Memory, arête de
>   retour `tinted` façon `CalibrationFlow`) ; +`RoutingFlow` (chaîne **verticale** New task→Weigh signals→Best match→Human approves→Assignee).
> - **brain-os** : le 3e `FeatureSplit` (`<ol>` + `ScreenPlaceholder`) → **section boucle RF pleine largeur** (`flow-canvas rail-y`, DA traits).
> - **smart-assign** : « How it decides » → **template hero 2-col** (3 signaux en liste à gauche | `RoutingFlow` calé à droite, `bg-dots`).
>   Copie 100 % préservée (FACTORS + note Sparkles conservés), `DecisionGraph`/`AutoAssign` **gardés** (vrais visuels, pas des schémas).
> - Variété structurée voulue : brain-os = boucle horizontale pleine largeur ; smart-assign = flux vertical calé à droite. Même DA de traits.
> - Build OK (68 pages) ; îlots `BrainLoopFlow`/`RoutingFlow` bien injectés dans le HTML servi (18081, 200). **RESTE** : check user ;
>   `collaboration` n'a pas de process à schématiser (board réel = la preuve) → à confirmer si on lui force un flux « une seule surface ».

> ### ⚑ v129 (06/08) — Correctif : flows VERTICAUX + sections 2-col « template hero » (les bandes pleine largeur étaient nulles)
> User (annotation rouge sur `agents`) : les dimensions du flow sont mauvaises — je l'avais mis en **bande pleine largeur** avec le flow
> horizontal riquiqui perdu dedans, ça ne respecte pas le template ni les points du hero, et ça manque de variété structurée.
> - **Flows repassés en VERTICAL** (`vChain`) : un flux horizontal étiré ne tient pas dans une colonne ; vertical = ça tient et c'est calé
>   à droite. `hChain` supprimé (plus utilisé). (`vChain` est une fonction déclarée → hoistée, utilisable avant sa définition textuelle.)
> - **Sections `agents` + `analytics` remises au template hero** : grille 2 colonnes `minmax(0,460px)_1fr`, **texte à gauche | flux vertical
>   calé à droite** dans une boîte `aspect-ratio`, section **`bg-dots`** (les points blancs comme le hero — pas un fond gris). Fini la bande.
> - `approvals` (FeatureSplit) + `integrations` : le flux vertical est déjà dans une **cellule dotée** (`flow-canvas` bordé) = le pattern
>   « demo-cell » du template ; gardés tels quels.
> - Build OK (68 pages). **RESTE** : user valide le modèle `agents` → aligner `approvals`/`integrations` sur le même traitement si besoin ;
>   puis gros check + rebuild image landing (`@xyflow`).

> ### ⚑ v128 (06/08) — Pages produit : fonds TOUS blancs + workflows en React Flow (fini les carrés de couleur)
> Retours user : (1) « les fonds de section **tous de la même couleur** » (blanc — décision de fond, pas d'alternance gris) ; (2)
> « **les workflows = la même DA** que l'orchestration (React Flow), **pas des carrés de couleur** » — pointe le flow de rôles d'`agents`
> (chips violet/bleu/ambre), et « t'as rien changé au final dans agents ».
> - **Fonds → blanc** : balayage `bg-secondary border-b` → `bg-card border-b` et `bg="secondary"` → `bg="card"` sur les **8 pages produit**
>   (les `bg-secondary/60|/50|/40|/15` = tuiles d'icônes / chrome, **gardés** : ce ne sont pas des fonds de section). Séparation par les
>   `border-b`. Les composants `FeatureSplit`/`CalloutBand`/`BorderedGrid` reçoivent désormais `bg="card"`.
> - **`AgentsFlow`** ajouté à `OrchestrationFlows.tsx` : chaîne **horizontale** Outcome → CPO → CTO → COO → Human approval → Delivery, en
>   nœuds `mini` (cartes blanches + **pastille de rôle** colorée : slate/violet/bleu/ambre/emerald, highlight sur « Human approval »),
>   arêtes `smoothstep`. Branché dans `agents.astro` (conteneur `flow-canvas rail-y` débordé aux rails) → **remplace les chips colorés** ;
>   `RUN_ROLES` + import `ArrowRight` retirés. Build OK (68 pages). Conteneur : `@xyflow` déjà installé (v127) → les nouveaux flows le réutilisent.
> - **Puis fait aussi** (même tour) : les 3 autres workflows convertis en RF via 2 helpers `hChain`/`vChain` ajoutés au kit —
>   `AnalyticsLoopFlow` (Delivery→Analytics→Recurring pattern→**Memory**→Next run, horizontal), `ApprovalsFlow` (Agent→Artifact→**Human
>   review**→Approved decision→Memory→Next checkpoint, vertical ; `Panel` retiré → `Panel` désormais inutilisé partout),
>   `IntegrationsFlow` (Your systems→Memory→Agents→**Human approval**→External systems, vertical ; `ArrowDown` retiré). **Les 4 workflows
>   sont en React Flow**, cartes blanches + pastilles, highlight sur la gate humaine. Build OK (68 pages).
> - **RESTE** : gros check visuel user (les flows RF se rendent sur onglet visible) ; **rebuild image landing** pour la permanence de
>   `@xyflow` (sinon perdu au prochain `compose down`).

> ### ⚑ v127 (06/08) — Fix env : `@xyflow/react` manquait dans le conteneur Docker de la landing (18081)
> Le user voit une erreur Vite « Failed to resolve import "@xyflow/react" » (stack en `/app/node_modules/...`). Cause : la landing tourne
> dans le conteneur **`taskforce-landing-dev`** (docker-compose service `landing`, port **18081**→4321), et son `node_modules` est un
> **volume anonyme** (`/app/node_modules`) isolé de l'hôte → mon `npm install @xyflow/react` fait côté Windows (qui faisait passer les
> builds locaux) n'atteignait jamais le conteneur.
> - **Fix** : `docker exec -w /app taskforce-landing-dev npm install @xyflow/react` + `docker restart taskforce-landing-dev` → log Vite
>   « Re-optimizing dependencies because lockfile has changed », astro ready. **Vérifié** : `GET /src/.../OrchestrationFlows.tsx` = **200**
>   (71 KB transformés), `GET /product/orchestration` = **200**.
> - ⚠️ Survit au `restart` mais **pas** à un `compose down`/recreate (volume anonyme) → **permanence = rebuild l'image landing**. Piège noté
>   en mémoire agent ([[landing-docker-node-modules]]).
> - NB : le « Use dark theme » du message user était un bouton de l'overlay d'erreur Astro, pas une consigne (landing = light-only, D2).

> ### ⚑ v126 (05/08) — Pages produit : DA « traits intégrés » appliquée PARTOUT (vagues 2 & 3) — prêt pour gros check user
> User : « continue la vague 2, je ferai un gros check quand on aura terminé ». Fait, sur les **8 pages produit + composants partagés** :
> - **integrations** : 3 grilles de cartes flottantes (WAYS / PILLARS / SECURITY) → **grilles à filets intégrées** ; le flux vertical
>   connect→act gardé (variété : c'est un flow).
> - **analytics** : grille des 6 métriques → intégrée. **Gardé** (contenu déjà varié comme voulu) : la **card mock de chart** (screen déco +
>   description), le **pill flow**, l'îlot `DeliveryInsights`.
> - **index** (hub) : les 2 grilles de cartes-liens nav → intégrées (hover conservé).
> - **smart-assign** : grille « How it decides » **dé-boxée** ; le `Panel` de la liste REVIEW (= « le tableau 3 lignes posé là » que le user
>   a explicitement rejeté) → **liste à filets** intégrée + import `Panel` retiré.
> - **`ScreenPlaceholder` (partagé, 5 usages)** : écran VIDE (« Preview ») → **squelette décoratif** (barres grises abstraites, aucune donnée
>   → **D11-safe** : déco, pas un faux screenshot). Corrige d'un coup les placeholders vides de approvals / collaboration / smart-assign /
>   brain-os ×2. C'est le « **petit screen écran décoratif** » demandé.
> - **brain-os** : `BorderedGrid` déjà dé-boxé (v125) ; petite card « How it fits together » → dé-boxée (accent `border-l`).
> - **approvals** : `BorderedGrid` dé-boxé (v125) + placeholder déco ; `Panel` **gardé** (il encadre un **flux/diagramme** taggé
>   « Illustrative » = visuel encadré défendable, pas une grille de cartes).
> - **collaboration** : déjà en traits intégrés (`FeatureRows`) + placeholder désormais déco → rien à refaire.
> - **agents** (v124) : 3 grilles → intégrées.
> - `npm run build` OK (68 pages) à chaque vague.
> - **RESTE** : gros **check visuel user** sur les 8 pages. Points à trancher pendant le check : le rendu du **squelette `ScreenPlaceholder`**
>   (déco OK ou trop chargé ?) ; le **`Panel` d'approvals** (garder encadré ou intégrer aussi ?). `Panel` n'est plus utilisé que là.

> ### ⚑ v125 (05/08) — Survey des pages produit + `BorderedGrid` dé-boxé (traits intégrés) ; plan par vagues
> Survey Explore des 8 pages produit. État initial : seul **`collaboration`** est déjà en traits intégrés (via `FeatureRows`/`FeatureRow`
> = `border-y sm:divide-y` + `sm:border-l`). **Hairline-mais-BOXÉ** (à dé-boxer) : `approvals`, `brain-os`, `smart-assign` (via `BorderedGrid`
> / grille inline + `Panel`). **Cartes flottantes pures** (à refondre) : `agents`✓, `analytics`, `integrations`, `index`. **`ScreenPlaceholder`
> VIDES** (approvals, collaboration, smart-assign, brain-os ×2) = les emplacements pour les **mini-mockups d'écran déco** que veut le user.
> Composants partagés `BorderedGrid`/`Panel`/`ScreenPlaceholder` utilisés **uniquement** sur ces 4 pages → modif globale sûre.
> - **Fait** : `components/site/sections/BorderedGrid.astro` **dé-boxé** → `-mx-6 lg:-mx-10 grid gap-px border-y border-border bg-border`
>   (plus de `rounded-2xl border overflow-hidden`) → les grilles de **approvals + brain-os** passent en traits intégrés d'un coup. Build OK.
> - **PLAN par vagues (RESTE)** :
>   1. Refondre les grilles de cartes flottantes → intégrées : **integrations** (WAYS/PILLARS/SECURITY), **analytics** (6 métriques), **index** (grilles nav).
>   2. **smart-assign** : dé-boxer la grille inline « How it decides » ; décider du sort des `Panel`.
>   3. Remplacer les **`ScreenPlaceholder` vides** par de **vrais mini-mockups déco** (le « petit screen écran » du user) — bespoke par page.
>   4. **collaboration** : déjà quasi ok (FeatureRows) → juste dé-boxer son placeholder.
>   5. Îlots existants réutilisables comme visuels de cellule : `DeliveryInsights` (analytics), `DecisionGraph` (brain-os), `CollabBoard`,
>      `AutoAssign`, `IntegrationCatalogue` ; + îlots d'illustration non utilisés dans `components/site/illustrations/` (à auditer).

> ### ⚑ v124 (05/08) — Orchestration VALIDÉE → réplication de la DA sur les pages produit (agents = 1re faite)
> User valide orchestration (« beaucoup mieux, ça fait du sens »). Demande : **répliquer la DA** (traits intégrés + grille) sur **les autres
> pages produit**, en **ALTERNANT** le contenu — pas que des schémas RF : aussi des **petits mockups d'écran décoratifs**, des **cartes
> descriptives**, adapté par page. « Go ».
> - Périmètre : 8 pages produit (`agents, approvals, collaboration, smart-assign, analytics, brain-os, integrations, index`) + 3 sous-pages
>   intégrations (github/slack/plane). Un **survey Explore** a été lancé pour cadrer l'état de chaque page.
> - **`agents.astro` = 1re convertie** : les 3 grilles de **cartes flottantes** (`rounded-2xl border` : team / what's real today / the rules)
>   → **grilles à filets intégrées** (`-mx-6 lg:-mx-10` débordé aux rails + `gap-px bg-border` + `border-y`, cellules `bg-card`, zéro carte
>   flottante). Le flow horizontal "Orchestration" (chips) est gardé → la page **alterne** déjà flow + cartes descriptives. Build OK (68 pages).
> - **RESTE** : convertir les 7 autres pages sur le même patron ; y **alterner** les visuels (mockups d'écran déco là où ça colle — ex.
>   `analytics` = mini dashboards ; `brain-os` = graphe ; `approvals` = mini file d'attente d'approbations). Le survey guidera la priorisation.

> ### ⚑ v123 (05/08) — Nœuds à taille homogène + rendu 1:1 + grille VARIÉE (pas ultra-carrée)
> User valide (« c'est top, rien à dire »). Une remarque : « les **cards des schémas doivent avoir la même taille** ; donc t'auras
> forcément des décalages, gère ça élégamment » + « pas obligé que ce soit ultra carré » + « un peu de variation c'est pas mal ».
> - **Nœuds standardisés** : tous les nœuds des 4 schémas → **hauteur 60**, largeur 200–224 (mini approval/calibration w200, handoff w220,
>   chips w224, proposition w200). 2 sous-titres handoff raccourcis pour tenir en 1 ligne.
> - **Rendu 1:1** : `maxZoom = 1` (avant 1.5) → les schémas ne sont plus agrandis/rapetissés pour remplir la case, les **nœuds gardent leur
>   taille réelle** → homogènes d'un schéma à l'autre.
> - **Grille VARIÉE** (gère les « décalages » élégamment) : les **boucles larges** (Human-in-the-loop, Predict) passent **pleine largeur**
>   (`md:col-span-6`) pour rendre à 1:1 sans écraser ; **grounding + handoff** restent côte à côte (`md:col-span-3`). Hauteurs de zone schéma :
>   280 px (grounding/handoff), 150 px (boucles).
> - Build OK (68 pages). **RESTE** : vérif visuelle user (tailles de nœuds homogènes ? boucles pleine largeur OK ?) → puis appliquer la
>   même DA (traits intégrés + React Flow) aux **autres pages produit**.

> ### ⚑ v122 (05/08) — Traits intégrés appliqués GLOBALEMENT : les 4 schémas deviennent des cellules d'UNE grille à filets
> User valide le mécanisme (« oui ») et demande de l'appliquer **à toutes les sections globalement**. Fait :
> - **4 sections de schéma fusionnées en UNE grille à filets intégrée** « Inside a run » (2×2) : chaque capacité = **cellule** (eyebrow +
>   titre + texte + le schéma RF dans une zone `flow-canvas` de hauteur fixe `h-[200px]`, séparée du texte par un filet `rail-y`). Grille
>   débordée jusqu'aux rails (`-mx-6 lg:-mx-10`), filets = `gap-px bg-border` + `border-y` ; **zéro carte flottante**. Supprimé les 3 sections
>   (approval/handoff/calibration) + la table « sample checkpoint » + la const `CALIB`.
> - **Ordre de page** désormais cohérent, tout en traits intégrés : hero → problem → **Inside a run** (grille) → team (colonnes à filets) →
>   **Your models. Your numbers.** (bento intégré) → moat (colonnes à filets) → CTA. Les 5 îlots RF conservés.
> - Build OK (68 pages). **RESTE** : vérif visuelle user (surveiller le **dimensionnement des 4 schémas** dans des cellules ~196px de haut ;
>   les boucles horizontales rendront courtes, le handoff étroit centré) ; puis appliquer la même DA aux **autres pages produit**.

> ### ⚑ v121 (05/08) — Correction : les traits sont **INTÉGRÉS à la section** (pas une carte) ; à organiser sur toute la page
> User rejette le bento v120 : « t'as fait des **cards**, alors que les traits font **partie intégrante** des sections ; ça s'applique **à
> tout** ; je veux pas juste un flow / un tableau posé isolé, **organise tout ça** ». Le tort : `surface rounded-2xl` = une carte flottante.
> - **Mécanisme correct repéré** : utilitaires **`.rail-x`** (filet vertical) / **`.rail-y`** (filet horizontal) + `.container-rail`
>   (`border-inline` = rails, padding 1.5/2.5rem). « Intégré » = grille **débordée jusqu'aux rails** (`-mx-6 lg:-mx-10`), filets =
>   `border-y` + `gap-px bg-border`, **zéro** arrondi/ombre/carte. Les traits appartiennent à la section (cadrés par les rails).
> - **Bento refait** en intégré (même contenu : stats 7/3/1 + Your models + $0). Build OK.
> - **RESTE (à confirmer AVANT de tout refaire — 4 passes déjà à côté)** : organiser TOUTE la page en traits intégrés → les **4 schémas
>   RF deviennent des CELLULES** de la grille (titre + texte + schéma dans la cellule), fin des double-cartes flottantes. Idem team/moat
>   (déjà en colonnes à filets = OK). Valider le mécanisme sur le bento, puis dérouler partout, puis autres pages produit.

> ### ⚑ v120 (05/08) — DA de structure = **les traits** : grille bento appliquée (template) ; les schémas RF validés
> User valide les 5 schémas RF (« je trouve ça good en vrai de vrai »). Nouvelle direction, réfs bento 21st.dev à l'appui : « notre **DA de
> structure c'est les traits** — une fois l'architecture de filets posée, tu places ce que tu veux dedans ». « Adapte tout, que ce soit
> sympa ; **on finit là-dessus**, je fais un dernier check, puis on **applique aux autres pages produit** ».
> - Le composant **`Bento`** (grille `md:grid-cols-6` + `gap-px bg-border` = les filets, cellules `bg-card`) existait déjà mais n'était pas
>   utilisé. **Template posé** : la section « Your models » + `StatBand` remplacées par **UNE grille à filets** — 3 cellules stats (7 / 3 / 1,
>   span 2) + une cellule large « Your models » (Ollama $0 / Hosted, span 4) + une cellule « $0 » tintée (span 2). Contenu réel dans les
>   cellules, filets = `gap-px bg-border`. Retiré l'import `StatBand` + la const `STATS`.
> - Les **5 schémas RF sont conservés** (validés). Build OK (68 pages). Le bento est **HTML statique** → pas de gotcha onglet caché, il se
>   rend toujours.
> - **RESTE** : user valide le template bento → puis **étendre** la structure à filets (team/agents ; le moat est déjà en colonnes à filets)
>   et l'**appliquer aux autres pages produit** (c'est le but final). Ne pas tout bento-ifier à l'aveugle avant son OK sur le look.

> ### ⚑ v119 (05/08) — TOUT en React Flow, STATIQUE, façon Attio (5 schémas, socle unique) — « déroule tout d'un coup »
> User : « c'est pas régulier, **oublie les animations** ça me gave » + « **déroule tout** d'un coup » (les 4 autres schémas aussi en RF,
> structurés Attio). Fait :
> - **`components/site/flows/OrchestrationFlows.tsx`** — socle unique `StaticFlow` (RF, interactions coupées, badge masqué, canvas
>   transparent, `client:only`) + **3 types de nœuds** partagés : `step` (carte pipeline), `mini` (icône/pastille + titre + sous-titre,
>   variante `highlight`), `ctx` (label + valeur). Handles pilotés par data (`ring` = rond visible au départ, sinon invisible).
> - **ZÉRO animation** : retiré la cascade, les arêtes `animated`, le dash → tout statique (cf. user). CSS d'anim supprimé de `global.css`.
> - **Espacement régulier** : le souci venait de `node.measured` (pas fiable dans l'îlot) ; je recale le hero à partir des **hauteurs DOM
>   réelles** (`offsetHeight`) avec un gap constant ; les nœuds des autres schémas ont une **hauteur FIXE** → régulier sans mesure.
> - **5 flux** : `HeroFlow` (pipeline vertical + branche), `GroundingFlow` (4 chips contexte → 1 proposition, fan-in), `ApprovalFlow`
>   (Propose→Review→Approve + boucle « Request changes » ambre), `HandoffFlow` (plan→agent→PR, vertical), `CalibrationFlow`
>   (Predict→Ship→Measure→Recalibrate + boucle bleue). Tous en double-carte (cadre propre + `flow-canvas` pointillé = « 2e bg »).
> - **Page** : les 4 anciens schémas SVG remplacés par les îlots ; consts `MEMORY_ITEMS`/`HANDOFF` + icônes inutiles retirées ;
>   `HeroFlow.tsx` = simple ré-export vers `OrchestrationFlows`. `npm run build` OK (68 pages ; bundle RF 63 kB gz, page orchestration only).
> - **RESTE** : vérif visuelle user (je ne peux pas screenshoter — onglet d'automatisation caché). Points à surveiller : le rendu des
>   **boucles de retour** (approval/calibration, arêtes bas→bas) et les ratios `aspect-ratio` des cadres. Ajuster selon retour.

> ### ⚑ v118 (05/08) — Hero RF : **alignement corrigé** (re-layout mesuré) + **arêtes `animated` natives** (le trait coule)
> User voit le hero rendu mais : (1) « tout décalé » = écarts verticaux irréguliers ; (2) « tu peux pas animer React Flow ? y a pas de
> paramètre natif ? » ; (3) « les autres graphs c'est aussi React Flow ? » ; (4) veut du dynamique dans les sections (« un truc qui tourne »,
> ex. grounding) et « **organise / structure bien, inspire-toi d'Attio** ».
> - **Décalage corrigé** : les `initialHeight` sont des estimations → les positions fixes dérivaient. Ajout d'un **re-layout après mesure**
>   (`useNodesInitialized` → `setNodes`) qui recale le tronc à partir des **hauteurs réelles** (`node.measured.height`) avec un **écart
>   constant** (GAP 34, BRANCH_GAP 48), puis `fitView`. Branche resserrée (exec x=20, qa x=316 → marges symétriques).
> - **Animation native** : `animated: true` dans `defaultEdgeOptions` = l'anim NATIVE de RF (pointillé qui défile, façon Attio). CSS
>   `.tf-flow .react-flow__edge.animated .-path` (dash + keyframe `tf-dashdraw`) ajouté au cas où `base.css` ne l'embarque pas. À NOTER pour
>   le user : RF anime **nativement les arêtes** ; l'**apparition des nœuds** n'a PAS de param natif → c'est du CSS (normal, pas un hack).
>   L'apparition en cascade (v117) est conservée EN PLUS.
> - **Réponse à (3)** : non, les autres schémas sont encore **SVG maison statiques** (v117). Plan : les convertir en RF façon Attio **une fois
>   le hero validé** (ne pas propager un motif non validé — cf. rejets répétés). `npm run build` OK (68 pages).
> - **RESTE** : (a) user valide le hero (alignement + garder les arêtes qui coulent OU repasser en trait plein ?) ; (b) ensuite propager RF
>   à **grounding / handoff / boucles** avec structure Attio + motion sobre (ex. grounding : items du contexte qui « alimentent » la proposition).

> ### ⚑ v117 (05/08) — Hero RF : **apparition en cascade** rendue ; les 4 sections animées passées en **STATIQUE**
> Retours user sur le hero RF (qu'il voit enfin) : (1) « y a pas d'animation genre fade pour chaque card ? » → il veut **ré-ajouter
> l'apparition** (validée en v115) ; (2) « pourquoi ce qu'il y a DANS les cards est animé ? tu peux utiliser React Flow mais **statique
> comme le hero** » → il vise les **anciennes sections** (grounding/handoff/boucles) encore sur le moteur `fx-*` (bordure bleue qui pulse,
> traits qui se dessinent).
> - **Apparition hero (cascade)** : chaque nœud enveloppé dans `.tf-node-anim` (wrapper) avec `--tf-delay` (0/140/280/420/560/560 ms) ;
>   les arêtes fondent juste après leur carte source (delays 70/210/350/490 via `[data-id]`), d'où une vraie **chaîne** carte→flèche→carte.
>   Contenu **statique**. Le hover reste sur `.tf-node` (pas de conflit avec l'entrée). Déclenché par la classe **`tf-play`** posée quand
>   `useNodesInitialized()` est vrai (+ filet `setTimeout(900)`), respect `prefers-reduced-motion`. CSS dans `global.css`.
> - **4 sections rendues STATIQUES** (grounding, boucle d'approbation, handoff, calibration) : retiré `fx-draw`/`fx-node`/`fx-border` +
>   `data-flow` + `pathLength` → les schémas SVG montrent leur **état final** (connecteurs bleus + bords bleus + flèches, figés). Supprimé
>   le `<script>` d'enchaînement (mort). **Vérifié en direct** : `.fx-draw/.fx-node/.fx-border` = **0** sur la page.
> - `npm run build` OK (68 pages). Hero : nouveau code **confirmé chargé** (classe `tf-play` présente) ; rendu visuel de la cascade **en
>   attente** d'un onglet visible (même gotcha qu'en v116).
> - **RESTE / à trancher** : les 4 sections sont **statiques mais en SVG maison** (pas RF) → pas raccord visuel avec le hero RF. Prochaine
>   étape (plan « héro + 1 boucle ») : reconstruire la **boucle d'approbation en React Flow statique** (raccord hero) + simplifier
>   **grounding / handoff / calibration** en sections variées (feature-split, contenu réel). À confirmer avec le user avant de dérouler.

> ### ⚑ v116 (05/08) — Hero passé à **React Flow** (choix user) : diagramme STATIQUE façon Attio ; gotcha onglet caché
> Les flèches SVG maison (v115) faisaient des « crochets » → **le user tranche : on utilise une lib (React Flow)** + on **consolide
> façon Attio** (héro + 1 boucle, le reste en sections variées, plus « un flux par section »). Licence : `@xyflow/react` = **MIT** →
> usage **commercial** OK, **masquer le badge est légal** (courtoisie, pas une clause). `npm i @xyflow/react` (13 pkgs).
> - **`src/components/site/flows/HeroFlow.tsx`** (îlot `client:only="react"`) : nœuds custom = nos cartes (icône + badge kind + pastille
>   d'état), **figées** (aucune anim interne, hover discret) ; arêtes **`smoothstep`** (coins arrondis `borderRadius:16`) + **flèche**
>   `MarkerType.ArrowClosed` à l'arrivée ; le **handle source = le « rond » au départ** (stylé en blanc/anneau bleu), handle target invisible.
>   Toutes interactions coupées (pan/zoom/drag/select off, `preventScrolling:false`), badge masqué (`proOptions.hideAttribution`).
>   CSS dans `global.css` (`.tf-flow`, `.tf-handle--source/--target`, `.tf-node:hover`) ; canvas transparent (laisse voir les points de section).
> - **Page** : retiré le graphe SVG maison + les consts `FLOW/BRANCH/KIND_STYLE/STATE` + l'icône `Flag` ; le graphe = `<HeroFlow client:only />`
>   dans un cadre `aspect-ratio: 600/600` (réserve la place, pas de CLS). Légende « Illustrative — orchestration is Planned » gardée (D11).
> - **⚠️ GOTCHA majeur (diagnostiqué, pas un bug de code)** : dans un onglet **caché/arrière-plan** (`document.visibilityState==='hidden'`),
>   le navigateur **met en pause `requestAnimationFrame` ET `ResizeObserver`** → React Flow **ne mesure jamais les nœuds** → cartes
>   `visibility:hidden`, **0 arête**, pas de `fitView`. C'est **exactement** l'état des navigateurs d'automatisation ici (claude-in-chrome
>   ET le pane in-app sont `hidden`, et le mode « background app » **n'autorise pas** à ramener Brave au premier plan). **Pour un vrai
>   visiteur (onglet visible), tout se rend normalement.** Robustesse ajoutée : `initialWidth/initialHeight` (dims réelles mesurées :
>   94/94/104/94/78/78) pour semer le rendu ; `ReactFlowProvider` + `useUpdateNodeInternals` + `fitView` au montage (2×rAF + `setTimeout`) ;
>   **remesure sur `visibilitychange`** (auto-heal si monté en arrière-plan). `npm run build` OK (68 pages), **zéro erreur console**.
> - Dev server : 18081 **planté** (port occupé, ne répond pas) → tourne sur **18082**. Vérif visuelle **en attente** : besoin que le user
>   ramène Brave au premier plan (fenêtre minimisée) — dès qu'il est visible, RF se rend et je screenshote/valide les connecteurs.
> - **RESTE** : (1) valider visuellement le hero RF ; (2) propager RF à la **boucle d'approbation** (le « +1 boucle ») ; (3) convertir
>   **grounding / handoff / calibration** en sections variées (feature-split, contenu réel) — plus de flux partout ; (4) à terme, retirer
>   le moteur `fx-*` devenu inutile une fois tous les flux migrés.

> ### ⚑ v115 (04/08) — Anim CALÉE : apparition des cartes (`fx-pop`) + connecteurs façon Attio (rond + chevron + coins arrondis)
> User a envoyé des réfs Attio + validé la direction : **l'apparition** (fondu+montée) des cartes = « parfait », à étendre ; **petites
> cartes de démo peuvent rester statiques** ; **SOIGNER les flèches** = un **rond** au départ, de **vraies flèches** (chevrons) à l'arrivée,
> et des **coins arrondis** sur les embranchements.
> - **Connecteurs du hero refaits en SVG** (coords EXPLICITES → plus le bug des `%`) : marqueur chevron `#tf-arr` (défini une fois),
>   connecteur tronc = `<circle>` (rond) + ligne + `marker-end` chevron ; **branche** = 2 chemins à **coins arrondis** (`q…`) + rings +
>   chevrons, alignés aux centres des cartes (21%/79% = `justify-between` w-250 dans 600). Connecteurs en **`.fx-fade`** (fondu simple),
>   cartes en **`.fx-pop`** (apparition), le tout enchaîné.
> - **Bug chaînage RÉGLÉ** : `animationend` **ne se déclenche pas sur les `<svg>`** (quirk Chromium) → la chaîne stallait après la 1re carte
>   (les suivantes restaient `opacity:0`). Ajout d'un **filet `setTimeout(800ms)`** par groupe dans le `<script>` → la chaîne avance toujours
>   (via `animationend` OU timeout). Vérifié Brave ✅ : toutes les cartes apparaissent, connecteurs **ring + chevron + coins arrondis** nets.
> - **RESTE** : propager (apparition `fx-pop` + connecteurs Attio) aux autres flux (**handoff, grounding**) ; les **boucles**
>   (approval/calibration) peuvent rester en **SVG statique** (petites démos, pas besoin d'animer — cf. user). Puis démos vivantes si voulu.

> ### ⚑ v114 (04/08) — Tracé SVG de bord ABANDONNÉ (trop fragile) → cartes en `fx-pop` (robuste) ; anim toujours à caler avec le user
> User : « toujours pas bon » sur le moteur v2. En inspectant : le **tracé SVG du bord des cartes HTML est bugué** — (bug 1) le `<svg>`
> étant un élément remplacé, sans taille explicite il retombait sur son intrinsèque 300×150 (bord décalé/hors carte) ; (bug 2) après
> `h-full w-full`, le `pathLength="1"` sur un `<rect width="100%">` ne trace pas tout le périmètre (ça marche pour les nœuds des boucles car
> ils ont des dimensions px EXPLICITES, pas `%`). Conclusion : **overlay SVG sur carte HTML = trop fragile, abandonné**.
> - **Revert** : les cartes du hero passent en **`.fx-pop`** (fondu + légère montée, robuste) + `data-o` → apparaissent **en séquence**,
>   toujours **enchaînées** (`animationend`) avec les connecteurs. Page **propre**, plus de bug. Le **vrai enchaînement** (JS `animationend`)
>   et les **connecteurs SVG** (déjà à vitesse constante) sont conservés — c'est la partie qui marche.
> - **⚠️ Anim toujours PAS validée par le user** (5ᵉ itération). Ne plus deviner : demander une **référence/description précise** de
>   l'animation voulue. Feu vert **démos vivantes** (toasts, cartes qui changent, mini-graphes façon carte budget) toujours valable — sans
>   doute la vraie direction plutôt que d'animer des bords.
> - Le moteur v2 CSS (`.fx-stroke`, `.fx-go`, chaînage JS `[data-o]`, `.fx-pop`) reste en place ; les autres flux tournent encore en legacy.

> ### ⚑ v113 (04/08) — MOTEUR v2 : bord en TRACÉ SVG (vitesse d'arc constante) + VRAI enchaînement (animationend) — appliqué au hero
> QA #3 : le souci n'est pas la vitesse mais (a) **elle n'est pas constante** — le conic balaie par ANGLE → accélère sur les longueurs,
> ralentit sur les largeurs (« horrible ») ; (b) **pas de vraie séquence** — les flèches partent sur un timing calculé, pas à la FIN de
> l'anim précédente ; (c) double carte : + d'espace entre partie 1 et 2 ; (d) « oui » aux démos vivantes.
> - **Bord de carte = TRACÉ SVG** (`.fx-stroke` = `<rect pathLength="1">` + `stroke-dashoffset`, LINÉAIRE) → dessin à **vitesse d'arc
>   CONSTANTE**, plus d'accélération sur les longueurs. (Les nœuds des boucles étaient déjà des tracés SVG = déjà constants ; c'était le
>   **conic** des cartes HTML le coupable → supprimé, remplacé par le tracé.) Overlay : `<svg absolute inset-[0.75px]>` + rect `width/height
>   100%`, `rx=12`, `vector-effect="non-scaling-stroke"`.
> - **Vrai enchaînement** : le `<script>` chaîne les groupes **`[data-o]`** via **`animationend`** (chaque groupe démarre à la FIN du
>   précédent, plus de `--d`). Fallback `.flow-run` legacy conservé pour les flux pas encore migrés.
> - Appliqué au **HERO** (cartes tronc `data-o` 1/3/5/7 + connecteurs 2/4/6, exit 8, stem 9, barre 10, drops 11, cartes branche 12).
>   Vérifié Brave ✅ : le bord se **trace autour** à vitesse constante, **chaîné** carte→flèche→carte.
> - **Double carte** : padding extérieur `p-2.5 → p-4` (plus d'espace entre l'extérieur propre et l'intérieur à points).
> - **RESTE** (à faire après confirmation que le moteur hero est le bon) : (1) migrer le moteur v2 (`fx-stroke` + `data-o` + chaînage) aux
>   **autres flux** (approval / calibration / handoff / grounding) — ils tournent encore en **legacy** (conic + timing) ; (2) **démos
>   vivantes** (toasts qui apparaissent, cartes qui changent d'état, mini-graphes façon carte budget) — **feu vert reçu**.

> ### ⚑ v112 (04/08) — QA #2 : anim LINÉAIRE + lente (pas d'accélération), hero branche corrigée + animée, template DOUBLE CARTE
> QA user :
> 1. **Anim trop rapide + accélère sur les bords longs** → moteur **LINÉAIRE** partout (vitesse constante, zéro accélération ; remplace
>    `ease-in-out`), durées **allongées** (fx-border/fx-node **1.3s**), **pilotables par `--dur`** (à mettre ∝ la taille pour une vitesse
>    px/s constante). Cartes du hero rendues **uniformes** → même durée = même vitesse. Nouveau **`.fx-line-x`** (connecteur horizontal animé).
> 2. **Hero** : les 2 cartes du bas **même taille** que le tronc (`w-[250px]`, `p-3.5`) et **écartées** (`flex justify-between`, ~100px de
>    gap) ; graphe élargi (grille hero `[minmax(0,460px)_minmax(0,1fr)]`, container `max-w-[600px]`, tronc `max-w-[250px]`). **Connecteur de
>    branche ANIMÉ** (stem `fx-line` + barre `fx-line-x` + 2 drops, en bleu, séquencés) → **le flux continue à la séparation** (avant : ça
>    s'arrêtait). Cadence ~1.0s. Titre CTO déjà « Approach & contract ».
> 3. **Template DOUBLE CARTE** (« t'as pas compris ») : **carte extérieure propre (sans points)** + **carte intérieure À POINTS** (le 2ᵉ bg).
>    `.flow-canvas` déplacé sur l'intérieur. Appliqué à **grounding, approval, handoff, calibration**. = notre template pour toute démo/flux
>    dans une carte.
> - Vérifié Brave ✅ : hero = entonnoir, branche même-taille + écartée + connecteur bleu **animé** ; grounding = **double carte** (points sur
>    l'intérieur seulement). Build 68 OK.
> - **RESTE / proposé au user** : (a) **démos « vivantes »** — toasts qui apparaissent, cartes qui changent d'état, **mini-graphes** (réf.
>    carte budget Attio $30k + toast $750) — gros chantier créatif, à faire après validation de la **vitesse** ; (b) au besoin ralentir aussi
>    la cadence des boucles approval/calibration pour matcher le hero.

> ### ⚑ v111 (04/08) — QA orchestration : hero en entonnoir, anim plus smooth, template « canvas à points », rails retirés (team)
> QA user (4 points) :
> 1. **Hero** — les cartes seules s'étalaient (bloc carré = impression de vide). → **tronc étroit** (`max-w-[300px]`, centré) qui s'ouvre
>    sur une **branche plus large et écartée** (`max-w-lg`, cartes `p-4`, `gap-4`) → forme d'**entonnoir**. Titre CTO raccourci
>    « Approach & contract » pour tenir dans la carte étroite.
> 2. **Animations trop rapides** → **plus lentes / `ease-in-out`** (fx-draw 0.5→**0.75s**, fx-node 0.55→**0.8s**, fx-line 0.4→**0.6s**,
>    fx-border 0.6→**0.9s**) + **séquençage « la flèche touche la carte → la carte s'anime »** : cadence **0.9s**, connecteur delay =
>    `i·0.9 − durée` (arrive pile quand la carte démarre). Délais mis à jour sur hero / approval / handoff / calibration.
> 3. **Template `.flow-canvas`** (façon **Attio écran 3**) : cadre à **fond POINTILLÉ** où **flottent** les nœuds/toasts. Appliqué à
>    **grounding** (toasts blancs sur points + proposal qui remplit son bord), **approval loop**, **handoff**, **calibration**.
>    → NOTRE template réutilisable pour tous les petits flux (à décliner ailleurs).
> 4. **Section « The team »** : **rails retirés** (`.container-rail.no-rail` → `border-inline: 0`) → variété sur la transition (« on peut
>    retirer certaines bordures de section »).
> - Vérifié Brave ✅ : hero entonnoir + anim plus douce (le flow traverse visiblement) ; grounding + approval en **canvas pointillé** ; team
>    **sans rails** (confirmé au zoom vs grounding qui garde le rail). Build 68 OK.
> - ⚠️ Repéré (non corrigé, hors scope) : bug latent dans `global.css` — commentaire ouvert par `\*` au lieu de `/*` près de
>    `.rail-x`/`.rail-y`.

> ### ⚑ v110 (04/08) — Animations « pro » façon Attio : DRAW-ONCE au scroll (flèches pleines bleues, bords qui se remplissent, puis fige)
> User : animations plus pro/clean comme Attio — **flèches PLEINES bleues**, anime **une seule fois** quand le flow passe (pas en
> permanence), le **bord de carte se remplit en bleu** quand la flèche l'atteint puis **se fige** (« un fluide qui remplit les traits »).
> Animer le hero aussi. Varier les agencements.
> - **Remplacé `tf-dash`/`tf-pulse`** (boucles permanentes) par un **moteur « draw-once »** (`global.css`) :
>   - `@property --bfill` + `fx-draw` (trait SVG qui se dessine via `pathLength="1"` + `stroke-dashoffset`→0), `fx-node` (bord de nœud SVG),
>     `fx-line` (connecteur HTML qui pousse en `scaleY`), `fx-border` (bord de carte HTML : anneau **conic** masqué qui se remplit).
>     `animation-fill-mode: forwards` → **se fige**. Délais séquentiels via `--d` (le flow « passe »). Coupé si `prefers-reduced-motion`.
>   - **JS** (script en bas d'`orchestration.astro`) : `IntersectionObserver` ajoute `.flow-run` sur chaque `[data-flow]` à l'entrée à
>     l'écran puis `unobserve` → **joue UNE fois**. (⚠️ un scroll instantané très rapide peut rater le trigger ; scroll normal = OK.)
> - Appliqué aux **4 schémas** : hero (cartes `fx-border` + connecteurs `fx-line`), approval loop (SVG `fx-draw`/`fx-node`), handoff (flux
>   vertical), calibration loop (SVG). Retiré le point « pulse » permanent du hero (RUNNING = point statique).
> - Vérifié Brave ✅ : mi-parcours = le flow descend/traverse (cartes bleues en séquence, les suivantes encore grises) ; final = **tout bleu
>   figé** (flèches pleines + bords remplis). Build 68 OK.
> - **Note structures** : déjà variées (graphe vertical+branche / panneau / colonnes à filets / boucle horizontale / flux vertical / cartes).
>   Les 2 boucles partagent une structure horizontale — à différencier si besoin (ex. calibration en **cercle**). Option aussi : les bords
>   pourraient **retomber en gris** après le passage (ne garder que les connecteurs bleus) au lieu de rester bleus.

> ### ⚑ v109 (04/08) — Orchestration = cycle de vie complet du run : +3 schémas animés (grounding, handoff, calibration loop)
> User a choisi **les 3** pistes. Réorganisé orchestration en **cycle de vie du run** ; le **bento retiré** (son contenu mémoire/
> prédiction/modèles repris **sans redondance** dans les nouveaux schémas). Ordre : Hero → Problème → **Grounding** → The team → **Approval
> loop** → **Handoff** → **Calibration loop** → **Your models** → Preuve → Moat → CTA.
> - **Grounding** (2-col) : « It starts from what you already decided » + panneau « Your context » (4 items) → flèche → « a proposal grounded
>   in your context ». Lien brain-os. (reprend MEMORY_ITEMS)
> - **Handoff** (2-col) : « Approved plans go straight to your coding agent » + **flux vertical animé** (Approved plan → Your coding agent →
>   Pull request), connecteurs SVG `tf-dash`. Générique (« the coding agent you already use ») → honnête, pas de fausse intégration nommée.
> - **Calibration** (centré, **LOOP animé**) : Predict → Ship → Measure → Recalibrate + **courbe de retour** « the next run starts better
>   calibrated ». Tag **« Coming next »** (honnêteté). + table échantillon (CALIB : effort ~6d→5d, etc.).
> - **Your models** (2-col compact) : Local · Ollama `$0/run` / Hosted `optional`.
> - Imports nettoyés : retiré `Bento`/`BentoCell`/`Target` ; ajouté `Sparkles`/`GitPullRequest`/`ArrowDown`/`ArrowRight`.
> - Vérifié Brave ✅ : tout rend, **animations `tf-dash` actives** (les tirets se déplacent entre 2 captures). Build 68 OK.
> - Page = **11 sections** (cycle de vie complet). Riche ; si trop long → on pourra élaguer. **Composants désormais inutilisés** (candidats
>   à un ménage) : `Bento`, `BentoCell`, `Faq`, `FeatureCards`, `FeatureCard`, `DotField.tsx`.

> ### ⚑ v108 (04/08) — Schémas animés (loops) : boucle d'approbation + hero « live » ; question « + de sections ? »
> User adore la v107. Demande : « multiplier le petit schéma (comme le hero), tu peux les animer / faire de **vrais loop**, peaufine » +
> « y a d'autre chose à montrer / on ajoute des sections ? ».
> - `global.css` : keyframes **`tf-dash`** (tirets qui défilent le long d'un tracé SVG) + **`tf-pulse`** (point « live » qui respire),
>   **coupés si `prefers-reduced-motion`**.
> - **Hero** : le nœud « RUNNING » gagne un **point bleu qui respire** (`tf-pulse`).
> - **NOUVELLE section « Human-in-the-loop »** (après « The team ») : schéma **animé** de la **boucle d'approbation** — Propose → Review →
>   Approve (connecteurs bleus en **tirets défilants**) + boucle **« Request changes »** (ambre, courbe SVG) qui **reboucle** Review→Propose.
>   C'est LE différenciateur (human gate), jusque-là seulement écrit. Fond **blanc**, SVG responsive (`viewBox`), honnête (concept).
> - Vérifié Brave ✅ (nœuds alignés, arrow-heads OK, dashes visibles/animés). Build 68 OK.
> - **Réponse à « d'autres sections ? »** : la boucle d'approbation était la pièce clé manquante (ajoutée). Pistes proposées au user pour la
>   suite : (a) **boucle de calibration** (predict → ship → measure → recalibrate) en 2ᵉ schéma animé ; (b) **grounding** (le run lit ton
>   archi/décisions/conventions avant de proposer). → en attente de son choix.

> ### ⚑ v107 (04/08) — Correctifs Attio : rayures PROGRESSIVES, fonds 100% BLANCS, points fins + hero only, CTA sans points
> Retours user sur v106 : (1) « t'abuses » — le striped remplissait **toute une section** ; le rendre **progressif** (fondu) = une
> **transition**. (2) **« pas de bg autre que blanc pour nous »** → retirer le **gris** ET le **NOIR**. (3) points = **seulement le hero**
> (« bg n°1 ») et **plus petits** (Attio en a des plus petits). (4) **« pk des points dans le bg du CTA ? »** → zéro point sur le CTA.
> - `global.css` : **`.bg-dots`** points plus fins (`0.7px`, trame `20px`) — hero uniquement. **`.bg-striped`** masque **haut→milieu**
>   (`linear-gradient(#000, transparent 42%)`) → rayures nettes en haut puis **fondues** = transition depuis la section du dessus (plus de
>   remplissage). **Supprimé `.section-dark` + `.bg-dots-dark`** (le noir n'est plus utilisé).
> - `orchestration.astro` : Bento **`bg="card"`** sans `pattern` (blanc, sans points) ; StatBand **`bg="card"`** (blanc) ; **le moat
>   repasse en BLANC** (énoncé `.t-h2` + 4 colonnes à filets, icônes ligne) ; CTA **sans `field`**.
> - `PageCta` : retiré `DotField`/`field`/`decor-dots` → **carte propre** (halo bleu discret), **aucun point**. `DotField.tsx` désormais
>   inutilisé (gardé, réutilisable). `Bento.pattern` et `.decor-dots` dormants aussi.
> - Résultat : page **quasi tout blanc**, seuls motifs = **points fins du hero** + **rayures progressives** (transition vers « The team »).
>   Vérifié Brave ✅ (points plus petits confirmés au zoom, rayures fondues, moat blanc, CTA sans points). Build 68 OK.
> - Note : le **CTA + footer** gardent une bande **gris très clair** (pré-existant, sépare la carte flottante) — à blanchir si tu veux du 100% blanc.

> ### ⚑ v106 (04/08) — Orchestration REFAITE façon Attio : fonds de SECTION alternés + hero à graphe de run
> User : « je te parle des **fonds de SECTION** (points / striped / vide / **noir**), pas des fonds de cartes ». Ils **alternent** (façon
> **attio.com/platform/workflows**), une seule couleur en plus = **noir** sur certaines sections. Reprendre le **hero d'Attio** (graphe de
> workflow) pour orchestration ; **aucun screenshot d'app** (comme Attio → cohérent avec D11, on n'a pas l'app). « Refais orchestration ».
> - **Recon Attio dans le Brave du user** : motifs = **points** (hero/témoignage/feature), **rayures verticales** (sections agents), **vide**,
>   et **NOIR** (« Powered by Universal Context™ » : texte blanc + colonnes à filets pointillés + icônes). Confirmé : zéro screenshot d'app.
>   Leurs **animations** (pluie de traits sur le noir, graphe animé) → nous on reste **statique** (déciz + honnêteté + soutenance).
> - **`global.css`** : fonds de SECTION **`.bg-dots` / `.bg-striped` / `.bg-dots-dark`** (motif en `::before` masqué haut/bas → transitions
>   douces ; encre neutre, aucune couleur ajoutée) + **`.section-dark`** (`#0b0b0d`, texte clair). **≠ `.decor-*`** (qui décorent une carte).
> - **`Bento`** : nouveau prop **`pattern`** (`dots`｜`striped`).
> - **`orchestration.astro` refait** (alternance des fonds : **points / vide / rayures / points / vide / NOIR / vide**) :
>   1. **Hero 2 col** — texte + **graphe de run** (Trigger→CPO→CTO→COO→branche Execute/QA), badges Approved/Running/Queued, chips owner
>      (violet/bleu/ambre). Fond **points**. Badge **PLANNED** + légende **« Illustrative »** (honnêteté).
>   2. Problème (CalloutBand) — **vide**. 3. **L'équipe** — 3 **colonnes à filets** (structure par traits), fond **rayures**.
>   4. Inside a run — **bento** (mémoire/prédiction/modèles), fond **points**. 5. Preuve (StatBand) — **vide** (reverti le panel/dots-carte de
>      v104). 6. **Le moat = SECTION NOIRE** (façon Universal Context) : titre blanc + 4 colonnes à filets blancs. 7. CTA — champ de points gardé.
> - **Honnêteté** : **aucun screenshot d'app** (comme Attio) ; graphe illustratif + PLANNED + note CTA ; **vert uniquement** sur le badge
>   sémantique « Approved » (comme le « Completed » d'Attio), **pas de vert de marque**. ⚠️ à confirmer si le user préfère zéro vert du tout.
> - Vérifié Brave : ✅ transition gris→**NOIR** franche, graphe + colonnes à filets nets, motifs de section subtils. Build 68 pages OK.
> - Reste : décliner le système (**fonds de section alternés + pas de screenshot d'app**) aux autres pages produit si validé.

> ### ⚑ v105 (04/08) — Décisions user posées : DotField INTERACTIF (CTA) + Labs = PixelBlast FIGÉ (statique, warm)
> Réponses user à v104 : (1) ajouter le **DotField interactif** sur 1-2 spots ; (2) Labs en **pixel/dégradé statique** (couleurs
> hero-wave) — on **ne revient PAS** sur « zéro animation Labs » (déciz 03/08 respectée).
> - **`DotField.tsx`** (nouvel îlot React, `src/components/site/decor/`) : portage React Bits, **zéro dépendance** (canvas natif, 3.9 kB /
>   1.7 kB gzip). Adapté TaskForce : couleurs **bleu de marque** (pas le violet par défaut), `pointer-events-none`, garde
>   **`prefers-reduced-motion`** (une image figée, aucun RAF), masque de fondu vers les bords (comme `.decor-dots`).
> - **`PageCta`** : nouveau prop **`field`** → rend le DotField interactif (`client:visible`) au lieu des points statiques. Activé sur
>   **orchestration uniquement** (1 spot, parcimonie) ; les autres CTA gardent les points statiques. Vérifié Brave : champ de points bleu
>   qui réagit au curseur (bulge + halo). ✅
> - **Labs (statique)** : `.labs-pixels` = **PixelBlast FIGÉ** — petits carrés warm (palette hero-wave) via **data-URI SVG**, concentrés
>   sur les **bords** par un masque → « pixels autour / transition ». + `.labs-glow-top` (halo warm). Posés (`decor labs-pixels
>   overflow-hidden`) sur **2 sections Labs** (« experiments » + « loop ») → au bord commun, les deux bandes forment une **transition de
>   pixels**. **Zéro three.js**, statique. Vérifié Brave. ✅
> - Reste : calibrer l'intensité si besoin (actuel = très subtil, `opacity .14`) ; décliner ailleurs si validé (hero, autres pages).

> ### ⚑ v104 (04/08) — Décor subtil « bg arrondi + points/dégradé » (façon React Bits DotField) en STATIQUE, parcimonie
> User : garder la plupart des sections **blanches** ; ajouter **avec parcimonie** des sections à **fond arrondi** + des **touches
> dégradé/points** (genre `DotField` de React Bits) sur les bords / transitions ; **garder la structure par traits** (page / section /
> interne) ; **nos couleurs** (pas le violet par défaut). PixelBlast réservé à Labs.
> - **Choix technique : STATIQUE, zéro JS.** Esthétique DotField reproduite en CSS (pas de canvas/RAF) → perf + sobre + pas de risque
>   « trop IA » (soutenance). Utilitaires dans `global.css` : **`.decor`** (contexte) + **`.decor-dots`** (nappe de points bleus, masque
>   radial → ne remplit jamais, ne touche pas les bords) + **`.decor-glow-top`** (halo bleu de transition) + **`.decor-tint`** (fond bleu
>   très léger pour un panneau arrondi).
> - **Appliqué avec parcimonie** : `PageCta` (dots + `surface` au lieu de `border`) ; `StatBand` (nouveaux props **`panel`/`dots`** →
>   panneau arrondi tinté + points), posé sur orchestration (`<StatBand … panel dots />`). Le reste des sections reste blanc. Structure
>   interne gardée (les `md:border-l` des chiffres, les hairlines du bento).
> - **Couleur = bleu de marque.** Le dégradé chaud **hero-wave** (`.labs-gradient`, palette de `public/labs/hero-wave.jpg`) reste **réservé
>   à Labs** (règle DA : warm/violet = marquage Labs/IA uniquement). Vérifié Brave : StatBand = panneau bleu-gris + points fondus ; CTA =
>   carte arrondie + points + halo bleu. ✅ Build 68 pages OK.
> - **⚠️ EN ATTENTE de 2 décisions user** : (1) **DotField interactif** (canvas réactif au curseur) sur 1–2 spots, ou rester statique ?
>   (2) **PixelBlast animé sur Labs** = **revient sur la décision 03/08** « Labs clair, image fixe, **zéro animation** » (cf. mémoire
>   `labs-dark-scoped-world`) + ajoute `three` + `postprocessing` + risque « trop IA » soutenance. Alternative proposée : fond pixel/dégradé
>   **statique** aux couleurs hero-wave. → à trancher avant de coder.

> ### ⚑ v103 (04/08) — Orchestration refaite en BENTO (21st.dev adapté) : fini les ScreenPlaceholder vides + les cartes identiques
> User : page orchestration « naze » (3 placeholders vides + 3 `FeatureCard` identiques) ; « reprends les composants 21st.dev, adapte-les
> en **vrais composants**, **uniquement orchestration**, et **supprime les composants inutilisés** (vérifie qu'on les utilise nulle part) ».
> 4 blocs fournis : Aceternity `feature-section-with-bento-grid`, Ruixen `combined-featured-section` + les 2 d'avant (ruixen-feature / tailark).
> - **Nouvelle primitive réutilisable** : **`Bento.astro`** (grille 6 col, filets `gap-px bg-border` + `.surface`) + **`BentoCell.astro`**
>   (`span` = third｜half｜twothirds｜full ; icône ; `tag`/`tagTone` = chip d'honnêteté « Coming next »/« Illustrative » ; slot = visuel réel).
>   Portée à NOTRE système : tokens TaskForce, thème clair, **zéro dépendance** (pas de cobe/framer-motion/recharts/dotted-map — on garde la
>   structure bento, pas le poids). On prend la **structure**, pas la DA (aucun vert, aucun logo/faux client des exemples).
> - **`orchestration.astro` refait** : hero = **mock du moment de décision** (proposition CTO + rail de progression 7 étapes + boutons
>   *Approve* / *Request changes* + « Nothing proceeds until you approve ») au lieu du placeholder vide ; « Inside a run » = **bento 5 cellules**
>   (7 checkpoints · mémoire · équipe CPO/CTO/COO · prédiction « Coming next » · vos modèles Ollama $0/hosted) — **contenu réel, plus un seul
>   placeholder vide sur la page**. Gardé CalloutBand (problème) / StatBand (7·3·1·$0) / BorderedGrid (moat) / PageCta.
> - **Supprimés** (grep : utilisés nulle part ailleurs) : **`FeatureCards.astro`** + **`FeatureCard.astro`** (n'étaient importés QUE par
>   orchestration) + **`Faq.astro`** (jamais placé). ⚠️ `FeatureCards()` dans `home/Showcase.tsx` = fonction locale distincte → non touchée.
> - **D11/honnêteté** : pill « Preview » sur la fenêtre, chip « Coming next » sur la prédiction, badge « Planned » + note CTA ; « 9 » hors-cible
>   en **ambre** (pas de vert, sensibilité user à la DA Relay). Le bandeau sombre en bas des captures = **dev toolbar Astro** (pas un bug).
> - **Vérifié dans le Brave du user** (`localhost:18081`, `astro dev`) : `npm run build` 68 pages OK + parcours complet capté (hero décision →
>   problème → bento varié → stats → moat → CTA). Rendu premium et cohérent, aucune section vide. ✅
> - Reste : décliner le Bento aux autres pages produit **si validé** ; PUIS héberger (Docker + CF tunnel déjà prêts & validés).

> ### ⚑ v102 (03/08) — Évolution DA d'après les design systems (hermes-agent) : surface premium « shadow-as-border »
> User : « on fait évoluer le site d'abord, hébergement ensuite ». Source design = **`NousResearch/hermes-agent` →
> `skills/creative/popular-web-designs/templates/*.md`** (54 design systems : linear.app, vercel, raycast, cursor, warp, supabase,
> stripe, framer, notion, claude…). Cloné en scratchpad. Étudié Linear / Vercel / Raycast.
> - **Leçon Vercel (light, notre pair)** : « **shadow-as-border** » = `box-shadow 0 0 0 1px rgba(0,0,0,.06)` + élévation douce
>   multi-couches, au lieu d'une bordure 1px dure → rendu bien plus « produit ». Ajout **`.surface`** (+`.surface-hover`) dans
>   `global.css`, appliqué à **`FeatureCard` / `Panel` / `ScreenPlaceholder`** (retiré `border shadow-sm`, gardé `bg-card rounded-*`).
>   **Vérifié dans le Brave du user** : cartes « Inside a run » + écrans = ombre-bordure douce, flottantes, plus premium. ✅
> - Typo display déjà serrée (Sora, 500, -0.035em) → pas touché. DA = bleu/nos jetons (zéro vert Relay).
> - **Reste** : décliner `.surface` aux autres cartes (BorderedGrid…), varier + placer FAQ + diversifier via les autres design
>   systems (Linear/Raycast pour le rythme, sections type Vercel), rollout pages, PUIS héberger (Docker+CF tunnel déjà prêt & validé).
>

> Le user fournit `github.com/akash3444/shadcn-ui-blocks` pour diversifier + veut **une 1re version en ligne CE SOIR sur la VM**.
> - **Survey du repo** (cloné en scratchpad) : hero×8, features×18, stats×11, faq×14, cta×7, logo-cloud×15, pricing×10,
>   testimonials×13, footers×7 — dans `src/registry/blocks/{base,radix,shared}`. `shared` = markup le + portable (Tailwind + nos
>   jetons `bg-card`/`text-muted-foreground`/`text-primary`, juste `dark:` à retirer). **Pertinents** : features/stats/faq/logo-cloud/cta.
>   **Skip testimonials** (pas de faux témoignage — D11).
> - **Livré** : **`Faq.astro`** (adapté de `faq-04`, DA TaskForce, réutilisable via `items`) — nouveau type de section qui nous manquait.
>   ⚠️ Copie FAQ = à écrire/valider (nouvelle copie → D11). Pas encore placée sur une page.
> - **DÉPLOIEMENT (réponses user : Docker pas k8s ; expo = Cloudflare Tunnel)** : k8s **inutile** pour un site statique. `Dockerfile`
>   existant corrigé (**copie `.npmrc`** sinon `npm ci` casse sur le peer vite@8) + **`.dockerignore`** + **`docker-compose.yml`**
>   (service `landing` = `serve dist` sur 4321 + `cloudflared` avec `TUNNEL_TOKEN`) + `.env.example`. cloudflared = sortant → OK
>   derrière le NAT école. Public hostname CF → `http://landing:4321`. **Build image en cours (bg) pour valider le Dockerfile.**
> - **Bug attrapé + corrigé** : le Dockerfile lançait `serve -s dist` (**mode SPA**) → toutes les **sous-pages `/product/*`
>   renvoyaient la HOME. Corrigé en `serve dist` (multi-pages). **Image BUILD + SERVE validés en local** (docker run + curl) :
>   `/`, `/product/orchestration` (« Orchestration — TaskForce »), `/product/brain-os`, `/pricing` = **200 + bons titres**.
> - **Déploiement PRÊT** (Dockerfile + compose + .env.example, image prouvée). Manque juste, côté user : créer le **tunnel CF**
>   (token) et confirmer **domaine CF** (URL stable) vs **quick tunnel** (`*.trycloudflare.com`).
> - **Reste (en attente réponse user)** : placement de la **FAQ** (home ? chaque page produit ?) ; adapter d'autres blocs
>   (features/stats/logo-cloud). ⚠️ La notif de fin de build n'est PAS une réponse user — questions domaine/FAQ toujours ouvertes.
>

> Retour user : « hero centré OK, la section cards OK, mais **tout le reste n'a pas bougé** » → seules hero+cards avaient le
> traitement Relay ; le reste = ancien kit plat. Fix : **la section « The run » (liste numérotée nue) → `FeatureSplit` + gros
> `ScreenPlaceholder` sticky** (les 7 étapes à gauche, écran « run board » à droite). Build 68 OK.
> - **Vérifié section par section dans le Brave du user** — orchestration cohérente de bout en bout : Hero(écran) → Problem
>   (statement) → **Run (split + écran)** → StatBand → **Inside a run (cartes mini-mockup)** → **Your models (spotlight + écran)** →
>   Moat (statement + BorderedGrid) → CTA. **3 écrans d'app + cartes + stat band**, tout en **bleu TaskForce** (0 vert).
> - Les « statements » (Problem, Moat) restent volontairement texte (respirations, comme les intros de section chez Relay).
> - **Orchestration = MODÈLE finalisé et validé visuellement.** Prochain : décliner CE niveau (chaque section a un visuel/écran,
>   pas juste hero+cards) sur brain-os (déjà hero OK) puis approvals/smart-assign/agents/analytics/integrations/collaboration.
> **➜ Recharger /product/orchestration (scroll complet).**
>

> ### ⚑ v99 (03/08) — Rollout template : brain-os passe au hero cohérent (centré + ScreenPlaceholder) + rappel DA
> Rappel user : **la DA reste TaskForce (bleu primaire, noir/blanc, PAS de vert)** — on ne reprend que la STRUCTURE de Relay, pas
> sa couleur verte. Tout est déjà sur `--primary` (bleu). Aussi : peu d'update VISIBLE sur orchestration ce tour car c'était surtout
> **interne** (extraction du composant `FeatureCards` réutilisable = même rendu) + 1 section (spotlight « Your models »).
> - **Vérifié dans le Brave du user** : orchestration EST bien à jour (hero centré + ScreenPlaceholder + cartes) — servi correctement.
> - **brain-os** : hero passé en **`align="center"` + gros `ScreenPlaceholder`** → **cohérent avec orchestration**. Le reste (DecisionGraph
>   en FeatureSplit, 4 points en BorderedGrid, « how it fits » en FeatureSplit, CTA) était déjà sur le kit. **Build 68 OK, vu OK Brave.**
> - **2 pages cohérentes** (orchestration modèle + brain-os). **Reste** : approvals/smart-assign/agents/analytics/integrations/
>   collaboration → même hero cohérent + template, contenu propre, vérif Brave. (agents/analytics/integrations encore en version
>   d'origine ; approvals/smart-assign/collaboration en ancien kit → à aligner sur le template.)
> **➜ Recharger /product/brain-os (onglet piloté) + /product/orchestration.**
>

> ### ⚑ v98 (03/08) — Orchestration = MODÈLE complet du template (spotlight ajouté) ; `Spotlight` = `FeatureSplit` + `ScreenPlaceholder`
> **Pas de nouveau composant Spotlight** : un « spotlight » = **`FeatureSplit` + `<ScreenPlaceholder>`** (texte + gros écran vide, côtés
> alternés). Ajouté à orchestration un spotlight **« Your models »** (FeatureSplit `reverse` + ScreenPlaceholder « runtime & models »)
> après les FeatureCards ; moat BorderedGrid passé en `bg="secondary"` pour alterner. **Build 68 OK.**
> - **Template produit COMPLET sur orchestration** (modèle de référence) : Hero centré + ScreenPlaceholder → CalloutBand problème →
>   timeline « The run » → StatBand → **FeatureCards** (3 mini-mockups) → **Spotlight** (FeatureSplit+ScreenPlaceholder) → **BorderedGrid**
>   moat → PageCta. Vérifié Brave : hero + FeatureCards OK ; spotlight = build OK (à confirmer au scroll complet).
> - **Prochain (rollout, feu vert user)** : décliner CE template sur agents/analytics/integrations/brain-os/approvals/smart-assign/
>   collaboration — contenu propre + honnête à chaque, structure identique, **vérif Brave page par page**. (Les 4 pages « v94 » sont sur
>   l'ANCIEN kit → à repasser sur le nouveau template.)
> **➜ Recharger /product/orchestration (scroll complet).**
>

> ### ⚑ v97 (03/08) — Template produit COHÉRENT (page /feature de Relay) + composant réutilisable FeatureCards
> Retour user : « t'as regardé le hero mais pas la page /feature ». Les pages feature de Relay ont **toutes la même
> structure, contenu différent** → il nous faut un **template produit cohérent, réutilisé** sur toutes les pages.
> - **Étude `relay-nextjs-template.vercel.app/feature` (Brave)** — structure type : (1) hero titre centré + gros screenshot ;
>   (2) eyebrow + **4 cartes icône** (« Read more ») ; (3) **spotlight + bento de cartes à mini-mockup** (3 + 2 larges) ;
>   (4) **spotlight feature** (texte + gros mockup d'app, côtés alternés) ; (5) **bandeau CTA** avec visuel.
> - **Composant réutilisable extrait** : **`FeatureCards.astro`** (section en-tête centré + grille) + **`FeatureCard.astro`**
>   (carte = mini-mockup encadré via slot `viz` + titre + desc + chip slot `cta` / `link`). Chrome IDENTIQUE partout → cohérence.
>   Orchestration « Inside a run » **refait avec ces composants** (mêmes cartes validées par le user). Build 68 OK.
> - **TEMPLATE PRODUIT retenu** (à décliner sur toutes les pages) : Hero(`align=center` + `ScreenPlaceholder`) → `FeatureCards`
>   (3 mini-mockups) → `Spotlight` (texte + gros ScreenPlaceholder, **à construire**) → `StatBand`|`BorderedGrid` → `PageCta`.
> - **Reste** : construire `Spotlight.astro`, finir orchestration en modèle, puis **décliner le template** sur agents/analytics/
>   integrations/brain-os/approvals/smart-assign/collaboration (contenu propre à chaque), vérif Brave à chaque page.
> **➜ Recharger /product/orchestration (section « Inside a run »).**
>

> ### ⚑ v96 (03/08) — Hero = screen placeholder + étude Relay (Cruip) + « Inside a run » en cartes Relay
> Direction user : **hero validé** (centré, ne plus toucher) → remplacer le board par un **écran placeholder VIDE** (l'app à venir) ;
> et **refaire le reste des sections** en s'inspirant de **Relay** (`relay-nextjs-template.vercel.app`, template Cruip **dark**).
> - **Hero** : board kanban remplacé par **`<ScreenPlaceholder ratio="16/9">`** (grand, max-w-5xl). Vu OK dans Brave = propre.
> - **Étude Relay (vue dans Brave)** — patterns à reprendre (adaptés **light + honnête**, pas de faux « 12M builds »/témoignages) :
>   hero titre géant + **mot en dégradé** + gros **screenshot d'app** + halo ; **feature cards avec MINI-MOCKUP** (petit widget de
>   contenu réel en haut de carte) ; **onglets verticaux** (liste à filets + soulignage actif) + gros mockup ; **spotlight** (titre
>   dégradé + diagramme de nœuds reliés) ; **stat band** ; en-têtes centrés (eyebrow accent → gros H2 → sous-titre muted).
> - **« Inside a run » refait en CARTES façon Relay** : 3 cartes, chacune avec un **mini-mockup encadré de contenu réel** (owners
>   CPO/CTO/COO ; table prédiction `~6j→5j` ; items mémoire) + titre + desc + chip/lien. Remplace les FeatureRows « maigres ».
>   `FeatureRows`/`FeatureRow`/`INSIDE` retirés d'orchestration (composants gardés, utilisés ailleurs). **Vu OK dans Brave.**
> - **Workflow gagnant** : je vois + vérifie chaque change dans le **Brave du user** (2 onglets : orchestration + Relay en réf).
> - **Reste** : décliner le template (hero + cartes mini-mockup + en-têtes centrés) sur le reste des sections & les autres pages
>   produit ; option accents dégradés + halo hero. **➜ Recharger /product/orchestration.**
>

> ### ⚑ v95 (03/08) — ENFIN un vrai retour visuel (Brave) + fix hero orchestration (centré + board)
> Décisions user : lib = **Tailark** ; vérif = **via son Brave** (extension claude-in-chrome connectée). ✅ J'ai pu **voir** le rendu
> réel pour la 1re fois (le pane intégré est mort en 0×0 → source des allers-retours à l'aveugle).
> - **Diag visuel d'orchestration** : le **hero était à moitié vide** (texte à gauche, moitié droite morte) = le vrai « pas bon ».
>   Le reste est en fait **propre** (board kanban, StatBand, BorderedGrid, timeline). Seul point faible restant : les **visuels
>   « Inside a run » trop maigres**. Le **truc sombre en bas** = la **dev toolbar d'Astro** (dev only, absente en prod) → pas un bug.
> - **Fix livré + vérifié** : hero passé en **`align="center"`** + le **board d'un run remonté DANS le hero** comme visuel (fini le
>   vide à droite ; section « A run » séparée supprimée). Build 68 OK, vu OK dans Brave.
> - **À suivre** : étoffer les visuels FeatureRows (vrais écrans / ScreenPlaceholder) + accents Tailark, puis décliner le template.
>   Reste aussi : finir agents/analytics/integrations + hub (non faits, coupés par la limite v94).
> **Nouveau workflow** : je vérifie désormais dans le Brave du user (screenshot) avant de livrer — plus d'aveugle.
> **➜ Côté user : recharger /product/orchestration.**
>

> ### ⚑ v94 (03/08) — Refactor produits sur le kit (4/7 faits) + `ScreenPlaceholder` — batch coupé par la limite de session
> Demande user : refactor complet de **toutes les pages produit** sur le kit, diversifié, avec **écrans placeholder vides** +
> anim optionnelles. Ajout **`ScreenPlaceholder.astro`** (écran VIDE propre : barre fine + grille pointillée + halo + « Preview »,
> ratio réglable) — c'est l'emplacement honnête d'un futur screenshot (pas un faux produit).
> - **Refactor lancé en parallèle (7 sous-agents, spec « restructure-only » : copie VERBATIM, D11, pas de dark:, kit + modèle
>   orchestration).** La **limite de session** (reset 19:10 Toronto) a coupé le batch en cours.
> - **FAITS (build OK, vérifiés : 0 `dark:`, 0 contenu inventé, kit importé)** : **`approvals`** (BorderedGrid + 2 FeatureSplit +
>   CalloutBand + ScreenPlaceholder), **`brain-os`** (DecisionGraph gardé en FeatureSplit + BorderedGrid + ScreenPlaceholder),
>   **`collaboration`** (CollabBoard gardé + FeatureSplit+ScreenPlaceholder + FeatureRows + CalloutBand), **`smart-assign`**.
> - **RESTE À FAIRE** (fichiers **intacts**, versions d'origine, site cohérent) : **`agents`**, **`analytics`**, **`integrations`**
>   + le hub **`product/index`**. À finir **moi-même** (moins cher que les agents) après reset.
> Vérifié : **build 68 OK**, `grep dark:|fake` = 0, imports kit présents sur les 4 pages. **Layout non vérifié** (pane 0×0).
> **➜ Côté user : les 4 pages sont recharge­ables ; je termine les 3 restantes + le hub ensuite.**
>

> ### ⚑ v93 (03/08) — DA « petits traits » : archétypes FeatureRows + BorderedGrid (façon Tailark/Linear)
> Le user a fourni 2 composants 21st.dev (Ruixen + Tailark content-block) comme **inspiration de DA** : structurer avec des
> **FILETS** (dividers) et en faire des **variantes réutilisables** à poser où c'est pertinent.
> - **On ne copie PAS le code** (framer-motion casse les îlots Astro ; next/image, react-icons, faux « 22M users »/témoignages =
>   contre D11). On reprend **la DA (petits traits), pas les données**.
> - **Nouveaux archétypes** : **`FeatureRows.astro` + `FeatureRow.astro`** (lignes visuel↔texte séparées par `sm:divide-y` /
>   `sm:border-l`, `reverse` alterne le côté, slots `viz`/`aside`) et **`BorderedGrid.astro`** (cellules à filets 1px
>   `gap-px bg-border`, cols 2｜3｜4). ⚠️ **Slots Astro = noms statiques** (`viz-${i}` refusé → pattern composé wrapper+row).
> - **Orchestration** : les **3 splits répétés (team/predict/memory) → 1 seule section `FeatureRows`** « Inside a run » (3 lignes
>   à filets, visuels = **contenu réel léger** : rôles CPO/CTO/COO, prédiction→réel, exemples mémoire + chip « Coming next » +
>   lien Memory). Les **4 principes → `BorderedGrid`** (4 cellules à filets). Plus court, plus structuré, moins de « splits » d'affilée.
> Vérifié (DOM) : **build 68 OK**, **0 console**, FeatureRows = **3 lignes** avec **filets `border-l`** + viz réels (team/calib/memory)
> + chip + lien ; BorderedGrid = **4 cellules** sur `gap-px` (fond = couleur `--border` `rgb(230,230,233)` → filets 1px). 5 h2.
> ⚠️ **Layout non vérifiable** (pane preview toujours en viewport 0×0) → **rendu 2 col / mobile à juger dans un vrai navigateur.**
> ⚠️ Violet (×3, lane CPO) toujours là. **➜ Recharger /product/orchestration.**
>

> ### ⚑ v92 (03/08) — Orchestration : passe « épuré » calée sur la structure d'Attio (call-intelligence)
> Retour user : « ça me va plus ou moins, **c'est pas très épuré** » + a fourni l'URL `attio.com/platform/call-intelligence`
> à reprendre. WebFetch de la page → playbook épuré : **hero texte seul** (le gros visuel a SA propre section juste après),
> **un seul focal + copie très courte (1 ligne) par section**, **beaucoup de blanc**, **jamais de grille de cartes identiques**
> (séquences numérotées / splits alternés), on **alterne la densité** (texte léger → gros visuel → séquence → chiffres).
> - **Orchestration réécrite épurée** : hero **texte seul** (board sorti du hero → section « A run » dédiée, board centré `max-w-3xl`).
>   **Copie coupée fort** (lead hero 45→**13 mots**, tous les leads en 1 ligne, `desc`/`predicts` raccourcis). « The run » = **séquence
>   numérotée** centrée (les 2 gros encadrés « what a checkpoint is » + note d'approbation → **une seule ligne** discrète).
>   Team = split + 3 rôles **allégés** (predicts en 1 ligne italique, plus de boîte). Predict/Memory = splits + `Panel` contenu réel.
>   Moat = affirmation + principes en **ligne d'icônes** (pas de cartes). StatBand sans titre. **10 sections, ~toutes 1 focal.**
> Vérifié (DOM) : **build 68 OK**, **0 console**, hero **sans** panel (board déplacé), lead hero **13 mots**, 6 h2 de section,
> 3 `Panel` réels (board/calib/memory), run = 7 étapes, tags « Illustrative ».
> ⚠️ **Layout TOUJOURS non vérifiable** : le pane de preview est **bloqué en viewport 0×0 depuis plusieurs tours** (aucun
> compositing → screenshot KO, tout s'effondre en min-content ~250px). **Overflow / 2 colonnes / kanban mobile NON vus.**
> → build OK + classes std, mais **à juger dans un vrai navigateur** ; si un truc cloche, le user envoie un screen, je fixe au pixel.
> ⚠️ **Violet (×5)** : lane CPO, non tranché.
> **➜ Côté user : recharger /product/orchestration dans un vrai navigateur.**
>

> ### ⚑ v91 (03/08) — Visuels de section = CONTENU RÉEL (Panel), skeleton MockSurface supprimé
> Retour user sur la v90 : les **placeholders « faux screenshot avec des graphs »** (`MockSurface` skeleton) sont **nazes** →
> « t'es pas obligé de mettre des screens, intègre du vrai contenu avec les textes/les cards » (réf. Attio).
> - **`MockSurface.astro` SUPPRIMÉ.** Nouveau **`Panel.astro`** = cadre propre (pas de fausse barre navigateur, pas de skeleton),
>   à remplir de **contenu RÉEL**. Tag `Illustrative` pour l'honnêteté quand c'est conceptuel/Planned.
> - **Orchestration — visuels refaits en vrai contenu** :
>   - Hero → **kanban des VRAIS checkpoints** (les 7 étapes de `RUN` par état Approved/In review/Queued, badges owner).
>   - Team → les **3 rôles réels** (CPO/CTO/COO : rôle + desc + prédiction) comme visuel du split.
>   - Predict → **panneau prédiction vs réel** (Effort ~6j→5j, Issues 8→9, Latency +40ms→+32ms), tag « Illustrative · Planned ».
>   - Memory → **exemples réels de ce que la mémoire retient** (Decision/Constraint/Convention/Rejected) + boucle Memory→…→↺.
> Vérifié (DOM) : **build 68 OK**, **0 console**, 3 `Panel` rendus avec **vrai contenu** (titres de checkpoints, lignes calib,
> exemples mémoire), 3 tags « Illustrative », 6 h2 de section OK, plus aucun `MockSurface`.
> ⚠️ **Layout non mesurable** : le pane de preview a **totalement décroché** (viewport 0×0, aucun compositing → screenshot/scroll KO,
> tout s'effondre à 284px de min-content). **Overflow + rendu 2 colonnes/kanban NON vérifiés à l'œil** → build OK + classes std,
> mais **à confirmer dans un vrai navigateur** (extension Brave).
> ⚠️ **Violet (×5)** : toujours la lane **CPO** — pas encore tranché.
> **➜ Côté user : recharger /product/orchestration dans un vrai navigateur et juger (surtout mobile + 2 colonnes).**
>

> ### ⚑ v90 (03/08) — Bibliothèque d'archétypes de section + Orchestration refaite en PAGE MODÈLE
> Chantier « varier les sections » (retour user : partout « intro + 4 cards », besoin de storytelling quoi/pourquoi/comment/démo,
> réf. **Attio** — chez eux chaque section montre une **surface produit différente**, la grille de cartes n'apparaît qu'**une fois**).
> Décision user : **template + 1 page phare** d'abord.
> - **Nouveau kit `src/components/site/sections/`** (réutilisable, pose-une-fois-décline) :
>   - **`MockSurface.astro`** — visuel **PLACEHOLDER schématique** d'UI (kinds `board｜roles｜chart｜flow｜table`, `label`, `caption`,
>     `steps` pour flow). Wireframe volontaire + tag « Preview » + caption « Illustration — » → **honnête** (pas un faux screenshot).
>     C'est la clé de la variété « à la Attio » sans capture réelle (user : placeholders OK pour visuels/anim).
>   - **`FeatureSplit.astro`** — texte ↔ visuel alternés (`reverse`, `bg`, `sticky`, slot `aside`). **Remplace les grilles de cartes.**
>   - **`StatBand.astro`** — bandeau de 2-4 chiffres. **`CalloutBand.astro`** — une affirmation display pleine largeur.
> - **`/product/orchestration` = page modèle** : colonne vertébrale **Quoi** (hero + MockSurface board) → **Pourquoi** (CalloutBand)
>   → **Comment** (run = timeline 2-col ; team = FeatureSplit inversé + mock roles ; predict = FeatureSplit + mock chart ; memory =
>   FeatureSplit inversé + mock flow) → **Preuve** (StatBand 7·3·1·$0) → **CTA**. **9 sections, 9 formes différentes, 0 grille de
>   4 cartes** (les 3 rôles = lignes dans un split ; les 4 principes = grille SANS bordure). Copie produit conservée (D11 « Planned »).
> Vérifié : **build 68 OK**, **0 console**, **0 overflow (desktop + 375)**, 4 mocks rendus (board 3 col / roles CPO·CTO·COO / chart 7
> barres / flow Memory→Orchestration→Decision→Memory), captions « Illustration », StatBand 7·3·1·$0.
> ⚠️ **Non mesurable dans le pane** (viewport 0×0 → les media queries `lg:` ne calculent pas) : le rendu **2 colonnes** des splits ;
> classes `lg:grid-cols-2`/`lg:order-1` **présentes + compilées** → OK en vrai navigateur, à confirmer à l'œil.
> ⚠️ **Violet restant (×4)** : couleur de lane **CPO** (sémantique, validée 07/30) gardée — à trancher si tu veux la retirer aussi.
> **Reste (à ta validation) :** décliner le kit sur les autres `/product/*`, solutions, home. **➜ Recharger /product/orchestration.**
>

> ### ⚑ v89 (03/08) — Labs : refonte des 2 sections faibles (boucle = diagramme, graduated = vedette+liste)
> Retour user : les sections « The system » (boucle) et « graduated » juste en dessous sont **naze / serrées à droite /
> mêmes cartes** → les refaire, **balancées**, **pas un énième 4-cards**.
> - **Cause du « serré » :** intros `max-w-2xl` **alignées à gauche** + contenu `max-w-3xl` → tout collé à gauche, vide à droite.
>   Fix commun : **intros centrées** (`mx-auto text-center`) + contenu pleine largeur.
> - **Boucle → diagramme de flux centré** : `<ol>` de 6 nœuds numérotés (01→06), **piste horizontale** en dégradé qui les
>   relie (desktop, cachée en mobile où ça passe en grille 2/3 col), maturité par nœud (point + label), fermeture « ↺ … the loop
>   closes » entre deux traits dégradés. Plus de pilules qui wrappent.
> - **Graduated → asymétrique (vedette + liste)** au lieu de 4 cartes égales : **tuile vedette 3/5** (TaskForce Memory) avec
>   **visuel placeholder** (bandeau `labs-g6` + icône géante + tag « Graduated from Labs ») + blurb + « Explore » ; les **3 autres**
>   en **lignes compactes 2/5** (icône + nom + blurb + maturité). Blurbs honnêtes ajoutés à `GRADUATED` (fait produit réel).
> Vérifié : **build 68 OK**, **0 console**, **0 overflow (desktop + 375)**, boucle = 6 nœuds + piste (cachée mobile), vedette
> `col-span-3` + visuel dégradé + blurb, 3 lignes avec blurb, **0 violet**.
> **Chantier ouvert (non fait, à cadrer) :** le user veut **repasser tout le site** — trop de « intro + 4 cards » partout (surtout
> `/product/*`), besoin d'un **storytelling par page** (quoi / pourquoi / comment / démo) et de **structures de section variées**
> (réf. **Attio**). Placeholders OK pour visuels/animations. → livrer une **bibliothèque d'archétypes de section** + l'appliquer
> page par page. Voir plan proposé au user (03/08).
> **➜ Côté user : recharger /labs (Docker : redémarrer le service landing).**
>

> ### ⚑ v88 (03/08) — Labs : sujets en FEATURES (onglets + storytelling) + carte dropdown = fond du hero
> Retour user sur la v87 : (1) « le **bouton dans le menu**, mets-y le **même background que le hero** » ; (2) « **rien changé
> niveau sections**, c'est vide, mal structuré, aligné à gauche, mêmes composants — **faut innover**, un **système de tabs**,
> les sujets de recherche présentés en **features**, et **chaque partie a son storytelling** : pourquoi, le but, où on en est,
> les docs/démos ».
> - **Nouveau `LabsShowcase.tsx`** (îlot React autonome, **zéro dépendance** — onglets `useState` maison, nav clavier ↑↓←→
>   Home/End, rôles ARIA `tablist`/`tab`/`tabpanel`). Remplace la **grille plate** : rail vertical des 4 sujets à gauche +
>   **panneau riche** à droite (en-tête EXP + « Research », lead, puis blocs **Why it matters / Where it stands** en 2 colonnes,
>   **What we're chasing** = les 3 hypothèses en cartes, **Go deeper** = surface produit + maturité + liens roadmap). Données
>   = prop `SHOWCASE` construite dans `index.astro` depuis `labs.ts` (source unique). **Rien d'inventé** (D11).
> - **Intro de section centrée** (`text-center`) pour casser le tout-aligné-à-gauche ; sur mobile le rail d'onglets **scrolle
>   horizontalement** (`overflow-x:auto`). Icônes d'onglet = dégradé de trait (`labs-ic-*`), barre d'accent `labs-g5` sur l'actif.
> - **`client:load`** (et pas `client:visible`) : le pane de preview a un **viewport 0×0** → l'IntersectionObserver ne déclenche
>   jamais ; `client:load` garantit l'hydratation (+ vérifiable). Îlot below-the-fold léger, coût négligeable.
> - **Carte Labs du dropdown (`SiteHeader.tsx`)** : `!isLabs` inchangé ; pour Labs → **image `hero-wave.jpg` en fond** +
>   voile blanc dégradé (`from-white/90 via-white/75 to-white/45`, comme le hero), tuile d'icône `bg-card/90`, desc assombrie.
> Vérifié : **build 68 OK**, **0 console**, **0 overflow (desktop + 375)**, **bascule d'onglet OK** (appel du `onClick` React →
> `aria-selected` + panneau changent, 3 hypothèses par sujet), **0 violet**, `hero-wave.jpg` **200**, rail mobile scrollable.
> ⚠️ Le **menu déroulant** n'a **pas pu être ouvert visuellement** (pane sans compositing : screenshot/hover coordonnée KO) →
> vérifié le **markup (build) + l'asset (200)**, pas le rendu ouvert. À confirmer à l'œil côté user.
> **➜ Côté user : recharger /labs + ouvrir le menu Resources (Docker : redémarrer le service landing).**
>

> ### ⚑ v87 (03/08) — Header dropdown Labs cohérent (0 violet, icône-dégradé) + une vraie question par carte
> Retour user sur la v86 : (1) « le **bouton dans le dropdown** respecte pas ce que j'ai dit » ; (2) « les **sections sont
> naze**, on a rien à raconter ? ».
> - **Dropdown Labs (`SiteHeader.tsx`)** : la carte Labs violait encore les 2 règles → tuile de fond `labs-g3` (dégradé) +
>   label `text-violet-700`. Corrigé : **tuile neutre** `border bg-card` (comme les autres cartes, `background-image:none`),
>   **la fiole prend le dégradé de TRAIT** (`.labs-ic-head { stroke:url(#lgLabsHead) }`), **label en noir** (foreground). Idem
>   la fiole du **trigger « Resources »** : `text-[#ff6f91]` → `labs-ic-head` (dégradé). Le dégradé `lgLabsHead` (coral→bleu) est
>   déclaré par un `<svg>` caché **dans le header** (donc dispo sur **toutes** les pages, pas seulement `/labs`).
>   Vérifié menu ouvert : tuile `background-image:none`, `stroke=url("#lgLabsHead")`, label `rgb(29,29,31)`, **0 classe violet**.
> - **Sections « naze » → on a de quoi dire** : le hub n'exposait que le `lead` de chaque expérience alors que `labs.ts` porte
>   déjà, par expérience, **3 hypothèses réelles** (`exploring[]`). J'en affiche **une par carte** (citation en italique, bord
>   gauche) → chaque carte pose une **vraie question de recherche** (honnête, D11, rien d'inventé). Les 3 autres hypothèses +
>   le « why » + le statut restent sur la page détail. Vérifié : **4 citations** rendues (« Scoping an agent's responsibility… »).
> Vérifié : **build 68 OK**, 0 console, **0 overflow (1280)**, fiole header `url("#lgLabsHead")`, hero `url("#lgC")`, 0 violet page + menu.
> **Reste à trancher (toi) :** section « The system » (la boucle) = la plus abstraite ; on peut la muscler ou surfacer les 12 questions.
> **➜ Côté user : recharger /labs + ouvrir le menu Resources (Docker : redémarrer le service landing).**
>

> ### ⚑ v86 (03/08) — Labs clair : image PLEIN CADRE + icônes en dégradé (trait) + plus de violet + card CTA
> 5 retours user sur la v85 : (1) le bg doit prendre **toute la place** (comme le screen resserré) ; (2) **enlever les rails
> du hero** ; (3) au CTA **remettre la CARD** (juste l'image derrière) ; (4) **pas de fond derrière les icônes** → c'est le
> TRAIT de l'icône qui prend le dégradé ; (5) **plus de violet** → blanc/noir/bleu (primaire).
> - **Hero plein cadre** (`LabsBackdrop`) : image `absolute inset-0 object-cover` (100 % largeur) + voile blanc gauche +
>   renfort mobile. **Rails du hero retirés** : hero + CTA en `container-site` (les sections de contenu gardent `container-rail`).
>   Vérifié 1905px : image left 0 / width 100 %, `border-left:0`.
> - **Icônes en dégradé de TRAIT** : `LabsGradientDefs.astro` (nouveau : `<defs>` SVG `lgA..lgE`) + `global.css`
>   `.labs-ic-a..e { stroke:url(#..) }`, sur les icônes hero + 4 expériences (aucune pastille de fond). Vérifié `stroke=url("#lgC")`.
> - **CTA** : la **card** blanche (`rounded-3xl border shadow-xl`) est de retour, avec l'**image en fond de section** derrière
>   (voile blanc). `PageCta` non utilisé sur le hub.
> - **Plus de violet** (0 classe `violet`) : dégradés `.labs-g*`/`.labs-gtext` débiaisés (coral/rose/pêche/bleu, sans lavande) ;
>   « Open » en **bleu primaire** ; « Planned » en neutre (slate) ; header fiole `#ff6f91` + tuile `labs-g3`.
> Vérifié : **build 68 OK, lint 0**, 0 console, **0 overflow (1905/375)**, icônes dégradé OK, card CTA + image OK.
> **➜ Côté user : recharger /labs (Docker : redémarrer le service landing).**
>
> ### ⚑ v85 (03/08) — Labs clair : fix hero responsive + dégradés « image » + moins de cards + image sous le CTA
> Retours user sur la v84 (qu'il adore au format laptop) : (1) le hero **casse quand on agrandit** ; (2) reprendre les
> COULEURS de l'image en dégradés fixes « random » (icônes/labels/bouton Labs du header) ; (3) **trop de cards** → système
> de sections/rails (façon Linear) ; (4) remettre l'image **derrière le CTA**.
> - **Fix hero (`LabsBackdrop`)** : l'image occupe la **moitié droite du VIEWPORT** (`right-0 lg:w-[56%] xl:w-1/2`, bord à
>   bord) au lieu d'un `w-[64%]` qui décrochait du texte quand `container-rail` se centre. Vérifié 1905px : image = moitié
>   droite pile, H1 finit à 950 → **0 chevauchement, 0 overflow** ; 1145px = 56 % (look « aimé ») ; 375px renfort scrim, OK.
> - **Dégradés palette image** (`global.css` : `.labs-g1..g6` + `.labs-gtext`, couleurs tirées de `hero-wave.jpg`) : tuiles
>   d'icônes (hero + 4 expériences, chacune un dégradé distinct), « TaskForce Labs »/eyebrows/EXP en **texte clippé dégradé**,
>   **bouton Labs du header** (`SiteHeader` : tuile `labs-g3` + fiole `#ff6f91`). Fixes mais « random » dans le mood.
> - **Moins de cards** : expériences = **grille bordée** (`gap-px bg-border`, 1 bloc, pas 4 cartes) ; boucle = **stepper à
>   plat** (pills + flèches + point de maturité) ; graduated = **liste bordée** (`divide-y`).
> - **CTA** : image « verre liquide » en fond (2e `<img>` + voile blanc pour la lisibilité) — remplace `PageCta` sur le hub.
> Vérifié : **build 68 OK, lint 0**, 0 console, **0 overflow (1905/1145/375)**, gradients rendus (`labs-g4`/`labs-gtext`), 0 canvas.
> **➜ Côté user : recharger /labs (Docker : redémarrer le service landing).**
>
> ### ⚑ v84 (03/08) — Labs : REVIREMENT → CLAIR + images fixes + ZÉRO animation (sobre/pro)
> User : « laisse le thème en blanc, va chercher des images fixes, pas d'animation, on reste sobre et pro, plus de dark
> mode ». **Annule le monde sombre (v80-83) : D2 light-only redevient vraie PARTOUT.**
> - **Image** : `3d-sea-landscape.jpg` (fournie par le user dans Downloads) redimensionnée → `public/labs/hero-wave.jpg`
>   (2000px, **134 KB**, via System.Drawing PowerShell — pas de dép sharp, safe Docker). Vague « verre liquide » coral, premium.
> - **`LabsBackdrop.astro`** réécrit CLAIR/STATIQUE : image à droite (`object-cover`, lg:64%) + dégradé blanc (fort à
>   gauche = texte lisible, révèle la vague à droite) + fondu bas. aria-hidden, zéro animation.
> - **`labs/index.astro` réécrit** clair/sobre : BaseLayout défaut (blanc, plus de `bodyClass`/`LabsCurtain`), hero image
>   + violet mono ; expériences en **cartes statiques** ; **boucle en grille statique** (6 étapes, maturité réelle) ;
>   « graduated » ; `PageCta`. **`LabDetail.astro` réécrit** clair pareil.
> - **Débranchés mais LAISSÉS dans le repo** (le user a déjà flip-floppé dark↔clair) : FluidBackdrop, LabField, SystemGraph,
>   ResearchLog, LabsCurtain, ProximityText, DecryptedText, VariableProximity, border-beam, retro-grid. Le bloc CSS
>   `.labs-*`/`.labs-body` sombre de global.css est INERTE (non utilisé).
> - Contenu honnête conservé (D11 : aucune expé « Live », tout Research ◌, + surface produit & maturité réelle).
> Vérifié : **build 68 OK, lint 0 erreur**, 0 erreur console ; body **BLANC**, H1 dark lisible, image chargée (2000×1121),
> **0 canvas** (plus d'animation), sections présentes, 0 overflow ; détail `/labs/learning-from-reviews` idem.
> **➜ Côté user : recharger /labs (Docker : redémarrer le service landing). Glass gradients en réserve dans Downloads.**
>
> ### ⚑ v83 (03/08) — Labs : fond « verre liquide » fluide (retour user : style Microsoft 365 / glassmorphisme)
> User veut un fond FLUIDE façon Microsoft 365 (formes en verre, dégradé qui coule), pas le champ de points. Choix :
> **généré en code** (pas de stock Freepik → licence/perf) et **gardé sombre** (cohérent monde Labs ; flip clair possible).
> - **`FluidBackdrop.tsx` (nouveau)** — WebGL2 BRUT, zéro dép (comme LabField/RetroGrid, safe Docker) : dégradé
>   **domain-warpé** (bruit simplex, 3 octaves) qui coule ; palette sombre→violet→bleu→cyan→magenta ; **tiers gauche
>   assombri par le shader** → H1 lisible ; lueur curseur ; rendu **sous-échantillonné** (0.45–0.58×) pour la perf. IO-pause
>   + onglet caché, reduced-motion → image statique, tactile → dérive ambiante, 1re image synchrone. `variant="calm"` (détail).
> - **Hero (`index.astro`)** : `LabField` + son panneau de réglages remplacés par `<FluidBackdrop>` + **2 formes en verre
>   dépoli** (`backdrop-blur` + `bg-white/5` + bord, à droite, loin du texte) + vignette + scrim gauche.
>   **`LabsBackdrop.astro`** (héros détail) → `FluidBackdrop variant="calm"`. **`LabField.tsx` laissé mais INUTILISÉ**
>   (au cas où on re-bascule sur le champ de points).
> Vérifié : **build 68 OK, lint 0 erreur**, 0 erreur console ; le shader REND (pixel hero=violet [89,61,193], détail=cyan
> [44,150,189], canvas WebGL2), formes verre présentes, H1 lisible, 0 overflow. **L'animation ne tourne pas dans le pane
> (rAF/transitions gelés) → à valider en vrai navigateur.**
> **➜ Côté user : recharger /labs (Docker : redémarrer le service landing).**
>
> ### ⚑ v82 (02/08) — Labs : 4 vrais composants React Bits / Magic UI câblés (+ pièges Docker/Astro résolus)
> User a choisi les 4 : **Decrypted Text** (hero, décodage terminal), **Variable Proximity** (H2 system graph, graisse
> qui réagit au curseur), **Border Beam** (bord du panel Featured), **Retro Grid** (fond system graph). Tirés via
> `npx shadcn add @react-bits/… @magicui/…` (registres déjà dans `components.json`).
> - **`.npmrc` (nouveau)** : `legacy-peer-deps=true`. Le `npm install` interne du CLI plantait sur le conflit de peer
>   connu (vite@8 vs peer ≤7 de `@tailwindcss/vite`). Le projet s'installe déjà en `--legacy-peer-deps` → on le rend permanent.
> - **Intégration** (`labs/index.astro`) : DecryptedText enveloppe le H1 (`animateOn="view"`) ; BorderBeam dans le
>   `labs-panel` Featured (violet→cyan) ; RetroGrid remplace la grille de la section system graph ; VariableProximity via un
>   wrapper **`ProximityText.tsx`** (VP exige un `containerRef` impossible à passer d'Astro + code en dur « Roboto Flex » →
>   on force `var(--font-display)`, reduced-motion → `to===from`).
> - **Pièges résolus** (build passait mais le DEV plantait — esbuild strip les types, le SSR dev les évalue) :
>   1. **VariableProximity** importait des TYPES react en VALEUR (`MutableRefObject, CSSProperties, HTMLAttributes`) →
>      `[vite] Named export not found` au SSR dev → `import type`.
>   2. **`motion/react` dans un îlot = « Invalid hook call »** (double instance React sous Astro/Vite ; dedupe + optimizeDeps
>      + purge `.vite` n'ont PAS suffi). Fix robuste = **retirer `motion`** des 3 composants (il n'était que cosmétique) :
>      BorderBeam → animation CSS `offset-path` (`@keyframes border-beam-move`), DecryptedText/VariableProximity
>      `motion.span`→`span`. **Même parti pris que l'Aurora/ogl.** `astro.config` : `resolve.dedupe:['react','react-dom']` (hygiène).
>   3. **RetroGrid EST du WebGL** (pas de dép npm, comme LabField) MAIS embarque un voile bas `from-white … dark:from-black` ;
>      notre page n'a pas de classe `.dark` → blanc → masqué par un dégradé sombre par-dessus.
>   4. Diagnostic : **`read_console_messages` bufferise à travers les reloads** (montrait 4 erreurs fantômes) → sonde
>      `console.error` par-load (is:inline) pour valider **0 erreur réelle**.
> Vérifié : **build 68 pages OK, lint 0 erreur** ; hydratation saine (system graph interactif, clic Model → `/enterprise`),
> les 4 composants rendus, 2 canvas, 0 overflow, **0 « Invalid hook » (sonde par-load)**.
> **➜ Côté user : recharger /labs (Docker : redémarrer le service landing).**
>
> ### ⚑ v81 (02/08) — Labs : transition light↔dark (rideau noir) + fin de page SOMBRE (fix « blanc qui pique »)
> Retours user : (1) la cassure blanche en bas de Labs « fait mal aux yeux » ; (2) vouloir un « screen qui passe en noir »
> à l'entrée/sortie de Labs ; (3) explorer React Bits / 21st.dev.
> - **Fin de page sombre** : suppression des voiles `bg-gradient-to-b to-white` (index + LabDetail). La section « de la
>   paillasse au produit » et le CTA passent en SOMBRE (`labs-scope`/`labs-panel`, chips maturité en variantes sombres) →
>   Labs reste sombre jusqu'au footer (déjà sombre). `PageCta` remplacé par un CTA sombre inline (les 2 pages n'importent
>   plus `PageCta`). Nouveau `darkOutlineLg`.
> - **`LabsCurtain.astro`** (nouveau, sur index + LabDetail) : rideau `position:fixed inset-0 z-100 #080910`. Entrée = noir
>   → se lève (opacity 520ms). Sortie (clic hors /labs) = redescend en noir puis navigue (440ms). Nav INTERNE Labs (référent
>   /labs) = pas de rideau. `<noscript>` masque, `prefers-reduced-motion` désactive. **Filet** : à 1200ms si l'opacité n'a
>   pas abouti (env. sans compositing) → `display:none` en dur → la page n'est JAMAIS bloquée en noir. lift via `setTimeout`
>   (robuste, le rAF est throttlé au 1er paint).
> - **Lint** : rideau réécrit en `const/let` (règle `no-var`). **build 68 pages OK, lint 0 erreur.** Vérifié : fin de page
>   100% sombre (aucune section blanche), 0 overflow, rideau se retire (h1 visible), 0 erreur console.
> - **React Bits / 21st.dev explorés** (browser). **Garde-fou** : la plupart des BACKGROUNDS RB (Aurora, Beams, Balatro,
>   Liquid Ether, Plasma, Particles…) sont WebGL/OGL/Three → **piège dép Docker** (cf. v79). Picks SÛRS = effets de TEXTE
>   `motion` (déjà installé) : **Decrypted Text**, Variable Proximity, Text Type ; + **Magic UI** (registre `@magicui` déjà
>   dans components.json, CSS/SVG) : Retro Grid, Border Beam, Dot Pattern, Meteors. `LabField` maison gardé comme fond
>   (équivalent DotField sans dépendance). **Proposé au user, à câbler selon son choix (registres prêts).**
> **➜ Côté user : recharger /labs (Docker : redémarrer le service landing).**
>
> ### ⚑ v80 (02/08) — Labs : refonte « laboratoire R&D » — monde SOMBRE scoped + 3 interactions signatures
> Brief user : Labs doit se sentir « l'endroit où ils construisent le prochain » — dark-first, expérimental mais premium,
> **même produit / même identité / autre expression**. **Décision : Labs = son propre monde SOMBRE, scoped aux 5 routes
> `/labs`, PAS un dark-mode global** (D2 light-only reste vraie pour les 62 autres routes). La zone sombre finit par une
> transition nette vers le CTA/footer clairs (dark = la frontière, light = ce qui shippe).
> - **`BaseLayout.astro`** : 2 props ADDITIVES `bodyClass` (défaut `bg-white`) + `themeColor` (défaut `#fff`) — inchangé ailleurs.
> - **`global.css`** : bloc `.labs-scope` (jetons sombres `--labs-bg #080910`/fg/muted/hairlines/violet/blue) + helpers
>   `.labs-grid` (oscilloscope) `.labs-panel(-hover)` `.labs-vignette` `.labs-pulse` + typo `.labs-h1/2/3/lead/eyebrow`
>   (miroir des `.t-*` en encre claire ; les `.t-*` portent `color:var(--site-fg)` sombre → inutilisables ici). Rails re-teintés.
>   **Coque sombre par RE-MAP des jetons sous `.labs-body header/footer`** (bg-card/text-foreground/border… résolvent sombre)
>   + logo (mono `#1d1d1f`) inversé en blanc + viewport méga-menu (codé blanc dur) repassé sombre. **Zéro réécriture des composants partagés.**
> - **3 îlots `client:load`** dans `src/components/site/labs/` (les 3 interactions signatures) :
>   1. **`LabField.tsx`** — champ canvas 2D réactif au curseur (points/grille + sonde + liens de proximité), **zéro dépendance**.
>      Pause hors-écran (IO) + onglet caché, reduced-motion → image statique, tactile → dérive ambiante, **1re image SYNCHRONE**
>      (le rAF est throttlé au 1er paint / dans le pane non-composité). Mini-panneau « Customize the field » (Motion/Density/Grid),
>      ne touche QUE le visuel, `aria-pressed`, clavier, `hidden sm:block`.
>   2. **`SystemGraph.tsx`** — la boucle `Signal→Memory→Reasoning→Model→Evaluation→Decision→(retour)Memory`. Nœuds = vrais
>      `<button>` (hover/focus/tap), arêtes qui s'allument, panneau `aria-live`. **Honnêteté D11** : chaque étape → surface produit
>      RÉELLE + vrai badge (Memory Beta · Model Live · Approvals Beta · Reasoning Planned · Evaluation Research · Signal = Input).
>   3. **`ResearchLog.tsx`** — carnet « 2026 · Research log » à rail COLLANT (CSS sticky) + scroll-spy (IO). Les entrées SONT les
>      vraies expériences (`labs.ts`), reformatées. **Aucune fausse note datée.** Prop `omit` pour exclure la featured.
> - **`labs/index.astro` réécrit** : hero(field+controls) → **featured « Prediction & calibration »** (learning-from-reviews, honnête)
>   → research log (les 3 autres via `omit`) → **system graph** → transition sombre→clair « de la paillasse au produit »
>   (ce qui a diplômé : Memory Beta · Your models Live · Approvals Beta · Smart Assign Live) → `PageCta` clair → footer.
> - **`LabDetail.astro` réécrit** sombre cohérent ; **`LabsBackdrop.astro`** : ex-aurora crème → décor sombre (LabField calme
>   + vignette + voile). **`Aurora/Aurora.tsx` n'est plus utilisé par Labs** (fichier laissé, inerte).
> - **Statuts honnêtes** : AUCUNE expérience n'est « Live » — tout est **Research (◌)**, avec l'endroit où la direction affleure
>   (Live/Beta/Planned). Data `labs.ts` conservée, copie de fond inchangée.
> Vérifié live (dev:4321) : **build 68 pages OK**, **lint 0 erreur** (import `APP_URL` mort retiré) ; 0 erreur console ; body `#080910`,
> header/footer sombres + logo blanc ; field peint **287k px** ; graph interactif (clic Model → panneau + `/enterprise` + 2 arêtes) ;
> mobile 375 **sans overflow** (controls + rail masqués) ; détail `/labs/agent-roles` OK. **rAF throttlé dans le pane → animation en
> vrai navigateur (user), image statique garantie partout.**
> **➜ Côté user : recharger `/labs` ; si conteneur Docker, redémarrer le service landing (source montée → pas de rebuild).**
>
> ### ⚑ v79 (02/08) — Fix : Aurora sans `ogl` (WebGL brut) — erreur Docker /app
> User a eu « Cannot find module 'ogl' » au SSR dans son conteneur **Docker (/app)** : j'avais installé `ogl` sur mon
> host Windows (preview OK) mais le node_modules du conteneur ne l'a pas. Plutôt que rebuild/install dans le conteneur
> (friction + HMR Docker cassé), **suppression totale de la dépendance** :
> - **`Aurora/Aurora.tsx` réécrit en WebGL2 BRUT** : même shader React Bits (VERT/FRAG identiques), mais
>   Renderer/Program/Mesh/Triangle/Color d'`ogl` remplacés par ~40 lignes de WebGL natif (createShader/linkProgram/
>   triangle plein écran/`uniform3fv`). Tout dans `useEffect` → SSR-safe. `hexToRGB` maison. Garde-fous compile/link.
> - **`ogl` retiré de `package.json`** (plus aucun import — grep clean, hors commentaires).
> Vérifié live (host) : canvas **WebGL2 1265×624 rendu**, 0 erreur console, shader compile. Zéro dépendance nouvelle.
> **➜ Côté user : reload la page ; si bloqué, redémarrer le conteneur landing (source montée → pas de rebuild/install).**
>
> ### ⚑ v78 (02/08) — Labs : vraie AURORA ANIMÉE React Bits (WebGL/ogl)
> User : « rien de tel que du react bits ». Setup registre + install du composant Aurora de React Bits.
> - **`components.json`** : registre `@react-bits` ajouté (`https://reactbits.dev/r/{name}.json`).
> - **`src/components/Aurora/Aurora.tsx`** : composant Aurora (variant **Aurora-TS-TW**) récupéré du registre React
>   Bits (shader **ogl** WebGL ; props `colorStops/amplitude/blend/speed`). Dép **`ogl@^1.0.11`** installée
>   (`--legacy-peer-deps` : conflit pré-existant vite8 vs @tailwindcss/vite peer ≤7).
> - **`LabsBackdrop` refait** : `<Aurora client:load colorStops={["#7c3aed","#e879f9","#22d3ee"]} amplitude=1.15
>   blend=0.6 speed=0.55 />`, **retournée (scaleY -1)** → l'aurora monte du bas ; fond crème + quadrillage + scrim.
>   **`motion-reduce`** → fallback blobs statiques (a11y). `client:load` (pas `visible` : l'IntersectionObserver ne se
>   déclenche pas dans le pane non-compositant ; `load` = robuste, comme SiteHeader).
> Vérifié live : **canvas WebGL2 1265×624 rendu** (Aurora island hydratée, hasCanvas true), 0 erreur console/build,
>   48/48 routes 200, 0 débordement ; hub + pages détail. NB serveur dev redémarré (nouvelle dép → Vite optimize).
>
> ### ⚑ v77 (02/08) — Labs : décor AURORA fluide (réf image user) + entrée Labs customisée
> Retour user (réf image « AI-generated » : dégradé fluide multicolore) : « plutôt ce genre de trucs, fluide » +
> « le bouton Labs, personnalise-le exprès ».
> - **`LabsBackdrop` refait en AURORA FLUIDE** : ~7 blobs colorés très flous (violet/fuchsia/rose/cyan/orange) qui
>   montent du bas sur fond crème (#faf6f3), mené violet mais multicolore ; quadrillage très léger + scrim crème
>   haut-gauche pour la lisibilité. Le SVG graphe de nœuds (v76) est retiré.
> - **Entrée Labs customisée dans le méga-menu Resources** (MenuCard `isLabs`) : **chip icône dégradé
>   violet→fuchsia→cyan** (au lieu du chip bordé neutre) + label violet. « Personnalisé exprès ».
> Vérifié live : 0 erreur build, 0 débordement, /labs + detail = aurora (node-graph parti) ; méga-menu Resources
>   ouvert = carte Labs avec chip dégradé + desc confirmés (hover Radix).
>
> ### ⚑ v76 (02/08) — Labs : retour dans Resources (fiole sur le trigger) + fonds « formes abstraites »
> Retour user : Labs plutôt dans Resources (annule v75) + rappel visuel fiole sur Resources + fonds avec formes
> abstraites (« des images en bg »).
> - **Labs re-rangé dans Resources** : retiré du top-nav (annule v75), remis dans `RESOURCES_LINKS`. `LABS_LINKS` +
>   mobile Labs group retirés de SiteHeader. Nav = Product/Solutions/Resources/Enterprise.
> - **Fiole violette sur le trigger « Resources »** (rappel visuel pour attirer l'œil vers Labs).
> - **`LabsBackdrop.astro` (NEW)** : décor réutilisable = dégradé violet + halos + quadrillage + **SVG de formes
>   abstraites** (graphe de nœuds « recherche » + anneaux + hexagone + ring fuchsia), aria-hidden, masqué < sm.
>   Câblé dans les 2 héros Labs (hub + LabDetail), GRID retiré de LabDetail.
> Vérifié live : 0 erreur build, 48/48 routes 200, 0 débordement ; top-nav sans Labs, Resources = fiole, /labs +
>   detail = backdrop SVG rendu.
>
> ### ⚑ v75 (02/08) — Labs : fonds enrichis + bouton Labs remis au header (retour user)
> Retour user : « je pensais plus à des backgrounds » + « le bouton Labs dans le header, un truc plus sympa ».
> - **Fonds Labs enrichis** (hub + `LabDetail`) : hero = dégradé violet (`from-violet-100`) + **2 halos flous
>   violet/fuchsia** + quadrillage, au lieu du simple grid discret. Plus « environnement lab ».
> - **Bouton Labs REMIS au header** (annule la démotion v69, choix user) : lien direct violet + **fiole** qui pivote
>   au survol — distinctif des triggers muted. Nav = Product/Solutions/**Labs**/Resources/Enterprise. Mobile idem.
>   Labs retiré de `RESOURCES_LINKS` (plus de doublon). `FlaskConical` + `LABS_LINKS` réimportés dans SiteHeader.
> Vérifié live : 0 erreur build, 48/48 routes 200, 0 débordement ; header Labs violet+fiole présent, /labs rich bg rendu.
>
> ### ⚑ v74 (02/08) — Legal : remplissage des normes (Hetzner/France/EUR/CNIL/SCC), identité société laissée TBD
> User a fourni : hébergeur = **Hetzner**, juridiction = **France**, devise = **EUR** ; identité société = « jsp »
> (boîte pas encore créée). Rempli tout le norm-derivable, laissé l'identité en placeholder sous bannière draft
> (interdit d'inventer une immatriculation).
> - **notice** : hôte = **Hetzner Online GmbH, Industriestr. 25, 91710 Gunzenhausen, DE, +49 9831 505-0** (UE).
>   Publisher (raison sociale/SIREN/siège/directeur) laissé [placeholder] (incorporation).
> - **privacy** : autorité = **CNIL** ; rétention = « up to 90 days after account closed » ; DPO = « none appointed » ;
>   transferts = **SCC UE** + « hébergement UE (Hetzner) = pas de transfert hors-UE ». Controller identity laissée.
> - **terms** : droit **français** + tribunaux français ; prix « indicative until launch » + EUR ; **[limitation of
>   liability] laissé** (counsel).
> - **subscription** : **EUR** ; « monthly or annually » ; droit français.
> - **dpa** : **SCC UE** + hébergement UE ; DPA « available on request ».
> - **subprocessors** : hôte = **Hetzner** (UE) ; [Transactional email provider] laissé TBD (pas fourni).
> Bannières draft **conservées**. Vérifié live : 0 erreur build, 10/10 routes legal 200, fills rendus.
> **Reste user** : raison sociale + forme + siège + SIREN/RCS + capital + directeur de publication (incorporation) ;
>   fournisseur email transactionnel ; plafond de responsabilité (avocat).
>
> ### ⚑ v73 (02/08) — Labs : identité « environnement lab » (retour user)
> Retour user : « qu'on sente le lab, pas assez accessible / visuellement sympa ». Labs était trop plat (PageHero
> standard + petit tag). Refonte visuelle sur le **violet réservé Labs** (nav.ts) :
> - **`labs/index.astro` réécrit** : hero custom (fond **quadrillé violet** type papier millimétré via inline style +
>   mask radial, fiole, eyebrow mono « Labs · research environment », annotation mono « direction published · mechanism
>   kept in the lab ») ; cartes = **expériences** (border/bg violet, badge « Research » violet+fiole, index mono **EXP-0x**,
>   CTA « Open the experiment »).
> - **`LabDetail.astro` réécrit** (template des 4 pages) : même hero lab (fiole, violet, back-link « All experiments ») ;
>   « exploring » stylé en **hypothèses H1/H2…** ; « Where it stands » en callout violet+fiole.
> D11 conservée (direction, pas mécanisme). Boutons via buttonVariants (plus de PageHero sur Labs).
> Vérifié live : 0 erreur build, 5/5 routes labs 200, 0 débordement ; hub = EXP-01..04 + grid backdrop + violet ;
>   detail = H1/H2 + status violet + back-link.
>
> ### ⚑ v72 (02/08) — Pricing corrigé : Business (cloud) + self-host = Enterprise/Custom
> Correction user : self-host n'est PAS un tier self-serve → « si tu veux self-host, tu es en entreprise (Custom,
> Talk to sales) ». Le tier intermédiaire devient **Business** (cloud managé), pas « Self-hosted ».
> - **`PricingSection` réécrit → Free / Pro / Business / Enterprise.** Business (cloud) = Pro + workspaces illimités +
>   SSO/SAML + RBAC avancé + audit. **Enterprise (Custom, « Talk to sales ») = self-host + modèles locaux (coût zéro)
>   + data sur ton réseau + rétention/DPA/SLA/support.** Compare : colonne « Business », self-host/local Enterprise-only.
>   FAQ self-host = « comes with Enterprise, talk to sales ». Two-ways : self-hosted = Enterprise.
> - **Conséquence honnêteté** (self-host n'est plus « day one / not an upsell ») corrigée partout : home `Proof`
>   (WhereThisGoes « comes with Enterprise » + FinalCta « Free forever to start »), `about`, `book-a-demo`, `Today`
>   (lead « on the models you choose » + callout « Hosted in the cloud, or self-hosted on local models »), `Hero`
>   (fait 2 → « Runs on your models — local or hosted », fin du « zero cost » universel). `Showcase` (mort) nettoyé.
> Vérifié live : 0 erreur build, 47/47 routes 200, 0 débordement ; pricing = 4 tiers (Business), self-host Enterprise-only ;
>   grep « not an enterprise upsell / day one » = 0 rendu.
> **Restes user** : dark mode = NON (light-only) · prix indicatifs OK · captures = placeholder. **À faire** : Labs
>   « qu'on sente le lab » (visuel) ; données légales (normes OK, identité société = à fournir).
>
> ### ⚑ v71 (02/08) — Balayage canon : terme modèle unifié partout (restes attrapés au grep)
> Vérif finale du verrou #7 par grep → 3 restes user-facing du terme modèle (je n'avais fait qu'orchestration +
> agents) + 1 mort :
> - `enterprise.astro` : WHY « Model-independent » → **« Your models »**.
> - `legal/ai-transparency` : « TaskForce is model-agnostic… choose the model per step » → « TaskForce runs on your
>   models… local (le défaut aujourd'hui) ou hosted… tier fast/deep par run » (mène par le local, retire l'implicite
>   routing auto par étape).
> - `labs.ts` (model-choice) : « Model-agnostic execution ships today » → « Running on your models ships today » ;
>   bullet « Staying model-agnostic » → « Staying independent of any single model provider ».
> - `Proof.tsx` (composant Integrations **mort**, non rendu) : « 60+ » → 129 (retire le landmine de compteur).
> Grep : plus aucun « Model-agnostic/Model-independent/Configurable » user-facing (reste 1 commentaire interne dans
> agents.astro). Agent names = 0 reste (CPO/CTO/COO partout). « autonomous » = uniquement Devin (concurrent).
> Vérifié live : 0 erreur build, enterprise/ai-transparency/model-choice rendent le nouveau terme.
>
> ### ⚑ v70 (02/08) — Moat remonté (home) + run tiéré + CTA Planned + legal subprocessors
> Suite du plan (top 10 #6/#8/#10 → **top 10 complet**).
> - **#6 Moat remonté** : `index.astro` réordonné — `<Synergy/>` (« A delivery system, not an assistant » + les 2
>   phrases moat + bento « Git remembers why ») remonte AVANT WhatShipsToday et le run. Ordre : Problem →
>   BeforeAfter → **Synergy** → WhatShipsToday → RunTimeline → BrainTeaser → Trust…
> - **#8 Run tiéré** : `RunTimeline` — légende honnête sous la démo animée (« Drafting a spec and the breakdown
>   ship today; the full seven-checkpoint run is Planned — each step below is labelled »). La table ANATOMY portait
>   déjà les LevelBadge par checkpoint → split Live/Planned explicite d'un coup d'œil.
> - **#10 CTA Planned** : `VerticalDetail` (4 verticales exploratoires) — PageCta de clôture ne pousse plus le
>   signup : « Run your first workflow » → **« See what's proven »** (/solutions/engineering). Import `APP_URL` retiré.
> - **#10 legal** : `legal/subprocessors` — **banner « Working draft »** (`draft`) car placeholders [Hosting
>   provider]/[email] ; claim absolu « out of third-party hands entirely » → « can keep your data within your own
>   infrastructure ». (`legal/notice` déjà en draft.)
> Vérifié live : 0 erreur build/console, **47/47 routes 200**, 0 débordement ; ordre home OK, caption run présente,
>   subprocessors draft + softened, verticales sans CTA signup.
> **Top 10 du plan = 10/10.** Restes = polish P3 : captures produit réelles (cadre audit vide), a11y clavier, décision
>   dark mode, purge composants morts, use-cases leads au présent ; + données legal réelles (raison sociale, hébergeur).
>
> ### ⚑ v69 (02/08) — Pricing : tier self-host + nav : Labs démoté, Trust au header
> Suite du plan (décisions user : self-host = tier dédié sous Enterprise).
> - **`PricingSection` réécrit → 4 tiers** : Free / Pro (cloud AI) / **Self-hosted** ($16/$13 per seat — infra
>   perso + modèles locaux Ollama **coût modèle zéro** + data sur ton réseau + RBAC avancé + audit) / Enterprise
>   (SSO/SAML, retention, DPA, sécu, SLA, support). Self-host n'est plus « Enterprise-only » → « available from
>   day one / not an upsell » devient **vrai**. Tableau comparatif +1 colonne. Note **« Prices are indicative »**
>   (résout aussi prix-fermes vs CGU « à confirmer »). FAQ self-host = « a plan of its own ».
> - **Nav** : **Labs démoté** du top bar (100% Planned) → rangé dans **Resources** (`RESOURCES_LINKS`) ; **Trust**
>   ajouté au header (à côté de Pricing) — l'atout CISO n'était qu'en footer. (Footer Labs inchangé.)
> Vérifié live (:4321) : 0 erreur build/console, **48/48 routes 200**, 0 débordement (1280 + 375) ; pricing = 4 tiers
>   + colonne Self-hosted ; header = Product/Solutions/Resources/Enterprise + Pricing/Trust (Labs absent des triggers).
> **Reste (P1/P2)** : CTA pages Planned (orchestration/agents) → « See the roadmap » ; reframe substrat + profond de
>   Collaboration ; captures produit réelles (cadre audit vide) ; a11y clavier + décision dark mode.
>
> ### ⚑ v68 (02/08) — Hero « acte IA » (fin du kanban) + section « What ships today »
> Suite du plan (décisions user : self-host = **tier sous Enterprise** ; cible = hero acte IA +
> what-ships-today). But : tuer le signal « PM tool » (le board en hero) et matérialiser « ce qui ship
> aujourd'hui » = l'**acte IA réel** (Phase B+C `road_to_v2`), pas un kanban.
> - **`scene/SpecPanel.tsx` (NEW)** : nouveau visuel hero, dans le vrai châssis `AppWindow`. Issue CP-12
>   (données `lib/story`, **0 inventé**) → spec rédigée (3 critères `SPEC_CRITERIA`) + **prompt d'exécution**
>   (à coller dans Claude Code) + ancrage **Memory** (« checked against your past decisions ») + barre
>   **Approve / Edit / Reject** (« Approve → saved to Memory »). Statique SSR (LCP protégé).
> - **`home/Hero.tsx` réécrit** : `HeroBoard` (kanban) **supprimé** → `<SpecPanel/>` ; toasts recadrés
>   (« Approved · saved to Memory » + « Claude Code prompt · ready ») ; imports board retirés. Copy hero v67 gardée.
> - **`home/Today.tsx` (NEW) `WhatShipsToday`** : beat position 5 (après Before/After, avant le run).
>   2 cartes **Live** — « issue → spec + prompt Claude Code + Approve → Memory » et le **decision board OODA**
>   (« your 3 priorities ») — + « runs on local models, zero model cost » + chips socle Live (board, realtime,
>   Smart Assign, analytics, SSO/RBAC, self-host, audit) cadrés comme **support**, pas comme produit.
> - **`index.astro`** : `<WhatShipsToday/>` inséré entre Before/After et RunTimeline (**10→11 sections**).
> Vérifié live (:4321) : 0 erreur build/console, 0 débordement (testé 375), hero = acte IA (spec/prompt/
> memory/approve présents), **kanban absent du hero**, section « what ships today » rendue.
> **Reste** : PricingSection = ajouter le **tier self-host** sous Enterprise ; P1 (CTA pages Planned, démoter
> Labs, Trust au header) ; captures produit réelles (P3).
>
> ### ⚑ v67 (02/08) — Audit + plan d'exécution v2 → 1re passe d'implémentation (copy/vérité)
> Contexte : audit complet (artifact) puis **plan d'exécution** ancré sur `road_to_v2`. Matrice de vérité v2 :
> l'acte atomique — issue → spec + prompt Claude Code + breakdown + RAG « déjà vu ? » + mémoire, et le
> **decision board OODA** — est **déjà livré** ; seuls le run complet 7-checkpoints + l'équipe CPO/CTO/COO sont
> Planned. Décision cadrante : **« AI Delivery OS, PAS un outil de gestion de projet »** (narrative C des docs,
> la plus récente ; les vieux docs disent « SaaS de gestion de projet » → à retirer). Aucun slogan canonique
> n'existe dans les docs → verrou de message **rédigé**.
> **Édits appliqués (copy uniquement, 0 feature), vérifiés en live (`astro dev` :4321) :**
> - **Hero** : eyebrow → « The AI delivery operating system » ; sous-lead → l'acte réel (« drafts the spec, the
>   plan and the prompt… Today it works issue by issue — the full run is where it is headed ») ; 3 faits →
>   « You approve every decision · Runs on local models, zero model cost · Self-hosted, your network ».
> - **Verrou du canon** : `RunTimeline` Product/Architecture/Delivery → **CPO/CTO/COO** (aligné orchestration +
>   agents + docs) ; terme modèle unifié **« Your models »** (fin de « Model-agnostic »/« Configurable » + de
>   l'implicite routing auto par étape) ; compteur **129** partout (`roadmap` 47→129, badge live→beta).
> - **Passe vérité/tense** : pricing FAQ « fully autonomous » → « full multi-checkpoint run » ; remise annuelle
>   **−20% → −17%** (12→10 = 16,7 %) ; `media` boilerplate présent-des-3-agents → version honnête + catégorie
>   unifiée ; **« dated roadmap » purgé** (le roadmap n'a pas de dates) : brain-os, home Proof, changelog×2,
>   blog, about, LabDetail.
> - **Not-a-PM-tool** : `collaboration` hero recadré (le board = **substrat où le run atterrit**, plus le produit).
> Vérifié : **48/48 routes 200**, 0 erreur console, 0 erreur build, 0 débordement ; strings neufs présents /
> anciens absents (DOM live). **Non touché (décisions founder)** : packaging self-hosting (tier vs Enterprise-only),
> prix définitifs, ICP. **Reste design** (P0/P1 du plan) : hero visuel kanban→acte IA, section « what ships today »,
> screenshots réels, chips de maturité par checkpoint.
>
> ### ⚑ v66 (31/07) — Use-cases 5→10 (plan complet) + /vs/shortcut
> Choix user : **« compléter aux 10 du plan »**. Les use-cases passent des 5 curés aux **10 job-to-be-done** du
> plan §3.1, avec **maturité honnête par job** (pas de survente).
> - **`lib/use-cases.ts` réécrit** aux 10 clés du plan : product-spec (**Planned**), architecture-decision
>   (**Planned**), backlog-grooming (**Planned**), code-review (**Beta** — approvals + liens PR GitHub),
>   qa-testing (**Planned**), documentation (**Beta** — Memory), onboarding (**Beta** — Memory + onboarding
>   wizard → Smart Assign), incident-postmortem (**Planned**, exploratoire), release-notes (**Planned**),
>   sprint-planning (**Beta** — cycles + workload analytics live). **Tally DOM : 6 Planned / 4 Beta** = honnête
>   (Planned = dépend de l'orchestration ; Beta = adossé à une feature shippée). `USE_CASE_ORDER` = ordre du plan.
> - **Anciennes pages supprimées** (rm) : specification/technical-decision/review-signoff/quality-checks → **404**
>   (review-signoff n'est pas un job-to-be-done, c'est la primitive Approvals). documentation conservée.
> - **9 nouvelles pages fines** + **hub `/use-cases` réécrit** (itère les 10 depuis `USE_CASES` + icônes + badges).
> - **`/vs/shortcut` (NEW)** : la 7e→8e comparaison (le plan listait shortcut). Tracker dev (stories/iterations),
>   traité en fair-play comme les autres trackers. Ajouté à `comparisons.ts` + hub `/vs` (TRACKERS) + nav Compare.
> - **`nav.ts`** : SOLUTIONS_GROUPS « By use case » 5→10, Compare += shortcut, BUILT_ROUTES maj (−4 vieux, +9
>   use-cases, +shortcut). **Sitemap.xml auto (BUILT_ROUTES) : 67 URLs**, vieux routes absents, shortcut présent.
> - Vérifié : 10 use-cases + shortcut 200, vieux routes 404, hub 10 cartes (6 Planned/4 Beta), 0 erreur build.
> **➜ Le site couvre maintenant l'INTÉGRALITÉ du sitemap du plan §3.1.** (~67 pages/routes.) Restes = polish :
> placeholders légaux à remplir (publication/prix/juridiction) + relecture juridique ; ~50 pages jamais revues.
>
> ### ⚑ v65 (31/07) — Réconciliation avec le PLAN (taskforce-docs) : pages techniques + CGV manquantes
> User : « on fait VRAIMENT toutes les pages, va voir taskforce-docs (partie lab et tout) ». J'ai lu le plan
> autoritaire **`taskforce-docs/v1/14-design/landing-refonte/Plan_Refonte_Site.md`** (§3.1 sitemap complet) +
> `road_to_v2/`.
> - **Labs — confirmé CORRECT (D11)** : le plan §1.2 **D11 ANNULE** les pages mécanisme (`/labs/world-model-ooda`
>   = le cœur du moat, `/benchmarks`, `/data-flywheel`, `/local-llm`, `/notes`). Mes 4 Labs (agent-roles / run-memory
>   / model-choice / learning-from-reviews) sont les reframes « direction, pas mécanisme », ancrés sur road_to_v2
>   (Agents_C_Level, Guide_Ollama/Benchmark, Data_Flywheel) SANS publier le comment. **Rien à changer, rien à
>   révéler du moat.**
> - **Pages mandatées par le plan que j'avais ratées → construites** :
>   · **`/legal/subscription`** (CGV, distincte des CGU — prix HT, reconduction, résiliation, rétractation ;
>     LegalDoc + bandeau draft). Ajoutée au footer Legal.
>   · **`/404`** (page custom « This page took an unvalidated path » + liens).
>   · **`/sitemap.xml`** (endpoint `src/pages/sitemap.xml.ts` **généré depuis `BUILT_ROUTES`** → 61 URLs, aucune
>     liste à tenir).
>   · **`/robots.txt`** (existait mais pointait `taskforce.app` → **corrigé en `taskforce.dev`**, cohérent avec
>     APP_URL + email).
>   · **`/.well-known/security.txt`** (RFC 9116 : Contact hello@ + Policy /legal/security + Expires).
>   · `astro.config.mjs` : `site: 'https://taskforce.dev'`.
> - **Domaine standardisé `taskforce.dev`** (APP_URL=app.taskforce.dev + hello@taskforce.dev ; le `.app` de
>   l'ancien robots était l'intrus).
> - Vérifié : subscription 200 (draft), 404 → HTTP 404 + page custom, sitemap.xml XML valide 61 `<loc>`, robots +
>   security.txt 200.
> **➜ Écarts restants vs plan (décisions de périmètre pour le user, pas fait par défaut)** : **use-cases** plan=10
>   (job-to-be-done : product-spec, code-review, incident-postmortem, sprint-planning…) vs actuel=**5** curés ;
>   **`/vs`** plan=6 (dont `shortcut`) vs actuel=**7** (nav : +cursor/copilot, −shortcut) ; `/sitemap` HTML humain
>   (optionnel, le XML est fait). NB : Solutions « par équipe » (D10) déjà bon ; §3.1 « par rôle » est pré-D10.
>
> ### ⚑ v64 (31/07) — Labs + Resources + fix header : SITE 100 % CONSTRUIT
> Dernière vague de « toutes les pages ». Le site n'a **plus aucun lien grisé / « Soon »**.
> - **Labs (hub + 4)** — `lib/labs.ts` + `LabDetail.astro` + `/labs` + 4 pages (agent-roles, run-memory,
>   model-choice, learning-from-reviews). **DÉCISION D11 tenue** : chaque page dit le QUOI + le bénéfice, jamais le
>   COMMENT (« The questions, not the recipe » · « we publish the direction, keep the mechanism in the lab »). Tag
>   **Research**, encart « Where it stands » qui distingue ce qui shippe vs recherche. Vérifié : D11 OK, 0 mécanisme.
> - **Resources (5)** — `/learn` (vrai contenu pédago « What an AI delivery OS actually is », 4 parties + cross-
>   links), `/docs` (hub honnête : getting started/concepts/self-host réels + API « Coming », note « we'd rather
>   ship accurate docs than pad »), `/blog` (**empty state honnête** « No posts yet »), `/changelog` (**état réel
>   Live/Beta/Planned, AUCUNE fausse date** — « instead of inventing dated release notes »), `/status` (**placeholder
>   honnête** « we won't post an uptime number we can't stand behind », pas de faux « all systems operational »).
> - **FIX header (`SiteHeader.tsx`)** : Solutions & Labs étaient **hardcodés « Soon »** (stub d'avant construction).
>   Convertis en **vrais méga-menus** : Solutions = 3 colonnes (By team / By use case / Compare) + « All solutions » ;
>   Labs = 4 `MenuCard` + « All of Labs ». Mobile déjà OK (MobileGroup via isLive). Vérifié DOM : **soonCount = 0**,
>   4 triggers (Product/Solutions/Labs/Resources), méga-menu Solutions s'ouvre (engineering/specification/jira +
>   All solutions), 0 erreur console.
> - `nav.ts` BUILT_ROUTES += labs(5) + resources(5). Vérifié : 10 pages 200, 0 erreur build.
> **➜ TOUT le site marketing est construit** (~55 pages). Chaque entrée nav/footer est live. Restes = polish :
> remplacer les `[placeholders]` légaux (infos publication) quand dispo + relecture juridique ; les ~40 pages
> jamais revues par le user (Legal/Company/Solutions/Compare/Labs/Resources) ; 3 décisions produit (self-host/prix/
> OSS) ; home + hub /product jamais revus formellement.
>
> ### ⚑ v63 (31/07) — Solutions/Compare COMPLET : 5 use-cases + 4 verticales
> User : **« faire toutes les autres pages, complètement »**. Sous-lots 2 & 3 → Solutions/Compare 100 %.
> - **5 fiches use-case** (`lib/use-cases.ts` + `UseCaseDetail.astro` + 5 pages) : Specification (**Planned**),
>   Technical decision (**Planned**), Review & sign-off (**Beta**), Quality checks (**Planned**), Documentation
>   (**Beta**). Chaque fiche : « What it is » / « In a run » / **encart honnête « Where it stands »** (ex. review :
>   « Live today for specs/actions/recommendations ; full checkpoint gating on the orchestration roadmap ») +
>   cross-links produit. Badge de maturité réel dans le hero.
> - **4 verticales exploratoires** (`lib/verticals.ts` + `VerticalDetail.astro` + 4 pages) : Product / Operations /
>   Marketing / Client services. **HONNÊTETÉ D10** : tag **« Exploratory · not proven yet »**, « why the pattern
>   COULD fit » (conditionnel), encart « Why we call this exploratory » (« we haven't run marketing on TaskForce…
>   we'd rather build it with a real team than claim it »), CTA → Engineering (le prouvé). Zéro workflow inventé.
> - **`/solutions`** : les 4 verticales deviennent **cliquables** (badge Exploratory conservé) ; logique `live =
>   href && isLive`. `nav.ts` BUILT_ROUTES += 5 use-cases + 4 verticales.
> - Vérifié : 9 pages 200, 0 erreur build ; Marketing (exploratory tag + honest unproven + lien Engineering),
>   Review (badge **Beta** + Live/Planned split + links).
> **➜ Solutions / Compare = 100 %.** Reste pour « toutes les pages » : **Labs** (hub + 4) et **Resources** (docs,
> learn, blog, changelog, status).
>
> ### ⚑ v62 (31/07) — Compare : les 7 fiches /vs (sous-lot 1 de « tout le détail »)
> User : **« tout le détail »** (7 vs + 5 use-cases + 4 verticales), par sous-lots avec review. Sous-lot 1 = /vs.
> - **Pattern data+template** (comme les fiches connecteur) : `lib/comparisons.ts` (7 concurrents) +
>   `components/site/VsCompare.astro` + 7 pages fines `/vs/{jira,linear,notion,claude-code-alone,devin,cursor,copilot}`.
> - **Règle fair-play stricte** appliquée : chaque page **MÈNE par « What {X} is great at »** (crédit sincère),
>   les diffs sont « **not its focus** » jamais « ✗ », **agents de code = COMPLÉMENT** (« They work together »,
>   « TaskForce uses Claude Code/Cursor/Copilot as the executor »). Tableau côte à côte respectueux (colonne concurrent
>   neutre, pas de X rouge) + note « if we've got something wrong, tell us and we'll fix it ». Trackers : « they
>   record, TaskForce governs » ; Devin : « autonomy vs human-governed » (philosophies, sans mépris).
> - `nav.ts` BUILT_ROUTES += les 7 `/vs/*` → **tout le menu/footer Compare dégrisé**. Vérifié : 7 pages 200, 0
>   erreur build ; claude-code-alone (le + sensible) OK en DOM (crédit + together + « uses Claude Code » + tableau +
>   fairness note + bottom line).
> **➜ Reste de « tout le détail »** : sous-lot 2 = 5 fiches use-case (Specification/Technical decision/Review &
> sign-off/Quality checks/Documentation) ; sous-lot 3 = 4 verticales exploratoires (Product/Operations/Marketing/
> Client services) en pages **clairement Planned**. Review du sous-lot 1 (/vs) recommandée avant d'enchaîner.
>
> ### ⚑ v61 (31/07) — Solutions/Compare : hub /use-cases (3e hub de catégorie)
> **`/use-cases` (NEW)** : les 5 étapes d'un run gouverné en cartes, **statut honnête par étape** — Specification /
> Technical decision / Quality checks = **Planned** (orchestration), Review & sign-off = **Beta** (Approvals),
> Documentation = **Beta** (Memory). Section « One artifact leads to the next » + cross-links orchestration/
> approvals/brain-os. `nav.ts` BUILT_ROUTES += `/use-cases`. Vérifié DOM : 5 use-cases, badges [Planned×3, Beta×2]
> corrects, 0 erreur build.
> **➜ Les 3 hubs de catégorie sont faits** : Solutions (+ Engineering), Use cases, Compare. Le menu Solutions +
> footer sont dégrisés au niveau hub. Reste (optionnel, à cadrer user) : 5 fiches use-case, 7 fiches `/vs/{…}`,
> verticales exploratoires en pages Planned dédiées.
>
> ### ⚑ v60 (31/07) — Lot Solutions / Compare (ancrages structurels honnêtes)
> Le plus gros lot ET le plus à risque (~20 pages possibles, 2 pièges d'honnêteté). **Pas de génération en masse** :
> je pose les 3 ancrages structurels honnêtes, le reste sera dirigé par le user.
> - **`/solutions` (hub)** — décision D10 respectée : **Engineering = Proven** (badge vert, cliquable) ; Product /
>   Operations / Marketing / Client services = **Exploratory** (badge pointillé, grisé, copie « the same governed
>   model, not yet proven here » — on n'invente PAS de workflows pour des métiers non livrés). Vérifié DOM : 1
>   Proven, 4 Exploratory.
> - **`/solutions/engineering` (NEW, Live)** — le métier prouvé : problème (« AI made generating code cheap. It
>   didn't make the decisions cheaper »), le run en 5 étapes, note honnête « full intent-to-deploy orchestration is
>   Planned; board/smart-assign/approvals/memory/analytics ship today », 4 cross-links produit. Badge **Live**.
> - **`/vs` (hub Compare)** — positionnement **honnête et respectueux** : 2 groupes — **vs delivery trackers**
>   (Jira/Linear/Notion : « they record the work, TaskForce governs the decisions ») et **vs coding agents**
>   (Claude Code alone/Devin/Cursor/Copilot : « they write the code, TaskForce orchestrates around them **and uses
>   them** » — complément, pas rival). Note de fair-play « we won't tell you your tracker/agent is bad ». **Pas de
>   logos concurrents** (0 image cassée + neutralité). Cartes = énoncés complets (pas de lien mort ; « read the full
>   comparison » n'apparaît que si la fiche existe).
> - `nav.ts` BUILT_ROUTES += `/solutions`, `/solutions/engineering`, `/vs`. Vérifié : 3 pages 200, 0 erreur build,
>   badges/maturité corrects, 0 image cassée.
> **➜ Reste du lot (à cadrer avec le user, pas fait par défaut — risque)** : `/use-cases` hub + 5 use-cases
>   (Specification / Technical decision / Review & sign-off / Quality checks / Documentation — ancrés sur de vrais
>   checkpoints) ; fiches `/vs/{jira,linear,notion,claude-code-alone,devin,cursor,copilot}` (traitement juste et
>   exact requis) ; verticales exploratoires en pages Planned dédiées. + 3 décisions produit (self-hosting/prix/OSS).
>
> ### ⚑ v59 (31/07) — Lot Legal (vague 2 : 6 docs contraignants en scaffolds honnêtes)
> Choix user : **« scaffolds honnêtes maintenant »**. Les 6 docs via `LegalDoc`, ancrés sur les faits RÉELS du
> produit + placeholders `[…]` clairs + **bandeau « Working draft — pending legal review »** sur les contraignants.
> - **`/legal/privacy`** (draft) : controller `[…]`, données réelles (compte via Keycloak OIDC, contenu workspace,
>   creds connecteurs chiffrés, métadonnées d'appels modèle, billing via provider), bases légales, section **AI &
>   your data** (« we do not use your data to train TaskForce models » + Ollama local), partage → subprocessors,
>   rétention `[…]`, **droits RGPD**, transferts `[SCC]`. Vérifié : banner + 7 placeholders + faits réels.
> - **`/legal/terms`** (draft) : service (as available, Live/Beta/Planned), compte, usage, **your content (tu
>   possèdes)**, **AI outputs = proposals not decisions / AI can be confidently wrong / human approves / tu es
>   responsable de ce que tu ships**, billing `[prix TBC]`, résiliation, disclaimers `[…]`, droit applicable `[…]`.
> - **`/legal/cookies`** (draft) : strictement nécessaires (auth/session), préférences, analytics **[none by
>   default]** ; honnête « we don't track you across the web ».
> - **`/legal/dpa`** (draft) : rôles controller/processor, sécu → Trust, subprocessors, DSR, transferts, **« DPA
>   signable sur demande »** (pattern réaliste).
> - **`/legal/subprocessors`** (PAS draft, factuel) : **Stripe** (payments), **Anthropic/OpenAI** (modèles hostés
>   *seulement pour les appels que tu routes*), `[hébergeur TBC]`, `[email TBC]` ; **caveat self-host + Ollama = 0
>   tiers** ; Keycloak/MinIO/PostgreSQL = **dans le déploiement**, pas des subprocessors. Vérifié.
> - **`/legal/notice`** (draft) : imprint (éditeur/adresse/immat/directeur `[…]`, hébergeur `[…]`, PI + logos tiers
>   = à leurs propriétaires).
> - `nav.ts` BUILT_ROUTES += les 6. Vérifié : 6 pages 200, 0 erreur build, banner draft OK sur Privacy, subprocessors
>   factuel sans banner.
> **➜ Lot Legal + Company COMPLET** (3 company + 8 legal). **Le footer Legal & Trust + Company est 100 % dégrisé.**
> À faire quand le user aura les infos : remplacer les `[placeholders]` (raison sociale/adresse/hébergeur/prix/
> juridiction) + relecture juridique réelle. Reste : lot **Solutions / Compare** + 3 décisions produit.
>
> ### ⚑ v58 (31/07) — Lot Legal + Company (vague 1 : Company + statements)
> **⚠ Découverte honnêteté** : `src/config/constants_en.ts` = **boilerplate du template d'origine** (testimonials
> bidon « Loved by Professionals », features génériques, blocs `terms/privacy/accessibility` en ToS US générique
> daté « January 7, 2026»). **Ne PAS publier ça comme les CGU/Privacy réelles de TaskForce** (malhonnête) — et je
> ne fabrique pas de texte juridique contraignant. → découpe du lot par risque.
> - **NEW `layouts/LegalDoc.astro`** : gabarit légal partagé (en-tête + date « Last updated » + **bandeau
>   « Working draft — pending legal review »** optionnel via prop `draft` + corps `Prose` + pied contact). Sert de
>   base honnête pour les docs contraignants à venir.
> - **Company (3, custom, honnêtes)** : `/company/about` (mission, « why we exist », 4 principes, section « Early,
>   and honest about it » → roadmap/trust ; **aucun faux client/équipe/levée**), `/company/contact` (canaux réels :
>   demo/enterprise/security + `hello@taskforce.dev`), `/company/media` (boilerplate 1 ligne + 1 §, **vrais assets**
>   `logo-taskforce.svg` + `favicon.svg` en download, palette = vrais jetons #2563EB/#1D1D1F/#FBFBFC/#E6E6E9).
> - **Legal statements (2, honnêtes, non-draft)** : `/legal/security` (approche sécu ancrée sur les faits réels du
>   Trust Center + **report a vulnerability** via hello@ ; « no badges we haven't earned » ; pas de bug-bounty
>   promis) ; `/legal/accessibility` (cible **WCAG 2.2 AA** assumée comme intention pas certif ; skip-link/focus/
>   reduced-motion réels ; section honnête « Where we fall short »).
> - `nav.ts` BUILT_ROUTES += les 5 routes. Vérifié : 5 pages 200, 0 erreur build ; About (h1+principes+roadmap),
>   Media (**2 logos chargés, 0 image cassée**, 4 hex, downloads), Accessibility (LegalDoc : h1+date+WCAG+contact).
> **➜ Vague 2 à cadrer avec le user (docs contraignants)** : Privacy · Terms · Cookies · DPA · Subprocessors ·
> Legal notice → **scaffolds honnêtes** (bandeau draft + faits réels du Trust Center + placeholders publication),
> jamais du boilerplate présenté comme définitif. Attend le feu vert sur l'approche + d'éventuels détails de
> publication réels (raison sociale / adresse / hébergeur — sinon placeholders).
>
> ### ⚑ v57 (31/07) — Passe de cohérence : verrou du vocabulaire (transverse)
> Audit systématique de tout `landing-page/src` (grep `sign-off|disposes|consequential|proposes|checkpoint` +
> lecture des contextes Enterprise/Trust/AI-Transparency/home). **Constat : le vocabulaire est déjà largement
> cohérent** — `proposes→decides` tenu partout, plus aucun « disposes », read/write précis sur Integrations +
> Approvals, et « human approval at every checkpoint » est **auto-cohérent avec la définition verrouillée** du
> checkpoint (l'approbation FAIT le checkpoint → doctrine honnête, pas une claim que le run auto complet est Live).
> - **NEW `.ai/landing-vocab.md`** = **source unique** du langage propriétaire : les 4 primitives (checkpoint /
>   proposal-artifact / approval / decision), la signature « The AI proposes. A human decides. », la politique
>   **read / write / consequential** (calée sur `McpClient.readOnly`), et le split **Live vs Planned** de référence.
>   À consulter avant toute claim de gouvernance.
> - **2 corrections réelles** (les seules trouvées) : (1) Trust `AI_GOV` « **AI proposes a decision** » → « **The AI
>   proposes**; a named human approves it » (proposal-not-decision). (2) Politique **read/write rendue explicite** —
>   nouveau bullet sur AI Transparency (« The controls you keep ») : « **Read-only actions can run automatically;
>   anything that writes to a connected system is proposed and runs only after approval.** »
> - Non touché volontairement : « approve each checkpoint » d'Enterprise/Trust/home (doctrine cohérente avec la
>   définition ; churner de la copie lockée validée pour un non-problème serait pire). La nuance Live/Planned vit
>   sur Approvals + Roadmap, là où elle doit être.
> - Vérifié : trust + ai-transparency 200, changements en HTML, 0 erreur build.
>
> ### ⚑ v56 (31/07) — Approvals : cohérence Live/Planned + wording (review 8.5/10)
> La page transforme « human in the loop » en primitive produit. Resserrage du wording contre les promesses
> absolues + résolution d'une vraie incohérence inter-pages.
> - **⚠ LE point majeur (Live vs Planned)** : la dernière phrase « …is here today. Checkpoint-by-checkpoint
>   approval across a full governed run **grows with** orchestration » créait une tension avec AI-Transparency
>   (« no consequential workflow step advances… ») et Enterprise (« sign-off at each checkpoint »). → **découpe
>   nette** : « Approval for specs, external actions and recommendations **is live today**. Full checkpoint-by-
>   checkpoint governance across the entire delivery run **is on the orchestration roadmap**. »
> - **Politique read/write/consequential précisée** (colle à `McpClient.readOnly`, défaut false) : carte External
>   action → « **Reads can run on their own.** Anything that **writes** to a connected tool is proposed as a
>   pending action — and runs only after a human approves it. »
> - **Vocabulaire standardisé** : « a human **disposes** » → « a human **decides** » (signature AI proposes →
>   Human decides). Hero « becomes the next decision or leaves your walls » → « becomes part of the **governed
>   workflow** or is **executed externally** ».
> - **Moins de promesse d'implémentation** : « becomes a **validated node** in your Memory » → « the decision
>   becomes **trusted context** in your Memory » (ne dépend pas d'un champ de provenance robuste). Smart Assign
>   « the override is a signal too » → « overrides **can also** become signals… » (pas de boucle d'apprentissage
>   promise si non live). Audit « exactly what they were approving » → « the **exact content they signed off on** »
>   (identité de l'artefact approuvé — préoccupation enterprise).
> - **NEW mini-flux dans « The primitive »** : Agent → Artifact → **Human review** (approve / edit / reject) →
>   Approved decision → Memory → Next checkpoint. Montre que approval = **transition conditionnelle** entre 2 états
>   (le vrai fil rouge OS), pas un bouton « generate → approve ».
> - Vérifié DOM : les 9 points OK, flux 6 nœuds rendu, 0 erreur build.
> **⚠ Transverse** : appliquer la même clarté Live/Planned au « sign-off at each checkpoint » d'Enterprise, et
> figer read/write/consequential + proposes→decides partout (passe de cohérence, pages lockées → feu vert user).
>
> ### ⚑ v55 (31/07) — Agents : passe de maturité (review 8.5/10)
> Risque de positionnement : « 3 agents qui discutent » vs « une ORGANISATION d'agents spécialisés qui produit
> des artefacts gouvernés ». Corrigé, sans gonfler la page.
> - **NEW « One run, three perspectives »** (le manque principal) : schéma de l'orchestration ENTRE les rôles —
>   Outcome → CPO (the what) → CTO (the how) → COO (the when & risk) → Human approval → Delivery, cartes colorées
>   par rôle + « A human approves at every checkpoint — no role hands off on its own ». Montre la collaboration,
>   pas juste les rôles.
> - **Vocabulaire verrouillé proposal/artifact** (langage propriétaire TaskForce, cf. AI Transparency « a proposal,
>   not a decision ») : hero « each proposing **decisions** » → « each producing **proposals** » ; CTA « proposing
>   decisions you approve » → « **producing proposals you can review, approve or reject** » ; section « One run » :
>   « each role **produces an artifact** ».
> - **« safe to trust » → « governable »** (on ne peut pas promettre qu'un agent est sûr — il peut se tromper avec
>   assurance). **« Model-agnostic » → « Configurable »** (propriété d'archi, pas de comportement) ; 4 règles
>   resserrées (Grounded/Specialized/Governed/Configurable).
> - **Hero** : « Most AI tools give you one model… » (invérifiable/agressif) → « **Most AI workflows start with a
>   generalist agent** ». **« works your Brain OS »** (bancal) → « **Today, TaskForce ships an assistant grounded
>   in your Brain OS…** ». **MCP** re-scopé : « exposed over MCP by the systems you've connected » (pas une
>   abstraction universelle sur les 129). **COO** : + « risk » (symétrie avec le sous-titre).
> - Bandes réalternées après insertion (team gris → One run blanc → real-today gris → rules blanc → CTA gris).
> - Vérifié DOM : les 12 points OK, schéma rendu (Outcome/rôles/Human approval/Delivery), 0 erreur build.
> **⚠ Transverse (comme le checkpoint)** : verrouiller **proposal / artifact / approval / checkpoint** à l'identique
> sur Agents / AI-Transparency / Orchestration / Analytics / Trust (langage propriétaire) — passe de cohérence à
> planifier (pages lockées → feu vert user).
>
> ### ⚑ v54 (31/07) — Checkpoint lock + Agents + Approvals (Product menu complet)
> **1. Verrou « checkpoint » (option A, feu vert user)** : définition canonique posée UNE fois à son foyer
> naturel — section « The run » d'`orchestration.astro` — dans un encart « What a checkpoint is » : *« A checkpoint
> is a governed stage where an artifact is produced, reviewed and explicitly approved before the run continues. »*
> Source unique ; les autres pages emploient le terme, Approvals la re-cite. Pages lockées non retouchées au-delà.
> **2. `/product/agents` (NEW, Planned/labs)** — j'ai lu `AgentService` : l'assistant réel = RAG Brain OS +
> tool-calling (search brain, create note, ExternalMcp) ; **la team CPO/CTO/COO est la direction (Planned)**.
> Structure : Hero (Planned) → « The team » (3 rôles, repris d'Orchestration) → **« What's real today » : one
> assistant grounded in your Memory** (3 outils réels : Search Memory / Take notes / Use connected tools — write
> externe validé par un humain) → « The rules » (Grounded/Specialized/Governed/Model-agnostic) + liens checkpoint/
> Approvals → CTA. Honnête : le Planned (team) vs le réel (assistant) est explicite.
> **3. `/product/approvals` (NEW, Beta)** — surfaces d'approbation RÉELLES (endpoints backend, pas une promesse) :
> `POST /issues/{id}/ai/spec/approve` → **la spec approuvée devient un KnowledgeNode (Memory)** ; `McpActionController`
> → action externe **pending → validée par un humain → exécutée** ; Smart Assign → reco approuvée/overridée.
> Structure : Hero (Beta, « The AI proposes. A human approves. ») → « What you approve » (les 3 surfaces) → « The
> primitive » (re-cite la définition checkpoint) → « Recorded » (qui a approuvé quoi/quand → Trust + AI
> transparency) → CTA. Honnêteté Beta : « approving specs, actions and recommendations is here today ;
> checkpoint-by-checkpoint approval across a full run grows with orchestration ».
> **4. `nav.ts` BUILT_ROUTES += `/product/agents`, `/product/approvals`** → **le menu Product est 100 % construit**
> (Orchestration · Agents · Approvals · Memory · Smart Assign · Collaboration · Analytics · Integrations + 3 fiches).
> Vérifié : orchestration 200 (définition rendue) ; agents 200 badge **Planned**, team/assistant/tools/rules/liens
> OK ; approvals 200 badge **Beta**, 3 surfaces, spec→Memory, MCP pending, définition checkpoint, recorded, liens
> Trust/AI-transparency ; vite:0 sur les 3, 0 erreur build.
> **Reste** (hors produit) : lots **Legal + Company**, **Solutions / Compare**. Transverses ouverts : self-hosting/
> prix/open-source ; passe de cohérence « checkpoint » optionnelle (option B) sur Memory/Smart Assign/Trust.
>
> ### ⚑ v53 (31/07) — Analytics : verrou wording (review 9/10)
> Dernières corrections de formulation, zéro section ajoutée :
> - **Le CTA réintroduisait le « only »** qu'on venait de retirer du titre → « …your board already contains —
>   **plus the delivery signals that become possible when work moves through validated checkpoints** ».
> - **Boucle** : « starts having already learned » → « **can start with context learned from the last** »
>   (moins anthropomorphe).
> - **Explainer agents raccourci** → « People and coding agents share the same delivery surface, so analytics
>   can measure both — just like Smart Assign and Collaboration ».
> Vérifié DOM : les 4 présents, anciens absents ; 0 erreur console.
> **⚠ Transverse à faire (point 3 review)** : verrouiller « **checkpoint** » comme primitive produit, définition
> stable partout — proposée : « *A governed stage where an artifact is produced, reviewed and explicitly approved
> before the run continues.* » À poser sur Orchestration / Memory / Smart Assign / Trust (pages lockées → feu vert
> user avant d'éditer).
>
> ### ⚑ v52 (31/07) — Analytics : passe de rigueur (review 8.5-9/10)
> Le haut de page était solide ; la moitié basse mélangeait analytics et gouvernance sans assez de rigueur.
> - **Affirmation absolue retirée** : « The metric only a checkpoint system can produce » → **« See where
>   delivery gets sent back »** ; lead « it can tell you where work gets sent back » → « it can **measure not just
>   what shipped, but where work gets rejected, revised or sent back** ». (Un autre outil avec des states
>   structurés pourrait le produire — donc pas « only ».)
> - **Chiffres illustratifs durcis** : « Illustrative — sample data » → **« Illustrative — not a TaskForce
>   customer metric. »** (2 captions ; un « Approved first time: 94% » capturé hors contexte serait pris pour du
>   réel).
> - **Agents mesurés ?** — assumé mais sans survente : explication ajoutée « People and coding agents are
>   assignees on the same board, so a breakdown by assignee can include either — the same delivery surface as
>   Smart Assign and Collaboration » (pas de claim d'analytics de perf agent, non vérifié).
> - **Lien cross-feature** : après les métriques, « See who's overloaded, then **route the next work with Smart
>   Assign** » (workload → Smart Assign, cohérence entre pages).
> - **Boucle Analytics → Memory → next run** (le manque fonctionnel pointé) : nouvelle section compacte
>   **« Measurement that feeds the next run »** badgée **Planned** (c'est la direction calibration, pas Live) +
>   mini-flux Delivery → Analytics → Recurring pattern → **Memory** → Next run + liens Memory & Roadmap.
> - Vérifié DOM : nouveau titre, claim absolue absente, « rejected, revised or », explainer agents, lien Smart
>   Assign, 2 captions explicites (0 « sample data »), section Planned + badge Planned + boucle 5 nœuds + liens
>   brain-os/roadmap ; **0 erreur console** (scène toujours hydratée).
>
> ### ⚑ v51 (31/07) — Lot produit — Analytics (dernière page LIVE)
> Lu `AnalyticsController` + `analytics-service.ts` avant d'écrire. Analytics est réellement livré et riche :
> KPIs (resolved, resolution time, velocity, active cycles + deltas), throughput (opened/resolved, week/day),
> burndown, capacity/workload, insights IA, et **génération de graphe en langage naturel** (`/chart` →
> `ChartSpec`, rendu depuis les VRAIES séries, « jamais de données inventées » : mode `unsupported` + suggestions).
> - **`/product/analytics` (NEW, Live)** : PageHero (Live) « The analytics your delivery actually produces » →
>   « The numbers, from the work itself » (6 métriques RÉELLES : Throughput, Resolution time, Velocity, Active
>   cycles, Burndown, Team workload) → « Describe the chart. Get it from your data. » (le NL→chart + la phrase
>   d'honnêteté **« when a question can't be answered from your data, it says so … instead of inventing a
>   number »** — colle au code) → « The metric only a checkpoint system can produce » (**Beta** : sent-back par
>   checkpoint, réutilise la scène animée `DeliveryInsights`, « grows with orchestration; it's early ») → PageCta.
> - **Honnêteté** : le cœur (métriques board + NL→chart) est **Live** ; la métrique par checkpoint (sent-back /
>   approval rate) est **Beta** (dépend de l'orchestration Planned) → badge Analytics reste `live`, section Beta
>   explicite. 2 mentions **« Illustrative — sample data »** sur les visuels à chiffres (règle Spec_Master §1.1).
> - **`nav.ts`** : desc « Lead time, throughput, approval rate » → **« Throughput, resolution time, workload »**
>   (approval rate était Beta) ; BUILT_ROUTES += `/product/analytics`.
> - Vérifié : 200, vite:0, **0 erreur console** (scène `DeliveryInsights` hydratée), 6 métriques, mock NL→chart
>   (Inès/Léo/Maya/Claude Code), phrase never-invents, section Beta, 2 captions illustratives, badge hero Live.
> **➜ Le lot produit LIVE est complet** : Smart Assign · Collaboration · Integrations(+3 fiches) · Analytics.
> Reste en produit : **agents · approvals** (beta). Puis lots Legal+Company, Solutions/Compare.
>
> ### ⚑ v50 (31/07) — Fiches connecteur détaillées (GitHub · Slack · Plane)
> Demande user : de vraies fiches produit par connecteur (point 9/10). Fait **uniquement pour les 3 connecteurs
> réellement implémentés en profondeur** — les 126 autres restent au catalogue. **Chaque capacité listée = un
> endpoint réel** ; j'ai lu `IntegrationController` + `integration-service.ts` avant d'écrire. Zéro invention.
> - **Réalité par connecteur (source : le controller)** :
>   · **GitHub** : OAuth 1-clic ; **read** repos (visibilité, open-issues) + issues/PR d'un repo ; **link** un PR
>     ou commit à une issue TaskForce (statut live Open/Merged/Closed). Pas de create issue/branch (donc pas dit).
>   · **Slack** : OAuth 1-clic ; choix des canaux + types d'events ; **miroir** des events issue/workflow. Sortant
>     seulement (pas de lecture de conversations).
>   · **Plane** : clé API + slug ; liste des projets ; **sync des issues → graphe Brain OS** (created/updated/
>     ingestedNodes). **Le seul connecteur avec ingestion Memory live.** Tous : gate **Business+**.
> - **Matrice Connect / Remember / Act par connecteur, statut RÉEL** (répond au point 10 sans rien fabriquer) :
>   GitHub = **Live / Rolling out / Beta** · Slack = **Live / Not applicable / Beta** · Plane = **Live / Live /
>   Not applicable**. Vérifié en DOM que les 3 diffèrent (pas de copier-coller).
> - **Bloc « Honest about the edges »** par fiche : ce qui n'est PAS dans l'intégration aujourd'hui (create
>   issues/branches pour GitHub, lecture de chat pour Slack, write-back pour Plane). + bloc Access & governance
>   (owners/admins, credentials chiffrés, scopes) + liens Trust + docs fournisseur.
> - **Fichiers** : `lib/connectors.ts` (données, règle « rien d'inventé »), `components/site/ConnectorDetail.astro`
>   (template réutilisable), 3 pages fines `pages/product/integrations/{github,slack,plane}.astro`.
> - **Catalogue** (`IntegrationCatalogue.tsx`) : les 3 tuiles éprouvées deviennent **cliquables** (→ fiche, chevron)
>   via un composant `Tile` + set `DETAIL`. `nav.ts` BUILT_ROUTES += les 3 routes.
> - Vérifié : 3 fiches **200, 0 erreur console**, matrices correctes (DOM), capacités/auth/plan/flows/notYet/
>   governance/back+trust+docs présents ; tuiles catalogue → liens `/product/integrations/{key}` en SSR.
>
> ### ⚑ v49 (31/07) — Integrations : passe de PRÉCISION produit (review 8.5/10)
> Consigne user : « precision and functional depth, not more copy ». Aucune section marketing en +.
> - **Rewords honnêteté** : Hero « they become context and capabilities » → « **then bring their context and
>   capabilities into your runs** » (moins absolu). Carte **Connect** : « can be connected — Live across the
>   catalogue » → « **can be configured and connected. OAuth for supported providers; the rest use encrypted
>   credentials you provide.** » (lève l'ambiguïté exists/configurable/connected/usable). Carte **Remember** :
>   « a run starts from your real context » → « runs can start from **the context your team has already built** ».
>   Sécu **Bounded by capability** : « limited to its declared capabilities » → « **only what a connector exposes —
>   and only what the credentials and scopes you configure permit** » (défendable en pentest).
> - **Diagramme de flux réel** (remplace la frise de pilules) : boîtes empilées **Your systems →(context)→
>   TaskForce [ Memory → Agents → Human approval ] →(approved action)→ External systems**. 2 flèches `ArrowDown`.
> - **Profondeur des 129 rendue EXPLICITE** (`IntegrationCatalogue.tsx`) : marqueurs = la capability RÉELLE —
>   **Memory** (Plane), **Actions** (GitHub, Slack) — + **légende** « Every connector is connectable today.
>   Deeper capabilities — Memory / Actions — are rolling out; Plane, GitHub and Slack lead. » Vérifié en DOM :
>   memCount=1 (Plane), actCount=2 (GitHub+Slack) sur 129.
> - **HONNÊTETÉ — ce que j'ai REFUSÉ de faire** (points 4/5/9/10 de la review) : pas de badges Read/Write/Memory/
>   MCP sur les 129, pas de 129 fiches détaillées. Raison : `ConnectorCatalog` n'a par connecteur qu'un nom +
>   catégorie + type d'auth + 1 ligne de desc, et **tout est `AVAILABLE`/`observe`** (seuls github/slack ont `act`,
>   seul Plane a la sync Memory). Inventer des manifests de capabilities = exactement la « credibility debt » que le
>   user redoute (points 3/7/11). → fiches détaillées **proposées pour les 3 connecteurs éprouvés seulement**.
> - **Cohérence inter-pages (point 11)** : `enterprise.astro` disait « GitHub · GitLab · Linear · Slack · **+40
>   more** » (contredit 129) → **« +125 more »** (4 nommés + 125 = 129). Vérifié DOM : +125 oui, +40 non.
> - Vérifié : integrations 200, vite:0, 0 erreur console, rewords OK, diagramme (5 nœuds + 2 flèches), légende,
>   marqueurs Memory/Actions corrects, catalogue featured→showAll (129, 0 image cassée) toujours OK.
>
> ### ⚑ v48 (31/07) — Integrations : refonte de la HIÉRARCHIE du message (review user)
> Le fond était bon (9/10) mais « 129 connectors » volait la vedette au vrai message : TaskForce n'est pas un
> annuaire, c'est **la couche qui transforme les systèmes de l'entreprise en contexte + capacités** pour les runs.
> Refonte structurelle en 5 blocs (Hero → Catalogue → How it works → Security → Positioning), pas de section en +.
> - **Hero** : « declarative catalogue » (jargon) retiré du pitch → « One catalogue, 129 connectors across 16
>   categories — from your tracker and repo to your cloud, docs and models. Connect them in **minutes**, and they
>   become **context and capabilities** for every run. » (« in a click » → « in minutes » : honnête, seuls
>   GitHub/Slack sont OAuth 1-clic).
> - **Catalogue** (`IntegrationCatalogue.tsx`) : ne domine plus. **Vue « Featured » par défaut = 14 connecteurs
>   stratégiques** (Linear, Jira, GitHub, GitLab, Slack, Sentry, PostgreSQL, Notion, Google Drive, Figma, OpenAI,
>   Anthropic, Ollama, Keycloak — ils racontent le produit) + bouton **« Show all 129 connectors »** (bascule sur
>   le catalogue complet ; recherche/filtre y basculent aussi). Compteur « Featured · 129 connectors, 16
>   categories » puis « X of 129 ».
> - **How it works** = le vrai cœur. Distinction rendue EXPLICITE : **Connect = availability (Live)** · **Remember
>   = ingestion into Memory (Beta, Plane live)** · **Act = action via MCP (Beta)**. + **flux** « Your systems →
>   TaskForce → Memory → Agents → Human approval → External systems » + **raccord aux 3 piliers** (Integrations
>   brings the context · Memory preserves the reasoning [→brain-os] · Orchestration decides what happens next
>   [→orchestration]). Note « Beta on purpose » + roadmap conservée.
> - **MCP — claim sécurisé au périmètre EXACT du code** (le user a prévenu qu'un security engineer testerait) :
>   `McpClient.ToolDef.readOnly` vient de `annotations.readOnlyHint` **défaut = false** → tout ce qui n'est pas
>   explicitement read-only est **traité comme une écriture → confirmation humaine** ; `McpActionController.execute`
>   n'exécute qu'une action **déjà approuvée** (gate BUSINESS+). Formulation retenue : « Anything not explicitly
>   read-only is treated as a write — the agent proposes it, and it runs only after a human approves it. »
> - **NEW section Security & permissions** (« Your credentials, your scopes, your control ») = pont vers le Trust
>   Center : 4 points vérifiés (OAuth where supported · encrypted at rest · bounded by capability observe/act ·
>   secrets used server-side, never in a model prompt) + lien « See security & data handling → » vers `/trust`.
> - **CTA** revendique le résultat : « Your tools become context and capabilities for every run » + « …with humans
>   still in control ».
> - Vérifié : HTTP 200, vite:0, **0 erreur console**, défaut = **14 featured** (les bons noms, marqueurs OAuth OK),
>   **Show all → 129 of 129, 0 image cassée**, toggle « Show featured only », flux (6 nœuds), 3 piliers liés
>   (brain-os + orchestration), 4 points sécu, lien Trust. Screenshot KO (pane vw=0) → DOM = preuve.
>
> ### ⚑ v47 (31/07) — Lot produit — Integrations (+ correction d'honnêteté du badge)
> Page la plus à risque : une grille de 47/60 logos laisse croire « on s'intègre à tout ». **Avant d'écrire,
> j'ai lu le vrai code** (`ConnectorCatalog.java` + l'UI réelle `components/integrations/integrations-catalog.tsx`).
> Vérité : catalogue **DÉCLARATIF de 129 connecteurs / 16 catégories** ; TOUT est *connectable* (identifiants
> stockés chiffrés — OAuth 1-clic pour GitHub & Slack, formulaire générique pour le reste) **mais la sync des
> données par outil n'est pas encore active partout** (le LabBanner de l'app le dit noir sur blanc). Seul **Plane**
> a une vraie sync → Brain OS aujourd'hui. Le **MCP** est réel : les agents peuvent appeler des outils de serveurs
> MCP externes, et **toute écriture externe est *proposée* puis *validée par un humain*** (`McpActionController`,
> gate `PlanFeature.INTEGRATIONS` = BUSINESS+). → Même principe « l'IA propose, l'humain décide » que tout le site.
> - **`/product/integrations` (NEW, badge Beta)** : PageHero (Beta) « Connect the tools your work already lives in »
>   → « Find your stack » (**catalogue cherchable réutilisé/réécrit `IntegrationCatalogue.tsx`**, îlot `client:load`)
>   → « Connect, remember, act » (3 façons avec badge de maturité inline : **Connect = Live**, Feed the memory =
>   Beta [Plane live, rolling out], Act via MCP = Beta [écriture validée par un humain]) + phrase honnête « we mark
>   integrations Beta on purpose » + lien roadmap → PageCta.
> - **`IntegrationCatalogue.tsx` réécrit fidèle** : 129 entrées transcrites de `ConnectorCatalog` (mêmes clés →
>   mêmes logos), 16 vraies catégories, recherche + filtres. Compteur **honnête « 129 of 129 »** (plus de « 60+ »
>   inventé). Repli **initiales sur `onError`** (le `BrandLogo` de la landing n'a pas de fallback → 0 image cassée
>   sur 129). Marqueur sur les 3 éprouvés (Plane « Brain OS sync », GitHub/Slack « 1-click OAuth »).
> - **2 corrections d'honnêteté dans `nav.ts`** : badge Integrations **`live` → `beta`** (l'app elle-même le marque
>   Lab ; « live » était faux) ; desc **« 47 tools » → « 129 connectors across 16 categories »** (le vrai chiffre).
>   ⚠️ **Conséquence** : Integrations sort du lot « live ». Reste réellement **live** dans le produit : **Analytics**.
> - **`BUILT_ROUTES` += `/product/integrations`**.
> - Vérifié : HTTP **200**, 278 Ko, vite:0, **0 erreur console** (hydratation OK), îlot rendu (recherche présente,
>   **129 tuiles, 0 image cassée**), compteur « 129 of 129 », 3 marqueurs deep, badges hero=Beta + cartes Live/Beta/
>   Beta, **interaction testée** : filtre « AI models » → « 10 of 129 » = les 10 vrais modèles (Groq…Replicate).
>
> ### ⚑ v46 (31/07) — Lot « Pages produit (live) » — Collaboration
> Deuxième page du lot. Feature **LIVE** : boards / issues / cycles en temps réel. Le fil rouge du site
> (une seule surface pour les gens ET les agents) porte la page.
> - **`/product/collaboration` (NEW)** : PageHero (badge **Live**) « One board for your team and your agents »
>   → « The board your team already knows » (**nouvelle scène statique `illustrations/CollabBoard.tsx`**) →
>   « Built to run the work, not just track it » (4 primitives) → « Everyone sees the same board, the moment it
>   changes » (temps réel, 3 cartes) → « People and agents, on the same board » (fil rouge + lien vers Smart
>   Assign) → PageCta. Bandes blanc/gris alternées, structure calquée sur Smart Assign.
> - **`CollabBoard.tsx`** : réutilise `AppWindow` + la fiction `lib/story` (mêmes colonnes/cartes que le hero),
>   mais raconte la SURFACE PARTAGÉE — chip **Cycle 8**, pastille **« Live »** (le board reçoit les events),
>   compteurs de **commentaires** sur les cartes, et 2 toasts qui rejouent de VRAIS events diffusés (un
>   déplacement `updated` « Léo moved CP-9 », une création `created` « Sam created CP-33 »). **Statique (SSR)**.
> - **HONNÊTETÉ (ancrée dans le code réel du front)** : le temps réel = `use-project-realtime.ts` qui s'abonne à
>   `/topic/projects.{id}` et ne diffuse que des events d'issues (`created`/`updated`/`deleted` → upsert/remove du
>   store, STOMP + fallback SockJS). **Aucune présence** (pas de « en ligne », « untel édite », curseurs) : le
>   backend ne la diffuse pas, donc la page ne la montre pas. Les 4 primitives sont toutes vérifiées réelles :
>   `cycle-service.ts` (cycles), issue-service `listComments/addComment/…` + `commentCount` (discussion),
>   board/issues, RBAC `WorkspaceRole/ProjectRole` (VIEWER lecture seule — cf. [[rbac-write-model]]).
> - **`nav.ts` BUILT_ROUTES += `/product/collaboration`** → dégrisé (menu Product + hub `/product` + footer).
> - Vérifié : HTTP **200**, 260 Ko, vite:0, DOM `vw=1280` → board rendu (breadcrumb), pastille Live, Cycle 8,
>   2 toasts, carte héros, 4 colonnes, 4 primitives (entités décodées : « Boards & issues », « Roles & access »),
>   3 cartes temps réel, lien croisé. **Garde-fou présence : `presenceLeak: []`** (0 fuite). Screenshot KO
>   (pane non composité) — DOM = source de vérité.
> **Reste du lot produit** : analytics · integrations (live) ; agents · approvals (beta).
>
> ### ⚑ v45 (30/07) — Construction des pages grisées : lot « Pages produit (live) » — Smart Assign
> Le user valide que les 8 pages existantes sont revues ; on construit maintenant les pages grisées, lot par
> lot. Choix user : **Pages produit (live)** d'abord (dégrise le menu Product). Step by step, review à chaque.
> - **`/product/smart-assign` (NEW, feature LIVE)** : PageHero (badge **Live**) « The right work to the right
>   hands » → section « Recommendations, not decisions » qui **réutilise la vraie scène animée `AutoAssign`**
>   (`illustrations/AutoAssign.tsx`, `client:idle` : la modale Smart Assign réelle — reco par compétences/charge/
>   dispo + la RAISON de chaque choix + l'agent assigné comme un membre ; c'est la démo de la feature, pas un
>   visuel emprunté à la home) → « How it decides » (3 signaux Skills/Load/Availability + « shows its reason » +
>   profils de compétences nourris par l'onboarding) → « A coding agent is an assignee like any other » (le
>   différenciateur : même board/card/checkpoint) → « A suggestion, never an autopilot » (reco overridable +
>   reviewer humain nommé même quand un agent exécute) → PageCta. Contenu honnête (feature shipped).
> - **`nav.ts` BUILT_ROUTES += `/product/smart-assign`** → dégrisé dans le menu Product + le hub `/product` +
>   footer. Vérifié : 200, vite:0, 5 h2, scène hydratée (console 0 err), badge Live, lien live sur hub/home.
> **Reste du lot produit à construire** : collaboration · analytics · integrations (live) ; agents · approvals
> (beta). Puis lots Légal+Company, Solutions/Compare. + 3 transverses ouverts (self-hosting/prix/open-source).
> **MAJ (verrou Smart Assign, review 8.5/10)** : (1) « best placed » → « **best matched to the work** » (hero +
> meta desc — les 2 ! la meta portait encore l'ancienne). (2) « Skill profiles **fill** as your team works » →
> « **can be enriched** … with a short onboarding capturing the rest » + Skills factor « shipped in before » →
> « the areas they're strongest in » (pas de survente d'apprentissage auto ; nourri par le wizard onboarding,
> cf. [[onboarding-flow-design]]). (3) **vocabulaire canonique harmonisé** : décision = approve/approval/human
> approval ; exécution = named human reviewer ; « sign-off » ambigu retiré (« Nothing ships without human
> approval »). (4) CTA « ships today » → « **is live today** — route work to teammates or coding agents ».
> Design principle acté : **AI recommends/proposes, humans decide** (Orchestration/AI-transparency/Smart Assign).
> Review user : éviter la « landing de prise de RDV » ; on vend une DÉMONSTRATION sur leur problème.
> Structure user : Hero → What to expect → Bring one real outcome → Who this is for → Demo form → Start free.
> - Hero lead affiné : « …**using** a real outcome from your team. We'll run it end to end, **show where humans
>   stay in control**, and answer the hard questions. » (remet la gouvernance au centre).
> - **What to expect** : 5 items concrets titrés (A real workflow not a slide deck · Your existing stack ·
>   Governance in practice · Security and deployment · **No roadmap theatre** — « what's Live, Beta or Planned »).
> - **NEW « Bring one real outcome »** (What to bring) : « something your team actually wants to ship … You
>   don't need to prepare anything — a short description is enough. » → CTA concret.
> - **NEW « Who this is for »** : Built for teams shipping with AI + 3 profils (Engineering leaders · Product &
>   engineering · Security & platform teams) → le visiteur se reconnaît.
> - **Formulaire mieux qualifié** (`DemoForm.tsx`) : + select **« What would you like to explore? »** (Run a real
>   workflow / Self-hosting / Security & compliance / AI orchestration / Other) + textarea **« What would you like
>   us to run? »** + helper. Champs : name/email/company/size/topic/message ; mailto inclut le topic. Bouton
>   « Request a demo ». Formulaire centré/dominant (section `#demo-form`, hero « Request a demo » y ancre).
> - **Start free instead** : phrase de RÉCONCILIATION self-hosting (voir ⚠️ ci-dessous).
> - ⚠️ **INCOHÉRENCE SITE-WIDE À RÉGLER (flag user)** : plusieurs CTA + la Vision (« self-hosting is **not** an
>   enterprise upsell ») disent « **self-hosting available from day one** » (= dispo pour tous), MAIS **Pricing
>   gate le self-hosted en Enterprise** (feature « Self-hosted deployment » + card « two ways to run AI » finissant
>   par « Enterprise. » + row table —/—/✓). J'ai mis sur book-a-demo la phrase user « Self-hosting is available
>   from day one; Enterprise adds deployment assistance, governance, SSO, advanced controls and support. » →
>   **Pricing doit être harmonisé** (self-hosting dispo pour tous ; Enterprise = assistance/support/SSO/SLA).
>   À CONFIRMER par le user (dépend aussi du statut open-source, toujours ouvert) avant de toucher Pricing.
> Vérifié DOM : 5 sections + hero, form 6 champs (topic ajouté), 5 topic options, anchor demo-form, console 0 err.
> **MAJ (verrou, 2e review 9/10)** : (3) « wants to ship » → « **needs to ship** ». (4) « Built for teams
> shipping with AI » → « **putting AI into production** ». (6) hiérarchie CTA variée : Hero « **See TaskForce
> in action** » → Form « Request a demo » → « **Start free** » (avant « Request a demo » 3×). (7) phrase
> self-hosting : « **governance** » retiré (la gouvernance = human approval est DÉJÀ en Pro) → « Enterprise adds
> deployment assistance, SSO, advanced controls and dedicated support ». (8) « connects to » → « **fits around**
> the … your team already uses » (TaskForce ne remplace pas les outils). #5 (labels form) déjà OK depuis la
> réécriture (Name/Work email/Company/Team size/topic/message tous labellisés — vérifié DOM). Console 0 err.
> **Pages built restant à reviewer avec le user : HOME (index) + /product (hub)** (il croyait avoir tout vu).
> Review user : la page ressemblait à une version longue de la card Enterprise du pricing. Il faut vendre
> **l'adoption** (déploiement, garanties opérationnelles, parcours), pas que le contrôle. Refonte complète :
> - **Hero** gardé (« AI in your delivery path, on your terms » + triptyque leverage/control/attribution/data).
> - **3 piliers regroupés** (au lieu de 6 cards plates) : **Deploy privately** (self-host, local models) ·
>   **Govern every run** (approvals, RBAC, audit) · **Control your data and models** (hosted/local, no-training,
>   connector scopes).
> - **NEW « Built for your environment »** : Identity (Keycloak/OIDC/SAML) · Infrastructure (Docker/Compose) ·
>   Models (Anthropic/OpenAI/Ollama/local) · Data (PostgreSQL/S3-MinIO) · Integrations (GitHub/GitLab/Linear/
>   Slack/+40). « TaskForce sits inside the infrastructure you already control. »
> - **NEW « Enterprise controls »** : contrôle **par couche** (Identity/Access/AI/Data/Delivery/Audit/Deployment/
>   Security/Operations → contrôle) — la grille que veut un buyer.
> - **NEW « Deploy your way »** : Self-hosted / Private models / Enterprise deployment + **honnêteté K8s** :
>   « Docker Compose today. Kubernetes deployment support is on the roadmap. » (pas annoncé comme dispo).
> - **Security & compliance reformulée (moins provoc)** : « No obtained-certification **theatre** » → « No
>   certification claims we **can't substantiate** » + « documents the controls… evaluate before deployment ».
>   No-training aligné sur AI-transparency (« does not use your data to train **its own** models ; hosted =
>   provider terms ; local = inference on-prem »). Mini-row GDPR=Technical controls / SOC 2=Roadmap / DPA=On request.
> - **NEW « What happens next »** (le gros manque) : **01 Architecture review → 02 Deployment → 03 Security
>   validation → 04 First workflow** — transforme l'achat en projet à étapes, réduit le risque perçu.
> - **CTA + funnel** : « Bring TaskForce to your organization » (Book a demo / trust center) + ligne « **Not
>   ready for Enterprise? Start with the delivery workspace →** » vers /pricing (Enterprise buyer→demo ;
>   dev→free). Fini le « Start free / Self-hosting available from day one » incongru.
> Bandes alternées (8 sections). Vérifié DOM : 6 eyebrows + 7 h2, env/controls/funnel présents, console 0 err.
> Statuts conservateurs (K8s roadmap, SOC2 roadmap). Page = « comment une org Enterprise adopte TaskForce ».
> **MAJ (verrou, 2e review 8.5/10)** : 2 ajouts stratégiques + précisions. (a) **NEW « Why TaskForce » (build
> vs buy)** entre controls et deploy : « Don't build the governance layer yourself » + 4 axes (Governed by
> default · Model-independent · Context-aware · Built around your agents) — répond à « pourquoi pas Claude API
> + LangGraph maison ». (b) **NEW diagramme d'architecture** après « Built for your environment » : IdP (OIDC/
> SAML) → TaskForce (Governance·Memory·Orchestration → Approval·Context·Audit) → Connected systems / Data /
> Models — l'archi comme argument de vente Enterprise. (c) **4e pilier « Fit your existing stack »** (Why
> Enterprise passe de 3 à 4). (d) hero « or your data » → « or **ownership of** your data ». (e) env label
> « Infrastructure » → « **Runtime** » (K8s pas sous-entendu ; reste roadmap dans Deployment). (f) sécurité :
> GDPR/SOC2/DPA en phrases explicites (« export, erasure and data handling in place » · « Not certified,
> groundwork on roadmap » · « Available on request »). (g) adoption 04 « validate the operating model ».
> Bandes réalternées (controls→blanc). DOM : 8 eyebrows (Why Enterprise/Built for env/**Architecture**/Enterprise
> controls/**Why TaskForce**/Deployment/Security/Adoption) + 9 h2, 4 piliers, 4 why-cards, arch présent, 0 err.
> Cohérence produit acquise sur 5 pages : Orchestration(what)·Memory(why)·Trust(who/when)·AI-transparency(what
> agents do)·Enterprise(how it fits an org) → « platform product », pas « SaaS avec agents ».
> Review user (7/10) : le pricing doit RACONTER la montée en gamme, pas être une grille, et s'aligner sur
> le reste (Planned/Beta, TaskForce Memory, claims prudents). Réécrit `PricingSection.tsx` :
> - **Progression** explicite via un kicker par plan : Free = **Delivery workspace** · Pro = **AI-assisted
>   delivery** · Enterprise = **Governed AI delivery**. + titre de table « Workspace → AI delivery → governed
>   enterprise delivery ». + **table comparative 15 lignes** (land-and-expand lisible d'un coup).
> - **Planned/Beta corrigé** : **Orchestration retirée du pricing** (elle est Planned) ; on ne vend que
>   « **AI agents · Beta** ». Fini « AI agents & orchestration Beta » (contradisait la page Orchestration).
> - **« Brain OS — auto docs » → « TaskForce Memory · Beta »** (nom public partout).
> - **Claims prudents** : retiré « GDPR compliance » + « 99.9% uptime » (contredisaient le Trust Center) →
>   « All plans include TLS encryption and GDPR-oriented data controls. Availability targets and SLAs vary by
>   plan » + lien trust center. Retiré **« the core is open-source »** de la FAQ (**non vérifiable** — aucune
>   trace open-source/licence dans les docs ; à confirmer par le user si c'est réellement OSS).
> - **Enterprise étoffé** : SSO/SAML · **Self-hosted deployment** · local-model deployment & model controls ·
>   Advanced RBAC & per-project · Audit logs & retention · DPA/subprocessors · Security review & deployment
>   assistance · Dedicated support & SLA.
> - **Coût IA clarifié** (aligné [[plan-lifecycle-ai-gating]] AiMeter) : « AI usage metered by tokens » + FAQ
>   « Are AI models included? » → plateforme incluse, **usage hosted métré par tokens**, **local Ollama = 0 coût
>   modèle TaskForce** + section **« One platform. Two ways to run AI »** (Hosted usage-based / Self-hosted your infra).
> - **Membres = per-seat** ([[pricing-members-model]] : membres illimités façon Linear ; seul cap = Free = « up
>   to 5 collaborators on private projects » façon GitHub). ⚠️ **Diverge de la grille de review du user** (qui
>   remettait des caps 5/50) — j'ai suivi la décision durable + la FAQ (« adjust seats, prorates ») → **À
>   CONFIRMER par le user**. Fix aussi vérifié plus tôt : `/contact`→`/book-a-demo`, CTA localhost→APP_URL.
> - Prix inchangés ($12/$10, placeholders — cf. commentaire ⚠️). Backlog note : limites annoncées pas toutes
>   enforced (PROD-4.x). Vérifié DOM : 3 kickers, table 15 lignes, toggle hydraté, console 0 err, Brain OS=0.
> **MAJ (verrou, 2e review ~9/10)** : le user TRANCHE le modele membres -> Free = **5 collaborators** ·
> Pro = **Unlimited members, billed per seat** · Enterprise = **Unlimited** (⇒ Enterprise se differencie par
> la GOUVERNANCE/deploiement, plus par le nombre de membres : « Unlimited workspaces & members » -> « Unlimited
> workspaces »). Table Members : 5 collaborators / Unlimited / Unlimited. « AI usage metered by tokens » (cards)
> -> « **billed by consumption** » ; sous-ligne « Hosted model usage is metered by tokens … Local models incur
> no TaskForce model charges » (mecanisme sous le pricing). « no prompts leave your network » -> « **no prompts
> or outputs** leave your network ». Hero raccourci. Table « AI model usage » -> « Usage-based / Usage-based or
> local ». Reste ouvert : **prix** (placeholders) + **open-source** (retire, a reconfirmer si OSS).
> Review user : passer d'« l'humain garde le contrôle » à une vraie transparency page. Narration en 10
> étapes (what does AI do → access → autonomy → proposal path → models → data → logged → accountable →
> controls → CTA). Comblé les 3 vrais trous + schéma + précisions juridiques.
> - **Hero lead** plus précis (annonce les 3 questions) : « …You should be able to see what it does, what
>   it can access, and where human judgment stays required. » (au lieu de « legible », abstrait).
> - **« a named human disposes » → « The AI proposes. A named human decides. »** (raccord au positioning
>   Orchestration ; « dispose » = faux-ami/juridique en EN).
> - **« Nothing advances without a person » → « No consequential workflow step advances without human
>   approval »** (précis : l'IA fait bien des appels modèle seule ; ce qui est gaté = les étapes du run).
> - **NEW « TaskForce agents vs coding agents »** : TF agents planifient/proposent, n'exécutent pas le code ;
>   implémentation déléguée au coding agent (Claude Code/Cursor). « TaskForce orchestrates; your coding
>   agent executes. » (répond à « est-ce que TaskForce exécute du code lui-même ? »).
> - **NEW « What the AI can access »** : contexte de l'étape + connecteurs du run seulement ; liste
>   (workspace · Memory · repos · issues · approved artifacts · connector-scoped) ; « never grants broader
>   access than the scopes you configure ».
> - **NEW schéma central « The path of a proposal »** (custom, hors Prose) : Workspace+Memory → Agent →
>   Proposal → Human review (chips **Approve/Edit/Reject**) → Next checkpoint. « Only an approved proposal
>   becomes the context for what follows. »
> - **Training reformulé** (séparé TaskForce / providers / conditions) : « TaskForce does not use your …
>   to train **its own** models. When a hosted provider is used, data handling is governed by that provider
>   and your service config. Local (Ollama) keeps inference within your infra. » (plus d'absolu « never
>   used to train models »).
> - **NEW « What every model call records »** : provider/model/step/timestamp/infra/tokens/status/artifact +
>   « prompts/outputs may be retained as artifacts … « logged » does not mean every prompt is kept forever ».
> - **Accountability** + phrase clé : « Human approval does not make an AI-generated decision correct — it
>   makes responsibility explicit. » (TaskForce ne prétend pas résoudre l'AI-reliability, il rend le process
>   contrôlable).
> - **Controls** élargis : + connector perms · per-project access · reject/revise artifacts · owner-only
>   audit access.
> Structure : PageHero → Prose1 (do/agents/access/autonomy) → schéma (îlot-free) → Prose2 (models/data/logs/
> accountability/controls) → CTA trust center. Bandes alternées. Pas de remplissage « responsible/ethical AI »
> (demande user). Vérifié DOM : 11 h2 ordre exact, schéma + chips présents, anciennes formulations retirées,
> 0 erreur. Cohérent avec Trust Center (mêmes claims training/logging).
> **MAJ (verrou, 2ᵉ review)** : (4) « Every model invocation **can be traced** » → « **is recorded** with its
> execution context » (spéc d'audit, pas promesse). (7) **NEW « Known limitations & risks »** (avant Controls) :
> l'IA ne garantit pas correct/complet/sans biais ; liste (misunderstand · wrong recs · missed deps · leak si
> connector mal configuré · artifacts à corriger) ; « reduce these risks but do not eliminate them » → évite
> l'illusion « AI governance = problème résolu ». (8) comportement des **rejets** ajouté sous le schéma : « A
> rejection isn't silently discarded — it stays in the run's audit trail with your feedback, and can shape the
> next proposal » (prépare learning-from-reviews / prediction calibration). (9) **« In governed runs, »** en
> préfixe de l'autonomie (l'orchestration complète est Planned → pas de surpromesse « déjà partout en prod »).
> DOM : **12 h2**, Known limitations bien avant Controls. Page = vraie AI governance page.
> 3ᵉ review (verdict 8.5–9/10). But : la page devient la PREUVE que « governed » n'est pas du marketing.
> **Ajouts de sections** (→ 16 sections de contenu + CTA, cap ~16 respecté) :
> - **Security principles** (intro, après hero) : Security by architecture · Your infrastructure · Human
>   accountability · Least privilege · Verifiable execution. Donne la thèse sécu en 10 s.
> - **Security architecture** : **trust boundary MATÉRIALISÉE** — boîte pointillée « Your network — when
>   self-hosted » contenant TaskForce (Memory/Workflow/Audit/Permissions) + **Local model Ollama (stays in
>   your network)** ; **Hosted model (Anthropic/OpenAI) DEHORS** de la frontière (« external — leaves your
>   network »). IdP (OIDC/SAML) + connected systems en entrée.
> - **Threat model** : ajout du 3ᵉ axe **« Security boundaries »** (TaskForce=application layer · vous=deployment
>   en self-host · IdP=auth/MFA · connected systems=connector perms · providers=leur infra d'inférence).
> - **Secure development lifecycle** (remplace « Security operations » : processus, pas outils) : SAST/deps/
>   container/DAST/PR review/CI checks/vuln triage + callout **« Latest automated scan · July 2026 — No
>   high-severity findings detected »** (reformulé, plus défendable que « 0 high ») + responsible disclosure.
> - **Availability & resilience** (NEW, lacune comblée) : Backups (self-host=ta policy / managed=Planned) ·
>   Recovery · Monitoring · Incident response.
> **Corrections de claims** :
> - No-training : sépare TaskForce / providers / conditions — « TaskForce uses provider APIs configured for
>   business use, and never uses your data to train its own models. Training policy … depends on the provider
>   and service; local models remove the question. » (+ pas de promesse générique sur tous les providers).
> - GDPR : note ajoutée « Technical controls are not the same as full legal compliance — organizational and
>   contractual obligations depend on your deployment. »
> - Scan « 0 high » DATÉ + reformulé « No high-severity findings **detected** … at that time » (≠ « zéro vuln »).
> - **Production access** intégré à Identity : **« Self-hosted, TaskForce personnel have no access to your
>   instance or its data — you run it. »** (claim fort ET vrai en self-host).
> - MFA « managed » (déjà v39), OIDC/SAML désambiguïsé (déjà v39).
> **Bandes** ré-alternées proprement (flip glance→gris, threat→blanc, compliance→gris, sdlc→blanc ; principes
> blanc, availability gris). Vérifié DOM : **17 h2**, ordre exact visé, console 0 erreur, boundary présente.
> Reste factuel (pas de récit produit ici) ; « No badges we haven't earned » gardé. À confirmer user : CI
> réellement automatisé (j'ai gardé « Automated CI checks » car le user l'a demandé + `.ai` roadmap dit « in CI »).
> Narratif produit à 3 piliers acté (pour le reste du site) : **Orchestration=what happens · Memory=why ·
> Trust=who/when approved** → decision infrastructure for AI-native orgs. Pane mort → 2 diagrammes à valider en direct.
> Review user : page devenue crédible → maintenant **strict sur chaque claim technique** (un claim trop
> absolu est pire que pas de claim). Verdict 8.5–9/10. 7 corrections + 2 ajouts + datage :
> 1. **OIDC/SAML désambiguïsé** : « SSO via OIDC brokered through Keycloak » → **« SSO — TaskForce
>    authenticates through Keycloak over OIDC »** + **« Enterprise IdP federation — Keycloak can federate
>    with your IdP over SAML or OIDC »** (TaskForce↔Keycloak = OIDC ; Keycloak↔IdP client = SAML/OIDC).
> 2. **MFA** « enforced by your IdP » → **« managed by your IdP »** (« enforced » impliquait qu'on refuse
>    toute auth sans MFA).
> 3. **Data flow** « nothing in this flow leaves your network » → **« your model prompts, outputs and run
>    context can remain entirely within your network »** (cible précisément, sans promettre l'absence de
>    toute dépendance externe — telemetry/CDN/etc.).
> 4. **No training** : « called under API terms that exclude training » → **« used under API terms that do
>    not permit training on customer API data »** + ligne miroir ajoutée sur **`/legal/ai-transparency`**
>    (cite les terms providers hosted + local Ollama = rien ne sort).
> 5. **Secrets** « zero plaintext credentials in the database » → **« encrypted at rest with AES-256-GCM
>    and never stored as plaintext database values »** + « They are not included in the prompts sent to
>    models. » (plus précis : ne prétend pas l'absence en mémoire/logs).
> 6. **« 0 high » DATÉ** : glance label → « In place » ; secops → **« Latest scan · July 2026 · 0
>    high-severity findings »** (sinon la page afficherait « 0 high » indéfiniment). Re-mesuré 21-22/07 dans
>    le brief soutenance.
> 7. **GDPR** « Controls in place — export, erasure, anonymization » → **« Technical controls: export,
>    erasure, anonymization »** (jamais « GDPR compliant » sans analyse juridique).
> **+ Section « Security architecture »** (diagramme des frontières de confiance : Your IdP (OIDC) +
> connected systems → **TaskForce [Memory·Workflow·Audit]** → **Model boundary** → Hosted (leaves your
> network) / Local Ollama (stays in your network)) — un architecte lit le modèle avant les détails.
> **+ Section « Threat model & shared responsibility »** : *What TaskForce protects against* (workspace
> access, credential exposure, agent overreach, cross-project, prompt/context leakage, unauthorized model
> calls, malicious connectors) / *What remains your responsibility* (infra, IdP+MFA, connector perms,
> local model, host/network/backup en self-host). Maturité rare pour une startup AI.
> **Resources hub** : lead « Public where possible, available on request where appropriate » (au lieu de
> « ask and we'll share ») ; « Soon » → **« Coming soon »** ; + « Vulnerability disclosure », — « Terms ».
> Philosophie gardée : **« No badges we haven't earned. »** = signal de maturité.
> Vérifié : trust 200/vite0, **15 sections**, tous les nouveaux claims présents, tous les anciens retirés,
> scan daté, ai-transparency 200 + ligne providers. Pane mort → visuel (2 diagrammes) à valider en direct.
> Review user dure mais juste : la page (qui réutilisait le composant home `Trust`) = « security overview »,
> pas un Trust Center. Verdict user : copy 8/10, structure 5/10. La sécu **fait partie du produit** (AI +
> accès code + agents + intégrations + exécution + mémoire + audit) → page à pousser plus loin que la moyenne.
> **Refait 100 % custom** (plus de réutilisation du composant home). Règle absolue tenue : **conservateur,
> rien de non démontrable** — faits ancrés sur le Brain OS (`.ai/soutenance-brief`, `roadmap`, `tests-backend-journal`).
> **Faits RÉELS mobilisés** (pas inventés) : secrets **AES-256-GCM** au repos (`EncryptedStringConverter`,
> `enc:`, 0 secret clair) · **Keycloak OIDC RS256** (SSO, sessions/refresh/revoke) · **RBAC** testé
> (`AuthorizationService` requireMember/Role/Manager, Owner/Admin/Member/Viewer) · **RGPD réel** (`GdprService`
> export portabilité + effacement/anonymisation + suppression identité Keycloak) · **Semgrep + OWASP ZAP +
> Trivy, 0 HIGH** · modèles hosted (Anthropic/OpenAI) + local (Ollama) · self-host Docker · OAuth GitHub/Slack ·
> Postgres + MinIO(S3).
> **Structure (13 sections + CTA)** : Hero (gardé « Security you can verify, not just claim ») → **Security at a
> glance** (14 lignes, pastilles Available/Beta/Planned/Not started) → **How your data flows** (diagramme
> Workspace → TaskForce[Memory·Workflow·Audit] → Model provider[Anthropic·OpenAI·Ollama-local] + « avec
> self-host + local, rien ne sort du réseau ») → **AI security & governance** (« **AI can propose. It cannot
> approve itself.** ») → **Identity & access** → **Data lifecycle** (Collection→…→Backups, dont Retention =
> Planned assumé) → **Auditability** (What is recorded / What stays in your hands — répond « loggez-vous mes
> prompts ? ») → **Integrations & secrets** (« what can an agent do with the keys? » : scopes du connecteur,
> jamais le secret brut) → **Deployment models** (Self-hosted **Available** / Managed cloud **Planned**) →
> **Compliance** (GDPR in place · DPA/Subprocessors on request · **SOC 2 / ISO 27001 Not started** — jamais
> prétendre les avoir) → **Security operations** (Semgrep/ZAP/Trivy in place ; incident response/monitoring
> Planned) → **Security roadmap** (Current / Building, anti-theater) → **Documentation hub** (liens gated par
> `isLive` : 2 live + 6 « Soon ») → CTA « Bring it to your security team » + contact `security@taskforce.dev`.
> Décisions d'honnêteté clés : SOC 2/ISO = **Not started** ; pentest tiers = **Not yet** ; retention/backups/
> incident-response = **Planned** ; « no training on your data » nuancé (local=aucun ; hosted=API terms).
> Vérifié : 200, vite:0, 13 h2, faits présents, ancien composant Trust retiré, console 0 erreur, resources
> 2 live/6 grisés. **Pane mort (vw=0) → pas de capture ; overflow non mesurable mais layout 100 % responsive
> (grilles/flex, aucun élément large fixe). Visuel (diagramme de flux, tables) à valider en direct.**

> ### ⚑ v37 (30/07) — Roadmap : alignée sur le vocabulaire Orchestration/Memory (crédibilité)
> Review user : la roadmap vend la **crédibilité**, pas le produit ; à aligner sur les 2 pages verrouillées.
> - **Hero lead** moins défensif : « We commit to sequence, not to dates we can't keep… » → « We publish
>   the direction in the open. **Each capability moves from Planned to Beta to Live as it becomes real**
>   — and the changelog records what actually ships. » (⚠️ le user avait écrit « Live → Beta → Planned »
>   mais « as it becomes real » va vers Live → j'ai remis **Planned → Beta → Live**, à confirmer.)
> - **Next** : « Scoped agent roles » → **« Specialized agent team »** (« CPO, CTO and COO agents with
>   distinct responsibilities instead of one generalist ») — reprend le vocabulaire *delivery team*
>   d'Orchestration. « Model choice per step » gardé. « TaskForce Memory retrieval » Beta gardé (cohérent
>   avec la page Memory = Beta). « Human approvals » Beta gardé (les checkpoints complets sont Planned).
> - **Later** : « Governed orchestration » → **« Full orchestration »** (« The complete intent-to-deploy
>   run, from product framing to QA and sign-off » = reconnecte aux 7 checkpoints). « Learning from
>   reviews » → **« Prediction calibration »** (« Compare what agents predicted with what actually shipped
>   — and calibrate future decisions ») = raccord direct avec la section Prediction d'Orchestration,
>   évite le « l'IA apprend de vos feedbacks » vague. « Beyond engineering » gardé.
> - **CTA** : « Build on what's live today » / « grow into the run » → **« Start with what's live today »**
>   / « The delivery foundation is already in production. Start with your board, issues and integrations —
>   then add governed runs as they become available. » = raconte la stratégie : **delivery platform déjà
>   là → orchestration = couche supérieure progressive.**
> Archi narrative à 3 étages assumée : **Roadmap (ce qui est réel) → Orchestration (intention→décisions
> validées→software) → Memory (le raisonnement derrière).** Produit dessous : **delivery platform →
> orchestration → organizational memory.**
> Vérifié DOM : `#main` roadmap = nouvelles formulations, anciennes retirées. **NB : le footer (nav Labs
> grisée) affiche encore « Learning from reviews » — taxonomie de nav distincte, à aligner si le user veut.**
> **MAJ (verrou roadmap)** : (1) hero « moves from Planned to Beta to Live » → **« Each capability is
> clearly marked Planned, Beta or Live »** — n'impose plus un cycle de maturité (une feature peut passer
> Planned→Live direct). (2) CTA « already **in production** » → « already **shipped** » (plus sûr pour un
> projet école sans users prod confirmés ; à remettre « in production » si de vrais users en prod). Page figée.

> ### ⚑ v36 (30/07) — TaskForce Memory : passe finale (défendabilité technique + gouvernance)
> 2ᵉ review user de brain-os (le reste = validé). 2 corrections de fond :
> - **« causal links » → « relationships »** (point « A map of why ») : « causal » sur-vendait un moteur
>   de raisonnement causal alors que l'implémentation = pgvector + relations/metadata. Retiré aussi de
>   l'`aria-label` du `DecisionGraph` (« causal graph » → « the graph around it »). Plus aucun « causal »
>   user-facing. Plus défendable techniquement.
> - **Boucle de continuité** : dernière ligne « The decision goes back into Memory. » → **« Validated
>   decisions go back into Memory. »** — verrouille la gouvernance humaine (Memory n'apprend PAS tout ce
>   que les agents produisent, seulement le validé).
> - **Signature CTA** : « …TaskForce should. » → **« …TaskForce should remember why. »** — boucle avec
>   « Git remembers what changed. TaskForce remembers why. » et évite de suggérer que TaskForce « pense à
>   la place de l'organisation ».
> Archi narrative figée : **Orchestration = moteur décision/exécution · Memory = mémoire du raisonnement
> · Human = autorité · Agents = exécution.** Les deux pages se renforcent (un seul produit).
> Vérifié DOM : tout présent, « causal » = 0 sur la page. (Trust : review à venir.)

> ### ⚑ v35 (30/07) — TaskForce Memory « verrouillée » : 8 correctifs + phrase conceptuelle + continuité
> Review user de `/product/brain-os`. Idée poussée : **Memory = la mémoire DÉCISIONNELLE de
> l'organisation**, pas la mémoire des agents. 8 ajustements :
> 1. Hero : « The memory layer **for every run** » → « **behind every decision** » (prépare la narration
>    decisions/why). Meta desc alignée.
> 2. « Not a RAG over your wiki » + « Git remembers what changed. TaskForce remembers why. » — gardés.
>    Chapô : « alternatives it **beat** » → « **rejected** » (cohérent avec le modèle de décision).
> 3. **DecisionGraph** (composant partagé home + brain-os) : « **RAG** » retiré du graphe (on explique
>    justement qu'on est + qu'un RAG) → impacts « Billing · **Search** · Users » ; nœud rejeté refait
>    avec en-tête **REJECTED** + « **Weaker transactions** » (au lieu de « weaker txns ») ; « Vector
>    search + billing ». Le graphe raconte enfin une vraie décision d'archi.
> 4. Point 1 : « not **prose** » → « not **documents** » ; corps → « …the alternatives it rejected, and
>    the files it shaped — **structured so it can be reused, traced and challenged later.** » (reuse →
>    traceability → challenge).
> 5. Point 2 : « a run gets the **reason** » → « **reasoning** behind the code ».
> 6. Point 3 : abstrait « Context enters… » → concret **« Every run reads from memory before it starts,
>    then writes its validated decisions back when it finishes. »** (cycle Read→Decide→Validate→Write→Reuse).
> 7. Point 4 : « …is **never training data** » → « …**can run on your infrastructure, and stays under
>    your organization's control.** » (on ne fait pas une promesse juridique forte sur une page marketing ;
>    la garantie ferme « no training on your data » reste sur `/legal/ai-transparency` + trust center).
> 8. CTA : « Give your organization a memory » → **« Build institutional memory, one decision at a
>    time. »** + signature (note) **« Your organization shouldn't have to remember everything. TaskForce
>    should. »**
> + **Phrase conceptuelle** (émergente, pas headline) : nouvelle section blanche **« TaskForce Memory
>    is the decision graph of your organization. »** + **continuité avec Orchestration** (bloc « How it
>    fits together » : Memory knows why → Orchestration decides → Humans approve → Agents execute → back
>    into Memory) + lien vers `/product/orchestration`. Les deux pages forment **un seul produit** =
>    couche de coordination intention humaine ↔ modèles ↔ exécution.
> Vérifié DOM (textContent, fiable malgré le pane à viewport 0) : tout présent, anciennes formulations
> retirées, graphe = version user exacte. **Sizing du nœud « Weaker transactions » (SVG w=120, font 8.5)
> à confirmer à l'œil en direct.** Pas de screenshot (pane mort).

> ### ⚑ v34 (30/07) — Orchestration « verrouillée » : 8 correctifs honnêteté/positionnement (user)
> Le user valide la page (« vraie page produit, positionnement différenciant ») et donne 8 ajustements
> avant de la considérer figée. Fil rouge : **ne jamais laisser croire qu'Orchestration est déjà dispo
> (statut Planned)** + clarifier que le **coding agent = exécutant, pas un 4ᵉ membre C-level**.
> 1. **Hero lead** plus honnête : « TaskForce **is building** a governed delivery engine that turns
>    product outcomes into validated decisions — from product framing to deployment. » (au lieu de
>    « turns … into a governed delivery run », qui sonnait déjà-dispo). 2ᵉ phrase descriptive gardée.
> 2. « The AI proposes. Your team decides. » — gardée (meilleure phrase de la page).
> 3. **Étape 6** : `Hand off to your coding agent` / `Your tools` → **`Execute` / `Coding agent`**
>    (« Your approved context is handed to Claude Code, Cursor… »). Architecture conceptuelle propre :
>    **CPO → CTO → COO → Coding agent** (les 3 = orchestration ; le coding agent = executor, chip slate
>    distincte des 3 couleurs C-level). `OWNER_STYLE` : clé `Your tools` → `Coding agent`.
> 4. Eyebrow moat : **`Why it's the moat` → `Why orchestration matters`** (moins « investor language » ;
>    le h2 « The model is replaceable. The orchestration isn't. » laisse le lecteur conclure).
> 5. Transition avant Prediction : eyebrow **`Prediction` → `From generation to accountability`**
>    (le concept = AI output → prediction → outcome → calibration, pas la prédiction en soi).
> 6. Anti-ambiguïté (c'est `Coming next`, pas actuel) : « That creates a feedback loop. **The long-term
>    goal is a system** that doesn't just remember what your org decided — but learns how reliable its
>    own decisions are. »
> 7. Memory : « TaskForce Memory gives **the orchestration** the context behind the system » (au lieu de
>    « every agent ») — Memory devient plus grand qu'un contexte d'agent. Boucle `Memory → Orchestration
>    → Decision → Memory` gardée (quasi-diagramme d'archi).
> 8. CTA final « The AI does the work between decisions. You own the decisions. » — gardé tel quel.
> Histoire en 6 actes assumée : Intention → Orchestration → Specialized agents → Human governance →
> Execution → Organizational intelligence. Positionnement = **couche de coordination entre intention
> humaine, modèles IA et systèmes d'exécution** (à pousser partout dans le produit).
> Vérifié SSR : 200, vite:0, toutes les nouvelles formulations présentes, toutes les anciennes retirées
> (`Your tools`, `Hand off…`, `Why it's the moat`, `gives every agent`, `it learns how reliable` = 0).
> Pane toujours mort → visuel à valider en direct.

> ### ⚑ v33 (30/07) — Favicon = logo · fix boutons (bug `buttonVariants` brut) · orchestration = narration produit
> Retours user : favicon logo dans l'onglet · « les boutons d'orchestration ne sont pas rounded » ·
> **brief de narration complet** pour la page orchestration (structure + copie exacte).
> - **Favicon** : `public/favicon.svg` portait un vieux logo (montagne) ≠ logo header. Remplacé par le
>   **vrai logo TaskForce** (path de `logo-taskforce.svg`) centré dans un viewBox carré `180 79 250 250`
>   + `@media dark` (fill blanc). L'onglet affiche enfin la marque. (BaseLayout pointait déjà `/favicon.svg`.)
> - **Vrai bug boutons** : dans les composants Astro j'appelais `buttonVariants({…})` **brut** → la
>   chaîne cva garde **`rounded-md` (base) ET `rounded-full` (pill)**, et `rounded-md` gagnait (8px,
>   carré). Le composant React `Button` s'en sort parce qu'il fait `cn(buttonVariants(…))` (twMerge
>   dédup). Fix : envelopper dans **`cn()`** dans `PageHero.astro` + `PageCta.astro`. Vérifié SSR : la
>   classe n'a plus que `rounded-full`. Corrige **toutes** les pages internes d'un coup. (≠ le fix v32
>   qui visait Enterprise-nav + boutons Pricing.)
> - **`/product/orchestration` réécrite selon le brief user** (narration produit, pas une reformulation
>   de features). Progression **workflow → team → moat → prediction → learning → memory → conclusion** :
>   - **Hero** : « From intention to deploy — through validated decisions. » + accroche **« The AI
>     proposes. Your team decides. »** (corrige la contradiction human-in-the-loop du « AI runs the
>     project ») + 3 chips `7 checkpoints · 3 specialized agents · Human approval at every gate`. Badge **Planned**.
>   - **The run** : « One outcome. Seven decisions. One accountable chain. » — chaîne verticale des 7
>     décisions (numéro + owner C-level coloré + description, copie exacte user) + « Nothing silently
>     becomes the next decision. »
>   - **The team** : « Not one agent. A delivery team. » — 3 cartes CPO/CTO/COO (the what/how/when) avec
>     ligne **Predicts** chiffrée + « No agent gets the final say. »
>   - **Moat** : « The model is replaceable. The orchestration isn't. » + 4 principes (Grounded /
>     Specialized / Governed / Model-agnostic).
>   - **Prediction** (le futur moat, poussé fort) : « Don't just generate. Predict. » → **« Was the
>     decision right? »** + boucle sur-mesure `Prediction → Decision → Execution → Outcome → Calibration`
>     + badge **`Coming next · Prediction calibration`** (transforme le « Predicts » gadget en vrai
>     différenciateur).
>   - **Memory** : « Every decision has a reason. Keep it. » + boucle `Memory → Orchestration → Decision
>     → Memory` + lien vers `/product/brain-os`. Plus fort qu'un « RAG ».
>   - **Conclusion** : « Describe the outcome. Let the team work the path. » + « The AI does the work
>     between decisions. You own the decisions. » + CTAs + rappel Planned honnête.
>   - Positionnement verrouillé : Platform=le système · Orchestration=le moteur · Memory=la mémoire org ·
>     CPO/CTO/COO=les rôles · coding agents=les exécutants · human approval=la gouvernance · prediction
>     loop=le futur moat. Catégorie = **couche d'orchestration au-dessus des modèles/coding agents**.
>   - Vérifié : 200, vite:0, 7 sections (5 eyebrows + hero + conclusion), 6 h2, badge Coming next,
>     CTAs pill. **Pane retombé mort** (viewport 0 les 2 onglets) → pas de capture ; l'« overflow » lu
>     est l'artefact vw=0 (tout est `flex-wrap`/grille responsive). VISUEL à valider en direct.

> ### ⚑ v32 (30/07) — Cohérence des boutons + orchestration REFAITE (custom, vend la v2)
> Retours user : (a) boutons/nav incohérents (des pill, des carrés) → tout en pill ; (b) orchestration
> réutilisait **les mêmes sections/visuels que la home** (« ça va pas du tout ») → custom pour la page,
> DA gardée ; (c) **orchestration vend la v2** (« AI Delivery OS »), à ne pas oublier.
> - **Boutons cohérents (tous pill/`rounded-full`)** : le seul carré de la nav était **Enterprise**
>   (le `NavigationMenuLink` shadcn lui injectait `rounded-md` = 6px) → forcé `!rounded-full`. Les CTA
>   des tiers **Pricing** étaient hand-rolled `rounded-lg` → `rounded-full`. Vérifié DOM : Enterprise ==
>   Pricing (radius pill), 3 boutons de tiers en pill. (Les items de dropdown restent `rounded-md/sm`
>   — le user les tolère ; l'`AppWindow` du hero garde sa sidebar `rounded-md` = fidélité à l'app réelle.)
> - **`/product/orchestration` entièrement refaite, custom + v2.** Plus AUCUN visuel de la home
>   (supprimé `RunTimeline` îlot + `BeforeAfter` ; vérifié : « Run #145 », « Read the workspace
>   context », « lives in someone… » = 0). Nouveau, vendu au niveau **quoi/pourquoi** (D11, pas le
>   mécanisme) :
>   - Hero : « **The AI runs the project. You execute and supervise.** » (pivot v2 exact : l'IA gère,
>     l'humain exécute via son agent de code + supervise) · badge **Planned** · bandeau honnête « la v1
>     ship board/approvals/memory ; le run autonome = direction, daté sur /roadmap ».
>   - Visuel **sur-mesure #1** : pipeline horizontal des **7 checkpoints** (`lib/story` CHECKPOINTS)
>     avec **lane d'owner C-level** par couleur (CPO violet / CTO bleu / COO ambre / Your tools) + rappel
>     « chaque checkpoint attend une validation humaine ».
>   - Visuel **sur-mesure #2** : 3 cartes **CPO / CTO / COO** (rôles EXACTS de
>     `road_to_v2/Agents_C_Level.md` : le quoi / le comment / le quand-risque), chacune avec sa ligne
>     **« Predicts »**. Garde-fou : proposent, n'exécutent jamais, humain au gate.
>   - Section positionnement : « **The moat is the orchestration, not the model** » + 4 principes
>     (grounded in memory · proposes-not-executes · model-agnostic/local Ollama sur ton hardware ·
>     se calibre en comparant prédiction↔réel [roadmap]).
>   - Vérifié : 200, vite:0, 7 nœuds, 3 agents, 4 principes, 0 overflow (desktop + mobile, pipeline en
>     `overflow-x-auto`), 0 error overlay.
> - **Reste / à décider** : `/trust` réutilise encore la section `Trust` de la home (hero + CTA custom
>   autour) — moins grave (c'est son habitat naturel), à rendre custom si le user veut le même
>   traitement. `brain-os` réutilise `DecisionGraph` (visuel de mémoire, thématiquement OK).
>   Rendu VISUEL des nouveaux visuels orchestration à valider en direct.

> ### ⚑ v31 (30/07) — Hero = VRAI board · 8 pages internes · greying des liens non construits
> Deux demandes user : (1) « le hero devrait être un vrai board avec toasts » ; (2) « commence à
> faire les autres pages ; celles qu'on peut faire, sinon grise-les et rends-les non cliquables ».
> - **Hero → vrai board.** Remplacé le schéma `HeroRun` par la **vraie vue Board** rendue dans le
>   châssis fidèle `AppWindow` (sidebar + topbar + breadcrumb réels) avec les données de `lib/story`
>   (colonnes Backlog/Todo/In progress/Done, 10 cartes, carte du run **CP-12** surlignée). Deux toasts
>   overlay : « Approved · Architecture » (gouvernance) + « Smart Assign · 4 issues routed » (IA). Mode
>   `bleed` (descend dans le filet). **Statique/SSR** (protège le LCP, aucun îlot). Vérifié DOM : 4
>   colonnes, 10 cartes, ring sur la carte-run, 0 overflow (mobile 375 + desktop). Le board déborde à
>   droite dans un `overflow-hidden` (comme un vrai board) — pas d'overflow **page**.
> - **Infra pages (NEW)** : `PageHero.astro` (kicker/eyebrow/h1/lead/CTA + badge maturité),
>   `Prose.astro` (typo des pages texte via variantes `[&_h2]:…` qui stylent le slot), `PageCta.astro`
>   (bandeau final). Les boutons réutilisent `buttonVariants` → styles identiques, **zéro JS**.
> - **8 pages construites** (toutes 200, vite:0) : `/product` (hub des 8 domaines, live vs grisé via
>   `isLive`), `/product/orchestration` (Run animé `client:idle` + Before/After), `/product/brain-os`
>   (memory + `DecisionGraph`, « not a RAG »), `/trust` (réutilise la section `Trust`), `/enterprise`
>   (6 piliers self-host/SSO/audit/rôles/no-training/support + renvoi trust), `/roadmap` (Now/Next/Later
>   **honnête** : séquence, pas de fausses dates ; badges de maturité), `/legal/ai-transparency`
>   (Prose : rôle de l'IA, modèles hosted/local, humain dans la boucle, données ≠ training, audit),
>   `/book-a-demo` (îlot `DemoForm` → **`mailto:` pré-rempli** à l'envoi, honnête sans backend
>   [besoin-backend: brancher un POST quand l'API existe]).
> - **Greying (source unique)** : `nav.ts` expose `BUILT_ROUTES` + `isLive(href)`. Header, footer et
>   menu mobile rendent tout lien **non construit** en **grisé, non cliquable, tag « Soon »**. Les
>   méga-menus **100 % non construits (Solutions, Labs)** deviennent des **labels grisés** (plus de
>   panneau plein de liens morts) ; **Product & Resources** gardent leur menu, items non construits
>   grisés (`MenuCard` inerte). `/status` (footer bas) → texte non cliquable. Pour activer une page :
>   la créer PUIS ajouter sa route à `BUILT_ROUTES`.
> - **Fix `/pricing`** (préexistante) : `/contact` (×2) → `/book-a-demo` ; CTA en dur
>   `localhost:3000/auth/register` → `${APP_URL}/auth/register`.
> - **Vérif** : le **Browser pane REVIT** cette session (navigate + JS OK) mais **ne composite pas**
>   → toujours pas de screenshot. Audit **curl SSR sur les 10 routes** : 200, `vite:0`, **0 lien de
>   page mort** (seuls restants = assets `.svg`), `soon:39`, console **sans erreur** d'hydratation.
>   DOM : formulaire démo (5 champs + submit) monté, Solutions/Labs = `<span>` grisés, Product/Resources
>   = boutons de menu, Enterprise/Pricing = liens.
> - **Reste** : (a) le user dépose ses **vrais screenshots** — le hero board peut aussi devenir un slot
>   vide `<img>` si préféré ; (b) construire les pages encore grisées (features **live** :
>   smart-assign / collaboration / analytics / integrations ; puis solutions, vs, docs/blog/changelog/
>   status, légal) — dire au user lesquelles prioriser ; (c) `DemoForm` → vrai POST quand l'API existe.
> - **Rendu VISUEL à valider en direct** par le user (localhost:4321) : position des toasts du hero,
>   densité du board, cohérence des bandes blanc/gris sur les nouvelles pages.

> ### ⚑ v30 (27/07) — pattern « vrai screen d'app + toasts » (règle user)
> Clarification user : « les slots screenshot réel vont LÀ OÙ les gens doivent avoir CONFIANCE (du dur,
> de la preuve, de l'argument) ; les animations sont purement démonstratives pour la compréhension. »
> → Cartographie : **preuve/confiance = vrai screen** ; **compréhension = animation**.
> - **`AppShot` + `Toast` (NEW, `components/site/AppShot.tsx`)** : un CADRE d'app propre et **VIDE**
>   (barre de fenêtre + corps neutre, **aucun** placeholder pointillé) prêt à recevoir une vraie
>   capture, + des toasts/callouts custom posés PAR-DESSUS. Pour insérer le screen : remplacer le corps
>   par `<img className="absolute inset-0 …">`, les overlays restent au-dessus.
> - **Placé au moment de PREUVE le plus net → Enterprise/Trust** : un `AppShot` (chrome « …/audit »)
>   avec toast « **Approved · CTO · logged to the audit trail** » + légende « Your real audit view drops
>   in here… ». C'est le « prouve-le » d'un CTO. (Trust n'avait aucun visuel avant.)
> - **Hero** : run card SCHÉMATIQUE conservée (compréhension, élément adoré) + un petit toast « Approved
>   · Architecture » par-dessus, pour montrer le pattern sans casser le crown jewel.
> - **Restent des ANIMATIONS (compréhension)** : Before/After (fuites), Run timeline (mécanisme),
>   Decision Graph (mémoire). Non touchés.
> - Vérifié via **`curl` (browser pane toujours HS cette session)** : HTTP 200, `vite-error:0`, 10
>   sections, chrome audit + toast + légende + toast hero présents, Decision Graph intact. Rendu VISUEL
>   à valider en direct par le user (positionnement des toasts, cadre vide).
> - Reste : le user dépose ses vraies captures dans les cadres ; on peut ajouter d'autres slots de
>   preuve (board réel dans Run ?) et, s'il veut, convertir le hero en « vrai board + toasts » (à faire
>   quand le pane remarche, pour vérifier le crown jewel visuellement).
> Le user ouvre la phase design (« améliorer les placeholders »). Règle : screen d'app → placeholder
> VIDE (il fournira les vrais screens) ; concept → animation custom haut de gamme.
> - **Inventaire** (grep + cross-ref avec l'index réduit) : après la passe de réduction v28, il ne
>   reste **qu'UN seul placeholder vivant** — « Decision graph » dans Synergy (Memory). Tous les autres
>   `<Placeholder>` sont dans des composants DROPPÉS (Foundations, Testimonials, Pillars, BigShot,
>   StackReplaces, FeatureShowcase, Pipeline…), non rendus. Surface design = minuscule.
> - **`DecisionGraph.tsx` (NEW)** — remplace ce placeholder : graphe CAUSAL 100 % SVG + SMIL
>   (`animateMotion`), zéro dépendance, s'anime sans hydratation. Nœuds : Requirement → **Decision
>   (Postgres + pgvector)** → Impacts (Billing · RAG · Users), + branche rejetée (MongoDB, pointillé,
>   « weaker txns »). Faisceaux primaires qui parcourent la colonne (fade in/out, staggered). Étiquettes
>   d'arêtes = le « pourquoi » (drives / impacts / rejected). Couleurs = tokens du site. C'est le visuel
>   du MOAT (« map of why »), sobre (pas « AI template »).
> - **Capacités outils** (réponse au user) : EN CODE, je fais Framer Motion (micro-motion) + je porte
>   à la main les effets type Magic UI / Aceternity (animated beams, spotlight, aurora, tracing beams,
>   shimmer, borders animées) — pur React/CSS/SVG. Rive (.riv) / Spline (scène 3D) / Lottie (JSON) :
>   je les INTÈGRE si le user fournit l'asset (éditeurs GUI), je ne peux pas les AUTORER.
> - **Vérif LIMITÉE** : le dev server rend `/` en **200** (multiples fois) → DecisionGraph + rewire
>   Synergy compilent/rendent côté SSR, aucune erreur build. MAIS le **Browser pane est bloqué cette
>   session** (navigate timeout 300s, javascript_tool timeout 30s, viewport à 0 px plus tôt) → **pas de
>   vérif VISUELLE ni de screenshot possible**. Le visuel (beams, alignement, tint) est À REGARDER EN
>   DIRECT par le user sur localhost:4321, et à itérer. C'est du static SVG donc faible risque de casse.
> - Plan design proposé (3 niveaux, repris du user) : micro-motion (Framer Motion) · UI-motion (beams/
>   graph/checkpoints, en code) · pièce maîtresse (Rive/Spline → asset user). On n'en met pas partout.
> - **Suivi** : un « transport invoke timed out … fetchModule global.css » est apparu = le **dev server
>   Vite était wedgé** (pas une erreur de code — fichiers non touchés, RPC infra bloqué, cohérent avec le
>   pane mort toute la session). **Réglé par `preview_stop` + `preview_start`** (ready en 999 ms, propre).
>   Vérifié ensuite via **`curl localhost:4321` (contourne le browser pane HS)** : HTTP **200**, Decision
>   Graph présent (aria-label + `Postgres + pgvector` + `MongoDB` + `animateMotion`), **10 sections**,
>   Git tagline + leaks intacts, **`(placeholder)` = 0** (la page n'a plus AUCUN placeholder rendu),
>   `vite-error-overlay` = 0. Rendu VISUEL toujours à valider en direct par le user (pane inutilisable).
> Suite au fork review 13 (« Oui, passe de réduction ») : concentrer la page sur l'idée unique,
> transformer les « 5 produits » en PREUVES. **16 → 10 sections.**
> - **Coupées de l'index** (composants conservés, non importés) : `Manifesto`, `Pillars`, `Foundations`,
>   `Integrations`, `Phases`, `Maturity`.
> - **Absorptions** (l'essence survit comme preuve, pas comme chapitre) :
>   · Pillars → fondu dans **Synergy** : eyebrow « Why it's different » + titre « A delivery system, not
>     an assistant » + lead « Most AI tools optimize execution. TaskForce optimizes the system that
>     decides what gets executed — one platform where planning, memory, the run and the audit trail
>     already know about each other… » + la ligne gain-quotidien (« The payoff is daily… »).
>   · Phases → fondu dans **TeamGrid** (footer) : « Start with one workflow, not a migration. TaskForce
>     is the missing layer between your tracker and your coding agent — sits on top of the board/repo/review. »
>   · Foundations → redondant (self-host/audit/model-per-step déjà dans les bullets du Run + checklist Trust).
>   · Integrations → compat portée par TeamGrid (« sits on your board/repo ») + logos « Built with » du hero.
>   · Maturity → Vision porte déjà « dated roadmap ».
>   · Manifesto → l'idée « context » vit dans Problem + Before/After.
> - **Ordre final (spine) & bandes** : Hero(w) · Problem(g) · Before/After(w) · Run(g) · Memory(w) ·
>   Why-different/Synergy(g) · Enterprise/Trust(w) · Teams/TeamGrid(g) · Vision(w) · CTA(g). Alternance
>   parfaite. **1 seul îlot** désormais (RunTimeline ; Foundations-island supprimée → moins de JS).
> - Vérifié DOM : `viteError:false`, 0 erreur build/console, **10 sections**, 0 collision, drops confirmés
>   (Manifesto/Foundations/Integrations/Maturity absents ; « A delivery system… » = 1 occurrence, dans
>   Synergy), folds présents (why-different + daily-gain + missing-layer), Before/After leaks + Git tagline
>   intacts, **0 débordement horizontal desktop ET mobile** (le « overflow:true » initial était l'artefact
>   du viewport à 0 px de l'onglet auto — confirmé faux après resize 1280 & 375).
> - Reste offert : (1) le holy-shit ANIMÉ (Before/After qui se joue) = phase design ; (2) descendre encore
>   vers ~8 (fusionner p.ex. Problem+Before/After en un mouvement, ou Memory dans Synergy) si le user veut.

> ### ⚑ v27 (27/07) — review 13 : UNE idée dominante (« context leaks ») + anti product-soup
> Critique majeure et juste : clarté 6.5/10. La page a beaucoup de concepts forts mais **pas UNE idée
> dominante** (« tu vends 5 produits »), et il manque le « holy-shit moment ». Reco : tout ramener à
> « software delivery loses context; TaskForce preserves it from intent to production », le reste devient
> des PREUVES. Réponse = **concentrer**, pas ajouter :
> - **Le Before/After devient la DÉMONSTRATION de l'idée unique.** Chaque main du « Before » montre
>   maintenant ce que le contexte PERD : Intent → « lives in someone's head » · Meetings → « notes
>   scattered » · Specs → « written once, never updated » · Tickets → « the reason gets dropped » ·
>   Prompts → « the agent is re-briefed from scratch » · Review → « the original context is already
>   gone ». Colonne « With TaskForce » reste PROPRE (contexte gardé). L'accumulation des fuites à gauche
>   vs la colonne nette à droite = la version STATIQUE du holy-shit moment (l'animée = phase design).
> - **Anti « 5 produits » (product-soup).** Les 4 « systèmes » de la section One-platform (Agent runtime /
>   Workflow engine / Audit system…) étaient en primaire = lisaient comme 4 produits. Démotés en gris
>   (descriptifs), les cartes lisent désormais comme des CAPACITÉS d'un seul run (Plan · Remember ·
>   Execute · Verify), pas 4 marques. TaskForce Memory garde sa prominence via son teaser + le bento.
> - Vérifié DOM : `viteError:false`, 0 erreur console, 16 sections, 0 débordement, annotations de perte
>   présentes, After propre, systèmes démotés.
> - **RESTE (offert au user, pas fait unilatéralement)** : (1) l'animation before/after = le vrai
>   holy-shit « compris en 10 s » (phase design) ; (2) une passe de RÉDUCTION éditoriale — fusionner des
>   sections en « preuves » d'une seule promesse pour monter la clarté 6.5→9 (décision à valider, car
>   chaque section a été endossée tour après tour). Le copy est riche ; le prochain gain est de RETRANCHER.

> ### ⚑ v26 (27/07) — review 12 : élargir le moat, sharpen la différence, ancrer le wedge
> Review très validante (« la plus aboutie » ; l'ajout « Outcome — Add Stripe billing » « transforme la
> compréhension »). Trois affinages :
> - **Élargir le moat au-delà du code.** « Your **codebase** has memory. Your organization should too. »
>   → « **Your organization has memory. Your AI should too.** » (« codebase » limitait mentalement à
>   GitHub ; la vision dépasse le code). Le tagline concret « Git remembers what changed… » reste, lui,
>   dans la section Decision Graph → division claire : teaser = large, bento = comparaison Git concrète.
> - **Sharpen la différence.** Pilier lead « help you execute tasks / runs the delivery process around
>   them » → « **Most AI tools optimize execution. TaskForce optimizes the system that decides what gets
>   executed.** » (l'avantage n'est pas d'exécuter mieux — Claude Code gagnera toujours là — mais de
>   choisir le bon travail + garder le contexte/décisions).
> - **Ancrer le wedge (anti « trop mature / 3 ans à construire »).** Getting started : « TaskForce is
>   **the missing layer between your tracker and your coding agent** — it sits on top of the board, repo
>   and review you already use. » Entrée concrète et petite, sans toucher au kicker « operating system »
>   (on garde l'ambition catégorie, on ajoute le point d'entrée graspable Jira↔Claude Code).
> - Vérifié DOM : `viteError:false`, 0 erreur console, 16 sections, 0 collision, « codebase » remplacé,
>   « optimizes the system that decides » présent, « missing layer between your tracker and your coding
>   agent » présent, tagline Git + Outcome Stripe intacts.
> - Note trace (reviewer) : TaskForce ne concurrence pas Cursor/Claude Code/Copilot — il se place
>   AU-DESSUS (Human intent → TaskForce reasoning+governance+memory → agents → code). Wedge séquentiel :
>   software delivery → engineering knowledge graph → organization intelligence layer. Cohérent v24-v26.

> ### ⚑ v25 (27/07) — review 11 : tagline « Git…/…why », démo concrète, nuance autonomie
> Review stratégique validante. Trois pépites concrètes appliquées :
> - **Tagline signature** : le bento Decision Graph passe à **« Git remembers what changed. TaskForce
>   remembers why. »** (jugé « très forte marketing » — comparaison concrète, catégorie-définissante).
>   « Not a search box over your docs — a map of why » (que le user aimait aussi) est replié en tête de
>   corps → les deux lignes conservées, la plus forte en titre.
> - **Démo concrète (« compris en 15 s »)** : la carte run du HERO montre désormais l'ENTRÉE explicite —
>   **« Outcome — Add Stripe billing to the SaaS »** + Step 4 of 7 → puis les 7 checkpoints. Le
>   input→output est lisible d'un coup d'œil (avant : « Run · Checkout redesign », le projet, pas l'intent).
> - **Nuance autonomie (≠ « encore des clics »)** : RUN_SUB « Nothing advances without you » → « Each
>   checkpoint waits for a human — **which is exactly what lets you hand agents more, not less.** » (le
>   contrôle VEND l'autonomie/vitesse, pas seulement la gouvernance — critique dev valide).
> - Vérifié DOM : `viteError:false`, 0 erreur console, 16 sections, 0 collision, hero sans « Checkout
>   redesign » (outcome Stripe à la place), tagline Git présente, map-of-why conservé.
> - Note trace : le reviewer confirme que le moat = **Decision Graph + mémoire décisionnelle** (l'audit
>   trail est une CONSÉQUENCE, copiable) et que le wedge = « mémoire décisionnelle d'une ORGANISATION »,
>   pas « mémoire IA personnelle ». Cohérent avec le north star planté en v24.

> ### ⚑ v24 (27/07) — north star planté dans la Vision (wedge intact ailleurs)
> Discussion stratégique (wedge « ship faster » vs moat « think better » / intelligence layer). Décision
> user : **planter le north star « intelligence layer for organizations » UNIQUEMENT dans la section
> Direction**, garder le wedge engineering partout ailleurs (ne pas repositionner le hero — « intelligence
> layer » sans wedge = vaporeux façon Notion/Glean). Le seul endroit qui a le droit de viser plus loin.
> - **`WhereThisGoes` lead** réécrit : « TaskForce runs software delivery today — **that's the wedge, not
>   the ceiling**. The memory that keeps one run's context is the same intelligence an organization loses
>   everywhere else: in meetings, in chat, in people's heads. The destination is to make it **the active
>   layer every team decides on top of**. » (+ roadmap dated conservé).
> - **Carte AHEAD** « Beyond engineering » → **« An intelligence layer for the organization »** : « …the
>   same graph that tells an agent why the system is the way it is can tell any team why the organization
>   is — **a live model to decide on top of, not a wiki to search**. » (relie au Decision Graph de la v23).
> - **Wedge vérifié INTACT** ailleurs : hero « operating system for human-AI software delivery » + « Built
>   for engineering teams first » toujours là. Le drapeau est planté sans casser la discipline.
> - Vérifié DOM : `viteError:false`, 0 erreur console, 16 sections, 0 collision.
> - Cadre stratégique (trace) : Memory = wedge (delivery, ship faster) ET moat (world-model, think better),
>   SÉQUENCÉ pas choisi. Le vrai saut « not a RAG » est produit (modèle causal Brain OS : objets cognitifs
>   typés + arêtes portant la raison), pas copy — c'est le chèque que la landing a émis (v22-v23).

> ### ⚑ v23 (27/07) — review 9 : Decision Graph + « ce n'est pas un RAG »
> Review quasi entièrement validante (« ils ne construisent pas juste un agent de coding »). Seul
> « pousser plus loin » : passer de « stocke de l'intelligence réutilisable » à un **graphe causal de
> décisions**, et **prouver que TaskForce Memory ≠ RAG amélioré** (RAG = « je retrouve des documents » ;
> Memory = « je comprends l'état actuel du système, ses raisons et ses contraintes »). Appliqué dans la
> section plateforme (là où atterrit un CTO) :
> - **Bento Synergy** : « TaskForce Memory is what every run draws on » → **« Not a search box over your
>   docs. A map of why. »** + corps réécrit : « links the decisions, constraints and trade-offs behind the
>   system — and **how they connect**. Every run reads **why the system is the way it is**, and writes its
>   own decisions back. **Retrieval hands you passages; this hands you the reasoning.** » (not-RAG explicite
>   sans jargon, graphe causal, boucle lecture/écriture). Placeholder « Memory layer » → « **Decision graph** ».
> - **Carte système « Remember / TaskForce Memory »** : « Stores the architecture, decisions and conventions »
>   → « **Links every decision, constraint and trade-off — with the reason attached** » (relier > stocker).
> - La phrase-moat de la v22 (« Your codebase has memory. Your organization should too. ») reste intacte.
> - Vérifié DOM : `viteError:false`, 0 erreur console, 16 sections, 0 collision, not-RAG + Decision Graph présents.
> - **Positionnement de catégorie atteint** (reviewer) : Jira=tâches · GitHub=code · Notion=docs · Linear=workflow ·
>   Cursor=génération · Devin=autonomie · **TaskForce=contexte + décisions + orchestration**. Le copy est mûr ;
>   le risque restant est produit (tenir la promesse « mémoire décisionnelle, pas RAG »), pas landing.

> ### ⚑ v22 (27/07) — review 8 : le moat = mémoire décisionnelle + gain quotidien
> Analyse d'évolution du positionnement (V1 « AI agent qui fait du delivery » → dernière « Knowledge
> + workflow layer pour équipes engineering »). Risque restant identifié : passer pour « Jira avec IA ».
> Réponse = marteler le VRAI moat (mémoire organisationnelle active, pas « on fait des checkpoints »)
> et équilibrer le discours de contrôle par le gain quotidien. Deux changements ciblés :
> - **TaskForce Memory = énoncé de moat.** Le teaser passe de « The memory layer for every run » +
>   « stores architecture/decisions/conventions » à **« Your codebase has memory. Your organization
>   should too. »** + « Every architectural decision, constraint and convention becomes **reusable
>   intelligence** — so a senior stops re-explaining the system for two hours, and the next run (or
>   the next hire) never starts from a blank page. » → décision-memory + douleur concrète (onboarding,
>   ré-explication), ce que Jira/GitHub ne copient pas facilement.
> - **Équilibrer contrôle ↔ gain quotidien.** La page parlait beaucoup de gouvernance/audit (peu
>   « sexy » pour un dev). Ligne ajoutée sous les 3 piliers : **« The payoff is daily: fewer meetings,
>   fewer half-written tickets, less context re-explained — and agents that already understand your
>   system. »**
> - Non changé : « audit trail » gardé (nécessaire enterprise), mais désormais contrebalancé.
> - Vérifié DOM : `viteError:false`, 0 erreur console, 16 sections, 0 collision, les deux phrases présentes.

> ### ⚑ v21 (27/07) — review 7 : les 5 changements « quasi-final » (analyse PMM/fondateur)
> Positionnement jugé défendable (Linear=tracking, GitHub=code, Cursor=AI coding, **TaskForce=AI
> delivery orchestration**). Les 5 correctifs demandés + sharpenings :
> - **1. Hero « intent → delivery ».** Chapô : « agents plan the work, create the artifacts… » (trop
>   de mécanique) → « **You describe the outcome. TaskForce turns intent into a governed delivery run**
>   — planning, artifacts, approvals, and implementation through the agents you already use. »
> - **2. « Built with » → rassurer l'utilisateur.** « Built by engineers shipping with AI every day »
>   → « **Works with the tools your engineers already trust** » (on ne raconte pas NOTRE stack, on
>   rassure). Logos réordonnés (Claude · Cursor · OpenAI · Ollama · GitHub · Linear).
> - **3. « Adaptive by design » (anti-waterfall).** La liste des 7 checkpoints pouvait faire « Jira +
>   Confluence + Scrum en IA ». Encadré ajouté sous le tableau : « A bug fix doesn't need a strategy
>   phase; a migration doesn't take the same path as a feature launch. The run adapts… never skips the
>   approval. »
> - **4. Brain OS → « TaskForce Memory, powered by Brain OS ».** « Brain OS » seul sonnait recherche/
>   concept ; le produit doit rester **TaskForce** (façon GitHub Copilot / Anthropic Claude). Renommé
>   partout dans le rendu (teaser, 4-blocs, bento, liens, Maturity, nav) → « TaskForce Memory » ;
>   « Brain OS » ne subsiste que comme crédit moteur « powered by Brain OS » (compté 1× au DOM).
> - **5. CTA « première expérience ».** « Start for free » → « **Run your first workflow** » (le moment
>   magique de TaskForce = lancer un run), hero + CTA final. « Book a demo » reste en secondaire.
> - Sharpenings : manifeste « AI changes **who produces the work**. The workflow must evolve **around
>   human judgment, not replace it** » (human-in-the-loop assumé, ≠ « fully autonomous ») · Before/After
>   « Conversation/Documentation/Implementation context » → **« Meetings / Specs / Prompts »** (termes
>   reconnaissables) · Why-different « write code » → « **help you execute tasks** » (concurrent = pas la
>   génération de code) · orthographe **US** « artifacts » · Problem « The transfer is » en ligne
>   autonome semi-grasse · Enterprise « SOC 2 in progress » → « **Built for SOC 2 readiness** » (ne pas
>   inviter « montrez le rapport »).
> - **Note honnêteté Product status** (reco reviewer, non tranché ici) : « Available now » liste les
>   capacités v1 réellement livrées (self-hosting, SSO, Smart Assign… existent d'après nos traces).
>   Si l'une n'est pas *customer-ready*, à retirer — la crédibilité prime sur la quantité.
> - Vérifié DOM : `viteError:false`, 0 erreur build/console, 16 sections, 0 collision, « Brain OS »
>   standalone = 1 (powered by), Before/After = Intent/Meetings/Specs/Tickets/Prompts/Review,
>   « Adaptive by design » présent, « Run your first workflow » ×2, compliance reframé.

> ### ⚑ v20 (27/07) — review 6 : polish final du copy (~90% → contenu mûr)
> « Première version où la landing raconte un PRODUIT, pas juste une vision. » Réglages fins.
> - **Hero** : « human **+** AI » → « human**-**AI software delivery » (moins « marketing », plus premium).
> - **Why different** : « Most AI tools **write code** » (réducteur — Cursor/Devin font plus) → « Most AI
>   tools **help you execute tasks**. TaskForce runs the delivery process **around** them. » (le concurrent
>   n'est pas la génération de code, c'est l'orchestration autour des tâches).
> - **Problem** : l'insight « **The work isn't the problem. The transfer is.** » passe en ligne
>   autonome, plus grosse et semi-gras (c'est LA phrase de catégorie), la réponse TaskForce en dessous.
> - **Orthographe US** : « artefacts » → « **artifacts** » (cohérence US, comme catalogs/organizations).
> - **Brain OS, dernier « Context layer » retiré** : le placeholder du bento Synergy passe « Context
>   layer » → « **Memory layer** ». Un seul vocabulaire : Brain OS = the memory layer.
> - **Who it's for** : suppression du « Product and Operations are **next** » (une landing premium ne
>   parle pas de ce qui MANQUE) → « The same governed run applies **wherever a team ships work through
>   review** » (direction, pas déficit).
> - **Preuve sociale (le dernier trou)** : bande « **Built by engineers shipping with AI every day** »
>   dans le hero, avec de VRAIS logos (Claude/Anthropic · OpenAI · Ollama · Cursor · GitHub · Linear).
>   Cadrage « **Built with** », jamais « customers » — honnête, on n'invente pas de clients.
> - **Footer** : nouveau groupe « **Compare** » (TaskForce vs Cursor / Devin / Copilot / Jira) — SEO +
>   positionnement, le marché cherchera ces requêtes. (« Comparisons » générique retiré de Solutions.)
> - Vérifié DOM : `viteError:false`, 0 erreur build/console, 16 sections, « human-AI », 6 logos
>   « Built with » (0 image cassée), « artifacts » (US), « Context layer » absent, footer Compare
>   présent, **aucun débordement horizontal** (7e colonne footer OK).
> - **Reste = phase DESIGN** (acté avec le user) : animation du Run dans le hero, design visuel premium,
>   vrais screenshots, **remplacement de TOUS les placeholders** (« on le fera plus tard »), pages
>   secondaires (Product / Pricing / Enterprise / Docs). Le copy est déclaré mûr.

> ### ⚑ v19 (27/07) — review 5 : les 5 dernières corrections avant design
> Contenu jugé mûr. Le reviewer liste 5 correctifs « avant de passer au design ». Tous faits.
> - **1. Plus de placeholder visible.** Le `Placeholder label="Product screen"` du hero est remplacé
>   par un **vrai visuel produit** : `HeroRun`, un schéma STATIQUE du run à mi-parcours (Step 4 of 7,
>   3 done / 1 « Awaiting approval » / 3 pending). Pas de fausse capture, pas de fausses données —
>   les mêmes checkpoints/états que la section animée plus bas.
> - **2. Incohérence « Who it's for » résolue (Option A).** Plus d'onglets multi-équipes (l'îlot est
>   retiré → section **statique**, un souci d'hydratation en moins) : on assume le **wedge engineering**
>   (les 3 cas Engineering en clair) + « **Product and Operations are next** ». `TeamGrid` n'est plus
>   un îlot (`client:idle` retiré dans index).
> - **3. Brain OS = « memory layer ».** « context layer » → **« The memory layer for every run »** ;
>   bento « what keeps the context » → « **Brain OS is the memory every run draws on** » ; texte système
>   varié (« Stores the architecture, decisions and conventions… »). Moins de répétition de « context ».
> - **4. Animation du Run (agent → humain).** Le run passe maintenant par **2 sous-phases par
>   checkpoint** : l'agent DESSINE (« Generating artifact… » / « Writing code… », discret, gris) puis
>   le run ATTEND l'humain (« Awaiting approval » / « Running checks », en primaire = focal), puis
>   coche « Approved ✓ » et avance. 14 battements (`STEP_BEATS.flat()`), état de repos reduced-motion
>   = Step 4 en review. (Le mouvement se vérifie en vrai navigateur — onglet auto = rAF en pause.)
> - **5. Phrase de catégorie dans le hero.** Kicker au-dessus du H1 : « **The operating system for
>   human + AI software delivery** » ; le chapô est allégé (on retire « An operating system for
>   shipping software… », désormais porté par le kicker).
> - Autres : manifeste « has to change » → « **must evolve** with it » ; Before/After « Run » → **« Plan »**
>   (terme compris ; « Run » reste le terme produit ailleurs) ; roadmap « Teams beyond engineering » →
>   « **Expanding beyond engineering** » (le wedge est engineering, pas d'incertitude de marché).
> - Non touché (reco reviewer) : footer (crédible), « boring, load-bearing » (gardé), « Remember »
>   (fonctionne). Product status : capacités « Available now » = réellement livrées (honnêteté maintenue).
> - Vérifié DOM : `viteError:false`, 0 erreur build/console, 16 sections, 0 collision, hero sans
>   placeholder (carte run réelle), Who's-for = 0 onglet + « next », Before/After = Outcome→Context→
>   Plan→Approvals→Ship, Brain OS « memory layer », run initial = « Generating artifact » (phase draft),
>   îlots = RunTimeline + Foundations.
> - **Le contenu est déclaré mûr par le reviewer** : la suite = phase **design d'expérience**
>   (animations avancées, vrais screenshots, interactions), plus du copywriting.

> ### ⚑ v18 (27/07) — review 4 : affinage « catégorie » + une seule marque contexte
> Notes ~9/10, conversion 8.2. Critiques désormais « est-ce que ça convertit face à Linear/Cursor/
> Devin ? ». Pass d'affinage (copy + un correctif Run) — pas de nouvelle section.
> - **Manifeste** recalibré : « AI changes **who can build**. The workflow has to change **with it**. »
>   (le point n'est pas que l'IA remplace le dev, c'est qu'une équipe augmentée ne peut plus coordonner pareil.)
> - **Before/After** : titre « lose the plot » → « **Fewer places for context to disappear** » (mot-clé
>   *context*, moins casual) ; **`Context` ajouté comme étape visible** du flux TaskForce
>   (Outcome → **Context** → Run → Approvals → Ship) — le contexte n'est plus une feature tardive.
> - **Brain OS = UN seul nom** (avant : « context layer », « Powered by Brain OS », « Inside Brain OS »,
>   « Knowledge layer » = 4 noms). Teaser → eyebrow **« Brain OS »** + titre « The context layer for
>   every run ». Dans One platform, le système « Knowledge layer » devient **« Brain OS »** et le verbe
>   « Context » devient **« Remember »** (humain, pas technique). Bento : « Brain OS is what keeps the context ».
> - **One platform** : ajout du « pourquoi les outils actuels ne suffisent pas » en 3 lignes —
>   « Agents without context become assistants. Context without execution becomes documentation.
>   **TaskForce connects both.** »
> - **Run** : signature « **Seven checkpoints. Seven artifacts. One accountable chain.** » ; et
>   **état de repos corrigé** — sous `prefers-reduced-motion` le run se fige désormais **mi-parcours**
>   (Step 4 of 7), plus sur « Shipped » (un visiteur ne doit pas arriver sur une simulation terminée).
> - **Who it's for** : wedge **engineering** resserré — onglets réduits à **Engineering (défaut) ·
>   Product · Operations** (retiré « Client services » + « Anyone » qui élargissaient trop, façon Monday).
> - **Hero** : « governed AI agents » **conservé** (le marché enterprise justifie le terme — reco du reviewer).
> - Non changé (volontaire) : Foundations « boring, load-bearing » (a du caractère, gardé) ; footer
>   « Compare vs Cursor/Devin/Jira » (le reviewer dit « pas maintenant » ; /vs existe déjà en nav).
> - **DÉFÉRÉ à la phase design** : rendre le Run pleinement **interactif** (bouton Approve qui pilote
>   le run). Non testable dans l'onglet caché (rAF en pause) → je ne l'expédie pas à l'aveugle ;
>   le primitive `scene.goTo` est prête. C'est le 1er item de la phase « design d'expérience ».
> - Vérifié DOM : `viteError:false`, 16 sections, 0 collision, 0 erreur console, Before/After = 5
>   étapes (Context inclus), « Brain OS » ×8 / « Knowledge layer » absent, onglets = Eng(défaut)/Product/Ops.

> ### ⚑ v17 (27/07) — review 3 : RÉDUIRE les concepts, affiner, réordonner
> Base jugée mûre (positionnement 9, storytelling 9). Seul vrai risque : **trop de concepts forts**
> (« confusion 6.5/10 »). Ce pass RÉDUIT et affine plutôt qu'ajouter. La chose à retenir :
> « TaskForce keeps software delivery context alive from idea to production ».
> - **Retiré** : le **mur de logos** du haut (redondant avec Integrations — « les intégrations sont
>   une preuve, pas une histoire ») et la **section témoignages** placeholder (« un visiteur ne doit
>   jamais voir une absence » / impression de site en construction). Deux sections en moins.
> - **Ajouté — `Manifesto`** (entre Hero et Problem) : thèse historique façon Linear — « Software
>   delivery was built for humans passing documents. AI changes the builder. The workflow has to
>   change too. »
> - **Hero** : « shipping work with AI agents » → « shipping software with **governed** AI agents »
>   (l'avantage n'est pas « des agents », c'est *governed delivery*).
> - **Problem** : « Every delivery » → « **Most software delivery** » (plus précis).
> - **Before/After** rendu **universel** (on attaque le système, pas les équipes) : Slack/meeting/
>   spec/tickets/prompt/PR → **Intent · Conversation · Documentation · Tickets · Implementation
>   context · Review**.
> - **Run UI** : « 0 / 7 » → « **Step 1 of 7** » (plus produit) ; agents renommés en fonctionnel
>   **Product / Architecture / Delivery agent** (au lieu de CPO/CTO/COO qui forçaient une organisation),
>   dans la timeline ET le tableau ; idem l'item Maturity.
> - **Brain OS** : eyebrow « The context layer · **Powered by Brain OS** » (Brain OS = le moteur,
>   pas un produit séparé).
> - **One platform** simplifié pour un VP Eng : chaque carte mène par un verbe **Plan · Context ·
>   Execute · Verify**, le nom système (Agent runtime / Knowledge layer / Workflow engine / Audit
>   system) en sous-titre.
> - **Vision** : « the coordination becomes a governed run » → « **coordination becomes an automated
>   workflow. Judgment stays human.** »
> - **Réordonné** (partie basse, logique d'achat) : Who it's for → Getting started → Integrations →
>   Foundations → Enterprise. Run toujours tôt (position 6, en preuve).
> - **16 sections**, alternance blanc/gris parfaite (FinalCta passe en gris-extérieur/panneau-blanc
>   pour boucler l'alternance). Vérifié DOM : `viteError:false`, 0 collision, 0 erreur console,
>   tous les changements de copy présents, mur de logos + témoignages absents, run fusionné intact.
>   (Îlots `client:idle` : hydratation OK — le `PENDING` observé = onglet d'automatisation `hidden`,
>   `requestIdleCallback` ne se déclenche jamais caché ; se réveille dans un vrai navigateur.)

> ### ⚑ v16 (27/07) — review 2 : contexte = ennemi, run en preuve, démo visuelle
> Deuxième review (notes 8-9/10). Trois déplacements majeurs + ajustements de copy.
> - **La perte de CONTEXTE devient l'ennemi central** (pas la coordination). `Problem` retitré
>   « Teams don't lose time building. They lose it transferring context. » ; cascade « Someone… »
>   ré-orientée contexte (re-explains, drops the why, re-briefs from scratch, without the original
>   context) ; pivot « The transfer is [the problem]. TaskForce keeps the context in one governed
>   run. » Fil tiré jusqu'à Brain OS (« The context layer », plus « The moat » — une startup ne
>   déclare pas son propre moat) et à Synergy (« context stops leaking between handoffs »).
> - **Le RUN remonte en preuve** : position 6 (après Pillars + BeforeAfter), et **fusion de
>   l'ancienne section `Anatomy`** dedans — la démo animée EN HAUT, puis le tableau des 7 checkpoints
>   EN DESSOUS (plus de section séparée, 0 doublon). Vérifié : 1 section porte timeline + table + chips.
> - **Démonstration VISUELLE ajoutée — `BeforeAfter`** (« From idea to shipped ») : chaîne longue et
>   fuyante (6 mains : Slack → meeting → spec → tickets → prompt → PR) vs run court et gouverné
>   (4 étapes : Outcome → Run → Approvals → Ship). La différence de longueur PORTE le message. Statique.
> - **Hero élargi** : « draft every step and hand code » → « plan the work, create the artifacts, and
>   hand implementation » (le produit est la chaîne de décision, pas que du code).
> - **Pillars** : `FIG 0x` → simple `01/02/03` (« faisait design-document ») ; « Governed, not
>   autonomous » → **« Governed by design »**.
> - **Synergy** dit en ARCHITECTURE : 4 systèmes nommés (Agent runtime · Knowledge layer · Workflow
>   engine · Audit system) au lieu de combos abstraits.
> - **Foundations** : « Real-time core » → **« Production-grade core »** (ce que cherche un CTO).
> - **TeamGrid** : assumé **engineering-first** (« Built for engineering teams first ») et **dénumérotée**
>   (audience, pas capacité) → arrive plus tard dans la page.
> - **Maturity** orientée valeur : « Shipped/Partial/Planned » → **« Available now / In progress /
>   Coming next »**, compteurs bruts (7/5/5) retirés (lisaient « produit jeune »).
> - **Getting started** : « one run » → « one **workflow** » (terme compris d'un nouveau visiteur).
> - **Renumérotation** en ordre de page : 1.0 The run · 2.0 One platform · 3.0 Foundations.
>   **Réordonné** en 17 sections, alternance blanc/gris parfaite (0 collision, vérifiée DOM).
> - Vérifié DOM : `viteError:false`, 17 sections, 0 collision, 4 îlots hydratés, run fusionné
>   (timeline+table+chips, 7 lignes, 0 section Anatomy résiduelle), BeforeAfter 6→4 étapes,
>   tous les changements de copy présents, 1.0/2.0/3.0 en ordre, TeamGrid sans numéro.

> ### ⚑ v15 (26/07) — propagation de la numérotation Linear (N.0 + puces N.x)
> Demande user : « propage » le système de numérotation de Linear (`1.0 →`, puces `+`).
> - **`SectionHeader` étendu** (`Section.tsx`) : props `index?` (numéro monospace « 1.0 » devant
>   l'eyebrow) et `indexHref?` (rend l'eyebrow cliquable, avec une flèche → façon « 1.0 Intake → »).
>   Rétro-compatible : sans `index`, rien ne change.
> - **4 chapitres produit numérotés** (les seuls, comme Linear ne numérote que ses blocs cœur) :
>   `1.0 The run` (RunTimeline → /product/orchestration), `2.0 For the whole team` (TeamGrid →
>   /solutions), `3.0 One platform` (Synergy → /product/brain-os), `4.0 Foundations` (Foundations →
>   /trust). Les sections de cadrage/preuve/futur (Hero, Problem, LogoWall, Pillars, Trust,
>   Integrations, Testimonials, Maturity, WhereThisGoes, CTA) restent **sans** numéro.
> - **Puces « + » numérotées** : la rangée de faits de `RunTimeline` devient des pastilles
>   `1.1 Full audit trail + · 1.2 Self-hosted + · 1.3 Any coding agent + · 1.4 A model per step +`
>   (mono `1.x` + label + `Plus`, décoratif). Icônes par-fait retirées (`ScrollText/Server/GitBranch/Cpu`).
> - `Pillars` garde ses étiquettes **`FIG 0x`** (convention « figure » de Linear, distincte des `N.0`).
> - Vérifié DOM : `viteError:false`, 4 chapitres avec numéro + eyebrow-lien (+ bons href), puces
>   1.1-1.4 présentes, 4 `astro-island` hydratés, FIG 01/03 toujours là.

> ### ⚑ v14 (26/07) — deux gabarits repris de Linear (fidélité max)
> Demande user : « fais les 2 [gabarits Linear], on se rapproche le plus de Linear possible ».
> **Home Linear inspectée en direct** (get_page_text) pour caler les signatures exactes : étiquettes
> monospace **`FIG 0.x`**, blocs de features numérotés **`N.0 Verbe →`** + puces **`N.1 +`**, titres
> courts + une ligne, et la **rangée de 3 cartes** juste après le hero.
> - **`Pillars` (NEW, `Showcase.tsx`)** — la rangée de 3 cartes façon Linear (« Purpose-built /
>   Powered by agents / Designed for speed »). Reprend l'étiquette monospace **`FIG 01/02/03`** +
>   titre court + une ligne. Contenu = les 3 piliers du différenciateur : *Governed, not autonomous*
>   · *Yours to run* · *Fully on the record*. Placé **après `Problem`** (la réponse en 3 temps avant
>   la démonstration). Statique.
> - **`Foundations` (NEW, îlot `client:idle`, `Showcase.tsx`)** — « Built on strong foundations »
>   façon Linear : **liste à gauche** (index monospace `01…05` + titre + une ligne) + **visuel à
>   droite** qui reflète la fondation sélectionnée. **Interactif** (clic → change le visuel ; bordure
>   gauche + couleur sur l'item actif). Descriptions toujours visibles → aucun repli animé, aucun CLS.
>   Contenu : self-hosting, audit trail, model per step, access control, real-time core. Placé
>   **après `Synergy`** (le socle technique entre « un seul système » et la preuve entreprise).
> - **`index.astro`** réordonné en **17 sections** ; **alternance blanc/gris parfaite** (0 collision,
>   vérifiée au DOM sur les 17). Bandes basculées entre les deux insertions : Phases→blanc,
>   RunTimeline→gris, BrainTeaser→blanc, Anatomy→gris, TeamGrid→blanc, Synergy→gris.
> - Interactif = **3 îlots** désormais (RunTimeline + TeamGrid + Foundations).
> - Vérifié DOM : `viteError:false`, 17 sections, 0 collision d'alternance, 4 `astro-island` hydratés,
>   Pillars (FIG 01-03 + 3 titres) OK, Foundations = 5 items + **swap du visuel au clic confirmé**
>   (Self-hosted → Model routing sur l'item 03).

> ### ⚑ v13 (26/07) — refonte NARRATIVE (le site raconte, il ne liste plus)
> Retour d'une review « niveau série A » : la structure est bonne (75-85 %), le manque est le
> **récit**. Le site disait « voilà tout ce que TaskForce fait » ; il doit faire **ressentir le
> problème** avant de présenter la solution, puis monter en puissance. Arc cible :
> **Hero → Problem → Solution → How → Why different → Proof → Future → CTA**.
> - **`index.astro` réordonné** sur cet arc (15 sections). Bandes alternées vérifiées (aucun fond
>   identique adjacent). `StackReplaces` retiré de la page (redondant avec `Synergy` — « too many
>   conceptual sections in a row ») ; composant conservé dans le fichier.
> - **`Problem` (NEW, `Platform.tsx`)** — la douleur AVANT la solution. Litanie « Someone writes a
>   spec / rewrites it / opens the tickets / explains the architecture again / briefs the agent /
>   reviews / deploys », puis bascule « Most of that is handoff, not work. TaskForce turns it into
>   one governed run. » Éditorial, sans carte ni icône. Juste après le hero, avant les logos.
> - **`RunTimeline` (NEW, îlot animé `client:idle`)** — LA démonstration réclamée (« une vraie
>   démonstration », « un run qui avance »). Timeline verticale des 7 checkpoints ; chaque étape
>   passe *awaiting approval* → *approved* (coche) puis avance, jusqu'à *Shipped*, puis reboucle.
>   Piloté par `useScene` (rAF + horloge de visibilité), figé sur l'état final sous reduced-motion.
>   **Pas de fausses données** (aucun « 4/4 tests ») : seulement des noms d'étapes + des états, le
>   flux étant réel. Remplace le placeholder de `FeatureShowcase` comme section « How ».
> - **`BrainTeaser` (NEW slim, `Narrative.tsx`)** — le moat teasé TÔT (une bande fine : « Every run
>   needs context. TaskForce builds it as you go. » → *Inside Brain OS*), la démo complète restant
>   plus bas (`Synergy`).
> - **Hero** — différenciateur explicite : lead recentré sur *gouvernance + traçabilité* (« every
>   decision is on the record ») + strip sobre de 3 faits (approve every step · auditable · your
>   hardware). « Pas une IA qui code, un système de livraison. »
> - **`Trust`** — mène par des **faits** (« Every run is attributable / Every approval is recorded /
>   Every model call is logged ») au lieu de la rangée de badges « qui se lit comme une checklist ».
>   Badges SOC2/GDPR/ISO → une ligne honnête (in progress / ready / planned), `Placeholder` retiré.
> - **`Integrations`** — message « TaskForce doesn't replace your stack. It connects to it. » (le
>   « 60+ » descend dans le chapô).
> - **`Maturity`** — **dates** ajoutées par colonne (Updated July 2026 / Target Q4 2026) → statut
>   vérifiable, plus déclaratif.
> - **`WhereThisGoes`** — reframé en **vision** (« Software teams won't hand-write specs forever »)
>   plutôt qu'en FAQ.
> - CTA variés selon l'étape (Run → « See a run end to end » ; Brain OS → « Inside Brain OS » ;
>   Enterprise → « Read the trust center » ; etc.). Interactif = **2 îlots** (RunTimeline + TeamGrid).
> - Vérifié DOM : `viteError:false`, 15 sections, 3 îlots hydratés, RunTimeline = 7 checkpoints /
>   1 anneau actif / chip « Awaiting approval » / footer OK, dates présentes (`textContent`).

> ### ⚑ v12 (25/07) — maturité « moins IA » + gabarit Linear
> Retour user : « trop IA la section *Where the product actually is* » ; puis « inspire-toi aussi
> de sections de Linear pour pas que ce soit répétitif ».
> - **Maturity refaite SOBRE** (façon page de statut produit) : plus de cartes à liseré coloré,
>   plus d'icônes par item, plus de tags fléchés « moved ». **3 colonnes** séparées par un filet,
>   une **pastille de statut** (vert/ambre/gris) par en-tête, listes en **texte plein**. Copy
>   plainée : titre « What ships today, and what is planned », notes courtes et factuelles (retiré
>   « Most AI products blur this line… », « Never sold as shipped », etc.). `LevelBadge` retiré du
>   fichier.
> - **Nouveau gabarit `FeatureShowcase`** (inspiré de Linear « Set the product direction ») dans
>   `Showcase.tsx` : grand visuel placeholder + **3 sous-features** + **rangée de 4 bullets à
>   icône** (audit trail, self-hosted, any coding agent, model per step). Porte le mécanisme du run
>   (remplace l'ancien Pipeline/Approvals). Remplace `BigShot` dans `index.astro`.
> - Sites de référence pour la variété des gabarits : **relevanceai.com** (ordre/archétypes) +
>   **linear.app** (gros bloc feature + sous-features + bullets ; « strong foundations » ; rangée
>   de 3 cartes produit). À réutiliser pour placer le bon gabarit au bon endroit.

> ### ⚑ v11 (25/07) — hero SANS faux graphe + maturité redesignée
> Retour user : « le hero avec les graphs reprend pas du tout l'app, on a aucune donnée, mets un
> placeholder » · « la partie *Where the product actually is* est naze, mal designée ».
> - **Hero** : retour au **placeholder** (`Product screen`). Plus de bande de KPI ni de mini-courbes
>   ni de table de fausses données — on n'a rien de réel. Redevenu **statique** (îlot retiré ;
>   restent SiteHeader + TeamGrid).
> - **Maturity** refaite : les chips en `flex-wrap` (brouillon) deviennent **3 cartes** propres
>   (`card-hover`), filet de couleur en haut selon le statut, et **liste verticale** où chaque item
>   porte une **icône de statut** (`CheckCircle2` vert / `CircleDashed` ambre / `Circle` violet) +
>   un tag « moved » discret. Vérifié : 3 cartes, 17 items, 0 erreur.

> ### ⚑ v10 (25/07) — reprendre l'ARCHITECTURE de Relevance (ordre + types de sections)
> Retour user : « reprends la structure et l'architecture de Relevance, tu peux la copier ».
> On copie le **pattern de mise en page** (ordre + archétypes), avec NOTRE contenu et des
> placeholders pour les images — pas leurs textes/visuels. Ordre reproduit :
>
> 1. **Hero** — onglets de persona (Engineering/Product/Operations/Founder) + **bande de 4 KPI**
>    (avec mini-courbe SVG) + **table de runs** (Task/Run by/Model/Checkpoint/Took). `Hero.tsx`
>    réécrit, interactif → îlot. *(C'est la forme que le user avait aimée au tout début.)*
> 2. **LogoWall** — vrais logos d'outils.
> 3. **Phases** — timeline en étapes (« Drive ROI in six weeks »).
> 4. **TeamGrid** — grille d'use-cases **tabbée par équipe** + ligne CTA en pied. Interactif → îlot.
> 5. **BigShot** — gros visuel centré (placeholder).
> 6. **Testimonials** — citation + vidéo + onglets-logos, **tout en placeholder** (pas de clients →
>    honnêteté D9 ; la structure est là à remplir).
> 7. **Trust** — badges de conformité + checklist 3 colonnes.
> 8. **Integrations** — grille de 32 vrais logos.
> 9. **StackReplaces** — « one stack » (split + liste « like X »).
> 10. **Synergy** — « pieces make each other better » : combo-cards + bento « context layer ».
> 11. **Anatomy** — le framework (tableau des 7 checkpoints).
> 12. **Maturity** → **WhereThisGoes** → **FinalCta**.
>
> **Débranchés** (contenu repris dans les archétypes ci-dessus) : `Leaks`, `Pipeline`,
> `AgentDelivery`, `Approvals`, `FeatureCards`. Nouveaux dans `Showcase.tsx` : `Testimonials`,
> `Synergy`.
>
> **Interactivité = 3 îlots** (SiteHeader + Hero + TeamGrid, `client:idle`). Testé : onglets hero
> changent KPI+table (Operations → « Assign to the right person »), onglets équipe changent les
> cartes. 42 logos, **0 cassé**, 0 erreur Vite.
>
> ⚠️ **Testimonials + « Featured in »/presse** : archétypes Relevance NON remplis (aucun client ni
> presse réels). Testimonials est mis en placeholder ; le bloc presse est **omis** (honnêteté).

> ### ⚑ v9 (25/07) — un peu d'INTERACTION (hover + badge cliquable)
> Retour user : « ajoute un peu d'interaction stv, hover, badge cliquable… ».
> - **`TeamGrid` devient interactif** : les onglets d'équipe sont de vrais `<button aria-pressed>`
>   qui **filtrent la grille** (chaque équipe a 3 cartes → hauteur stable, 0 CLS). Seul 2ᵉ îlot de
>   la page (`client:idle`). Testé : clic *Operations* → cartes Route/Balance/Escalate.
> - **Survol CSS pur** (aucun JS) via `global.css` : `.card-hover` (lift 2px + filet teinté +
>   ombre) sur les cartes de `TeamGrid`/`FeatureCards`/`Phases` ; `.tile-hover` (logo grayscale →
>   couleur + `scale(1.08)`) sur les 32 tuiles d'intégrations ; `hover:bg` sur les lignes du
>   tableau Anatomy et les cartes *Where this goes* ; grayscale→couleur déjà sur le mur de logos.
>   `prefers-reduced-motion` neutralise les `translate`/`scale`.
> Page toujours quasi-statique : **2 îlots** (SiteHeader + TeamGrid).

> ### ⚑ v8 (25/07) — VARIER LES GABARITS (façon Relevance) + revrais logos
> Retour user, après avoir fourni 16 screens de `relevanceai.com` (dans `OneDrive/Pictures/
> Screenshots`) : « les logos tu les as donc mets-les », « même chose pour Integrations », et
> surtout « **ça manque de changement dans les sections… c'est ce genre de section qu'il me faut,
> faut varier** ». Ma page enchaînait le même `FeatureSplit` → monotone.
>
> **Archétypes Relevance relevés** (pour référence) : hero à onglets-persona + band de KPI +
> table · mur de logos clients · **cartes en étapes** (Weeks 1-2/3-6/6+, la carte active se
> déplie avec un visuel) · **grille d'use-cases tabbée par équipe** (cartes à mini-mockup, hover =
> pop-over de run) · **gros visuel centré** en bande teintée · testimonial + vidéo à onglets-logos
> · **badges de conformité + checklist 3 colonnes** · **grille d'intégrations** (10×3 logos) ·
> **split « one stack » + liste « like X »** · carousel de combo-cards + bento « context layer » ·
> **framework 4 colonnes L1-L4** · « Featured in » (logos presse). (NB : pas de testimonial/presse
> pour nous — on n'a pas de clients ; honnêteté D9.)
>
> **Fait :**
> - **Vrais logos rétablis** : `LogoWall` (10 outils réels via `BrandLogo`) et **Integrations en
>   grille** (32 logos réels, « Connects to 60+ tools », `Browse all`). Vérifié : 42 imgs, 0 cassée.
> - **`Trust` restructuré** en archétype badges + checklist : panneau de badges (SOC 2/GDPR/ISO,
>   placeholders) + **3 colonnes** (Security & data · Access & controls · Monitoring), items = vraies
>   capacités.
> - **Nouveau fichier `home/Showcase.tsx`** avec 5 archétypes variés (statiques, placeholders) :
>   `TeamGrid` (grille par équipe, D10 beyond-tech) · `FeatureCards` (bento, remplace 4 `FeatureSplit`
>   texte : Brain OS/Smart Assign/Models/Analytics) · `StackReplaces` (split visuel + liste « like
>   X ») · `BigShot` (gros visuel centré) · `Phases` (cartes en étapes, la dernière teintée).
>
> **`index.astro` — ordre qui ALTERNE les gabarits** : placeholder-screen → logos → texte → TABLE
> → band+visuel → 2col → GRILLE → BENTO → split+likeX → visuel-centré → texte → zones → étapes →
> badges+checklist → grille-logos → liste → CTA. Toujours 100% statique (1 îlot = header).
>
> **Débranchés (non supprimés)** : `Features.tsx` (BrainOS/SmartAssign/Models/Analytics remplacés
> par `FeatureCards`), `Platform.WhyOneSystem` (→ `StackReplaces`), `Narrative.Agents`.

> ### ⚑ v7 (25/07) — ON DÉGONFLE : placeholders + texte seul, page 100% statique
> Décision user : « à la place des screens, des **placeholders** » · « si une section n'a pas
> besoin de screen ou d'animation, tu **mets pas** » · « **les images aussi** en placeholder »
> (« j'en ai partout »). Les faux écrans animés étaient trop nombreux et détournaient de la
> structure/du contenu.
>
> Nouveau composant `site/Placeholder.tsx` : `Placeholder` (cadre pointillés + label + ratio,
> **statique**) et `LogoPlaceholder` (petit carré). `FeatureSplit`/`FeatureBand` acceptent
> désormais `children?` **optionnel** → sans visuel, la section passe en **une colonne de texte**.
>
> **Visuel gardé (placeholder d'écran) — 4 seulement :** Hero (`Product screen`), Pipeline
> (`Assignment — Smart Assign`), AgentDelivery (`Agent run`), Integrations (`catalogue`).
> **Logos → 10 `LogoPlaceholder`** dans `LogoWall`.
> **Texte seul (aucun visuel) :** Leaks, Approvals, Agents, Brain OS, Smart Assign, Models,
> Analytics, WhyOneSystem.
> **Inchangé (contenu, pas un faux écran) :** Anatomy (tableau), Maturity, Trust (icônes lucide),
> Where this goes, CTA.
>
> **Conséquence technique** : plus aucune directive `client:*` dans `index.astro`, **la home est
> entièrement statique** — 1 seul îlot subsiste (le `SiteHeader`, pour ses méga-menus). Vérifié
> DOM : 4 placeholders + 10 logos, **0 occurrence** des anciens textes d'animation, 0 erreur Vite.
>
> **Fichiers devenus inutilisés (NON supprimés)** : tout `site/illustrations/*`, l'ancien
> `Hero` film, `scene/AppWindow.tsx`, `BrandLogo.tsx`, `lib/story.ts`, `lib/useScene.ts`. Non
> importés → non bundlés. À rebrancher si on refait de vrais écrans ; sinon à supprimer plus tard.

> ### ⚑ v6 — le HERO = UNE SEULE SESSION continue, curseur + caméra, overlays sur le contenu
> (superseded par v7 : le film est débranché, remplacé par un placeholder)
> Retour user : « c'est vide, pas une vraie interface » · « la PR pop sur un fond blanc, alors
> qu'elle devrait être un **toast en bas à droite PAR-DESSUS le contenu**, zoom dessus,
> pending→merge, ça dézoome » · « les **badges de nav je m'en fous, c'est l'animation qui le fait
> avec la souris** » · puis « **met plus de zoom** ».
>
> Réécriture complète de `home/Hero.tsx` : plus d'écrans-maquettes séparés ni de scrubber à
> chapitres. **Un board réel et permanent**, et tout se joue dessus, piloté par un **curseur** :
>
> 1. **New Project** en dialog PAR-DESSUS le board (voile) → relié à Linear → Brain OS ingère.
> 2. curseur clique **CP-12** → **tiroir d'issue** glisse par-dessus le board (board flouté derrière).
> 3. Spec IA se remplit → **chat Cortex** dans le tiroir → **critère 4 vert** « From the chat ».
> 4. curseur → **Smart assign** → **modale par-dessus** (agent Claude + **reviewer humain** par ligne).
> 5. le tiroir bascule sur **CP-41** → l'agent travaille → **tests ✓ + scan sécu ✓**.
> 6. **PR #284 en TOAST bas-droite** par-dessus tout → caméra **zoom fort** → **pending→merged**
>    (`GitMerge` violet) → caméra **dézoome**.
> 7. transition **Dashboard** : lead time 6,5→1,8 j (−72%), **Shipped**.
>
> **Overlays toujours au-dessus du contenu** (voile `#101828`/0.18 pour dialog+modale ; tiroir et
> toast en `absolute` z-20/40) — plus rien ne « pop » sur du blanc. **Curseur** (`Cursor`,
> positions en % posées aux battements de déplacement, clics aux battements `CLICK_BEATS`) = la
> navigation. **Aucun badge de chapitre.**
>
> **Caméra : SUPPRIMÉE (décision user, « point barre »).** J'ai d'abord fait des zooms doux, puis
> musclés (« plus de zoom »), puis le user a tranché : **plus aucun zoom, interface normale, plan
> fixe**. Le composant `Camera`, le type `Cam`, la map `CAMERA` et `camFor` ont été retirés ; le
> stage rend ses enfants sans `transform` (`stageHasTransform: "none"` vérifié). La narration
> repose **uniquement** sur le curseur + les overlays. Ne pas réintroduire de zoom sans feu vert
> explicite. (Le paramètre d'inspection `?b=N` de `useScene`/`Hero` reste, il est indépendant.)
>
> ### ⚠️ Vérif : `?b=N` fige un battement + l'onglet piloté GÈLE (screenshots inexploitables)
> `useScene` accepte `fixed?: number` ; `Hero` lit `?b=N` dans l'URL → fige le film sur ce
> battement (invisible en usage normal). Sert à inspecter un moment tardif sans l'attendre.
> **MAIS** : l'onglet Chrome piloté par l'automatisation **gèle son compositeur hors premier plan**
> — `setInterval` s'arrête, l'hydratation `client:load` est différée, et **les screenshots
> renvoient une frame périmée** (souvent l'état SSR = beat 0). La lecture DOM via `javascript_tool`
> après hydratation est fiable (ex. à `?b=17` : `dialogOpacity 0`, toast `Merged`, `scale 1.5`
> confirmés). Donc : **vérifier par lecture DOM, pas par capture** ; le film joue normalement dans
> le vrai navigateur du user (premier plan).
>
> **Logos d'agents** ajoutés (fetch ciblé, hors `frontend/`) : `cursor`, `copilot`, `windsurf`,
> `zed`, `v0`, `replit` → tous dans le Set `THEMED` de `BrandLogo.tsx`.

> ### ⚑ v5 — le HERO devient LE FILM du flow complet (overview de tout, superseded)
> Retour user : « le hero, la vidéo doit être une **overview de tout** » · « faudrait faire
> vraiment tout le flow » · « des écrans complets, mais l'animation au bon endroit pour attirer
> l'œil, rien ne t'empêche de faire des **zoom** comme une vraie vidéo » · « on vend la v2 ».
>
> Le hero (`home/Hero.tsx`) n'est plus une scène : c'est un **plan-séquence de 7 actes** sur un
> seul run (`CP-12` export de factures), joué comme une vidéo de lancement. Les sections plus bas
> restent les **détails** de chaque étape ; le hero survole tout.
>
> | # | Acte | Ce qu'on voit | Caméra |
> |---|---|---|---|
> | 1 | Connect | New project → **relié à Linear** → **Brain OS ingère le contexte** (47 issues, docs, ADRs) | zoom 1.05 |
> | 2 | Board | les issues sont là → **plongeon vers CP-12** | **zoom 1.42** (dive) |
> | 3 | Issue | Spec IA se remplit → **correction via le chat Cortex** → **critère 4 en vert** | 1.0 |
> | 4 | Assign | Smart Assign → **agent (Claude Code) + reviewer humain** par issue | 1.0 |
> | 5 | Build | le log de l'agent → **tests ✓ + scan sécurité ✓** → PR #284 | 1.0 |
> | 6 | Review | la PR **attend l'approbation** du reviewer, Approve & merge pulse | zoom 1.18 |
> | 7 | Ship | lead time **6,5 j → 1,8 j (−72%)**, courbe, **Shipped** | 1.0 |
>
> **Architecture** (`home/Hero.tsx`) :
> - **Stage à hauteur fixe** (`h-[372px]`) : tous les actes en `absolute inset-0`, crossfade
>   d'opacité. Le CLS est **nul par construction** — rien ne peut repousser la page.
> - **Caméra** = `transform: scale()` + `transform-origin` %, transition 850ms. Un zoom **rogne
>   les bords** : on ne l'emploie donc QUE sur des écrans centrés avec marges (cartes Connect /
>   Review) + le plongeon CP-12. Sur les écrans denses (issue/assign/build/ship) la caméra reste à
>   1 et c'est **l'animation** qui attire l'œil. Leçon : zoomer partout croppe le contenu utile.
> - **Scrubber cliquable** sous la scène : 7 chapitres = 7 `<button>` → `scene.goTo(act.from)`.
>   Le film est **jouable**, pas seulement regardable (répond au manque d'interaction signalé).
> - **Battements** : chaque climax d'acte a SON propre battement, assez long pour être lu. Bug
>   corrigé : le critère 4 tenait sur le seul battement 7 et se vidait juste après → il a
>   désormais le battement 8 dédié (chat visible via `at(7)`, réponse+critère via `at(8)`).
> - Barre latérale + topbar **constantes** entre actes (seuls le breadcrumb et l'item de nav
>   actif changent, via la prop `active` de `AppWindow`) → sensation d'UN produit qu'on parcourt.
>
> **Logos d'agents** récupérés dans `landing-page/public/logos/` (fetch ciblé, sans toucher
> `frontend/`) : `cursor`, `copilot`, `windsurf`, `zed`, `v0`, `replit` + `anthropic` existant.
> Ajoutés au Set `THEMED` de `BrandLogo.tsx`. Le sélecteur d'agent en montre 4 (Claude actif).
>
> **Smart Assign = exécutant + reviewer** (tranché avec le user) : `Task` porte désormais
> `reviewer: Person` en plus de `assignee`. Un agent ne livre jamais sans relecture humaine.
> `AGENT_STEPS` gagne une étape **Scan sécurité** (gate verte, comme les tests).

> ### ⚑ v4 — le plan-séquence en 3 plans, et on vend la **v2**
> Retour user : « j'aimais bien ton truc de flow général », « pas assez d'interaction, on voit
> juste un truc se faire », « on peut très bien vendre le workflow futur **jusqu'à l'assignation
> automatique à Claude** ou n'importe quel agent, et après on passe sur une vue qui **récupère ce
> que fait l'agent** », « **de toute façon on vend la v2 pas la v1** ».
>
> La home redevient un plan-séquence, en **3 plans sur le même run** :
>
> | Plan | Composant | Ce qu'il montre |
> |---|---|---|
> | 1. Hero | `home/Hero.tsx` | Board → issue `CP-12` → Spec IA → **votre approbation** |
> | 2. Assignment | `illustrations/AutoAssign.tsx` | Le découpage sort → modale **Smart Assign** → **2 issues sur 4 partent à Claude Code** |
> | 3. Agent's work | `illustrations/AgentWork.tsx` | Ce que l'agent a fait, étape par étape → **PR #284**, qui revient en revue |
>
> **La chaîne est vérifiable de bout en bout** : `CP-41` porte le badge `criterion 4` — le critère
> né du commentaire humain du plan 1 — et l'étape de l'agent qui édite `InvoiceExportService.java`
> porte le même badge. Le visiteur peut suivre sa propre phrase jusqu'à la pull request.
>
> **Interaction (le manque signalé)** : `Approve` et `Request changes` du Hero sont de **vrais
> `<button>`**. `useScene.goTo(beat)` repositionne l'horloge au lieu de redémarrer la scène —
> le clic reprend exactement là où il mène. Le geste qu'on essaie est celui que le produit demande.
>
> **Le point qui vend** : un agent de code est un **assigné comme un autre** — même carte, même
> colonne, même checkpoint. Smart Assign écrit **pourquoi** (« Léo est à 92 % de charge »), donc un
> routage contestable est contestable. Et la PR **ne se merge pas toute seule**.
>
> Types : `Task` est une **union discriminée** sur `agent` (`{agent:true, assignee:Agent}` |
> `{agent?:false, assignee:Person}`) — sinon `assignee` est inutilisable au rendu. `Agent.logo`
> et non `brand` : `Person.brand` est un booléen (« c'est vous »), la collision cassait le typage.
> Un seul agent en dur (`anthropic`) : le catalogue de logos vendorisé n'en contient pas d'autre,
> le texte dit « or any coding agent » plutôt que d'afficher une marque sans logo.

> ### ⚠️ v3 — l'écran du Hero est le VRAI produit (captures du 24/07)
> Le user a fourni 3 captures : **Board d'une opération**, **panneau d'édition d'issue**,
> **modale Smart Assign**. Le Hero montre désormais la vue Board puis le panneau d'édition
> qui glisse par-dessus — les deux existent réellement.
>
> Corrections précises tirées des captures : `Signals` (pas « Signal Center »), **`Brain OS`**
> (pas « Brain »), **`New Project`** (pas « New operation »), avatar de workspace **rond** avec le
> **slug en dessous**, fil d'Ariane à **chevrons ›**, recherche en pilule `Search... ⌘K`, icône
> **workflows** (Layers) + cloche **à badge rouge** + sélecteur de thème, et surtout le contenu
> est un **panneau blanc à coin haut-gauche arrondi** encastré dans le fond clair.
>
> Le panneau d'issue reprend le vrai gabarit : en-tête `CP-12 · statut`, titre, `Description`,
> **`Spec IA`** (la section existe déjà dans le produit), puis `Sub-tasks / Checklist /
> Attachments / Relations / GitHub / Activity` repliées, et la colonne **Details** avec
> Priority, Assignee, le bouton **`Smart assign`**, Labels, Points, Cycle, Due date.
> Board : colonnes à filet de couleur + compteur, chips de label, clé `CP-xx`, pastille de
> priorité, avatar d'assigné, barre `Filters / Priority / Assignee / Label` et
> **`Auto-assign (4)`** — qui existe aussi.
>
> **Seule projection assumée : la barre de revue** en bas du panneau. C'est la part « vision ».
> Le user a validé l'UI/UX et alignera le backend dessus.
>
> À intégrer plus tard (signalé par le user) : le **chat IA s'ouvre en panneau à droite façon
> Claude**, la **liste des workflows** aussi.
>
> **Filet anti-frame-drop** : passé la phase de frappe on affiche le texte complet quoi qu'il
> arrive. Sinon, si le navigateur saute des frames, le critère reste à moitié écrit alors que la
> suite de la scène s'est déroulée — constaté en capture.
>
> Mesuré : **75 échantillons sur 17 s (cycle complet), hauteur 541 px constante, amplitude 0**.

> ### ⚠️ Le châssis est DÉCALQUÉ du vrai shell, pas inventé
> Retour utilisateur sur la v1 du Hero : « toute plate », « ça ressemble pas à un écran style
> Linear », « **ça représente même pas TaskForce** ». Direction refusée. La v1 inventait un rail
> de 52 px avec cinq icônes anonymes : ça ne renvoyait à rien de reconnaissable.
>
> La v2 est reprise fichier par fichier de l'app :
> `frontend/components/layout/sidebar/app-sidebar.tsx` et `.../topbar/app-topbar.tsx`.
> Donc **sidebar de 216 px** (pas un rail), sélecteur de workspace, groupes
> **Command / Work / People**, mêmes icônes lucide, **fioles violettes** sur Intelligence et
> Brain, compte en pied de sidebar ; topbar avec recherche **⌘K**, **Ask AI** (étincelle bleue),
> cloche à pastille. Libellés du fil d'Ariane = ceux de `segmentLabel` : `projects` s'affiche
> **« Operations »**, `analytics` **« Intelligence »**.
> Priorités reprises de `issue-filters.tsx` (`URGENT` red-400 · `HIGH` orange-400 · …).
>
> **La densité, pas l'animation, est ce qui rend un écran crédible.** Le contenu porte donc un
> en-tête de page avec statut et actions, des onglets (`Overview / Spec / Issues 4 / Activity`),
> un **rail horizontal des 7 checkpoints**, une **colonne de métadonnées** (Status, Checkpoint,
> Owner, Reviewer, Model, Priority, Created) et un bloc **Open questions** — un agent qui liste
> ses angles morts explique pourquoi il s'arrête. Le mouvement ne touche que 3 éléments.
>
> **Profondeur** : trois plans (sidebar `#f9f9fb` en retrait, contenu blanc au premier plan,
> ombre à 3 couches) + un dégradé derrière la fenêtre, sinon du blanc sur du blanc = plat.
>
> **La barre de revue vit dans la COLONNE DE CONTENU**, pas sur toute la fenêtre : sinon elle
> recouvre le compte en pied de sidebar, et aucun outil réel ne fait passer une barre d'action
> par-dessus sa navigation.

**Règles de motion (R1–R7).** Une scène est une partition, pas une boucle · un temps long est un
silence · un seul point focal (le reste du panneau à 40 % pendant le moment fort) · jamais de
changement de hauteur · la scène atterrit mais **exactement 2 éléments** restent vivants (chrono
du run + pastille de présence) · frapper plutôt qu'apparaître · `reduced-motion` saute à la fin.

**Compte : 9 animations automatiques → 5 scènes + 2 zones interactives.**
Fusions : `RunTimeline` + `ApprovalLoop` + `AgentHandoff` + `ContextRetrieval` → **une** scène de run.
`AssignRanking` → micro-interaction. `ModelRouting` → interrupteur. `CapabilityPairs` → **supprimé**
(c'est le schéma d'un argument ; l'argument survit en texte).

**Scène 1 — Hero.** Partition `900/1600/900/1000/700/2200/900/1400/1600` ms, **en boucle** avec
2,5 s de pause. Un critère s'écrit → statut **ambre** (pas vert) → un **curseur entre et clique
« Request changes »** → le composeur s'ouvre → **votre commentaire s'écrit** → envoi → le
checkpoint se rejoue → **le critère 4 apparaît en vert, tiré de votre phrase** (`↑ From your
comment`, spec v3→v4, `Sent back: 1 time`) → approuvé, le rail avance au checkpoint 3.

> ### ⚠️ Un hero ne peut pas se figer — et il doit montrer un GESTE
> Retour utilisateur sur la v2 : « **aucune animation, aucune action, aucun insight** ».
> Trois corrections de principe :
> 1. **Boucler, pas atterrir.** La règle « une scène se fige sur son état final » vaut pour une
>    démonstration qu'on regarde une fois. Un hero est vu à n'importe quel moment : arrivé après
>    la 4ᵉ seconde, on ne voyait plus qu'une capture morte. → `loopAfter: 2500`.
> 2. **Un curseur.** Sans pointeur, la scène dit « quelque chose change tout seul ». Avec, elle
>    dit « **quelqu'un fait quelque chose** ». C'est toute la différence entre un écran qui bouge
>    et une démonstration. `Cursor` est positionné depuis le coin bas-droit du contenu, donc
>    stable quelle que soit la largeur.
> 3. **Un insight, pas un changement d'état.** Une pastille qui passe d'ambre à vert n'apprend
>    rien. Le critère 4 rédigé à partir du commentaire humain, lui, **est** le produit.
>
> Retiré : le **chronomètre** (aucun sens sur une fiche) et la **légende sous la fenêtre** (le
> user a déjà demandé deux fois la suppression de ces petits commentaires — la mention
> d'honnêteté Spec_Master §1.1 n'a donc plus de support visuel sur le hero, à re-trancher).
>
> **La fenêtre passe DERRIÈRE le filet de section** : ombre orientée vers le **haut** (une ombre
> portée vers le bas déborderait sous le filet, dans la section suivante) + un dégradé sombre de
> 20 px sur le bas de l'écran, comme si le filet projetait son ombre dessus.

Les **onglets de persona sont supprimés** : ils coupaient l'attention en quatre dès la première
seconde et signalaient « composant » plutôt que « produit ».

> ### ⚠️ Deux techniques anti-CLS utilisées dans le Hero (à reprendre)
> 1. **Fantôme de mesure** : pendant la frappe, le texte complet est rendu en `invisible` derrière
>    le texte tapé. Sans lui, le retour à la ligne agrandit la fenêtre en direct.
> 2. **Superposition** : la barre d'approbation est en `absolute bottom-0` et le corps réserve sa
>    hauteur avec `pb-[58px]`. Elle remonte **par-dessus** le contenu — la fenêtre ne bouge pas.
>
> Vérifié dans le Brave du user (82 échantillons sur 6,5 s) : frappe **1,12 s** → fin de frappe
> **2,72 s** → bascule ambre **2,97 s** → barre montée **3,61 → 4,08 s** → anneau **4,33 s**.
> Hauteur de la fenêtre **412 px constante**, `scrollHeight` **amplitude 0**, la barre reste
> collée au bord bas (`bar.bottom === window.bottom`). Deux captures à 4 s d'écart après
> l'atterrissage : **identiques sauf le chrono** — la scène se fige, le produit respire.

> ### ⚠️ Motion piloté par le TEMPS ÉCOULÉ, jamais par des `setTimeout` enchaînés
> Constaté sur capture : la scène du Hero avait atterri (barre montée, anneau joué) mais le
> critère 3 affichait encore « Exports ov ». Cause : **Chrome clampe `setTimeout` à 1 s dans un
> onglet d'arrière-plan**. Les battements de la partition (900 / 1900 / 600 / 700 ms) encaissent ;
> une frappe à **18 ms/caractère devient 1 caractère/seconde**.
>
> `useScene` et `useTypewriter` relisent donc l'horloge à chaque frame (`requestAnimationFrame`
> + `performance.now()`) au lieu d'enchaîner des incréments fixes. Un retard ne décale plus rien :
> la frame suivante recalcule la position exacte. Bonus : rAF ne tourne pas du tout en
> arrière-plan (zéro CPU), et au retour la scène se replace directement où elle devrait être.
>
> Conséquence d'implémentation : la boucle rAF **s'arrête** à l'atterrissage, donc `replay()`
> incrémente un `runId` présent dans les dépendances de l'effet — `setBeat(0)` seul ne relancerait
> rien.

> ### ⚠️ Vérifier dans le Brave du user, pas dans le panneau Browser
> Quand le panneau Browser n'est pas affiché, la page est **`document.hidden === true`** : Chrome
> suspend le cycle de rendu, donc **`IntersectionObserver` ne se déclenche jamais** et
> **`requestIdleCallback` non plus**. Symptômes observés : les îlots `client:idle` restent en
> `ssr` et **aucune scène ne démarre** (`typedLen` bloqué à 0 sur 6 s). Ce n'est **pas** un bug du
> site. Passer par l'extension Claude-in-Chrome (`document.hidden === false`) pour toute mesure
> d'animation ou d'hydratation.

## Reste à faire

### Illustrations — l'ancien lot (⚠️ superseded par la refonte narrative ci-dessus)

`site/illustrations/`, une par fichier, animées, coupées quand hors écran + `prefers-reduced-motion`.

> ### ⚠️ Règle : ne pas enchaîner le même gabarit
> Neuf illustrations posées dans neuf `FeatureSplit` identiques (« texte à gauche, carte blanche
> à droite ») = une page qui se lit comme un seul bloc. On décroche.
>
> `Section.tsx` expose donc **`FeatureBand`** en plus de `FeatureSplit` : en-tête sur deux
> colonnes (chapô + `aside`), visuel **en dessous et pleine largeur**, avec `tinted` qui pose
> le visuel dans un grand panneau à dégradé radial bleu — ça change franchement la couleur
> de la section et sert de respiration.
>
> **Maximum deux `FeatureSplit` consécutifs.** Rythme obtenu :
> `FULL · — · half · — · wide+tint · half · FULL · half · half · FULL+tint · half · wide · —…`
>
> ### ⚠️ Règle : une animation ne doit JAMAIS changer la hauteur de son conteneur
> `RunTimeline` variait de **150 px** au fil du cycle (panneaux dépliés de tailles différentes) —
> toute la section bougeait sous les yeux du lecteur. Deux remèdes, à appliquer à chaque nouvelle
> illustration :
> 1. **Réserver la place plutôt que replier.** Un élément qui apparaît reste dans le flux et joue
>    sur `opacity` + `translate`, jamais sur `grid-rows-[0fr→1fr]` ni sur une marge.
> 2. **`min-h` sur la carte** quand le contenu varie malgré tout (mesurer l'état le plus haut).
>
> **Vérification — échantillonner sur un CYCLE COMPLET, pas 10 secondes.**
> `CapabilityPairs` a 6 phases × 3,4 s = 20 s de cycle : une fenêtre de 10 s ne voyait que la
> moitié des états et affichait « amplitude 0 » à tort. En couvrant les 6 paires, deux d'entre
> elles passaient sur une ligne de plus → **12 px de variation**. Corrigé en portant le
> `min-h` du bloc bénéfice de 132 à 148 px.
>
> Méthode : relever la hauteur **par phase** (`byPair[n] = max(...)`) et exiger amplitude 0
> sur toutes, plus `document.documentElement.scrollHeight` constant.
> Mesuré : ContextDecay 641 · RunTimeline 500 · ApprovalLoop 558 · AgentHandoff 308 ·
> ContextRetrieval 528 · AssignRanking 520 · ModelRouting 433 · DeliveryInsights 399 ·
> CapabilityPairs 313 — **toutes à 0**. Document **stable à 13 281 px sur 19 s**.

| # | Section | Composant | État |
|---|---|---|---|
| 1 | The problem | `ContextDecay` | ✅ La même décision traverse 4 outils ; les mots qui ne survivent pas sont **barrés**, la jauge de rétention tombe 100 → 55 → 20 → 0 %, puis la même décision dans un run reste à 100 %. |
| 2 | Orchestration | `RunTimeline` | ✅ Le run se déroule seul, étapes repliables, contenu réel, arrêt sur le checkpoint. |
| 3 | Approvals | `ApprovalLoop` | ✅ Boucle `proposed → changes → revised → approved`. Le commentaire humain **fait apparaître un 5ᵉ endpoint en vert** ; la piste d'audit s'empile ligne à ligne avec horodatage. Les 3 promesses du bloc sont démontrées, plus écrites. |
| 4 | Agents | `AgentHandoff` | ✅ 3 couloirs CPO/CTO/COO sur **le même run** ; le relais passe, chaque livrable se coche en vert à son tour. Remplace 3 cartes descriptives. Périmètres reformulés sans jargon tech (D10). |
| 5 | Brain OS | `ContextRetrieval` | ✅ Le graphe de nœuds est supprimé — joli mais il ne répondait pas à « qu'est-ce que ça m'apporte ». À la place : une étape du run cherche dans le workspace, **3 sources sur 128 sont retenues avec leur score** (0.91 / 0.84 / 0.78), les non-pertinentes s'éteignent, et la réponse **porte ses citations** [1] [2]. |
| 6 | Smart Assign | `AssignRanking` | ✅ L'ancien visuel ne montrait que le gagnant — impossible de juger le choix. Maintenant **4 personnes notées sur les mêmes 5 signaux**, barre **segmentée** (la composition du score, pas son total), les perdants s'estompent, la raison s'affiche en clair, et « Reassign » rappelle que l'override est un signal. |
| 7 | Models | `ModelRouting` | ✅ **Zéro promesse de prix** (vérifié : aucune occurrence de €/$/free dans la section). Deux profils qui alternent — *Everything on your hardware* vs *Hard steps hosted* : 2 lignes sur 6 basculent en « Hosted », passent en ambre, et la colonne **« Leaves your network »** passe de ✕ à ✓. L'argument devient le **contrôle**, pas la gratuité. |
| 8 | Analytics | `DeliveryInsights` | ✅ Fini le tableau de bord générique. On montre **le taux de renvoi par étape** — la seule métrique qu'un système à checkpoints peut produire : `Approach 31%` ressort en ambre, les autres s'estompent, et les **motifs** s'affichent (« trade-off non expliqué (11) · conflit avec une décision (6) · dérive de périmètre (4) »). Badge **Beta** sur ce panneau : la métrique dépend des checkpoints. |
| 9 | WhyOneSystem | `CapabilityPairs` | ✅ Les 6 cartes de texte deviennent **un couplage animé** : deux capacités s'allument, un trait SVG les relie, le bénéfice s'écrit dessous. Démontre l'argument « une seule plateforme » au lieu de l'affirmer. |
| 10 | Maturity | *(pas d'illustration)* | ✅ **Sans carte et sans animation, volontairement** — après neuf illustrations animées, une bande dense et statique est une respiration. Trois zones séparées par les rails, chips par capacité, marqueurs verts « moved in June / July » : le tableau bouge, et ça se voit. |
| 11 | Integrations | `IntegrationCatalogue` | ✅ Vraie zone utilisable : **recherche** + **10 filtres par catégorie** sur **58 outils** avec leurs vrais logos, compteur `n of 58`, bouton *Clear*, et état vide qui propose de demander l'intégration. `min-h` sur la grille pour que filtrer ne fasse pas sauter la section. |

### ⚠️ `client:visible` ne marche pas ici — utiliser `client:idle`

Astro rend `<astro-island>` en **`display: contents`** : l'élément a une boîte de **0 × 0**, donc
l'`IntersectionObserver` de la directive `visible` ne se déclenche jamais. Résultat constaté :
**les 10 îlots restaient en `ssr`**, aucune animation ne tournait et la recherche du catalogue
était inerte — sans la moindre erreur en console, ce qui rend le symptôme silencieux.

`client:idle` ne dépend d'aucune géométrie. La paresse n'est pas perdue : chaque illustration
porte **son propre** `IntersectionObserver` et ne joue que lorsqu'elle est réellement visible.

**Vérification** : `[...document.querySelectorAll('astro-island')].map(i => i.hasAttribute('ssr'))`
doit être `false` partout.

### D10 / D11 — tranchées le 24/07 au soir

**D10 — on ouvre au-delà de la tech.** On vend la vision, donc le discours devient « du travail qui
passe par des étapes relues et validées », pas « de la livraison logicielle ».
`Solutions` passe **par équipe** : Engineering · Product · Operations · Marketing · Client services.
L'ingénierie reste le seul métier **prouvé** ; les autres porteront un badge de maturité.
⚠️ Reste à propager : les 4 personas du Hero sont encore tous tech (CTO / Head of Product / EM /
Founder), et le vocabulaire des sections dit encore « code » par endroits.

**D11 (révisée) — Labs reste, mais ne divulgue plus le mécanisme.**
L'entrée revient dans la nav (avec une icône fiole), parce que dire **sur quoi on travaille** a de
la valeur. Ce qui disparaît, c'est le **comment** : les 4 entrées deviennent des sujets + le
bénéfice visé (`Agent roles`, `Run memory`, `Model choice`, `Learning from reviews`), sans
architecture, sans boucle de raisonnement, sans méthode d'évaluation. Encart du menu :
« What we're working on — the workshop, not the shelf. Dates live on the roadmap. »

*Historique de la décision (première formulation, conservée pour le raisonnement) :*
Le problème n'était pas de publier ce qui ne marche pas : c'était de publier **le mécanisme de
notre différenciateur avant qu'il tourne**. Décrire la boucle de raisonnement, la méthode de
benchmark ou le flywheel, c'est offrir la recette à quiconque sait exécuter plus vite.

- **Retiré** : l'entrée `Labs` de la nav, `/labs/*` (world-model-ooda, benchmarks, data-flywheel,
  local-llm, notes), le badge public « Labs ».
- **Devenu** : badge **« Planned »** · section home **« Where this goes »** (trois intentions,
  zéro architecture) · **`/roadmap` public et daté** comme seule promesse publique.
- **Règle** : on publie le *quoi* et le *pourquoi*, jamais le *comment*. Une vision se vend et ne se
  copie pas ; un mécanisme se copie en une lecture.

L3 produit (9) → L4 conversion → L5 labs →
L6 gabarits `/solutions` `/use-cases` `/vs` (21 pages, 3 templates) → L7 ressources →
L8 légal (10 pages) + `security.txt` + JSON-LD → L9 audit axe/Lighthouse.

Composants encore anciens (remplacés en L2/L4) : `sections/{Hero,LogosSection,HomeFeatures,
HomeSections,HowItWorks,CtaSection,PricingSection}` — ils utilisent encore `indigo-600`
et le violet en dur, à repasser sur `bg-brand`.

## Dette de contenu

Captures produit réelles · montants de tarification · logos d'intégrations (SVGL) ·
**identité légale (SIREN, siège, hébergeur, directeur de publication) — bloquant pour L8**.
