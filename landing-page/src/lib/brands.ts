/**
 * Marques montrées sur le site. Logos vendorisés dans `public/logos/` depuis SVGL (même source que la webapp :
 * `frontend/scripts/fetch-logos.mjs`), sauf Plane (marque officielle du dépôt makeplane/plane, AGPL-3.0). Les trois
 * systèmes (Apple, Windows, Linux) viennent aussi de SVGL.
 *
 * Claude Code montre le logo de Claude (SVGL `claude-ai-icon`), à la demande du CEO le 19/10/2026. L'ADR-013 notait
 * que les conditions d'Anthropic encadrent l'usage de leur logo : si Anthropic le demande, retirer `file` ici suffit,
 * BrandMark retombe alors sur le nom seul.
 */
export type BrandKey =
  | "claude-code"
  | "github-copilot"
  | "github"
  | "ollama"
  | "openai"
  | "mistral"
  | "groq"
  | "mcp"
  | "plane"
  | "macos"
  | "windows"
  | "linux";

export type Brand = {
  name: string;
  /** Fichier dans public/logos. Sans fichier, la marque n'est nommée qu'en texte. */
  file?: string;
  /** Ce que la marque fait dans TaskForce, en quelques mots. */
  role: string;
};

export const BRANDS: Record<BrandKey, Brand> = {
  "claude-code": { name: "Claude Code", file: "claude.svg", role: "Coding agent, on your computer" },
  "github-copilot": { name: "GitHub Copilot", file: "githubcopilot-light.svg", role: "Coding agent, in GitHub's cloud" },
  github: { name: "GitHub", file: "github-light.svg", role: "Repositories and pull requests" },
  ollama: { name: "Ollama", file: "ollama-light.svg", role: "Local models" },
  openai: { name: "OpenAI", file: "openai-light.svg", role: "Or any compatible API key" },
  mistral: { name: "Mistral", file: "mistral.svg", role: "API key" },
  groq: { name: "Groq", file: "groq.svg", role: "API key" },
  mcp: { name: "MCP servers", file: "mcp-light.svg", role: "Tools for the assistant" },
  plane: { name: "Plane", file: "plane.svg", role: "Read your Plane projects" },
  macos: { name: "macOS", file: "apple.svg", role: "Apple silicon and Intel" },
  windows: { name: "Windows", file: "windows.svg", role: "Windows 10 and 11, 64-bit" },
  linux: { name: "Linux", file: "linux.svg", role: "AppImage or .deb, 64-bit" },
};
