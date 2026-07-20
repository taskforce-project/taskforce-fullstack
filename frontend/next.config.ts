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
const cspHeader = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  `connect-src 'self' ${API_ORIGIN} ${STORAGE_ORIGIN} ws://localhost:8080 wss://localhost:8080`,
  `img-src 'self' data: blob: https: ${API_ORIGIN} ${STORAGE_ORIGIN}`,
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
  { key: "Permissions-Policy",          value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Content-Security-Policy",     value: cspHeader },
];

const nextConfig: NextConfig = {
  output: 'standalone', // Pour Docker
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
