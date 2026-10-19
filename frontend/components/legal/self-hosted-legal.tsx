import Link from "next/link"
import { ArrowLeft } from "lucide-react"

/** Instance auto-hébergée (build `NEXT_PUBLIC_SELF_HOSTED=true`, posé par le docker-compose.yml de la racine). */
export function isSelfHosted(): boolean {
  return process.env.NEXT_PUBLIC_SELF_HOSTED === "true"
}

const SOURCE_URL = "https://github.com/taskforce-project/taskforce-fullstack"

/**
 * Pages légales d'une instance auto-hébergée. Celles du service hébergé nomment son éditeur : une autre personne
 * qui fait tourner TaskForce chez elle n'est ni cet éditeur ni couverte par ses conditions. Ici, l'administrateur de
 * l'instance répond de ses données ; le projet ne publie que le logiciel.
 */
export function SelfHostedLegal({ kind }: Readonly<{ kind: "legal" | "privacy" }>) {
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
          <p>
            This TaskForce instance is run by its own administrator, not by the TaskForce project. For any question
            about this instance, its rules of use or your account, contact its administrator.
          </p>

          {kind === "legal" ? (
            <p>
              TaskForce is open-source software released under the{" "}
              <a href={`${SOURCE_URL}/blob/main/LICENSE`} className="text-foreground underline underline-offset-2">
                AGPL-3.0 license
              </a>
              . The project publishes the software only: it does not operate this instance and does not receive its
              data. The source code is available at{" "}
              <a href={SOURCE_URL} className="text-foreground underline underline-offset-2">
                {SOURCE_URL.replace("https://", "")}
              </a>
              .
            </p>
          ) : (
            <>
              <p>
                Your data stays on this instance, stored by its administrator, who is responsible for it. Ask them to
                access, correct or delete your data; you can also export your data and delete your account yourself in
                Settings, Privacy &amp; Data.
              </p>
              <p>
                The browser keeps what you need to stay signed in and your interface preferences. TaskForce sends
                nothing to the TaskForce project. If the administrator connects an AI service run by a third party,
                what you send to the AI features goes to that service; with a model run by the administrator
                (Ollama), it stays on their machines.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
