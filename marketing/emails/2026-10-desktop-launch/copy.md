# Copy: TaskForce Desktop launch email

The full text is in `src/email.txt` (same words as the HTML). This file gives the subject lines and the variants.

## Subject and preview text

| Subject | Note |
| --- | --- |
| **TaskForce is moving to your desktop** | Recommended: says what changes, matches the headline |
| TaskForce, now on your desktop | Shorter |
| Your TaskForce work, now on your computer | Speaks to people with projects on the web app |

Preview text (already hidden at the top of the HTML): *Free and open source, for Windows. Bring your workspaces
along in one click.*

## Concept

**"TaskForce is moving to your desktop."** A new step in the life of the product, told by the person who builds it to
the people who used it first: the same app, now on their own computer, free and open. The product carries the
message (real captures, one animation), the steps are short, and the two paths, bringing your work or starting fresh,
are said without ambiguity.

## Variants

Swap the sentence in both `src/email.html` and `src/email.txt`, then `npm run build`.

**A. The web app closing date is set.** In "I already use TaskForce", replace
*"It is a copy: the web app keeps your work until it closes. The date is not set yet, and you will get an email
before."* with:

> It is a copy: the web app keeps your work until it closes on **[date]**. Copy what you want to keep before then:
> on that day, its projects are deleted. Your account stays.

Also set `WEB_APP_CLOSES` in `landing-page/src/pages/migrate.astro`, so the moving page shows the same date.

**B. The recipient never used TaskForce.** Replace the personal note's second paragraph with:

> TaskForce is a free, open source app to plan your work, and it now runs on your own computer. Same app as the web
> version, and your work stays with you.

and drop the "I already use TaskForce" card, keeping "I'm starting fresh" at full width.

**C. The recipient uses Linux.** Replace the Windows steps with the website's Linux steps:

> Debian, Ubuntu and derivatives: download the `.deb`, then `sudo apt install ./TaskForce-1.2.1-amd64.deb` in its
> folder. Any distribution: download the AppImage, `chmod +x TaskForce-1.2.1-x86_64.AppImage`, and open it
> (`sudo apt install libfuse2` first on Ubuntu 22.04 and later; `libfuse2t64` on 24.04).

and change the button to "Download for Linux". No Smart App Control note on Linux.

**D. The recipient uses a Mac.** There is no macOS version yet. Replace the primary button with a link to the
website and say:

> TaskForce Desktop runs on Windows and Linux today, and macOS is coming. Until then, the web app keeps working, and
> you will get an email before it closes.

**E. Smart App Control blocked a recipient.** For a reply, or a follow-up:

> Smart App Control, on by default on some new Windows 11 PCs, only runs signed apps, and TaskForce isn't signed yet,
> so there is no "Run anyway". The choice is yours: turn it off in Windows Security, App & browser control, Smart App
> Control settings, and TaskForce installs and runs; or wait for a signed version (a Microsoft Store version, signed by
> Microsoft, is planned).

**F. P.S. in French**, if the list is French-speaking (Pierre's own words):

> P.S. Ce mail fait aussi partie d'une série de tests 😁 Si vous rencontrez des problèmes avec l'application et que
> vous souhaitez réellement l'utiliser, la partager ou la promouvoir, n'hésitez pas à me faire des retours : par mail,
> par message pour celles et ceux qui ont ce qu'il faut (et ouais, c'est pas gratos le numéro 😌), ou directement en
> ouvrant une issue sur le projet. Merci à mes petits bêta-testeurs 🚀

## Limits stated in the email

- The installer is not code-signed: Windows or an antivirus may stop it the first time.
- One person per app, no sync between computers; teammates, connections and AI settings are redone by hand.
- A copy, not a move: each import creates a new workspace and nothing is merged.
- Claude Code needs to be installed and signed in with the person's own account.
- No macOS version yet.
