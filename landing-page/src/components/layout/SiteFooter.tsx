import { Github, Linkedin, Twitter } from "lucide-react";

/**
 * SiteFooter — footer marketing (light-only). Statique (rendu SSR, pas d'îlot) → tous les liens
 * sont dans le HTML → bon pour le SEO (couvre les liens des mega-menus du header).
 * Colonnes : Product · Developers · Company · Resources · Legal & Trust. Cf. Spec_Master §4.3.
 */

const COLUMNS: { title: string; links: { label: string; href: string }[] }[] = [
  {
    title: "Product",
    links: [
      { label: "Orchestration", href: "/product/orchestration" },
      { label: "Smart Assign", href: "/product/smart-assign" },
      { label: "Brain OS", href: "/product/brain-os" },
      { label: "Integrations", href: "/integrations" },
      { label: "Security", href: "/security" },
      { label: "Pricing", href: "/pricing" },
    ],
  },
  {
    title: "Developers",
    links: [
      { label: "Documentation", href: "/docs" },
      { label: "API reference", href: "/docs/api" },
      { label: "Self-host", href: "/self-host" },
      { label: "Open source", href: "/open-source" },
      { label: "Status", href: "/status" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About", href: "/about" },
      { label: "Customers", href: "/customers" },
      { label: "Blog", href: "/blog" },
      { label: "Changelog", href: "/changelog" },
      { label: "Contact", href: "/contact" },
    ],
  },
  {
    title: "Resources",
    links: [
      { label: "Roadmap", href: "/roadmap" },
      { label: "Enterprise", href: "/enterprise" },
      { label: "Mobile", href: "/mobile" },
      { label: "Sitemap", href: "/sitemap" },
    ],
  },
  {
    title: "Legal & Trust",
    links: [
      { label: "Trust center", href: "/trust" },
      { label: "Privacy", href: "/privacy-policy" },
      { label: "Terms", href: "/terms" },
      { label: "Cookies", href: "/cookies" },
      { label: "Legal notice", href: "/legal" },
      { label: "DPA", href: "/dpa" },
      { label: "Subprocessors", href: "/subprocessors" },
      { label: "Accessibility", href: "/accessibility" },
    ],
  },
];

const SOCIALS = [
  { label: "GitHub", href: "https://github.com/taskforce", icon: Github },
  { label: "X", href: "https://x.com/taskforce", icon: Twitter },
  { label: "LinkedIn", href: "https://linkedin.com/company/taskforce", icon: Linkedin },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-black/[0.08] bg-secondary/20">
      <div className="mx-auto max-w-[1200px] px-6 py-16 lg:px-8">
        <div className="grid grid-cols-2 gap-x-8 gap-y-10 md:grid-cols-3 lg:grid-cols-[1.4fr_repeat(5,1fr)]">
          {/* Brand */}
          <div className="col-span-2 md:col-span-3 lg:col-span-1">
            <a
              href="/"
              className="flex items-center gap-2.5 text-[17px] font-semibold tracking-tight text-foreground"
            >
              <img src="/logo-taskforce.svg" alt="" aria-hidden className="h-8 w-auto" />
              TaskForce
            </a>
            <p className="mt-4 max-w-[240px] text-[13px] leading-5 text-muted-foreground">
              The AI Delivery Operating System. Describe the outcome — TaskForce orchestrates the
              execution.
            </p>
            <div className="mt-5 flex items-center gap-1.5">
              {SOCIALS.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  aria-label={s.label}
                  className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  <s.icon className="size-4" strokeWidth={1.75} />
                </a>
              ))}
            </div>
          </div>

          {/* Link columns */}
          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h3 className="text-[13px] font-medium text-foreground">{col.title}</h3>
              <ul className="mt-3.5 space-y-2.5">
                {col.links.map((l) => (
                  <li key={l.label}>
                    <a
                      href={l.href}
                      className="text-[13px] text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* Bottom bar */}
        <div className="mt-14 flex flex-col items-start justify-between gap-4 border-t border-black/[0.06] pt-6 sm:flex-row sm:items-center">
          <p className="text-[12px] text-muted-foreground">
            © 2026 TaskForce. All rights reserved.
          </p>
          <div className="flex items-center gap-4 text-[12px] text-muted-foreground">
            <a href="/status" className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground">
              <span className="size-1.5 rounded-full bg-green-500" />
              All systems operational
            </a>
            <span className="text-muted-foreground/40">·</span>
            <span>English</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
