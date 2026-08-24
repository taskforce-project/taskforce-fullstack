import { defineCollection } from "astro:content";
import { docsLoader } from "@astrojs/starlight/loaders";
import { docsSchema } from "@astrojs/starlight/schema";

// Astro 5 : la collection `docs` de Starlight se déclare ici (loader + schéma).
export const collections = {
  docs: defineCollection({ loader: docsLoader(), schema: docsSchema() }),
};
