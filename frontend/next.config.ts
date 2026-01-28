import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: 'standalone', // Pour Docker
  experimental: {
    // Optimisations pour Docker
    turbo: {
      // Hot reload pour Windows + Docker avec Turbopack
      useSwcLoader: true,
    },
  },
  // Config Turbopack pour le hot reload
  turbopack: {},
};

export default nextConfig;
