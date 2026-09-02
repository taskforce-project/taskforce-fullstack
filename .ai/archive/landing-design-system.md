# Landing — Design System (source de vérité)

> **À LIRE avant toute modif de la landing** (`taskforce-fullstack/landing-page/`).
> Objectif : arrêter les incohérences. Ces règles priment sur toute habitude. Si une règle doit
> changer, on l'édite ICI d'abord, puis on applique. Trace des changements : `.ai/landing-refonte.md`.
> Stack : Astro 5 SSG + îlots React + Tailwind v4 + shadcn/ui. **Thème CLAIR uniquement** (jamais de `dark:`).

---

## 1. Règles non-négociables (les 7 lois)

1. **Fond = BLANC, point.** Sections en `bg-card` (#fff). **JAMAIS** `bg-secondary` comme fond de section, jamais de gris, jamais de dégradé de fond. **Exceptions :** la **section CTA de fin de page** = gris du footer `bg-secondary` (§5) ; `/labs` (§8).
2. **Zéro shadow.** Pas de `shadow-*`, pas de `.surface` (ombre) sur les cartes/nœuds. Séparation = **bordure 1px** (`border`, `border-border`) et les **filets** des grilles.
3. **Zéro halo.** Pas de dégradé radial coloré derrière le contenu (`radial-gradient … color-mix(primary …)`), pas de « glow ».
4. **Structure = traits intégrés.** Le contenu groupé vit dans des **grilles à filets edge-to-edge** (§3), pas dans des cards flottantes `rounded-2xl border`.
5. **Workflow / process / boucle / pipeline = React Flow, TOUJOURS.** Via le kit `flows/OrchestrationFlows.tsx`. **JAMAIS** de flèches/cartes faites à la main (`<div>` + `ArrowRight`, `<ol>` numéroté, chips reliés). (§4)
6. **Honnêteté (D11).** Rien de « Live » qui ne l'est pas. Badges `Live / Beta / Planned`. Diagrammes illustratifs → tag « Illustrative ». Aucune fausse donnée/metric.
7. **Couleurs de marque.** Bleu `--primary` (#2563eb) · noir/gris texte · blanc. **Violet = uniquement marquage Labs/IA.** Statuts = emerald(live)/amber(beta)/slate(planned).

---

## 2. Fonds & couleurs

- Section : `class="bg-card border-b"` (blanc + filet bas). C'est tout.
- Pas d'alternance blanc/gris. Le rythme vient des **filets** et des **grilles**, pas de bandes de couleur.
- Pastille d'icône : `bg-secondary/60 border` (chip gris neutre) OU **tuile teintée `.ic-tile`** (§7) — **autorisé** (ce n'est pas un fond de section).
- **Palette sémantique des icônes** (teinte par FAMILLE, cohérente partout — flux ET hors flux) :
  bleu `#2563eb` = build/spec/plan/exécution · violet `#7c3aed` = IA/pensée/cadrage/modèle · émeraude `#059669` = livré/validé ·
  ambre `#d97706` = gouvernance/revue/sécurité · cyan `#0891b2` = data/mesure/monitoring · rose `#e11d48` = rejet/incident · ardoise `#64748b` = neutre/entrée/infra.
  **SOURCE UNIQUE : `src/lib/site-icons.ts`** → `hueFor(icon)` (teinte par `displayName` Lucide) + `HUE` (constantes). Le kit flux a son miroir `ICON_COLOR` (mêmes hex). **Le violet reste réservé IA/Labs** — ici il marque bien « pensée/IA/modèle », cohérent avec la loi 7.
- **Colorer une icône de CONTENU, partout** : tuile → `.ic-tile` + `style={`--ic:${hueFor(Icon)}`}` (span natif) ; inline → `style={{ color: hueFor(Icon) }}` (⚠️ **objet**, jamais une chaîne : une icône Lucide est un composant React qui refuse `style="…"`). Les composants partagés `BentoCell`/`BorderedGrid` colorent déjà via `hueFor` → toute page qui les utilise est couverte.
- **Ne PAS colorer le CHROME** : flèches (`ArrowRight/Left/UpRight`), chevrons, `Menu`, `PanelLeft`, `ExternalLink`, `Download`, `Loader2`, croix de fermeture, logos de marque (`Github/Twitter/Linkedin`), `Info` de bandeau légal, et les **puces `Check`** de liste (marqueurs, pas des icônes de feature).
- **Angles vifs PARTOUT — c'est l'identité (« cards carrées », validé user).** TOUS les conteneurs sont carrés : cartes de section, panneaux (`Panel`), **nœuds de flux** (`Step`/`Mini`/`Ctx`/`Hub`/`RunStep`) ET les **canvas de flux** (`flow-canvas`). Aucun `rounded-lg/xl/2xl/3xl` sur un conteneur. Restent arrondis uniquement les **chips/atomes** : pills & boutons (`rounded-full`), puces d'icône (`.ic-tile`, `rounded-lg/md`), badges, points, avatars. Règle mentale : **conteneurs carrés, chips ronds.**

---

## 3. Structure « traits intégrés »

Le gabarit de section :

```astro
<section class="bg-card border-b">
  <div class="container-rail py-20 lg:py-28">
    <div class="max-w-2xl">
      <p class="t-eyebrow mb-3">Eyebrow</p>
      <h2 class="t-h2">Titre</h2>
      <p class="t-lead mt-4">Chapô.</p>
    </div>

    <!-- GRILLE À FILETS edge-to-edge : casse le rail, filets = séparateurs -->
    <div class="-mx-6 mt-12 grid gap-px border-y border-border bg-border sm:grid-cols-2 lg:grid-cols-3 lg:-mx-10">
      <div class="bg-card flex flex-col p-6 sm:p-8"> … cellule … </div>
      <!-- autres cellules -->
    </div>
  </div>
</section>
```

Règles :
- Le `-mx-6 lg:-mx-10` **casse le `container-rail`** pour aller bord-à-bord jusqu'aux rails. `Section` (React) utilise aussi `container-rail` → le breakout marche dedans.
- `gap-px bg-border` + cellules `bg-card` = les filets 1px (= « les traits »).
- `border-y border-border` = filets haut/bas de la grille.
- **JAMAIS** `rounded-2xl border` sur des cellules qui « flottent ». Une cellule pleine largeur = `lg:col-span-{n}`.
- Colonnes à filet vertical (variante « rails ») : `sm:border-l` sur les cellules `i>0` ; utilitaires `.rail-x` / `.rail-y`.
- Variété = structure (nombre de colonnes, cellules larges, orientation), pas décor.

---

## 4. Workflows / process (React Flow) — LE point sensible

**Tout** ce qui est séquence / boucle / pipeline / fourche / graphe passe par `flows/OrchestrationFlows.tsx`. On ne code jamais un flow à la main.

**Nœuds (la DA de card d'orchestration) :**
- `StepNode` (type `step`) — card riche du run : tuile d'icône + titre + pastille d'état (`Approved/Running/Queued`) + badge rôle (`CPO/CTO/COO`) + sous-titre. Pour le run complet.
- `MiniNode` (type `mini`) — card de chaîne/boucle : **tuile d'icône teintée** + titre + sous-titre. `highlight` = teinte primaire (étape humaine/pivot). `dot` = couleur d'accent de la tuile. **Toujours une icône** (ou un dot) → jamais de tuile vide.

**Ports de connexion VISIBLES (OBLIGATOIRE — sinon ça passe pour du fait-main, cf. bug v145).** Chaque nœud montre ses ports : **source = anneau bleu** (`tf-handle--source`, 11px, bordure 2px) + **target = point** (`tf-handle--target`, 8px). Les handles sont stylés **par TYPE** dans `Handles` (`h.type === "source"`), jamais par un flag oublié. Arêtes bleues `smoothstep` + pointe de flèche, espacement suffisant pour voir la ligne port→flèche.
- `RunStepNode` (type `runStep`) — étape numérotée à texte long (use-cases).
- `HubNode` (type `hub`) — cœur (highlight) OU outil connecté (**vrai logo** `BrandLogo`). Pour les graphes RADIAUX (cf. `IntegrationsHubFlow`).
- **Tous** : `border bg-card`, **carrés (angles vifs)**, **pas de `surface`/shadow**. Puce d'icône interne = seul élément arrondi.

**VARIÉTÉ (validé user) — les diagrammes sont ILLUSTRATIFS, pas une repro fidèle du système.** On a le droit d'inventer des formes custom pour illustrer une IDÉE. Objectif : **une forme distincte par page, jamais deux fois le même pattern dans une même page.** Catalogue de formes : chaîne (`vChain`), boucle (Brain/Calibration), **hub radial** (`IntegrationsHubFlow`), fork/arbre (`DecisionGraph`/`ProposalPath`), fan/stack (`EnterpriseStack`), timeline. Éviter d'empiler des `vChain` verticaux partout — c'est ce qui rendait les pages identiques.

**Arêtes :** `EDGE` = smoothstep bleu `#2563eb` + `MarkerType.ArrowClosed`. Boucles de retour = `tinted(color)` avec label.

**Socle :** `StaticFlow` (interactions coupées, badge masqué, fond transparent, `maxZoom:1`). **Statique, zéro animation.**

**Présentation :** flow posé sur un **canvas à points** `flow-canvas` (blanc + dots) OU dans une cellule de grille à filets. Section = `bg-card` (pas `bg-dots` ET `flow-canvas` en même temps).

**⚠️ Fragilité connue :** React Flow mesure les nœuds via ResizeObserver + rAF, **en pause si l'onglet n'est pas affiché** → dans un navigateur d'automatisation caché, `rfEdges = 0` (les arêtes ne se calculent pas). **Pour un vrai visiteur (écran affiché), ça rend.** Donc : le check visuel des flows se fait chez le user, pas par screenshot d'automatisation. Le kit a un « kick » (`updateNodeInternals` + `visibilitychange` + `fitView`) pour re-mesurer — ne pas le retirer.

**Flows exportés (1 par usage) :** Hero/Grounding/Approval/Handoff/Calibration (orchestration) · Agents · AnalyticsLoop · Approvals · Integrations · BrainLoop · LabsLoop · Routing · EngineeringRun · ProposalPath · EnterpriseStack · UseCaseRun · StepChainFlow (générique, piloté par props, icônes via `ICON_MAP` car une `.astro` ne peut pas passer un composant à un îlot `client:only`).

**Îlot :** `<XxxFlow client:only="react" />` (React Flow a besoin du DOM). Réserver la hauteur (`aspect-ratio` ou `h-[…]`) → pas de CLS.

---

## 5. Hero

- **Home** : **screen de l'app** (mock UI réel `scene/SpecPanel` dans `scene/AppWindow`), PAS un workflow. Texte en SSR (le H1 = LCP).
- **Orchestration** : le **run** en React Flow (`HeroFlow`) — c'est la page qui montre le mécanisme.
- **Pages produit** : `PageHero` (texte) ; le visuel/flow arrive en section, pas dans le hero.
- **CTA de fin de page** (`PageCta` + home `FinalCta`) : **seule section non-blanche** — fond `bg-secondary` (= le gris du **footer**, transition douce vers le pied de page). La carte = `bg-card border`, **sans shadow, sans halo, sans radius** (angles vifs — le radius reste réservé aux canvases de flux ; l'exception CTA ne porte QUE sur le fond gris).

---

## 6. Honnêteté (D11)

- Badges `Live` (emerald) / `Beta` (amber) / `Planned`/`Labs` (violet, marquage IA). Portent l'info par le **texte**, jamais la couleur seule (WCAG 1.4.1).
- Diagramme illustratif → légende « Illustrative — … Planned ».
- Placeholders de screen = squelette abstrait (`ScreenPlaceholder`), **jamais** de faux chiffres/metrics.

---

## 7. Icônes & typo

- Icônes : **lucide** uniquement, dans une **tuile** (`rounded-lg border`, `size-9/10`). Teinte : **`.ic-tile` + `style="--ic:#hex"`** (fond 12 %, filet 26 %, icône = la teinte) selon la palette sémantique (§2), ou `bg-secondary/60` pour du neutre. Dans les flux, `MiniNode` fait ça tout seul via `dot`/`ICON_COLOR`.
- Micro-composants dispo : `.tf-pulse` (point « live » pulsé, reprend `currentColor` — badges Live/Running) · `.status-dot` (point vert) · `.anim-attention` (anneau une fois). Coupés en `prefers-reduced-motion`.
- Typo : utilitaires `.t-eyebrow` / `.t-h1` / `.t-h2` / `.t-h3` / `.t-lead` (définis dans `global.css`). Ne pas réinventer les tailles.

---

## 8. Labs (exception cadrée)

- `/labs` peut utiliser **PixelBlast** (react-bits, WebGL) — `PixelField.astro` (fond/coin) + `PixelBand.astro` (transition entre sections). Couleurs = palette de `public/labs/hero-wave.jpg` (coraux→violet→bleus).
- Fonds quand même **blancs** ; l'image vague reste sur hero + CTA (identité). Boucle « The system » = React Flow (`LabsLoopFlow`) sur canvas à points.
- Reste light/sobre. Violet autorisé (marquage Labs).

---

## 9. Inventaire des composants (utiliser ceux-là, ne pas réinventer)

**Layout / primitives** — `site/Section.tsx` : `Section` (blanc + rythme + `container-rail`), `SectionHeader`, `FeatureSplit`, `FeatureBand`, `MockFrame`, `LevelBadge`.
**Sections kit** — `site/sections/` : `BorderedGrid` (grille à filets prête), `CalloutBand`, `StatBand`, `FeatureRows`/`FeatureRow`, `Panel`, `ScreenPlaceholder`, `Bento`.
**Flows (React Flow)** — `site/flows/OrchestrationFlows.tsx` : tous les nœuds + flows (§4). **Le seul endroit pour un workflow.**
**Mock d'app** — `site/scene/AppWindow.tsx` + `scene/SpecPanel.tsx` ; `site/AppShot.tsx` (+ `Toast`). Pour les « screens d'app ».
**Illustrations produit réelles (îlots)** — `illustrations/` : `CollabBoard`, `AutoAssign`, `IntegrationCatalogue`, `DeliveryInsights`. (Ex-`home/DecisionGraph` SVG et `home/RunTimeline` animé → **remplacés par React Flow** : `DecisionGraphFlow` + `home/TheRun.astro` (`HeroFlow`) ; les `.tsx` d'origine sont morts.)
**Labs** — `site/PixelField.astro`, `site/PixelBand.astro`, `site/LabsBackdrop.astro`, `site/LabsShowcase.tsx`, `site/labs/LabsGradientDefs.astro` ; `components/PixelBlast.tsx`.
**Divers** — `site/BrandLogo.tsx` (logos vendorisés `public/logos/`).

**Primitives DA — LES UTILISER (ne plus recopier le gabarit)**
- [x] `sections/SectionShell.astro` — gabarit de section : blanc + `container-rail` + rythme + en-tête optionnel (`eyebrow`/`title`/`lead`/`align`). Contenu en `<slot/>`. Adopté sur `home/BeforeAfter.astro` (exemple canonique).
- [x] `sections/TraitGrid.astro` — grille à filets edge-to-edge, props `cols` (2/3/4). Cellules = `<div class="bg-card p-6 sm:p-8">…</div>` en slot ; pleine largeur = `lg:col-span-{n}`.
- [x] `RunTimeline` : encart « Adaptive » dé-cardé (filet gauche) + shadow de la démo retiré ; bandes grises du home retirées.
- [ ] Migrer **au fur et à mesure** les autres sections (`WhatShipsToday`, `Showcase`, produit) vers `SectionShell` + `TraitGrid`.
- [ ] Nuance à trancher : shadows des **mocks d'app** (hero `SpecPanel`, `AppShot` de Trust) — gardés pour l'instant (ce sont des « screens », pas des cards) ; à confirmer si on les retire aussi.

---

## 10. Checklist avant de livrer une section

- [ ] Fond blanc (`bg-card`) ? Aucun `bg-secondary`/gris de section ? Aucun halo ?
- [ ] Aucune `shadow-*` / `.surface` ? Séparation par bordure/filet ?
- [ ] Contenu groupé = grille à **filets edge-to-edge** (pas de card flottante `rounded-2xl`) ?
- [ ] Tout process/pipeline/boucle = **React Flow** (kit), nœuds à tuile d'icône, arêtes bleues ?
- [ ] Badges de maturité honnêtes ? Diagramme illustratif tagué ?
- [ ] `npm run build` OK (68 pages) ? 0 erreur console (vérif user pour le rendu des flows) ?
