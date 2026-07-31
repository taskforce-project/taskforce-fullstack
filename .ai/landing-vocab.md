# Landing — vocabulaire canonique (source unique)

> Créé le 31/07 lors de la « passe de cohérence ». **Avant d'écrire une claim de gouvernance sur une page,
> vérifier ici.** Objectif : un langage propriétaire TaskForce identique partout (Orchestration, Agents,
> Approvals, Memory, Smart Assign, Analytics, Integrations, AI Transparency, Trust, Enterprise, home).

## Les 4 primitives

| Terme | Définition canonique | Source de vérité |
|---|---|---|
| **Checkpoint** | *A governed stage where an artifact is produced, reviewed and explicitly approved before the run continues.* | encart « What a checkpoint is » sur `product/orchestration.astro` |
| **Proposal / artifact** | L'IA **produit un artefact / une proposition** (spec, approche, découpage, action, reco). Elle ne « décide » pas. | AI Transparency (« a proposal, not a decision ») |
| **Approval** | La **transition conditionnelle** entre deux états : un humain approuve / édite / rejette l'artefact avant qu'il devienne le contexte suivant. | `product/approvals.astro` (« Approval is what a checkpoint is ») |
| **Decision** | Ce que fait **l'humain** (approuver/rejeter). Jamais « l'IA propose une décision ». | — |

## Signature (à garder quasi identique)

**« The AI proposes. A [named] human decides. »**
- Variantes acceptées selon le contexte : « …Your team decides » (orchestration), « …A human approves » (Approvals,
  car la page parle de l'action d'approbation). ❌ Jamais « a human **disposes** », ❌ jamais « AI proposes **a
  decision** ».

## Politique read / write / consequential (colle au code : `McpClient.readOnly`, défaut false)

- **Read** (lecture) → peut s'exécuter **automatiquement** si autorisé.
- **Write** (écriture externe) → devient une **pending action**, exécutée **seulement après approbation humaine**.
- **Consequential workflow step** → nécessite une **approbation humaine**.

Énoncé canonique posé sur **AI Transparency** (« The controls you keep ») + repris sur Integrations & Approvals.
Formulations OK : « Reads can run on their own; anything that writes… is proposed » · « Anything not explicitly
read-only is treated as a write ». ❌ Éviter « every action needs approval » (faux : les reads passent).

## Live vs Planned (LE point à ne jamais brouiller)

- **LIVE aujourd'hui** : l'humain approuve des **artefacts discrets** — une **spec** rédigée par l'IA (→ contexte
  Memory), une **action externe** (pending → validée), une **recommandation** Smart Assign.
- **PLANNED (roadmap orchestration = `labs`)** : le **run gouverné complet** intent-to-deploy où **chaque**
  checkpoint des 7 étapes est gaté et l'enchaînement est automatisé.
- Énoncé de référence (Approvals) : « Approval for specs, external actions and recommendations **is live today**.
  Full checkpoint-by-checkpoint governance across the entire delivery run **is on the orchestration roadmap**. »
- ⚠️ « human approval at every checkpoint » (Enterprise/Trust/home) = **doctrine**, cohérente avec la définition
  (l'approbation FAIT le checkpoint). Ce n'est PAS une claim que le run auto complet est livré → OK tel quel.

## Résultat de l'audit (31/07)

Vérifié sur tout `landing-page/src` : `proposes→decides`, `checkpoint`, read/write, proposal/artifact **déjà
cohérents**. Seules corrections : (1) Trust « AI proposes a decision » → « The AI proposes » ; (2) politique
read/write rendue **explicite** sur AI Transparency. Aucune page ne présente le run auto complet comme Live.
