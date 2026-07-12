"use client"

import { useState, useEffect, useRef } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import {
  User, Bell, CreditCard, Users, Check, Zap, Globe, Key, Palette, Webhook,
  X as XIcon, Plus, Upload, Camera, Link2, Trash2, Shield, Search, Loader2,
  Activity, CheckCircle2, AlertTriangle, Gauge,
} from "lucide-react"
import { toast } from "sonner"
import { useTheme } from "next-themes"

import { useTranslation } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { UserAvatar } from "@/components/ui/user-avatar"
import { Separator } from "@/components/ui/separator"
import { PageContainer, PageHeader } from "@/components/layout/page-shell"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAuth } from "@/lib/contexts/auth-context"
import { useUserStore } from "@/lib/store/user-store"
import { useWorkspaceStore } from "@/lib/store/workspace-store"
import { DeleteConfirmDialog } from "@/components/dialogs/delete-confirm-dialog"
import { stripeService, type SubscriptionInfo } from "@/lib/api/stripe-service"
import { useUpgradeStore } from "@/lib/store/upgrade-store"
import { getAuditLogs, type AuditLogEntry } from "@/lib/api/workspace-service"
import { useIntegrationStore } from "@/lib/store/integration-store"
import { getGitHubRepos, getGitHubRepoIssues, type GitHubRepo, type GitHubRepoIssue } from "@/lib/api/integration-service"
import { IntegrationsCatalog } from "@/components/integrations/integrations-catalog"
import { BrandLogo } from "@/components/ui/brand-logo"
import { exportMyData, deleteMyAccount } from "@/lib/api/gdpr-service"
import { getAiUsage, type AiUsage } from "@/lib/api/ai-usage-service"
import { apiClient } from "@/lib/api/client"
import { USER_ROUTES } from "@/lib/config/api-routes"
import { searchUsers, type UserSearchResult } from "@/lib/api/user-service"
import { cn } from "@/lib/utils"

export type SettingsSection =
  | "profile"
  | "account"
  | "appearance"
  | "notifications"
  | "security"
  | "workspace"
  | "billing"
  | "usage"
  | "status"
  | "integrations"
  | "privacy"

interface SectionConfig {
  key: SettingsSection
  label: string
  icon: React.ReactNode
  group: string
}

export const SECTIONS: SectionConfig[] = [
  { key: "profile",       label: "Profile",        icon: <User className="h-4 w-4" />,       group: "Personal" },
  { key: "account",       label: "Account",        icon: <Globe className="h-4 w-4" />,      group: "Personal" },
  { key: "appearance",    label: "Appearance",     icon: <Palette className="h-4 w-4" />,    group: "Personal" },
  { key: "notifications", label: "Notifications",  icon: <Bell className="h-4 w-4" />,       group: "Personal" },
  { key: "security",      label: "Security",       icon: <Key className="h-4 w-4" />,        group: "Personal" },
  { key: "workspace",     label: "General",        icon: <Globe className="h-4 w-4" />,      group: "Workspace" },
  { key: "billing",       label: "Billing & Plan", icon: <CreditCard className="h-4 w-4" />, group: "Workspace" },
  { key: "usage",         label: "Usage IA",       icon: <Gauge className="h-4 w-4" />,       group: "Workspace" },
  { key: "integrations",  label: "Integrations",   icon: <Webhook className="h-4 w-4" />,    group: "Workspace" },
  { key: "status",        label: "Status",         icon: <Activity className="h-4 w-4" />,    group: "Workspace" },
  { key: "privacy",       label: "Privacy & Data", icon: <Shield className="h-4 w-4" />,     group: "Personal" },
]

const PLAN_FEATURES: Record<string, string[]> = {
  free:       ["2 workspaces", "Jusqu'à 5 membres", "Board, List & Cycles", "Smart Assign de base", "Support communauté"],
  pro:        ["10 workspaces", "Jusqu'à 50 membres", "Analytics avancées + burndown", "Assistant IA & insights", "Intégrations (GitHub)", "Support prioritaire"],
  enterprise: ["Tout de Pro", "Membres illimités", "SSO / Keycloak", "Audit & RGPD avancés", "Déploiement on-premise", "SLA dédié"],
}

export const SECTION_GROUPS = [
  { label: "Personal",  keys: ["profile", "account", "appearance", "notifications", "security", "privacy"] as const },
  { label: "Workspace", keys: ["workspace", "billing", "usage", "integrations", "status"] as const },
]

const SKILL_OPTIONS = [
  "React", "TypeScript", "Vue", "Angular", "Node.js", "Java", "Spring",
  "Python", "PostgreSQL", "Docker", "UI/UX", "Design", "QA", "DevOps",
  "Product", "CSS", "Tailwind", "GraphQL", "REST API", "Security",
]

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

function FormField({ label, hint, children }: Readonly<{ label: string; hint?: string; children: React.ReactNode }>) {
  return (
    <div className="grid grid-cols-[180px_1fr] items-start gap-4">
      <div className="pt-2">
        <span className="text-sm font-medium text-foreground">{label}</span>
        {hint && <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{hint}</p>}
      </div>
      <div>{children}</div>
    </div>
  )
}

function SectionCard({ title, description, children, danger = false }: Readonly<{ title: string; description?: string; children: React.ReactNode; danger?: boolean }>) {
  return (
    <div className={cn(
      "rounded-xl border bg-card [box-shadow:var(--shadow-sm)]",
      danger ? "border-destructive/40" : "border-border"
    )}>
      <div className={cn(
        "px-5 py-4 border-b",
        danger ? "border-destructive/30 bg-destructive/5" : "border-border/70"
      )}>
        <h3 className={cn("text-sm font-semibold", danger ? "text-destructive" : "text-foreground")}>{title}</h3>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <div className="px-5 py-5">{children}</div>
    </div>
  )
}

