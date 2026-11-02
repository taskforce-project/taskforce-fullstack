"use client"

import { useEffect, useRef, useState } from "react"
import { useParams, usePathname } from "next/navigation"
import {
  Sparkles, MessageSquare, ChevronDown, Plus, Trash2, Plug, Play, CircleAlert, PanelRight, PanelBottom,
} from "lucide-react"
import {
  Message, Steps, Reasoning, Tool, Sources, ThinkingBar, FeedbackBar, PromptSuggestion, TokenMeter,
  type ToolStatus,
} from "@/components/chat"
import { Markdown } from "@/components/ui/lightweight-markdown"
import { cn } from "@/lib/utils"
import {
  approveAction, isApprovable, isDeletion, isMission, isPreparedIssue, isQuestion, isUndoable, type AssistantActionResult,
  type AssistantAnswer, type AssistantToolCall,
} from "@/lib/api/assistant-service"
import { getErrorMessage } from "@/lib/api/client"
import { getMcpServers } from "@/lib/api/integration-service"
import { suggestionsFor } from "@/lib/cortex/suggestions"
import { useAiStatusStore } from "@/lib/store/ai-status-store"
import { useCortexStore, type CortexPlace } from "@/lib/store/cortex-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { useSettingsStore } from "@/lib/store/settings-store"
import { IS_DESKTOP } from "@/lib/desktop"
import { CortexUsage } from "./cortex-usage"
import { DeleteIssueCard } from "./delete-issue-card"
import { EvalCaseButton } from "./eval-case-dialog"
import { IssueDraftCard } from "./issue-draft-card"
import { MissionInChat } from "./mission-in-chat"
import { UndoAction } from "./undo-action"

/**
 * Plafond mensuel de tokens IA de l'instance atteint (HTTP 409) - carte d'**information** (pas
 * d'erreur). Rendue en tour assistant pour rester dans le fil.
 */
function QuotaNotice() {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-primary/25 bg-primary/5 p-3">
      <div className="flex items-center gap-2">
        <div className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Sparkles className="size-3.5" />
        </div>
        <p className="text-sm font-medium text-foreground">Monthly AI limit reached</p>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Cortex has used this instance&apos;s monthly token allowance. It resets on the first day of
        next month, and an administrator can raise it.
      </p>
    </div>
  )
}

/**
 * L'instance n'a pas de modèle joignable : Cortex cherche quand même dans le Brain OS, mais ne rédige pas.
 * Carte d'information, pas d'erreur : l'état vient de GET /api/ai/status.
 */
function AiUnavailableNotice() {
  const openSettings = useSettingsStore((s) => s.openSettings)
  return (
    <div className="flex w-full flex-col gap-1.5 border border-border bg-muted/40 p-3 text-left">
      <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
        <CircleAlert className="size-3.5 shrink-0 text-ink-yellow" /> AI is not configured
      </p>
      <p className="text-xs leading-relaxed text-muted-foreground">
        {IS_DESKTOP
          ? "Cortex still searches your workspace's knowledge and cites the notes it finds. To get written answers, choose a model: Ollama on this computer, or any OpenAI-compatible API."
          : "Cortex still searches your workspace's knowledge and cites the notes it finds. To get written answers, an administrator connects a model to the AI service: Ollama on this machine, or any OpenAI-compatible API."}
      </p>
      {IS_DESKTOP && (
        <button type="button" onClick={() => openSettings("ai")} className="self-start text-xs font-medium text-primary hover:underline">
          Set up AI
        </button>
      )}
    </div>
  )
}

const OUTCOME: Record<"success" | "refused" | "error", string> = {
  success: "Done. ",
  refused: "",
  error: "The action failed: ",
}

/**
 * Action proposée par Cortex, interne (une note, un projet) ou dans un outil connecté : les règles de l'espace la
 * demandent à la personne. Rien n'est fait sans son clic ; l'accord part avec le dossier de la réponse, où le serveur
 * la rejuge et la garde.
 */
