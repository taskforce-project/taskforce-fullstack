# AGENTS.md

Instructions for coding assistants (Claude Code, GitHub Copilot, Cursor, Codex and others) working in this
repository. People start with [CONTRIBUTING.md](./CONTRIBUTING.md), which covers the setup; this file adds what an
assistant needs to change the code without breaking it.

## The repository

| Folder | What it is |
| --- | --- |
| `backend/tf-api` | API: Java 21, Spring Boot 4, PostgreSQL 18 with pgvector, Flyway |
| `frontend` | App: Next.js 16, React 19, TypeScript, Tailwind CSS, Zustand |
| `ai-service` | AI gateway: Python, FastAPI, talks to Ollama or any OpenAI-compatible API |
| `taskforce-runner` | Local runner (Node.js) that lets Claude Code work on delegated issues |
| `taskforce-plugin` | Claude Code plugin (`/taskforce`) |
| `keycloak/realms` | Sign-in realms: `dev`, `selfhost` and `prod` |
| `landing-page` | Public website (Astro) |
| `marketing` | Emails to TaskForce users (HTML for Brevo) and the scripts that make their visuals |
| `fern` | API reference published on docs.taskforce-project.fr |
| `.ai` | Maintainers' working notes, in French |

## Rules the code relies on

Breaking one of these breaks the app at runtime, often without a compile error.

1. Every backend controller declares its full path in `@RequestMapping`, starting with `/api`: no servlet context
   path is configured.
2. Backend layers only depend downwards: `shared` <- `core` <- `modules`.
3. Controllers validate their DTOs with `@Valid`, return `ResponseEntity<ApiResponse<T>>` and delegate to a service.
   Services check access: workspace or project membership first, then the role.
4. A database change is a new Flyway migration, `V{n}__description.sql` in `src/main/resources/db/migration`. An
   applied migration is never edited; Hibernate only validates the schema.
5. Development configuration goes in `application-dev.yml`, not `application.yml`.
6. Frontend API paths are declared in `frontend/lib/config/api-routes.ts` and called through a service in
   `frontend/lib/api/`, with the named export `apiClient` from `@/lib/api/client`. The payload is in
   `response.data.data` (the `ApiResponse<T>` envelope).
7. Components read and change state through a Zustand store, one per domain, in `frontend/lib/store/`. Store actions
   report a failure by returning `null` or `false`, not by throwing: branch on the returned value.
8. TypeScript stays strict, without `any`. Interface text is in English, in `frontend/lib/constants_en.ts`.
9. Real-time updates go through `frontend/lib/hooks/use-stomp.ts`.
10. A date-time from the API is read with `parseServerDate()` (`frontend/lib/utils/server-date.ts`), never with
    `new Date()`: the API sends UTC without a time zone.
11. The app never shows mock data: demo data comes from the development seed (`backend/tf-api/seed`).
12. Secrets come from environment variables, never from the code.
13. Inside Docker, services reach each other by service name (`http://backend:8080`), not `localhost`.

## Checks

Run the checks of every part you changed before calling the work done. The CI runs the same ones.

| Part | Commands |
| --- | --- |
| Backend | `.\scripts\it.ps1 -Test ALL` (Windows), or `mvn verify` in `backend/tf-api` with a PostgreSQL at hand |
| Frontend | `npx tsc --noEmit`, `npm run lint` and `npx vitest run --coverage` in `frontend` |
| AI service | `pytest` in `ai-service` |
| Runner | `npm test` in `taskforce-runner` |
| Website | `npm run lint` and `npm run build` in `landing-page` |

- Coverage thresholds apply to each file, not to the total: a new file needs its own tests.
- `npm run test:coverage` starts Vitest in watch mode outside CI; `npx vitest run --coverage` runs once.
- Run one Maven build at a time: two builds in the same `target/` fail at random.
- The backend container runs a prebuilt JAR, so a Java change needs `.\scripts\docker.ps1 rebuild backend`. On
  Windows the frontend container may miss changes: `docker restart taskforce-frontend-dev`.

## Commits and pull requests

- Branch from `dev` and open pull requests against `dev`; `main` is what runs in production.
- One concern per commit, with a message in the form `type(scope): description` (`feat`, `fix`, `refactor`, `docs`,
  `test`, `chore`, `ci`, `perf`) and a body that says why.
- A pull request carries the release label of each part it changes: `backend:release:{major|minor|patch}`,
  `frontend:release:...` or `landing:release:...`. The CI refuses a pull request without one.
- Do not commit, push or open a pull request unless the person you work with asks for it.

## Never

- Add a servlet context path, an `any`, mock data or a hard-coded secret.
- Edit a Flyway migration that has been applied.
- Commit an `.env` file with real values.
- Write em dashes in interface text or docs: use a colon, a comma or two sentences.
