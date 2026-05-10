import type { NextConfig } from "next";
import webpack from "webpack";

const nextConfig: NextConfig = {
  output: 'standalone', // Pour Docker
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
  webpack(config, { isServer }) {
    // Resolve conditions: "import" first for ESM-only packages (assistant-ui),
    // then "require" for CJS fallback (TipTap), then platform defaults.
    config.resolve.conditionNames = ["import", "require", "node", "default", "browser"]

    // Strip "node:" URI prefix so Webpack resolves built-ins normally
    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(/^node:/, (resource: { request: string }) => {
        resource.request = resource.request.replace(/^node:/, "")
      })
    )

    // isomorphic-dompurify pulls in jsdom (Node.js built-ins) — ignore them client-side
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        net: false,
        tls: false,
        fs: false,
        http: false,
        https: false,
        stream: false,
        crypto: false,
        path: false,
        os: false,
        zlib: false,
        child_process: false,
        http2: false,
        dns: false,
        buffer: false,
        util: false,
        url: false,
        assert: false,
        events: false,
        querystring: false,
        canvas: false,
      }
    }

    return config
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
