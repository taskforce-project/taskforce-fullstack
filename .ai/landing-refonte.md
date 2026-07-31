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
