# taskforce-runner

Runner **local** de délégation TaskForce (ADR-013). Il fait le pont entre le bouton « Claude Code » du menu
d'assignation et Claude Code installé sur ton poste.

```
TaskForce : issue -> Assignee -> Claude Code          run QUEUED
runner    : claim -> worktree git -> claude -p + MCP TaskForce (session déléguée)
          -> commits -> push + pull request -> résultat posté
TaskForce : run DONE (résumé + lien de la PR), issue en « In review by AI »
```

Le backend ne peut pas joindre un poste local : c'est le runner qui vient chercher le travail (modèle
« pull »). Il ne fusionne jamais rien. La décision reste humaine.

## Ce que l'agent a le droit de faire

| Où | Droits |
|---|---|
| Dépôt | Un **worktree isolé** sur une branche neuve `tf/<clé>-<titre>-r<run>`. Ton checkout et ta branche courante ne sont jamais touchés. |
| Poste | Mode `dontAsk` de Claude Code + liste fermée d'outils : lire, éditer, `git status/diff/log/add/commit/mv/rm`. Pas de shell libre, pas de réseau, pas de `git push`, pas de `gh`. |
| TaskForce | Par le MCP, **au nom de la personne qui a délégué**, avec ses droits pour plafond, resserrés à : le workspace du run en lecture, les issues du projet du run en écriture, jamais de suppression. |
| GitHub | Rien. C'est le **runner** qui pousse la branche et ouvre la PR, après l'agent. |

Le texte d'une issue ou d'une note est écrit par d'autres personnes. Le brief le présente à l'agent comme
une donnée de la tâche, jamais comme une instruction, et le périmètre ci-dessus borne ce qu'une
instruction glissée dans ce texte pourrait obtenir.

## Installation

Prérequis : Node 20+, `git`, `gh` connecté (`gh auth status`), le CLI Claude Code
(`npm install -g @anthropic-ai/claude-code`, puis `claude` une fois pour te connecter), le backend dev
démarré avec `delivery.local-runner.enabled=true` (défaut en dev).

```bash
cd taskforce-mcp && npm install && npm run build      # le serveur MCP que l'agent utilisera
cd ../taskforce-runner && npm install
```

1. **Identité machine** (Keycloak). Depuis la racine du monorepo, avec l'e-mail de TON compte TaskForce :

   ```powershell
   .\scripts\keycloak-runner.ps1 -Owner toi@exemple.fr -Name pierre
   ```

   Le script crée le client `tf-runner-pierre` (compte de service, `client_credentials` uniquement, rôle
   `delivery-runner`, propriétaire signé dans le jeton) et écrit `taskforce-runner/.env`. Le secret n'est
   jamais affiché. Le runner ne réclamera que les tâches déléguées **par ce compte**.

2. **Dépôts**. Copier `runner.config.example.json` en `runner.config.json` et y déclarer, pour chaque dépôt
   lié à un projet TaskForce (onglet repository du projet), son checkout local.

3. **Vérifier**, puis lancer :

   ```bash
   npm run check     # jeton, git, gh, claude, serveur MCP, dépôts : chaque maillon, sans rien réclamer
   npm run dev       # à l'écoute ; Ctrl+C sort après le run en cours
   npm run once      # traite au plus un run puis sort
   ```

## Configuration (`runner.config.json`)

| Clé | Défaut | Rôle |
|---|---|---|
| `repos["owner/name"]` | (aucun) | `path` (absolu), `baseBranch` (`main`), `setup` (commandes avant l'agent, chacune en tableau d'arguments, ex. `[["npm", "ci"]]` : un worktree neuf n'a pas de dépendances). |
| `pollSeconds` | 5 | Fréquence du claim. |
| `push` / `openPullRequest` | `true` / `true` | `push: false` : rien ne sort du poste, le travail reste sur une branche locale. |
| `keepWorktree` | `false` | Garder le worktree après un succès. Un run en échec le garde toujours (seule trace du travail). |
| `agent.auth` | `subscription` | Voir ci-dessous. |
| `agent.model` | `null` | `null` = le modèle choisi à la délégation. |
| `agent.maxTurns` / `agent.timeoutMinutes` | 60 / 45 | Bornes de l'agent. La durée est aussi plafonnée par la durée de vie du jeton de session. |
| `agent.attribution` | `false` | `false` = pas de « Co-Authored-By: Claude » dans les commits de l'agent. |
| `agent.extraAllowedTools` | `[]` | Outils en plus du socle, ex. `["Bash(npm test *)", "Bash(npm run lint *)"]`. |

## Abonnement ou clé API

Le choix appartient à la personne qui fait tourner le runner, le runner n'en retire aucun :

- `agent.auth: "subscription"` : Claude Code tourne avec **son** login claude.ai, sur **son** poste. La clé
  `ANTHROPIC_API_KEY` ambiante est alors retirée de l'environnement de l'agent, sinon Claude Code la
  préférerait et facturerait le compte API sans prévenir.
- `agent.auth: "api-key"` : `ANTHROPIC_API_KEY`, facturé à l'usage.

**Ce que disent les conditions d'Anthropic** (page « Legal and compliance » de Claude Code, relue le
20/09/2026 ; à relire avant toute mise sur le marché, je ne suis pas juriste) :

- Chaque personne peut se connecter au binaire Claude Code **non modifié** avec **son propre** abonnement, y
  compris quand une plateforme fait tourner Claude Code pour elle. C'est exactement ce que fait le runner :
  il lance le Claude Code de la personne, TaskForce ne voit jamais ses identifiants Claude.
- Un produit ne peut pas proposer le login claude.ai dans sa propre application, ni collecter, stocker ou
  relayer les identifiants ou les jetons Claude de ses utilisateurs, ni payer, revendre ou intermédier leur
  usage : chacun s'authentifie lui-même, et son usage lui est facturé.
- Le binaire ne doit pas être modifié, ni aucune de ses méthodes d'authentification retirée ou restreinte.
- Intégrer Claude Code à une offre suppose d'accepter les Commercial Terms d'Anthropic. On peut écrire en
  texte que le produit fait tourner Claude Code, pas en faire un nom de fonctionnalité ni utiliser le logo
  sans permission.
- Les limites des abonnements supposent un usage ordinaire et individuel. Anthropic peut faire respecter ces
  règles sans préavis, et renvoie vers son équipe commerciale pour valider un cas d'usage.

Le détail est dans l'ADR-013.

## Éprouver la chaîne sans consommer Claude

`test/fixtures/stub-agent` (`.cmd` sous Windows) se lance à la place de `claude` : il passe par le **vrai**
serveur MCP en session déléguée, lit et commente l'issue, vérifie que ce qui doit être refusé l'est, puis
laisse un commit. Il suffit de le désigner dans `agent.command`. Jamais en production.

```bash
npm test          # tests unitaires (nommage de branche, config, frontière d'outils, lecture du résultat)
```

## Révoquer un runner

Désactiver ou supprimer le client `tf-runner-<nom>` dans Keycloak : plus aucun jeton n'est émis.
`-RotateSecret` régénère le secret. Attention, la révocation n'est pas instantanée : un jeton déjà émis
reste valide jusqu'à son expiration (durée de vie des access tokens du realm, affichée par
`npm run check`) et peut encore réclamer un run délégué par le propriétaire. Pour couper tout de suite,
ne rien déléguer à Claude Code pendant ce délai, ou passer `delivery.local-runner.enabled` à `false`.
