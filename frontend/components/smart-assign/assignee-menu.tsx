"use client"

import { useEffect, useState } from "react"
import { Sparkles, Loader2, Check, ChevronDown, UserRound } from "lucide-react"

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"
import { UserAvatar } from "@/components/ui/user-avatar"
import { BrandLogo } from "@/components/ui/brand-logo"
import { cn } from "@/lib/utils"
import type { ProjectMember } from "@/lib/api/project-service"
import type { DeliveryProvider } from "@/lib/api/delivery-service"
import {
  smartAssignIssue,
  type SmartAssignCandidate,
  type SmartAssignResult,
} from "@/lib/api/issue-service"

// ─────────────────────────────────────────────────────────────────────────────
// AssigneeMenu (Linear-like)
//
// Un SEUL menu cherchable pour assigner : la recommandation IA vit EN HAUT du menu
// ("Suggested"), les membres au milieu, les agents en bas ("Delegate"). Plus de
// panneau de scores/barres a cote : deleguer a un agent = choisir dans le meme menu
// qu'assigner une personne. Cf. linear.app/docs/assigning-issues.
//
// La reco est un appel LLM métré -> on ne la lance PAS a chaque ouverture : une ligne
// "Suggest best assignee" la déclenche a la demande, puis le résultat s'affiche inline.
// ─────────────────────────────────────────────────────────────────────────────

export interface AssigneeRef {
  userId: number
  name: string
  email?: string | null
  avatarUrl?: string | null
}

interface AssigneeMenuProps {
  workspaceSlug: string
  projectId: number
  issueId: number
  assignee: AssigneeRef | null
  members: ProjectMember[]
  /** Agents disponibles (available=true) - proposés dans la section "Delegate". */
  agents: DeliveryProvider[]
  onAssign: (userId: number) => void | Promise<void>
  onUnassign: () => void | Promise<void>
  onDelegate: (agentKey: string) => void | Promise<void>
}

/** Résumé court "pourquoi" pour une personne quand le LLM n'a pas rendu de phrase. */
function userReason(c: SmartAssignCandidate): string {
  const skills = c.matchedSkills?.length ?? 0
  const bits: string[] = []
  if (skills > 0) bits.push(`${skills} skill match${skills > 1 ? "es" : ""}`)
  bits.push(`${c.openIssues} open`)
  return bits.join(" · ")
}

/** Visage d'un candidat : logo du provider pour un agent, avatar utilisateur sinon. */
function CandidateFace({ c }: Readonly<{ c: SmartAssignCandidate }>) {
  if (c.kind === "agent") {
    return (
      <span className="flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted p-0.5">
        <BrandLogo slug={c.agentLogoKey ?? "sparkles"} name={c.displayName ?? "Agent"} className="size-full" />
      </span>
    )
  }
  return (
    <UserAvatar
      email={c.email ?? undefined}
      name={c.displayName ?? c.email ?? "?"}
      avatarUrl={c.avatarUrl}
      className="size-5 shrink-0"
      fallbackClassName="text-[8px]"
    />
  )
}

