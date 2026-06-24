"use client"

import { useState, useMemo } from "react"
import {
  Search,
  Sparkles,
  Layers,
  Cpu,
  Users,
  Activity,
  CreditCard,
  Shield,
  Mail,
  ChevronDown,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { useTranslation } from "@/lib/i18n"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Contenu réel de la doc (QA2-25) — concis, factuel, aligné sur l'app.
// ---------------------------------------------------------------------------

interface DocCategory {
  readonly id: string
  readonly label: string
  readonly icon: React.ReactNode
  readonly color: string
}

interface DocArticle {
  readonly id: string
  readonly category: string
  readonly title: string
  readonly body: string
}

const CATEGORIES: readonly DocCategory[] = [
  { id: "start",       label: "Démarrage",            icon: <Sparkles className="h-4 w-4" />,   color: "text-amber-500 bg-amber-500/10 border-amber-500/20" },
  { id: "operations",  label: "Opérations & tâches",  icon: <Layers className="h-4 w-4" />,     color: "text-blue-500 bg-blue-500/10 border-blue-500/20" },
  { id: "smart",       label: "Smart Assign (IA)",    icon: <Cpu className="h-4 w-4" />,         color: "text-violet-500 bg-violet-500/10 border-violet-500/20" },
  { id: "people",      label: "Membres & équipes",    icon: <Users className="h-4 w-4" />,      color: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20" },
  { id: "analytics",   label: "Analytics & Assistant",icon: <Activity className="h-4 w-4" />,   color: "text-cyan-500 bg-cyan-500/10 border-cyan-500/20" },
  { id: "billing",     label: "Plans & facturation",  icon: <CreditCard className="h-4 w-4" />, color: "text-orange-500 bg-orange-500/10 border-orange-500/20" },
  { id: "security",    label: "Sécurité & données",   icon: <Shield className="h-4 w-4" />,      color: "text-rose-500 bg-rose-500/10 border-rose-500/20" },
]

const ARTICLES: readonly DocArticle[] = [
  {
    id: "start-workspace", category: "start",
    title: "Créer un workspace et inviter votre équipe",
    body: "Un workspace regroupe vos opérations, membres et équipes. Créez-en un depuis le sélecteur en haut de la barre latérale (« Nouveau workspace »). Invitez ensuite des membres depuis People → Members : par email (ils reçoivent un lien d'invitation) ou en recherchant un utilisateur existant. Chaque membre reçoit un rôle (Owner, Admin ou Member).",
  },
  {
    id: "start-operation", category: "start",
    title: "Créer votre première opération (projet)",
    body: "Une « opération » est un projet. Cliquez sur « New project » dans la barre latérale ou « New Operation » sur la page Operations. Donnez-lui un nom, une icône et une couleur. L'opération ouvre un board kanban prêt à l'emploi (Backlog, Todo, In Progress, Done, Cancelled).",
  },
  {
    id: "start-nav", category: "start",
    title: "Se repérer : Dashboard, Signaux, My Queue",
    body: "Le Dashboard donne une vue d'ensemble (opérations actives, charge, complétion). Signaux (inbox) regroupe vos notifications par type (alertes, mentions, assignations). My Queue liste tout ce qui vous est assigné (issues, sprints, pages) avec des onglets de tri.",
  },
  {
    id: "ops-board", category: "operations",
    title: "Le board kanban : colonnes, drag & drop, statuts",
    body: "Chaque colonne correspond à un statut. Glissez une carte d'une colonne à l'autre pour changer son statut (le déplacement est instantané et synchronisé en temps réel). Double-cliquez sur un titre de colonne pour le renommer, ou changez sa couleur via le menu « … ». Ajoutez une colonne avec le bouton à droite du board.",
  },
  {
    id: "ops-views", category: "operations",
    title: "Vues List, Backlog et Cycles",
    body: "En plus du board, chaque opération propose : List (toutes les issues groupées par statut), Backlog (à planifier), et Cycles (sprints limités dans le temps). Les filtres en ligne (Priorité / Assigné / Label) s'appliquent à toutes ces vues.",
  },
  {
    id: "ops-issue", category: "operations",
    title: "Créer et enrichir une issue",
    body: "Ouvrez une issue pour éditer son titre, sa description, sa priorité, son assigné, son échéance et ses labels. Les onglets permettent d'ajouter : commentaires, sous-tâches, relations, checklist (avec % d'avancement), pièces jointes et temps passé (worklogs).",
  },
  {
    id: "smart-how", category: "smart",
    title: "Comment fonctionne le Smart Assign",
    body: "Le Smart Assign recommande le meilleur assigné pour une issue en combinant plusieurs signaux : adéquation des compétences (sémantique), charge de travail actuelle (cross-projets), disponibilité/capacité déclarée, et historique de résolution. Une explication (le « pourquoi ») et un breakdown de score sont affichés.",
  },
  {
    id: "smart-skills", category: "smart",
    title: "Renseigner les compétences d'un membre",
    body: "Les recommandations s'améliorent quand les profils sont remplis. Sur la fiche d'un membre, éditez sa carte de compétences (skills + texte d'expertise + séniorité + capacité h/sem). Vous pouvez aussi activer le mode « montée en compétence » pour favoriser l'apprentissage sur des tâches adjacentes.",
  },
  {
    id: "smart-bulk", category: "smart",
    title: "Auto-assign en lot",
    body: "Sur le board, le bouton « Auto-assign (N) » recommande un assigné pour chaque issue non assignée. Vous cochez les suggestions à appliquer et assignez en une fois.",
  },
  {
    id: "people-roles", category: "people",
    title: "Membres et rôles",
    body: "Trois rôles : Owner (contrôle total), Admin (gère membres et contenu), Member (contribue). Sur la page Members, un Owner peut promouvoir/rétrograder et retirer des membres. Les actions destructives sont toujours en rouge.",
  },
  {
    id: "people-teams", category: "people",
    title: "Équipes et association aux opérations",
    body: "Les équipes regroupent des membres par fonction. Vous pouvez associer une équipe à une opération depuis l'onglet Members de l'opération, pour gérer les accès et la composition par projet.",
  },
  {
    id: "analytics-read", category: "analytics",
    title: "Lire les analytics",
    body: "La page Intelligence affiche les KPIs (tâches résolues, cycle time, vélocité, cycles actifs), le throughput hebdomadaire, le burndown de sprint et la capacité d'équipe. Filtrez par opération avec le sélecteur en haut. Les analytics avancées sont incluses dans le plan Pro.",
  },
  {
    id: "analytics-assistant", category: "analytics",
    title: "Utiliser l'assistant Ask AI",
    body: "Cliquez sur « Ask AI » dans la barre du haut pour ouvrir l'assistant. Posez vos questions sur vos projets, tâches ou stratégie ; il répond en contexte. L'assistant IA est une fonctionnalité Pro.",
  },
  {
    id: "billing-plans", category: "billing",
    title: "Plans : Free, Pro, Enterprise",
    body: "Free : 2 workspaces, jusqu'à 5 membres, board/list/cycles, Smart Assign de base. Pro : 10 workspaces, jusqu'à 50 membres, analytics avancées, assistant IA, intégrations. Enterprise : membres illimités, SSO, audit avancé, on-premise.",
  },
  {
    id: "billing-upgrade", category: "billing",
    title: "Passer à Pro et gérer la facturation",
    body: "Cliquez sur n'importe quel bouton « Passer à Pro » (profil, switcher, page Members) pour ouvrir la fenêtre d'upgrade et lancer le paiement sécurisé. Une fois abonné, gérez votre facturation depuis Settings → Billing & Plan (portail Stripe).",
  },
  {
    id: "security-gdpr", category: "security",
    title: "Vos données (RGPD)",
    body: "Depuis Settings → Privacy & Data, vous pouvez exporter l'ensemble de vos données personnelles (JSON) ou demander la suppression/anonymisation de votre compte. La politique de confidentialité détaille les données collectées, leurs bases légales et vos droits.",
  },
]

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function HelpPage() {
  const { t } = useTranslation()
  const [query, setQuery] = useState("")
  const [activeCat, setActiveCat] = useState<string>("all")
  const [openId, setOpenId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return ARTICLES.filter((a) => {
      if (activeCat !== "all" && a.category !== activeCat) return false
      if (!q) return true
      return a.title.toLowerCase().includes(q) || a.body.toLowerCase().includes(q)
    })
  }, [query, activeCat])

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{t("help.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("help.subtitle")}</p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("help.searchPlaceholder")}
          className="h-10 w-full rounded-md border border-border bg-background pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
        />
      </div>

      {/* Filtres par catégorie */}
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={() => setActiveCat("all")}
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
            activeCat === "all" ? "border-foreground/20 bg-muted text-foreground" : "border-border text-muted-foreground hover:text-foreground"
          )}
        >
          Tout
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setActiveCat(c.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              activeCat === c.id ? "border-foreground/20 bg-muted text-foreground" : "border-border text-muted-foreground hover:text-foreground"
            )}
          >
            {c.icon}
            {c.label}
          </button>
        ))}
      </div>

      {/* Articles (accordéon) */}
      <div className="rounded-xl border border-border bg-card overflow-hidden [box-shadow:var(--shadow-sm)]">
        {filtered.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">Aucun article ne correspond à votre recherche.</p>
        ) : (
          filtered.map((a) => {
            const open = openId === a.id
            const cat = CATEGORIES.find((c) => c.id === a.category)
            return (
              <div key={a.id} className="border-b border-border/60 last:border-0">
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : a.id)}
                  className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/40"
                >
                  <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-md border", cat?.color)}>
                    {cat?.icon}
                  </span>
                  <span className="flex-1 text-sm font-medium text-foreground">{a.title}</span>
                  <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
                </button>
                {open && (
                  <p className="px-4 pb-4 pl-14 text-sm leading-relaxed text-muted-foreground">{a.body}</p>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Contact support */}
      <div className="rounded-xl border border-border bg-card p-5 [box-shadow:var(--shadow-sm)] flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">{t("help.contactSupport")}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{t("help.contactSupportDesc")}</p>
        </div>
        <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 text-xs shrink-0">
          <a href="mailto:support@taskforce.dev?subject=Support%20TaskForce">
            <Mail className="size-3.5" />
            {t("help.sendEmail")}
          </a>
        </Button>
      </div>
    </div>
  )
}
