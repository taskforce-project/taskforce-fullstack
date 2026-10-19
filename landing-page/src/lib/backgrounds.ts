/**
 * Les fonds du site : des peintures de musées (domaine public, publiées sur Unsplash par les musées eux-mêmes), pas
 * des dégradés dessinés. Une entrée par emplacement : le héros de chaque page, la bande « tout reste sur
 * l'ordinateur » et le bandeau de fin. Chaque peinture est choisie pour son grand ciel calme, où le texte se lit.
 *
 * Les fichiers sont servis par le site (public/images/bg-<nom>-<largeur>.webp, 1280, 1920 et 2880 px) : aucune
 * requête vers un tiers à la visite. `position` garde visible ce qui compte quand l'image est rognée. Les crédits
 * sont repris dans les mentions légales.
 */

export type Background = {
  src: string;
  srcset: string;
  position: string;
  credit: { collection: string; source: string };
};

const WIDTHS = [1280, 1920, 2880] as const;

function painting(name: string, position: string, collection: string, source: string): Background {
  const file = (w: number) => `/images/bg-${name}-${w}.webp`;
  return {
    src: file(1920),
    srcset: WIDTHS.map((w) => `${file(w)} ${w}w`).join(", "),
    position,
    credit: { collection, source },
  };
}

const AIC = "Art Institute of Chicago";
const NGA = "National Gallery of Art";
const EUROPEANA = "Europeana";
const SMITHSONIAN = "Smithsonian";
const MET = "The Metropolitan Museum of Art";

export const BACKGROUNDS = {
  home: painting("home", "50% 70%", AIC, "https://unsplash.com/photos/AckZaYtIq3I"),
  features: painting("features", "50% 40%", NGA, "https://unsplash.com/photos/bcIxZ3h7lV8"),
  agents: painting("agents", "50% 50%", EUROPEANA, "https://unsplash.com/photos/5oHiGDCsNto"),
  security: painting("security", "50% 40%", AIC, "https://unsplash.com/photos/Wu3NkCmjbWU"),
  download: painting("download", "50% 50%", SMITHSONIAN, "https://unsplash.com/photos/LilfM3K2hY0"),
  migrate: painting("migrate", "50% 50%", MET, "https://unsplash.com/photos/yX_dKBgMaQg"),
  band: painting("band", "50% 35%", EUROPEANA, "https://unsplash.com/photos/KjXDnsjp3JU"),
  end: painting("end", "50% 30%", SMITHSONIAN, "https://unsplash.com/photos/k1OoIILF9yo"),
} as const;

export type BackgroundName = keyof typeof BACKGROUNDS;