export function AssigneeMenu({
  workspaceSlug,
  projectId,
  issueId,
  assignee,
  members,
  agents,
  onAssign,
  onUnassign,
  onDelegate,
}: Readonly<AssigneeMenuProps>) {
  const [open, setOpen] = useState(false)
  const [suggesting, setSuggesting] = useState(false)
  const [ran, setRan] = useState(false)
  const [result, setResult] = useState<SmartAssignResult | null>(null)

  // Nouvelle issue -> on oublie la suggestion précédente (elle portait sur une autre tâche).
  useEffect(() => {
    setResult(null); setRan(false); setSuggesting(false)
  }, [issueId])

  async function runSuggest() {
    setSuggesting(true)
    try {
      const data = await smartAssignIssue(workspaceSlug, projectId, issueId)
      setResult(data)
      setRan(true)
    } catch {
      setResult(null)
      setRan(true)
    } finally {
      setSuggesting(false)
    }
  }

  function choose(fn: () => void | Promise<void>) {
    void fn()
    setOpen(false)
  }

  // Top reco + jusqu'a 2 alternatives, dédupliquées de l'assigné courant (déja affiché).
  const suggestions: SmartAssignCandidate[] = result?.recommended
    ? [result.recommended, ...(result.alternatives ?? [])].slice(0, 3)
    : []

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Change assignee"
          className="flex min-h-8 w-full items-center justify-between gap-2 rounded-md border border-input bg-transparent px-3 py-1 text-left text-sm shadow-xs outline-none transition-colors hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring/40 dark:bg-input/30 dark:hover:bg-input/50"
        >
          {assignee ? (
            <span className="flex min-w-0 items-center gap-1.5">
              <UserAvatar email={assignee.email ?? undefined} name={assignee.name} avatarUrl={assignee.avatarUrl} className="size-4 shrink-0" fallbackClassName="text-[8px]" />
              <span className="truncate">{assignee.name}</span>
            </span>
          ) : (
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <UserRound className="size-4 shrink-0" />
              Unassigned
            </span>
          )}
          <ChevronDown className="size-4 shrink-0 text-muted-foreground/70" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-[--radix-popover-trigger-width] min-w-[16rem] p-0">
        <Command>
          <CommandInput placeholder="Assign to…" className="h-9" />
          <CommandList>
            <CommandEmpty>No match.</CommandEmpty>

            {/* Suggested : la reco IA, en tete du meme menu (pas un panneau a part). */}
            <CommandGroup heading="Suggested">
              {!ran && (
                <CommandItem
                  value="__suggest__ ai smart assign recommend best"
                  disabled={suggesting}
                  onSelect={() => { if (!suggesting) void runSuggest() }}
                  className="gap-2"
                >
                  {suggesting
                    ? <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
                    : <Sparkles className="size-4 shrink-0 text-primary" />}
                  <span className={cn(!assignee && "font-medium text-foreground")}>
                    {suggesting ? "Finding the best match…" : "Suggest best assignee"}
                  </span>
                </CommandItem>
              )}

              {ran && suggestions.length === 0 && (
                <CommandItem value="__nosuggest__" disabled className="gap-2 text-muted-foreground">
                  <Sparkles className="size-4 shrink-0" />
                  No suggestion for this issue
                </CommandItem>
              )}

              {ran && suggestions.map((c) => {
                const name = c.displayName ?? c.email ?? "Agent"
                const isAgent = c.kind === "agent"
                const reason = c.reason ?? (isAgent ? "Can handle this task" : userReason(c))
                return (
                  <CommandItem
                    key={isAgent ? `s-agent-${c.agentKey}` : `s-user-${c.userId}`}
                    value={`suggested ${name} ${reason}`}
                    onSelect={() => choose(() =>
                      isAgent && c.agentKey ? onDelegate(c.agentKey)
                      : c.userId != null ? onAssign(c.userId)
                      : undefined,
                    )}
                    className="items-start gap-2 py-1.5"
                  >
                    <span className="mt-0.5"><CandidateFace c={c} /></span>
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-sm text-foreground">
                        {isAgent ? `Delegate to ${name}` : name}
                      </span>
                      <span className="truncate text-[11px] text-muted-foreground" title={reason}>{reason}</span>
                    </span>
                    <Sparkles className="ml-auto size-3 shrink-0 self-center text-primary/60" />
                  </CommandItem>
                )
              })}
            </CommandGroup>

            <CommandSeparator />

            {/* Membres du projet - cherchables. */}
            <CommandGroup heading="Members">
              <CommandItem
                value="no assignee unassigned none"
                onSelect={() => choose(onUnassign)}
                className="gap-2 text-muted-foreground"
              >
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-dashed border-border">
                  <UserRound className="size-3" />
                </span>
                No assignee
                {!assignee && <Check className="ml-auto size-4 shrink-0" />}
              </CommandItem>

              {members.map((m) => {
                const name = m.displayName ?? m.email
                const active = assignee?.userId === m.userId
                return (
                  <CommandItem
                    key={m.userId}
                    value={`${name} ${m.email}`}
                    onSelect={() => choose(() => onAssign(m.userId))}
                    className="gap-2"
                  >
                    <UserAvatar email={m.email} name={name} avatarUrl={m.avatarUrl} className="size-5 shrink-0" fallbackClassName="text-[8px]" />
                    <span className="truncate">{name}</span>
                    {active && <Check className="ml-auto size-4 shrink-0 text-primary" />}
                  </CommandItem>
                )
              })}
            </CommandGroup>

            {/* Agents - deleguer se fait dans le MEME menu qu'assigner une personne. */}
            {agents.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading="Delegate to an agent">
                  {agents.map((a) => (
                    <CommandItem
                      key={a.key}
                      value={`agent ${a.displayName} ${a.key}`}
                      onSelect={() => choose(() => onDelegate(a.key))}
                      className="gap-2"
                    >
                      <span className="flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted p-0.5">
                        <BrandLogo slug={a.logoKey} name={a.displayName} className="size-full" />
                      </span>
                      <span className="truncate">{a.displayName}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
