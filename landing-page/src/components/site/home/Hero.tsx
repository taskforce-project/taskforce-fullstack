import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { APP_URL } from "@/components/site/nav";
import { BrandLogo } from "../BrandLogo";

/**
 * Preuve sociale HONNÊTE (review 6) : « Works with », pas « customers ». On n'a pas de clients à
 * montrer, on montre l'écosystème sur lequel on se branche. Vrais logos.
 *
 * Set VOLONTAIREMENT transverse (un par catégorie, choix CEO du 14/09) : repo, tracker, chat, docs,
 * design, cloud, observabilité, modèles. Rendu logo + NOM (24/09) : des pictos seuls, gris et à 60 %,
 * se lisaient comme une rangée de points ; avec le nom, c'est un vrai mur de logos lisible.
 */
const BUILT_WITH = [
  { key: "github", label: "GitHub" },
  { key: "linear", label: "Linear" },
  { key: "slack", label: "Slack" },
  { key: "notion", label: "Notion" },
  { key: "figma", label: "Figma" },
  { key: "aws", label: "AWS" },
  { key: "datadog", label: "Datadog" },
  { key: "anthropic", label: "Claude" },
];

/**
 * Hero - disposition SCINDÉE (façon Relevance, 24/09) : le titre à gauche, la promesse et les deux
 * actions à droite, calées sur la ligne de base du titre. En dessous, `children` reçoit l'île
 * `HeroRuns` (onglets par rôle + table de runs vivante) qui remplace l'ancienne capture statique.
 *
 * Le texte reste rendu serveur, sans JS : le H1 est l'élément LCP et n'attend rien. L'île est rendue
 * côté serveur dans un état figé lisible, puis s'hydrate en `client:idle`.
 */
export function Hero({ children }: { children?: ReactNode }) {
  return (
    <section className="bg-card relative border-b">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[420px]"
        style={{
          background:
            "linear-gradient(to bottom, transparent, color-mix(in oklab, var(--secondary) 70%, transparent))",
        }}
      />

      <div className="container-rail relative pt-16 pb-12 lg:pt-24 lg:pb-14">
        {/* Scission à partir de xl seulement : à 1024 la colonne du titre tombe sous 500 px et
            « Describe the outcome. » cassait. En dessous, titre pleine largeur sur 2 lignes. */}
        <div className="grid items-end gap-7 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] xl:gap-14">
          <div>
            <p className="text-primary mb-4 text-[14px] font-medium tracking-[-0.01em]">
              The governed layer above your coding agents
            </p>
            {/* Coupes maîtrisées : en disposition scindée (xl+), la colonne ne tient pas
                « TaskForce runs the delivery. » sur une ligne et laissait « delivery. » seul. */}
            <h1 className="t-h1 text-balance">
              Describe the outcome.
              <br className="hidden sm:block" /> TaskForce runs
              <br className="hidden xl:block" /> the delivery.
            </h1>
          </div>
          <div className="xl:pb-1">
            <p className="t-lead max-w-xl text-pretty">
              Claude Code, Cursor or Copilot writes the code. TaskForce turns the outcome into the spec,
              the plan and the prompt it runs. A human approves every step, and the reasons are
              remembered.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button asChild size="pill-lg">
                <a href={`${APP_URL}/auth/register`}>Run your first workflow</a>
              </Button>
              <Button asChild variant="outline" size="pill-lg">
                <a href="/book-a-demo">Book a demo</a>
              </Button>
            </div>
          </div>
        </div>

        {/* L'île : onglets par rôle + table de runs vivante (pattern Relevance). */}
        <div className="relative mt-12 lg:mt-14">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-8 bottom-0 [background:radial-gradient(110%_80%_at_50%_0%,color-mix(in_oklab,var(--primary)_8%,transparent),transparent_65%)]"
          />
          <div className="relative">{children}</div>
        </div>

        {/* Mur de logos : logo + nom, lisible. Le mot « tools » ouvre le catalogue complet. */}
        <div className="mt-12 flex flex-col gap-5 lg:flex-row lg:items-center lg:gap-10">
          <p className="text-muted-foreground shrink-0 text-[13px]">
            Works with the{" "}
            <a href="/product/integrations" className="link-underline text-foreground font-medium">
              tools
            </a>{" "}
            your engineers already trust
          </p>
          <ul className="flex flex-wrap items-center gap-x-7 gap-y-3">
            {BUILT_WITH.map((b) => (
              <li
                key={b.key}
                className="text-foreground/70 hover:text-foreground flex items-center gap-2 text-[14px] font-medium transition-colors"
              >
                <BrandLogo brand={b.key} label="" loading="eager" className="h-[18px] w-auto" />
                {b.label}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
