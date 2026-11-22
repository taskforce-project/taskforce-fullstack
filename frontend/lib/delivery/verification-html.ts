import type { Section } from "./verification-words"

/**
 * La page de vérification exportée avec son dossier (R212 : « elle s'exporte avec le dossier ») : un fichier HTML seul,
 * qui se lit sans TaskForce ni réseau, avec les mêmes rubriques et les mêmes mots que l'écran, et le dossier lui-même à
 * l'intérieur, tel qu'exporté, pour que le vérificateur du runner le relise (`npm run verify` sur le JSON qu'il porte).
 */

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ESCAPES[c] ?? c)
}

/** Le dossier dans un bloc de données : rien de ce qu'il porte ne peut fermer le bloc ni devenir du code. */
export function embedJson(json: string): string {
  return json.replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029")
}

const STYLE = [
  "body{font:15px/1.55 system-ui,-apple-system,Segoe UI,sans-serif;color:#1a1a1a;background:#fff;max-width:46rem;margin:2rem auto;padding:0 1rem}",
  "h1{font-size:1.3rem;margin:0 0 .25rem}h2{font-size:1rem;margin:1.75rem 0 .5rem;border-bottom:1px solid #ddd;padding-bottom:.25rem}",
  "p{margin:.2rem 0}.muted{color:#555;font-size:.9em}.warn{color:#8a4b00}.agent{border-left:3px solid #999;padding-left:.6rem}",
  "pre{white-space:pre-wrap;background:#f6f6f6;padding:.6rem;font-size:.85em;border:1px solid #e5e5e5}",
  "header p{color:#444}a{color:#0b57d0}",
  "@media (prefers-color-scheme:dark){body{background:#141414;color:#eee}.muted{color:#aaa}.warn{color:#f0b35a}pre{background:#1f1f1f;border-color:#333}h2{border-color:#333}header p{color:#bbb}a{color:#8ab4f8}}",
].join("")

export interface PageHead {
  readonly title: string
  readonly heading: string
  readonly notes: readonly string[]
}

/** Le fichier HTML de la page, son dossier à l'intérieur. */
export function verificationHtml(head: PageHead, sections: readonly Section[], dossierJson: string): string {
  const body = sections.map((section) => {
    const lines = section.lines.map((line) => {
      const cls = line.tone ? ` class="${line.tone}"` : ""
      const text = line.link
        ? escapeHtml(line.text).replace(escapeHtml(line.link), `<a href="${escapeHtml(line.link)}">${escapeHtml(line.link)}</a>`)
        : escapeHtml(line.text)
      const detail = line.body ? `<pre${line.tone === "agent" ? " class=\"agent\"" : ""}>${escapeHtml(line.body)}</pre>` : ""
      return `<p${cls}>${text}</p>${detail}`
    }).join("\n")
    return `<section id="${section.id}"><h2>${escapeHtml(section.title)}</h2>\n${lines}</section>`
  }).join("\n")
  const notes = head.notes.map((note) => `<p>${escapeHtml(note)}</p>`).join("")
  return [
    "<!doctype html>",
    "<html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
    `<title>${escapeHtml(head.title)}</title><style>${STYLE}</style></head><body>`,
    `<header><h1>${escapeHtml(head.heading)}</h1>${notes}</header>`,
    body,
    `<script type="application/json" id="taskforce-evidence">${embedJson(dossierJson)}</script>`,
    "</body></html>",
  ].join("\n")
}
