# TaskForce Desktop

The desktop app runs TaskForce for one person on their computer: projects, Brain OS, AI and coding agents, with the
data on the disk. It needs a free TaskForce account, used to sign in once; after that it also works offline.

This folder holds the Electron shell. The app itself is the rest of the repository, packed as resources:

| Resource | From | What runs |
| --- | --- | --- |
| `jre/` | a JDK 21 (`jlink`) | the Java of the backend |
| `backend/` | `backend/tf-api` | the API, with the Spring profile `desktop` |
| `postgres/` | the `desktop-postgres` workflow | PostgreSQL 18 with pgvector, one cluster per account |
| `frontend/` | `frontend`, built with `NEXT_PUBLIC_DESKTOP=true` | the interface, a Next standalone server |
| `runner/` | `taskforce-runner` | the runner that lets Claude Code work on delegated tasks |

## How it works

- **Sign-in.** The shell signs in to the hosted account in the browser (authorization code with PKCE, back on
  127.0.0.1, client `taskforce-desktop`) and keeps an offline session encrypted by the system keychain.
- **Local stack.** At each start the shell starts the account's database, the backend and the interface, then a local
  proxy that gives the interface and the API one origin on 127.0.0.1. A launch token drawn at each start is the only
  way into the API; the window gets it through the preload bridge.
- **AI.** The shell serves the AI service protocol to the backend and relays it to Ollama on the computer or to an
  OpenAI-compatible API, chosen in Settings > AI. The API key stays in the keychain.
- **Claude Code.** The shell starts the runner with a secret drawn at each start. Claude Code must be installed and
  signed in on the computer.
- **Updates.** The app checks the `desktop-latest` release at start and every six hours, downloads in the background
  and installs on quit.

The full design is in the docs repository: `v1/03-architecture/Specification_App_Desktop.md`.

## Develop

Build the parts once, assemble the resources, then start the shell:

```bash
(cd ../backend/tf-api && ./mvnw -DskipTests package)
(cd ../frontend && npm ci && NEXT_PUBLIC_DESKTOP=true npx next build)
(cd ../taskforce-runner && npm ci && npm run build)
npm ci
JAVA_HOME=/path/to/jdk-21 TF_POSTGRES_BUNDLE=/path/to/postgres-bundle.zip npm run resources
npm start
```

`TF_POSTGRES_BUNDLE` is the archive of the `desktop-postgres` workflow for your system. Variables read by a
development build:

| Variable | Use |
| --- | --- |
| `TF_DESKTOP_ISSUER` | account service to sign in to, for example `http://localhost:8180/realms/taskforce-dev` |
| `TF_DESKTOP_USER_DATA` | settings and data folder, to keep test accounts apart from the installed app |
| `TF_DESKTOP_SIGNIN_IN_LOG=1` | writes the sign-in page to the log instead of opening the default browser |
| `TF_DESKTOP_RESOURCES` | resources folder, when not `desktop/resources` |

`npm test` runs the shell's tests. The logs are in the app's folder (`logs/desktop.log`) and in each account's folder
(`accounts/<id>/logs`: database, backend, interface, runner); Help > Open logs folder opens the first one.

## Package and release

`npm run dist:win` builds the Windows installer (per user, no administrator rights) and `npm run dist:linux` the .deb
and AppImage, in `release/`. `npm run icon` draws the app icon from the brand mark first.

Releases are built by the `Desktop - Release` workflow, run by hand once `package.json` carries the new version. It
publishes the versioned release `desktop-v<version>`, which the website's download page reads, and refreshes the
rolling release `desktop-latest`, which the installed apps check for updates. The builds are not signed yet: Windows
SmartScreen warns on the first launch.
