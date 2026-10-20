# TaskForce Desktop launch email (October 2026)

The email that tells the first TaskForce users that TaskForce is now a desktop app, and gets them to install it on
Windows. Sent through Brevo, about eight recipients chosen by hand. The recipient list never goes in this repository.

| File | What it is |
| --- | --- |
| `src/email.html` | Source of the email, hand-written HTML for email clients (tables, inline styles, Outlook buttons) |
| `src/email.txt` | Plain text version, written by hand |
| `dist/email.html` | Ready for Brevo, with the animated demo |
| `dist/email-static.html` | Same email without animation (still image instead of the GIF) |
| `dist/email.txt` | Plain text, for clients without HTML or an individual send |
| `dist/preview/` | Local preview: images read from the repository, Brevo tags replaced by sample values |
| `captures/` | Real captures of the desktop interface used in the visuals |
| `copy.md` | Subject lines, full copy and text variants |
| `storyboard.md` | Storyboard of a 20 to 25 second launch video (not made yet) |
| `scripts/` | Capture, composition, build, preview and link check |

The images are served by the website: `landing-page/public/email/2026-10-desktop-launch/`, online at
`https://taskforce-project.fr/email/2026-10-desktop-launch/`. They must be online before sending.

## 1. Audit: what the email may say

Every claim of the email comes from the code or the website, as of 20 October 2026.

| Fact | Source |
| --- | --- |
| Windows installer `TaskForce-Setup-1.2.1.exe`, 271 MB, per user, no administrator rights, opens TaskForce when done | GitHub release `desktop-v1.2.1`, `desktop/electron-builder.yml` (`nsis.oneClick`, `perMachine: false`), download page |
| Windows 10 and 11, 64-bit; Linux `.deb` and AppImage; macOS not available ("coming soon") | `landing-page/src/pages/download.astro` (`NEEDS`), releases |
| Updates download by themselves and install on restart ("Restart now") or when quitting | `desktop/src/updater.ts`, checked on a real PC from 1.1.0 to 1.2.0 |
| Installer not code-signed; SmartScreen, Smart App Control and antivirus messages, VirusTotal report per file | download page, `DownloadNotice.astro`, release notes of `desktop-v1.2.1` |
| Sign-in in the browser with the same account (email, Google, GitHub) or a new free account | desktop spec D.4, `desktop/src/account.ts` |
| New account: three-step setup, then a first workspace | desktop spec D.7, `frontend/app/onboarding` |
| Existing users: Operations > From the web app > Copy everything copies each workspace with its Brain OS and projects (issues, comments, history, cycles, pages, attachments); it is a copy, each import creates a new workspace | `frontend/components/desktop/project-transfer.tsx`, `WorkspaceBundleService`, `/migrate` |
| Not copied: teammates, connections (GitHub, tools), AI settings, assistant conversations | `/migrate` (`MISSING`) |
| The web app will close; the date is not set; every account gets an email before; its projects are deleted when it closes | `/migrate` (lead and questions) |
| Whole workspace back to the web app: Settings > General > Copy to the web app, while the web app is open | settings page, `/migrate` |
| One person per app, no sync between computers | `/migrate` questions |
| Claude Code: picked as assignee ("Delegate to an agent"), works on the person's computer, pull request when the project has a GitHub repository, otherwise a comment; needs Claude Code installed and signed in; one-click connection in Settings > Agents | desktop spec D.5, `ClaudeCodeProvider`, download page (`NEEDS`) |
| Assistant on a local model (Ollama) or an OpenAI-compatible API key | Settings > AI, download page |
| Data on the computer, no telemetry, offline after the first sign-in | privacy policy |
| Open source, AGPL-3.0, repository `taskforce-project/taskforce-fullstack`, issue templates (bug, feature) | `LICENSE`, `.github/ISSUE_TEMPLATE/` |
| Contact `contact@taskforce-project.fr` (forwarded to Pierre) | `landing-page/src/lib/site.ts` |
| Brevo tags: `{{ contact.FIRSTNAME\|default:"there" }}`, `{{ mirror }}`, `{{ unsubscribe }}` | Brevo help center (template language, unsubscribe link) |

