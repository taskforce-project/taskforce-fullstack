// Ce que partagent les scripts des visuels : dossiers, police, peintures du site, captures et tracé du logo.
import { mkdirSync, readdirSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const ROOT = resolve(import.meta.dirname, "..");
const REPO = resolve(ROOT, "../../..");
/** Les images de l'e-mail, servies par le site sur taskforce-project.fr/email/2026-10-desktop-launch/. */
export const OUT = join(REPO, "landing-page/public/email/2026-10-desktop-launch");
/** Fichiers de travail (pages rendues, images intermédiaires), effacés à chaque rendu. */
export const WORK = join(ROOT, ".work");

/** Vide un dossier de travail (sans le supprimer : Windows refuse si un terminal y est ouvert), ou le crée. */
export function clean(dir) {
  mkdirSync(dir, { recursive: true });
  for (const entry of readdirSync(dir)) rmSync(join(dir, entry), { recursive: true, force: true });
}

export const url = (file) => pathToFileURL(file).href;
/** Capture de l'interface desktop (captures/<nom>.webp, 1440 x 900 px CSS, à 2x). */
export const capture = (name) => url(join(ROOT, "captures", `${name}.webp`));
/** Peinture du site (landing-page/public/images), celle de la page dont elle porte le nom. */
export const painting = (name) => url(join(REPO, "landing-page/public/images", `bg-${name}-1920.webp`));
/** Geist, la police du site (paquet @fontsource-variable/geist, licence SIL OFL), chargée en local : rendu stable. */
export const GEIST = url(join(ROOT, "node_modules/@fontsource-variable/geist/files/geist-latin-wght-normal.woff2"));

/** Tracé du logo, le même que landing-page/src/components/site/Logo.astro : trois barres, une par sous-tracé. */
export const LOGO_PATH =
  "M 295.302 130.180 C 288.367 131.232, 281.321 133.995, 275.687 137.871 C 270.921 141.151, 235.210 178.670, 233.593 182.096 C 231.969 185.539, 233.936 185.455, 240.778 181.788 C 244.475 179.807, 250.650 177.160, 254.500 175.906 C 261.252 173.706, 263.165 173.603, 308.500 173.007 C 358.807 172.345, 357.172 172.511, 368.097 166.959 C 373.525 164.200, 404 134.371, 404 131.817 C 404 130.817, 403.663 129.927, 403.250 129.837 C 400.447 129.230, 299.451 129.550, 295.302 130.180 M 268.500 185.116 C 260.296 186.308, 251.710 189.336, 245.826 193.111 C 240.552 196.496, 208 229.691, 208 231.685 C 208 234.229, 210.489 233.990, 224.753 230.080 C 232.864 227.857, 242.650 225.589, 246.500 225.039 C 250.350 224.489, 272.077 224.031, 294.782 224.020 C 348.983 223.994, 345.904 224.948, 368.630 201.140 C 375.433 194.012, 381 187.513, 381 186.697 C 381 185.881, 380.288 184.941, 379.418 184.607 C 376.966 183.666, 275.264 184.133, 268.500 185.116 M 245.798 237.923 C 242.661 238.930, 238.088 240.930, 235.635 242.368 C 231.238 244.945, 209.192 267.489, 205.744 272.935 C 202.511 278.042, 203.673 278.223, 236.710 277.771 C 269.622 277.321, 270.882 277.112, 280.500 270.516 C 286.603 266.331, 310.500 240.602, 310.500 238.216 C 310.500 236.638, 308.128 236.484, 281 236.296 C 254.795 236.115, 250.863 236.297, 245.798 237.923";
/** Cadre du tracé du logo (viewBox SVG). */
export const LOGO_VIEWBOX = "200 124 210 160";
