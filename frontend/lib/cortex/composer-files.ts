/**
 * Les fichiers du compositeur (R134, séance n°20) : ce que TaskForce sait vraiment lire, c'est-à-dire du texte. Aucun
 * analyseur de PDF n'existe côté serveur : un PDF, une image ou un fichier trop gros ne se joint pas, et une ligne le dit.
 * Le contenu se lit ici, dans le navigateur, et part avec la demande.
 */

/** Un fichier joint à la prochaine demande : ce que sa pastille montre, et son contenu. */
export interface ComposerFile {
  id: string
  name: string
  size: number
  text: string
}

/** Cinq fichiers par demande au plus, 256 Ko chacun : ce que le serveur accepte. */
export const MAX_FILES = 5
export const MAX_FILE_BYTES = 256 * 1024

const EXTENSIONS = new Set([
  "txt", "text", "md", "markdown", "mdx", "rst", "csv", "tsv", "json", "jsonl", "ndjson", "log", "xml", "yaml", "yml",
  "toml", "ini", "cfg", "conf", "properties", "sql", "graphql", "gql", "html", "htm", "css", "scss", "sass", "less",
  "js", "jsx", "mjs", "cjs", "ts", "tsx", "mts", "cts", "vue", "svelte", "astro", "py", "pyi", "java", "kt", "kts",
  "scala", "groovy", "gradle", "go", "rs", "rb", "php", "c", "h", "cc", "cpp", "cxx", "hpp", "hh", "cs", "swift", "m",
  "mm", "dart", "lua", "r", "pl", "pm", "sh", "bash", "zsh", "fish", "ps1", "psm1", "bat", "cmd", "tf", "hcl", "proto",
  "sol", "ex", "exs", "erl", "hs", "clj", "lisp", "ml", "vim", "diff", "patch", "tex", "bib", "srt", "vtt",
])

/** Les fichiers de code sans extension. */
const NAMES = new Set([
  "dockerfile", "makefile", "jenkinsfile", "procfile", "gemfile", "rakefile", "readme", "license", "changelog",
  "codeowners", ".gitignore", ".gitattributes", ".editorconfig", ".dockerignore", ".npmignore",
])

/** Au-delà d'un caractère illisible sur cent, ce n'est pas du texte. */
const MAX_UNREADABLE = 0.01

/** Le nom dit un fichier texte : une extension connue, ou un nom de fichier de code. */
export function readableName(name: string): boolean {
  const lower = name.toLowerCase()
  if (NAMES.has(lower)) return true
  const dot = lower.lastIndexOf(".")
  return dot > 0 && EXTENSIONS.has(lower.slice(dot + 1))
}

/** Le contenu est du texte : pas d'octet nul, et presque aucun caractère que l'UTF-8 n'a pas su lire. */
export function looksLikeText(content: string): boolean {
  if (content.includes("\u0000")) return false
  if (content.length === 0) return true
  let unreadable = 0
  for (const char of content) {
    if (char === "�") unreadable += 1
  }
  return unreadable / content.length <= MAX_UNREADABLE
}

let lastId = 0

/**
 * Lit ce que la personne joint : les fichiers qui se lisent, dans la place qui reste, et ceux qui ne se lisent pas. Un
 * fichier déjà joint (même nom, même taille) ne se joint pas deux fois.
 *
 * @param room la place qui reste sur la demande
 * @param have ce qui est déjà joint
 */
export async function readFiles(
  list: readonly File[],
  room: number,
  have: readonly ComposerFile[] = [],
): Promise<{ accepted: ComposerFile[]; refused: string[]; overflow: boolean }> {
  const accepted: ComposerFile[] = []
  const refused: string[] = []
  let overflow = false
  for (const file of list) {
    if (have.some((f) => f.name === file.name && f.size === file.size) || accepted.some((f) => f.name === file.name && f.size === file.size)) continue
    if (!readableName(file.name) || file.size > MAX_FILE_BYTES) {
      refused.push(file.name)
      continue
    }
    if (accepted.length >= room) {
      overflow = true
      continue
    }
    const text = await file.text().catch(() => null)
    if (text === null || !looksLikeText(text)) {
      refused.push(file.name)
      continue
    }
    accepted.push({ id: `f${++lastId}`, name: file.name, size: file.size, text })
  }
  return { accepted, refused, overflow }
}
