import { readFileSync } from "node:fs";

import { verifyEvidence } from "./harness/verify.js";

/** `npm run verify -- evidence-run-42.json` : vérifie un dossier de preuve exporté, sans TaskForce ni réseau. */
const file = process.argv[2];
if (!file) {
  console.error("Usage: npm run verify -- <evidence-run-N.json>");
  process.exit(2);
}
const verdict = verifyEvidence(readFileSync(file, "utf8"));
(verdict.ok ? console.log : console.error)(verdict.message);
process.exit(verdict.ok ? 0 : 1);
