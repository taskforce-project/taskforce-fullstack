import { describe, expect, it } from "vitest";

import { familyLine, fitLine, gigabytes, nameWords, spillsVisibly } from "./model-description";
import type { BenchmarkModelFacts } from "@/lib/api/model-benchmark-service";
import { CONSTANTS_EN } from "@/lib/constants_en";

const t = CONSTANTS_EN.benchmark.about;
const FACTS: BenchmarkModelFacts = {
  family: "qwen3", parameters: "14.8B", diskBytes: 9_276_198_565, contextWindow: 40960, tools: true, chat: true,
  memoryBytes: null, gpuBytes: null, loadProblem: null,
};

/** Ce qu'est un modèle, en mots (R142) : le glossaire de son nom, ce qu'Ollama rapporte, rien d'inventé. */
describe("model-description", () => {
  it.each([
    ["qwen2.5-coder:7b-base", ["coder", "7b", "base"]],
    ["qwen2.5-coder:3b-base", ["coder", "3b", "base"]],
    ["qwen2.5:7b-instruct", ["7b", "instruct"]],
    ["qwen2.5:14b-instruct", ["14b", "instruct"]],
    ["qwen3:8b", ["8b"]],
    ["qwen3.5:9b", ["9b"]],
    ["bge-m3:latest", []],
    ["org/llama3:70b-chat", ["70b", "chat"]],
    ["all-minilm:567m", ["567m"]],
    ["mystery", []],
  ])("%s: the words the glossary knows, in the order of the name", (model, words) => {
    expect(nameWords(model, t).map((item) => item.word)).toEqual(words);
  });

  it("says what each word means, in plain words", () => {
    const byWord = Object.fromEntries(nameWords("qwen2.5-coder:7b-base", t).map((item) => [item.word, item.meaning]));
    expect(byWord.base).toBe("raw model that completes text, not trained to converse");
    expect(byWord.coder).toBe("specialised in code");
    expect(byWord["7b"]).toBe("about 7 billion parameters: more is usually better, and slower");
    expect(nameWords("qwen2.5:7b-instruct", t)[1].meaning).toBe("trained to follow instructions");
    expect(nameWords("all-minilm:567m", t)[0].meaning).toBe("about 567 million parameters: small and fast");
  });

  it("doesn't take the internal words of the glossary for words of a name", () => {
    expect(nameWords("size:sizeMillion", t)).toEqual([]);
  });

  it.each([
    [FACTS, "qwen3 family, 14.8 billion parameters."],
    [{ ...FACTS, parameters: "567.75M" }, "qwen3 family, 567.75 million parameters."],
    [{ ...FACTS, parameters: "a lot" }, "qwen3 family, a lot parameters."],
    [{ ...FACTS, parameters: null }, "qwen3 family."],
    [{ ...FACTS, family: null }, null],
  ])("names the family and the size when Ollama says them", (facts, expected) => {
    expect(familyLine(facts, t)).toBe(expected);
  });

  it("writes sizes as Ollama shows them", () => {
    expect(gigabytes(9_276_198_565)).toBe("9.3 GB");
    expect(gigabytes(5_034_517_461)).toBe("5.0 GB");
  });

  it.each([
    ["all of it on the card", 5.03e9, 5.03e9, "Fits on your graphics card (5.0 GB)."],
    ["most of it on the card", 10.95e9, 6.12e9, "10.9 GB, your graphics card holds 6.1 GB: the rest runs on the processor."],
    ["less than half on the card", 12e9, 4e9, "12.0 GB, your graphics card holds 4.0 GB: most of it runs on the processor."],
    ["none of it on a card", 8e9, 0, "8.0 GB, all of it on the processor."],
  ])("%s: what its last load showed", (_title, memory, gpu, expected) => {
    expect(fitLine({ ...FACTS, memoryBytes: memory, gpuBytes: gpu }, t)).toBe(expected);
  });

  it("says nothing of the graphics card before a first load", () => {
    expect(fitLine(FACTS, t)).toBeNull();
    expect(fitLine({ ...FACTS, memoryBytes: 0, gpuBytes: 0 }, t)).toBeNull();
  });

  it.each([
    ["all of it on the card", 5.03e9, 5.03e9, false],
    ["a small part on the processor", 6.74e9, 6.17e9, false],
    ["a real part on the processor", 10.95e9, 6.12e9, true],
    ["never loaded", null, null, false],
  ])("%s: whether its row says so", (_title, memory, gpu, expected) => {
    expect(spillsVisibly({ ...FACTS, memoryBytes: memory, gpuBytes: gpu })).toBe(expected);
  });
});
