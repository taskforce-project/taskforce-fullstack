import { describe, expect, it } from "vitest"

import { commentTarget, diffRows, splitPath, textRows, type DiffLine } from "./diff-rows"

const lines = (body: string): DiffLine[] => diffRows(body).filter((row): row is DiffLine => row.kind !== "gap")

describe("diffRows", () => {
  it("numbers each line on both sides", () => {
    const body = "@@ -1,3 +1,4 @@\n one\n-two\n+TWO\n three\n+four"
    expect(lines(body).map((r) => [r.kind, r.oldLine, r.newLine, r.text])).toEqual([
      ["same", 1, 1, "one"],
      ["del", 2, null, "two"],
      ["add", null, 2, "TWO"],
      ["same", 3, 3, "three"],
      ["add", null, 4, "four"],
    ])
  })

  it("marks the unchanged lines between two blocks, and above a block that does not start the file", () => {
    const rows = diffRows("@@ -10,1 +10,1 @@\n-a\n+b\n@@ -40 +40 @@ a heading\n x")
    expect(rows.map((r) => r.kind)).toEqual(["gap", "del", "add", "gap", "same"])
    expect((rows[4] as DiffLine).oldLine).toBe(40)
  })

  it("has no gap above a block that starts at the first line", () => {
    expect(diffRows("@@ -1 +1 @@\n x")[0]?.kind).toBe("same")
  })

  it("ignores the 'no newline' marker without shifting the numbers", () => {
    const rows = lines("@@ -1 +1,2 @@\n-a\n\\ No newline at end of file\n+a\n+b")
    expect(rows.map((r) => r.text)).toEqual(["a", "a", "b"])
    expect(rows[2]?.newLine).toBe(2)
  })

  it("ignores anything before the first block", () => {
    expect(diffRows("garbage\nmore\n@@ -1 +1 @@\n x").map((r) => r.kind)).toEqual(["same"])
  })

  it("keeps a content line that looks like a marker", () => {
    expect(lines("@@ -1 +1 @@\n-@@ fake\n+--- b")[1]?.text).toBe("--- b")
  })

  it("gives every line a distinct key per side, so a comment lands on one line", () => {
    const keys = lines("@@ -1,2 +1,2 @@\n-a\n+a2\n b").map((r) => r.key)
    expect(keys).toEqual(["old:1", "new:1", "new:2"])
  })
})

describe("textRows", () => {
  it("numbers the lines of a scratch file, without a phantom line at the end", () => {
    expect(textRows("a\nb\n").map((r) => (r as DiffLine).newLine)).toEqual([1, 2])
    expect(textRows("a").map((r) => (r as DiffLine).text)).toEqual(["a"])
  })
})

describe("commentTarget", () => {
  it.each([
    ["add", null, 4, { side: "new", line: 4 }],
    ["same", 3, 4, { side: "new", line: 4 }],
    ["del", 3, null, { side: "old", line: 3 }],
  ] as const)("a %s line", (kind, oldLine, newLine, expected) => {
    expect(commentTarget({ kind, key: "k", oldLine, newLine, text: "" })).toEqual(expected)
  })
})

describe("splitPath", () => {
  it.each([
    ["src/app/page.tsx", "src/app/", "page.tsx"],
    ["README.md", "", "README.md"],
  ])("%s", (path, dir, name) => {
    expect(splitPath(path)).toEqual({ dir, name })
  })
})
