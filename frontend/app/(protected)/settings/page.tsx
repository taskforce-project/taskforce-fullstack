"use client"

import { useState } from "react"
import {
  User, Bell, CreditCard, Users, Check, Zap, Globe, Key, Palette, Webhook,
  AlertTriangle, X as XIcon, Plus,
} from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useAuth } from "@/lib/contexts/auth-context"
import { cn } from "@/lib/utils"

type SettingsSection =
  | "profile"
  | "account"
  | "appearance"
  | "notifications"
  | "security"
  | "billing"
  | "team"
  | "integrations"

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
  { key: "billing",       label: "Billing & Plan", icon: <CreditCard className="h-4 w-4" />, group: "Workspace" },
  { key: "team",          label: "Members",        icon: <Users className="h-4 w-4" />,      group: "Workspace" },
  { key: "integrations",  label: "Integrations",   icon: <Webhook className="h-4 w-4" />,    group: "Workspace" },
]

const PLAN_FEATURES: Record<string, string[]> = {
  free:       ["Up to 3 projects", "Up to 5 members", "1 active cycle", "100 issues total", "Community support"],
  pro:        ["Unlimited projects", "Unlimited members", "Unlimited cycles", "Advanced analytics", "Burndown charts", "Priority support"],
  enterprise: ["Everything in Pro", "SSO / SAML", "Audit logs", "Custom roles & permissions", "Dedicated SLA", "Custom onboarding"],
}

const SECTION_GROUPS = [
  { label: "Personal",  keys: ["profile", "account", "appearance", "notifications", "security"] as const },
  { label: "Workspace", keys: ["billing", "team", "integrations"] as const },
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
  const [name, setName] = useState("Your Name")
  const [bio, setBio] = useState("")
  const [role, setRole] = useState("")
  const [skills, setSkills] = useState<string[]>([])

  const isProfileComplete = skills.length > 0 && role.trim().length > 0

  return (
    <div className="flex flex-col gap-4">
      {!isProfileComplete && (
        <div className="flex items-center gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-400">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Complete your profile — add your <strong className="font-semibold">role</strong> and{" "}
          <strong className="font-semibold">skills</strong> to enable smart issue assignment.
        </div>
      )}
      <SectionCard title="Public profile" description="This information is visible to all workspace members.">
        <div className="flex flex-col gap-5">
          <FormField label="Profile picture">
            <div className="flex items-center gap-3">
              <Avatar className="h-14 w-14">
                <AvatarFallback className="text-base font-semibold bg-primary text-primary-foreground">ME</AvatarFallback>
              </Avatar>
              <div>
                <Button variant="outline" size="sm" className="h-8 text-xs">Upload photo</Button>
                <p className="text-xs text-muted-foreground mt-1">JPG, PNG or GIF - max 2 MB</p>
              </div>
            </div>
          </FormField>
          <Separator />
          <FormField label="Display name" hint="Used across Taskforce.">
            <StyledInput value={name} onChange={(e) => setName(e.target.value)} />
          </FormField>
          <FormField label="Role / Title *" hint="Required — shown to team members.">
            <StyledInput
              value={role}
              onChange={(e) => setRole(e.target.value)}
              placeholder="e.g. Lead Engineer"
              className={role.trim() ? "" : "border-amber-500/40"}
            />
          </FormField>
          <FormField label="Skills *" hint="Required — used for smart issue assignment.">
            <SkillsTagInput value={skills} onChange={setSkills} />
          </FormField>
          <FormField label="Bio" hint="Brief description.">
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              placeholder="Tell your team a bit about yourself..."
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all resize-none"
            />
          </FormField>
        </div>
      </SectionCard>
      <div className="flex justify-end">
        <Button
          size="sm"
          className="h-8 text-xs"
          disabled={!isProfileComplete}
          onClick={() => toast.success("Profile updated")}
        >
          Save profile
        </Button>
      </div>
    </div>
  )
}

