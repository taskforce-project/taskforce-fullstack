"use client"

import { Filter, X, ChevronDown } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { UserAvatar } from "@/components/ui/user-avatar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"
import type { Issue, IssuePriority } from "@/lib/api/issue-service"
import {
  type IssueFilterState,
  EMPTY_ISSUE_FILTERS,
  countActiveFilters,
  deriveAssigneeOptions,
  deriveLabelOptions,
} from "@/lib/issue-filters"

const PRIORITY_META: { value: IssuePriority; label: string; dot: string }[] = [
  { value: "URGENT", label: "Urgent",  dot: "bg-red-400" },
  { value: "HIGH",   label: "High",    dot: "bg-orange-400" },
  { value: "MEDIUM", label: "Medium",  dot: "bg-yellow-400" },
  { value: "LOW",    label: "Low",     dot: "bg-slate-400" },
  { value: "NONE",   label: "None",    dot: "bg-muted-foreground/30" },
]

function toggle<T>(arr: T[], value: T): T[] {
  return arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value]
}

function FilterRow({
  checked,
  onToggle,
  children,
}: {
  readonly checked: boolean
  readonly onToggle: () => void
  readonly children: React.ReactNode
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onToggle}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onToggle() } }}
      className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-xs text-foreground hover:bg-muted/60 transition-colors"
    >
      <Checkbox checked={checked} className="pointer-events-none" />
      <span className="flex items-center gap-1.5 min-w-0 flex-1 text-left">{children}</span>
    </div>
  )
}

// ─── Filtres EN LIGNE (plusieurs boutons, QA2-30) ─────────────────────────────

function FilterDropdown({
  label,
  count,
  children,
}: {
  readonly label: string
  readonly count: number
  readonly children: React.ReactNode
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("h-8 gap-1.5 text-xs", count > 0 && "border-primary/50 text-foreground")}
        >
          {label}
          {/* Compteur en gris : c'est une information d'état, pas une action. Le bleu primaire
              reste réservé à ce sur quoi on agit (bouton, case, interrupteur) - l'étendre à un
              simple décompte diluerait le signal. */}
          {count > 0 && (
            <span className="flex size-4 items-center justify-center rounded-full bg-muted text-[10px] font-medium tabular-nums text-muted-foreground">
              {count}
            </span>
          )}
          <ChevronDown className="size-3.5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1.5" align="start">
        {children}
      </PopoverContent>
    </Popover>
  )
}

/**
 * Filtres d'issues **en ligne** (un bouton par dimension : Priorité / Assigné / Label)
 * + réinitialiser. Même état `IssueFilterState` que `IssueFilters`.
 */
export function InlineIssueFilters({
  issues,
  value,
  onChange,
}: {
  readonly issues: Issue[]
  readonly value: IssueFilterState
  readonly onChange: (next: IssueFilterState) => void
}) {
  const assignees = deriveAssigneeOptions(issues)
  const labels = deriveLabelOptions(issues)
  const active = countActiveFilters(value)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Filter className="size-3.5" /> Filters
      </span>

      <FilterDropdown label="Priority" count={value.priorities.length}>
        {PRIORITY_META.map((p) => (
          <FilterRow
            key={p.value}
            checked={value.priorities.includes(p.value)}
            onToggle={() => onChange({ ...value, priorities: toggle(value.priorities, p.value) })}
          >
            <span className={cn("size-2 rounded-full shrink-0", p.dot)} />
            {p.label}
          </FilterRow>
        ))}
      </FilterDropdown>

      {assignees.length > 0 && (
        <FilterDropdown label="Assignee" count={value.assigneeIds.length}>
          {assignees.map((a) => (
            <FilterRow
              key={a.id ?? "unassigned"}
              checked={value.assigneeIds.includes(a.id)}
              onToggle={() => onChange({ ...value, assigneeIds: toggle(value.assigneeIds, a.id) })}
            >
              {a.id === null ? (
                <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-muted text-[9px] text-muted-foreground">?</span>
              ) : (
                <UserAvatar email={a.email ?? ""} name={a.name} avatarUrl={a.avatarUrl} className="size-4 shrink-0" fallbackClassName="text-[8px]" />
              )}
              <span className="truncate">{a.name}</span>
            </FilterRow>
          ))}
        </FilterDropdown>
      )}

      {labels.length > 0 && (
        <FilterDropdown label="Label" count={value.labelIds.length}>
          {labels.map((l) => (
            <FilterRow
              key={l.id}
              checked={value.labelIds.includes(l.id)}
              onToggle={() => onChange({ ...value, labelIds: toggle(value.labelIds, l.id) })}
            >
              <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
              <span className="truncate">{l.name}</span>
            </FilterRow>
          ))}
        </FilterDropdown>
      )}

      {active > 0 && (
        <button
          type="button"
          onClick={() => onChange(EMPTY_ISSUE_FILTERS)}
          className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-3" /> Reset
        </button>
      )}
    </div>
  )
}

