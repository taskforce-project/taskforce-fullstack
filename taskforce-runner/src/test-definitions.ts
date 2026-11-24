/**
 * Ce qui dit comment les tests d'un projet tournent (R159, M5 ; second tour, L-b) : ses scripts et sa configuration de
 * build ou de test, à n'importe quelle profondeur, ce que la commande de test nomme, et ce que lancent les scripts de ses
 * `package.json`. Une branche qui en change un change ce que « les tests passent » veut dire : les tests qui ont tourné
 * sont ceux de cette branche, celle de l'agent. Le dossier nomme ce que le runner a trouvé et ce qui a changé. C'est une
 * liste de ce que TaskForce cherche : « aucun de ces fichiers n'a changé », jamais « les tests sont les mêmes ».
 */
const TEST_DEFINITIONS = [
  /(^|\/)package\.json$/,
  /(^|\/)(jest|vitest|vite|karma|playwright|cypress|ava|babel|nyc|c8)\.config\.([cm]?[jt]s|json)$/,
  /(^|\/)(vitest\.workspace|jest\.setup|vitest\.setup)\.[cm]?[jt]s$/,
  /(^|\/)\.(mocharc|nycrc|babelrc|c8rc)(\.[a-z]+)?$/,
  /(^|\/)(deno\.jsonc?|bunfig\.toml|turbo\.json|nx\.json|project\.json)$/,
  /(^|\/)pom\.xml$/,
  /(^|\/)(mvnw|mvnw\.cmd|gradlew|gradlew\.bat)$/,
  /(^|\/)(\.mvn|gradle)\//,
  /(^|\/)(build|settings)\.gradle(\.kts)?$/,
  /(^|\/)gradle\.properties$/,
  /(^|\/)(pyproject\.toml|setup\.py|setup\.cfg|tox\.ini|pytest\.ini|noxfile\.py|conftest\.py)$/,
  /(^|\/)(Rakefile|\.rspec)$/,
  /(^|\/)(composer\.json|phpunit\.xml|phpunit\.xml\.dist)$/,
  /(^|\/)Cargo\.toml$/,
  /(^|\/)(Makefile|makefile|GNUmakefile|justfile|Taskfile\.ya?ml)$/,
  /\.mk$/,
  /\.(csproj|fsproj|vbproj|sln)$/,
  /(^|\/)Directory\.Build\.(props|targets)$/,
  /(^|\/)(mix\.exs|build\.sbt)$/,
];

/** Au plus ce nombre de chemins au dossier, de chaque liste : le reste se lit dans le relevé des fichiers. */
const MAX_DEFINITIONS = 20;

/** Ce qu'une ligne de commande nomme comme fichier : un chemin, ou un script par son extension. */
function fileTokens(line: string): string[] {
  return line.split(/[\s;&|()<>"'`]+/)
    .filter((token) => /[\\/]/.test(token) || /\.(sh|bash|ps1|cmd|bat|py|js|mjs|cjs|ts|mts|cts|rb|pl)$/i.test(token))
    .map((token) => token.replaceAll("\\", "/").replace(/^\.\//, ""));
}

/** Un chemin relatif au dossier d'un `package.json`, ramené à la racine du dépôt ; null s'il en sort. */
function fromDir(dir: string, path: string): string | null {
  const parts = dir ? dir.split("/") : [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (parts.length === 0) return null;
      parts.pop();
    } else {
      parts.push(part);
    }
  }
  return parts.join("/");
}

/**
 * Les fichiers que lancent les scripts d'un `package.json` (`"test": "node scripts/run-tests.js"`), relatifs à la racine
 * du dépôt. `path` : le chemin du `package.json` ; `text` : son contenu. Un fichier illisible n'en nomme aucun.
 */
export function scriptFiles(path: string, text: string): string[] {
  let scripts: unknown;
  try {
    scripts = (JSON.parse(text) as { scripts?: unknown }).scripts;
  } catch {
    return [];
  }
  if (!scripts || typeof scripts !== "object") return [];
  const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
  return Object.values(scripts as Record<string, unknown>)
    .filter((line): line is string => typeof line === "string")
    .flatMap(fileTokens)
    .map((token) => fromDir(dir, token))
    .filter((token): token is string => token !== null && token !== "");
}

function named(command: string, scripts: readonly string[]): Set<string> {
  return new Set([...fileTokens(command), ...scripts]);
}

function isDefinition(path: string, names: ReadonlySet<string>): boolean {
  return names.has(path) || TEST_DEFINITIONS.some((pattern) => pattern.test(path));
}

/**
 * Ce que la branche change de la définition des tests : les fichiers de scripts et de configuration, ceux que la
 * commande de test nomme (`bash scripts/test.sh`), et ceux que lancent les scripts de `package.json` (`scripts`, tirés de
 * {@link scriptFiles}). Les tests eux-mêmes n'y sont pas : l'agent en écrit, c'est son travail.
 */
export function testDefinitions(paths: readonly string[], command: string, scripts: readonly string[] = []): string[] {
  const names = named(command, scripts);
  return paths.filter((path) => isDefinition(path, names)).slice(0, MAX_DEFINITIONS);
}

/** Les fichiers du dépôt qui disent comment ses tests tournent, tels que le runner les a trouvés : la liste qu'il a regardée. */
export function definitionFiles(files: readonly string[], command: string, scripts: readonly string[] = []): string[] {
  const names = named(command, scripts);
  return files.filter((path) => isDefinition(path, names)).slice(0, MAX_DEFINITIONS);
}
