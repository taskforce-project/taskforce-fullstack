"use client"

import { memo, type KeyboardEvent, type MouseEvent } from "react"
import { Lock, Paperclip } from "lucide-react"

import { SENTENCE_INK, STATE_BAR, StateMark } from "@/components/workflow/state-mark"
import { BrandLogo } from "@/components/ui/brand-logo"
import { UserAvatar } from "@/components/ui/user-avatar"
import { fillText } from "@/lib/delivery/result-card"
import { cn } from "@/lib/utils"
import type { WorkflowNode } from "@/lib/workflow/model"
import { countWords, firstName, type Governance, type NodeAction, type WorkflowTexts } from "@/lib/workflow/sentence"
import type { Density } from "@/lib/workflow/states"

/** L'agent d'un nœud, tel que sa carte le montre : son logo, son nom, et le modèle quand c'est l'agent de TaskForce. */
export interface NodeAgent {
  readonly name: string
  readonly logoKey: string | null
  readonly model: string | null
}

/** Ce qu'une carte montre, calculé une fois par nœud par la vue (les cartes ne lisent pas les stores). */
export interface NodeView {
  readonly node: WorkflowNode
  readonly sentence: string | null
  readonly governance: Governance
  readonly action: NodeAction | null
  readonly agent: NodeAgent | null
  /** La ligne de l'ingénieur (Detail) : l'agent et son modèle, la branche, les tests, `+12 −1`. */
  readonly detail: string | null
  /** Qui doit agir, pour la carte d'une ligne de Summary. */
  readonly who: string
}

export interface NodeHandlers {
  /** Un clic choisit le nœud (l'inspecteur s'ouvre). */
  readonly onSelect: (key: string) => void
  /** Le titre, Entrée et le double clic ouvrent l'objet : l'issue par-dessus la vue. */
  readonly onOpen: (key: string) => void
  /** Le bouton du nœud : « Decide », « Review », « See why ». */
  readonly onAction: (key: string, action: NodeAction) => void
}

const ACTION_WORD = (t: WorkflowTexts, action: NodeAction): string =>
  action === "decide" ? t.action.decide : action === "review" ? t.action.review : t.action.seeWhy

/** Le bouton principal de la carte (choisir) : Entrée ouvre l'objet, l'espace et le clic choisissent. */
function keyOpens(event: KeyboardEvent<HTMLButtonElement>, open: () => void) {
  if (event.key === "Enter") {
    event.preventDefault()
    open()
  }
}

/**
 * La carte d'un nœud, en densité Plan ou Detail (séance n°25, §4.1, §4.3) : la marque, le titre et la clé ; qui en répond
 * et qui le fait ; la phrase de ce qui se passe ou attend ; en Detail, la ligne de l'ingénieur ; au pied, la gouvernance,
 * et un seul bouton quand le nœud attend la personne qui regarde. Une boîte de 240 px (280 en Detail), un trait d'un pixel,
 * des angles droits ; la barre de gauche seulement pour ce qui demande l'attention.
 */
