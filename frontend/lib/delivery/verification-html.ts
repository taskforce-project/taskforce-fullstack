import { FOLD, linkable, type Block, type Line, type Section } from "./verification-words"

/**
 * La page de vérification exportée avec son dossier (R212 : « elle s'exporte avec le dossier ») : un fichier HTML seul,
 * qui se lit sans TaskForce ni réseau, avec les mêmes rubriques et les mêmes mots que l'écran, et le dossier lui-même à
 * l'intérieur, tel qu'exporté, pour qu'un vérificateur le relise. Le fichier ne porte aucun code (sa politique de sécurité
 * n'en admet pas, R159 P6) : il dit ce que la page a trouvé quand elle l'a exporté, par quelle instance et quand, et qu'il
 * ne prouve rien tant qu'on n'a pas vérifié le dossier qu'il porte. Un fichier qui se vérifierait lui-même ne prouverait
 * rien non plus : qui réécrit le dossier réécrit aussi le script et son empreinte.
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

/** Aucun code, aucune ressource : les styles du fichier seulement (R159 P6). */
export const CONTENT_SECURITY_POLICY = "default-src 'none'; style-src 'unsafe-inline'"

const STYLE = [
  "body{font:15px/1.55 system-ui,-apple-system,Segoe UI,sans-serif;color:#1a1a1a;background:#fff;max-width:46rem;margin:2rem auto;padding:0 1rem}",
  "h1{font-size:1.3rem;margin:0 0 .25rem}h2{display:inline;font-size:1rem;margin:0}",
  "details.section{margin:1.25rem 0 .5rem;border-top:1px solid #ddd;padding-top:.5rem}details.section>summary{cursor:pointer;font-weight:600}",
  "p,li,summary{margin:.2rem 0;overflow-wrap:anywhere}.muted{color:#555;font-size:.9em}.warn{color:#8a4b00}.ok{color:#14532d}",
  ".agent{border-left:3px solid #999;padding-left:.6rem}.agent h3{font-size:.95em;margin:.5rem 0 .2rem}code{font-size:.9em}",
  "pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f6f6f6;padding:.6rem;font-size:.85em;border:1px solid #e5e5e5}",
  "header p{color:#444}a{color:#0b57d0;overflow-wrap:anywhere}ul{padding-left:1.2rem}",
  ".alert{border-left:4px solid #b91c1c;background:#fef2f2;padding:.5rem .75rem;margin:.5rem 0}header .alert p{color:#7f1d1d}.says{font-weight:600}",
  "@media (prefers-color-scheme:dark){body{background:#141414;color:#eee}.muted{color:#aaa}.warn{color:#f0b35a}.ok{color:#86efac}pre{background:#1f1f1f;border-color:#333}details.section{border-color:#333}header p{color:#bbb}a{color:#8ab4f8}.alert{background:#2a0f0f;border-color:#ef4444}header .alert p{color:#fca5a5}}",
].join("")

/** L'en-tête du fichier : ce qui a été vérifié à l'export, par qui et quand, la phrase, et à qui la page s'adresse. */
export interface ExportHead {
  readonly title: string
  readonly assembled: string
  readonly verdict: readonly Line[]
  /**
   * Un dossier changé après coup : l'alerte, son titre et ses lignes, puis les mots qui précèdent ce que dit le dossier
   * changé (R161 N1, R159 V1 de #552). Nulle pour un dossier qui tient.
   */
  readonly alert?: { readonly title: string; readonly lines: readonly Line[]; readonly says: string } | null
  readonly proves: string
  readonly sentence: string
  readonly notes: readonly string[]
  readonly howTo: string
  /** Le libellé d'une liste repliée, avec `{count}` : « Show all {count} files ». */
  readonly moreFiles: string
}

function lineText(line: Line): string {
  const text = escapeHtml(line.text)
  if (!line.link || !linkable(line.link)) return text
  const link = escapeHtml(line.link)
  return text.replace(link, `<a href="${link}">${link}</a>`)
}

