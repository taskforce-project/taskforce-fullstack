import type { NextConfig } from "next";

// CSP adaptée App Router Next.js :
// - unsafe-inline requis pour Tailwind (styles inline) et Next.js hydration
// - unsafe-eval requis en dev (hot-reload) — à retirer si nonce mis en place en production
const API_ORIGIN = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
// Origine du stockage objet (MinIO/S3) telle que le NAVIGATEUR la joint. Les pièces jointes sont
// servies par URL présignée : l'hôte fait partie de la signature, le navigateur charge donc
// directement depuis cette origine — sans elle dans img-src/connect-src, la CSP bloque la requête
// (vignette cassée, `TypeError: Failed to fetch`) alors que le backend et MinIO sont sains.
// `https:` dans img-src ne couvre pas un MinIO local en http:// → il faut l'origine explicite.
const STORAGE_ORIGIN = process.env.NEXT_PUBLIC_STORAGE_URL ?? "http://localhost:9000";

const IS_PROD = process.env.NODE_ENV === "production";

// Origine WebSocket du temps réel (STOMP/SockJS), DÉRIVÉE de l'API au lieu d'être écrite en dur.
// Auparavant la CSP listait `ws://localhost:8080 wss://localhost:8080` : en production, la
// connexion vers le vrai hôte d'API était donc bloquée par la CSP et le temps réel tombait
// silencieusement — un bug qui ne pouvait pas se voir en développement.
const WS_ORIGIN = API_ORIGIN.replace(/^http/, "ws");

// Origine unique de Cloudflare Turnstile. Le widget charge un script depuis ce domaine et rend son
// défi dans une iframe servie par le même : sans l'autoriser explicitement, la CSP le bloque et
// l'échec est TOTALEMENT SILENCIEUX côté produit — le conteneur reste vide, `window.turnstile` reste
// indéfini, aucune erreur n'apparaît dans le parcours utilisateur. Constaté le 24/07/2026.
//
// Autorisée en permanence, et non conditionnée à la présence d'une clé : la CSP est figée dans la
// configuration alors que la clé de site vient de l'API à l'exécution. Les lier ferait dépendre un
// en-tête de sécurité d'un état qu'il ne peut pas connaître. Le coût est une origine nommée, précise,
// utilisée par ce seul widget — pas un joker.
const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";

const cspHeader = [
  "default-src 'self'",
  // `unsafe-eval` n'est requis QUE par le rechargement à chaud du serveur de développement.
  // L'embarquer en production élargissait la surface XSS sans aucune contrepartie.
  `script-src 'self' 'unsafe-inline' ${TURNSTILE_ORIGIN}${IS_PROD ? "" : " 'unsafe-eval'"}`,
  // Sans `frame-src`, `default-src 'self'` s'applique aux iframes et le défi Turnstile ne s'affiche
  // pas. La directive n'existait pas : elle est ajoutée ici, restreinte à cette seule origine.
  `frame-src 'self' ${TURNSTILE_ORIGIN}`,
  // `unsafe-inline` sur les styles reste nécessaire : Tailwind et l'hydratation de Next.js
  // injectent des styles en ligne. Le lever suppose de passer aux nonces.
  "style-src 'self' 'unsafe-inline'",
  // Turnstile émet aussi des requêtes vers son origine depuis l'iframe (défi, télémétrie).
  `connect-src 'self' ${API_ORIGIN} ${STORAGE_ORIGIN} ${WS_ORIGIN} ${TURNSTILE_ORIGIN}`,
  // `https:` était un joker autorisant les images de N'IMPORTE quelle origine HTTPS. Il n'a de
  // raison d'être qu'en développement, où MinIO est en http:// ; en production les deux origines
  // utiles sont explicites.
  `img-src 'self' data: blob: ${API_ORIGIN} ${STORAGE_ORIGIN}${IS_PROD ? "" : " https:"}`,
  "font-src 'self' data:",
  "media-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "X-DNS-Prefetch-Control",      value: "on" },
  { key: "Strict-Transport-Security",   value: "max-age=31536000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options",      value: "nosniff" },
  { key: "X-Frame-Options",             value: "DENY" },
  { key: "X-XSS-Protection",            value: "0" }, // désactivé — la CSP prend le relais
  { key: "Referrer-Policy",             value: "strict-origin-when-cross-origin" },
  // Isole le contexte de navigation : une fenêtre ouverte depuis un autre site ne peut plus
  // manipuler celle-ci via `window.opener` (ZAP le signalait manquant).
  // COEP n'est délibérément PAS posé : `require-corp` bloquerait les vignettes servies par MinIO,
  // qui ne renvoie pas d'en-tête Cross-Origin-Resource-Policy.
  { key: "Cross-Origin-Opener-Policy",  value: "same-origin" },
  { key: "Permissions-Policy",          value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Content-Security-Policy",     value: cspHeader },
];

const nextConfig: NextConfig = {
  output: 'standalone', // Pour Docker
  // Supprime l'en-tête `X-Powered-By: Next.js`, qui annonce la technologie et sa présence sur
  // chaque réponse (ZAP : 5 occurrences). Aucune valeur fonctionnelle, uniquement du renseignement
  // offert à un attaquant.
  poweredByHeader: false,
  // Next 16 : Turbopack est le bundler par défaut (build + dev).
  // Config vide lève le conflit « webpack config sans turbopack config »
  turbopack: {},
  transpilePackages: [
    "@tiptap/react",
    "@tiptap/pm",
    "@tiptap/core",
    "@tiptap/starter-kit",
    "@tiptap/extension-placeholder",
    "@tiptap/extension-link",
    "@tiptap/extension-typography",
    "@tiptap/extension-task-list",
    "@tiptap/extension-task-item",
    "@assistant-ui/react",
    "@assistant-ui/core",
    "@assistant-ui/store",
    "@assistant-ui/tap",
    "assistant-stream",
    "assistant-cloud",
  ],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
  async redirects() {
    const legacyRoutes = [
      "dashboard", "inbox", "my-work", "projects", "members",
      "teams", "messages", "discussions", "analytics",
      "settings", "help", "roadmap", "cycles", "issues", "profile",
    ]
    return legacyRoutes.map((path) => ({
      source: `/${path}`,
      destination: "/",
      permanent: false,
    }))
  },
};

export default nextConfig;
