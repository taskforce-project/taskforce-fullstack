"use client"

import { useState, useEffect, useRef } from "react"
import { useSearchParams, useRouter, useParams } from "next/navigation"
import {
  User, Bell, Mail, Zap, Globe, Key, Palette, Webhook,
  Upload, Camera, Trash2, Shield, Loader2,
  Activity, CheckCircle2, AlertTriangle, Gauge, Search,
} from "lucide-react"
import { toast } from "sonner"
import { useTheme } from "next-themes"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Zone } from "@/components/ui/zone"
import { UserAvatar } from "@/components/ui/user-avatar"
import { Separator } from "@/components/ui/separator"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { useAuth } from "@/lib/contexts/auth-context"
import { useUserStore } from "@/lib/store/user-store"
import { useWorkspaceStore } from "@/lib/store/workspace-store"
import { DeleteConfirmDialog } from "@/components/dialogs/delete-confirm-dialog"
import { useSettingsStore } from "@/lib/store/settings-store"
import { getAuditLogs, type AuditLogEntry } from "@/lib/api/workspace-service"
import { useIntegrationStore } from "@/lib/store/integration-store"
import { getGitHubRepos, getGitHubRepoIssues, type GitHubRepo, type GitHubRepoIssue } from "@/lib/api/integration-service"
import { IntegrationsCatalog } from "@/components/integrations/integrations-catalog"
import { BrandLogo } from "@/components/ui/brand-logo"
import { ProfileOverview } from "@/components/profile/profile-overview"
import { MemberSkillsCard } from "@/components/members/member-skills-card"
import { MemberAvailabilityCard } from "@/components/members/member-availability-card"
import { exportMyData, deleteMyAccount } from "@/lib/api/gdpr-service"
import { getAiUsage, type AiUsage } from "@/lib/api/ai-usage-service"
import { apiClient } from "@/lib/api/client"
import { USER_ROUTES } from "@/lib/config/api-routes"
import { cn } from "@/lib/utils"

export type SettingsSection =
  | "profile"
  | "account"
  | "appearance"
  | "notifications"
  | "security"
  | "workspace"
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
  { key: "usage",         label: "Usage Cortex",   icon: <Gauge className="h-4 w-4" />,       group: "Workspace" },
  { key: "integrations",  label: "Integrations",   icon: <Webhook className="h-4 w-4" />,    group: "Workspace" },
  { key: "status",        label: "Status",         icon: <Activity className="h-4 w-4" />,    group: "Workspace" },
  { key: "privacy",       label: "Privacy & Data", icon: <Shield className="h-4 w-4" />,     group: "Personal" },
]

export const SECTION_GROUPS = [
  { label: "Personal",  keys: ["profile", "account", "appearance", "notifications", "security", "privacy"] as const },
  { label: "Workspace", keys: ["workspace", "usage", "integrations", "status"] as const },
]

// SKILL_OPTIONS + SkillsTagInput retirés avec le faux champ « Skills » du Profil (TF-SETTINGS-FAKE) :
// le vrai éditeur de compétences vit sur la fiche membre (/members/{id}).

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

/**
 * Section de réglages « façon Claude » : plus de carte encadrée — juste un titre, une description et le
 * contenu directement, séparés par un filet discret entre sections (retour user : « pas de cards à
 * l'intérieur, juste le contenu direct à droite »). Le variant danger garde un titre rouge pour l'alerte.
 */
