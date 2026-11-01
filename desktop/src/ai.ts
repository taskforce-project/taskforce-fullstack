/**
 * IA de l'app desktop. Le backend embarqué parle lui-même au fournisseur choisi par la personne, par sa passerelle de
 * modèles (backend/tf-api, core/service/ai) : Ollama sur l'ordinateur (défaut), une API compatible OpenAI, ou l'API
 * d'Anthropic. La coque ne relaie plus rien ; elle traduit le choix de la personne en variables d'un serveur
 * (`AI_PROVIDER`, `AI_API_KEY`...), qu'elle passe au backend à son lancement, puis par un appel local protégé par un
 * secret quand la personne change de fournisseur (`PUT /api/desktop/ai`) : le backend s'en sert dès l'appel suivant,
 * sans redémarrer. La clé d'API reste dans le trousseau du système ; elle ne va qu'au backend, en mémoire, jamais en
 * base ni dans un fichier.
 */

/** Ollama sur l'ordinateur. */
export const OLLAMA_URL = "http://127.0.0.1:11434";
/** En-tête du secret de la coque, que la fenêtre ne connaît pas. */
export const SHELL_HEADER = "X-TaskForce-Shell";
/** Lire l'état interroge le fournisseur (la conversation, puis les vecteurs) : un délai large, sans attendre sans fin. */
const BACKEND_TIMEOUT_MS = 30_000;

/** Choix de la personne, gardé dans les réglages de son compte (la clé à part, chiffrée). */
export interface AiSettings {
  /** `ollama` : Ollama sur cet ordinateur ; `custom` : API compatible OpenAI ; `anthropic` : API d'Anthropic ; `off` : pas d'IA. */
  provider: "ollama" | "custom" | "anthropic" | "off";
  /** URL de base de l'API compatible OpenAI, avec `/v1` (`custom` seulement). */
  baseUrl: string;
  /** Modèle de conversation ; vide = choisi parmi les modèles du fournisseur. */
  model: string;
  /** Modèle des réponses courtes ; vide = choisi (un Haiku chez Anthropic) ou le modèle de conversation. */
  modelFast: string;
  /** Modèle d'embeddings ; vide = choisi parmi les modèles installés (Ollama). */
  embedModel: string;
}

export const DEFAULT_AI_SETTINGS: AiSettings = { provider: "ollama", baseUrl: "", model: "", modelFast: "", embedModel: "" };

/** État lu par le backend chez le fournisseur, pour l'écran de réglages (cf. DesktopAiStateResponse). */
export interface AiState {
  configured: boolean;
  /** Le fournisseur répond, avec la liste de ses modèles. */
  reachable: boolean;
  models: string[];
  /** Modèles du fournisseur des vecteurs : Ollama sur l'ordinateur quand la conversation passe par Anthropic. */
  embedModels: string[];
  chat: { model: string | null; model_fast: string | null; available: boolean };
  embeddings: { model: string | null; dimensions: number; available: boolean };
}

const PROVIDERS: AiSettings["provider"][] = ["ollama", "custom", "anthropic", "off"];

/**
 * Réglages reçus de l'interface, vérifiés avant d'être gardés : la page n'est jamais crue sur parole. `apiKey` vaut
 * `undefined` pour garder la clé enregistrée, `null` ou une chaîne vide pour l'effacer.
 */
export function parseAiInput(input: unknown): { settings: AiSettings; apiKey: string | null | undefined } {
  const value = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const raw = (value.settings && typeof value.settings === "object" ? value.settings : {}) as Record<string, unknown>;
  const text = (name: string, max: number) => (typeof raw[name] === "string" ? (raw[name] as string).trim().slice(0, max) : "");
  const provider = PROVIDERS.find((known) => known === raw.provider) ?? "ollama";
  const baseUrl = text("baseUrl", 500).replace(/\/+$/, "");
  if (provider === "custom" && !/^https?:\/\/\S+$/i.test(baseUrl)) {
    throw new Error("Enter the address of the API, for example https://api.openai.com/v1");
  }
  const apiKey = value.apiKey === null ? null : typeof value.apiKey === "string" ? value.apiKey.trim().slice(0, 500) : undefined;
  return {
    settings: {
      provider,
      baseUrl: provider === "custom" ? baseUrl : "",
      model: text("model", 200),
      modelFast: text("modelFast", 200),
      embedModel: text("embedModel", 200),
    },
    apiKey,
  };
}

/**
 * Où la clé d'un fournisseur est gardée dans le trousseau : une par fournisseur, pour qu'une clé ne parte jamais chez
 * un autre que le sien quand la personne change de fournisseur. `null` pour un fournisseur sans clé.
 */
export function keySlot(provider: AiSettings["provider"]): "aiApiKey" | "aiAnthropicKey" | null {
  if (provider === "custom") return "aiApiKey";
  if (provider === "anthropic") return "aiAnthropicKey";
  return null;
}

/**
 * Le choix de la personne en variables d'un serveur (cf. AiProviderSettings du backend). Toutes sont posées, vides au
 * besoin : un changement remplace le fournisseur précédent en entier. Les vecteurs viennent d'Ollama sur l'ordinateur,
 * sauf avec une API compatible OpenAI, qui sert aussi les siens.
 */
export function aiEnvironment(settings: AiSettings, apiKey: string | undefined): Record<string, string> {
  const withKey = settings.provider === "custom" || settings.provider === "anthropic";
  return {
    AI_PROVIDER: settings.provider === "off" ? "none" : settings.provider === "custom" ? "openai" : settings.provider,
    AI_BASE_URL: settings.provider === "custom" ? settings.baseUrl : "",
    AI_API_KEY: withKey ? apiKey ?? "" : "",
    AI_MODEL: settings.model,
    AI_MODEL_FAST: settings.modelFast,
    AI_EMBED_BASE_URL: "",
    AI_EMBED_API_KEY: "",
    AI_EMBED_MODEL: settings.embedModel,
    OLLAMA_BASE_URL: OLLAMA_URL,
  };
}

/** Le fournisseur d'IA du backend embarqué, lu et changé par la coque seule. */
export class BackendAi {
  /**
   * @param port port du backend, connu une fois qu'il a démarré
   * @param launchToken jeton de lancement, exigé sur chaque requête de l'API locale
   * @param shellSecret secret de la coque, tiré à chaque lancement (`TF_DESKTOP_SHELL_SECRET`)
   */
  constructor(
    private readonly port: () => number,
    private readonly launchToken: string,
    private readonly shellSecret: string,
  ) {}

  /** État courant ; `fresh` relit le fournisseur sans attendre le cache du backend (écran de réglages). */
  state(fresh = false): Promise<AiState> {
    return this.call("GET", `/api/desktop/ai?fresh=${fresh}`);
  }

  /** Change de fournisseur ; l'état rendu est celui du nouveau. */
  apply(variables: Record<string, string>): Promise<AiState> {
    return this.call("PUT", "/api/desktop/ai", { variables });
  }

  private async call(method: "GET" | "PUT", path: string, body?: unknown): Promise<AiState> {
    const response = await fetch(`http://127.0.0.1:${this.port()}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.launchToken}`,
        [SHELL_HEADER]: this.shellSecret,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(BACKEND_TIMEOUT_MS),
    });
    const payload = (await response.json().catch(() => ({}))) as { data?: AiState; message?: string };
    if (!response.ok || !payload.data) {
      throw new Error(`TaskForce could not reach its AI settings (HTTP ${response.status})`);
    }
    return payload.data;
  }
}
