"use client"

import { useEffect } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import {
  Calendar,
  GitCommitHorizontal,
  Users,
  FolderKanban,
  CircleDot,
  CheckCircle2,
  Clock,
  Settings,
  Star,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { UserAvatar } from "@/components/ui/user-avatar"
import { Separator } from "@/components/ui/separator"
import { MemberSkillsCard } from "@/components/members/member-skills-card"
import { MemberAvailabilityCard } from "@/components/members/member-availability-card"
import { useAuth } from "@/lib/contexts/auth-context"
import { cn } from "@/lib/utils"
import { useProjectStore } from "@/lib/store/project-store"
import { useSettingsStore } from "@/lib/store/settings-store"
import { useProfileStore, type HeatWeek, type HeatCell } from "@/lib/store/profile-store"
// `planLabel` existait déjà et n'était importé NULLE PART — écrit exactement pour ce besoin, puis oublié
// au profit d'un littéral « Pro » en dur. Cf. TF-PLAN-PRO-GHOST.
import { planLabel } from "@/lib/config/plan-limits"
import type { Project } from "@/lib/api/project-service"

// ---------------------------------------------------------------------------
// Static config
// ---------------------------------------------------------------------------

const PROJECT_COLORS = [
  "bg-primary", "bg-violet-500", "bg-emerald-500",
  "bg-orange-500", "bg-blue-500", "bg-pink-500",
]

/**
 * Clés = valeurs EXACTES de l'enum backend `IssueActivityType`, que `ProfileService` sérialise via
 * `getAction().name()` — donc en MAJUSCULES.
 *
 * ⚠️ Cette table indexait auparavant sur `issue_created` / `issue_closed` / `comment` / `cycle_started`,
 * qui ne correspondent à AUCUNE valeur de l'enum : le lookup échouait à 100 % et le repli
 * `?? ACTIVITY_TYPE_ICON["issue_created"]` masquait complètement le bug. Toutes les lignes portaient la
 * même icône, sans verbe ni date — deux événements distincts sur une même issue (ex. MOB-6 : CREATED,
 * STATUS_CHANGED, COMPLETED à 1,5 s d'écart) s'affichaient en lignes identiques, et l'utilisateur y
 * voyait un doublon.
 */
const ACTIVITY_META: Record<string, { icon: React.ReactNode; label: string }> = {
  CREATED:             { icon: <CircleDot className="h-3.5 w-3.5 text-primary shrink-0" />,            label: "a créé" },
  COMPLETED:           { icon: <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />,     label: "a terminé" },
  REOPENED:            { icon: <CircleDot className="h-3.5 w-3.5 text-orange-400 shrink-0" />,         label: "a rouvert" },
  STATUS_CHANGED:      { icon: <Clock className="h-3.5 w-3.5 text-violet-400 shrink-0" />,             label: "a changé le statut de" },
  PRIORITY_CHANGED:    { icon: <Clock className="h-3.5 w-3.5 text-violet-400 shrink-0" />,             label: "a changé la priorité de" },
  ASSIGNEE_CHANGED:    { icon: <Users className="h-3.5 w-3.5 text-blue-400 shrink-0" />,               label: "a réassigné" },
  TYPE_CHANGED:        { icon: <Clock className="h-3.5 w-3.5 text-violet-400 shrink-0" />,             label: "a changé le type de" },
  TITLE_CHANGED:       { icon: <Clock className="h-3.5 w-3.5 text-violet-400 shrink-0" />,             label: "a renommé" },
  DESCRIPTION_CHANGED: { icon: <Clock className="h-3.5 w-3.5 text-violet-400 shrink-0" />,             label: "a décrit" },
  LABEL_ADDED:         { icon: <Clock className="h-3.5 w-3.5 text-violet-400 shrink-0" />,             label: "a étiqueté" },
  LABEL_REMOVED:       { icon: <Clock className="h-3.5 w-3.5 text-violet-400 shrink-0" />,             label: "a retiré une étiquette de" },
  DUE_DATE_CHANGED:    { icon: <Calendar className="h-3.5 w-3.5 text-amber-400 shrink-0" />,           label: "a daté" },
  START_DATE_CHANGED:  { icon: <Calendar className="h-3.5 w-3.5 text-amber-400 shrink-0" />,           label: "a planifié" },
  PARENT_CHANGED:      { icon: <Clock className="h-3.5 w-3.5 text-violet-400 shrink-0" />,             label: "a rattaché" },
  COMMENT_ADDED:       { icon: <GitCommitHorizontal className="h-3.5 w-3.5 text-yellow-400 shrink-0" />, label: "a commenté" },
  COMMENT_DELETED:     { icon: <GitCommitHorizontal className="h-3.5 w-3.5 text-muted-foreground shrink-0" />, label: "a supprimé un commentaire de" },
}

/** Repli explicite : un type inconnu se voit, au lieu de se déguiser en « créé ». */
const ACTIVITY_FALLBACK = { icon: <CircleDot className="h-3.5 w-3.5 text-muted-foreground shrink-0" />, label: "a modifié" }

/** Date relative courte, sans dépendance : « à l'instant », « 3 h », « 2 j », sinon la date. */
function relativeDate(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ""
  const mins = Math.floor((Date.now() - then) / 60_000)
  if (mins < 1)    return "à l'instant"
  if (mins < 60)   return `${mins} min`
  if (mins < 1440) return `${Math.floor(mins / 60)} h`
  if (mins < 10080) return `${Math.floor(mins / 1440)} j`
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" })
}

const HEAT_COLORS = [
  "bg-muted",
  "bg-emerald-900/60",
  "bg-emerald-700/70",
  "bg-emerald-500/80",
  "bg-emerald-400",
  "bg-emerald-300",
]

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ContributionGraph({ heatmap }: Readonly<{ heatmap: HeatWeek[] }>) {
  const totalContribs = heatmap.flatMap((w) => w.days).reduce((a, cell) => a + cell.val, 0)

  return (
    <div className="rounded-xl border border-border bg-card [box-shadow:var(--shadow-sm)] p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground">Activity</h3>
        <span className="text-xs text-muted-foreground">{totalContribs} contributions in the last 5 months</span>
      </div>

      <div className="flex gap-1 overflow-x-auto pb-1">
        {heatmap.map((week) => (
          <div key={week.id} className="flex flex-col gap-1">
            {week.days.map((cell: HeatCell) => (
              <div
                key={cell.id}
                title={`${cell.val} contribution${cell.val === 1 ? "" : "s"}`}
                className={cn("h-3 w-3 rounded-sm transition-colors", HEAT_COLORS[Math.min(cell.val, HEAT_COLORS.length - 1)])}
              />
            ))}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-end gap-1.5 mt-2">
        <span className="text-[10px] text-muted-foreground">Less</span>
        {HEAT_COLORS.map((c) => (
          <div key={c} className={cn("h-3 w-3 rounded-sm", c)} />
        ))}
        <span className="text-[10px] text-muted-foreground">More</span>
      </div>
    </div>
  )
}

function ProjectCard({ project: p, slug, colorClass }: Readonly<{ project: Project; slug: string; colorClass: string }>) {
  const done = p.totalIssues - p.openIssues
  const pct  = p.totalIssues > 0 ? Math.round((done / p.totalIssues) * 100) : 0
  return (
    <Link
      href={`/${slug}/projects/${p.id}`}
      className="rounded-xl border border-border bg-card p-4 [box-shadow:var(--shadow-sm)] flex flex-col gap-3 hover:border-primary/40 transition-colors"
    >
      <div className="flex items-start gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={cn("h-3 w-3 rounded-full shrink-0", colorClass)} />
          <span className="text-sm font-medium text-foreground truncate">{p.name}</span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          {/* Remplissage bleu de référence — la couleur projet reste portée par la pastille du titre */}
          <div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-blue-400 dark:from-blue-500 dark:to-blue-300" style={{ width: `${pct}%` }} />
        </div>
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>{done} / {p.totalIssues} issues</span>
          <span>{pct}%</span>
        </div>
      </div>
    </Link>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ProfilePage() {
  const { user } = useAuth()
  const params   = useParams()
  const slug     = typeof params.workspace === "string" ? params.workspace : ""
  const openSettings = useSettingsStore((s) => s.openSettings)

  const { projects, fetchProjects } = useProjectStore()
  const { stats, activity, heatmap, fetchProfile } = useProfileStore()

  useEffect(() => {
    if (slug) {
      void fetchProjects(slug)
      fetchProfile(slug).catch(console.error)
    }
  }, [slug, fetchProjects, fetchProfile])

  const displayName  = user?.displayName ?? (user ? `${user.firstName} ${user.lastName}` : "Your Name")
  const email        = user?.email ?? "you@taskforce.io"
  const plan         = user?.planType ?? "FREE"
  /** Palier payant. Le libellé vient de `planLabel()` — plus de littéral « Pro » : ce plan N'EXISTE PAS
   *  (les 4 tiers réels sont FREE / BASIC / BUSINESS / ENTERPRISE). C'était un vestige du modèle 3 tiers,
   *  affiché à 20 px de l'enum brut → le badge disait « Pro » pendant que la carte disait « BUSINESS ».
   *  Cf. TF-PLAN-PRO-GHOST. */
  const isPaid       = plan === "BASIC" || plan === "BUSINESS" || plan === "ENTERPRISE"

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto w-full">
      {/* Header card */}
      <div className="rounded-xl border border-border bg-card [box-shadow:var(--shadow-sm)] p-6">
        <div className="flex items-start gap-5">
          {/* Avatar */}
          <UserAvatar
            email={email}
            name={displayName}
            firstName={user?.firstName}
            lastName={user?.lastName}
            avatarUrl={user?.avatarUrl}
            className="h-20 w-20 shrink-0"
            fallbackClassName="text-2xl font-bold"
          />

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <h1 className="text-xl font-bold text-foreground">{displayName}</h1>
                <p className="text-sm text-muted-foreground">{email}</p>
              </div>
              <div className="flex items-center gap-2">
                {isPaid && (
                  <Badge variant="outline" className="bg-amber-500/15 text-amber-400 border-amber-500/20 gap-1 text-xs">
                    <Star className="h-3 w-3" />{planLabel(plan)}
                  </Badge>
                )}
                <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => openSettings("profile")}>
                  <Settings className="h-3.5 w-3.5" />
                  Modifier le profil
                </Button>
              </div>
            </div>

            {/* Meta row — RETIRÉE : « Paris, France · taskforce.io · Joined January 2025 » était codé en
                dur et servi à TOUS les utilisateurs (règle d'or n°7 : pas de mock). Aucun champ
                localisation / site / date d'inscription n'existe sur `User` — on ne remplace pas un
                mensonge par un autre. Ces champs reviendront avec l'onboarding, qui les collectera pour
                de vrai (cf. TF-ONBOARDING + la migration `company`/`location`/`website`). */}

            {/* Follow-style counters */}
            <div className="flex items-center gap-4 mt-4">
              <Link href={`/${slug}/members`} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <Users className="h-3.5 w-3.5" />
                <span className="font-medium text-foreground">{stats?.teammateCount ?? "—"}</span> teammates
              </Link>
              <Link href={`/${slug}/projects`} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <FolderKanban className="h-3.5 w-3.5" />
                <span className="font-medium text-foreground">{projects.length}</span> projects
              </Link>
              <Link href={`/${slug}/cycles`} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
                <GitCommitHorizontal className="h-3.5 w-3.5" />
                <span className="font-medium text-foreground">{stats?.cyclesCompleted ?? "—"}</span> cycles
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Issues created",   value: stats?.issuesCreated   ?? "—", icon: <CircleDot className="h-4 w-4" /> },
          { label: "Closed",           value: stats?.issuesClosed    ?? "—", icon: <CheckCircle2 className="h-4 w-4" /> },
          { label: "Cycles completed", value: stats?.cyclesCompleted ?? "—", icon: <GitCommitHorizontal className="h-4 w-4" /> },
          { label: "Days active",      value: stats?.daysActive      ?? "—", icon: <Clock className="h-4 w-4" /> },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-border bg-card p-4 [box-shadow:var(--shadow-sm)] flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">{stat.label}</span>
              <span className="text-muted-foreground">{stat.icon}</span>
            </div>
            <span className="text-2xl font-bold text-foreground tabular-nums">{stat.value}</span>
          </div>
        ))}
      </div>

      {/* Compétences & disponibilité — mêmes cartes que la fiche membre, montées ici sur SON propre
          profil. MBR-03 : l'éditeur de congés était absent de « Mon profil » car cette page
          (≠ /members/[id]) ne montait pas ces cartes. canEdit : c'est mon propre profil. */}
      {user && Number.isFinite(Number(user.id)) && (
        <div className="flex flex-col gap-6">
          <MemberSkillsCard slug={slug} userId={Number(user.id)} canEdit />
          <MemberAvailabilityCard slug={slug} userId={Number(user.id)} canEdit />
        </div>
      )}

      {/* Main 2-col layout */}
      <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-6">
        {/* Left column */}
        <div className="flex flex-col gap-6">
          {/* Activity graph */}
          <ContributionGraph heatmap={heatmap} />

          {/* Recent activity feed */}
          <div className="rounded-xl border border-border bg-card [box-shadow:var(--shadow-sm)]">
            <div className="px-5 py-4 border-b border-border/70">
              <h3 className="text-sm font-semibold text-foreground">Recent activity</h3>
            </div>
            <div className="divide-y divide-border/40">
              {activity.map((item) => {
                const meta = ACTIVITY_META[item.type] ?? ACTIVITY_FALLBACK
                return (
                  <div key={item.id} className="flex items-start gap-3 px-5 py-3">
                    {meta.icon}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-foreground truncate">
                        <span className="text-muted-foreground mr-1">{meta.label}</span>
                        <span className="text-muted-foreground font-mono text-xs mr-1">{item.issueIdentifier}</span>
                        {item.issueTitle}
                      </p>
                      <p className="text-xs text-muted-foreground/70 mt-0.5">
                        {relativeDate(item.createdAt)} · {item.projectName}
                      </p>
                    </div>
                  </div>
                )
              })}
              {activity.length === 0 && (
                <p className="px-5 py-6 text-sm text-muted-foreground text-center">Aucune activité récente.</p>
              )}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-6">
          {/* Projects */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Projets</h3>
              {/* Idem : `/projects` sans le workspace → 404. Le composant `ProjectCard` ci-dessus
                  construisait pourtant déjà `/${slug}/projects/${p.id}` correctement. */}
              <Link href={`/${slug}/projects`} className="text-xs text-primary hover:underline">Voir tout</Link>
            </div>
            {projects.slice(0, 3).map((p, idx) => (
              <ProjectCard
                key={p.id}
                project={p}
                slug={slug}
                colorClass={PROJECT_COLORS[idx % PROJECT_COLORS.length]}
              />
            ))}
          </div>

          <Separator />

          {/* Plan card */}
          <div className="rounded-xl border border-border bg-card [box-shadow:var(--shadow-sm)] p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Votre forfait</h3>
              {/* `planLabel` rend « Business » ; le `capitalize` CSS d'avant était un no-op sur « BUSINESS »
                  (il ne minusculise pas la suite) → d'où l'enum brut affiché en majuscules. */}
              <Badge
                variant="outline"
                className={cn(
                  "text-xs",
                  isPaid
                    ? "bg-amber-500/15 text-amber-400 border-amber-500/20"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {planLabel(plan)}
              </Badge>
            </div>
            {!isPaid && (
              <>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Passez à un forfait supérieur pour débloquer les analytics avancées, les intégrations et
                  l&apos;historique illimité.
                </p>
                <Button size="sm" className="h-8 text-xs w-full gap-1.5" asChild>
                  <Link href={`/${slug}/billing`}>
                    <Star className="h-3.5 w-3.5" />
                    Voir les forfaits
                  </Link>
                </Button>
              </>
            )}
            {isPaid && (
              <p className="text-xs text-muted-foreground">
                Forfait {planLabel(plan)} actif — toutes les fonctionnalités incluses sont débloquées.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
