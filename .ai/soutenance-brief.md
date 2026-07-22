# Brief soutenance RNCP — à ouvrir dans un chat dédié

> Ce fichier est **le prompt de démarrage** du chat consacré à la soutenance (support + texte oral).
> Il est autonome : tout ce qu'il faut savoir y est. Le travail de code, lui, reste dans le chat projet.
>
> **Méthode imposée par le user, dans cet ordre :**
> 1. **Architecture de la soutenance** (plan minuté, slide par slide) → **validation avant d'écrire quoi que ce soit**
> 2. **Texte oral complet**, prêt à être répété et peaufiné
> 3. **Report dans le PowerPoint**
>
> Ne pas sauter d'étape. Ne pas commencer à rédiger le texte tant que le plan n'est pas validé.

---

## 1. Le cadre officiel (non négociable)

Source : `Note pédagogique - DFS V1 2025.docx.pdf` (Metz Numeric School, RNCP 38606 niveau 6).

| Élément | Valeur |
|---|---|
| **Support de présentation** | PDF sur Classroom, **au plus tard le 25/09/2026** |
| **Soutenance** | **28 ou 29/09/2026** |
| **Durée totale** | **35 minutes** |
| **Répartition** | **20 min** de présentation orale appuyée par une démonstration et un support diapositives · **15 min** de questions du jury |
| **Jury** | **Deux professionnels externes** |
| **Découpage** | ~**10 min par bloc** : partie front-end (bloc `RNCP38606BC02`), puis partie back-end (bloc `RNCP38606BC03`) |
| **Ordre imposé** | « Respectez le plan d'organisation : bloc BC02 **puis** bloc BC03, en respectant au mieux l'ordre du référentiel » |

### Déroulement conseillé par l'école (à suivre)

1. **Introduction** — présentation du candidat, parcours professionnel, contexte du projet fil rouge,
   technologies sélectionnées **et motivations de ces choix**
2. **Présentation du projet** — contexte et problématique, objectifs, choix techniques,
   architecture front/back, **démonstration en direct de l'application dans la mesure du possible**
3. **Conclusion** — bilan et résultats obtenus, compétences acquises, **améliorations possibles**
4. **Questions du jury**

### Critères de réussite (liste littérale du document)

Maîtrise technique · Qualité du dossier · Structure de la soutenance · Capacité d'analyse et de
justification · Cohérence du projet avec les compétences RNCP · **Synthétisme** · **Esprit critique** ·
Gestion du temps · Dynamisme · Absence de fautes.

Deux d'entre eux orientent tout le reste :

> « **Synthétisme de votre propos : Ne cherchez pas à tout dire.** Présentez une synthèse de votre
> travail en ne mentionnant que les points clés. »

> « **Adoption d'un esprit critique** : si vous avez identifié des incohérences ou de nouvelles
> conclusions pendant votre présentation, partagez-les avec le jury. »

---

## 2. L'angle voulu par le user

**Un pitch, pas un rapport lu à voix haute.** Le jury est composé de deux professionnels externes :
les traiter **comme des clients à qui l'on vend le projet en 20 minutes**. Cet angle est un choix
délibéré, il doit être tenu du début à la fin.

Ce que cela implique concrètement :

- Ouvrir sur **le problème**, pas sur la stack. La technique vient prouver la solution, pas l'inverse.
- Chaque bloc technique répond à « pourquoi ce choix », jamais seulement « ce que j'ai utilisé ».
- La **démo est le cœur** — les slides l'accompagnent, elles ne la remplacent pas.
- Un fil narratif unique du début à la fin, pas une juxtaposition de chapitres.

⚠️ Le pitch ne dispense **pas** de couvrir les compétences : le jury note C13→C20 sur la partie front
et C21→C26 sur la partie back. Le plan doit faire les deux à la fois — vendre **et** prouver.

---

## 3. Ce qui existe déjà

**`C:\Taskforce\TaskForce_Soutenance_v3.pptx`** — 32 slides, format 16:9 (9144000 × 5143500 EMU).

Structure actuelle : titre · 01 Contexte · 02 La solution · 03 Gestion de projet · 04 Architecture ·
**Partie 1 Front-end** (technologie, composants, style, maquette, données/sécurité, accessibilité, tests…) ·
puis la partie back-end · etc.

La base est saine et déjà alignée sur l'ordre BC02 → BC03. **À challenger, pas à jeter** :
32 slides pour 20 minutes font environ 37 secondes par slide, ce qui est probablement trop dense.
La première question à trancher est donc : **combien de slides pour 20 minutes**, et lesquelles sauter.

---

## 4. Le projet en deux paragraphes

**TaskForce** — SaaS de gestion de projet avec assignation intelligente des tâches. Projet fil rouge
du titre Développeur Full Stack. Le CDC (`CDC - TaskForce - DFS.pdf`) demandait un outil de
répartition dynamique des tâches selon **compétences, charge de travail et disponibilités**, avec
suivi temps réel, alertes de surcharge, rapports, et une interface collaborative.

**Stack réelle** : Next.js 16 / React 19 / TypeScript strict / Tailwind v4 / shadcn-Radix côté front ;
Spring Boot / Java 21 / PostgreSQL 18 + pgvector / Keycloak (OIDC) côté back ; Docker Compose,
Flyway, MinIO, Stripe, service IA Python + LLM local Ollama. Différenciateur revendiqué :
le **smart-assign** — l'outil propose, le manager valide.

