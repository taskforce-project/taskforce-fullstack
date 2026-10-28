/**
 * Motifs des conditions de règles (contracts/README.md) : `*` = toute suite de caractères sauf `/`, `**` = toute
 * suite, `{a,b}` = une des alternatives (sans imbrication), tout autre caractère = lui-même. Le motif couvre la
 * valeur entière. Même définition côté serveur : les cas de contracts/rules/cases.json le prouvent.
 */

const cache = new Map<string, RegExp>();

function escapeLiteral(c: string): string {
  return /[\\^$.|?*+()[\]{}]/.test(c) ? `\\${c}` : c;
}

/** Traduit un motif sans accolades (une alternative) en expression régulière. */
function translate(pattern: string): string {
  let out = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern.charAt(i);
    if (c === "*") {
      if (pattern.charAt(i + 1) === "*") {
        out += ".*";
        i++;
      } else {
        out += "[^/]*";
      }
    } else {
      out += escapeLiteral(c);
    }
  }
  return out;
}

function compile(pattern: string): RegExp {
  let out = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern.charAt(i);
    if (c === "{") {
      const end = pattern.indexOf("}", i);
      if (end < 0) {
        out += escapeLiteral(c);
        continue;
      }
      const alternatives = pattern.slice(i + 1, end).split(",").map(translate);
      out += `(?:${alternatives.join("|")})`;
      i = end;
    } else if (c === "*") {
      if (pattern.charAt(i + 1) === "*") {
        out += ".*";
        i++;
      } else {
        out += "[^/]*";
      }
    } else {
      out += escapeLiteral(c);
    }
  }
  return new RegExp(`^${out}$`, "s");
}

export function globMatch(pattern: string, value: string): boolean {
  let re = cache.get(pattern);
  if (!re) {
    re = compile(pattern);
    cache.set(pattern, re);
  }
  return re.test(value);
}
