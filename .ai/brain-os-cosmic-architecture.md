# Brain OS — Architecture cosmique de la mémoire

> Carte 2D unique, navigable du macro au micro, où **chaque niveau englobe le précédent**
> (modèle des échelles de l'Univers). Appliquée au modèle de données réel de TaskForce.
> Statut : spécification de référence. Ce qui est **[FAIT]** est déjà dans `frontend/components/brain/brain-graph.tsx` ; **[À FAIRE]** = palier suivant.

---

## 0. Principe directeur

Comme l'Univers : Planète → Système → Voisinage → Bras galactique → Galaxie → Groupe → … → Toile cosmique.
Chez nous, **1 workspace = 1 Brain OS = 1 univers**. On descend du plus grand (l'univers) au plus petit (l'idée),
chaque niveau étant **contenu** dans le suivant, jamais l'inverse.

Adaptation honnête au domaine : dans un outil de gestion de projet, le **vrai** premier découpage n'est pas
un « domaine » abstrait mais le **projet**. On garde donc : `Univers (workspace) → Galaxies (projets) → Anneaux
(domaines-types) → Étoiles (notes) → Planètes (note ouverte) → Lunes (tags)`. Les « domaines » deviennent les
**anneaux/orbites** internes à chaque galaxie (couches, comme les niveaux d'énergie d'un atome).

---

## 1. Niveaux hiérarchiques (échelle cosmique ↔ données)

| # | Échelle cosmique | Entité TaskForce | Modèle de données | Cardinalité |
|---|------------------|------------------|-------------------|-------------|
| L0 | 🌌 **Univers** | Le **workspace** (Brain OS) | `BrainWorkspace` (1 par workspace) ; nœud racine `type=README, title="Brain OS"` | 1 |
| L1 | 🌀 **Galaxie** | Un **projet** | hub = `KnowledgeNode type=README, refType=PROJECT, refId=projet` | ~4 → 10–50 |
| L1b | ⭐ **Voisinage stellaire** | Docs **globaux** workspace | nœuds `refType=null` (Charte, Archi transverse, Sécurité, Infra, Roadmap) | ~5–15 |
| L2 | ☁️ **Bras galactique / Anneau** | Un **domaine-type** dans le projet | `NodeDomain` projeté sur 6 anneaux (cf. §7) | 6 anneaux/galaxie |
| L3 | ✦ **Étoile** | Une **note** | `KnowledgeNode` (DOC, ADR, FINDING, SPEC, RUNBOOK, issue-stub…) | ~20–30/projet |
| L4 | 🪐 **Planète** | La note **ouverte** (vue détail/éditeur) | contenu markdown du nœud | — |
| L5 | 🌙 **Lune** | Un **tag** du nœud | `metadata.tags[]` | 0–N par note |

**Règle de croissance d'ordre de grandeur** (comme l'Univers) :
`1 univers → 10¹ galaxies → 10¹·⁶ anneaux → 10²·⁵ étoiles → 10³ lunes`.
La carte doit **montrer** cette explosion : plus on zoome, plus la densité apparaît.

---

## 2. Hiérarchie stricte + parent unique

- **Parent unique structurel** = la chaîne `refType/refId` puis `domain` :
  une note appartient à **un** projet (`refId`) et **un** anneau (`domain`). Jamais à deux galaxies.
- Le hub `Brain OS` (racine) est le parent de toutes les galaxies (`spoke`) et des docs globaux.
- **Aucun saut de niveau** : une note ne se rattache jamais directement à l'univers si elle a un projet ;
  un tag ne se rattache jamais à un projet sans passer par une note.
- **[FAIT]** : `groupKey(n) = refType===PROJECT ? p{refId} : "global"` ; anneau = `RING_OF_DOMAIN[domain]`.

---

## 3. Deux familles de liens

### 3.1 Liens **structurels** (la hiérarchie) — trait **continu épais**
`Univers → Galaxie → Anneau → Étoile`.
Données : liens synthétiques `spoke` (racine→hub projet) + `member` (note→hub projet).
Ne traversent **jamais** une frontière de galaxie. **[FAIT]**