export const WorkflowNodeCard = memo(function WorkflowNodeCard({
  view, density, selected, focusable, dimmed, t, handlers, stretch = false,
}: Readonly<{
  view: NodeView
  density: Exclude<Density, "summary">
  selected: boolean
  /** La carte qui prend le focus de sa colonne (le tabindex mobile). */
  focusable: boolean
  /** Une autre carte est choisie, et celle-ci ne lui est pas liée : elle s'estompe. */
  dimmed: boolean
  t: WorkflowTexts
  handlers: NodeHandlers
  /** L'écran étroit : la carte prend toute la largeur. */
  stretch?: boolean
}>) {
  const { node, sentence, governance, action, agent, detail } = view
  const { issue, state } = node
  const word = t.state[state]
  const assignee = issue.assignee
  const sentenceId = `${node.key}-now`
  const bar = STATE_BAR[state]
  const showFoot = governance.rules > 0 || governance.signed !== null || governance.documents > 0 || action !== null

  return (
    <div
      data-node-key={node.key}
      data-state={state}
      className={cn(
        "group/node relative flex flex-col gap-1 border border-border bg-card px-3 py-2.5 transition-[opacity,background-color] duration-150 hover:bg-muted motion-reduce:transition-none",
        stretch ? "w-full" : density === "detail" ? "w-[280px]" : "w-[240px]",
        node.depth === 1 && (stretch ? "ml-3 w-[calc(100%-12px)]" : "ml-3 w-[228px]"),
        node.depth === 1 && !stretch && density === "detail" && "w-[268px]",
        selected && "ring-2 ring-inset ring-ring",
        dimmed && "opacity-40",
      )}
    >
      {/* Une sous-issue, sous son parent : en retrait de 12 px, un trait vertical d'un pixel à sa gauche. */}
      {node.depth === 1 && <span aria-hidden="true" className="absolute -left-[7px] -top-2 bottom-0 w-px bg-border" />}
      {bar && <span aria-hidden="true" className={cn("absolute inset-y-0 left-0 w-[3px]", bar)} />}
      {/* Le geste principal couvre la carte : un clic la choisit, Entrée et le double clic ouvrent l'objet. */}
      <button
        type="button"
        tabIndex={focusable ? 0 : -1}
        aria-label={`${issue.title}, ${word}`}
        aria-describedby={sentence ? sentenceId : undefined}
        aria-pressed={selected}
        data-node-focus={node.key}
        onClick={() => handlers.onSelect(node.key)}
        onDoubleClick={() => handlers.onOpen(node.key)}
        onKeyDown={(event) => keyOpens(event, () => handlers.onOpen(node.key))}
        className="absolute inset-0 z-0 cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      />
      <div className="pointer-events-none relative z-10 flex h-5 min-w-0 items-center gap-2">
        <StateMark state={state} word={word} />
        <button
          type="button"
          tabIndex={-1}
          onClick={(event: MouseEvent) => { event.stopPropagation(); handlers.onOpen(node.key) }}
          title={issue.title}
          className="pointer-events-auto min-w-0 flex-1 truncate text-left text-sm font-[450] text-foreground underline-offset-2 hover:underline"
        >
          {issue.title}
        </button>
        <span className="shrink-0 font-mono text-xs text-subtle">{issue.identifier}</span>
      </div>
      {(assignee || agent) && (
        <div className="pointer-events-none relative z-10 flex h-4 min-w-0 items-center gap-1.5 pl-6 text-xs text-muted-foreground">
          {assignee && (
            <span className="flex min-w-0 items-center gap-1">
              <UserAvatar
                email={assignee.email}
                name={assignee.displayName ?? assignee.email}
                avatarUrl={assignee.avatarUrl}
                className="size-4 shrink-0"
                fallbackClassName="text-[8px]"
              />
              <span className="truncate">{firstName(assignee)}</span>
            </span>
          )}
          {assignee && agent && <span aria-hidden="true">·</span>}
          {agent && (
            <span className="flex min-w-0 items-center gap-1">
              {agent.logoKey && <BrandLogo slug={agent.logoKey} name={agent.name} className="size-4 shrink-0" />}
              <span className="truncate">{agent.model ? `${agent.name} · ${agent.model}` : agent.name}</span>
            </span>
          )}
        </div>
      )}
      {sentence && (
        <p id={sentenceId} className={cn("pointer-events-none relative z-10 line-clamp-2 pl-6 text-xs leading-4", SENTENCE_INK[state] ?? "text-muted-foreground")}>
          {sentence}
        </p>
      )}
      {density === "detail" && detail && (
        <p className="pointer-events-none relative z-10 truncate pl-6 font-mono text-xs text-subtle" title={detail}>{detail}</p>
      )}
      {showFoot && (
        <div className="pointer-events-none relative z-10 flex min-h-4 flex-wrap items-center gap-x-2 gap-y-1 pl-6 text-xs text-muted-foreground">
          {governance.rules > 0 && (
            <span className="flex items-center gap-1 whitespace-nowrap" title={governance.ruleReasons.join(" ")}>
              <Lock aria-hidden="true" className="size-3 shrink-0" />
              {countWords(governance.rules, t.gov.rulesOne, t.gov.rulesMany)}
            </span>
          )}
          {governance.signed && (
            <span className="whitespace-nowrap tabular-nums">{fillText(t.gov.signed, { signed: governance.signed.signed, needed: governance.signed.needed })}</span>
          )}
          {governance.documents > 0 && (
            <span className="flex items-center gap-1 whitespace-nowrap">
              <Paperclip aria-hidden="true" className="size-3 shrink-0" />
              {countWords(governance.documents, t.gov.documentsOne, t.gov.documentsMany)}
            </span>
          )}
          {action && (
            <button
              type="button"
              onClick={(event) => { event.stopPropagation(); handlers.onAction(node.key, action) }}
              className={cn(
                "pointer-events-auto ml-auto flex h-7 shrink-0 items-center px-2.5 text-xs font-medium transition-colors duration-150 motion-reduce:transition-none",
                action === "seeWhy"
                  ? "border border-border bg-background text-foreground hover:bg-muted"
                  : "bg-primary text-primary-foreground hover:bg-primary-hover",
              )}
            >
              {ACTION_WORD(t, action)}
            </button>
          )}
        </div>
      )}
    </div>
  )
})

/**
 * La carte d'une ligne de Summary (§4.2) : 32 px, la marque, le titre et qui doit agir. Seules les exceptions en ont une ;
 * le reste de la colonne n'est qu'un compte.
 */
export const SummaryNodeCard = memo(function SummaryNodeCard({ view, selected, focusable, dimmed, t, handlers }: Readonly<{
  view: NodeView
  selected: boolean
  focusable: boolean
  dimmed: boolean
  t: WorkflowTexts
  handlers: NodeHandlers
}>) {
  const { node, sentence, who } = view
  const word = node.overdue && node.state !== "needsYou" && node.state !== "failed" && node.state !== "blocked"
    ? t.overdue : t.state[node.state]
  const bar = STATE_BAR[node.state]
  return (
    <div
      data-node-key={node.key}
      data-state={node.state}
      className={cn(
        "relative flex h-8 w-[136px] items-center gap-1.5 border border-border bg-card pl-2 pr-1.5 transition-[opacity,background-color] duration-150 hover:bg-muted motion-reduce:transition-none",
        selected && "ring-2 ring-inset ring-ring",
        dimmed && "opacity-40",
      )}
    >
      {bar && <span aria-hidden="true" className={cn("absolute inset-y-0 left-0 w-[3px]", bar)} />}
      <button
        type="button"
        tabIndex={focusable ? 0 : -1}
        aria-label={`${node.issue.title}, ${word}, ${who}`}
        aria-describedby={undefined}
        title={sentence ?? node.issue.title}
        aria-pressed={selected}
        data-node-focus={node.key}
        onClick={() => handlers.onSelect(node.key)}
        onDoubleClick={() => handlers.onOpen(node.key)}
        onKeyDown={(event) => keyOpens(event, () => handlers.onOpen(node.key))}
        className="absolute inset-0 z-0 cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      />
      <StateMark state={node.state} word={word} className="pointer-events-none relative z-10" />
      <span className="pointer-events-none relative z-10 min-w-0 flex-1 truncate text-xs text-foreground">{node.issue.title}</span>
      <span className="pointer-events-none relative z-10 max-w-[44px] shrink-0 truncate text-[11px] text-muted-foreground">{who}</span>
    </div>
  )
})
