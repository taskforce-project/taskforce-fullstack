"use client"

import { useEffect, useRef, useState } from "react"
import { useParams } from "next/navigation"
import { useReducedMotion } from "framer-motion"
import {
  Sparkles, ChevronDown, ChevronUp, Plus, Trash2, Play, CircleAlert,
} from "lucide-react"
import { Message, TokenMeter } from "@/components/chat"
import { cn } from "@/lib/utils"
import { fillModelText } from "@/lib/ai/model-table"
import {
  approveAction, isApprovable, isDeletion, isMission, isPreparedIssue, isQuestion, isQuestionCard, isUndoable,
  type AssistantActionResult,
  type AssistantAnswer, type AssistantToolCall,
} from "@/lib/api/assistant-service"
import { getErrorMessage } from "@/lib/api/client"
import { outcomeLine, plainOutput, proposalLine } from "@/lib/cortex/work-lines"
import { useCortexWork } from "@/lib/hooks/use-cortex-work"
import { useAiStatusStore } from "@/lib/store/ai-status-store"
import { useCortexStore } from "@/lib/store/cortex-store"
import { useEvalStore } from "@/lib/store/eval-store"
import { usePreferencesStore } from "@/lib/store/preferences-store"
import { useSettingsStore } from "@/lib/store/settings-store"
import { IS_DESKTOP } from "@/lib/desktop"
import { AnswerActions } from "./answer-actions"
import { AnswerText } from "./answer-text"
import { Arrival } from "./arrival"
import { CompactedNotice, ContextFitNotice } from "./context-fit-notice"
import { CortexUsage } from "./cortex-usage"
import { DeleteIssueCard } from "./delete-issue-card"
import { IssueDraftCard } from "./issue-draft-card"
import { MissionInChat } from "./mission-in-chat"
import { ModelOffer } from "./model-offer"
import { QuestionCard } from "./question-card"
import { ReadLine } from "./read-line"
import { StoppedNotice } from "./stopped-notice"
import { UndoAction } from "./undo-action"
import { UserMessage } from "./user-message"
import { WorkedLine, WorkingLine } from "./work-line"

/**
 * Plafond mensuel de tokens IA de l'instance atteint (HTTP 409) - carte d'**information** (pas
 * d'erreur). Rendue en tour assistant pour rester dans le fil.
 */
