"use client"

import { useState, useEffect, useRef } from "react"
import { useSearchParams } from "next/navigation"
import {
  User, Bell, CreditCard, Users, Check, Zap, Globe, Key, Palette, Webhook,
  X as XIcon, Plus, Upload, Camera, Link2, Trash2, Shield,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarImage } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAuth } from "@/lib/contexts/auth-context"
import { useUserStore } from "@/lib/store/user-store"
import { useWorkspaceStore } from "@/lib/store/workspace-store"
import { useIntegrationStore } from "@/lib/store/integration-store"
import { getAvatarUrl } from "@/lib/utils/avatar"
import { apiClient } from "@/lib/api/client"
import { USER_ROUTES } from "@/lib/config/api-routes"
import { cn } from "@/lib/utils"

type SettingsSection =
  | "profile"
  | "account"
  | "appearance"
  | "notifications"
  | "security"
  | "workspace"
  | "billing"
  | "team"
  | "integrations"
  | "privacy"

interface SectionConfig {
  key: SettingsSection
  label: string
  icon: React.ReactNode
  group: string
}

const SECTIONS: SectionConfig[] = [
  { key: "profile",       label: "Profile",        icon: <User className="h-4 w-4" />,       group: "Personal" },
  { key: "account",       label: "Account",        icon: <Globe className="h-4 w-4" />,      group: "Personal" },
  { key: "appearance",    label: "Appearance",     icon: <Palette className="h-4 w-4" />,    group: "Personal" },
  { key: "notifications", label: "Notifications",  icon: <Bell className="h-4 w-4" />,       group: "Personal" },
  { key: "security",      label: "Security",       icon: <Key className="h-4 w-4" />,        group: "Personal" },
  { key: "workspace",     label: "General",        icon: <Globe className="h-4 w-4" />,      group: "Workspace" },
  { key: "billing",       label: "Billing & Plan", icon: <CreditCard className="h-4 w-4" />, group: "Workspace" },
  { key: "team",          label: "Members",        icon: <Users className="h-4 w-4" />,      group: "Workspace" },
  { key: "integrations",  label: "Integrations",   icon: <Webhook className="h-4 w-4" />,    group: "Workspace" },
  { key: "privacy",       label: "Privacy & Data", icon: <Shield className="h-4 w-4" />,     group: "Personal" },
]

const PLAN_FEATURES: Record<string, string[]> = {
  free:       ["Up to 3 projects", "Up to 5 members", "1 active cycle", "100 issues total", "Community support"],
  pro:        ["Unlimited projects", "Unlimited members", "Unlimited cycles", "Advanced analytics", "Burndown charts", "Priority support"],
  enterprise: ["Everything in Pro", "SSO / SAML", "Audit logs", "Custom roles & permissions", "Dedicated SLA", "Custom onboarding"],
}

