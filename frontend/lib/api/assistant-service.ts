/**
 * Service Assistant IA agentique.
 * `POST /api/workspaces/{slug}/assistant` (JSON) renvoie une réponse **structurée**
 * (réponse markdown + sources Brain OS + étapes + tool calls). Le backend délègue à l'agent
 * (Groq tool-calling si une clé est configurée, sinon repli RAG : sources réelles).
 */
import { apiClient, AI_TIMEOUT_MS } from "./client"
import { executeMcpAction } from "./integration-service"
import { ASSISTANT_ROUTES } from "../config/api-routes"

export interface AssistantSource {
  title: string
  domain: string
  score: number | null
}
export interface AssistantStep {
  label: string
  status: "pending" | "active" | "done" | "error"
  /** Détail optionnel de l'étape (routing, domaines trouvés, outils appelés…). */
  description: string | null
}
export interface AssistantToolCall {
  name: string
  /**
   * success, error, pending (proposé, il attend l'accord de la personne), refused (les règles de l'espace le refusent) ou
   * question (Cortex demande d'abord ce qui compte, rien n'est préparé).
   */
  status: string
  input: string | null
  output: string | null
  /** Le dossier de la réponse, que l'accord prolonge ; absent d'une réponse rendue avant le noyau. */
  record?: string | null
  /** L'empreinte du résultat de cet appel au dossier : « Undo » défait celui-là, parmi ceux de la réponse (R77). */
  ref?: string | null
  /** L'issue que touche un geste du MCP TaskForce, dont la conversation montre les cartes (ADR-024). */
  target?: AssistantTarget | null
}
/** L'issue d'un geste : sa clé et son titre, et sa mission quand elle en a une. */
export interface AssistantTarget {
  issueId: number
  projectId: number
  key: string | null
  title: string
  runId?: number | null
  /** Pour une suppression demandée : ce qui partirait avec l'issue, et si elle est déjà archivée. */
  comments?: number
  checklist?: number
  mission?: string | null
  archived?: boolean
}
/** Ce que devient une action accordée : faite, refusée par les règles de l'espace (elles ont pu changer), ou en échec. */
export interface AssistantActionResult {
  tool: string
  status: "success" | "refused" | "error"
  output: string
  /** L'empreinte du résultat au dossier, que « Undo » nomme ensuite. */
  ref?: string | null
  /** L'issue d'un geste accordé (sa mission, une fois confiée à un agent). */
  target?: AssistantTarget | null
}
/** Tokens réellement consommés par le tour (usage LLM cumulé). */
export interface AssistantUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}
export interface AssistantAnswer {
  answer: string
  reasoning: string | null
  mode: "fast" | "deep" | "fallback"
  sources: AssistantSource[]
  steps: AssistantStep[]
  toolCalls: AssistantToolCall[]
  usage: AssistantUsage
}

/** Réponse d'un tour : la réponse de l'agent + la conversation où il est rattaché (créée si absente). */
export interface ChatTurnResponse {
  conversationId: number
  title: string
  answer: AssistantAnswer
}

/**
 * Envoie un message à l'agent (dans une conversation existante ou nouvelle) et renvoie la réponse
 * structurée + l'id/titre de la conversation.
 */
export async function sendAgentMessage(
  slug: string,
  message: string,
  conversationId?: number | null,
): Promise<ChatTurnResponse> {
  const res = await apiClient.post<{ data: ChatTurnResponse }>(
    ASSISTANT_ROUTES.CHAT(slug),
    { message, conversationId: conversationId ?? null },
    { timeout: AI_TIMEOUT_MS },
  )
  return res.data.data
}

/**
 * Une action proposée que la personne peut accorder : celle d'une réponse du noyau, qui porte son dossier, ou une écriture
 * externe d'une réponse plus ancienne.
 */
export function isApprovable(call: AssistantToolCall): boolean {
  return call.status === "pending" && (Boolean(call.record) || call.name.includes("__"))
}

/**
 * Une issue que Cortex a préparée en carte (R78, séance n°13) : la personne la relit, la modifie et la crée ; l'accord
 * part avec le dossier de la réponse, et les champs modifiés.
 */
export function isPreparedIssue(call: AssistantToolCall): boolean {
  return call.name === "create_issue" && call.status === "pending" && Boolean(call.record)
}

