"use client"

import { useState } from "react"
import { User, Bell, CreditCard, Users, Shield, Check, Zap } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { useTranslation } from "@/lib/i18n"
import { useAuth } from "@/lib/contexts/auth-context"
import { cn } from "@/lib/utils"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SettingsTab = "profile" | "account" | "notifications" | "billing" | "team"

interface TabConfig {
  key: SettingsTab
  labelKey: string
  icon: React.ReactNode
}

// ---------------------------------------------------------------------------
// Tab config
// ---------------------------------------------------------------------------

const TABS: TabConfig[] = [
  { key: "profile", labelKey: "settings.profile", icon: <User className="h-4 w-4" /> },
  { key: "account", labelKey: "settings.account", icon: <Shield className="h-4 w-4" /> },
  { key: "notifications", labelKey: "settings.notifications", icon: <Bell className="h-4 w-4" /> },
  { key: "billing", labelKey: "settings.billing", icon: <CreditCard className="h-4 w-4" /> },
  { key: "team", labelKey: "settings.team", icon: <Users className="h-4 w-4" /> },
]

const PLAN_FEATURES: Record<string, string[]> = {
  free: ["3 projects", "5 members", "1 cycle active", "100 issues"],
  pro: ["Unlimited projects", "Unlimited members", "Unlimited cycles", "Analytics & charts", "Priority support"],
  enterprise: ["Everything in Pro", "SSO / SAML", "Audit logs", "Custom roles", "SLA"],
}

// ---------------------------------------------------------------------------
// Panel components
// ---------------------------------------------------------------------------

