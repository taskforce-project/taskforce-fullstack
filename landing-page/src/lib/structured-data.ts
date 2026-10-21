/**
 * Données structurées Schema.org (JSON-LD), source unique de l'entité TaskForce pour Google et les assistants IA.
 * Émis par BaseLayout : Organization + WebSite partout, SoftwareApplication sur la home et la page de
 * téléchargement, BreadcrumbList hors home, FAQPage là où une FAQ est affichée (même contenu que la page).
 *
 * Règle : ne rien affirmer de faux. Pas de note ni d'avis inventés, pas de `sameAs` vers un compte qu'on ne
 * possède pas.
 */

import { LINKS, pageLabel } from "./site";

type JsonLd = Record<string, unknown>;

const ORG_HASH = "#organization";
const SITE_HASH = "#website";
const SOFTWARE_HASH = "#software";

export const PRODUCT_SUMMARY =
  "TaskForce is a free, open source desktop app for planning your work, keeping your project's memory and handing tasks to AI coding agents such as Claude Code or GitHub Copilot. It runs on your computer and works with your own AI model.";

export function organizationLd(origin: string): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${origin}/${ORG_HASH}`,
    name: "TaskForce",
    url: `${origin}/`,
    logo: `${origin}/logo_taskforce_tp.png`,
    description: PRODUCT_SUMMARY,
    founder: {
      "@type": "Person",
      name: "Pierre Michel",
      sameAs: ["https://www.linkedin.com/in/pierre-michel-work/"],
    },
    contactPoint: { "@type": "ContactPoint", email: LINKS.email, contactType: "customer support" },
    sameAs: [LINKS.githubOrg],
  };
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

export function softwareApplicationLd(origin: string, version?: string): JsonLd {
  const app: JsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": `${origin}/${SOFTWARE_HASH}`,
    name: "TaskForce",
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Windows, Linux",
    url: `${origin}/`,
    downloadUrl: `${origin}/download`,
    installUrl: LINKS.microsoftStore,
    description: PRODUCT_SUMMARY,
    license: "https://www.gnu.org/licenses/agpl-3.0.html",
    isAccessibleForFree: true,
    publisher: { "@id": `${origin}/${ORG_HASH}` },
    offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
  };
  if (version) app.softwareVersion = version;
  return app;
}

export function breadcrumbLd(origin: string, pathname: string): JsonLd | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return null;
  const items: { name: string; url: string }[] = [{ name: "Home", url: `${origin}/` }];
  let acc = "";
  for (const p of parts) {
    acc += `/${p}`;
    const name = pageLabel(acc) ?? p.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    items.push({ name, url: `${origin}${acc}` });
  }
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: it.url })),
  };
}

export function faqPageLd(items: { q: string; a: string }[]): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
}
