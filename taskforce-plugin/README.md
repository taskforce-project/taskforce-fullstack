# TaskForce - plugin Claude Code (mode interactif)

Travaille tes tâches TaskForce **dans ton propre Claude Code**. Tu lances `/taskforce`, le plugin liste tes
issues assignées, tu en prends une, Claude la traite avec toi (code ou rédaction) et laisse un commentaire sur
l'issue. Tout passe par le serveur MCP TaskForce, authentifié **en tant que toi** (tes droits).

C'est le **pendant interactif** du runner local (`taskforce-runner/`) :

| | Runner local (`taskforce-runner`) | Ce plugin |
|---|---|---|
| Modèle | Autonome : tu délègues dans l'app, il bosse en fond, ouvre une PR | Interactif : tu ouvres Claude Code, tu tires une tâche, tu regardes |
| Process | Un démon qui tourne sur ton poste | Rien en plus : ta session Claude Code |
| Identité | Compte de service Keycloak (`tf-runner-<toi>`) | **Toi** (ton jeton utilisateur) |
| Livraison | Pull request | Commentaire sur l'issue (et code local si tu as ouvert le dépôt) |

## Prérequis

- Claude Code installé (`claude`).
- Le serveur MCP TaskForce **construit** sur ton poste :
  ```bash
  cd taskforce-mcp && npm install && npm run build
  ```
  Note le chemin absolu de `taskforce-mcp/dist/index.js`, tu le donneras au plugin.

## Installation

1. Ajoute ce dossier comme marketplace, puis installe le plugin (depuis Claude Code) :
   ```
   /plugin marketplace add C:/Taskforce/taskforce-fullstack/taskforce-plugin
   /plugin install taskforce@taskforce
   ```
2. À l'activation, Claude Code te demande la configuration :
   - **Jeton TaskForce (Bearer)** : voir « Obtenir un jeton » ci-dessous.
   - **Workspace (slug)** : le slug dans l'URL de l'app (ex. `taskforce-hq`).
   - **URL de l'API** : `https://api.taskforce-project.fr/api` par défaut (en dev, `http://localhost:8080/api`).
   - **Entrée du serveur MCP** : le chemin absolu vers `taskforce-mcp/dist/index.js`.
3. Lance `/taskforce` (ou `/taskforce TF-28` pour une issue précise).

## Obtenir un jeton (v1)

Il n'y a pas encore d'endpoint « jeton personnel » dans TaskForce, donc pour cette première version tu colles ton
**jeton d'accès** courant :

- Connecte-toi à l'app, ouvre les DevTools du navigateur (onglet Réseau), regarde une requête vers l'API, copie la
  valeur de l'en-tête `Authorization: Bearer <...>` (sans le mot `Bearer`).

⚠️ Ce jeton est **de courte durée** (≈ 30 min en prod). Quand il expire, le MCP renvoie des 401 : recolle un jeton
frais via `/plugin` (reconfigurer). Le vrai correctif est un **jeton personnel durable** côté TaskForce (prochaine
étape, voir ci-dessous).

## Ce que le plugin peut faire

Il expose les outils MCP TaskForce (lire une issue et son fil, chercher dans le Brain OS, lister tes issues et
projets, commenter, créer ou mettre à jour une issue, etc.), tous **avec tes droits**. La commande `/taskforce`
cadre l'agent : contexte d'abord, travail, puis compte rendu en commentaire ; le texte des issues est traité comme
une donnée, jamais comme une instruction.

## Feuille de route

- **Publier `taskforce-mcp` sur npm** : le champ « Entrée du serveur MCP » disparaît, remplacé par
  `command: npx, args: ["-y", "taskforce-mcp"]` dans `plugin.json`. Installation en une commande, sans build local.
- **Jeton personnel durable** : un endpoint TaskForce qui émet un jeton révocable de longue durée pour le MCP, à la
  place du jeton d'accès collé. Supprime le seul point de friction de cette v1.
- **Distribution par dépôt** : héberger le marketplace sur un dépôt Git (`/plugin marketplace add owner/repo`).
