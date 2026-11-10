import { describe, expect, it } from "vitest"

import { looksLikeText, MAX_FILE_BYTES, readableName, readFiles } from "./composer-files"

const file = (name: string, content: string, size = content.length): File =>
  ({ name, size, text: () => Promise.resolve(content) }) as unknown as File

/** Ce que TaskForce sait lire d'un fichier (R134) : du texte, et rien d'autre. */
describe("the files of the composer", () => {
  it.each([
    ["notes.txt", true],
    ["README.md", true],
    ["data.CSV", true],
    ["app.log", true],
    ["config.json", true],
    ["main.tsx", true],
    ["script.py", true],
    ["Dockerfile", true],
    [".gitignore", true],
    ["report.pdf", false],
    ["photo.png", false],
    ["archive.zip", false],
    ["noextension", false],
  ])("%s is readable: %s", (name, readable) => {
    expect(readableName(name)).toBe(readable)
  })

  it.each([
    ["plain words", "Hello there", true],
    ["nothing at all", "", true],
    ["a null byte", "Hello\u0000there", false],
    ["mostly unreadable characters", "���abc", false],
    ["a stray unreadable character in a long text", `${"a".repeat(200)}�`, true],
  ])("%s", (_label, content, text) => {
    expect(looksLikeText(content)).toBe(text)
  })

  it("reads what it can, and names what it can't", async () => {
    const { accepted, refused, overflow } = await readFiles(
      [file("a.md", "alpha"), file("report.pdf", "x"), file("big.log", "y", MAX_FILE_BYTES + 1), file("bin.txt", "a\u0000b")],
      5,
    )

    expect(accepted.map((f) => [f.name, f.text])).toEqual([["a.md", "alpha"]])
    expect(refused).toEqual(["report.pdf", "big.log", "bin.txt"])
    expect(overflow).toBe(false)
  })

  it("keeps within the room left, and says so", async () => {
    const { accepted, overflow } = await readFiles([file("a.md", "a"), file("b.md", "b")], 1)

    expect(accepted.map((f) => f.name)).toEqual(["a.md"])
    expect(overflow).toBe(true)
  })

  it("does not join the same file twice", async () => {
    const have = [{ id: "f", name: "a.md", size: 1, text: "a" }]
    const { accepted, refused } = await readFiles([file("a.md", "a"), file("b.md", "b"), file("b.md", "b")], 4, have)

    expect(accepted.map((f) => f.name)).toEqual(["b.md"])
    expect(refused).toEqual([])
  })

  it("refuses a file the browser can't read", async () => {
    const broken = { name: "a.md", size: 1, text: () => Promise.reject(new Error("nope")) } as unknown as File

    await expect(readFiles([broken], 1)).resolves.toMatchObject({ accepted: [], refused: ["a.md"] })
  })
})
