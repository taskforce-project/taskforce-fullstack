# TaskForce docs (Fern)

The guides and the API reference published on <https://docs.taskforce-project.fr>, built and hosted by
[Fern](https://buildwithfern.com). Nothing runs on TaskForce's servers: a DNS record points the subdomain to Fern.

```
fern/
  fern.config.json      organization and Fern CLI version
  docs.yml              site: navigation, tabs, colors, logo, domain, redirects
  generators.yml        the OpenAPI description behind the API reference
  pages/                guides (Markdown with Fern components)
  assets/               logo, favicon and screenshots
  openapi/openapi.json  the API description, generated from the backend
  scripts/              generation and cleaning of that description
```

## Check and publish

From the repository root:

```bash
npx fern-api check                          # 0 errors expected
npx fern-api generate --docs --no-prompt    # publishes the site
```

Publishing needs a Fern login (`npx fern-api login`) or a `FERN_TOKEN`. The `Docs (Fern)` workflow publishes on
every push to `main` that touches `fern/`, when the repository has a `FERN_TOKEN` secret; without it, the workflow
succeeds without publishing.

## Refresh the API reference

springdoc serves the description at `/api-docs` on a development backend (it is off in production). With the
development stack running:

```bash
./fern/scripts/generate-openapi.sh          # Windows: .\fern\scripts\generate-openapi.ps1
```

The script fetches the description, then `scripts/clean-openapi.mjs` removes the monitoring and internal endpoints,
names and orders the sections, and describes them. It also replaces the address of the backend it read with the ones
the reference shows: the hosted API, `https://api.taskforce-project.fr`, then a self-hosted instance with the default
settings. Commit `openapi/openapi.json` with the change that altered the API.