function PendingAction({ slug, call }: { slug: string; call: AssistantToolCall }) {
  const [state, setState] = useState<"idle" | "running" | "success" | "refused" | "error">("idle")
  const [output, setOutput] = useState<string | null>(null)
  const [result, setResult] = useState<AssistantActionResult | null>(null)
  const external = call.name.includes("__")
  // Accordée et faite : l'appel tel qu'il a abouti, avec l'empreinte que « Undo » nomme et l'issue qu'il touche.
  const done: AssistantToolCall = { ...call, status: "success", output, ref: result?.ref ?? null, target: result?.target ?? null }

  const run = async () => {
    setState("running")
    try {
      const approved = await approveAction(slug, call)
      setOutput(approved.output)
      setResult(approved)
      setState(approved.status)
    } catch (e) {
      setOutput(getErrorMessage(e))
      setState("error")
    }
  }

  return (
    <div className="my-2 flex flex-col gap-2 border border-shape-yellow/35 bg-shape-yellow/[0.06] p-2.5 text-xs">
      <p className="text-muted-foreground">
        Cortex proposes to run <span className="font-mono text-foreground">{call.name}</span>
        {external ? " on a connected tool. Nothing is sent until you approve it." : ". Nothing changes until you approve it."}
      </p>
      {state === "idle" || state === "running" ? (
        <button
          type="button"
          onClick={run}
          disabled={state === "running"}
          className="flex h-7 w-fit items-center gap-1.5 bg-primary px-2.5 font-medium text-primary-foreground shadow-key transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          <Play className="size-3" /> {state === "running" ? "Running…" : "Approve and run"}
        </button>
      ) : (
        <>
          <p className={cn("whitespace-pre-wrap break-words",
            state === "success" ? "text-ink-green" : state === "refused" ? "text-ink-red" : "text-destructive")}>
            {OUTCOME[state]}{output}
          </p>
          {/* Accordée et faite, une création se défait aussi d'un geste (R77). */}
          {state === "success" && isUndoable(done) && <UndoAction slug={slug} call={done} />}
          {/* Accordée, la mission part : ses demandes et son résultat suivent ici, sur leurs cartes (TF-J1-5). */}
          {state === "success" && isMission(done) && <MissionInChat slug={slug} target={done.target} />}
        </>
      )}
    </div>
  )
}

const HEADER_BUTTON =
  "flex size-7 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"

/**
 * La conversation avec Cortex : son en-tête (les conversations, une nouvelle, l'endroit), ses tours, et l'état vide qui
 * dit ce qu'on peut demander. Elle se lit dans `useCortexStore`, donc la même conversation s'ouvre en bulle au-dessus
 * de la barre (`place="bar"`) ou s'épingle dans le panneau de droite (`place="side"`) sans rien perdre ; la saisie
 * reste la barre unique, en bas de l'écran (R76). Dans la bulle, les contrôles sont ronds, comme ceux du composeur du
 * site ; le panneau garde les angles droits de l'app.
 */
