import type { ReactNode } from "react";
import {
  Activity,
  Bell,
  Brain,
  ChevronRight,
  ChevronsUpDown,
  FlaskConical,
  HelpCircle,
  Layers,
  LayoutDashboard,
  ListTodo,
  PanelLeft,
  Plus,
  Radio,
  Search,
  Settings2,
  Sparkles,
  Sun,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { WORKSPACE, type Person } from "@/lib/story";

/**
 * AppWindow - le châssis TaskForce, calé sur des **captures réelles** de l'app
 * (fournies le 24/07). Plus aucune approximation :
 *
 *   · sidebar : avatar rond du workspace + slug dessous, groupes Command / Work /
 *     People, libellés exacts - « Signals » (pas « Signal Center »), « Brain OS »
 *     (pas « Brain »), « New Project » - fioles violettes sur Intelligence et
 *     Brain OS, compte en pied ;
 *   · fil d'Ariane à **chevrons** `›`, trois niveaux ;
 *   · barre du haut : recherche en pilule avec `⌘K`, `Ask AI`, l'icône des
 *     workflows, la cloche **à badge rouge**, le sélecteur de thème ;
 *   · le contenu est un **panneau blanc à coin arrondi**, encastré dans le fond
 *     clair - c'est ce décrochement qui donne sa profondeur à l'app.
 *
 * Réf. `frontend/components/layout/{sidebar/app-sidebar,topbar/app-topbar}.tsx`
 * pour la structure, captures pour le rendu.
 */

const NAV: { group: string; items: { label: string; icon: typeof LayoutDashboard; sub?: boolean; lab?: boolean; active?: boolean }[] }[] = [
  {
    group: "Command",
    items: [
      { label: "Dashboard", icon: LayoutDashboard },
      { label: "Signals", icon: Radio, sub: true },
      { label: "My Queue", icon: ListTodo, sub: true },
    ],
  },
  {
    group: "Work",
    items: [
      { label: "Operations", icon: Layers, active: true },
      { label: "Intelligence", icon: Activity, lab: true },
      { label: "Brain OS", icon: Brain, lab: true },
    ],
  },
  { group: "People", items: [{ label: "Members", icon: User }] },
];

export function AppWindow({
  breadcrumb,
  active = "Operations",
  footer,
  bleed = false,
  className,
  children,
}: {
  breadcrumb: string[];
  /** Item de nav mis en surbrillance - change selon l'acte du film. */
  active?: string;
  footer?: ReactNode;
  bleed?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative isolate overflow-hidden border border-[#d8d8de] bg-[#fbfbfc]",
        bleed ? "-mb-px rounded-t-[14px] border-b-0" : "rounded-[14px]",
        className,
      )}
      style={{
        /* En mode `bleed`, la fenêtre passe DERRIÈRE le filet de section : l'ombre part
           vers le HAUT. Une ombre portée vers le bas déborderait sous le filet, dans la
           section suivante, et casserait l'illusion. */
        boxShadow: bleed
          ? "0 -1px 1px rgba(16,24,40,0.04), 0 -14px 28px -14px rgba(16,24,40,0.10), 0 -44px 72px -34px rgba(16,24,40,0.22)"
          : "0 1px 1px rgba(16,24,40,0.04), 0 12px 24px -12px rgba(16,24,40,0.12), 0 44px 80px -32px rgba(16,24,40,0.26)",
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 z-40 rounded-[inherit] ring-1 ring-white/80 ring-inset"
      />

      {/* Occlusion : le filet est DEVANT et projette son ombre SUR l'écran. C'est ce
          qui fait lire « l'écran continue derrière la ligne ». */}
      {bleed && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 z-40 h-5"
          style={{ background: "linear-gradient(to top, rgba(16,24,40,0.10), transparent)" }}
        />
      )}

      <div className="flex">
        <Sidebar active={active} />

        {/* Le panneau de contenu : blanc, coin haut-gauche arrondi, encastré. */}
        <div className="relative min-w-0 flex-1 overflow-hidden rounded-tl-xl border-t border-l border-[#e6e6ea] bg-white">
          <Topbar breadcrumb={breadcrumb} />
          {children}
          {footer}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────  Sidebar  ───────────────────────── */

function Sidebar({ active }: { active: string }) {
  return (
    <div aria-hidden className="hidden w-[214px] shrink-0 flex-col pt-1.5 md:flex">
      <div className="flex h-11 items-center gap-2 px-2.5">
        <span className="flex size-[26px] shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-[10px] font-semibold text-white">
          {WORKSPACE.initial}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[12.5px] leading-tight font-semibold text-foreground">
            {WORKSPACE.name}
          </span>
          <span className="text-muted-foreground block truncate text-[10px] leading-tight">
            {WORKSPACE.slug}
          </span>
        </span>
        <ChevronsUpDown className="text-muted-foreground/45 size-3 shrink-0" />
      </div>

      <div className="flex flex-1 flex-col gap-2.5 overflow-hidden px-2 pt-1.5 pb-2">
        {NAV.map((g) => (
          <div key={g.group}>
            <p className="text-muted-foreground/70 px-2 pb-1 text-[10px] font-normal">{g.group}</p>
            <ul className="flex flex-col gap-px">
              {g.items.map((it) => (
                <li
                  key={it.label}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-[5.5px] text-[12px] transition-colors duration-300",
                    it.label === active
                      ? "bg-[#eeeef1] font-medium text-foreground"
                      : "text-foreground/75",
                  )}
                >
                  <it.icon className="size-[14px] shrink-0" strokeWidth={1.85} />
                  <span className="truncate">{it.label}</span>
                  {it.sub && <ChevronRight className="text-muted-foreground/40 ml-auto size-3" />}
                  {/* Violet = expérimentation. Le bleu porte les actions primaires. */}
                  {it.lab && <FlaskConical className="ml-auto size-3 shrink-0 text-violet-500" />}
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div className="text-muted-foreground/75 mt-auto flex items-center gap-2 px-2 py-[5.5px] text-[12px]">
          <Plus className="size-[14px]" strokeWidth={1.85} />
          New Project
        </div>

        <span className="mx-1 mt-1 h-px bg-[#e9e9ed]" />

        <ul className="flex flex-col gap-px">
          {[
            { label: "Settings", icon: Settings2 },
            { label: "Help", icon: HelpCircle },
          ].map((it) => (
            <li
              key={it.label}
              className="text-foreground/75 flex items-center gap-2 rounded-md px-2 py-[5.5px] text-[12px]"
            >
              <it.icon className="size-[14px] shrink-0" strokeWidth={1.85} />
              {it.label}
            </li>
          ))}
        </ul>
      </div>

      <div className="flex items-center gap-2 px-2.5 pb-2.5">
        <span className="bg-foreground text-background flex size-[26px] shrink-0 items-center justify-center rounded-full text-[10px] font-semibold">
          YO
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[11.5px] leading-tight font-medium text-foreground">
            You
          </span>
          <span className="text-muted-foreground block truncate text-[9.5px] leading-tight">
            you@northwind.co
          </span>
        </span>
        <ChevronsUpDown className="text-muted-foreground/45 size-3 shrink-0" />
      </div>
    </div>
  );
}

/* ─────────────────────────  Topbar  ───────────────────────── */

function Topbar({ breadcrumb }: { breadcrumb: string[] }) {
  return (
    <div className="flex h-[42px] items-center gap-2.5 px-3.5">
      <PanelLeft className="text-muted-foreground/55 size-[15px] shrink-0" strokeWidth={1.85} />

      <nav aria-label="Breadcrumb" className="min-w-0">
        <ol className="flex min-w-0 items-center gap-1.5">
          {breadcrumb.map((seg, i) => (
            <li key={seg} className="flex min-w-0 items-center gap-1.5">
              {i > 0 && <ChevronRight className="text-muted-foreground/40 size-3 shrink-0" />}
              <span
                className={cn(
                  "truncate text-[12.5px]",
                  i === breadcrumb.length - 1
                    ? "font-medium text-foreground"
                    : "text-muted-foreground",
                )}
              >
                {seg}
              </span>
            </li>
          ))}
        </ol>
      </nav>

      <div aria-hidden className="ml-auto flex shrink-0 items-center gap-2">
        <span className="text-muted-foreground/70 hidden items-center gap-1.5 rounded-lg border border-[#e6e6ea] px-2 py-[4px] text-[11px] lg:flex">
          <Search className="size-3" />
          Search...
          <span className="ml-3 font-mono text-[10px]">⌘K</span>
        </span>
        <span className="hidden items-center gap-1 text-[11.5px] font-medium text-foreground sm:flex">
          <Sparkles className="text-primary size-3.5" />
          Ask AI
        </span>
        <Layers className="text-muted-foreground/60 size-[15px]" strokeWidth={1.85} />
        <span className="relative flex">
          <Bell className="text-muted-foreground/60 size-[15px]" strokeWidth={1.85} />
          <span className="absolute -top-1.5 -right-1.5 flex size-[13px] items-center justify-center rounded-full bg-red-500 text-[8px] font-semibold text-white">
            3
          </span>
        </span>
        <Sun className="text-muted-foreground/60 size-[15px]" strokeWidth={1.85} />
      </div>
    </div>
  );
}

/* ─────────────────────────  Avatars  ───────────────────────── */

/** Pastille de personne - l'app utilise des identicônes, on reste sur des initiales. */
export function PersonChip({
  person,
  withName = true,
  className,
}: {
  person: Person;
  withName?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("flex items-center gap-1.5", className)}>
      <span
        className={cn(
          "flex size-[18px] shrink-0 items-center justify-center rounded-full text-[8px] font-semibold",
          person.brand ? "bg-primary text-primary-foreground" : "bg-[#e4e4ea] text-[#5b5b63]",
        )}
      >
        {person.initials}
      </span>
      {withName && <span className="truncate text-[11.5px] text-foreground">{person.name}</span>}
    </span>
  );
}

export function AvatarStack({ people, extra }: { people: readonly Person[]; extra?: number }) {
  return (
    <span className="flex items-center">
      <span className="flex -space-x-1">
        {people.map((p) => (
          <span
            key={p.id}
            className={cn(
              "flex size-[22px] items-center justify-center rounded-full text-[8.5px] font-semibold ring-2 ring-white",
              p.brand ? "bg-primary text-primary-foreground" : "bg-[#e4e4ea] text-[#5b5b63]",
            )}
          >
            {p.initials}
          </span>
        ))}
      </span>
      {extra != null && (
        <span className="text-muted-foreground ml-1 text-[11px]">+{extra}</span>
      )}
    </span>
  );
}

/* ─────────────────────────  Curseur  ───────────────────────── */

/**
 * Le pointeur qui exécute l'action. Sans lui, la scène dit « quelque chose change
 * tout seul ». Avec lui, « **quelqu'un fait quelque chose** » - c'est la différence
 * entre un écran qui bouge et une démonstration.
 * Positionné depuis le coin bas-droit du contenu : stable quelle que soit la largeur.
 */
export function Cursor({
  left,
  top,
  visible,
  clicking,
}: {
  /** Position en **pourcentage** du panneau de contenu : la fenêtre est fluide,
   *  des coordonnées en pixels se décaleraient à chaque largeur d'écran. */
  left: string;
  top: string;
  visible: boolean;
  clicking: boolean;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute z-30 transition-all duration-[600ms]",
        visible ? "opacity-100" : "opacity-0",
      )}
      style={{
        left,
        top,
        transform: `scale(${clicking ? 0.85 : 1})`,
        transitionTimingFunction: "cubic-bezier(0.33, 1, 0.68, 1)",
      }}
    >
      {clicking && (
        <span className="bg-primary/25 absolute -top-1 -left-1 size-6 animate-ping rounded-full [animation-duration:600ms] [animation-iteration-count:1]" />
      )}
      <svg width="16" height="19" viewBox="0 0 17 20" fill="none">
        <path
          d="M1 1.2v14.3l3.6-3.5 2.2 5.4 2.9-1.2-2.2-5.3h5L1 1.2Z"
          fill="#1d1d1f"
          stroke="#fff"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
