# TaskForce Docs (Fern)

Documentation TaskForce propulsée par [Fern](https://buildwithfern.com) : **doc produit** (guides) **et**
**référence API** (OpenAPI) au même endroit, brandé, destiné à **docs.taskforce-project.fr**.

## Structure

```
fern/
  fern.config.json     # organisation + version du CLI Fern
  docs.yml             # config du site : nav, onglets, couleurs, logo, domaine
  assets/              # logo + favicon (bleu #2563eb)
  openapi/openapi.json # spec API (placeholder ; remplacée par la vraie en CI, cf. plus bas)
  pages/               # guides produit (Markdown)
```

## Publier la doc (« live »)

Le compte Fern est **gratuit**. Depuis la racine du repo :

```bash
npm install -g fern-api      # le CLI Fern
fern login                   # ouvre le navigateur, connecte ton compte
fern check                   # valide la config (à faire avant le 1er generate)
fern generate --docs         # build + héberge la doc
```

La doc part sur `taskforce.docs.buildwithfern.com`, puis sur **`docs.taskforce-project.fr`** une fois le
`custom-domain` (déjà déclaré dans `docs.yml`) validé côté Fern + un enregistrement DNS chez Cloudflare.

## Garder la référence API à jour (la VRAIE spec)

`openapi/openapi.json` est un **placeholder** (un seul endpoint d'exemple). La vraie spec est générée par
le backend (springdoc). En CI, avant `fern generate` :

```bash
# backend démarré (dev/CI), springdoc actif :
curl -s http://localhost:8080/v3/api-docs -o fern/openapi/openapi.json
fern generate --docs
```

(ou via `springdoc-openapi-maven-plugin` en phase `integration-test` pour l'écrire sans backend en ligne).

## Personnalisation

- **Couleurs / logo** : `docs.yml` (`colors`, `logo`) + `assets/`.
- **Navigation / onglets** : `docs.yml` (`tabs`, `navigation`).
- **Contenu produit** : `pages/**` (Markdown, composants Fern `<Tip>`, `<Info>`, `<Note>`…).
