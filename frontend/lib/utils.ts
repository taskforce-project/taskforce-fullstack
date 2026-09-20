import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// Densité (20/09) : les tokens `--spacing-control*` / `--spacing-row` de globals.css créent des utilitaires
// (h-control, size-control, min-w-control, h-row) que tailwind-merge ne connaît pas : son échelle `spacing`
// par défaut n'accepte que `px` et les nombres. Sans cette déclaration, un `h-10` passé par une page ne
// remplacerait plus le `h-control` par défaut d'un bouton - les deux classes survivraient et l'ordre du CSS
// trancherait. Les déclarer ici rend les overrides de page à nouveau déterministes.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      spacing: ["control", "control-sm", "control-lg", "row"],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