function QuotaNotice() {
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-primary/25 bg-primary/5 p-3">
      <div className="flex items-center gap-2">
        <div className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <Sparkles className="size-4" />
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
        <CircleAlert className="size-4 shrink-0 text-ink-yellow" /> AI is not configured
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

/**
 * Action proposée par Cortex, interne (une note, un projet) ou dans un outil connecté : les règles de l'espace la
 * demandent à la personne. Rien n'est fait sans son clic ; l'accord part avec le dossier de la réponse, où le serveur
 * la rejuge et la garde.
 */
function PendingAction({ slug, call }: { slug: string; call: AssistantToolCall }) {
  const [state, setState] = useState<"idle" | "running" | "success" | "refused" | "error">("idle")
  const [output, setOutput] = useState<string | null>(null)
  const [result, setResult] = useState<AssistantActionResult | null>(null)
  const noteDone = useCortexStore((s) => s.noteDone)
  const t = usePreferencesStore((s) => s.t.thread)
  const outcome = { success: t.outcomeDone, refused: "", error: t.outcomeFailed }
  // Accordée et faite : l'appel tel qu'il a abouti, avec l'empreinte que « Undo » nomme et l'issue qu'il touche.
  const done: AssistantToolCall = { ...call, status: "success", output, ref: result?.ref ?? null, target: result?.target ?? null }

  const run = async () => {
    setState("running")
    try {
      const approved = await approveAction(slug, call)
      setOutput(approved.output)
      setResult(approved)
      setState(approved.status)
      // La fenêtre la montre dans « Changes » (R122), avec le même « Undo » qu'ici.
      if (approved.status === "success") {
        noteDone({ ...call, status: "success", output: approved.output, ref: approved.ref ?? null, target: approved.target ?? null })
      }
    } catch (e) {
      setOutput(getErrorMessage(e))
      setState("error")
    }
  }

  return (
    <div className="my-2 flex flex-col gap-2 border border-shape-yellow/35 bg-shape-yellow/[0.06] p-2.5 text-xs">
      <p className="text-muted-foreground">{proposalLine(call.name, t)}</p>
      {state === "idle" || state === "running" ? (
        <button
          type="button"
          onClick={run}
          disabled={state === "running"}
          className="flex h-7 w-fit items-center gap-1.5 bg-primary px-2.5 font-medium text-primary-foreground shadow-key transition-colors hover:bg-primary-hover disabled:opacity-60"
        >
          <Play className="size-4" /> {state === "running" ? t.approving : t.approve}
        </button>
      ) : (
        <>
          <p className={cn("whitespace-pre-wrap break-words",
            state === "success" ? "text-ink-green" : state === "refused" ? "text-ink-red" : "text-destructive")}>
            {outcome[state]}{plainOutput(output ?? "")}
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

/** En deçà du bas du fil, la personne le lit encore (en pixels). */
const BOTTOM_MARGIN = 32

const HEADER_BUTTON =
  "flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"

/**
 * La conversation avec Cortex. Dans la fenêtre (R119, séance n°18), elle tient sa colonne (`layout="column"`) : ses
 * tours sur une colonne de 720 px au plus, centrée, au-dessus du compositeur ; son titre est dans la ligne du haut, les
 * conversations à gauche, la jauge sous le compositeur. Quand le volet prend toute la largeur (`layout="folded"`), elle
 * se déplie au-dessus du compositeur, comme depuis le 02/11/2026 : pas de carte, ses tours se lisent sur le dégradé qui
 * monte de la barre (`.cortex-wash`), la dernière réponse en grand, et juste au-dessus de la barre la ligne d'outils du
 * composeur du site (les conversations, une nouvelle, la jauge, le chevron qui la réduit). Une conversation neuve
 * s'ouvre sur l'arrivée (R123) : ce qui attend la personne, puis trois suggestions tirées de l'espace. Sous chaque
 * réponse, la ligne grise dit le modèle et ce qu'il a lu. Elle se lit dans `useCortexStore` ; la saisie reste le
 * compositeur (R76). Les cartes qu'elle porte (l'issue préparée, Undo, l'accord, la mission) gardent leur allure.
 */
export function AgentChat({ onFold, layout = "folded" }: Readonly<{
  /** Réduit la conversation dans le compositeur (repliée seulement). */
  onFold?: () => void
  layout?: "column" | "folded"
}>) {
  const column = layout === "column"
  const params = useParams()
  const slug = typeof params?.workspace === "string" ? params.workspace : ""
  const t = usePreferencesStore((s) => s.t.shell)
  const models = usePreferencesStore((s) => s.t.models)
  const attachedText = usePreferencesStore((s) => s.t.conversation.attached)
  const reduceMotion = useReducedMotion()

  const turns = useCortexStore((s) => s.turns)
  const conversations = useCortexStore((s) => s.conversations)
  const conversationId = useCortexStore((s) => s.conversationId)
  const tokens = useCortexStore((s) => s.tokens)
  const sentAt = useCortexStore((s) => s.sentAt)
  const lastMs = useCortexStore((s) => s.lastMs)
  const loadConversations = useCortexStore((s) => s.loadConversations)
  const openConversation = useCortexStore((s) => s.openConversation)
  const newConversation = useCortexStore((s) => s.newConversation)
  const removeConversation = useCortexStore((s) => s.removeConversation)

  const [showList, setShowList] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const threadRef = useRef<HTMLDivElement>(null)
  const askRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  // La personne lit le bas du fil : la ligne de « /compact » y reste en vue, sans animation.
  const atBottom = useRef(true)
  // « /compact » attend sur sa propre ligne : ce n'est pas une réponse qui travaille.
  const compacting = turns.at(-1)?.compacting === true
  const thinking = sentAt !== null && !compacting
  // L'échange en cours : la dernière demande de la personne et la réponse qui la suit, en grand une fois arrivée. Ce
  // qui précède la demande est plus petit. La ligne de « /compact » ne change pas ce qui se lit en grand.
  const lastAsk = turns.findLastIndex((turn) => turn.role === "user")
  const lastSaid = turns.findLast((turn) => turn.kind !== "compact")
  const latest = !thinking && lastSaid?.role === "assistant" ? lastSaid.id : undefined

  const aiStatus = useAiStatusStore((s) => s.status)
  const fetchAiStatus = useAiStatusStore((s) => s.fetchStatus)
  useEffect(() => { void fetchAiStatus() }, [fetchAiStatus])

  useEffect(() => { void loadConversations(slug) }, [loadConversations, slug])

  // Ce que Cortex fait, annoncé par le serveur (R137) ; la banque dit si « bien » et « pas bien » ont leur place (R15).
  useCortexWork()
  const fetchBank = useEvalStore((s) => s.fetchBank)
  useEffect(() => { if (slug) void fetchBank(slug) }, [fetchBank, slug])

  // L'échange en cours reste en vue, juste au-dessus de la barre où la personne vient d'écrire. Plus haut que ce qui se
  // lit sous le fondu du haut (le retrait du fil), il se lit depuis son début : sa demande, juste sous le fondu.
  useEffect(() => {
    const el = threadRef.current
    if (!el) return
    // « /compact » ne fait rien défiler (TF-J1-15) : sa ligne s'ajoute en bas, et qui lit le bas la voit, sans animation.
    if (turns.at(-1)?.kind === "compact") {
      if (atBottom.current) el.scrollTop = el.scrollHeight
      return
    }
    const ask = askRef.current
    const askTop = ask ? ask.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop : 0
    const fade = Number.parseFloat(getComputedStyle(el).paddingTop) || 0
    const top = ask && el.scrollHeight - askTop > el.clientHeight - fade ? askTop - fade : el.scrollHeight
    el.scrollTo?.({ top, behavior: reduceMotion ? "auto" : "smooth" })
  }, [turns, thinking, reduceMotion])

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

  const currentTitle = conversationId
    ? (conversations.find((c) => c.id === conversationId)?.title ?? "Conversation")
    : t.chatNew

  return (
    <div className={cn("flex min-h-0 flex-col", column && "flex-1")}>
      <div
        ref={threadRef}
        onScroll={(e) => {
          const el = e.currentTarget
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < BOTTOM_MARGIN
        }}
        className={cn("cortex-thread min-h-0 overflow-y-auto px-3 md:px-4", column && "flex flex-1 flex-col")}
      >
        {/* En colonne, les tours se posent juste au-dessus du compositeur et montent à mesure. */}
        <div className={cn("flex flex-col", column && "mx-auto mt-auto w-full max-w-[720px] pt-4")}>
          {turns.length === 0 && !thinking ? (
            // L'arrivée (R123) : ce qui attend la personne, puis trois suggestions tirées de l'espace ; le tour guidé
            // n'existe plus (R124). Sans modèle joignable, la carte le dit d'abord.
            <div className="flex flex-col gap-3 pb-2">
              {aiStatus && !aiStatus.chatAvailable && <AiUnavailableNotice />}
              <Arrival slug={slug} />
            </div>
          ) : (
            turns.map((turn, i) => (
              <div
                key={turn.id}
                ref={i === lastAsk ? askRef : undefined}
                className={cn(i < lastAsk && "cortex-earlier", turn.id === latest && "cortex-latest")}
              >
                {turn.role === "user" ? (
                  <>
                    <UserMessage text={turn.text} />
                    {/* Ce que la personne a joint à sa demande (R123) : Cortex en a reçu le contenu. */}
                    {turn.attached && turn.attached.length > 0 && (
                      <p className="mt-0.5 text-right text-xs text-muted-foreground">
                        {attachedText}: {turn.attached.map((a) => a.label).join(", ")}
                      </p>
                    )}
                    {/* La demande renvoyée d'un clic au modèle que TaskForce proposait (R118) : on voit où elle part. */}
                    {turn.sentTo && (
                      <p className="mt-0.5 text-right text-xs text-muted-foreground">
                        {fillModelText(models.sentTo, { model: turn.sentTo })}
                      </p>
                    )}
                  </>
                ) : turn.kind === "quota" ? (
                  <Message role="assistant">
                    <QuotaNotice />
                  </Message>
                ) : turn.kind === "compact" ? (
                  <CompactedNotice compacted={turn.compacted ?? 0} compacting={turn.compacting} summary={turn.summary} problem={turn.problem} />
                ) : turn.kind === "stopped" ? (
                  <StoppedNotice />
                ) : (
                  <Message role="assistant">
                    {turn.answer && <AgentAnswerView answer={turn.answer} slug={slug} />}
                    <ModelOffer slug={slug} turn={turn} />
                  </Message>
                )}
              </div>
            ))
          )}
          {thinking && (
            <Message role="assistant">
              <WorkingLine />
            </Message>
          )}
        </div>
      </div>

      {/* Les contrôles de la conversation, juste au-dessus de la barre, sans cadre : la ligne d'outils du composeur.
          En colonne, chacun a sa place dans la fenêtre : le titre en haut, les conversations à gauche, la jauge dessous. */}
      {!column && (
        <div className="flex h-9 shrink-0 items-center gap-1 px-1">
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
              className="flex max-w-full items-center gap-1.5 rounded-full px-2 py-1 text-xs transition-colors hover:bg-muted"
            >
              <Sparkles className="size-4 shrink-0 text-primary" aria-hidden="true" />
              <span className="truncate font-medium">{currentTitle}</span>
              <ChevronUp className={cn("size-4 shrink-0 transition-transform duration-150 motion-reduce:transition-none", showList && "rotate-180")} />
            </button>

            {/* La liste s'ouvre vers le haut, au-dessus de la conversation : en dessous, il y a la barre. */}
            {showList && (
              <div className="absolute bottom-full left-0 z-50 mb-1 w-64 border border-border bg-popover p-1 shadow-lg">
                <button
                  type="button"
                  onClick={startNew}
                  className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-xs font-medium transition-colors hover:bg-muted"
                >
                  <Plus className="size-4" /> {t.chatNew}
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
                          <span className="text-xs text-muted-foreground">{c.messageCount} message{c.messageCount > 1 ? "s" : ""}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeConversation(slug, c.id)}
                          className="shrink-0 p-1 text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
                          aria-label={t.chatDelete}
                          title={t.chatDelete}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          <button type="button" onClick={startNew} aria-label={t.chatNew} title={t.chatNew} className={HEADER_BUTTON}>
            <Plus className="size-4" />
          </button>

          <div className="ml-auto flex min-w-0 items-center gap-2 pl-2 text-xs text-muted-foreground">
            {thinking ? (
              <span className="hidden tabular-nums text-primary/80 sm:inline">{t.chatThinking} · {elapsed.toFixed(1)} s</span>
            ) : tokens > 0 ? (
              <span className="hidden items-center gap-1.5 sm:flex">
                <TokenMeter value={tokens} className="text-muted-foreground/70" />
                {lastMs != null && <span className="tabular-nums">· {(lastMs / 1000).toFixed(1)} s</span>}
              </span>
            ) : null}
            <CortexUsage />
          </div>

          <button type="button" onClick={onFold} aria-label={t.chatFold} title={t.chatFold} className={HEADER_BUTTON}>
            <ChevronDown className="size-4" />
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * La carte d'un appel d'outil de la réponse, quand il en a une : les questions de Cortex (R115, R136), une issue préparée,
 * une suppression, une action demandée, Undo ou une mission. Elles restent visibles, hors du pli du travail (R137) ; un
 * appel sans carte ne montre rien ici, il se raconte dans le pli. Après les réponses à une carte de questions, la suite du
 * geste se rend ici à son tour, sous elle.
 */
function ToolCallView({ slug, call, followUp = false }: { slug: string; call: AssistantToolCall; followUp?: boolean }) {
  const t = usePreferencesStore((s) => s.t.thread)
  // Cortex demande ce qu'il manque au geste (R115) : une carte de deux questions au plus, et la suite sur son envoi.
  if (isQuestionCard(call)) {
    return <QuestionCard slug={slug} call={call} then={(next) => <ToolCallView slug={slug} call={next} followUp />} />
  }
  // Cortex demande d'abord ce qui compte (R102) : rien n'est préparé, sa question est la réponse.
  if (isQuestion(call)) return null
  // Une issue que Cortex a préparée : la carte la montre, la personne la modifie et la crée (R78).
  if (isPreparedIssue(call)) return <IssueDraftCard slug={slug} call={call} />
  // Une suppression demandée : archiver d'abord, qui se défait, ou supprimer, d'un clic de la personne (R1).
  if (isDeletion(call)) return <DeleteIssueCard slug={slug} call={call} target={call.target} />
  // Repris sur une carte, le geste n'a pas de réponse du modèle : ce qu'il a fait se dit ici, en une phrase.
  const said = followUp ? outcomeLine(call, t) : null
  // Un appel sans carte se raconte dans le pli du travail : ici, il ne prend aucune place.
  if (!said && !isApprovable(call) && !isUndoable(call) && !isMission(call)) return null
  return (
    <div>
      {said && <p className="whitespace-pre-wrap break-words text-sm text-foreground">{said}</p>}
      {/* Action demandée par les règles de l'espace : validation explicite de l'utilisateur. */}
      {isApprovable(call) && <PendingAction slug={slug} call={call} />}
      {/* Ce que Cortex vient de faire se défait d'un geste (R77). */}
      {isUndoable(call) && <UndoAction slug={slug} call={call} />}
      {/* La mission de l'issue, lue ou confiée : ses demandes et son résultat se décident sur ses cartes (TF-J1-5). */}
      {isMission(call) && <MissionInChat slug={slug} target={call.target} />}
    </div>
  )
}

/**
 * Rend la réponse structurée : le pli du travail (R137), la réponse, puis ce qu'elle propose ou a fait (les cartes), puis
 * sa ligne grise et, au survol, les gestes sur elle. Les cartes viennent après le texte, au plus près de la barre : le
 * serveur écrit « the action below » ou « check the issue below », et c'est la dernière chose à décider.
 */
function AgentAnswerView({ answer, slug }: { answer: AssistantAnswer; slug: string }) {
  // Le dossier de la réponse : il fait d'elle un cas de la banque (R61, R137), même une fois la conversation rouverte.
  const record = answer.record ?? answer.read?.record ?? answer.toolCalls.find((tc) => tc.record)?.record
  // Les questions d'un geste se lisent sur leur carte (R115) : le texte de la réponse ne les répète pas au-dessus.
  const asking = answer.toolCalls.some(isQuestionCard)
  return (
    <div className="group/answer space-y-1">
      <WorkedLine answer={answer} />
      {/* Ce qu'il a fallu condenser ou couper pour tenir la fenêtre du modèle, avant que la requête parte (TF-J1-13). */}
      <ContextFitNotice context={answer.read?.context} model={answer.model} />
      {/* La correction d'une phrase fausse se montre comme la parole de TaskForce, pas celle du modèle (R116). */}
      <AnswerText text={answer.answer} withCard={asking} toolCalls={answer.toolCalls} />
      {answer.toolCalls.map((tc, i) => <ToolCallView key={i} slug={slug} call={tc} />)}
      <ReadLine slug={slug} answer={answer} />
      <AnswerActions slug={slug} text={answer.answer} record={record} />
    </div>
  )
}