**What could block a recipient.** The unsigned installer: Smart App Control (on by default on some new Windows 11
PCs) blocks it with no way around but turning Smart App Control off, and some antivirus programs quarantine it. The
email says so plainly and sends to the install guide instead of telling people to click through. A version on the
Microsoft Store would remove these messages (planned separately).

**Creative decisions.**

- Same world as the website: museum paintings as backgrounds (download page and agents page), cobalt `#2f6bf6`
  pill buttons, warm greys, Geist, light theme only.
- The product carries the email: a real capture of the desktop dashboard in a frosted glass window for the hero, then
  three scenes at the real size of the interface so the text stays readable (a board, an issue handed to Claude Code,
  a Brain OS page). Glass and blur are baked into the images, since email clients render neither.
- One animation only, the demo GIF, whose first frame is a complete image (Outlook on Windows shows only that frame).
  Every piece of information is also in text.
- One primary action, "Download for Windows", at the top and at the end; it opens the download page, which offers the
  installer in one click and explains each Windows message. GitHub stays secondary.
- English, like the interface and the website. A personal note from Pierre and his P.S.

## 2. Visuals

| File (website) | Size | Made from |
| --- | --- | --- |
| `logo.png` | 342 x 63, shown at 114 x 21 | the website logo path (`Logo.astro`) and Geist |
| `hero.jpg` | 1280 x 800, shown at 640 x 400 | `captures/dashboard.webp` on the download page painting |
| `demo.gif` | 600 x 352, 8.3 s loop, about 700 KB | `captures/board.webp`, `delegate.webp`, `brain-note.webp` on the agents page painting |
| `demo-static.jpg` | 1200 x 704, shown at 600 x 352 | the Claude Code scene, for the version without animation |

Paintings: Smithsonian (download page) and Europeana (agents page), via Unsplash, credited in the footer, as on the
website (`landing-page/src/lib/backgrounds.ts`). Captures: the desktop build of the interface
(`NEXT_PUBLIC_DESKTOP=true`) on the development stack with its demo data (workspace `taskforce-demo`), 1440 x 900 at
2x, light theme, 20 October 2026.

## 3. Rebuild

```bash
npm install                 # playwright-core (drives Microsoft Edge) and the Geist font package
npm run build               # src/ -> dist/, with checks: tokens, dashes, Brevo tags, alt texts, size (Gmail clips over 102 KB)
node scripts/preview.mjs    # dist/preview/desktop.png, mobile.png, gmail.png (fallback fonts, as Gmail and Outlook show them)
npm run check               # every link and image answers (run once the website is deployed)
```

New captures need the development stack (`localhost:8080`, Keycloak `localhost:8180`, demo seed), the desktop build of
the interface in a second container on port 5173 (`NEXT_PUBLIC_DESKTOP=true`), the relay standing in for the desktop
shell, then the capture and the composition:

```bash
KC_USER=admin@taskforce.dev KC_PASS=... KC_SECRET=... node scripts/desktop-relay.cjs   # dev test values from the seed docs
node scripts/capture.mjs    # captures/*.webp
npm run compose             # website images, from the captures and the paintings
```

The Claude Code scene needs the demo account to have its local runner (Settings > Agents in the dev app), otherwise
the Assignee menu offers no agent.

## 4. Set before sending

