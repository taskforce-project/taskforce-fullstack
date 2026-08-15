"use client"

import { useState, useMemo, useRef, useEffect, Fragment, type ReactNode } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  ChevronRight, Search, ArrowRight, LayoutDashboard, FolderKanban, Inbox, ClipboardCheck, Repeat,
  CircleDot, Users, Activity, Brain, Plus, Settings,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { BrandLogo } from "@/components/ui/brand-logo"
import { ProjectIcon } from "@/components/ui/project-icon"
import { useSettingsStore } from "@/lib/store/settings-store"
import { useCreateProjectStore } from "@/lib/store/create-project-store"
import { useProjectStore } from "@/lib/store/project-store"

/** Connecteurs mis en avant dans la pilule (clés du catalogue — cf. ConnectorCatalog.java). */
const PILL_TOOLS = [
  { slug: "github", name: "GitHub" },
  { slug: "slack", name: "Slack" },
  { slug: "plane", name: "Plane" },
  { slug: "linear", name: "Linear" },
] as const

/** Même contenu que la palette Ctrl+K — navigation + Labs (les actions spéciales sont ajoutées à part). */
const NAV_ITEMS = [
  { label: "Tableau de bord", path: "/dashboard", icon: LayoutDashboard },
  { label: "Inbox", path: "/inbox", icon: Inbox },
  { label: "Mon travail", path: "/my-work", icon: ClipboardCheck },
  { label: "Opérations", path: "/projects", icon: FolderKanban },
  { label: "Issues", path: "/my-work/issues", icon: CircleDot },
  { label: "Cycles", path: "/cycles", icon: Repeat },
  { label: "Membres", path: "/members", icon: Users },
] as const
const LAB_ITEMS = [
  { label: "Intelligence", path: "/analytics", icon: Activity },
  { label: "Brain OS", path: "/brain", icon: Brain },
] as const

function greetingFor(hour: number): string {
  if (hour < 5) return "Encore debout"
  if (hour < 12) return "Bonjour"
  if (hour < 18) return "Bon après-midi"
  return "Bonsoir"
}

/** Une ligne de la palette inline (aplatie pour la navigation clavier). */
interface Row {
  key: string
  section: string
  icon: ReactNode
  label: string
  trailing?: ReactNode
  run: () => void
}

interface DashboardHeroProps {
  /** Nom réel de l'utilisateur (displayName) — vide si inconnu. */
  readonly displayName: string
}

/**
 * En-tête centré du dashboard (façon page d'accueil Cloudflare) : pilule connecteurs, salutation + H1,
 * puis une <b>palette de commandes INLINE</b> : au focus (clic ou Ctrl+K sur cette page), un dropdown
 * s'ouvre SOUS la barre avec le même contenu que le Ctrl+K (navigation + Labs + actions) ; en tapant,
 * on filtre et on cherche aussi les opérations réelles. Navigation aux flèches ↑↓ + Entrée. Aucun modal.
 */
