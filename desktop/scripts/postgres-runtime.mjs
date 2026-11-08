// La runtime Visual C++ du PostgreSQL embarqué, sous Windows. Les binaires d'EnterpriseDB et pgvector sont liés à cette
// runtime de Microsoft, que Windows ne garantit pas : sur un PC qui ne l'a jamais reçue, aucun outil de PostgreSQL ne se
// charge (0xC0000135) et l'app s'arrête juste après la connexion, à la création de sa base. Ses DLL vont donc à côté de
// postgres.exe, là où Windows les cherche d'abord, dans l'installeur comme dans le paquet du Store.
//
// La liste n'est pas écrite ici : elle se lit dans les tables d'import de tout ce que contient le bundle, DLL copiées
// comprises (msvcp140.dll importe vcruntime140.dll). Microsoft demande une runtime au moins aussi récente que les outils
// de compilation du plus récent des binaires : la version de chaque DLL est comparée à celle de leur éditeur de liens. Une
// DLL absente ou trop ancienne arrête la construction en la nommant.
//
// Elles viennent du dossier de redistribution de Visual Studio sur la machine de construction, celui que sa licence
// permet de livrer avec un programme. Le Java embarqué en apporte les mêmes noms, mais plus anciens : 14.40, pour des
// binaires de PostgreSQL liés en 14.44. Il ne sert que s'il est assez récent.
//
// Usage : node scripts/postgres-runtime.mjs <dossier postgres> <dossier bin du Java embarqué> [--check]
//   --check : dit ce qu'il faudrait copier, sans rien copier.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Les DLL de la runtime Visual C++. `msvcrt.dll`, sans numéro, fait partie de Windows. */
const VC_RUNTIME = /^(vcruntime|msvc[pr]|concrt|vccorlib|vcomp|vcamp|mfcm?)\d[^\\/]*\.dll$/i;

/** En-tête PE d'un binaire : où sont l'en-tête optionnel, les répertoires de données et les sections. */
function peHeader(file) {
  if (file.length < 0x40 || file.readUInt16LE(0) !== 0x5a4d) throw new Error("not a PE file");
  const header = file.readUInt32LE(0x3c);
  if (file.readUInt32LE(header) !== 0x00004550) throw new Error("not a PE file");
  const optional = header + 24;
  // PE32+ (64 bits) : les répertoires de données sont 16 octets plus loin qu'en PE32.
  const directories = optional + (file.readUInt16LE(optional) === 0x20b ? 112 : 96);
  const firstSection = optional + file.readUInt16LE(header + 20);
  const sections = [];
  for (let index = 0; index < file.readUInt16LE(header + 6); index++) {
    const section = firstSection + index * 40;
    sections.push({
      start: file.readUInt32LE(section + 12),
      size: Math.max(file.readUInt32LE(section + 8), file.readUInt32LE(section + 16)),
      raw: file.readUInt32LE(section + 20),
    });
  }
  return { optional, directories, sections };
}

/** Les DLL qu'importe un binaire, table d'import et imports différés compris, en minuscules. */
export function peImports(file) {
  const { directories, sections } = peHeader(file);
  const offset = (rva) => {
    const section = sections.find(({ start, size }) => rva >= start && rva < start + size);
    if (!section) throw new Error(`address ${rva} is in no section`);
    return rva - section.start + section.raw;
  };
  const nameAt = (rva) => {
    const start = offset(rva);
    return file.toString("latin1", start, file.indexOf(0, start)).toLowerCase();
  };
  const names = new Set();
  const read = (directory, entrySize, nameField) => {
    const rva = file.readUInt32LE(directories + directory * 8);
    if (rva === 0) return;
    for (let entry = offset(rva); file.readUInt32LE(entry + nameField) !== 0; entry += entrySize) {
      names.add(nameAt(file.readUInt32LE(entry + nameField)));
    }
  };
  read(1, 20, 12); // IMAGE_IMPORT_DESCRIPTOR.Name
  read(13, 32, 4); // IMAGE_DELAYLOAD_DESCRIPTOR.DllNameRVA
  return [...names];
}

/** Version de l'éditeur de liens qui a produit le binaire, celle des outils de compilation : [14, 44]. */
export function linkerVersion(file) {
  const { optional } = peHeader(file);
  return [file.readUInt8(optional + 2), file.readUInt8(optional + 3)];
}

/** Version d'un fichier, lue dans sa ressource VS_FIXEDFILEINFO : [14, 44, 35211, 0], `null` s'il n'en a pas. */
export function fileVersion(file) {
  const signature = file.indexOf(Buffer.from([0xbd, 0x04, 0xef, 0xfe]));
  if (signature < 0) return null;
  const high = file.readUInt32LE(signature + 8);
  const low = file.readUInt32LE(signature + 12);
  return [high >>> 16, high & 0xffff, low >>> 16, low & 0xffff];
}

/** La première version est-elle au moins la seconde ? */
function atLeast(version, minimum) {
  for (let index = 0; index < minimum.length; index++) {
    if (version[index] !== minimum[index]) return version[index] > minimum[index];
  }
  return true;
}

/** Tous les .exe et .dll d'un dossier, sous-dossiers compris. */
function binaries(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return binaries(path);
    return /\.(exe|dll)$/i.test(entry.name) ? [path] : [];
  });
}

const fileName = (path) => path.split(/[\\/]/).pop();

