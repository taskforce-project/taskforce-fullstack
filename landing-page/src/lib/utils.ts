import { clsx, type ClassValue } from "clsx"
import { extendTailwindMerge } from "tailwind-merge"

// Les tokens `--spacing-control*` de global.css creent des utilitaires (h-control, size-control, min-w-control)
// que tailwind-merge ne connait pas : son echelle `spacing` par defaut n'accepte que `px` et les nombres. Sans
// cette declaration, un `h-12` passe par une page ne remplacerait plus le `h-control` par defaut du composant.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      spacing: ["control", "control-sm", "control-lg"],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