export function DashboardHero({ displayName }: DashboardHeroProps) {
  const params = useParams<{ workspace: string }>()
  const slug = params?.workspace ?? ""
  const router = useRouter()
  const openSettings = useSettingsStore((s) => s.openSettings)
  const openCreateProject = useCreateProjectStore((s) => s.openCreateProject)
  const projects = useProjectStore((s) => s.projects)
  const greeting = greetingFor(new Date().getHours())

  const [q, setQ] = useState("")
  const [focused, setFocused] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const activeRef = useRef<HTMLButtonElement>(null)
  const query = q.trim().toLowerCase()

  function reset() {
    setQ("")
    setFocused(false)
    inputRef.current?.blur()
  }
  function go(path: string) {
    router.push(slug ? `/${slug}${path}` : path)
    reset()
  }

  // Actions spéciales (pas de simple navigation) — mêmes que dans la palette Ctrl+K.
  const ACTIONS = useMemo(() => [
    { label: "Créer une opération", icon: Plus, run: () => { openCreateProject(); reset() } },
    { label: "Réglages", icon: Settings, run: () => { openSettings(); reset() } },
  ], [openCreateProject, openSettings])

  const match = (label: string) => label.toLowerCase().includes(query)
  const projMatches = useMemo(
    () => query
      ? projects.filter((p) => match(p.name) || p.identifier.toLowerCase().includes(query)).slice(0, 6)
      : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [query, projects],
  )

  // Liste APLATIE (opérations → navigation → Labs → actions) : une seule séquence pour les flèches.
  const rows: Row[] = []
  projMatches.forEach((p) => rows.push({
    key: `p-${p.id}`, section: "Opérations",
    icon: <ProjectIcon iconUrl={p.iconUrl} name={p.name} color={p.color} size={20} className="shrink-0 rounded" />,
    label: p.name,
    trailing: <span className="shrink-0 font-mono text-[11px] uppercase text-muted-foreground">{p.identifier}</span>,
    run: () => go(`/projects/${p.id}`),
  }))
  ;(query ? NAV_ITEMS.filter((n) => match(n.label)) : NAV_ITEMS).forEach((n) => rows.push({
    key: `n-${n.path}`, section: "Navigation",
    icon: <n.icon className="size-4 shrink-0 text-muted-foreground" />, label: n.label, run: () => go(n.path),
  }))
  ;(query ? LAB_ITEMS.filter((l) => match(l.label)) : LAB_ITEMS).forEach((l) => rows.push({
    key: `l-${l.path}`, section: "Labs",
    icon: <l.icon className="size-4 shrink-0 text-muted-foreground" />, label: l.label, run: () => go(l.path),
  }))
  ;(query ? ACTIONS.filter((a) => match(a.label)) : ACTIONS).forEach((a) => rows.push({
    key: `a-${a.label}`, section: "Actions",
    icon: <a.icon className="size-4 shrink-0 text-muted-foreground" />, label: a.label, run: a.run,
  }))

  const activeIdx = rows.length ? Math.min(activeIndex, rows.length - 1) : -1

  // Reset du surlignage quand la requête change ; scroll de la ligne active dans la vue.
  useEffect(() => { setActiveIndex(0) }, [q])
  useEffect(() => { activeRef.current?.scrollIntoView({ block: "nearest" }) }, [activeIndex])

  // Ctrl/Cmd+K sur le dashboard → focus la GRANDE barre (pas le modal). Listener en phase CAPTURE +
  // stopImmediatePropagation : coupe le listener (phase bubble) de la topbar, qui ouvrirait le modal.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault()
        e.stopImmediatePropagation()
        inputRef.current?.focus()
        setFocused(true)
      }
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [])

  return (
    <div className="flex flex-col items-center gap-5 pt-2 text-center">
      {/* Pilule d'onboarding des connecteurs — discrète : bordure, fond card, hover. */}
      <button
        type="button"
        onClick={() => openSettings("integrations")}
        className="group flex items-center gap-2 rounded-full border border-border bg-card py-1.5 pl-2.5 pr-3 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
      >
        <span className="flex items-center gap-1.5">
          {PILL_TOOLS.map((t) => (
            <BrandLogo key={t.slug} slug={t.slug} name={t.name} className="size-3.5 text-[7px]" />
          ))}
        </span>
        <span>Branchez vos outils sur le Brain OS</span>
        <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
      </button>

      <div className="space-y-1.5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {greeting}
          {displayName ? `, ${displayName}` : ""}
        </p>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Reprenez là où vous en étiez.</h1>
      </div>

      {/* Palette inline : la barre + un dropdown au focus (même contenu que Ctrl+K). */}
      <div className="relative w-full max-w-2xl">
        <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5 text-sm shadow-sm ring-1 ring-border/60 transition-all focus-within:border-primary/50 focus-within:ring-primary/20 hover:border-primary/40 hover:shadow-md">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, rows.length - 1)) }
              else if (e.key === "ArrowUp") { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)) }
              else if (e.key === "Enter") { e.preventDefault(); rows[activeIdx]?.run() }
              else if (e.key === "Escape") reset()
            }}
            aria-label="Rechercher une opération, une action, une page"
            placeholder="Rechercher une opération, une issue, une action…"
            className="min-w-0 flex-1 bg-transparent text-left text-foreground outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden shrink-0 items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px] font-medium text-muted-foreground sm:flex">
            Ctrl K
          </kbd>
        </div>

        {focused && (
          // onMouseDown preventDefault : cliquer un résultat ne fait pas blur l'input (le clic passe).
          <div
            onMouseDown={(e) => e.preventDefault()}
            className="absolute inset-x-0 top-full z-50 mt-2 flex max-h-96 flex-col overflow-hidden rounded-xl border border-border bg-popover text-left shadow-lg"
          >
            <div className="min-h-0 flex-1 overflow-y-auto p-1">
            {rows.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">Aucun résultat pour « {q.trim()} »</p>
            ) : (
              rows.map((row, i) => (
                <Fragment key={row.key}>
                  {(i === 0 || rows[i - 1].section !== row.section) && (
                    <p className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {row.section}
                    </p>
                  )}
                  <button
                    ref={i === activeIdx ? activeRef : undefined}
                    type="button"
                    onClick={row.run}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm transition-colors",
                      // Lignes Labs (Intelligence, Brain OS) : même vague en fond que dans le Ctrl+K.
                      row.section === "Labs" && "lab-cmd-row",
                      i === activeIdx && "bg-muted",
                    )}
                  >
                    {row.icon}
                    <span className="min-w-0 flex-1 truncate text-foreground">{row.label}</span>
                    {row.trailing}
                    <ArrowRight
                      className={cn(
                        "size-4 shrink-0 text-muted-foreground transition-opacity",
                        i === activeIdx ? "opacity-100" : "opacity-0",
                      )}
                    />
                  </button>
                </Fragment>
              ))
            )}
            </div>

            {/* Barre en bas — la même que le modal Ctrl+K (rappels clavier). */}
            <div className="flex items-center gap-4 border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <kbd className="inline-flex size-4 items-center justify-center rounded border border-border bg-muted text-[10px]">↑</kbd>
                <kbd className="inline-flex size-4 items-center justify-center rounded border border-border bg-muted text-[10px]">↓</kbd>
                pour naviguer
              </span>
              <span className="flex items-center gap-1.5">
                <kbd className="inline-flex h-4 items-center justify-center rounded border border-border bg-muted px-1 text-[10px]">↵</kbd>
                pour ouvrir
              </span>
              <span className="ml-auto flex items-center gap-1.5">
                <kbd className="inline-flex h-4 items-center justify-center rounded border border-border bg-muted px-1 text-[10px]">esc</kbd>
                pour fermer
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