/** Les dossiers de redistribution de la runtime de Visual Studio sur cette machine, le plus récent d'abord. */
export function visualStudioRuntimeFolders() {
  const vswhere = join(process.env["ProgramFiles(x86)"] ?? "C:\\Program Files (x86)", "Microsoft Visual Studio", "Installer", "vswhere.exe");
  if (!existsSync(vswhere)) return [];
  const folders = [];
  for (const install of execFileSync(vswhere, ["-products", "*", "-property", "installationPath"], { encoding: "utf8" }).split(/\r?\n/).filter(Boolean)) {
    const redist = join(install, "VC", "Redist", "MSVC");
    if (!existsSync(redist)) continue;
    for (const version of readdirSync(redist).filter((name) => /^\d+\.\d+\.\d+$/.test(name))) {
      const x64 = join(redist, version, "x64");
      if (!existsSync(x64)) continue;
      for (const crt of readdirSync(x64).filter((name) => /^Microsoft\.VC\d+\.CRT$/.test(name))) {
        folders.push({ version: version.split(".").map(Number), path: join(x64, crt) });
      }
    }
  }
  return folders.sort((a, b) => (atLeast(a.version, b.version) ? -1 : 1)).map(({ path }) => path);
}

/** D'où peut venir la runtime, dans l'ordre : Visual Studio, s'il est sur la machine, puis le Java embarqué. */
export const runtimeSources = (javaBin) => [...visualStudioRuntimeFolders(), javaBin];

/** DLL de la runtime qu'importent ces binaires, avec ce qui les importe, et la version minimale qu'elles doivent avoir. */
function runtimeImports(paths) {
  const importers = new Map();
  let minimum = [14, 0];
  for (const path of paths) {
    const file = readFileSync(path);
    const imported = peImports(file).filter((name) => VC_RUNTIME.test(name));
    for (const name of imported) importers.set(name, [...(importers.get(name) ?? []), fileName(path)]);
    const linker = linkerVersion(file);
    if (imported.length > 0 && linker[0] === 14 && atLeast(linker, minimum)) minimum = linker;
  }
  return { importers, minimum };
}

/** Les DLL à apporter depuis ce dossier, DLL qu'elles importent elles-mêmes comprises : ce qui manque, ce qui est trop ancien. */
function fromSource(source, importers, minimum, present) {
  const files = new Map(existsSync(source) ? readdirSync(source).map((name) => [name.toLowerCase(), name]) : []);
  const chosen = new Map();
  const problems = [];
  const queue = [...importers.keys()];
  for (let next = 0; next < queue.length; next++) {
    const name = queue[next];
    if (chosen.has(name) || present.has(name)) continue;
    if (!files.has(name)) {
      problems.push(`${name} is missing (imported by ${(importers.get(name) ?? ["another DLL of the runtime"]).join(", ")})`);
      continue;
    }
    const path = join(source, files.get(name));
    const file = readFileSync(path);
    const version = fileVersion(file);
    if (!version || !atLeast(version, minimum)) {
      problems.push(`${name} is ${version?.join(".") ?? "without a version"}, older than the toolset ${minimum.join(".")} of the binaries that import it`);
      continue;
    }
    chosen.set(name, { path, version: version.join(".") });
    for (const imported of peImports(file).filter((dependency) => VC_RUNTIME.test(dependency))) queue.push(imported);
  }
  return { chosen, problems };
}

/**
 * La runtime que les binaires du bundle importent et que `bin` n'a pas, copiée depuis le premier dossier qui l'a toute à
 * une version suffisante (rien n'est copié avec `check`). Une seule source, pour ne pas mélanger des versions. Rend les DLL
 * nécessaires, celles copiées avec leur version, la source retenue, ou les problèmes de chaque source.
 */
export function bundleVisualCppRuntime(postgresDir, sources, { check = false } = {}) {
  const bin = join(postgresDir, "bin");
  const present = new Set(readdirSync(bin).map((name) => name.toLowerCase()));
  const { importers, minimum } = runtimeImports([...binaries(bin), ...binaries(join(postgresDir, "lib"))]);
  const needed = [...importers.keys()].sort();
  const refused = [];
  for (const source of sources) {
    const { chosen, problems } = fromSource(source, importers, minimum, present);
    if (problems.length > 0) {
      refused.push(`${source}: ${problems.join("; ")}`);
      continue;
    }
    if (!check) for (const [name, { path }] of chosen) copyFileSync(path, join(bin, name));
    const copied = [...chosen].map(([name, { version }]) => ({ name, version })).sort((a, b) => a.name.localeCompare(b.name));
    return { needed, minimum: minimum.join("."), source, copied, refused };
  }
  return { needed, minimum: minimum.join("."), source: null, copied: [], refused };
}

/**
 * Pour la construction : copie la runtime, ou arrête tout en nommant chaque DLL absente ou trop ancienne. Un bundle sans
 * elle marcherait sur la machine de construction et sur la plupart des postes, pas sur un PC neuf.
 */
export function requireVisualCppRuntime(postgresDir, sources) {
  const result = bundleVisualCppRuntime(postgresDir, sources);
  if (result.source === null) {
    throw new Error(`no folder has the Visual C++ runtime PostgreSQL needs (${result.needed.join(", ")}): ${result.refused.join(" | ")}`);
  }
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [postgresDir, javaBin, flag] = process.argv.slice(2);
  if (!postgresDir || !javaBin) {
    console.error("Usage: node postgres-runtime.mjs <postgres dir> <java bin dir> [--check]");
    process.exit(1);
  }
  try {
    const sources = runtimeSources(javaBin);
    console.log(JSON.stringify(flag === "--check" ? bundleVisualCppRuntime(postgresDir, sources, { check: true }) : requireVisualCppRuntime(postgresDir, sources)));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
