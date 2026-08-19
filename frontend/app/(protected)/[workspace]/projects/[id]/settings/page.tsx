"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import {
  Settings,
  Trash2,
  AlertTriangle,
  Users,
  GitBranch,
  Plug,
  Save,
  Archive,
  Loader2,
  Tag,
  Pencil,
  Check,
  X,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { useSettingsStore } from "@/lib/store/settings-store"
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
import { BrandLogo } from "@/components/ui/brand-logo"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { useProjectStore } from "@/lib/store/project-store"
import { useUserStore } from "@/lib/store/user-store"
import { useLabelStore } from "@/lib/store/label-store"
import type { ProjectStatus } from "@/lib/api/project-service"

// ---------------------------------------------------------------------------
// Sous-navigation de la page réglages (sidebar secondaire)
// ---------------------------------------------------------------------------

const SECTIONS = [
  { key: "general",      label: "General",      icon: Settings },
  { key: "members",      label: "Members",      icon: Users },
  { key: "labels",       label: "Labels",       icon: Tag },
  { key: "integrations", label: "Integrations", icon: GitBranch },
] as const

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
  const params    = useParams()
  const router    = useRouter()
  const workspace  = typeof params.workspace === "string" ? params.workspace : ""
  const openSettings = useSettingsStore((s) => s.openSettings)
  const projectId  = typeof params.id        === "string" ? Number(params.id)  : 0

  const { activeProject, updateProject, archiveProject, deleteProject } = useProjectStore()
  const { user } = useUserStore()
  const { labelsByProject, fetchLabels, addLabel, editLabel, removeLabel } = useLabelStore()

  const [name,          setName]          = useState("")
  const [description,   setDescription]   = useState("")
  const [status,        setStatus]        = useState<ProjectStatus>("ACTIVE")
  const [growthMode,    setGrowthMode]    = useState(false)

  // Labels state
  const [newLabelName,  setNewLabelName]  = useState("")
  const [newLabelColor, setNewLabelColor] = useState("#6366f1")
  const [newLabelDesc,  setNewLabelDesc]  = useState("")
  const [addingLabel,   setAddingLabel]   = useState(false)
  const [editingLabelId, setEditingLabelId] = useState<number | null>(null)
  const [editLabelName,  setEditLabelName]  = useState("")
  const [editLabelColor, setEditLabelColor] = useState("")
  const [editLabelDesc,  setEditLabelDesc]  = useState("")
  const [isSaving,      setIsSaving]      = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState("")
  const [deleteOpen,    setDeleteOpen]    = useState(false)
  const [section,       setSection]       = useState<string>("general")

  // Sync state when activeProject loads
  useEffect(() => {
    if (activeProject) {
      setName(activeProject.name)
      setDescription(activeProject.description ?? "")
      setStatus(activeProject.status)
      setGrowthMode(activeProject.growthMode)
    }
  }, [activeProject])

  // Load labels when project is known
  useEffect(() => {
    if (workspace && projectId) fetchLabels(workspace, projectId).catch(() => {})
  }, [workspace, projectId, fetchLabels])

  if (!activeProject) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  async function handleSaveGeneral(e: React.FormEvent) {
    e.preventDefault()
    setIsSaving(true)
    const result = await updateProject(workspace, projectId, { name, description, status, growthMode })
    setIsSaving(false)
    if (result) {
      toast.success("Settings saved", { description: "Your changes have been applied." })
    } else {
      toast.error("Error while saving")
    }
  }

  async function handleArchive() {
    const result = await archiveProject(workspace, projectId)
    if (result) {
      toast.warning("Project archived")
    } else {
      toast.error("Error while archiving")
    }
  }

  async function handleDelete() {
    if (deleteConfirm !== activeProject!.name) return
    await deleteProject(workspace, projectId)
    toast.error("Project deleted", { description: `${activeProject!.name} has been deleted.` })
    setDeleteOpen(false)
    router.push(`/${workspace}/projects`)
  }

  const members = activeProject.members ?? []
  const projectLabels = labelsByProject[projectId] ?? []

  async function handleAddLabel(e: React.FormEvent) {
    e.preventDefault()
    if (!newLabelName.trim()) return
    setAddingLabel(true)
    await addLabel(workspace, projectId, { name: newLabelName.trim(), color: newLabelColor, description: newLabelDesc.trim() || undefined })
    setNewLabelName("")
    setNewLabelColor("#6366f1")
    setNewLabelDesc("")
    setAddingLabel(false)
    toast.success("Label created")
  }

  function startEditLabel(l: typeof projectLabels[0]) {
    setEditingLabelId(l.id)
    setEditLabelName(l.name)
    setEditLabelColor(l.color)
    setEditLabelDesc(l.description ?? "")
  }

  async function handleSaveEditLabel(labelId: number) {
    await editLabel(workspace, projectId, labelId, { name: editLabelName.trim() || undefined, color: editLabelColor || undefined, description: editLabelDesc.trim() || undefined })
    setEditingLabelId(null)
    toast.success("Label updated")
  }

  async function handleDeleteLabel(labelId: number) {
    await removeLabel(workspace, projectId, labelId)
    toast.success("Label deleted")
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl gap-8">
      {/* ── Sidebar secondaire (desktop) ── */}
      <aside className="hidden w-52 shrink-0 md:block">
        <nav className="sticky top-4 flex flex-col gap-0.5">
          {SECTIONS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSection(s.key)}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                section === s.key ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <s.icon className="size-4 shrink-0" /> {s.label}
            </button>
          ))}
          <div className="my-1.5 h-px bg-border" />
          <button
            type="button"
            onClick={() => setSection("danger")}
            className={cn(
              "flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors",
              section === "danger" ? "bg-red-500/10 font-medium text-red-400" : "text-muted-foreground hover:bg-red-500/5 hover:text-red-400",
            )}
          >
            <AlertTriangle className="size-4 shrink-0" /> Danger zone
          </button>
        </nav>
      </aside>

      {/* ── Contenu ── */}
      <div className="min-w-0 flex-1 md:max-w-2xl">
        {/* Sous-nav mobile (pills) */}
        <div className="mb-5 flex gap-1.5 overflow-x-auto pb-1 md:hidden">
          {[...SECTIONS, { key: "danger", label: "Danger", icon: AlertTriangle }].map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSection(s.key)}
              className={cn(
                "flex shrink-0 items-center whitespace-nowrap rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                section === s.key ? "border-foreground/20 bg-foreground/10 text-foreground" : "border-border text-muted-foreground",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>

      {/* ── General ── */}
      {section === "general" && (
      <section>
        <SectionTitle icon={Settings} title="General" description="General project information" />
        <form onSubmit={handleSaveGeneral} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="project-name" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Project name</label>
              <Input id="project-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="My project" />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="project-identifier" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Identifier</label>
              <Input
                id="project-identifier"
                value={activeProject.identifier}
                readOnly
                disabled
                className="w-24 font-mono uppercase"
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
              placeholder="Project description..."
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status</p>
            <Select value={status} onValueChange={(v) => setStatus(v as ProjectStatus)}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />Active
                  </span>
                </SelectItem>
                <SelectItem value="PAUSED">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-amber-500 inline-block" />Paused
                  </span>
                </SelectItem>
                <SelectItem value="ARCHIVED">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-muted-foreground inline-block" />Archived
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Mode montée en compétence (PROD-1.8 Phase 3) */}
          <div className="flex items-start justify-between gap-4 rounded-lg border border-border p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">🌱 Skill growth mode</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Smart Assign can suggest a task a notch above a member&apos;s usual level
                (never on urgent work, only when capacity is available). Bounded bonus — it won&apos;t override the best fit.
              </p>
            </div>
            <Switch checked={growthMode} onCheckedChange={setGrowthMode} />
          </div>

          <div className="flex justify-end">
            <Button type="submit" size="sm" className="gap-2" disabled={isSaving}>
              {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save
            </Button>
          </div>
        </form>
      </section>
      )}

      {/* ── Members ── */}
      {section === "members" && (
      <section>
        <div className="flex items-start justify-between gap-4">
          <SectionTitle icon={Users} title="Members" description="Manage project access" />
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 gap-1.5"
            onClick={() => router.push(`/${workspace}/projects/${projectId}/members`)}
          >
            <Users className="h-3.5 w-3.5" /> Manage members
          </Button>
        </div>
        <div className="flex flex-col gap-2">
          {members.map((m) => {
            const isMe      = user?.email === m.email
            const initials  = m.displayName
              ? m.displayName.trim().split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase()
              : m.email.slice(0, 2).toUpperCase()
            const colors    = ["bg-violet-500","bg-blue-500","bg-emerald-500","bg-orange-500","bg-pink-500","bg-cyan-500"]
            const color     = colors[m.userId % colors.length]
            return (
              <div key={m.id} className="flex items-center gap-3 py-2.5 px-3 rounded-lg border border-border bg-card">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className={cn("text-xs text-white", color)}>{initials}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-none">
                    {m.displayName ?? m.email}
                    {isMe && <span className="text-muted-foreground font-normal ml-1">(you)</span>}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{m.email}</p>
                </div>
                <Badge variant="outline" className="text-xs capitalize">{m.role.toLowerCase()}</Badge>
              </div>
            )
          })}
        </div>
      </section>
      )}

      {/* ── Labels ── */}
      {section === "labels" && (
      <section>
        <SectionTitle icon={Tag} title="Labels" description="Custom labels to categorize issues" />
        <div className="flex flex-col gap-2">
          {projectLabels.length === 0 && (
            <p className="text-xs text-muted-foreground italic py-2">No labels — add one below.</p>
          )}
          {projectLabels.map((l) => editingLabelId === l.id ? (
            <div key={l.id} className="flex items-center gap-2 py-2 px-3 rounded-lg border border-border bg-card">
              <input
                type="color"
                value={editLabelColor}
                onChange={(e) => setEditLabelColor(e.target.value)}
                className="h-7 w-7 rounded cursor-pointer border border-border bg-transparent p-0.5"
                title="Color"
              />
              <Input
                value={editLabelName}
                onChange={(e) => setEditLabelName(e.target.value)}
                className="h-7 text-xs flex-1"
                placeholder="Name"
              />
              <Input
                value={editLabelDesc}
                onChange={(e) => setEditLabelDesc(e.target.value)}
                className="h-7 text-xs flex-1"
                placeholder="Description (optional)"
              />
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => handleSaveEditLabel(l.id)} title="Save">
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              </Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditingLabelId(null)} title="Cancel">
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </div>
          ) : (
            <div key={l.id} className="flex items-center gap-3 py-2.5 px-3 rounded-lg border border-border bg-card">
              <span
                className="h-3.5 w-3.5 rounded-full shrink-0"
                style={{ backgroundColor: l.color }}
              />
              <span
                className="text-xs font-medium px-2 py-0.5 rounded-full shrink-0"
                style={{ backgroundColor: `${l.color}22`, color: l.color }}
              >
                {l.name}
              </span>
              <span className="text-xs text-muted-foreground flex-1 truncate">{l.description}</span>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0" onClick={() => startEditLabel(l)} title="Edit">
                <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 shrink-0 hover:text-red-400"
                onClick={() => handleDeleteLabel(l.id)}
                title="Delete"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}

          {/* Create form */}
          <form onSubmit={handleAddLabel} className="flex items-center gap-2 mt-2">
            <input
              type="color"
              value={newLabelColor}
              onChange={(e) => setNewLabelColor(e.target.value)}
              className="h-7 w-7 rounded cursor-pointer border border-border bg-transparent p-0.5 shrink-0"
              title="Color"
            />
            <Input
              value={newLabelName}
              onChange={(e) => setNewLabelName(e.target.value)}
              className="h-7 text-xs flex-1"
              placeholder="Label name"
              required
            />
            <Input
              value={newLabelDesc}
              onChange={(e) => setNewLabelDesc(e.target.value)}
              className="h-7 text-xs flex-1"
              placeholder="Description (optional)"
            />
            <Button type="submit" size="sm" className="h-7 text-xs shrink-0 gap-1.5" disabled={addingLabel || !newLabelName.trim()}>
              {addingLabel ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Add
            </Button>
          </form>
        </div>
      </section>
      )}

      {/* ── Integrations → gérées au niveau workspace ── */}
      {section === "integrations" && (
      <section>
        <SectionTitle icon={GitBranch} title="Integrations" description="Managed once for the whole workspace" />
        <div className="flex flex-col items-start gap-4 rounded-xl border border-border bg-card p-5">
          <div className="flex items-center gap-2">
            {["github", "slack", "linear", "notion", "figma"].map((k) => (
              <div key={k} className="flex size-8 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted p-1.5">
                <BrandLogo slug={k} name={k} className="size-full" />
              </div>
            ))}
            <span className="ml-1 text-xs text-muted-foreground">+40 others</span>
          </div>
          <p className="text-sm text-muted-foreground">
            GitHub, Slack and all connectors plug in at the <span className="font-medium text-foreground">workspace</span> level, then apply to this project — a single place to manage.
          </p>
          <Button className="gap-2" onClick={() => openSettings("integrations")}>
            <Plug className="size-4" /> Manage integrations
          </Button>
        </div>
      </section>
      )}

      {/* ── Danger Zone ── */}
      {section === "danger" && (
      <section>
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 overflow-hidden">
          <div className="px-4 py-3 border-b border-red-500/20">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-red-400" />
              <h2 className="text-sm font-semibold text-red-400">Danger zone</h2>
            </div>
          </div>
          <div className="p-4 flex flex-col gap-4">

            {/* Archive */}
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-foreground">Archive this project</p>
                <p className="text-xs text-muted-foreground mt-0.5">The project will be hidden but its data kept.</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0 gap-2 border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                onClick={handleArchive}
              >
                <Archive className="h-3.5 w-3.5" />
                Archive
              </Button>
            </div>

            <Separator className="bg-red-500/10" />

            {/* Delete */}
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-foreground">Delete this project</p>
                <p className="text-xs text-muted-foreground mt-0.5">Irreversible action. All data will be lost.</p>
              </div>
              <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <DialogTrigger asChild>
                  <Button variant="destructive" size="sm" className="shrink-0 gap-2">
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-red-400">
                      <AlertTriangle className="h-5 w-5" />
                      Delete project
                    </DialogTitle>
                    <DialogDescription>
                      This action is irreversible. Type <strong>{activeProject.name}</strong> to confirm.
                    </DialogDescription>
                  </DialogHeader>
                  <Input
                    value={deleteConfirm}
                    onChange={(e) => setDeleteConfirm(e.target.value)}
                    placeholder={activeProject.name}
                    className="mt-2"
                  />
                  <DialogFooter>
                    <Button variant="outline" onClick={() => { setDeleteOpen(false); setDeleteConfirm("") }}>Cancel</Button>
                    <Button
                      variant="destructive"
                      disabled={deleteConfirm !== activeProject.name}
                      onClick={handleDelete}
                    >
                      Delete permanently
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>
      </section>
      )}
      </div>
    </div>
  )
}

