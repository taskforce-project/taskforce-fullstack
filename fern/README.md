# TaskForce Docs (Fern)

Documentation TaskForce propulsée par [Fern](https://buildwithfern.com) : **doc produit** (guides) **et**
**référence API** (OpenAPI) au même endroit, brandé, destiné à **docs.taskforce-project.fr**.

> **Fern est un SaaS.** `fern generate --docs` *build* la doc et l'*héberge sur le cloud Fern*
> (`taskforce.docs.buildwithfern.com`). Elle **ne tourne sur aucune VM** : côté TaskForce, la seule chose
> à faire est un enregistrement DNS (CNAME) qui pointe le sous-domaine vers Fern. Zéro charge sur VM1/VM2.

## Structure

```
fern/
  fern.config.json     # organisation + version du CLI Fern
  docs.yml             # config du site : nav, onglets, couleurs, logo, domaine
  generators.yml       # declare la spec OpenAPI utilisee par la reference API
  assets/              # logo + favicon (bleu #2563eb)
  openapi/openapi.json # spec API (placeholder ; a regenerer depuis le backend, cf. plus bas)
  pages/               # guides produit (Markdown)
  scripts/             # generation de la spec OpenAPI reelle
```

## 1. Publier la doc (« live »)

Le compte Fern est **gratuit**. À faire **une fois** sur ta machine (le `fern login` ouvre un navigateur —
impossible à automatiser côté agent/VM). Depuis la racine du repo :

```bash
npm install -g fern-api      # le CLI Fern
fern login                   # ouvre le navigateur, connecte TON compte Fern
fern check                   # valide la config
fern generate --docs         # build + heberge la doc sur le cloud Fern
```

La doc part sur `taskforce.docs.buildwithfern.com`.

## 2. Brancher le domaine (docs.taskforce-project.fr)

`docs.yml` déclare déjà `custom-domain: docs.taskforce-project.fr`. Pour l'activer :

1. Dans le **dashboard Fern** (Settings → Custom domain), ajoute `docs.taskforce-project.fr`.
   Fern affiche alors **la cible CNAME exacte** à créer.
2. Dans **Cloudflare** (DNS de `taskforce-project.fr`), ajoute un enregistrement :
   - Type : `CNAME`
   - Nom : `docs`
   - Cible : *(la valeur fournie par Fern)*
   - Proxy : **DNS only (nuage gris)** — pas de proxy orange, sinon Fern ne peut pas émettre le certificat TLS.
3. Attends la propagation + la validation Fern → `https://docs.taskforce-project.fr` est en ligne.

## 3. Publication automatique (CI, optionnel)

`.github/workflows/docs.yml` publie la doc à chaque push sur `main` touchant `fern/**` (et en manuel via
*Run workflow*). Il faut **un** secret :

- `Settings → Secrets and variables → Actions → New repository secret`
- Nom : `FERN_TOKEN` — valeur : un token Fern (`fern token` une fois connecté, ou depuis le dashboard).

Sans ce secret, le workflow se termine en succès sans rien publier (il ne peut donc pas casser la CI).

## 4. Générer la référence API RÉELLE

`openapi/openapi.json` est un **placeholder** (un seul endpoint d'exemple). La vraie spec est servie par le
backend via **springdoc** sur **`/api-docs`** (actif partout **sauf en prod**, où il est désactivé — audit F1).

> Pourquoi pas un test qui exporte la spec ? Les tests d'intégration sont des slices `@DataJpaTest`
> (profil `it`, **sans couche web ni springdoc**, volontairement sans clients externes). springdoc n'existe
> que lorsque l'application **complète** tourne — donc on génère la spec contre le backend en marche.

Backend démarré (`docker compose -f docker-compose.dev.yml up -d backend`), puis :

```bash
# Windows
.\fern\scripts\generate-openapi.ps1
# Linux / macOS
./fern/scripts/generate-openapi.sh
# cible par defaut http://localhost:8080 ; surchargeable : TF_API_URL=http://autre:port
```

Le script écrit la spec dans `openapi/openapi.json`. **Commit** → la CI (ou `fern generate --docs`) publie
la référence API à jour.

## Personnalisation

- **Couleurs / logo** : `docs.yml` (`colors`, `logo`) + `assets/`.
- **Navigation / onglets** : `docs.yml` (`tabs`, `navigation`).
- **Contenu produit** : `pages/**` (Markdown, composants Fern `<Tip>`, `<Info>`, `<Note>`…).
