import { useState } from "react";
import { Menu, X, ChevronRight, ChevronDown, FlaskConical } from "lucide-react";
import { hueFor } from "@/lib/site-icons";
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
  MATURITY_LABEL,
  PRODUCT_DELIVERY,
  PRODUCT_PLATFORM,
  RESOURCES_LINKS,
  SOLUTIONS_GROUPS,
  type Maturity,
  type NavLink,
} from "./nav";
import { cn } from "@/lib/utils";
import { AnimatedNavIcon } from "./AnimatedNavIcon";

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
  const isLabs = item.href === "/labs";

  // Page non construite : carte inerte, grisée, avec « Soon » à la place du badge.
  if (!isLive(item.href)) {
    return (
      <div
        aria-disabled="true"
        className="!flex-row flex cursor-default items-start gap-3 rounded-xl p-3 opacity-55 select-none"
      >
        {Icon && (
          <span className="text-muted-foreground mt-0.5 flex size-9 shrink-0 items-center justify-center">
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
        className={cn(
          "!flex-row group relative items-start gap-3 overflow-hidden rounded-xl p-3 transition-shadow",
          isLabs ? "border hover:shadow-md" : "transition-colors hover:bg-accent focus:bg-accent",
        )}
      >
        {/* Labs : même fond que le hero (image + voile blanc dégradé pour la lisibilité). */}
        {isLabs && (
          <span aria-hidden className="pointer-events-none absolute inset-0">
            <img src="/labs/hero-wave.jpg" alt="" className="size-full object-cover object-center" />
            <span className="absolute inset-0 bg-gradient-to-r from-white/90 via-white/75 to-white/45"></span>
          </span>
        )}
        {Icon && (
          <span
            className={cn(
              "relative mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors",
              isLabs && "border bg-card/90",
            )}
          >
            <AnimatedNavIcon
              icon={Icon}
              size={18}
              strokeWidth={1.75}
              className={cn("size-[18px]", isLabs && "labs-ic-head")}
              style={isLabs ? undefined : { color: hueFor(Icon) }}
            />
          </span>
        )}
        <span className="relative flex flex-col gap-0.5">
          <span className="flex items-center gap-2">
            <span className="text-[14px] font-medium text-foreground">{item.label}</span>
            {item.badge && <LevelBadge level={item.badge} />}
          </span>
          {item.desc && (
            <span className={cn("text-[12.5px] leading-[1.45]", isLabs ? "text-foreground/75" : "text-muted-foreground")}>
              {item.desc}
            </span>
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
  const [section, setSection] = useState<string | null>(null);

  return (
    <header className="bg-card/85 fixed inset-x-0 top-0 z-50 border-b backdrop-blur-md">
      {/* Dégradé de la fiole Labs — déclaré ici pour être dispo sur TOUTES les pages (les defs Labs ne vivent que sur /labs). */}
      <svg aria-hidden focusable="false" width="0" height="0" style={{ position: "absolute", width: 0, height: 0 }}>
        <defs>
          <linearGradient id="lgLabsHead" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ff6f91" />
            <stop offset="100%" stopColor="#7db8ff" />
          </linearGradient>
        </defs>
      </svg>
      <div className="container-site flex h-16 items-center justify-between gap-6">
        {/* Marque */}
        <a href="/" className="flex shrink-0 items-center gap-2.5" aria-label="TaskForce — home">
          <img src="/logo-taskforce.svg" alt="" aria-hidden className="h-8 w-auto" />
          <span className="font-display text-[17px] font-semibold tracking-[-0.02em] text-foreground">
            TaskForce
          </span>
        </a>

        {/* Navigation principale */}
        <NavigationMenu className="site-nav hidden lg:flex" aria-label="Main">
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
              <NavigationMenuTrigger className={triggerCls}>Solutions</NavigationMenuTrigger>
              <NavigationMenuContent className="!p-0">
                <div className="w-[720px] max-w-[calc(100vw-2rem)]">
                  <div className="grid grid-cols-3 gap-x-4 p-5">
                    {SOLUTIONS_GROUPS.map((g) => (
                      <div key={g.title}>
                        <p className="text-muted-foreground px-2 pb-1.5 text-[11px] font-semibold tracking-[0.08em] uppercase">
                          {g.title}
                        </p>
                        <div className="flex flex-col">
                          {g.links.map((l) =>
                            isLive(l.href) ? (
                              <NavigationMenuLink key={l.href} asChild>
                                <a
                                  href={l.href}
                                  className="hover:bg-accent rounded-lg px-2 py-1.5 text-[13.5px] text-foreground transition-colors"
                                >
                                  {l.label}
                                </a>
                              </NavigationMenuLink>
                            ) : (
                              <span
                                key={l.href}
                                aria-disabled="true"
                                className="text-muted-foreground/45 flex items-center gap-2 px-2 py-1.5 text-[13.5px] select-none"
                              >
                                {l.label}
                                <SoonTag />
                              </span>
                            ),
                          )}
                          {g.viewAll && isLive(g.viewAll.href) && (
                            <NavigationMenuLink asChild>
                              <a
                                href={g.viewAll.href}
                                className="text-primary mt-1 px-2 py-1.5 text-[12.5px] font-medium"
                              >
                                {g.viewAll.label}
                              </a>
                            </NavigationMenuLink>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  <PanelFooter href="/solutions" label="All solutions" />
                </div>
              </NavigationMenuContent>
            </NavigationMenuItem>

            {/* ── Resources (contient Labs — fiole violette sur le trigger pour attirer l'œil) ── */}
            <NavigationMenuItem>
              <NavigationMenuTrigger className={cn(triggerCls, "gap-1.5")}>
                Resources
                <FlaskConical className="labs-ic-head size-3" strokeWidth={2} aria-hidden />
              </NavigationMenuTrigger>
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
            className="hover:bg-accent hidden h-9 items-center rounded-full px-3 text-[14px] text-muted-foreground transition-colors hover:text-foreground lg:inline-flex"
          >
            Pricing
          </a>
          <a
            href="/trust"
            className="hover:bg-accent hidden h-9 items-center rounded-full px-3 text-[14px] text-muted-foreground transition-colors hover:text-foreground lg:inline-flex"
          >
            Trust
          </a>
          <Button asChild variant="outline" size="pill-sm" className="hidden sm:inline-flex">
            <a href={`${APP_URL}/auth/login`}>Sign in</a>
          </Button>
          <Button asChild size="pill-sm">
            <a href={"/waitlist"}>Get started</a>
          </Button>

          {/* Menu mobile */}
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open menu" className="rounded-full lg:hidden">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" showClose={false} className="w-full gap-0 p-0">
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

              <nav aria-label="Mobile" className="flex-1 overflow-y-auto">
                <MobileAccordion
                  label="Product"
                  groups={[
                    { title: "Platform", items: PRODUCT_PLATFORM },
                    { title: "Delivery", items: PRODUCT_DELIVERY },
                  ]}
                  footer={{ label: "Explore the platform", href: "/product" }}
                  isOpen={section === "product"}
                  onToggle={() => setSection((s) => (s === "product" ? null : "product"))}
                  onNavigate={() => setOpen(false)}
                />
                <MobileAccordion
                  label="Solutions"
                  groups={SOLUTIONS_GROUPS.map((g) => ({ title: g.title, items: g.links, viewAll: g.viewAll }))}
                  footer={{ label: "All solutions", href: "/solutions" }}
                  isOpen={section === "solutions"}
                  onToggle={() => setSection((s) => (s === "solutions" ? null : "solutions"))}
                  onNavigate={() => setOpen(false)}
                />
                <MobileAccordion
                  label="Resources"
                  groups={[{ items: RESOURCES_LINKS }]}
                  isOpen={section === "resources"}
                  onToggle={() => setSection((s) => (s === "resources" ? null : "resources"))}
                  onNavigate={() => setOpen(false)}
                />
                <MobileLink label="Pricing" href="/pricing" onNavigate={() => setOpen(false)} />
                <MobileLink label="Enterprise" href="/enterprise" onNavigate={() => setOpen(false)} />
                <MobileLink label="Trust" href="/trust" onNavigate={() => setOpen(false)} />
                <MobileLink label="Book a demo" href="/book-a-demo" onNavigate={() => setOpen(false)} />
              </nav>

              <div className="flex gap-2 border-t px-6 py-4">
                <Button asChild variant="outline" size="pill" className="flex-1">
                  <a href={`${APP_URL}/auth/login`}>Sign in</a>
                </Button>
                <Button asChild size="pill" className="flex-1">
                  <a href={"/waitlist"}>Get started</a>
                </Button>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}

/** Un lien du menu mobile : icône colorée + label (+ badge/desc) si présents, sinon label seul. */
function MobileItem({ item, onNavigate }: { item: NavLink; onNavigate: () => void }) {
  if (!isLive(item.href)) {
    return (
      <span
        aria-disabled="true"
        className="text-muted-foreground/45 flex cursor-default items-center gap-2 p-2 text-[14.5px] select-none"
      >
        {item.label}
        <SoonTag />
      </span>
    );
  }
  return (
    <a
      href={item.href}
      onClick={onNavigate}
      className="hover:bg-accent flex items-start gap-3 rounded-lg p-2 transition-colors"
    >
      {item.icon && (
        <span className="flex size-8 shrink-0 items-center justify-center">
          <item.icon className="size-4" strokeWidth={1.75} style={{ color: hueFor(item.icon) }} />
        </span>
      )}
      <span className="flex min-w-0 flex-col">
        <span className="flex items-center gap-2">
          <span className="text-foreground text-[14.5px] font-medium">{item.label}</span>
          {item.badge && <LevelBadge level={item.badge} />}
        </span>
        {item.desc && (
          <span className="text-muted-foreground text-[12.5px] leading-[1.4]">{item.desc}</span>
        )}
      </span>
    </a>
  );
}

type MobileGroupData = { title?: string; items: NavLink[]; viewAll?: { label: string; href: string } | null };

/** Section repliable du menu mobile (façon Attio) — COPIE fidèle du méga-menu : groupes + titres +
 *  « view all » par groupe + lien de pied. Rien de retiré, juste ré-agencé en accordéon. */
function MobileAccordion({
  label,
  groups,
  footer,
  isOpen,
  onToggle,
  onNavigate,
}: {
  label: string;
  groups: MobileGroupData[];
  footer?: { label: string; href: string };
  isOpen: boolean;
  onToggle: () => void;
  onNavigate: () => void;
}) {
  return (
    <div className="border-b">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="text-foreground flex w-full items-center justify-between px-6 py-4 text-[17px] font-medium"
      >
        {label}
        <ChevronDown
          className={cn("text-muted-foreground size-5 transition-transform", isOpen && "rotate-180")}
          aria-hidden
        />
      </button>
      {isOpen && (
        <div className="px-4 pb-4">
          {groups.map((g, gi) => (
            <div key={g.title ?? gi} className={cn(gi > 0 && "mt-3")}>
              {g.title && (
                <p className="text-muted-foreground px-2 pt-1 pb-1 text-[11px] font-semibold tracking-[0.08em] uppercase">
                  {g.title}
                </p>
              )}
              <div className="flex flex-col gap-0.5">
                {g.items.map((i) => (
                  <MobileItem key={i.href} item={i} onNavigate={onNavigate} />
                ))}
                {g.viewAll && isLive(g.viewAll.href) && (
                  <a
                    href={g.viewAll.href}
                    onClick={onNavigate}
                    className="text-primary px-2 py-1.5 text-[13px] font-medium"
                  >
                    {g.viewAll.label}
                  </a>
                )}
              </div>
            </div>
          ))}
          {footer && (
            <a
              href={footer.href}
              onClick={onNavigate}
              className="text-foreground mt-3 flex items-center gap-1.5 px-2 py-2 text-[14px] font-medium"
            >
              {footer.label}
              <ChevronRight className="size-3.5" aria-hidden />
            </a>
          )}
        </div>
      )}
    </div>
  );
}

/** Lien direct du menu mobile (pas de déroulant). */
function MobileLink({ label, href, onNavigate }: { label: string; href: string; onNavigate: () => void }) {
  return (
    <a
      href={href}
      onClick={onNavigate}
      className="text-foreground flex items-center border-b px-6 py-4 text-[17px] font-medium"
    >
      {label}
    </a>
  );
}
