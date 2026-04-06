"use client"

import { useState } from "react"
import { useParams } from "next/navigation"
import {
  Settings,
  Trash2,
  AlertTriangle,
  Users,
  GitBranch,
  MessageSquare,
  Webhook,
  Save,
  Archive,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

// ---------------------------------------------------------------------------
// Mock data
// ---------------------------------------------------------------------------

const MOCK_PROJECTS: Record<string, { name: string; description: string; emoji: string; identifier: string; status: "active" | "paused" | "archived" }> = {
  "1": { name: "Website Redesign", description: "Complete overhaul of the marketing site with new design system and improved performance.", emoji: "🎨", identifier: "WR", status: "active" },
  "2": { name: "Mobile App", description: "iOS & Android native app with offline support.", emoji: "📱", identifier: "MA", status: "active" },
  "3": { name: "API v2", description: "New RESTful API with improved auth and performance.", emoji: "⚡", identifier: "API", status: "active" },
}

const INTEGRATIONS = [
  { id: "github", name: "GitHub", description: "Sync issues with GitHub pull requests and commits.", icon: GitBranch, connected: true, detail: "taskforce-org/website-redesign" },
  { id: "slack", name: "Slack", description: "Get notifications in Slack when issues are updated.", icon: MessageSquare, connected: false, detail: null },
  { id: "webhook", name: "Webhooks", description: "Send custom HTTP requests on project events.", icon: Webhook, connected: false, detail: null },
]

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

function handleSaveGeneral(e: React.FormEvent) {
  e.preventDefault()
  toast.success("Paramètres sauvegardés", { description: "Les modifications ont été appliquées." })
}

// ---------------------------------------------------------------------------
// Section components
// ---------------------------------------------------------------------------

function SectionTitle({ icon: Icon, title, description }: Readonly<{ icon: React.ElementType; title: string; description?: string }>) {
  return (
    <div className="flex items-start gap-3 mb-5">
      <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ProjectSettingsPage() {
  const params = useParams()
  const projectId = typeof params.id === "string" ? params.id : "1"
  const project = MOCK_PROJECTS[projectId] ?? MOCK_PROJECTS["1"]

  const [name, setName] = useState(project.name)
  const [description, setDescription] = useState(project.description)
  const [identifier, setIdentifier] = useState(project.identifier)
  const [status, setStatus] = useState<"active" | "paused" | "archived">(project.status)
  const [deleteConfirm, setDeleteConfirm] = useState("")

  return (
    <div className="flex flex-col gap-10 max-w-2xl mx-auto w-full">

      {/* ── General ── */}
      <section>
        <SectionTitle icon={Settings} title="Général" description="Informations générales du projet" />
        <form onSubmit={handleSaveGeneral} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="project-name" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Nom du projet</label>
              <Input id="project-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Mon projet" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="project-identifier" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Identifiant</label>
              <Input
                id="project-identifier"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value.toUpperCase().slice(0, 6))}
                placeholder="TF"
                className="w-24 font-mono uppercase"
                maxLength={6}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="project-description" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Description</label>
            <textarea
              id="project-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              placeholder="Description du projet..."
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Statut</p>
            <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block"></span>Actif
                  </span>
                </SelectItem>
                <SelectItem value="paused">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-amber-500 inline-block"></span>En pause
                  </span>
                </SelectItem>
                <SelectItem value="archived">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-muted-foreground inline-block"></span>Archivé
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex justify-end">
            <Button type="submit" size="sm" className="gap-2">
              <Save className="h-3.5 w-3.5" />
              Sauvegarder
            </Button>
          </div>
        </form>
      </section>

      <Separator />

      {/* ── Members ── */}
      <section>
        <SectionTitle icon={Users} title="Membres" description="Gérer les accès au projet" />
        <div className="flex flex-col gap-2">
          {[
            { name: "You", email: "you@taskforce.io", initials: "ME", color: "bg-primary", role: "Owner" },
            { name: "Sophie Martin", email: "sophie@taskforce.io", initials: "SM", color: "bg-violet-500", role: "Admin" },
            { name: "Emma Petit", email: "emma@taskforce.io", initials: "EP", color: "bg-emerald-500", role: "Member" },
          ].map((m) => (
            <div key={m.email} className="flex items-center gap-3 py-2.5 px-3 rounded-lg border border-border bg-card">
              <Avatar className="h-8 w-8">
                <AvatarFallback className={cn("text-xs text-white", m.color)}>{m.initials}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium leading-none">{m.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{m.email}</p>
              </div>
              <Select defaultValue={m.role.toLowerCase()}>
                <SelectTrigger className="h-7 text-xs w-28 border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner">Owner</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="member">Member</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ))}
          <Button variant="outline" size="sm" className="gap-2 mt-2 w-fit">
            <Users className="h-3.5 w-3.5" />
            Inviter un membre
          </Button>
        </div>
      </section>

      <Separator />

      {/* ── Integrations ── */}
      <section>
        <SectionTitle icon={GitBranch} title="Intégrations" description="Connectez des services externes" />
        <div className="flex flex-col gap-3">
          {INTEGRATIONS.map((integration) => (
            <div key={integration.id} className="flex items-center gap-4 py-3 px-4 rounded-lg border border-border bg-card">
              <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <integration.icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{integration.name}</p>
                  {integration.connected && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-emerald-500/30 text-emerald-400 bg-emerald-500/10">
                      Connecté
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">
                  {integration.connected ? integration.detail : integration.description}
                </p>
              </div>
              <Button
                variant={integration.connected ? "outline" : "secondary"}
                size="sm"
                className="shrink-0 h-7 text-xs"
                onClick={() => toast.info(integration.connected ? `${integration.name} déconnecté` : `${integration.name} connecté`)}
              >
                {integration.connected ? "Configurer" : "Connecter"}
              </Button>
            </div>
          ))}
        </div>
      </section>

      <Separator />

      {/* ── Danger Zone ── */}
      <section>
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 overflow-hidden">
          <div className="px-4 py-3 border-b border-red-500/20">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-400" />
              <h2 className="text-sm font-semibold text-red-400">Zone de danger</h2>
            </div>
          </div>
          <div className="p-4 flex flex-col gap-4">

            {/* Archive */}
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-foreground">Archiver ce projet</p>
                <p className="text-xs text-muted-foreground mt-0.5">Le projet sera masqué mais les données conservées.</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 gap-2 border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                onClick={() => toast.warning("Projet archivé", { description: "Le projet a été archivé." })}
              >
                <Archive className="h-3.5 w-3.5" />
                Archiver
              </Button>
            </div>

            <Separator className="bg-red-500/10" />

            {/* Delete */}
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-foreground">Supprimer ce projet</p>
                <p className="text-xs text-muted-foreground mt-0.5">Action irréversible. Toutes les données seront perdues.</p>
              </div>
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="destructive" size="sm" className="shrink-0 gap-2">
                    <Trash2 className="h-3.5 w-3.5" />
                    Supprimer
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-red-400">
                      <AlertTriangle className="h-5 w-5" />
                      Supprimer le projet
                    </DialogTitle>
                    <DialogDescription>
                      Cette action est irréversible. Tapez <strong>{project.name}</strong> pour confirmer.
                    </DialogDescription>
                  </DialogHeader>
                  <Input
                    value={deleteConfirm}
                    onChange={(e) => setDeleteConfirm(e.target.value)}
                    placeholder={project.name}
                    className="mt-2"
                  />
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setDeleteConfirm("")}>Annuler</Button>
                    <Button
                      variant="destructive"
                      disabled={deleteConfirm !== project.name}
                      onClick={() => {
                        toast.error("Projet supprimé", { description: `${project.name} a été supprimé.` })
                        setDeleteConfirm("")
                      }}
                    >
                      Supprimer définitivement
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
