import { useState } from "react";
import { Menu, X, ChevronRight, FlaskConical } from "lucide-react";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from "@/components/ui/navigation-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  APP_URL,
  isLive,
  LABS_LINKS,
  MATURITY_LABEL,
  PRODUCT_DELIVERY,
  PRODUCT_PLATFORM,
  RESOURCES_LINKS,
  SOLUTIONS_GROUPS,
  type Maturity,
  type NavLink,
} from "./nav";
import { cn } from "@/lib/utils";

/**
 * SiteHeader — barre de navigation du site marketing.
 * 4 entrées + actions, méga-menus mixtes : cartes (Product / Resources)
 * et grilles de liens (Solutions), d'après relevanceai.com.
 * Composants : shadcn NavigationMenu / Button / Badge / Sheet — rien de réécrit à la main.
 * Accessibilité : clavier + Échap (Radix), focus visible, cibles >= 24px.
 */

const triggerCls =
  "h-9 rounded-full bg-transparent px-3 text-[14px] font-normal text-muted-foreground hover:bg-accent hover:text-foreground focus:bg-accent focus:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground";

/** Badge de maturité — variantes portées par le Badge shadcn. */
function LevelBadge({ level }: { level: Maturity }) {
  return (
    <Badge variant={level} className="px-1.5 py-px text-[10px] font-semibold tracking-wide uppercase">
      {MATURITY_LABEL[level]}
    </Badge>
  );
}

/** Marqueur « page pas encore construite » — grisé, non cliquable (décision user 30/07). */
function SoonTag() {
  return (
    <span className="text-muted-foreground/70 inline-flex items-center rounded border border-dashed px-1 py-px text-[9px] font-semibold tracking-wide uppercase">
      Soon
    </span>
  );
}

/** Carte de menu : icône + titre (+ badge) + description. Grisée si la page n'existe pas encore. */
function MenuCard({ item }: { item: NavLink }) {
  const Icon = item.icon;

  // Page non construite : carte inerte, grisée, avec « Soon » à la place du badge.
  if (!isLive(item.href)) {
    return (
      <div
        aria-disabled="true"
        className="!flex-row flex cursor-default items-start gap-3 rounded-xl p-3 opacity-55 select-none"
      >
        {Icon && (
          <span className="bg-card text-muted-foreground mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border">
            <Icon className="size-[18px]" strokeWidth={1.75} />
          </span>
        )}
        <span className="flex flex-col gap-0.5">
          <span className="flex items-center gap-2">
            <span className="text-[14px] font-medium text-foreground">{item.label}</span>
            <SoonTag />
          </span>
          {item.desc && (
            <span className="text-muted-foreground text-[12.5px] leading-[1.45]">{item.desc}</span>
          )}
        </span>
      </div>
    );
  }

  return (
    <NavigationMenuLink asChild>
      <a
        href={item.href}
        className="!flex-row group items-start gap-3 rounded-xl p-3 transition-colors hover:bg-accent focus:bg-accent"
      >
        {Icon && (
          <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg border bg-card text-foreground transition-colors group-hover:border-primary/30 group-hover:text-primary">
            <Icon className="size-[18px]" strokeWidth={1.75} />
          </span>
        )}
        <span className="flex flex-col gap-0.5">
          <span className="flex items-center gap-2">
            <span className="text-[14px] font-medium text-foreground">{item.label}</span>
            {item.badge && <LevelBadge level={item.badge} />}
          </span>
          {item.desc && (
            <span className="text-[12.5px] leading-[1.45] text-muted-foreground">{item.desc}</span>
          )}
        </span>
      </a>
    </NavigationMenuLink>
  );
}

function PanelFooter({ href, label }: { href: string; label: string }) {
  return (
    <div className="bg-secondary/60 border-t px-4 py-2.5">
      <NavigationMenuLink asChild>
        <a href={href} className={cn(buttonVariants({ variant: "ghost", size: "pill-sm" }), "!flex-row w-fit")}>
          {label}
          <ChevronRight className="size-3.5" />
        </a>
      </NavigationMenuLink>
    </div>
  );
}

