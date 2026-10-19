// Assemble desktop/resources : ce que l'app embarque à côté d'Electron.
//   jre/       Java minimal (jlink), depuis JAVA_HOME (un JDK 21 avec ses jmods)
//   backend/   tf-api.jar, construit avant (mvn package dans backend/tf-api)
//   postgres/  PostgreSQL avec pgvector, depuis TF_POSTGRES_BUNDLE (archive ou dossier du workflow desktop-postgres)
//   frontend/  serveur Next autonome, construit avant en mode desktop (cf. desktop/README.md)
//   runner/    runner de Claude Code (taskforce-runner), construit avant (npm run build)
//
// Usage : node scripts/prepare-resources.mjs [jre] [backend] [postgres] [frontend] [runner]   (sans argument : tout)
import { execFileSync } from "node:child_process";
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const desktop = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repo = resolve(desktop, "..");
const out = join(desktop, "resources");
const wanted = process.argv.slice(2);
const step = (name) => wanted.length === 0 || wanted.includes(name);

// Modules Java du backend : ceux que jdeps trouve, plus ceux que l'analyse statique ne voit pas (JNDI de Tomcat,
// cryptographie EC du HTTPS, jeux de caractères, locales anglaise et française).
const JAVA_MODULES = [
  "java.base", "java.compiler", "java.desktop", "java.instrument", "java.net.http", "java.prefs", "java.rmi",
  "java.scripting", "java.security.jgss", "java.sql.rowset", "jdk.jfr", "jdk.management", "jdk.net", "jdk.unsupported",
  "java.naming", "jdk.crypto.ec", "jdk.charsets", "jdk.localedata", "jdk.zipfs",
];

function fail(message) {
  console.error(`prepare-resources: ${message}`);
  process.exit(1);
}

function size(dir) {
  return readdirSync(dir).reduce((total, name) => {
    const path = join(dir, name);
    // Les liens (bibliothèques de PostgreSQL sous Linux) comptent pour eux-mêmes, sans être suivis.
    const stat = lstatSync(path);
    return total + (stat.isDirectory() ? size(path) : stat.size);
  }, 0);
}

function report(name) {
  console.log(`  ${name.padEnd(9)} ${(size(join(out, name)) / 1024 / 1024).toFixed(1)} MB`);
}

mkdirSync(out, { recursive: true });

if (step("jre")) {
  const javaHome = process.env.JAVA_HOME;
  if (!javaHome || !existsSync(join(javaHome, "jmods"))) fail("JAVA_HOME must point to a JDK 21 with its jmods");
  rmSync(join(out, "jre"), { recursive: true, force: true });
  execFileSync(join(javaHome, "bin", process.platform === "win32" ? "jlink.exe" : "jlink"), [
    "--add-modules", JAVA_MODULES.join(","),
    "--include-locales=en,fr",
    "--strip-debug", "--no-man-pages", "--no-header-files",
    "--compress=zip-6",
    "--output", join(out, "jre"),
  ], { stdio: "inherit" });
  report("jre");
}

if (step("backend")) {
  const target = join(repo, "backend", "tf-api", "target");
  const jar = existsSync(target) && readdirSync(target).find((name) => /^tf-api-.*\.jar$/.test(name) && !name.endsWith("-plain.jar"));
  if (!jar) fail("backend/tf-api/target has no jar: run `mvn -DskipTests package` in backend/tf-api first");
  rmSync(join(out, "backend"), { recursive: true, force: true });
  mkdirSync(join(out, "backend"), { recursive: true });
  cpSync(join(target, jar), join(out, "backend", "tf-api.jar"));
  report("backend");
}

if (step("postgres")) {
  const bundle = process.env.TF_POSTGRES_BUNDLE;
  if (!bundle || !existsSync(bundle)) fail("TF_POSTGRES_BUNDLE must point to the PostgreSQL bundle (desktop-postgres workflow)");
  const dest = join(out, "postgres");
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  if (statSync(bundle).isDirectory()) cpSync(bundle, dest, { recursive: true, verbatimSymlinks: true });
  else if (bundle.endsWith(".zip")) {
    if (process.platform === "win32") {
      execFileSync("powershell.exe", ["-NoProfile", "-Command", `Expand-Archive -LiteralPath '${bundle}' -DestinationPath '${dest}' -Force`], { stdio: "inherit" });
    } else execFileSync("unzip", ["-q", bundle, "-d", dest], { stdio: "inherit" });
  } else execFileSync("tar", ["-xzf", bundle, "-C", dest], { stdio: "inherit" });
  if (!existsSync(join(dest, "bin"))) fail("the PostgreSQL bundle has no bin/ folder");
  report("postgres");
}

if (step("frontend")) {
  const next = join(repo, "frontend", ".next");
  const standalone = join(next, "standalone");
  if (!existsSync(join(standalone, "server.js"))) fail("frontend/.next/standalone is missing: build the frontend in desktop mode first");
  const dest = join(out, "frontend");
  rmSync(dest, { recursive: true, force: true });
  cpSync(standalone, dest, { recursive: true });
  // Le serveur autonome ne copie ni les fichiers statiques ni public/ : ils se placent à côté de lui.
  cpSync(join(next, "static"), join(dest, ".next", "static"), { recursive: true });
  if (existsSync(join(repo, "frontend", "public"))) cpSync(join(repo, "frontend", "public"), join(dest, "public"), { recursive: true });
  report("frontend");
}

if (step("runner")) {
  const runner = join(repo, "taskforce-runner");
  if (!existsSync(join(runner, "dist", "index.js"))) fail("taskforce-runner/dist is missing: run `npm run build` in taskforce-runner first");
  const dest = join(out, "runner");
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  cpSync(join(runner, "dist"), join(dest, "dist"), { recursive: true });
  cpSync(join(runner, "package.json"), join(dest, "package.json"));
  report("runner");
}