function blocksHtml(blocks: readonly Block[]): string {
  const inline = (block: Block) => block.parts.map((part) => (part.code ? `<code>${escapeHtml(part.text)}</code>` : escapeHtml(part.text))).join("")
  const out: string[] = []
  let items: string[] = []
  const flush = () => {
    if (items.length > 0) out.push(`<ul>${items.join("")}</ul>`)
    items = []
  }
  for (const block of blocks) {
    if (block.kind === "item") {
      items.push(`<li>${inline(block)}</li>`)
      continue
    }
    flush()
    out.push(block.kind === "heading" ? `<h3>${inline(block)}</h3>` : `<p>${inline(block)}</p>`)
  }
  flush()
  return out.join("")
}

function lineHtml(line: Line, moreFiles: string): string {
  const cls = line.tone && line.tone !== "agent" ? ` class="${line.tone}"` : ""
  // Un long texte du dossier (la description, le brief) se replie sous sa ligne.
  if (line.body) return `<details><summary${cls}>${lineText(line)}</summary><pre>${escapeHtml(line.body)}</pre></details>`
  const parts = [`<p${cls}>${lineText(line)}</p>`]
  if (line.blocks) parts.push(`<div class="agent" data-agent="true">${blocksHtml(line.blocks)}</div>`)
  if (line.list) {
    parts.push(line.list.lines.slice(0, FOLD).map((l) => lineHtml(l, moreFiles)).join(""))
    const rest = line.list.lines.slice(FOLD)
    if (rest.length > 0) {
      const label = escapeHtml(moreFiles.replace("{count}", String(line.list.lines.length)))
      parts.push(`<details><summary class="muted">${label}</summary>${rest.map((l) => lineHtml(l, moreFiles)).join("")}</details>`)
    }
  }
  return parts.join("")
}

/**
 * Le fichier HTML de la page, son dossier à l'intérieur ; sans lui (`null`) pour une chaîne d'avant la 1.18, qui nomme les
 * personnes par leur courriel : seul un responsable de l'espace l'exporte (R159, second tour, N4).
 */
export function verificationHtml(head: ExportHead, sections: readonly Section[], dossierJson: string | null): string {
  const body = sections.map((section) => [
    `<details class="section" id="${section.id}" open><summary><h2>${escapeHtml(section.title)}</h2></summary>`,
    section.lines.map((line) => lineHtml(line, head.moreFiles)).join("\n"),
    "</details>",
  ].join("\n")).join("\n")
  const verdict = head.verdict.map((line) => lineHtml(line, head.moreFiles)).join("")
  const notes = head.notes.map((note) => `<p>${escapeHtml(note)}</p>`).join("")
  const alert = !head.alert ? ""
    : `<div class="alert" role="alert"><p><strong>${escapeHtml(head.alert.title)}</strong></p>`
      + `${head.alert.lines.map((line) => `<p>${escapeHtml(line.text)}</p>`).join("")}</div>`
  const says = !head.alert ? "" : `<p class="says">${escapeHtml(head.alert.says)}</p>`
  return [
    "<!doctype html>",
    "<html lang=\"en\"><head><meta charset=\"utf-8\">",
    `<meta http-equiv="Content-Security-Policy" content="${CONTENT_SECURITY_POLICY}">`,
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">",
    `<title>${escapeHtml(head.title)}</title><style>${STYLE}</style></head><body>`,
    `<header><h1>${escapeHtml(head.title)}</h1><p class="muted">${escapeHtml(head.assembled)}</p>${alert}${verdict}`
      + `<p class="warn">${escapeHtml(head.proves)}</p>${says}<p>${escapeHtml(head.sentence)}</p>${notes}</header>`,
    "<main>",
    body,
    `<section id="verify"><p class="muted">${escapeHtml(head.howTo)}</p></section>`,
    "</main>",
    ...(dossierJson === null ? [] : [`<script type="application/json" id="taskforce-evidence">${embedJson(dossierJson)}</script>`]),
    "</body></html>",
  ].join("\n")
}
