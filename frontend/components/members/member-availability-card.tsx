"use client"

import { useEffect, useState } from "react"
import { CalendarOff, Loader2, Plus, Trash2, X } from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DatePicker } from "@/components/ui/date-picker"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useAvailabilityStore } from "@/lib/store/availability-store"
import type { LeaveType } from "@/lib/api/availability-service"

const LEAVE_META: Record<LeaveType, { label: string; className: string }> = {
  VACATION: { label: "Vacation",   className: "bg-blue-500/15 text-blue-400 border-blue-500/20" },
  SICK:     { label: "Sick",       className: "bg-rose-500/15 text-rose-400 border-rose-500/20" },
  REMOTE:   { label: "Remote",     className: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" },
  OTHER:    { label: "Other",      className: "bg-muted text-muted-foreground border-border" },
}

const LEAVE_OPTIONS: LeaveType[] = ["VACATION", "SICK", "REMOTE", "OTHER"]

function formatRange(start: string, end: string): string {
  const fmt = (iso: string) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })
  return start === end ? fmt(start) : `${fmt(start)} → ${fmt(end)}`
}

interface MemberAvailabilityCardProps {
  readonly slug: string
  readonly userId: number
  /** L'utilisateur courant peut-il gérer les indisponibilités ? (soi-même ou ADMIN/OWNER) */
  readonly canEdit: boolean
}

/**
 * Carte de disponibilité d'un membre (US-006) : congés / indisponibilités.
 * Les heures/semaine déclarées vivent dans la carte Compétences (capacité).
 */
export function MemberAvailabilityCard({ slug, userId, canEdit }: MemberAvailabilityCardProps) {
  const { leavesByUser, fetchLeaves, addLeave, removeLeave } = useAvailabilityStore()
  const leaves = leavesByUser[userId]

  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [saving, setSaving] = useState(false)
  const [type, setType] = useState<LeaveType>("VACATION")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [note, setNote] = useState("")

  useEffect(() => {
    if (!slug || !userId) return
    setLoading(true)
    void fetchLeaves(slug, userId)
      .catch(() => { /* erreur déjà notifiée par le client HTTP */ })
      .finally(() => setLoading(false))
  }, [slug, userId, fetchLeaves])

  function resetForm() {
    setType("VACATION")
    setStartDate("")
    setEndDate("")
    setNote("")
    setAdding(false)
  }

  async function handleAdd() {
    if (!startDate || !endDate) {
      toast.error("Enter the start and end dates")
      return
    }
    if (endDate < startDate) {
      toast.error("The end date must be after the start date")
      return
    }
    setSaving(true)
    try {
      await addLeave(slug, userId, { type, startDate, endDate, note: note.trim() || undefined })
      toast.success("Unavailability added")
      resetForm()
    } catch {
      // erreur déjà notifiée
    } finally {
      setSaving(false)
    }
  }

  async function handleRemove(leaveId: number) {
    try {
      await removeLeave(slug, userId, leaveId)
      toast.success("Unavailability removed")
    } catch {
      // erreur déjà notifiée
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <CalendarOff className="h-4 w-4 text-amber-400" />
          Availability
          <span className="text-xs font-normal text-muted-foreground">· leave &amp; unavailability</span>
        </h2>
        {canEdit && !adding && !loading && (
          <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => setAdding(true)}>
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {/* Formulaire d'ajout */}
          {adding && (
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-background p-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-muted-foreground">Type</label>
                  <Select value={type} onValueChange={(v) => setType(v as LeaveType)}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {LEAVE_OPTIONS.map((o) => (
                        <SelectItem key={o} value={o}>{LEAVE_META[o].label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="leave-start" className="text-xs font-medium text-muted-foreground">From</label>
                  <DatePicker id="leave-start" value={startDate} onChange={setStartDate} placeholder="Start" />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="leave-end" className="text-xs font-medium text-muted-foreground">To</label>
                  <DatePicker id="leave-end" value={endDate} onChange={setEndDate} placeholder="End" />
                </div>
              </div>
              <Input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Note (optional)"
                maxLength={1000}
                className="h-9"
              />
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={handleAdd} disabled={saving} className="gap-1.5">
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={resetForm} disabled={saving}>
                  <X className="h-3.5 w-3.5" /> Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Liste */}
          {leaves && leaves.length > 0 ? (
            <ul className="flex flex-col divide-y divide-border/60">
              {leaves.map((leave) => (
                <li key={leave.id} className="flex items-center gap-3 py-2.5">
                  <Badge variant="outline" className={LEAVE_META[leave.type].className}>{LEAVE_META[leave.type].label}</Badge>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground">{formatRange(leave.startDate, leave.endDate)}</p>
                    {leave.note && <p className="truncate text-xs text-muted-foreground">{leave.note}</p>}
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => handleRemove(leave.id)}
                      className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-rose-500"
                      aria-label="Remove unavailability"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            !adding && (
              <p className="text-sm text-muted-foreground">
                No unavailability declared.
                {canEdit && (
                  <button onClick={() => setAdding(true)} className="ml-1 inline-flex items-center gap-1 text-primary hover:underline">
                    <Plus className="h-3 w-3" /> Add one
                  </button>
                )}
              </p>
            )
          )}
        </div>
      )}
    </section>
  )
}
