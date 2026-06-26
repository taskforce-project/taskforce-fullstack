import type { NextConfig } from "next";
import webpack from "webpack";

// CSP adaptée App Router Next.js :
// - unsafe-inline requis pour Tailwind (styles inline) et Next.js hydration
// - unsafe-eval requis en dev (hot-reload) — à retirer si nonce mis en place en production
const API_ORIGIN = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
const cspHeader = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  `connect-src 'self' ${API_ORIGIN} ws://localhost:8080 wss://localhost:8080`,
  "img-src 'self' data: blob: https:",
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
  // Next 16 : Turbopack est le bundler par défaut (build + dev). Config vide = on lève
  // le conflit « webpack config sans turbopack config » ; le bloc webpack() ci-dessous
  // n'est lu que si l'on force `--webpack`. Turbopack gère nativement `node:` + builtins navigateur.
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
  webpack(config, { isServer, dev }) {
    config.resolve.conditionNames = ["import", "require", "node", "default", "browser"]

    // Dev sous Docker/Windows : le polling (WATCHPACK_POLLING/CHOKIDAR_USEPOLLING)
    // re-détecte les écritures que Next fait dans .next/ → boucle compile/render.
    // On ignore .next/node_modules/.git du watcher et on calme l'intervalle de poll.
    if (dev) {
      config.watchOptions = {
        ...config.watchOptions,
        poll: 1000,
        aggregateTimeout: 300,
        ignored: ["**/node_modules", "**/.next", "**/.git"],
      }
    }

    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(/^node:/, (resource: { request: string }) => {
        resource.request = resource.request.replace(/^node:/, "")
      })
    )

    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        net: false, tls: false, fs: false, http: false, https: false,
        stream: false, crypto: false, path: false, os: false, zlib: false,
        child_process: false, http2: false, dns: false, buffer: false,
        util: false, url: false, assert: false, events: false,
        querystring: false, canvas: false,
      }
    }

    return config
  },
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