| Setting | Value |
| --- | --- |
| Recipients | Chosen by Pierre, in a Brevo list; with a `FIRSTNAME` attribute for the greeting ("Hi there" without it) |
| Sender | Pierre, at an address on `taskforce-project.fr` (the domain is authenticated in Brevo: code, DKIM, DMARC) |
| Reply-to | `contact@taskforce-project.fr` |
| Subject and preview text | See `copy.md`; the preview text is also in the HTML |
| Images | Online at `https://taskforce-project.fr/email/2026-10-desktop-launch/` (`npm run check`) |
| Version-dependent text | `TaskForce-Setup-1.2.1.exe`, "about 270 MB" and the VirusTotal link: update them if a new desktop version ships before sending (`gh release view desktop-v<version>`) |
| Web app closing date | Not set: the email says so. Once set, use variant A in `copy.md` |
| Postal address | If Brevo asks for one in the footer, use the real one from the Brevo account; never invent it |

## 5. Send with Brevo

1. Campaigns, Email, create a campaign. Sender, reply-to, subject and preview text as above.
2. Design: choose the HTML code editor ("Paste your code"), paste the whole of `dist/email.html` (or
   `email-static.html`), save. Brevo replaces `{{ mirror }}` and `{{ unsubscribe }}` and keeps its own footer
   settings.
3. Settings: keep open and click tracking on; leave Google Analytics tagging off (the links already carry UTM labels).
4. Send a test to yourself, check it on Windows (Outlook or Gmail) and on a phone, against the list below.
5. Pick the list Pierre chose, then send or schedule.

**Individual send instead of Brevo.** Open `dist/email.html` in Edge or Chrome, select all, copy, paste into a new
Gmail message: most of the layout survives. Remove the "View in your browser" and "Unsubscribe" links, which only
work through Brevo, and replace `{{ contact.FIRSTNAME|default:"there" }}` by the first name. Or send `dist/email.txt`.

## 6. Checklist before sending

- [ ] `npm run build` passes, `npm run check` says every address answers.
- [ ] The test email shows the logo, the hero image and the animated demo (Gmail web, Gmail on Android or iPhone,
      Outlook on Windows: the demo stays on its first image, which is fine).
- [ ] Greeting with the first name; "there" when the attribute is empty.
- [ ] Both "Download for Windows" buttons open the download page, and its Windows button starts the right file.
- [ ] Install guide, VirusTotal report, moving page, GitHub links and the issue page open.
- [ ] "View in your browser" and "Unsubscribe" work in the test sent by Brevo.
- [ ] On a phone: one column, nothing cut, buttons easy to tap.
- [ ] The desktop version and file name in step 1 are still the latest release.
- [ ] Reply-to is `contact@taskforce-project.fr`; a reply reaches Pierre.
- [ ] Spam check: Brevo's preview score, or a test to a Gmail and an Outlook address.

## 7. Measure

The aim is installs and first use, not opens: Apple Mail loads images by itself, so opens mean little.

- **Clicks, per link** (Brevo report). Each link is distinct: `utm_content` = `hero-download`, `install-download`,
  `install-guide`, `migrate-guide`, `end-download`, `footer-site`; GitHub links differ by their address (`#readme`,
  repository, `issues/new/choose`, `?tab=readme-ov-file`, `issues`). The website has no analytics by design, so the
  UTM parameters only label the links in Brevo's report.
- **Downloads** (GitHub counts each file): note the counts before sending, then compare.

  ```bash
  gh api repos/taskforce-project/taskforce-fullstack/releases --paginate \
    --jq '.[] | select(.tag_name | startswith("desktop-v")) | .tag_name as $t | .assets[]
          | select(.name | test("\\.(exe|deb|AppImage)$")) | "\($t) \(.name) \(.download_count)"'
  ```

- **First use** (account server, aggregate, read-only): people who signed in to the desktop app since the send date.
  The app sends no usage data; signing in creates a desktop session, and that is all there is to count.

  ```sql
  SELECT count(DISTINCT user_id) FROM desktop_sessions WHERE created_at >= DATE '2026-10-21';
  ```

- **Feedback**: replies, issues opened on GitHub.

A click does not prove an install, and a session does not prove daily use: read the three together.

## 8. Video

No launch video exists yet. `storyboard.md` describes a 20 to 25 second one and the captures it needs. When it
exists, add a still with a play button that links to a page of the website playing it; never embed a player in the
email.
