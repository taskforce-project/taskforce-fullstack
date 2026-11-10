#!/usr/bin/env node
/**
 * Un faux Claude Code pour éprouver la conversation du runner : il lit son brief sur l'entrée `stream-json`, écrit, attend
 * au besoin une correction, puis rend son résultat. Il ne se termine que quand l'entrée se ferme, comme le vrai.
 */
const emit = (line) => process.stdout.write(`${JSON.stringify(line)}\n`);
const resumeAt = process.argv.indexOf("--resume");
const resume = resumeAt >= 0 ? process.argv[resumeAt + 1] : null;

if (resume === "11111111-1111-4111-8111-111111111111") {
  emit({ type: "result", subtype: "error_during_execution", is_error: true, num_turns: 0, session_id: resume });
  process.stderr.write(`No conversation found with session ID: ${resume}\n`);
  process.exit(1);
}

const received = [];
let buffer = "";
let waiting = null;
const nextMessage = () => new Promise((resolve) => {
  if (received.length > 0) resolve(received.shift());
  else waiting = resolve;
});
let ended;
const closed = new Promise((resolve) => { ended = resolve; });
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";
  for (const line of lines) {
    if (!line.trim()) continue;
    const text = JSON.parse(line).message.content;
    if (waiting) { const resolve = waiting; waiting = null; resolve(text); } else received.push(text);
  }
});
process.stdin.on("end", () => ended());

const prompt = await nextMessage();
emit({ type: "system", subtype: "init", model: "fixture", claude_code_version: "fixture", session_id: "22222222-2222-4222-8222-222222222222" });
emit({ type: "assistant", message: { content: [{ type: "tool_use", id: "t1", name: "Write", input: { file_path: "a.txt", content: "x" } }] } });
emit({ type: "user", message: { content: [{ type: "tool_result", tool_use_id: "t1", content: "ok" }] } });

let heard = "nothing";
if (prompt.includes("wait-for-correction")) {
  heard = await nextMessage();
  emit({ type: "assistant", message: { content: [{ type: "text", text: "Correction read." }] } });
}
emit({
  type: "result", subtype: "success", is_error: false, num_turns: 1, total_cost_usd: 0,
  session_id: "22222222-2222-4222-8222-222222222222",
  result: `resume=${resume ?? "none"}; prompt=${prompt.slice(0, 60)}; heard=${heard}`,
});
// Comme Claude Code : il reste là tant que personne ne ferme son entrée.
await closed;
process.exit(0);
