/**
 * Ce qui dit comment les tests d'un projet tournent (R159, M5) : ses scripts et sa configuration de build ou de test, à
 * n'importe quelle profondeur, et ce que la commande de test nomme. Une branche qui en change un change ce que « les tests
 * passent » veut dire : les tests qui ont tourné sont ceux de cette branche, celle de l'agent. Le dossier le note.
 */
const TEST_DEFINITIONS = [
  /(^|\/)package\.json$/,
  /(^|\/)(jest|vitest|vite|karma|playwright|cypress|ava|babel|nyc|c8)\.config\.[cm]?[jt]s$/,
  /(^|\/)\.(mocharc|nycrc|babelrc|c8rc)(\.[a-z]+)?$/,
  /(^|\/)(deno\.jsonc?|bunfig\.toml|turbo\.json|nx\.json|project\.json)$/,
  /(^|\/)pom\.xml$/,
  /(^|\/)(build|settings)\.gradle(\.kts)?$/,
  /(^|\/)gradle\.properties$/,
  /(^|\/)(pyproject\.toml|setup\.py|setup\.cfg|tox\.ini|pytest\.ini|noxfile\.py|conftest\.py)$/,
  /(^|\/)(Rakefile|\.rspec)$/,
  /(^|\/)(composer\.json|phpunit\.xml|phpunit\.xml\.dist)$/,
  /(^|\/)Cargo\.toml$/,
  /(^|\/)(Makefile|makefile|GNUmakefile|justfile|Taskfile\.ya?ml)$/,
  /\.(csproj|fsproj|vbproj|sln)$/,
  /(^|\/)Directory\.Build\.(props|targets)$/,
  /(^|\/)(mix\.exs|build\.sbt)$/,
];

/** Au plus ce nombre de chemins au dossier : le reste se lit dans le relevé des fichiers. */
const MAX_DEFINITIONS = 20;

/**
 * Ce que la branche change de la définition des tests : les fichiers de scripts et de configuration, et ceux que la
 * commande de test nomme (`bash scripts/test.sh`). Les tests eux-mêmes n'y sont pas : l'agent en écrit, c'est son travail.
 */
export function testDefinitions(paths: readonly string[], command: string): string[] {
  const named = new Set(command.split(/[\s;&|()<>"'`]+/)
    .filter((token) => /[\\/]/.test(token) || /\.(sh|bash|ps1|cmd|bat|py|js|mjs|cjs|ts|rb|pl)$/i.test(token))
    .map((token) => token.replaceAll("\\", "/").replace(/^\.\//, "")));
  return paths.filter((path) => named.has(path) || TEST_DEFINITIONS.some((pattern) => pattern.test(path)))
    .slice(0, MAX_DEFINITIONS);
}
