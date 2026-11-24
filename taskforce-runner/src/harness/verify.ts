import { bundleDigest, type RulesBundle } from "./engine/rules-engine.js";

/**
 * Ce que le runner vérifie avec les empreintes du moteur de règles (celui du serveur, compilé en JavaScript :
 * engine/rules-engine.js) : le paquet de règles qui vient avec une tâche, et un dossier de preuve exporté. Le second
 * vit dans `verifier/`, sans rien de Node, pour que l'app le partage (`npm run share:app`).
 */
export { verifyEvidence, type Verdict, type VerifyOptions } from "./verifier/verify.js";

/**
 * Le paquet reçu du serveur, s'il est bien formé et que son empreinte tient ; sinon une erreur : pas de mission sans
 * règles. Il est rendu sans ses membres nuls, comme l'empreinte le lit : le moteur ne voit que ce qui a été signé.
 */
export function verifiedBundle(value: unknown): RulesBundle {
  const bundle = value as RulesBundle | null;
  if (!bundle || bundle.format !== "taskforce-rules/1" || !Array.isArray(bundle.rules)) {
    throw new Error("No valid rules came with the task: the mission does not start without rules.");
  }
  if (!bundle.digest || bundleDigest(bundle) !== bundle.digest) {
    throw new Error("The rules that came with the task do not match their digest: the mission does not start.");
  }
  return JSON.parse(JSON.stringify(bundle, (_key, v: unknown) => (v === null ? undefined : v))) as RulesBundle;
}
