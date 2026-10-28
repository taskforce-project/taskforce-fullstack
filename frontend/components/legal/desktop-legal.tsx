import Link from "next/link"
import { ArrowLeft } from "lucide-react"

const SOURCE_URL = "https://github.com/taskforce-project/taskforce-fullstack"

/**
 * Pages légales de l'app desktop. Celles de la webapp parlent du stockage sur nos serveurs, de la mesure d'audience et
 * des cookies ; dans l'app, les projets restent sur l'ordinateur et seul le compte est en ligne (décision du
 * 28/10/2026, ménage de la v2).
 */
export function DesktopLegal({ kind }: Readonly<{ kind: "legal" | "privacy" }>) {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-6 py-12">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </Link>

        <h1 className="mb-8 text-3xl font-bold text-foreground">
          {kind === "legal" ? "Legal notices" : "Privacy"}
        </h1>

        <div className="space-y-6 text-sm leading-relaxed text-muted-foreground">
          {kind === "legal" ? (
            <>
              <p>
                TaskForce Desktop is published by Pierre Michel (individual publisher; sole-proprietor registration in
                progress), who is also the director of publication. For any legal inquiry, contact{" "}
                <a href="mailto:contact@taskforce-project.fr" className="text-foreground underline underline-offset-2">
                  contact@taskforce-project.fr
                </a>
                .
              </p>
              <p>
                TaskForce is open-source software released under the{" "}
                <a href={`${SOURCE_URL}/blob/main/LICENSE`} className="text-foreground underline underline-offset-2">
                  AGPL-3.0 license
                </a>
                , provided as is. The source code is available at{" "}
                <a href={SOURCE_URL} className="text-foreground underline underline-offset-2">
                  {SOURCE_URL.replace("https://", "")}
                </a>
                .
              </p>
              <p>
                The app runs on this computer and keeps your projects on it. Your TaskForce account is online: the terms
                of the TaskForce web service apply to the account itself.
              </p>
            </>
          ) : (
            <>
              <p>
                Your projects, issues, notes and files are stored on this computer, in the app&apos;s folder. They leave
                it only when you ask: when you copy a workspace to the web app, connect a tool, or delegate work to an
                agent.
              </p>
              <p>
                Your account is online. You sign in with it, and the app takes your name, email address and profile
                photo from it; the photo is downloaded once on this computer.
              </p>
              <p>
                By default, the AI features use Ollama on this computer. If you choose another provider in Settings, AI,
                what you send to the AI features goes to that provider. Claude Code works on this computer and sends its
                work to Anthropic under your own account; GitHub Copilot works in GitHub&apos;s cloud; GitHub features
                go through your GitHub command-line tool.
              </p>
              <p>
                The app checks GitHub for new versions. It sends no usage data. You can export your data in Settings,
                Privacy &amp; Data, and delete your account from your online account page (Settings, Account).
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
