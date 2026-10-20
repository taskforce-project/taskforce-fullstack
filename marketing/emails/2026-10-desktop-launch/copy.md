# Copy: TaskForce Desktop launch email

The email is in French, the language of its recipients; an English version is built from the same template
(`src/strings/en.json`). The texts live in `src/strings/<lang>.json` and the plain text in `src/email.<lang>.txt`.

## Subject and preview text

| Subject (French) | Note |
| --- | --- |
| **TaskForce arrive sur votre ordinateur** | Recommended: says what changes, matches the headline |
| TaskForce passe sur votre ordinateur | Same idea, a touch more "change" |
| Votre travail TaskForce, maintenant sur votre ordinateur | Speaks to people with projects on the web app |

Preview text (already hidden at the top of the HTML): *Gratuit, open source, sur Windows. Votre travail vous suit en
un clic.* English: subject *TaskForce is moving to your desktop*, preview *Free, open source, on Windows. Your work
comes along in one click.*

## Concept

**"TaskForce arrive sur votre ordinateur."** A new step in the life of the product, told by the person who builds it to
the people who used it first: the same app, now on their own computer, free and open. The product carries the message
(real captures, a short animation), installing is three animated steps with help one email away, and the two paths,
bringing your work or starting fresh, are said without ambiguity.

## Variants

Change the text in `src/strings/fr.json` (and `src/email.fr.txt`), then `npm run build`.

**A. The web app closing date is set.** In `card1`, replace *"(date à venir, un mail vous préviendra)"* with:

> (le **[date]** ; ce jour-là, ses projets sont supprimés, votre compte reste)

Also set `WEB_APP_CLOSES` in `landing-page/src/pages/migrate.astro`, so the moving page shows the same date.

**B. The recipient never used TaskForce.** Replace `intro` with:

> TaskForce est une app gratuite et open source pour organiser votre travail, et elle tourne maintenant sur votre
> ordinateur. Même app que la version web, et votre travail reste chez vous.

and drop the "J'utilise déjà TaskForce" card, keeping "Je pars de zéro" at full width.

**C. The recipient uses Linux.** Replace the Windows section with the website's Linux steps:

> Debian, Ubuntu et dérivées : téléchargez le `.deb`, puis `sudo apt install ./TaskForce-1.2.1-amd64.deb` dans son
> dossier. Toute distribution : téléchargez l'AppImage, `chmod +x TaskForce-1.2.1-x86_64.AppImage`, puis ouvrez-la
> (`sudo apt install libfuse2` d'abord sur Ubuntu 22.04 et suivantes ; `libfuse2t64` sur 24.04).

and change the button to "Télécharger pour Linux". No Smart App Control note on Linux.

**D. The recipient uses a Mac.** There is no macOS version yet. Replace the primary button with a link to the website
and say:

> TaskForce Desktop tourne sur Windows et Linux aujourd'hui, et macOS arrive. D'ici là, la webapp continue de marcher,
> et un mail vous préviendra avant sa fermeture.

**E. Smart App Control blocked a recipient.** For a reply, or a follow-up:

> Smart App Control, activé d'office sur certains PC neufs sous Windows 11, ne lance que les apps signées, et TaskForce
> ne l'est pas encore : il n'y a donc pas de « Exécuter quand même ». À vous de choisir : le désactiver dans Sécurité
> Windows, Contrôle des applications et du navigateur, Paramètres de Smart App Control, et TaskForce s'installe et
> tourne ; ou attendre une version signée (une version Microsoft Store, signée par Microsoft, est prévue).

## Limits stated in the email

- The installer is not code-signed: Windows or an antivirus may stop it the first time; Pierre offers his help.
- One person per app; teammates, connections and AI settings are redone by hand.
- A copy, not a move: each import creates a new workspace and nothing is merged.
- Claude Code needs to be installed and signed in with the person's own account.
- No macOS version yet.
