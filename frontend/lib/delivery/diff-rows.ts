// ---------------------------------------------------------------------------
// Le diff d'un fichier, ligne par ligne (R139) : ce que le runner a relevé devient des lignes à afficher, chacune avec
// son numéro d'avant et d'après. Un commentaire se pose sur l'une d'elles.
// ---------------------------------------------------------------------------

export type DiffRowKind = "add" | "del" | "same"

/** Une ligne du diff. `key` : son côté et son numéro, là où un commentaire se pose. */
export interface DiffLine {
  readonly kind: DiffRowKind
  readonly key: string
  readonly oldLine: number | null
  readonly newLine: number | null
  readonly text: string
}

/** Entre deux blocs, des lignes que la mission n'a pas touchées. */
export interface DiffGap {
  readonly kind: "gap"
  readonly key: string
}

export type DiffRow = DiffLine | DiffGap

const HUNK = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/

/** Les lignes d'un patch (ses blocs `@@`). Une ligne qui ne se lit pas est ignorée plutôt que de décaler les numéros. */
export function diffRows(body: string): DiffRow[] {
  const rows: DiffRow[] = []
  let oldLine = 0
  let newLine = 0
  let inHunk = false
  let hunks = 0
  for (const raw of body.split("\n")) {
    const hunk = HUNK.exec(raw)
    if (hunk) {
      oldLine = Number(hunk[1])
      newLine = Number(hunk[2])
      inHunk = true
      // Le premier bloc n'a pas de « trou » au-dessus s'il commence à la première ligne.
      if (hunks > 0 || (oldLine > 1 && newLine > 1)) rows.push({ kind: "gap", key: `gap:${hunks}` })
      hunks++
      continue
    }
    if (!inHunk) continue
    const marker = raw.charAt(0)
    const text = raw.slice(1)
    if (marker === "+") {
      rows.push({ kind: "add", key: `new:${newLine}`, oldLine: null, newLine, text })
      newLine++
    } else if (marker === "-") {
      rows.push({ kind: "del", key: `old:${oldLine}`, oldLine, newLine: null, text })
      oldLine++
    } else if (marker === " ") {
      rows.push({ kind: "same", key: `new:${newLine}`, oldLine, newLine, text })
      oldLine++
      newLine++
    }
    // « \ No newline at end of file » : rien à montrer.
  }
  return rows
}

/** Le contenu d'un fichier d'un dossier jetable : toutes ses lignes sont écrites, il n'y a pas d'avant. */
export function textRows(body: string): DiffRow[] {
  const lines = body.split("\n")
  if (lines.at(-1) === "") lines.pop()
  return lines.map((text, index) => ({ kind: "same", key: `new:${index + 1}`, oldLine: null, newLine: index + 1, text }))
}

/** Le côté et le numéro d'une ligne, pour un commentaire : une ligne retirée se désigne par son numéro d'avant. */
export function commentTarget(row: DiffLine): { side: "new" | "old"; line: number } {
  return row.kind === "del" ? { side: "old", line: row.oldLine ?? 0 } : { side: "new", line: row.newLine ?? 0 }
}

/** `src/app/page.tsx` -> le dossier et le nom, pour montrer le nom d'abord. */
export function splitPath(path: string): { dir: string; name: string } {
  const at = path.lastIndexOf("/")
  return at < 0 ? { dir: "", name: path } : { dir: path.slice(0, at + 1), name: path.slice(at + 1) }
}
