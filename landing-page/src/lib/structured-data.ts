/**
 * structured-data.ts - donnees structurees Schema.org (JSON-LD), SOURCE UNIQUE de l'entite.
 *
 * But : aider Google ET les LLM (ChatGPT, Claude, Gemini, Perplexity) a comprendre que
 * « TaskForce = AI Delivery Operating System » edite par notre organisation, et a relier
 * l'entite au domaine + au fondateur. C'est le socle du Knowledge Graph et des reponses LLM.
 *
 * Emis dans <head> par BaseLayout : Organization + WebSite sur TOUTES les pages ; la home
 * ajoute SoftwareApplication (`software` prop). Valide par le Rich Results Test.
 *
 * Regle d'or : ne rien AFFIRMER de faux. Pas de note/avis fabrique (aggregateRating), pas de
 * `sameAs` vers un compte qu'on ne possede pas (un mauvais sameAs relie l'entite au mauvais
 * compte et brouille la desambiguisation - l'inverse du but recherche).
 */

const ORG_HASH = "#organization";
const SITE_HASH = "#website";
const SOFTWARE_HASH = "#software";

/**
 * Profils publics VERIFIES et POSSEDES par l'organisation TaskForce (mieux vaut aucun sameAs
 * qu'un sameAs errone qui relie l'entite au mauvais compte). Le LinkedIn du fondateur vit sous
 * `founder`, pas ici (profil d'une Person, pas de l'Organization - evite de fusionner les deux
 * entites cote Google).
 */
const ORG_SAMEAS: readonly string[] = ["https://github.com/taskforce-project"];

const FOUNDER = {
  "@type": "Person",
  name: "Pierre Michel",
  sameAs: ["https://www.linkedin.com/in/pierre-michel-work/"],
} as const;

/** Origine sans slash final, ex. « https://taskforce-project.fr ». */
type JsonLd = Record<string, unknown>;

export function organizationLd(origin: string): JsonLd {
  const org: JsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${origin}/${ORG_HASH}`,
    name: "TaskForce",
    url: `${origin}/`,
    logo: `${origin}/logo_taskforce_tp.png`,
    description:
      "TaskForce is an AI delivery operating system: describe an outcome and scoped agents plan and draft every step, while a human approves each checkpoint.",
    founder: FOUNDER,
    contactPoint: {
      "@type": "ContactPoint",
      email: "contact@taskforce-project.fr",
      contactType: "customer support",
    },
  };
  if (ORG_SAMEAS.length > 0) org.sameAs = [...ORG_SAMEAS];
  return org;
}

export function websiteLd(origin: string): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${origin}/${SITE_HASH}`,
    name: "TaskForce",
    url: `${origin}/`,
    inLanguage: "en",
    publisher: { "@id": `${origin}/${ORG_HASH}` },
  };
}

export function softwareApplicationLd(origin: string): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": `${origin}/${SOFTWARE_HASH}`,
    name: "TaskForce",
    applicationCategory: "DeveloperApplication",
    applicationSubCategory: "AI Delivery Operating System",
    operatingSystem: "Web",
    url: `${origin}/`,
    description:
      "Describe the outcome and TaskForce runs the delivery: agents plan and draft every step, a human approves each checkpoint, and the models can run on your own hardware.",
    publisher: { "@id": `${origin}/${ORG_HASH}` },
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "EUR",
      description: "Free plan, with paid tiers for teams",
      url: `${origin}/pricing`,
    },
  };
}
