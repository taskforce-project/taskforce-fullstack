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
