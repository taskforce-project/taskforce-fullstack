"use client"

import { useEffect, useState } from "react"
import { Sparkles, X, Plus, Loader2, Save, Pencil } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useSkillStore } from "@/lib/store/skill-store"
import type { Seniority } from "@/lib/api/skill-service"

const MAX_SKILLS = 50

const SENIORITY_OPTIONS: { value: Seniority; label: string }[] = [
  { value: "JUNIOR", label: "Junior" },
  { value: "MID", label: "Mid-level" },
  { value: "SENIOR", label: "Senior" },
  { value: "LEAD", label: "Lead" },
]
const SENIORITY_LABEL: Record<Seniority, string> = {
  JUNIOR: "Junior", MID: "Mid-level", SENIOR: "Senior", LEAD: "Lead",
}
const NO_SENIORITY = "__none__"

interface MemberSkillsCardProps {
  readonly slug: string
  readonly userId: number
  /** L'utilisateur courant peut-il éditer ce profil ? (soi-même ou ADMIN/OWNER) */
  readonly canEdit: boolean
}

/**
 * Carte de compétences d'un membre — alimente le Smart Assign (PROD-1.2).
 * Les compétences saisies sont relues par SmartAssignService pour matcher les labels d'issue.
 */
export function MemberSkillsCard({ slug, userId, canEdit }: MemberSkillsCardProps) {
  const { profilesByUser, fetchMemberSkills, saveMemberSkills } = useSkillStore()
  const profile = profilesByUser[userId]

  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [skills, setSkills] = useState<string[]>([])
  const [profileText, setProfileText] = useState("")
  const [draft, setDraft] = useState("")
  const [capacity, setCapacity] = useState("")
  const [seniority, setSeniority] = useState<Seniority | "">("")
  const [growthEnabled, setGrowthEnabled] = useState(false)
  const [growthTargets, setGrowthTargets] = useState<string[]>([])
  const [targetDraft, setTargetDraft] = useState("")

  useEffect(() => {
    if (!slug || !userId) return
    setLoading(true)
    void fetchMemberSkills(slug, userId)
      .catch(() => { /* erreur déjà gérée par le client (toast) */ })
      .finally(() => setLoading(false))
  }, [slug, userId, fetchMemberSkills])

  function startEditing() {
    setSkills(profile?.skills ?? [])
    setProfileText(profile?.profileText ?? "")
    setCapacity(profile?.capacityHoursPerWeek != null ? String(profile.capacityHoursPerWeek) : "")
    setSeniority(profile?.seniority ?? "")
    setGrowthEnabled(profile?.growthEnabled ?? false)
    setGrowthTargets(profile?.growthTargetSkills ?? [])
    setTargetDraft("")
    setDraft("")
    setEditing(true)
  }

  function addTargetSkill() {
    const value = targetDraft.trim()
    if (!value) return
    if (!growthTargets.some((s) => s.toLowerCase() === value.toLowerCase()) && growthTargets.length < 50) {
      setGrowthTargets([...growthTargets, value])
    }
    setTargetDraft("")
  }

  function addDraftSkill() {
    const value = draft.trim()
    if (!value) return
    const exists = skills.some((s) => s.toLowerCase() === value.toLowerCase())
    if (!exists && skills.length < MAX_SKILLS) {
      setSkills([...skills, value])
    }
    setDraft("")
  }

  function handleDraftKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault()
      addDraftSkill()
    } else if (e.key === "Backspace" && draft === "" && skills.length > 0) {
      setSkills(skills.slice(0, -1))
    }
  }

  function removeSkill(skill: string) {
    setSkills(skills.filter((s) => s !== skill))
  }

  async function handleSave() {
    setSaving(true)
    try {
      await saveMemberSkills(slug, userId, {
        skills,
        profileText: profileText.trim() || null,
        capacityHoursPerWeek: capacity.trim() === "" ? null : Number(capacity),
        seniority: seniority === "" ? null : seniority,
        growthEnabled,
        growthTargetSkills: growthEnabled ? growthTargets : [],
      })
      toast.success("Skills updated")
      setEditing(false)
    } catch {
      // erreur déjà notifiée par le client HTTP
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Sparkles className="h-4 w-4 text-violet-400" />
          Skills
          <span className="text-xs font-normal text-muted-foreground">· used by Smart Assign</span>
        </h2>
        {canEdit && !editing && !loading && (
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={startEditing}>
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : editing ? (
        <div className="flex flex-col gap-4">
          {/* Skill chips éditables */}
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background p-2">
            {skills.map((skill) => (
              <Badge key={skill} variant="secondary" className="gap-1 pr-1">
                {skill}
                <button
                  type="button"
                  onClick={() => removeSkill(skill)}
                  className="rounded-full p-0.5 hover:bg-muted-foreground/20"
                  aria-label={`Remove ${skill}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={handleDraftKeyDown}
              onBlur={addDraftSkill}
              placeholder={skills.length === 0 ? "e.g. React, Spring Boot, UX… (Enter to add)" : "Add…"}
              className="h-7 flex-1 min-w-[8rem] border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
            />
          </div>

          {/* Capacité + séniorité (PROD-1.8 Phase 2) */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Capacity (h/week)</label>
              <Input
                type="number"
                min={0}
                max={168}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                placeholder="e.g. 35"
                className="h-9"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-muted-foreground">Seniority</label>
              <Select
                value={seniority === "" ? NO_SENIORITY : seniority}
                onValueChange={(v) => setSeniority(v === NO_SENIORITY ? "" : (v as Seniority))}
              >
                <SelectTrigger className="h-9"><SelectValue placeholder="Not specified" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_SENIORITY}>Not specified</SelectItem>
                  {SENIORITY_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Montée en compétence (PROD-1.8 Phase 3 Inc C) */}
          <div className="rounded-lg border border-border p-3 flex flex-col gap-2.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">🌱 Growing</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Smart Assign will prioritize stretch tasks toward the target skills.
                </p>
              </div>
              <Switch checked={growthEnabled} onCheckedChange={setGrowthEnabled} />
            </div>
            {growthEnabled && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-background p-2">
                {growthTargets.map((skill) => (
                  <Badge key={skill} variant="secondary" className="gap-1 pr-1">
                    {skill}
                    <button
                      type="button"
                      onClick={() => setGrowthTargets(growthTargets.filter((s) => s !== skill))}
                      className="rounded-full p-0.5 hover:bg-muted-foreground/20"
                      aria-label={`Remove ${skill}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
                <Input
                  value={targetDraft}
                  onChange={(e) => setTargetDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTargetSkill() } }}
                  onBlur={addTargetSkill}
                  placeholder={growthTargets.length === 0 ? "Target skills… (Enter)" : "Add…"}
                  className="h-7 flex-1 min-w-[8rem] border-0 bg-transparent px-1 shadow-none focus-visible:ring-0"
                />
              </div>
            )}
          </div>

          <Textarea
            value={profileText}
            onChange={(e) => setProfileText(e.target.value)}
            placeholder="Area of expertise, context, preferences… (optional)"
            rows={3}
            maxLength={2000}
          />

          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1.5">
              {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {profile && profile.skills.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {profile.skills.map((skill) => (
                <Badge key={skill} variant="secondary">{skill}</Badge>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No skills added yet.
              {canEdit && (
                <button onClick={startEditing} className="ml-1 inline-flex items-center gap-1 text-primary hover:underline">
                  <Plus className="h-3 w-3" /> Add some
                </button>
              )}
            </p>
          )}
          {(profile?.seniority || profile?.capacityHoursPerWeek != null) && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {profile?.seniority && (
                <Badge variant="outline" className="font-medium">{SENIORITY_LABEL[profile.seniority]}</Badge>
              )}
              {profile?.capacityHoursPerWeek != null && (
                <span className="text-muted-foreground">{profile.capacityHoursPerWeek} h/week</span>
              )}
            </div>
          )}
          {profile?.growthEnabled && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <Badge variant="outline" className="gap-1">🌱 Growing</Badge>
              {profile.growthTargetSkills.length > 0 && (
                <span className="text-muted-foreground">
                  → {profile.growthTargetSkills.join(", ")}
                </span>
              )}
            </div>
          )}
          {profile?.profileText && (
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{profile.profileText}</p>
          )}
        </div>
      )}
    </section>
  )
}
