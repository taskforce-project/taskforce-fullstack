import type { NextConfig } from "next";

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
  ],
  webpack(config) {
    // Force Webpack to resolve TipTap v3 ESM packages using their CJS build
    config.resolve.conditionNames = ["require", "node", "default", "browser"]
    return config
  },
};

export default nextConfig;
