# TaskForce on the Microsoft Store

The Microsoft Store version of the desktop app, next to the installer of the website. Microsoft signs the package when
it publishes it: neither SmartScreen nor Smart App Control stops it, which the unsigned installer cannot promise. The
installer of the website stays, with its own updates.

| File | What it is |
| --- | --- |
| `listing.en.md`, `listing.fr.md` | The Store listing, field by field, in English (from the package) and in French |
| `screenshots/` | Real captures of the desktop interface, 2880 x 1800 (the captures of the launch email) |

## The package

- **Identity** (Partner Center, Product identity): `TaskForceProject.TaskForceProject`, publisher
  `CN=FCE16416-99B3-4A3B-B8BD-9B0C3D4A1EB9`, publisher display name `TaskForce Project`, Store ID `9P2V1XQVPXKZ`. It
  is written in `desktop/electron-builder.yml` (`appx`).
- **Built by** the `Desktop - Release` workflow, Windows job: the `store-package` artifact of the run,
  `TaskForce-<version>-store.appx`. A push to the desktop branch builds it too, without publishing anything. Locally:
  `npm run dist:store` in `desktop`, with the resources assembled (see `desktop/README.md`).
- **Not signed**: the Store signs it. It is never published on GitHub, where nobody could install it.
- **In this version** the Store installs the updates (the app does not look for them), the data goes in the package's
  folder, which Windows deletes on uninstall, and the Settings say so (`desktop/README.md`).

## Partner Center, section by section

The product is reserved as "TaskForce" (MSIX or PWA app). Each section of the submission:

**Pricing and availability**
- Markets: all. Visibility: public audience, available and discoverable in the Store.
- Schedule: as soon as possible. Pricing: free, no trial.

**Properties**
- Category: Productivity.
- Privacy policy URL: `https://taskforce-project.fr/legal/privacy` (it covers the desktop app: local data, no
  telemetry, the account as the only data held).
- Website: `https://taskforce-project.fr`. Support contact info: `contact@taskforce-project.fr`.
- Product declarations: untick "Windows can include this app's data in automatic backups to OneDrive" (the local
  database is large and changes all the time). Leave the others unticked except installing on another drive.
- System requirements: memory 8 GB minimum (the website's figure), 16 GB recommended for a local AI model; 64-bit.

**Age ratings** (IARC questionnaire, answered by the publisher). The facts it asks about:
- No violence, sexual content, drugs, gambling or crude humor; no purchases; no location sharing.
- No exchange between users inside the app: one person per app, and the chat was removed from the product.
- Links open in the default browser; the app has no browser of its own.
- Generative AI: yes. The assistant writes text with the model the person picks (Ollama on the computer, or their own
  API key), and Claude Code, if installed, works on the tasks handed to it.

**Packages**
- Upload `TaskForce-<version>-store.appx`. Device family: Windows 10/11 Desktop only.

**Store listings**
- English (United States), from the package: `listing.en.md`.
- French (France), with "Add/remove languages": `listing.fr.md`.
- Screenshots: the four files of `screenshots/`, in order, with their captions.

**Submission options**
- Publishing: as soon as it passes certification, or by hand.
- Notes for certification, to adapt; the test account is created by the publisher for the review, and its password
  is written only in Partner Center, never here:

> TaskForce is a desktop app (Electron). It runs its own database (PostgreSQL), API (Java) and interface (Node.js)
> inside the package, on 127.0.0.1 only. Signing in needs a free TaskForce account: the app opens the sign-in page in
> the default browser, which then sends the reviewer back to the app on 127.0.0.1. Test account: <email> /
> <password>. The first start prepares the local database and takes a moment. runFullTrust: the app is a packaged
> Win32 desktop app that starts its bundled runtimes as child processes. Updates come from the Store; this version does
> not update itself.

## After certification

- The Store page: `https://apps.microsoft.com/detail/9P2V1XQVPXKZ`, or
  `ms-windows-store://pdp/?productid=9P2V1XQVPXKZ` to open it in the Store app.
- Each new desktop version: run `Desktop - Release`, take the `store-package` artifact of the run, start a new
  submission in Partner Center, replace the package and fill in "What's new in this version".