function SkillsTagInput({ value, onChange }: Readonly<{ value: string[]; onChange: (v: string[]) => void }>) {
  const [input, setInput] = useState("")
  const available = SKILL_OPTIONS.filter(
    (s) => !value.includes(s) && s.toLowerCase().includes(input.toLowerCase())
  )

  function add(skill: string) {
    if (!value.includes(skill)) onChange([...value, skill])
    setInput("")
  }

  function remove(skill: string) {
    onChange(value.filter((s) => s !== skill))
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && input.trim()) {
      add(input.trim())
      e.preventDefault()
    } else if (e.key === "Backspace" && !input && value.length > 0) {
      remove(value.at(-1) as string)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-1 rounded-full bg-primary/15 border border-primary/30 px-2.5 py-0.5 text-xs text-primary font-medium"
            >
              {s}
              <button
                type="button"
                onClick={() => remove(s)}
                className="text-primary/60 hover:text-primary transition-colors ml-0.5"
              >
                <XIcon className="size-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center h-9 rounded-md border border-border bg-background px-3 gap-2 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/20 transition-all">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Type a skill or pick one below…"
          className="flex-1 text-sm text-foreground placeholder:text-muted-foreground outline-none bg-transparent"
        />
      </div>
      {available.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {available.slice(0, 12).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => add(s)}
              className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary hover:bg-primary/10 transition-colors"
            >
              <Plus className="size-2.5" />
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function StyledInput(props: Readonly<React.InputHTMLAttributes<HTMLInputElement>>) {
  return (
    <input
      {...props}
      className={cn(
        "h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all",
        props.readOnly && "bg-muted/40 text-muted-foreground cursor-default",
        props.className
      )}
    />
  )
}

// ---------------------------------------------------------------------------
// Panels
// ---------------------------------------------------------------------------

function ProfilePanel() {
  const { user, refreshUser } = useAuth()
  const { updateProfile } = useUserStore()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [firstName, setFirstName] = useState(user?.firstName ?? "")
  const [lastName, setLastName]   = useState(user?.lastName ?? "")
  const [displayName, setDisplayName] = useState(user?.displayName ?? "")
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? "")
  const [role, setRole] = useState("")
  const [skills, setSkills] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  useEffect(() => {
    if (user) {
      setFirstName(user.firstName)
      setLastName(user.lastName)
      setDisplayName(user.displayName)
      setAvatarUrl(user.avatarUrl ?? "")
    }
  }, [user])

  const hasCustomAvatar = Boolean(avatarUrl)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 3 * 1024 * 1024) {
      toast.error("Image trop volumineuse — max 3 Mo")
      return
    }
    setUploadingAvatar(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      const res = await apiClient.post<{ data: { avatarUrl: string } }>(USER_ROUTES.AVATAR, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      const newUrl = res.data.data.avatarUrl ?? ""
      setAvatarUrl(newUrl)
      toast.success("Avatar mis à jour")
    } catch {
      toast.error("Impossible d'uploader l'avatar")
    } finally {
      setUploadingAvatar(false)
      // reset input so the same file can be re-selected
      e.target.value = ""
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload: Record<string, string> = {}
      if (firstName !== user?.firstName)         payload.firstName   = firstName
      if (lastName !== user?.lastName)           payload.lastName    = lastName
      if (displayName !== user?.displayName)     payload.displayName = displayName
      if (avatarUrl !== (user?.avatarUrl ?? "")) payload.avatarUrl   = avatarUrl

      if (Object.keys(payload).length === 0) {
        toast.info("No changes to save")
        return
      }

      await updateProfile(payload)
      await refreshUser()
      toast.success("Profile updated")
    } catch {
      toast.error("Failed to update profile")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionCard title="Public profile" description="This information is visible to all workspace members.">
        <div className="flex flex-col gap-5">

          {/* ---- Avatar ---- */}
          <FormField label="Profile picture">
            <div className="flex items-center gap-4">
              {/* Avatar preview */}
              <div className="relative group shrink-0">
                <UserAvatar
                  email={user?.email}
                  name={displayName}
                  firstName={firstName}
                  lastName={lastName}
                  avatarUrl={avatarUrl || null}
                  className="h-14 w-14"
                  imageClassName="object-cover"
                />
                {/* Overlay camera au hover */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute inset-0 rounded-full flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Camera className="h-4 w-4 text-white" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/gif,image/webp"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>

              {/* Actions + URL input */}
              <div className="flex-1 flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1.5"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploadingAvatar}
                  >
                    {uploadingAvatar
                      ? <><span className="h-3 w-3 animate-spin rounded-full border border-current border-t-transparent" />Uploading…</>
                      : <><Upload className="h-3 w-3" />Upload image</>}
                  </Button>
                  {hasCustomAvatar && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs text-muted-foreground"
                      onClick={() => setAvatarUrl("")}
                    >
                      Remove
                    </Button>
                  )}
                </div>
                <StyledInput
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  placeholder="Or paste a URL…"
                />
                <p className="text-xs text-muted-foreground">JPG, PNG, GIF, WEBP — max 3 Mo</p>
              </div>
            </div>
          </FormField>

          <Separator />

          <FormField label="First name">
            <StyledInput value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="First name" />
          </FormField>
          <FormField label="Last name">
            <StyledInput value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Last name" />
          </FormField>
          <FormField label="Display name" hint="Shown across Taskforce. Defaults to First + Last.">
            <StyledInput value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder={`${firstName} ${lastName}`.trim() || "Display name"} />
          </FormField>
          <FormField label="Email" hint="Managed via your identity provider.">
            <StyledInput type="email" value={user?.email ?? ""} readOnly />
          </FormField>

          <Separator />

          <FormField label="Role / Title" hint="Shown to team members.">
            <StyledInput value={role} onChange={(e) => setRole(e.target.value)} placeholder="e.g. Lead Engineer" />
          </FormField>
          <FormField label="Skills" hint="Used for smart issue assignment.">
            <SkillsTagInput value={skills} onChange={setSkills} />
          </FormField>
        </div>
      </SectionCard>
      <div className="flex justify-end">
        <Button size="sm" className="h-8 text-xs" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save profile"}
        </Button>
      </div>
    </div>
  )
}

function AccountPanel() {
  const { user } = useAuth()
  const { locale, setLocale } = useTranslation()
  // Timezone : pas d'endpoint dédié → préférence client persistée localement (init paresseuse).
  const [timezone, setTimezone] = useState<string>(() => {
    if (globalThis.window === undefined) return "Europe/Paris"
    return localStorage.getItem("tf-timezone") ?? "Europe/Paris"
  })
  const [deleting, setDeleting] = useState(false)

  function handleSave() {
    localStorage.setItem("tf-timezone", timezone)
    toast.success("Préférences du compte enregistrées")
  }

  async function handleDelete() {
    if (globalThis.window !== undefined && !window.confirm("Supprimer définitivement votre compte ? Cette action est irréversible.")) return
    setDeleting(true)
    try {
      await deleteMyAccount()
      toast.success("Compte supprimé. Déconnexion…")
    } catch {
      toast.error("Échec de la suppression. Réessayez ou contactez privacy@taskforce.dev.")
      setDeleting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionCard title="Account info" description="Manage your login and localization preferences.">
        <div className="flex flex-col gap-5">
          <FormField label="Email" hint="Managed via your identity provider.">
            <StyledInput type="email" value={user?.email ?? ""} readOnly />
          </FormField>
          <Separator />
          <FormField label="Language" hint="Applied immediately across the app.">
            <Select value={locale} onValueChange={(v) => setLocale(v as "en" | "fr")}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="fr">Français</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Timezone">
            <Select value={timezone} onValueChange={setTimezone}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Europe/Paris">Europe/Paris (UTC+1)</SelectItem>
                <SelectItem value="America/New_York">America/New_York (UTC-5)</SelectItem>
                <SelectItem value="UTC">UTC</SelectItem>
              </SelectContent>
            </Select>
          </FormField>
        </div>
      </SectionCard>
      <SectionCard danger title="Danger zone" description="Irreversible actions. Proceed with caution.">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Delete your account</p>
            <p className="text-xs text-muted-foreground mt-0.5">Permanently delete your account and all associated data.</p>
          </div>
          <Button variant="destructive" size="sm" className="h-8 text-xs shrink-0" onClick={handleDelete} disabled={deleting}>
            {deleting ? "Suppression…" : "Delete account"}
          </Button>
        </div>
      </SectionCard>
      <div className="flex justify-end">
        <Button size="sm" className="h-8 text-xs" onClick={handleSave}>Save changes</Button>
      </div>
    </div>
  )
}

function AppearancePanel() {
  // Source de vérité du thème = next-themes (cf. app/layout.tsx). Appliqué et persisté en direct.
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  // Pattern next-themes : on attend le montage pour éviter un mismatch d'hydratation.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), [])
  const current = mounted ? (theme ?? "system") : "system"

  return (
    <div className="flex flex-col gap-4">
      <SectionCard title="Theme" description="S'applique immédiatement et reste mémorisé.">
        <div className="flex gap-3">
          {(["system", "light", "dark"] as const).map((opt) => (
            <button
              key={opt}
              onClick={() => setTheme(opt)}
              className={cn(
                "flex flex-col items-center gap-2 rounded-lg border-2 p-3 transition-all capitalize",
                current === opt ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"
              )}
            >
              <div
                className={cn(
                  "h-8 w-12 rounded",
                  opt === "light" && "bg-white border border-border",
                  opt === "dark" && "bg-zinc-900",
                  opt === "system" && "bg-gradient-to-r from-white to-zinc-900 border border-border"
                )}
              />
              <span className="text-xs font-medium text-foreground">{opt}</span>
            </button>
          ))}
        </div>
      </SectionCard>
    </div>
  )
}

const NOTIF_DEFAULTS = {
  mentions:      true,
  assignments:   true,
  comments:      true,
  statusChanges: false,
  dueSoon:       true,
  weeklyDigest:  false,
}

function NotificationsPanel() {
  // Pas d'endpoint dédié → préférences persistées côté client (init paresseuse, restent après reload).
  const [prefs, setPrefs] = useState<typeof NOTIF_DEFAULTS>(() => {
    if (globalThis.window === undefined) return NOTIF_DEFAULTS
    try {
      const saved = localStorage.getItem("tf-notif-prefs")
      return saved ? { ...NOTIF_DEFAULTS, ...JSON.parse(saved) } : NOTIF_DEFAULTS
    } catch { return NOTIF_DEFAULTS }
  })

  const rows: { key: keyof typeof prefs; label: string; desc: string }[] = [
    { key: "mentions",      label: "Mentions",       desc: "When someone @mentions you" },
    { key: "assignments",   label: "Assignments",    desc: "When an issue is assigned to you" },
    { key: "comments",      label: "Comments",       desc: "When someone comments on your issues" },
    { key: "statusChanges", label: "Status changes", desc: "When an issue you own changes status" },
    { key: "dueSoon",       label: "Due soon",       desc: "1 day before an issue is due" },
    { key: "weeklyDigest",  label: "Weekly digest",  desc: "Summary email every Monday" },
  ]

  function toggle(key: keyof typeof prefs) {
    setPrefs((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  function handleSave() {
    localStorage.setItem("tf-notif-prefs", JSON.stringify(prefs))
    toast.success("Préférences de notification enregistrées")
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionCard title="Email notifications" description="Choose which events trigger an email.">
        <div className="flex flex-col divide-y divide-border/50">
          {rows.map((row) => (
            <div key={row.key} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
              <div>
                <p className="text-sm font-medium text-foreground">{row.label}</p>
                <p className="text-xs text-muted-foreground">{row.desc}</p>
              </div>
              <Switch checked={prefs[row.key]} onCheckedChange={() => toggle(row.key)} />
            </div>
          ))}
        </div>
      </SectionCard>
      <div className="flex justify-end">
        <Button size="sm" className="h-8 text-xs" onClick={handleSave}>Save preferences</Button>
      </div>
    </div>
  )
}

function SecurityPanel() {
  // Auth déléguée à Keycloak (OIDC) — pas de fabrication d'infos ici (QA Q-17).
  const items = [
    { icon: <Key className="size-4 text-muted-foreground" />,    title: "Mot de passe",                 desc: "Modifiable depuis la console « Mon compte » de Keycloak." },
    { icon: <Shield className="size-4 text-muted-foreground" />, title: "Double authentification (2FA)", desc: "Activez un authenticator (TOTP) depuis votre compte Keycloak." },
    { icon: <Globe className="size-4 text-muted-foreground" />,  title: "Sessions actives",              desc: "Vos sessions sont gérées de façon centralisée par Keycloak." },
  ]
  return (
    <div className="flex flex-col gap-4">
      <SectionCard
        title="Authentification & sécurité"
        description="Votre identité est gérée par Keycloak (fournisseur OIDC). Le mot de passe, la 2FA et les sessions se gèrent dans votre compte Keycloak."
      >
        <div className="flex flex-col divide-y divide-border/50">
          {items.map((it) => (
            <div key={it.title} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
              <span className="mt-0.5 shrink-0">{it.icon}</span>
              <div>
                <p className="text-sm font-medium text-foreground">{it.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{it.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  )
}

function BillingPanel() {
  const { user } = useAuth()
  const plan = (user?.planType ?? "FREE") as string
  const [portalLoading, setPortalLoading] = useState(false)
  const [sub, setSub] = useState<SubscriptionInfo | null>(null)
  const openUpgrade = useUpgradeStore((s) => s.openUpgrade)

  // Vraie info d'abonnement (date de renouvellement réelle, pas codée en dur). QA Q-19
  useEffect(() => {
    if (plan === "FREE") return
    let active = true
    stripeService.getSubscriptionInfo()
      .then((s) => { if (active) setSub(s) })
      .catch(() => { /* non bloquant — fallback message générique */ })
    return () => { active = false }
  }, [plan])

  const renewLabel = (() => {
    if (plan === "FREE") return "No active subscription"
    if (!sub?.currentPeriodEnd) return "Abonnement actif"
    const date = new Date(sub.currentPeriodEnd).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
    return sub.cancelAtPeriodEnd ? `Se termine le ${date}` : `Renouvellement le ${date}`
  })()

  async function handleManageBilling() {
    setPortalLoading(true)
    try {
      await stripeService.openBillingPortal() // redirige vers Stripe
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Impossible d'ouvrir le portail de facturation")
      setPortalLoading(false)
    }
  }

  const PLANS = [
    { key: "FREE",       label: "Free",       price: "$0",     features: PLAN_FEATURES.free,       highlight: false },
    { key: "PRO",        label: "Pro",        price: "$12/mo", features: PLAN_FEATURES.pro,        highlight: true  },
    { key: "ENTERPRISE", label: "Enterprise", price: "Custom", features: PLAN_FEATURES.enterprise, highlight: false },
  ]

  return (
    <div className="flex flex-col gap-4">
      <SectionCard title="Current plan" description="You can upgrade or downgrade at any time.">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold capitalize text-foreground">{plan}</span>
              {plan !== "FREE" && (
                <Badge variant="outline" className="bg-amber-500/15 text-amber-400 border-amber-500/20 text-xs">
                  <Zap className="h-3 w-3 mr-1" />Active
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">{renewLabel}</p>
          </div>
          {plan !== "FREE" && (
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={handleManageBilling}
              disabled={portalLoading}
            >
              {portalLoading ? "Ouverture…" : "Gérer la facturation"}
            </Button>
          )}
        </div>
      </SectionCard>
      <SectionCard title="Plans" description="Choose the plan that fits your team.">
        <div className="grid grid-cols-3 gap-3">
          {PLANS.map((p) => (
            <div
              key={p.key}
              className={cn(
                "rounded-lg border p-4 flex flex-col gap-3 transition-all",
                p.highlight ? "border-primary/40 bg-primary/5" : "border-border bg-background",
                plan === p.key && "ring-1 ring-primary"
              )}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">{p.label}</p>
                  <p className="text-xs font-medium text-primary mt-0.5">{p.price}</p>
                </div>
                {plan === p.key && <Check className="h-4 w-4 text-emerald-400 shrink-0" />}
              </div>
              <ul className="flex flex-col gap-1">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <Check className="h-3 w-3 text-emerald-400 shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>
              {plan !== p.key && (
                p.key === "ENTERPRISE" ? (
                  <Button asChild size="sm" variant="outline" className="h-7 text-xs mt-auto">
                    <a href="mailto:sales@taskforce.dev?subject=Demande%20Enterprise%20TaskForce">Contact sales</a>
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant={p.highlight ? "default" : "outline"}
                    className="h-7 text-xs mt-auto"
                    onClick={() => openUpgrade()}
                  >
                    Upgrade
                  </Button>
                )
              )}
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  )
}

function WorkspacePanel() {
  const router = useRouter()
  const { activeWorkspace, updateWorkspaceInfo, deleteCurrentWorkspace } = useWorkspaceStore()
  const currentUser = useUserStore((s) => s.user)
  const [name,        setName]        = useState(activeWorkspace?.name ?? "")
  const [description, setDescription] = useState(activeWorkspace?.description ?? "")
  const [saving, setSaving] = useState(false)

  const isOwner = !!activeWorkspace && activeWorkspace.ownerId === Number(currentUser?.id)

  async function handleDeleteWorkspace() {
    if (!activeWorkspace) return
    try {
      const next = await deleteCurrentWorkspace(activeWorkspace.slug)
      toast.success("Workspace supprimé")
      router.push(next ? `/${next}/dashboard` : "/")
    } catch {
      toast.error("Impossible de supprimer le workspace (réservé au propriétaire)")
    }
  }

  useEffect(() => {
    if (activeWorkspace) {
      setName(activeWorkspace.name)
      setDescription(activeWorkspace.description ?? "")
    }
  }, [activeWorkspace])

  async function handleSave() {
    setSaving(true)
    try {
      const payload: { name?: string; description?: string } = {}
      if (name !== activeWorkspace?.name)                       payload.name        = name
      if (description !== (activeWorkspace?.description ?? "")) payload.description = description
      if (Object.keys(payload).length === 0) { toast.info("No changes to save"); return }
      await updateWorkspaceInfo(payload)
      toast.success("Workspace updated")
    } catch {
      toast.error("Failed to update workspace")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionCard title="Workspace settings" description="Manage your workspace name and description.">
        <div className="flex flex-col gap-5">
          <FormField label="Workspace name">
            <StyledInput
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Workspace"
            />
          </FormField>
          <FormField label="Description" hint="Optional — shown to workspace members.">
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe your workspace…"
              rows={3}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all resize-none"
            />
          </FormField>
          <FormField label="Slug">
            <StyledInput value={activeWorkspace?.slug ?? ""} readOnly />
          </FormField>
          <div className="flex justify-end">
            <Button size="sm" className="h-8 text-xs" disabled={saving || !name.trim()} onClick={handleSave}>
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </div>
      </SectionCard>

      {isOwner && (
        <SectionCard danger title="Danger zone" description="Actions irréversibles. À utiliser avec précaution.">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">Supprimer ce workspace</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Supprime définitivement le workspace et toutes ses données (projets, issues, équipes…).
              </p>
            </div>
            <DeleteConfirmDialog
              title="Supprimer le workspace ?"
              description={`« ${activeWorkspace?.name} » et toutes ses données seront définitivement supprimés. Cette action est irréversible.`}
              confirmLabel="Supprimer le workspace"
              onConfirm={handleDeleteWorkspace}
            >
              <Button variant="destructive" size="sm" className="h-8 shrink-0 text-xs">
                Supprimer
              </Button>
            </DeleteConfirmDialog>
          </div>
        </SectionCard>
      )}
    </div>
  )
}


// ── Status (santé de l'app, façon status page) ──────────────────────────────
function StatusPanel() {
  const [api, setApi] = useState<"checking" | "ok" | "down">("checking")
  const slug = useWorkspaceStore((s) => s.activeWorkspace?.slug)
  const [logs, setLogs] = useState<AuditLogEntry[]>([])

  useEffect(() => {
    let alive = true
    // Probe robuste : on réessaie avant de déclarer l'API « injoignable »
    // (évite un faux « Incident » lors d'un hiccup réseau / redémarrage). QA Q-20
    async function probe() {
      for (let attempt = 1; attempt <= 3 && alive; attempt++) {
        try {
          await apiClient.get("/api/workspaces/current")
          if (alive) setApi("ok")
          return
        } catch {
          if (attempt === 3) { if (alive) setApi("down"); return }
          await new Promise((r) => setTimeout(r, 1500))
        }
      }
    }
    void probe()
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (!slug) return
    let alive = true
    getAuditLogs(slug).then((l) => { if (alive) setLogs(l) }).catch(() => { /* OWNER/ADMIN only */ })
    return () => { alive = false }
  }, [slug])

  function exportAuditCsv() {
    const esc = (v: unknown) => `"${String(v ?? "").replaceAll('"', '""')}"`
    const header = "date,action,entityType,entityId,actorUserId,details"
    const lines = logs.map((l) => [l.createdAt, l.action, l.entityType, l.entityId, l.actorUserId, l.details].map(esc).join(","))
    const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `audit-${slug ?? "workspace"}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const rows: { name: string; ok: boolean; detail: string }[] = [
    { name: "Application (interface)", ok: true,            detail: "Chargée" },
    { name: "API Taskforce",          ok: api !== "down",   detail: api === "checking" ? "Vérification…" : api === "ok" ? "Opérationnelle" : "Injoignable" },
    { name: "Temps réel (STOMP)",     ok: api !== "down",   detail: api === "checking" ? "Vérification…" : api === "ok" ? "Disponible via l'API" : "Indisponible" },
    { name: "Assistant IA (Groq)",    ok: true,             detail: "Configuré (côté serveur)" },
  ]
  const allOk = rows.every((r) => r.ok)

  return (
    <div className="flex flex-col gap-5 max-w-2xl">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Statut de l&apos;application</h2>
        <p className="text-xs text-muted-foreground mt-0.5">État des services en temps réel.</p>
      </div>

      <div className={cn(
        "flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium",
        allOk ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500" : "border-amber-500/30 bg-amber-500/10 text-amber-500"
      )}>
        {allOk ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
        {allOk ? "Tous les systèmes sont opérationnels" : "Incident en cours sur un ou plusieurs services"}
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden [box-shadow:var(--shadow-sm)]">
        {rows.map((r, i) => (
          <div key={r.name} className={cn("flex items-center gap-3 px-4 py-3", i < rows.length - 1 && "border-b border-border/50")}>
            <span className={cn("size-2 rounded-full shrink-0", r.ok ? "bg-emerald-500" : "bg-amber-500")} />
            <span className="flex-1 text-sm text-foreground">{r.name}</span>
            <span className="text-xs text-muted-foreground">{r.detail}</span>
          </div>
        ))}
      </div>

      {/* Journal d'audit (OWNER/ADMIN) + export CSV */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Journal d&apos;audit</h3>
          <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={exportAuditCsv} disabled={logs.length === 0}>
            <Upload className="h-3.5 w-3.5" /> Exporter CSV
          </Button>
        </div>
        <div className="rounded-xl border border-border bg-card overflow-hidden [box-shadow:var(--shadow-sm)]">
          {logs.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-muted-foreground">Aucune entrée d&apos;audit (réservé aux administrateurs).</p>
          ) : (
            logs.slice(0, 30).map((l, i) => (
              <div key={l.id} className={cn("flex items-center gap-3 px-4 py-2.5", i < Math.min(logs.length, 30) - 1 && "border-b border-border/50")}>
                <Badge variant="secondary" className="shrink-0 font-mono text-[10px]">{l.action}</Badge>
                <span className="flex-1 truncate text-xs text-muted-foreground">
                  {l.entityType ? `${l.entityType}${l.entityId ? ` #${l.entityId}` : ""}` : (l.details ?? "—")}
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground/70">
                  {new Date(l.createdAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

/** Parcours des dépôts GitHub connectés + leurs issues/PR (PROD-5.1 sync read). */
function GitHubRepoBrowser({ slug }: { readonly slug: string }) {
  const [repos, setRepos] = useState<GitHubRepo[]>([])
  const [repo, setRepo] = useState<string>("")
  const [issues, setIssues] = useState<GitHubRepoIssue[]>([])
  const [loadingRepos, setLoadingRepos] = useState(false)
  const [loadingIssues, setLoadingIssues] = useState(false)

  useEffect(() => {
    let active = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingRepos(true)
    getGitHubRepos(slug)
      .then((r) => { if (active) setRepos(r) })
      .catch(() => { if (active) toast.error("Impossible de charger les dépôts GitHub") })
      .finally(() => { if (active) setLoadingRepos(false) })
    return () => { active = false }
  }, [slug])

  function selectRepo(full: string) {
    setRepo(full)
    setIssues([])
    if (!full) return
    setLoadingIssues(true)
    getGitHubRepoIssues(slug, full)
      .then(setIssues)
      .catch(() => toast.error("Impossible de charger les issues du dépôt"))
      .finally(() => setLoadingIssues(false))
  }

  return (
    <div className="mt-4 flex flex-col gap-3 border-t border-border/50 pt-4">
      <div className="flex items-center gap-2">
        <p className="text-xs font-medium text-muted-foreground">Parcourir un dépôt</p>
        {loadingRepos && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
      </div>
      <Select value={repo} onValueChange={selectRepo}>
        <SelectTrigger className="h-9"><SelectValue placeholder="Choisir un dépôt…" /></SelectTrigger>
        <SelectContent>
          {repos.map((r) => (
            <SelectItem key={r.fullName} value={r.fullName}>
              {r.fullName}{r.isPrivate ? " 🔒" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {loadingIssues && <p className="text-xs text-muted-foreground">Chargement des issues…</p>}
      {!loadingIssues && repo && issues.length === 0 && (
        <p className="text-xs text-muted-foreground italic">Aucune issue / PR.</p>
      )}
      {issues.length > 0 && (
        <div className="max-h-64 divide-y divide-border/50 overflow-y-auto rounded-lg border border-border">
          {issues.map((i) => (
            <a
              key={i.number}
              href={i.htmlUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-muted/40"
            >
              <Badge variant="outline" className={cn("h-4 px-1.5 text-[10px]", i.pullRequest ? "text-violet-400 border-violet-500/30" : "text-muted-foreground")}>
                {i.pullRequest ? "PR" : "Issue"} #{i.number}
              </Badge>
              <span className="flex-1 truncate text-foreground">{i.title}</span>
              <span className={cn("text-[10px]", i.state === "open" ? "text-emerald-400" : "text-muted-foreground")}>{i.state}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

function IntegrationsPanel() {
  const { activeWorkspace } = useWorkspaceStore()
  const slug = activeWorkspace?.slug ?? ""
  const {
    githubStatus, slackStatus, slackChannels, webhooks,
    fetchGitHubStatus, connectGitHub, disconnectGitHub,
    fetchSlackStatus, connectSlack, disconnectSlack,
    fetchSlackChannels, addSlackChannel, removeSlackChannel,
    fetchWebhooks, addWebhook, removeWebhook,
  } = useIntegrationStore()

  // Démarrage OAuth (XHR → URL → navigation vers GitHub/Slack). Sur succès la page quitte,
  // donc on ne réinitialise l'état de chargement qu'en cas d'échec.
  const [connectingGitHub, setConnectingGitHub] = useState(false)
  const [connectingSlack,  setConnectingSlack]  = useState(false)

  async function handleConnectGitHub() {
    setConnectingGitHub(true)
    try {
      await connectGitHub(slug)
    } catch {
      toast.error("Impossible de démarrer la connexion GitHub")
      setConnectingGitHub(false)
    }
  }

  async function handleConnectSlack() {
    setConnectingSlack(true)
    try {
      await connectSlack(slug)
    } catch {
      toast.error("Impossible de démarrer la connexion Slack")
      setConnectingSlack(false)
    }
  }

  // Slack channel form
  const [channelId,   setChannelId]   = useState("")
  const [channelName, setChannelName] = useState("")
  const [addingChannel, setAddingChannel] = useState(false)

  // Webhook form
  const [webhookUrl,    setWebhookUrl]    = useState("")
  const [webhookEvents, setWebhookEvents] = useState<string[]>(["issue.created"])
  const [addingWebhook, setAddingWebhook] = useState(false)

  const ALL_EVENTS = ["issue.created", "issue.updated", "issue.deleted", "cycle.completed", "comment.created"]

  useEffect(() => {
    if (!slug) return
    fetchGitHubStatus(slug).catch(() => null)
    fetchSlackStatus(slug).catch(() => null)
    fetchWebhooks(slug).catch(() => null)
  }, [slug, fetchGitHubStatus, fetchSlackStatus, fetchWebhooks])

  useEffect(() => {
    if (slug && slackStatus?.connected) {
      fetchSlackChannels(slug).catch(() => null)
    }
  }, [slug, slackStatus?.connected, fetchSlackChannels])

  async function handleDisconnectGitHub() {
    try {
      await disconnectGitHub(slug)
      toast.success("GitHub déconnecté")
    } catch {
      toast.error("Impossible de déconnecter GitHub")
    }
  }

  async function handleDisconnectSlack() {
    try {
      await disconnectSlack(slug)
      toast.success("Slack déconnecté")
    } catch {
      toast.error("Impossible de déconnecter Slack")
    }
  }

  async function handleAddChannel() {
    if (!channelId.trim() || !channelName.trim()) return
    setAddingChannel(true)
    try {
      await addSlackChannel(slug, { channelId: channelId.trim(), channelName: channelName.trim(), eventTypes: ["issue.created"] })
      setChannelId("")
      setChannelName("")
      toast.success("Canal Slack ajouté")
    } catch {
      toast.error("Impossible d'ajouter le canal")
    } finally {
      setAddingChannel(false)
    }
  }

  async function handleAddWebhook() {
    if (!webhookUrl.trim()) return
    setAddingWebhook(true)
    try {
      await addWebhook(slug, { url: webhookUrl.trim(), eventTypes: webhookEvents })
      setWebhookUrl("")
      toast.success("Webhook ajouté")
    } catch {
      toast.error("URL invalide ou inaccessible")
    } finally {
      setAddingWebhook(false)
    }
  }

  function toggleEvent(event: string) {
    setWebhookEvents((prev) =>
      prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ---- Catalogue (le pool générique) ---- */}
      <SectionCard title="Catalogue d'intégrations" description="Branchez vos outils sur le Brain OS. Un clic pour l'OAuth, sinon une clé API (aide ⓘ au survol).">
        {slug && <IntegrationsCatalog slug={slug} />}
      </SectionCard>

      {/* ---- GitHub ---- */}
      <SectionCard title="GitHub" description="Link issues to pull requests and commits.">
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted p-2">
            <BrandLogo slug="github" name="GitHub" className="size-full" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">GitHub</p>
            {githubStatus?.connected && githubStatus.meta?.login && (
              <p className="text-xs text-muted-foreground">Connected as <span className="font-medium">@{githubStatus.meta.login}</span></p>
            )}
            {!githubStatus?.connected && (
              <p className="text-xs text-muted-foreground">Not connected</p>
            )}
          </div>
          {githubStatus?.connected ? (
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-500/20 bg-emerald-500/10">Connected</Badge>
              <Button variant="outline" size="sm" className="h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/10" onClick={handleDisconnectGitHub}>
                Disconnect
              </Button>
            </div>
          ) : (
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleConnectGitHub} disabled={connectingGitHub}>
              <Link2 className="h-3 w-3 mr-1.5" />{connectingGitHub ? "Connexion…" : "Connect"}
            </Button>
          )}
        </div>
        {githubStatus?.connected && <GitHubRepoBrowser slug={slug} />}
      </SectionCard>

      {/* ---- Slack ---- */}
      <SectionCard title="Slack" description="Connectez votre espace Slack pour recevoir les notifications d'activité.">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted p-2">
              <BrandLogo slug="slack" name="Slack" className="size-full" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">Slack</p>
              {slackStatus?.connected && slackStatus.meta?.teamName && (
                <p className="text-xs text-muted-foreground">Connected to <span className="font-medium">{slackStatus.meta.teamName}</span></p>
              )}
              {!slackStatus?.connected && (
                <p className="text-xs text-muted-foreground">Not connected</p>
              )}
            </div>
            {slackStatus?.connected ? (
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-500/20 bg-emerald-500/10">Connected</Badge>
                <Button variant="outline" size="sm" className="h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/10" onClick={handleDisconnectSlack}>
                  Disconnect
                </Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleConnectSlack} disabled={connectingSlack}>
                <Link2 className="h-3 w-3 mr-1.5" />{connectingSlack ? "Connexion…" : "Connect"}
              </Button>
            )}
          </div>

          {/* Slack channels — shown only when connected */}
          {slackStatus?.connected && (
            <>
              <Separator />
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium text-foreground">Notification channels</p>
                {slackChannels.length === 0 && (
                  <p className="text-xs text-muted-foreground">No channels configured yet.</p>
                )}
                {slackChannels.map((ch) => (
                  <div key={ch.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                    <div>
                      <p className="text-sm font-medium text-foreground">#{ch.channelName}</p>
                      <p className="text-xs text-muted-foreground">{ch.eventTypes.join(", ")}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:bg-destructive/10"
                        onClick={async () => {
                          try { await removeSlackChannel(slug, ch.id); toast.success("Canal supprimé") }
                          catch { toast.error("Impossible de supprimer le canal") }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
                {/* Add channel form */}
                <div className="flex gap-2 mt-1">
                  <StyledInput
                    placeholder="Channel ID (e.g. C0123456789)"
                    value={channelId}
                    onChange={(e) => setChannelId(e.target.value)}
                  />
                  <StyledInput
                    placeholder="Channel name"
                    value={channelName}
                    onChange={(e) => setChannelName(e.target.value)}
                  />
                  <Button size="sm" className="h-9 text-xs shrink-0" onClick={handleAddChannel} disabled={addingChannel || !channelId || !channelName}>
                    {addingChannel ? "Adding…" : "Add"}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </SectionCard>

      {/* ---- Webhooks ---- */}
      <SectionCard title="Webhooks" description="Receive HTTP POST events for workspace activity.">
        <div className="flex flex-col gap-3">
          {webhooks.length > 0 && (
            <div className="flex flex-col gap-2 mb-1">
              {webhooks.map((wh) => (
                <div key={wh.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                  <div className="min-w-0 mr-2">
                    <p className="text-sm font-mono text-foreground truncate">{wh.url}</p>
                    <p className="text-xs text-muted-foreground">{wh.eventTypes.join(", ")}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {wh.lastStatus && (
                      <Badge variant="outline" className={cn("text-xs", wh.lastStatus < 300 ? "text-emerald-400 border-emerald-500/20" : "text-destructive border-destructive/20")}>
                        {wh.lastStatus}
                      </Badge>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:bg-destructive/10"
                      onClick={async () => {
                        try { await removeWebhook(slug, wh.id); toast.success("Webhook supprimé") }
                        catch { toast.error("Impossible de supprimer le webhook") }
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <StyledInput
              type="url"
              placeholder="https://example.com/webhook"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
            />
            <Button size="sm" className="h-9 text-xs shrink-0" disabled={!webhookUrl || addingWebhook} onClick={handleAddWebhook}>
              {addingWebhook ? "Adding…" : "Add webhook"}
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {ALL_EVENTS.map((event) => (
              <button
                key={event}
                type="button"
                onClick={() => toggleEvent(event)}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs transition-colors",
                  webhookEvents.includes(event)
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/30"
                )}
              >
                {event}
              </button>
            ))}
          </div>
        </div>
      </SectionCard>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Privacy & Data Panel (RGPD)
// ---------------------------------------------------------------------------

function PrivacyPanel() {
  const [loading, setLoading] = useState<"ACCESS" | "DELETION" | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  const handleExport = async () => {
    setLoading("ACCESS")
    try {
      const data = await exportMyData()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "taskforce-mes-donnees.json"
      a.click()
      URL.revokeObjectURL(url)
      toast.success("Vos données ont été exportées (téléchargement JSON).")
    } catch {
      toast.error("Échec de l'export. Réessayez ou contactez privacy@taskforce.dev.")
    } finally {
      setLoading(null)
    }
  }

  const handleDelete = async () => {
    setLoading("DELETION")
    try {
      await deleteMyAccount()
      toast.success("Compte anonymisé. Déconnexion…")
      setTimeout(() => { window.location.href = "/login" }, 1200)
    } catch {
      toast.error("Échec de la suppression. Réessayez ou contactez privacy@taskforce.dev.")
      setLoading(null)
      setDeleteConfirm(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionCard title="Your data" description="Understand what personal data TaskForce stores about you.">
        <ul className="text-sm text-muted-foreground space-y-1.5">
          <li>• <strong className="text-foreground">Account</strong>: name, email, profile picture</li>
          <li>• <strong className="text-foreground">Workspace activity</strong>: issues, projects, comments, pages</li>
          <li>• <strong className="text-foreground">Authentication tokens</strong>: stored in your browser&apos;s local storage (never shared)</li>
          <li>• <strong className="text-foreground">Billing</strong>: subscription plan status (card details are held by Stripe only)</li>
        </ul>
        <p className="text-xs text-muted-foreground mt-3">
          Read our full{" "}
          <a href="/privacy-policy" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 text-foreground hover:text-primary">
            Privacy Policy
          </a>
          .
        </p>
      </SectionCard>

      <SectionCard title="Request your data" description="Receive a full export of all personal data we hold about you.">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-foreground">Export my data</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Téléchargez immédiatement un export JSON de vos données personnelles (RGPD Art. 20 — portabilité).
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 h-8 text-xs"
            disabled={loading === "ACCESS"}
            onClick={handleExport}
          >
            {loading === "ACCESS" ? "Export…" : "Exporter mes données"}
          </Button>
        </div>
      </SectionCard>

      <SectionCard title="Delete account" description="Permanently remove your account and all associated data.">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-foreground">Delete my account</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Vos données personnelles seront anonymisées et votre accès coupé immédiatement (RGPD Art. 17 — droit à l&apos;effacement). Action irréversible.
            </p>
          </div>
          {!deleteConfirm ? (
            <Button
              variant="destructive"
              size="sm"
              className="shrink-0 h-8 text-xs"
              onClick={() => setDeleteConfirm(true)}
            >
              Delete account
            </Button>
          ) : (
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => setDeleteConfirm(false)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                className="h-8 text-xs"
                disabled={loading === "DELETION"}
                onClick={handleDelete}
              >
                {loading === "DELETION" ? "Traitement…" : "Confirmer la suppression"}
              </Button>
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Usage IA Panel (conso tokens réelle du mois vs plafond du plan)
// ---------------------------------------------------------------------------

function MiniStat({ label, value }: Readonly<{ label: string; value: number }>) {
  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2.5">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">{value.toLocaleString("fr-FR")}</p>
    </div>
  )
}

function UsagePanel() {
  const slug = useWorkspaceStore((s) => s.activeWorkspace?.slug)
  const openUpgrade = useUpgradeStore((s) => s.openUpgrade)
  const [usage, setUsage] = useState<AiUsage | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!slug) return
    let alive = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    getAiUsage(slug)
      .then((u) => { if (alive) setUsage(u) })
      .catch(() => { /* non bloquant */ })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [slug])

  const unlimited = usage ? usage.limitTokens < 0 : false
  const pct = usage && !unlimited && usage.limitTokens > 0
    ? Math.min(100, Math.round((usage.usedTokens / usage.limitTokens) * 100))
    : 0

  return (
    <div className="flex flex-col gap-4">
      <SectionCard title="Consommation IA" description="Tokens consommés par l'agent Cortex ce mois-ci, et plafond de votre plan.">
        {loading ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : !usage ? (
          <p className="text-sm text-muted-foreground">Consommation indisponible pour le moment.</p>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">Plan <span className="uppercase">{usage.plan}</span></p>
                <p className="text-xs text-muted-foreground mt-0.5">Période {usage.period} · réinitialisation le {usage.resetAt}</p>
              </div>
              {usage.plan === "FREE" && (
                <Button size="sm" className="h-8 text-xs gap-1.5 shrink-0" onClick={() => openUpgrade()}>
                  <Zap className="h-3.5 w-3.5" /> Améliorer le plan
                </Button>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Tokens ce mois</span>
                <span className="tabular-nums font-medium text-foreground">
                  {usage.usedTokens.toLocaleString("fr-FR")} {unlimited ? "/ illimité" : `/ ${usage.limitTokens.toLocaleString("fr-FR")} (${pct}%)`}
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full transition-[width] duration-500", pct >= 90 ? "bg-rose-500" : pct >= 70 ? "bg-amber-500" : "bg-gradient-to-r from-blue-600 to-blue-400 dark:from-blue-500 dark:to-blue-300")}
                  style={{ width: `${unlimited ? 4 : pct}%` }}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <MiniStat label="Prompt" value={usage.promptTokens} />
              <MiniStat label="Completion" value={usage.completionTokens} />
              <MiniStat label="Requêtes" value={usage.requestCount} />
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              Le coût IA est volontairement bas (modèle local ≈ coût serveur). Les plafonds sont indicatifs
              et seront ajustés avec la grille tarifaire finale ; seul le compute IA sera rechargeable à la demande.
            </p>
          </div>
        )}
      </SectionCard>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

/** Navigation latérale des sections — réutilisée par la page ET le modal Settings. */
export function SettingsNav({
  active,
  onSelect,
  className,
}: Readonly<{ active: SettingsSection; onSelect: (s: SettingsSection) => void; className?: string }>) {
  return (
    <nav className={cn("flex flex-col gap-6", className)}>
      {SECTION_GROUPS.map((group) => (
        <div key={group.label} className="flex flex-col gap-0.5">
          <p className="px-3 mb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{group.label}</p>
          {SECTIONS.filter((s) => (group.keys as readonly string[]).includes(s.key)).map((s) => (
            <button
              key={s.key}
              onClick={() => onSelect(s.key)}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-left transition-colors w-full",
                active === s.key
                  ? "bg-muted text-foreground font-medium"
                  : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
              )}
            >
              {s.icon}
              {s.label}
            </button>
          ))}
        </div>
      ))}
    </nav>
  )
}

/** Rendu du panneau de la section active — réutilisé par la page ET le modal Settings. */
export function SettingsPanels({ active }: Readonly<{ active: SettingsSection }>) {
  return (
    <>
      {active === "profile"       && <ProfilePanel />}
      {active === "account"       && <AccountPanel />}
      {active === "appearance"    && <AppearancePanel />}
      {active === "notifications" && <NotificationsPanel />}
      {active === "security"      && <SecurityPanel />}
      {active === "workspace"     && <WorkspacePanel />}
      {active === "billing"       && <BillingPanel />}
      {active === "usage"         && <UsagePanel />}
      {active === "integrations"  && <IntegrationsPanel />}
      {active === "status"        && <StatusPanel />}
      {active === "privacy"       && <PrivacyPanel />}
    </>
  )
}

export default function SettingsPage() {
  const searchParams = useSearchParams()
  const [active, setActive] = useState<SettingsSection>(() => {
    const section = searchParams.get("section") as SettingsSection | null
    return section && SECTIONS.some((s) => s.key === section) ? section : "profile"
  })

  const activeSection = SECTIONS.find((s) => s.key === active)

  // Afficher un toast après retour OAuth GitHub/Slack
  useEffect(() => {
    const github = searchParams.get("github")
    const slack  = searchParams.get("slack")
    if (github === "connected") toast.success("GitHub connecté avec succès !")
    if (slack  === "connected") toast.success("Slack connecté avec succès !")
  }, [searchParams])

  return (
    <PageContainer>
      <PageHeader
        title="Settings"
        description="Profil, workspace, facturation, sécurité et confidentialité."
      />
      <div className="flex gap-8 w-full min-h-0">
        <SettingsNav active={active} onSelect={setActive} className="sticky top-0 self-start w-48 shrink-0" />

        <Separator orientation="vertical" className="self-stretch" />

        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold text-foreground mb-5">{activeSection?.label}</h2>
          <SettingsPanels active={active} />
        </div>
      </div>
    </PageContainer>
  )
}