function ProfilePanel() {
  const { t } = useTranslation()
  const [saved, setSaved] = useState(false)
  const [name, setName] = useState("Your Name")
  const [email] = useState("you@taskforce.io")

  function handleSave() {
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="flex flex-col gap-6 max-w-md">
      {/* Avatar */}
      <div className="flex items-center gap-4">
        <Avatar className="h-16 w-16">
          <AvatarFallback className="text-lg font-semibold bg-primary text-white">ME</AvatarFallback>
        </Avatar>
        <div>
          <Button variant="outline" size="sm" className="h-8 text-xs">Upload photo</Button>
          <p className="text-xs text-muted-foreground mt-1">JPG, PNG or GIF — max 2 MB</p>
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {/* Display name */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">{t("settings.displayName")}</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all"
          />
        </div>

        {/* Email (read-only) */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">{t("settings.email")}</label>
          <input
            type="email"
            value={email}
            readOnly
            className="h-9 rounded-md border border-border bg-muted/40 px-3 text-sm text-muted-foreground cursor-default outline-none"
          />
          <p className="text-xs text-muted-foreground">Email managed via your identity provider.</p>
        </div>

        {/* Language */}
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium text-foreground">{t("settings.language")}</label>
          <select className="h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all">
            <option value="en">English</option>
            <option value="fr">Français</option>
          </select>
        </div>
      </div>

      <Button size="sm" className="h-9 w-fit gap-2" onClick={handleSave}>
        {saved ? <><Check className="h-3.5 w-3.5" />{t("settings.saved")}</> : t("settings.saveChanges")}
      </Button>
    </div>
  )
}

function NotificationsPanel() {
  const [prefs, setPrefs] = useState({
    mentions: true,
    assignments: true,
    comments: true,
    statusChanges: false,
    dueSoon: true,
    weeklyDigest: false,
  })

  function toggle(key: keyof typeof prefs) {
    setPrefs((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const rows = [
    { key: "mentions" as const, label: "Mentions", desc: "When someone @mentions you" },
    { key: "assignments" as const, label: "Assignments", desc: "When an issue is assigned to you" },
    { key: "comments" as const, label: "Comments", desc: "When someone comments on your issues" },
    { key: "statusChanges" as const, label: "Status changes", desc: "When issue status you own changes" },
    { key: "dueSoon" as const, label: "Due soon", desc: "1 day before an issue is due" },
    { key: "weeklyDigest" as const, label: "Weekly digest", desc: "Summary email every Monday" },
  ]

  return (
    <div className="flex flex-col gap-3 max-w-md">
      <div className="rounded-xl border border-border bg-card [box-shadow:var(--shadow-sm)] overflow-hidden">
        {rows.map((row, i) => (
          <div
            key={row.key}
            className={cn(
              "flex items-center justify-between px-4 py-3.5",
              i < rows.length - 1 && "border-b border-border/50"
            )}
          >
            <div>
              <p className="text-sm font-medium text-foreground">{row.label}</p>
              <p className="text-xs text-muted-foreground">{row.desc}</p>
            </div>
            <button
              onClick={() => toggle(row.key)}
              className={cn(
                "relative h-5 w-9 rounded-full transition-colors shrink-0",
                prefs[row.key] ? "bg-primary" : "bg-muted"
              )}
              role="switch"
              aria-checked={prefs[row.key]}
            >
              <span
                className={cn(
                  "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
                  prefs[row.key] ? "translate-x-4" : "translate-x-0.5"
                )}
              />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function BillingPanel() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const plan = (user?.plan ?? "free") as string
  const features = PLAN_FEATURES[plan] ?? PLAN_FEATURES.free

  return (
    <div className="flex flex-col gap-6 max-w-md">
      {/* Current plan */}
      <div className="rounded-xl border border-border bg-card p-4 [box-shadow:var(--shadow-sm)]">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-xs text-muted-foreground mb-0.5">{t("settings.currentPlan")}</p>
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold capitalize text-foreground">{plan}</span>
              {plan !== "free" && (
                <Badge variant="outline" className="bg-amber-500/15 text-amber-400 border-amber-500/20 text-xs">
                  <Zap className="h-3 w-3 mr-1" />
                  Active
                </Badge>
              )}
            </div>
          </div>
          {plan === "free" && (
            <Button size="sm" className="h-8 text-xs gap-1.5">
              <Zap className="h-3.5 w-3.5" />
              {t("settings.upgrade")}
            </Button>
          )}
        </div>
        <ul className="flex flex-col gap-1.5">
          {features.map((f) => (
            <li key={f} className="flex items-center gap-2 text-xs text-muted-foreground">
              <Check className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
              {f}
            </li>
          ))}
        </ul>
      </div>

      {plan === "free" && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-amber-400" />
            <span className="text-sm font-semibold text-amber-400">Upgrade to Pro</span>
          </div>
          <p className="text-xs text-muted-foreground">Unlock analytics, unlimited projects, and priority support.</p>
          <Button size="sm" className="h-8 text-xs w-fit gap-1.5 mt-1">
            <Zap className="h-3.5 w-3.5" />
            Upgrade — $12/mo
          </Button>
        </div>
      )}
    </div>
  )
}

function AccountPanel() {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-6 max-w-md">
      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-foreground">Password</h3>
        <p className="text-sm text-muted-foreground">Your password is managed via Keycloak. To change it, visit your account settings.</p>
        <Button variant="outline" size="sm" className="h-8 text-xs w-fit">Manage in Keycloak</Button>
      </div>

      <Separator />

      <div className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-destructive">{t("settings.dangerZone")}</h3>
        <p className="text-sm text-muted-foreground">{t("settings.deleteAccountDesc")}</p>
        <Button variant="destructive" size="sm" className="h-8 text-xs w-fit">
          {t("settings.deleteAccount")}
        </Button>
      </div>
    </div>
  )
}

function TeamPanel() {
  return (
    <div className="flex flex-col gap-4 max-w-md">
      <p className="text-sm text-muted-foreground">Manage your workspace&apos;s team members, roles, and invitations.</p>
      <div className="rounded-xl border border-border bg-card [box-shadow:var(--shadow-sm)] overflow-hidden">
        {[
          { name: "You", email: "you@taskforce.io", role: "Owner", initials: "ME", color: "bg-primary" },
          { name: "Sophie Martin", email: "sophie@taskforce.io", role: "Admin", initials: "SM", color: "bg-violet-500" },
          { name: "Emma Petit", email: "emma@taskforce.io", role: "Member", initials: "EP", color: "bg-emerald-500" },
          { name: "Thomas Bernard", email: "thomas@taskforce.io", role: "Member", initials: "TB", color: "bg-orange-500" },
        ].map((member, i, arr) => (
          <div key={member.email} className={cn("flex items-center gap-3 px-4 py-3", i < arr.length - 1 && "border-b border-border/50")}>
            <div className={cn("h-8 w-8 rounded-full flex items-center justify-center text-xs font-medium text-white shrink-0", member.color)}>
              {member.initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">{member.name}</p>
              <p className="text-xs text-muted-foreground">{member.email}</p>
            </div>
            <Badge variant="outline" className="text-xs">{member.role}</Badge>
          </div>
        ))}
      </div>
      <Button variant="outline" size="sm" className="h-8 text-xs w-fit">Invite member</Button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SettingsPage() {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile")

  return (
    <div className="flex gap-8 max-w-4xl mx-auto w-full">
      {/* Sidebar nav */}
      <nav className="flex flex-col gap-0.5 w-44 shrink-0">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm text-left transition-colors",
              activeTab === tab.key
                ? "bg-muted text-foreground font-medium"
                : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
            )}
          >
            {tab.icon}
            {t(tab.labelKey)}
          </button>
        ))}
      </nav>

      <Separator orientation="vertical" className="self-stretch" />

      {/* Panel */}
      <div className="flex-1 min-w-0">
        <h2 className="text-base font-semibold text-foreground mb-5">{t(`settings.${activeTab}`)}</h2>
        {activeTab === "profile" && <ProfilePanel />}
        {activeTab === "account" && <AccountPanel />}
        {activeTab === "notifications" && <NotificationsPanel />}
        {activeTab === "billing" && <BillingPanel />}
        {activeTab === "team" && <TeamPanel />}
      </div>
    </div>
  )
}
