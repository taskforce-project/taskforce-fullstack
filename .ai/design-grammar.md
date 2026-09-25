# Grammaire de design TaskForce (webapp)

> Contrat pour tout agent (et humain) qui touche l'UI de `frontend/`. Pas une charte esthétique : des
> règles de décision, calibrées sur les tokens réels de `frontend/app/globals.css`. Écrit le 20/09/2026
> avec la passe de densité (PROD-8.11). Les valeurs ci-dessous sont celles du code ; si elles divergent,
> le code a raison et cette page se corrige.

## 1. Ce que l'interface doit être

Calme, dense, précise, plate, claire. Un outil de travail pour des gens qui scannent des listes toute la
journée, pas un site marketing. La famille de référence est Linear / dashboard Cloudflare : hiérarchie par
le contraste avant la couleur, contrôles compacts, bordures presque invisibles, quasi pas d'ombres.

Décisions qui ne se rediscutent pas (CEO, 20/09) :

- **Thème clair par défaut.** Le sombre existe (`.dark`) et doit rester cohérent, mais il n'est pas l'identité.
- **Bleu de marque `#2563eb`** (`--primary`) pour TOUTE action primaire. Pas de violet, pas d'« AI purple ».
- **Un seul radius de référence** : `--radius` = 10px (sm 6 / md 8 / lg et xl 10). On n'en ajoute pas.
- **Plat** : aucun `backdrop-filter`, aucun gradient décoratif dans le produit (les dégradés vivent sur les
  pages d'auth et le Labs, jamais dans le workspace).

## 2. Tokens (source unique : `globals.css`)

| Rôle | Token | Valeur (clair) |
| --- | --- | --- |
| Fond / carte / sidebar | `--background` / `--card` / `--sidebar` | `#fbfbfc` / `#ffffff` / `#fbfbfc` (sidebar = fond, pas de rupture) |
| Texte, 4 niveaux | `--label-primary` à `--label-quaternary` | `#1d1d1f` / `#4b4b4f` / `#67676c` / `#6e6e73` (WCAG AA vérifié le 22/07) |
| Action primaire | `--primary` | `#2563eb` (sombre : `#3b82f6`) |
| Bordures | `--border` / `--input` | `#e6e6e9` / `#dededf` |
| Focus | `--ring` | bleu primaire à 35 % |
| Hauteurs de contrôle | `--control-height-sm` / `--control-height` / `--control-height-lg` | 28 / 32 / 36 px |
| Ligne de table | `--row-height` (en-tête) | 36 px ; cellules `py-1.5`, donc lignes à 32 px |
| Ombres | `--shadow-xs` à `--shadow-2xl` | très faibles ; réservées à ce qui flotte (popover, menu, dialog) |
| Motion | `cubic-bezier(0.16, 1, 0.3, 1)` | 180 à 350 ms, ease-out, jamais de rebond |

Utilitaires dérivés : `h-control`, `h-control-sm`, `h-control-lg`, `size-control*`, `min-w-control*`,
`h-row`. Ils sont déclarés dans tailwind-merge (`lib/utils.ts`) : un `h-10` passé en `className` l'emporte
proprement sur le défaut du composant.

## 3. Règles de décision

1. **Contraste avant couleur.** Pour distinguer deux niveaux d'information, changer le niveau de `--label-*`,
   pas la teinte. La couleur est réservée aux actions (`--primary`), aux états (succès / danger) et aux
   statuts métier.
2. **Retenue avant décoration.** Entre plus de décoration et plus de silence, choisir le silence.
3. **Compact avant large.** Entre plus grand et plus compact, choisir compact. Contrôle par défaut 32 px,
   petit 28, grand 36. Lignes de liste 32 à 36 px. Corps 13 à 14 px, métadonnées 11 à 12 px. Pas de titre
   surdimensionné dans l'app.
4. **Tokens uniquement.** Aucune couleur, radius, ombre, hauteur ou durée en dur dans un composant. Un
   nouveau besoin = d'abord vérifier qu'un token existe. Ne jamais créer deux nuances équivalentes.
5. **Une carte est une surface réelle.** On n'emballe pas chaque section dans une `Card`. Fond + bordure
   subtile suffisent ; l'élévation (ombre) ne s'utilise que pour ce qui flotte.
6. **La sidebar s'efface.** 13 px, contraste bas (`--sidebar-foreground`), lignes compactes, état actif net.
   Le contenu domine visuellement, jamais la navigation.
7. **Tout ce qui est interactif a ses cinq états** : default, hover, active, focus-visible (anneau `--ring`),
   disabled. Hover subtil (fond `--fill-secondary`), actif = réponse physique légère, transitions 100 à 200 ms.
8. **Icônes** : petites, monochromes (lucide), même épaisseur de trait, opacité 60 à 70 % au repos, 90 à
   100 % actives. Jamais d'emoji dans l'UI du produit.
9. **Alignement** : icônes, libellés et contrôles sur les mêmes lignes verticales ; rythme d'espacement 4 px.
10. **Accessibilité non négociable** : contraste AA maintenu, modes `high-contrast` / dyslexie / daltonien
    de `globals.css` intacts, cibles tactiles jamais sous 28 px (les slots OTP restent à 36).

## 4. Interdits

Thème sombre par défaut · violet ou dégradé comme accent produit · glassmorphism · radius au-dessus de 12 px
ou « pilules » hors composant qui l'exige · ombres décoratives sur des surfaces à plat · une carte par section ·
emojis dans l'interface · valeurs en dur · données mock.

## 5. Vérifier une passe UI

- Mesurer, pas supposer : `getBoundingClientRect().height` sur un bouton (32), un input (32), un en-tête de
  table (36), une ligne (32), un item de sidebar (32).
- Contrôler qu'un `className="h-10"` posé par une page l'emporte bien sur le défaut (tailwind-merge).
- Regarder la même vue en clair ET en sombre, puis en `high-contrast`.
- Sous Windows / Docker, Next ne recharge pas les fichiers : `docker restart taskforce-frontend-dev`.

## 6. Ce qui reste (état au 20/09, après la 2e passe)

- Fait : 9 primitives ui/ + 41 contrôles de pages/composants sur les tokens ; lignes de liste à 37 px (issues,
  backlog, issues projet, fiche membre). Mesuré sur la stack dev, validé par le CEO le 20/09.
- Laissé à dessein (23 occurrences) : icônes, avatars, logos, spinners, le bandeau Labs (`lab-shell`, sa hauteur
  de 36 px est couplée au décalage de la sidebar dans `globals.css`).
- À faire : `projects/[id]/list/page.tsx` (même pattern `py-2.5`, fichier en cours côté CEO).
- Visuels d'app du site (`landing-page/public/screens/`) : recapturés le 20/09 avec l'outil `design-assets`
  (`npm run capture`). Attention : les étapes de `capture/film.mjs` MODIFIENT la base de dev (elles appliquent
  les assignations) : sauvegarder puis restaurer les lignes concernées autour de la capture.

## 7. La landing : même grammaire, un cran d'air (20/09)

Le site partage le système de l'app, pas sa densité : c'est du marketing, on respire.

| | App | Site |
| --- | --- | --- |
| Hauteurs de contrôle (sm / défaut / lg) | 28 / 32 / 36 | 32 / 36 / 40 |
| Radius effectif (sm / md / lg) | 6 / 8 / 10 | 6 / 8 / 10 (`--radius` 8 px, mapping décalé d'un cran) |
| Ombres | flat (`--shadow-lg` = 0 4px 12px à 8 %) | les mêmes valeurs |
| CTA marketing | sans objet | boutons « pill » 42 / 48, hors échelle de contrôle |

- Source unique : `landing-page/src/styles/global.css` ; utilitaires `h-control*`, `size-control*`,
  `min-w-control*` ; clés déclarées dans tailwind-merge (`landing-page/src/lib/utils.ts`).
- Un formulaire = une seule hauteur (démo : tout à 40).
- Piège rencontré deux fois dans ce fichier : une variable CSS redéclarée plus bas dans le même `:root` écrase
  la première EN SILENCE (`--radius`, puis 5 niveaux d'ombre). Avant d'ajouter un token, chercher s'il existe.
- Vérifier : mesure DOM, `npm run lint`, puis un build de prod (`astro build`) et chercher `.h-control` dans
  `dist/_astro/*.css` : le mode dev ne prouve pas que l'utilitaire est émis en prod.
- **Échelle des titres (25/09)** : `t-h1` (H1, Sora 40 → 56), `t-h2` (sections, 30 → 40), `t-h3` (20), puis
  `t-h4` (titre de carte, 16 / 600) et `t-h5` (carte dense, ligne de liste, 14 / 600). Jamais de
  `text-[15px] font-semibold` sur un titre : un titre de carte prend `t-h4` ou `t-h5`. Ces tokens sont
  hors couche, ils l'emportent sur les utilitaires (une marge `mt-*` s'ajoute, une taille ne s'écrase pas).
- **Titres de section révélés au scroll** : tout `h2.t-h2` est traité par `src/scripts/reveal-titles.ts`
  (mots gris → noirs au défilement). Exclure un titre : l'envelopper dans `[data-no-reveal]`. Pages
  `/legal/` exclues d'office. Plancher d'opacité 0.55 (≥ 3:1 même sur `--secondary`) : un mot non
  révélé reste lisible et conforme AA, ne jamais le baisser pour « plus d'effet ».
- **Ponctuation** : ni tiret long, ni tiret de liaison « - » entre deux propositions dans les titres, les
  leads et les metas. Choisir la vraie ponctuation (virgule, deux-points, point, parenthèses).
