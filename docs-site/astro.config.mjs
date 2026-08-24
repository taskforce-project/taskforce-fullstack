// @ts-check
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import starlightOpenAPI, { openAPISidebarGroups } from "starlight-openapi";

// Site de doc TaskForce : un seul endroit pour la doc PRODUIT (guides utilisateur) et la RÉFÉRENCE API
// (générée depuis la spec OpenAPI du backend). Thème « perso » via customCss (bleu #2563eb, la couleur
// de marque). Déployable en statique (Cloudflare Pages) sur docs.taskforce-project.fr — cf. README.md.
export default defineConfig({
  site: "https://docs.taskforce-project.fr",
  integrations: [
    starlight({
      title: "TaskForce Docs",
      description:
        "Documentation produit et référence API de TaskForce, l'AI Delivery OS.",
      customCss: ["./src/styles/taskforce.css"],
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/taskforce-project",
        },
      ],
      sidebar: [
        {
          label: "Découvrir",
          items: [
            { label: "Introduction", slug: "index" },
            { label: "Premiers pas", slug: "guides/premiers-pas" },
          ],
        },
        {
          label: "Guides produit",
          items: [
            { label: "Espaces & projets", slug: "guides/espaces-et-projets" },
            { label: "Inviter son équipe", slug: "guides/inviter-son-equipe" },
          ],
        },
        // Groupe(s) « Référence API » injectés par starlight-openapi depuis la spec.
        ...openAPISidebarGroups,
      ],
      plugins: [
        // La spec est un placeholder en repo ; en CI/prod on écrit le vrai openapi.json généré par le
        // backend (springdoc) avant le build. Voir README.md § « Générer la spec ».
        starlightOpenAPI([
          {
            base: "api",
            label: "Référence API",
            schema: "./public/openapi.json",
          },
        ]),
      ],
    }),
  ],
});