function SectionCard({ title, description, children, danger = false }: Readonly<{ title: string; description?: string; children: React.ReactNode; danger?: boolean }>) {
  return (
    <section className={cn(
      "border-b pb-6 last:border-b-0 last:pb-0",
      danger ? "border-destructive/25" : "border-border/60"
    )}>
      <div className="mb-4">
        <h3 className={cn("text-sm font-semibold", danger ? "text-destructive" : "text-foreground")}>{title}</h3>
        {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
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
  const [saving, setSaving] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)

  // Reset SUR CHANGEMENT D'IDENTITÉ uniquement (pas à chaque refresh du user) : sinon un refreshUser()
  // — par ex. après upload d'avatar — écraserait les champs nom en cours d'édition non sauvegardés.
  useEffect(() => {
    if (user) {
      setFirstName(user.firstName)
      setLastName(user.lastName)
      setDisplayName(user.displayName)
      setAvatarUrl(user.avatarUrl ?? "")
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id])

  const hasCustomAvatar = Boolean(avatarUrl)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 3 * 1024 * 1024) {
      toast.error("Image too large — max 3 MB")
      return
    }
    setUploadingAvatar(true)
    try {
      const formData = new FormData()
      formData.append("file", file)
      // `Content-Type: undefined` (et NON "multipart/form-data") : le client Axios a un défaut
      // `application/json` ; en le forçant à undefined, Axios détecte le FormData et pose lui-même
      // `multipart/form-data; boundary=…`. Sans le boundary, le back ne parse pas → upload cassé.
      const res = await apiClient.post<{ data: { avatarUrl: string } }>(USER_ROUTES.AVATAR, formData, {
        headers: { "Content-Type": undefined },
      })
      const newUrl = res.data.data.avatarUrl ?? ""
      setAvatarUrl(newUrl)
      // L'upload PERSISTE déjà l'avatar côté backend, mais sans resynchroniser le user global la nouvelle
      // photo ne se propageait NULLE PART (sidebar, nav-user, cartes membres) → « ça ne marche pas ».
      await refreshUser()
      toast.success("Avatar updated")
    } catch {
      toast.error("Couldn't upload the avatar")
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
                <p className="text-xs text-muted-foreground">JPG, PNG, GIF, WEBP — max 3 MB</p>
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
          {/* Les champs « Role / Title » et « Skills » ont été RETIRÉS : ils n'étaient jamais chargés ni
              enregistrés (le payload de sauvegarde = firstName/lastName/displayName/avatarUrl), et le hint
              « Used for smart issue assignment » MENTAIT — le vrai éditeur de compétences (le seul lu par
              le smart-assign) vit sur la fiche d'un membre (/members/{id}). Cf. TF-SETTINGS-FAKE. */}
        </div>
      </SectionCard>
      <div className="flex justify-end">
        <Button size="sm" className="h-8 text-xs" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save profile"}
        </Button>
      </div>

      {/* Compétences & disponibilité — attributs de profil (utilisés par le Smart Assign). Rapatriés de
          l'ancienne section « Compétences » du menu : tout dans Profile (retour user « tout dans profil »). */}
      <Separator className="mt-2" />
      <CompetencesPanel />

      {/* Aperçu « Mon profil » (ex-page /profile, supprimée) : stats + heatmap + activité — tout dans le modal. */}
      <Separator className="mt-2" />
      <ProfileOverview />
    </div>
  )
}

function AccountPanel() {
  const { user } = useAuth()
  const setSection = useSettingsStore((s) => s.setSection)

  return (
    <div className="flex flex-col gap-4">
      <SectionCard title="Account info" description="Manage your login and account preferences.">
        <div className="flex flex-col gap-5">
          <FormField label="Email" hint="Managed via your identity provider.">
            <StyledInput type="email" value={user?.email ?? ""} readOnly />
          </FormField>
          <Separator />
          {/* Suppression de compte + export des données → regroupés dans « Privacy & Data » (RGPD Art. 17/20).
              Plus de doublon « Delete account » ici : Account = identité de connexion + langue. */}
          <p className="text-xs text-muted-foreground">
            Account deletion and data export:{" "}
            <button
              type="button"
              onClick={() => setSection("privacy")}
              className="underline underline-offset-2 transition-colors hover:text-foreground"
            >
              Privacy &amp; Data
            </button>
            .
          </p>
        </div>
      </SectionCard>
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

  // Accessibilité — persistée dans le store de préférences (appliquée en direct via des classes racine).
  const fontSize = usePreferencesStore((s) => s.fontSize)
  const setFontSize = usePreferencesStore((s) => s.setFontSize)
  const dyslexiaFont = usePreferencesStore((s) => s.dyslexiaFont)
  const setDyslexiaFont = usePreferencesStore((s) => s.setDyslexiaFont)
  const highContrast = usePreferencesStore((s) => s.highContrast)
  const setHighContrast = usePreferencesStore((s) => s.setHighContrast)
  const colorblindMode = usePreferencesStore((s) => s.colorblindMode)
  const setColorblindMode = usePreferencesStore((s) => s.setColorblindMode)

  const FONT_SIZES: { value: "normal" | "large" | "x-large"; label: string }[] = [
    { value: "normal", label: "Normal" },
    { value: "large", label: "Large" },
    { value: "x-large", label: "Extra large" },
  ]
  const COLORBLIND_MODES: { value: "none" | "protanopia" | "deuteranopia" | "tritanopia"; label: string }[] = [
    { value: "none", label: "None" },
    { value: "protanopia", label: "Protanopia (red)" },
    { value: "deuteranopia", label: "Deuteranopia (green)" },
    { value: "tritanopia", label: "Tritanopia (blue)" },
  ]

  return (
    <div className="flex flex-col gap-4">
      <SectionCard title="Theme" description="Applies immediately and is remembered.">
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

      <SectionCard title="Accessibility" description="Reading comfort and visual adjustments. Applied immediately and remembered.">
        <div className="flex flex-col gap-6">
          {/* Taille du texte */}
          <div>
            <p className="mb-1.5 text-sm font-medium text-foreground">Text size</p>
            <div className="inline-flex rounded-lg border border-border p-0.5">
              {FONT_SIZES.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setFontSize(f.value)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-sm transition-colors",
                    fontSize === f.value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <Separator />

          {/* Confort de lecture (dyslexie) */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">Reading comfort (dyslexia)</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                More legible font and increased spacing (line height, letters, words).
              </p>
            </div>
            <Switch checked={dyslexiaFont} onCheckedChange={setDyslexiaFont} aria-label="Reading comfort" />
          </div>

          <Separator />

          {/* Contraste élevé — alternative saine au « filtre daltonien » : on renforce les contrastes
              (WCAG) plutôt que de transformer les couleurs. L'info n'est jamais portée par la couleur
              seule (couleur + icône + libellé dans les composants d'état). */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">High contrast</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Strengthens text/background/border contrast (useful for low vision or bright light).
              </p>
            </div>
            <Switch checked={highContrast} onCheckedChange={setHighContrast} aria-label="High contrast" />
          </div>

          <Separator />

          {/* Mode daltonien (option) — filtre de correction, EN PLUS du contraste et des repères non colorés. */}
          <div className="grid grid-cols-[1fr_auto] items-start gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">Color-blind mode</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Color-correction filter based on the type of color blindness (red-green / blue-yellow).
              </p>
            </div>
            <Select value={colorblindMode} onValueChange={(v) => setColorblindMode(v as typeof colorblindMode)}>
              <SelectTrigger className="w-52 shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {COLORBLIND_MODES.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </SectionCard>
    </div>
  )
}

/**
 * Panneau Notifications — réécrit HONNÊTE (TF-SETTINGS-FAKE).
 *
 * <p>L'ancienne version affichait 6 toggles « Email notifications » persistés dans `localStorage`, sans
 * aucun effet : le back ne lisait AUCUNE préférence, et surtout <b>ces emails n'existent pas</b>
 * (`EmailService` ne fait qu'OTP/welcome/reset/invitation ; « Weekly digest » = zéro ligne de code).
 * Six interrupteurs qui ne pilotaient rien, plus un toast « enregistrées » qui confirmait le mensonge.</p>
 *
 * <p>Ce qui est <b>vrai</b> : les notifications <b>in-app</b> (cloche + temps réel) existent et sont
 * toujours actives — `NotificationService` les persiste et les pousse. On le dit, sans promettre des
 * réglages qui n'existent pas.</p>
 */
function NotificationsPanel() {
  return (
    <div className="flex flex-col gap-4">
      <SectionCard title="Notifications" description="How Taskforce keeps you informed.">
        <div className="flex flex-col gap-3">
          <div className="flex items-start gap-3">
            <Bell className="size-4 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">In-app notifications</p>
              <p className="text-xs text-muted-foreground">
                Mentions, assignments, comments and status changes appear in real time
                in the notification bell. Always on.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Mail className="size-4 text-muted-foreground mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-foreground">Email notifications</p>
              <p className="text-xs text-muted-foreground">
                Fine-grained per-event email settings aren&apos;t available yet. Coming soon.
              </p>
            </div>
          </div>
        </div>
      </SectionCard>
    </div>
  )
}

function SecurityPanel() {
  // Auth déléguée à Keycloak (OIDC) — pas de fabrication d'infos ici (QA Q-17).
  const items = [
    { icon: <Key className="size-4 text-muted-foreground" />,    title: "Password",                        desc: "Change it from Keycloak's 'My account' console." },
    { icon: <Shield className="size-4 text-muted-foreground" />, title: "Two-factor authentication (2FA)", desc: "Enable an authenticator (TOTP) from your Keycloak account." },
    { icon: <Globe className="size-4 text-muted-foreground" />,  title: "Active sessions",                 desc: "Your sessions are managed centrally by Keycloak." },
  ]
  return (
    <div className="flex flex-col gap-4">
      <SectionCard
        title="Authentication & security"
        description="Your identity is managed by Keycloak (OIDC provider). Password, 2FA and sessions are managed in your Keycloak account."
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
      toast.success("Workspace deleted")
      router.push(next ? `/${next}/dashboard` : "/")
    } catch {
      toast.error("Couldn't delete the workspace (owner only)")
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
        <Zone variant="danger" title="Danger zone" description="Irreversible actions. Use with caution.">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-foreground">Delete this workspace</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Permanently deletes the workspace and all its data (projects, issues, teams…).
              </p>
            </div>
            <DeleteConfirmDialog
              title="Delete workspace?"
              description={`“${activeWorkspace?.name}” and all its data will be permanently deleted. This cannot be undone.`}
              confirmLabel="Delete workspace"
              onConfirm={handleDeleteWorkspace}
            >
              <Button variant="destructive" size="sm" className="h-8 shrink-0 text-xs">
                Delete
              </Button>
            </DeleteConfirmDialog>
          </div>
        </Zone>
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
          await apiClient.get("/api/workspaces") // sonde légère (la liste existe toujours ; /current 500 si owner multi-workspace)
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
    { name: "App (interface)",     ok: true,            detail: "Loaded" },
    { name: "Taskforce API",       ok: api !== "down",   detail: api === "checking" ? "Checking…" : api === "ok" ? "Operational" : "Unreachable" },
    { name: "Real-time (STOMP)",   ok: api !== "down",   detail: api === "checking" ? "Checking…" : api === "ok" ? "Available via the API" : "Unavailable" },
    { name: "AI assistant (Groq)", ok: true,             detail: "Configured (server-side)" },
  ]
  const allOk = rows.every((r) => r.ok)

  return (
    <div className="flex flex-col gap-5 max-w-2xl">
      <div>
        <h2 className="text-sm font-semibold text-foreground">Application status</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Real-time service status.</p>
      </div>

      <div className={cn(
        "flex items-center gap-2 rounded-lg border px-4 py-3 text-sm font-medium",
        allOk ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500" : "border-amber-500/30 bg-amber-500/10 text-amber-500"
      )}>
        {allOk ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
        {allOk ? "All systems operational" : "Incident affecting one or more services"}
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
          <h3 className="text-sm font-semibold text-foreground">Audit log</h3>
          <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={exportAuditCsv} disabled={logs.length === 0}>
            <Upload className="h-3.5 w-3.5" /> Export CSV
          </Button>
        </div>
        <div className="rounded-xl border border-border bg-card overflow-hidden [box-shadow:var(--shadow-sm)]">
          {logs.length === 0 ? (
            <p className="px-4 py-6 text-center text-xs text-muted-foreground">No audit entries (admins only).</p>
          ) : (
            logs.slice(0, 30).map((l, i) => (
              <div key={l.id} className={cn("flex items-center gap-3 px-4 py-2.5", i < Math.min(logs.length, 30) - 1 && "border-b border-border/50")}>
                <Badge variant="secondary" className="shrink-0 font-mono text-[10px]">{l.action}</Badge>
                <span className="flex-1 truncate text-xs text-muted-foreground">
                  {l.entityType ? `${l.entityType}${l.entityId ? ` #${l.entityId}` : ""}` : (l.details ?? "—")}
                </span>
                <span className="shrink-0 text-[10px] text-muted-foreground/70">
                  {new Date(l.createdAt).toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" })}
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
      .catch(() => { if (active) toast.error("Couldn't load GitHub repositories") })
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
      .catch(() => toast.error("Couldn't load the repository's issues"))
      .finally(() => setLoadingIssues(false))
  }

  return (
    <div className="mt-4 flex flex-col gap-3 border-t border-border/50 pt-4">
      <div className="flex items-center gap-2">
        <p className="text-xs font-medium text-muted-foreground">Browse a repository</p>
        {loadingRepos && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
      </div>
      <Select value={repo} onValueChange={selectRepo}>
        <SelectTrigger className="h-9"><SelectValue placeholder="Choose a repository…" /></SelectTrigger>
        <SelectContent>
          {repos.map((r) => (
            <SelectItem key={r.fullName} value={r.fullName}>
              {r.fullName}{r.isPrivate ? " 🔒" : ""}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {loadingIssues && <p className="text-xs text-muted-foreground">Loading issues…</p>}
      {!loadingIssues && repo && issues.length === 0 && (
        <p className="text-xs text-muted-foreground italic">No issues / PRs.</p>
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
    fetchGitHubStatus, disconnectGitHub,
    fetchSlackStatus, disconnectSlack,
    fetchSlackChannels, addSlackChannel, removeSlackChannel,
    fetchWebhooks, addWebhook, removeWebhook,
  } = useIntegrationStore()

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
      toast.success("GitHub disconnected")
    } catch {
      toast.error("Couldn't disconnect GitHub")
    }
  }

  async function handleDisconnectSlack() {
    try {
      await disconnectSlack(slug)
      toast.success("Slack disconnected")
    } catch {
      toast.error("Couldn't disconnect Slack")
    }
  }

  async function handleAddChannel() {
    if (!channelId.trim() || !channelName.trim()) return
    setAddingChannel(true)
    try {
      await addSlackChannel(slug, { channelId: channelId.trim(), channelName: channelName.trim(), eventTypes: ["issue.created"] })
      setChannelId("")
      setChannelName("")
      toast.success("Slack channel added")
    } catch {
      toast.error("Couldn't add the channel")
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
      toast.success("Webhook added")
    } catch {
      toast.error("Invalid or unreachable URL")
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
      <SectionCard title="Integrations catalog" description="Connect your tools to the Brain OS. One click for OAuth, otherwise an API key (ⓘ help on hover).">

        {slug && <IntegrationsCatalog slug={slug} />}
      </SectionCard>

      {/* ---- GitHub — affiché UNIQUEMENT une fois connecté (gestion des dépôts). La connexion se fait
             via le Catalogue ci-dessus ; plus de card « Connect » redondante ici. ---- */}
      {githubStatus?.connected && (
        <SectionCard title="GitHub" description="Repositories linked to issues (PRs and commits).">
          <div className="flex items-center gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted p-2">
              <BrandLogo slug="github" name="GitHub" className="size-full" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">GitHub</p>
              {githubStatus.meta?.login && (
                <p className="text-xs text-muted-foreground">Connected as <span className="font-medium">@{githubStatus.meta.login}</span></p>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-500/20 bg-emerald-500/10">Connected</Badge>
              <Button variant="outline" size="sm" className="h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/10" onClick={handleDisconnectGitHub}>
                Disconnect
              </Button>
            </div>
          </div>
          <GitHubRepoBrowser slug={slug} />
        </SectionCard>
      )}

      {/* ---- Slack — affiché UNIQUEMENT une fois connecté (canaux de notification). Connexion via le Catalogue. ---- */}
      {slackStatus?.connected && (
        <SectionCard title="Slack" description="Activity notifications in your Slack channels.">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted p-2">
                <BrandLogo slug="slack" name="Slack" className="size-full" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">Slack</p>
                {slackStatus.meta?.teamName && (
                  <p className="text-xs text-muted-foreground">Connected to <span className="font-medium">{slackStatus.meta.teamName}</span></p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-500/20 bg-emerald-500/10">Connected</Badge>
                <Button variant="outline" size="sm" className="h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/10" onClick={handleDisconnectSlack}>
                  Disconnect
                </Button>
              </div>
            </div>

            {/* Canaux de notification */}
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
                        try { await removeSlackChannel(slug, ch.id); toast.success("Channel removed") }
                        catch { toast.error("Couldn't remove the channel") }
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
          </div>
        </SectionCard>
      )}

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
                        try { await removeWebhook(slug, wh.id); toast.success("Webhook removed") }
                        catch { toast.error("Couldn't remove the webhook") }
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
      a.download = "taskforce-my-data.json"
      a.click()
      URL.revokeObjectURL(url)
      toast.success("Your data has been exported (JSON download).")
    } catch {
      toast.error("Export failed. Try again or contact privacy@taskforce.dev.")
    } finally {
      setLoading(null)
    }
  }

  const handleDelete = async () => {
    setLoading("DELETION")
    try {
      await deleteMyAccount()
      toast.success("Account anonymized. Signing out…")
      // Purge cliente + BONNE route (/auth/login ; /login n'existe pas → 404) : sinon l'utilisateur
      // restait « connecté » sur un compte anonymisé → 403 en cascade. RGPD-02.
      if (globalThis.window !== undefined) {
        localStorage.removeItem("accessToken")
        localStorage.removeItem("refreshToken")
        localStorage.removeItem("user")
        setTimeout(() => { window.location.href = "/auth/login" }, 1000)
      }
    } catch {
      toast.error("Deletion failed. Try again or contact privacy@taskforce.dev.")
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
              Download a JSON export of your personal data right away (GDPR Art. 20 — portability).
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 h-8 text-xs"
            disabled={loading === "ACCESS"}
            onClick={handleExport}
          >
            {loading === "ACCESS" ? "Exporting…" : "Export my data"}
          </Button>
        </div>
      </SectionCard>

      <Zone variant="danger" title="Delete account" description="Permanently remove your account and all associated data.">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-foreground">Delete my account</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Your personal data will be anonymized and your access cut off immediately (GDPR Art. 17 — right to erasure). Irreversible.
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
                {loading === "DELETION" ? "Processing…" : "Confirm deletion"}
              </Button>
            </div>
          )}
        </div>
      </Zone>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Usage IA Panel (conso tokens réelle du mois vs plafond du plan)
// ---------------------------------------------------------------------------

function MiniStat({ label, value }: Readonly<{ label: string; value: number }>) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-semibold tabular-nums text-foreground">{value.toLocaleString("en-US")}</p>
    </div>
  )
}

function UsagePanel() {
  const slug = useWorkspaceStore((s) => s.activeWorkspace?.slug)
  const router = useRouter()
  const closeSettings = useSettingsStore((s) => s.closeSettings)
  const [usage, setUsage] = useState<AiUsage | null>(null)
  const [loading, setLoading] = useState(true)

  // Upgrade = navigation vers la page des forfaits (pas un 2e modal par-dessus les réglages). Ferme
  // d'abord le modal Settings si ouvert, sinon il resterait affiché par-dessus la page facturation.
  const goToPlans = () => {
    closeSettings()
    if (slug) router.push(`/${slug}/billing`)
  }

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
      <SectionCard title="Cortex usage" description="Tokens used by the Cortex agent this month, and your plan's cap.">
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !usage ? (
          <p className="text-sm text-muted-foreground">Usage unavailable right now.</p>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">Plan <span className="uppercase">{usage.plan}</span></p>
                <p className="text-xs text-muted-foreground mt-0.5">Period {usage.period} · resets on {usage.resetAt}</p>
              </div>
              {usage.plan !== "BUSINESS" && usage.plan !== "ENTERPRISE" && (
                <Button size="sm" className="h-8 text-xs gap-1.5 shrink-0" onClick={goToPlans}>
                  <Zap className="h-3.5 w-3.5" /> View plans
                </Button>
              )}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Tokens this month</span>
                <span className="tabular-nums font-medium text-foreground">
                  {usage.usedTokens.toLocaleString("en-US")} {unlimited ? "/ unlimited" : `/ ${usage.limitTokens.toLocaleString("en-US")} (${pct}%)`}
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
              <MiniStat label="Requests" value={usage.requestCount} />
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed">
              AI cost is deliberately low (local model ≈ server cost). Caps are indicative and will be adjusted
              with the final pricing; only AI compute will be top-up-able on demand.
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
  const [q, setQ] = useState("")
  const query = q.trim().toLowerCase()

  const renderBtn = (s: SectionConfig) => (
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
  )

  const results = query ? SECTIONS.filter((s) => s.label.toLowerCase().includes(query)) : []

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      {/* Recherche dans les réglages */}
      <div className="relative px-0.5">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search settings…"
          aria-label="Search settings"
          className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary/50"
        />
      </div>

      <nav className="flex flex-col gap-6">
        {query ? (
          results.length === 0 ? (
            <p className="px-3 py-2 text-sm text-muted-foreground">No settings found.</p>
          ) : (
            <div className="flex flex-col gap-0.5">{results.map(renderBtn)}</div>
          )
        ) : (
          SECTION_GROUPS.map((group) => (
            <div key={group.label} className="flex flex-col gap-0.5">
              <p className="px-3 mb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{group.label}</p>
              {SECTIONS.filter((s) => (group.keys as readonly string[]).includes(s.key)).map(renderBtn)}
            </div>
          ))
        )}
      </nav>
    </div>
  )
}

/** Compétences + disponibilité de SON propre profil (mêmes cartes que la fiche membre). Rendu à
 *  l'intérieur de « Profile » (plus une section de menu séparée) — retour user « tout dans profil ». */
function CompetencesPanel() {
  const { user } = useAuth()
  const slug = useWorkspaceStore((s) => s.activeWorkspace?.slug ?? "")
  if (!user || !slug || !Number.isFinite(Number(user.id))) return null
  return (
    <div className="flex flex-col gap-6">
      <MemberSkillsCard slug={slug} userId={Number(user.id)} canEdit />
      <MemberAvailabilityCard slug={slug} userId={Number(user.id)} canEdit />
    </div>
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
      {active === "usage"         && <UsagePanel />}
      {active === "integrations"  && <IntegrationsPanel />}
      {active === "status"        && <StatusPanel />}
      {active === "privacy"       && <PrivacyPanel />}
    </>
  )
}

/**
 * Route `/settings` — la page standalone a été RETIRÉE (redondante avec le modal Settings, monté
 * globalement dans `app-shell` et ouvrable depuis n'importe quel CTA via `useSettingsStore`). Cette
 * route se contente désormais d'OUVRIR le modal par-dessus le dashboard, en préservant le deep-link
 * `?section=` et le retour OAuth GitHub/Slack (toast + ouverture directe sur « Integrations »).
 * Les briques (`SECTIONS`, `SettingsNav`, `SettingsPanels`, panneaux) restent exportées ci-dessus
 * et sont réutilisées par le modal.
 */
export default function SettingsPage() {
  const router = useRouter()
  const params = useParams()
  const searchParams = useSearchParams()
  const openSettings = useSettingsStore((s) => s.openSettings)
  const workspace = typeof params.workspace === "string" ? params.workspace : ""

  useEffect(() => {
    const section = searchParams.get("section")
    const github = searchParams.get("github")
    const slack = searchParams.get("slack")
    if (github === "connected") toast.success("GitHub connected successfully!")
    if (slack === "connected") toast.success("Slack connected successfully!")
    const target = github || slack
      ? "integrations"
      : section && SECTIONS.some((s) => s.key === section)
        ? section
        : undefined
    openSettings(target)
    router.replace(workspace ? `/${workspace}/dashboard` : "/")
  }, [searchParams, openSettings, router, workspace])

  return null
}