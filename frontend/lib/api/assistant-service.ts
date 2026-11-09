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
  /**
   * Ce que TaskForce demande avant le geste (R115), avec un statut question : deux questions au plus dans la même carte,
   * qui montre leurs choix et part d'un seul envoi.
   */
  questions?: AssistantQuestion[] | null
}
/**
 * Une question de TaskForce (R115, séance n°17), dans la forme des questions de Claude (décision du CEO, 05/11/2026) :
 * l'argument que la réponse remplit, un titre court, la question, si plusieurs choix se cochent, et ses choix, quatre au
 * plus, le recommandé d'abord. Une réponse tapée (« Other ») est toujours possible.
 */
export interface AssistantQuestion {
  field: string
  header: string | null
  text: string
  multiple: boolean
  choices: AssistantChoice[]
}
/** Un choix : la valeur que reçoit le geste, ce que la carte en montre, ce qu'il veut dire en une ligne, s'il est recommandé. */
export interface AssistantChoice {
  value: string
  label: string
  description: string | null
  recommended: boolean
}
/** La réponse à une question de la carte : les valeurs des choix cochés, et ce qui est tapé dans « Other ». */
export interface QuestionAnswer {
  field: string
  values: string[]
  other?: string
}
/** Ce que la personne voit quand elle écrit (R114) : le projet ouvert et l'issue ouverte, par leurs ids. */
export interface AssistantScreen {
  projectId: number
  issueId?: number | null
}
/** L'issue d'un geste : sa clé et son titre, et sa mission quand elle en a une. */
export interface AssistantTarget {
  issueId: number
  projectId: number
  key: string | null
  title: string
  /** La colonne où est l'issue, que la carte d'une suppression montre avec sa clé (test du CEO du 05/11/2026). */
  column?: string | null
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
/**
 * Tokens réellement consommés par le tour (usage LLM cumulé), et ce que le modèle a lu à son dernier appel : la taille de
 * ce prompt et sa fenêtre de contexte : celle que la passerelle a donnée (Ollama), celle que le fournisseur dit de ce
 * modèle, ou la valeur prudente des réglages, dite comme telle par `contextEstimated` (TF-J1-13).
 */
export interface AssistantUsage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
  lastPromptTokens?: number
  contextWindow?: number | null
  contextEstimated?: boolean
}
export interface AssistantAnswer {
  answer: string
  reasoning: string | null
  /** « stopped » : la personne a arrêté ce tour (R134). */
  mode: "fast" | "deep" | "fallback" | "stopped"
  sources: AssistantSource[]
  steps: AssistantStep[]
  toolCalls: AssistantToolCall[]
  usage: AssistantUsage
  /**
   * Le dossier de la réponse, quand elle en a un : celui de ses outils, ou celui que le serveur ouvre quand TaskForce
   * corrige une réponse sans outil (R116). Absent d'une réponse rendue avant R116.
   */
  record?: string | null
  /** Le modèle qui a répondu, tel que la passerelle l'a appelé ; absent d'un repli. */
  model?: string | null
  /** Ce que TaskForce a donné à lire à ce modèle, compté (R123, la ligne grise) ; absent d'un repli et des réponses d'avant. */
  read?: AssistantRead | null
}

/**
 * Ce que TaskForce a donné à lire au modèle pour une réponse (R123) : les issues lues en entier et leurs commentaires
 * donnés, les tableaux montrés (l'écran, ceux joints) et l'issue ouverte, les outils qui lisent et ont abouti, les notes
 * du Brain OS servies. Compté par le serveur au moment où il le donne, jamais deviné.
 */
export interface AssistantRead {
  issues: { key: string; comments: number }[]
  boards: { project: string; issues: number; open: string | null }[]
  tools: { name: string; calls: number }[]
  notes: number
  /** Ce que TaskForce a dû faire pour tenir la fenêtre du modèle (TF-J1-13) ; absent quand rien n'a été touché. */
  context?: ContextRead | null
  /** Les fichiers joints à la demande (R134) ; absent des réponses d'avant. */
  files?: { name: string }[]
}

/**
 * Ce qui a changé pour que la requête tienne la fenêtre du modèle : les messages condensés dans le résumé pour ce tour,
 * ceux qui n'ont pas pu partir, les résultats d'outils raccourcis pendant la boucle. Jamais en silence.
 */
export interface ContextRead {
  summarized: number
  leftOut: number
  toolResults: number
}

/** Ce que la personne joint à sa demande depuis le compositeur (R123) : une issue (son projet et son id), ou un projet. */
export interface AssistantAttachment {
  projectId: number
  issueId?: number | null
}

