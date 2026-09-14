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

import {
  PRODUCT_PLATFORM, PRODUCT_DELIVERY, LABS_LINKS, RESOURCES_LINKS, SOLUTIONS_GROUPS, FOOTER_GROUPS,
} from "@/components/site/nav";

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

/**
 * Fil d'Ariane (BreadcrumbList) derive de l'URL. Nomme chaque miette avec le libelle REEL de la
 * nav quand il existe (source unique `nav.ts`), sinon un libelle de segment connu, sinon le slug
 * embelli. Rien sur la home (pas de fil). Alimente la section "Ameliorations" de Search Console
 * et aide les LLM a situer la page dans l'arborescence.
 */
const SEGMENT_LABEL: Record<string, string> = {
  product: "Product", solutions: "Solutions", "use-cases": "Use cases", vs: "Compare",
  labs: "Labs", legal: "Legal", company: "Company", docs: "Documentation", pricing: "Pricing",
  enterprise: "Enterprise", trust: "Trust", roadmap: "Roadmap", changelog: "Changelog",
  blog: "Blog", learn: "Learn", status: "Status",
};

let HREF_LABEL: Map<string, string> | null = null;
function hrefLabels(): Map<string, string> {
  if (HREF_LABEL) return HREF_LABEL;
  const m = new Map<string, string>();
  for (const l of [...PRODUCT_PLATFORM, ...PRODUCT_DELIVERY, ...LABS_LINKS, ...RESOURCES_LINKS]) m.set(l.href, l.label);
  for (const g of SOLUTIONS_GROUPS) { for (const l of g.links) m.set(l.href, l.label); if (g.viewAll) m.set(g.viewAll.href, g.viewAll.label); }
  for (const g of FOOTER_GROUPS) for (const l of g.links) if (!m.has(l.href)) m.set(l.href, l.label);
  HREF_LABEL = m;
  return m;
}

function prettify(seg: string): string {
  return seg.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function breadcrumbLd(origin: string, pathname: string): JsonLd | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return null; // pas de fil d'Ariane sur la home
  const labels = hrefLabels();
  const items: { name: string; url: string }[] = [{ name: "Home", url: `${origin}/` }];
  let acc = "";
  for (const p of parts) {
    acc += `/${p}`;
    items.push({ name: labels.get(acc) ?? SEGMENT_LABEL[p] ?? prettify(p), url: `${origin}${acc}` });
  }
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem", position: i + 1, name: it.name, item: it.url,
    })),
  };
}

/**
 * FAQPage a partir d'items {q,a}. A n'utiliser QUE si les memes Q/R sont AFFICHEES sur la page
 * (regle Google : le balisage doit correspondre au contenu visible). Emis par `FaqSection.astro`,
 * qui rend les memes items -> correspondance garantie. Bon pour le GEO (les LLM parsent bien le FAQPage).
 */
export function faqPageLd(items: { q: string; a: string }[]): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
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
