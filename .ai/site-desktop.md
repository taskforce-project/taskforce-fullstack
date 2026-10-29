# Site de l'app desktop (landing-page/)

**Date :** 19/10/2026 · **Statut :** en prod le 19/10 (PR #357), avant l'app desktop, sur décision du CEO du 19/10 ; la page de téléchargement dit qu'aucune release desktop n'est publiée.
**Fiche Brain OS :** `taskforce-docs/v1/02-produit/Landing.md` (LP-DESKTOP-001).

## Pourquoi

TaskForce devient une app desktop (spec `taskforce-docs/v1/03-architecture/Specification_App_Desktop.md`) : les VM de
l'école ferment après le diplôme. Le site présente l'app à télécharger, comme Granola ou Claude Desktop : pas de
connexion, « Download » à la place.

## Direction (consignes du CEO du 19/10)

- **Fonds** : des peintures de musées (domaine public, publiées sur Unsplash par AIC, NGA, Europeana, Smithsonian, Met),
  une par page, choisies pour leur ciel calme où le texte se lit, avec un voile clair sous le texte. Pas de dégradé
  CSS ni de fond généré (refusés par le CEO). Fichiers servis par le site : `public/images/bg-<nom>-{1280,1920,2880}.webp`,
  sources et crédits dans `src/lib/backgrounds.ts` et les mentions légales. Les bandeaux de fin prennent tous une
  peinture claire (montagnes mauves sous un ciel rose pâle) ; la bande « local first » garde ses fleurs.
- **Structure** : variée et plus courte, façon duna.com, cluely.com, dust.tt : héros peint avec l'app animée, logos,
  colonnes à filets, cartes en paire (l'une cobalt), liste dépliante, bande peinte pleine largeur, cartes en rangée
  avec légende dessous, bandeau gris, mur de logos, frise numérotée, FAQ pleine largeur. Accueil : 8 560 px au lieu
  de 10 640.
- **Coins et filets** : rayons modestes (`--radius-sm/md/lg/xl` = 4/6/10/14 px, grands panneaux 16 px), ombres et
  filets presque invisibles comme les maquettes de Cluely (`--shadow-window`, `--shadow-float`). Boutons en pilule.
- **Couleurs** : celles du portfolio et de l'app (cobalt `#2F6BF6`, palette des formes). Le menu et les animations,
  appréciés du CEO, sont gardés.
- **Logos** : les vrais, sans pastille ni coins arrondis : SVGL (même source que `frontend/scripts/fetch-logos.mjs`) dans
  `public/logos/`, Plane (dépôt makeplane/plane), Apple, Windows, Linux. Claude Code montre le logo de Claude à la
  demande du CEO (19/10) ; l'ADR-013 notait que les conditions d'Anthropic encadrent ce logo : retirer `file` dans
  `src/lib/brands.ts` suffit pour revenir au nom seul.
- **Ton** : utilisateur, pas technique ; chaque phrase vérifiée dans le code (palette de commandes, thèmes, accessibilité
  revérifiés dans `frontend/` le 19/10).

## Compte TaskForce (décision du CEO du 19/10)

Compte gratuit obligatoire dans l'app desktop : créé au premier lancement, ou celui de la webapp (Keycloak et sa base
restent hébergés). À la première connexion, l'app propose de rapatrier les projets web. Les comptes existants reçoivent
un e-mail avant la fermeture de la webapp. Les téléchargements sont comptés par GitHub. Le site le dit partout (FAQ,
sécurité, téléchargement, `/migrate` et son animation, confidentialité, conditions, `llms.txt`) ; plus aucune mention
« No account » ni « pas de serveur ». Serveur de comptes hébergé chez OVH, en France (compte du CEO) : confidentialité
et mentions légales. Après la première connexion, l'app marche aussi hors ligne. L'e-mail aux comptes est dans la todo
marketing (OSS-MKT.1 du plan de release). Spec : `Specification_App_Desktop.md` §10.

## Où sont les choses

| Quoi | Où |
| --- | --- |
| Jetons, typo, boutons, voiles, cartes en paire, reveal, transitions | `src/styles/global.css` |
| Peintures de fond (sources, cadrage, crédits) | `src/lib/backgrounds.ts`, `src/components/site/Backdrop.astro` |
| Blocs de section | `site/PaintBand.astro`, `DuoCard.astro`, `BentoCard.astro`, `RuleColumns.astro`, `ProductSection.astro` |
| Mouvement au défilement (titres mot par mot, peintures en parallaxe, fenêtre qui se redresse, manifeste qui s'éclaire) | `src/scripts/motion.js` (attributs `data-words`, `data-parallax`, `data-tilt`, `data-fill`) |
| Composeur flottant en bas de page (démo locale, sans serveur ni IA) | `src/components/site/Composer.astro` |
| En-tête (menus illustrés, mobile) | `src/components/nav/SiteNav.tsx`, `MenuArt.tsx` (îlot persistant) |
| App animée du héros (boucle 19 s) | `src/components/visuals/HeroApp.tsx` |
| Vignettes animées (17) | `src/components/visuals/vignettes/` (registre `index.ts`) |
| Frise d'un run liée au défilement | `src/components/visuals/RunPipeline.tsx` |
| Trajet webapp → desktop | `src/components/visuals/MigrateFlow.tsx` |
| Release desktop lue au build (`desktop-v*`) | `src/lib/release.ts` |
| Menus, liens, pied de page | `src/lib/site.ts` |
| Image de partage (1200 × 630) | `public/og-image.jpg` |

## Pièges rencontrés

- Une section de héros qui isole son empilement (`isolate`) passe sa peinture (z-index -1) au-dessus du contenu de la
  section suivante qu'elle déborde : `PageHero` n'isole pas, l'accueil coupe sa peinture (`overflow-hidden`).
- `rounded-xl` suit le thème du site (`--radius-xl`), pas la valeur par défaut de Tailwind.
- Une scène animée posée dans une carte à texte blanc héritait de ce blanc (texte invisible sur ses fenêtres blanches) :
  `Vignette` impose `text-foreground` à sa scène.
- La frise de `/agents` (défilement) doit finir quand le bloc est encore visible : course `start 0.85` à `end 0.85`.
- `backdrop-filter` sur l'en-tête rend `position: fixed` relatif à l'en-tête : le menu mobile est rendu à côté de
  `<header>`, pas dedans.
- Le Vite du conteneur Docker de dev lit les `<script>` des `.astro` sans TypeScript : script de `BaseLayout` en JS.
- Navigation sans rechargement : la classe `js` de `<html>` est remise sur `astro:after-swap`, le reveal et `motion.js`
  relancés sur `astro:page-load`. Ils tournent aussi dès leur chargement : au premier chargement, `astro:page-load`
  n'arrive qu'une fois toutes les images chargées (titre du héros à 6,2 s au lieu de 2,0 s en 4G lente).
- Texte découpé en mots (`motion.js`) : une copie `.sr-only` du texte pour les lecteurs d'écran, jamais un `aria-label`
  (ignoré sur un `<p>`), prise dans `innerText`, qui garde l'espace entre deux lignes en bloc.
- Une image de fond CSS se télécharge dès le rendu, même tout en bas de la page : la peinture du grand mot du pied de
  page n'est posée qu'avec `.is-in` (`[data-reveal]`).
- Unsplash bloque les navigateurs sans tête (BotStopper) : la recherche d'images passe par le navigateur intégré.
- Le panneau navigateur du Code tab fait 608 px : vérifier en Playwright (`design-assets/node_modules/playwright`).

## Reste à faire (CEO)

- L'app desktop elle-même ; `/migrate` décrit l'import D.3, à livrer avant la mise en ligne de cette page.
- Date de fermeture de la webapp (`WEB_APP_CLOSES` dans `src/pages/migrate.astro`).
- Signature des builds (`SIGNED_BUILDS` dans `src/lib/release.ts`), nommage `desktop-v*` des releases, reconstruction du
  site après chaque release (hook de déploiement Vercel depuis la CI desktop).
- Mise en prod : la webapp part sur main avec l'ancien site ; ce site desktop reste sur dev jusqu'à la sortie du desktop.

## Dépendances (19/10)

Une cinquantaine de paquets de l'ancien site retirés (three, Radix, Recharts, GSAP, PostHog, Zod…) : 905 paquets
installés à 613. Gardés : Astro et son intégration React, Tailwind, motion, lucide-react, clsx, tailwind-merge, et
`@astrojs/markdown-remark`, désormais déclaré : la page Téléchargement l'importe pour les notes de release, et il ne
venait jusque-là que de l'intégration MDX retirée. `npm audit` inchangé (5 alertes sur l'outillage de lint).
