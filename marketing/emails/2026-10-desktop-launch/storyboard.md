# Storyboard: TaskForce Desktop launch video (not made yet)

A 20 to 25 second silent video, readable without sound, captioned. For the website and social posts; the email would
only link to it, through a still with a play button. Same world as the email: museum paintings, frosted glass window,
real captures of the desktop interface, Geist, cobalt.

| Time | Shot | On screen | Caption |
| --- | --- | --- | --- |
| 0.0 to 3.0 s | Download page painting, slow push in | The logo appears, then the headline | TaskForce is moving to your desktop. |
| 3.0 to 7.0 s | The glass window rises from the bottom | Dashboard: "Pick up where you left off.", queue, recent work | Your work, on your own computer. |
| 7.0 to 11.5 s | Into the window: Operations, then Web Application | The board; a card moves from Todo to In Progress | Plan on a board. |
| 11.5 to 16.5 s | Issue sheet opens | Assignee, type "Claude", Delegate to an agent, Claude Code; then the run state on the issue | Hand an issue to Claude Code. |
| 16.5 to 20.0 s | Brain OS | The Web Application page, its links and relations | Keep what you learn. |
| 20.0 to 24.0 s | Window steps back over the painting | Button "Download for Windows", `taskforce-project.fr/download`, "Free and open source" | Free and open source. Windows and Linux. |

**Captures to produce** (desktop build of the interface, demo data, 1600 x 1000 at 2x, light theme): the dashboard;
the board, before and after moving a card; the issue sheet with the Assignee menu filtered on "Claude"; the same issue
once delegated, then with the agent's result; the Brain OS page. `scripts/capture.mjs` takes the static ones; the
interactions follow `design-assets/capture/film.mjs`, which already scripts the issue, Assignee and delegation states.

**Production.** Assemble in the Remotion project (`taskforce-motion`), export as an image sequence then encode with
ffmpeg (direct MP4 export is broken there), host on the website, and add a 1200 x 704 still with a visual play button
to the email, linking to that page. Keep the Anthropic logo out: Claude Code is named, never shown as a logo.
