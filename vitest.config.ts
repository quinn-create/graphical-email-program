import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@mattermail/shared": resolve(__dirname, "packages/shared/src/index.ts"),
      "@mattermail/security": resolve(__dirname, "packages/security/src/index.ts"),
      "@mattermail/domain": resolve(__dirname, "packages/domain/src/index.ts"),
      "@mattermail/extraction": resolve(__dirname, "packages/extraction/src/index.ts"),
      "@mattermail/matching": resolve(__dirname, "packages/matching/src/index.ts"),
      "@mattermail/learning": resolve(__dirname, "packages/learning/src/index.ts"),
      "@mattermail/clio": resolve(__dirname, "packages/clio/src/index.ts"),
      "@mattermail/drive": resolve(__dirname, "packages/drive/src/index.ts"),
      "@mattermail/quest-email": resolve(__dirname, "packages/quest-email/src/index.ts"),
      "@mattermail/reporting": resolve(__dirname, "packages/reporting/src/index.ts"),
      "@mattermail/ai-core": resolve(__dirname, "packages/ai-core/src/index.ts"),
      "@mattermail/ai-core/mock-adapter": resolve(
        __dirname,
        "packages/ai-core/src/mock-adapter.ts",
      ),
      "@mattermail/gmail": resolve(__dirname, "packages/gmail/src/index.ts"),
      "@mattermail/database": resolve(__dirname, "packages/database/src/index.ts"),
    },
  },
  test: {
    include: ["packages/**/src/**/*.test.ts", "tests/**/*.test.ts"],
    globals: false,
  },
});