/**
 * Ce que TaskForce propose sous une réponse (R118) : la banque dit que le modèle de Cortex (`from`) échoue à ce genre de
 * demande (`capability`) et qu'un autre modèle servi (`to`) le réussit ; `text` est sa phrase, gardée dans la conversation.
 */
export interface ModelEscalation {
  capability: string
  from: string
  to: string
  text: string
}

/** Réponse d'un tour : la réponse de l'agent + la conversation où il est rattaché (créée si absente). */
export interface ChatTurnResponse {
  conversationId: number
  title: string
  answer: AssistantAnswer
  /** La proposition d'un modèle plus fort, quand la banque dit que celui de Cortex échoue à ce genre de demande. */
  escalation?: ModelEscalation | null
  /** Le modèle vers lequel la personne a envoyé cette demande, d'un clic. */
  sentTo?: string | null
  /** Le projet de la conversation après ce tour (R135) ; null sans projet, absent d'un serveur plus ancien. */
  projectId?: number | null
}

/** Ce qu'un tour envoie en plus de son texte (R134, R135). */
export interface AgentMessageOptions {
  /** Le nom de ce tour, pour pouvoir l'arrêter. */
  turn?: string
  /** Le projet de la conversation, tel que la rangée le montre : null pour « No project ». */
  project?: number | null
  /** Les fichiers texte joints. */
  files?: readonly { name: string; text: string }[]
  /** Coupe l'attente côté client, à l'arrêt. */
  signal?: AbortSignal
}

/**
 * Envoie un message à l'agent (dans une conversation existante ou nouvelle) et renvoie la réponse
 * structurée + l'id/titre de la conversation.
 */
export async function sendAgentMessage(
  slug: string,
  message: string,
  conversationId?: number | null,
  screen?: AssistantScreen | null,
  model?: string | null,
  attach?: readonly AssistantAttachment[] | null,
  options: AgentMessageOptions = {},
): Promise<ChatTurnResponse> {
  // L'écran part avec le message quand la personne regarde un projet (R114) : Cortex le lit avant les notes. Le
  // modèle, quand la personne envoie la demande à celui que TaskForce propose (R118) ; sans lui, rien ne change. Ce
  // qu'elle a joint depuis le compositeur (R123), quand elle a joint quelque chose. Le projet de la conversation (R135),
  // dès qu'elle en dit un : c'est lui qui décide, l'écran renseigne.
  const { turn, project, files, signal } = options
  const body = {
    message, conversationId: conversationId ?? null, ...(screen ? { screen } : {}), ...(model ? { model } : {}),
    ...(attach && attach.length > 0 ? { attach } : {}),
    ...(turn ? { turn } : {}),
    ...(project !== undefined ? { project: { id: project } } : {}),
    ...(files && files.length > 0 ? { files } : {}),
  }
  const res = await apiClient.post<{ data: ChatTurnResponse }>(ASSISTANT_ROUTES.CHAT(slug), body, {
    timeout: AI_TIMEOUT_MS, ...(signal ? { signal } : {}),
  })
  return res.data.data
}

/**
 * Arrête un tour (R134) : le serveur coupe l'appel au modèle, et rend le tour tel qu'il s'est arrêté, ce qu'il a déjà fait
 * compris ; null quand il n'a pas encore commencé, qu'il est déjà fini, ou qu'il finit encore.
 */
export async function stopTurn(slug: string, turn: string): Promise<ChatTurnResponse | null> {
  const res = await apiClient.post<{ data: ChatTurnResponse | null }>(ASSISTANT_ROUTES.STOP(slug), { turn }, { silentError: true })
  return res.data.data ?? null
}

/**
 * Une carte de questions de TaskForce que la personne peut répondre (R115) : elle porte ses questions, le dossier de la
 * réponse et l'empreinte de la carte, que les réponses nomment. Une question d'avant R115 n'a que sa phrase, dans la
 * réponse.
 */
export function isQuestionCard(call: AssistantToolCall): call is AssistantToolCall & { questions: AssistantQuestion[] } {
  return call.status === "question" && (call.questions?.length ?? 0) > 0 && Boolean(call.record) && Boolean(call.ref)
}

/**
 * Répond à une carte de TaskForce, toutes ses questions à la fois : pour chacune, les choix cochés ou la réponse tapée.
 * Le geste reprend sur le serveur, sans le modèle, et rend la suite : d'autres questions, sa carte, ou ce qu'il a fait.
 */
export async function answerQuestion(
  slug: string, call: AssistantToolCall, answers: QuestionAnswer[],
): Promise<AssistantToolCall> {
  const res = await apiClient.post<{ data: AssistantToolCall }>(
    ASSISTANT_ROUTES.ACTION_ANSWER(slug),
    { tool: call.name, record: call.record, ref: call.ref, answers },
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