export function SiteHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="bg-card/85 fixed inset-x-0 top-0 z-50 border-b backdrop-blur-md">
      <div className="container-site flex h-16 items-center justify-between gap-6">
        {/* Marque */}
        <a href="/" className="flex shrink-0 items-center gap-2.5" aria-label="TaskForce — home">
          <img src="/logo-taskforce.svg" alt="" aria-hidden className="h-8 w-auto" />
          <span className="font-display text-[17px] font-semibold tracking-[-0.02em] text-foreground">
            TaskForce
          </span>
        </a>

        {/* Navigation principale */}
        <NavigationMenu className="site-nav hidden min-[900px]:flex" aria-label="Main">
          <NavigationMenuList className="gap-0.5">
            {/* ── Product ── */}
            <NavigationMenuItem>
              <NavigationMenuTrigger className={triggerCls}>Product</NavigationMenuTrigger>
              <NavigationMenuContent className="!p-0">
                <div className="w-[720px] max-w-[calc(100vw-2rem)]">
                  <div className="grid grid-cols-2 gap-x-4 p-4">
                    <div>
                      <p className="text-muted-foreground px-3 pb-1 text-[11px] font-semibold tracking-[0.08em] uppercase">
                        Platform
                      </p>
                      {PRODUCT_PLATFORM.map((i) => (
                        <MenuCard key={i.href} item={i} />
                      ))}
                    </div>
                    <div>
                      <p className="text-muted-foreground px-3 pb-1 text-[11px] font-semibold tracking-[0.08em] uppercase">
                        Delivery
                      </p>
                      {PRODUCT_DELIVERY.map((i) => (
                        <MenuCard key={i.href} item={i} />
                      ))}
                    </div>
                  </div>
                  <PanelFooter href="/product" label="Explore the platform" />
                </div>
              </NavigationMenuContent>
            </NavigationMenuItem>

            {/* ── Solutions (pages pas encore construites → label grisé, non cliquable) ── */}
            <NavigationMenuItem>
              <span className="text-muted-foreground/45 flex h-9 cursor-default items-center gap-1.5 rounded-full px-3 text-[14px] font-normal select-none">
                Solutions
                <SoonTag />
              </span>
            </NavigationMenuItem>

            {/* ── Labs (idem : le workshop n'est pas encore une page) ── */}
            <NavigationMenuItem>
              <span className="text-muted-foreground/45 flex h-9 cursor-default items-center gap-1.5 rounded-full px-3 text-[14px] font-normal select-none">
                <FlaskConical
                  className="size-3.5 text-[color:var(--site-ai)]/50"
                  strokeWidth={1.75}
                  aria-hidden
                />
                Labs
                <SoonTag />
              </span>
            </NavigationMenuItem>

            {/* ── Resources ── */}
            <NavigationMenuItem>
              <NavigationMenuTrigger className={triggerCls}>Resources</NavigationMenuTrigger>
              <NavigationMenuContent className="!p-0">
                <div className="w-[640px] max-w-[calc(100vw-2rem)]">
                  <div className="grid grid-cols-2 gap-x-2 p-4">
                    {RESOURCES_LINKS.map((i) => (
                      <MenuCard key={i.href} item={i} />
                    ))}
                  </div>
                </div>
              </NavigationMenuContent>
            </NavigationMenuItem>

            {/* ── Enterprise ── */}
            <NavigationMenuItem>
              <NavigationMenuLink asChild>
                <a
                  href="/enterprise"
                  className="!flex-row hover:bg-accent h-9 items-center !rounded-full px-3 text-[14px] text-muted-foreground transition-colors hover:text-foreground"
                >
                  Enterprise
                </a>
              </NavigationMenuLink>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-2">
          <a
            href="/pricing"
            className="hover:bg-accent hidden h-9 items-center rounded-full px-3 text-[14px] text-muted-foreground transition-colors hover:text-foreground min-[900px]:inline-flex"
          >
            Pricing
          </a>
          <Button asChild variant="outline" size="pill-sm" className="hidden sm:inline-flex">
            <a href={`${APP_URL}/auth/login`}>Sign in</a>
          </Button>
          <Button asChild size="pill-sm">
            <a href={`${APP_URL}/auth/register`}>Get started</a>
          </Button>

          {/* Menu mobile */}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open menu" className="rounded-full min-[900px]:hidden">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              showClose={false}
              className="w-full gap-0 p-0 sm:max-w-sm"
            >
              <div className="flex h-16 items-center justify-between border-b px-6">
                <SheetTitle className="flex items-center gap-2.5">
                  <img src="/logo-taskforce.svg" alt="" aria-hidden className="h-7 w-auto" />
                  <span className="font-display text-[16px] font-semibold text-foreground">
                    TaskForce
                  </span>
                </SheetTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Close menu"
                  onClick={() => setOpen(false)}
                  className="rounded-full"
                >
                  <X className="size-5" />
                </Button>
              </div>

              <nav aria-label="Mobile" className="flex-1 overflow-y-auto px-6 py-6">
                <MobileGroup title="Product" items={[...PRODUCT_PLATFORM, ...PRODUCT_DELIVERY]} />
                {SOLUTIONS_GROUPS.map((g) => (
                  <MobileGroup key={g.title} title={g.title} items={g.links} />
                ))}
                <MobileGroup title="Labs" items={LABS_LINKS} />
                <MobileGroup title="Resources" items={RESOURCES_LINKS} />
                <MobileGroup
                  title="Company"
                  items={[
                    { label: "Pricing", href: "/pricing" },
                    { label: "Enterprise", href: "/enterprise" },
                    { label: "Book a demo", href: "/book-a-demo" },
                  ]}
                />
              </nav>

              <div className="flex gap-2 border-t px-6 py-4">
                <Button asChild variant="outline" size="pill" className="flex-1">
                  <a href={`${APP_URL}/auth/login`}>Sign in</a>
                </Button>
                <Button asChild size="pill" className="flex-1">
                  <a href={`${APP_URL}/auth/register`}>Get started</a>
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

function MobileGroup({ title, items }: { title: string; items: NavLink[] }) {
  return (
    <div className="mb-6">
      <p className="text-muted-foreground mb-1 text-[11px] font-semibold tracking-[0.08em] uppercase">
        {title}
      </p>
      <div className="flex flex-col items-start">
        {items.map((i) =>
          isLive(i.href) ? (
            <a
              key={i.href}
              href={i.href}
              className="flex items-center gap-2 py-2 text-[15px] text-muted-foreground hover:text-foreground"
            >
              {i.label}
              {i.badge && <LevelBadge level={i.badge} />}
            </a>
          ) : (
            <span
              key={i.href}
              aria-disabled="true"
              className="text-muted-foreground/45 flex cursor-default items-center gap-2 py-2 text-[15px] select-none"
            >
              {i.label}
              <SoonTag />
            </span>
          ),
        )}
      </div>
    </div>
  );
}
