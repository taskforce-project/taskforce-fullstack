import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowRight, ArrowUpRight, ChevronDown, Download, Menu as MenuIcon, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { BrandMark } from "@/components/visuals/brand";
import { toneFill, toneWash } from "@/components/visuals/shapes";
import { LINKS, MENUS, type Menu, type MenuItem } from "@/lib/site";
import { cn } from "@/lib/utils";
import { LogoMark } from "./LogoMark";
import { MenuArt } from "./MenuArt";

/**
 * En-tête du site (îlot persistant d'une page à l'autre, `transition:persist`). Menus à la manière de Duna : au
 * survol ou au clic, un panneau s'ouvre sous l'entrée, avec une ligne d'explication par lien et, à droite, une
 * petite scène animée qui suit le lien survolé. Le panneau change de taille d'un menu à l'autre au lieu de se
 * refermer. Transparent en haut de page, verre et filet dès qu'on défile. Download remplace la connexion : l'app
 * n'a pas de compte.
 */

const EASE = [0.22, 1, 0.36, 1] as const;
const PANEL_WIDTH: Record<string, number> = { product: 880, agents: 720, resources: 720 };

const panels = MENUS.filter((m): m is Menu & { groups: NonNullable<Menu["groups"]> } => Boolean(m.groups));

function currentPath(): string {
  return typeof window === "undefined" ? "/" : window.location.pathname.replace(/\/+$/, "") || "/";
}

/** Une entrée de menu est « active » quand la page courante est sa cible (sans l'ancre). */
function menuIsActive(menu: Menu, path: string): boolean {
  if (menu.href) return menu.href === path;
  return (menu.groups ?? []).some((g) => g.items.some((i) => !i.external && i.href.split("#")[0] === path));
}