### Chiffres vérifiés (utilisables tels quels)

| Indicateur | Valeur | Seuil grille |
|---|---|---|
| Couverture de tests **front** | **88,83 %** lignes (785 tests Vitest, 0 échec) + E2E Playwright | ≥ 50 % |
| Couverture de tests **back** | **73,71 %** lignes (786 tests JaCoCo, 0 échec) | ≥ 50 % |
| Migrations Flyway | 71, sans trou ni doublon | — |
| Workflows CI | 7 (GitHub Actions) + Dependabot | — |
| Sécurité | ZAP + Semgrep + Trivy, 0 HIGH | — |

✅ **Re-mesurés les 21 et 22/07/2026**, suites entièrement vertes. Ces deux chiffres sont les seuls
seuils chiffrés de toute la grille (C18 et C25) : ils sont donc les plus susceptibles d'être
vérifiés en direct. Les valeurs qui circulaient avant (« 92 % front / 78 % back ») étaient périmées.

⚠️ **Reste à mesurer** : sécurité (`C5`) et SEO de la landing (`C9`) — voir `.ai/roadmap.md` §4.A.

### Un sujet à préparer : la régression de couverture backend

La couverture back était à **86,1 %** le 02/07 ; elle est à **73,71 %** aujourd'hui. Le code a gagné
~1 970 lignes (couche IA/agent, catalogue de connecteurs) arrivées quasiment sans tests.

Le point intéressant n'est pas la baisse, c'est **pourquoi elle n'a pas été vue** : le gate JaCoCo
était réglé sur 84 % mais lié à la phase Maven `verify`, que ni le script de test ni la CI
n'appellent. Il n'a donc jamais rien gardé (`PC-028`).

**À dire tel quel** : « notre garde-fou était branché sur une phase que le build n'atteint jamais.
Une régression de douze points est passée inaperçue pendant trois semaines. On l'a trouvée en
re-mesurant pour cette soutenance, le seuil est réaligné sur le réel, et les trois classes en cause
sont identifiées. » C'est exactement l'esprit critique attendu au §1, et ça vaut mieux que d'annoncer
un chiffre rond que le jury pourrait démentir en lançant le build.

---

## 5. Les deux points sensibles à préparer

**1. Écart au cahier des charges sur la stack back-end.** Le CDC impose littéralement
« Back-end : **PHP (Symfony) ou Node.js** ». Le projet est en **Java / Spring Boot**.

Ce n'est pas rédhibitoire — C22 note « un choix de technologies et frameworks back-end **adaptés** » —
mais l'écart doit être **assumé et argumenté à l'oral**, avec les vraies raisons techniques.
Bien tourné, il alimente même C2 (« une distance critique est prise par rapport à la demande client :
le candidat formule des interrogations, des préconisations »). Mal tourné, il passe pour un CDC non lu.
**Préparer une réponse de 30 secondes, et l'anticiper plutôt que l'attendre en questions.**

**2. Les maquettes.** C13 exige la conformité « aux maquettes **précédemment validées** ». Les
wireframes du projet ont été produits **a posteriori**, dérivés des 48 routes déjà codées.
La position honnête — reconstitution documentaire assumée, sans feindre l'antériorité — est
défendable et vaut mieux qu'une ambiguïté que le jury pourrait relever.

---

## 6. Règles de rédaction

- **Français correct**, phrases complètes, pas de style télégraphique.
- **Purger les caractères qui trahissent une génération IA** : pas de tiret cadratin, pas de flèches
  décoratives, pas d'emoji. Le jury est réticent à l'IA — cette contrainte vaut pour le support
  **et** pour le dossier.
- Ne pas surcharger les diapositives (consigne explicite de la note pédagogique).
- Illustrations : respecter la propriété intellectuelle, citer les sources.
- Faire relire pour éliminer les fautes (critère de notation à part entière).

## 7. Livrables attendus de ce chat

1. **Plan minuté** : slide par slide, avec le temps alloué et le message unique de chaque slide.
   Doit tenir en 20 minutes **démo comprise**, et couvrir C13→C20 puis C21→C26.
2. **Script oral complet**, rédigé pour être dit à voix haute — pas un texte à lire, un texte à jouer.
   Prévoir les transitions entre slides et les moments de bascule vers la démo.
3. **Scénario de démonstration** : quel parcours exact dans l'application, avec quel jeu de données,
   et quel plan de repli si la démo live échoue (capture vidéo de secours).
4. **Liste de questions probables du jury** avec réponses préparées — en priorité sur les deux points
   sensibles du §5.
5. **Report dans le PPTX** une fois le texte validé.

## 8. Ce qu'il ne faut pas faire

- Parler du **Bloc 4** (déploiement, hébergement, DNS/TLS, supervision) : il est évalué séparément
  le 05/10 sur une application fournie par l'école. Hors sujet ici.
- Présenter les chantiers hors périmètre noté : Brain OS phases avancées, v2 « AI Delivery OS »,
  MCP, taskforce-motion, intégrations tierces. Ils ne rapportent aucun point et consomment du temps.
- Dépasser 20 minutes. La gestion du temps est un critère noté, et le dépassement se fait au
  détriment des questions, là où le jury confirme la maîtrise.