/**
 * Popover de filtres d'issues (priorité / assigné / label).
 * Les options sont dérivées des issues chargées. Contrôlé via `value` / `onChange`.
 */
export function IssueFilters({
  issues,
  value,
  onChange,
}: {
  readonly issues: Issue[]
  readonly value: IssueFilterState
  readonly onChange: (next: IssueFilterState) => void
}) {
  const assignees = deriveAssigneeOptions(issues)
  const labels = deriveLabelOptions(issues)
  const active = countActiveFilters(value)

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("h-7 text-xs gap-1.5", active > 0 && "border-primary/50 text-foreground")}
        >
          <Filter className="size-3.5" />
          Filters
          {active > 0 && (
            <span className="ml-0.5 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
              {active}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" align="start">
        <div className="flex items-center justify-between px-2 py-1">
          <span className="text-xs font-semibold">Filter</span>
          {active > 0 && (
            <button
              type="button"
              onClick={() => onChange(EMPTY_ISSUE_FILTERS)}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" /> Reset
            </button>
          )}
        </div>

        {/* Priorité */}
        <div className="mt-1">
          <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Priority</p>
          {PRIORITY_META.map((p) => (
            <FilterRow
              key={p.value}
              checked={value.priorities.includes(p.value)}
              onToggle={() => onChange({ ...value, priorities: toggle(value.priorities, p.value) })}
            >
              <span className={cn("size-2 rounded-full shrink-0", p.dot)} />
              {p.label}
            </FilterRow>
          ))}
        </div>

        {/* Assigné */}
        {assignees.length > 0 && (
          <div className="mt-1 border-t border-border/60 pt-1">
            <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Assignee</p>
            {assignees.map((a) => (
              <FilterRow
                key={a.id ?? "unassigned"}
                checked={value.assigneeIds.includes(a.id)}
                onToggle={() => onChange({ ...value, assigneeIds: toggle(value.assigneeIds, a.id) })}
              >
                {a.id === null ? (
                <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-muted text-[9px] text-muted-foreground">?</span>
              ) : (
                <UserAvatar email={a.email ?? ""} name={a.name} avatarUrl={a.avatarUrl} className="size-4 shrink-0" fallbackClassName="text-[8px]" />
              )}
              <span className="truncate">{a.name}</span>
              </FilterRow>
            ))}
          </div>
        )}

        {/* Label */}
        {labels.length > 0 && (
          <div className="mt-1 border-t border-border/60 pt-1">
            <p className="px-2 py-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Label</p>
            {labels.map((l) => (
              <FilterRow
                key={l.id}
                checked={value.labelIds.includes(l.id)}
                onToggle={() => onChange({ ...value, labelIds: toggle(value.labelIds, l.id) })}
              >
                <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: l.color }} />
                <span className="truncate">{l.name}</span>
              </FilterRow>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
