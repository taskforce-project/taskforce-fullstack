# Contributing to TaskForce

Thanks for helping. TaskForce is licensed under the [AGPL-3.0](./LICENSE); by contributing you agree that your work
is released under it. Please follow the [code of conduct](./CODE_OF_CONDUCT.md), and report security problems
privately as described in [SECURITY.md](./SECURITY.md), never in a public issue.

## Where things are

| Folder | What it is |
| --- | --- |
| `backend/tf-api` | API: Spring Boot 4, Java 21, PostgreSQL with Flyway migrations |
| `frontend` | App: Next.js, TypeScript, Zustand stores |
| `ai-service` | AI gateway: FastAPI, talks to Ollama or any OpenAI-compatible API |
| `taskforce-runner` | Local runner that lets Claude Code work on delegated issues |
| `taskforce-plugin` | Claude Code plugin (`/taskforce`) |
| `keycloak` | Sign-in realms (development, self-hosting, hosted production) |
| `landing-page` | Public website (Astro) |

## Development setup

You need Docker Desktop (or Docker Engine with compose), Git and Node 20. The development stack runs everything in
containers, with demo data and test accounts.

Windows (PowerShell):

```powershell
.\tf.ps1 setup      # creates backend/tf-api/.env.dev from its example
.\tf.ps1 up         # starts the development stack
```

Linux and macOS:

```bash
cp backend/tf-api/.env.dev.example backend/tf-api/.env.dev
cp .env.example .env.dev
docker compose -f docker-compose.dev.yml --env-file backend/tf-api/.env.dev up -d
```

The app is then on <http://localhost:3000>, the API on <http://localhost:8080/api> and Keycloak on
<http://localhost:8180>. The test accounts are listed in [`backend/tf-api/seed/README.md`](./backend/tf-api/seed/README.md).

The frontend container does not reload on every change on Windows: restart it (`docker restart
taskforce-frontend-dev`). Backend changes need a rebuild of its image (`.\scripts\docker.ps1 rebuild backend`).

## Tests and checks

Run them before opening a pull request; the CI runs the same ones.

| Part | Command |
| --- | --- |
| Backend, full suite against a real PostgreSQL | `.\scripts\it.ps1 -Test ALL` (Windows), or `mvn verify` in `backend/tf-api` with a PostgreSQL at hand |
| Frontend tests with coverage thresholds | `npm run test:coverage` in `frontend` |
| Frontend types and lint | `npx tsc --noEmit` and `npm run lint` in `frontend` |
| AI service | `pytest` in `ai-service` |
| Runner | `npm test` in `taskforce-runner` |

New code comes with tests. Tests use real behaviour where they can (a real PostgreSQL for repositories and services,
recorded responses for external APIs); the app never ships mock data.

## Rules the code relies on

- Every backend controller path starts with `/api`.
- Layers only depend downwards: `shared` <- `core` <- `modules`.
- A database change is a new Flyway migration (`V{n}__description.sql`); an applied migration is never edited.
- Frontend routes are declared in `lib/config/api-routes.ts` and called through a service in `lib/api`, with the
  shared `apiClient`; components read state from a Zustand store, one per domain.
- TypeScript stays strict (no `any`). Interface text is in English.
- Secrets come from environment variables, never from the code.

## Commits and pull requests

- Branch from `dev` (`feature/...`, `fix/...`) and open the pull request against `dev`.
- One concern per commit, with a message in the form `type(scope): description` (`feat`, `fix`, `refactor`, `docs`,
  `test`, `chore`, `ci`, `perf`). The body says why, not only what.
- Label the pull request with the release level of each part it changes, for example `backend:release:minor` or
  `frontend:release:patch`.
- Keep pull requests focused: a fix and an unrelated refactor go in two pull requests.
