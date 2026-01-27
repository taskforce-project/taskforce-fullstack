import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: 'standalone', // Pour Docker
  experimental: {
    // Optimisations pour Docker
  }
};

export default nextConfig;
