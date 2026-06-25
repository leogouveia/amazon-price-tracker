import { defineConfig } from "vitest/config";
import preact from "@preact/preset-vite";

export default defineConfig({
  plugins: [preact()],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: [
            "src/**/*.test.ts",
            "src/**/*.test.tsx",
          ],
          exclude: ["src/web/**"],
          env: {
            DATABASE_PATH: ":memory:",
            SESSION_SECRET: "test-secret-key-for-vitest-do-not-use-in-prod",
            API_TOKEN: "test-api-token",
            NODE_ENV: "test",
          },
          setupFiles: ["src/__tests__/setup.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "browser",
          environment: "happy-dom",
          include: ["src/web/**/*.test.ts", "src/web/**/*.test.tsx"],
          env: {
            NODE_ENV: "test",
          },
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts", "src/**/*.tsx"],
      exclude: [
        "src/**/*.test.ts",
        "src/**/*.test.tsx",
        "src/__tests__/**",
        "src/web/**/*.tsx",
        "src/migrate-multi-user.ts",
        "src/index.ts",
      ],
    },
  },
});