/**
 * Un appel que Cortex arrête pour demander d'abord ce qui compte (le projet, la personne nommée ; R102) : rien n'est
 * préparé, et sa question suit dans la réponse. Rien à montrer pour l'appel lui-même.
 */
export function isQuestion(call: AssistantToolCall): boolean {
  return call.status === "question"
}

/**
 * Accorde une action proposée par Cortex. Avec le dossier de la réponse, le serveur la rejuge par les règles de l'espace
 * et la garde au dossier (R35) ; sans dossier, une écriture externe passe par la route de la console MCP.
 */
export async function approveAction(slug: string, call: AssistantToolCall): Promise<AssistantActionResult> {
  if (call.record) {
    const res = await apiClient.post<{ data: AssistantActionResult }>(
      ASSISTANT_ROUTES.ACTION_EXECUTE(slug),
      { tool: call.name, input: call.input ?? "{}", record: call.record },
    )
    return res.data.data
  }
  const args = call.input ? (JSON.parse(call.input) as Record<string, unknown>) : {}
  return { tool: call.name, status: "success", output: await executeMcpAction(slug, call.name, args) }
}

/**
 * Ce que Cortex fait et qui se défait d'un geste (R77) : un projet, une issue, une note qu'il a créés, et ses gestes sur
 * une issue (un changement de ses champs, un commentaire ; ADR-024). Confier une issue à un agent ne se défait pas : il
 * se demande d'abord.
 */
const UNDOABLE = new Set(["create_project", "create_issue", "create_note", "update_issue", "add_comment"])

/** Les gestes sur une issue : le serveur ne leur donne une empreinte que s'ils ont changé quelque chose à défaire. */
const GESTURES = new Set(["update_issue", "add_comment"])

/** Ce que Cortex vient de faire, et dont le dossier permet de le défaire. */
export function isUndoable(call: AssistantToolCall): boolean {
  if (call.status !== "success" || !call.record || !UNDOABLE.has(call.name)) return false
  // « TF-12 already has these values » n'a rien à défaire : pas d'Undo qui échouerait.
  return !GESTURES.has(call.name) || Boolean(call.ref)
}

/**
 * Défait ce que Cortex a fait (R77, séance n°13), par le dossier de la réponse : une seule fois, avec les droits de la
 * personne. L'empreinte du résultat nomme le bon geste quand la réponse en a plusieurs du même outil. Un refus du
 * serveur (le projet a des issues, l'issue a changé depuis) remonte comme une erreur.
 */
export async function undoAction(slug: string, call: AssistantToolCall): Promise<AssistantActionResult> {
  const res = await apiClient.post<{ data: AssistantActionResult }>(
    ASSISTANT_ROUTES.ACTION_UNDO(slug),
    call.ref ? { tool: call.name, record: call.record, ref: call.ref } : { tool: call.name, record: call.record },
  )
  return res.data.data
}

/** Les gestes qui montrent la mission d'une issue dans la conversation : la confier à un agent, lire où elle en est. */
const MISSION_TOOLS = new Set(["delegate_issue", "get_mission"])

/**
 * Un geste réussi dont la conversation montre la mission (TF-J1-5) : ses demandes et son résultat, sur les cartes de la
 * fiche de l'issue. La personne y décide par leurs boutons, jamais par un texte qu'elle ou un document aurait écrit (R1).
 */
export function isMission(call: AssistantToolCall): call is AssistantToolCall & { target: AssistantTarget } {
  return call.status === "success" && MISSION_TOOLS.has(call.name) && typeof call.target?.issueId === "number"
}

/**
 * Une suppression que Cortex demande (TF-J1-5, test du CEO du 02/11/2026) : la règle delete-issue la demande, et sa carte
 * propose d'abord d'archiver, qui se défait, puis de supprimer. Seul le clic de la personne supprime (R1).
 */
export function isDeletion(call: AssistantToolCall): call is AssistantToolCall & { target: AssistantTarget } {
  return call.name === "delete_issue" && call.status === "pending" && Boolean(call.record)
    && typeof call.target?.issueId === "number"
}

/** Variante texte (compat) : renvoie seulement la réponse markdown. */
export async function sendAssistantMessage(slug: string, message: string): Promise<string> {
  return (await sendAgentMessage(slug, message)).answer.answer
}
