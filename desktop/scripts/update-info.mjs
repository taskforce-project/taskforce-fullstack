/**
 * latest.yml d'electron-builder (Windows) après la signature de l'installeur : la signature change le fichier, donc son
 * empreinte sha512 et sa taille, que le programme de mise à jour vérifie avant d'installer.
 */
export function updateInfo(yaml, file, { sha512, size }) {
  if (!new RegExp(`^\\s*(- )?url: ${file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m").test(yaml)) {
    throw new Error(`${file} is not in latest.yml`);
  }
  return yaml
    .replace(/^(\s*sha512:\s*).*$/gm, (_, key) => `${key}${sha512}`)
    .replace(/^(\s+size:\s*)\d+\s*$/gm, (_, key) => `${key}${size}`);
}
