import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "happy-dom",
    setupFiles: ["./vitest.setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      exclude: [
        "node_modules/",
        ".next/",
        "out/",
        "build/",
        "coverage/",
        "**/*.d.ts",
        "**/*.config.*",
        "**/mockData/**",
        "**/types/**",
        "**/__tests__/**",
        "**/*.test.*",
        "**/*.spec.*",
        "**/constants_*.ts", // Translation files
      ],
      include: [
        "lib/**/*.{ts,tsx}",
        "components/**/*.{ts,tsx}",
        "app/**/*.{ts,tsx}",
        "hooks/**/*.{ts,tsx}",
      ],
      // Objectifs de couverture
      thresholds: {
        // Global (incluant pages/shadcn/UI non testés)
        global: {
          lines: 60,
          functions: 60,
          branches: 60,
          statements: 60,
        },
        // Services API - CRITIQUE
        'lib/api/auth-service.ts': {
          lines: 90,
          functions: 95,
          branches: 75,
          statements: 90,
        },
        'lib/api/client.ts': {
          lines: 35,
          functions: 48,
          branches: 84,
          statements: 35,
        },
        'lib/api/stripe-service.ts': {
          lines: 95,
          functions: 95,
          branches: 90,
          statements: 95,
        },
        // Composants métier auth
        'components/auth/**/*.tsx': {
          lines: 78,
          functions: 75,
          branches: 77,
          statements: 78,
        },
        // Context & State Management
        'lib/contexts/**/*.tsx': {
          lines: 90,
          functions: 90,
          branches: 85,
          statements: 90,
        },
        'lib/store/**/*.ts': {
          lines: 90,
          functions: 90,
          branches: 84,
          statements: 90,
        },
        // Utils & Validation
        'lib/utils/**/*.ts': {
          lines: 85,
          functions: 85,
          branches: 85,
          statements: 85,
        },
        'lib/auth/**/*.ts': {
          lines: 90,
          functions: 80,
          branches: 69,
          statements: 90,
        },
      },
    },
    include: ["**/*.{test,spec}.{ts,tsx}"],
    exclude: ["node_modules", ".next", "out", "build"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});
