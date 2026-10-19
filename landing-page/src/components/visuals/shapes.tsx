/**
 * Tons de la palette (couleurs du portfolio et de l'app) : chaque ton donne une couleur vive, une teinte pastel, une
 * encre lisible (AA) et un lavis pour les fonds d'illustration (classes `.wash-*` de global.css).
 */
export type Tone = "blue" | "red" | "green" | "lime" | "yellow" | "pink" | "sky";

// Classes complètes (Tailwind les lit littéralement).
export const toneShape: Record<Tone, string> = {
  blue: "text-shape-blue",
  red: "text-shape-red",
  green: "text-shape-green",
  lime: "text-shape-lime",
  yellow: "text-shape-yellow",
  pink: "text-shape-pink",
  sky: "text-shape-sky",
};
export const toneFill: Record<Tone, string> = {
  blue: "bg-shape-blue",
  red: "bg-shape-red",
  green: "bg-shape-green",
  lime: "bg-shape-lime",
  yellow: "bg-shape-yellow",
  pink: "bg-shape-pink",
  sky: "bg-shape-sky",
};
export const toneTint: Record<Tone, string> = {
  blue: "bg-tint-blue",
  red: "bg-tint-red",
  green: "bg-tint-green",
  lime: "bg-tint-lime",
  yellow: "bg-tint-yellow",
  pink: "bg-tint-pink",
  sky: "bg-tint-sky",
};
export const toneInk: Record<Tone, string> = {
  blue: "text-ink-blue",
  red: "text-ink-red",
  green: "text-ink-green",
  lime: "text-ink-lime",
  yellow: "text-ink-yellow",
  pink: "text-ink-pink",
  sky: "text-ink-sky",
};
export const toneWash: Record<Tone, string> = {
  blue: "wash-blue",
  red: "wash-red",
  green: "wash-green",
  lime: "wash-lime",
  yellow: "wash-yellow",
  pink: "wash-pink",
  sky: "wash-sky",
};

/** Lime et ciel sont trop pâles sur leur teinte ou sur blanc : on prend le ton voisin plus soutenu. */
export const toneStrong = (t: Tone): Tone => (t === "lime" ? "green" : t === "sky" ? "blue" : t);