function Panel({
  menu,
  onNavigate,
  reduce,
}: Readonly<{ menu: Menu & { groups: NonNullable<Menu["groups"]> }; onNavigate: () => void; reduce: boolean }>) {
  const items = menu.groups.flatMap((g) => g.items);
  const [hover, setHover] = useState<MenuItem>(items[0]);

  return (
    <div className="flex gap-4 p-3">
      <div className={cn("grid min-w-0 flex-1 content-start gap-x-2", menu.groups.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
        {menu.groups.map((g) => (
          <div key={g.title}>
            <p className="t-label px-3 pt-2.5 pb-2">{g.title}</p>
            <ul className="flex flex-col">
              {g.items.map((item) => {
                const on = hover.href === item.href && hover.label === item.label;
                return (
                  <li key={item.label}>
                    <a
                      href={item.href}
                      target={item.external ? "_blank" : undefined}
                      rel={item.external ? "noopener" : undefined}
                      onMouseEnter={() => setHover(item)}
                      onFocus={() => setHover(item)}
                      onClick={onNavigate}
                      className="relative flex items-start gap-3 rounded-lg px-3 py-2.5 outline-none"
                    >
                      {on && (
                        <motion.span
                          layoutId={`nav-item-${menu.id}`}
                          className="absolute inset-0 rounded-lg bg-card"
                          transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 42 }}
                        />
                      )}
                      <span className={cn("relative mt-[8px] size-2 shrink-0 rounded-full", toneFill[item.tone])} aria-hidden="true" />
                      <span className="relative min-w-0">
                        <span className="flex items-center gap-1 text-[15px] font-medium tracking-[-0.01em] text-foreground">
                          {item.label}
                          {item.external && <ArrowUpRight className="size-3.5 text-subtle" aria-hidden="true" />}
                        </span>
                        <span className="mt-0.5 block text-[13.5px] leading-snug text-muted-foreground">{item.desc}</span>
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {menu.more && (
          <a
            href={menu.more.href}
            onClick={onNavigate}
            className="link-arrow col-span-full mx-3 mt-2 mb-1 border-t border-border pt-3 text-[14px]"
          >
            {menu.more.label}
            <ArrowRight aria-hidden="true" />
          </a>
        )}
      </div>

      {/* la scène du lien survolé, sur un panneau pastel de son ton */}
      <div
        className={cn(
          "wash relative flex w-[280px] shrink-0 items-center justify-center rounded-xl transition-colors duration-300",
          toneWash[hover.tone],
        )}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={hover.art}
            initial={reduce ? false : { opacity: 0, scale: 0.96, y: 6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, scale: 0.98, transition: { duration: 0.12 } }}
            transition={{ duration: 0.32, ease: EASE }}
          >
            <MenuArt art={hover.art} />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

function MobileMenu({ path, onNavigate }: Readonly<{ path: string; onNavigate: () => void }>) {
  return (
    <nav aria-label="Main" className="container-wide flex flex-col gap-8 pt-6 pb-10">
      {MENUS.map((menu, i) =>
        menu.href ? (
          <motion.a
            key={menu.id}
            href={menu.href}
            onClick={onNavigate}
            aria-current={path === menu.href ? "page" : undefined}
            className="flex items-center justify-between border-t border-border pt-5 text-[19px] font-medium tracking-[-0.02em]"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: EASE, delay: 0.04 * i }}
          >
            {menu.label}
            <ArrowRight className="size-4 text-subtle" aria-hidden="true" />
          </motion.a>
        ) : (
          <motion.div
            key={menu.id}
            className="border-t border-border pt-5"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: EASE, delay: 0.04 * i }}
          >
            <p className="t-label">{menu.label}</p>
            <ul className="mt-3 flex flex-col">
              {(menu.groups ?? []).flatMap((g) => g.items).map((item) => (
                <li key={item.label}>
                  <a
                    href={item.href}
                    target={item.external ? "_blank" : undefined}
                    rel={item.external ? "noopener" : undefined}
                    onClick={onNavigate}
                    className="flex items-start gap-3 py-2.5"
                  >
                    <span className={cn("mt-[9px] size-2 shrink-0 rounded-full", toneFill[item.tone])} aria-hidden="true" />
                    <span>
                      <span className="block text-[17px] font-medium tracking-[-0.015em]">{item.label}</span>
                      <span className="block text-[14px] text-muted-foreground">{item.desc}</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </motion.div>
        ),
      )}
      <div className="flex flex-wrap gap-3 border-t border-border pt-6">
        <a href="/download" onClick={onNavigate} className="btn btn-primary btn-lg flex-1">
          <Download aria-hidden="true" />
          Download
        </a>
        <a href={LINKS.github} target="_blank" rel="noopener" className="btn btn-secondary btn-lg flex-1">
          <BrandMark brand="github" className="size-4" />
          GitHub
        </a>
      </div>
    </nav>
  );
}

export default function SiteNav() {
  const reduce = useReducedMotion() ?? false;
  const [path, setPath] = useState<string>("/");
  const [open, setOpen] = useState<string | null>(null);
  const [mobile, setMobile] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const header = useRef<HTMLElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const triggers = useRef<Record<string, HTMLButtonElement | null>>({});

  const cancelClose = () => window.clearTimeout(closeTimer.current);
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(null), 160);
  };
  const closeAll = useCallback(() => {
    setOpen(null);
    setMobile(false);
  }, []);

  // page courante, et tout se referme quand on change de page (navigation sans rechargement)
  useEffect(() => {
    const onLoad = () => {
      setPath(currentPath());
      closeAll();
    };
    onLoad();
    document.addEventListener("astro:page-load", onLoad);
    return () => document.removeEventListener("astro:page-load", onLoad);
  }, [closeAll]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // clic hors de l'en-tête, Échap
  useEffect(() => {
    if (!open && !mobile) return;
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      const inMobile = document.getElementById("mobile-menu")?.contains(target);
      if (header.current && !header.current.contains(target) && !inMobile) closeAll();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const id = open;
      closeAll();
      if (id) triggers.current[id]?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, mobile, closeAll]);

  // menu mobile : la page derrière ne défile plus
  useEffect(() => {
    document.documentElement.style.overflow = mobile ? "hidden" : "";
    return () => {
      document.documentElement.style.overflow = "";
    };
  }, [mobile]);

  const solid = scrolled || open !== null || mobile;
  const openMenu = panels.find((m) => m.id === open) ?? null;

  return (
    <>
    <header
      ref={header}
      onPointerEnter={cancelClose}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") scheduleClose();
      }}
      onBlur={(e) => {
        if (!header.current?.contains(e.relatedTarget as Node | null)) setOpen(null);
      }}
      className={cn(
        "fixed inset-x-0 top-0 z-50 border-b transition-[background-color,border-color,backdrop-filter] duration-300",
        solid ? "border-black/[0.06] bg-white/80 backdrop-blur-xl backdrop-saturate-150" : "border-transparent bg-transparent",
      )}
    >
      <div className="container-wide flex h-16 items-center gap-6 lg:grid lg:grid-cols-[1fr_auto_1fr]">
        <a href="/" aria-label="TaskForce, home" className="text-foreground lg:justify-self-start">
          <LogoMark />
        </a>

        <nav aria-label="Main" className="hidden items-center gap-0.5 lg:flex">
          {MENUS.map((menu) => {
            const active = menuIsActive(menu, path);
            if (menu.href) {
              return (
                <a
                  key={menu.id}
                  href={menu.href}
                  aria-current={path === menu.href ? "page" : undefined}
                  onPointerEnter={(e) => {
                    if (e.pointerType === "mouse") setOpen(null);
                  }}
                  className={cn(
                    "relative rounded-full px-3.5 py-2 text-[15px] transition-colors hover:text-foreground",
                    active ? "text-foreground" : "text-foreground/70",
                  )}
                >
                  {menu.label}
                </a>
              );
            }
            const isOpen = open === menu.id;
            return (
              <button
                key={menu.id}
                ref={(el) => {
                  triggers.current[menu.id] = el;
                }}
                type="button"
                aria-expanded={isOpen}
                aria-controls={`menu-${menu.id}`}
                onPointerEnter={(e) => {
                  if (e.pointerType === "mouse") {
                    cancelClose();
                    setOpen(menu.id);
                  }
                }}
                onClick={() => setOpen((o) => (o === menu.id ? null : menu.id))}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setOpen(menu.id);
                    window.setTimeout(() => header.current?.querySelector<HTMLAnchorElement>(`#menu-${menu.id} a`)?.focus(), 30);
                  }
                }}
                className={cn(
                  "relative inline-flex items-center gap-1 rounded-full px-3.5 py-2 text-[15px] transition-colors",
                  isOpen ? "text-white" : active ? "text-foreground hover:text-foreground" : "text-foreground/70 hover:text-foreground",
                )}
              >
                {isOpen && (
                  <motion.span
                    layoutId="nav-trigger"
                    className="absolute inset-0 rounded-full bg-foreground"
                    transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 480, damping: 40 }}
                  />
                )}
                <span className="relative">{menu.label}</span>
                <ChevronDown
                  className={cn("relative size-3.5 transition-transform duration-200", isOpen ? "rotate-180 text-white/70" : "text-subtle")}
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-2 lg:ml-0 lg:justify-self-end">
          <a href={LINKS.github} target="_blank" rel="noopener" className="btn btn-secondary btn-sm hidden sm:inline-flex">
            <BrandMark brand="github" className="size-4" />
            GitHub
          </a>
          <a href="/download" className="btn btn-primary btn-sm">
            <Download aria-hidden="true" />
            Download
          </a>
          <button
            type="button"
            className="inline-flex size-9 items-center justify-center text-foreground lg:hidden"
            aria-label={mobile ? "Close the menu" : "Open the menu"}
            aria-expanded={mobile}
            aria-controls="mobile-menu"
            onClick={() => setMobile((m) => !m)}
          >
            {mobile ? <X className="size-5" aria-hidden="true" /> : <MenuIcon className="size-5" aria-hidden="true" />}
          </button>
        </div>
      </div>

      {/* panneau des menus (bureau) : il change de largeur d'un menu à l'autre au lieu de se refermer */}
      <div className="pointer-events-none absolute inset-x-0 top-full hidden justify-center lg:flex">
        <AnimatePresence>
          {openMenu && (
            <motion.div
              key="panel"
              id={`menu-${openMenu.id}`}
              className="pointer-events-auto mt-2 overflow-hidden rounded-2xl bg-white shadow-xl ring-1 ring-black/[0.05]"
              initial={reduce ? false : { opacity: 0, y: -6, width: PANEL_WIDTH[openMenu.id] }}
              animate={{ opacity: 1, y: 0, width: PANEL_WIDTH[openMenu.id] }}
              exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -6, transition: { duration: 0.14 } }}
              transition={{ duration: reduce ? 0 : 0.3, ease: EASE }}
            >
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.div
                  key={openMenu.id}
                  initial={reduce ? false : { opacity: 0, x: 12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={reduce ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, x: -12, transition: { duration: 0.14 } }}
                  transition={{ duration: 0.28, ease: EASE }}
                >
                  <Panel menu={openMenu} onNavigate={closeAll} reduce={reduce} />
                </motion.div>
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

    </header>

    {/* menu mobile plein écran : hors de l'en-tête, dont le flou d'arrière-plan (backdrop-filter) deviendrait le
        repère des éléments fixes et l'enfermerait dans ses 64 px */}
    <AnimatePresence>
      {mobile && (
        <motion.div
          id="mobile-menu"
          className="fixed inset-x-0 top-16 bottom-0 z-40 overflow-y-auto border-t border-border bg-white lg:hidden"
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.15 } }}
          transition={{ duration: reduce ? 0 : 0.2 }}
        >
          <MobileMenu path={path} onNavigate={closeAll} />
        </motion.div>
      )}
    </AnimatePresence>
    </>
  );
}