function AccountPanel() {
  const [email] = useState("you@taskforce.io")
  const [timezone, setTimezone] = useState("Europe/Paris")
  const [language, setLanguage] = useState("en")

  return (
    <div className="flex flex-col gap-4">
      <SectionCard title="Account info" description="Manage your login and localization preferences.">
        <div className="flex flex-col gap-5">
          <FormField label="Email" hint="Managed via your identity provider.">
            <StyledInput type="email" value={email} readOnly />
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
  const plan = (user?.plan ?? "free") as string

  const PLANS = [
    { key: "free",       label: "Free",       price: "$0",     features: PLAN_FEATURES.free,       highlight: false },
    { key: "pro",        label: "Pro",        price: "$12/mo", features: PLAN_FEATURES.pro,        highlight: true  },
    { key: "enterprise", label: "Enterprise", price: "Custom", features: PLAN_FEATURES.enterprise, highlight: false },
  ]

  return (
    <div className="flex flex-col gap-4">
      <SectionCard title="Current plan" description="You can upgrade or downgrade at any time.">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold capitalize text-foreground">{plan}</span>
              {plan !== "free" && (
                <Badge variant="outline" className="bg-amber-500/15 text-amber-400 border-amber-500/20 text-xs">
                  <Zap className="h-3 w-3 mr-1" />Active
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {plan === "free" ? "No active subscription" : "Billed monthly - renews Jan 15, 2026"}
            </p>
          </div>
          {plan !== "free" && (
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

function TeamPanel() {
  const [invited, setInvited] = useState("")
  const [roles, setRoles] = useState<Record<string, string>>({
    "you@taskforce.io":    "owner",
    "sophie@taskforce.io": "admin",
    "emma@taskforce.io":   "member",
    "thomas@taskforce.io": "member",
  })

  const MEMBERS = [
    { name: "You",            email: "you@taskforce.io",    initials: "ME", color: "bg-primary"     },
    { name: "Sophie Martin",  email: "sophie@taskforce.io", initials: "SM", color: "bg-violet-500"  },
    { name: "Emma Petit",     email: "emma@taskforce.io",   initials: "EP", color: "bg-emerald-500" },
    { name: "Thomas Bernard", email: "thomas@taskforce.io", initials: "TB", color: "bg-orange-500"  },
  ]

  return (
    <div className="flex flex-col gap-4">
      <SectionCard title="Workspace members" description="Manage members, roles, and invitations.">
        <div className="flex flex-col divide-y divide-border/50">
          {MEMBERS.map((m) => (
            <div key={m.email} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <div className={cn("h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold text-white shrink-0", m.color)}>
                {m.initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{m.name}</p>
                <p className="text-xs text-muted-foreground">{m.email}</p>
              </div>
              <Select
                value={roles[m.email]}
                onValueChange={(val) => setRoles((r) => ({ ...r, [m.email]: val }))}
                disabled={roles[m.email] === "owner"}
              >
                <SelectTrigger size="sm" className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner">Owner</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
              {roles[m.email] !== "owner" && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 shrink-0"
                  onClick={() => toast.success(`${m.name} removed`)}
                >
                  Remove
                </Button>
              )}
            </div>
          ))}
        </div>
      </SectionCard>
      <SectionCard title="Invite member" description="Send an invitation by email.">
        <div className="flex gap-2">
          <StyledInput
            type="email"
            placeholder="colleague@company.com"
            value={invited}
            onChange={(e) => setInvited(e.target.value)}
          />
          <Button
            size="sm"
            className="h-9 text-xs shrink-0"
            onClick={() => { toast.success(`Invitation sent to ${invited}`); setInvited("") }}
            disabled={!invited}
          >
            Send invite
          </Button>
        </div>
      </SectionCard>
    </div>
  )
}

function IntegrationsPanel() {
  const [webhookUrl, setWebhookUrl] = useState("")

  const INTEGRATIONS = [
    { key: "github", name: "GitHub", desc: "Link issues to pull requests and commits.",    icon: "GH", connected: true  },
    { key: "slack",  name: "Slack",  desc: "Get notifications directly in your channels.", icon: "SL", connected: false },
    { key: "figma",  name: "Figma",  desc: "Attach Figma designs to issues.",              icon: "FG", connected: false },
  ]

  return (
    <div className="flex flex-col gap-4">
      <SectionCard title="Connected apps" description="Manage your third-party integrations.">
        <div className="flex flex-col divide-y divide-border/50">
          {INTEGRATIONS.map((integration) => (
            <div key={integration.key} className="flex items-center gap-4 py-4 first:pt-0 last:pb-0">
              <div className="h-10 w-10 rounded-lg border border-border bg-muted flex items-center justify-center text-xs font-bold text-foreground shrink-0">
                {integration.icon}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{integration.name}</p>
                <p className="text-xs text-muted-foreground">{integration.desc}</p>
              </div>
              {integration.connected ? (
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs text-emerald-400 border-emerald-500/20 bg-emerald-500/10">Connected</Badge>
                  <Button variant="outline" size="sm" className="h-7 text-xs text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => toast.success(`${integration.name} disconnected`)}>
                    Disconnect
                  </Button>
                </div>
              ) : (
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => toast.info(`Connecting ${integration.name}...`)}>
                  Connect
                </Button>
              )}
            </div>
          ))}
        </div>
      </SectionCard>
      <SectionCard title="Webhooks" description="Receive HTTP POST events for workspace activity.">
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <StyledInput
              type="url"
              placeholder="https://example.com/webhook"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
            />
            <Button
              size="sm"
              className="h-9 text-xs shrink-0"
              disabled={!webhookUrl}
              onClick={() => { toast.success("Webhook saved"); setWebhookUrl("") }}
            >
              Add webhook
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Events: issue.created, issue.updated, issue.deleted, cycle.completed</p>
        </div>
      </SectionCard>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const [active, setActive] = useState<SettingsSection>("profile")

  const activeSection = SECTIONS.find((s) => s.key === active)

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
        {active === "billing"       && <BillingPanel />}
        {active === "team"          && <TeamPanel />}
        {active === "integrations"  && <IntegrationsPanel />}
      </div>
    </div>
  )
}