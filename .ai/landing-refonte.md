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

## Reste à faire

### Illustrations — traitées **dans l'ordre de la page**

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