const SECTION_GROUPS = [
  { label: "Personal",  keys: ["profile", "account", "appearance", "notifications", "security", "privacy"] as const },
  { label: "Workspace", keys: ["workspace", "billing", "team", "integrations"] as const },
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

function SectionCard({ title, description, children }: Readonly<{ title: string; description?: string; children: React.ReactNode }>) {
  return (
    <div className="rounded-xl border border-border bg-card [box-shadow:var(--shadow-sm)]">
      <div className="px-5 py-4 border-b border-border/70">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
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
  const { user } = useAuth()
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

  // Utilise l'avatar custom si défini, sinon l'API route qui génère le SVG gradient
  const effectiveAvatar = getAvatarUrl({
    firstName,
    lastName,
    email: user?.email ?? "",
    avatarUrl: avatarUrl || null,
  })
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
                <Avatar className="h-14 w-14">
                  <AvatarImage src={effectiveAvatar} alt={displayName} className="object-cover" />
                </Avatar>
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
  const [timezone, setTimezone] = useState("Europe/Paris")
  const [language, setLanguage] = useState("en")

  return (
    <div className="flex flex-col gap-4">
      <SectionCard title="Account info" description="Manage your login and localization preferences.">
        <div className="flex flex-col gap-5">
          <FormField label="Email" hint="Managed via your identity provider.">
            <StyledInput type="email" value={user?.email ?? ""} readOnly />
          </FormField>
          <Separator />
          <FormField label="Language">
            <Select value={language} onValueChange={setLanguage}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="fr">Francais</SelectItem>
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
      <SectionCard title="Danger zone" description="Irreversible actions. Proceed with caution.">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Delete your account</p>
            <p className="text-xs text-muted-foreground mt-0.5">Permanently delete your account and all associated data.</p>
          </div>
          <Button variant="destructive" size="sm" className="h-8 text-xs shrink-0">Delete account</Button>
        </div>
      </SectionCard>
      <div className="flex justify-end">
        <Button size="sm" className="h-8 text-xs" onClick={() => toast.success("Account settings saved")}>Save changes</Button>
      </div>
    </div>
  )
}

function AppearancePanel() {
  const [theme, setTheme] = useState<"system" | "light" | "dark">("system")
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable")

  return (
    <div className="flex flex-col gap-4">
      <SectionCard title="Theme" description="Choose how Taskforce looks to you.">
        <div className="flex gap-3">
          {(["system", "light", "dark"] as const).map((opt) => (
            <button
              key={opt}
              onClick={() => setTheme(opt)}
              className={cn(
                "flex flex-col items-center gap-2 rounded-lg border-2 p-3 transition-all capitalize",
                theme === opt ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"
              )}
            >
              <div
                className={cn(
                  "h-8 w-12 rounded",
                  opt === "light" && "bg-white border border-border",
                  opt === "dark" && "bg-zinc-900",
                  opt === "system" && "bg-muted"
                )}
              />
              <span className="text-xs font-medium text-foreground">{opt}</span>
            </button>
          ))}
        </div>
      </SectionCard>
      <SectionCard title="Density" description="Control how much content is shown.">
        <div className="flex gap-3">
          {(["comfortable", "compact"] as const).map((opt) => (
            <button
              key={opt}
              onClick={() => setDensity(opt)}
              className={cn(
                "flex flex-col items-center gap-2 rounded-lg border-2 px-5 py-3 transition-all capitalize",
                density === opt ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"
              )}
            >
              <span className="text-xs font-medium text-foreground">{opt}</span>
            </button>
          ))}
        </div>
      </SectionCard>
      <div className="flex justify-end">
        <Button size="sm" className="h-8 text-xs" onClick={() => toast.success("Appearance saved")}>Save preferences</Button>
      </div>
    </div>
  )
}

function NotificationsPanel() {
  const [prefs, setPrefs] = useState({
    mentions:      true,
    assignments:   true,
    comments:      true,
    statusChanges: false,
    dueSoon:       true,
    weeklyDigest:  false,
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
        <Button size="sm" className="h-8 text-xs" onClick={() => toast.success("Notification preferences saved")}>Save preferences</Button>
      </div>
    </div>
  )
}

function SecurityPanel() {
  return (
    <div className="flex flex-col gap-4">
      <SectionCard title="Password" description="Your password is managed through Keycloak.">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Change password</p>
            <p className="text-xs text-muted-foreground mt-0.5">Last changed: 3 weeks ago</p>
          </div>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => toast.info("Redirecting to Keycloak...")}>
            Manage in Keycloak
          </Button>
        </div>
      </SectionCard>
      <SectionCard title="Two-factor authentication" description="Add an extra layer of security to your account.">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground">Authenticator app</p>
            <p className="text-xs text-muted-foreground mt-0.5">Not configured</p>
          </div>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => toast.info("2FA setup via Keycloak")}>Set up</Button>
        </div>
      </SectionCard>
      <SectionCard title="Active sessions" description="Manage where you are logged in.">
        <div className="flex flex-col gap-3">
          {[
            { device: "MacBook Pro - Chrome", location: "Paris, France", active: true },
            { device: "iPhone 15 - Safari",   location: "Paris, France", active: false },
          ].map((s) => (
            <div key={s.device} className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">{s.device}</p>
                <p className="text-xs text-muted-foreground">{s.location}</p>
              </div>
              {s.active
                ? <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-500/20 bg-emerald-500/10">Current</Badge>
                : <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive hover:text-destructive" onClick={() => toast.success("Session revoked")}>Revoke</Button>
              }
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
            <p className="text-xs text-muted-foreground mt-0.5">
              {plan === "FREE" ? "No active subscription" : "Billed monthly - renews Jan 15, 2026"}
            </p>
          </div>
          {plan !== "FREE" && (
            <Button variant="outline" size="sm" className="h-8 text-xs text-destructive border-destructive/30 hover:bg-destructive/10">
              Cancel plan
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
                <Button
                  size="sm"
                  variant={p.highlight ? "default" : "outline"}
                  className="h-7 text-xs mt-auto"
                  onClick={() => toast.info(`Upgrading to ${p.label}...`)}
                >
                  {p.key === "enterprise" ? "Contact sales" : "Upgrade"}
                </Button>
              )}
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  )
}

function WorkspacePanel() {
  const { activeWorkspace, updateWorkspaceInfo } = useWorkspaceStore()
  const [name,        setName]        = useState(activeWorkspace?.name ?? "")
  const [description, setDescription] = useState(activeWorkspace?.description ?? "")
  const [saving, setSaving] = useState(false)

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
    </div>
  )
}

function TeamPanel() {
  const [invited, setInvited] = useState("")
  const [inviting, setInviting] = useState(false)
  const { members, membersLoading, fetchMembers, invite, changeRole, kick } = useWorkspaceStore()
  const currentUser = useUserStore((s) => s.user)

  useEffect(() => { fetchMembers() }, [fetchMembers])

  const currentMember = members.find((m) => String(m.userId) === currentUser?.id)
  const isOwner = currentMember?.role === "OWNER"
  const canManage = isOwner || currentMember?.role === "ADMIN"

  async function handleInvite() {
    if (!invited.trim()) return
    setInviting(true)
    const result = await invite({ email: invited.trim() })
    setInviting(false)
    if (result) {
      toast.success(`${invited} ajouté au workspace`)
      setInvited("")
    } else {
      toast.error("Impossible d'ajouter ce membre")
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <SectionCard title="Workspace members" description="Manage members, roles, and invitations.">
        <div className="flex flex-col divide-y divide-border/50">
          {membersLoading && (
            <p className="text-sm text-muted-foreground py-3">Loading…</p>
          )}
          {!membersLoading && members.map((m) => {
            const isYou = String(m.userId) === currentUser?.id
            const displayLabel = m.displayName ?? m.email
            const nameParts = displayLabel.split(" ")
            const initials = `${nameParts[0]?.charAt(0) ?? ""}${nameParts[1]?.charAt(0) ?? ""}`.toUpperCase() || "?"
            return (
              <div key={m.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <div className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold text-white bg-primary shrink-0">
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">
                    {displayLabel}{isYou && <span className="ml-1 text-xs text-muted-foreground font-normal">(you)</span>}
                  </p>
                  <p className="text-xs text-muted-foreground">{m.email}</p>
                </div>
                {isOwner && !isYou && m.role !== "OWNER" && (
                  <Select
                    value={m.role}
                    onValueChange={async (val) => {
                      const result = await changeRole(m.id, { role: val as "ADMIN" | "MEMBER" })
                      if (result) toast.success("Rôle mis à jour")
                      else toast.error("Impossible de changer le rôle")
                    }}
                  >
                    <SelectTrigger size="sm" className="w-28">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ADMIN">Admin</SelectItem>
                      <SelectItem value="MEMBER">Member</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                {!isOwner && (
                  <span className="text-xs text-muted-foreground capitalize">{m.role.toLowerCase()}</span>
                )}
                {isYou && (
                  <span className="text-xs text-muted-foreground capitalize">{m.role.toLowerCase()}</span>
                )}
                {canManage && !isYou && m.role !== "OWNER" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                    onClick={async () => {
                      try { await kick(m.id); toast.success(`${displayLabel} retiré`) }
                      catch { toast.error("Impossible de retirer ce membre") }
                    }}
                  >
                    Remove
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      </SectionCard>
      {canManage && (
        <SectionCard title="Invite member" description="Add an existing Taskforce user by email.">
          <div className="flex gap-2">
            <StyledInput
              type="email"
              placeholder="colleague@company.com"
              value={invited}
              onChange={(e) => setInvited(e.target.value)}
              onKeyDown={(e: React.KeyboardEvent) => e.key === "Enter" && handleInvite()}
            />
            <Button
              size="sm"
              className="h-9 text-xs shrink-0"
              onClick={handleInvite}
              disabled={!invited || inviting}
            >
              {inviting ? "Adding…" : "Add member"}
            </Button>
          </div>
        </SectionCard>
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
      {/* ---- GitHub ---- */}
      <SectionCard title="GitHub" description="Link issues to pull requests and commits.">
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-lg border border-border bg-muted flex items-center justify-center text-xs font-bold text-foreground shrink-0">
            GH
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
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => connectGitHub(slug)}>
              <Link2 className="h-3 w-3 mr-1.5" />Connect
            </Button>
          )}
        </div>
      </SectionCard>

      {/* ---- Slack ---- */}
      <SectionCard title="Slack" description="Get notifications directly in your Slack channels.">
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-lg border border-border bg-muted flex items-center justify-center text-xs font-bold text-foreground shrink-0">
              SL
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
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => connectSlack(slug)}>
                <Link2 className="h-3 w-3 mr-1.5" />Connect
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
  const { user } = useAuth()
  const [loading, setLoading] = useState<"ACCESS" | "DELETION" | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  const submitRequest = async (type: "ACCESS" | "DELETION") => {
    setLoading(type)
    try {
      await apiClient.post(USER_ROUTES.DATA_REQUEST, { type })
      if (type === "ACCESS") {
        toast.success("Data export requested. You will receive an email within 30 days.")
      } else {
        toast.success("Account deletion initiated. Your account has been deactivated.")
      }
    } catch {
      toast.error("Request failed. Please try again or contact privacy@taskforce.dev.")
    } finally {
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
              We will send an email to <span className="font-medium">{user?.email}</span> with your data within 30 days, as required by GDPR Art. 20.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 h-8 text-xs"
            disabled={loading === "ACCESS"}
            onClick={() => submitRequest("ACCESS")}
          >
            {loading === "ACCESS" ? "Sending…" : "Request export"}
          </Button>
        </div>
      </SectionCard>

      <SectionCard title="Delete account" description="Permanently remove your account and all associated data.">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-foreground">Delete my account</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Your account will be deactivated immediately. All workspace data will be purged within 30 days. This action is irreversible.
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
                onClick={() => submitRequest("DELETION")}
              >
                {loading === "DELETION" ? "Processing…" : "Confirm deletion"}
              </Button>
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

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
    <div className="flex gap-8 max-w-5xl mx-auto w-full min-h-0">
      <nav className="flex flex-col gap-6 w-48 shrink-0">
        {SECTION_GROUPS.map((group) => (
          <div key={group.label} className="flex flex-col gap-0.5">
            <p className="px-3 mb-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{group.label}</p>
            {SECTIONS.filter((s) => (group.keys as readonly string[]).includes(s.key)).map((s) => (
              <button
                key={s.key}
                onClick={() => setActive(s.key)}
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

      <Separator orientation="vertical" className="self-stretch" />

      <div className="flex-1 min-w-0">
        <h2 className="text-base font-semibold text-foreground mb-5">{activeSection?.label}</h2>
        {active === "profile"       && <ProfilePanel />}
        {active === "account"       && <AccountPanel />}
        {active === "appearance"    && <AppearancePanel />}
        {active === "notifications" && <NotificationsPanel />}
        {active === "security"      && <SecurityPanel />}
        {active === "workspace"     && <WorkspacePanel />}
        {active === "billing"       && <BillingPanel />}
        {active === "team"          && <TeamPanel />}
        {active === "integrations"  && <IntegrationsPanel />}
        {active === "privacy"       && <PrivacyPanel />}
      </div>
    </div>
  )
}