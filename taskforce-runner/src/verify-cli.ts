import { readFileSync } from "node:fs";

import { verifyEvidence } from "./harness/verify.js";

/**
 * `npm run verify -- evidence-run-42.json [--key <sha256:... | fichier de clé publique>]` : vérifie un dossier de preuve
 * exporté, sans TaskForce ni réseau. La chaîne, l'en-tête, les textes, les règles rejugées, le sceau et le témoin ;
 * avec `--key`, que le sceau vient bien de la clé que l'exploitant publie. Sans elle, un sceau ne prouve que l'accord
 * du fichier avec la clé qu'il porte lui-même, que n'importe qui peut fabriquer : la première ligne le dit.
 */
const args = process.argv.slice(2);
const at = args.indexOf("--key");
const keyArg = at >= 0 ? args[at + 1] : undefined;
const file = args.find((arg, i) => !arg.startsWith("--") && (at < 0 || i !== at + 1));
if (!file || (at >= 0 && !keyArg)) {
  console.error("Usage: npm run verify -- <evidence-run-N.json> [--key <sha256:key id | public key file>]");
  process.exit(2);
}
let key: string | undefined;
if (keyArg !== undefined) {
  try {
    key = /^sha256:[0-9a-f]{64}$/.test(keyArg) ? keyArg : readFileSync(keyArg, "utf8");
  } catch {
    key = keyArg;
  }
}
const verdict = await verifyEvidence(readFileSync(file, "utf8"), key === undefined ? {} : { key });
(verdict.ok ? console.log : console.error)(verdict.message);
process.exit(verdict.ok ? 0 : 1);
