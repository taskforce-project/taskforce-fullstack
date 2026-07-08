import { useEffect, useRef, useState } from "react";
import {
  Activity,
  BookText,
  Boxes,
  Brain,
  ChevronDown,
  Code2,
  Github,
  History,
  PlayCircle,
  Shield,
  Smartphone,
  Sparkles,
  Server,
} from "lucide-react";

/**
 * SiteHeader — header marketing (light-only), métriques relevées sur linear.app / attio.com :
 * nav fixe blur + hairline, liens 14px/500, mega-menus Product/Developers/Company (dropdowns
 * accessibles : hover + clic + clavier + Escape + click-outside), CTA pill dense.
 * Îlot React (client:load). Les liens sont aussi dupliqués dans le Footer pour le SEO.
 */

type Link = { title: string; desc?: string; href: string; icon?: typeof Boxes };

const PRODUCT: Link[] = [
  { title: "Orchestration", desc: "Run delivery from intent to ship", href: "/product/orchestration", icon: PlayCircle },
  { title: "Smart Assign", desc: "The right task, to the right person", href: "/product/smart-assign", icon: Sparkles },
  { title: "Brain OS", desc: "Docs that write themselves", href: "/product/brain-os", icon: Brain },
  { title: "Integrations", desc: "Orchestrate any agent & tool", href: "/integrations", icon: Boxes },
  { title: "Security", desc: "Enterprise-grade controls", href: "/security", icon: Shield },
  { title: "Mobile", desc: "Supervise from anywhere", href: "/mobile", icon: Smartphone },
];

const DEVELOPERS: Link[] = [
  { title: "Documentation", desc: "Guides & concepts", href: "/docs", icon: BookText },
  { title: "API reference", desc: "REST & webhooks", href: "/docs/api", icon: Code2 },
  { title: "Self-host", desc: "Run it yourself", href: "/self-host", icon: Server },
  { title: "Open source", desc: "Star us on GitHub", href: "/open-source", icon: Github },
  { title: "Changelog", desc: "What's new", href: "/changelog", icon: History },
  { title: "Status", desc: "Uptime & incidents", href: "/status", icon: Activity },
];

const COMPANY: Link[] = [
  { title: "About", href: "/about" },
  { title: "Customers", href: "/customers" },
  { title: "Blog", href: "/blog" },
  { title: "Contact", href: "/contact" },
];

const MENUS = [
  { id: "product", label: "Product", items: PRODUCT, cols: 2 as const },
  { id: "developers", label: "Developers", items: DEVELOPERS, cols: 2 as const },
  { id: "company", label: "Company", items: COMPANY, cols: 1 as const },
];

export function SiteHeader() {
  const [open, setOpen] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(null);
    const onClick = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-black/[0.06] bg-white/75 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-8 px-6 lg:px-8">
        {/* Logo */}
        <a href="/" className="flex items-center gap-2 text-[15px] font-semibold tracking-tight text-foreground">
          <img src="/logo_taskforce_tp.png" alt="" aria-hidden className="size-6 object-contain" />
          TaskForce
        </a>

        {/* Nav (mega-menus) */}
        <nav ref={navRef} className="hidden items-center gap-1 md:flex" aria-label="Main">
          {MENUS.map((menu) => (
            <div
              key={menu.id}
              className="relative"
              onMouseEnter={() => setOpen(menu.id)}
              onMouseLeave={() => setOpen(null)}
            >
              <button
                type="button"
                aria-expanded={open === menu.id}
                aria-haspopup="true"
                onClick={() => setOpen((o) => (o === menu.id ? null : menu.id))}
                className={
                  "flex items-center gap-1 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors " +
                  (open === menu.id ? "text-foreground" : "text-muted-foreground hover:text-foreground")
                }
              >
                {menu.label}
                <ChevronDown
                  className={"size-3.5 transition-transform " + (open === menu.id ? "rotate-180" : "")}
                />
              </button>

              {open === menu.id && (
                <div
                  className={
                    "absolute left-0 top-[calc(100%+6px)] z-50 rounded-xl border border-black/[0.08] bg-white p-2 shadow-[0_16px_48px_-12px_rgba(0,0,0,0.2)] " +
                    "animate-in fade-in-0 slide-in-from-top-1 duration-150 " +
                    (menu.cols === 2 ? "grid w-[520px] grid-cols-2 gap-0.5" : "w-56")
                  }
                >
                  {menu.items.map((item) => (
                    <a
                      key={item.title}
                      href={item.href}
                      className="group flex items-start gap-3 rounded-lg p-2.5 transition-colors hover:bg-secondary/70"
                    >
                      {item.icon && (
                        <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-black/[0.06] bg-secondary/50 text-foreground">
                          <item.icon className="size-4" strokeWidth={1.75} />
                        </span>
                      )}
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-foreground">{item.title}</span>
                        {item.desc && (
                          <span className="mt-0.5 block text-[12px] leading-4 text-muted-foreground">
                            {item.desc}
                          </span>
                        )}
                      </span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}

          <a
            href="/pricing"
            className="rounded-md px-2.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Pricing
          </a>
        </nav>

        {/* Actions */}
        <div className="ml-auto flex items-center gap-1.5">
          <a
            href="http://localhost:3000/auth/login"
            className="hidden h-8 items-center rounded-full px-3 text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
          >
            Log in
          </a>
          <a
            href="http://localhost:3000/auth/register"
            className="inline-flex h-8 items-center rounded-full bg-foreground px-3.5 text-[13px] font-medium text-white shadow-[0_1px_1px_rgba(0,0,0,0.08),0_3px_2px_rgba(0,0,0,0.04)] transition-opacity hover:opacity-90"
          >
            Sign up
          </a>
        </div>
      </div>
    </header>
  );
}
