import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { cut, cutEnd } from "../src/text.js";

/**
 * R159 de #551, L4 : le brief était tronqué à 200 000 unités sans marque, et la coupe pouvait fendre une paire de
 * substitution, que le serveur change en U+FFFD.
 */

describe("L4. une coupe se dit, et ne fend jamais une paire", () => {
  it("le début gardé : la marque dit la longueur entière, la coupe tombe entre deux caractères", () => {
    const text = `${"a".repeat(9)}😀${"b".repeat(100)}`;
    assert.equal(cut(text, 200), text);
    const short = cut(text, 10 + "\n[TaskForce cut this text here: 110 characters in all]".length);
    assert.equal(short, "aaaaaaaaa\n[TaskForce cut this text here: 110 characters in all]");
    assert.ok(!/[\ud800-\udbff](?![\udc00-\udfff])/.test(short), short);
    assert.ok(cut("x".repeat(500), 100).length <= 100);
  });

  it("la fin gardée : la marque en tête, jamais une moitié basse au début", () => {
    const text = `${"a".repeat(100)}😀${"b".repeat(9)}`;
    const end = cutEnd(text, "[TaskForce cut the start of this text] ".length + 10);
    assert.equal(end, "[TaskForce cut the start of this text] bbbbbbbbb");
    assert.ok(!/(^|[^\ud800-\udbff])[\udc00-\udfff]/.test(end), end);
  });
});
