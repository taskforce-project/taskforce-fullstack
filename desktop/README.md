# TaskForce Desktop

The desktop app runs TaskForce for one person on their computer: projects, Brain OS, AI and coding agents, with the
data on the disk. It needs a free TaskForce account, used to sign in once; after that it also works offline.

This folder holds the Electron shell. The app itself is the rest of the repository, packed as resources:

| Resource | From | What runs |
| --- | --- | --- |
| `jre/` | a JDK 21 (`jlink`) | the Java of the backend |
| `backend/` | `backend/tf-api` | the API, with the Spring profile `desktop` |
| `postgres/` | the `desktop-postgres` workflow | PostgreSQL 18 with pgvector, one cluster per account; on Windows, the empty cluster and `pgcmd.exe` of the Store version |
| `frontend/` | `frontend`, built with `NEXT_PUBLIC_DESKTOP=true` | the interface, a Next standalone server |
| `runner/` | `taskforce-runner` | the runner that lets Claude Code work on delegated tasks |

## How it works

- **Sign-in.** The shell opens the web app's `/auth/desktop` page in the browser, where the person signs in or creates
  their account as on the web, then lets the app in. The app gets a one-time code back on 127.0.0.1 (PKCE), exchanges
  it for its own session and keeps it encrypted by the system keychain; no Keycloak page is shown.
- **Local stack.** At each start the shell starts the account's database, the backend and the interface, then a local
  proxy that gives the interface and the API one origin on 127.0.0.1. A launch token drawn at each start is the only
  way into the API; the window gets it through the preload bridge.
- **AI.** The shell serves the AI service protocol to the backend and relays it to Ollama on the computer or to an
  OpenAI-compatible API, chosen in Settings > AI. The API key stays in the keychain.
- **Claude Code.** The shell starts the runner with a secret drawn at each start. Claude Code must be installed and
  signed in on the computer.
- **Updates.** The app checks the `desktop-latest` release at start and every six hours, downloads in the background
  and installs on quit. The Microsoft Store version leaves its updates to the Store.

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

`TF_POSTGRES_BUNDLE` is the archive of the `desktop-postgres` workflow for your system. On Windows the same step
compiles `pgcmd.exe` with the C# compiler of .NET Framework, which every Windows has, and prepares the empty cluster of
the Store version. Variables read by a development build:

| Variable | Use |
| --- | --- |
| `TF_DESKTOP_WEB_URL` | web app whose sign-in page the app opens, for example `http://localhost:3000` |
| `TF_DESKTOP_API_URL` | API of that web app, for example `http://localhost:8080` |
| `TF_DESKTOP_USER_DATA` | settings and data folder, to keep test accounts apart from the installed app |
| `TF_DESKTOP_SIGNIN_IN_LOG=1` | writes the sign-in page to the log instead of opening the default browser |
| `TF_DESKTOP_RESOURCES` | resources folder, when not `desktop/resources` |

`npm test` runs the shell's tests. The logs are in the app's folder (`logs/desktop.log`) and in each account's folder
(`accounts/<id>/logs`: database, backend, interface, runner); Help > Open logs folder opens the first one.

## Package and release

`npm run dist:win` builds the Windows installer (per user, no administrator rights) and `npm run dist:linux` the .deb
and AppImage, in `release/`. `npm run icon` draws the app icon from the brand mark first, with the logos of the
Microsoft Store package (`build/appx`).

`npm run dist:store` builds the Microsoft Store package (`release/TaskForce-<version>-store.appx`), with the identity
that Partner Center reserved for TaskForce. It is not signed: Microsoft signs it when it publishes it, so neither
SmartScreen nor Smart App Control stops it. In this version:

- the Store installs the updates; the app does not look for them;
- the data goes in the package's folder, `%LOCALAPPDATA%\Packages\<package family>\LocalState`, which Windows deletes
  when the app is uninstalled; it stays separate from the data of the version from the website;
- the notifications keep the identity of the package;
- the database starts without `cmd.exe`. In a Store package, a program of the package may start another one only
  directly: through `cmd.exe`, a system program, Windows refuses ("Access is denied"). `initdb` and `pg_ctl start` go
  through `cmd.exe`, and so does the server when it checks its own version at start. So the build prepares an empty
  cluster (`postgres/empty-cluster`, copied for each account, the password set by `postgres --single`), the shell
  starts `postgres` itself, and `pgcmd.exe` (`scripts/pgcmd.cs`) stands in for `cmd.exe` for the database
  (`COMSPEC`). `pg_ctl` only stops the server or tells whether it runs, which starts no program;
- the interface writes nothing next to itself: the package's folder is read-only, so the desktop build serves the
  images as they are, with no cache on disk (`frontend/next.config.ts`).

A child process stays in the package as long as its program is in the package: the backend, the interface, the runner
and PostgreSQL can start each other. The person's tools (Claude Code, git, GitHub CLI) run outside it, like any program
of the computer.

Releases are built by the `Desktop - Release` workflow, run by hand once `package.json` carries the new version. It
publishes the versioned release `desktop-v<version>`, which the website's download page reads, and refreshes the
rolling release `desktop-latest`, which the installed apps check for updates. The builds are not signed yet: Windows
SmartScreen warns on the first launch. The same run keeps the Store package as its `store-package` artifact, to upload
in Partner Center (Packages); it is never published on GitHub.
