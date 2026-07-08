import {
  Activity,
  BookText,
  Boxes,
  Brain,
  Code2,
  Github,
  History,
  PlayCircle,
  Server,
  Shield,
  Smartphone,
  Sparkles,
} from "lucide-react";

import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";

/**
 * SiteHeader — header marketing (light-only). Métriques relevées sur linear.app / attio.com :
 * nav fixe blur + hairline, CTA pill dense. Dropdowns = composant shadcn **NavigationMenu** (Radix,
 * réutilisé de l'app) → accessible par défaut (hover + clic + clavier + Escape). Îlot React (client:load).
 * Liens aussi dupliqués au Footer pour le SEO. Reste : menu mobile (hamburger).
 */

type NavLink = { title: string; desc?: string; href: string; icon?: typeof Boxes };

const PRODUCT: NavLink[] = [
  { title: "Orchestration", desc: "Run delivery from intent to ship", href: "/product/orchestration", icon: PlayCircle },
  { title: "Smart Assign", desc: "The right task, to the right person", href: "/product/smart-assign", icon: Sparkles },
  { title: "Brain OS", desc: "Docs that write themselves", href: "/product/brain-os", icon: Brain },
  { title: "Integrations", desc: "Orchestrate any agent & tool", href: "/integrations", icon: Boxes },
  { title: "Security", desc: "Enterprise-grade controls", href: "/security", icon: Shield },
  { title: "Mobile", desc: "Supervise from anywhere", href: "/mobile", icon: Smartphone },
];

const DEVELOPERS: NavLink[] = [
  { title: "Documentation", desc: "Guides & concepts", href: "/docs", icon: BookText },
  { title: "API reference", desc: "REST & webhooks", href: "/docs/api", icon: Code2 },
  { title: "Self-host", desc: "Run it yourself", href: "/self-host", icon: Server },
  { title: "Open source", desc: "Star us on GitHub", href: "/open-source", icon: Github },
  { title: "Changelog", desc: "What's new", href: "/changelog", icon: History },
  { title: "Status", desc: "Uptime & incidents", href: "/status", icon: Activity },
];

const COMPANY: NavLink[] = [
  { title: "About", href: "/about" },
  { title: "Customers", href: "/customers" },
  { title: "Blog", href: "/blog" },
  { title: "Contact", href: "/contact" },
];

const triggerCls =
  "bg-transparent text-muted-foreground hover:bg-secondary/60 hover:text-foreground focus:bg-secondary/60 data-[state=open]:bg-secondary/60 data-[state=open]:text-foreground";

function MenuLink({ item }: { item: NavLink }) {
  return (
    <li>
      <NavigationMenuLink asChild>
        <a
          href={item.href}
          className="flex flex-row items-start gap-3 rounded-lg p-2.5 hover:bg-secondary/70"
        >
          {item.icon ? (
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border border-black/[0.06] bg-secondary/50">
              <item.icon className="size-4 text-foreground" strokeWidth={1.75} />
            </span>
          ) : null}
          <span className="flex flex-col gap-0.5">
            <span className="text-sm font-medium text-foreground">{item.title}</span>
            {item.desc ? (
              <span className="text-[12px] leading-4 text-muted-foreground">{item.desc}</span>
            ) : null}
          </span>
        </a>
      </NavigationMenuLink>
    </li>
  );
}

export function SiteHeader() {
  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-black/[0.06] bg-white/75 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-6 px-6 lg:px-8">
        {/* Logo (vrai mark TaskForce) */}
        <a
          href="/"
          className="flex items-center gap-2.5 text-[17px] font-semibold tracking-tight text-foreground"
        >
          <img src="/logo-taskforce.svg" alt="" aria-hidden className="h-9 w-auto" />
          TaskForce
        </a>

        {/* Nav — shadcn NavigationMenu (Radix) */}
        <NavigationMenu viewport={false} className="hidden md:flex">
          <NavigationMenuList>
            <NavigationMenuItem>
              <NavigationMenuTrigger className={triggerCls}>Product</NavigationMenuTrigger>
              <NavigationMenuContent>
                <ul className="grid w-[520px] grid-cols-2 gap-0.5">
                  {PRODUCT.map((i) => (
                    <MenuLink key={i.title} item={i} />
                  ))}
                </ul>
              </NavigationMenuContent>
            </NavigationMenuItem>

            <NavigationMenuItem>
              <NavigationMenuTrigger className={triggerCls}>Developers</NavigationMenuTrigger>
              <NavigationMenuContent>
                <ul className="grid w-[520px] grid-cols-2 gap-0.5">
                  {DEVELOPERS.map((i) => (
                    <MenuLink key={i.title} item={i} />
                  ))}
                </ul>
              </NavigationMenuContent>
            </NavigationMenuItem>

            <NavigationMenuItem>
              <NavigationMenuTrigger className={triggerCls}>Company</NavigationMenuTrigger>
              <NavigationMenuContent>
                <ul className="grid w-56 gap-0.5">
                  {COMPANY.map((i) => (
                    <MenuLink key={i.title} item={i} />
                  ))}
                </ul>
              </NavigationMenuContent>
            </NavigationMenuItem>

            <NavigationMenuItem>
              <a
                href="/pricing"
                className="inline-flex h-9 w-max items-center rounded-md px-4 text-sm font-medium text-muted-foreground transition-colors hover:bg-secondary/60 hover:text-foreground"
              >
                Pricing
              </a>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>

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