### 3.2 Liens **transverses** (le réseau de connaissances) — trait **fin pointillé/coloré**
`[[wikilinks]]` + **tags partagés** entre notes (même de galaxies différentes).
Données : `knowledge_edges` (`relationType=REFERENCES`, `auto=true`).
- Ne modifient **jamais** la hiérarchie (purement décoratifs/navigationnels).
- **[FAIT]** : rendus **transparents par défaut, visibles seulement au survol** (sinon = la toile d'araignée qui avait tout cassé).
- **[À FAIRE]** : `relationType=SUPERSEDES` (une décision en remplace une autre) → trait **double**.

### 3.3 Tags = lunes, pas nœuds
Décision clé : **les tags ne sont PAS des nœuds du graphe principal** (ils créaient des ponts inter-galaxies → spaghetti).
Ils vivent comme **filtre** (sidebar) et comme **lunes** d'une note au niveau planète (L5). **[FAIT pour le retrait ; À FAIRE pour les lunes]**

---

## 4. Zones emboîtées

```
Univers (fond)
 └── Galaxie = BULLE (halo coloré, §7) qui englobe physiquement ses anneaux + étoiles   [FAIT]
      └── Anneau = cercle concentrique invisible (rayon fixe par domaine)                [FAIT]
           └── Étoile = note posée sur l'anneau
```
- Une bulle = une galaxie. Le rayon de la bulle = englobe son anneau le plus externe + marge. **[FAIT]**
- **[À FAIRE]** : regroupement de galaxies (« Groupe local ») si > ~12 projets → bulles de bulles.

---

## 5. Distance = sens (sémantique de l'espacement)

- **Proche du centre d'une galaxie = important/structurant** : l'anneau interne (Architecture) est le plus proche du hub.
- **Loin = secondaire/historique** : Historique (anneau 4), Runbooks/Infra (anneau 5), Archive (anneau externe).
- Deux notes **proches angulairement** dans le même anneau = même type, souvent liées.
- **Jamais deux objets sans relation côte à côte** : l'angle est déterminé par l'anneau + un hash stable de l'id
  (`signedHash`) → répartition régulière, pas de voisinage accidentel trompeur. **[FAIT]**

---

## 6. Densité (guidage de l'œil)

| Zone | Contenu | Rendu |
|------|---------|-------|
| **Centre univers** | Noyau `Brain OS` + docs globaux | gros, opaque, fixe |
| **Cœur de galaxie** | hub projet + Architecture + Décisions | vif, labels visibles tôt |
| **Périphérie de galaxie** | Backlog, Problèmes | densité d'étoiles élevée |
| **Bord externe** | **Historique, Runbooks, domaine `ARCHIVE` (20), `status=ARCHIVED`** | gris, faible opacité, label tardif |

Règle : `status=ARCHIVED` ou `domain=ARCHIVE` → toujours sur l'**anneau le plus externe**, désaturé. **[À FAIRE : forcer ARCHIVE en anneau externe + désaturation]**

---

## 7. Convention graphique (stricte)

### Formes (par `NodeType`)
| Forme | Type | Sens |
|-------|------|------|
| ● Gros cercle plein | `README` (racine/hub) | conteneur / noyau de galaxie |
| ✦ Cercle | `DOC`, `SPEC`, `NOTE` | connaissance |
| ◆ Losange | `ADR`, `DECISION` | décision |
| ⬡ Hexagone | `RUNBOOK`, `SOP` | procédure / projet d'action |
| ▲ Triangle rouge | `FINDING` | problème |
| ○ Petit point gris | `ACTION_OODA`, archive | historique / trace |

### Couleurs
- **Identité galaxie** : 1 couleur par projet (palette stable). **[FAIT]**
- **Sémantique d'état** (surcouche) : `ACTIVE` = vif (vivant) · `FINDING` = rouge (problème) · `ARCHIVED` = gris.
- **Bleu = structurel**, **pointillé coloré = transverse** (liens). **[FAIT pour structurel/transverse]**

### Épaisseurs de trait
`épais continu = hiérarchie` · `fin = référence` · `pointillé = relation transverse` · `double = dépendance (SUPERSEDES)`.

> **[À FAIRE]** : différencier les **formes** par type (aujourd'hui tout est cercle, couleur = projet). C'est le gros écart restant avec cette spec.

---

## 8. Échelle & zoom sémantique (navigation)

Chaque palier de zoom **change d'ordre de grandeur** et **active/désactive** des détails (et la physique — ici : les labels, la structure étant figée) :

| Zoom | Niveau actif | Visible | Masqué |
|------|--------------|---------|--------|
| ≤ 1× | 🌌 Univers | bulles-galaxies + noyau + labels projets | étoiles sans label, anneaux flous |
| clic bulle → ~2.6× | 🌀 Galaxie | anneaux + watermark projet + labels de notes | autres galaxies estompées |
| ~2.3×+ | ✦ Étoiles | labels de toutes les notes de la galaxie | — |
| clic note | 🪐 Planète | éditeur + (à venir) tags en lunes | le graphe |

- **[FAIT]** : bulles ↔ galaxie ↔ labels par seuils ; clic bulle = plonger ; « Vue globale » = remonter ; watermark.
- **Entrée/sortie claires par niveau** (contrainte 9) : entrée = clic sur la bulle/le hub ; sortie = clic fond / bouton « Vue globale » / clic noyau. **[FAIT]**
- **[À FAIRE]** : niveau 🪐 Planète = note ouverte **en plein écran** avec ses **tags en orbite (lunes)** + ses voisins transverses listés.

---

## 9. Principes UX

1. **Toujours une boussole** : on sait à quel niveau on est (badge « Univers complet » / « {Projet} ouvert »). **[FAIT]**
2. **Zoom = révélation progressive**, jamais brutale (les labels apparaissent par paliers). **[FAIT]**
3. **Survol = mise en évidence** du nœud + ses voisins ; le reste s'estompe. **[FAIT]**
4. **Curseur signifiant** : pointer = zone cliquable (dans une bulle), main = vide. **[FAIT]**
5. **Vivant sans chaos** : scintillement + respiration des bulles + apparition en fondu, **sans jamais déplacer la structure**. **[FAIT]**
6. **Déterminisme** : mêmes données → même carte (positions = fonction pure de l'id + domaine). Réconfortant, mémorisable. **[FAIT]**

---

## 10. Erreurs à éviter (apprises sur ce projet)

- ❌ **Tags comme nœuds centraux** → ponts inter-galaxies → toile d'araignée. *(retiré)*
- ❌ **Moteur de forces libre** sur 100 nœuds → spaghetti, instable. *(remplacé par positions déterministes en anneaux)*
- ❌ **Tout labelliser à tous les zooms** → illisible. *(zoom sémantique)*
- ❌ **Liens transverses toujours visibles** → bruit. *(visibles au survol)*
- ❌ **Thème spatial sombre forcé** → « on n'est pas dans l'espace » → fond neutre themé.
- ❌ **Zones de clic trop larges** → clics volés entre voisins + curseur pointer partout. *(zone resserrée)*
- ❌ **Saut de niveau** (note rattachée au workspace en ignorant son projet) → casse la hiérarchie stricte.

---

## 11. Schéma ASCII (vue d'ensemble)

```
                              ╔══════════════════════════════════════════════╗
                              ║        🌌 UNIVERS = WORKSPACE (Brain OS)      ║
                              ║                                              ║
                              ║        ┌───── voisinage stellaire ─────┐     ║
                              ║        │  ✦ Charte  ✦ Archi  ✦ Sécu    │     ║
                              ║        │        ●  BRAIN OS  ●          │     ║   ● = noyau (README racine)
                              ║        └───────────┬──────────────────┘     ║
                              ║          ╱         │         ╲              ║   ═══ lien structurel (spoke)
                              ║   ┌─────╱────┐ ┌───┴────┐ ┌───╲────┐        ║
                              ║   │🌀 GALAXIE│ │🌀 GALAX.│ │🌀 GALAX.│       ║
                              ║   │ Web App  │ │  API    │ │ Infra   │  …    ║
                              ║   │          │ │         │ │         │       ║
                              ║   │   ◆ ◆    │ │  anneau0 Architecture│      ║   anneaux concentriques par domaine :
                              ║   │  ✦ ● ✦   │ │  anneau1 Décisions ◆ │      ║     0 Archi · 1 Décisions · 2 Backlog
                              ║   │ ▲ ✦ ✦ ▲  │ │  anneau2 Backlog  ✦  │      ║     3 Problèmes · 4 Histo · 5 Runbooks
                              ║   │  ○ ○ ○   │ │  anneau3 Problèmes ▲ │      ║
                              ║   └──────────┘ │  anneau4 Histo  ○ ○  │      ║   ✦ note · ◆ décision · ▲ problème
                              ║      (bulle)   │  anneau5 Runbooks ⬡  │      ║   ○ archive (bord, désaturé)
                              ║                └─────────────────────┘       ║
                              ║                                              ║
                              ║   ✦┄┄┄┄┄┄┄┄✦   lien transverse (wikilink/tag, ║   ┄┄ transverse (au survol)
                              ║   (visible au survol, ne change pas la hiér.) ║
                              ╚══════════════════════════════════════════════╝

   Zoom : 🌌 ≤1×  ──clic bulle──▶  🌀 ~2.6×  ──molette──▶  ✦ labels notes  ──clic note──▶  🪐 planète + 🌙 tags
   Retour : clic fond / « Vue globale » / clic noyau
```

---

## 12. Écart spec ↔ implémentation (feuille de route)

**Déjà conforme** : niveaux L0–L3, hiérarchie stricte parent unique, 2 types de liens (structurel/transverse), zones-bulles,
anneaux par domaine, distance sémantique, zoom sémantique + boussole, déterminisme, vivant-sans-chaos, curseur.

**À construire pour 100 % de la spec :**
1. **Formes par type** (losange décision, triangle problème, hexagone runbook) — aujourd'hui : cercles colorés par projet.
2. **Niveau 🪐 Planète** : note ouverte plein écran + **tags en lunes** + voisins transverses listés.
3. **Densité d'archive** : `ARCHIVE`/`ARCHIVED` forcés sur l'anneau externe + désaturation.
4. **Lien double `SUPERSEDES`** (dépendance/remplacement de décision).
5. **Groupes de galaxies** (bulles de bulles) si > ~12 projets — scalabilité visuelle.
6. **Mini-carte / fil d'Ariane** « Univers › Galaxie › Anneau » pour ne jamais se perdre.
```
```
