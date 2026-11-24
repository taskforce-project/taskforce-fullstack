import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

/**
 * Le contraste d'un texte rendu, mesuré comme axe-core le mesure (WCAG 2.1, critère 1.4.3) : la couleur de ses classes
 * Tailwind, lue dans les tokens de `app/globals.css` pour le thème clair ou sombre, posée sur les fonds de ses parents
 * (`bg-*` au repos, `hover:bg-*` au survol). Un test peut ainsi dire « lisible dans les deux thèmes » des classes que le
 * composant rend vraiment. Les autres variantes que `hover:bg-*` (`dark:`, `group-hover:`), l'opacité (`opacity-*`) et
 * les dégradés ne sont pas lus.
 */

export type Theme = "light" | "dark"
export const THEMES: readonly Theme[] = ["light", "dark"]

type Rgb = readonly [number, number, number]
interface Paint { readonly rgb: Rgb; readonly alpha: number }

const CSS = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "../../app/globals.css"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")

/** Les propriétés des blocs de premier niveau d'un sélecteur, dans l'ordre du fichier : un bloc plus bas l'emporte. */
function properties(selector: string): Map<string, string> {
  const found = new Map<string, string>()
  for (const block of CSS.matchAll(new RegExp(`^${selector} \\{([^}]*)\\}`, "gm"))) {
    for (const declaration of (block[1] ?? "").matchAll(/--([\w-]+):\s*([^;]+);/g)) {
      found.set(declaration[1] ?? "", (declaration[2] ?? "").trim())
    }
  }
  return found
}

const ROOT = properties(":root")
const TOKENS: Readonly<Record<Theme, ReadonlyMap<string, string>>> = { light: ROOT, dark: new Map([...ROOT, ...properties("\\.dark")]) }
/** Le nom Tailwind d'une couleur : `--color-ink-green: var(--ink-green)`. */
const COLORS = properties("@theme inline")

/** La couleur Tailwind `name` dans un thème, si c'en est une : `ink-green`, puis `--ink-green`, puis `#2d6b45`. */
function themeColor(name: string, theme: Theme): Rgb | null {
  const token = /^var\(--([\w-]+)\)$/.exec(COLORS.get(`color-${name}`) ?? "")?.[1]
  if (token === undefined) return null
  const hex = /^#([0-9a-f]{6})$/i.exec(TOKENS[theme].get(token) ?? "")?.[1]
  if (hex === undefined) throw new Error(`--${token} is not a #rrggbb color in the ${theme} theme`)
  const value = Number.parseInt(hex, 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

/** La couleur que pose une classe d'un élément (`text-*`, `bg-*`, `hover:bg-*`), avec son opacité (`/70`). */
function paint(element: Element, prefix: "text" | "bg" | "hover:bg", theme: Theme): Paint | null {
  for (const name of element.classList) {
    const match = new RegExp(`^${prefix}-([a-z0-9-]+)(?:/(\\d+))?$`).exec(name)
    const color = match?.[1]
    const rgb = color === undefined ? null : themeColor(color, theme)
    const opacity = match?.[2]
    if (rgb) return { rgb, alpha: opacity === undefined ? 1 : Number(opacity) / 100 }
  }
  return null
}

/** Une couleur translucide posée sur une autre, comme le navigateur la compose (en sRGB). */
function over({ rgb, alpha }: Paint, below: Rgb): Rgb {
  const mix = (i: 0 | 1 | 2) => rgb[i] * alpha + below[i] * (1 - alpha)
  return [mix(0), mix(1), mix(2)]
}

const channel = (c: number) => (c / 255 <= 0.04045 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4)
const luminance = (rgb: Rgb) => 0.2126 * channel(rgb[0]) + 0.7152 * channel(rgb[1]) + 0.0722 * channel(rgb[2])

/** Le rapport de contraste de WCAG 2.1 entre deux couleurs opaques, de 1 à 21. */
function ratio(a: Rgb, b: Rgb): number {
  const [x, y] = [luminance(a), luminance(b)]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

/**
 * Le plus faible contraste du texte d'un élément dans un thème : sa couleur (la classe `text-*` la plus proche) sur chacun
 * des fonds de page donnés, sous les fonds de ses parents, au repos puis au survol.
 */
export function lowestContrast(element: Element, theme: Theme, pages: readonly string[] = ["background", "card"]): number {
  const chain: Element[] = []
  for (let node: Element | null = element; node; node = node.parentElement) chain.unshift(node)
  const text = chain.reduceRight<Paint | null>((found, node) => found ?? paint(node, "text", theme), null)
  if (!text) throw new Error(`no text color on "${element.textContent ?? ""}" or its parents`)

  let lowest = Number.POSITIVE_INFINITY
  for (const page of pages) {
    const base = themeColor(page, theme)
    if (!base) throw new Error(`no ${page} color in the ${theme} theme`)
    for (const hovered of [false, true]) {
      const surface = chain.reduce<Rgb>((below, node) => {
        const layer = (hovered ? paint(node, "hover:bg", theme) : null) ?? paint(node, "bg", theme)
        return layer ? over(layer, below) : below
      }, base)
      lowest = Math.min(lowest, ratio(over(text, surface), surface))
    }
  }
  return lowest
}
