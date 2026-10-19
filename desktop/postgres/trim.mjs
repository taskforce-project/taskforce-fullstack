// Copies a full PostgreSQL installation into the bundle shipped with the desktop app, keeping only what the app runs:
// the server, initdb and pg_ctl, pg_dump and pg_restore for backups, psql for support, the libraries they load, and
// the extensions the migrations create (plpgsql, uuid-ossp, vector).
//
// Usage: node desktop/postgres/trim.mjs <postgres install dir> <bundle dir>
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const [src, dest] = process.argv.slice(2);
if (!src || !dest) {
  console.error("Usage: node trim.mjs <postgres install dir> <bundle dir>");
  process.exit(1);
}

const windows = existsSync(join(src, "bin", "postgres.exe"));
const exe = (name) => (windows ? `${name}.exe` : name);
const TOOLS = ["postgres", "initdb", "pg_ctl", "pg_dump", "pg_restore", "psql"].map(exe);
const EXTENSIONS = ["plpgsql", "uuid-ossp", "vector"];

rmSync(dest, { recursive: true, force: true });
mkdirSync(join(dest, "bin"), { recursive: true });

// bin: the tools, and on Windows the DLLs they load, which live next to them. The wxWidgets DLLs belong to pgAdmin.
for (const name of readdirSync(join(src, "bin"))) {
  const keep = TOOLS.includes(name) || (windows && name.toLowerCase().endsWith(".dll") && !name.startsWith("wx"));
  if (keep) cpSync(join(src, "bin", name), join(dest, "bin", name));
}

// lib: shared libraries and server modules; build-time files (import libraries, pgxs, pkgconfig) stay out.
// On Linux, a library is a chain of links (libpq.so -> libpq.so.5 -> libpq.so.5.18): they are copied as they are,
// relative. By default cpSync rewrites them as absolute links to the build folder, which no other machine has.
const SKIP_LIB = (name) => name.endsWith(".lib") || name.endsWith(".a") || name.endsWith(".pdb") || ["pgxs", "pkgconfig"].includes(name);
for (const name of readdirSync(join(src, "lib"))) {
  if (!SKIP_LIB(name)) cpSync(join(src, "lib", name), join(dest, "lib", name), { recursive: true, verbatimSymlinks: true });
}

// share: everything initdb and the server read, without translations or docs, and only our extensions.
for (const name of readdirSync(join(src, "share"))) {
  if (["doc", "locale", "man"].includes(name)) continue;
  if (name === "extension") {
    mkdirSync(join(dest, "share", "extension"), { recursive: true });
    for (const file of readdirSync(join(src, "share", "extension"))) {
      if (EXTENSIONS.some((ext) => file === `${ext}.control` || file.startsWith(`${ext}--`))) {
        cpSync(join(src, "share", "extension", file), join(dest, "share", "extension", file));
      }
    }
    continue;
  }
  cpSync(join(src, "share", name), join(dest, "share", name), { recursive: true, verbatimSymlinks: true });
}

for (const ext of EXTENSIONS) {
  if (!existsSync(join(dest, "share", "extension", `${ext}.control`))) {
    console.error(`Missing extension in the bundle: ${ext}`);
    process.exit(1);
  }
}

const size = (dir) => readdirSync(dir).reduce((total, name) => {
  const path = join(dir, name);
  const stat = lstatSync(path);
  return total + (stat.isDirectory() ? size(path) : stat.size);
}, 0);
console.log(`PostgreSQL bundle in ${dest}: ${(size(dest) / 1024 / 1024).toFixed(1)} MB`);