export function AgentChat({ place, onSwitchPlace, onFold }: Readonly<{
  place: CortexPlace
  /** Passe la conversation de la barre au panneau de droite, ou l'inverse. */
  onSwitchPlace: () => void
  /** Replie la conversation dans la barre (seulement dépliée depuis la barre : le panneau a sa propre croix). */
  onFold?: () => void
}>) {
  const params = useParams()
  const pathname = usePathname()
  const slug = typeof params?.workspace === "string" ? params.workspace : ""
  const t = usePreferencesStore((s) => s.t.shell)

  const turns = useCortexStore((s) => s.turns)
  const conversations = useCortexStore((s) => s.conversations)
  const conversationId = useCortexStore((s) => s.conversationId)
  const tokens = useCortexStore((s) => s.tokens)
  const sentAt = useCortexStore((s) => s.sentAt)
  const lastMs = useCortexStore((s) => s.lastMs)
  const setDraft = useCortexStore((s) => s.setDraft)
  const loadConversations = useCortexStore((s) => s.loadConversations)
  const openConversation = useCortexStore((s) => s.openConversation)
  const newConversation = useCortexStore((s) => s.newConversation)
  const removeConversation = useCortexStore((s) => s.removeConversation)

  const [showList, setShowList] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  // Outils MCP externes live (serveurs connectés joignables) - surfacés dans l'état vide pour que la
  // personne voie que Cortex peut AGIR, pas seulement lire. Best-effort : sans intégration (409) ou sans
  // serveur MCP joignable, la liste reste vide et rien ne s'affiche.
  const [mcpTools, setMcpTools] = useState<{ connector: string; name: string }[]>([])
  const threadRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const thinking = sentAt !== null

  const aiStatus = useAiStatusStore((s) => s.status)
  const fetchAiStatus = useAiStatusStore((s) => s.fetchStatus)
  useEffect(() => { void fetchAiStatus() }, [fetchAiStatus])

  useEffect(() => { void loadConversations(slug) }, [loadConversations, slug])

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    getMcpServers(slug)
      .then((servers) => {
        if (cancelled) return
        setMcpTools(
          servers
            .filter((s) => s.reachable)
            .flatMap((s) => s.tools.map((name) => ({ connector: s.connectorKey, name }))),
        )
      })
      .catch(() => { /* sans intégration (409) ou sans serveur MCP : rien à montrer */ })
    return () => { cancelled = true }
  }, [slug])

  // Le dernier tour reste en vue, juste au-dessus de la barre où la personne vient d'écrire.
  useEffect(() => {
    const el = threadRef.current
    if (el) el.scrollTo?.({ top: el.scrollHeight, behavior: "smooth" })
  }, [turns, thinking])

  useEffect(() => {
    if (sentAt === null) return
    const id = setInterval(() => setElapsed((Date.now() - sentAt) / 1000), 100)
    return () => clearInterval(id)
  }, [sentAt])

  useEffect(() => {
    if (!showList) return
    const onDown = (e: MouseEvent) => {
      if (listRef.current && !listRef.current.contains(e.target as Node)) setShowList(false)
    }
    document.addEventListener("mousedown", onDown)
    return () => document.removeEventListener("mousedown", onDown)
  }, [showList])

  const pick = async (id: number) => {
    setShowList(false)
    await openConversation(slug, id)
  }

  const startNew = () => {
    setShowList(false)
    newConversation()
  }

  /** Une suggestion remplit la barre ; rien ne part tant que la personne n'envoie pas. */
  const suggest = (text: string) => {
    setDraft(text)
    document.getElementById("command-bar-input")?.focus()
  }

  const currentTitle = conversationId
    ? (conversations.find((c) => c.id === conversationId)?.title ?? "Conversation")
    : t.chatNew
  const recent = conversations.filter((c) => c.id !== conversationId).slice(0, 3)
  const inBubble = place === "bar"
  const headerButton = cn(HEADER_BUTTON, inBubble && "rounded-full")

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={cn(
        "flex shrink-0 items-center gap-1 border-b",
        inBubble ? "h-11 border-border/60 px-2" : "h-10 border-border/70 px-2 md:px-4",
      )}>
        {inBubble && (
          <span className="mr-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary" aria-hidden="true">
            <Sparkles className="size-3.5" />
          </span>
        )}
        <div
          ref={listRef}
          className="relative min-w-0"
          onKeyDown={(e) => {
            // Échap ferme d'abord la liste, puis seulement la conversation.
            if (e.key === "Escape" && showList) { e.preventDefault(); setShowList(false) }
          }}
        >
          <button
            type="button"
            aria-expanded={showList}
            onClick={() => { setShowList((v) => !v); if (!showList) void loadConversations(slug) }}
            className={cn("flex max-w-full items-center gap-1.5 py-1 text-xs transition-colors hover:bg-muted", inBubble ? "rounded-full px-2" : "px-1.5")}
          >
            {!inBubble && <MessageSquare className="size-3.5 shrink-0 text-muted-foreground" />}
            <span className="truncate font-medium">{currentTitle}</span>
            <ChevronDown className={cn("size-3 shrink-0 transition-transform", showList && "rotate-180")} />
          </button>

          {showList && (
            <div className="absolute left-0 top-full z-50 mt-1 w-64 border border-border bg-popover p-1 shadow-lg">
              <button
                type="button"
                onClick={startNew}
                className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs font-medium transition-colors hover:bg-muted"
              >
                <Plus className="size-3.5" /> {t.chatNew}
              </button>
              <div className="my-1 h-px bg-border" />
              <div className="max-h-64 overflow-y-auto">
                {conversations.length === 0 ? (
                  <p className="px-2 py-3 text-center text-xs text-muted-foreground">{t.chatNone}</p>
                ) : (
                  conversations.map((c) => (
                    <div
                      key={c.id}
                      className={cn("group flex items-center gap-1 px-2 py-1.5 transition-colors hover:bg-muted", c.id === conversationId && "bg-muted")}
                    >
                      <button type="button" onClick={() => void pick(c.id)} className="min-w-0 flex-1 text-left">
                        <span className="block truncate text-xs">{c.title}</span>
                        <span className="text-[10px] text-muted-foreground">{c.messageCount} message{c.messageCount > 1 ? "s" : ""}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeConversation(slug, c.id)}
                        className="shrink-0 p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                        aria-label={t.chatDelete}
                        title={t.chatDelete}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <button type="button" onClick={startNew} aria-label={t.chatNew} title={t.chatNew} className={headerButton}>
          <Plus className="size-4" />
        </button>

        <div className="ml-auto flex min-w-0 items-center gap-2 pl-2 text-[10px] text-muted-foreground/70">
          {thinking ? (
            <span className="hidden tabular-nums text-primary/80 sm:inline">{t.chatThinking} · {elapsed.toFixed(1)} s</span>
          ) : tokens > 0 ? (
            <span className="hidden items-center gap-1.5 sm:flex">
              <TokenMeter value={tokens} className="text-muted-foreground/70" />
              {lastMs != null && <span className="tabular-nums">· {(lastMs / 1000).toFixed(1)} s</span>}
            </span>
          ) : null}
          <CortexUsage sessionTokens={tokens} />
        </div>

        <button
          type="button"
          onClick={onSwitchPlace}
          aria-label={inBubble ? t.chatPinSide : t.chatBackToBar}
          title={inBubble ? t.chatPinSide : t.chatBackToBar}
          className={headerButton}
        >
          {inBubble ? <PanelRight className="size-4" /> : <PanelBottom className="size-4" />}
        </button>
        {onFold && (
          <button type="button" onClick={onFold} aria-label={t.chatFold} title={t.chatFold} className={headerButton}>
            <ChevronDown className="size-4" />
          </button>
        )}
      </div>

      <div ref={threadRef} className={cn("min-h-0 flex-1 overflow-y-auto", inBubble ? "px-3 py-3 md:px-4" : "px-3 py-4 md:px-6")}>
        <div className="flex flex-col">
          {turns.length === 0 && !thinking ? (
            <div className="flex flex-col gap-3 py-1">
              <div className="flex items-start gap-2.5">
                <div className={cn("flex size-7 shrink-0 items-center justify-center bg-primary/10 text-primary", inBubble && "rounded-full")}>
                  <Sparkles className="size-4" />
                </div>
                <div>
                  <p className="text-sm font-medium">Cortex</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t.chatIntro} {t.chatHint}</p>
                </div>
              </div>
              {aiStatus && !aiStatus.chatAvailable && <AiUnavailableNotice />}
              <div className="flex flex-wrap gap-1.5" aria-label={t.barSuggestions}>
                {suggestionsFor(pathname).map((s) => (
                  <PromptSuggestion key={s.label} onClick={() => suggest(s.text)} className={cn(inBubble && "rounded-full")}>{s.label}</PromptSuggestion>
                ))}
              </div>
              {recent.length > 0 && (
                <div className="flex flex-col gap-1">
                  <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{t.chatRecent}</p>
                  {recent.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => void pick(c.id)}
                      className="flex w-full items-center gap-2 px-1.5 py-1 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <MessageSquare className="size-3.5 shrink-0" />
                      <span className="truncate">{c.title}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Outils externes (MCP) live : montre que Cortex peut AGIR, pas seulement citer. */}
              {mcpTools.length > 0 && (
                <div className="w-full border border-border/60 bg-muted/30 p-2.5 text-left">
                  <p className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                    <Plug className="size-3 shrink-0" /> {t.chatTools}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {mcpTools.slice(0, 10).map((tool) => (
                      <span
                        key={`${tool.connector}-${tool.name}`}
                        title={`${tool.connector}: ${tool.name}`}
                        className="border border-border/60 bg-background px-1.5 py-0.5 text-[10px] text-muted-foreground"
                      >
                        {tool.name}
                      </span>
                    ))}
                    {mcpTools.length > 10 && (
                      <span className="self-center text-[10px] text-muted-foreground">+{mcpTools.length - 10} more</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : (
            turns.map((turn) =>
              turn.role === "user" ? (
                <Message key={turn.id} role="user" content={turn.text} />
              ) : turn.kind === "quota" ? (
                <Message key={turn.id} role="assistant">
                  <QuotaNotice />
                </Message>
              ) : (
                <Message key={turn.id} role="assistant">
                  {turn.answer && <AgentAnswerView answer={turn.answer} slug={slug} />}
                </Message>
              ),
            )
          )}
          {thinking && (
            <Message role="assistant">
              <ThinkingBar />
            </Message>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Rend la réponse structurée : étapes, raisonnement, la réponse, puis ce qu'elle propose ou a fait (les cartes), puis
 * les sources repliées. Les cartes viennent après le texte, au plus près de la barre : le serveur écrit « the action
 * below » ou « check the issue below », et c'est la dernière chose à décider.
 */
function AgentAnswerView({ answer, slug }: { answer: AssistantAnswer; slug: string }) {
  const hasBreakdown = answer.usage && (answer.usage.promptTokens > 0 || answer.usage.completionTokens > 0)
  // Le dossier de la réponse, que porte chacun de ses appels d'outil : il fait d'elle un cas de la banque (R61,
  // séance n°10).
  const record = answer.toolCalls.find((tc) => tc.record)?.record
  return (
    <div className="group/answer space-y-1">
      {answer.steps.length > 0 && (
        <Steps steps={answer.steps.map((s) => ({ title: s.label, status: s.status, description: s.description ?? undefined }))} />
      )}
      {answer.reasoning && <Reasoning content={answer.reasoning} />}
      <Markdown content={answer.answer} />
      {answer.toolCalls.map((tc, i) =>
        // Cortex demande d'abord ce qui compte (R102) : rien n'est préparé, sa question est la réponse.
        isQuestion(tc) ? null :
        // Une issue que Cortex a préparée : la carte la montre, la personne la modifie et la crée (R78).
        isPreparedIssue(tc) ? (
          <IssueDraftCard key={i} slug={slug} call={tc} />
        ) :
        // Une suppression demandée : archiver d'abord, qui se défait, ou supprimer, d'un clic de la personne (R1).
        isDeletion(tc) ? (
          <DeleteIssueCard key={i} slug={slug} call={tc} target={tc.target} />
        ) : (
          <div key={i}>
            <Tool name={tc.name} status={tc.status as ToolStatus} input={tc.input ?? undefined} output={tc.output ?? undefined} />
            {/* Action demandée par les règles de l'espace : validation explicite de l'utilisateur. */}
            {isApprovable(tc) && <PendingAction slug={slug} call={tc} />}
            {/* Ce que Cortex vient de faire se défait d'un geste (R77). */}
            {isUndoable(tc) && <UndoAction slug={slug} call={tc} />}
            {/* La mission de l'issue, lue ou confiée : ses demandes et son résultat se décident sur ses cartes (TF-J1-5). */}
            {isMission(tc) && <MissionInChat slug={slug} target={tc.target} />}
          </div>
        ),
      )}
      {answer.sources.length > 0 && (
        <Sources items={answer.sources.map((s) => ({ title: s.title, snippet: s.domain, score: s.score ?? undefined }))} />
      )}
      <div className="mt-1 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <FeedbackBar onCopy={() => navigator.clipboard?.writeText(answer.answer)} />
          {record && <EvalCaseButton slug={slug} record={record} />}
        </div>
        {/* Le mode et les tokens de la réponse : au survol, pour qui les cherche, sans peser sur la lecture. */}
        {answer.usage && answer.usage.totalTokens > 0 && (
          <span className="flex shrink-0 items-center gap-1.5 text-[10px] tabular-nums text-muted-foreground/60 opacity-0 transition-opacity group-hover/answer:opacity-100 group-focus-within/answer:opacity-100">
            <span className="bg-muted px-1 py-px font-medium uppercase tracking-wide">{answer.mode}</span>
            {answer.usage.totalTokens.toLocaleString("en-US")} tokens
            {hasBreakdown && <span className="opacity-70">({answer.usage.promptTokens}↑ {answer.usage.completionTokens}↓)</span>}
          </span>
        )}
      </div>
    </div>
  )
}
