import { Github, Linkedin, Twitter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FOOTER_GROUPS, isLive } from "./nav";

/** Marqueur « page pas encore construite » — grisé, non cliquable (décision user 30/07). */
function SoonTag() {
  return (
    <span className="text-muted-foreground/60 inline-flex items-center rounded border border-dashed px-1 py-px text-[8.5px] font-semibold tracking-wide uppercase">
      Soon
    </span>
  );
}

/**
 * SiteFooter — pied de page 6 colonnes, statique (SSR, pas d'hydratation : c'est du SEO).
 * Les colonnes viennent de `nav.ts` : une seule source pour le header, le footer et le sitemap.
 * Liens : soulignage animé `.link-underline`, repris du breadcrumb de la webapp.
 */

const SOCIALS = [
  { label: "GitHub", href: "https://github.com/taskforce", icon: Github },
  { label: "LinkedIn", href: "https://www.linkedin.com/company/taskforce", icon: Linkedin },
  { label: "X", href: "https://x.com/taskforce", icon: Twitter },
];

export function SiteFooter() {
  return (
    <footer className="bg-secondary border-t">
      <div className="container-rail py-16">
        {/* Marque */}
        <div className="flex flex-col justify-between gap-6 border-b pb-10 sm:flex-row sm:items-end">
          <div className="max-w-md">
            <div className="flex items-center gap-2.5">
              <img src="/logo-taskforce.svg" alt="" aria-hidden className="h-8 w-auto" />
              <span className="font-display text-[17px] font-semibold tracking-[-0.02em] text-foreground">
                TaskForce
              </span>
            </div>
            <p className="text-muted-foreground mt-3 text-[14px] leading-6">
              The AI delivery operating system. Describe the outcome, keep a human in the loop, and
              ship.
            </p>
          </div>

          <ul className="flex items-center gap-1">
            {SOCIALS.map((s) => (
              <li key={s.label}>
                <Button asChild variant="outline" size="icon" className="text-muted-foreground rounded-full">
                  <a href={s.href} target="_blank" rel="noreferrer noopener" aria-label={s.label}>
                    <s.icon className="size-4" strokeWidth={1.75} />
                  </a>
                </Button>
              </li>
            ))}
          </ul>
        </div>

        {/* Colonnes */}
        <nav
          aria-label="Footer"
          className="grid grid-cols-2 gap-x-6 gap-y-10 pt-10 md:grid-cols-3 lg:grid-cols-6"
        >
          {FOOTER_GROUPS.map((g) => (
            <div key={g.title}>
              <h2 className="text-[13px] font-semibold text-foreground">{g.title}</h2>
              <ul className="mt-3 flex flex-col items-start gap-2">
                {g.links.map((l) =>
                  isLive(l.href) ? (
                    <li key={l.href}>
                      <a
                        href={l.href}
                        className="link-underline text-muted-foreground text-[13px] leading-5"
                      >
                        {l.label}
                      </a>
                    </li>
                  ) : (
                    <li key={l.href}>
                      <span
                        aria-disabled="true"
                        className="text-muted-foreground/45 flex cursor-default items-center gap-1.5 text-[13px] leading-5 select-none"
                      >
                        {l.label}
                        <SoonTag />
                      </span>
                    </li>
                  ),
                )}
              </ul>
            </div>
          ))}
        </nav>
      </div>

      {/* Barre basse */}
      <div className="border-t">
        <div className="container-rail text-muted-foreground flex flex-col items-start justify-between gap-3 py-5 text-[12.5px] sm:flex-row sm:items-center">
          <p>&copy; {new Date().getFullYear()} TaskForce. All rights reserved.</p>
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <li>
              {/* /status pas encore construite : indicateur en texte, non cliquable. */}
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="size-1.5 rounded-full bg-[color:var(--accent-green)]"
                  aria-hidden
                />
                All systems operational
              </span>
            </li>
            {/* « Hosted in the EU » : à rétablir une fois l'hébergeur tranché (Hetzner DE),
                pas avant — on n'affirme rien de non démontrable. */}
            <li>English</li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
